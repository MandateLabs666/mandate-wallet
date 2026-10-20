import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { EchoTools, TOOL_DEFINITIONS } from "./tools.js";
export function createEchoMcp(tools: EchoTools) {
	const server = new Server(
		{ name: "echo-gateway", version: "2.0.0" },
		{ capabilities: { tools: {} } },
	);
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [...TOOL_DEFINITIONS],
	}));
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		try {
			const result = await tools.call(
				request.params.name,
				request.params.arguments ?? {},
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, (_, value) =>
							typeof value === "bigint" ? value.toString() : value,
						),
					},
				],
			};
		} catch (e) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: JSON.stringify({
							error: true,
							code: e instanceof Error ? e.message : "TOOL_FAILED",
						}),
					},
				],
			};
		}
	});
	return server;
}

export async function startEchoMcp(tools: EchoTools) {
	const server = createEchoMcp(tools);
	await server.connect(new StdioServerTransport());
	return server;
}
