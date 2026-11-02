# Running Thuy's Nail

The site is a static React/Vite app that talks to Supabase straight from the browser.
Logins use **Supabase Auth**; who may read or change what is enforced in the database
by row level security (`supabase/migrations/`).

| | Cloud | Local (cross-platform) |
|---|---|---|
| Website | Vercel | Docker (`docker compose up`) on http://localhost:8080 |
| Supabase | supabase.com project | Docker via `npx supabase start` |
| Settings | Vercel env vars, `.env` for seeding | `.env.local` |

Roles: everyone can browse services, designs and salon info. Signed-in customers can
book, see and cancel **their own** bookings. Admins (`app_metadata.role = "admin"`,
set by `npm run seed:users`) see and manage everything.

---

## Local (Windows / macOS / Linux)

Needs **Docker Desktop** (Windows/macOS) or Docker Engine (Linux), and **Node.js 20+**.

```bash
npm install
npx supabase start          # first run downloads the Supabase images (a few minutes)
```

`supabase start` applies `supabase/migrations/` and prints the local API URL and keys
(`npx supabase status` shows them again). Create `.env.local` from `.env.example`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<Publishable key>
SUPABASE_SERVICE_ROLE_KEY=<Secret key>
SEED_ADMIN_EMAIL=...
SEED_ADMIN_PASSWORD=...
```

```bash
npm run seed:users          # creates the logins in local Supabase Auth
docker compose up --build   # website on http://localhost:8080
```

Useful local addresses: Supabase Studio http://localhost:54323 (tables, users),
Mailpit http://localhost:54324 (emails sent by local Auth).

- Hot-reload development instead of the container: `npm run dev` (http://localhost:3000, also uses `.env.local`).
- After changing code, rebuild the container: `docker compose up --build`.
  Changing keys in `.env.local` only needs `docker compose up -d --force-recreate`.
- Stop: `docker compose down` and `npx supabase stop` (data is kept).
- Wipe the local database: `npx supabase db reset`, then `npm run seed:users` again.

## Cloud (Vercel + Supabase)

1. **Create a Supabase project** at https://supabase.com/dashboard.
2. **Apply the schema**, either:
   - `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`, or
   - paste `supabase/migrations/20261102000000_init.sql` into **SQL Editor** and run it.
3. **Auth settings** (Authentication > URL Configuration): set **Site URL** to your Vercel URL,
   e.g. `https://your-app.vercel.app`, so sign-up confirmation emails link back to the site.
   New users must confirm their email by default; for a demo you can turn "Confirm email"
   off in the Email provider settings. (Supabase's built-in mailer only sends a few emails per hour.)
4. **Seed logins**: put the cloud URL, keys and `SEED_*` values in `.env`, then
   `npm run seed:users -- --env .env` (the `--env` flag makes sure `.env.local` is ignored).
5. **Vercel**: Add New > Project, import this repo (Vite is detected). Add only
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Environment Variables, then deploy.
   Vite reads them at build time, so redeploy after changing them.

Never put `SUPABASE_SERVICE_ROLE_KEY` or `SEED_*` values in Vercel.

## Schema changes

Add a new file under `supabase/migrations/` (or `npx supabase migration new <name>`),
test it locally with `npx supabase db reset`, then `npx supabase db push` to the cloud.
