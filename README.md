# BLGD — Track your Extreme Demons

A private Extreme Demon log for a small group of Geometry Dash players. Everyone
gets a profile linked to their in-game account, logs the demons they have
beaten, rates each one for **enjoyment** and **personal difficulty**, links their
completion video, and shows up on a leaderboard.

AREDL ranks are pulled live from the real AREDL API and re-synced over time, so
a level that was #27 when you logged it reads #31 once AREDL moves it. Nobody
types a rank in by hand.

Visually inspired by AREDL, but not a clone of it: its own name, its own
palette, its own layout, and none of its points, packs or creator-points
systems.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Architecture](#2-architecture)
3. [Install](#3-install)
4. [Create the Supabase project](#4-create-the-supabase-project)
5. [Create the tables](#5-create-the-tables)
6. [Row Level Security](#6-row-level-security)
7. [Configure Auth](#7-configure-auth)
8. [Environment variables](#8-environment-variables)
9. [Run it locally](#9-run-it-locally)
10. [Deploy to GitHub Pages](#10-deploy-to-github-pages)
11. [GitHub Actions](#11-github-actions)
12. [Edge Functions](#12-edge-functions)
13. [Keeping AREDL up to date](#13-keeping-aredl-up-to-date)
14. [External APIs](#14-external-apis)
15. [Known limitations](#15-known-limitations)
16. [Design decisions](#16-design-decisions)
17. [Project structure](#17-project-structure)
18. [Verification](#18-verification)

---

## 1. What it does

The main flow:

```
Register
   ↓
Link your Geometry Dash account          → username, stars, moons, demons, icon
   ↓
Dashboard
   ↓
Add Extreme Demon → enter a level ID     → name, creator, difficulty, artwork
   ↓                                       + current AREDL rank
Preview the level
   ↓
Set enjoyment (0–10), difficulty (0–10), paste your YouTube completion
   ↓
Add
   ↓
It appears on your profile, on the level page next to everyone else's ratings,
and your position on the leaderboard updates.
```

Pages:

| Route | What it is | Auth |
| --- | --- | --- |
| `/` | Pitch, latest completions, leaderboard preview, hardest logged | public |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Auth | public |
| `/dashboard` | Your stats and your demons, with the add button | signed in |
| `/profile/:username` | Anyone's profile | public |
| `/levels` | The shared catalogue, plus live Geometry Dash search | public |
| `/levels/:id` | One level, with every member's rating side by side | public |
| `/leaderboard` | Ranked by demons / enjoyment / difficulty / stars | public |
| `/aredl` | The live AREDL ranking, all ~1,600 levels | public |
| `/settings` | Profile, Geometry Dash link, password, delete account | signed in |
| `/admin` | Force a sync, inspect members and levels, delete content | admin |

Deliberately **not** included, per the brief: creator points, pack points, pack
rankings, and any composite score that blends unrelated numbers into one rank.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser  —  React 18 + TypeScript + Vite + Tailwind         │
│  Hosted on GitHub Pages (static files only)                  │
└───────────┬──────────────────────────┬───────────────────────┘
            │                          │
            │ supabase-js              │ direct fetch (both APIs send
            │ (anon key + RLS)         │  permissive CORS headers)
            ▼                          ▼
┌───────────────────────┐   ┌──────────────────────────────────┐
│  Supabase             │   │  api.aredl.net/v2                │
│  ├── Postgres + RLS   │   │  gdbrowser.com                   │
│  ├── Auth (PKCE)      │   └──────────────▲───────────────────┘
│  └── Edge Functions ──┼──────────────────┘
│      (service_role,    │      preferred path: server-side,
│       Deno)            │      cached, one rate-limit budget
└───────────────────────┘
```

**There is no Node server.** GitHub Pages serves static files; everything with a
server-side component lives in Supabase.

### The service layer

No React component talks to an API directly. Everything goes through
`src/services/`:

| Module | Responsibility |
| --- | --- |
| `geometryDash.service.ts` | Levels, players, search, icons. One provider, isolated behind four parse functions. |
| `aredl.service.ts` | The ranking, per-level detail, sync. |
| `levels.service.ts` | Resolving a level ID across both providers; the `levels` catalogue. |
| `completions.service.ts` | Personal ratings — create, edit, delete, sort, summarise. |
| `profiles.service.ts` | Site identity and the Geometry Dash link. |
| `leaderboard.service.ts` | One metric at a time, never blended. |
| `admin.service.ts` | Forced syncs, provider health, content removal. |
| `edge.ts` | Calls Edge Functions; decides when to fall back. |

Swapping the Geometry Dash provider means rewriting `parseLevel` and
`parseProfile` in one file. Nothing else knows the provider exists.

### Edge Functions are preferred, not required

Both upstream APIs send open CORS headers, so the browser can call them
directly. The app therefore has two paths for every external read:

- **Edge Function** (preferred): runs server-side with the `service_role` key,
  caches into Postgres, keeps one rate-limit budget for the whole group, and can
  write data the caller's own RLS policies would forbid — like refreshing a
  *friend's* star count.
- **Direct** (fallback): the browser does the same work itself.

`VITE_DATA_MODE` controls the policy — `auto` (default), `edge`, or `direct`.
The consequence: **you can clone this repo, point it at a fresh Supabase project,
and add a demon before ever installing the Supabase CLI.** Deploying the
functions later upgrades the behaviour without any frontend change.

### The data model

```
levels  (one row per Geometry Dash level — shared)
   ▲
   │  level_id
completions  (one row per user per level — personal)
   │  user_id
   ▼
profiles  (one row per member, keyed on auth.users.id)

aredl_levels  (local mirror of the AREDL ranking, written only by Edge Functions)
sync_runs     (audit log)
```

A level five people have beaten is **one** `levels` row and **five**
`completions` rows. Level metadata is never duplicated per user.

---

## 3. Install

Requirements: **Node 20+** (22 or 24 recommended) and npm.

```bash
git clone <your-repo-url> blgd
cd blgd
npm install
```

Optional, for Edge Functions:

```bash
npm install -g supabase
# or: brew install supabase/tap/supabase
```

---

## 4. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and create a project (the free tier is
   plenty for a group of friends).
2. Pick a region near you and save the database password somewhere.
3. Once it finishes provisioning, open **Project Settings → API** and note:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → *needed later for Edge Functions only.* This one is
     a real secret. It bypasses every RLS policy. It must never appear in a
     `VITE_` variable, in the repo, or in the browser.

---

## 5. Create the tables

Open **SQL Editor → New query**, paste the whole of

```
supabase/migrations/20260922000000_initial_schema.sql
```

and run it. That one file creates everything: tables, indexes, triggers, the two
aggregate views, the signup hook, all RLS policies, and the column grants.

With the Supabase CLI instead:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### Make yourself an admin

Register through the app first, then run:

```sql
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

This is a SQL-editor operation on purpose — see [Row Level Security](#6-row-level-security).

---

## 6. Row Level Security

RLS is on for every table. The policies are at the bottom of the migration file
and are worth reading; the summary:

| Table | Read | Insert | Update | Delete |
| --- | --- | --- | --- | --- |
| `profiles` | everyone | own row | own row (admins: any) | own row, or admin |
| `levels` | everyone | signed in | signed in | admin only |
| `completions` | everyone | **own only** | **own only** | own, or admin |
| `aredl_levels` | everyone | — | — | — |
| `sync_runs` | admin | — | — | — |

Four things worth calling out:

**Completions are pinned to `auth.uid()` on both sides.** Each policy has a
`USING` clause (which rows the statement may touch) *and* a `WITH CHECK` clause
(what the resulting row may look like). That means a member cannot create a
completion for someone else, and cannot reassign one of their own rows to
another user either. This is the requirement the brief cared most about, and it
is enforced in Postgres — not in the React code, which could simply be bypassed
by calling the API directly.

**`is_admin` is not self-grantable.** RLS policies work per row, not per column,
so a row-level policy could never stop an `UPDATE profiles SET is_admin = true`.
The migration instead `REVOKE`s blanket UPDATE from `authenticated` and re-grants
it column by column, omitting `is_admin`. There is no request a signed-in client
can send that raises its own privileges.

**`aredl_levels` has RLS enabled and no write policy.** With RLS on and no
matching policy, every client write is denied. The only thing that can write it
is the `service_role` key inside an Edge Function.

**`levels` is writable by any signed-in member — deliberately.** That is what
lets the app work before the Edge Functions are deployed. It is a documented
trade-off for a friends-only site: level rows are shared factual data that the
authoritative sync overwrites anyway, and deletion is still admin-only so nobody
can pull a level out from under someone else's completion. The stricter
alternative — require `resolve-level` for all writes — is marked in the
migration; drop the two `levels` write policies and set `VITE_DATA_MODE=edge`.

### Visibility

This deployment is configured **public read, private write**: profiles, levels,
completions and the leaderboard are readable without an account, so you can share
a profile link. To make the site fully private instead, change `to anon,
authenticated` to `to authenticated` in every `SELECT` policy. Nothing else
changes.

---

## 7. Configure Auth

**Authentication → Providers → Email**: enabled by default. Decide on
confirmations:

- *Confirm email OFF* — people can sign in immediately after registering.
  Friendlier for a small group.
- *Confirm email ON* — Supabase's built-in SMTP is rate-limited to a handful of
  messages per hour, which is fine for five friends but will bite you at scale.
  The app handles both cases; with confirmations on, `RegisterPage` shows a
  "check your email" screen.

**Authentication → URL Configuration** — this one matters for password resets:

- **Site URL**: `https://<your-username>.github.io/<repo>/`
- **Redirect URLs**: add both
  - `https://<your-username>.github.io/<repo>/**`
  - `http://localhost:5173/**`

Without those, the reset-password and confirmation links will bounce.

The app uses the **PKCE** flow, so those links come back with a `?code=` query
parameter rather than tokens in the URL fragment — which is what lets it use
`HashRouter` safely (see [Design decisions](#16-design-decisions)).

---

## 8. Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Required | What it is |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | anon / publishable key |
| `VITE_BASE_PATH` | no | `/` locally; `/<repo>/` on Pages (CI sets it) |
| `VITE_SITE_NAME` | no | Wordmark in the UI. Default `BLGD` |
| `VITE_AREDL_API_BASE` | no | Default `https://api.aredl.net/v2` |
| `VITE_GD_API_BASE` | no | Default `https://gdbrowser.com` |
| `VITE_DATA_MODE` | no | `auto` (default) / `edge` / `direct` |

**Everything in a `VITE_` variable ships to every visitor.** Vite inlines them
into the bundle at build time. That is fine for the two Supabase values — the
anon key is designed to be public and RLS is what protects the data — and it is
why the `service_role` key must never go near this file.

Private secrets live only in Edge Function secrets:

```bash
supabase secrets set SYNC_SECRET=$(openssl rand -hex 32)
```

(`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected
into deployed functions automatically; you only need them locally, in
`supabase/functions/.env.local` — see `.env.local.example`.)

---

## 9. Run it locally

```bash
npm run dev       # http://localhost:5173
npm run build     # typecheck + production build into dist/
npm run preview   # serve the built output
```

If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing, the app renders a
setup screen with instructions instead of a blank page.

> Vite reads `.env` once, at startup. After editing it, restart the dev server.

---

## 10. Deploy to GitHub Pages

**1. Push the repo to GitHub.**

**2. Settings → Pages → Build and deployment → Source: GitHub Actions.**
(Not "Deploy from a branch".)

**3. Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | your project URL |
| `VITE_SUPABASE_ANON_KEY` | your anon key |

Optional repository **variables** (same page, *Variables* tab):

| Variable | When you need it |
| --- | --- |
| `VITE_SITE_NAME` | to rename the site |
| `VITE_BASE_PATH` | set to `/` for a user site (`<user>.github.io`); leave unset for a project site |

**4. Push to `main`.** The workflow builds and publishes. The site lands at
`https://<your-username>.github.io/<repo>/`.

**5. Go back to Supabase → Authentication → URL Configuration** and add that URL
to Site URL and Redirect URLs.

### Why the URLs have a `#`

The app routes on the URL fragment. GitHub Pages serves static files with no
rewrite rules, so a direct request for `/profile/someone` would hit its 404 page.
The common workaround is a `404.html` that re-encodes the path and bounces
through `index.html` — but that adds a redirect to every deep link and
interferes with the `?code=` parameter Supabase appends to auth redirects.
Routing on the fragment means the server only ever sees the app root, so deep
links, refreshes and auth callbacks all just work. The workflow still copies
`index.html` to `404.html` as a courtesy for hand-typed paths.

---

## 11. GitHub Actions

Two workflows:

**`.github/workflows/deploy.yml`** — build and publish on every push to
`main`/`master`, or on demand via *Actions → Deploy to GitHub Pages → Run
workflow*. It fails early and loudly if the Supabase secrets are missing, rather
than publishing a site that only shows the setup screen.

**`.github/workflows/sync-aredl.yml`** — optional daily AREDL sync. Needs:

| Secret | Value |
| --- | --- |
| `SUPABASE_FUNCTIONS_URL` | `https://<project-ref>.supabase.co/functions/v1` |
| `SYNC_SECRET` | the same value you gave the Edge Function |

---

## 12. Edge Functions

Three functions, all in `supabase/functions/`:

| Function | What it does | Who may call it |
| --- | --- | --- |
| `sync-aredl` | Mirrors the AREDL ranking, re-stamps every catalogue level's rank | admin, or `x-sync-secret` |
| `resolve-level` | Level ID → full catalogue row, written with `service_role` | any signed-in member |
| `sync-gd-profile` | Re-reads a member's Geometry Dash stats | any signed-in member (rate-limited server-side) |

### Deploying

```bash
supabase login
supabase link --project-ref <your-project-ref>

supabase secrets set SYNC_SECRET=$(openssl rand -hex 32)

supabase functions deploy sync-aredl
supabase functions deploy resolve-level
supabase functions deploy sync-gd-profile
```

`supabase/config.toml` already sets `verify_jwt = false` for `sync-aredl` (it
authenticates the shared secret itself, because cron jobs have no user session)
and `true` for the other two.

### Running them locally

```bash
cp supabase/functions/.env.local.example supabase/functions/.env.local
# fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET
supabase functions serve --env-file supabase/functions/.env.local
```

### Skipping them entirely

The app works without them. What you lose:

- Refreshing **another member's** star count when you open their profile — RLS
  correctly refuses to let your session write their row, so the profile shows
  their last-synced values. Your own refresh still works.
- Server-side AREDL sync. The admin page falls back to doing it from the
  browser, one `UPDATE` per changed level, which reaches the same end state more
  slowly.
- Scheduled syncing. Without a function to call, there is nothing to schedule.

---

## 13. Keeping AREDL up to date

Ranks refresh at four points:

1. **When a level is added** — resolved live at that moment.
2. **When a level page is opened** and you press *Refresh*.
3. **From the admin page** — *Sync AREDL now*, which re-stamps every level.
4. **On a schedule** — pick one:
   - `.github/workflows/sync-aredl.yml` (a GitHub Action, no extensions needed), or
   - `supabase/optional-scheduled-sync.sql` (pg_cron + pg_net, entirely inside
     Supabase; stores the secret in Vault rather than inline in the job).

You do not need both. Every run is logged to `public.sync_runs` and shown on the
admin page, so you can see what actually happened rather than assuming.

Between syncs, the browser caches the ranking for 30 minutes
(`src/lib/cache.ts`), and identical concurrent requests are coalesced into one
fetch.

---

## 14. External APIs

Both were verified against the live services while building this. Neither needs
a key.

### AREDL — `https://api.aredl.net/v2`

Documented at <https://api.aredl.net/v2/docs> (OpenAPI 3.1 at
`/v2/openapi.json`). Public, read-only, no auth, `Cache-Control: max-age=900`,
and it reflects the request `Origin` — so it is callable from the browser.

| Endpoint | Used for |
| --- | --- |
| `GET /api/aredl/levels` | The whole ranking, ~1,621 entries |
| `GET /api/aredl/levels/{id}` | One level: publisher, verifications |
| `GET /api/aredl/levels/{id}/creators` | The full credit list |

Fields consumed: `level_id` (the Geometry Dash ID), `position` (the rank),
`name`, `status` (`MainList` / `Legacy`), `points`, `gddl_tier`, `tags`,
`description`, `two_player`, and `verifications[].video_url`.

> **A real quirk, handled explicitly.** `/api/aredl/levels/{id}` resolves `{id}`
> as an AREDL UUID **or** a list position **or** a Geometry Dash level ID.
> Asking for `/levels/128` returns the level sitting at **position 128**, not the
> level whose Geometry Dash ID is 128. Every rank lookup in this codebase
> therefore matches on the `level_id` **field** of the full list, and per-level
> calls use the unambiguous AREDL UUID — with a guard that discards the response
> if `level_id` does not match what was asked for. See the module comment in
> `src/services/aredl.service.ts`.

### Geometry Dash — `https://gdbrowser.com`

There is **no modern official Geometry Dash API**. RobTop's servers
(`boomlings.com/database/*.php`) take form-encoded POSTs, answer in a custom
`key:value:key:value` format, send no CORS headers, and are not intended for
third-party traffic. GDBrowser is the long-running community front-end that
proxies them, returns JSON, and sends `Access-Control-Allow-Origin: *`.

| Endpoint | Used for |
| --- | --- |
| `GET /api/level/:id` | Name, creator, difficulty, length, song, downloads, likes |
| `GET /api/profile/:username` | Stars, moons, diamonds, demons, account ID, icon config |
| `GET /api/search/:query` | Level search (filtered to Extreme Demons) |
| `GET /icon/:username` | The player's rendered cube, as a PNG — used as the avatar |

If GDBrowser ever goes away, point `VITE_GD_API_BASE` at a compatible mirror, or
rewrite `parseLevel` / `parseProfile` in
`src/services/geometryDash.service.ts`. Nothing else in the codebase knows the
provider exists.

### Level artwork — YouTube thumbnails

Geometry Dash exposes no preview image for a level, and no render service
exists. So artwork is resolved in this order:

1. The thumbnail of **your own completion video** — most personal, and it is a
   frame of the actual level.
2. The thumbnail of the **AREDL verification video**.
3. A **generated placeholder**: the level's initial on a hue derived
   deterministically from its name, so it is stable rather than random per
   render, and visibly a placeholder rather than a fake screenshot.

`img.youtube.com/vi/<id>/maxresdefault.jpg` only exists when the uploader
supplied a high-resolution frame; `hqdefault.jpg` always does. `SmartImage`
requests the best one and steps down on error.

---

## 15. Known limitations

**Geometry Dash account ownership cannot be verified.** Geometry Dash has no
OAuth and no public way to prove you control an account. Linking is therefore
declarative: the app verifies the account *exists* and reads its real stats, but
cannot verify that you are its owner. The mitigation is a unique index on
`profiles.gd_account_id`, so two members cannot claim the same account. For a
group of friends this is a non-issue; for a public site it would not be enough.

**The Geometry Dash provider is third-party.** GDBrowser is a community project
with no uptime guarantee. The app degrades rather than breaking: a failed
profile sync leaves the previous values in place and says when they were last
synced; a failed level lookup surfaces a real error instead of inventing data.
`VITE_GD_API_BASE` exists so you can repoint it.

**Stars are as fresh as the last sync.** They are cached for 15 minutes and
refreshed when a profile is opened. Without the `sync-gd-profile` Edge Function
deployed, you can only refresh **your own** stats — RLS will not let your session
write another member's row, and that is working as intended.

**A level not on AREDL shows "Unranked", not a made-up number.** Plenty of
Extreme Demons are not on the list. If AREDL itself is unreachable, the add
dialog says so explicitly rather than silently showing "Unranked", and the next
sync fills the rank in.

**AREDL's Legacy list is included, flagged rather than hidden.** 33 of the ~1,621
entries are `Legacy`; they keep their position and get a visible `legacy` badge.

**No realtime.** Changes appear on the next load or refresh. Supabase Realtime
would be straightforward to add if you want it.

**No image hosting.** Artwork is hotlinked from `img.youtube.com`. No Supabase
Storage bucket, nothing to pay for, nothing to garbage-collect.

**Email deliverability.** Supabase's built-in SMTP is heavily rate-limited. For
more than a handful of people, configure a custom SMTP provider under
*Authentication → Email Templates → SMTP Settings*.

---

## 16. Design decisions

### Rating scale: 0–10 in steps of 0.5

The brief left this open. Half steps give 21 distinct values, which is enough
resolution to say "that was a 7.5, not an 8" without asking anyone to agonise
over 7.25 versus 7.3 — and it keeps averages readable. Enforced in three places:
the slider's `step`, `clampRating()` in the service layer, and a `CHECK`
constraint in Postgres (`value * 2 = trunc(value * 2)`), so the database is the
source of truth rather than the UI.

Stored as `numeric(3,1)`. Displayed as `8.5`, never `8.50`.

### `profiles.id` **is** `auth.users.id`

The brief asked for a separate `auth_user_id` column. A 1:1 table keyed directly
on the auth UID is the canonical Supabase pattern: it makes every RLS policy a
plain `auth.uid() = id` comparison and removes a join from every query. The
column is both the primary key and the auth user ID.

### The leaderboard never blends metrics

Requirement 10 was explicit, and it is right. Each metric sorts by exactly one
column, and the UI says which. Members with no data for the selected metric are
**excluded** rather than ranked last on a `null` — being last reads as "worst"
when it actually means "unknown". The one exception is "Extreme Demons", where
everyone is listed including those at zero, because that is real information.

### `HashRouter`

Explained in [§10](#10-deploy-to-github-pages). Short version: no server-side
rewrites on GitHub Pages, and the usual `404.html` redirect trick fights with
Supabase's `?code=` auth callback. Routing on the fragment makes deep links,
refreshes and auth callbacks all work with no redirect dance. The cost is a `#`
in the URL.

### Aggregates are fetched separately, not embedded

`level_stats` is a grouped view whose `level_id` maps to `levels.id` — a primary
key, not a foreign key — so PostgREST has no relationship to infer and an embed
would fail at runtime. One extra indexed query is the honest fix.
`completions → levels` and `completions → profiles` *are* real foreign keys and
are embedded normally.

### Row types are `type`, not `interface`

postgrest-js constrains every `Row`/`Insert`/`Update` to
`Record<string, unknown>`, and only type aliases get an implicit index signature
in TypeScript. Declaring one of them as an `interface` makes the whole `Database`
type quietly fail that constraint and every query result becomes `never`. There
is a note at the top of `src/types/database.ts` so nobody re-introduces it.

### No data-fetching library

The app has a handful of read patterns and a TTL cache with request coalescing
(`src/lib/cache.ts`). `useAsync` and `useAction` in `src/hooks/useAsync.ts` cover
the rest in about 150 lines, with abort-on-unmount and no stale-state writes.
Adding React Query would be more code shipped, not less.

### No mock data

There is none anywhere in the codebase, and no `// TODO: connect to API`. Every
number rendered came from Postgres, from AREDL, or from the Geometry Dash
provider. Where something genuinely cannot be fetched — level preview images —
the fallback is visibly a placeholder and the limitation is documented above.

---

## 17. Project structure

```
.github/workflows/
  deploy.yml              Build + publish to GitHub Pages
  sync-aredl.yml          Optional scheduled AREDL sync

supabase/
  config.toml             CLI config; per-function verify_jwt
  migrations/
    20260922000000_initial_schema.sql    Tables, views, triggers, RLS, grants
  optional-scheduled-sync.sql            pg_cron alternative to the Action
  functions/
    _shared/
      http.ts             CORS, JSON fetch, YouTube ID extraction
      supabase.ts         service/caller clients, caller resolution, run log
      providers.ts        Server-side AREDL + Geometry Dash clients
    sync-aredl/           Mirror the ranking, re-stamp every level
    resolve-level/        Level ID → catalogue row
    sync-gd-profile/      Refresh a member's Geometry Dash stats

src/
  components/
    auth/                 Route guards, shared auth chrome
    layout/               Navbar, Page + Section
    levels/               LevelCard, CatalogueLevelCard, LevelThumbnail,
                          CompletionList, SortBar, AddDemonModal
    profile/              ProfileHeader
    ui/                   Button, Field, Modal, RatingSlider, Badge, Avatar,
                          SmartImage, Skeleton, StatTile, Segmented,
                          EmptyState, ConfirmDialog
    ErrorBoundary.tsx
  hooks/                  useAuth, useToast, useAsync, useDebounce, useMediaQuery
  layouts/AppLayout.tsx   Shell; owns the add/edit modal and the refetch signal
  lib/                    env, supabase client, TTL cache, fetch wrapper
  pages/                  One file per route
  services/               All external + database access
  types/                  database.ts (schema mirror), domain.ts (app shapes)
  utils/                  youtube, thumbnails, format, validation, cn
```

---

## 18. Verification

Two scripts, both runnable with no Supabase project and no API keys.

### `npm run smoke`

Exercises the real service layer against the **live** AREDL and Geometry Dash
APIs. With Supabase unconfigured the services take their "direct" fallback path,
so this also proves the Edge Functions are genuinely optional.

```
$ npm run smoke
PASS  rejects javascript: URL
PASS  rejects lookalike host
PASS  rating snaps to 0.5
PASS  AREDL list loaded - 1621 entries, source=direct
PASS  AREDL positions start at 1 - #1 is Society
PASS  rank lookup keys on level_id, not position - GD level 128 correctly absent
PASS  Bloodlust found by GD level id - AREDL #255
PASS  GD player fetched - 4815 stars, account 71
PASS  resolveLevel: AREDL rank present - #255
PASS  resolveLevel: credits list - Quasar, Panman, Namtar
PASS  resolveLevel: thumbnail derived - https://img.youtube.com/vi/5SzKetF2btw/...
PASS  unlisted level resolves with a null rank
...
ALL CHECKS PASSED
```

It talks to live third-party services, so a failure may mean an upstream outage
rather than a regression here — the output names which call failed.

> This is what caught two real bugs during development: GDBrowser answers **500**
> for `diff=6` (the value the difficulty *face* uses) so the Extreme-Demon filter
> had to become `diff=-2&demonFilter=5`; and its "no results" sentinel `-1` is
> valid JSON, so `JSON.parse` never threw and the not-found branch never fired.

### `npm run check:responsive`

Drives a headless Chromium/Edge over the DevTools Protocol, sets exact viewports
with `Emulation.setDeviceMetricsOverride`, and fails if any page scrolls
horizontally — reporting the offending element's tag, classes and geometry.

```bash
npm run build
npm run preview &          # or: npx vite preview --port 4173
npm run check:responsive
```

It finds Edge or Chrome automatically; override with `BLGD_BROWSER=/path/to/exe`.
Defaults to 390 / 768 / 1024 / 1440 / 1920 px against `http://localhost:4173`.

> `Emulation.setDeviceMetricsOverride` rather than `--window-size` on purpose:
> Windows clamps a browser window to a minimum width, so `--window-size=390`
> silently lays the page out wider and then crops the screenshot — which looks
> exactly like an overflow bug that is not there.

### `npm run test:db`

The one that matters. Creates a throwaway database, applies a Supabase-alike
bootstrap (the `auth` schema, `auth.uid()`, the three roles, and Supabase's
default table privileges), applies **the real migration unmodified**, and then
asserts 47 properties of the security model — including every claim §6 makes.

Needs only a reachable PostgreSQL. No Supabase, no Docker, no network:

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=... npm run test:db
```

```
PASS  alice CANNOT log a completion in bob's name      42501: new row violates RLS policy
PASS  alice CANNOT edit bob's ratings                  0 rows
PASS  alice CANNOT delete bob's completion             0 rows
PASS  alice CANNOT reassign her own completion to bob  42501: new row violates RLS policy
PASS  alice CANNOT make herself an admin               42501: permission denied for table profiles
PASS  a signed-in user CANNOT write the AREDL mirror   42501: permission denied
PASS  anon CANNOT insert a completion                  42501: permission denied
PASS  a 7.3 rating is rejected (0.5 steps only)        23514: check constraint violated
PASS  an admin CAN delete a level                      1 rows
PASS  the leaderboard view has security_invoker on     got true
...
 passed | failed | total
     47 |      0 |    47
```

Note the two different refusal shapes, because they come from different
mechanisms and it is worth knowing which is which:

- **`42501: new row violates row-level security policy`** — an RLS `WITH CHECK`
  clause refused the *resulting* row. This is what stops alice writing bob's name
  into a completion.
- **`0 rows`** — an RLS `USING` clause filtered the row out before the statement
  saw it. An `UPDATE` or `DELETE` aimed at someone else's row does not error; it
  quietly affects nothing. That is correct behaviour, and it is why the tests
  assert on the row count rather than just "no exception".
- **`42501: permission denied for table`** — a column or table `GRANT`, not a
  policy. This is what stops `is_admin` being self-granted, since policies work
  per row and cannot restrict a column.

> This suite caught a real bug on its first run: `public.is_admin()` was defined
> before `public.profiles` existed. Being `language sql`, Postgres validates the
> body at `CREATE` time, so the migration aborted with *relation
> "public.profiles" does not exist*. It would have failed on a real Supabase
> project too, at step 5 of this README. The function now lives immediately after
> the table, with a comment saying why.

### What has and has not been verified

Verified on a real machine:

- `npm run build` and `tsc -b` clean, no TypeScript errors.
- 29/29 smoke checks against the live AREDL and Geometry Dash APIs.
- **47/47 database assertions**, including: a member cannot insert, edit, delete
  or re-own another member's completion; cannot grant themselves admin; cannot
  write the AREDL mirror; cannot read the sync log; anonymous visitors can read
  but not write anything; the rating scale is enforced by the database; deleting
  an account cascades; both views run with `security_invoker`.
- Every public route rendered in a real headless browser: `/`, `/#/levels`,
  `/#/leaderboard`, `/#/aredl` (with ~1,621 live AREDL entries), `/#/login`,
  `/#/register`, and the 404 page.
- `/#/dashboard` redirecting an unauthenticated visitor to `/#/login`.
- No horizontal overflow at 390 / 768 / 1024 / 1440 / 1920 px.
- No `service_role` key, sync secret, or JWT in the built bundle. (The only
  occurrence of the string "service_role" is the setup screen's warning telling
  you not to put it in a `VITE_` variable.)
- The GitHub Actions workflow running end to end on a clean runner — checkout,
  `npm ci`, and then failing exactly where it should when the Supabase secrets
  are absent.

**Still not exercised**, because it needs Supabase's own Auth service (GoTrue)
rather than just Postgres: the HTTP sign-up, sign-in and password-reset round
trips, and PostgREST translating a real JWT into the `request.jwt.claims` GUC.
The database half of that boundary is now tested against the same GUC PostgREST
sets, so what remains untested is the token plumbing, not the policies.


---

## Credits

Rankings from [AREDL](https://aredl.net). Level and player data from
[GDBrowser](https://gdbrowser.com). Geometry Dash is by RobTop Games.

This project is not affiliated with, endorsed by, or connected to any of them.
