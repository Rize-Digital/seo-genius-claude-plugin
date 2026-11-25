// Tests for plugins/seo-genius/scripts/queue.mjs: the SEO Genius work queue as next,
// weekly, log-change and report use it (claim before drafting, the token on every call on
// the claimed field, a refusal is a skip, a lost lease stops, give the item back, after a
// pull request too), and the end of a measurement window read from evidence (B6).
// The server side: seo-genius-workflows src/app/api/mcp/v1/tools/claim-item.ts,
// release-item.ts, check-change.ts (queue_lock, claimed_by_other), get-site-briefing.ts
// (queue) and src/lib/sync-core/queue-summary.ts. Every value here is a placeholder.
// Run: node --test tests/queue/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scratch, cli, site, U, snapshot, writeDraft } from "../ledger/helpers.mjs";
import {
  readClaim,
  readCheck,
  matchRecord,
  maturesOn,
  refuseToken,
  RECORD_HOLD_REASONS,
  STREAK_LIMIT,
  TOKEN_NEAR_UUID,
} from "../../plugins/seo-genius/scripts/queue.mjs";
import * as Q from "../../plugins/seo-genius/scripts/queue.mjs";

const QUEUE = fileURLToPath(new URL("../../plugins/seo-genius/scripts/queue.mjs", import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8"));
const WITH = fixture("briefing-with-queue.json");
const WITHOUT = fixture("briefing-no-queue.json");
const TODAY = "2026-11-14";
// A made-up claim token, as claim_item would hand one back.
const TOKEN = "00000000-0000-4000-8000-0000000009a1";
const ITEM = (n) => `00000000-0000-4000-8000-000000000${n}`;

const PLAN = {
  items: [
    { action: "improve", target_page: "https://example.net/services/vinyl-fencing", change_kind: "title", keyword: "vinyl fencing springfield il", what_to_do: "Name the city in the title" },
    { action: "improve", target_page: "https://example.net/services/wood-fencing/", change_kind: "meta_description", keyword: "wood fencing springfield il", what_to_do: "Write a meta description" },
    { action: "create", target_page: "/guides/fence-cost-springfield-il", keyword: "fence cost springfield il", what_to_do: "A cost guide for Springfield" },
    { action: "improve", target_page: "https://example.net/", change_kind: "h1", keyword: "fence company springfield il", what_to_do: "Name the service and the city in the H1" },
    { action: "improve", target_page: "https://example.net/services/chain-link-fencing", change_kind: "content_depth", keyword: "chain link fencing springfield il", what_to_do: "Add a section on wire gauges" },
    { action: "improve", target_page: "https://example.net/about", change_kind: "schema", keyword: "acme fencing", what_to_do: "Add LocalBusiness schema" },
    { action: "improve", target_page: "https://www.example.net/services/gates", change_kind: "title", keyword: "fence gates springfield il", what_to_do: "A title for the gates page" },
    { action: "improve", target_page: "https://example.net/services/repair", change_kind: "title", keyword: "fence repair springfield il", what_to_do: "A title for the repair page", status: "waiting", until: "2026-12-20", reason: "an earlier title change is being measured" },
  ],
};

function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("SEO_GENIUS_")) delete env[k];
  return env;
}

/** One queue.mjs command as a process. pick and board take the ledger's site options. */
function q(s, cmd, input) {
  const siteArgs = s ? ["--site", site, "--home", s.home, "--cwd", s.dir, "--today", TODAY] : [];
  const r = spawnSync(process.execPath, [QUEUE, cmd, ...siteArgs, "--input", "-"], { input: JSON.stringify(input), encoding: "utf8", env: cleanEnv() });
  let out;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    out = { unparsed: r.stdout, stderr: r.stderr };
  }
  return { code: r.status, out, raw: r.stdout };
}

const ok = (r) => {
  assert.equal(r.code, 0, JSON.stringify(r.out));
  return r.out;
};

/** The plan ids listed under one heading of plan.md, in order. */
function planSection(md, title) {
  const m = md.replace(/\r\n/g, "\n").match(new RegExp(`\\n## ${title}\\n([\\s\\S]*?)(?=\\n## |$)`));
  assert.ok(m, `no ${title} section`);
  return m[1].split("\n").map((l) => l.match(/^\| (P-\d{3}) \|/)).filter(Boolean).map((x) => x[1]);
}

function withPlan(fn) {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: TODAY }));
    return fn(s);
  } finally {
    s.done();
  }
}

// ---------------------------------------------------------------- no queue: exactly as before (Q6)

