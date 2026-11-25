// Skill-text tests for the work queue (Q6) and the measurement window date (B6). The rules
// themselves are in plugins/seo-genius/scripts/queue.mjs and tested in tests/queue/; these
// tests pin that each skill calls them, sends the token where it must, keeps it nowhere,
// and behaves as before when the briefing has no queue.
// Run: node --test tests/check/work-queue.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RECORD_HOLD_REASONS } from "../../plugins/seo-genius/scripts/queue.mjs";
import * as Q from "../../plugins/seo-genius/scripts/queue.mjs";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const skill = (name) => read(`plugins/seo-genius/skills/${name}/SKILL.md`);
const section = (md, title) => {
  const m = md.match(new RegExp(`\\n## ${title}\\n([\\s\\S]*?)(?=\\n## |$)`));
  assert.ok(m, `section ${title} not found`);
  return m[1];
};
const step = (md, n) => {
  const proc = md.slice(md.indexOf("\n## Procedure\n"));
  const m = proc.match(new RegExp(`\\n${n}\\. [\\s\\S]*?(?=\\n\\d+\\. |\\n## )`));
  assert.ok(m, `step ${n} not found`);
  return m[0];
};
const has = (s, text, msg) => assert.ok(s.includes(text), msg ?? `missing: ${text}`);
const SCRIPT = '`node "${CLAUDE_PLUGIN_ROOT}/scripts/queue.mjs" ';

test("next reads the queue from the briefing and picks through the script, in plan order", () => {
  const md = skill("next");
  const two = step(md, 2);
  has(two, "`get_site_briefing` with `max_bytes: 2000` and `change_index: \"none\"`, keeping only its `queue` (null when the answer has none, the call fails, or the tool is not in the tool list)");
  has(two, `${SCRIPT}pick --site <domain> --input -\` with \`{ "queue": <it>, "can_write": <can_write> }\``);
  // The empty-plan stop still comes before any queue read.
  assert.ok(two.indexOf("`show` lists no items: stop") < two.indexOf("get_site_briefing"));
  const four = step(md, 4);
  has(four, "the first under \"This month\", then under \"Later\", that is not done and was not declined, in the order `pick` gave");
  for (const work of ["`plain`", "`claim`", "`held`", "`not_listed`", "`unclaimed`"]) has(four, `   - ${work}:`);
  has(four, "It counts toward the three-in-a-row limit of step 5.");
  has(four, "list that queue item (its title, page, and field) under \"Needs a decision\"");
});

test("next with no queue: no claim call, no token, every step as before", () => {
  const wq = section(skill("next"), "Work queue");
  has(wq, "`pick` answers `queue: \"off\"`. Then call no `claim_item` or `release_item`, send no `claim_token`, and run every step as before.");
  has(section(skill("next"), "Done when"), "With no queue in the briefing, no claim call was made and every step ran as before.");
});

test("next claims before step 5, and a refusal is a skip that counts", () => {
  const wq = section(skill("next"), "Work queue");
  has(wq, "Claim before step 5, one item at a time.");
  has(wq, "Pass its answer, without `claim_token`, to `queue.mjs claim --input -`");
  has(wq, "`skip`: pass the item over with the `say` it gives (who holds it, and until when).");
  has(wq, "Whenever `stop` is true, stop the run");
});

test("the token rides on every check_change for the claimed field in next, and on log_page_change in log-change and report", () => {
  const md = skill("next");
  has(section(md, "Work queue"), "Send it as `claim_token` on every `check_change` for the claimed page and field (steps 5, 6, and 7); each call renews the lease.");
  has(step(md, 5), "With a claim, add `claim_token`.");
  has(step(md, 6), "On the claimed page and field, send the token here too.");
  has(step(md, 7), "With a claim, confirm it here too: `check_change` for the claimed page and field with the token");
  const lc = skill("log-change");
  has(step(lc, 8), "   - `claim_token`: the token of the claim this run holds on this page and field, when Work queue says to record with one");
  has(step(lc, 6), "and `claim_token` when this session holds a claim on this page and field");
  has(section(skill("report"), "Work queue"), "`claimed`: record with the token as `claim_token`, then give the item back with `release_item`, whatever `log_page_change` answered");
});

test("a lost lease stops next before any site file and any pull request", () => {
  const md = skill("next");
  has(section(md, "Work queue"), "Stop before any site file is written and before any pull request is opened.");
  has(step(md, 5), "With a claim, a `queue_lock` that is not `yours`: the lease is lost. Stop (Work queue).");
  // The lease check sits in the first pull request step, before the branch and any write.
  const seven = step(md, 7);
  assert.ok(seven.indexOf("Anything but `route: \"go\"` with `lease: \"yours\"` stops the delivery") < seven.indexOf("2. Fetch, and create a branch"));
});

