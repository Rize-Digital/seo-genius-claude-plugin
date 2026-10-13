# SEO Genius in Claude Code cloud sessions and routines

Cloud sessions and routines start from a fresh clone of your site's repository. They do not install plugins, even ones the repository enables in `.claude/settings.json`. They do load skills committed under `.claude/skills/`. See [what carries over to cloud sessions](https://code.claude.com/docs/en/cloud-environments#what-carries-over-from-your-setup).

So for a routine, the skills live in your site's repository and the SEO Genius connection comes from your claude.ai account.

## 1. Copy the skills into the site repository

From a clone of this repository:

```text
node scripts/copy-skills.mjs path/to/your-site-repo
```

This writes the twelve skills to `.claude/skills/seo-genius-<skill>/` and a version file, `.claude/skills/seo-genius.json`. Commit them. In the copy, `/seo-genius:brief` becomes `/seo-genius-brief`. Your own skills are not touched.

When this plugin updates, run the same command again and commit. To see whether a copy is behind:

```text
node scripts/copy-skills.mjs path/to/your-site-repo --check
```

## 2. Connect SEO Genius to your claude.ai account

Add SEO Genius as a custom connector on claude.ai with the URL `https://api.seogenius.ai/api/mcp/v1` and sign in. Routines use your account's connectors, and include all of them by default. On Team and Enterprise plans an admin adds connectors.

## 3. Write the routine prompt

Name the skill and the site, for example:

```text
Run /seo-genius-brief for example.com and report the three next moves.
```

Before you schedule it, know this:

- Schedule the read-only skills: `brief`, `audit`, `page-check`, `history`. In this version `competitors`, `keywords`, and `quick-wins` spend search-data quota without asking, so an unattended run spends it on every schedule. `competitor-dive` and `keyword-gap` stop and wait for a yes before a paid call, and nobody answers in a routine.
- A routine runs with no permission prompts, and a connector's write tools run without asking. A run that logs a change or marks an issue fixed does it in your name.
- Changes logged from a routine are recorded with an unknown origin for now. The connector does not tell SEO Genius which client is calling.
