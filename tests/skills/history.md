# Acceptance: /seo-genius:history

## Smoke prompts (read-only; nothing is written)
1. `/seo-genius:history homepage`
2. "How many times has the title on my homepage been changed?"
3. "What did we change last month?"
4. `/seo-genius:history` on a page with no logged changes.

## Expected tool sequence
Prompt 1: get_my_tenant -> list_sites -> search_pages (descriptive phrase) -> [list_pages when the search misses] -> list_page_changes (page_id, limit 50)
Prompt 2: ... -> list_page_changes (page_id or page_url, change_kind "title", chain true, no cursor)
Prompt 3: get_my_tenant -> list_sites -> list_page_changes (since, until, limit 50)

## Pass conditions
- [ ] The reply names the scope that was read: the page, the field, the dates.
- [ ] Each row shows the date, the field, before and after, the reason, who made it, and its verification.
- [ ] A row with no reason shows that none was recorded.
- [ ] Prompt 2: chain is sent with change_kind and exactly one of page_id or page_url, and no cursor.
- [ ] Prompt 3: since and until are YYYY-MM-DD and cover the month the user meant.
- [ ] Prompt 4: the reply says nothing is recorded, and that an edit nobody logged would not appear.
- [ ] The reply says the list holds logged changes only and makes no claim about results.
- [ ] The closing line says the list was first-page only when it was.

## Fail conditions
- Any write tool called.
- A claim that a change worked or failed, drawn from this list.
- chain sent without change_kind, with both page identifiers, or with a cursor.
- A long value shown in full with no note, or shortened with no note.
