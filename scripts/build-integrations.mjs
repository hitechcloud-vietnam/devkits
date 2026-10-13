#!/usr/bin/env node
// Generates every per-platform package from two sources of truth:
//   skills/                      canonical Agent Skills (SKILL.md)
//   integrations/platforms.json  install commands and MCP configs per platform
//
// Outputs (committed, because marketplaces install straight from the repo):
//   plugins/devkits/             one plugin dir read by Claude Code, ZCode, Cursor,
//                                Codex, VS Code, Kiro and Antigravity
//   plugin.json, mcp.json        portable Agent Plugin at the repo root (Antigravity,
//                                Kiro, VS Code install from the repo URL)
//   gemini-extension.json        Gemini CLI extension (must sit at the repo root)
//   .claude-plugin/, .cursor-plugin/, .agents/plugins/   marketplaces
//   integrations/configs/*       MCP-only config per client
//   integrations/README.md       install commands per platform
//
// Usage: node scripts/build-integrations.mjs [--check]
//   --check fails (exit 1) when generated files are out of date, for CI.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const catalog = JSON.parse(readFileSync(join(ROOT, "integrations/platforms.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION = pkg.version;
const { mcpUrl: URL_, repo: REPO, tokenEnv: TOKEN_ENV } = catalog;

const AUTHOR = { name: "HiTechCloud (Pho Tue SoftWare And Technology Solutions JSC)", email: "support@hitechcloud.vn", url: "https://hitechcloud.vn" };
const DESCRIPTION = "HiTechCloud DevKits: MCP tools and skills for building, auditing and shipping HostBill, WHMCS and WordPress integrations with any AI agent.";
const KEYWORDS = ["hitechcloud", "devkits", "mcp", "hostbill", "whmcs", "vercel"];

const written = [];
const stale = [];

function write(path, content) {
  const abs = join(ROOT, path);
  const text = typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`;
  if (CHECK) {
    if (!existsSync(abs) || readFileSync(abs, "utf8") !== text) stale.push(path);
    return;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  written.push(path);
}

function fill(text) {
  return text
    .replaceAll("{{URL}}", URL_)
    .replaceAll("{{REPO}}", REPO)
    .replaceAll("{{TOKEN_ENV}}", TOKEN_ENV)
    .replaceAll("{{CURSOR_DEEPLINK}}", cursorDeeplink());
}

function cursorDeeplink() {
  // Cursor one-click MCP install: base64 of the server config. Never embeds a token.
  const config = { url: URL_, headers: { Authorization: `Bearer \${env:${TOKEN_ENV}}` } };
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=devkits&config=${Buffer.from(JSON.stringify(config)).toString("base64")}`;
}

// ---------- 1. Validate skills ----------
const skillDirs = readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const problems = [];
for (const name of skillDirs) {
  const file = join(ROOT, "skills", name, "SKILL.md");
  if (!existsSync(file)) { problems.push(`skills/${name}: missing SKILL.md`); continue; }
  const fm = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { problems.push(`skills/${name}/SKILL.md: missing frontmatter`); continue; }
  const field = (k) => fm[1].match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1].trim();
  if (field("name") !== name) problems.push(`skills/${name}/SKILL.md: name must equal directory name`);
  if (!field("description") || field("description").length < 40) problems.push(`skills/${name}/SKILL.md: description missing or too short`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) problems.push(`skills/${name}: name must be kebab-case`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

// ---------- 2. Plugin directory shared by every plugin format ----------
const P = "plugins/devkits";
if (!CHECK) {
  rmSync(join(ROOT, P, "skills"), { recursive: true, force: true });
  cpSync(join(ROOT, "skills"), join(ROOT, P, "skills"), { recursive: true });
}

// Agent Plugins 1.0 (Codex, VS Code, Kiro, Antigravity; Cursor also accepts it).
const portableManifest = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "devkits",
  version: VERSION,
  description: DESCRIPTION,
  author: AUTHOR,
  homepage: "https://devkits.hitechcloud.vn",
  repository: `https://github.com/${REPO}`,
  license: "MIT",
  keywords: KEYWORDS,
  extensions: {
    "com.openai": {
      interface: {
        displayName: "HiTechCloud DevKits",
        shortDescription: "Build and ship HostBill, WHMCS and WordPress integrations",
        developerName: "HiTechCloud",
        category: "Developer Tools",
        capabilities: ["Read"],
        websiteURL: "https://devkits.hitechcloud.vn",
        brandColor: "#0B5FFF",
      },
    },
  },
};
// Agent Plugins forbid secrets in mcp.json: Codex reads the auth declaration and asks
// for the key itself; other clients add the Authorization header in their own config.
const portableMcp = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  mcpServers: {
    devkits: {
      type: "streamable-http",
      url: URL_,
      extensions: { "com.openai": { auth: { type: "api_key", headerScheme: "bearer" } } },
    },
  },
};
write(`${P}/plugin.json`, portableManifest);
write(`${P}/mcp.json`, portableMcp);

