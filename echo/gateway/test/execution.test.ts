import { describe, it, expect, vi } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEther, type Hex, type Address, decodeFunctionData } from "viem";
import { localFixture } from "../../experiments/harness.js";
import { EchoGateway, wire, pack } from "../src/client.js";
import { ExecutionStore } from "../src/store.js";
import { SignerStore } from "../src/signing.js";
import { SwapRequest } from "../src/model.js";
import { verifyFailedSpend } from "../../experiments/failed-spend.js";
import {
	accountAbi,
	routerAbi,
	entryPointAbi,
	registryAbi,
	tokenAbi,
	STUB_SIGNATURE,
	ZERO_HASH,
} from "../src/abi.js";

async function testBundler(e: Awaited<ReturnType<typeof localFixture>>) {
	const hashes = new Map<Hex, Hex>();
	let submitted = 0;
	const rpc = vi
		.spyOn(e.client, "rpc")
		.mockImplementation(async (method, params) => {
			if (method === "eth_estimateUserOperationGas")
				return {
					verificationGasLimit: "0x7a120",
					callGasLimit: "0xf4240",
					preVerificationGas: "0x186a0",
				} as never;
			if (method === "eth_sendUserOperation") {
				submitted++;
				const op = pack(params[0] as Parameters<typeof pack>[0]);
				const hash = await e.c.pc.readContract({
					address: e.ep.address,
					abi: entryPointAbi,
					functionName: "getUserOpHash",
					args: [op],
				});
				const tx = await e.c.wc.writeContract({
					address: e.ep.address,
					abi: entryPointAbi,
					functionName: "handleOps",
					args: [[op], e.c.wc.account.address],
				});
				await e.c.pc.waitForTransactionReceipt({ hash: tx });
				hashes.set(hash, tx);
				return hash as never;
			}
			if (method === "eth_getUserOperationReceipt") {
				const hash = params[0] as Hex;
				return (
					hashes.has(hash)
						? { receipt: { transactionHash: hashes.get(hash) } }
						: null
				) as never;
			}
			throw new Error("unexpected RPC method");
		});
	return { rpc, submitted: () => submitted, hashes };
}
describe("Echo v2 execution and durable evidence (official EntryPoint, test RPC harness)", () => {
	it("executes realtime swap, reconciles events and returns the same request on retry", async () => {
		const e = await localFixture();
		try {
			// Public deployment artifacts use lowercase addresses; ABI results are checksummed.
			const config = { ...e.config };
			for (const key of ["account", "implementation", "registry", "entryPoint"] as const)
				config[key] = config[key].toLowerCase() as Address;
			e.client = new EchoGateway(config, e.client.store);
			const rpc = await testBundler(e);
			const wrong = new EchoGateway({ ...config, implementation: e.router.address }, e.client.store);
			await expect(wrong.prepareSwap(e.request("wrong-implementation"))).rejects.toThrow("DELEGATION_MISMATCH");
			const r = await e.client.execute(e.request("normal"), e.realtime);
			expect(r.state).toBe("succeeded");
			expect(r.actualInput).toBe("100000");
			expect(r.actualOutput).toBe("50000000000000");
			expect(
				(await e.client.execute(e.request("normal"), e.realtime)).userOpHash,
			).toBe(r.userOpHash);
			expect(rpc.submitted()).toBe(1);
			expect(
				await e.c.pc.readContract({
					address: e.input.address,
					abi: tokenAbi,
					functionName: "allowance",
					args: [e.owner.address, e.router.address],
				}),
			).toBe(0n);
		} finally {
			e.close();
		}
	});
	it("two workers using the same request persist and submit at most one operation", async () => {
		const e = await localFixture();
		const second = new ExecutionStore(`${e.dir}/execution.sqlite`);
		try {
			const harness = await testBundler(e);
			const other = new EchoGateway(e.config, second);
			vi.spyOn(other, "rpc").mockImplementation(
				harness.rpc.getMockImplementation()!,
			);
			const results = await Promise.all([
				e.client.execute(e.request("concurrent"), e.realtime),
				other.execute(e.request("concurrent"), e.realtime),
			]);
			expect(results[0].userOpHash).toBe(results[1].userOpHash);
			expect(harness.submitted()).toBe(1);
			expect((await e.client.reconcileUserOp(results[0])).state).toBe(
				"succeeded",
			);
		} finally {
			second.close();
			e.close();
		}
	});
	it("estimates with stub and signs final frozen gas fields; changed signed fields are refused", async () => {
		const e = await localFixture();
		try {
			const rpc = await testBundler(e);
			const prepared = await e.client.prepareSwap(e.request("frozen"));
			expect(
				(rpc.rpc.mock.calls[0][1][0] as { signature: string }).signature,
			).toBe(STUB_SIGNATURE);
			const signed = await e.client.signUserOp(prepared, e.realtime);
			expect(signed.op.signature).not.toBe(STUB_SIGNATURE);
			expect(signed.op.accountGasLimits).toBe(prepared.op.accountGasLimits);
			await expect(
				e.client.submitSignedOp({
					...signed,
					op: { ...signed.op, gasFees: ZERO_HASH },
				}),
			).rejects.toThrow("SIGNED_OPERATION_CHANGED");
		} finally {
			e.close();
		}
	});
	it("uses stub for sponsorship and freezes returned paymaster gas fields after signing", async () => {
		const e = await localFixture();
		try {
			await testBundler(e);
			const prepared = await e.client.prepareSwap(e.request("sponsor"));
			const sponsor = vi.fn(async (op) => ({
				paymaster: e.owner.address,
				paymasterVerificationGasLimit: "0x186a0" as Hex,
				paymasterPostOpGasLimit: "0x186a0" as Hex,
				paymasterData: "0x1234" as Hex,
				verificationGasLimit: "0x7a120" as Hex,
			}));
			const final = await e.client.sponsorPreparedOp(prepared, sponsor);
			expect(sponsor.mock.calls[0][0].signature).toBe(STUB_SIGNATURE);
			const signed = await e.client.signUserOp(final, e.realtime);
			expect(wire(signed.op).paymasterVerificationGasLimit).toBe(
				"0x000000000000000000000000000186a0",
			);
			expect(wire(signed.op).paymasterPostOpGasLimit).toBe(
				"0x000000000000000000000000000186a0",
			);
			await expect(e.client.sponsorPreparedOp(signed, sponsor)).rejects.toThrow(
				"SPONSOR_BEFORE_SIGNING_ONLY",
			);
			const altered = pack({
				...wire(signed.op),
				paymasterPostOpGasLimit: "0x1",
			});
			await expect(
				e.client.submitSignedOp({ ...signed, op: altered }),
			).rejects.toThrow("SIGNED_OPERATION_CHANGED");
		} finally {
			e.close();
		}
	});
	it("keeps a successful UserOperation pending when available trace balances disagree", async () => {
		const e = await localFixture();
		try {
			await testBundler(e);
			const original = e.client.pc.request.bind(e.client.pc);
			vi.spyOn(e.client.pc, "request").mockImplementation(async (args) => {
				const result = await original(args);
				if ((args as { method: string }).method === "debug_traceTransaction") {
					const frame = result as any;
					function corrupt(f: any): boolean {
						if (
							f.to?.toLowerCase() === e.input.address.toLowerCase() &&
							f.input?.startsWith("0x70a08231")
						) {
							f.output = "0x" + "0".repeat(64);
							return true;
						}
						return (f.calls ?? []).some(corrupt);
					}
					corrupt(frame);
				}
				return result;
			});
			const r = await e.client.execute(
				e.request("bad-balance-proof"),
				e.realtime,
			);
			expect(r.state).toBe("pending");
			expect(r.errorCode).toBe("ASSET_BALANCE_DELTA_MISMATCH");
			expect(
				(await e.c.pc.getTransactionReceipt({ hash: r.transactionHash! }))
					.status,
			).toBe("success");
		} finally {
			e.close();
		}
	});
	it("records exactOutput actual debit instead of its maximum", async () => {
		const e = await localFixture();
		try {
			await testBundler(e);
			const request = {
				...e.request("session", e.sessionId),
				direction: "exactOutput" as const,
				outputConstraint: "25000000000000",
			};
			const r = await e.client.execute(request, e.session);
			expect(r.state).toBe("succeeded");
			expect(r.actualInput).toBe("50000");
			expect(
				(
					await e.c.pc.readContract({
						address: e.registry.address,
						abi: registryAbi,
						functionName: "getPolicy",
						args: [e.policyId],
					})
				).totalSpent,
			).toBe(50000n);
		} finally {
			e.close();
		}
	});
	it("reports failed UserOperation even when its bundle transaction succeeds", async () => {
		const e = await localFixture();
		try {
			await testBundler(e);
			const signed = await e.client.signUserOp(
				await e.client.prepareSwap(e.request("fail")),
				e.realtime,
			);
			const fault = await e.c.wc.writeContract({
				address: e.router.address,
				abi: routerAbi,
				functionName: "setFault",
				args: [true, 0, "0x"],
			});
			await e.c.pc.waitForTransactionReceipt({ hash: fault });
			const r = await e.client.submitSignedOp(signed);
			expect(r.state).toBe("failed");
			expect(
				(await e.c.pc.getTransactionReceipt({ hash: r.transactionHash! }))
					.status,
			).toBe("success");
			expect(
				(
					await e.c.pc.readContract({
						address: e.registry.address,
						abi: registryAbi,
						functionName: "getPolicy",
						args: [e.policyId],
					})
				).totalSpent,
			).toBe(0n);
		} finally {
			e.close();
		}
	});
	it("recovers the failure checkpoint after a later successful session swap without paying twice", async () => {
		const e = await localFixture();
		let reopened: ExecutionStore | undefined;
		try {
			const harness = await testBundler(e);
			const signed = await e.client.signUserOp(
				await e.client.prepareSwap(e.request("checkpoint-failure")), e.realtime,
			);
			const on = await e.c.wc.writeContract({ address: e.router.address,
				abi: routerAbi, functionName: "setFault", args: [true, 0, "0x"] });
			await e.c.pc.waitForTransactionReceipt({ hash: on });
			const failure = await e.client.submitSignedOp(signed);
			expect(failure.state).toBe("failed");
			const checkpoint = await verifyFailedSpend(e.client.pc, e.config, failure);
			expect(checkpoint.spentAtFailure).toBe("0");
			const off = await e.c.wc.writeContract({ address: e.router.address,
				abi: routerAbi, functionName: "setFault", args: [false, 0, "0x"] });
			await e.c.pc.waitForTransactionReceipt({ hash: off });
			const request = { ...e.request("checkpoint-session", e.sessionId),
				direction: "exactOutput" as const, outputConstraint: "25000000000000" };
			const session = await e.client.execute(request, e.session);
			expect(session.actualInput).toBe("50000");
			expect((await e.c.pc.readContract({ address: e.registry.address, abi: registryAbi,
				functionName: "getPolicy", args: [e.policyId] })).totalSpent).toBe(50000n);
			// The old implementation read today's 50000 here and rejected recovery.
			e.store.close();
			reopened = new ExecutionStore(`${e.dir}/execution.sqlite`);
			const restored = new EchoGateway(e.config, reopened);
			vi.spyOn(restored, "rpc").mockImplementation(harness.rpc.getMockImplementation()!);
			const oldFailure = await restored.reconcileUserOp(reopened.get(31337, e.owner.address, "checkpoint-failure")!);
			expect(await verifyFailedSpend(restored.pc, e.config, oldFailure)).toEqual(checkpoint);
			const same = await restored.execute(request, e.session);
			expect(same.userOpHash).toBe(session.userOpHash);
			expect(harness.submitted()).toBe(2);
			await expect(verifyFailedSpend(restored.pc, e.config,
				{ ...oldFailure, blockHash: ZERO_HASH })).rejects.toThrow("FAILURE_RECEIPT_UNCONFIRMED");
			await expect(verifyFailedSpend(restored.pc, e.config,
				{ ...oldFailure, userOpHash: ZERO_HASH })).rejects.toThrow("FAILED_OPERATION_EVENT_MISSING");
			await expect(verifyFailedSpend(restored.pc, e.config,
				{ ...oldFailure, chainId: 11155111 })).rejects.toThrow("FAILURE_CONTEXT_MISMATCH");
			const later = await restored.signUserOp(await restored.prepareSwap({
				...e.request("failure-with-nonzero-baseline"), inputLimit: "50000",
				outputConstraint: "25000000000000",
			}), e.realtime);
			const againOn = await e.c.wc.writeContract({ address: e.router.address,
				abi: routerAbi, functionName: "setFault", args: [true, 0, "0x"] });
			await e.c.pc.waitForTransactionReceipt({ hash: againOn });
			const laterFailure = await restored.submitSignedOp(later);
			expect(laterFailure.state).toBe("failed");
			await expect(verifyFailedSpend(restored.pc, e.config, laterFailure))
				.rejects.toThrow("FAILURE_EXPERIMENT_BASELINE_CHANGED");
		} finally {
			reopened?.close();
			e.close();
		}
	});
	it("recovers after receipt response loss and restart without a second submission", async () => {
		const e = await localFixture();
		let reopened: ExecutionStore | undefined;
		try {
			const harness = await testBundler(e);
			const impl = harness.rpc.getMockImplementation()!;
			harness.rpc.mockImplementation(async (name, args) => {
				const result = await impl(name, args);
				if (name === "eth_sendUserOperation") throw new Error("lost response");
				return result;
			});
			const r = await e.client.execute(e.request("lost"), e.realtime);
			expect(r.state).toBe("succeeded");
			e.store.close();
			reopened = new ExecutionStore(`${e.dir}/execution.sqlite`);
			const restored = new EchoGateway(e.config, reopened);
			vi.spyOn(restored, "rpc").mockResolvedValue(null);
			const retry = await restored.execute(e.request("lost"), e.realtime);
			expect(retry.state).toBe("succeeded");
			expect(retry.userOpHash).toBe(r.userOpHash);
			expect(harness.submitted()).toBe(1);
		} finally {
			reopened?.close();
			try {
				e.close();
			} catch {
				e.node.stop();
			}
		}
	});
	it("keeps the original signed operation pending after pre-broadcast timeout and rejects definite signature errors", async () => {
		const e = await localFixture();
		try {
			const harness = await testBundler(e);
			const prepared = await e.client.prepareSwap(e.request("timeout"));
			const signed = await e.client.signUserOp(prepared, e.realtime);
			harness.rpc.mockImplementation(async () => {
				throw new Error("RPC timeout");
			});
			const result = await e.client.submitSignedOp(signed);
			expect(result.state).toBe("pending");
			expect(e.store.get(31337, e.owner.address, "timeout")?.signedOp).toEqual(
				wire(signed.op),
			);
			expect(
				await e.c.pc.readContract({
					address: e.ep.address,
					abi: entryPointAbi,
					functionName: "getNonce",
					args: [e.owner.address, 0n],
				}),
			).toBe(0n);
			await testBundler(e);
			const second = await e.client.signUserOp(
				await e.client.prepareSwap(e.request("invalid")),
				e.realtime,
			);
			vi.spyOn(e.client, "rpc").mockImplementation(async () => {
				throw new (await import("../src/model.js")).EchoError("BUNDLER_-32507");
			});
			expect((await e.client.submitSignedOp(second)).state).toBe("rejected");
		} finally {
			e.close();
		}
	});
	it("recovers the same operation after reorg and inclusion in a different transaction", async () => {
		const e = await localFixture();
		let reopened: ExecutionStore | undefined;
		try {
			const harness = await testBundler(e);
			const signed = await e.client.signUserOp(
				await e.client.prepareSwap(e.request("reorg")),
				e.realtime,
			);
			const snapshot = await e.c.pc.request({
				method: "evm_snapshot" as never,
			});
			const r = await e.client.submitSignedOp(signed);
			expect(r.state).toBe("succeeded");
			const firstTransaction = r.transactionHash;
			const unavailable = vi.spyOn(e.client.pc, "getTransactionReceipt")
				.mockRejectedValueOnce(new Error("RPC timeout"));
			const unknown = await e.client.reconcileUserOp(r);
			expect(unknown.state).toBe("pending");
			expect(unknown.transactionHash).toBe(firstTransaction);
			expect(unknown.userOpHash).toBe(signed.hash);
			unavailable.mockRestore();
			await e.c.pc.request({
				method: "evm_revert" as never,
				params: [snapshot] as never,
			});
			const orphaned = await e.client.reconcileUserOp(r);
			expect(orphaned.state).toBe("pending");
			expect(e.store.get(31337, e.owner.address, "reorg")?.userOpHash).toBe(
				r.userOpHash,
			);
			// Same signed UserOperation, different bundle transaction. The bundler
			// deliberately keeps returning the obsolete transaction hash.
			const replacement = await e.c.wc.writeContract({
				address: e.ep.address, abi: entryPointAbi, functionName: "handleOps",
				args: [[signed.op], e.c.wc.account.address], gas: 3000000n,
			});
			await e.c.pc.waitForTransactionReceipt({ hash: replacement });
			expect(replacement).not.toBe(harness.hashes.get(r.userOpHash));
			e.store.close();
			reopened = new ExecutionStore(`${e.dir}/execution.sqlite`);
			const restored = new EchoGateway(e.config, reopened);
			vi.spyOn(restored, "rpc").mockImplementation(harness.rpc.getMockImplementation()!);
			const forbiddenSigner = { address: e.realtime.address,
				signTypedData: vi.fn(async () => { throw new Error("must reuse original signature"); }) };
			const recovered = await restored.execute(e.request("reorg"), forbiddenSigner);
			expect(recovered.state).toBe("succeeded");
			expect(recovered.transactionHash).toBe(replacement);
			expect(recovered.userOpHash).toBe(signed.hash);
			expect(recovered.signedOp).toEqual(wire(signed.op));
			expect(orphaned.actualInput).toBeUndefined();
			expect(orphaned.actualGasCostWei).toBeUndefined();
			expect(forbiddenSigner.signTypedData).not.toHaveBeenCalled();
			expect(harness.submitted()).toBe(1);
			expect((await restored.retryRecordedOp(recovered)).transactionHash).toBe(replacement);
			expect((await e.c.pc.readContract({ address: e.ep.address, abi: entryPointAbi,
				functionName: "getNonce", args: [e.owner.address, 0n] }))).toBe(1n);
			expect((await e.c.pc.readContract({ address: e.registry.address, abi: registryAbi,
				functionName: "getPolicy", args: [e.policyId] })).totalSpent).toBe(100000n);
		} finally {
			reopened?.close();
			e.close();
		}
	});
});
describe("Echo v2 signer and boundary schemas", () => {
	it("stores encrypted ECDSA handles and refuses legacy stores", async () => {
		const dir = `.runtime/m2/keystore-test-${Date.now()}`;
		mkdirSync(dir, { recursive: true });
		const store = new SignerStore(
			`${dir}/signers.json`,
			"test-only-passphrase",
		);
		const metadata = store.create("session");
		expect(store.signer("session").address).toBe(metadata.address);
		expect(Object.keys(store.signer("session"))).toEqual([
			"address",
			"signTypedData",
		]);
		const saved = readFileSync(`${dir}/signers.json`, "utf8");
		expect(saved).not.toContain("privateKey");
		store.close();
		writeFileSync(
			`${dir}/legacy.json`,
			JSON.stringify({ version: 1, keys: [] }),
		);
		expect(() => new SignerStore(`${dir}/legacy.json`, "test")).toThrow(
			"LEGACY_KEYSTORE_REISSUE_REQUIRED",
		);
	});
	it("rejects malformed and ambiguous atomic amounts", () => {
		for (const inputLimit of [
			"0.1",
			"01",
			"-1",
			"bad",
			(2n ** 128n).toString(),
		])
			expect(
				SwapRequest.safeParse({
					schemaVersion: 2,
					requestId: "x",
					instanceId: ZERO_HASH,
					sessionId: ZERO_HASH,
					tokenIn: "0x" + "1".repeat(40),
					tokenOut: "0x" + "2".repeat(40),
					direction: "exactInput",
					inputLimit,
					outputConstraint: "1",
					fee: 500,
				}).success,
			).toBe(false);
	});
});
