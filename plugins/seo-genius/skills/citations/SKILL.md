---
name: citations
description: Citation and NAP check through SEO Genius. Use for "check my citations", "where am I listed", "is my NAP consistent", "are my directory listings right", "audit my listings on Yelp, BBB and the rest", or "do my listings have my old phone number". Checks the US business directories that the big listing services submit to, and for each one reports if the business has a live listing and if that listing shows the exact name, address and phone. The work runs on the SEO Genius server and comes back as one compact report. Spends SEO Genius quota. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: citations (NAP check)

Is the business listed on the directories that matter, and does each listing show the same name, address and phone as the business itself? Wrong or old details on a directory send customers to a dead number and weaken local rankings.

## When to use

"check my citations", "where am I listed", "is my NAP consistent", "are my directory listings right", "audit my listings", "do my listings still have my old phone number", "which directories am I missing from".

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
2. `get_business_context`. From `business_context.bio` take the business name (`business_name`), the phone (`phone`, else the primary location's `phone`), and the primary location's address (`street`, `city`, `region`, `postal_code`; the location with `is_primary: true`, else the first). Show these three lines to the user as the NAP to check against and ask them to confirm or correct it. Every row of the report is measured against it, so a wrong value here makes every row wrong. Use any NAP the user already gave in their message without asking again. A business with no street address on purpose (a service-area business) checks with city and state only; say so. In the same message, ask one question: "Do you go by any other name, or use another phone number, such as a tracking line?" Keep up to three names as `aliases` and up to three numbers as `extra_phones`. Listings are often filed under a trading name or an old number, and a search for the main name alone does not find them. Ask it once; if the user has none, or already answered in their message, do not ask again.
3. Before spending anything, `get_research` with `kind: "citation_audit"` and `sections: ["summary"]`. If a report exists from the last 30 days and its `canonical` matches the NAP from step 2, show its summary with its date and ask if they want it or a fresh check. A report for a different NAP is out of date: say so and do not reuse it. A refusal that names the kind means the server does not keep citation reports yet; carry on.
4. Tell the user a fresh check spends SEO Genius quota and takes up to about two minutes, and wait for a yes. It runs up to 80 web searches, plus up to 37 more for each other name, and reads the listing pages they find. Other phone numbers cost nothing extra. A smaller run checks fewer directories: pass `max_queries` (2 to 80) when the user asks for one.
5. `citation_check`. Pass `name`, `phone`, `street`, `city`, `region`, or `postal_code` only for values the user corrected or supplied in step 2; the stored ones are read on the server. Pass `aliases` and `extra_phones` only with the answers to the step 2 question. One call per run; never call it again to retry part of a run.
6. Read the report (Output below). Use the tool's statuses as they are. Never turn `unverifiable` or `not_checked` into "not listed", and never count a `phone_on_other_listings` row as one of the business's listings.
7. When `can_write` is true, save the report with `save_research`: `kind: "citation_audit"`, `generated_on` today, and a payload with these sections: `summary` (the tool's `summary`, `canonical`, `checked_at`, `spend`, `search_engine`, `proxy_configured`, `stopped_early`, and the `aliases` and `extra_phones` passed), `listings`, `missing` (`not_found`, `not_checked`, `not_web_checkable`), `unverifiable`, and `phone_on_other_listings`. Say it was saved. If the save is refused because the kind is not accepted, say the report was not saved and why. On a read-only account skip the save and say so.

## Output

- One line: site, domain, `can_write`.
- The NAP that was checked, as the tool's `canonical` returns it.
- Score line from `summary`: listed on X of Y web-checkable directories; Z exact, V close (variants), M wrong; N not found by search; U could not be read; C not reached; and how many pages show the business's phone under another name (`phone_on_other_listings`), when any do. Add how many listing services have no public page (`not_web_checkable`) and are outside what this check can see.
- Wrong listings first, a table: Directory | Wrong field | Shows | Should show | Listing URL. One row per wrong field, from `off`. These are the fixes. When a row has `matched_name` or `matched_phone`, add "found under your other name X" or "shows your other number X": the listing is the business's, and it still differs from the main name or phone.
- Close matches, a table: Directory | Field | Shows | Listing URL, from `variant`. Say these are usually fine and worth tidying only on the directories that matter most.
- Not found by search on the main directories: the `major`, `home_services`, and `aggregator` lists from `not_found`, by name. Count the rest. Label every one "not found by search; check by hand before creating a listing". A search that did not find a listing is not proof there is none: listings filed under another name or not indexed are missed, and search results vary between runs. Never tell the user to create a listing on a `not_found` row alone.
- Could not be read: every `unverifiable` row with its reason, URL, and `title` when there is one (the search result's title often shows the address the listing carries). A listing very likely exists on each. Add the line "check these by hand; a page that could not be read is not a missing listing". Reasons: `proxy_unsupported` (the site refuses automated reading, as Yelp and Facebook do), `unparsed` (the page loaded but its details could not be read), `unplaced` (a record has the name but no city, state or matching phone, so it may be a business of the same name elsewhere), `empty` (the page came back empty, even through the proxy), `proxy_budget` (the run's allowance of proxied reads was used), `blocked`, `timeout`, `no_proxy`, `proxy_error`, `http_error`; any other reason means the page could not be read. When `proxy_configured` is false, say walled directories need the server's proxy to be checked.
- Your phone on another business's listing (`phone_on_other_listings`), when there are any: Directory | Name shown | Phone | URL. These are not the business's listings. Say a related company at the same number is the usual cause; if the name is not one the business uses or knows, the number should come off that listing.
- Not reached (`not_checked`): the count, and that a run with a higher `max_queries` or more time covers them.
- What to fix first, at most five lines: wrong phone numbers first (they lose calls), then wrong addresses, then wrong names, each on the highest-tier directory first; then the main directories not found by search, to check by hand before creating a listing. When a listing service the business already pays for manages these directories, fix the record there once instead of directory by directory.
- What this cannot see, one line: listings Google has not indexed, Google Business Profile itself, Apple Maps and the other app and voice listings.
- Closing line per rule 9, naming `spend.searches` (and `spend.searches_failed` when not zero), `spend.proxied_pages`, and `search_engine`.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- `citation_check` is not in the tool list: the SEO Genius server you are connected to does not offer it yet. Say so and stop.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above.
- 400 naming the name or the phone or city: the business profile lacks it. Ask the user for it and pass it in the call; offer to save it with `update_business_context` when `can_write` is true.
- 409 paused or archived site: stop; nothing was spent.
- Monthly quota used up: stop and say so. Nothing was checked.
- `stopped_early` is true: the time or query budget ran out. Report what was checked and list `not_checked` as not reached, never as missing.
- A listing whose `matched_on` is `name` and whose phone is wrong: this is the old-number case the check exists to find. Show the number it carries. If it is one of the numbers the user gave in step 2, the row carries `matched_phone`; say so.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- The NAP checked against was confirmed by the user or taken from their message, and the other-names question was asked once.
- `citation_check` was called once, after a yes, or a saved report from the last 30 days for the same NAP was shown instead.
- Every wrong field is shown with what the listing says and what it should say.
- No `unverifiable` or `not_checked` directory was called "not listed", and every `not_found` directory reads "not found by search; check by hand before creating a listing".
- No `phone_on_other_listings` row was counted as one of the business's listings.
- The report was saved with `save_research` when `can_write` is true, or the reason it was not is stated.
- The quota spent is stated.