// Claude Code (also ZCode, which falls back to .claude-plugin/plugin.json).
write(`${P}/.claude-plugin/plugin.json`, {
  name: "devkits",
  displayName: "HiTechCloud DevKits",
  version: VERSION,
  description: DESCRIPTION,
  author: AUTHOR,
  homepage: "https://devkits.hitechcloud.vn",
  repository: `https://github.com/${REPO}`,
  license: "MIT",
  keywords: KEYWORDS,
  userConfig: {
    devkits_token: {
      type: "string",
      title: "DevKits MCP token",
      description: "Personal token from devkits.hitechcloud.vn → Kết nối agent. Stored in the system keychain.",
      sensitive: true,
      required: true,
    },
  },
});
write(`${P}/.mcp.json`, {
  mcpServers: { devkits: { type: "http", url: URL_, headers: { Authorization: "Bearer ${user_config.devkits_token}" } } },
});

// Cursor: own manifest + MCP file with a declared variable (set in the Cursor dashboard).
write(`${P}/.cursor-plugin/plugin.json`, {
  name: "devkits",
  description: DESCRIPTION,
  version: VERSION,
  author: { name: AUTHOR.name, email: AUTHOR.email },
  homepage: "https://devkits.hitechcloud.vn",
  repository: `https://github.com/${REPO}`,
  license: "MIT",
  keywords: KEYWORDS,
  rules: "./rules",
  skills: "./skills",
  mcpServers: "./cursor-mcp.json",
  variables: {
    type: "object",
    properties: {
      [TOKEN_ENV]: { type: "string", title: "DevKits MCP token", description: "Personal token from devkits.hitechcloud.vn → Kết nối agent." },
    },
    required: [TOKEN_ENV],
  },
});
write(`${P}/cursor-mcp.json`, {
  mcpServers: { devkits: { url: URL_, headers: { Authorization: `Bearer \${${TOKEN_ENV}}` } } },
});
write(
  `${P}/rules/devkits.mdc`,
  `---
description: How to work with HiTechCloud DevKits tools and skills
alwaysApply: false
---

- DevKits MCP tools are read-only. Use them to ground answers about the DevKits repository, Vercel deployments and workspace health instead of guessing.
- Never claim a deployment, merge, DNS or credential change happened unless a tool result shows it; propose the exact steps for a human instead.
- For billing-platform work (HostBill, WHMCS, WordPress) follow the matching DevKits skill: module development, audit, bug fix, conversion, deployment.
`,
);

// ---------- 3. Repo-root packages (installed straight from the repo URL) ----------
write("plugin.json", portableManifest);
write("mcp.json", portableMcp);
write("gemini-extension.json", {
  name: "devkits",
  version: VERSION,
  description: DESCRIPTION,
  contextFileName: "GEMINI.md",
  mcpServers: { devkits: { httpUrl: URL_, headers: { Authorization: `Bearer \${${TOKEN_ENV}}` } } },
  settings: [{ name: "DevKits MCP token", description: "Personal token from devkits.hitechcloud.vn → Kết nối agent.", envVar: TOKEN_ENV, sensitive: true }],
});

