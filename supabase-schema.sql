-- Relational migration. Keeps stoics_loot_state as a rollback snapshot and imports it once.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.manager_users (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(trim(username)) between 2 and 32),
  username_key text generated always as (lower(trim(username))) stored unique,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  login_count bigint not null default 0
);
create table if not exists public.manager_login_log (
  id bigint generated always as identity primary key,
  manager_user_id uuid not null references public.manager_users(id) on delete cascade,
  username text not null,
  logged_in_at timestamptz not null default now()
);

create table if not exists public.members (id text primary key, name text not null, active boolean not null default true, sort_order integer not null default 0);
create table if not exists public.dungeon_runs (id text primary key, dungeon text not null, created_at timestamptz not null, created_by text not null, sort_order integer not null default 0);
create table if not exists public.run_members (run_id text not null references public.dungeon_runs(id) on delete cascade, member_id text not null references public.members(id), position integer not null, primary key (run_id, member_id));
create table if not exists public.loot_items (id text primary key, name text not null);
alter table public.loot_items add column if not exists vending_price numeric(18,2) not null default 0 check (vending_price >= 0);
alter table public.loot_items add column if not exists image_data text;
create unique index if not exists loot_items_canonical_name on public.loot_items (lower(trim(name)));
create table if not exists public.run_loot (id text primary key, run_id text not null references public.dungeon_runs(id) on delete cascade, loot_item_id text not null references public.loot_items(id), quantity integer not null check (quantity > 0), position integer not null default 0);
create table if not exists public.sales (id text primary key, loot_item_id text not null references public.loot_items(id), quantity integer not null check (quantity > 0), unit_price numeric(18,2) not null check (unit_price >= 0), total numeric(18,2) not null check (total >= 0), salary_each numeric(18,2) not null check (salary_each >= 0), created_at timestamptz not null, created_by text not null, sort_order integer not null default 0);
create table if not exists public.sale_recipients (sale_id text not null references public.sales(id) on delete cascade, member_id text not null references public.members(id), queue_position integer not null, salary_amount numeric(18,2) not null check (salary_amount >= 0), primary key (sale_id, member_id));
create table if not exists public.sale_allocations (sale_id text not null references public.sales(id) on delete cascade, run_loot_id text not null references public.run_loot(id) on delete cascade, quantity integer not null check (quantity > 0), primary key (sale_id, run_loot_id));
create table if not exists public.payout_queue (member_id text primary key references public.members(id) on delete cascade, queue_position integer not null unique);
create table if not exists public.audit_log (id text primary key, username text not null, action text not null, created_at timestamptz not null, sort_order integer not null default 0);
create table if not exists public.ledger_metadata (singleton boolean primary key default true check (singleton), last_updated_by text, last_updated_at timestamptz);

create or replace function public.get_stoics_loot_state() returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'active',m.active) order by m.sort_order) from public.members m), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'dungeon',r.dungeon,'createdAt',r.created_at,'createdBy',r.created_by,
      'memberIds',coalesce((select jsonb_agg(rm.member_id order by rm.position) from public.run_members rm where rm.run_id=r.id),'[]'::jsonb),
      'loots',coalesce((select jsonb_agg(jsonb_build_object('id',rl.id,'name',li.name,'quantity',rl.quantity) order by rl.position) from public.run_loot rl join public.loot_items li on li.id=rl.loot_item_id where rl.run_id=r.id),'[]'::jsonb)
    ) order by r.sort_order) from public.dungeon_runs r), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'lootName',li.name,'quantity',s.quantity,'unitPrice',s.unit_price,'total',s.total,'salaryEach',s.salary_each,'createdAt',s.created_at,'createdBy',s.created_by,
      'recipientIds',coalesce((select jsonb_agg(sr.member_id order by sr.queue_position) from public.sale_recipients sr where sr.sale_id=s.id),'[]'::jsonb),
      'recipientAmounts',coalesce((select jsonb_object_agg(sr.member_id,sr.salary_amount) from public.sale_recipients sr where sr.sale_id=s.id),'{}'::jsonb)
    ) order by s.sort_order) from public.sales s join public.loot_items li on li.id=s.loot_item_id), '[]'::jsonb),
    'vendingPrices', coalesce((select jsonb_object_agg(li.name,li.vending_price) from public.loot_items li), '{}'::jsonb),
    'lootImages', coalesce((select jsonb_object_agg(li.name,li.image_data) from public.loot_items li where nullif(li.image_data,'') is not null), '{}'::jsonb),
    'payoutQueue', coalesce((select jsonb_agg(pq.member_id order by pq.queue_position) from public.payout_queue pq),'[]'::jsonb),
    'auditLog', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'username',a.username,'action',a.action,'createdAt',a.created_at) order by a.sort_order) from public.audit_log a),'[]'::jsonb),
    'lastUpdatedBy',(select lm.last_updated_by from public.ledger_metadata lm where lm.singleton),
    'lastUpdatedAt',(select lm.last_updated_at from public.ledger_metadata lm where lm.singleton)
  );
