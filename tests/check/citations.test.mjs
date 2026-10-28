// Tests for the citations skill against the live citation_check tool (workflows #358,
// deployed 2026-10-29). Each fails on main at 2ee61ac (no citations skill) and on this
// PR's earlier head 10fe345 (the review points still open there).
// Run: node --test tests/check/citations.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel) => readFileSync(`${root}${rel}`, "utf8").replace(/\r\n/g, "\n");
const skill = () => read("plugins/seo-genius/skills/citations/SKILL.md");
const has = (s, text, msg) => assert.ok(s.includes(text), msg ?? `missing: ${text}`);
const section = (md, heading) => {
  const start = md.indexOf(`\n## ${heading}\n`);
  assert.ok(start >= 0, `no section ${heading}`);
  const end = md.indexOf("\n## ", start + 4);
  return md.slice(start, end < 0 ? undefined : end);
};
const procedureStep = (md, n) => {
  const proc = section(md, "Procedure");
  const m = proc.match(new RegExp(`\\n${n}\\. ([^\\n]*)`));
  assert.ok(m, `no procedure step ${n}`);
  return m[1];
};

test("the skill does not say listing services submit to the directories", () => {
  // Review point 1: the check reads search results; the directories are the Yext and
  // BrightLocal networks, nothing is submitted.
  const md = skill();
  const readme = read("plugins/seo-genius/README.md");
  for (const [name, text] of [["SKILL.md", md], ["README row", readme]]) {
    assert.ok(!/submit to/i.test(text), `${name} says "submit to"`);
  }
  has(md.match(/^---\n[\s\S]*?\n---/)[0], "Yext and BrightLocal networks");
  has(readme, "the US business directories in the Yext and BrightLocal networks");
});

test("not seen in search names only the directories that matter to every business", () => {
  // Review point 2: home_services rows serve one trade or another; listing them all by
  // name for any business tells a fencer to check a plumbers' directory.
  const out = section(skill(), "Output");
  const notSeen = out.split("\n").find((l) => l.startsWith("- Not seen in search (`not_seen`)"));
  assert.ok(notSeen, "no not_seen bullet");
  has(notSeen, "the `major` and `aggregator` rows by name");
  assert.ok(!/`major`, `home_services` and `aggregator` rows by name/.test(notSeen), "home_services still listed by name");
  has(notSeen, "Count the rest by tier");
  has(notSeen, "never list those by name");
});

test("not checked is named, explained, and never covered by a longer run it cannot get", () => {
  // Review point 3, and the live server: a provider failure is not fixed by a re-run,
  // and the tool caps a run at 45 s, so "more time" is never the advice.
  const md = skill();
  assert.ok(!/a run with a higher `max_queries` or more time covers them/.test(md), "old advice still there");
  const out = section(md, "Output");
  const nc = out.split("\n").find((l) => l.startsWith("- Not checked this run (`not_checked`)"));
  assert.ok(nc, "no not_checked bullet");
  has(nc, "name every such directory");
  has(nc, "running again straight away will not help");
  has(nc, "never suggest a longer `max_seconds`");
  has(nc, "When `search_engine` is `dataforseo`");
});

test("a partial result is said to be partial and never counted as missing", () => {
  // Without a Firecrawl key the server checks part of the list in the 45 s a run has.
  const out = section(skill(), "Output");
  has(out, "Not checked this run: C.");
  has(out, "X is Y minus C");
  has(out, "they are not missing listings. Never fold them into \"not seen\"");
  const table = section(skill(), "Status wording");
  has(table, "| `not_checked` | Not checked this run; check by hand |");
});

