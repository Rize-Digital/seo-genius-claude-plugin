// Skill-text tests for 1.5.1: the follow-ups carried over from #16, #19 and #17, and two
// findings of the 1.5.0 live smoke. Each test fails on main at 1.5.0 (aa79792).
// Run: node --test tests/check/carry-overs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const skill = (name) => read(`plugins/seo-genius/skills/${name}/SKILL.md`);
const canonical = (name) => read(`scripts/canonical/${name}`);
// One numbered step of the Procedure section, with its sub-bullets, up to the next step.
const step = (md, n) => {
  const proc = md.slice(md.indexOf("\n## Procedure\n"));
  const m = proc.match(new RegExp(`\\n${n}\\. [\\s\\S]*?(?=\\n\\d+\\. |\\n## )`));
  assert.ok(m, `step ${n} not found`);
  return m[0];
};
const section = (md, title) => {
  const m = md.match(new RegExp(`\\n## ${title}\\n([\\s\\S]*?)(?=\\n## |$)`));
  assert.ok(m, `section ${title} not found`);
  return m[1];
};
const has = (s, text, msg) => assert.ok(s.includes(text), msg ?? `missing: ${text}`);

test("#16 report: a merged change is recorded only once the live page shows it, dated by a production deployment or first seen live", () => {
  // A merge changes code, not the page: a site that deploys late, or not at all, had its
  // change recorded (and its measurement window started) on the merge date.
  const s = step(skill("report"), 3);
  has(s, "Before a change not yet recorded can be recorded, a live page check has to show the new value on the page.");
  has(s, "with a query parameter that skips caches (for example `?sg_check=<unix time>`)");
  has(s, "the new value in the raw HTML (the `<title>`, the description `<meta>`, the canonical `<link>`, the JSON-LD)");
  has(s, "The page loaded and does not show it: the change is merged but not live yet. Record nothing. List it under \"Waiting\"");
  has(s, "A deployment counts when its environment is `production` or `Production` and a status says `success`. When one counts, `occurred_on` is the merge date.");
  has(s, "`occurred_on` is the date the change was first seen live");
  has(s, "and never a merged change the live check did not show.");
  assert.ok(!s.includes("`occurred_on` set to the merge date as `YYYY-MM-DD` (UTC)"), "occurred_on is no longer the merge date alone");
  // Main's plan-item link step survives the carry-over.
  has(s, "Link it to its plan item, so the weekly run can close the item once SEO Genius verifies the change live");
  has(step(skill("report"), 5), "open pull requests, and merged changes not live yet.");
  has(step(skill("schedule"), 3), "once its pull request is merged and a live check shows the new value on the page, three at most in a scheduled run.");
});

test("#19 competitors, keywords and quick-wins wait for a yes before a paid call", () => {
  has(step(skill("competitors"), 3), "Wait for a yes. That yes covers all three steps. Without one, stop here and say no quota was spent.");
  has(step(skill("keywords"), 6), "and wait for a yes. Without one, show the candidate list and stop; no quota was spent.");
  has(step(skill("quick-wins"), 6), "and wait for a yes. Without one, give the three fixes, leave out the keywords, and say no quota was spent.");
});

test("#19 unattended budget: a timed-out call counts, and a resend is a new call", () => {
  // A timed-out search may be charged in full; a run that resent it spent past its budget.
  has(canonical("unattended-runs.md"), "A refused, failed, or timed-out live call counts toward `live_calls_per_run` like one that answered, and sending it again is a new call under the same budget.");
});

test("#19/#17 schedule: the budget caps each run, not how often a routine repeats", () => {
  has(step(skill("schedule"), 7), "`live_calls_per_run` caps each run, not how often runs repeat: a routine set to run hourly spends the full budget every hour. Check the interval before turning a routine on.");
});

test("#19/#17 sites: rules 1 and 2 apply to the workspace, not per site", () => {
  const proc = section(skill("sites"), "Procedure");
  has(proc, "standing rules 1 and 2 apply differently here: resolve the workspace without matching one site, and do not call `get_business_context` for each site.");
  // The canonical Standing rules block itself is unchanged (check.mjs pins it).
});

test("#17 competitor-dive: a term with no reading from this run is unavailable, never lost", () => {
  // A term skipped on upstream_unavailable, or left when live calls stopped, had no status:
  // read as "not found" it counted as lost and fed the picking and the gap.
  const md = skill("competitor-dive");
  has(step(md, 4), "Record it with `status: \"unavailable\"` and a `reason`, with no place and no top three. Leave it out of the picking and out of every count, and never call it lost or not found.");
  has(md, "`status` is `lost`, `held`, `no_results`, or `unavailable`");
  has(section(md, "If something is missing"), "skip that term (`unavailable`, step 4)");
});

test("#17 content-plan: a missing briefing alone does not mark every item unchecked", () => {
  const m = section(skill("content-plan"), "If something is missing");
  has(m, "- `get_site_briefing` is not in the tool list: build the plan without its Opportunities, What worked, and page verdicts, say so at the top of the plan, and still check every item with `check_change` in step 8.");
  has(m, "- `check_change` is not in the tool list: build the plan without the history check, mark every item on an existing page \"history not checked\"");
  assert.ok(!m.includes("`get_site_briefing` or `check_change` is not in the tool list"));
});

test("smoke 1.5.0: ledger input is never staged in the system temp folder", () => {
  // Workspace smoke 2026-10-27: an unattended weekly run wrote sg_pull.json, sg_kw.json,
  // sg_changes.json and sg_pull2.json to %TEMP% and redirected them into ledger.mjs.
  const sync = canonical("server-sync.md");
  has(sync, "- Ledger input. A ledger command given `--input -` reads one JSON object on standard input: pipe it from the command that builds it.");
  has(sync, "write that file under `drafts_dir` (for example `<drafts_dir>/input/pull.json`), pass it on standard input from there, and delete it once the command has answered. Never stage it in the system temp folder, the home folder, or anywhere else outside the site folder.");
  for (const name of ["content-plan", "next", "weekly"]) has(section(skill(name), "Server sync"), "Never stage it in the system temp folder", name);
});

test("smoke 1.5.0: every schedule prompt names the site", () => {
  // Workspace smoke 2026-10-27: with no repository the folder is ~/seo-genius/<domain>/, and an
  // unattended prompt that named no site found none and skipped.
  const s = step(skill("schedule"), 6);
  has(s, "Write the site's domain in place of `<domain>` in each one.");
  const prompts = s.match(/```text\n([^\n]*)\n/g) ?? [];
  assert.equal(prompts.length, 4);
  for (const p of prompts) assert.match(p, /```text\n\s*Unattended run\. Site: <domain>\. /);
});

test("#19 CHANGELOG: 1.3.0 carries its release date and the plugin version is 1.5.1 or later", () => {
  const log = read("CHANGELOG.md");
  has(log, "## 1.3.0 (2026-10-14)");
  has(log, "## 1.5.1 (");
  const [major, minor, patch] = JSON.parse(read("plugins/seo-genius/.claude-plugin/plugin.json")).version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && (minor > 5 || (minor === 5 && patch >= 1))), "version below 1.5.1");
});
