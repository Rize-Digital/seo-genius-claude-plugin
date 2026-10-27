// Tests for the Codex pack: what codex/README.md promises a Codex user. Each fails on main at
// 1.5.2 (f935656), which has no Codex pack.
// Run: node --test tests/check/codex-pack.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel) => readFileSync(`${root}${rel}`, "utf8").replace(/\r\n/g, "\n");
const json = (rel) => JSON.parse(read(rel));
const has = (s, text, msg) => assert.ok(s.includes(text), msg ?? `missing: ${text}`);
const CODEX_URL = "https://api.seogenius.ai/api/mcp/v1?client=codex-plugin";
const skills = readdirSync(`${root}plugins/seo-genius/skills`).filter((n) => existsSync(`${root}plugins/seo-genius/skills/${n}/SKILL.md`));

test("the Codex manifest installs the same skills, at the plugin's version", () => {
  // Codex caches an installed plugin in a folder named by this version, so a stale one
  // (the branch carried 1.2.1 while the plugin was 1.5.2) hides every later release.
  const pj = json("plugins/seo-genius/.claude-plugin/plugin.json");
  const cpj = json("plugins/seo-genius/.codex-plugin/plugin.json");
  assert.equal(cpj.name, pj.name);
  assert.equal(cpj.version, pj.version);
  assert.equal(cpj.description, pj.description);
  assert.equal(cpj.skills, "./skills/");
  assert.equal(cpj.mcpServers, "./.codex-plugin/mcp.json");
});

test("Codex has its own MCP entry, OAuth only, and the MCP-only config is the same server", () => {
  const server = json("plugins/seo-genius/.codex-plugin/mcp.json").mcpServers["seo-genius"];
  assert.equal(server.url, CODEX_URL);
  assert.ok(!("headers" in server), "no headers: the login is OAuth");
  const lines = read("codex/config.toml").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  assert.deepEqual(lines, ["[mcp_servers.seo-genius]", `url = "${CODEX_URL}"`]);
});

test("the AGENTS.md block maps the Claude Code names the skills use, the plugin folder included", () => {
  // The ledger skills run node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs"; a Codex shell that
  // does not set the variable would run /scripts/ledger.mjs.
  const agents = read("codex/AGENTS.md");
  assert.equal(agents.split("<!-- seo-genius:begin -->").length - 1, 1);
  assert.equal(agents.split("<!-- seo-genius:end -->").length - 1, 1);
  for (const tool of ["get_site_briefing", "check_change", "log_page_change"]) has(agents, `\`${tool}\``);
  has(agents, "`/seo-genius:<skill>` means the `$seo-genius:<skill>` skill");
  has(agents, "`/mcp` means `codex mcp login seo-genius`.");
  has(agents, "`${CLAUDE_PLUGIN_ROOT}` means the plugin's installed folder, the one that holds `skills/`, `scripts/`, and `.codex-plugin/`: two levels above the `SKILL.md` being followed.");
  const usesRoot = skills.filter((n) => read(`plugins/seo-genius/skills/${n}/SKILL.md`).includes("${CLAUDE_PLUGIN_ROOT}/scripts/"));
  assert.ok(usesRoot.length > 0, "some skill runs a plugin script");
  assert.ok(existsSync(`${root}plugins/seo-genius/scripts/ledger.mjs`), "the script the mapping points at is in the plugin folder");
});

test("the guide's approvals list names every write tool the skills call", () => {
  // codex exec refuses every call that asks; save_plan_items was missing from the list, so the
  // scheduled pipeline looked runnable there.
  const guide = read("codex/README.md");
  const approvals = guide.slice(guide.indexOf("## Approvals and unattended runs"));
  const writes = ["log_page_change", "mark_issue_fixed", "create_issue", "update_issue", "reject_issue", "trigger_crawl", "save_plan_items"];
  for (const tool of writes) {
    assert.ok(skills.some((n) => read(`plugins/seo-genius/skills/${n}/SKILL.md`).includes(tool)), `${tool} is called by a skill`);
    has(approvals, `\`${tool}\``, `approvals list lacks ${tool}`);
  }
  has(approvals, "so under `codex exec` it cannot finish");
});

test("the guide names only skills that exist and no stale skill count", () => {
  const guide = read("codex/README.md");
  assert.ok(!/\btwelve skills\b/.test(guide), "stale count");
  for (const [, name] of guide.matchAll(/\$seo-genius:([a-z-]+)/g)) if (name !== "skill") assert.ok(skills.includes(name), `no skill ${name}`);
  has(guide, "Node.js 18 or later for the pipeline skills");
});
