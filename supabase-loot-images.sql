-- Run once in Supabase SQL Editor to add loot item photos to an existing Stoics database.
-- Safe to rerun. Existing runs, sales, prices, and photos are preserved.

alter table public.loot_items add column if not exists image_data text;

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

