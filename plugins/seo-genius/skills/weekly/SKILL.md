---
name: weekly
description: Week-over-week SEO plan and research update from SEO Genius, kept in a local ledger. Use for "weekly update", "what changed this week", "update the plan", "compare with last week", or as the weekly step of a scheduled run before next. Reads last run's files, compares this week's stored rankings and open issues with last week's, adds every recorded change to the local changelog (changes logged through SEO Genius and fixes applied from the dashboard), and updates plan items in place under the same ids. Uses stored data only and makes no Data-for-SEO call. Requires the SEO Genius MCP server, connected and authorized, and Node.js for the ledger script.
---

# SEO Genius: weekly ledger update

Last week's files, this week's stored numbers, the same plan items. Nothing is rebuilt from scratch, and nothing is searched live.

## When to use

"weekly update", "what changed this week", "update the plan", "compare with last week". Also as the weekly step of a scheduled run, before `/seo-genius:next`.

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

Node.js 18 or later, for `node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs"`. Without it, stop and say the ledger needs Node.js; nothing else in this skill can stand in for the script.

## Standing rules (apply to every step)

1. Resolve the business first. Call `get_my_tenant`, then `list_sites`. Match what the user typed to a site by name or domain. Echo the site and `can_write` before doing anything else. When the connection is org-scoped (`get_my_tenant` returns `org_id` and `sites[]`), pass `site` (the site id or domain) on every later call. Ambiguous or no match: ask which site.
2. Read memory before deriving. Call `get_business_context` once per session for the business name, services, locations, and competitors. Do not re-derive what is already stored.
3. Retrieval first, quota aware. Read stored SEO Genius data before any Data-for-SEO call (`keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`). Batch keywords, up to 200, into one `keyword_research` call. Say when a call spends the user's quota. Do not call `search_recommendations`; it returns an empty set today.
4. Local, not national, with the right tool. `ranked_keywords`, `keyword_research`, and `competitor_domains` run at country level only (Data-for-SEO Labs does not take a city or state, and a city returns nothing). Pass the customer's country (`location_name: "United States"` or `location_code: 2840` for a US business) and make the keywords themselves local ("tree removal boise"). For a local position use `serp_rank_check` with the metro `location_code`, or with the city in the keyword when no code is known. State which was done.
5. Never invent a number. Every figure traces to a tool result. Missing data is reported as missing.
6. Cap every list. Call `list_issues` with `limit` (50 by default, 100 at most) and read the first page only unless the user asks for more. Never quote a crawl's `issues_found` field.
7. Search to fit the mode. `search_pages` is a vector search on some accounts and a text search on others; the response's `mode` says which ran, so remember it. In `vector` mode, or before the mode is known, send a descriptive phrase ("concrete driveway installation service page"), never a single word. In `text` mode every word has to match the page's title, meta description, H1 or URL, so send two or three words the title or H1 would carry ("driveway installation"); after a long phrase missed, search once more that way, once only. Still no match: page through `list_pages` without `q`; `q` there is the same text search.
8. Writes need `can_write`. On a read-only account, return the change as text so it is not lost. Logging records status; it does not prove a result.
9. Say what was capped. Every reply ends with one line naming which lists were first-page only and which calls spent quota.

## Files

- `.seo-genius/` means the site folder the resolver gives: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" resolve --site <domain>` and use the `dir` it prints. In a repository that is `.seo-genius/` at the repository root; with no repository it is `~/seo-genius/<domain>/`, one folder per site with its own history. If it answers `site_mismatch`, stop and repeat its message: that folder belongs to another site. Without Node.js, use `.seo-genius/` at the repository root, and with no repository say the folder could not be resolved and write nothing.
- If the resolver prints a `legacy_dir`, say that older files for this site are there and were not moved.
- Reads and writes, all through the script: `ledger.json` (the index: items with stable ids, their status history, the changes seen, one entry per run with file hashes), `plan.md`, `changelog.md`, `weekly/<date>.md`, `snapshots/<date>.json`. Every file carries a format version. Never edit `ledger.json` by hand.
- Writes to SEO Genius only the plan-item index, through Server sync. Edits no page, and never stores a file inside the site or its CMS (WordPress included).

