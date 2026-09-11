# Acceptance: /seo-genius:competitors

## Smoke prompts
1. `/seo-genius:competitors`
2. `/seo-genius:competitors where do I rank for "concrete contractor" and "driveway repair"`
3. "Who am I competing with in search?" in plain words.

## Expected tool sequence
get_my_tenant -> list_sites -> get_business_context -> ranked_keywords (location_name = country, limit 200) -> competitor_domains (limit 10, location_code = country) -> serp_rank_check (one per named term, five at most)

## Pass conditions
- [ ] At most five serp_rank_check calls, one per user-named term; zero when the user named none.
- [ ] Every position carries the location used and the time of the check.
- [ ] Competitors listed from competitor_domains, not from memory or the business context alone.
- [ ] The reply says which calls spent quota.
- [ ] A term with no SERP result is reported as not found in the top results, with the depth used.

## Fail conditions
- A position quoted without a location or timestamp.
- More than five serp_rank_check calls.
- Competitors named that do not appear in a tool result (business-context competitors may be shown, labeled as "from your business context").
- A city or state passed to ranked_keywords or competitor_domains, or either called more than once.
