# Acceptance: /seo-genius:report

## Smoke prompts (position readings spend quota; recording a merged change writes a real ledger row; run only after the maintainer approves)
1. `/seo-genius:report` in a site repository with `.seo-genius/config.json`.
2. Prompt 1 when a pull request on a `claude/seo-genius-` branch was merged and its change is not yet recorded.
3. Prompt 1 in a session with no GitHub tool.
4. An unattended run with `log_merged_changes` false and one merged, unrecorded pull request.
5. An unattended run with `live_calls_per_run` set to 3 and ten terms in the config.

## Expected tool sequence
get_my_tenant -> list_sites -> get_site_briefing (max_bytes 12000, change_index pages) -> [list this pipeline's pull requests: branch starts with claude/seo-genius- and the author is the account this run pushes as] -> [read each merged one's diff] -> list_pages or search_pages -> [confirm the page: get_page, or the edited file serves its URL path] -> list_page_changes (page_url, change_kind, limit 100; look for source_ref) -> [state the spend, wait for a yes] -> serp_rank_check (one per term, depth 20, ten at most) -> [after the live calls, only when no stop ended the run, on a yes or when allowed: list_crawls, log_page_change with source_ref and occurred_on] -> write .seo-genius/reports/<date>.md

## Pass conditions
- [ ] The report has its parts in order: What changed, What moved, Waiting, Needs a decision, Next, Research age.
- [ ] Every change shown carries its state as the briefing returned it.
- [ ] Every position reading shows its date and location, beside the earlier reading and its date, and is called a reading.
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
- [ ] Prompt 5: three live searches at most, and the report says which terms were left out.
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
- A position reading with no date or location.
- More live searches than the run's budget, or more than ten.
- A write error reported as success.