test("no queue in the briefing: next picks plan.md's This month then Later, claims nothing, and writes nothing", () => {
  withPlan((s) => {
    const md = readFileSync(join(s.siteDir, "plan.md"), "utf8");
    const fromPlanMd = [...planSection(md, "This month"), ...planSection(md, "Later")];
    assert.deepEqual(fromPlanMd, ["P-001", "P-002", "P-003", "P-004", "P-005", "P-006", "P-007"], "the fixture plan");
    const before = snapshot(s.siteDir);
    assert.equal("queue" in WITHOUT, false, "the recorded briefing has no queue");
    const out = ok(q(s, "pick", { queue: WITHOUT.queue ?? null, can_write: true }));
    assert.equal(out.queue, "off");
    assert.deepEqual(out.order.map((o) => o.id), fromPlanMd, "the same picks, in the same order, as plan.md");
    for (const o of out.order) {
      assert.equal(o.work, "plain", `${o.id} is worked as before`);
      assert.equal(o.item_id, undefined, `${o.id} has nothing to claim`);
    }
    assert.equal(out.to_claim, 0);
    assert.equal(out.unmatched, null);
    assert.deepEqual(snapshot(s.siteDir), before, "pick writes nothing");
  });
});

test("the same plan with a queue keeps plan order and only adds the work for each item", () => {
  withPlan((s) => {
    const off = ok(q(s, "pick", { queue: null, can_write: true }));
    const on = ok(q(s, "pick", { queue: WITH.queue, can_write: true }));
    assert.equal(on.queue, "on");
    assert.deepEqual(on.order.map((o) => o.id), off.order.map((o) => o.id));
    const work = Object.fromEntries(on.order.map((o) => [o.id, [o.work, o.item_id ?? null]]));
    assert.deepEqual(work, {
      "P-001": ["held", ITEM(101)], // Coach holds the vinyl fencing title
      "P-002": ["held", ITEM(102)], // an open pull request holds it
      "P-003": ["plain", null], // a new page: the queue holds none
      "P-004": ["claim", ITEM(103)],
      "P-005": ["claim", ITEM(104)], // content_depth matches the queue's `content`, www and the slash aside
      "P-006": ["not_listed", null],
      "P-007": ["claim", ITEM(106)], // a claim whose lease ran out holds nothing
    });
    const p1 = on.order[0];
    assert.equal(p1.held_by, "coach");
    assert.equal(p1.until, "2026-11-14T09:30:00.000Z");
    assert.match(p1.say, /held by Coach until 2026-11-14T09:30:00\.000Z/);
    assert.equal(on.to_claim, 3);
    assert.deepEqual(on.unmatched, { item_id: ITEM(105), title: "Missing title on the contact page", page_url: "https://example.net/contact", field: "title", source: "issue" });
  });
});

test("weekly with no queue: board shows nothing and the week it writes is the same", () => {
  const input = { site_id: U(1), run_id: U(2), rankings: [], issue_states: {}, issue_totals: { critical: 0, high: 1, medium: 2, low: 3 }, changes: [], verdicts: {} };
  const runWeek = (queue) => {
    const s = scratch();
    try {
      // A run id of its own, so the two folders' records can be compared.
      ok(cli(s, "plan", { input: { ...PLAN, run_id: U(4) }, today: TODAY }));
      const before = snapshot(s.siteDir);
      const board = ok(q(s, "board", { queue }));
      assert.deepEqual(snapshot(s.siteDir), before, "board writes nothing");
      ok(cli(s, "week", { input: { ...input, run_id: U(3) }, today: TODAY }));
      return { board, files: snapshot(s.siteDir) };
    } finally {
      s.done();
    }
  };
  const without = runWeek(WITHOUT.queue ?? null);
  assert.deepEqual(without.board, { queue: "off" });
  const withQueue = runWeek(WITH.queue);
  assert.equal(withQueue.board.queue, "on");
  assert.deepEqual(withQueue.files, without.files, "the queue changes nothing weekly writes");
  const rows = Object.fromEntries(withQueue.board.rows.map((r) => [r.id, r.queue && [r.queue.status, r.queue.held_by]]));
  assert.deepEqual(rows, {
    "P-001": ["claimed", "coach"],
    "P-002": ["review", "pull_request"],
    "P-004": ["queued", null],
    "P-005": ["queued", null],
    "P-006": null,
    "P-007": ["claimed", null],
    "P-008": null,
  });
  assert.equal(withQueue.board.other_items, 1);
});

// ---------------------------------------------------------------- claims

