// Skill-text tests for the profile skill: it preloads the business profile and the default
// local keyword goal, writes only after the user confirms, and never in an unattended run.
// Run: node --test tests/check/profile.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const md = read("plugins/seo-genius/skills/profile/SKILL.md");
const section = (name) => {
  const i = md.indexOf(`\n## ${name}\n`);
  assert.ok(i >= 0, `section ${name} not found`);
  const j = md.indexOf("\n## ", i + 4);
  return md.slice(i, j < 0 ? undefined : j);
};
const step = (n) => {
  const proc = section("Procedure");
  const m = proc.match(new RegExp(`\\n${n}\\. [\\s\\S]*?(?=\\n\\d+\\. |$)`));
  assert.ok(m, `step ${n} not found`);
  return m[0];
};
const block = (name) => {
  const s = section("The draft");
  const m = s.match(new RegExp("`" + name + "`[^\\n]*\\n\\n```json\\n([\\s\\S]*?)\\n```"));
  assert.ok(m, `json block for ${name} not found`);
  return JSON.parse(m[1]);
};

test("every value is stored, found with a source, or missing, and never invented", () => {
  const draft = section("The draft");
  assert.match(draft, /\*\*stored\*\*/);
  assert.match(draft, /\*\*found\*\*: read in this run, with the URL of the page it came from/);
  assert.match(draft, /\*\*missing\*\*: not stored and not found\. Left `null`/);
  assert.match(draft, /Never filled with a guess/);
  assert.match(step(4), /on the site's own domain only\. Never fetch another domain in this skill\./);
  assert.match(step(6), /keep both in the draft, mark the field "conflict"/);
});

test("the bio block carries every field the dashboard's bio schema requires", () => {
  const bio = block("bio");
  for (const k of ["business_name", "owner_name", "tagline", "description", "industry", "founded_year", "email", "phone", "social_profiles", "locations", "_meta"]) {
    assert.ok(k in bio, `bio.${k}`);
  }
  const loc = bio.locations[0];
  for (const k of ["id", "label", "is_primary", "address", "phone", "hours", "service_area"]) assert.ok(k in loc, `location.${k}`);
  for (const k of ["formatted", "street", "city", "region", "postal_code", "country"]) assert.ok(k in loc.address, `address.${k}`);
  for (const k of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) assert.ok(k in loc.hours, `hours.${k}`);
  assert.deepEqual(Object.keys(loc.service_area).sort(), ["type", "values"]);
  for (const k of ["source", "extracted_at", "source_urls", "confidence", "per_field_confidence"]) assert.ok(k in bio._meta, `_meta.${k}`);
});

test("the goal block is the stored default goal shape, centered on the primary location", () => {
  const g = block("goals");
  for (const k of ["id", "goal", "priority", "status", "set_by", "set_at", "radius_miles", "radius_center", "keyword_intent", "match_preference", "examples", "ranking_types", "track_ranking_types_separately", "selection_rule", "use"]) {
    assert.ok(k in g, `goal.${k}`);
  }
  assert.equal(g.id, "goal_local_keyword_visibility");
  assert.equal(g.radius_miles, 25);
  assert.deepEqual(g.keyword_intent, ["commercial", "transactional"]);
  assert.deepEqual(Object.keys(g.ranking_types).sort(), ["geo_modified", "local_intent"]);
  assert.equal(g.track_ranking_types_separately, true);
  assert.match(g.radius_center, /is_primary: true\): <its address\.formatted>/);
  assert.match(section("The draft"), /Never place the center from a county, a ZIP code, or a map lookup\./);
  assert.match(section("The draft"), /when no stored goal has the id `goal_local_keyword_visibility`/);
});

test("the write waits for a yes, needs can_write, sends only changed keys, and never kpis or competitors", () => {
  const nine = step(9);
  assert.match(nine, /only on the user's explicit yes to the draft as last shown, and only when `can_write` is true/);
  assert.match(nine, /`can_write` is false: show the `update_business_context` call as text/);
  assert.match(nine, /only the keys that changed, out of `bio`, `services`, and `goals`/);
  assert.match(nine, /Never send `kpis` or `competitors`/);
  assert.match(nine, /never send a key as `null`/);
  assert.match(nine, /say "this did not save"/);
  assert.match(step(10), /`get_business_context` again, and compare each key sent with what came back/);
});

test("an unattended run saves the draft and never writes the profile", () => {
  const u = section("Unattended profile runs");
  assert.match(u, /never writes the business profile\. No setting in the `unattended` block allows it/);
  assert.match(u, /Never call `update_business_context`\./);
  assert.match(u, /under "Needs a decision"/);
  assert.match(step(7), /This is the end of an unattended run/);
});

test("no paid call: no Data-for-SEO tool and no citation_check", () => {
  const proc = section("Procedure");
  for (const tool of ["keyword_research", "ranked_keywords", "competitor_domains", "serp_rank_check"]) {
    assert.ok(!proc.includes(`\`${tool}\``), `${tool} in the procedure`);
  }
  assert.match(step(5), /Do not call `citation_check` here; it spends quota\./);
});

test("start points to profile for missing facts and still does not write the profile", () => {
  const start = read("plugins/seo-genius/skills/start/SKILL.md");
  assert.match(start, /`\/seo-genius:profile` finds them on the site/);
  assert.match(start, /This skill does not write the business profile\./);
  assert.match(start, /The business profile in SEO Genius was not written\./);
});
