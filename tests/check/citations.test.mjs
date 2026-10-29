// Tests for the citations skill against the live citation_check tool (workflows #358,
// deployed 2026-10-29). Each fails on main at 2ee61ac (no citations skill) and on this
// PR's earlier head 10fe345 (the review points still open there); the cost, site-state,
// settlement and Node tests also fail on a1604df.
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
  has(missing, "409 with `site_paused`");
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

test("an attended run shows the cost for the engine that runs, and waits for a yes", () => {
  // Codex on a1604df: units follow the engine (Firecrawl is live; 25 a search is the
  // Data-for-SEO fallback only), and max_queries does not lower the reservation.
  const proc = section(skill(), "Procedure");
  const five = proc.slice(proc.indexOf("\n5. "), proc.indexOf("\n6. "));
  for (const text of [
    "up to 80 paid web searches",
    "37 for each other name",
    "Firecrawl, its usual engine: it reserves 268 SEO Genius quota units, plus 130 for each other name and 4 for each old address, and keeps 1 unit plus 1 for each Firecrawl search credit the run used.",
    "Data-for-SEO, its fallback when Firecrawl is not set up: it reserves 2,000 units, plus 925 for each other name and 25 for each old address, and keeps 1 unit plus 25 for each search that ran.",
    "the account needs that much room before it starts",
    "checks fewer directories but reserves the same: it only gets a bigger refund afterwards",
    "No yes, no call.",
  ]) has(five, text);
  assert.ok(!/It reserves up to 25 SEO Genius quota units a search, 2,000 for the 80/.test(five), "25 a search stated for every engine");
  const missing = section(skill(), "If something is missing");
  assert.ok(!/a smaller `max_queries` needs fewer/.test(missing), "says a smaller run needs less room");
  has(missing, "A smaller `max_queries` does not need less room; the reservation is the same.");
  const readme = read("plugins/seo-genius/README.md");
  has(readme, "268 units on the server's usual engine, 2,000 on its fallback");
  assert.ok(!/up to 80 paid searches and 2,000 SEO Genius quota units/.test(readme), "README row still says 2,000 flat");
  const log = read("CHANGELOG.md");
  has(log, "on Firecrawl, its usual engine, 268 units reserved");
  assert.ok(!/up to 2,000 quota units reserved for the 80, of which the server keeps 1 unit plus 25 per search that ran/.test(log), "CHANGELOG still says 25 a search for every engine");
});

test("each site state is handled the way the server answers it", () => {
  // Paused is a 409 before any charge; archived and unverified are RETURNED payloads
  // whose `error` field names them (tool-define.ts, site-archived.ts), never 409s.
  const missing = section(skill(), "If something is missing");
  has(missing, "- 409 with `site_paused`: the site is paused");
  has(missing, "- A reply (not an error) whose `error` is `site_archived`: the site is archived.");
  has(missing, "restoring the site in the SEO Genius dashboard brings it back; then stop");
  has(missing, "- A reply (not an error) whose `error` is `site_unverified`");
  assert.ok(!/409 with `site_paused`, `site_archived` or `site_unverified`/.test(missing), "archived and unverified still read as 409s");
});

test("each outcome keeps what the server really keeps", () => {
  // 0 for refusals before metering (free plan, paused, archived, unverified, monthly
  // quota); 1 for the run lock, the spend ceiling, and any error inside the run.
  const md = skill();
  const proc = section(md, "Procedure");
  has(proc, "What each outcome keeps: nothing when the server refuses before the check starts (a plan without citation checks, a paused, archived or unverified site, or no room in the monthly quota); 1 unit when another check is already running for the business, when today's provider spend limit is reached, or when anything fails during the run");
  assert.ok(!/A run the server refuses or that fails keeps 1 unit/.test(md), "every refusal said to keep 1 unit");
  const missing = section(md, "If something is missing");
  has(missing, "- 503 with \"spend ceiling\": today's provider spend limit is reached. Nothing was searched and this call kept 1 unit.");
  assert.ok(!/spend limit is reached. Try again tomorrow; nothing was spent./.test(missing), "spend ceiling said to cost nothing");
  has(missing, "Say so, say this call kept 1 unit");
  has(missing, "Nothing was checked and nothing was charged.");
});

test("the README's Node prerequisite lists citations", () => {
  // citations keeps its report through the ledger script, so it needs Node like the rest.
  const readme = read("plugins/seo-genius/README.md");
  const line = readme.split("\n").find((l) => l.startsWith("- Node.js 18 or later, for every command that keeps files"));
  assert.ok(line, "no Node prerequisite line");
  has(line, "`schedule`, `citations`)");
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