const refused = (reason, extra = {}) => ({ claimed: false, reason, ...extra });

test("a claim refused with held passes the item over, names the holder, and counts one", () => {
  const r = readClaim({ answer: refused("held", { heldBy: "agent", leaseExpiresAt: "2026-11-14T11:00:00.000Z" }), use: "work", streak: 0 });
  assert.equal(r.outcome, "skip");
  assert.equal(r.held_by, "agent");
  assert.equal(r.until, "2026-11-14T11:00:00.000Z");
  assert.equal(r.streak, 1);
  assert.equal(r.stop, false);
  assert.match(r.say, /another agent holds this item until 2026-11-14T11:00:00\.000Z/);
});

test("three refusals in a row stop the run", () => {
  assert.equal(STREAK_LIMIT, 3);
  let streak = 0;
  const seen = [];
  for (const answer of [refused("held", { heldBy: "coach" }), refused("target_busy", { blockerStatus: "applying" }), refused("not_queued", { status: "review" })]) {
    const r = readClaim({ answer, use: "work", streak });
    seen.push(r.stop);
    streak = r.streak;
  }
  assert.deepEqual(seen, [false, false, true]);
  assert.equal(streak, 3);
});

/** next's steps 4 and 5 over pick's order, with the server's claim answers by item id. */
function walk(order, claims) {
  let streak = 0;
  const passed = [];
  const calls = [];
  for (const o of order) {
    if (o.work === "plain") return { picked: o.id, passed, calls, streak };
    if (o.work === "not_listed") {
      passed.push([o.id, "not_listed"]);
      continue;
    }
    if (o.work === "held") {
      streak += 1;
      passed.push([o.id, "held"]);
      if (streak >= STREAK_LIMIT) return { stopped: true, passed, calls, streak };
      continue;
    }
    calls.push(["claim_item", o.item_id]);
    const answer = claims[o.item_id] ?? { claimed: true, item_id: o.item_id, claim_token: TOKEN, lease_expires_at: "2026-11-14T11:00:00.000Z" };
    const { claim_token, ...withoutToken } = answer;
    const r = readClaim({ answer: withoutToken, use: "work", streak });
    if (r.outcome === "claimed") return { picked: o.id, token: claim_token, passed, calls, streak };
    streak = r.streak;
    passed.push([o.id, r.reason]);
    if (r.stop) return { stopped: true, passed, calls, streak };
  }
  return { picked: null, passed, calls, streak };
}

test("held skips to the next plan item, and a free one is claimed", () => {
  withPlan((s) => {
    const on = ok(q(s, "pick", { queue: WITH.queue, can_write: true }));
    // P-001 and P-002 are held in the briefing, P-003 is a new page: it goes on with no claim.
    assert.deepEqual(walk(on.order, {}).picked, "P-003");
    // Without the new page, the first Improve item whose claim is refused passes to the next.
    const improves = on.order.filter((o) => o.id !== "P-003" && o.work !== "held");
    const r = walk(improves, { [ITEM(103)]: refused("held", { heldBy: "person", leaseExpiresAt: "2026-11-15T09:00:00.000Z" }) });
    assert.equal(r.picked, "P-005");
    assert.deepEqual(r.calls, [["claim_item", ITEM(103)], ["claim_item", ITEM(104)]]);
    assert.deepEqual(r.passed, [["P-004", "held"]]);
  });
});

test("held items in the briefing and refused claims add up to three and stop the run", () => {
  withPlan((s) => {
    const on = ok(q(s, "pick", { queue: WITH.queue, can_write: true }));
    const noCreate = on.order.filter((o) => o.work !== "plain");
    const r = walk(noCreate, { [ITEM(103)]: refused("awaiting_page_check") });
    assert.equal(r.stopped, true);
    assert.deepEqual(r.passed, [["P-001", "held"], ["P-002", "held"], ["P-004", "awaiting_page_check"]]);
    assert.deepEqual(r.calls, [["claim_item", ITEM(103)]], "no claim call for a field the briefing shows held");
  });
});

test("a claim answer: claimed keeps the count, switch_off goes on with no claim, a missing tool stops", () => {
  const c = readClaim({ answer: { claimed: true, item_id: ITEM(103), lease_expires_at: "2026-11-14T11:00:00.000Z" }, use: "work", streak: 2 });
  assert.deepEqual([c.outcome, c.streak, c.item_id], ["claimed", 2, ITEM(103)]);
  assert.equal(readClaim({ answer: refused("switch_off"), use: "work", streak: 1 }).outcome, "plain");
  const missing = readClaim({ answer: { tool_missing: true }, use: "work" });
  assert.equal(missing.outcome, "stop");
  assert.match(missing.say, /Reconnect with \/mcp/);
  const failed = readClaim({ answer: { error: "upstream_unavailable" }, use: "work", streak: 0 });
  assert.deepEqual([failed.outcome, failed.streak], ["skip", 1]);
});

