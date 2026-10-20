import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, getAddress, http, keccak256, toBytes, zeroAddress, type Address, type Hex } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { tokenAbi, walletAbi } from "../packages/core/chain.js";

// Read-only preparation. This module has no wallet client or signing key access.
const m1 = JSON.parse(readFileSync("artifacts/test-accounts.json", "utf8"));
const m2 = JSON.parse(readFileSync("artifacts/m2/test-accounts.json", "utf8"));
const deployment = JSON.parse(readFileSync("artifacts/sepolia-deployment.json", "utf8"));
const EIP1967 = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex;
const legacy = keccak256(toBytes("org.zeppelinos.proxy.implementation"));
const specifications = [
	{ chain: sepolia, rpc: "https://ethereum-sepolia-rpc.publicnode.com",
		asset: getAddress("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"),
		roles: { originalFunder: m1.addresses.owner, ...m2.addresses } as Record<string, Address> },
	{ chain: baseSepolia, rpc: "https://sepolia.base.org",
		asset: getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
		roles: { ...m1.addresses, m1ProcurementWallet: deployment.wallet } as Record<string, Address> },
] as const;
const observations = await Promise.all(specifications.map(async spec => {
	const pc = createPublicClient({ chain: spec.chain, transport: http(spec.rpc, { timeout: 10000, retryCount: 0, batch: { batchSize: 16, wait: 20 } }) });
	try {
		if ((await pc.getChainId()) !== spec.chain.id) throw new Error("RPC_CHAIN_MISMATCH");
		const block = await pc.getBlock();
		const [code, decimals, name, version, domain, slots, roles] = await Promise.all([
			pc.getCode({ address: spec.asset, blockNumber: block.number }),
			pc.readContract({ address: spec.asset, abi: tokenAbi, functionName: "decimals", blockNumber: block.number }),
			pc.readContract({ address: spec.asset, abi: tokenAbi, functionName: "name", blockNumber: block.number }),
			pc.readContract({ address: spec.asset, abi: tokenAbi, functionName: "version", blockNumber: block.number }),
			pc.readContract({ address: spec.asset, abi: tokenAbi, functionName: "DOMAIN_SEPARATOR", blockNumber: block.number }),
			Promise.all([EIP1967, legacy].map(slot => pc.getStorageAt({ address: spec.asset, slot, blockNumber: block.number }))),
			Promise.all(Object.entries(spec.roles).map(async ([role, addr]) => {
				const address = getAddress(addr);
				const [eth, usdc] = await Promise.all([
					pc.getBalance({ address, blockNumber: block.number }),
					pc.readContract({ address: spec.asset, abi: tokenAbi, functionName: "balanceOf", args: [address], blockNumber: block.number }),
				]);
				return { role, address, nativeBalanceWei: eth.toString(), usdcBalanceAtomic: usdc.toString() };
			})),
		]);
		if (!code || code === "0x" || decimals !== 6) throw new Error("USDC_ASSET_MISMATCH");
		const implementation = slots.map(x => x ? getAddress("0x" + x.slice(-40)) : undefined).find(x => x && x !== zeroAddress);
		const implementationCode = implementation ? await pc.getCode({ address: implementation, blockNumber: block.number }) : undefined;
		let m1Grant: unknown;
		if (spec.chain.id === 84532) {
			const grant = await pc.readContract({ address: getAddress(deployment.wallet), abi: walletAbi, functionName: "getMandate",
				args: [deployment.policy.mandateId], blockNumber: block.number });
			m1Grant = { mandateId: deployment.policy.mandateId, exists: grant.exists, revoked: grant.revoked,
				expiresAt: grant.expiresAt.toString(), expiredAtObservation: block.timestamp >= grant.expiresAt,
				occupiedAtomic: grant.occupied.toString(), historicalExperimentOnly: true };
		}
		const recheck = await pc.getBlock({ blockNumber: block.number });
		if (recheck.hash !== block.hash) throw new Error("SNAPSHOT_REORG");
		return { chainId: spec.chain.id, network: spec.chain.name, rpc: spec.rpc, status: "observed", blockNumber: block.number.toString(), blockHash: block.hash,
			blockTimestamp: block.timestamp.toString(), asset: { address: spec.asset, name, version, decimals, domainSeparator: domain,
				proxyCodeHash: keccak256(code), implementation, implementationCodeHash: implementationCode ? keccak256(implementationCode) : null,
				paymentCompatibilityProvenByInventory: false }, roles, m1Grant };
	} catch (error) {
		return { chainId: spec.chain.id, network: spec.chain.name, rpc: spec.rpc, status: "unavailable",
			errorName: error instanceof Error ? error.name : "UnknownError",
			reason: typeof error === "object" && error && "shortMessage" in error ? String(error.shortMessage).slice(0, 256) : "Read-only observation failed",
			code: error instanceof Error && ["RPC_CHAIN_MISMATCH", "USDC_ASSET_MISMATCH", "SNAPSHOT_REORG"].includes(error.message) ? error.message : "INVENTORY_RPC_UNAVAILABLE" };
	}
}));
const report = { schemaVersion: 1, observedAt: new Date().toISOString(), scope: "read-only preparation; not deployment or payment acceptance", transactionsSubmitted: 0,
	assetAddressSource: "https://developers.circle.com/stablecoins/usdc-contract-addresses", observations,
	constraints: { m2ResourceAllocationCapWei: "20000000000000000", m2EntryPointDepositCapWei: "2000000000000000",
		mandateBudgetAtomic: "150000", singlePaymentCapAtomic: "100000", noAdditionalFundingAuthorizedByInventory: true },
	limitations: ["Balances are snapshots, not additional spending authorization", "USDC domain/code metadata is not ERC-1271 compatibility or settlement evidence",
		"Existing M1 wallet and grants are historical experimental resources", "This public RPC observation does not replace the self-hosted M2 node readiness gate"] };
mkdirSync("artifacts/preparation", { recursive: true });
writeFileSync("artifacts/preparation/testnet-resources.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ observed: observations.filter(n => n.status === "observed").map(n => n.chainId), unavailable: observations.filter(n => n.status !== "observed").map(n => n.chainId), transactionsSubmitted: 0 }));
