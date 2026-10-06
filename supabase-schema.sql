create table if not exists public.stoics_loot_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.stoics_loot_state enable row level security;

create policy "stoics state can be read" on public.stoics_loot_state
  for select to anon using (true);

create policy "stoics state can be inserted" on public.stoics_loot_state
  for insert to anon with check (id = 'guild');

create policy "stoics state can be updated" on public.stoics_loot_state
  for update to anon using (id = 'guild') with check (id = 'guild');

