-- Monthly (rolling 30-day) supporter badges. Trakteer has no auto-recurring billing,
-- so a badge is active for 30 days after the latest payment; afterwards it stays visible but inactive (greyed).
-- Tier = household support in the last 30 days, counted up to Rp310.000.
update public.supporter_tiers set min_total_idr = 15000  where tier = 1;
update public.supporter_tiers set min_total_idr = 50000  where tier = 2;
update public.supporter_tiers set min_total_idr = 150000 where tier = 3;
update public.supporter_tiers set min_total_idr = 310000 where tier = 4;

alter table public.profiles add column if not exists supporter_until timestamptz;

create or replace function public.recompute_supporter_tier(p uuid) returns void
language plpgsql security definer set search_path = public as $$
declare hh uuid[]; total bigint; t smallint; last_paid timestamptz;
begin
  hh := array_remove(array[p, public.spouse_of(p)], null);
  select least(coalesce(sum(amount_idr),0), 310000), max(created_at) into total, last_paid
    from payments where parent_id = any(hh) and created_at > now() - interval '30 days';
  select coalesce(max(tier),0) into t from supporter_tiers where min_total_idr <= total;
  if t > 0 then
    update profiles set supporter_tier = t, supporter_until = last_paid + interval '30 days'
     where id = any(hh) or id in (select child_id from family_members where parent_id = any(hh));
  end if;
end $$;
revoke execute on function public.recompute_supporter_tier(uuid) from public, anon, authenticated;

create or replace function public.my_support_status()
returns table(tier smallint, active boolean, until timestamptz, last30_idr bigint)
language sql stable security definer set search_path = public as $$
  with hh as (select array_remove(array[auth.uid(), public.spouse_of(auth.uid())], null) as ids)
  select p.supporter_tier, coalesce(p.supporter_until > now(), false), p.supporter_until,
         (select coalesce(sum(amount_idr),0) from payments, hh where parent_id = any(hh.ids) and created_at > now() - interval '30 days')
    from profiles p where p.id = auth.uid();
$$;
revoke execute on function public.my_support_status() from public, anon;
grant execute on function public.my_support_status() to authenticated;

create or replace function public.inherit_supporter() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles c set supporter_tier = p.supporter_tier, supporter_until = p.supporter_until
    from profiles p where c.id = new.child_id and p.id = new.parent_id and p.supporter_tier > c.supporter_tier;
  return new;
end $$;
drop trigger if exists family_members_inherit on public.family_members;
create trigger family_members_inherit after insert on public.family_members for each row execute function public.inherit_supporter();
revoke execute on function public.inherit_supporter() from public, anon, authenticated;

-- group leaderboard also returns supporter_until so badges render active/inactive
drop function public.group_progress(uuid);
create function public.group_progress(g uuid)
returns table(profile_id uuid, display_name text, avatar smallint, supporter_tier smallint, supporter_until timestamptz, ayat_week bigint)
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := (date_trunc('week', now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta';
begin
  if not (public.is_group_member(g) or public.owns_group(g) or public.is_admin()) then
    raise exception 'Bukan anggota grup' using errcode = 'P0001';
  end if;
  return query
    select p.id, p.display_name, p.avatar, p.supporter_tier, p.supporter_until,
           (select count(*) from activity_log a where a.profile_id = p.id and a.kind = 'ayah_done' and a.created_at >= since)
      from group_members m join profiles p on p.id = m.profile_id
     where m.group_id = g
     order by 6 desc, p.display_name;
end $$;
revoke execute on function public.group_progress(uuid) from public, anon;
grant execute on function public.group_progress(uuid) to authenticated;