test("next gives the item back once its pull request is open, and says the field is not held", () => {
  const md = skill("next");
  const seven = step(md, 7);
  has(seven, "7. With a claim, give the item back now with `release_item`.");
  has(seven, "say in the reply that the field is not held in the work queue while the pull request is open");
  has(section(md, "Work queue"), "opens its pull request, or the run stops), call `release_item` with `item_id` and the token before anything else.");
  // Given back after the pull request opens, never before.
  assert.ok(seven.indexOf("open the pull request. Open it as a draft") < seven.indexOf("give the item back now with `release_item`"));
});

test("log-change on a held field records nothing and names the holder, for every refusal the script holds on", () => {
  const md = skill("log-change");
  const wq = section(md, "Work queue");
  has(wq, "record nothing. Tell the user who holds the field (`held_by`");
  has(wq, "and that their change has to be reconciled with the holder before it is recorded. Stop.");
  const refusals = wq.match(/Refused with ([^:]+): record nothing/);
  assert.ok(refusals, "the hold refusals are listed");
  for (const reason of RECORD_HOLD_REASONS) has(refusals[1], `\`${reason}\``, `log-change does not hold on ${reason}`);
  has(refusals[1], "a reason not named here");
  has(wq, "SEO Genius answered that nothing can be claimed, so record with no token, as before.");
  has(wq, "there is no queue: make no claim call, send no `claim_token`, and record as before.");
  // The held check comes before the user is asked to confirm.
  has(wq, "Read the queue once, before step 6");
  has(section(md, "Output"), "Not recorded: <change kind> on <URL> is held by <holder> until <date>.");
  // log-change still needs no Node.js: no script call.
  assert.ok(!md.includes("queue.mjs"), "log-change stays free of the ledger scripts");
});

test("report records a merged change under the queue's rules, through the script", () => {
  const md = skill("report");
  const wq = section(md, "Work queue");
  has(wq, `${SCRIPT.slice(0, -1)}\``);
  has(wq, "run `queue.mjs match --input -` with `{ \"queue\": <it>, \"page_url\": <the page's URL>, \"change_kind\": <the kind> }`");
  has(wq, "\"use\": \"record\"");
  has(wq, "`hold`: someone else holds the field (an open pull request included: `next` gives its claim back when it opens one, so a pull request that holds a field is never this pipeline's). Record nothing.");
  has(wq, "With null, make no claim call, send no `claim_token`, and record as before.");
  has(step(md, 2), "`change_index.pages`, and `queue` when the answer has one (Work queue)");
});

/** The clean "nothing to claim" refusals, as the skills name them: `a`, `b`, or `c`. */
const proceedList = () => {
  const names = Q.RECORD_PROCEED_REASONS.map((r) => `\`${r}\``);
  return `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
};

test("log-change fails closed when the claim could not be made, and gives a claim back whatever the record answered", () => {
  const md = skill("log-change");
  const wq = section(md, "Work queue");
  has(wq, `Refused (\`claimed: false\`) with ${proceedList()}: SEO Genius answered that nothing can be claimed, so record with no token, as before.`);
  has(wq, "A failed call (a network error, a server error, a timeout), any other answer, or no `claim_item` in the tool list: record nothing, because SEO Genius could not confirm that nobody else holds the field, and put the change under \"Needs a decision\" (Output). Stop.");
  has(wq, "then give the item back with `release_item`, whatever `log_page_change` answered: after an error or a `claimed_by_other` refusal too.");
  has(section(md, "Output"), "When the claim could not be made (Work queue): \"Needs a decision: <change kind> on <URL> was not recorded.");
  has(section(md, "If something is missing"), "Never claim success. With a claim, give it back with `release_item` all the same.");
});

test("report fails closed when the claim could not be made, and gives a claim back whatever the record answered", () => {
  const md = skill("report");
  const wq = section(md, "Work queue");
  has(wq, "then give the item back with `release_item`, whatever `log_page_change` answered: after an error or a `claimed_by_other` refusal too.");
  has(wq, `\`log\` (SEO Genius answered that nothing can be claimed: ${proceedList()}): record with no token.`);
  has(wq, "A failed claim call, a missing `claim_item`, or an answer the script does not know is `hold` too: SEO Genius could not confirm that nobody else holds the field.");
  has(section(md, "If something is missing"), "Never claim it was recorded. With a claim, give it back with `release_item` all the same.");
});

