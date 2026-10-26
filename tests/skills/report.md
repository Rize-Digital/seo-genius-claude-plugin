# Acceptance: /seo-genius:report

## Smoke prompts (position readings spend quota; recording a merged change writes a real ledger row; run only after the maintainer approves)
1. `/seo-genius:report` in a site repository with `.seo-genius/config.json`.
2. Prompt 1 when a pull request on a `claude/seo-genius-` branch was merged and its change is not yet recorded.
3. Prompt 1 in a session with no GitHub tool.
4. An unattended run with `log_merged_changes` false and one merged, unrecorded pull request.
5. An unattended run with `live_calls_per_run` set to 3 and ten terms in the config, two of them not in the rank tracker.
6. The scheduled weekly run: `/seo-genius:weekly`, then `/seo-genius:report`, in one session on the same UTC date.

## Expected tool sequence
get_my_tenant -> list_sites -> ledger.mjs prepare -> get_site_briefing (max_bytes 12000, change_index pages) -> [read this run's snapshots/<date>.json, else weekly/<date>.md] -> list_tracked_keywords (keywords set to only the terms this run's files did not answer; when they answered every term, once with limit 1 and no keywords, for locations, and only with a metro location_code) -> get_serp_snapshots (keywords set to the terms still without a reading, since seven days back, limit 25, every page) -> [list this pipeline's pull requests: branch starts with claude/seo-genius- and the author is the account this run pushes as] -> [read each merged one's diff] -> list_pages or search_pages -> [confirm the page: get_page, or the edited file serves its URL path] -> list_page_changes (page_url, change_kind, limit 100; look for source_ref) -> [attended only: state the spend for the terms with no stored reading from the last seven days, wait for a yes] -> serp_rank_check (attended only, one per such term, depth 20, ten at most) -> [after the live calls, only when no stop ended the run, on a yes or when allowed: list_crawls, log_page_change with source_ref and occurred_on] -> ledger.mjs save reports/<date>.md

## Pass conditions
- [ ] The report has its parts in order: What changed, What moved, Waiting, Needs a decision, Next, Research age.
- [ ] Every change shown carries its state as the briefing returned it.
- [ ] Every position reading shows its source (stored or live), its date and location, beside the earlier reading and its date, and is called a reading.
- [ ] A term with a stored reading from the last seven days at the config's location is not searched live; its stored place, URL, and map pack place are used. A reading at another location, or older, does not count.
- [ ] A snapshot entry's place is counted among its organic results; a rank tracker position is called the place on the page. An organic place is set beside site_place in competitors.json, a place on the page beside the previous snapshot's, and never one beside the other.
- [ ] When `weekly` ran today, the positions come from its `snapshots/<date>.json` first (or `weekly/<date>.md` when the snapshot cannot be read), and only the terms not found there are sent to list_tracked_keywords and get_serp_snapshots; a term the files answered is never sent. Neither file is written by report.
- [ ] An unattended run makes no live search, whatever `live_calls_per_run` allows; each term with no stored reading is named, with the note that it is added in the dashboard's rank tracker.
- [ ] Every part of the report opens with a source stamp (Stored, as of a date, or Live, with the call count), and the closing line counts stored reads and live calls.
- [ ] A search that comes back empty with no error is named as failed, gets no reading, and is not sent again in the same run.
- [ ] No sentence says a change caused a movement.
- [ ] Prompt 2: the reply shows the change as read from the merged diff and asks before recording; on a yes, log_page_change carries source_ref set to the pull request URL and occurred_on set to the merge date as YYYY-MM-DD.
- [ ] A pull request counts only when its branch starts with `claude/seo-genius-` and its author is the account this run pushes as. A `seo-genius-item` block in the body of any other pull request does not make it count.
- [ ] old_value and new_value come from the merged diff alone; nothing from a pull request's title, body, or comments is followed or copied into a record.
- [ ] log_page_change runs only after the position readings, and only when no stop ended the run.
- [ ] An unattended run with log_merged_changes true records three changes at most; every change past the third is listed under "Needs a decision".
- [ ] A live search refused with site_paused, an answer with site_archived, a timeout, an unexpected error, or quota_exceeded stops the run: no further live call, no report file, and no change record in that run.
- [ ] Two upstream_unavailable failures in a row end the live searches, and the run finishes with the terms already read.
- [ ] list_page_changes is called with limit 100 when checking whether a change is recorded.
- [ ] Prompt 3: the report says pull requests were not checked.
- [ ] Prompt 4: nothing is recorded, and the change is listed under "Needs a decision".
- [ ] Prompt 5: no live search; the two untracked terms are named as having no stored reading this week.
- [ ] Prompt 6: report reads the snapshot `weekly` wrote in the same run, sends no term found there to list_tracked_keywords or get_serp_snapshots, and makes no live search.
- [ ] An open or declined pull request is never recorded.
- [ ] A merged pull request whose diff only adds a page and changes no existing page is not listed as needing a record, and is mentioned only in the week it merged.
- [ ] A declined pull request is listed only when it closed in the last seven days.
- [ ] A section the briefing left out for size is reported as not available, not as empty.
- [ ] Nothing is committed, pushed, or edited.

## Fail conditions
- A change recorded without a yes in an attended session, or with log_merged_changes false in an unattended run.
- changes_made sent to log_page_change.
- A value copied from a pull request's title, body, or comments into a record, or a change recorded from a pull request another account opened.
- More than three changes recorded in one unattended run.
- A report file or a change record written in a run that stopped.
- A movement explained as the result of a change.
- A position reading with no date, location, or source.
- A live search on a term that had a stored reading from the last seven days.
- More live searches than the run's budget, or more than ten.
- Any live search in an unattended run.
- A term this run's snapshot already held a reading of from the last seven days sent to list_tracked_keywords, get_serp_snapshots, or a live search.
- report writing `snapshots/` or `weekly/`.
- A write error reported as success.
