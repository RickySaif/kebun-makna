-- Groups: fix RLS recursion (groups_read <-> gm_read), weekly goal, group progress RPC.
-- Admin: link unmatched supporter payments by family code.
-- Found by the beta feed test: any select on groups/group_members returned
--   42P17 infinite recursion detected in policy for relation "group_members".

-- ===== 1. helper functions bypass RLS, so the policies no longer reference each other =====
create or replace function public.is_group_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from group_members where group_id = g and profile_id = auth.uid());
$$;
create or replace function public.owns_group(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from groups where id = g and owner_id = auth.uid());
$$;
revoke execute on function public.is_group_member(uuid), public.owns_group(uuid) from public, anon;
grant execute on function public.is_group_member(uuid), public.owns_group(uuid) to authenticated;

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_group_member(id) or public.is_admin());

drop policy if exists gm_read on public.group_members;
create policy gm_read on public.group_members for select to authenticated
  using (public.same_side(profile_id) or public.can_see_private(profile_id) or public.owns_group(group_id));

drop policy if exists gm_delete on public.group_members;
create policy gm_delete on public.group_members for delete to authenticated
  using (profile_id = (select auth.uid()) or public.is_parent_of(profile_id) or public.owns_group(group_id));

-- ===== 2. weekly goal (owner edits) =====
alter table public.groups add column if not exists weekly_goal int not null default 50 check (weekly_goal between 1 and 10000);
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke update on public.groups from authenticated;
grant update (name, weekly_goal) on public.groups to authenticated;

-- ===== 3. group progress: ayah_done counts this week (Monday 00:00 Asia/Jakarta) per member =====
-- activity_log is private (self/parent/admin), so members see only these aggregate counts.
create or replace function public.group_progress(g uuid)
returns table(profile_id uuid, display_name text, avatar smallint, supporter_tier smallint, ayat_week bigint)
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := (date_trunc('week', now() at time zone 'Asia/Jakarta')) at time zone 'Asia/Jakarta';
begin
  if not (public.is_group_member(g) or public.owns_group(g) or public.is_admin()) then
    raise exception 'Bukan anggota grup' using errcode = 'P0001';
  end if;
  return query
    select p.id, p.display_name, p.avatar, p.supporter_tier,
           (select count(*) from activity_log a where a.profile_id = p.id and a.kind = 'ayah_done' and a.created_at >= since)
      from group_members m join profiles p on p.id = m.profile_id
     where m.group_id = g
     order by 5 desc, p.display_name;
end $$;
revoke execute on function public.group_progress(uuid) from public, anon;
grant execute on function public.group_progress(uuid) to authenticated;

-- ===== 4. admin: unmatched payments + manual link =====
create or replace function public.admin_link_payment(payment_id bigint, family_code text) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid; c text;
begin
  if not public.is_admin() then raise exception 'Hanya admin' using errcode = 'P0001'; end if;
  c := upper(regexp_replace(btrim(family_code), '^KM-?', '', 'i'));
  select parent_id into pid from families where code = c;
  if pid is null then raise exception 'Kode keluarga tidak ditemukan' using errcode = 'P0001'; end if;
  update payments set parent_id = pid where id = payment_id;
  if not found then raise exception 'Pembayaran tidak ditemukan' using errcode = 'P0001'; end if;
  perform public.recompute_supporter_tier(pid);
end $$;
revoke execute on function public.admin_link_payment(bigint, text) from public, anon;
grant execute on function public.admin_link_payment(bigint, text) to authenticated;
