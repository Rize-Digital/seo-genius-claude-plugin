# Stored-first smoke plan, 1.5.0: Bomann Fencing and Test Tree Service

A live smoke of the 1.5.0 changes against production on two kinds of site, at zero cost: no Data-for-SEO call, no crawl, no AI detection, no Anthropic-billed work on the server, and no edit to either live site. The only server write allowed is `save_plan_items`.

| Site | Client | Kind | Mode |
|---|---|---|---|
| Bomann Fencing (bomannfencing.com) | `5d084767-14c1-42bd-b960-fd1d4cefb655` | Next.js site in a GitHub repository | Repo mode: a fresh local clone of `Rize-Digital/nextjs-bomann-fencing`; `.seo-genius/` at the clone root |
| Test Tree Service (wordpress-1463515-5538871.cloudwaysapps.com) | `751a2a00-62ec-49c2-b636-f2d3f569740a` | WordPress test site | No-repo workspace mode: an empty folder outside any repository, with `SEO_GENIUS_HOME` set to an empty scratch folder |

## Preconditions

1. Both sites are `active` in `list_sites`. An archived site answers `site_archived` to every site-scoped tool, so its part of the smoke cannot run until someone restores the site in the dashboard. Record it as blocked. Do not restore it from the smoke.
2. For each site, at least one tracker reading has a `checked_on` date of D7 or later. If none does, the stored-first cases cannot be shown on this date: rerun after the next weekly rank check.

## Guard rails (set before the first prompt)

1. Plugin under test: the head of `feat/stored-ranks-source-stamps`, loaded with `--plugin-dir <worktree>/plugins/seo-genius`. Disable the installed copy (`claude plugin disable seo-genius@seo-genius-plugins`) for the length of the smoke, so only the PR build loads. Check that the session's init lists seo-genius 1.5.0 from that folder. Re-enable the installed copy afterwards.
2. Every session is headless and isolated: `claude -p --output-format stream-json --verbose`, with its own working folder and its own `SEO_GENIUS_HOME`. Attended runs answer questions by resuming the same session (`--resume <id>`).
3. Deny these tools in the session settings (`permissions.deny`) and with `--disallowedTools`, for both the plugin server (`mcp__plugin_seo-genius_seo-genius__`) and the claude.ai connector (`mcp__claude_ai_SEO_Genius__`):
   - paid: `serp_rank_check`, `keyword_research`, `ranked_keywords`, `competitor_domains`, `keyword_gap`, `search_pages`
   - crawl and detection: `trigger_crawl`
   - every other write: `log_page_change`, `mark_issue_fixed`, `create_issue`, `update_issue`, `reject_issue`, `update_business_context`, `save_research`

   A denied tool is removed from the session's tool list, so an attempt comes back as "No such tool available". Any such error in the transcript fails the smoke.
4. Never push and never touch a remote. In repo mode, also deny `Bash(git push:*)`, `Bash(gh:*)` and the GitHub connector, and set the clone's push URL to an invalid one. Make no change to the clone's branches or tags. With no GitHub tool, `report` must say that pull requests were not checked, and `next` stays a proposal.
5. Live site byte check (Test Tree Service): fetch the home page, `/sitemap.xml` and one service page twice before the first prompt (to show they are stable), then once after the last one. Compare the sha256 of each. Any difference fails the smoke.
6. Record every MCP call from the stream-json log: tool, count, time from call to result (ms), and ok or error. Also record any ECONNRESET or retry, and how many plan items and ledger runs the smoke added on the server (`list_plan_items` before and after).
7. Stop at once, and record the step, if any of these happens: a denied call is attempted, a skill asks to spend quota and the answer would have to be yes to go on, a write other than `save_plan_items` is proposed, or a crawl is offered (answer no).

## Step 0: direct reads (all free), to know what the skills should do

For each site, record each answer's key numbers in the results table. Take today as the UTC date, and D7 as the date seven days before it.

