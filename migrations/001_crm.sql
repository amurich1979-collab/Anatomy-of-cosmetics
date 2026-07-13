alter table users add column if not exists role text not null default 'client';
alter table users add column if not exists workspace_id text not null default 'default';
alter table users add column if not exists disabled_at timestamptz;

create table if not exists client_profiles (
  id text primary key, workspace_id text not null, user_id text unique references users(id) on delete set null,
  full_name text not null, birth_date date, phone text, email text, avatar_url text,
  internal_note text, archived_at timestamptz, created_by text references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists client_profiles_workspace_name_idx on client_profiles(workspace_id, full_name);
create index if not exists client_profiles_phone_idx on client_profiles(phone);
create index if not exists client_profiles_email_idx on client_profiles(email);

create table if not exists client_access (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  user_id text not null references users(id) on delete cascade, workspace_id text not null,
  created_at timestamptz not null default now(), unique(client_id, user_id)
);

create table if not exists anamneses (
  client_id text primary key references client_profiles(id) on delete cascade, data jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz, confirmation_requested_at timestamptz, updated_by text references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists medical_conditions (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  workspace_id text not null, data jsonb not null default '{}'::jsonb, archived_at timestamptz,
  created_by text references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists contraindications (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  workspace_id text not null, title text not null, kind text not null default 'temporary', importance text not null default 'medium',
  starts_on date, ends_on date, recheck_on date, data jsonb not null default '{}'::jsonb, archived_at timestamptz,
  created_by text references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists procedures (
  id text primary key, workspace_id text not null, name text not null, category text,
  data jsonb not null default '{}'::jsonb, archived_at timestamptz, created_at timestamptz not null default now()
);

create table if not exists visits (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  workspace_id text not null, scheduled_at timestamptz not null, status text not null default 'draft',
  procedure_name text, client_visible boolean not null default false, data jsonb not null default '{}'::jsonb,
  archived_at timestamptz, created_by text references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists visits_client_date_idx on visits(client_id, scheduled_at desc);

create table if not exists products (
  id text primary key, workspace_id text not null, name text not null, category text, manufacturer text,
  unit text, standard_volume numeric, description text, archived_at timestamptz, created_at timestamptz not null default now()
);

create table if not exists product_usages (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  visit_id text references visits(id) on delete cascade, product_id text references products(id) on delete set null,
  workspace_id text not null, client_visible boolean not null default false, data jsonb not null default '{}'::jsonb,
  archived_at timestamptz, created_by text references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists face_maps (
  id text primary key, workspace_id text not null, name text not null, view_type text not null,
  image_path text not null, active boolean not null default true, created_at timestamptz not null default now()
);

create table if not exists injection_points (
  id text primary key, face_map_id text not null references face_maps(id), visit_id text references visits(id) on delete cascade,
  client_id text not null references client_profiles(id) on delete cascade, workspace_id text not null,
  x numeric not null check (x between 0 and 100), y numeric not null check (y between 0 and 100),
  client_visible boolean not null default false, data jsonb not null default '{}'::jsonb, archived_at timestamptz,
  created_by text references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists recommendation_templates (
  id text primary key, workspace_id text not null, title text not null, category text not null,
  body text not null, archived_at timestamptz, created_by text references users(id), created_at timestamptz not null default now()
);

create table if not exists recommendations (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  visit_id text references visits(id) on delete set null, workspace_id text not null, category text not null,
  body text not null, client_visible boolean not null default false, published_at timestamptz, acknowledged_at timestamptz,
  expires_at timestamptz, data jsonb not null default '{}'::jsonb, archived_at timestamptz, created_by text references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists calendar_events (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  visit_id text references visits(id) on delete set null, workspace_id text not null, event_type text not null,
  title text not null, starts_at timestamptz, range_end timestamptz, status text not null default 'recommended',
  client_visible boolean not null default false, data jsonb not null default '{}'::jsonb, archived_at timestamptz,
  created_by text references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists client_photos (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  visit_id text references visits(id) on delete set null, workspace_id text not null, storage_key text,
  category text not null, client_visible boolean not null default false, storage_consent boolean not null default false,
  publication_consent boolean not null default false, data jsonb not null default '{}'::jsonb, archived_at timestamptz,
  created_by text references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists consents (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  workspace_id text not null, consent_type text not null, version text, status text not null default 'pending',
  confirmed_at timestamptz, client_visible boolean not null default true, data jsonb not null default '{}'::jsonb,
  archived_at timestamptz, created_by text references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists documents (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  workspace_id text not null, document_type text not null, version text, status text not null default 'draft',
  storage_key text, client_visible boolean not null default false, data jsonb not null default '{}'::jsonb,
  archived_at timestamptz, created_by text references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists invitations (
  id text primary key, client_id text not null references client_profiles(id) on delete cascade,
  workspace_id text not null, token_hash text unique not null, destination text, expires_at timestamptz not null,
  used_at timestamptz, created_by text references users(id), created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key, workspace_id text not null, actor_id text references users(id) on delete set null,
  client_id text references client_profiles(id) on delete set null, action text not null, entity_type text not null,
  entity_id text, changes jsonb not null default '{}'::jsonb, ip_address text, user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_client_idx on audit_logs(client_id, created_at desc);

insert into face_maps (id, workspace_id, name, view_type, image_path) values
  ('map_front', 'default', 'Лицо спереди', 'front', '/assets/face-maps/front.svg'),
  ('map_left', 'default', 'Левый профиль', 'left', '/assets/face-maps/profile-left.svg'),
  ('map_right', 'default', 'Правый профиль', 'right', '/assets/face-maps/profile-right.svg'),
  ('map_neck', 'default', 'Шея и декольте', 'neck', '/assets/face-maps/neck.svg'),
  ('map_lips', 'default', 'Губы', 'lips', '/assets/face-maps/lips.svg')
on conflict (id) do nothing;
