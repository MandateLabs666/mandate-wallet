import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { keccak256, parseTransaction, recoverTransactionAddress, TransactionNotFoundError, TransactionReceiptNotFoundError, type Hex, type Address, type PublicClient } from "viem";
import { hashJson, canonical } from "../../packages/core/model.js";
import { context } from "./harness.js";
import { EchoError } from "../gateway/src/model.js";
type Row = {
	id: string;
	intent: Hex;
	hash: Hex;
	raw: Hex;
	sender: Address;
	nonce: number;
	gasLimit: string;
	maxFeePerGas: string;
	value: string;
	receipt?: unknown;
	supersededBy?: string;
	neverValidIntrinsicGas?: { lowerBound: string; authorizationCount: number; checkedRpcs: number };
};
type Intent = { to?: Address; data?: Hex; value?: bigint; gas?: bigint; nonce?: number; authorizationList?: unknown[] };
function descriptor(c: ReturnType<typeof context>, intent: Intent) {
	return hashJson({ chainId: c.pc.chain!.id, sender: c.wc.account.address, to: intent.to,
		data: intent.data, value: intent.value?.toString(), gas: intent.gas?.toString(),
		authorizationList: intent.authorizationList, nonce: intent.nonce });
}
export function authorizationIntrinsicLowerBound(raw: Hex) {
	const tx = parseTransaction(raw);
	if (tx.type !== "eip7702" || !tx.authorizationList?.length) throw new EchoError("REPLACEMENT_NOT_AUTHORIZATION_TRANSACTION");
	const bytes = (tx.data ?? "0x").slice(2).match(/../g) ?? [];
	let lower = 21000n + BigInt(tx.authorizationList.length) * 25000n;
	for (const byte of bytes) lower += byte === "00" ? 4n : 16n;
	for (const item of tx.accessList ?? []) lower += 2400n + BigInt(item.storageKeys.length) * 1900n;
	return { tx, lower };
}
export class TransactionJournal {
	private rows: Row[] = [];
	constructor(
		readonly path: string,
		readonly reservationCap?: bigint,
	) {
		mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		try {
			this.rows = JSON.parse(readFileSync(path, "utf8"));
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
		}
	}
	private flush() {
		const temp = this.path + ".tmp";
		writeFileSync(temp, canonical(this.rows), { mode: 0o600 });
		renameSync(temp, this.path);
	}
	async send(
		id: string,
		c: ReturnType<typeof context>,
		intent: Intent,
		expectedStatus: "success" | "reverted" = "success",
	) {
		const expectedIntent = descriptor(c, intent);
		let row = this.rows.find((r) => r.id === id);
		if (row && row.intent !== expectedIntent)
			throw new EchoError("DEPLOYMENT_INTENT_CHANGED");
		if (row?.supersededBy) throw new EchoError("USE_INTRINSIC_GAS_REPLACEMENT");
		if (!row) {
			const request = await c.wc.prepareTransactionRequest(intent as never);
			// Reservation bounds are stored before network broadcast and include the whole signed transaction.
			const fee = request.maxFeePerGas ?? request.gasPrice;
			if (fee === undefined) throw new EchoError("FEE_MISSING");
			const maximum = request.gas! * fee + (request.value ?? 0n);
			if (
				this.reservationCap !== undefined &&
				this.rows.reduce(
					(sum, item) =>
						sum +
						BigInt(item.gasLimit) * BigInt(item.maxFeePerGas) +
						BigInt(item.value),
					maximum,
				) > this.reservationCap
			)
				throw new EchoError("JOURNAL_BUDGET_EXCEEDED");
			if (c.pc.chain!.id === 11155111 && maximum > 20_000_000_000_000_000n)
				throw new EchoError("TRANSACTION_BUDGET_EXCEEDED");
			const raw = await c.wc.account.signTransaction(request as never);
			if (request.authorizationList?.length && (request.gas! < authorizationIntrinsicLowerBound(raw).lower))
				throw new EchoError("AUTHORIZATION_INTRINSIC_GAS_UNDERESTIMATED");
			row = {
				id,
				intent: expectedIntent,
				hash: keccak256(raw),
				raw,
				sender: c.wc.account.address,
				nonce: request.nonce!,
				gasLimit: request.gas!.toString(),
				maxFeePerGas: fee.toString(),
				value: (request.value ?? 0n).toString(),
			};
			this.rows.push(row);
			this.flush();
		}
		const existing = await c.pc
			.getTransactionReceipt({ hash: row.hash })
			.catch(() => undefined);
		if (existing) {
			row.receipt = existing;
			this.flush();
			if (existing.status !== expectedStatus)
				throw new EchoError("TRANSACTION_REVERTED");
			return existing;
		}
		const usedNonce = await c.pc.getTransactionCount({ address: row.sender });
		if (usedNonce > row.nonce)
			throw new EchoError("RECOVER_ORIGINAL_TRANSACTION_FIRST");
		await c.wc
			.sendRawTransaction({ serializedTransaction: row.raw })
			.catch(async (e) => {
				const known = await c.pc
					.getTransaction({ hash: row!.hash })
					.catch(() => undefined);
				if (!known) throw e;
			});
		const receipt = await c.pc.waitForTransactionReceipt({
			hash: row.hash,
			timeout: 60000,
		});
		row.receipt = receipt;
		this.flush();
		if (receipt.status !== expectedStatus)
			throw new EchoError("TRANSACTION_REVERTED");
		return receipt;
	}
	async repairInvalidAuthorizationGas(id: string, c: ReturnType<typeof context>, originalIntent: Intent, gas: bigint, witness: PublicClient) {
		const old = this.rows.find(row => row.id === id);
		if (!old || old.intent !== descriptor(c, originalIntent) || old.hash !== keccak256(old.raw) || old.sender.toLowerCase() !== c.wc.account.address.toLowerCase())
			throw new EchoError("REPLACEMENT_ORIGINAL_CONTEXT_CHANGED");
		const { tx, lower } = authorizationIntrinsicLowerBound(old.raw);
		const authorizationHash = (entries: readonly unknown[]) => hashJson(entries.map(entry => {
			const a = entry as { address: string; chainId: number; nonce: number; yParity: number; r: Hex; s: Hex };
			return { address: a.address.toLowerCase(), chainId: String(a.chainId), nonce: String(a.nonce),
				yParity: a.yParity, r: BigInt(a.r).toString(), s: BigInt(a.s).toString() };
		}));
		if (tx.to?.toLowerCase() !== originalIntent.to?.toLowerCase() || (tx.data ?? "0x") !== (originalIntent.data ?? "0x") ||
			(tx.value ?? 0n) !== (originalIntent.value ?? 0n) || authorizationHash(tx.authorizationList) !== authorizationHash(originalIntent.authorizationList ?? []))
			throw new EchoError("REPLACEMENT_ORIGINAL_PAYLOAD_CHANGED");
		if (tx.gas === undefined || tx.gas >= lower || gas < lower || tx.nonce !== old.nonce ||
			tx.chainId !== c.pc.chain!.id || (await recoverTransactionAddress({ serializedTransaction: old.raw as `0x04${string}` })).toLowerCase() !== c.wc.account.address.toLowerCase())
			throw new EchoError("REPLACEMENT_NOT_PROVABLY_INVALID");
		const replacementId = id + ":intrinsic-gas-repair";
		if (!old.supersededBy) {
			for (const pc of [c.pc, witness]) {
				if (await pc.getChainId() !== tx.chainId) throw new EchoError("REPLACEMENT_CHAIN_MISMATCH");
				try { await pc.getTransaction({ hash: old.hash }); throw new EchoError("ORIGINAL_TRANSACTION_OBSERVED"); }
				catch (error) { if (!(error instanceof TransactionNotFoundError)) throw error; }
				try { await pc.getTransactionReceipt({ hash: old.hash }); throw new EchoError("ORIGINAL_RECEIPT_OBSERVED"); }
				catch (error) { if (!(error instanceof TransactionReceiptNotFoundError)) throw error; }
				const [latest, pending] = await Promise.all([
					pc.getTransactionCount({ address: old.sender }), pc.getTransactionCount({ address: old.sender, blockTag: "pending" }),
				]);
				if (latest !== old.nonce || pending !== old.nonce) throw new EchoError("REPLACEMENT_NONCE_CHANGED");
			}
			old.supersededBy = replacementId;
			old.neverValidIntrinsicGas = { lowerBound: lower.toString(), authorizationCount: tx.authorizationList.length, checkedRpcs: 2 };
			this.flush();
		} else if (old.supersededBy !== replacementId) throw new EchoError("REPLACEMENT_ID_CHANGED");
		return this.send(replacementId, c, { ...originalIntent, gas, nonce: old.nonce });
	}
	evidence() {
		return this.rows.map(({ raw, ...row }) => row);
	}
}
