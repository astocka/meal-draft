---

## project: MealDraft
researched_at: 2026-05-24
recommended_platform: Cloudflare Workers + Pages
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6.3
  runtime: Cloudflare Workers (workerd)

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

Cloudflare is the native deployment target already configured in this project (`@astrojs/cloudflare@^13.5.0`, `wrangler@^4.90.0`). It scores Pass on all five agent-friendly criteria: full CLI-first operations via wrangler, fully managed serverless compute, published llms.txt and markdown docs, deterministic single-command deploys, and GA MCP servers. The free tier (100k requests/day, ~3M/month) covers this MVP's expected traffic with significant headroom — at zero cost. Since the project already uses external providers (Supabase for DB/auth, OpenRouter for AI), Cloudflare's lack of co-located Postgres is irrelevant.

## Platform Comparison


| Platform       | CLI-first                 | Managed/Serverless         | Agent-readable docs   | Stable deploy API            | MCP / Integration  | Total |
| -------------- | ------------------------- | -------------------------- | --------------------- | ---------------------------- | ------------------ | ----- |
| **Cloudflare** | Pass                      | Pass                       | Pass                  | Pass                         | Pass               | 5/5   |
| **Vercel**     | Pass                      | Pass                       | Pass                  | Pass                         | Partial (beta MCP) | 4.5/5 |
| **Netlify**    | Partial (no CLI rollback) | Pass                       | Pass                  | Pass                         | Pass               | 4.5/5 |
| **Render**     | Pass                      | Partial (containers)       | Pass                  | Pass                         | Pass               | 4.5/5 |
| **Railway**    | Pass                      | Partial (containers)       | Pass                  | Pass                         | Partial (beta MCP) | 4/5   |
| **Fly.io**     | Pass                      | Partial (VMs + Dockerfile) | Partial (no llms.txt) | Partial (no native rollback) | Partial (beta)     | 2.5/5 |


**Notes on scoring:**

- **Cloudflare** — Perfect score. Native target for the existing Astro 6 + `@astrojs/cloudflare` stack. Zero adapter changes. `wrangler deploy` is deterministic and fast (~5s). MCP servers cover docs, Workers management, and observability (all GA). Free tier is the most generous of all candidates.
- **Vercel** — Strong alternative. Astro SSR works via `@astrojs/vercel` (Node.js serverless). Free Hobby tier includes 1M invocations/month. CLI is mature (deploy, rollback, logs all GA). MCP marked as Public Beta (read-only, May 2026). Would require swapping the Cloudflare adapter.
- **Netlify** — Good MCP story (GA), Astro SSR supported via `@astrojs/netlify`. Credit-based pricing model is harder to predict — 300 credits/month shared across requests, compute, bandwidth, and deploys. No CLI rollback command (UI-only). Requires adapter swap.
- **Render** — Solid container PaaS with GA MCP server. $7/month minimum for always-on (free tier has 60s cold starts). Requires `@astrojs/node` adapter + `HOST=0.0.0.0`. Single-region only.
- **Railway** — Fast DX, co-located Postgres. MCP is beta. Minimum ~$5/month (Hobby plan). Requires `@astrojs/node` adapter. WebSocket 15-min cap irrelevant for this project.
- **Fly.io** — Overkill for a stateless SSR app. No permanent free tier (trial only). Requires Dockerfile + `@astrojs/node` adapter. 1.2s cold starts from idle. Docs lack llms.txt. Beta MCP.

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

The project is already configured for Cloudflare (`@astrojs/cloudflare@^13.5.0`, `wrangler@^4.90.0` in package.json). Zero migration effort. The free tier (100k req/day) far exceeds MVP needs. Wrangler CLI provides deploy, rollback, secret management, and log tailing — all scriptable. Cloudflare publishes MCP servers for docs lookup, Workers management, and observability — giving AI agents structured access to platform operations. Edge rendering is a bonus (not critical since users are single-region), but it means zero cold starts globally.

#### 2. Vercel

The strongest alternative if Cloudflare hits a wall. Node.js serverless runtime eliminates workerd compatibility concerns entirely — any npm package works. Free tier is generous (1M invocations). The trade-off: requires replacing `@astrojs/cloudflare` with `@astrojs/vercel`, and the MCP server is beta (read-only access only). Cold starts exist (~2.4s for large bundles) but are acceptable at MVP scale.

