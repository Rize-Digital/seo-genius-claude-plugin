#!/usr/bin/env node
// The SEO Genius work queue, as the plugin's skills use it: which plan item a run
// may work on, what a claim answer means, how to read check_change while a claim
// is held. Node 18+, no dependencies, no network calls, and it writes no file:
// the skill makes the MCP calls and passes their answers in.
//
//   node queue.mjs pick  --site <domain> --input -   { queue, can_write }                    plan items in plan order, each with its work (next)
//   node queue.mjs board --site <domain> --input -   { queue }                               each plan item beside its queue item (weekly)
//   node queue.mjs match --input -                   { queue, page_url, change_kind }        one page field before a record (report)
//   node queue.mjs claim --input -                   { answer, use, streak }                 a claim_item answer (use: work or record)
//   node queue.mjs check --input -                   { answer, holding, role, streak }       a check_change answer (next)
//
// `pick` and `board` read the plan through the ledger (`ledger.mjs show`, the same
// order plan.md lists: This month, then Later) and take the ledger's --cwd, --home
// and --today. Every command prints one JSON object on stdout. Exit 0 on success,
// 2 on a refusal the caller can act on (bad input, a claim token in the input),
// 1 on anything else.
//
// NO QUEUE, NO CHANGE. `queue` is get_site_briefing's `queue` field, or null when
// the answer has none (a site that does not use the work queue, an older server,
// or a briefing that could not be read). With null, `pick` answers the open plan
// items in plan order with `work: "plain"` and nothing to claim, `board` answers
// `queue: "off"`, and `match` answers `action: "log"`: the run makes no claim call
// and goes on exactly as it did before the queue.
//
// THE CLAIM TOKEN NEVER COMES HERE. Nothing in this script needs it, so an input
// that carries a `claim_token` value, or text with a uuid next to the words claim
// token, is refused (token_in_input) before anything is read. The skill passes a
// claim answer without its token, and a staged input file can never hold one. No
// output names a token either.
//
// MATCHING. A plan item and a queue item are the same work when they name the
// same page (the ledger's pageKey: the path, without host, query or trailing
// slash, in lower case) and the same field. The queue calls page copy `content`,
// so content_depth and readability also match an item on `content`, as the
// server's field lock does (seo-genius-workflows src/lib/sync-core/field-lock.ts).
//
// FREE AND HELD. A queue item is free when it is queued, or claimed with a lease
// that ran out (the briefing then gives it no holder): the next claim takes it.
// Any other open item holds its page field: a live claim (Coach, an agent, a
// person), an open pull request (review), an apply or a check in progress, a
// change waiting for its live-page check, or a holder gone mid-way (stale).
//
// THREE IN A ROW. `claim` and `check` take the run's count of items passed over in
// a row (`streak`) and answer the new count, with `stop: true` when it reaches
// three. An item that goes ahead ends the search, so the count only grows.

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { run as ledgerRun, pageKey, LedgerError, CLAIM_TOKEN_AT_REST } from "./ledger.mjs";

export const STREAK_LIMIT = 3;

export class QueueError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** A uuid next to the words claim token: the ledger's own test (its `save` refuses one). */
export const TOKEN_NEAR_UUID = CLAIM_TOKEN_AT_REST;

/** Refuses any input that carries a claim token. Nothing here needs one. */
export function refuseToken(value) {
  const walk = (v, where) => {
    if (typeof v === "string") {
      if (TOKEN_NEAR_UUID.test(v)) throw tokenRefusal(where);
      return;
    }
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      const at = where ? `${where}.${k}` : k;
      if (/^claim_?token$/i.test(k) && x != null && x !== "") throw tokenRefusal(at);
      walk(x, at);
    }
  };
  walk(value, "");
}

function tokenRefusal(at) {
  return new QueueError(
    "token_in_input",
    `The input holds a claim token (${at || "text"}). This script never needs it: pass the answer without its claim_token. Keep the token in the run only; never write it to a file.`,
  );
}

const FIELD_ALIASES = { content_depth: ["content_depth", "content"], readability: ["readability", "content"] };
/** The queue fields a change kind matches. */
export const queueFields = (kind) => FIELD_ALIASES[kind] ?? [kind];

