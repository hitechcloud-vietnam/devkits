import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getMcpConfig } from "@/lib/config";
import { createMcpServer } from "@/lib/mcp";
import { safeEqual } from "@/lib/session";

// Remote MCP endpoint (Streamable HTTP) for Claude Code, Cursor, Codex,
// OpenCode, Antigravity, VS Code, Gemini CLI and any other MCP client.
// Authenticated with per-client bearer tokens from DEVKITS_MCP_TOKENS.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized(message: string, status = 401) {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status, headers: status === 401 ? { "WWW-Authenticate": 'Bearer realm="devkits-mcp"' } : undefined },
  );
}

async function authorized(request: Request): Promise<Response | null> {
  const { tokens } = getMcpConfig();
  if (tokens.length === 0) return unauthorized("MCP endpoint is not configured on this server (DEVKITS_MCP_TOKENS).", 503);
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return unauthorized("Missing bearer token.");
  // Compare against every token (no early exit) to keep timing uniform.
  const results = await Promise.all(tokens.map((t) => safeEqual(match[1].trim(), t)));
  return results.some(Boolean) ? null : unauthorized("Invalid bearer token.");
}

async function handle(request: Request): Promise<Response> {
  const denied = await authorized(request);
  if (denied) return denied;

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // JSON responses are fully built by now; release the per-request server.
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
