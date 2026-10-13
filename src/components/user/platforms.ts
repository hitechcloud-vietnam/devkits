import catalog from "../../../integrations/platforms.json";

// Per-platform install instructions from integrations/platforms.json, with placeholders
// filled the same way scripts/build-integrations.mjs fills them for the README.

export interface InstallStep {
  label: string;
  lang: string;
  code: string;
}

export interface Platform {
  id: string;
  name: string;
  group: "plugin" | "mcp";
  package: string;
  verified: boolean;
  docs: string;
  install: InstallStep[];
  notes: string[];
  mcpOnly?: InstallStep & { file?: string };
}

const MCP_URL: string = catalog.mcpUrl;
const REPO: string = catalog.repo;
const TOKEN_ENV: string = catalog.tokenEnv;

function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Cursor one-click MCP install link. Never embeds a token. */
function cursorDeeplink(): string {
  const config = { url: MCP_URL, headers: { Authorization: `Bearer \${env:${TOKEN_ENV}}` } };
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=devkits&config=${base64(JSON.stringify(config))}`;
}

export function fill(text: string): string {
  return text.replaceAll("{{URL}}", MCP_URL).replaceAll("{{REPO}}", REPO).replaceAll("{{TOKEN_ENV}}", TOKEN_ENV).replaceAll("{{CURSOR_DEEPLINK}}", cursorDeeplink());
}

export const PLATFORMS: Platform[] = (catalog.platforms as Platform[]).map((p) => ({
  ...p,
  install: p.install.map((s) => ({ ...s, label: fill(s.label), code: fill(s.code) })),
  notes: p.notes.map(fill),
  mcpOnly: p.mcpOnly ? { ...p.mcpOnly, label: fill(p.mcpOnly.label), code: fill(p.mcpOnly.code) } : undefined,
}));

export const GROUP_LABELS: Record<Platform["group"], string> = {
  plugin: "Có plugin riêng",
  mcp: "Cấu hình MCP",
};

/** Two-letter mark for the letter square (never the vendor's trademark). */
export function shortName(p: Platform): string {
  const special: Record<string, string> = { "claude-code": "CC", "claude-desktop": "CD", "gemini-cli": "Ge", vscode: "VS", zcode: "ZC", opencode: "OC", other: "…" };
  if (special[p.id]) return special[p.id];
  return p.name.replace(/[^A-Za-zÀ-ỹ]/g, "").slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}

export const MCP_ENDPOINT = MCP_URL;
export const TOKEN_ENV_NAME = TOKEN_ENV;
