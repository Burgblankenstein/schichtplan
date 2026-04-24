-- ═══════════════════════════════════════════════════════════
-- SCHICHTPLAN – Supabase Setup Script
-- Dieses Script in den Supabase SQL Editor kopieren und ausführen
-- ═══════════════════════════════════════════════════════════

-- 1. TABELLEN ERSTELLEN
-- ─────────────────────────────────────────

create table if not exists employees (
  id bigint primary key,
  name text not null,
  category text not null check (category in ('theke', 'service', 'runner')),
  avatar text not null
);

create table if not exists rooms (
  id text primary key,
  name text not null,
  icon text not null default '🏠'
);

create table if not exists shifts (
  id bigint primary key,
  date text not null,
  label text not null,
  time text not null,
  category text not null check (category in ('theke', 'service', 'runner')),
  room text references rooms(id) on delete set null,
  applicants bigint[] not null default '{}',
  assigned bigint references employees(id) on delete set null
);

create table if not exists accounts (
  id text primary key,
  name text not null unique,
  password text not null,
  role text not null check (role in ('chef', 'employee')),
  employee_id bigint references employees(id) on delete set null
);

create table if not exists notifications (
  id bigint primary key,
  recipient_id text not null,
  type text not null check (type in ('application', 'assigned', 'new_shift')),
  text text not null,
  shift_id bigint references shifts(id) on delete cascade,
  read boolean not null default false,
  ts timestamptz not null default now()
);

-- 2. REALTIME AKTIVIEREN
-- ─────────────────────────────────────────
alter publication supabase_realtime add table shifts;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table employees;
alter publication supabase_realtime add table accounts;
alter publication supabase_realtime add table rooms;

-- 3. ROW LEVEL SECURITY (für öffentlichen Zugriff via anon key)
-- ─────────────────────────────────────────
alter table employees     enable row level security;
alter table rooms         enable row level security;
alter table shifts        enable row level security;
alter table accounts      enable row level security;
alter table notifications enable row level security;

create policy "Öffentlicher Lesezugriff" on employees     for all using (true) with check (true);
create policy "Öffentlicher Lesezugriff" on rooms         for all using (true) with check (true);
create policy "Öffentlicher Lesezugriff" on shifts        for all using (true) with check (true);
create policy "Öffentlicher Lesezugriff" on accounts      for all using (true) with check (true);
create policy "Öffentlicher Lesezugriff" on notifications for all using (true) with check (true);

-- 4. DEMO-DATEN EINFÜGEN
-- ─────────────────────────────────────────

-- Räume
insert into rooms (id, name, icon) values
  ('r1', 'Innenraum', '🪑'),
  ('r2', 'Terrasse',  '🌿'),
  ('r3', 'Bar',       '🍸')
on conflict (id) do nothing;

-- Mitarbeiter
insert into employees (id, name, category, avatar) values
  (1, 'Anna Müller',  'service', 'AM'),
  (2, 'Ben Koch',     'theke',   'BK'),
  (3, 'Clara Stern',  'runner',  'CS'),
  (4, 'David Braun',  'service', 'DB'),
  (5, 'Eva Schäfer',  'theke',   'ES'),
  (6, 'Felix Wagner', 'runner',  'FW')
on conflict (id) do nothing;

-- Accounts
insert into accounts (id, name, password, role, employee_id) values
  ('a0', 'Chef',         'chef123',  'chef',     null),
  ('a1', 'Anna Müller',  'anna123',  'employee', 1),
  ('a2', 'Ben Koch',     'ben123',   'employee', 2),
  ('a3', 'Clara Stern',  'clara123', 'employee', 3),
  ('a4', 'David Braun',  'david123', 'employee', 4),
  ('a5', 'Eva Schäfer',  'eva123',   'employee', 5),
  ('a6', 'Felix Wagner', 'felix123', 'employee', 6)
on conflict (id) do nothing;

-- Schichten
insert into shifts (id, date, label, time, category, room, applicants, assigned) values
  (1, '2026-04-27', 'Frühschicht',    '09:00 – 15:00', 'theke',   'r3', '{1}',   null),
  (2, '2026-04-27', 'Abendschicht',   '17:00 – 23:00', 'service', 'r1', '{2,4}', null),
  (3, '2026-04-28', 'Mittagsschicht', '11:00 – 17:00', 'runner',  'r2', '{}',    null),
  (4, '2026-04-29', 'Abendschicht',   '18:00 – 00:00', 'service', 'r1', '{1,4}', 4),
  (5, '2026-04-30', 'Frühschicht',    '08:00 – 14:00', 'theke',   'r3', '{2,5}', null),
  (6, '2026-05-02', 'Mittagsschicht', '11:00 – 16:00', 'service', 'r2', '{}',    null),
  (7, '2026-05-03', 'Abendschicht',   '17:00 – 23:00', 'theke',   'r3', '{2}',   null)
on conflict (id) do nothing;

-- Demo-Benachrichtigungen
insert into notifications (id, recipient_id, type, text, shift_id, read, ts) values
  (101, 'chef', 'application', 'Anna Müller hat sich auf „Frühschicht" am Mo., 27.04. beworben',   1, false, now()),
  (102, 'chef', 'application', 'Ben Koch hat sich auf „Abendschicht" am Mo., 27.04. beworben',     2, false, now()),
  (103, '4',    'assigned',    'Du wurdest für „Abendschicht" am Mi., 29.04. eingeteilt!',          4, false, now()),
  (104, '1',    'new_shift',   'Neue Schicht: Mittagsschicht (Service) am Fr., 02.05.',             6, false, now()),
  (105, '4',    'new_shift',   'Neue Schicht: Mittagsschicht (Service) am Fr., 02.05.',             6, false, now())
on conflict (id) do nothing;
