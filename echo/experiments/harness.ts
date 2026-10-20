import {
	readFileSync,
	mkdirSync,
	writeFileSync,
	existsSync,
	chmodSync,
} from "node:fs";
import {
	createPublicClient,
	createWalletClient,
	http,
	parseEther,
	parseEventLogs,
	getAddress,
	type Abi,
	type Hex,
	type LocalAccount,
	type Chain,
} from "viem";
import { sepolia } from "viem/chains";
import {
	mnemonicToAccount,
	generatePrivateKey,
	privateKeyToAccount,
} from "viem/accounts";
import { startAnvil, TEST_MNEMONIC } from "../../experiments/harness.js";
import {
	accountAbi,
	registryAbi,
	onboardingAbi,
	tokenAbi,
	entryPointAbi,
	ZERO_HASH,
} from "../gateway/src/abi.js";
import { EchoGateway, type GatewayConfig } from "../gateway/src/client.js";
import { EchoError } from "../gateway/src/model.js";
import { ExecutionStore } from "../gateway/src/store.js";
export const localChain: Chain = {
	id: 31337,
	name: "M2 Anvil",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
};
export function artifact(name: string) {
	if (name === "EntryPoint")
		return JSON.parse(
			readFileSync("artifacts/m2/EntryPoint.v0.7.json", "utf8"),
		) as {
			abi: Abi;
			bytecode: { object: Hex };
			deployedBytecode: { object: Hex };
			metadata: unknown;
		};
	const source = ["MockInputToken", "MockOutputToken"].includes(name)
		? "MockTokens"
		: name;
	return JSON.parse(
		readFileSync(`echo/contracts/out/${source}.sol/${name}.json`, "utf8"),
	) as {
		abi: Abi;
		bytecode: { object: Hex };
		deployedBytecode: { object: Hex };
		metadata: unknown;
	};
}
export function context(
	id: 1337 | 31337 | 11155111,
	rpc: string,
	account: LocalAccount,
) {
	const chain = id === 11155111 ? sepolia : { ...localChain, id };
	const transport = http(rpc, { timeout: 10000, retryCount: 0 });
	return {
		pc: createPublicClient({ chain, transport, pollingInterval: id === 11155111 ? 5000 : 200 }),
		wc: createWalletClient({ account, chain, transport }),
	};
}
export function write(path: string, data: unknown) {
	mkdirSync("artifacts/m2", { recursive: true });
	writeFileSync(
		path,
		JSON.stringify(
			data,
			(_, v) => (typeof v === "bigint" ? v.toString() : v),
			2,
		) + "\n",
	);
}
export async function deploy(
	c: ReturnType<typeof context>,
	name: string,
	args: unknown[] = [],
) {
	const a = artifact(name);
	const hash = await c.wc.deployContract({
		abi: a.abi,
		bytecode: a.bytecode.object,
		args,
	});
	const r = await c.pc.waitForTransactionReceipt({ hash, timeout: 30000 });
	if (r.status !== "success" || !r.contractAddress)
		throw new EchoError("DEPLOYMENT_FAILED");
	return { address: getAddress(r.contractAddress), hash, block: r.blockNumber };
}
export async function grant(
	c: ReturnType<typeof context>,
	owner: Hex,
	onboarding: Hex,
	input: Hex,
	output: Hex,
	router: Hex,
	executeSigner: Hex,
	sessionSigner: Hex,
) {
	const expiry = Number((await c.pc.getBlock()).timestamp) + 86400;
	const hash = await c.wc.writeContract({
		address: onboarding,
		abi: onboardingAbi,
		functionName: "registerInstanceAndEip7702",
		args: [
			{
				budgetAsset: input,
				router,
				executeSigner,
				outputs: [output],
				maxPerOp: 100000n,
				maxPerDay: 150000n,
				totalBudget: 150000n,
				expiry,
			},
		],
	});
	const receipt = await c.pc.waitForTransactionReceipt({ hash });
	const id = parseEventLogs({
		abi: registryAbi,
		eventName: "InstanceRegistered",
		logs: receipt.logs,
	})[0]?.args.instanceId;
	if (!id) throw new EchoError("POLICY_EVENT_MISSING");
	return { id, hash, expiry };
}
export async function localFixture() {
	process.umask(0o077);
	const node = await startAnvil();
	const deployer = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 0 });
	const owner = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 1 });
	const realtime = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 2 });
	const session = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 3 });
	const c = context(31337, node.rpc, deployer),
		oc = context(31337, node.rpc, owner);
	const dir = `.runtime/m2/local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	mkdirSync(dir, { recursive: true });
	const ep = await deploy(c, "EntryPoint");
	const registry = await deploy(c, "PolicyRegistry", [deployer.address]);
	const decoder = await deploy(c, "EchoIntentDecoder");
	const validator = await deploy(c, "EchoPolicyValidator");
	const module = await deploy(c, "EchoDelegationModule", [
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
	for (const [name, address] of [
		["setImplementation", module.address],
		["setOnboarding", onboarding.address],
	] as const) {
		const hash = await c.wc.writeContract({
			address: registry.address,
			abi: registryAbi,
			functionName: name,
			args: [address],
		});
		await c.pc.waitForTransactionReceipt({ hash });
	}
	const authorization = await c.wc.signAuthorization({
		account: owner,
		contractAddress: module.address,
		executor: deployer,
	});
	const attachment = await c.wc.sendTransaction({
		to: owner.address,
		authorizationList: [authorization],
	});
	await c.pc.waitForTransactionReceipt({ hash: attachment });
	const p = await grant(
		oc,
		owner.address,
		onboarding.address,
		input.address,
		output.address,
		router.address,
		realtime.address,
		session.address,
	);
	const sh = await oc.wc.writeContract({
		address: registry.address,
		abi: registryAbi,
		functionName: "createSession",
		args: [
			p.id,
			session.address,
			output.address,
			100000n,
			150000n,
			5n,
			p.expiry,
		],
	});
	const sr = await oc.pc.waitForTransactionReceipt({ hash: sh });
	const sid = parseEventLogs({
		abi: registryAbi,
		eventName: "SessionCreated",
		logs: sr.logs,
	})[0]!.args.sessionId;
	const mint = await c.wc.writeContract({
		address: input.address,
		abi: tokenAbi,
		functionName: "mint",
		args: [owner.address, 1000000n],
	});
	await c.pc.waitForTransactionReceipt({ hash: mint });
	const deposit = await c.wc.writeContract({
		address: ep.address,
		abi: entryPointAbi,
		functionName: "depositTo",
		args: [owner.address],
		value: parseEther("1"),
	});
	await c.pc.waitForTransactionReceipt({ hash: deposit });
	const store = new ExecutionStore(`${dir}/execution.sqlite`);
	const config: GatewayConfig = {
		chainId: 31337,
		rpcUrl: node.rpc,
		bundlerUrl: "http://127.0.0.1:1",
		entryPoint: ep.address,
		registry: registry.address,
		account: owner.address,
		implementation: module.address,
		deploymentBlock: ep.block,
		confirmations: 1,
	};
	const client = new EchoGateway(config, store);
	return {
		c,
		oc,
		dir,
		node,
		owner,
		realtime,
		session,
		registry,
		decoder,
		validator,
		module,
		onboarding,
		input,
		output,
		router,
		ep,
		policyId: p.id,
		sessionId: sid,
		store,
		config,
		client,
		request: (requestId: string, sessionId: Hex = ZERO_HASH) => ({
			schemaVersion: 2 as const,
			requestId,
			instanceId: p.id,
			sessionId,
			tokenIn: input.address,
			tokenOut: output.address,
			direction: "exactInput" as const,
			inputLimit: "100000",
			outputConstraint: "50000000000000",
			fee: 500 as const,
		}),
		close: () => {
			store.close();
			node.stop();
		},
	};
}
export function createPublicRoles() {
	process.umask(0o077);
	mkdirSync(".runtime/m2/keys", { recursive: true, mode: 0o700 });
	const addresses: Record<string, string> = {};
	for (const role of [
		"deployer",
		"owner",
		"realtime",
		"session",
		"executor",
		"utility",
	]) {
		const path = `.runtime/m2/keys/${role}.json`;
		if (!existsSync(path))
			writeFileSync(
				path,
				JSON.stringify({ privateKey: generatePrivateKey() }),
				{ mode: 0o600, flag: "wx" },
			);
		chmodSync(path, 0o600);
		addresses[role] = privateKeyToAccount(
			JSON.parse(readFileSync(path, "utf8")).privateKey,
		).address;
	}
	write("artifacts/m2/test-accounts.json", { chainId: 11155111, addresses });
	return addresses;
}
export function role(
	name: "deployer" | "owner" | "realtime" | "session" | "executor" | "utility",
) {
	return privateKeyToAccount(
		JSON.parse(readFileSync(`.runtime/m2/keys/${name}.json`, "utf8"))
			.privateKey,
	);
}
