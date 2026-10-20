import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { EchoTools } from "./tools.js";
// A local transport token authenticates the HTTP connection only. It never enters UserOperation.signature.
export function startEchoHttp(
	tools: EchoTools,
	transportToken: string,
	port = 24339,
) {
	if (transportToken.length < 32)
		throw new Error("HTTP_TRANSPORT_TOKEN_TOO_SHORT");
	const server = createServer(async (req, res) => {
		const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
		const expected = Buffer.from(transportToken),
			actual = Buffer.from(token);
		if (
			actual.length !== expected.length ||
			!timingSafeEqual(actual, expected)
		) {
			res.writeHead(401);
			res.end();
			return;
		}
		if (req.method !== "POST" || req.url !== "/api/v2/tools") {
			res.writeHead(404);
			res.end();
			return;
		}
		try {
			let body = "";
			for await (const chunk of req) {
				body += chunk;
				if (Buffer.byteLength(body) > 65536)
					throw new Error("REQUEST_TOO_LARGE");
			}
			const { name, arguments: args } = JSON.parse(body);
			const result = await tools.call(name, args ?? {});
			res.writeHead(200, { "content-type": "application/json" });
			res.end(
				JSON.stringify(result, (_, v) =>
					typeof v === "bigint" ? v.toString() : v,
				),
			);
		} catch (e) {
			res.writeHead(400, { "content-type": "application/json" });
			res.end(
				JSON.stringify({
					error: true,
					code: e instanceof Error ? e.message : "REQUEST_FAILED",
				}),
			);
		}
	});
	server.listen(port, "127.0.0.1");
	return server;
}