test("next on a queue site changes nothing on an existing page for a Create item, links or any other field, and lists skipped frozen and held fields under Needs a decision", () => {
  const md = skill("next");
  const six = step(md, 6);
  has(six, "On a site that uses the work queue (`pick` answered `queue: \"on\"`), add none and change no other field on an existing page: this run claims no field for a Create item");
  has(six, "List each change it would make there (the page, the field, and the exact value; for a link, its anchor text, target, and step 5 check) under \"Needs a decision\" for a person to make.");
  // The exact-value check is the only other place that lets a Create item change an existing
  // page, and it applies to a site without the queue only.
  const anyOther = six.indexOf("any other field it changes there");
  assert.ok(anyOther > 0, "the exact-value check names the other fields");
  assert.ok(six.lastIndexOf("on a site without the work queue, for a Create item each link it adds on an existing page", anyOther) > six.lastIndexOf("\n", anyOther), "a Create item's other fields are changed only on a site without the queue");
  has(step(md, 4), "On a site that uses the queue, a Create item changes nothing on an existing page (step 6).");
  has(step(md, 4), "Pass it over with its `say` (who holds it, and until when), and list it under \"Needs a decision\".");
  has(step(md, 5), "(a frozen field, with its `unfreezes_on`, and a field someone else holds, with who and until when, go under \"Needs a decision\")");
  has(section(md, "Output"), "- Needs a decision, when anything went there: the frozen fields and the fields someone else holds that were passed over");
  has(section(md, "Done when"), "A Create item changed nothing on an existing page; every change it would make there was listed under \"Needs a decision\".");
});

test("weekly shows the queue beside the plan and claims nothing", () => {
  const md = skill("weekly");
  has(step(md, 3), "This skill drafts no value for any page field, so it claims nothing and sends no `claim_token`: the queue is read and shown, never worked.");
  has(step(md, 7), `${SCRIPT}board --site <domain> --input -\``);
  has(step(md, 7), "With `queue: \"off\"`, say nothing about a queue.");
  assert.ok(!md.includes("`claim_item`") && !md.includes("`release_item`"), "weekly makes no claim call");
});

test("brief shows the queue when there is one and claims nothing", () => {
  const md = skill("brief");
  has(step(md, 3), "when the answer has `queue` (a site that uses the SEO Genius work queue), a short \"Work queue\" part");
  has(step(md, 3), "No `queue` in the answer: leave this part out. This skill claims nothing.");
  assert.ok(!md.includes("`claim_item`"));
});

test("B6: next, content-plan and weekly read the window's end from evidence.matures_on, never from the message", () => {
  for (const name of ["next", "content-plan"]) {
    const md = skill(name);
    assert.ok(!md.includes("closing date given in that reason's `message`"), `${name} still reads the date from the message`);
    has(md, "that reason's `evidence.matures_on`", `${name} does not read evidence.matures_on`);
    has(md, "Never read the date from its `message`", name);
  }
  has(step(skill("weekly"), 4), "for `pending_measurement`, the reason's `evidence.matures_on`, never a date read from its `message`");
});

test("claimed_by_other is no history verdict in content-plan and weekly", () => {
  has(step(skill("content-plan"), 8), "A `claimed_by_other` reason (on a site that uses the work queue, someone else holds this field right now) says nothing about the field's history");
  has(step(skill("weekly"), 4), "a `claimed_by_other` reason, someone else holding the field in the work queue, is no verdict of its own");
});

test("no claim token at rest: every skill that sends one says it is never kept, and the pull request blocks have no place for it", () => {
  for (const name of ["next", "log-change", "report"]) {
    const md = skill(name);
    assert.ok(/never (write|show)[^.]*\b(it|the token)\b/i.test(section(md, "Work queue")) || /lives only in this run/.test(section(md, "Work queue")), `${name} does not say the token is never kept`);
  }
  const next = skill("next");
  has(section(next, "Work queue"), "never write it to `.seo-genius/`, a proposal, a report, a site file, a commit message, a branch name, or a pull request body, and never show it in the reply");
  has(step(next, 7), "It never carries the claim token, and neither does the branch name or a commit message.");
  for (const block of next.match(/```seo-genius-(item|change)\n[\s\S]*?```/g)) assert.ok(!/claim/i.test(block), "a pull request block names the claim");
  has(section(next, "Done when"), "The claim token appears in no file, proposal, report, commit, branch name, pull request body, or reply.");
  // The only skills that send a token are the ones that claim.
  for (const name of ["audit", "brief", "content-plan", "weekly", "history", "issues", "sites", "start", "schedule"]) {
    assert.ok(!skill(name).includes("`claim_token` on"), `${name} sends a claim token`);
  }
});

test("schedule copies queue.mjs with the ledger, so a cloud run has the script next and weekly call", () => {
  const five = step(skill("schedule"), 5);
  has(five, "Copy `${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs`, `${CLAUDE_PLUGIN_ROOT}/scripts/queue.mjs` and `${CLAUDE_PLUGIN_ROOT}/scripts/node-check.cjs` to `.claude/skills/seo-genius-scripts/`.");
  has(read("plugins/seo-genius/README.md"), "copies the pipeline skills, and the three scripts they run, into");
});
