import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { parseEther, type Hex } from "viem";
import { context, createPublicRoles, write } from "./harness.js";
import { TransactionJournal } from "./journal.js";
const addresses = createPublicRoles();
const funder = privateKeyToAccount(
	JSON.parse(readFileSync(".runtime/keys/owner.json", "utf8")).privateKey,
);
const c = context(
	11155111,
	"https://ethereum-sepolia-rpc.publicnode.com",
	funder,
);
if ((await c.pc.getChainId()) !== 11155111)
	throw new Error("Wrong funding chain");
const allocations = {
	deployer: "0.014",
	owner: "0.003",
	executor: "0.0015",
	utility: "0.0005",
};
const total = Object.values(allocations).reduce(
	(sum, value) => sum + parseEther(value),
	0n,
);
if (total > parseEther("0.019")) throw new Error("Allocation cap exceeded");
const journal = new TransactionJournal(
	".runtime/m2/funding-journal.json",
	parseEther("0.02"),
);
for (const [name, amount] of Object.entries(allocations)) {
	await journal.send("fund-" + name, c, {
		to: addresses[name] as Hex,
		value: parseEther(amount),
	});
	write("artifacts/m2/funding.json", {
		chainId: 11155111,
		funder: funder.address,
		allocationWei: total.toString(),
		publicMaximumWei: parseEther("0.02").toString(),
		transactions: journal.evidence(),
	});
}
const balances = await Promise.all(
	Object.entries(addresses).map(async ([name, address]) => [
		name,
		(await c.pc.getBalance({ address: address as Hex })).toString(),
	]),
);
console.log(
	JSON.stringify({
		addresses,
		balances: Object.fromEntries(balances),
		allocationEth: "0.019",
	}),
);
