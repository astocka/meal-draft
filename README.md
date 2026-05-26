# MealDraft

![](./public/template.png)

A meal-suggestion web app with AI-powered meal generation, built with Astro 6 SSR and deployed to Cloudflare Workers.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22 LTS (pinned in `.nvmrc`)
- pnpm (declared in `package.json` `packageManager` field)
- Cloudflare account + `wrangler` CLI authenticated (`npx wrangler login`)
- Supabase project (cloud or local via Docker)

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Create environment files from the templates:

```bash
cp .env.example .env
cp .env.example .dev.vars
```

Fill in `SUPABASE_URL` and `SUPABASE_KEY` in both files. See [Supabase Configuration](#supabase-configuration) for where to find these values.

- `.env` is used by `astro dev` (Node.js runtime)
- `.dev.vars` is used by `astro preview` / `wrangler dev` (workerd runtime)

3. Run the development server:

```bash
pnpm run dev
```

## Available Scripts

- `pnpm run dev` - Start development server (Cloudflare workerd runtime via Vite plugin)
- `pnpm run build` - Build for production
- `pnpm run preview` - Preview production build (local workerd/Miniflare)
- `pnpm run preview:wrangler` - Build + run local workerd via wrangler dev
- `pnpm run deploy` - Build + deploy to Cloudflare Workers
- `pnpm run lint` - Run ESLint with type-checked rules
- `pnpm run lint:fix` - Auto-fix ESLint issues
- `pnpm run format` - Run Prettier

## Project Structure

```
.
├── src/
│   ├── layouts/        # Astro layouts
│   ├── pages/          # Astro pages and API endpoints
│   │   └── api/        # API endpoints
│   ├── components/     # UI components (Astro & React)
│   │   ├── hooks/      # React hooks
│   │   └── ui/         # shadcn/ui components
│   ├── lib/            # Supabase client, utilities, services
│   └── types.ts        # Shared entity types and DTOs
├── supabase/           # Database migrations and config
├── public/             # Public assets
├── wrangler.jsonc      # Cloudflare Workers config
└── astro.config.mjs    # Astro config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### Using a cloud Supabase project

Add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard > Settings > API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard > Settings > API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Local Supabase (requires Docker)

1. Initialize the local project: `npx supabase init`
2. Start the stack: `npx supabase start`
3. Copy credentials from CLI output into `.env` and `.dev.vars`
4. Stop when done: `npx supabase stop`

Local Studio UI: `http://localhost:54323`

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/). Production auto-deploys on push to `main` via Cloudflare Git integration.

### Manual deploy

```bash
pnpm run deploy
```

### Auto-deploy

Push or merge to `main` — Cloudflare builds and deploys automatically.

### Runtime secrets

Set once (or to rotate):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

### Rollback

```bash
npx wrangler deployments list
npx wrangler rollback
```

Rollback is instant and atomic. It reverts code only — Supabase schema migrations are not reverted.

### Production log streaming

```bash
npx wrangler tail
```

### Important: dev/prod parity

`astro dev` runs on Node.js, not workerd. Always run `pnpm run build && pnpm run preview` before deploying to catch workerd-only failures. See `AGENTS.md` for the full Cloudflare operations checklist.

## CI

GitHub Actions runs lint + build on every push and PR to `main`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub for the build step.

## License

MIT