// ---------- 4. Marketplaces ----------
const entryDescription = "MCP tools and skills for HostBill, WHMCS and WordPress integrations, plus DevKits workspace status.";
write(".claude-plugin/marketplace.json", {
  name: "devkits",
  owner: { name: "HiTechCloud", email: AUTHOR.email },
  metadata: { description: "HiTechCloud DevKits plugins" },
  plugins: [{ name: "devkits", source: "./plugins/devkits", description: entryDescription, category: "development" }],
});
write(".cursor-plugin/marketplace.json", {
  name: "devkits",
  owner: { name: "HiTechCloud", email: AUTHOR.email },
  metadata: { description: "HiTechCloud DevKits plugins" },
  plugins: [{ name: "devkits", source: "plugins/devkits", description: entryDescription }],
});
write(".agents/plugins/marketplace.json", {
  name: "devkits",
  interface: { displayName: "HiTechCloud DevKits" },
  plugins: [
    {
      name: "devkits",
      source: { source: "local", path: "./plugins/devkits" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Developer Tools",
    },
  ],
});

// ---------- 5. MCP-only configs and the install guide ----------
const seen = new Set();
for (const p of catalog.platforms) {
  if (p.mcpOnly?.file && !seen.has(p.mcpOnly.file)) {
    seen.add(p.mcpOnly.file);
    write(`integrations/configs/${p.mcpOnly.file}`, `${fill(p.mcpOnly.code)}\n`);
  }
}

const fence = (lang, code) => `\`\`\`${lang === "text" ? "" : lang}\n${fill(code)}\n\`\`\``;
const groups = [
  ["plugin", "Nền tảng có plugin riêng"],
  ["mcp", "Nền tảng cấu hình MCP"],
];
let md = `<!-- Generated by scripts/build-integrations.mjs from integrations/platforms.json. Do not edit by hand. -->
# Cài DevKits vào từng nền tảng AI

MCP endpoint: \`${URL_}\` (Streamable HTTP, header \`Authorization: Bearer <token>\`).

**Bước chung:** tạo token cá nhân ở <https://devkits.hitechcloud.vn> → **Kết nối agent**, mỗi máy/agent một token. Khi nền tảng đọc biến môi trường, đặt:

\`\`\`bash
export ${TOKEN_ENV}="<token của bạn>"
\`\`\`

Không commit token. File cấu hình nào phải dán token trực tiếp thì giữ ngoài git.

| Nền tảng | Gói | Đã đối chiếu tài liệu chính thức |
| --- | --- | --- |
${catalog.platforms.map((p) => `| [${p.name}](#${p.id}) | ${p.package} | ${p.verified ? "Có" : "Chưa đủ"} |`).join("\n")}
`;
for (const [group, title] of groups) {
  md += `\n## ${title}\n`;
  for (const p of catalog.platforms.filter((x) => x.group === group)) {
    md += `\n### ${p.name}\n<a id="${p.id}"></a>\n\nGói: ${p.package}. Tài liệu: <${p.docs}>\n`;
    for (const step of p.install) md += `\n${step.label}:\n\n${fence(step.lang, step.code)}\n`;
    if (p.mcpOnly) md += `\n${p.mcpOnly.label}${p.mcpOnly.file ? ` (mẫu: [\`configs/${p.mcpOnly.file}\`](configs/${p.mcpOnly.file}))` : ""}:\n\n${fence(p.mcpOnly.lang, p.mcpOnly.code)}\n`;
    for (const note of p.notes) md += `\n> ${fill(note)}\n`;
  }
}
md += `\n## Kiểm tra kết nối\n\nTrong agent, liệt kê công cụ MCP: phải thấy server \`devkits\` với các công cụ chỉ đọc và \`devkits_workspace_status\`. Lỗi 401 là thiếu hoặc sai token; 503 là máy chủ chưa bật \`DEVKITS_MCP_TOKENS\`.\n`;
write("integrations/README.md", md);

if (CHECK) {
  if (stale.length) {
    console.error(`Out of date (run node scripts/build-integrations.mjs):\n  ${stale.join("\n  ")}`);
    process.exit(1);
  }
  console.log("Integrations are up to date.");
} else {
  console.log(`Wrote ${written.length} files; ${skillDirs.length} skills copied into ${relative(ROOT, join(ROOT, P, "skills"))}.`);
}
