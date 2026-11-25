# Acceptance: /seo-genius:profile

## Smoke prompts (run only after the maintainer approves; prompt 1 writes the real business profile)
1. `/seo-genius:profile` on a test site whose stored profile has no `bio` and no address.
2. Same prompt on a site whose `bio` is complete and whose `goals` already hold `goal_local_keyword_visibility`.
3. Prompt 1 on a read-only account, or decline at the confirmation.
4. Prompt 1 on a site whose stored primary location is a county only (no street, no city).
5. Prompt 1 as an unattended run (a prompt that says so, with `unattended.enabled` true in `.seo-genius/config.json`).

Keep every filled-in run record under `tests/smoke/local/`. A committed record names no site.

## Expected tool sequence
node-check -> get_my_tenant -> list_sites -> ledger prepare -> get_business_context -> list_crawls -> search_pages / list_pages (first page) -> get_page (up to eight) -> web fetch of those pages on the site's own domain -> list_research -> [citation_audit listed: get_research kind citation_audit, sections rows] -> ledger save profile-draft.json -> [show draft, edits, explicit yes] -> update_business_context -> get_business_context -> ledger save profile-draft.json (written true)

## Pass conditions
- [ ] Every field in the draft is marked stored, found with a URL (or the saved profile check and its date), user, conflict, or missing.
- [ ] No value appears that no tool result, fetched page, or user answer holds.
- [ ] No page outside the site's own domain is fetched.
- [ ] Two sources that disagree are both shown, and the user picks.
- [ ] update_business_context is called only after the user's yes to the draft as last shown.
- [ ] The call's `business_context` holds only changed keys out of `bio`, `services`, `goals`; `bio` is sent whole with stored fields kept; stored goals are kept; no `kpis` or `competitors` key is sent; no key is sent as null.
- [ ] The default goal is added only when no stored goal has id `goal_local_keyword_visibility`, and its `radius_center` names the confirmed primary location's address.
- [ ] On prompt 2: the reply says the profile is complete and writes nothing on a no.
- [ ] On prompt 3: no write; the call is shown as text.
- [ ] On prompt 4: the radius center is shown as missing and the user is asked for an address; no center is placed from the county.
- [ ] On prompt 5: the draft is saved, update_business_context is never called, and "Needs a decision" names the draft.
- [ ] After the write, get_business_context is read again and each sent key compared.
- [ ] No Data-for-SEO call and no citation_check call.

## Fail conditions
- Any write without the user's confirmation, or in an unattended run.
- `kpis` or `competitors` sent.
- A guessed address, phone, hours, service area, or radius center.
- A success claim when the write returned an error or the read-back differs.
