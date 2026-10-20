import { createPublicClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { write } from "./harness.js";
export const PUBLIC_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const TRACE_RPC = "https://sepolia.drpc.org";
export const WITNESS_RPC = TRACE_RPC;
export async function readiness() {
	const clients = [PUBLIC_RPC, WITNESS_RPC].map(url => createPublicClient({
		chain: sepolia, transport: http(url, { timeout: 15000, retryCount: 0 }),
	}));
	try {
		const views = await Promise.all(clients.map(async pc => {
			const [chainId, latest, finalized] = await Promise.all([
				pc.getChainId(), pc.getBlock({ blockTag: "latest" }), pc.getBlock({ blockTag: "finalized" }),
			]);
			return { chainId, latest, finalized };
		}));
		const anchorNumber = views[0].finalized.number! < views[1].finalized.number!
			? views[0].finalized.number! : views[1].finalized.number!;
		const anchors = await Promise.all(clients.map(pc => pc.getBlock({ blockNumber: anchorNumber })));
		const syncing = await clients[0].request({ method: "eth_syncing" } as never);
		const expectedOutput = ("0x" + "0".repeat(62) + "2a") as Hex;
		const trace = await clients[1].request({ method: "debug_traceCall", params: [
			{ to: "0x1111111111111111111111111111111111111111", data: "0x" }, "latest",
			{ tracer: '{fault:function(log,db){},result:function(ctx,db){return {marker:"mandate-m2-js-trace",output:toHex(ctx.output),error:ctx.error||null};}}',
				stateOverrides: { "0x1111111111111111111111111111111111111111": { code: "0x602a60005260206000f3" } } },
		] } as never) as unknown as { marker: string; output: Hex; error: string | null };
		const now = BigInt(Math.floor(Date.now() / 1000));
		const latestFresh = views.every(v => v.latest.timestamp <= now + 30n && now - v.latest.timestamp < 300n);
		const finalizedAnchorMatches = anchors[0].hash === anchors[1].hash &&
			!!anchors[0].hash && !/^0x0+$/.test(anchors[0].hash);
		const record = {
			schemaVersion: "m2.rpc-readiness.v2", recordedAt: new Date().toISOString(),
			route: "third-party-rpc", primaryRpc: PUBLIC_RPC, witnessRpc: WITNESS_RPC, traceRpc: TRACE_RPC,
			chainId: views[0].chainId, syncing, latestFresh, finalizedAnchorMatches,
			providers: views.map((v, i) => ({ rpc: [PUBLIC_RPC, WITNESS_RPC][i], chainId: v.chainId,
				latestBlock: v.latest.number!.toString(), latestTimestamp: v.latest.timestamp.toString(),
				finalizedBlock: v.finalized.number!.toString(), finalizedHash: v.finalized.hash })),
			anchor: { number: anchorNumber.toString(), hash: anchors[0].hash }, trace,
			trustModel: "Provider-reported finalized blocks cross-checked at one height; no independently synced consensus client.",
			ready: views.every(v => v.chainId === 11155111) && syncing === false && latestFresh &&
				finalizedAnchorMatches && trace.marker === "mandate-m2-js-trace" && trace.error === null && trace.output === expectedOutput,
		};
		write("artifacts/m2/node-readiness.json", record);
		return record;
	} catch (error) {
		const record = { schemaVersion: "m2.rpc-readiness.v2", recordedAt: new Date().toISOString(),
			route: "third-party-rpc", primaryRpc: PUBLIC_RPC, witnessRpc: WITNESS_RPC,
			ready: false, rpcUnavailable: true, error: error instanceof Error ? error.message.slice(0, 500) : "RPC unavailable" };
		write("artifacts/m2/node-readiness.json", record);
		return record;
	}
}
if (process.argv[1]?.endsWith("/readiness.ts"))
	console.log(JSON.stringify(await readiness()));
