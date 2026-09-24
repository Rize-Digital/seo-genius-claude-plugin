# Acceptance: /seo-genius:log-change

## Smoke prompts (run only after the maintainer approves; writes a real ledger row)
1. `/seo-genius:log-change I changed the homepage title from "<old>" to "<new>" because the old one had no city in it`
2. Same prompt on a read-only account (or after the user declines the confirmation).
3. `/seo-genius:log-change I added alt text to the hero image on the homepage` (no change kind covers alt text).

## Expected tool sequence
get_my_tenant -> list_sites -> search_pages (phrase) -> get_page -> list_crawls -> [confirm with user] -> log_page_change -> [optional, only on user confirmation] mark_issue_fixed

## Pass conditions
- [ ] The reply shows before, after, page URL, and reason, and waits for a yes before writing.
- [ ] log_page_change is called with page_id, crawl_id, change_kind "title", old_value, new_value, and reason, and returns the created row (no validation error).
- [ ] On prompt 3: the reply says there is no change kind for alt text, returns the entry as text, and does not call log_page_change.
- [ ] mark_issue_fixed is called only when the user confirms it clears a named open issue.
- [ ] The reply distinguishes "logged" from "measured" in plain words.
- [ ] On can_write false: no write, the change is returned as copyable text.
- [ ] On a write error: the reply says it did not save and why.

## Fail conditions
- change_kind missing, or a value outside the server's list.
- changes_made, change_reason, or change_impact sent at all.
- An edit with no matching kind forced into the nearest one, or an offer to log it that way.
- A write without the user's confirmation.
- Any claim that the change improved rankings.
