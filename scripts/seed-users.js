/**
 * Create / update login accounts in Supabase Auth from env files.
 *
 *   npm run seed:users                     # reads .env, then .env.local (local wins), like Vite
 *   npm run seed:users -- --env .env       # read only this file (e.g. to seed the cloud project)
 *
 * Variables (real environment variables override the files):
 *   VITE_SUPABASE_URL            Supabase API URL (local: http://127.0.0.1:54321)
 *   SUPABASE_SERVICE_ROLE_KEY    secret / service_role key - never prefix with VITE_
 *
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME   -> role "admin"
 *   SEED_USER_<n>_EMAIL / _PASSWORD / _NAME / _ROLE             -> extra accounts
 *     (n = 1, 2, 3 ... ; ROLE is "user" (default) or "admin")
 *
 * Existing accounts (matched by email) get their password, name and role reset
 * to what the env file says, so re-running is safe.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const fail = (msg) => {
  console.error(`\n[seed:users] ERROR: ${msg}\n`)
  process.exit(1)
}

// ---- which env files? --------------------------------------------------------
const argv = process.argv.slice(2)
const envFlag = argv.indexOf('--env')
let envFiles = ['.env', '.env.local']
if (envFlag !== -1) {
  if (!argv[envFlag + 1]) fail('--env needs a file name, e.g. --env .env')
  envFiles = [argv[envFlag + 1]]
  if (!fs.existsSync(path.resolve(envFiles[0]))) fail(`env file not found: ${envFiles[0]}`)
}

// ---- load env files (no extra dependency) ----------------------------------
function parseEnvFile(file) {
  const out = {}
  for (const raw of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
    let value = line.slice(eq + 1).trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    else value = value.replace(/\s+#.*$/, '') // strip inline comment
    out[key] = value
  }
  return out
}

const fromFiles = {}
const loaded = []
for (const f of envFiles) {
  const full = path.resolve(process.cwd(), f)
  if (!fs.existsSync(full)) continue
  Object.assign(fromFiles, parseEnvFile(full)) // later files win
  loaded.push(f)
}
const env = (k) => (process.env[k] ?? fromFiles[k] ?? '').trim()

// ---- connection ------------------------------------------------------------
const url = env('VITE_SUPABASE_URL') || env('SUPABASE_URL')
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
if (!url) fail(`VITE_SUPABASE_URL is not set (looked in: ${envFiles.join(', ')}).`)
if (!serviceKey) fail('SUPABASE_SERVICE_ROLE_KEY is not set (local: "Secret" key from `npx supabase status`; cloud: Project Settings > API keys).')
if (serviceKey.startsWith('sb_publishable_') || serviceKey === env('VITE_SUPABASE_ANON_KEY')) {
  fail('SUPABASE_SERVICE_ROLE_KEY looks like the public anon/publishable key. Use the secret / service_role key.')
}

let host
try { host = new URL(url).host } catch { fail(`VITE_SUPABASE_URL is not a valid URL: ${url}`) }
const isLocal = /^(localhost|127\.0\.0\.1|host\.docker\.internal)(:|$)/.test(host)

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

const allKeys = new Set([...Object.keys(fromFiles), ...Object.keys(process.env)])
const userIndexes = [...allKeys]
  .map((k) => k.match(/^SEED_USER_(\d+)_EMAIL$/)?.[1])
  .filter(Boolean)
  .sort((a, b) => a - b)
for (const n of userIndexes) {
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
  fail('No accounts found. Set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (and optionally SEED_USER_<n>_*).')
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const seen = new Set()
for (const a of accounts) {
  a.email = a.email.toLowerCase() // Supabase Auth stores emails in lower case
  if (!emailRe.test(a.email)) fail(`${a.source}: invalid or missing email "${a.email}".`)
  if (!a.password) fail(`${a.source}: password is empty.`)
  if (a.password.length < 6) fail(`${a.source}: password must be at least 6 characters (Supabase Auth minimum).`)
  if (!['user', 'admin'].includes(a.role)) fail(`${a.source}: ROLE must be "user" or "admin" (got "${a.role}").`)
  if (seen.has(a.email)) fail(`${a.source}: duplicate email ${a.email}.`)
  seen.add(a.email)
  if (a.password.length < 8 || /^(admin123|password|12345678)$/i.test(a.password)) {
    console.warn(`[seed:users] warning: ${a.source} (${a.email}) has a weak password.`)
  }
}
if (!accounts.some((a) => a.role === 'admin')) {
  console.warn('[seed:users] warning: no admin account - nobody will be able to open /admin.')
}

console.log(`[seed:users] env: ${loaded.length ? loaded.join(' + ') : '(environment only)'}`)
console.log(`[seed:users] target: ${host} (${isLocal ? 'LOCAL' : 'CLOUD'})`)

// ---- create or update via the Auth admin API -------------------------------
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function findExistingUsers(emails) {
  const found = new Map()
  const perPage = 1000
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    for (const u of data.users) {
      if (u.email && emails.has(u.email.toLowerCase())) found.set(u.email.toLowerCase(), u)
    }
    if (data.users.length < perPage || found.size === emails.size) break
  }
  return found
}

let existing
try {
  existing = await findExistingUsers(seen)
} catch (e) {
  fail(
    `${e.message}\n` +
    '  - Is Supabase running / is VITE_SUPABASE_URL right? (local: `npx supabase start`)\n' +
    '  - Is SUPABASE_SERVICE_ROLE_KEY the secret key of that same project?'
  )
}

let failures = 0
for (const a of accounts) {
  const current = existing.get(a.email)
  const attrs = {
    password: a.password,
    email_confirm: true,
    user_metadata: { ...(current?.user_metadata || {}), ...(a.name ? { name: a.name } : {}) },
    app_metadata: { ...(current?.app_metadata || {}), role: a.role },
  }
  let error
  try {
    ;({ error } = current
      ? await supabase.auth.admin.updateUserById(current.id, attrs)
      : await supabase.auth.admin.createUser({ email: a.email, ...attrs }))
  } catch (e) {
    error = e
  }

  if (error) {
    failures++
    console.error(`  x ${a.email}: ${error.message}`)
  } else {
    console.log(`  ${current ? 'updated' : 'created'} ${a.email} (${a.role})`)
  }
}

if (failures) fail(`${failures} account(s) could not be seeded.`)
console.log('[seed:users] done.')
