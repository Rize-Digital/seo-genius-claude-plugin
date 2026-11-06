// Skill-text tests for three things a week-over-week run depends on: every run carries one id,
// `weekly` reads Search Console through the free tool, and `next` stops on an empty plan.
// The server side: run_id in seo-genius-workflows src/app/api/mcp/v1/tool-define.ts, gsc_query
// in the same tools folder. Run: node --test tests/check/run-id-and-flags.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const skill = (name) => read(`plugins/seo-genius/skills/${name}/SKILL.md`);
const step = (md, n) => {
  const proc = md.slice(md.indexOf("\n## Procedure\n"));
  const m = proc.match(new RegExp(`\\n${n}\\. [\\s\\S]*?(?=\\n\\d+\\. |\\n## )`));
  assert.ok(m, `step ${n} not found`);
  return m[0];
};

test("rule 11: one new id for each skill run, on every call that offers the field, and never reused", () => {
  const rules = read("scripts/canonical/standing-rules.md");
  assert.match(rules, /\n11\. One id for each run\. /);
  assert.match(rules, /send it as `run_id` on every SEO Genius tool call that offers the field/);
  assert.match(rules, /Each skill in a chained run makes its own/);
  assert.match(rules, /`save_plan_items` gets its `payload` exactly as given and no other `run_id`/);
});

test("the two commands that record a run carry the run's id, so the ledger joins the server's rows", () => {
  assert.match(skill("weekly"), /"run_id": "<this run's id, rule 11>"/);
  assert.doesNotMatch(skill("weekly"), /a new id for this run/);
  assert.match(step(skill("content-plan"), 10), /- `run_id`: this run's id \(rule 11\)\./);
});

test("weekly reads Search Console through gsc_query: exact tracked terms, every page, free, and all or nothing", () => {
  const three = step(skill("weekly"), 3);
  assert.match(three, /`gsc_query` with `dimensions: \["query", "page"\]`/);
  assert.match(three, /`operator: "includingRegex"`/);
  assert.match(three, /`\^\(term one\|term two\)\$`/);
  assert.match(three, /`limit: 250`, following `next_cursor`/);
  assert.match(three, /4,000 characters/);
  assert.match(three, /not a Data-for-SEO call/);
  assert.match(three, /When any call is refused or fails, or `gsc_query` is not in the tool list, leave `search_console` out/);
  // Still no paid search in this skill.
  assert.match(three, /Never call `serp_rank_check`, `keyword_research`, `ranked_keywords`, or `competitor_domains` in this skill\./);
});

test("weekly passes the window and the rows, and the script makes the comparison", () => {
  const md = skill("weekly");
  const five = step(md, 5);
  assert.match(five, /"search_console": \{ "start_date": "", "end_date": "", "rows": \[\{ "query": "", "page": "", "impressions": 0, "position": 0 \}\] \}/);
  assert.match(five, /compares each ranking with Search Console/);
  const seven = step(md, 7);
  assert.match(seven, /`page_flags`/);
  assert.match(seven, /a question to check, not proof that the wrong page ranks/);
  assert.match(seven, /Search Console, <start_date> to <end_date>/);
  assert.match(md, /- Search Console could not be read: say which call failed or that the tool is missing/);
  assert.match(md, /\n- The tracker was compared with Search Console, or the reply says it was not\./);
});

test("next stops when the plan has no items, not only when plan.md is missing", () => {
  // `pull` always writes plan.md, so "no plan" never fired after it, and a site with no plan
  // read as one whose every item was done.
  const two = step(skill("next"), 2);
  assert.match(two, /scripts\/ledger\.mjs" show --site <domain>/);
  assert.match(two, /No `plan\.md`, or `show` lists no items: stop and say to run `\/seo-genius:content-plan`\./);
});
