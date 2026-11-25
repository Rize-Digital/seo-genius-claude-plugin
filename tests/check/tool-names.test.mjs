// Docs match the tools, deny by default: every snake_case identifier in the scanned docs,
// backticked or not, is either an SEO Genius MCP tool on the server's tool list
// (scripts/canonical/mcp-tools.json, the names the server's tools/list answers with) or on
// the reviewed list of known non-tool identifiers (scripts/canonical/non-tool-identifiers.json:
// field names, file names, config keys). Anything else fails with its file:line. The
// CHANGELOG and the dated smoke records describe the past and are not checked.
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
const NON_TOOLS_FILE = join("scripts", "canonical", "non-tool-identifiers.json");
const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

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

/** Adds `lines` to the sites skill just before its Output section; returns the first added line's number. */
function addToSkill(repo, lines) {
  const rel = "plugins/seo-genius/skills/sites/SKILL.md";
  const md = read(repo, rel);
  const at = md.indexOf("\n## Output");
  write(repo, rel, `${md.slice(0, at)}\n${lines.join("\n")}${md.slice(at)}`);
  return { rel, line: md.slice(0, at).split("\n").length + 1 };
}
const failFor = (fails, name) => fails.filter((l) => l.startsWith(`FAIL  \`${name}\` `));

