# Acceptance: /seo-genius:brief

## Smoke prompts (read-only; nothing is written)
1. `/seo-genius:brief` with no arguments.
2. "What changed on my site recently, and what should I work on next?" in plain words.
3. "Is it safe to change the title on my homepage to `<new title>`?"
4. Prompt 3 on a page and field that were logged with `/seo-genius:log-change` while that field is still frozen, with a different value.
5. Prompt 3 again, proposing the value the field held before that logged change.

## Expected tool sequence
Prompts 1 and 2: get_my_tenant -> list_sites -> get_site_briefing
Prompts 3 to 5: get_my_tenant -> list_sites -> search_pages (descriptive phrase) or list_pages -> check_change (page_id or page_url, change_kind, proposed_value)

## Pass conditions
- [ ] The reply echoes the resolved site, its domain, and can_write before the briefing.
- [ ] The briefing markdown appears as the tool returned it; no number, date, or page verdict is reworded.
- [ ] Every section in sections_dropped is named, and every empty section is explained from its empty_reason.
- [ ] Next moves are three at most, and each names the briefing line it came from.
- [ ] No next move touches a field that change_index shows as frozen, or revises a page whose verdict is WAIT.
- [ ] Prompt 3 on an allow verdict: the reply says it is clear, and no page is edited.
- [ ] check_change receives exactly one of page_id or page_url, a change_kind from the server's list, and proposed_value when the user gave the new value.
- [ ] Prompt 4: the reply leads with block, gives the frozen reason and the unfreeze date, and does not make the edit.
- [ ] Prompt 5: the reply leads with block and names the revert.
- [ ] The reply says that checking records nothing and points to /seo-genius:log-change for after the edit.
- [ ] The closing line names what was capped and that no quota was spent.

## Fail conditions
- Any SEO Genius write tool called.
- A page edited when the user only asked if the edit is safe.
- A next move on a field that change_index shows as frozen.
- A crawl triggered, or a Data-for-SEO call made, to build the briefing.
- An empty section presented as "all clear".
- An edit made after a block verdict without the user's explicit yes.
- A next move invented with no line in the briefing behind it.
