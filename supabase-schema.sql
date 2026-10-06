-- Relational migration. Keeps stoics_loot_state as a rollback snapshot and imports it once.
create table if not exists public.members (id text primary key, name text not null, active boolean not null default true, sort_order integer not null default 0);
create table if not exists public.dungeon_runs (id text primary key, dungeon text not null, created_at timestamptz not null, created_by text not null, sort_order integer not null default 0);
create table if not exists public.run_members (run_id text not null references public.dungeon_runs(id) on delete cascade, member_id text not null references public.members(id), position integer not null, primary key (run_id, member_id));
create table if not exists public.loot_items (id text primary key, name text not null);
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
      'recipientIds',coalesce((select jsonb_agg(sr.member_id order by sr.queue_position) from public.sale_recipients sr where sr.sale_id=s.id),'[]'::jsonb)
    ) order by s.sort_order) from public.sales s join public.loot_items li on li.id=s.loot_item_id), '[]'::jsonb),
    'payoutQueue', coalesce((select jsonb_agg(pq.member_id order by pq.queue_position) from public.payout_queue pq),'[]'::jsonb),
    'auditLog', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'username',a.username,'action',a.action,'createdAt',a.created_at) order by a.sort_order) from public.audit_log a),'[]'::jsonb),
    'lastUpdatedBy',(select lm.last_updated_by from public.ledger_metadata lm where lm.singleton),
    'lastUpdatedAt',(select lm.last_updated_at from public.ledger_metadata lm where lm.singleton)
  );
$$;

create or replace function public.save_stoics_loot_state(p_state jsonb, p_actor text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if nullif(trim(p_actor),'') is null then raise exception 'A manager username is required'; end if;
  delete from public.sale_allocations; delete from public.sale_recipients; delete from public.sales;
  delete from public.run_loot; delete from public.run_members; delete from public.dungeon_runs;
  delete from public.payout_queue; delete from public.audit_log; delete from public.loot_items;
  delete from public.members; delete from public.ledger_metadata;

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

  insert into public.loot_items (id,name)
  select 'loot_'||md5(canonical_name),display_name from (
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
  select s.value->>'id',recipient.value,recipient.ordinality::integer,(s.value->>'salaryEach')::numeric
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

do $$ declare legacy_state jsonb; begin
  if to_regclass('public.stoics_loot_state') is not null and not exists (select 1 from public.members) then
    execute 'select payload from public.stoics_loot_state where id = ''guild''' into legacy_state;
    if legacy_state is not null then perform public.save_stoics_loot_state(legacy_state,'migration'); end if;
  end if;
end $$;

alter table public.members enable row level security; alter table public.dungeon_runs enable row level security;
alter table public.run_members enable row level security; alter table public.loot_items enable row level security;
alter table public.run_loot enable row level security; alter table public.sales enable row level security;
alter table public.sale_recipients enable row level security; alter table public.sale_allocations enable row level security;
alter table public.payout_queue enable row level security; alter table public.audit_log enable row level security;
alter table public.ledger_metadata enable row level security;
revoke all on public.members,public.dungeon_runs,public.run_members,public.loot_items,public.run_loot,public.sales,public.sale_recipients,public.sale_allocations,public.payout_queue,public.audit_log,public.ledger_metadata from anon,authenticated;
grant execute on function public.get_stoics_loot_state() to anon,authenticated;
grant execute on function public.save_stoics_loot_state(jsonb,text) to anon,authenticated;
