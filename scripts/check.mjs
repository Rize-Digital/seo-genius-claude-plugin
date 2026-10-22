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
  "next", "report", "schedule", "sites", "issues", "weekly",
];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const MCP_URL = "https://api.seogenius.ai/api/mcp/v1?client=claude-code-plugin";

// The one expected text of each block that every skill carrying it must hold,
// word for word. Comparing the copies only with each other would pass a required
// instruction missing from all of them alike.
const CANONICAL = join(ROOT, "scripts", "canonical");
function canonical(name) {
  const p = join(CANONICAL, name);
  return existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n").trim() : null;
}

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
  if (block) rulesBlocks.push([name, block[1].trim()]);
  check(/\n## Done when/.test(md), `${name}: has a Done when section`);
  check(/Do not call `search_recommendations`; it returns an empty set today\./.test(md), `${name}: carries the search_recommendations prohibition`);
}
const RULES = canonical("standing-rules.md");
check(!!RULES, "scripts/canonical/standing-rules.md exists");
check(rulesBlocks.length === found.length, "every skill has a Standing rules block");
for (const [name, b] of rulesBlocks) check(b === RULES, `${name}: Standing rules block is the canonical text`);

// 4b. Skills that can run unattended share one Unattended runs block, and each of them has it.
const UNATTENDED_SKILLS = ["competitor-dive", "keyword-gap", "content-plan", "next", "report", "weekly"];
const unattendedBlocks = [];
for (const name of found) {
  const p = join(skillsDir, name, "SKILL.md");
  if (!existsSync(p)) continue;
  const md = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const block = md.match(/\n## Unattended runs\n([\s\S]*?)(?=\n## )/);
  if (block) unattendedBlocks.push([name, block[1].trim()]);
}
check(
  JSON.stringify(unattendedBlocks.map(([n]) => n).sort()) === JSON.stringify([...UNATTENDED_SKILLS].sort()),
  `Unattended runs section is present in exactly ${UNATTENDED_SKILLS.join(", ")}`,
);
const UNATTENDED = canonical("unattended-runs.md");
check(!!UNATTENDED, "scripts/canonical/unattended-runs.md exists");
for (const [name, b] of unattendedBlocks) check(b === UNATTENDED, `${name}: Unattended runs block is the canonical text`);

// 4c. One folder resolver. Every skill that reads or writes .seo-genius/ carries the same
// Files bullet pointing at scripts/ledger.mjs, so no skill falls back to its own rule and two
// sites can never land in one folder.
const FOLDER = canonical("folder-bullet.md");
const SAVE = canonical("save-bullet.md");
check(!!FOLDER && !!SAVE, "scripts/canonical/folder-bullet.md and save-bullet.md exist");
// A line that has the model write or save a file in .seo-genius/ must send it
// through the ledger; only a line that forbids the write is exempt.
const DIRECT_WRITE = /\b(write|writes|save|saves)\b[^.\n]{0,60}`\.seo-genius\/[^`]*`/i;
const ROUTED = /through `save`|through the ledger|ledger\.mjs|\b(do not|never|neither|nor|no)\b/i;
const resolverBullets = [];
for (const name of found) {
  const p = join(skillsDir, name, "SKILL.md");
  if (!existsSync(p)) continue;
  const md = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  if (!md.includes(".seo-genius/")) continue;
  const bullet = md.match(/\n(- `\.seo-genius\/` means the site folder the resolver gives\.[^\n]*)/);
  check(!!bullet, `${name}: uses the shared folder resolver`);
  // The Node.js check comes first in that line, so no skill writes a file or
  // calls a tool before it knows the ledger script can run.
  check(!!bullet && /node-check\.cjs/.test(bullet[1]) && bullet[1].indexOf("node-check.cjs") < bullet[1].indexOf("ledger.mjs"), `${name}: checks Node.js before the first ledger command`);
  check(!/in the current folder when there is no repository/.test(md), `${name}: no current-folder fallback`);
  if (bullet) resolverBullets.push(bullet[1]);
  check(!!bullet && bullet[1] === FOLDER, `${name}: folder bullet is the canonical text (prepare before any write)`);
  const save = md.match(/\n(- Every file this skill keeps in `\.seo-genius\/` is saved through the script[^\n]*)/);
  check(!!save && save[1] === SAVE, `${name}: save bullet is the canonical text`);
  const direct = md.split("\n").filter((line) => DIRECT_WRITE.test(line) && line !== SAVE && !ROUTED.test(line));
  check(direct.length === 0, `${name}: every write into .seo-genius/ goes through save${direct.length ? ` (not: ${direct.map((l) => l.trim().slice(0, 70)).join(" | ")})` : ""}`);
}
check(resolverBullets.length > 0, "the skills that use .seo-genius/ carry the folder bullet");
check(existsSync(join(PLUGIN, "scripts", "ledger.mjs")), "scripts/ledger.mjs exists");
check(existsSync(join(PLUGIN, "scripts", "node-check.cjs")), "scripts/node-check.cjs exists");

// 4d. The skills that write the ledger share one Server sync section, so the pull at the
// start and the push at the end are the same everywhere.
const SYNC_SKILLS = ["content-plan", "next", "weekly"];
const syncBlocks = [];
for (const name of found) {
  const p = join(skillsDir, name, "SKILL.md");
  if (!existsSync(p)) continue;
  const md = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const block = md.match(/\n## Server sync\n([\s\S]*?)(?=\n## )/);
  if (block) syncBlocks.push([name, block[1].trim()]);
}
check(
  JSON.stringify(syncBlocks.map(([n]) => n).sort()) === JSON.stringify(SYNC_SKILLS),
  `Server sync section is present in exactly ${SYNC_SKILLS.join(", ")}`,
);
const SYNC = canonical("server-sync.md");
check(!!SYNC, "scripts/canonical/server-sync.md exists");
for (const [name, b] of syncBlocks) check(b === SYNC, `${name}: Server sync block is the canonical text`);

// 5. Em dashes in any markdown file
for (const p of walkMd(ROOT)) {
  const n = (readFileSync(p, "utf8").match(/\u2014/g) || []).length;
  check(n === 0, `no em dashes in ${rel(p)} (${n})`);
}

// 6. Em dashes in the listing copy inside the JSON manifests
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
