import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getMcpConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { authenticateToken } from "@/lib/db/repo";
import { createMcpServer } from "@/lib/mcp";
import { safeEqual } from "@/lib/session";

// Remote MCP endpoint (Streamable HTTP) for Claude Code, Cursor, Codex, OpenCode,
// Antigravity, VS Code, Gemini CLI and any other MCP client. Accepts personal tokens
// created in the user portal (stored hashed in the database) and optional service
// tokens from DEVKITS_MCP_TOKENS for automation.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized(message: string, status = 401) {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status, headers: status === 401 ? { "WWW-Authenticate": 'Bearer realm="devkits-mcp"' } : undefined },
  );
}

/** Returns the caller's user id ("" for a service token), or a Response to send back. */
async function identify(request: Request): Promise<string | Response> {
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) return unauthorized("Missing bearer token. Create one at devkits.hitechcloud.vn → Kết nối agent.");
  const presented = match[1];

  const db = await getDb();
  const owner = await authenticateToken(db, presented);
  if (owner) return owner.user.id;

  // Compare against every service token (no early exit) to keep timing uniform.
  const service = await Promise.all(getMcpConfig().tokens.map((t) => safeEqual(presented, t)));
  if (service.some(Boolean)) return "";
  return unauthorized("Invalid, expired or revoked token.");
}

async function handle(request: Request): Promise<Response> {
  const caller = await identify(request);
  if (caller instanceof Response) return caller;

  const server = createMcpServer({ userId: caller || null });
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
