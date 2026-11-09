-- Above the top tier (Rp310.000 in 30 days) the badge carries a multiplier, rounded down to 1 decimal:
-- 465k -> 1.5🌟, 620k -> 2🌟. Exactly 310k shows a plain 🌟 (multiplier null).
alter table public.profiles add column if not exists supporter_mult numeric(5,1);

create or replace function public.recompute_supporter_tier(p uuid) returns void
language plpgsql security definer set search_path = public as $$
declare hh uuid[]; total bigint; t smallint; last_paid timestamptz; m numeric(5,1);
begin
  hh := array_remove(array[p, public.spouse_of(p)], null);
  select coalesce(sum(amount_idr),0), max(created_at) into total, last_paid
    from payments where parent_id = any(hh) and created_at > now() - interval '30 days';
  select coalesce(max(tier),0) into t from supporter_tiers where min_total_idr <= total;
  m := case when t = 4 and total > 310000 then least(floor(total * 10.0 / 310000) / 10, 9999.9) else null end;
  if m = 1.0 then m := null; end if;
  if t > 0 then
    update profiles set supporter_tier = t, supporter_until = last_paid + interval '30 days', supporter_mult = m
     where id = any(hh) or id in (select child_id from family_members where parent_id = any(hh));
  end if;
end $$;
revoke execute on function public.recompute_supporter_tier(uuid) from public, anon, authenticated;

create or replace function public.inherit_supporter() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles c set supporter_tier = p.supporter_tier, supporter_until = p.supporter_until, supporter_mult = p.supporter_mult
    from profiles p where c.id = new.child_id and p.id = new.parent_id and p.supporter_tier > c.supporter_tier;
  return new;
end $$;

drop function public.group_progress(uuid);
create function public.group_progress(g uuid)
returns table(profile_id uuid, display_name text, avatar smallint, supporter_tier smallint, supporter_until timestamptz, supporter_mult numeric, ayat_week bigint)
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := (date_trunc('week', now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta';
begin
  if not (public.is_group_member(g) or public.owns_group(g) or public.is_admin()) then
    raise exception 'Bukan anggota grup' using errcode = 'P0001';
  end if;
  return query
    select p.id, p.display_name, p.avatar, p.supporter_tier, p.supporter_until, p.supporter_mult,
           (select count(*) from activity_log a where a.profile_id = p.id and a.kind = 'ayah_done' and a.created_at >= since)
      from group_members m join profiles p on p.id = m.profile_id
     where m.group_id = g
     order by 7 desc, p.display_name;
end $$;
revoke execute on function public.group_progress(uuid) from public, anon;
grant execute on function public.group_progress(uuid) to authenticated;