const HOLDERS = {
  coach: "Coach",
  agent: "another agent",
  person: "a person in the dashboard",
  pull_request: "an open pull request",
  page_check: "a change waiting for its live-page check",
  stale: "a worker that stopped mid-way (the server recovers it)",
};

function checkQueue(queue) {
  if (queue === null || queue === undefined) return null;
  if (typeof queue !== "object" || Array.isArray(queue) || !Array.isArray(queue.items)) {
    throw new QueueError("bad_input", "queue must be get_site_briefing's queue object (with its items), or null when the answer has none");
  }
  return queue;
}

/** True when nobody holds a queue item now, so a claim can take it. */
export function isFree(q) {
  return (q.status === "queued" || q.status === "claimed") && (q.held_by === null || q.held_by === undefined);
}

/** Who holds a held item, in words, and until when. */
export function describeHolder(q) {
  const who = HOLDERS[q.held_by] ?? (q.status === "queued" ? "nobody" : `an item in ${q.status}`);
  const until = q.lease_expires_at ? ` until ${q.lease_expires_at}` : "";
  return `${q.field ?? "This field"} on ${q.page_url ?? "this page"} is held by ${who}${until} (queue item ${q.item_id}, ${q.status}).`;
}

/** Every queue item on this page and field. */
export function queueItemsFor(queue, page, kind) {
  if (!page || !kind) return [];
  const key = pageKey(page);
  const fields = queueFields(kind);
  return queue.items.filter((q) => q && q.page_url && q.field && pageKey(q.page_url) === key && fields.includes(q.field));
}

/**
 * The queue item that stands for this page field: one that holds it (only one can),
 * else a free one, the plan's own (ai_idea) first.
 */
export function matchQueue(queue, page, kind) {
  const all = queueItemsFor(queue, page, kind);
  return all.find((q) => !isFree(q)) ?? all.find((q) => q.source === "ai_idea") ?? all[0] ?? null;
}

function heldEntry(q) {
  return { item_id: q.item_id, status: q.status, held_by: q.held_by ?? null, until: q.lease_expires_at ?? null, say: describeHolder(q) };
}

function workFor(queue, it, canWrite) {
  const base = { id: it.id, action: it.action, target_page: it.target_page, change_kind: it.change_kind ?? null };
  if (it.action !== "improve" || !it.change_kind) {
    return { ...base, work: "plain", note: "The queue holds no new page, so this item goes on as before, with no claim." };
  }
  const m = matchQueue(queue, it.target_page, it.change_kind);
  if (!m) {
    const note = queue.truncated
      ? `Not among the ${queue.items.length} queue items the briefing lists (of ${queue.open_count ?? "more"}), so it cannot be claimed in this run.`
      : "No queue item for this page and field yet, so it cannot be claimed in this run.";
    return { ...base, work: "not_listed", note };
  }
  if (!isFree(m)) return { ...base, work: "held", ...heldEntry(m) };
  if (!canWrite) {
    return { ...base, work: "unclaimed", item_id: m.item_id, note: "This account cannot write, so it cannot claim: a proposal only, and the field is not held." };
  }
  return { ...base, work: "claim", item_id: m.item_id };
}

/**
 * The work for each open plan item, in plan order. `planItems` are the ledger's
 * items (show), `planOrder` the open ids in plan order (show's plan_order).
 */
export function pickWork({ queue, planItems, planOrder, canWrite }) {
  const q = checkQueue(queue);
  const byId = new Map(planItems.map((it) => [it.id, it]));
  const open = planOrder.map((id) => byId.get(id)).filter(Boolean);
  if (!q) {
    return { queue: "off", order: open.map((it) => ({ id: it.id, action: it.action, target_page: it.target_page, change_kind: it.change_kind ?? null, work: "plain" })), to_claim: 0, unmatched: null };
  }
  const order = open.map((it) => workFor(q, it, canWrite !== false));
  const unmatched =
    q.items.find((x) => x && isFree(x) && !planItems.some((it) => it.action === "improve" && queueItemsFor({ items: [x] }, it.target_page, it.change_kind).length > 0)) ?? null;
  return {
    queue: "on",
    listed: q.items.length,
    open_count: q.open_count ?? q.items.length,
    truncated: q.truncated === true,
    order,
    to_claim: order.filter((o) => o.work === "claim").length,
    unmatched: unmatched ? { item_id: unmatched.item_id, title: unmatched.title ?? null, page_url: unmatched.page_url ?? null, field: unmatched.field ?? null, source: unmatched.source ?? null } : null,
  };
}

