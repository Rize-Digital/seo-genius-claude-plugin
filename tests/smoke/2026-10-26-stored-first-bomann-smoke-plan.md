# Stored-first smoke plan, Bomann Fencing (1.5.0), not run yet

A plan for a later session. It checks the 1.5.0 changes against production on Bomann Fencing (bomannfencing.com, client `5d084767-14c1-42bd-b960-fd1d4cefb655`) at zero cost: no Data-for-SEO call, no crawl, no AI detection, and no Anthropic-billed work on the server. The only server write allowed is `save_plan_items`.

## Guard rails (set before the first prompt)

1. Plugin under test: the head of `feat/stored-ranks-source-stamps`, loaded with `claude --plugin-dir <worktree>/plugins/seo-genius`. Check `/plugin` shows seo-genius 1.5.0.
2. A fresh ledger home, so the real `~/seo-genius/bomannfencing.com/` is not touched: set `SEO_GENIUS_HOME` to an empty scratch folder (run A) and a second empty one (run B), and start the session outside any git repository.
3. Start the session with these tools denied, for both the plugin server (`mcp__plugin_seo-genius_seo-genius__`) and the claude.ai connector (`mcp__claude_ai_SEO_Genius__`), with `--disallowedTools`:
   - paid: `serp_rank_check`, `keyword_research`, `ranked_keywords`, `competitor_domains`, `keyword_gap`, `search_pages`
   - crawl and detection: `trigger_crawl`
   - every other write: `log_page_change`, `mark_issue_fixed`, `create_issue`, `update_issue`, `reject_issue`, `update_business_context`, `save_research`
   The deny list is a backstop. The pass condition is that no denied tool is even attempted: an attempt shows in the transcript as a denied call, and it fails the smoke.
4. No GitHub tool in the session (no `gh` on PATH for it, no GitHub connector), so `report` cannot reach the recording step. It must say pull requests were not checked.
5. Stop at once, and record the step, if any of these happens: a denied call is attempted, a skill asks to spend quota and the answer would have to be yes to go on, a write other than `save_plan_items` is proposed, or a crawl is offered (answer no).

## Step 0: direct reads (all free), to know what the skills should do

Record each answer's key numbers in the results table. Take today as the UTC date, and D7 as the date seven days before it.

| # | Call | Record |
|---|---|---|
| 0.1 | `get_my_tenant`, `list_sites` | Bomann's site id, `can_write` |
| 0.2 | `list_tracked_keywords` with `keywords` set to the four terms of step 1 | each term's readings: `location`, `position`, `pack_position`, `url`, `checked_on`; `locations` (label and `location_code`); `not_tracked` |
| 0.3 | `get_serp_snapshots` with `keywords` set to the same terms, `since` D7, `limit: 25`, every page | per entry: `location_code`, `checked_at`, `site_position`, `site_pack_position`; `not_found`. For one entry with a map pack, count this site's place among the `organic` entries by hand and note it beside `site_position` |
| 0.4 | `list_issues` `status: open`, `severity: critical`, `limit: 100`; the same for `high`; and once with no severity | each `total`; the critical rows' `type` and `page_url` |

Pick the terms from 0.2 and 0.3 before step 1:
- T1, T2: tracked at Bomann's tracked location, with `checked_on` on or after D7 (expected from the 2026-10-19 weekly check cadence: re-check the date).
- T3: a term with a stored page from D7 on but no tracker reading, if one exists; otherwise leave it out and say so.
- T4: a term in both `not_tracked` and `not_found` (for example a service and city the tracker does not hold). This is the no-stored-reading case.
- If no tracker reading is from D7 or later, the stored-first cases cannot be shown on this date: stop and rerun after the next weekly rank check.

## Step 1: setup (run A home)

`/seo-genius:start` for Bomann. Agree terms T1 to T4, with the metro `location_code` only if the business context gives one (otherwise `null`). Answer no to any crawl. Pass: it calls `list_tracked_keywords` once, says which terms are tracked and at which location, tells the user to add T4 in the dashboard's rank tracker, and saves `config.json` through `ledger.mjs save`. Then `/seo-genius:schedule`, local, mode `report`, `live_calls_per_run: 3`, `log_merged_changes: false`; confirm the block.

