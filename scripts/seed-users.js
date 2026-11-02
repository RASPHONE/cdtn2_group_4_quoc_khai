/**
 * Seed login accounts into the Supabase `users` table from .env
 *
 *   npm run seed:users
 *
 * Reads (from .env in the project root, or from real environment variables):
 *   SUPABASE_URL                (falls back to VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY   (server-side secret key - never prefix with VITE_)
 *
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME   -> role "admin"
 *   SEED_USER_<n>_EMAIL / _PASSWORD / _NAME / _ROLE             -> extra accounts
 *     (n = 1, 2, 3 ... ; ROLE is "user" (default) or "admin")
 *
 * Accounts are upserted by email, so re-running updates the password/name/role
 * to whatever is currently in .env.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

// ---- load .env (no extra dependency; real env vars take priority) ----------
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
    let value = line.slice(eq + 1).trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    else value = value.replace(/\s+#.*$/, '') // strip inline comment
    if (!(key in process.env)) process.env[key] = value
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env'))

const env = (k) => (process.env[k] ?? '').trim()
const fail = (msg) => {
  console.error(`\n[seed:users] ERROR: ${msg}\n`)
  process.exit(1)
}

// ---- connection ------------------------------------------------------------
const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
if (!url) fail('SUPABASE_URL (or VITE_SUPABASE_URL) is not set.')
if (!serviceKey) fail('SUPABASE_SERVICE_ROLE_KEY is not set (Supabase > Project Settings > API keys).')
if (serviceKey.startsWith('sb_publishable_') || serviceKey === env('VITE_SUPABASE_ANON_KEY')) {
  fail('SUPABASE_SERVICE_ROLE_KEY looks like the public anon/publishable key. Use the service_role / secret key.')
}

// ---- collect accounts ------------------------------------------------------
const accounts = []

if (env('SEED_ADMIN_EMAIL') || env('SEED_ADMIN_PASSWORD')) {
  accounts.push({
    source: 'SEED_ADMIN',
    email: env('SEED_ADMIN_EMAIL'),
    password: env('SEED_ADMIN_PASSWORD'),
    name: env('SEED_ADMIN_NAME') || 'Admin',
    role: 'admin',
  })
}

const userIndexes = new Set(
  Object.keys(process.env)
    .map((k) => k.match(/^SEED_USER_(\d+)_EMAIL$/)?.[1])
    .filter(Boolean)
)
for (const n of [...userIndexes].sort((a, b) => a - b)) {
  const p = `SEED_USER_${n}_`
  accounts.push({
    source: `SEED_USER_${n}`,
    email: env(p + 'EMAIL'),
    password: env(p + 'PASSWORD'),
    name: env(p + 'NAME') || null,
    role: (env(p + 'ROLE') || 'user').toLowerCase(),
  })
}

if (accounts.length === 0) {
  fail('No accounts found. Set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (and optionally SEED_USER_<n>_*) in .env.')
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const seen = new Set()
for (const a of accounts) {
  if (!emailRe.test(a.email)) fail(`${a.source}: invalid or missing email "${a.email}".`)
  if (!a.password) fail(`${a.source}: password is empty.`)
  if (!['user', 'admin'].includes(a.role)) fail(`${a.source}: ROLE must be "user" or "admin" (got "${a.role}").`)
  if (seen.has(a.email.toLowerCase())) fail(`${a.source}: duplicate email ${a.email}.`)
  seen.add(a.email.toLowerCase())
  if (a.password.length < 8 || /^(admin123|password|12345678)$/i.test(a.password)) {
    console.warn(`[seed:users] warning: ${a.source} (${a.email}) has a weak password.`)
  }
}
if (!accounts.some((a) => a.role === 'admin')) {
  console.warn('[seed:users] warning: no admin account in .env - nobody will be able to open /admin.')
}

// ---- upsert ----------------------------------------------------------------
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const rows = accounts.map(({ email, password, name, role }) => ({ email, password, name, role }))
const { data, error } = await supabase
  .from('users')
  .upsert(rows, { onConflict: 'email' })
  .select('email, role')

if (error) {
  fail(
    `${error.message}\n` +
    '  - Did you run supabase-schema.sql in the Supabase SQL Editor first?\n' +
    '  - Is SUPABASE_URL pointing at the right project?'
  )
}

console.log(`[seed:users] ${data.length} account(s) seeded into ${new URL(url).host}:`)
for (const r of data) console.log(`  - ${r.email} (${r.role})`)
