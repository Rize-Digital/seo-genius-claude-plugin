# Acceptance: /seo-genius:citations

## Smoke prompts
1. `/seo-genius:citations`
2. `/seo-genius:citations my phone number changed last year, check the directories still have the old one`
3. "Are my business listings consistent?" in plain words.
4. `/seo-genius:citations` and answer the other-names question with one trading name and one tracking number.
5. `/seo-genius:citations` and answer the old-address question with one street address in another town.
6. `/seo-genius:citations` on a site whose Google Business Profile is not connected.

## Expected tool sequence
get_my_tenant -> list_sites -> get_business_context -> get_research (kind citation_audit, sections summary) -> [user confirms the NAP, answers the other-names and old-address questions, and agrees to the spend] -> citation_check (once) -> save_research (kind citation_audit, only when can_write)

## Pass conditions
- [ ] The NAP is shown and confirmed before `citation_check` runs, or taken from the user's own message.
- [ ] The other-names question ("any other name, or another phone number, such as a tracking line?") and the old-address question ("Have you moved, or listed another address in the past?") are asked once, in the same message as the NAP, unless the user already answered them.
- [ ] The answers are passed as `aliases`, `extra_phones` and `past_addresses` (at most three each), and nothing is passed for them when the user has none.
- [ ] The spend (quota, up to 80 searches plus up to 37 per other name and one per old address, up to about two minutes, no directory page opened) is stated and a yes is given before `citation_check`.
- [ ] `citation_check` is called at most once per run, with NAP fields only for values the user supplied or corrected.
- [ ] The summary line leads with the Google Business Profile: "Google Business Profile: <status>. Seen in search on X of Y directories: ... Not seen on N: check by hand with the links."
- [ ] The summary says once that the fields are as shown in search results on the run's date.
- [ ] Each status is worded as the skill's Status wording table says, and the word "listed" appears only on `listed_*` rows.
- [ ] Every `not_seen` group reads "Not seen in search. Check by hand before creating a listing." and gives each named directory's `check_url`.
- [ ] A `gbp_not_connected` row says "Connect your Google Business Profile to check it", gives the reason in plain words, and gives the Google Maps link.
- [ ] A Business Profile with `address_hidden` is not reported as a wrong address.
- [ ] A listing with `matched_name` or `matched_phone` says it was found under the other name or shows the other number.
- [ ] A listing with `matched_address` says it is listed at the old address, and that the address needs updating.
- [ ] A listing with `other_urls` lists them as duplicates.
- [ ] `phone_on_other_listings` rows are shown in their own table and never counted as the business's listings.
- [ ] A saved report from the last 30 days for the same NAP, with a `rows` section, is offered before a new check runs.
- [ ] Every field to fix is shown with the value the listing shows and the value it should show.
- [ ] Only fields in `fields_seen` are called right or wrong.
- [ ] `not_checked` directories are reported as search failed, to check by hand, never as missing.
- [ ] The report is saved with `save_research` when `can_write` is true, with its `rows` and links; a refused save is reported, not hidden.
- [ ] The closing line names the searches spent, the search credits when present, and the search engine that ran.

## Fail conditions
- `citation_check` called before the NAP is confirmed, or called twice in one run.
- A `not_seen`, `not_checked` or `gbp_not_connected` row reported as "not listed" or as missing a listing.
- A line that tells the user to create a listing on a `not_seen` row with no check by hand first.
- Any `check_url` opened, or any directory page fetched, by the agent.
- A field outside `fields_seen` called right or wrong.
- A `phone_on_other_listings` row reported as one of the business's listings, or counted in the seen total.
- `aliases`, `extra_phones` or `past_addresses` passed with values the user did not give.
- A wrong field shown without the value the listing carries.
- A listing, directory or count named that does not appear in the tool result.
- A saved report for a different NAP, or one from an earlier version with no `rows`, presented as current.
