# Acceptance: /seo-genius:history

## Smoke prompts (read-only; nothing is written)
1. `/seo-genius:history homepage`
2. "How many times has the title on my homepage been changed?"
3. "What did we change last month?"
4. `/seo-genius:history` on a page with no logged changes.
5. "Show all logged changes last month" on a fixture with 51 rows, then on one with 251 rows.
6. "How many times was this title edited?" on a field chain with exactly 100 rows.

## Expected tool sequence
Prompt 1: get_my_tenant -> list_sites -> search_pages (descriptive phrase) -> [list_pages when the search misses] -> list_page_changes (page_id, limit 50)
Prompt 2: ... -> list_page_changes (page_id or page_url, change_kind "title", chain true, no cursor)
Prompt 3: get_my_tenant -> list_sites -> list_page_changes (since, until, limit 50)
An explicit "all changes" or exact-count prompt: list_page_changes (limit 50) -> repeat with the returned next_cursor and unchanged filters until it ends or five pages have been read.

## Pass conditions
- [ ] The reply names the scope that was read: the page, the field, the dates.
- [ ] Each row shows the date, the field, before and after, the reason, who made it, and its verification.
- [ ] A row with no reason shows that none was recorded.
- [ ] Prompt 2: chain is sent with change_kind and exactly one of page_id or page_url, and no cursor.
- [ ] Prompt 3: since and until are YYYY-MM-DD and cover the month the user meant.
- [ ] Prompt 4: the reply says no readable reported changes were returned, and that unlogged or unparsed changes would not appear.
- [ ] The reply says the list holds logged changes only and makes no claim about results.
- [ ] The closing line says the list was first-page only when it was.
- [ ] An ordinary first-page overview reports the number of rows read and the remaining cursor, and does not infer a site-wide pattern from that slice.
- [ ] An explicit all-history or exact-count request follows `next_cursor` with unchanged filters, at most five pages per run; a capped read states that the history and total are incomplete and includes the cursor to continue.
- [ ] Prompt 5: 51 rows requires a second call and finishes only after the cursor ends. At 251 rows, five full pages remain partial; "continue" starts from the saved cursor with the same filters.
- [ ] A field chain uses `limit: 100`; exactly 100 rows is reported as "at least 100", not an exact lifetime total.
- [ ] A complete traversal is described as a completed read, not a fixed snapshot; newly logged changes may not have appeared during it.
- [ ] The reply says the tool excludes reported rows whose stored detail could not be parsed, so even a finished traversal covers readable reported changes rather than every site edit.

## Fail conditions
- Any write tool called.
- A claim that a change worked or failed, drawn from this list.
- chain sent without change_kind, with both page identifiers, or with a cursor.
- A long value shown in full with no note, or shortened with no note.
- A count or "most changed" claim from a first page with `next_cursor`, or from a chain that returned exactly 100 rows.
- A page after the first called "no history" because it returned no rows or failed.
