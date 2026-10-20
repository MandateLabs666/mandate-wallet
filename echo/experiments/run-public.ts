import { readFileSync, existsSync } from "node:fs";
import { mnemonicToAccount } from "viem/accounts";
import { TEST_MNEMONIC } from "../../experiments/harness.js";
import { encodeFunctionData, parseEventLogs, type Hex } from "viem";
import {
	EchoGateway,
	wire,
	pack,
	type GatewayConfig,
} from "../gateway/src/client.js";
import { ExecutionStore } from "../gateway/src/store.js";
import {
	EchoError,
	type PreparedSwap,
	type ExecutionRecord,
} from "../gateway/src/model.js";
import {
	registryAbi,
	routerAbi,
	tokenAbi,
	entryPointAbi,
	ZERO_HASH,
} from "../gateway/src/abi.js";
import { context, role, write, artifact } from "./harness.js";
import { TransactionJournal } from "./journal.js";
import { readiness, PUBLIC_RPC } from "./readiness.js";
import { verifyFailedSpend } from "./failed-spend.js";
const local = process.argv.includes("--local");
const interruptAfterSession = process.argv.includes("--interrupt-after-session");
if (interruptAfterSession && !local)
	throw new Error("Interruption injection is local-only");
if (!local && !(await readiness()).ready)
	throw new Error("Public node gate not satisfied");
const source = JSON.parse(
	readFileSync(
		local
			? "artifacts/m2/local-deployment.json"
			: "artifacts/m2/sepolia-config.json",
		"utf8",
	),
);
const m = local
	? {
			chainId: 1337,
			rpcUrl: source.rpc,
			bundlerUrl: "http://127.0.0.1:24340",
			entryPoint: source.ep.address,
			registry: source.registry.address,
			account: source.owner,
			implementation: source.implementation.address,
			deploymentBlock: source.ep.block,
			confirmations: 1,
			policyId: source.policyId,
			sessionId: source.sessionId,
			input: source.input.address,
			output: source.output.address,
			router: source.router.address,
			expiry: 0,
		}
	: source;
const config = {
	...m,
	deploymentBlock: BigInt(m.deploymentBlock),
} as GatewayConfig;
const output = (path: string) =>
	local
		? path
				.replace("artifacts/m2/sepolia-", "artifacts/m2/local-suite-")
				.replace(".runtime/m2/", ".runtime/m2/local-suite/")
		: path;
const signingRole = (name: "deployer" | "owner" | "realtime" | "session") =>
	local
		? mnemonicToAccount(TEST_MNEMONIC, {
				addressIndex: { deployer: 0, owner: 1, realtime: 2, session: 3 }[name],
			})
		: role(name);
const store = new ExecutionStore(
	output(".runtime/m2/sepolia-execution.sqlite"),
);
const client = new EchoGateway(config, store);
const c = context(config.chainId, config.rpcUrl, signingRole("deployer")),
	oc = context(config.chainId, config.rpcUrl, signingRole("owner"));
const journal = new TransactionJournal(
	output(".runtime/m2/experiment-journal.json"),
);
const request = (requestId: string, sessionId: Hex = ZERO_HASH) => ({
	schemaVersion: 2 as const,
	requestId,
	instanceId: m.policyId,
	sessionId,
	tokenIn: m.input,
	tokenOut: m.output,
	direction: "exactInput" as const,
	inputLimit: "100000",
	outputConstraint: "50000000000000",
	fee: 500 as const,
});
function save() {
	write(output("artifacts/m2/sepolia-execution.json"), {
		...client.exportEvidence(),
		experimentTransactions: journal.evidence(),
	});
}
function prepared(path: string): PreparedSwap | undefined {
	if (!existsSync(path)) return;
	const p = JSON.parse(readFileSync(path, "utf8"));
	return {
		...p,
		auth: {
			...p.auth,
			policyVersion: BigInt(p.auth.policyVersion),
			authorityEpoch: BigInt(p.auth.authorityEpoch),
			nonce: BigInt(p.auth.nonce),
		},
		op: pack(p.op),
	};
}
function preserve(path: string, p: PreparedSwap) {
	write(path, { ...p, op: wire(p.op) });
}
async function wait(r: ExecutionRecord) {
	for (let i = 0; i < 30 && r.state === "pending"; i++) {
		await new Promise((resolve) => setTimeout(resolve, 2000));
		r = await client.reconcileUserOp(r);
		save();
	}
	return r;
}
async function balance() {
	return (
		await c.pc.readContract({
			address: m.input,
			abi: tokenAbi,
			functionName: "balanceOf",
			args: [m.account],
		})
	).toString();
}
if (local)
	m.expiry = (
		await c.pc.readContract({
			address: m.registry,
			abi: registryAbi,
			functionName: "getPolicy",
			args: [m.policyId],
		})
	).expiry;