| # | Call | Record |
|---|---|---|
| 0.1 | `get_my_tenant`, `list_sites` | the site id, its `status`, `can_write` |
| 0.2 | `list_tracked_keywords` with `keywords` set to the site's terms | each term's readings: `location`, `position`, `pack_position`, `url`, `checked_on`; `locations` (label and `location_code`); `not_tracked` |
| 0.3 | `get_serp_snapshots` with `keywords` set to the same terms, `since` D7, `limit: 25`, every page | per entry: `location_code`, `checked_at`, `site_position`, `site_pack_position`; `not_found`. For one entry with a map pack, count this site's place among the `organic` entries by hand and note it beside `site_position` |
| 0.4 | `list_issues` `status: open`, `severity: critical`, `limit: 100`, following `next_cursor` to the end; the same for `high`; and once with no severity | each `total` and the rows read; the critical rows' `type` and `page_url` |
| 0.5 | `list_plan_items`, `list_applied_fixes`, `list_research` | the counts before the smoke; whether stored research exists that `content-plan` could reuse at no cost |
| 0.6 | each other free read the skills use: `get_site_briefing`, `get_business_context`, `list_crawls`, `list_pages`, `get_page`, `list_page_changes`, `check_change` | the call works and gives a sane answer |

Pick the terms from 0.2 and 0.3 before step 1:
- T1, T2: tracked at the site's tracked location, with `checked_on` on or after D7.
- T3: a term with a stored page from D7 on but no tracker reading, if one exists. Otherwise leave it out and say so.
- T4: a term in both `not_tracked` and `not_found`, for example a service and city the tracker does not hold. This is the no-stored-reading case.

## Step 1: setup, attended (run A folder)

`/seo-genius:start` for the site. Agree terms T1 to T4, with the metro `location_code` only if the business context gives one (otherwise `null`). Answer no to any crawl.

Pass:
- `start` calls `list_tracked_keywords` once.
- It says which terms are tracked and at which location.
- It tells the user to add T4 in the dashboard's rank tracker.
- It saves `config.json` through `ledger.mjs save`.

Then `/seo-genius:schedule`: local, mode `report`, `live_calls_per_run: 3`, `log_merged_changes: false`. Confirm the block.

## Step 2: the scheduled weekly sequence, unattended (run A)

Prompt: `Unattended run. Run /seo-genius:weekly, then /seo-genius:report, then /seo-genius:next. Then show what the weekly update found, the report, and what next delivered.`

Pass:
- `weekly`:
  - writes `snapshots/<today>.json` and `weekly/<today>.md`;
  - pulls and pushes through `save_plan_items`, the only write;
  - makes no live call.
- `report` reads `snapshots/<today>.json` before any server call for a position. T1 and T2 come from it, with no second lookup: neither is sent to `list_tracked_keywords` or `get_serp_snapshots`.
- `report` then calls `list_tracked_keywords` with only the terms not in the snapshot (T3, T4; its first page also gives `locations`). Next it calls `get_serp_snapshots` with only the terms still without a reading, with `since` D7 and `limit: 25`, following `next_cursor`.
- T4 is named as having no stored reading this week, with the note to add it in the rank tracker. No live search is attempted, although `live_calls_per_run` is 3.
- A reading at a location other than the config's, or checked before D7, is not used.
- T1 and T2 are shown as the place on the page, because a tracker position counts every block. Each is set beside the previous snapshot's reading or the `change` field, never beside `site_place` from `competitors.json`. If T3 is present, it shows its organic place counted from the stored page. That place matches the hand count of 0.3, not `site_position`.
- `reports/<today>.md` is saved through `ledger.mjs save`. `report` writes nothing in `snapshots/` or `weekly/`.
- Pull requests are "not checked" (no GitHub tool). No `log_page_change`.
- `next` (mode `report`):
  - with a plan, it writes `reports/<today>-next.md` as a proposal, through `save`;
  - with no plan, it stops and says to run `content-plan`;
  - it edits no site file, creates no branch and opens no pull request.

