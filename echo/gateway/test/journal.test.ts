import { it, expect, vi } from "vitest";
import { encodeDeployData, keccak256 } from "viem";
import { readFileSync, writeFileSync } from "node:fs";
import { hashJson } from "../../../packages/core/model.js";
import { localFixture, artifact } from "../../experiments/harness.js";
import { TransactionJournal } from "../../experiments/journal.js";
it("persists a signed broadcast before response loss and restores the same deployment transaction", async () => {
	const e = await localFixture();
	try {
		const a = artifact("EchoIntentDecoder");
		const intent = {
			data: encodeDeployData({ abi: a.abi, bytecode: a.bytecode.object }),
		};
		const path = e.dir + "/deployments.json";
		const journal = new TransactionJournal(path);
		const original = e.c.wc.sendRawTransaction.bind(e.c.wc);
		let broadcasts = 0;
		const lost = vi
			.spyOn(e.c.wc, "sendRawTransaction")
			.mockImplementation(async (args) => {
				broadcasts++;
				await original(args);
				throw new Error("response lost");
			});
		const first = await journal.send("decoder", e.c, intent);
		lost.mockRestore();
		const recovered = new TransactionJournal(path);
		const again = await recovered.send("decoder", e.c, intent);
		expect(again.transactionHash).toBe(first.transactionHash);
		expect(again.contractAddress).toBe(first.contractAddress);
		expect(broadcasts).toBe(1);
		expect(recovered.evidence()).toHaveLength(1);
		await expect(
			recovered.send("decoder", e.c, { data: "0x00" }),
		).rejects.toThrow("DEPLOYMENT_INTENT_CHANGED");
	} finally {
		e.close();
	}
});

async function legacyAuthorization(e: Awaited<ReturnType<typeof localFixture>>, gas: bigint) {
	const authorization = await e.c.wc.signAuthorization({ account: e.owner, contractAddress: e.module.address, executor: e.c.wc.account });
	const intent = { to: e.owner.address, authorizationList: [authorization] };
	const request = await e.c.wc.prepareTransactionRequest({ ...intent, gas });
	const raw = await e.c.wc.account.signTransaction(request as never);
	const path = e.dir + "/legacy-authorization.json";
	const row = { id: "attach", intent: hashJson({ chainId: e.c.pc.chain!.id, sender: e.c.wc.account.address,
		to: intent.to, authorizationList: intent.authorizationList }), hash: keccak256(raw), raw,
		sender: e.c.wc.account.address, nonce: request.nonce!, gasLimit: gas.toString(),
		maxFeePerGas: (request.maxFeePerGas ?? request.gasPrice)!.toString(), value: "0" };
	writeFileSync(path, JSON.stringify([row]), { mode: 0o600 });
	return { intent, path, row, journal: new TransactionJournal(path) };
}

it("repairs a provably invalid authorization gas limit at the original nonce and persists both signatures", async () => {
	const e = await localFixture();
	try {
		const legacy = await legacyAuthorization(e, 15000n);
		const unavailable = vi.spyOn(e.c.pc, "getTransaction").mockRejectedValueOnce(new Error("RPC timeout"));
		await expect(legacy.journal.repairInvalidAuthorizationGas("attach", e.c, legacy.intent, 100000n, e.client.pc)).rejects.toThrow("RPC timeout");
		unavailable.mockRestore();
		expect(legacy.journal.evidence()[0].supersededBy).toBeUndefined();
		const changed = vi.spyOn(e.client.pc, "getTransactionCount").mockResolvedValue(legacy.row.nonce + 1);
		await expect(legacy.journal.repairInvalidAuthorizationGas("attach", e.c, legacy.intent, 100000n, e.client.pc)).rejects.toThrow("REPLACEMENT_NONCE_CHANGED");
		changed.mockRestore();
		const receipt = await legacy.journal.repairInvalidAuthorizationGas("attach", e.c, legacy.intent, 100000n, e.client.pc);
		expect(receipt.status).toBe("success");
		expect(receipt.transactionHash).not.toBe(legacy.row.hash);
		const restored = new TransactionJournal(legacy.path);
		const repeated = await restored.repairInvalidAuthorizationGas("attach", e.c, legacy.intent, 100000n, e.client.pc);
		expect(repeated.transactionHash).toBe(receipt.transactionHash);
		expect(await e.c.pc.getTransactionCount({ address: e.c.wc.account.address })).toBe(legacy.row.nonce + 1);
		const saved = JSON.parse(readFileSync(legacy.path, "utf8"));
		expect(saved).toHaveLength(2);
		expect(saved[0].raw).toBe(legacy.row.raw);
		expect(saved[1].nonce).toBe(legacy.row.nonce);
		expect(saved[0].neverValidIntrinsicGas.lowerBound).toBe("46000");
	} finally { e.close(); }
});

it("refuses replacement of an unknown potentially valid transaction and rejects new intrinsic gas underestimates", async () => {
	const e = await localFixture();
	try {
		const legacy = await legacyAuthorization(e, 100000n);
		await expect(legacy.journal.repairInvalidAuthorizationGas("attach", e.c, legacy.intent, 120000n, e.client.pc)).rejects.toThrow("REPLACEMENT_NOT_PROVABLY_INVALID");
		expect(legacy.journal.evidence()).toHaveLength(1);
		const fresh = new TransactionJournal(e.dir + "/new-underestimate.json");
		const broadcast = vi.spyOn(e.c.wc, "sendRawTransaction");
		await expect(fresh.send("underestimate", e.c, { ...legacy.intent, gas: 15000n })).rejects.toThrow("AUTHORIZATION_INTRINSIC_GAS_UNDERESTIMATED");
		expect(fresh.evidence()).toHaveLength(0);
		expect(broadcast).not.toHaveBeenCalled();
	} finally { e.close(); }
});
