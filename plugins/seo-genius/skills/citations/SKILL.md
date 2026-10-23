---
name: citations
description: Citation and NAP check through SEO Genius. Use for "check my citations", "where am I listed", "is my NAP consistent", "are my directory listings right", "audit my listings on Yelp, BBB and the rest", or "do my listings have my old phone number". Reads the business's Google Business Profile, then reports for each US business directory the big listing services submit to what web search results show of the business there, and if the name, address and phone they show match. It opens no directory page, and every directory comes back with a link to check it by hand. The work runs on the SEO Genius server and comes back as one compact report. Spends SEO Genius quota. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: citations (NAP check)

Do the business's Google Business Profile and its directory listings show the same name, address and phone as the business itself? Wrong or old details send customers to a dead number and weaken local rankings.

The check reads two things only. It reads the Google Business Profile through Google's API, with the business's own connected Google account. It reads web search results: the URL, title and snippet of each. It opens no directory page. So it reports what search shows, never that a listing is missing, and for every directory it hands back a link the user can open in their own browser.

## When to use

"check my citations", "where am I listed", "is my NAP consistent", "are my directory listings right", "audit my listings", "do my listings still have my old phone number", "is my Google Business Profile right".

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

## Standing rules (apply to every step)

1. Resolve the business first. Call `get_my_tenant`, then `list_sites`. Match what the user typed to a site by name or domain. Echo the site and `can_write` before doing anything else. When the connection is org-scoped (`get_my_tenant` returns `org_id` and `sites[]`), pass `site` (the site id or domain) on every later call. Ambiguous or no match: ask which site.
2. Read memory before deriving. Call `get_business_context` once per session for the business name, services, locations, and competitors. Do not re-derive what is already stored.
3. Retrieval first, quota aware. Read stored SEO Genius data before any Data-for-SEO call (`keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`). Batch keywords, up to 200, into one `keyword_research` call. Say when a call spends the user's quota. Do not call `search_recommendations`; it returns an empty set today.
4. Local, not national, with the right tool. `ranked_keywords`, `keyword_research`, and `competitor_domains` run at country level only (Data-for-SEO Labs does not take a city or state, and a city returns nothing). Pass the customer's country (`location_name: "United States"` or `location_code: 2840` for a US business) and make the keywords themselves local ("tree removal boise"). For a local position use `serp_rank_check` with the metro `location_code`, or with the city in the keyword when no code is known. State which was done.
5. Never invent a number. Every figure traces to a tool result. Missing data is reported as missing.
6. Cap every list. Call `list_issues` with `limit` (50 by default, 100 at most) and read the first page only unless the user asks for more. Never quote a crawl's `issues_found` field.
7. Search to fit the mode. `search_pages` is a vector search on some accounts and a text search on others; the response's `mode` says which ran, so remember it. In `vector` mode, or before the mode is known, send a descriptive phrase ("concrete driveway installation service page"), never a single word. In `text` mode every word has to match the page's title, meta description, H1 or URL, so send two or three words the title or H1 would carry ("driveway installation"); after a long phrase missed, search once more that way, once only. Still no match: page through `list_pages` without `q`; `q` there is the same text search.
8. Writes need `can_write`. On a read-only account, return the change as text so it is not lost. Logging records status; it does not prove a result.
9. Say what was capped. Every reply ends with one line naming which lists were first-page only and which calls spent quota.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. `get_business_context`. From `business_context.bio` take the business name (`business_name`), the phone (`phone`, else the primary location's `phone`), and the primary location's address (`street`, `city`, `region`, `postal_code`; the location with `is_primary: true`, else the first). Show these three lines to the user as the NAP to check against and ask them to confirm or correct it. Every row of the report is measured against it, so a wrong value here makes every row wrong. Use any NAP the user already gave in their message without asking again. A business with no street address on purpose (a service-area business) checks with city and state only; say so. In the same message, ask two questions: "Do you go by any other name, or use another phone number, such as a tracking line?" and "Have you moved, or listed another address in the past?" Keep up to three names as `aliases`, up to three numbers as `extra_phones`, and up to three old addresses as `past_addresses` (each with the city at least, and the street, state and ZIP when the user knows them). Listings are often filed under a trading name, an old number or an old address, and a search for the main name in the current city does not find them. Ask them once; if the user has none, or already answered in their message, do not ask again.
3. Before spending anything, `get_research` with `kind: "citation_audit"` and `sections: ["summary"]`. If a report exists from the last 30 days, its `canonical` matches the NAP from step 2, and it has a `rows` section, show its summary with its date and ask if they want it or a fresh check. A report for a different NAP is out of date: say so and do not reuse it. A report with no `rows` section (one with `listings` or `missing` instead) was made by an earlier version of the check whose statuses are retired: say it is out of date and do not reuse it. A refusal that names the kind means the server does not keep citation reports yet; carry on.
4. Tell the user a fresh check spends SEO Genius quota and takes up to about two minutes, and wait for a yes. It runs up to 80 web searches, plus up to 37 more for each other name and one more for each old address. Other phone numbers add no search, and reading the Google Business Profile spends no quota. It opens no directory page. A smaller run checks fewer directories: pass `max_queries` (2 to 80) when the user asks for one.
5. `citation_check`. Pass `name`, `phone`, `street`, `city`, `region`, or `postal_code` only for values the user corrected or supplied in step 2; the stored ones are read on the server. Pass `aliases`, `extra_phones` and `past_addresses` only with the answers to the step 2 questions. One call per run; never call it again to retry part of a run.
6. Read the report (Status wording and Output below). Use the tool's statuses as they are. The word "listed" goes only on a `listed_*` row. Never call a `not_seen`, `not_checked` or `gbp_not_connected` row "not listed" or "missing", and never count a `phone_on_other_listings` row as one of the business's listings. Only the fields in a row's `fields_seen` were judged: never say a field outside them is right or wrong.
7. Do not open any `check_url` yourself, and do not fetch any directory page to check a row. The links are for the user to open in their own browser.
8. When `can_write` is true, save the report with `save_research`: `kind: "citation_audit"`, `generated_on` today, and a payload with these sections: `summary` (the tool's `summary`, `canonical`, `checked_at`, `spend`, `search_engine`, `stopped_early`, and the `aliases`, `extra_phones` and `past_addresses` passed), `rows` (every row as returned, with its `check_url`), and `phone_on_other_listings`. Say it was saved. If the save is refused because the kind is not accepted, say the report was not saved and why. On a read-only account skip the save and say so.

## Status wording

Say each status this way, and only this way.

| Status | Say |
|---|---|
| `listed_exact` | NAP matches |
| `listed_variant` | NAP matches, formatting differs |
| `listed_mismatch` | Fix this listing, naming the field and the value found |
| `listed_partial` | Partly confirmed; open it to check the rest |
| `listed_unconfirmed` | Listing seen in search; NAP not shown |
| `not_seen` | Not seen in search. Check by hand before creating a listing. |
| `not_checked` | Search failed; check by hand |
| `not_web_checkable` | No public page; outside what this check can see |
| `gbp_not_connected` | Connect your Google Business Profile to check it |

## Output

- One line: site, domain, `can_write`.
- The NAP that was checked, as the tool's `canonical` returns it.
- Summary line from `summary`, the Google Business Profile first: "Google Business Profile: <status wording for `gbp`>. Seen in search on X of Y directories: A exact, V formatting differs, M to fix, P partly confirmed, U NAP not shown. Not seen on N: check by hand with the links." X is `seen_in_search`, Y `web_checkable`, A `exact`, V `variant`, M `mismatch`, P `partial`, U `unconfirmed`, N `not_seen`. Drop a count from the middle that is zero. Then, once: "Fields are as shown in search results on <the date of `checked_at`>; a live page can differ." Add how many pages show the business's phone under another name (`phone_on_other_listings`), when any do.
- Google Business Profile, from the first row (domain `google.com`, `evidence: "gbp_api"` when read). On a `listed_*` row, show each field whose verdict is not `exact`: Field | Profile shows | Should show. When `address_hidden` is true, say the profile hides its address, as a service-area business does; that is not a mismatch, and only the name and phone were judged. On `gbp_not_connected`, say "Connect your Google Business Profile to check it" and why, from `reason`: `no_google_connection` (no Google account is connected), `no_business_scope` (the connected Google account did not allow Business Profile access; reconnect and allow it), `google_auth_failed` (the Google connection has lapsed; reconnect it), `no_site_domain` (the site has no domain on file), `no_matching_location` (no Business Profile on the connected account lists this site as its website). On `not_checked`, say the Business Profile could not be read this run. In every case give the row's `check_url`, a Google Maps search for the phone.
- To fix (`listed_mismatch`), a table: Directory | Field | Shows | Should show | Listing. One row per field whose verdict is `mismatch`, with the value from `found`. These are the fixes. When a row has `matched_name`, add "found under your other name X"; `matched_phone`, "shows your other number X"; `matched_address`, "listed at your old address X". Each still differs from the main name, phone or address. When a row has `other_urls`, list them: the directory shows the business more than once, and the stale duplicate is often the one to fix.
- Partly confirmed and NAP not shown (`listed_partial`, then `listed_unconfirmed`), a table: Directory | Fields seen | Listing | Check link. Use the status wording for each.
- Not seen in search (`not_seen`): the `major`, `home_services` and `aggregator` rows by name, each with its `check_url`. Count the rest, and say their links are in the saved report (or list them when the user asks). Head the group "Not seen in search. Check by hand before creating a listing." Search does not show every listing: one filed under another name, or not indexed, is missed, and results vary between runs. Never tell the user to create a listing on a `not_seen` row alone.
- Your phone on another business's listing (`phone_on_other_listings`), when there are any: Directory | Name shown | Phone | URL. These are not the business's listings. Say a related company at the same number is the usual cause; if the name is not one the business uses or knows, the number should come off that listing.
- The rest, collapsed to one line each: NAP matches (`listed_exact`) and NAP matches, formatting differs (`listed_variant`), by directory name; search failed (`not_checked`), the count, check by hand, and that a run with a higher `max_queries` or more time covers them; no public page (`not_web_checkable`), the count.
- What to fix first, at most five lines: the Google Business Profile first when it differs; then wrong phone numbers (they lose calls), then wrong addresses, then wrong names, each on the highest-tier directory first; then the main directories not seen in search, to check by hand with the links. When a listing service the business already pays for manages these directories, fix the record there once instead of directory by directory.
- What this cannot see, one line: the directory pages themselves (the check reads search results, and a snippet can be older than the page), listings search engines have not indexed, and Apple Maps, Bing Places and the other app and voice listings.
- Closing line per rule 9, naming `spend.searches` (and `spend.searches_failed` when not zero), `spend.search_credits` when present, and `search_engine`.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- `citation_check` is not in the tool list: the SEO Genius server you are connected to does not offer it yet. Say so and stop.
- The report has `listings` or `not_found` and no `rows`: the server runs an earlier version of the check. Say so, and report its rows without the wording above; never call one of them "not listed".
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above.
- 400 naming the name or the phone or city: the business profile lacks it. Ask the user for it and pass it in the call; offer to save it with `update_business_context` when `can_write` is true.
- 409 paused or archived site: stop; nothing was spent.
- 409 "a check is already running": one check runs per business at a time. Wait for it to finish, then try again.
- Monthly quota used up: stop and say so. Nothing was checked.
- `stopped_early` is true: the time or query budget ran out. Report what was checked and list `not_checked` as search failed, to check by hand, never as missing.
- A listing whose `matched_on` is `name` and whose phone verdict is `mismatch`: this is the old-number case the check exists to find. Show the number it carries. If it is one of the numbers the user gave in step 2, the row carries `matched_phone`; say so.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- The NAP checked against was confirmed by the user or taken from their message, and the other-names and old-address questions were asked once.
- `citation_check` was called once, after a yes, or a saved report from the last 30 days for the same NAP was shown instead.
- The summary line leads with the Google Business Profile and says once that fields are as shown in search results on the run's date.
- Every field to fix is shown with what the listing shows and what it should show.
- The word "listed" is used only on `listed_*` rows; no `not_seen`, `not_checked` or `gbp_not_connected` row was called "not listed", and every `not_seen` group reads "Not seen in search. Check by hand before creating a listing." with its links.
- No `check_url` was opened and no directory page was fetched.
- No `phone_on_other_listings` row was counted as one of the business's listings.
- The report was saved with `save_research` when `can_write` is true, or the reason it was not is stated.
- The quota spent is stated.
