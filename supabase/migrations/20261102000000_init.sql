-- ============================================================================
-- THUY'S NAIL - database schema (Supabase Auth + row level security)
--
-- Local:  applied automatically by `npx supabase start` / `npx supabase db reset`
-- Cloud:  `npx supabase db push` (after `npx supabase link`), or paste this file
--         into Supabase Dashboard > SQL Editor and run it.
--
-- Logins live in Supabase Auth (auth.users), not in a table of ours.
-- Admins are users whose app_metadata.role = 'admin' (set by `npm run seed:users`;
-- app_metadata can only be changed with the secret/service key, never by the user).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: is the current request made by an admin?
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       text not null,
  duration    text,
  category    text,
  image_url   text,
  created_at  timestamptz not null default now()
);

create table if not exists public.designs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  category    text,
  image_url   text,
  is_custom   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid default auth.uid() references auth.users (id) on delete set null,
  user_name     text,
  user_email    text,
  service_id    uuid references public.services (id) on delete set null,
  service_name  text,
  service_price text,
  design_id     uuid references public.designs (id) on delete set null,
  design_name   text,
  design_image  text,
  booking_date  date not null,
  booking_time  text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists bookings_user_id_idx on public.bookings (user_id);

create table if not exists public.blocked_dates (
  id           uuid primary key default gen_random_uuid(),
  blocked_date date unique not null,
  reason       text,
  created_at   timestamptz not null default now()
);

create table if not exists public.blocked_times (
  id           uuid primary key default gen_random_uuid(),
  blocked_date date not null,
  blocked_time text not null,
  created_at   timestamptz not null default now(),
  unique (blocked_date, blocked_time)
);

create table if not exists public.salon_info (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Privileges (RLS below decides which rows; these decide which operations)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

grant select on public.services, public.designs, public.blocked_dates,
               public.blocked_times, public.salon_info to anon, authenticated;
grant insert, update, delete on public.services, public.designs, public.blocked_dates,
               public.blocked_times, public.salon_info to authenticated;

revoke all on public.bookings from anon;
grant select, insert, delete on public.bookings to authenticated;
-- Only status/notes can ever be changed after a booking is made.
revoke update on public.bookings from authenticated;
grant update (status, notes) on public.bookings to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.services      enable row level security;
alter table public.designs       enable row level security;
alter table public.bookings      enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.blocked_times enable row level security;
alter table public.salon_info    enable row level security;

-- Public catalogue: everyone reads, only admins write.
do $$
declare t text;
begin
  foreach t in array array['services', 'designs', 'blocked_dates', 'blocked_times', 'salon_info']
  loop
    execute format('drop policy if exists "Public read" on public.%I', t);
    execute format('create policy "Public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "Admins insert" on public.%I', t);
    execute format('create policy "Admins insert" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('drop policy if exists "Admins update" on public.%I', t);
    execute format('create policy "Admins update" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('drop policy if exists "Admins delete" on public.%I', t);
    execute format('create policy "Admins delete" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- Bookings: customers see and create their own; admins see and manage all.
drop policy if exists "Own or admin read" on public.bookings;
create policy "Own or admin read" on public.bookings
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Customers create own pending booking" on public.bookings;
create policy "Customers create own pending booking" on public.bookings
  for insert to authenticated
  with check (
    (
      user_id = (select auth.uid())
      and status = 'pending'
      and user_email = (select auth.jwt() ->> 'email')
    )
    or (select public.is_admin())
  );

-- Admins may set any status; a customer may only cancel their own booking.
drop policy if exists "Admin update or customer cancel" on public.bookings;
create policy "Admin update or customer cancel" on public.bookings
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check ((select public.is_admin()) or (user_id = (select auth.uid()) and status = 'cancelled'));

drop policy if exists "Admins delete bookings" on public.bookings;
create policy "Admins delete bookings" on public.bookings
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Starting content (only inserted into empty tables, so re-running is safe)
-- ---------------------------------------------------------------------------
insert into public.services (name, description, price, duration, category, image_url)
select * from (values
  ('Signature Gel Manicure', 'Long-lasting, high-gloss finish', '$45', '60 mins', 'manicure', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=300&fit=crop'),
  ('Deluxe Spa Pedicure', 'Includes sea salt soak & massage', '$65', '75 mins', 'pedicure', 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=400&h=300&fit=crop'),
  ('Nail Art Add-on', 'From minimalist to complex art', '$15', '+20 mins', 'art', 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400&h=300&fit=crop'),
  ('Acrylic Full Set', 'Durable acrylic extensions', '$55', '90 mins', 'acrylic', 'https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=400&h=300&fit=crop'),
  ('Gel Extensions', 'Natural-looking gel extensions', '$60', '90 mins', 'gel', 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=400&h=300&fit=crop'),
  ('Classic Manicure', 'Traditional nail care', '$25', '45 mins', 'manicure', 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=400&h=300&fit=crop')
) as v (name, description, price, duration, category, image_url)
where not exists (select 1 from public.services);

insert into public.designs (name, description, category, image_url)
select * from (values
  ('Modern French', 'Timeless elegance', 'simple', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=400&fit=crop'),
  ('Abstract Blush', 'Artistic statement', 'cute', 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=400&h=400&fit=crop'),
  ('Rose Gold Shimmer', 'Elegant glitter', 'glitter', 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400&h=400&fit=crop'),
  ('Spring Daisies', 'Cute floral', 'cute', 'https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=400&h=400&fit=crop'),
  ('Korean Minimalist', 'Clean Korean style', 'korean', 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=400&h=400&fit=crop'),
  ('Pink Ombre', 'Gradient effect', 'ombre', 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=400&h=400&fit=crop'),
  ('Bridal Lace', 'Perfect for your special day', 'wedding', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=400&fit=crop'),
  ('Classic Nude', 'Natural elegance', 'simple', 'https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=400&h=400&fit=crop')
) as v (name, description, category, image_url)
where not exists (select 1 from public.designs);

insert into public.blocked_dates (blocked_date, reason) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-04-30', 'Reunification Day'),
  ('2026-05-01', 'Labor Day'),
  ('2026-09-02', 'National Day'),
  ('2026-12-25', 'Christmas Day')
on conflict (blocked_date) do nothing;

insert into public.salon_info (key, value) values
  ('name', 'Thuy''s Nail'),
  ('address', '123 Neighborhood Way, Cozy Studio District'),
  ('phone', '(555) 123-4567'),
  ('email', 'hello@thuysnail.com'),
  ('hours', 'Tue-Sun: 9am - 7pm'),
  ('facebook', 'https://facebook.com/thuysnail'),
  ('instagram', 'https://instagram.com/thuysnail'),
  ('map_url', '')
on conflict (key) do nothing;
