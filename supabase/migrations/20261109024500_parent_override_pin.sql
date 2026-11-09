create table public.parent_secrets (
  parent_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz
);
alter table public.parent_secrets enable row level security;

-- parent sets their own override PIN
create or replace function public.set_parent_pin(pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'parent') then raise exception 'Hanya orang tua' using errcode='P0001'; end if;
  if pin !~ '^[0-9]{4,6}$' then raise exception 'PIN harus 4-6 angka' using errcode='P0001'; end if;
  insert into parent_secrets(parent_id, pin_hash) values (auth.uid(), crypt(pin, gen_salt('bf')))
  on conflict (parent_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;
end $$;

-- a signed-in child (or the parent) checks the parent's override PIN; returns 'ok' | 'wrong' | 'locked' | 'unset'
create or replace function public.verify_parent_pin(pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare pid uuid; s parent_secrets;
begin
  select parent_id into pid from family_members where child_id = auth.uid();
  if pid is null then pid := auth.uid(); end if;
  select * into s from parent_secrets where parent_id = pid for update;
  if not found then return 'unset'; end if;
  if s.locked_until is not null and s.locked_until > now() then return 'locked'; end if;
  if s.pin_hash = crypt(pin, s.pin_hash) then
    update parent_secrets set failed_attempts = 0 where parent_id = pid;
    insert into activity_log(profile_id, kind, detail) values (auth.uid(), 'parent_override', '{}');
    return 'ok';
  end if;
  update parent_secrets set failed_attempts = failed_attempts + 1,
    locked_until = case when failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
   where parent_id = pid;
  return 'wrong';
end $$;

create or replace function public.has_parent_pin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from parent_secrets where parent_id = coalesce((select parent_id from family_members where child_id = auth.uid()), auth.uid()));
$$;

revoke execute on function public.set_parent_pin(text), public.verify_parent_pin(text), public.has_parent_pin() from public, anon;
grant execute on function public.set_parent_pin(text), public.verify_parent_pin(text), public.has_parent_pin() to authenticated;
