import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createPublicClient, http } from "viem";
import { entryPointAbi, registryAbi, tokenAbi } from "../gateway/src/abi.js";
import { write } from "./harness.js";

const stage = process.argv[2];
if (!["partial", "complete", "rechecked"].includes(stage))
	throw new Error("Expected partial / complete / rechecked local recovery stage");
const m = JSON.parse(readFileSync("artifacts/m2/local-deployment.json", "utf8"));
const pc = createPublicClient({ transport: http(m.rpc) });
if ((await pc.getChainId()) !== 1337) throw new Error("Local-only recovery evidence");
const execution = JSON.parse(readFileSync("artifacts/m2/local-suite-execution.json", "utf8"));
const config = JSON.parse(readFileSync(".runtime/m2/alto-local-docker.json", "utf8"));
if (config["safe-mode"] !== true || config["dangerous-skip-user-operation-validation"] !== false)
	throw new Error("Strict local bundler required");
const [nonce, input, allowance, policy] = await Promise.all([
	pc.readContract({ address: m.ep.address, abi: entryPointAbi, functionName: "getNonce", args: [m.owner, 0n] }),
	pc.readContract({ address: m.input.address, abi: tokenAbi, functionName: "balanceOf", args: [m.owner] }),
	pc.readContract({ address: m.input.address, abi: tokenAbi, functionName: "allowance", args: [m.owner, m.router.address] }),
	pc.readContract({ address: m.registry.address, abi: registryAbi, functionName: "getPolicy", args: [m.policyId] }),
]);
const checkpoint = JSON.parse(readFileSync("artifacts/m2/local-suite-failure-checkpoint.json", "utf8"));
const record = {
	stage, recordedAt: new Date().toISOString(), chainId: 1337, safeMode: true,
	publicGatePassed: false, entryPoint: m.ep.address, policyId: m.policyId,
	entryPointNonce: nonce.toString(), inputBalance: input.toString(), allowance: allowance.toString(),
	totalSpent: policy.totalSpent.toString(), failureCheckpoint: checkpoint,
	records: execution.records.map((r: Record<string, unknown>) => ({
		requestId: r.requestId, state: r.state, userOpHash: r.userOpHash,
		transactionHash: r.transactionHash, nonce: r.nonce, actualInput: r.actualInput,
	})),
	sourceSHA256: Object.fromEntries([
		"echo/experiments/run-public.ts", "echo/experiments/failed-spend.ts",
		"echo/experiments/resume-evidence.ts", "echo/infra/local-geth.yaml",
		"echo/gateway/src/client.ts",
	].map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])),
};
write(`artifacts/m2/local-suite-resume-${stage}.json`, record);
if (stage === "rechecked") {
	const partial = JSON.parse(readFileSync("artifacts/m2/local-suite-resume-partial.json", "utf8"));
	const complete = JSON.parse(readFileSync("artifacts/m2/local-suite-resume-complete.json", "utf8"));
	if (JSON.stringify(partial.sourceSHA256) !== JSON.stringify(record.sourceSHA256) ||
		JSON.stringify(complete.sourceSHA256) !== JSON.stringify(record.sourceSHA256))
		throw new Error("Recovery stages must use the same fixed sources");
	if (partial.entryPoint !== record.entryPoint || complete.entryPoint !== record.entryPoint ||
		partial.totalSpent !== "50000" || partial.entryPointNonce !== "2" || partial.inputBalance !== "950000" ||
		complete.totalSpent !== "150000" || complete.entryPointNonce !== "3" || complete.inputBalance !== "850000" ||
		record.totalSpent !== "150000" || record.entryPointNonce !== "3" || record.inputBalance !== "850000" ||
		record.allowance !== "0" || checkpoint.spentAtFailure !== "0" ||
		partial.records.length !== 2 || complete.records.length !== 3 || record.records.length !== 3)
		throw new Error("Recovery state/nonce/asset invariant failed");
	for (const old of partial.records) {
		const resumed = record.records.find((r: { requestId: unknown }) => r.requestId === old.requestId);
		if (!resumed || resumed.userOpHash !== old.userOpHash || resumed.transactionHash !== old.transactionHash)
			throw new Error("Recovery replaced an already submitted operation");
	}
	if (JSON.stringify(complete.records) !== JSON.stringify(record.records))
		throw new Error("Completed rerun changed a payment or receipt");
	write("artifacts/m2/local-suite-resume-recovery.json", {
		passed: true, chainId: 1337, safeMode: true, publicGatePassed: false,
		entryPoint: record.entryPoint, policyId: record.policyId,
		interruptedAfterSession: true, sameOperationsAfterRestart: true,
		completedRerunDidNotConsumeNonce: true, partialNonce: "2", finalNonce: "3",
		failureSpend: checkpoint.spentAtFailure, finalSpend: record.totalSpent,
		finalInputBalance: record.inputBalance, finalAllowance: record.allowance,
		observations: ["local-suite-resume-partial.json", "local-suite-resume-complete.json", "local-suite-resume-rechecked.json"],
		sourceSHA256: record.sourceSHA256,
	});
}
console.log(JSON.stringify({ stage, nonce: record.entryPointNonce, spend: record.totalSpent,
	balance: record.inputBalance, operations: record.records.length }));
