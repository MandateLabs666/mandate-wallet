import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
	encodeDeployData,
	createPublicClient,
	http,
	encodeFunctionData,
	parseEther,
	parseEventLogs,
	keccak256,
	type Hex,
	type Address,
} from "viem";
import { context, artifact, role, write } from "./harness.js";
import { readiness, PUBLIC_RPC, WITNESS_RPC, TRACE_RPC } from "./readiness.js";
import { TransactionJournal } from "./journal.js";
import {
	registryAbi,
	onboardingAbi,
	entryPointAbi,
	tokenAbi,
} from "../gateway/src/abi.js";
if (!(await readiness()).ready)
	throw new Error(
		"Public acceptance gate: remote RPC capability/chain anchor checks failed",
	);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
	encoding: "utf8",
}).trim();
if (
	execFileSync(
		"git",
		["status", "--porcelain", "--", "echo/contracts/src", "echo/gateway/src"],
		{ encoding: "utf8" },
	).trim()
)
	throw new Error("Commit repaired source before public deployment");
const ep = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as Address;
const c = context(11155111, PUBLIC_RPC, role("deployer")),
	oc = context(11155111, PUBLIC_RPC, role("owner"));
const code = await c.pc.getCode({ address: ep });
if (!code || code === "0x")
	throw new Error("Canonical EntryPoint code missing");
// Canonical bytecode verification is independently recorded; require its successful exact runtime check.
const check = JSON.parse(
	readFileSync("artifacts/m2/entrypoint-verification.json", "utf8"),
);
if (
	check.address.toLowerCase() !== ep.toLowerCase() ||
	check.chainId !== 11155111 ||
	!check.exactRuntimeMatch ||
	check.runtimeHash !== keccak256(code)
)
	throw new Error("Canonical EntryPoint verification missing/mismatched");
const journal = new TransactionJournal(".runtime/m2/deployment-journal.json");
const contracts: Record<
	string,
	{ address: Address; hash: Hex; block: string; runtimeHash: Hex }
> = {};
async function deploy(name: string, args: unknown[] = [], source?: string) {
	const a = source ? JSON.parse(readFileSync(source, "utf8")) : artifact(name);
	if (!source) {
		for (const [path, item] of Object.entries(a.metadata?.sources ?? {}) as [
			string,
			{ keccak256: string },
		][]) {
			if (
				path.startsWith("src/") &&
				keccak256(
					new TextEncoder().encode(
						readFileSync("echo/contracts/" + path, "utf8"),
					),
				) !== item.keccak256
			)
				throw new Error("Rebuild changed source before deployment");
		}
	}
	const receipt = await journal.send("deploy-" + name, c, {
		data: encodeDeployData({ abi: a.abi, bytecode: a.bytecode.object, args }),
	});
	if (!receipt.contractAddress) throw new Error("Deployment address missing");
	const runtime = await c.pc.getCode({ address: receipt.contractAddress });
	if (!runtime || runtime === "0x")
		throw new Error("Wait for original deployment to become readable");
	contracts[name] = {
		address: receipt.contractAddress,
		hash: receipt.transactionHash,
		block: receipt.blockNumber.toString(),
		runtimeHash: keccak256(runtime),
	};
	save();
	return receipt.contractAddress;
}
function save() {
	write("artifacts/m2/sepolia-deployment.json", {
		schemaVersion: 2,
		chainId: 11155111,
		sourceCommit,
		entryPoint: ep,
		compiler: {
			version: "0.8.26",
			evmVersion: "cancun",
			optimizerRuns: 200,
			viaIR: true,
		},
		contracts,
		transactions: journal.evidence(),
	});
}
const registry = await deploy("PolicyRegistry", [c.wc.account.address]);
const decoder = await deploy("EchoIntentDecoder");
const validator = await deploy("EchoPolicyValidator");
const implementation = await deploy("EchoDelegationModule", [
	registry,
	decoder,
	validator,
	ep,
]);
const onboarding = await deploy("EchoOnboarding", [registry]);
const input = await deploy("MockInputToken");
const output = await deploy("MockOutputToken");
const router = await deploy("MockSwapRouter", [input, output]);
for (const [name, address] of [
	["setImplementation", implementation],
	["setOnboarding", onboarding],
] as const) {
	await journal.send(name, c, {
		to: registry,
		data: encodeFunctionData({
			abi: registryAbi,
			functionName: name,
			args: [address],
		}),
	});
	save();
}
let authorization;
const saved = journal.evidence().find((r) => r.id === "attach-delegation");
if (!saved) {
	authorization = await c.wc.signAuthorization({
		account: role("owner"),
		contractAddress: implementation,
		executor: c.wc.account,
	});
	write(".runtime/m2/owner-authorization.json", authorization);
} else
	authorization = JSON.parse(
		readFileSync(".runtime/m2/owner-authorization.json", "utf8"),
	);
