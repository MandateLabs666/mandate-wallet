import { readFileSync } from "node:fs";
import { EchoGateway, type GatewayConfig } from "./client.js";
import { ExecutionStore } from "./store.js";
import { SignerStore } from "./signing.js";
import { EchoTools } from "./tools.js";
import { startEchoMcp } from "./mcp.js";
import { startEchoHttp } from "./http.js";
const [mode, path] = process.argv.slice(2);
if (!path)
	throw new Error(
		"Usage: cli.ts mcp|http|create-signer|retry|reconcile|export config.json",
	);
const raw = JSON.parse(readFileSync(path, "utf8")) as Omit<
	GatewayConfig,
	"deploymentBlock"
> & {
	deploymentBlock: string;
	database: string;
	signerStore: string;
	executeId: string;
	sessions: Record<string, string>;
};
const config = { ...raw, deploymentBlock: BigInt(raw.deploymentBlock) };
const store = new ExecutionStore(raw.database);
const client = new EchoGateway(config, store);
if (mode === "export")
	console.log(JSON.stringify(client.exportEvidence(), null, 2));
else if (mode === "retry") {
	const id = process.argv[4];
	const record = store.get(config.chainId, config.account, id);
	if (!record) throw new Error("REQUEST_NOT_RECORDED");
	console.log(JSON.stringify(await client.retryRecordedOp(record)));
} else if (mode === "reconcile") {
	for (const record of store.all()) await client.reconcileUserOp(record);
	console.log(JSON.stringify(client.exportEvidence(), null, 2));
} else {
	const passphrase = process.env.ECHO_V2_SIGNER_PASSPHRASE;
	if (!passphrase) throw new Error("ECHO_V2_SIGNER_PASSPHRASE_REQUIRED");
	const signers = new SignerStore(raw.signerStore, passphrase);
	if (mode === "create-signer") {
		const id = process.argv[4];
		if (!id) throw new Error("Signer handle required");
		console.log(JSON.stringify(signers.create(id)));
		signers.close();
	} else {
		const tools = new EchoTools(client, signers, raw.executeId, raw.sessions);
		if (mode === "mcp") await startEchoMcp(tools);
		else if (mode === "http") {
			const token = process.env.ECHO_V2_HTTP_TOKEN;
			if (!token) throw new Error("ECHO_V2_HTTP_TOKEN_REQUIRED");
			startEchoHttp(tools, token);
		} else throw new Error("Unknown command");
	}
}
if (!["mcp", "http"].includes(mode)) store.close();
