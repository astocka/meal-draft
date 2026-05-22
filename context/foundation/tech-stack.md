---

## starter_id: 10x-astro-starter
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

## Why this stack

Solo developer building a meal-suggestion web app MVP in 3 weeks after hours, with auth and AI-powered meal generation as the technology-forcing features. The 10x Astro Starter is the recommended default for web apps in JS/TS and ships auth, PostgreSQL, and edge deploy via Supabase + Cloudflare Pages out of the box — no manual wiring needed for the core loop. It clears all four agent-friendly gates (typed via TypeScript + Zod, convention-based file routing, popular in training data, well-documented). Bootstrapper confidence is first-class, so scaffolding should be mostly smooth. CI runs on GitHub Actions with auto-deploy-on-merge, matching the starter's standard shape.