// ---------------------------------------------------------------- recording a change (log-change, report)

test("a record on a held field logs nothing and says who holds it", () => {
  for (const reason of RECORD_HOLD_REASONS) {
    const r = readClaim({ answer: refused(reason, { heldBy: "coach", leaseExpiresAt: "2026-11-14T09:30:00.000Z" }), use: "record" });
    assert.equal(r.outcome, "hold", reason);
    assert.match(r.say, /Nothing was recorded/, reason);
  }
  assert.equal(readClaim({ answer: refused("some_new_reason"), use: "record" }).outcome, "hold", "an unknown refusal holds");
  for (const reason of ["not_found", "no_target", "switch_off"]) assert.equal(readClaim({ answer: refused(reason), use: "record" }).outcome, "log", reason);
  assert.equal(readClaim({ answer: { tool_missing: true }, use: "record" }).outcome, "hold", "no claim_item: nothing confirms the field is free");

  const held = matchRecord({ queue: WITH.queue, page_url: "https://example.net/services/vinyl-fencing", change_kind: "title" });
  assert.equal(held.action, "hold");
  assert.match(held.say, /held by Coach until 2026-11-14T09:30:00\.000Z/);
  assert.equal(matchRecord({ queue: null, page_url: "https://example.net/", change_kind: "h1" }).action, "log");
  assert.deepEqual(matchRecord({ queue: WITH.queue, page_url: "https://example.net/", change_kind: "h1" }), { queue: "on", action: "claim", item_id: ITEM(103) });
  assert.equal(matchRecord({ queue: WITH.queue, page_url: "https://example.net/about", change_kind: "schema" }).action, "log");
});

test("report: a field held by a pull request is held like any other, so nothing is recorded on it", () => {
  const page = "https://example.net/services/wood-fencing";
  const m = matchRecord({ queue: WITH.queue, page_url: page, change_kind: "meta_description" });
  assert.deepEqual([m.action, m.held_by], ["hold", "pull_request"]);
  assert.match(m.say, /held by an open pull request/);
  // The server's claim check refuses a record on it whatever source_ref says, so a merged
  // pull request's URL in the input changes nothing.
  const pr = "https://github.com/example-org/example-site/pull/7";
  assert.equal(matchRecord({ queue: WITH.queue, page_url: page, change_kind: "meta_description", pull_request_url: pr }).action, "hold");
});

/** A server that holds one claim and answers check_change and log_page_change by the token sent. */
function fakeServer(claimed = { page: "https://example.net/", field: "h1", item: ITEM(103) }) {
  const calls = [];
  let live = true;
  const holds = (a) => live && a.page_url === claimed.page && a.change_kind === claimed.field;
  return {
    calls,
    expire() {
      live = false;
    },
    claim(item_id) {
      calls.push(["claim_item", { item_id }]);
      return { claimed: true, item_id, claim_token: TOKEN, lease_expires_at: "2026-11-14T11:00:00.000Z" };
    },
    check(a) {
      calls.push(["check_change", a]);
      const mine = holds(a) && a.claim_token === TOKEN;
      const queue_lock = mine
        ? { state: "yours", item_id: claimed.item, status: "claimed", lease_expires_at: "2026-11-14T11:00:00.000Z" }
        : holds(a)
          ? { state: "held", item_id: claimed.item, status: "claimed", held_by: "agent", lease_expires_at: "2026-11-14T11:00:00.000Z" }
          : { state: "none" };
      const reasons = queue_lock.state === "held" ? [{ code: "claimed_by_other", message: "h1 on this page is held by another agent.", evidence: { item_id: claimed.item, held_by: "agent", lease_expires_at: "2026-11-14T11:00:00.000Z" } }] : [];
      return { verdict: reasons.length ? "block" : "allow", reasons, unfreezes_on: null, page_verdict: { verdict: "OPEN", until: null }, coach_history_not_readable: [], queue_lock };
    },
    log(a) {
      calls.push(["log_page_change", a]);
      if (holds(a) && a.claim_token !== TOKEN) return { error: "Not recorded. h1 on this page is held by another agent. (code: claimed_by_other)" };
      return { id: U(500) };
    },
    release(a) {
      calls.push(["release_item", a]);
      return a.claim_token === TOKEN && live ? { released: true, item_id: a.item_id, status: "queued" } : { released: false, reason: "lost" };
    },
  };
}