test("the error table matches what the live tool answers", () => {
  // Review point 4: 429 can be the monthly quota, 409 can be the site's state; and the
  // live tool's free-plan refusal and run lock.
  const missing = section(skill(), "If something is missing");
  has(missing, "403 with \"is not available on the\"");
  has(missing, "citation_check is not available on the free plan");
  has(missing, "Do not retry.");
  has(missing, "409 \"a check is already running for this business\"");
  has(missing, "never retry on your own");
  has(missing, "`site_paused`, `site_archived` or `site_unverified`");
  has(missing, "429 `quota_exceeded`");
  has(missing, "`call_weight`");
  has(missing, "429 \"Rate limit ... req/min exceeded\"");
  has(missing, "`retry_after_seconds`");
  assert.ok(!/^- Rate limited \(429\): stop, say so, suggest retrying in a minute\.$/m.test(missing), "429 still read as one case");
});

test("the tool is checked before any question or spend", () => {
  // Review point 5: checking only under "If something is missing" asked the NAP questions
  // and the spend first on a server without the tool.
  const md = skill();
  const two = procedureStep(md, 2);
  has(two, "before any question or spend");
  has(two, "if `citation_check` is not in it");
  const proc = section(md, "Procedure");
  assert.ok(proc.indexOf("`citation_check` is not in it") < proc.indexOf("Show these three lines to the user"), "tool check after the NAP question");
  assert.ok(proc.indexOf("`citation_check` is not in it") < proc.indexOf("wait for a yes"), "tool check after the spend prompt");
});

test("max_seconds is never passed above 45", () => {
  // The live tool defaults to 45 so a run answers inside Claude Code's 60 s client timeout.
  const md = skill();
  const six = procedureStep(md, 6);
  has(six, "Do not pass `max_seconds`");
  has(six, "never above 45");
  assert.ok(!/two minutes/.test(md), "still promises a two-minute run");
  has(section(md, "Done when"), "`max_seconds` was not passed, or not above 45.");
});

test("an attended run shows the cost and waits for a yes", () => {
  const five = procedureStep(skill(), 5);
  for (const text of ["up to 80 paid web searches", "37 for each other name", "2,000 for the 80", "keeps 1 unit plus 25 for each search that actually ran", "No yes, no call."]) has(five, text);
});

test("an unattended run calls the check only when the config allows it, within the budget", () => {
  const md = skill();
  const block = section(md, "Unattended citation checks");
  has(block, "`citation_check` runs only when the block says `\"citation_check\": true`");
  has(block, "Each search the check may run counts as one live call");
  has(block, "the smaller of 80 and what is left of `live_calls_per_run`");
  has(block, "make no call when fewer than 2 are left");
  has(block, "Never call `save_research` in an unattended run");
  // The shared block itself stays the canonical text (scripts/check.mjs).
  assert.equal(section(md, "Unattended runs").replace(/^\n## Unattended runs\n/, "").trim(), read("scripts/canonical/unattended-runs.md").trim());
});

test("the report is saved through the ledger, and to the server only on a yes", () => {
  const md = skill();
  const files = section(md, "Files");
  has(files, "Saves `.seo-genius/research/citations-<date>.md`");
  has(files, "through `save`, in one save");
  has(procedureStep(md, 8), "`save` them together");
  const nine = procedureStep(md, 9);
  has(nine, "Only on a yes, call `save_research`");
  has(nine, "`kind: \"citation_audit\"`");
  // 10fe345 saved to the server whenever can_write was true, with no question.
  assert.ok(!/When `can_write` is true, save the report with `save_research`/.test(md), "server save without a yes");
});

test("the skill counts and lists elsewhere include citations", () => {
  has(read("README.md"), "nineteen skills");
  has(read("plugins/seo-genius/README.md"), "The thirteen skills added since 1.0.0");
  has(read("codex/AGENTS.md"), "`keyword_gap`, and `citation_check` spend the account's search-data quota");
  has(read("codex/README.md"), "`schedule`, `citations`) have not had a real Codex run yet");
  has(read("scripts/check.mjs"), `"weekly", "citations",`);
  has(read("scripts/check.mjs"), `"report", "weekly", "citations"];`);
});
