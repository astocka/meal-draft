# Auth Flow — Post-Impl-Review Setup

Follow-up configuration after impl review triage (especially the `SITE_URL` fix for `emailRedirectTo`).

Production URL: **`https://meal-draft.bluemoon-labs.workers.dev`**

---

## Code changes already applied (in repo)

These were done during impl review triage — no further code changes needed before merge:

- `SITE_URL` added to `astro.config.mjs` env schema (`access: "secret"`, `optional: true`)
- `SITE_URL` in `.dev.vars`, `.dev.vars.example`, `.env.example` (local value)
- `signup.ts` uses `SITE_URL` for `emailRedirectTo`
- Auth hardening: guarded `formData()`, error logging, `auth-error-message.ts`, password min 10

**Local test status:** email confirmation flow works — signup → email link → `/dashboard` ✅

**Production test status:** not yet tested — auth branch is not on `main` yet. Production currently returns 404 for `/auth/callback`. Test again after merge + deploy.

---

## Part 1 — Cloudflare

### Step 1: Local dev vars ✅ Done

`.dev.vars` and `.env` should have:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SITE_URL=http://localhost:4321
```

Restart dev/preview after changing these.

### Step 2: Set `SITE_URL` for production runtime ⚠️ mandatory

Astro reads `SITE_URL` via `astro:env/server` as a **secret** (same as `SUPABASE_URL`).
Local/preview: `.dev.vars`. Production: Cloudflare Worker secret.

**Do not** use `context.locals.runtime.env` — removed in Astro v6 and throws at runtime.

**Add Worker secret (dashboard):**

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **meal-draft**
2. **Settings** → **Variables and Secrets** → **Secrets**
3. Add encrypted secret:
   - **Name:** `SITE_URL`
   - **Value:** `https://meal-draft.bluemoon-labs.workers.dev`

**Via CLI (optional):**

```powershell
npx wrangler secret put SITE_URL
```

### Step 3: Verify all Worker secrets

Confirm these **encrypted secrets** exist:

| Name           | Value                                          |
| -------------- | ---------------------------------------------- |
| `SUPABASE_URL` | `https://xxx.supabase.co`                      |
| `SUPABASE_KEY` | Supabase anon public key                       |
| `SITE_URL`     | `https://meal-draft.bluemoon-labs.workers.dev` |

### Step 4: GitHub Actions — not needed ❌

Do **not** add `SITE_URL` to GitHub Actions for CI. With `optional: true`, the build passes
without it. Runtime value comes from Cloudflare Worker secrets.

### Step 5: Deploy and smoke-test production

After merging to `main`:

1. Wait for Cloudflare auto-deploy (or run `pnpm run deploy`)
2. Confirm `/auth/callback` no longer returns 404 (should redirect to sign-in with an error when visited without a code)
3. Test full flow:
   - Sign up → confirm-email page
   - Click email link → `/auth/callback?code=...` → `/dashboard`
   - Sign out → `/auth/signin`
   - Visit `/auth/signin` while signed in → redirect to `/dashboard`

Watch logs:

```powershell
npx wrangler tail
```

---

## Part 2 — Supabase

### Step 1: API credentials ✅ Done

`SUPABASE_URL` and `SUPABASE_KEY` are in `.env` / `.dev.vars`. Use the **anon public** key, not service role.

### Step 2: Redirect URLs allowlist ⚠️ mandatory

**Authentication** → **URL Configuration** → **Redirect URLs**

Add exactly (no wildcards):

```
http://localhost:4321/auth/callback
https://meal-draft.bluemoon-labs.workers.dev/auth/callback
```

Save. Supabase validates `emailRedirectTo` from your signup code against this list. Without these entries, signup fails or confirmation links break.

**Site URL field (above the list): optional**

The **Site URL** field is only a fallback when the caller does not pass `emailRedirectTo`. Your code always passes it explicitly in `signup.ts`, so the Site URL field does not affect the email confirmation flow. Skip it or set it to the production URL for tidiness — either is fine.

### Step 3: Enable email confirmation ⚠️ mandatory

**Authentication** → **Providers** → **Email** → toggle **Confirm email** ON → Save

Without this, Supabase auto-confirms users and `/auth/callback` is never used.

### Step 4: Password minimum → 10 ⚠️ required

**Authentication** → **Providers** → **Email** → **Minimum password length** → **10** → Save

Must match the app's zod schema (`z.string().min(10)` in `signup.ts`).

### Step 5: Email templates (optional)

**Authentication** → **Email Templates** → **Confirm signup**

Keep `{{ .ConfirmationURL }}` in the link. Do not hardcode `/auth/callback` — `emailRedirectTo` in code handles that.

### Step 6: Test end-to-end

| Environment                | Status                                 |
| -------------------------- | -------------------------------------- |
| Local (`pnpm run preview`) | ✅ Passed — email link → dashboard     |
| Production                 | ⬜ Pending — test after merge + deploy |

Production test steps:

1. Register with a real email on `https://meal-draft.bluemoon-labs.workers.dev`
2. Click the confirmation email link
3. Expected: `/auth/callback?code=...` → session created → `/dashboard`

Troubleshooting:

| Symptom                                      | Cause                                               |
| -------------------------------------------- | --------------------------------------------------- |
| `/auth/callback` returns 404                 | Auth branch not deployed to production yet          |
| Supabase error on signup                     | Callback URL not in Redirect URLs allowlist         |
| "Site URL is not configured" on signup       | `SITE_URL` Worker secret missing — add in dashboard |
| Email link points to localhost on production | `SITE_URL` secret has wrong value                   |
| "Invalid confirmation link"                  | Link expired (~10 min) or already used              |
| Password rejected by Supabase                | Supabase min still at 6, needs to be 10             |

---

## Quick reference

| Item                        | Where                        | Required? | Status                      |
| --------------------------- | ---------------------------- | --------- | --------------------------- |
| `SITE_URL` local            | `.dev.vars`, `.env`          | Yes       | ✅ Done                     |
| `SITE_URL` production       | Cloudflare Worker **secret** | Yes       | ⚠️ Add in dashboard         |
| `SUPABASE_*` Worker secrets | Cloudflare dashboard         | Yes       | ✅ Done                     |
| GitHub Actions secrets      | GitHub repo settings         | No        | Skip                        |
| Supabase Redirect URLs      | Auth → URL Configuration     | Yes       | ✅ Done (local test passed) |
| Supabase Site URL field     | Auth → URL Configuration     | No        | Optional                    |
| Email confirmation ON       | Auth → Providers → Email     | Yes       | ✅ Done (local test passed) |
| Password min 10             | Auth → Providers → Email     | Yes       | ✅ Done                     |
| Production E2E test         | Live app after deploy        | Yes       | ⬜ After merge              |

---

## Suggested order (remaining work)

1. **Add** `SITE_URL` secret in Cloudflare dashboard (see Step 2)
2. **Commit/push** schema fix (`access: "secret"`) if not on `main` yet
3. **Test** signup → email → dashboard on production