/**
 * One record of a merged change (report), as the skill says, by the script's answers:
 * match, then claim_item, then log_page_change with or without the token, then
 * release_item whenever the claim answer says to give it back. `claimAnswer` stands in
 * for claim_item's answer (an error, a missing tool, a refusal); `logAnswer` for
 * log_page_change's. A server whose claim gate refuses nothing is the case the plugin
 * guards against: the gate fails open when it cannot read the queue.
 */
function recordWithClaim(server, { page_url = "https://example.net/", change_kind = "h1", claimAnswer = null, logAnswer = null } = {}) {
  const m = matchRecord({ queue: WITH.queue, page_url, change_kind });
  let token = null;
  let c = { outcome: m.action };
  if (m.action === "claim") {
    let got;
    if (claimAnswer) {
      if (claimAnswer.tool_missing !== true) server.calls.push(["claim_item", { item_id: m.item_id }]);
      got = claimAnswer;
    } else {
      got = server.claim(m.item_id);
    }
    const { claim_token, ...answer } = got;
    token = claim_token ?? null;
    c = readClaim({ answer, use: "record" });
  }
  let logged = null;
  if (c.outcome === "claimed" || c.outcome === "log") {
    const args = { page_url, change_kind, new_value: "Fence Company in Springfield, IL", ...(c.outcome === "claimed" ? { claim_token: token } : {}) };
    if (logAnswer) {
      server.calls.push(["log_page_change", args]);
      logged = logAnswer;
    } else {
      logged = server.log(args);
    }
  }
  if (c.release === true) server.release({ item_id: m.item_id, claim_token: token });
  return { outcome: c.outcome, say: c.say, logged, calls: server.calls.map(([n]) => n) };
}

/** A server whose claim gate refuses nothing: it holds no claim on the field recorded. */
const openGate = () => fakeServer({ page: "https://example.net/elsewhere", field: "title", item: ITEM(103) });

test("record: a claim that fails records nothing (fail closed)", () => {
  const failures = [
    { error: "fetch failed" },
    { error: "The work queue is not set up on this server yet. Nothing was claimed or released. (code: index_not_ready)" },
    { error: "An unexpected error occurred (code: internal_error)" },
    { error: "The request timed out" },
    { tool_missing: true },
    { claimed: false },
    { claimed: false, reason: "some_new_reason" },
    { reason: "switch_off" },
    { reason: "not_found" },
    { status: "queued" },
  ];
  for (const answer of failures) {
    const r = readClaim({ answer, use: "record" });
    assert.equal(r.outcome, "hold", JSON.stringify(answer));
    assert.match(r.say, /Nothing was recorded/, JSON.stringify(answer));
  }
  // A whole record against a server that would take it: nothing goes in, nothing to give back.
  for (const claimAnswer of [{ error: "fetch failed" }, { error: "The request timed out" }, { tool_missing: true }, { claimed: false }]) {
    const r = recordWithClaim(openGate(), { claimAnswer });
    assert.equal(r.outcome, "hold", JSON.stringify(claimAnswer));
    assert.ok(!r.calls.includes("log_page_change"), `no record after ${JSON.stringify(claimAnswer)}`);
    assert.ok(!r.calls.includes("release_item"), "nothing was claimed, so nothing is given back");
  }
});

test("record: a clean answer that nothing can be claimed records as before, with no token", () => {
  // The server's claim_item refusals that mean no queue item can hold the field
  // (seo-genius-workflows src/lib/sync-core/claims.ts, Refusal): the site does not use
  // the queue, the item left the queue, or it names no page field.
  assert.deepEqual(Q.RECORD_PROCEED_REASONS, ["no_target", "not_found", "switch_off"]);
  for (const reason of Q.RECORD_PROCEED_REASONS) {
    assert.equal(readClaim({ answer: refused(reason), use: "record" }).outcome, "log", reason);
    assert.ok(!RECORD_HOLD_REASONS.includes(reason), reason);
    const server = openGate();
    const r = recordWithClaim(server, { claimAnswer: refused(reason) });
    assert.deepEqual(r.calls, ["claim_item", "log_page_change"], reason);
    assert.equal(server.calls[1][1].claim_token, undefined, "recorded with no token");
    assert.equal(r.logged.id, U(500));
  }
  // No queue item on the field, or no queue at all: recorded as before, with no claim call.
  assert.equal(matchRecord({ queue: WITH.queue, page_url: "https://example.net/about", change_kind: "schema" }).action, "log");
  assert.equal(matchRecord({ queue: null, page_url: "https://example.net/", change_kind: "h1" }).action, "log");
});

