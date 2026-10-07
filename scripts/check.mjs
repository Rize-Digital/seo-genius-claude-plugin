#!/usr/bin/env node
// Structural checks for the seo-genius plugin repo. Node 18+, no dependencies.
// Exit 0 when every check passes, exit 1 otherwise. Run: node scripts/check.mjs
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(ROOT, "plugins", "seo-genius");
const EXPECTED_SKILLS = [
  "audit", "brief", "page-check", "keywords", "quick-wins", "competitors", "log-change",
  "start", "competitor-dive", "keyword-gap", "content-plan", "history",
];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const MCP_URL = "https://api.seogenius.ai/api/mcp/v1?client=claude-code-plugin";

let failures = 0;
const ok = (msg) => console.log(`PASS  ${msg}`);
const fail = (msg) => { failures += 1; console.log(`FAIL  ${msg}`); };
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

function readJson(path) {
  if (!existsSync(path)) { fail(`${rel(path)} is missing`); return null; }
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { fail(`${rel(path)} does not parse: ${e.message}`); return null; }
}
function rel(p) { return p.slice(ROOT.length + 1).replace(/\\/g, "/"); }

function frontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function walkMd(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkMd(p, acc);
    else if (name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

// 1. Marketplace manifest
const mp = readJson(join(ROOT, ".claude-plugin", "marketplace.json"));
if (mp) {
  check(mp.name === "seo-genius-plugins", "marketplace name is seo-genius-plugins");
  check(!!mp.owner && mp.owner.name === "Rize Digital", "marketplace owner is Rize Digital");
  check(Array.isArray(mp.plugins) && mp.plugins.length === 1, "marketplace lists exactly one plugin");
  const entry = (mp.plugins || [])[0] || {};
  check(entry.name === "seo-genius", "marketplace plugin entry is seo-genius");
  check(entry.source === "./plugins/seo-genius", "marketplace source is ./plugins/seo-genius");
  check(existsSync(PLUGIN), "plugin folder exists at plugins/seo-genius");
}

// 2. Plugin manifest
const pj = readJson(join(PLUGIN, ".claude-plugin", "plugin.json"));
if (pj) {
  check(pj.name === "seo-genius", "plugin name is seo-genius");
  check(KEBAB.test(pj.name || ""), "plugin name is kebab-case");
  check(SEMVER.test(pj.version || ""), `plugin version is explicit semver (${pj.version})`);
  check(typeof pj.description === "string" && pj.description.length > 0, "plugin description is present");
  check(!!pj.author && pj.author.name === "Rize Digital", "plugin author is Rize Digital");
  check(pj.homepage === "https://seogenius.ai", "plugin homepage is https://seogenius.ai");
}

// 3. MCP server declaration
const mcp = readJson(join(PLUGIN, ".mcp.json"));
if (mcp) {
  const s = mcp.mcpServers && mcp.mcpServers["seo-genius"];
  check(!!s, ".mcp.json declares mcpServers.seo-genius");
  if (s) {
    check(s.type === "http", "server type is http");
    check(s.url === MCP_URL, `server url is ${MCP_URL}`);
    check(!("headers" in s), "server declares no headers (OAuth-first)");
  }
}

// 4. Skills
const skillsDir = join(PLUGIN, "skills");
const found = existsSync(skillsDir)
  ? readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory()).sort()
  : [];
check(
  JSON.stringify(found) === JSON.stringify([...EXPECTED_SKILLS].sort()),
  `skills are exactly ${EXPECTED_SKILLS.join(", ")} (found: ${found.join(", ") || "none"})`,
);
const rulesBlocks = [];
for (const name of found) {
  const p = join(skillsDir, name, "SKILL.md");
  if (!existsSync(p)) { fail(`${name}/SKILL.md is missing`); continue; }
  // Normalize line endings: a Windows checkout can hold CRLF and LF skill files side
  // by side, and the byte-identical Standing rules check below must not fail on that.
  const md = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const fm = frontmatter(md);
  check(!!fm, `${name}: frontmatter present`);
  if (!fm) continue;
  check(fm.name === name, `${name}: frontmatter name matches folder`);
  const d = fm.description || "";
  check(d.length > 0 && d.length <= 1024, `${name}: description present and at most 1024 chars (${d.length})`);
  // A ": " inside an unquoted YAML scalar makes the frontmatter unparseable and the
  // installed-plugin loader drops the skill silently (found 2026-09-11 on page-check).
  check(!/: /.test(d) && !/^["']/.test(d), `${name}: description has no colon-space and is not quoted (YAML-safe)`);
  const block = md.match(/\n## Standing rules[^\n]*\n([\s\S]*?)(?=\n## )/);
  check(!!block, `${name}: has a Standing rules section`);
  if (block) rulesBlocks.push(block[1].trim());
  check(/\n## Done when/.test(md), `${name}: has a Done when section`);
  check(/Do not call `search_recommendations`; it returns an empty set today\./.test(md), `${name}: carries the search_recommendations prohibition`);
}
check(
  rulesBlocks.length === found.length && rulesBlocks.every((b) => b === rulesBlocks[0]),
  "Standing rules block is byte-identical across all skills",
);

// 5. Guard source-level contracts for the known live-smoke regressions.
// These are structural guardrails, not a replacement for a live Claude skill run.
const policyContracts = {
  start: [
    "Approval gate: do not save a provisional config",
    "An instruction to run the next skill is not approval",
    "explicitly recorded service-area cities",
  ],
  "competitor-dive": [
    "A queued instruction is not approval to spend quota",
    "with `read: false` and `read_error`",
    "`faq` is `true` only when observed",
    "set each `page_counts` numeric field to `null`",
    "`limit: 25`",
  ],
  "content-plan": [
    "A `null` competitor count means unknown",
    "`limit: 25`",
  ],
};
for (const [skill, markers] of Object.entries(policyContracts)) {
  const md = readFileSync(join(skillsDir, skill, "SKILL.md"), "utf8");
  for (const marker of markers) check(md.includes(marker), `${skill}: regression guard for ${marker}`);
}
const dive = readFileSync(join(skillsDir, "competitor-dive", "SKILL.md"), "utf8");
const example = dive.match(/`competitors\\.json`:[^\n]*\n\s*```json\n([\s\S]*?)\n\s*```/);
if (!example) fail("competitor-dive: competitors.json example exists");
else {
  try {
    const payload = JSON.parse(example[1]);
    const competitorPage = payload.competitors?.[0]?.pages?.[0];
    const sitePage = payload.site_pages?.[0];
    for (const [kind, page] of [["competitor", competitorPage], ["site", sitePage]]) {
      check(page?.read === false && typeof page.read_error === "string", `${kind}: unread example explains failure`);
      check(page?.faq === null && page?.schema === null && page?.title === null, `${kind}: unread fields are unknown, not absent`);
    }
    check(payload.competitors?.[0]?.page_counts?.service === null, "unread competitor page count is null");
  } catch (e) { fail(`competitors.json example does not parse: ${e.message}`); }
}

// 6. Em dashes in any markdown file
for (const p of walkMd(ROOT)) {
  const n = (readFileSync(p, "utf8").match(/\u2014/g) || []).length;
  check(n === 0, `no em dashes in ${rel(p)} (${n})`);
}

// 7. Em dashes in the listing copy inside the JSON manifests
const listingCopy = [];
if (pj && typeof pj.description === "string") listingCopy.push(["plugin.json description", pj.description]);
if (mp && typeof mp.description === "string") listingCopy.push(["marketplace.json description", mp.description]);
for (const entry of (mp && Array.isArray(mp.plugins)) ? mp.plugins : []) {
  if (typeof entry.description === "string") listingCopy.push([`marketplace.json entry ${entry.name} description`, entry.description]);
}
for (const [label, text] of listingCopy) {
  const n = (text.match(/\u2014/g) || []).length;
  check(n === 0, `no em dashes in ${label} (${n})`);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