test("tool list: the snapshot is sorted, has no repeats, and holds only tool names", () => {
  const snap = JSON.parse(read(ROOT, TOOLS_FILE));
  assert.ok(Array.isArray(snap.tools) && snap.tools.length > 0, "tools is a non-empty list");
  assert.deepEqual(snap.tools, [...new Set(snap.tools)].sort(), "sorted, no repeats");
  for (const t of snap.tools) assert.match(t, /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
  assert.equal(typeof snap.source, "string");
  assert.match(snap.captured_on, /^\d{4}-\d{2}-\d{2}$/);
  for (const t of ["get_my_tenant", "list_sites", "get_business_context", "search_recommendations"]) assert.ok(snap.tools.includes(t), t);
});

test("non-tool list: sorted, no repeats, snake_case only, and no tool on it", () => {
  const list = JSON.parse(read(ROOT, NON_TOOLS_FILE));
  assert.equal(typeof list.note, "string");
  assert.ok(Array.isArray(list.identifiers) && list.identifiers.length > 0);
  assert.deepEqual(list.identifiers, [...new Set(list.identifiers)].sort());
  for (const n of list.identifiers) assert.match(n, SNAKE);
  const tools = new Set(JSON.parse(read(ROOT, TOOLS_FILE)).tools);
  assert.deepEqual(list.identifiers.filter((n) => tools.has(n)), []);
});

test("tool list: the repository as it is passes, and the check says what it compared", () => {
  const r = check(ROOT);
  assert.deepEqual(r.fails, []);
  assert.ok(
    r.passes.some((l) => /every snake_case identifier in the docs is a server tool or a listed non-tool identifier \(\d+ tools named, \d+ non-tool identifiers\)/.test(l)),
    r.passes.filter((l) => /tool/.test(l)).join("\n"),
  );
});

test("tool list: a skill that calls a tool the server does not have fails, with the file and line", () => {
  const r = copyRepo();
  try {
    const { rel, line } = addToSkill(r.dir, ["- Then call `get_site_totals` for the totals."]);
    const fails = failFor(check(r.dir).fails, "get_site_totals");
    assert.ok(fails.some((l) => l.includes(`${rel}:${line}`)), fails.join("\n"));
  } finally {
    r.done();
  }
});

test("tool list: an unbackticked unknown tool fails, with the file and line", () => {
  const r = copyRepo();
  try {
    const { rel, line } = addToSkill(r.dir, ["- Then call keyword_gap_v2 for the gap."]);
    const fails = failFor(check(r.dir).fails, "keyword_gap_v2");
    assert.ok(fails.some((l) => l.includes(`${rel}:${line}`)), fails.join("\n"));
  } finally {
    r.done();
  }
});

test("tool list: the \"Use <name>\" form fails, backticked or not", () => {
  const r = copyRepo();
  try {
    const { rel, line } = addToSkill(r.dir, ["- Use `ranked_keywords_v2` for the list.", "- Use ranked_keywords_v2 for the list."]);
    const fails = failFor(check(r.dir).fails, "ranked_keywords_v2");
    assert.ok(fails.some((l) => l.includes(`${rel}:${line}`) && l.includes(`${rel}:${line + 1}`)), fails.join("\n"));
  } finally {
    r.done();
  }
});

test("tool list: a backticked unknown name in plain prose fails", () => {
  const r = copyRepo();
  try {
    const { rel, line } = addToSkill(r.dir, ["- The answer also carries `made_up_field` for each site."]);
    const fails = failFor(check(r.dir).fails, "made_up_field");
    assert.ok(fails.some((l) => l.includes(`${rel}:${line}`)), fails.join("\n"));
  } finally {
    r.done();
  }
});

test("tool list: a tool name behind the MCP prefix, or capitalised at the start of a sentence, is checked too", () => {
  const r = copyRepo();
  try {
    const { rel, line } = addToSkill(r.dir, ["- Allow mcp__plugin_seo-genius_seo-genius__serp_rank_check_v2 in the settings.", "- Citation_check_v2 runs next."]);
    const fails = check(r.dir).fails;
    assert.ok(failFor(fails, "serp_rank_check_v2").some((l) => l.includes(`${rel}:${line}`)), fails.join("\n"));
    assert.ok(failFor(fails, "citation_check_v2").some((l) => l.includes(`${rel}:${line + 1}`)), fails.join("\n"));
  } finally {
    r.done();
  }
});

test("tool list: known tools and known field names pass, backticked or not", () => {
  const r = copyRepo();
  try {
    addToSkill(r.dir, ["- Read `can_write`, drafts_dir and `site_pack_place` from the answer, then call list_sites and `get_my_tenant`."]);
    assert.deepEqual(check(r.dir).fails, []);
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
    const fails = failFor(check(r.dir).fails, "list_site_summaries");
    assert.ok(fails.some((l) => l.includes(rel)), fails.join("\n"));
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
    const fails = failFor(check(r.dir).fails, "serp_rank_check");
    for (const rel of ["scripts/canonical/standing-rules.md", "plugins/seo-genius/skills/competitors/SKILL.md", "codex/AGENTS.md", "tests/skills/competitors.md"]) {
      assert.ok(fails.some((l) => l.includes(rel)), `${rel}\n${fails.join("\n")}`);
    }
  } finally {
    r.done();
  }
});

test("tool list: a misspelt tool in a list fails, as in \"never call `a`, `b`, or `c`\"", () => {
  const r = copyRepo();
  try {
    const rel = "plugins/seo-genius/skills/weekly/SKILL.md";
    const md = read(r.dir, rel);
    const before = "Never call `serp_rank_check`, `keyword_research`, `ranked_keywords`, or `competitor_domains` in this skill.";
    assert.ok(md.includes(before));
    write(r.dir, rel, md.replace(before, before.replace("`competitor_domains`", "`competitor_domain`")));
    assert.ok(failFor(check(r.dir).fails, "competitor_domain").length === 1);
  } finally {
    r.done();
  }
});

test("tool list: the CHANGELOG and the dated smoke records are not checked", () => {
  const r = copyRepo();
  try {
    write(r.dir, "CHANGELOG.md", `${read(r.dir, "CHANGELOG.md")}\n- Call \`removed_old_tool\` and removed_other_tool no more.\n`);
    write(r.dir, "tests/smoke/2026-10-01-pipeline-live-smoke.md", `${read(r.dir, "tests/smoke/2026-10-01-pipeline-live-smoke.md")}\nOne \`removed_old_tool\` call.\n`);
    assert.deepEqual(check(r.dir).fails, []);
  } finally {
    r.done();
  }
});

test("non-tool list: a name added there is let through", () => {
  const r = copyRepo();
  try {
    addToSkill(r.dir, ["- Sort by `list_order`."]);
    assert.ok(failFor(check(r.dir).fails, "list_order").length === 1, "unknown until listed");
    const list = JSON.parse(read(r.dir, NON_TOOLS_FILE));
    list.identifiers = [...list.identifiers, "list_order"].sort();
    write(r.dir, NON_TOOLS_FILE, JSON.stringify(list, null, 2));
    assert.deepEqual(check(r.dir).fails, []);
  } finally {
    r.done();
  }
});

test("non-tool list: a tool name on it fails, so a tool cannot be silenced there", () => {
  const r = copyRepo();
  try {
    const list = JSON.parse(read(r.dir, NON_TOOLS_FILE));
    list.identifiers = [...list.identifiers, "keyword_research"].sort();
    write(r.dir, NON_TOOLS_FILE, JSON.stringify(list, null, 2));
    assert.ok(check(r.dir).fails.some((l) => l.includes("keyword_research") && l.includes("non-tool-identifiers.json")));
  } finally {
    r.done();
  }
});

test("tool list: a missing or broken snapshot or non-tool list fails the check", () => {
  const r = copyRepo();
  try {
    write(r.dir, TOOLS_FILE, "{ not json");
    assert.ok(check(r.dir).fails.some((l) => l.includes("mcp-tools.json")));
    write(r.dir, TOOLS_FILE, JSON.stringify({ source: "x", captured_on: "2026-11-18", tools: ["list_sites", "get_my_tenant", "list_sites"] }));
    assert.ok(check(r.dir).fails.some((l) => l.includes("mcp-tools.json")));
  } finally {
    r.done();
  }
  const r2 = copyRepo();
  try {
    write(r2.dir, NON_TOOLS_FILE, "{ not json");
    assert.ok(check(r2.dir).fails.some((l) => l.includes("non-tool-identifiers.json")));
    write(r2.dir, NON_TOOLS_FILE, JSON.stringify({ note: "x", identifiers: ["zz_b", "aa_a"] }));
    assert.ok(check(r2.dir).fails.some((l) => l.includes("non-tool-identifiers.json")));
  } finally {
    r2.done();
  }
});
