# CLAUDE.md

Guidance for Claude Code and other agents working in this repository.

## This repository is public

Everything pushed here is visible to anyone, the moment it lands: files, branch names, commit messages, pull request titles and bodies, and review comments. A later edit does not remove it, because git history keeps every earlier version.

## No real client data

Never put real customer or client data in any of those places. That covers:

- Business names, domains, URLs, and page paths of real sites.
- Site, client, account, or org IDs (UUIDs) from a real SEO Genius workspace.
- Keywords, rankings, search volumes, issue counts, traffic, or any other number read from a real site.
- Competitor names or domains found for a real site.
- Private repository names, hostnames, server names, and other infrastructure detail.
- Email addresses, phone numbers, and street addresses, other than the publisher contact already in the manifests.

Use placeholders instead:

- Domains: `example.com`, `example.net`, `example.org`, or a name ending in `.test`.
- IDs: an obviously fake UUID such as `00000000-0000-4000-8000-000000000001`.
- Businesses, pages, and keywords: made-up values that match no real site.

## Smoke runs against a live site

A smoke run against a real site produces real data. Keep it out of git:

- Commit the plan with placeholders only.
- Put the filled-in copy and any results under `tests/smoke/local/`. That folder is in `.gitignore`.
- A committed smoke record describes the site in general terms only ("a 32-page local business site"), never by name.

## Before you push

1. Read your diff, your commit messages, and your branch name for anything on the list above.
2. If you find real data in something already pushed, do not open an issue or comment about it here. That would repeat the exposure. Tell a maintainer privately.