test("record: a claimed item is given back after the record, when the record fails too", () => {
  const c = readClaim({ answer: { claimed: true, item_id: ITEM(103), lease_expires_at: "2026-11-14T11:00:00.000Z" }, use: "record" });
  assert.equal(c.release, true);
  assert.match(c.say, /release_item, whatever happens/);
  for (const logAnswer of [
    { error: "An unexpected error occurred (code: internal_error)" },
    { error: "Not recorded. h1 on this page is held by another agent. (code: claimed_by_other)" },
    { id: U(500) },
  ]) {
    const server = fakeServer();
    const r = recordWithClaim(server, { logAnswer });
    assert.equal(r.outcome, "claimed");
    assert.deepEqual(r.calls, ["claim_item", "log_page_change", "release_item"], JSON.stringify(logAnswer));
    assert.equal(server.calls[2][1].claim_token, TOKEN, "given back with the run's own token");
  }
  // next too: a claim made for work is always given back.
  assert.equal(readClaim({ answer: { claimed: true, item_id: ITEM(103) }, use: "work" }).release, true);
});

/** next with a claim: steps 5 to 7, as the skill says. Returns what it did. */
function nextWithClaim(server, { sendToken = true, expireBeforePr = false } = {}) {
  const done = [];
  const c = server.claim(ITEM(103));
  const { claim_token: token } = c;
  const call = (args) => (sendToken ? { ...args, claim_token: token } : args);
  const strip = ({ recent, ...a }) => a;
  for (const step of ["5", "6"]) {
    const r = readCheck({ answer: strip(server.check(call({ page_url: "https://example.net/", change_kind: "h1", proposed_value: "Fence Company in Springfield, IL" }))), holding: true });
    if (r.route !== "go") {
      if (r.release) server.release({ item_id: ITEM(103), claim_token: token });
      return { done, stoppedAt: step, route: r.route, lease: r.lease };
    }
  }
  if (expireBeforePr) server.expire();
  const gate = readCheck({ answer: server.check(call({ page_url: "https://example.net/", change_kind: "h1", proposed_value: "Fence Company in Springfield, IL" })), holding: true });
  if (gate.route !== "go") {
    server.release({ item_id: ITEM(103), claim_token: token });
    return { done, stoppedAt: "7.1", route: gate.route, lease: gate.lease };
  }
  done.push("write site file", "open pull request");
  // SEO Genius cannot hold a field for this pull request: the item goes back now.
  const back = server.release({ item_id: ITEM(103), claim_token: token });
  done.push(back.released ? "release" : "lost");
  return { done };
}

test("the token rides on every check_change for the claimed field, and a call without it stops the run", () => {
  const server = fakeServer();
  const r = nextWithClaim(server);
  assert.deepEqual(r.done, ["write site file", "open pull request", "release"]);
  const checks = server.calls.filter(([n]) => n === "check_change");
  assert.equal(checks.length, 3);
  for (const [, a] of checks) assert.equal(a.claim_token, TOKEN, "every check_change on the claimed field carries the token");

  // The same run with the token left off: the server sees the run's own claim as someone else's.
  const forgetful = fakeServer();
  const f = nextWithClaim(forgetful, { sendToken: false });
  assert.equal(f.stoppedAt, "5");
  assert.equal(f.route, "stop");
  assert.equal(f.lease, "lost");
  assert.deepEqual(f.done, [], "nothing written, no pull request");
  assert.deepEqual(forgetful.calls.at(-1), ["release_item", { item_id: ITEM(103), claim_token: TOKEN }], "the claim is given back");
});

test("a lost lease stops before any site file and before the pull request", () => {
  const server = fakeServer();
  const r = nextWithClaim(server, { expireBeforePr: true });
  assert.equal(r.stoppedAt, "7.1");
  assert.equal(r.lease, "lost");
  assert.deepEqual(r.done, []);
  for (const state of [{ state: "none" }, { state: "held", held_by: "coach", lease_expires_at: "2026-11-14T12:00:00.000Z" }, undefined]) {
    const out = readCheck({ answer: { verdict: "allow", reasons: [], queue_lock: state }, holding: true });
    assert.deepEqual([out.route, out.lease, out.stop, out.release], ["stop", "lost", true, true], JSON.stringify(state));
  }
});