$$;

create or replace function public.save_stoics_loot_state(p_state jsonb, p_actor text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if nullif(trim(p_actor),'') is null then raise exception 'A manager username is required'; end if;
  delete from public.sale_allocations where true; delete from public.sale_recipients where true; delete from public.sales where true;
  delete from public.run_loot where true; delete from public.run_members where true; delete from public.dungeon_runs where true;
  delete from public.payout_queue where true; delete from public.audit_log where true; delete from public.loot_items where true;
  delete from public.members where true; delete from public.ledger_metadata where true;

  insert into public.members (id,name,active,sort_order)
  select x.value->>'id',x.value->>'name',coalesce((x.value->>'active')::boolean,true),x.ordinality::integer
  from jsonb_array_elements(coalesce(p_state->'members','[]'::jsonb)) with ordinality as x(value,ordinality);
  insert into public.dungeon_runs (id,dungeon,created_at,created_by,sort_order)
  select x.value->>'id',x.value->>'dungeon',(x.value->>'createdAt')::timestamptz,coalesce(nullif(x.value->>'createdBy',''),p_actor),x.ordinality::integer
  from jsonb_array_elements(coalesce(p_state->'runs','[]'::jsonb)) with ordinality as x(value,ordinality);
  insert into public.run_members (run_id,member_id,position)
  select r.value->>'id',member.value,member.ordinality::integer
  from jsonb_array_elements(coalesce(p_state->'runs','[]'::jsonb)) r(value)
  cross join lateral jsonb_array_elements_text(coalesce(r.value->'memberIds','[]'::jsonb)) with ordinality as member(value,ordinality)
  where exists (select 1 from public.members m where m.id=member.value);

  insert into public.loot_items (id,name,vending_price,image_data)
  select 'loot_'||md5(canonical_name),display_name,
    coalesce((select nullif(price.value,'')::numeric from jsonb_each_text(coalesce(p_state->'vendingPrices','{}'::jsonb)) price where lower(trim(price.key))=canonical_name order by (trim(price.key)=canonical_name) desc,price.key desc limit 1),0),
    (select nullif(image.value,'') from jsonb_each_text(coalesce(p_state->'lootImages','{}'::jsonb)) image where lower(trim(image.key))=canonical_name order by (trim(image.key)=canonical_name) desc,image.key desc limit 1)
  from (
    select distinct on (lower(trim(name))) lower(trim(name)) canonical_name,trim(name) display_name from (
      select loot.value->>'name' name from jsonb_array_elements(coalesce(p_state->'runs','[]'::jsonb)) r(value) cross join lateral jsonb_array_elements(coalesce(r.value->'loots','[]'::jsonb)) loot(value)
      union all select s.value->>'lootName' from jsonb_array_elements(coalesce(p_state->'sales','[]'::jsonb)) s(value)
    ) names where nullif(trim(name),'') is not null order by lower(trim(name)),trim(name)
  ) unique_names;
  insert into public.run_loot (id,run_id,loot_item_id,quantity,position)
  select loot.value->>'id',r.value->>'id',li.id,(loot.value->>'quantity')::integer,loot.ordinality::integer
  from jsonb_array_elements(coalesce(p_state->'runs','[]'::jsonb)) r(value)
  cross join lateral jsonb_array_elements(coalesce(r.value->'loots','[]'::jsonb)) with ordinality as loot(value,ordinality)
  join public.loot_items li on lower(trim(li.name))=lower(trim(loot.value->>'name'));
  insert into public.sales (id,loot_item_id,quantity,unit_price,total,salary_each,created_at,created_by,sort_order)
  select s.value->>'id',li.id,(s.value->>'quantity')::integer,(s.value->>'unitPrice')::numeric,(s.value->>'total')::numeric,(s.value->>'salaryEach')::numeric,(s.value->>'createdAt')::timestamptz,coalesce(nullif(s.value->>'createdBy',''),p_actor),s.ordinality::integer
  from jsonb_array_elements(coalesce(p_state->'sales','[]'::jsonb)) with ordinality as s(value,ordinality)
  join public.loot_items li on lower(trim(li.name))=lower(trim(s.value->>'lootName'));
  insert into public.sale_recipients (sale_id,member_id,queue_position,salary_amount)
  select s.value->>'id',recipient.value,recipient.ordinality::integer,
    coalesce((s.value->'recipientAmounts'->>recipient.value)::numeric,(s.value->>'salaryEach')::numeric)
  from jsonb_array_elements(coalesce(p_state->'sales','[]'::jsonb)) s(value)
  cross join lateral jsonb_array_elements_text(coalesce(s.value->'recipientIds','[]'::jsonb)) with ordinality as recipient(value,ordinality)
  where exists (select 1 from public.members m where m.id=recipient.value);
  insert into public.payout_queue (member_id,queue_position)
  select q.value,q.ordinality::integer from jsonb_array_elements_text(coalesce(p_state->'payoutQueue','[]'::jsonb)) with ordinality as q(value,ordinality)
  where exists (select 1 from public.members m where m.id=q.value);
  insert into public.audit_log (id,username,action,created_at,sort_order)
  select a.value->>'id',coalesce(nullif(a.value->>'username',''),p_actor),a.value->>'action',(a.value->>'createdAt')::timestamptz,a.ordinality::integer
  from jsonb_array_elements(coalesce(p_state->'auditLog','[]'::jsonb)) with ordinality as a(value,ordinality);
  insert into public.ledger_metadata (singleton,last_updated_by,last_updated_at)
  values (true,p_actor,coalesce(nullif(p_state->>'lastUpdatedAt','')::timestamptz,now()));

  insert into public.sale_allocations (sale_id,run_loot_id,quantity)
  with lots as (
    select rl.id,rl.loot_item_id,coalesce(sum(rl.quantity) over (partition by rl.loot_item_id order by dr.created_at,rl.id rows between unbounded preceding and 1 preceding),0) lot_start,
      sum(rl.quantity) over (partition by rl.loot_item_id order by dr.created_at,rl.id) lot_end
    from public.run_loot rl join public.dungeon_runs dr on dr.id=rl.run_id
  ), ordered_sales as (
    select s.id,s.loot_item_id,coalesce(sum(s.quantity) over (partition by s.loot_item_id order by s.created_at,s.id rows between unbounded preceding and 1 preceding),0) sale_start,
      sum(s.quantity) over (partition by s.loot_item_id order by s.created_at,s.id) sale_end
    from public.sales s
  )
  select os.id,lots.id,(least(os.sale_end,lots.lot_end)-greatest(os.sale_start,lots.lot_start))::integer
  from ordered_sales os join lots on lots.loot_item_id=os.loot_item_id
  where least(os.sale_end,lots.lot_end)>greatest(os.sale_start,lots.lot_start);
end;
$$;

create or replace function public.authenticate_stoics_manager(p_username text, p_password text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  account public.manager_users%rowtype;
  accounts_configured boolean;
begin
  select exists(select 1 from public.manager_users) into accounts_configured;
  select * into account from public.manager_users where username_key=lower(trim(p_username)) limit 1;
  if not found or not account.active or account.password_hash<>extensions.crypt(coalesce(p_password,''),account.password_hash) then
    return jsonb_build_object('authenticated',false,'configured',accounts_configured);
  end if;
  update public.manager_users set last_login_at=now(),login_count=login_count+1 where id=account.id;
  insert into public.manager_login_log (manager_user_id,username) values (account.id,account.username);
  return jsonb_build_object('authenticated',true,'configured',true,'username',account.username);
end;
$$;

-- Run this separately in the Supabase SQL editor after applying the schema:
-- select public.set_stoics_manager_password('stoics-admin', 'replace-with-a-strong-password');
create or replace function public.set_stoics_manager_password(p_username text, p_password text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if char_length(trim(p_username)) not between 2 and 32 then raise exception 'Username must be between 2 and 32 characters'; end if;
  if char_length(p_password) not between 8 and 128 then raise exception 'Password must be between 8 and 128 characters'; end if;
  insert into public.manager_users (username,password_hash)
  values (trim(p_username),extensions.crypt(p_password,extensions.gen_salt('bf',12)))
  on conflict (username_key) do update set username=excluded.username,password_hash=excluded.password_hash,active=true,updated_at=now();
end;
$$;

do $$ declare legacy_state jsonb; begin
  if to_regclass('public.stoics_loot_state') is not null and not exists (select 1 from public.members) then
    execute 'select payload from public.stoics_loot_state where id = ''guild''' into legacy_state;
    if legacy_state is not null then perform public.save_stoics_loot_state(legacy_state,'migration'); end if;
  end if;
end $$;

alter table public.members enable row level security; alter table public.dungeon_runs enable row level security;
alter table public.manager_users enable row level security; alter table public.manager_login_log enable row level security;
alter table public.run_members enable row level security; alter table public.loot_items enable row level security;
alter table public.run_loot enable row level security; alter table public.sales enable row level security;
alter table public.sale_recipients enable row level security; alter table public.sale_allocations enable row level security;
alter table public.payout_queue enable row level security; alter table public.audit_log enable row level security;
alter table public.ledger_metadata enable row level security;
revoke all on public.members,public.dungeon_runs,public.run_members,public.loot_items,public.run_loot,public.sales,public.sale_recipients,public.sale_allocations,public.payout_queue,public.audit_log,public.ledger_metadata from anon,authenticated;
revoke all on public.manager_users,public.manager_login_log from anon,authenticated;
revoke all on function public.set_stoics_manager_password(text,text) from public,anon,authenticated;
grant execute on function public.get_stoics_loot_state() to anon,authenticated;
grant execute on function public.save_stoics_loot_state(jsonb,text) to anon,authenticated;
grant execute on function public.authenticate_stoics_manager(text,text) to anon,authenticated;