## Step 3: weekly, report and next, attended (run B folder)

A second fresh folder: in repo mode, a second clone; in workspace mode, a second `SEO_GENIUS_HOME`. Copy run A's `config.json` in through `prepare` and `save`.

1. `/seo-genius:report` first, with no snapshot of today:
   - Positions come from `list_tracked_keywords` and `get_serp_snapshots`, with the same arguments as above.
   - Before any live search, the reply names T4, says it costs one live search, and waits. Answer **no**. Nothing is searched, and the report says T4 has no reading this run.
   - The rest of the report is written and saved as in step 2.
2. `/seo-genius:weekly`, attended. The same pass as step 2's `weekly`.
3. `/seo-genius:next`, attended. Answer that only a proposal is wanted. Pass: a proposal (or "no plan"), no site file changed, no branch, no push.

## Step 4: the weekly-file fallback (run C, a copy of run A)

Copy run A's folder and move `snapshots/<today>.json` out of the site folder in the copy. Then `/seo-genius:report`, attended.

Pass: T1 and T2 come from `weekly/<today>.md` ("Rankings that moved", or "no moves"). Only the terms not there go to the server. The reply says the snapshot could not be read.

## Step 5: source stamps

Check the report files of steps 2 to 4, and `/seo-genius:brief` (run A; `get_site_briefing` only):
- Every part of `reports/<date>.md` (What changed, What moved, Waiting, Needs a decision, Next, Research age) opens with "Stored, as of <date>", using the date the data carries, or "Live, <n> calls, <date>". No part says Live.
- The closing line counts the stored reads and says live calls 0.
- `brief`: the briefing is shown under "Stored, as of <date>", and its closing line says live calls 0.
- The weekly file and the `next` proposal carry stamps too.

## Step 6: content-plan issue join (run A)

`content-plan` needs a research file. Reuse one only when it costs nothing: the newest `competitors.json` or `keyword-gap.json` from an earlier local run, or stored research the server returns from `get_research`. Bring it into run A's folder through `ledger.mjs save`; read it first and do not edit it. If there is none, record this step as N/A with that reason: running `competitor-dive` or `keyword-gap` would spend quota.

Then `/seo-genius:content-plan`, attended.

Pass:
- `list_issues` is read for `severity: critical`, then `high`, with `status: open` and `limit: 100`. Each read follows `next_cursor` until it is null. The rows read match the totals of 0.4. Neither severity is read without its filter.
- Each critical issue whose type maps to one of the nine change kinds is an Improve item on its page:
  - its `issue_id` is set (check with `ledger.mjs show`, and on the server with `list_plan_items`);
  - it is checked with `check_change`;
  - it is listed first among the open items.
- A critical issue that maps to no kind is listed in the plan header and gets no item.
- Every Improve or Create item on a page with an open critical or high issue names that issue.
- The plan header stamps the briefing, the page list and the issue list "Stored, as of <date>". It says how many pages had a critical or high issue, and whether a read of either severity stopped before its last page.
- The plan is saved by `ledger.mjs plan`, then pushed with `save_plan_items`, the only write.

## Step 7: ledger sync

After the last run on each site:
- `list_plan_items` matches `ledger.mjs show` in every folder that pushed: the same ids, statuses and `issue_id`s.
- `list_applied_fixes` was read by `weekly`, and its rows are in `changelog.md`.
- The counts added on the server are recorded, against 0.5.

## Not coverable live

- The not-set-up fallback of `get_serp_snapshots`: production has stored pages. It is pinned by `tests/check/stored-first.test.mjs`.
- A term searched live: excluded by the zero-cost rule.

## Results (fill in, per site)

| Step | Bomann Fencing | Test Tree Service | Notes (tool calls, numbers, dates) |
|---|---|---|---|
| Preconditions | | | |
| 0 | | | |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| Byte check | n/a | | |
