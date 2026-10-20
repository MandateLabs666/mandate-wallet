import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { mnemonicToAccount } from "viem/accounts";
import {
	parseEther,
	parseEventLogs,
	type Hex,
	createPublicClient,
	http,
} from "viem";
import { TEST_MNEMONIC } from "../../experiments/harness.js";
import { context, deploy, grant, write } from "./harness.js";
import {
	registryAbi,
	onboardingAbi,
	tokenAbi,
	entryPointAbi,
} from "../gateway/src/abi.js";
const rpc = "http://127.0.0.1:28546";
const accounts = Array.from({ length: 6 }, (_, addressIndex) =>
	mnemonicToAccount(TEST_MNEMONIC, { addressIndex }),
);
const c = context(1337, rpc, accounts[0]);
const unlocked = (await c.pc.request({
	method: "eth_accounts",
} as never)) as Hex[];
for (const account of accounts) {
	if (
		(await c.pc.getBalance({ address: account.address })) < parseEther("10")
	) {
		const hash = (await c.pc.request({
			method: "eth_sendTransaction",
			params: [
				{ from: unlocked[0], to: account.address, value: "0x8ac7230489e80000" },
			],
		} as never)) as Hex;
		await c.pc.waitForTransactionReceipt({ hash });
	}
}
const ep = await deploy(c, "EntryPoint");
const registry = await deploy(c, "PolicyRegistry", [accounts[0].address]);
const decoder = await deploy(c, "EchoIntentDecoder");
const validator = await deploy(c, "EchoPolicyValidator");
const implementation = await deploy(c, "EchoDelegationModule", [
	registry.address,
	decoder.address,
	validator.address,
	ep.address,
]);
const onboarding = await deploy(c, "EchoOnboarding", [registry.address]);
const input = await deploy(c, "MockInputToken");
const output = await deploy(c, "MockOutputToken");
const router = await deploy(c, "MockSwapRouter", [
	input.address,
	output.address,
]);
for (const [functionName, address] of [
	["setImplementation", implementation.address],
	["setOnboarding", onboarding.address],
] as const) {
	const hash = await c.wc.writeContract({
		address: registry.address,
		abi: registryAbi,
		functionName,
		args: [address],
	});
	await c.pc.waitForTransactionReceipt({ hash });
}
const owner = accounts[1];
const oc = context(1337, rpc, owner);
const authorization = await c.wc.signAuthorization({
	account: owner,
	contractAddress: implementation.address,
	executor: accounts[0],
});
const attach = await c.wc.sendTransaction({
	to: owner.address,
	authorizationList: [authorization],
});
await c.pc.waitForTransactionReceipt({ hash: attach });
const p = await grant(
	oc,
	owner.address,
	onboarding.address,
	input.address,
	output.address,
	router.address,
	accounts[2].address,
	accounts[3].address,
);
const session = await oc.wc.writeContract({
	address: registry.address,
	abi: registryAbi,
	functionName: "createSession",
	args: [
		p.id,
		accounts[3].address,
		output.address,
		100000n,
		150000n,
		5n,
		p.expiry,
	],
});
const sr = await oc.pc.waitForTransactionReceipt({ hash: session });
const sessionId = parseEventLogs({
	abi: registryAbi,
	eventName: "SessionCreated",
	logs: sr.logs,
})[0]!.args.sessionId;
for (const [address, abi, functionName, args, value] of [
	[input.address, tokenAbi, "mint", [owner.address, 1000000n], 0n],
	[ep.address, entryPointAbi, "depositTo", [owner.address], parseEther("1")],
] as const) {
	const hash = await c.wc.writeContract({
		address,
		abi,
		functionName,
		args,
		value,
	} as never);
	await c.pc.waitForTransactionReceipt({ hash });
}
const sims: Record<string, Hex> = {};
for (const [name, source] of [
	["EntryPointSimulations07", "EntryPointSimulations"],
	["PimlicoSimulations", "PimlicoSimulations"],
]) {
	const a = JSON.parse(
		readFileSync(
			`.runtime/m2/alto/src/contracts/${source}.sol/${name}.json`,
			"utf8",
		),
	);
	const hash = await c.wc.deployContract({
		abi: a.abi,
		bytecode: a.bytecode.object,
	});
	const r = await c.pc.waitForTransactionReceipt({ hash });
	sims[name] = r.contractAddress!;
}
const config = {
	entrypoints: ep.address,
	"rpc-url": rpc,
	"safe-mode": true,
	"dangerous-skip-user-operation-validation": false,
	"deploy-simulations-contract": false,
	"entrypoint-simulation-contract-v7": sims.EntryPointSimulations07,
	"pimlico-simulation-contract": sims.PimlicoSimulations,
	"executor-private-keys": accounts[4].getHdKey().privateKey
		? "0x" + Buffer.from(accounts[4].getHdKey().privateKey!).toString("hex")
		: "",
	"refilling-wallets": false,
	"enable-debug-endpoints": true,
	port: 24338,
	"log-level": "debug",
	"block-time": 1000,
};
mkdirSync(".runtime/m2", { recursive: true });
writeFileSync(".runtime/m2/alto-local.json", JSON.stringify(config), {
	mode: 0o600,
});
writeFileSync(
	".runtime/m2/alto-local-docker.json",
	JSON.stringify({
		...config,
		"rpc-url": "http://geth:8545",
		port: 14337,
		"log-level": "info",
		"public-client-log-level": "error",
		"wallet-client-log-level": "error",
	}),
	{ mode: 0o600 },
);
writeFileSync(
	".runtime/m2/local-infra.env",
	`M2_UID=${process.getuid!()}\nM2_GID=${process.getgid!()}\n`,
);
write("artifacts/m2/local-deployment.json", {
	chainId: 1337,
	rpc,
	ep,
	registry,
	decoder,
	validator,
	implementation,
	onboarding,
	input,
	output,
	router,
	policyId: p.id,
	sessionId,
	owner: owner.address,
	roles: accounts.map((a) => a.address),
	simulations: sims,
});
console.log("Local Geth deployment and strict Alto configuration prepared.");
