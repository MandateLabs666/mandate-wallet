import { readFileSync } from "node:fs";
import { keccak256, encodeDeployData, createPublicClient, http, TransactionNotFoundError, TransactionReceiptNotFoundError, type Hex, type Address } from "viem";
import { context, role, artifact, write } from "./harness.js";
import { PUBLIC_RPC, WITNESS_RPC, readiness } from "./readiness.js";
import { verifyFailedSpend } from "./failed-spend.js";
import { canonical } from "../../packages/core/model.js";
const deployment = JSON.parse(
	readFileSync("artifacts/m2/sepolia-deployment.json", "utf8"),
);
const config = JSON.parse(
	readFileSync("artifacts/m2/sepolia-config.json", "utf8"),
);
const funding = JSON.parse(readFileSync("artifacts/m2/funding.json", "utf8"));
const experiment = JSON.parse(
	readFileSync("artifacts/m2/sepolia-execution.json", "utf8"),
);
const c = context(11155111, PUBLIC_RPC, role("deployer"));
const witness = createPublicClient({ chain: c.pc.chain, transport: http(WITNESS_RPC, { timeout: 15000, retryCount: 1 }) });
if (await witness.getChainId() !== 11155111) throw new Error("Witness RPC chain mismatch");
if (!(await readiness()).ready)
	throw new Error("Evidence node gate not satisfied");
const acceptance = JSON.parse(readFileSync("artifacts/m2/sepolia-acceptance.json", "utf8"));
const failureCheckpoint = await verifyFailedSpend(c.pc,
	{ ...config, deploymentBlock: BigInt(config.deploymentBlock) }, acceptance.failure);
if (canonical(failureCheckpoint) !== canonical(acceptance.failureCheckpoint))
	throw new Error("Failure checkpoint differs from fresh canonical evidence");
const args: Record<string, unknown[]> = {
	PolicyRegistry: [role("deployer").address],
	EchoDelegationModule: [
		config.registry,
		deployment.contracts.EchoIntentDecoder.address,
		deployment.contracts.EchoPolicyValidator.address,
		config.entryPoint,
	],
	EchoOnboarding: [config.registry],
	MockSwapRouter: [config.input, config.output],
};
const checks = [];
for (const [name, contract] of Object.entries(deployment.contracts) as [
	string,
	{ address: Address; hash: Hex; runtimeHash: Hex },
][]) {
	const code = await c.pc.getCode({ address: contract.address });
	const tx = await c.pc.getTransaction({ hash: contract.hash });
	const [witnessCode, witnessTx] = await Promise.all([
		witness.getCode({ address: contract.address }), witness.getTransaction({ hash: contract.hash }),
	]);
	const a =
		name === "EntryPointSimulations07" || name === "PimlicoSimulations"
			? JSON.parse(
					readFileSync(
						`.runtime/m2/alto/src/contracts/${name === "EntryPointSimulations07" ? "EntryPointSimulations" : "PimlicoSimulations"}.sol/${name}.json`,
						"utf8",
					),
				)
			: artifact(name);
	const expected = encodeDeployData({
		abi: a.abi,
		bytecode: a.bytecode.object,
		args: args[name] ?? [],
	});
	const checked = {
		name,
		address: contract.address,
		runtimeHash: keccak256(code!),
		runtimeMatch: keccak256(code!) === contract.runtimeHash,
		creationMatch: tx.input === expected,
		witnessRuntimeMatch: !!witnessCode && keccak256(witnessCode) === contract.runtimeHash,
		witnessCreationMatch: witnessTx.input === expected,
	};
	if (!checked.runtimeMatch || !checked.creationMatch || !checked.witnessRuntimeMatch || !checked.witnessCreationMatch)
		throw new Error("Deployed code differs from fixed artifact");
	checks.push(checked);
}
const purposes = new Map<Hex, string>();
const invalidNativeTransactions = [];
for (const row of deployment.transactions.filter((r: { supersededBy?: string }) => r.supersededBy)) {
	const replacement = deployment.transactions.find((r: { id: string }) => r.id === row.supersededBy);
	const proof = row.neverValidIntrinsicGas;
	if (!replacement || !proof || proof.checkedRpcs !== 2 || BigInt(row.gasLimit) >= BigInt(proof.lowerBound) ||
		replacement.nonce !== row.nonce || replacement.sender.toLowerCase() !== row.sender.toLowerCase())
		throw new Error("Invalid native transaction replacement lacks intrinsic/nonce proof");
	for (const pc of [c.pc, witness]) {
		try { await pc.getTransaction({ hash: row.hash }); throw new Error("Invalid original transaction observed"); }
		catch (error) { if (!(error instanceof TransactionNotFoundError)) throw error; }
		try { await pc.getTransactionReceipt({ hash: row.hash }); throw new Error("Invalid original receipt observed"); }
		catch (error) { if (!(error instanceof TransactionReceiptNotFoundError)) throw error; }
	}
	invalidNativeTransactions.push({ id: row.id, originalHash: row.hash, replacementHash: replacement.hash,
		nonce: row.nonce, originalGas: row.gasLimit, intrinsicLowerBound: proof.lowerBound,
		originalAbsentAtBothRpcs: true, sameNonce: true, reason: "provably invalid intrinsic gas" });
}
for (const row of funding.transactions)
	purposes.set(row.hash, "funding/" + row.id);