test("the token rides on log_page_change for the claimed field: claim, record with it, give it back", () => {
  const server = fakeServer();
  const m = matchRecord({ queue: WITH.queue, page_url: "https://example.net/", change_kind: "h1" });
  assert.equal(m.action, "claim");
  const { claim_token: token, ...answer } = server.claim(m.item_id);
  const c = readClaim({ answer, use: "record" });
  assert.equal(c.outcome, "claimed");
  const logged = server.log({ page_url: "https://example.net/", change_kind: "h1", new_value: "Fence Company in Springfield, IL", claim_token: token });
  assert.equal(logged.id, U(500));
  server.release({ item_id: m.item_id, claim_token: token });
  assert.deepEqual(server.calls.map(([n]) => n), ["claim_item", "log_page_change", "release_item"]);
  // Without the token the same record is refused: the run's own claim reads as someone else's.
  assert.match(server.log({ page_url: "https://example.net/", change_kind: "h1", new_value: "x" }).error, /claimed_by_other/);
});

// ---------------------------------------------------------------- check_change, read in step 5's order

const answer = (over = {}) => ({ verdict: "allow", reasons: [], unfreezes_on: null, page_verdict: { verdict: "OPEN", until: null }, coach_history_not_readable: [], ...over });
const reason = (code, evidence = {}, message = code) => ({ code, message, evidence });

test("with no queue the reading is step 5's, unchanged", () => {
  const route = (a) => readCheck({ answer: a }).route;
  assert.equal(route(answer({ coach_history_not_readable: ["seo_fix_prs"] })), "pass");
  assert.deepEqual(
    (({ route: r, until }) => [r, until])(readCheck({ answer: answer({ verdict: "warn", page_verdict: { verdict: "WAIT", until: "2026-12-01" } }) })),
    ["wait", "2026-12-01"],
  );
  assert.equal(route(answer({ verdict: "block", reasons: [reason("frozen"), reason("would_revert")], unfreezes_on: "2026-11-30" })), "drop");
  assert.deepEqual((({ route: r, until }) => [r, until])(readCheck({ answer: answer({ verdict: "block", reasons: [reason("frozen")], unfreezes_on: "2026-11-30" }) })), ["wait", "2026-11-30"]);
  assert.equal(route(answer()), "go");
  assert.equal(route(answer({ reasons: [reason("revert_not_checked"), reason("no_history")] })), "go");
  assert.equal(route(answer({ verdict: "warn", reasons: [reason("recently_changed_other_kind")] })), "go");
  assert.equal(route({ error: "rate limited" }), "pass");
  const go = readCheck({ answer: answer() });
  assert.equal(go.release, false);
  assert.equal(go.lease, undefined, "no claim, no lease");
});

test("someone else holding the field passes the item over; a link page decides only its link", () => {
  const held = answer({ verdict: "block", reasons: [reason("claimed_by_other", { item_id: ITEM(101), held_by: "coach", lease_expires_at: "2026-11-14T09:30:00.000Z" })], queue_lock: { state: "held", held_by: "coach" } });
  const r = readCheck({ answer: held, streak: 1 });
  assert.deepEqual([r.route, r.held_by, r.until, r.streak, r.release], ["held", "coach", "2026-11-14T09:30:00.000Z", 2, false]);
  const link = readCheck({ answer: held, role: "link", streak: 1 });
  assert.deepEqual([link.route, link.streak], ["held", 1]);
});

test("B6: the end of a measurement window comes from evidence.matures_on, whatever the message says", () => {
  const ev = { window_days: 60, matures_on: "2026-12-20", baselined: true };
  const wordings = [
    "The latest title change has not finished its 60-day measurement window (closes 2026-12-20).",
    "Still measuring the last title edit; check back after 20 December 2026.",
    "The window closes 2027-01-05.", // a message that names another date is not read
    "",
  ];
  const untils = wordings.map((m) => readCheck({ answer: answer({ verdict: "warn", reasons: [reason("pending_measurement", ev, m)] }) }).until);
  assert.deepEqual(untils, ["2026-12-20", "2026-12-20", "2026-12-20", "2026-12-20"]);
  assert.equal(maturesOn(reason("pending_measurement", { maturesOn: "2026-12-20" })), "2026-12-20", "the field as the server names it before snake case");
  const noDate = readCheck({ answer: answer({ verdict: "warn", reasons: [reason("pending_measurement", { window_days: 60 }, "(closes 2026-12-20)")] }) });
  assert.equal(noDate.route, "pass", "no date in evidence: passed over, never read from the message");
});

// ---------------------------------------------------------------- the pull request

