// Local Claude Desktop entry point. Configuration paths are supplied by MCPB;
// the connection credential is never placed in a chat or command argument.
import {readFileSync, statSync} from "node:fs";
import {isAbsolute} from "node:path";
import {loadGateway} from "../gateway/runtime.js";
import {serveMandateStdio} from "../gateway/mcp.js";
import {MandateError} from "../sdk/model.js";
import {desktopConnection} from "./connection.js";
import {GatewayTools} from "../gateway/tools.js";

async function main() {
  process.umask(0o077);
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 2) throw new MandateError("DESKTOP_NODE_24_2_REQUIRED");
  const connection=desktopConnection(process.argv.slice(2)),{config,credential}=connection;
  const stat = statSync(credential);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 16384) {
    throw new MandateError("DESKTOP_CREDENTIAL_FILE_REJECTED");
  }
  const data: unknown = JSON.parse(readFileSync(credential, "utf8"));
  if (!data || typeof data !== "object" || !("connectionToken" in data) ||
      typeof data.connectionToken !== "string" || data.connectionToken.length < 32 ||
      data.connectionToken.length > 1024) throw new MandateError("DESKTOP_CREDENTIAL_INVALID");
  // loadGateway authenticates the credential and enforces the existing fixed
  // profile, signer separation, test-chain allowlist and service restrictions.
  const runtime = await loadGateway(config, data.connectionToken);
  if(connection.scope){for(const key of ["chainId","wallet","mandateId","sessionId"] as const){if(String(runtime.config[key]).toLowerCase()!==String(connection.scope[key]).toLowerCase()){runtime.close();throw new MandateError("DESKTOP_CONNECTION_SCOPE_MISMATCH");}}}
  delete process.env.MANDATE_CONNECTION_TOKEN;
  const server = await serveMandateStdio(new GatewayTools(runtime.purchase,runtime.tools.catalog,()=>{connection.check();runtime.authorizeConnection();}));
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close();
    runtime.close();
  };
  process.once("SIGINT", () => {void close();});
  process.once("SIGTERM", () => {void close();});
  process.stdin.once("end", () => {void close();});
}
main().catch(error => {
  process.stderr.write(JSON.stringify({code: error instanceof MandateError ? error.code : "DESKTOP_START_REJECTED"}) + "\n");
  process.exitCode = 1;
});
