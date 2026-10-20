import { readFileSync } from "node:fs";
import { mnemonicToAccount } from "viem/accounts";
import { TEST_MNEMONIC } from "../../experiments/harness.js";
import { EchoGateway } from "../gateway/src/client.js";
import { ExecutionStore } from "../gateway/src/store.js";
import { ZERO_HASH } from "../gateway/src/abi.js";
import { write } from "./harness.js";
const m = JSON.parse(
	readFileSync("artifacts/m2/local-deployment.json", "utf8"),
);
const store = new ExecutionStore(
	`.runtime/m2/local-strict-${m.ep.address}.sqlite`,
);
const client = new EchoGateway(
	{
		chainId: 1337,
		rpcUrl: m.rpc,
		bundlerUrl: process.env.M2_LOCAL_BUNDLER_URL ?? "http://127.0.0.1:24340",
		entryPoint: m.ep.address,
		registry: m.registry.address,
		account: m.owner,
		implementation: m.implementation.address,
		deploymentBlock: BigInt(m.ep.block),
		confirmations: 1,
	},
	store,
);
try {
	const request = {
		schemaVersion: 2 as const,
		requestId: process.argv[2] ?? "strict-realtime-v2",
		instanceId: m.policyId,
		sessionId: ZERO_HASH,
		tokenIn: m.input.address,
		tokenOut: m.output.address,
		direction: "exactInput" as const,
		inputLimit: "100000",
		outputConstraint: "50000000000000",
		fee: 500 as const,
	};
	const r = await client.execute(
		request,
		mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 2 }),
	);
	for (let i = 0; i < 30 && r.state === "pending"; i++) {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		Object.assign(r, await client.reconcileUserOp(r));
	}
	write("artifacts/m2/local-strict-result.json", client.exportEvidence());
	console.log(
		JSON.stringify({
			state: r.state,
			error: r.errorCode,
			userOpHash: r.userOpHash,
		}),
	);
} catch (e) {
	console.error(e);
	process.exitCode = 1;
} finally {
	store.close();
}