for (const row of deployment.transactions)
	if (!row.supersededBy) purposes.set(row.hash, "deployment/" + row.id);
for (const row of experiment.experimentTransactions)
	purposes.set(row.hash, "experiment/" + row.id);
for (const row of experiment.records)
	if (row.transactionHash)
		purposes.set(row.transactionHash, "userOperation/" + row.requestId);
const transactions = [];
let totalFees = 0n,
	fundingFees = 0n;
for (const [hash, purpose] of purposes) {
	const receipt = await c.pc.getTransactionReceipt({ hash });
	const block = await c.pc.getBlock({ blockNumber: receipt.blockNumber });
	const otherReceipt = await witness.getTransactionReceipt({ hash });
	const otherBlock = await witness.getBlock({ blockNumber: receipt.blockNumber });
	const witnessMatches = otherReceipt.blockHash === receipt.blockHash && otherBlock.hash === block.hash &&
		otherReceipt.status === receipt.status && otherReceipt.gasUsed === receipt.gasUsed &&
		otherReceipt.effectiveGasPrice === receipt.effectiveGasPrice && otherReceipt.from.toLowerCase() === receipt.from.toLowerCase();
	if (!witnessMatches) throw new Error("Independent RPC receipt/header mismatch");
	if (block.hash !== receipt.blockHash || /^0x0+$/.test(block.hash!))
		throw new Error("Receipt canonical block mismatch");
	const fee = receipt.gasUsed * receipt.effectiveGasPrice;
	totalFees += fee;
	if (purpose.startsWith("funding/")) fundingFees += fee;
	transactions.push({
		purpose,
		hash,
		payer: receipt.from,
		status: receipt.status,
		blockNumber: receipt.blockNumber.toString(),
		blockHash: receipt.blockHash,
		feeWei: fee.toString(),
		gasUsed: receipt.gasUsed.toString(),
		effectiveGasPrice: receipt.effectiveGasPrice.toString(),
		witnessMatches,
	});
}
if (BigInt(funding.allocationWei) + fundingFees > 20_000_000_000_000_000n)
	throw new Error("Public resource cap exceeded");
write("artifacts/m2/sepolia-evidence.json", {
	chainId: 11155111,
	sourceCommit: deployment.sourceCommit,
	invalidNativeTransactions,
	rpcRoute: "third-party-rpc", primaryRpc: PUBLIC_RPC, witnessRpc: WITNESS_RPC,
	codeChecks: checks,
	transactions,
	resourceAllocationWei: funding.allocationWei,
	fundingFeesWei: fundingFees.toString(),
	totalTransactionFeesWei: totalFees.toString(),
	resourceCapWei: "20000000000000000",
	depositCapWei: "2000000000000000",
	procurementLedgerAsset: config.input,
	procurementSpentAtomic: "150000",
	failureCheckpoint,
	gasSeparateFromProcurement: true,
	fixtures:
		"mock six-decimal input, eighteen-decimal output and controlled router; not native USDC/real DEX",
});
console.log("Public code, receipt and separate gas ledgers verified.");