test("after its pull request opens, next gives the item back: the server cannot hold a field for it", () => {
  const server = fakeServer();
  const r = nextWithClaim(server);
  assert.deepEqual(r.done, ["write site file", "open pull request", "release"]);
  assert.equal(server.calls.at(-1)[0], "release_item");
  assert.equal(server.calls.filter(([n]) => n === "release_item").length, 1, "given back once");
  // A lease that ran out after the last check: nothing to give back, and the run says so.
  const late = fakeServer();
  const orig = late.release;
  late.release = (x) => (late.expire(), orig(x));
  assert.deepEqual(nextWithClaim(late).done, ["write site file", "open pull request", "lost"]);
  // The script has no command for a pull request any more.
  const res = spawnSync(process.execPath, [QUEUE, "pr", "--input", "-"], { input: "{}", encoding: "utf8" });
  assert.equal(res.status, 2);
  assert.equal(JSON.parse(res.stdout).error, "bad_command");
});

// ---------------------------------------------------------------- no token at rest

/** Every file under a folder, git's own objects aside, as text. */
function filesUnder(dir) {
  const out = [];
  const walkDir = (d) => {
    for (const n of readdirSync(d)) {
      if (n === ".git") continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walkDir(p);
      else out.push([p, readFileSync(p, "utf8")]);
    }
  };
  if (existsSync(dir)) walkDir(dir);
  return out;
}

test("no claim token at rest: a whole run leaves no token in any file, and save refuses a draft that holds one", () => {
  withPlan((s) => {
    const outputs = [];
    const pick = ok(q(s, "pick", { queue: WITH.queue, can_write: true }));
    outputs.push(JSON.stringify(pick));
    const target = pick.order.find((o) => o.work === "claim");
    const server = fakeServer();
    const { claim_token: token, ...claimAnswer } = server.claim(target.item_id);
    assert.equal(token, TOKEN);
    const claim = ok(q(null, "claim", { answer: claimAnswer, use: "work", streak: 0 }));
    outputs.push(JSON.stringify(claim));
    const check = ok(q(null, "check", { answer: server.check({ page_url: "https://example.net/", change_kind: "h1", claim_token: token }), holding: true }));
    outputs.push(JSON.stringify(check));
    assert.equal(check.route, "go");
    for (const o of outputs) {
      assert.ok(!o.includes(TOKEN), "no script output holds the token");
      assert.ok(!TOKEN_NEAR_UUID.test(o));
    }
    // The proposal the run saves, written from what it knows.
    writeDraft(s, `reports/${TODAY}-next.md`, `# Next: ${target.id}\n\nPage: ${target.target_page}\nField: ${target.change_kind}\nWork queue: claimed item ${claim.item_id}, given back after this proposal.\n`);
    ok(cli(s, "save", { args: ["--file", `reports/${TODAY}-next.md`], today: TODAY }));
    // A careless draft that keeps the token is refused, and nothing of it is saved.
    writeDraft(s, `reports/${TODAY}-careless.md`, `Work queue: claim_token: ${TOKEN}\n`);
    const careless = cli(s, "save", { args: ["--file", `reports/${TODAY}-careless.md`], today: TODAY });
    assert.equal(careless.code, 2);
    assert.equal(careless.out.error, "token_at_rest");
    assert.equal(existsSync(join(s.siteDir, "reports", `${TODAY}-careless.md`)), false);
    for (const [p, text] of filesUnder(s.siteDir)) {
      if (p.includes(".drafts")) continue; // the refused draft is the caller's own, never kept
      assert.ok(!text.includes(TOKEN), `${p} holds the token`);
      assert.ok(!TOKEN_NEAR_UUID.test(text), `${p} holds a uuid next to claim_token`);
    }
  });
});

test("the script never takes a claim token in: a field, or text with a uuid next to the words", () => {
  const r = q(null, "claim", { answer: { claimed: true, item_id: ITEM(103), claim_token: TOKEN }, use: "work" });
  assert.equal(r.code, 2);
  assert.equal(r.out.error, "token_in_input");
  assert.ok(!r.raw.includes(TOKEN), "the refusal does not repeat it");
  assert.throws(() => refuseToken({ note: `claim token ${TOKEN}` }), (e) => e.code === "token_in_input");
  assert.doesNotThrow(() => refuseToken({ answer: { claimed: false, reason: "held", claim_token: null } }));
  assert.equal(q(null, "pick", { queue: null, can_write: true }).code, 2, "pick needs the site");
  assert.equal(q(null, "check", { answer: "allow" }).out.error, "bad_input");
});
