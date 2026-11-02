# Deploying Thuy's Nail (Vercel + Supabase)

The app is a static React/Vite site that talks to Supabase directly from the browser.
Vercel only hosts the built files; all data lives in your Supabase project.

## 1. Supabase

1. Create a project at https://supabase.com/dashboard.
2. Open **SQL Editor**, paste the whole of `supabase-schema.sql`, and **Run**.
   It creates the tables, sample services/designs, holidays and salon info.
   It is safe to run again (no duplicates).
3. From **Project Settings > API keys**, note:
   - Project URL
   - anon / publishable key (public)
   - service_role / secret key (**secret**, only for seeding)

## 2. Seed login accounts from `.env`

```bash
cp .env.example .env      # Windows: copy .env.example .env
# edit .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
#            SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_*, optional SEED_USER_<n>_*
npm install
npm run seed:users
```

Accounts are upserted by email, so changing a password in `.env` and re-running
`npm run seed:users` updates it. Run `npm run dev` to try it locally.

## 3. Vercel

1. **Add New > Project**, import this GitHub repo. Vercel detects Vite; keep the defaults.
2. Under **Environment Variables** add only:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Deploy**. Vite reads env vars at build time, so if you change them later, redeploy.

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` or the `SEED_*` values to Vercel. They are only
needed on the machine that runs the seed script.

## Known limitations (demo-grade security)

- Passwords are stored in plain text in the `users` table (the app compares them directly).
- RLS policies allow everything for the anon key, so anyone with the site can read/modify
  every table, including `users`. Fine for a class demo; for real customers, move login to
  Supabase Auth and write per-role RLS policies.