#### 3. Render

Best option if you want a traditional server environment. Full Node.js container with no runtime restrictions. $7/month Starter tier eliminates cold starts. GA MCP server. The trade-off: single-region only, no edge, requires adapter swap to `@astrojs/node`, and you lose the serverless scaling model.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. **workerd is not Node.js** — npm packages that use native bindings, `fs`, `net`, `child_process`, or other Node.js-specific APIs will fail at runtime. If a transitive dependency of `@supabase/ssr` or the OpenRouter SDK uses an unsupported API, it breaks in production but works in dev (which runs on Node.js).
2. **CPU time limit (30s free, 50ms/invocation on unbound)** — while I/O wait is free, CPU-bound JSON parsing of large AI responses could approach limits. More critically, the 128 MB memory cap on the free tier could be exceeded by large streamed responses.
3. **Dev/prod parity gap** — `astro dev` runs on Node.js locally, not workerd. Bugs specific to the Workers runtime won't surface until `wrangler dev` or production deployment. This creates a false confidence loop.
4. **Secrets are runtime-only** — `wrangler secret put` values are available at runtime via `env.`*, but NOT during build time. If Astro config or static pages need env vars at build, you must use Pages environment variables (set via dashboard or `wrangler pages project` CLI), which is a different mechanism.
5. **Vendor lock-in via adapter** — `@astrojs/cloudflare` ties your rendering to workerd APIs. Migrating away later requires replacing the adapter and testing the entire rendering pipeline.

### Pre-Mortem — How This Could Fail

The solo developer deployed MealDraft on Cloudflare Pages. Initial pages rendered fast — auth worked, pantry CRUD was snappy. In month two, the OpenRouter integration went live. Most AI responses returned in 3-8 seconds (fine — I/O wait doesn't count against CPU). But on slow model days, responses exceeded 25 seconds wall-clock. Users saw timeouts sporadically. Investigation revealed Cloudflare's proxy has a default 100-second connection timeout, which wasn't the issue — but the Supabase client's connection pooling behaved differently on workerd than Node.js, causing intermittent "socket hang up" errors under concurrent load. The developer couldn't reproduce locally because `astro dev` uses Node.js. Month three: a routine `pnpm update` pulled in a Zod version that imported `node:util` internally — it worked in dev, passed lint, but crashed on Cloudflare with "No such module: node:util" (the compatibility_date was set to an older date that didn't include this API). The fix required updating compatibility_date and re-deploying, but the developer lost half a weekend diagnosing it. By month six the app worked, but every dependency update required checking against Cloudflare's Node.js compatibility table — a tax that accumulated sprint over sprint.

### Unknown Unknowns

