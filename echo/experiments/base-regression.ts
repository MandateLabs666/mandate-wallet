import { readFileSync } from "node:fs";
import { clients, tokenAbi } from "../../packages/core/chain.js";
import { readTestKey } from "../../experiments/harness.js";
import { write } from "./harness.js";
const config = JSON.parse(readFileSync("artifacts/test-accounts.json", "utf8"));
const m = JSON.parse(readFileSync("artifacts/sepolia-deployment.json", "utf8"));
const good = JSON.parse(readFileSync("artifacts/sepolia-payment.json", "utf8"));
const bad = JSON.parse(
	readFileSync("artifacts/sepolia-revocation.json", "utf8"),
);
const { pc } = clients(84532, config.rpcUrl, readTestKey("operator"));
if ((await pc.getChainId()) !== 84532)
	throw new Error("Wrong Base regression chain");
const positive = await pc.getTransactionReceipt({
	hash: good.receipt.transactionHash,
});
const negative = await pc.getTransactionReceipt({
	hash: bad.negativeTransaction,
});
const goodBlock = await pc.getBlock({ blockNumber: positive.blockNumber });
const badBlock = await pc.getBlock({ blockNumber: negative.blockNumber });
const balance = async (address: `0x${string}`, blockNumber: bigint) =>
	(
		await pc.readContract({
			address: m.asset,
			abi: tokenAbi,
			functionName: "balanceOf",
			args: [address],
			blockNumber,
		})
	).toString();
const before = await balance(m.wallet, positive.blockNumber - 1n),
	after = await balance(m.wallet, positive.blockNumber);
const merchantBefore = await balance(m.policy.payTo, positive.blockNumber - 1n),
	merchantAfter = await balance(m.policy.payTo, positive.blockNumber);
const passed =
	positive.status === "success" &&
	negative.status === "reverted" &&
	goodBlock.hash === positive.blockHash &&
	badBlock.hash === negative.blockHash &&
	BigInt(before) - BigInt(after) === 100000n &&
	BigInt(merchantAfter) - BigInt(merchantBefore) === 100000n;
write("artifacts/m2/base-m1-regression.json", {
	chainId: 84532,
	readOnly: true,
	positive: positive.transactionHash,
	negative: negative.transactionHash,
	balances: { before, after, merchantBefore, merchantAfter },
	passed,
	scope:
		"M1 native USDC settlement and revoked negative receipt; no new Base payment",
});
if (!passed) throw new Error("M1 Base regression failed");
console.log("M1 Base native USDC regression passed (read only).");
