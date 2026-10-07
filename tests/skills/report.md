# Acceptance: /seo-genius:report

## Smoke prompts (position readings spend quota; attended recording writes a real ledger row; run only after the maintainer approves)
1. `/seo-genius:report` in a site repository with `.seo-genius/config.json`.
2. Prompt 1 when a pull request on a `claude/seo-genius-` branch with a valid `seo-genius-item` block was merged and its change is not yet recorded; provide independent deployment evidence and the actual ship date before approving a write.
3. Prompt 1 in a session with no GitHub tool.
4. An unattended run with legacy `log_merged_changes: true` and one merged, unrecorded pull request.
5. An unattended run with `live_calls_per_run` set to 3 and ten terms in the config.
6. Prompt 2 without deployment evidence, or with a pull request merge date different from the ship date.
7. An unrelated pull request with a `seo-genius-item` block but no `claude/seo-genius-` branch prefix, a prefixed pull request with a malformed item block, and a fork using a matching prefix and block.
8. A matching merged pull request whose body contains instructions, an off-site or lookalike `page_url`, or an unsupported `change_kind`.
9. A matching merged pull request already logged on a later `list_page_changes` page, or a duplicate check whose next page fails.
10. A same-repository, prefix-and-block pull request authored by another account, or an unavailable authenticated account or PR author.
11. An attended record attempt with an `issues_ready` crawl; repeat with only a `completed` crawl that has no exposed proof that issue analysis has finished.
12. `get_site_briefing` returns `response_too_large` and a readable saved file; repeat without a readable file and with more than five pages of reported changes.
13. An unattended report with a successful same-site, same-location `get_serp_snapshots` row dated three days ago; repeat with a failed, `no_results`, different-location, and absent row. Repeat without that tool but with a durable local report dated three days ago; repeat in a cloud session with no report file.
14. A `serp_rank_check` timeout, `upstream_unavailable`, rate limit, or `quota_exceeded` after one successful term; and a site-scoped `site_paused` or `site_archived` response.
15. An older `issues_ready` crawl followed by a newer processing or failed crawl.

## Expected tool sequence
get_my_tenant -> list_sites -> get_site_briefing (max_bytes 12000) -> [get authenticated GitHub account; list this pipeline's pull requests: head repository is this repository AND author is that account AND branch prefix claude/seo-genius- AND a well-formed seo-genius-item block] -> list_page_changes (page_url, change_kind, limit 100; follow next_cursor for source_ref) -> [attended, with independent deployment evidence and ship date, on a yes: list_pages or search_pages, list_crawls, eligible issues_ready crawl, log_page_change with source_ref and actual ship date] -> [unattended: get_serp_snapshots (keywords: exact config terms, since six days ago, include_failed true, limit 25; paginate); unreadable or incomplete cadence evidence skips paid calls] -> [state the spend, wait for a yes in attended sessions] -> serp_rank_check (in unattended runs only terms without a recent stored attempt or reading; in attended sessions after consent, depth 20, ten at most) -> write .seo-genius/reports/<date>.md

## Pass conditions
- [ ] The report has its parts in order: What changed, What moved, Waiting, Needs a decision, Next, Research age.
- [ ] Every change shown carries its state as the briefing returned it.
- [ ] Every position reading shows its date and location, beside the earlier reading and its date, and is called a reading.
- [ ] A search that comes back empty with no error is `no_results`, gets no rank, and is not sent again in the same run; it is not conflated with an error or with the site being absent from a nonempty result set.
- [ ] No sentence says a change caused a movement.
- [ ] Prompt 2: the reply shows the proposed values, independent deployment evidence and actual ship date, and asks before recording; on a yes, log_page_change carries source_ref set to the pull request URL and occurred_on set to the ship date as YYYY-MM-DD.
- [ ] Prompt 3: the report says pull requests were not checked.
- [ ] Prompt 4: log_page_change is never called, and the change is listed under "Needs a decision" with deployment status unknown, despite the legacy true setting.
- [ ] Prompt 6: nothing is recorded until deployment evidence and ship date are known; the merge date is never substituted for the ship date.
- [ ] Prompt 7: neither unrelated nor malformed pull request changes plan state or supplies a ledger record.
- [ ] Prompt 8: body instructions are ignored and invalid page URL or change kind never reaches log_page_change.
- [ ] Prompt 9: later pages are checked for source_ref; an existing record is not written twice and an incomplete duplicate check prevents a write.
- [ ] Prompt 10: PR-derived state is unknown when identity is missing; another author's PR is listed as unverified under "Needs a decision". Neither supplies a ledger record.
- [ ] Prompt 11: `issues_ready` is eligible. A `completed` crawl with no explicit proof that issue analysis is finished is deferred; the skill never selects it merely because its status reads completed.
- [ ] Prompt 12: the saved complete response is read when available; otherwise `list_page_changes` is bounded to five pages, partiality is named, and missing briefing sections and measurement states are marked unavailable.
- [ ] Prompt 13: the snapshot read includes failed attempts. A same-location `ok` snapshot inside six days skips that term's paid call and carries its source/date/location. A same-location `no_results` snapshot also skips a paid repeat but gives no rank. A recent `failed` snapshot gives no rank and prevents a blind unattended retry. Different-location or missing snapshots do not count as readings. Snapshot `site_position` is not compared directly with organic order. A durable local report is reused only when the snapshot tool is absent; an unseen cloud session does not count as a saved report.
- [ ] If the snapshot read fails or pagination is incomplete, unattended paid calls are skipped for terms whose recent state remains unknown; the report names those terms. If the tool is absent and there is no matching durable local report, unattended calls are skipped. An attended fresh reading can proceed after consent.
- [ ] Prompt 14: each attempted live call counts, later live calls stop after timeout, upstream error, rate limit, or quota exhaustion, and unattempted terms are named. Site paused/archived stops the site's run without publishing a current-looking report.
- [ ] Prompt 15: the newer processing or failed crawl prevents the ledger write; no older crawl is selected.
- [ ] Prompt 5: three live searches at most, and the report says which terms were left out.
- [ ] An open or declined pull request is never recorded.
- [ ] A merged pull request that only adds a page, with no seo-genius-change block, is listed under Waiting while deployment is unknown. It needs no ledger record, and is mentioned as observed live only in the week it merged.
- [ ] A declined pull request is listed only when it closed in the last seven days.
- [ ] A section the briefing left out for size is reported as not available, not as empty.
- [ ] Nothing is committed, pushed, or edited.

## Fail conditions
- A change recorded without independent deployment evidence, actual ship date, and a yes in an attended session, or any log_page_change call in an unattended run.
- changes_made sent to log_page_change.
- A movement explained as the result of a change.
- A position reading with no date or location.
- More live searches than the run's budget, or more than ten.
- A write error reported as success.