const attachment = {
	to: oc.wc.account.address,
	authorizationList: [authorization],
};
const attachmentRow = journal.evidence().find(row => row.id === "attach-delegation");
if (attachmentRow && (attachmentRow.supersededBy || BigInt(attachmentRow.gasLimit) < 46000n)) {
	await journal.repairInvalidAuthorizationGas("attach-delegation", c, attachment, 100000n,
		createPublicClient({ chain: c.pc.chain, transport: http(WITNESS_RPC, { timeout: 15000, retryCount: 0 }) }));
} else await journal.send("attach-delegation", c, { ...attachment, gas: 100000n });
save();
const expiryPath = ".runtime/m2/policy-expiry.json";
let expiry: number;
try {
	expiry = JSON.parse(readFileSync(expiryPath, "utf8")).expiry;
} catch {
	expiry = Number((await c.pc.getBlock()).timestamp) + 86400;
	write(expiryPath, { expiry });
}
const registration = await journal.send("register-policy", oc, {
	to: onboarding,
	data: encodeFunctionData({
		abi: onboardingAbi,
		functionName: "registerInstanceAndEip7702",
		args: [
			{
				budgetAsset: input,
				router,
				executeSigner: role("realtime").address,
				outputs: [output],
				maxPerOp: 100000n,
				maxPerDay: 150000n,
				totalBudget: 150000n,
				expiry,
			},
		],
	}),
});
save();
const policyId = parseEventLogs({
	abi: registryAbi,
	eventName: "InstanceRegistered",
	logs: registration.logs,
})[0]?.args.instanceId;
if (!policyId) throw new Error("Policy event missing");
const session = await journal.send("create-session", oc, {
	to: registry,
	data: encodeFunctionData({
		abi: registryAbi,
		functionName: "createSession",
		args: [
			policyId,
			role("session").address,
			output,
			100000n,
			150000n,
			5n,
			expiry,
		],
	}),
});
save();
const sessionId = parseEventLogs({
	abi: registryAbi,
	eventName: "SessionCreated",
	logs: session.logs,
})[0]?.args.sessionId;
if (!sessionId) throw new Error("Session event missing");
await journal.send("mint-test-input", c, {
	to: input,
	data: encodeFunctionData({
		abi: tokenAbi,
		functionName: "mint",
		args: [oc.wc.account.address, 1000000n],
	}),
});
save();
await journal.send("owner-approved-deposit", oc, {
	to: ep,
	data: encodeFunctionData({
		abi: entryPointAbi,
		functionName: "depositTo",
		args: [oc.wc.account.address],
	}),
	value: parseEther("0.002"),
});
save();
const sim07 = await deploy(
	"EntryPointSimulations07",
	[],
	".runtime/m2/alto/src/contracts/EntryPointSimulations.sol/EntryPointSimulations07.json",
);
const pimlico = await deploy(
	"PimlicoSimulations",
	[],
	".runtime/m2/alto/src/contracts/PimlicoSimulations.sol/PimlicoSimulations.json",
);
const alto = {
	entrypoints: ep,
	"rpc-url": TRACE_RPC,
	"safe-mode": true,
	"dangerous-skip-user-operation-validation": false,
	"deploy-simulations-contract": false,
	"entrypoint-simulation-contract-v7": sim07,
	"pimlico-simulation-contract": pimlico,
	"executor-private-keys": JSON.parse(
		readFileSync(".runtime/m2/keys/executor.json", "utf8"),
	).privateKey,
	"utility-private-key": JSON.parse(
		readFileSync(".runtime/m2/keys/utility.json", "utf8"),
	).privateKey,
	"refilling-wallets": false,
	"bundle-mode": "manual",
	"enable-debug-endpoints": true,
	port: 14337,
	"block-time": 12000,
	"block-polling-interval": 12000,
	"log-level": "info",
	"public-client-log-level": "error",
	"wallet-client-log-level": "error",
	"rpc-log-level": "info",
};
writeFileSync(".runtime/m2/alto-config.json", JSON.stringify(alto), {
	mode: 0o600,
});
const config = {
	chainId: 11155111,
	rpcUrl: PUBLIC_RPC,
	bundlerUrl: "http://127.0.0.1:24337",
	entryPoint: ep,
	registry,
	account: oc.wc.account.address,
	implementation,
	deploymentBlock: registration.blockNumber.toString(),
	confirmations: 2,
};
write("artifacts/m2/sepolia-config.json", {
	...config,
	policyId,
	sessionId,
	input,
	output,
	router,
	expiry,
});
write("artifacts/m2/alto-config-public.json", {
	...alto,
	"executor-private-keys": undefined,
	"utility-private-key": undefined,
	executor: role("executor").address,
	utility: role("utility").address,
	patch: "alto-v07-strict-geth.patch",
});
console.log("Sepolia Echo v2 deployment and strict Alto config complete.");
