create or replace function public.set_child_pin(child uuid, pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if pin !~ '^[0-9]{4,6}$' then raise exception 'PIN harus 4-6 angka' using errcode='P0001'; end if;
  insert into child_secrets(child_id, pin_hash) values (child, crypt(pin, gen_salt('bf')))
  on conflict (child_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;
end $$;

-- returns 'ok' | 'wrong' | 'locked'
create or replace function public.check_child_pin(child uuid, pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s child_secrets;
begin
  select * into s from child_secrets where child_id = child for update;
  if not found then return 'wrong'; end if;
  if s.locked_until is not null and s.locked_until > now() then return 'locked'; end if;
  if s.pin_hash = crypt(pin, s.pin_hash) then
    update child_secrets set failed_attempts = 0, locked_until = null where child_id = child;
    return 'ok';
  end if;
  update child_secrets set failed_attempts = failed_attempts + 1,
    locked_until = case when failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
   where child_id = child;
  return 'wrong';
end $$;

revoke execute on function public.set_child_pin(uuid,text) from public, anon, authenticated;
revoke execute on function public.check_child_pin(uuid,text) from public, anon, authenticated;
revoke execute on function public.is_parent_of(uuid) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.can_see_private(uuid) from public, anon;
grant execute on function public.is_parent_of(uuid), public.is_admin(), public.can_see_private(uuid) to authenticated;