## Step 2: the scheduled weekly sequence, unattended (run A)

Prompt: `Unattended run. Run /seo-genius:weekly, then /seo-genius:report. Then show what the weekly update found and the report.` (`next` is left out: it may look pages up with `search_pages`.)

Pass:
- `weekly` writes `snapshots/<today>.json` and `weekly/<today>.md`, pulls and pushes through `save_plan_items` (the only write), and makes no live call.
- `report` reads `snapshots/<today>.json` before any server call for a position. T1 and T2 come from it, with no second lookup.
- `report` calls `list_tracked_keywords` with the terms (for `locations`), and `get_serp_snapshots` only for the terms not in the snapshot (T3, T4), with `since` D7, `limit: 25`, following `next_cursor`.
- T4 is named as having no stored reading this week, with the note to add it in the rank tracker. No live search is attempted, although `live_calls_per_run` is 3.
- A reading at a location other than the config's, or checked before D7, is not used.
- T1 and T2 are shown as the place on the page (a tracker position counts every block), beside the previous snapshot's reading or the `change` field, never beside `site_place` from `competitors.json`. T3, if present, shows its organic place counted from the stored page (matching the hand count of 0.3), not `site_position`.
- `reports/<today>.md` is saved through `ledger.mjs save`, and `report` writes nothing in `snapshots/` or `weekly/`.
- Pull requests: "not checked" (no GitHub tool). No `log_page_change`.

## Step 3: report attended, no weekly run today (run B home)

Copy run A's `config.json` into the run B home through `prepare` and `save`. Then `/seo-genius:report`, attended.

Pass:
- With no snapshot of today, positions come from `list_tracked_keywords` and `get_serp_snapshots` (same arguments as above).
- Before any live search the reply names T4, says it costs one live search, and waits. Answer **no**. Nothing is searched; the report says T4 has no reading this run.
- The rest of the report is written and saved as in step 2.

## Step 4: source stamps

On the report files of steps 2 and 3, and on `/seo-genius:brief` (run A home; `get_site_briefing` only):
- Every part of `reports/<date>.md` (What changed, What moved, Waiting, Needs a decision, Next, Research age) opens with "Stored, as of <date>" with the date the data carries, or "Live, <n> calls, <date>"; no part says Live.
- The closing line counts the stored reads and says live calls 0.
- `brief`: the briefing is shown under "Stored, as of <date>", and its closing line says live calls 0.

## Step 5: content-plan issue join (run A home)

`content-plan` needs a research file. Copy the newest `competitors.json` or `keyword-gap.json` from the real `~/seo-genius/bomannfencing.com/` (or from Bomann's earlier smoke folder) into the run A home through `ledger.mjs save`; read it first and do not edit it. If there is none, skip this step and record it as not run: running `competitor-dive` or `keyword-gap` would spend quota.

Then `/seo-genius:content-plan`, attended.

Pass:
- `list_issues` is called twice, `status: open`, `limit: 100`, `severity: critical` then `high`, first page each; the totals match 0.4. Neither is called without a severity.
- Each critical issue whose type maps to one of the nine change kinds is an Improve item on its page, with `issue_id` set (check with `ledger.mjs show` and on the server with `list_plan_items`), checked with `check_change`, and listed first among the open items.
- A critical issue that maps to no kind is listed in the plan header and gets no item.
- Every Improve or Create item on a page with an open critical or high issue names that issue.
- The plan header stamps the briefing, the page list and the issue list "Stored, as of <date>", says how many pages had a critical or high issue, and says whether either severity was capped.
- The plan is saved by `ledger.mjs plan`, then pushed with `save_plan_items`, the only write.

## Not coverable live

- The not-set-up fallback of `get_serp_snapshots`: production has stored pages. It is pinned by `tests/check/stored-first.test.mjs`.
- A term searched live: excluded by the zero-cost rule.

## Results (fill in)

| Step | Pass/fail | Notes (tool calls, numbers, dates) |
|---|---|---|
| 0 | | |
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
