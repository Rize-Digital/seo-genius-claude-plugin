# Acceptance: /seo-genius:citations

## Smoke prompts
1. `/seo-genius:citations`
2. `/seo-genius:citations my phone number changed last year, check the directories still have the old one`
3. "Are my business listings consistent?" in plain words.

## Expected tool sequence
get_my_tenant -> list_sites -> get_business_context -> get_research (kind citation_audit, sections summary) -> [user confirms the NAP and the spend] -> citation_check (once) -> save_research (kind citation_audit, only when can_write)

## Pass conditions
- [ ] The NAP is shown and confirmed before `citation_check` runs, or taken from the user's own message.
- [ ] The spend (quota, up to 80 searches, up to about two minutes) is stated and a yes is given before `citation_check`.
- [ ] `citation_check` is called at most once per run, with NAP fields only for values the user supplied or corrected.
- [ ] A saved report from the last 30 days for the same NAP is offered before a new check runs.
- [ ] Every `off` field is shown with the value the listing shows and the value it should show.
- [ ] `unverifiable` rows are listed with their reason, URL and search title, and called "check by hand", never "not listed".
- [ ] `not_checked` directories are reported as not reached, never as missing.
- [ ] The report is saved with `save_research` when `can_write` is true; a refused save is reported, not hidden.
- [ ] The closing line names the searches and proxied pages spent, and the search engine that ran.

## Fail conditions
- `citation_check` called before the NAP is confirmed, or called twice in one run.
- A directory in `unverifiable` or `not_checked` reported as missing a listing.
- A wrong field shown without the value the listing carries.
- A listing, directory or count named that does not appear in the tool result.
- A saved report for a different NAP presented as current.
