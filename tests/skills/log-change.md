# Acceptance: /seo-genius:log-change

## Smoke prompts (run only after the maintainer approves; writes a real ledger row)
1. `/seo-genius:log-change I changed the homepage title from "<old>" to "<new>" because the old one had no city in it`
2. Same prompt on a read-only account (or after the user declines the confirmation).
3. `/seo-genius:log-change I added alt text to the hero image on the homepage` (no change kind covers alt text).
4. Prompt 1 a second time on the same page with a different new title, while the first is still frozen.
5. `/seo-genius:log-change I am about to change the homepage title to "<new>"` (the edit has not shipped).

## Expected tool sequence
get_my_tenant -> list_sites -> search_pages (phrase) -> [on mode "text" with no match: search_pages once more with two or three title or H1 words] -> get_page -> list_crawls -> check_change (page_id, change_kind, proposed_value) -> [confirm with user] -> log_page_change -> [optional, only on user confirmation] mark_issue_fixed

## Pass conditions
- [ ] When the first search_pages call returns mode "text" and no match, exactly one more search_pages call runs with two or three title or H1 words before list_pages.
- [ ] A list_pages fallback call carries no q.
- [ ] The reply shows before, after, page URL, and reason, and waits for a yes before writing.
- [ ] check_change is called with page_id, change_kind "title", and the new title before the confirmation.
- [ ] log_page_change is called with page_id, crawl_id, change_kind "title", old_value, new_value, and reason, and returns the created row (no validation error).
- [ ] On prompt 3: the reply says there is no change kind for alt text, returns the entry as text, and does not call log_page_change.
- [ ] On prompt 4: the entry carries a history note with the frozen reason, and the write still happens on the user's yes.
- [ ] On prompt 5: nothing is logged, and the reply gives the check_change verdict as advice.
- [ ] source_ref is sent only when the user gave a pull request URL or commit SHA, or the session made the commit.
- [ ] mark_issue_fixed is called only when the user confirms it clears a named open issue.
- [ ] The reply distinguishes "logged" from "measured" in plain words.
- [ ] On can_write false: no write, the change is returned as copyable text.
- [ ] On a write error: the reply says it did not save and why.

## Fail conditions
- change_kind missing, or a value outside the server's list.
- changes_made, change_reason, or change_impact sent at all.
- An edit with no matching kind forced into the nearest one, or an offer to log it that way.
- A write without the user's confirmation.
- A shipped change left unlogged because check_change returned block.
- A change logged that the user said has not shipped.
- A source_ref the user did not give and the session does not show.
- Any claim that the change improved rankings.
