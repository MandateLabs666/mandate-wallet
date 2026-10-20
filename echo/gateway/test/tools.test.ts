import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createEchoMcp } from "../src/mcp.js";
import { describe, it, expect, vi } from "vitest";
import { mkdirSync } from "node:fs";
import { decodeFunctionData } from "viem";
import { EchoTools } from "../src/tools.js";
import { EchoGateway } from "../src/client.js";
import { SignerStore } from "../src/signing.js";
import { ExecutionStore } from "../src/store.js";
import { registryAbi, ZERO_HASH } from "../src/abi.js";
describe("migrated Echo v2 tool callers", () => {
	function fixture() {
		const dir = `.runtime/m2/tools-${Date.now()}-${Math.random()}`;
		mkdirSync(dir, { recursive: true });
		const signers = new SignerStore(dir + "/signers.json", "test-passphrase");
		const signer = signers.create("session");
		const store = new ExecutionStore(dir + "/records.sqlite");
		const address = ("0x" + "1".repeat(40)) as `0x${string}`;
		const client = new EchoGateway(
			{
				chainId: 31337,
				rpcUrl: "http://127.0.0.1:1",
				bundlerUrl: "http://127.0.0.1:1",
				entryPoint: address,
				registry: address,
				account: address,
				implementation: address,
				deploymentBlock: 0n,
				confirmations: 1,
			},
			store,
		);
		return {
			signers,
			store,
			signer,
			tools: new EchoTools(client, signers, "session", {}),
			close() {
				store.close();
				signers.close();
			},
		};
	}
	it("builds owner session and revocation drafts with signer addresses, never claims unconfirmed changes", async () => {
		const f = fixture();
		try {
			const draft = (await f.tools.call("echo_create_session", {
				instanceId: ZERO_HASH,
				signerId: "session",
				tokenOut: "0x" + "2".repeat(40),
				maxPerOp: "100000",
				totalBudget: "150000",
				maxOpsPerDay: "5",
				expiry: 2000000000,
			})) as { state: string; pendingTx: { calldata: `0x${string}` } };
			expect(draft.state).toBe("draft");
			expect(
				decodeFunctionData({ abi: registryAbi, data: draft.pendingTx.calldata })
					.args![1],
			).toBe(f.signer.address);
			const revoked = (await f.tools.call("echo_revoke_session", {
				sessionId: ZERO_HASH,
			})) as { state: string; revoked?: boolean };
			expect(revoked.state).toBe("draft");
			expect(revoked.revoked).toBeUndefined();
		} finally {
			f.close();
		}
	});
	it("refuses old bearer/decimal caller inputs before network access", async () => {
		const f = fixture();
		try {
			await expect(
				f.tools.call("echo_submit_intent", {
					amount: "0.1",
					executeKey: "old-secret",
					direction: "exactInput",
				}),
			).rejects.toThrow();
			await expect(
				f.tools.call("echo_reconcile", { requestId: "missing" }),
			).rejects.toThrow("REQUEST_NOT_RECORDED");
		} finally {
			f.close();
		}
	});
	it("discovers and invokes migrated Echo tools through the actual MCP SDK", async () => {
		const f = fixture();
		const server = createEchoMcp(f.tools);
		const client = new Client({ name: "m2-test-client", version: "1" });
		const [ct, st] = InMemoryTransport.createLinkedPair();
		try {
			await server.connect(st);
			await client.connect(ct);
			const list = await client.listTools();
			expect(list.tools.map((t) => t.name)).toContain("echo_list_sessions");
			const response = await client.callTool({
				name: "echo_get_context",
				arguments: {},
			});
			const content = (response.content as { type: string; text: string }[])[0];
			expect(JSON.parse(content.text).schemaVersion).toBe(2);
			const revoked = await client.callTool({
				name: "echo_revoke_session",
				arguments: { sessionId: ZERO_HASH },
			});
			expect(
				JSON.parse((revoked.content as { text: string }[])[0].text).state,
			).toBe("draft");
			const legacy = await client.callTool({
				name: "echo_submit_intent",
				arguments: { amount: "0.1", executeKey: "legacy" },
			});
			expect(legacy.isError).toBe(true);
		} finally {
			await client.close();
			await server.close();
			f.close();
		}
	});
});
