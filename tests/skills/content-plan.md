# Acceptance: /seo-genius:content-plan

## Smoke prompts (no DataForSEO quota; only a separately authorized research-save write is permitted)
1. `/seo-genius:content-plan` in a repository that has both `.seo-genius/competitors.json` and `.seo-genius/keyword-gap.json`.
2. "What pages should I build next?" in a repository that has only `keyword-gap.json`.
3. `/seo-genius:content-plan` in a folder with neither research file.
4. Prompt 1 on a site where one target page had its title logged with `/seo-genius:log-change` in the last few days.

## Expected tool sequence
get_my_tenant -> list_sites -> list_research -> get_research(pipeline_config, competitor_dive, keyword_gap, prior content_plan) -> [validated local fallback] -> get_site_briefing -> list_pages (limit 100, five pages at most) -> check_change (one per Improve item, and one with change_kind internal_links per page a Create item links from) -> [save_research(content_plan/plan and metadata) when authorized] -> [optional local plan.md]

## Pass conditions
- [ ] No Data-for-SEO call is made.
- [ ] The topical map marks each slot covered, thin, or empty, and names the URL for a covered slot.
- [ ] Every backlog item names the research row it came from.
- [ ] Every Improve item, and every page a Create item links from, was checked with check_change before it was given a status.
- [ ] A check_change result whose page_verdict is WAIT puts the item in Waiting, even when its verdict is allow.
- [ ] A warn with pending_measurement puts the item in Waiting with its closing date; a would_revert block puts it in Dropped, also when frozen is beside it.
- [ ] A check_change result with a non-empty coach_history_not_readable puts the item under Unchecked, marked "history partly checked", and the plan header says so.
- [ ] A city page slot appears only where the research shows demand or competitor pages for that city.
- [ ] A page that exists and whose topic is missing or behind is marked thin and gets an Improve item.
- [ ] Prompt 4: the item on that page is waiting, with the date it opens, and is not in "This month".
- [ ] A page whose verdict is WAIT has no open item.
- [ ] When change_index.truncated is true, the reply says the index is incomplete, and each item still gets its status from the page_verdict that check_change returns.
- [ ] Twenty items at most; the first five are "This month".
- [ ] Every keyword volume in the plan appears in keyword-gap.json or in the briefing's Opportunities.
- [ ] Prompt 2: the plan is built, and the reply says what it lacks without the competitor file.
- [ ] Prompt 3: the reply stops and names the two skills to run first.
- [ ] The reply ends by saying how to act on an item: check with /seo-genius:brief, record with /seo-genius:log-change.

## Server research-store acceptance
- [ ] A new session without local files reads `competitor_dive.analysis`, `keyword_gap.analysis`, `pipeline_config.config`, and the prior `content_plan.plan` when they exist.
- [ ] Source research IDs, generation dates and prior plan ID are carried into `content_plan.metadata` when returned by the server; missing IDs are not fabricated.
- [ ] History is rechecked using live `check_change`, regardless of an earlier plan showing the same item as open.
- [ ] A persisted plan is not taken as proof of deployment or measured improvement.
- [ ] With approved write scope the plan is appended via `save_research` and `research.id` is verified; otherwise it is labeled NOT SAVED remotely.
- [ ] Tenant mismatches, dropped sections and absent research produce unknown/unchecked status, never a fabricated empty site.

## Fail conditions
- A page of the user's site edited.
- An unauthorized SEO Genius write, or a website change or page-change log entry.
- An open item on a frozen field, a page marked WAIT, or a field whose last change is still being measured.
- An item whose history was not checked, or only partly checked, placed in "This month" or "Later".
- A page per city for every service with no evidence for the city.
- A score, percentage, or traffic forecast that appears in no tool result or research file.
- An item with no evidence behind it.