/** Each plan item that names a page and a field, beside its queue item (read only). */
export function boardRows({ queue, planItems }) {
  const q = checkQueue(queue);
  if (!q) return { queue: "off" };
  const rows = planItems
    .filter((it) => it.action === "improve" && it.change_kind && it.status !== "done" && it.status !== "dropped")
    .map((it) => {
      const m = matchQueue(q, it.target_page, it.change_kind);
      return {
        id: it.id,
        plan_status: it.status,
        target_page: it.target_page,
        change_kind: it.change_kind,
        queue: m ? { item_id: m.item_id, status: m.status, held_by: m.held_by ?? null, until: m.lease_expires_at ?? null } : null,
      };
    });
  const unmatched = q.items.filter((x) => x && !planItems.some((it) => it.action === "improve" && queueItemsFor({ items: [x] }, it.target_page, it.change_kind).length > 0));
  return {
    queue: "on",
    as_of: q.as_of ?? null,
    open_count: q.open_count ?? q.items.length,
    by_status: q.by_status ?? null,
    truncated: q.truncated === true,
    rows,
    other_items: unmatched.length,
  };
}

/**
 * Before a change is recorded on one page field: log as before, claim first, or
 * hold. A field an open pull request holds is held like any other: the server's
 * claim check refuses a record on it (claimed_by_other), with or without a
 * source_ref naming that pull request.
 */
export function matchRecord({ queue, page_url, change_kind }) {
  const q = checkQueue(queue);
  if (!q) return { queue: "off", action: "log" };
  if (!page_url || !change_kind) throw new QueueError("bad_input", "match needs page_url and change_kind");
  const m = matchQueue(q, page_url, change_kind);
  if (!m) {
    return { queue: "on", action: "log", note: q.truncated ? "No queue item is listed for this page field (the briefing lists part of the queue); the server's own check still refuses a field someone else holds." : "No queue item on this page field." };
  }
  if (isFree(m)) return { queue: "on", action: "claim", item_id: m.item_id };
  return { queue: "on", action: "hold", ...heldEntry(m) };
}

// A claim refusal that means someone else holds the page field.
const HOLD_REASONS = new Set(["held", "target_busy", "awaiting_page_check", "not_queued"]);
/** The claim refusals after which a record logs nothing (log-change and report). */
export const RECORD_HOLD_REASONS = [...HOLD_REASONS];

function refusalSay(a) {
  switch (a.reason) {
    case "held":
      return `${HOLDERS[a.heldBy] ?? "Someone else"} holds this item${a.leaseExpiresAt ? ` until ${a.leaseExpiresAt}` : ""}.`;
    case "target_busy":
      return `Another item on this page field is in progress${a.blockerStatus ? ` (${a.blockerStatus})` : ""}.`;
    case "awaiting_page_check":
      return "A change on this page field is waiting for its live-page check.";
    case "not_queued":
      return `The item is past the queue${a.status ? ` (${a.status})` : ""}: a pull request, an apply or a check holds it, or it is finished.`;
    case "not_found":
      return "The item is no longer in the queue.";
    case "no_target":
      return "The item names no page or no field, so nothing can hold it.";
    case "switch_off":
      return "This site no longer uses the work queue.";
    default:
      return `The claim was refused (${a.reason ?? "no reason given"}).`;
  }
}

function bump(streak) {
  const n = (Number.isInteger(streak) && streak >= 0 ? streak : 0) + 1;
  return { streak: n, stop: n >= STREAK_LIMIT };
}

/**
 * A claim_item answer. `use: "work"` (next): a refusal passes the item over and
 * counts toward three in a row. `use: "record"` (report): a holder means log
 * nothing; a queue that cannot hold the field means log as before, with no token.
 * The answer is the tool's JSON without its claim_token, or { error } when the call
 * failed, or { tool_missing: true }.
 */
