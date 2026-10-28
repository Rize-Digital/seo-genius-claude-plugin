// Skill-text tests for 1.5.2: the approvals and evidence rules from #11, found in the
// 2026-10-01 live smoke (tests/smoke/2026-10-01-pipeline-live-smoke.md, findings 5, 7, 8 and
// the list_pages size). Each test fails on main at 1.5.1 (1da0025).
// Run: node --test tests/check/evidence-approval.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const skill = (name) => readFileSync(`${root}plugins/seo-genius/skills/${name}/SKILL.md`, "utf8").replace(/\r\n/g, "\n");
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

test("start: terms spread across the recorded service area, never an invented one", () => {
  // Smoke finding 8: ten terms on a small primary town while the stored positions were in
  // the larger cities the business serves.
  const s = step(skill("start"), 4);
  has(s, "Use only the primary city and the other cities served that the business profile records or the user names; never invent a service area.");
  has(s, "The primary city is not an automatic majority");
  assert.ok(!s.includes("Each is a service plus the primary city"));
});

test("start: the config is saved only on a yes to the exact list; a queued skill is not that yes", () => {
  // Smoke: start saved config.json with the proposed terms before an explicit yes, because
  // the request also asked to run competitor-dive.
  const s = step(skill("start"), 6);
  has(s, "Save the config only after the user accepts the exact list shown");
  has(s, "A request to run another skill afterwards (\"then run competitor-dive\") is not approval of the terms. Without approval, save nothing, not even a provisional config");
  has(s, "ask once for both the terms and the most the research can spend, one live search per term plus one more call (name the number). One explicit yes covers both, for that same list and that budget, in this session. When the list or the budget changes, ask again.");
});

test("competitor-dive: start's yes covers the spend only for the same list and budget", () => {
  const s = step(skill("competitor-dive"), 3);
  has(s, "A queued instruction (a request to run this skill after another) is not a yes. When `/seo-genius:start` got an explicit yes in this session to this exact term list and a budget at least this large, that yes covers this step; otherwise ask here.");
});

test("competitor-dive: an unread page is null with its read_error; redirects are followed once on the same host only", () => {
  // Smoke findings 5 and 7: a meta-refresh stub, and `faq: false` on an unread page read as "no FAQ".
  const md = skill("competitor-dive");
  const s = step(md, 6);
  has(s, "`read: false`, `read_error` set to what was seen");
  has(s, "A redirect or an HTML meta refresh to the same host is followed once: record the destination in `final_url` and read that page. One to another host is not followed: the page is not read, and `read_error` names the redirect.");
  has(md, "A page with `read: false` keeps its `url`, `term`, and `read_error`, and every other field is `null`: never an empty string, an empty list, or `false`");
  has(md, "`faq` is `true` when a FAQ was seen, `false` only when a page that was read has none, and `null` when unknown.");
  has(step(md, 9), "an element counts as missing only when a page that was read shows it missing");
});

test("competitor-dive: unreadable page counts are null and partial, never 0", () => {
  const md = skill("competitor-dive");
  has(step(md, 7), "When neither the sitemap nor the home page can be read, each count in `page_counts` is `null` with `partial: true`, never 0.");
  has(md, "A count in `page_counts` or `site_page_counts` is `null` when unknown, never 0.");
});

test("competitor-dive: the competitors.json example parses and shows an unread page as nulls", () => {
  const md = skill("competitor-dive");
  const m = md.match(/`competitors\.json`:\n\n\s*```json\n([\s\S]*?)\n\s*```/);
  assert.ok(m, "competitors.json example not found");
  const json = JSON.parse(m[1]);
  const pages = json.competitors[0].pages;
  const unread = pages.find((p) => p.read === false);
  assert.ok(unread, "no unread page in the example");
  assert.equal(typeof unread.read_error, "string");
  for (const k of ["title", "h1", "outline", "words", "schema", "faq", "proof", "cta"]) assert.equal(unread[k], null, k);
  for (const p of [...pages, ...json.site_pages]) assert.ok("final_url" in p && "read_error" in p, "final_url and read_error on every page");
});

test("content-plan: unknown counts and slots are never absent, and unknown slots are named", () => {
  const md = skill("content-plan");
  has(step(md, 4), "a page that was not listed is unknown, not absent.");
  const map = step(md, 6);
  has(map, "and unknown when the page list was cut short or could not be read and no page listed fills the slot.");
  has(map, "A `null` count is unknown, not 0, and a page with `read: false` or a `null` field (`faq`, `proof`, `schema`) shows nothing: neither is ever evidence that a competitor lacks a page or a section.");
  has(step(md, 7), "(an unknown slot gets no item; the plan header names it)");
  has(md, "the slots left unknown because the page list was cut short or could not be read");
});

test("list_pages is read 25 rows a page wherever a skill pages through it", () => {
  // Smoke: list_pages at limit 100 on a 32-page site answered about 63 KB.
  const skills = readdirSync(`${root}plugins/seo-genius/skills`);
  const big = skills.filter((n) => /`list_pages`[^.\n]*`limit: 100`|list_pages[^.\n]*\(`limit: 100`/.test(skill(n)));
  assert.deepEqual(big, [], `list_pages with limit 100 in: ${big.join(", ")}`);
  for (const n of ["competitor-dive", "content-plan"]) has(skill(n), "(`limit: 25`, follow `next_cursor`, twenty pages at most", n);
  for (const n of ["history", "log-change", "page-check"]) has(skill(n), "(`limit: 25`, follow `next_cursor`, at most twenty pages)", n);
});
