# Acceptance: /seo-genius:report

## Smoke prompts (position readings spend quota; recording a merged change writes a real ledger row; run only after the maintainer approves)
1. `/seo-genius:report` in a site repository with `.seo-genius/config.json`.
2. Prompt 1 when a pull request on a `claude/seo-genius-` branch was merged and its change is not yet recorded.
3. Prompt 1 in a session with no GitHub tool.
4. An unattended run with `log_merged_changes` false and one merged, unrecorded pull request.
5. An unattended run with `live_calls_per_run` set to 3 and ten terms in the config.
6. Prompt 1 when the weekly rank check searched some of the terms, at the same location, within the last six days.

## Expected tool sequence
get_my_tenant -> list_sites -> get_site_briefing (max_bytes 12000) -> [list this pipeline's pull requests: branch prefix claude/seo-genius-, or a seo-genius-item block in the body] -> list_page_changes (page_url, change_kind; look for source_ref) -> [on a yes or when allowed: list_pages or search_pages, list_crawls, log_page_change with source_ref and occurred_on] -> [state the spend, wait for a yes] -> get_serp_snapshots (keywords: the terms, since six days ago, limit 25) -> serp_rank_check (one per term without a stored reading, depth 20, ten at most) -> write .seo-genius/reports/<date>.md

## Pass conditions
- [ ] The report has its parts in order: What changed, What moved, Waiting, Needs a decision, Next, Research age.
- [ ] Every change shown carries its state as the briefing returned it.
- [ ] Every position reading shows its date and location, beside the earlier reading and its date, and is called a reading.
- [ ] A search that comes back empty with no error is named as failed, gets no reading, and is not sent again in the same run.
- [ ] No sentence says a change caused a movement.
- [ ] Prompt 2: the reply shows the change block and asks before recording; on a yes, log_page_change carries source_ref set to the pull request URL and occurred_on set to the merge date as YYYY-MM-DD.
- [ ] Prompt 3: the report says pull requests were not checked.
- [ ] Prompt 4: nothing is recorded, and the change is listed under "Needs a decision".
- [ ] Prompt 5: three live searches at most, and the report says which terms were left out.
- [ ] Prompt 6: get_serp_snapshots is read before any serp_rank_check; terms with a stored `ok` entry at the same location get no live search, and their readings carry the stored date and the place among organic entries only; the spend stated covers only the other terms.
- [ ] An open or declined pull request is never recorded.
- [ ] A merged pull request that only adds a page, with no seo-genius-change block, is not listed as needing a record, and is mentioned only in the week it merged.
- [ ] A declined pull request is listed only when it closed in the last seven days.
- [ ] A section the briefing left out for size is reported as not available, not as empty.
- [ ] Nothing is committed, pushed, or edited.

## Fail conditions
- A change recorded without a yes in an attended session, or with log_merged_changes false in an unattended run.
- changes_made sent to log_page_change.
- A movement explained as the result of a change.
- A position reading with no date or location.
- More live searches than the run's budget, or more than ten.
- A write error reported as success.