export function readClaim({ answer, use, streak = 0 }) {
  if (use !== "work" && use !== "record") throw new QueueError("bad_input", 'claim needs use: "work" or "record"');
  if (!answer || typeof answer !== "object") throw new QueueError("bad_input", "claim needs the claim_item answer as answer");
  if (answer.tool_missing === true) {
    if (use === "record") return { outcome: "log", say: "claim_item is not in the tool list, so nothing was claimed; the server's own check still refuses a field someone else holds." };
    return { outcome: "stop", streak, stop: true, say: "The briefing has a work queue, but claim_item is not in the tool list, so no item can be claimed. Nothing was prepared. Reconnect with /mcp so the tool list is current, and run again." };
  }
  if (typeof answer.error === "string") {
    if (use === "record") return { outcome: "log", say: `The claim could not be made (${answer.error}); the server's own check still refuses a field someone else holds.` };
    return { outcome: "skip", ...bump(streak), say: `The claim could not be made (${answer.error}). The item is passed over.` };
  }
  if (answer.claimed === true) {
    return { outcome: "claimed", item_id: answer.item_id ?? null, lease_expires_at: answer.lease_expires_at ?? null, streak };
  }
  const say = refusalSay(answer);
  const holder = { reason: answer.reason ?? null, held_by: answer.heldBy ?? null, until: answer.leaseExpiresAt ?? null };
  if (answer.reason === "switch_off") {
    return { outcome: use === "record" ? "log" : "plain", ...holder, streak, say: `${say} The item goes on as before, with no claim.` };
  }
  if (use === "record") {
    // Only an item that left the queue, or one with no page field, cannot hold the
    // field: any other refusal, an unknown one included, means someone may hold it.
    if (answer.reason !== "not_found" && answer.reason !== "no_target") {
      return { outcome: "hold", ...holder, say: `${say} Nothing was recorded. The change has to be reconciled with whoever holds the field.` };
    }
    return { outcome: "log", ...holder, say: `${say} It is recorded with no claim; the server's own check still refuses a field someone else holds.` };
  }
  return { outcome: "skip", ...holder, ...bump(streak), say: `${say} The item is passed over.` };
}

function reasonCodes(answer) {
  return (Array.isArray(answer.reasons) ? answer.reasons : []).map((r) => r && r.code).filter(Boolean);
}

