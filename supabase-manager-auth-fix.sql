-- Repair manager password authentication after the main schema was already applied.
-- Supabase installs pgcrypto functions in the extensions schema.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.authenticate_stoics_manager(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account public.manager_users%rowtype;
  accounts_configured boolean;
begin
  select exists(select 1 from public.manager_users) into accounts_configured;
  select * into account
  from public.manager_users
  where username_key = lower(trim(p_username))
  limit 1;

  if not found
     or not account.active
     or account.password_hash <> extensions.crypt(coalesce(p_password, ''), account.password_hash) then
    return jsonb_build_object('authenticated', false, 'configured', accounts_configured);
  end if;

  update public.manager_users
  set last_login_at = now(), login_count = login_count + 1
  where id = account.id;

  insert into public.manager_login_log (manager_user_id, username)
  values (account.id, account.username);

  return jsonb_build_object(
    'authenticated', true,
    'configured', true,
    'username', account.username
  );
end;
$$;

create or replace function public.set_stoics_manager_password(p_username text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if char_length(trim(p_username)) not between 2 and 32 then
    raise exception 'Username must be between 2 and 32 characters';
  end if;

  if char_length(p_password) not between 8 and 128 then
    raise exception 'Password must be between 8 and 128 characters';
  end if;

  insert into public.manager_users (username, password_hash)
  values (
    trim(p_username),
    extensions.crypt(p_password, extensions.gen_salt('bf', 12))
  )
  on conflict (username_key) do update
  set username = excluded.username,
      password_hash = excluded.password_hash,
      active = true,
      updated_at = now();
end;
$$;

revoke all on function public.set_stoics_manager_password(text, text) from public, anon, authenticated;
grant execute on function public.authenticate_stoics_manager(text, text) to anon, authenticated;

-- After this repair succeeds, set the account password in a separate query:
-- select public.set_stoics_manager_password('stoics-admin', 'replace-with-a-new-strong-password');
