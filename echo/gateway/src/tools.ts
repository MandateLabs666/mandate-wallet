import { encodeFunctionData, getAbiItem, type Hex } from "viem";
import { z } from "zod";
import { EchoGateway } from "./client.js";
import { SignerStore } from "./signing.js";
import { SwapRequest, EchoError } from "./model.js";
import { registryAbi, ZERO_HASH } from "./abi.js";
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const atomic = z.string().regex(/^[1-9][0-9]*$/);
const sessionDraft = z
	.object({
		instanceId: hash,
		signerId: z.string().min(1),
		tokenOut: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
		maxPerOp: atomic,
		totalBudget: atomic,
		maxOpsPerDay: atomic,
		expiry: z.number().int().positive(),
	})
	.strict();
export const TOOL_DEFINITIONS = [
	{
		name: "echo_get_context",
		description: "Read Echo v2 account and chain context.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	...["echo_submit_intent", "echo_execute_session"].map((name) => ({
		name,
		description:
			"Echo v2 swap. All amounts are input token atomic units. requestId is required for recovery; outputConstraint is an explicit quoted minimum/target. Returns pending/succeeded/failed/rejected, including gas separately.",
		inputSchema: {
			type: "object",
			properties: {
				schemaVersion: { const: 2 },
				requestId: { type: "string" },
				instanceId: { type: "string" },
				sessionId: { type: "string" },
				tokenIn: { type: "string" },
				tokenOut: { type: "string" },
				direction: { enum: ["exactInput", "exactOutput"] },
				inputLimit: { type: "string" },
				outputConstraint: { type: "string" },
				fee: { const: 500 },
			},
			required: [
				"schemaVersion",
				"requestId",
				"instanceId",
				"sessionId",
				"tokenIn",
				"tokenOut",
				"direction",
				"inputLimit",
				"outputConstraint",
				"fee",
			],
			additionalProperties: false,
		},
	})),
	{
		name: "echo_get_policy",
		description: "Read the current input-asset policy and spent budget.",
		inputSchema: {
			type: "object",
			properties: { instanceId: { type: "string" } },
			required: ["instanceId"],
			additionalProperties: false,
		},
	},
	{
		name: "echo_create_session",
		description:
			"Prepare an unsigned owner transaction for a new ECDSA session; creation is not effective until owner confirms it.",
		inputSchema: {
			type: "object",
			properties: {
				instanceId: { type: "string" },
				signerId: { type: "string" },
				tokenOut: { type: "string" },
				maxPerOp: { type: "string" },
				totalBudget: { type: "string" },
				maxOpsPerDay: { type: "string" },
				expiry: { type: "integer" },
			},
			required: [
				"instanceId",
				"signerId",
				"tokenOut",
				"maxPerOp",
				"totalBudget",
				"maxOpsPerDay",
				"expiry",
			],
			additionalProperties: false,
		},
	},
	{
		name: "echo_list_sessions",
		description:
			"Read on-chain sessions and their current active/revoked status.",
		inputSchema: {
			type: "object",
			properties: { instanceId: { type: "string" } },
			required: ["instanceId"],
			additionalProperties: false,
		},
	},
	{
		name: "echo_revoke_session",
		description:
			"Prepare an unsigned owner revocation; report a draft, not an already revoked session.",
		inputSchema: {
			type: "object",
			properties: { sessionId: { type: "string" } },
			required: ["sessionId"],
			additionalProperties: false,
		},
	},
	{
		name: "echo_pause_instance",
		description:
			"Prepare an unsigned owner pause/resume; no owner key is exposed to this gateway.",
		inputSchema: {
			type: "object",
			properties: {
				instanceId: { type: "string" },
				paused: { type: "boolean" },
			},
			required: ["instanceId", "paused"],
			additionalProperties: false,
		},
	},
	{
		name: "echo_reconcile",
		description:
			"Recover an already recorded request without creating another operation.",
		inputSchema: {
			type: "object",
			properties: { requestId: { type: "string" } },
			required: ["requestId"],
			additionalProperties: false,
		},
	},
] as const;
export class EchoTools {
	constructor(
		readonly client: EchoGateway,
		readonly signers: SignerStore,
		readonly executeId: string,
		readonly sessions: Record<string, string>,
	) {}
	private draft(calldata: Hex) {
		return {
			schemaVersion: 2,
			state: "draft",
			requiresOwnerSignature: true,
			pendingTx: {
				chainId: this.client.config.chainId,
				to: this.client.config.registry,
				calldata,
			},
		};
	}
	async call(name: string, args: unknown) {
		const c = this.client.config;
		if (name === "echo_get_context") {
			z.object({}).strict().parse(args);
			return {
				schemaVersion: 2,
				account: c.account,
				chainId: c.chainId,
				entryPoint: c.entryPoint,
				implementation: c.implementation,
				registry: c.registry,
			};
		}
		if (name === "echo_submit_intent" || name === "echo_execute_session") {
			const r = SwapRequest.parse(args);
			if (
				(name === "echo_submit_intent" && r.sessionId !== ZERO_HASH) ||
				(name === "echo_execute_session" && r.sessionId === ZERO_HASH)
			)
				throw new EchoError("AUTHORITY_TOOL_MISMATCH");
			const signerId =
				r.sessionId === ZERO_HASH ? this.executeId : this.sessions[r.sessionId];
			if (!signerId) throw new EchoError("SESSION_SIGNER_NOT_CONFIGURED");
			return this.client.execute(r, this.signers.signer(signerId));
		}
		if (name === "echo_get_policy") {
			const a = z.object({ instanceId: hash }).strict().parse(args);
			return this.client.pc.readContract({
				address: c.registry,
				abi: registryAbi,
				functionName: "getPolicy",
				args: [a.instanceId as Hex],
			});
		}
		if (name === "echo_create_session") {
			const a = sessionDraft.parse(args);
			const signer = this.signers.signer(a.signerId);
			return this.draft(
				encodeFunctionData({
					abi: registryAbi,
					functionName: "createSession",
					args: [
						a.instanceId as Hex,
						signer.address,
						a.tokenOut as Hex,
						BigInt(a.maxPerOp),
						BigInt(a.totalBudget),
						BigInt(a.maxOpsPerDay),
						a.expiry,
					],
				}),
			);
		}
		if (name === "echo_list_sessions") {
			const a = z.object({ instanceId: hash }).strict().parse(args);
			const head = await this.client.pc.getBlockNumber({ cacheTime: 0 });
			const ids: Hex[] = [];
			for (let from = c.deploymentBlock; from <= head; from += 200n) {
				const logs = await this.client.pc.getLogs({
					address: c.registry,
					event: getAbiItem({ abi: registryAbi, name: "SessionCreated" }),
					args: { instanceId: a.instanceId as Hex },
					fromBlock: from,
					toBlock: from + 199n < head ? from + 199n : head,
				});
				for (const log of logs)
					if (log.args.sessionId) ids.push(log.args.sessionId);
			}
			return Promise.all(
				ids.map(async (sessionId) => ({
					sessionId,
					...(await this.client.pc.readContract({
						address: c.registry,
						abi: registryAbi,
						functionName: "getSession",
						args: [sessionId],
					})),
				})),
			);
		}
		if (name === "echo_revoke_session") {
			const a = z.object({ sessionId: hash }).strict().parse(args);
			return this.draft(
				encodeFunctionData({
					abi: registryAbi,
					functionName: "revokeSession",
					args: [a.sessionId as Hex],
				}),
			);
		}
		if (name === "echo_pause_instance") {
			const a = z
				.object({ instanceId: hash, paused: z.boolean() })
				.strict()
				.parse(args);
			return this.draft(
				encodeFunctionData({
					abi: registryAbi,
					functionName: "pauseInstance",
					args: [a.instanceId as Hex, a.paused],
				}),
			);
		}
		if (name === "echo_reconcile") {
			const a = z
				.object({ requestId: z.string().min(1) })
				.strict()
				.parse(args);
			const row = this.client.store.get(c.chainId, c.account, a.requestId);
			if (!row) throw new EchoError("REQUEST_NOT_RECORDED");
			return this.client.reconcileUserOp(row);
		}
		throw new EchoError("TOOL_UNSUPPORTED");
	}
}
