// Docs match the tools: every SEO Genius MCP tool the skills and docs name is on the
// server's tool list, kept in scripts/canonical/mcp-tools.json (the names the server's
// tools/list answers with). The CHANGELOG and the dated smoke records describe the past
// and are not checked.
// Run: node --test tests/check/tool-names.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TOOLS_FILE = join("scripts", "canonical", "mcp-tools.json");

function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), "sg-tools-"));
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(src.slice(ROOT.length)) });
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

function check(repo) {
  const r = spawnSync(process.execPath, [join(repo, "scripts", "check.mjs")], { encoding: "utf8" });
  const lines = r.stdout.split("\n");
  return { code: r.status, fails: lines.filter((l) => l.startsWith("FAIL")), passes: lines.filter((l) => l.startsWith("PASS")) };
}

const read = (repo, rel) => readFileSync(join(repo, rel), "utf8").replace(/\r\n/g, "\n");
const write = (repo, rel, text) => writeFileSync(join(repo, rel), text);

test("tool list: the snapshot is sorted, has no repeats, and holds only tool names", () => {
  const snap = JSON.parse(read(ROOT, TOOLS_FILE));
  assert.ok(Array.isArray(snap.tools) && snap.tools.length > 0, "tools is a non-empty list");
  assert.deepEqual(snap.tools, [...new Set(snap.tools)].sort(), "sorted, no repeats");
  for (const t of snap.tools) assert.match(t, /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
  assert.equal(typeof snap.source, "string");
  assert.match(snap.captured_on, /^\d{4}-\d{2}-\d{2}$/);
  // The tools every skill starts with, and the one the standing rules forbid by name.
  for (const t of ["get_my_tenant", "list_sites", "get_business_context", "search_recommendations"]) assert.ok(snap.tools.includes(t), t);
});

test("tool list: the repository as it is passes, and the check says what it compared", () => {
  const r = check(ROOT);
  assert.deepEqual(r.fails, []);
  assert.ok(
    r.passes.some((l) => /every SEO Genius tool the docs name is on the server's tool list \(\d+ named, \d+ on the list\)/.test(l)),
    r.passes.filter((l) => /tool/.test(l)).join("\n"),
  );
});

test("tool list: a skill that calls a tool the server does not have fails, with the file and line", () => {
  const r = copyRepo();
  try {
    const rel = "plugins/seo-genius/skills/sites/SKILL.md";
    const md = read(r.dir, rel);
    const at = md.indexOf("\n## Output");
    const added = "\n- Then call `get_site_totals` for the totals.";
    write(r.dir, rel, md.slice(0, at) + added + md.slice(at));
    const line = md.slice(0, at).split("\n").length + 1;
    const fails = check(r.dir).fails;
    assert.ok(fails.some((l) => l.includes("get_site_totals") && l.includes(`${rel}:${line}`)), fails.join("\n"));
  } finally {
    r.done();
  }
});

test("tool list: an unknown tool in an acceptance file's tool sequence fails", () => {
  const r = copyRepo();
  try {
    const rel = "tests/skills/sites.md";
    const md = read(r.dir, rel);
    assert.ok(md.includes("get_my_tenant -> list_sites_summary"));
    write(r.dir, rel, md.replace("get_my_tenant -> list_sites_summary", "get_my_tenant -> list_site_summaries"));
    const fails = check(r.dir).fails;
    assert.ok(fails.some((l) => l.includes("list_site_summaries") && l.includes(rel)), fails.join("\n"));
  } finally {
    r.done();
  }
});

test("tool list: a tool the server drops fails everywhere the docs still name it", () => {
  const r = copyRepo();
  try {
    const snap = JSON.parse(read(r.dir, TOOLS_FILE));
    snap.tools = snap.tools.filter((t) => t !== "serp_rank_check");
    write(r.dir, TOOLS_FILE, JSON.stringify(snap, null, 2));
    const fails = check(r.dir).fails.filter((l) => l.includes("serp_rank_check"));
    for (const rel of ["scripts/canonical/standing-rules.md", "plugins/seo-genius/skills/competitors/SKILL.md", "codex/AGENTS.md", "tests/skills/competitors.md"]) {
      assert.ok(fails.some((l) => l.includes(rel)), `${rel}\n${fails.join("\n")}`);
    }
  } finally {
    r.done();
  }
});

test("tool list: a tool named in a list after `call` counts, as in \"never call `a`, `b`, or `c`\"", () => {
  const r = copyRepo();
  try {
    const rel = "plugins/seo-genius/skills/weekly/SKILL.md";
    const md = read(r.dir, rel);
    const before = "Never call `serp_rank_check`, `keyword_research`, `ranked_keywords`, or `competitor_domains` in this skill.";
    assert.ok(md.includes(before));
    write(r.dir, rel, md.replace(before, before.replace("`competitor_domains`", "`competitor_domain`")));
    const fails = check(r.dir).fails;
    assert.ok(fails.some((l) => l.includes("competitor_domain") && !l.includes("competitor_domains")), fails.join("\n"));
  } finally {
    r.done();
  }
});

test("tool list: a field name is not taken for a tool, and the CHANGELOG and smoke records are not checked", () => {
  const r = copyRepo();
  try {
    const rel = "plugins/seo-genius/skills/sites/SKILL.md";
    const md = read(r.dir, rel);
    const at = md.indexOf("\n## Output");
    write(r.dir, rel, `${md.slice(0, at)}\n- Read \`made_up_field\` from the answer, and never call a \`made_up_status\` row missing.${md.slice(at)}`);
    write(r.dir, "CHANGELOG.md", `${read(r.dir, "CHANGELOG.md")}\n- Call \`removed_old_tool\` no more.\n`);
    write(r.dir, "tests/smoke/2026-10-01-pipeline-live-smoke.md", `${read(r.dir, "tests/smoke/2026-10-01-pipeline-live-smoke.md")}\nOne \`removed_old_tool\` call.\n`);
    assert.deepEqual(check(r.dir).fails, []);
  } finally {
    r.done();
  }
});

test("tool list: a name in not_tools is let through, so a field that reads like a tool can be named", () => {
  const r = copyRepo();
  try {
    const rel = "plugins/seo-genius/skills/sites/SKILL.md";
    const md = read(r.dir, rel);
    const at = md.indexOf("\n## Output");
    write(r.dir, rel, `${md.slice(0, at)}\n- Sort by \`list_order\`.${md.slice(at)}`);
    assert.ok(check(r.dir).fails.some((l) => l.includes("list_order")), "a list_ name is read as a tool");
    const snap = JSON.parse(read(r.dir, TOOLS_FILE));
    snap.not_tools = ["list_order"];
    write(r.dir, TOOLS_FILE, JSON.stringify(snap, null, 2));
    assert.deepEqual(check(r.dir).fails, []);
  } finally {
    r.done();
  }
});

test("tool list: a missing or broken snapshot fails the check", () => {
  const r = copyRepo();
  try {
    write(r.dir, TOOLS_FILE, "{ not json");
    assert.ok(check(r.dir).fails.some((l) => l.includes("mcp-tools.json")));
    write(r.dir, TOOLS_FILE, JSON.stringify({ source: "x", captured_on: "2026-11-18", tools: ["list_sites", "get_my_tenant", "list_sites"] }));
    assert.ok(check(r.dir).fails.some((l) => l.includes("mcp-tools.json")));
  } finally {
    r.done();
  }
});