/** The end of a measurement window, from the reason's evidence. Never read from its message. */
export function maturesOn(reason) {
  const e = reason && reason.evidence;
  if (!e || typeof e !== "object") return null;
  const d = e.matures_on ?? e.maturesOn;
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

// Reasons that change nothing about going ahead (check_change gives them allow).
const ALLOW_LEVEL = new Set(["no_history", "revert_not_checked"]);

/**
 * A check_change answer, read in the order of next's step 5. `holding`: this run
 * holds a claim on the field and sent its token, so the answer's queue_lock must
 * say yours; anything else means the claim is gone and the run stops before any
 * write or pull request. `role: "link"` reads a page a Create item links from: it
 * decides that link only and never counts toward three in a row.
 */
export function readCheck({ answer, holding = false, role = "item", streak = 0, unrecorded_merge = null }) {
  if (!answer || typeof answer !== "object") throw new QueueError("bad_input", "check needs the check_change answer as answer");
  if (role !== "item" && role !== "link") throw new QueueError("bad_input", 'check role is "item" or "link"');
  const counted = (route, extra) => {
    const base = { route, release: holding, ...extra };
    return role === "link" ? { ...base, streak } : { ...base, ...bump(streak) };
  };
  if (holding) {
    const lock = answer.queue_lock;
    if (typeof answer.error === "string") {
      return counted("pass", { lease: "unknown", why: `history not checked: the call failed (${answer.error})` });
    }
    if (!lock || lock.state !== "yours") {
      const now = lock && lock.state === "held" ? ` ${HOLDERS[lock.held_by] ?? "Someone else"} holds the field now${lock.lease_expires_at ? ` until ${lock.lease_expires_at}` : ""}.` : "";
      return {
        route: "stop",
        lease: "lost",
        release: true,
        streak,
        stop: true,
        why: `The claim on this field is gone (its lease ran out, or the call went without the claim token).${now} Nothing is written and no pull request is opened. Send release_item once with the token; a "lost" answer confirms the claim is gone.`,
      };
    }
  } else if (typeof answer.error === "string") {
    return counted("pass", { why: `history not checked: the call failed (${answer.error})` });
  }
  const codes = reasonCodes(answer);
  if (unrecorded_merge) {
    return counted("wait", { until: null, needs_decision: true, why: `the merge of ${unrecorded_merge} is not recorded in SEO Genius yet; record it first` });
  }
  if (!holding && codes.includes("claimed_by_other")) {
    const r = answer.reasons.find((x) => x && x.code === "claimed_by_other");
    const ev = (r && r.evidence) || {};
    return counted("held", { held_by: ev.held_by ?? null, until: ev.lease_expires_at ?? null, why: r && r.message ? r.message : "someone else holds this page field in the work queue" });
  }
  const unreadable = answer.coach_history_not_readable;
  if (Array.isArray(unreadable) && unreadable.length > 0) return counted("pass", { why: "history could not be read" });
  const pv = answer.page_verdict;
  if (pv && pv.verdict === "WAIT") return counted("wait", { until: pv.until ?? null, why: "the page is marked WAIT" });
  if (answer.verdict === "block" && codes.includes("would_revert")) return counted("drop", { why: "it would undo an earlier change" });
  if (answer.verdict === "block" && codes.includes("frozen")) return counted("wait", { until: answer.unfreezes_on ?? null, why: "the field is frozen" });
  if (codes.includes("pending_measurement")) {
    const until = maturesOn(answer.reasons.find((x) => x && x.code === "pending_measurement"));
    if (!until) return counted("pass", { why: "an earlier change is still being measured and the answer gave no closing date" });
    return counted("wait", { until, why: "an earlier change to this field is still being measured" });
  }
  const warns = codes.filter((c) => !ALLOW_LEVEL.has(c));
  if (answer.verdict === "allow" || (answer.verdict === "warn" && warns.length > 0 && warns.every((c) => c === "recently_changed_other_kind"))) {
    return { route: "go", release: false, streak, stop: false, reasons: codes, ...(holding ? { lease: "yours", lease_expires_at: answer.queue_lock.lease_expires_at ?? null } : {}) };
  }
  return counted("pass", { why: `verdict not understood (${answer.verdict ?? "none"}: ${codes.join(", ") || "no reasons"})` });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readInput(arg) {
  let text;
  try {
    text = arg === "-" ? readFileSync(0, "utf8") : readFileSync(arg, "utf8");
  } catch (e) {
    throw new QueueError("bad_input", `could not read the input (${e.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new QueueError("bad_input", `the input is not JSON (${e.message})`);
  }
}

function planFromLedger(opts) {
  const shown = ledgerRun("show", { site: opts.site, cwd: opts.cwd ?? process.cwd(), home: opts.home, today: opts.today, env: opts.env });
  return { planItems: shown.items ?? [], planOrder: shown.plan_order ?? [] };
}

/** One command on its input. `opts` carries the ledger's site options for pick and board. */
export function runQueue(cmd, input, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new QueueError("bad_input", `${cmd} input must be a JSON object`);
  refuseToken(input);
  switch (cmd) {
    case "pick": {
      if (input.can_write !== true && input.can_write !== false) throw new QueueError("bad_input", "pick needs can_write (true or false, from get_my_tenant)");
      checkQueue(input.queue);
      return pickWork({ queue: input.queue, canWrite: input.can_write, ...planFromLedger(opts) });
    }
    case "board":
      checkQueue(input.queue);
      return boardRows({ queue: input.queue, planItems: planFromLedger(opts).planItems });
    case "match":
      return matchRecord(input);
    case "claim":
      return readClaim(input);
    case "check":
      return readCheck(input);
    default:
      throw new QueueError("bad_command", `unknown command ${cmd}`);
  }
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const o = { cmd };
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i];
    if (!k.startsWith("--")) throw new QueueError("bad_command", `unexpected argument ${k}`);
    o[k.slice(2)] = rest[i + 1];
  }
  return o;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href;
if (isMain) {
  try {
    const a = parseArgs(process.argv.slice(2));
    if (!a.input) throw new QueueError("bad_input", `${a.cmd} needs --input - (the JSON on standard input)`);
    const out = runQueue(a.cmd, readInput(a.input), { site: a.site, cwd: a.cwd, home: a.home, today: a.today });
    process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ error: e.code ?? "failed", message: e.message })}\n`);
    process.exit(e instanceof QueueError || e instanceof LedgerError ? 2 : 1);
  }
}
