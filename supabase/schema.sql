create table if not exists public.shared_app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.shared_app_state (id, payload)
values ('global', '{}'::jsonb)
on conflict (id) do nothing;
