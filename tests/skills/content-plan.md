# Acceptance: /seo-genius:content-plan

## Smoke prompts (no Data-for-SEO quota is spent; nothing is written to SEO Genius)
1. `/seo-genius:content-plan` in a repository that has both `.seo-genius/competitors.json` and `.seo-genius/keyword-gap.json`.
2. "What pages should I build next?" in a repository that has only `keyword-gap.json`.
3. `/seo-genius:content-plan` in a folder with neither research file.
4. Prompt 1 on a site where one target page had its title logged with `/seo-genius:log-change` in the last few days.

## Expected tool sequence
get_my_tenant -> list_sites -> [read the research files and config] -> get_site_briefing -> list_pages (limit 100, five pages at most) -> check_change (one per Improve item, and one with change_kind internal_links per page a Create item links from) -> write .seo-genius/plan.md

## Pass conditions
- [ ] No Data-for-SEO call is made.
- [ ] The topical map marks each slot covered, thin, or empty, and names the URL for a covered slot.
- [ ] Every backlog item names the research row it came from.
- [ ] Every Improve item, and every page a Create item links from, was checked with check_change before it was given a status.
- [ ] A check_change result whose page_verdict is WAIT puts the item in Waiting, even when its verdict is allow.
- [ ] A warn with pending_measurement puts the item in Waiting with its closing date; a would_revert block puts it in Dropped.
- [ ] A city page slot appears only where the research shows demand or competitor pages for that city.
- [ ] A page that exists and whose topic is missing or behind is marked thin and gets an Improve item.
- [ ] Prompt 4: the item on that page is waiting, with the date it opens, and is not in "This month".
- [ ] A page whose verdict is WAIT has no open item.
- [ ] When change_index.truncated is true, the reply says the index is incomplete, and each item still gets its status from the page_verdict that check_change returns.
- [ ] Twenty items at most; the first five are "This month".
- [ ] Every keyword volume in the plan appears in keyword-gap.json.
- [ ] Prompt 2: the plan is built, and the reply says what it lacks without the competitor file.
- [ ] Prompt 3: the reply stops and names the two skills to run first.
- [ ] The reply ends by saying how to act on an item: check with /seo-genius:brief, record with /seo-genius:log-change.

## Fail conditions
- A page of the user's site edited.
- Any SEO Genius write tool called.
- An open item on a frozen field, a page marked WAIT, or a field whose last change is still being measured.
- An item marked "history not checked" placed in "This month".
- A page per city for every service with no evidence for the city.
- A score, percentage, or traffic forecast that appears in no tool result or research file.
- An item with no evidence behind it.
