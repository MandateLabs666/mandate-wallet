import { readFileSync } from "node:fs";
import {
	createPublicClient,
	http,
	keccak256,
	getContractAddress,
	type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { write } from "./harness.js";
const address = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const source = JSON.parse(
	readFileSync("artifacts/m2/entrypoint-sourcify.json", "utf8"),
);
const built = JSON.parse(
	readFileSync(".runtime/m2/canonical-output.json", "utf8"),
);
if (built.errors?.some((e: { severity: string }) => e.severity === "error"))
	throw new Error("Canonical compilation failed");
const artifact = built.contracts["contracts/core/EntryPoint.sol"].EntryPoint;
const sourceChecks = Object.entries(
	source.sources as Record<string, { content: string }>,
)
	.filter(([path]) => path.startsWith("contracts/"))
	.map(([path, item]) => ({
		path,
		match:
			readFileSync("echo/contracts/lib/account-abstraction/" + path, "utf8") ===
			item.content,
	}));
if (sourceChecks.some((item) => !item.match))
	throw new Error("EntryPoint source differs from fixed v0.7 commit");
const creator = getContractAddress({ from: address, nonce: 1n });
let runtime = artifact.evm.deployedBytecode.object;
for (const references of Object.values(
	artifact.evm.deployedBytecode.immutableReferences,
) as { start: number; length: number }[][]) {
	for (const { start, length } of references) {
		if (length !== 32) throw new Error("Unexpected canonical immutable");
		runtime =
			runtime.slice(0, start * 2) +
			creator.slice(2).toLowerCase().padStart(64, "0") +
			runtime.slice((start + length) * 2);
	}
}
const pc = createPublicClient({
	chain: sepolia,
	transport: http("https://ethereum-sepolia-rpc.publicnode.com", {
		timeout: 30000,
	}),
});
if ((await pc.getChainId()) !== 11155111) throw new Error("Wrong chain");
const onchain = await pc.getCode({ address });
const exactRuntimeMatch =
	onchain?.toLowerCase() === ("0x" + runtime).toLowerCase();
write("artifacts/m2/entrypoint-verification.json", {
	chainId: 11155111,
	address,
	sourceCommit: "7af70c8993a6f42973f520ae0752386a5032abe7",
	sourceChecks,
	compiler: source.compilation,
	creator,
	exactRuntimeMatch,
	runtimeHash: keccak256(onchain!),
	localRuntimeHash: keccak256(("0x" + runtime) as Hex),
	sourcifyMatch: source.runtimeMatch,
	source: "entrypoint-sourcify.json",
});
if (!exactRuntimeMatch)
	throw new Error(
		"Canonical runtime differs from locally reproduced fixed v0.7 compilation",
	);
write("artifacts/m2/EntryPoint.v0.7.json", {
	license: "GPL-3.0",
	sourceCommit: "7af70c8993a6f42973f520ae0752386a5032abe7",
	compiler: "0.8.23+commit.f704f362",
	abi: artifact.abi,
	bytecode: { object: "0x" + artifact.evm.bytecode.object },
	deployedBytecode: { object: "0x" + artifact.evm.deployedBytecode.object },
	metadata: JSON.parse(artifact.metadata),
});
console.log(
	JSON.stringify({
		exactRuntimeMatch,
		runtimeHash: keccak256(onchain!),
		fixedSources: sourceChecks.length,
	}),
);
