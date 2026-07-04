---
title: MealDraft — aktualny flow autoryzacji (po refaktorze auth)
created: 2026-07-04
type: domain-note
supersedes: context/archive/2026-05-30-auth-flow-for-mvp/
---

# Auth flow — stan obecny (MVP v1)

> Ten dokument opisuje **działający** flow autoryzacji po refaktorze auth (usunięcie
> email-confirmation flow). Zastępuje opisy w `context/archive/2026-05-30-auth-flow-for-mvp/`,
> które dokumentują stary flow (PKCE + `/auth/callback` + `SITE_URL`).

---

## Rejestracja (signup)

```
Przeglądarka                  /auth/signup.astro            POST /api/auth/signup.ts
     |                                |                               |
     |  GET /auth/signup              |                               |
     |------------------------------->|                               |
     |<-------------------------------|                               |
     |                                |                               |
     |  POST form (email, password,   |                               |
     |             inviteCode)        |                               |
     |------------------------------->|-------------------------------| 1. Parsuj formularz (FormData)
     |                                |                               | 2. Waliduj Zod (signUpSchema)
     |                                |                               | 3. Sprawdź INVITE_CODE
     |                                |                               |    (astro:env/server)
     |                                |                               | 4. Odczytaj SUPABASE_SERVICE_ROLE_KEY
     |                                |                               |    (cloudflare:workers — NIE astro:env)
     |                                |                               | 5. adminClient.auth.admin.createUser({
     |                                |                               |      email, password,
     |                                |                               |      email_confirm: true  ← bez maila
     |                                |                               |    })
     |                                |                               |
     |  redirect /auth/signin?success |                               |
     |<-------------------------------|-------------------------------|
```

**Kluczowe decyzje:**

- Konta tworzone przez **admin API** (`@supabase/supabase-js` admin client), nie przez `supabase.auth.signUp()` z SSR klienta.
- `email_confirm: true` — konto jest od razu aktywne, bez wysyłki maila potwierdzającego.
- Gating przez **invite code** (`INVITE_CODE` w `.dev.vars` / Cloudflare Worker secret) — jedyny mechanizm ograniczenia rejestracji.
- `SUPABASE_SERVICE_ROLE_KEY` — celowo **poza** `astro:env/server`; odczytywany przez `import { env } from "cloudflare:workers"` wyłącznie w `signup.ts`. Uniemożliwia przypadkowy import w innych plikach.
- Brak `/auth/callback.astro` i `/auth/confirm-email.astro` — pliki usunięte.
- Brak `SITE_URL` — usunięty z `astro.config.mjs`.

---

## Logowanie (signin)

```
Przeglądarka              /auth/signin.astro         POST /api/auth/signin.ts
     |                            |                           |
     |  POST form (email, password) |                         |
     |----------------------------->|------------------------->| supabase.auth.signInWithPassword()
     |                            |                           | → set-cookie (session)
     |  redirect /dashboard       |                           |
     |<-----------------------------|--------------------------|
```

Standardowy flow Supabase SSR — bez zmian.

---

## Middleware / sesja

- `src/middleware.ts` — na każde żądanie: `supabase.auth.getUser()`, wynik w `context.locals.user`.
- `PROTECTED_ROUTES`: `/dashboard`, `/favorites` — redirect → `/auth/signin` jeśli brak sesji.
- `/` → redirect do `/dashboard` (zalogowany) lub `/auth/signin` (niezalogowany).
- Cookies zarządzane przez `@supabase/ssr` (cookie-based sessions).

---

## Wylogowanie (signout)

`POST /api/auth/signout.ts` → `supabase.auth.signOut()` → redirect `/auth/signin`.

---

## Usunięte elementy (stary flow)

| Element                                           | Status         |
| ------------------------------------------------- | -------------- |
| `/auth/callback.astro`                            | **Usunięty**   |
| `/auth/confirm-email.astro`                       | **Usunięty**   |
| `SITE_URL` w `astro.config.mjs`                   | **Usunięty**   |
| `src/lib/auth/get-site-url.ts`                    | **Usunięty**   |
| `src/lib/auth/resolve-email-callback-redirect.ts` | **Usunięty**   |
| `src/lib/auth/supabase-url.ts`                    | **Usunięty**   |
| PKCE flow                                         | **Nieużywany** |

---

## Środowisko — sekrety auth

| Zmienna                     | Gdzie ustawiana                       | Do czego                       |
| --------------------------- | ------------------------------------- | ------------------------------ |
| `SUPABASE_URL`              | `.dev.vars`, `astro:env/server`       | URL projektu Supabase          |
| `SUPABASE_KEY`              | `.dev.vars`, `astro:env/server`       | Klucz `anon` (SSR client)      |
| `SUPABASE_SERVICE_ROLE_KEY` | `.dev.vars`, Cloudflare Worker secret | Admin API (tylko `signup.ts`)  |
| `INVITE_CODE`               | `.dev.vars`, Cloudflare Worker secret | Kod zaproszenia do rejestracji |

---

## Pliki implementacji

| Plik                            | Rola                                     |
| ------------------------------- | ---------------------------------------- |
| `src/pages/api/auth/signup.ts`  | Admin API + invite gate                  |
| `src/pages/api/auth/signin.ts`  | SSR sign-in                              |
| `src/pages/api/auth/signout.ts` | Sign-out                                 |
| `src/pages/auth/signup.astro`   | Formularz rejestracji                    |
| `src/pages/auth/signin.astro`   | Formularz logowania                      |
| `src/lib/supabase.ts`           | SSR Supabase client (cookie session)     |
| `src/lib/auth/signup-schema.ts` | Zod schema (email, password, inviteCode) |
| `src/middleware.ts`             | Sesja + PROTECTED_ROUTES                 |
