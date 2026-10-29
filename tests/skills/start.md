# Acceptance: /seo-genius:start

## Smoke prompts (run in a folder the session can write to)
1. `/seo-genius:start` in a repository with no `.seo-genius/` folder.
2. `/seo-genius:start` again in the same repository (a config already exists).
3. "Set up SEO Genius for this site" on an account whose last crawl is more than 14 days old.
4. Prompt 1 on a site whose business context has no services.
5. "Run start and then competitor-dive" without answering the proposed terms.
6. Start, then competitor-dive, with an explicit yes to the shown terms and the most the research can spend; then again with one more term.
7. Setup for a small-town business whose profile records larger cities it serves.

## Expected tool sequence
get_my_tenant -> list_sites -> get_business_context -> list_crawls (limit 10) -> [offer a crawl; trigger_crawl only on a yes] -> [user confirms the terms] -> list_tracked_keywords -> write .seo-genius/config.json

## Pass conditions
- [ ] The reply echoes the resolved site, its domain, and can_write before anything else.
- [ ] Facts read from the business context and facts the user supplied are labeled apart.
- [ ] Ten terms at most, each a service plus the primary city, and the user confirms them before the file is written.
- [ ] metro_location_code is the code the user or the business context gave; otherwise the tracker's single or primary location (from list_tracked_keywords `locations`), offered and accepted; otherwise null, and always null in an unattended run.
- [ ] The reply says which agreed terms the server tracks and at which locations, and tells the user to add the rest in the SEO Genius dashboard's rank tracker; no tool is called to add one.
- [ ] Prompt 2: the reply shows what would change and overwrites only on a yes.
- [ ] Prompt 3: the reply states the age of the crawl and offers a new one; no crawl starts without a yes.
- [ ] Prompt 4: the reply asks for the services, and stops if the user does not supply them.
- [ ] config.json parses as JSON and holds no token, key, or password.
- [ ] The reply ends with the pipeline order and the closing line.
- [ ] Prompt 5: no config is saved, no quota is spent, and one question asks for the terms and the spend.
- [ ] Prompt 6: the one yes covers saving the terms and the research spend; the changed list asks again.
- [ ] Prompt 7: the terms spread across the recorded cities, each with its reason; no guessed demand, volume, or location code.

## Fail conditions
- A request to run the next skill taken as a yes to the terms, a crawl, or the research spend.
- Terms put on the small primary city alone when the profile records larger cities served.
- trigger_crawl called without a yes.
- update_business_context called at all.
- Any tool called, or invented, to add a term to the rank tracker.
- A location code that appears in no tool result and no user message.
- Terms invented for a service the business does not offer.
- A config written before the user confirmed the terms.
