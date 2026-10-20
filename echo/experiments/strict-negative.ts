import { readFileSync } from "node:fs";
import { mnemonicToAccount } from "viem/accounts";
import { TEST_MNEMONIC } from "../../experiments/harness.js";
import { EchoGateway, signingData, wire } from "../gateway/src/client.js";
import { ExecutionStore } from "../gateway/src/store.js";
import { write } from "./harness.js";
import { EchoError } from "../gateway/src/model.js";
const m = JSON.parse(
	readFileSync("artifacts/m2/local-deployment.json", "utf8"),
);
const store = new ExecutionStore(
	`.runtime/m2/local-strict-negative-${m.ep.address}.sqlite`,
);
const client = new EchoGateway(
	{
		chainId: 1337,
		rpcUrl: m.rpc,
		bundlerUrl: process.env.M2_LOCAL_BUNDLER_URL ?? "http://127.0.0.1:24340",
		entryPoint: m.ep.address,
		registry: m.registry.address,
		account: m.owner,
		implementation: m.implementation.address,
		deploymentBlock: BigInt(m.ep.block),
		confirmations: 1,
	},
	store,
);
try {
	const r = {
		schemaVersion: 2 as const,
		requestId: "strict-session",
		instanceId: m.policyId,
		sessionId: m.sessionId,
		tokenIn: m.input.address,
		tokenOut: m.output.address,
		direction: "exactOutput" as const,
		inputLimit: "50000",
		outputConstraint: "25000000000000",
		fee: 500 as const,
	};
	const prepared = await client.prepareSwap(r);
	const session = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 3 });
	const wrong = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 2 });
	const wrongSig = await wrong.signTypedData(
		signingData(client.config, prepared.hash, prepared.auth),
	);
	const cases: unknown[] = [];
	async function refused(name: string, op: typeof prepared.op) {
		try {
			await client.rpc("eth_sendUserOperation", [wire(op), m.ep.address]);
			throw new Error("Invalid operation accepted");
		} catch (e) {
			if (!(e instanceof EchoError) || !e.code.startsWith("BUNDLER_-325"))
				throw e;
			cases.push({ name, code: e.code, detail: e.detail });
		}
	}
	await refused("wrong session signer", {
		...prepared.op,
		signature: ("0x02" + wrongSig.slice(2)) as `0x${string}`,
	});
	const signed = await client.signUserOp(prepared, session);
	await refused("changed gas field invalidates signature", {
		...signed.op,
		preVerificationGas: signed.op.preVerificationGas + 1n,
	});
	const result = await client.submitSignedOp(signed);
	for (let i = 0; i < 30 && result.state === "pending"; i++) {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		Object.assign(result, await client.reconcileUserOp(result));
	}
	if (result.state !== "succeeded")
		throw new Error("Valid session failed after negative controls");
	write("artifacts/m2/local-strict-negative.json", {
		safeMode: true,
		patch: "alto-v07-strict-geth.patch",
		cases,
		evidence: client.exportEvidence(),
	});
	console.log(
		JSON.stringify({
			rejected: cases.length,
			session: result.state,
			actualInput: result.actualInput,
		}),
	);
} finally {
	store.close();
}
