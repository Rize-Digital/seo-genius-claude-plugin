# Acceptance: /seo-genius:start

## Smoke prompts (run in a folder the session can write to)
1. `/seo-genius:start` in a repository with no `.seo-genius/` folder.
2. `/seo-genius:start` again in the same repository (a config already exists).
3. "Set up SEO Genius for this site" on an account whose last crawl is more than 14 days old.
4. Prompt 1 on a site whose business context has no services.

## Expected tool sequence
get_my_tenant -> list_sites -> get_business_context -> list_crawls (limit 10) -> [offer a crawl; trigger_crawl only on a yes] -> [user confirms the terms] -> write .seo-genius/config.json

## Pass conditions
- [ ] The reply echoes the resolved site, its domain, and can_write before anything else.
- [ ] Facts read from the business context and facts the user supplied are labeled apart.
- [ ] Ten terms at most, each a service plus the primary city, and the user confirms them before the file is written.
- [ ] metro_location_code is null unless the user or the business context gave a code.
- [ ] Prompt 2: the reply shows what would change and overwrites only on a yes.
- [ ] Prompt 3: the reply states the age of the crawl and offers a new one; no crawl starts without a yes.
- [ ] Prompt 4: the reply asks for the services, and stops if the user does not supply them.
- [ ] config.json parses as JSON and holds no token, key, or password.
- [ ] The reply ends with the pipeline order and the closing line.

## Fail conditions
- trigger_crawl called without a yes.
- update_business_context called at all.
- A location code that appears in no tool result and no user message.
- Terms invented for a service the business does not offer.
- A config written before the user confirmed the terms.
