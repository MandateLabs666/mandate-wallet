import { readFileSync } from "node:fs";
import { mnemonicToAccount } from "viem/accounts";
import {
	encodeFunctionData,
	parseAbi,
	parseEther,
	toHex,
	type Hex,
} from "viem";
import { TEST_MNEMONIC } from "../../experiments/harness.js";
import { context, deploy, write } from "./harness.js";
import { EchoGateway } from "../gateway/src/client.js";
import { EchoError } from "../gateway/src/model.js";
import { ExecutionStore } from "../gateway/src/store.js";
import { entryPointAbi } from "../gateway/src/abi.js";
const m = JSON.parse(
	readFileSync("artifacts/m2/local-deployment.json", "utf8"),
);
const admin = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 0 });
const owner = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 6 });
const c = context(1337, m.rpc, admin);
const probe = await deploy(c, "TraceRuleProbe", [m.ep.address]);
const auth = await c.wc.signAuthorization({
	account: owner,
	contractAddress: probe.address,
	executor: admin,
});
const attached = await c.wc.sendTransaction({
	to: owner.address,
	authorizationList: [auth],
});
await c.pc.waitForTransactionReceipt({ hash: attached });
const deposit = await c.wc.writeContract({
	address: m.ep.address,
	abi: entryPointAbi,
	functionName: "depositTo",
	args: [owner.address],
	value: parseEther("1"),
});
await c.pc.waitForTransactionReceipt({ hash: deposit });
const store = new ExecutionStore(".runtime/m2/trace-control.sqlite");
const client = new EchoGateway(
	{
		chainId: 1337,
		rpcUrl: m.rpc,
		bundlerUrl: process.env.M2_LOCAL_BUNDLER_URL ?? "http://127.0.0.1:24340",
		entryPoint: m.ep.address,
		registry: m.registry.address,
		account: owner.address,
		implementation: probe.address,
		deploymentBlock: BigInt(m.ep.block),
		confirmations: 1,
	},
	store,
);
try {
	const price = await c.pc.getGasPrice();
	const op = {
		sender: owner.address,
		nonce: "0x0",
		callData: encodeFunctionData({
			abi: parseAbi(["function execute()"]),
			functionName: "execute",
		}),
		verificationGasLimit: toHex(500000n),
		callGasLimit: toHex(100000n),
		preVerificationGas: toHex(100000n),
		maxFeePerGas: toHex(price * 2n),
		maxPriorityFeePerGas: toHex(price),
		signature: "0x1234",
	};
	try {
		await client.rpc("eth_sendUserOperation", [op, m.ep.address]);
		throw new Error("Forbidden opcode accepted");
	} catch (e) {
		if (!(e instanceof EchoError) || !e.detail?.includes("TIMESTAMP")) throw e;
		write("artifacts/m2/strict-trace-negative-control.json", {
			safeMode: true,
			chainId: 1337,
			fixture: probe.address,
			fixturePurpose: "negative control with TIMESTAMP in validation",
			code: e.code,
			detail: e.detail,
			accepted: false,
		});
		console.log(
			JSON.stringify({ accepted: false, code: e.code, reason: e.detail }),
		);
	}
} finally {
	store.close();
}