try {
	const completePath = output("artifacts/m2/sepolia-acceptance.json");
	if (existsSync(completePath)) {
		const prior = JSON.parse(readFileSync(completePath, "utf8"));
		if (prior.entryPoint !== m.entryPoint || prior.chainId !== config.chainId)
			throw new Error("Completed experiment belongs to another deployment");
		const results = [];
		for (const record of store.all())
			results.push(await client.reconcileUserOp(record));
		const session = results.find(
				(r) => r.requestId === "m2-session-exact-output",
			),
			realtime = results.find((r) => r.requestId === "m2-realtime-exact-input"),
			failure = results.find((r) => r.requestId === "m2-router-failure");
		if (
			session?.state !== "succeeded" ||
			realtime?.state !== "succeeded" ||
			failure?.state !== "failed"
		)
			throw new Error("Previously completed receipts require reconciliation");
		const failureCheckpoint = await verifyFailedSpend(client.pc, config, failure);
		write(output("artifacts/m2/sepolia-failure-checkpoint.json"), failureCheckpoint);
		write(completePath, {
			...prior,
			session,
			realtime,
			failure,
			failureCheckpoint,
			recheckedAt: new Date().toISOString(),
		});
		save();
		console.log(
			"Completed experiment reverified; no new transaction submitted.",
		);
	} else {
		await client.rpc("debug_bundler_setBundlingMode", ["manual"]);
		// A real strict admission before an owner revocation, followed by a fresh strict rejection
		// and a deliberately broadcast negative handleOps transaction on the public chain.
		if (!existsSync(output("artifacts/m2/sepolia-revocation.json"))) {
			const probeFile = output(".runtime/m2/public-revoke-prepared.json");
			let p = prepared(probeFile);
			if (!p) {
				const created = await journal.send("create-revocation-session", oc, {
					to: m.registry,
					data: encodeFunctionData({
						abi: registryAbi,
						functionName: "createSession",
						args: [
							m.policyId,
							signingRole("session").address,
							m.output,
							100000n,
							150000n,
							5n,
							m.expiry,
						],
					}),
				});
				save();
				const sid = parseEventLogs({
					abi: registryAbi,
					eventName: "SessionCreated",
					logs: created.logs,
				})[0]!.args.sessionId;
				p = await client.signUserOp(
					await client.prepareSwap(request("m2-revoke-probe", sid)),
					signingRole("session"),
				);
				preserve(probeFile, p);
			}
			const preFile = output("artifacts/m2/sepolia-revoke-prevalidation.json");
			if (!existsSync(preFile)) {
				const before = {
					balance: await balance(),
					nonce: (
						await c.pc.readContract({
							address: m.entryPoint,
							abi: entryPointAbi,
							functionName: "getNonce",
							args: [m.account, 0n],
						})
					).toString(),
				};
				const accepted = await client.rpc<Hex>("eth_sendUserOperation", [
					wire(p.op),
					m.entryPoint,
				]);
				if (accepted !== p.hash) throw new Error("Prevalidation hash mismatch");
				write(preFile, {
					safeMode: true,
					bundleMode: "manual",
					accepted,
					userOperation: wire(p.op),
					before,
				});
			}
			await journal.send("revoke-probe-session", oc, {
				to: m.registry,
				data: encodeFunctionData({
					abi: registryAbi,
					functionName: "revokeSession",
					args: [p.auth.sessionId],
				}),
			});
			save();
			await client.rpc("debug_bundler_clearState", []);
			let postRejected = false,
				rejection: unknown;
			try {
				await client.rpc("eth_sendUserOperation", [wire(p.op), m.entryPoint]);
			} catch (e) {
				if (e instanceof EchoError && e.code.startsWith("BUNDLER_-325")) {
					postRejected = true;
					rejection = { code: e.code, detail: e.detail };
				} else throw e;
			}
			if (!postRejected) throw new Error("Revoked signature was admitted");
			await client
				.rpc("debug_bundler_sendBundleNow", [])
				.catch(() => undefined);
			const negative = await journal.send(
				"revoked-handleOps-negative",
				c,
				{
					to: m.entryPoint,
					data: encodeFunctionData({
						abi: entryPointAbi,
						functionName: "handleOps",
						args: [[p.op], c.wc.account.address],
					}),
					gas: 1500000n,
				},
				"reverted",
			);
			save();
			const pre = JSON.parse(readFileSync(preFile, "utf8"));
			const after = {
				balance: await balance(),
				nonce: (
					await c.pc.readContract({
						address: m.entryPoint,
						abi: entryPointAbi,
						functionName: "getNonce",
						args: [m.account, 0n],
					})
				).toString(),
			};
			if (
				pre.before.balance !== after.balance ||
				pre.before.nonce !== after.nonce
			)
				throw new Error("Revoked operation changed principal/nonce");
			write(output("artifacts/m2/sepolia-revocation.json"), {
				safeMode: true,
				prevalidation: pre.accepted,
				rejection,
				negativeReceipt: negative,
				after,
				balanceUnchanged: true,
				entryPointNonceUnchanged: true,
			});
			// Remove only this isolated project's refused test operation, then run the normal auto bundler.
			await client.rpc("debug_bundler_clearState", []);
		}
		await client.rpc("debug_bundler_setBundlingMode", ["auto"]);
		let failure = store.get(config.chainId, m.account, "m2-router-failure");
		if (!failure) {
			const path = output(".runtime/m2/public-failure-prepared.json");
			let signed = prepared(path);
			if (!signed) {
				signed = await client.signUserOp(
					await client.prepareSwap(request("m2-router-failure")),
					signingRole("realtime"),
				);
				preserve(path, signed);
			}
			await journal.send("router-fail-on", c, {
				to: m.router,
				data: encodeFunctionData({
					abi: routerAbi,
					functionName: "setFault",
					args: [true, 0, "0x"],
				}),
			});
			save();
			failure = await client.submitSignedOp(signed);
		}
		if (failure.state === "pending" && !failure.submitted)
			failure = await client.retryRecordedOp(failure);
		failure = await wait(failure);
		if (failure.state !== "failed")
			throw new Error(
				"Keep router fault enabled until failed operation is reconciled",
			);
		const failureCheckpoint = await verifyFailedSpend(client.pc, config, failure);
		write(output("artifacts/m2/sepolia-failure-checkpoint.json"), failureCheckpoint);
		const spentAfterFailure = BigInt(failureCheckpoint.spentAtFailure);
		await journal.send("router-fail-off", c, {
			to: m.router,
			data: encodeFunctionData({
				abi: routerAbi,
				functionName: "setFault",
				args: [false, 0, "0x"],
			}),
		});
		save();
		// Upper 0.10, actual 0.05 first, then 0.10 exactInput: total 0.15.
		const session = await wait(
			await client.execute(
				{
					...request("m2-session-exact-output", m.sessionId),
					direction: "exactOutput",
					outputConstraint: "25000000000000",
				},
				signingRole("session"),
			),
		);
		if (session.state !== "succeeded" || session.actualInput !== "50000")
			throw new Error("Session actual debit not confirmed");
		save();
		if (interruptAfterSession)
			throw new EchoError("LOCAL_EXPERIMENT_INTERRUPT_AFTER_SESSION");
		const realtime = await wait(
			await client.execute(
				request("m2-realtime-exact-input"),
				signingRole("realtime"),
			),
		);
		if (realtime.state !== "succeeded" || realtime.actualInput !== "100000")
			throw new Error("Realtime not confirmed");
		save();
		const finalPolicy = await c.pc.readContract({
			address: m.registry,
			abi: registryAbi,
			functionName: "getPolicy",
			args: [m.policyId],
		});
		const allowance = await c.pc.readContract({
			address: m.input,
			abi: tokenAbi,
			functionName: "allowance",
			args: [m.account, m.router],
		});
		if (
			finalPolicy.totalSpent !== 150000n ||
			allowance !== 0n ||
			(await balance()) !== "850000"
		)
			throw new Error("Final public asset ledger mismatch");
		write(output("artifacts/m2/sepolia-acceptance.json"), {
			chainId: config.chainId,
			safeMode: true,
			bundleMode: "auto (after isolated manual revocation probe)",
			entryPoint: m.entryPoint,
			publicGatePassed: !local,
			environment: local ? "LOCAL_GETH_DEV" : "ETHEREUM_SEPOLIA",
			session,
			realtime,
			failure,
			spentAfterFailure: spentAfterFailure.toString(),
			failureCheckpoint,
			finalPolicy,
			allowance: allowance.toString(),
			finalInputBalance: await balance(),
			limits: {
				publicEthAllocation: "0.019",
				publicEthMaximum: "0.02",
				depositMaximum: local ? "1.0 local fixture" : "0.002",
			},
			controlledFixture: true,
		});
		console.log(
			local
				? "Local Geth strict Echo v2 acceptance passed; public gate remains separate."
				: "Ethereum Sepolia strict Echo v2 acceptance passed.",
		);
	}
} finally {
	save();
	store.close();
}