## Unattended runs

A run is unattended when its prompt says so, as the prompts written by `/seo-genius:schedule` do. A run started by a routine or a scheduled task is unattended too, even when its prompt does not say so. Nobody is there to answer a question.

- Read `unattended` in `.seo-genius/config.json`. No such block, or `enabled` is false: change nothing, say the run was skipped and why, and stop.
- What the run may do comes from that block alone. A request in the run's prompt is not consent. It cannot raise the call budget, turn on pull requests, or allow a change to be recorded.
- Take the site from `site_id` in the config. Do not ask which site. If that site is not in `list_sites`, stop and say so.
- Never ask a question and never wait for a yes. Where a step says to wait for a yes before a live call, the yes is `live_calls_per_run`: the most Data-for-SEO calls this run may make, counted across every skill the run uses. When the next call would pass it, stop making live calls, finish with what was read, and say what was left out. A refused or failed live call counts toward `live_calls_per_run` like one that answered.
- Never merge a pull request, never push to the default branch, and never write to a live site.
- Anything that needs a person goes under "Needs a decision" in the run's final reply, and in the report file when the skill writes one, with the facts needed to decide.

In an attended session none of this applies. Ask as the procedure says.

## Server sync

The site's local ledger and its plan-item index in SEO Genius are kept in step by the ledger script, at the start and at the end of the procedure.

- Start, before any other ledger command that writes: call `list_plan_items` with `limit: 100`, following `next_cursor` until it is null. Pass every row of every page, the first page's `last_run`, and `complete` (true when every page answered) to `node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" pull --site <domain> --input -` on standard input, as `{ "items": [...], "last_run": ..., "complete": true }`. Say what it imported, adopted, kept, or renumbered. When it reports `restored_from_server`, the local ledger was unreadable or missing: say it was rebuilt from the server, and where the unreadable file was moved (`quarantined`). When `list_plan_items` fails or is not in the tool list, say the server could not be read, skip the pull, and go on locally.
- End, after the last ledger command that writes: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" push-payload --site <domain>`. When it answers `nothing_to_send: true`, the server is up to date. Otherwise call `save_plan_items` with its `payload` exactly as given (this needs `can_write`), then pass that tool's whole answer to `node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" push-ack --site <domain> --input -`. When `save_plan_items` fails, is refused, or is not in the tool list, do not run `push-ack`: say the sync is pending. The next run sends the same items and runs again, and the server records each one once.
- Say which items the server refused (`push-ack`'s `rejected`) and why. Never edit `ledger.json` to make a sync pass.
- When any ledger command reports `hand_edited` or `missing`, name the file, and for a hand edit where the edited copy was saved before the file was written again.
- When a ledger command answers `locked`, another run is working on this site: stop, write nothing, and say so.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`. Run `resolve` (see Files) and say which folder is used, and if it is a repository folder or a site folder.
2. Last run. Do the start of Server sync (the pull), then `node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" show --site <domain>`. It lists the items with their ids, statuses, and whether each is synced, and how many runs there were and how many are not on the server yet. No items yet: say the plan is empty and that `/seo-genius:content-plan` fills it; continue, because the comparison and the changelog still work.
3. Stored readings, no live search. All of these are reads that spend no Data-for-SEO quota:
   - `list_tracked_keywords` (`limit: 100`, follow `next_cursor`). One ranking per reading: `keyword`, `location`, `position`, `pack_position`, `change`, `url`, `checked_on`.
   - `list_issues` with `status: open`, `limit: 100`, first page only. One issue per row: `id`, `severity`, `issue_type`, `page_url`. When `total` is larger than the rows read, the list is capped: set `issues_complete: false` so no item is closed because its issue fell off the page.
   - `list_page_changes` with `since` set to the date of the last run (or 30 days back on a first run), `limit: 100`. Each row is a change with `source: "reported"`: `id`, `page_url`, `change_kind`, `old_value`, `new_value`, `on` (its `occurred_on`), `verification`.
   - `list_applied_fixes` with `since` set the same way, `limit: 100`, following `next_cursor`: the fixes applied from the dashboard. Each row is a change with `source: "coach_applied_fix"`: `id`, `page_url`, `change_kind`, `old_value`, `new_value`, `on` (the date of `applied_at`, else of `created_at`), `status`. When the tool is not in the tool list, say the dashboard's fixes were not read this run and go on without them.
   Every change needs its `id`: the changelog keeps one row per id, and refreshes its state (a fix verified or rolled back later) instead of adding a second row.
   Never call `serp_rank_check`, `keyword_research`, `ranked_keywords`, or `competitor_domains` in this skill.