- **compatibility_date controls API availability** — Cloudflare Workers use a dated API surface. If your `wrangler.toml` sets `compatibility_date = "2024-01-01"`, newer Node.js APIs (like `navigator`, `crypto.subtle` extensions, or `AsyncLocalStorage`) won't be available even though they exist on the platform. You must consciously bump this date and test.
- **Preview deployments are publicly accessible by default** — any Cloudflare Pages preview URL is reachable by anyone with the link. For an app with user data and auth, this means test/staging environments leak unless you configure Cloudflare Access (a separate product, free for up to 50 users).
- `**astro dev` provides zero workerd fidelity** — the Astro 6 dev server runs on Vite + Node.js. The `@astrojs/cloudflare` adapter only activates at build time. To test workerd compatibility locally, you must run `pnpm build && pnpm preview` (which uses wrangler's local workerd runtime via Miniflare). This is slower than `astro dev` and breaks HMR.
- **Supabase + Cloudflare latency** — Cloudflare Workers run at the edge closest to the user, but Supabase runs in a single AWS region. Every DB call crosses the network from the edge PoP to Supabase's region. For a single-region user base this is fine (~20-50ms), but be aware the "edge" advantage is only for static/cached content, not DB-backed pages.
- `**@astrojs/cloudflare` adapter release cadence** — major Astro updates (e.g., 6.x → 7.x) sometimes ship before the Cloudflare adapter is updated. There can be a 1-4 week window where you can't upgrade Astro without breaking deployment.

## Operational Story

- **Preview deploys**: Every push to a non-production branch creates a preview URL at `<commit-hash>.<project>.pages.dev`. Preview URLs are public by default — add Cloudflare Access (free, 50 users) to restrict access if needed. Fork PRs also get previews unless disabled in Pages settings.
- **Secrets**: Runtime secrets via `wrangler secret put <KEY>` (stored in Cloudflare's encrypted vault, never visible after set). Build-time env vars via Pages project settings (dashboard or `wrangler pages project edit`). Rotation: `wrangler secret put <KEY>` overwrites immediately, next deploy picks it up. GitHub Secrets used for CI deploy tokens.
- **Rollback**: `wrangler rollback` (or `wrangler pages deployment rollback <deployment-id>`) — instant, atomic, <5s. Rolls back code only — database migrations (Supabase) are not reverted automatically. Always deploy migrations as backwards-compatible.
- **Approval**: Production deploys via `wrangler deploy` or Pages git integration (auto-deploy on push to `master`). No built-in approval gate — add branch protection + required reviews in GitHub to gate production. Agent can deploy to preview branches unattended; production requires a merged PR.
- **Logs**: `wrangler tail` streams real-time logs (filter by status, method, path). `wrangler pages deployment tail <id>` for specific deployments. MCP server provides structured log access. Historical logs via Cloudflare Logpush (paid, not needed at MVP).

## Risk Register


| Risk                                                | Source           | Likelihood | Impact | Mitigation                                                                                                                                |
| --------------------------------------------------- | ---------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| npm package incompatible with workerd runtime       | Devil's advocate | M          | H      | Pin dependencies, run `pnpm build && pnpm preview` before every deploy. Add a CI step that builds and runs wrangler locally.              |
| AI response causes memory spike >128 MB (free tier) | Devil's advocate | L          | M      | Stream responses incrementally; upgrade to Workers Paid ($5/mo) if free tier OOMs.                                                        |
| Dev/prod parity — bug surfaces only in production   | Pre-mortem       | M          | M      | Use `pnpm preview` (local workerd via Miniflare) as the final check before deploy. Never trust `astro dev` alone for runtime correctness. |
| compatibility_date too old → missing Node.js APIs   | Unknown unknowns | M          | M      | Set compatibility_date to current month on project init. Bump quarterly. Document in AGENTS.md.                                           |
| Preview deploys expose user data publicly           | Unknown unknowns | L          | M      | Configure Cloudflare Access on `*.pages.dev` preview URLs before storing real user data.                                                  |
| Supabase latency from edge PoP                      | Unknown unknowns | L          | L      | Deploy Supabase in the region closest to primary user base. For single-region users this adds ~20-50ms — acceptable for MVP.              |
| Adapter lags behind Astro major releases            | Unknown unknowns | L          | M      | Don't upgrade Astro on release day. Wait for `@astrojs/cloudflare` to publish a matching version (typically 1-2 weeks).                   |
| D1 Read Replication (beta) instability              | Research finding | L          | L      | Not using D1 — using external Supabase. No action needed.                                                                                 |


## Getting Started

These steps assume the project is already scaffolded with `@astrojs/cloudflare@^13.5.0` and `wrangler@^4.90.0` (confirmed in `package.json`).

1. **Create a Cloudflare Pages project:**
  ```bash
   pnpm wrangler pages project create mealdraft
  ```
2. **Set runtime secrets for production:**
  ```bash
   pnpm wrangler pages secret put SUPABASE_URL
   pnpm wrangler pages secret put SUPABASE_KEY
  ```
3. **Verify local workerd compatibility (replaces `astro dev` for runtime testing):**
  ```bash
   pnpm build && pnpm preview
  ```
   This runs Astro's preview command which, with the Cloudflare adapter, starts a local Miniflare (workerd) server — true production parity.
4. **Deploy to production:**
  ```bash
   pnpm wrangler pages deploy dist/
  ```
   Or connect the GitHub repo in Cloudflare Pages dashboard for auto-deploy on push to `master`.
5. **Set compatibility_date in `wrangler.toml`:**
  ```toml
   compatibility_date = "2026-05-24"
   compatibility_flags = ["nodejs_compat"]
  ```
   The `nodejs_compat` flag enables the broadest Node.js API surface available on workerd.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (GitHub Actions workflow is pre-configured in the starter)
- Production-scale architecture (multi-region, HA, DR)

