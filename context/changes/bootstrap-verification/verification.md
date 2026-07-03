---
bootstrapped_at: 2026-05-22T19:12:00+02:00
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: meal-draft
language_family: js
package_manager: pnpm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "pnpm audit"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: pnpm
project_name: meal-draft
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

Solo developer building a meal-suggestion web app MVP in 3 weeks after hours, with auth and AI-powered meal generation as the technology-forcing features. The 10x Astro Starter is the recommended default for web apps in JS/TS and ships auth, PostgreSQL, and edge deploy via Supabase + Cloudflare Pages out of the box — no manual wiring needed for the core loop. It clears all four agent-friendly gates (typed via TypeScript + Zod, convention-based file routing, popular in training data, well-documented). Bootstrapper confidence is first-class, so scaffolding should be mostly smooth. CI runs on GitHub Actions with auto-deploy-on-merge, matching the starter's standard shape.

## Pre-scaffold verification

| Signal             | Value                              | Severity | Notes                              |
| ------------------ | ---------------------------------- | -------- | ---------------------------------- |
| npm package        | not run                            | —        | cmd_template uses git clone, not an npm create CLI |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh | from card.docs_url |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && pnpm install`
**Strategy**: git-clone
**Exit code**: 0 (after approving pnpm build scripts for esbuild, sharp, workerd)
**Files moved**: 22
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (no pre-existing .gitignore in cwd)
**.bootstrap-scaffold cleanup**: deleted
**Package manager**: pnpm

## Post-scaffold audit

**Tool**: `pnpm audit`
**Summary**: 0 CRITICAL, 0 HIGH, 1 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/0/0 direct of total 0/0/1/0
**Note**: Initial `npm audit --json` (from bootstrapper-config.yaml) reported 1 HIGH + 9 MODERATE, but those findings came from a stale `package-lock.json` shipped with the starter. pnpm's actual lockfile (`pnpm-lock.yaml`) resolves patched versions (e.g., devalue@5.8.1 is above the vulnerable range). The stale `package-lock.json` has been removed.

#### HIGH findings

None.

#### MODERATE findings

- **yaml** v2.0.0–2.8.2 — Stack overflow via deeply nested YAML collections (GHSA-48c2-rrv3-qjmp, CVSS 4.3). Transitive via @astrojs/check > @astrojs/language-server > volar-service-yaml > yaml-language-server > yaml. Dev-time toolchain only, not reachable in production. Fix: awaiting upstream patch in @astrojs/check.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | true                               |
| has_background_jobs        | false                              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