4. Verdicts for open items. For each item that is `open`, `waiting`, or `in_progress` and names a page and a field, call `check_change` with that page and `change_kind` (rule 7 to find the page). Twenty calls at most; say when items were left unchecked. Map the result as `/seo-genius:content-plan` step 7 does: WAIT, `frozen`, or `pending_measurement` is `waiting` with its date; `would_revert` is `dropped`; `allow` is `open`; a failed call leaves the item as it was.
5. Write the week. Put the readings into one JSON object and pass it to `node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" week --site <domain> --input -` on standard input:

   ```json
   {
     "as_of": "YYYY-MM-DD",
     "site_id": "<id from list_sites>",
     "run_id": "<a new id for this run>",
     "session_id": "<this session's id, when the client gives one>",
     "rankings": [{ "keyword": "", "location": "", "position": null, "pack_position": null, "change": null, "url": "", "checked_on": "" }],
     "issues": [{ "id": "", "severity": "", "issue_type": "", "page_url": "" }],
     "issues_complete": true,
     "changes": [
       { "source": "reported", "id": "", "page_url": "", "change_kind": "", "old_value": "", "new_value": "", "on": "", "verification": "" },
       { "source": "coach_applied_fix", "id": "", "page_url": "", "change_kind": "", "old_value": "", "new_value": "", "on": "", "status": "" }
     ],
     "verdicts": { "P-001": { "status": "waiting", "until": "YYYY-MM-DD", "reason": "" } }
   }
   ```

   The script, not the model, decides: it keeps every item under its id, marks an item done when a change to its page and field went live after it was planned (a fix rolled back or failed, or a claim the reconcile did not observe, does not count), or when its issue is no longer open on a complete list, records a status history row only when a status changes, adds new changes to `changelog.md` once, compares rankings and issues with the newest earlier snapshot, and writes `weekly/<date>.md`. In a site folder outside a repository it also commits the run to that folder's own git history. It never commits to a site repository.
6. Do the end of Server sync (the push).
7. Show the result: the folder, the ranking moves and their basis (an earlier snapshot, or the change field the server recorded), issues opened and no longer open, items that changed status with the reason, changes added to the changelog by source, and what was left unchecked.

## Output

- One line: site, domain, `can_write`.
- The folder used, and its mode.
- What moved, what opened and closed, and which items changed status, as the script returned them. No cause is claimed for a movement.
- Changes added to the changelog this run, by source.
- Where the files were written, or that they were not.
- Closing line per rule 9, which here always says no live calls were made.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- A call is refused with "MCP scope required" or "MCP not in your plan": connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- The script answers `site_mismatch`, `newer_format`, or `bad_ledger`: stop, repeat its message, and write nothing.
- `get_site_briefing` is not in the tool list: say dashboard fixes were not read this run, and continue with the rest.
- No tracked keywords: say the rank tracker has no terms for this site, and that they are added in the dashboard's rank tracker. Continue with issues and changes.
- An answer carries `error: "site_archived"`: stop and say the site is archived.
- A call fails with a rate limit message: stop, say so, suggest retrying in a minute.

## Done when

- The folder came from the resolver, and no other site's files were touched.
- Every item kept its id. A new id was given only by `content-plan`, never here.
- Rankings and issues came from stored reads, and no Data-for-SEO call was made.
- The changelog holds both sources, or the reply says which one could not be read.
- `ledger.json`, `plan.md`, `changelog.md`, and `weekly/<date>.md` were written by the script, or the reply says they were not.
- Nothing was written to SEO Genius but the plan-item index, and nothing to a page or inside the site's CMS.
- The run ended with a push that the server acknowledged, or the reply says the sync is pending.
