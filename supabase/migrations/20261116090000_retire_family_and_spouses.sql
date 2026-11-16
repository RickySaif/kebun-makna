-- Retire parent/child sub-accounts, the family code and spouse linking (Ricky, 2026-11-16).
-- Everyone is one kind of account now. The supporter-payment key (#name in the Trakteer/Saweria message)
-- moves from families.handle to a unique profiles.username. Existing handles are copied, so #saif keeps working.
-- profiles.role stays (always 'parent' from the signup trigger) because same_side() and the feed rules read it.
-- Applied to the live project on 2026-11-16 via the Supabase connector.

-- ===== 1. username on profiles =====
alter table public.profiles add column if not exists username text;
update public.profiles p set username = f.handle
  from public.families f where f.parent_id = p.id and f.handle is not null and p.username is null;
alter table public.profiles add constraint profiles_username_fmt check (username is null or username ~ '^[a-z][a-z0-9]{2,19}$');
create unique index profiles_username_key on public.profiles (username);

create or replace function public.gen_username(base text) returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare b text; cand text; n int := 1;
begin
  b := lower(coalesce(base, ''));
  b := translate(b, 'àáâãäåèéêëìíîïòóôõöùúûüñç', 'aaaaaaeeeeiiiiooooouuuunc');
  b := regexp_replace(split_part(btrim(b), ' ', 1), '[^a-z0-9]', '', 'g');
  b := regexp_replace(b, '^[0-9]+', '');
  if char_length(b) < 3 then b := 'pemain'; end if;
  b := left(b, 17);
  cand := b;
  while exists(select 1 from profiles where username = cand) loop n := n + 1; cand := b || n; end loop;
  return cand;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare nm text;
begin
  nm := left(coalesce(
      nullif(new.raw_user_meta_data->>'display_name',''),
      nullif(new.raw_user_meta_data->>'full_name',''),
      nullif(new.raw_user_meta_data->>'name',''),
      split_part(coalesce(new.email,'Pemain'),'@',1)), 40);
  insert into profiles(id, role, display_name, username) values (new.id, 'parent', nm, public.gen_username(nm));
  return new;
end $$;

create or replace function public.my_username() returns text
language sql stable security definer set search_path to 'public' as $$
  select username from profiles where id = auth.uid();
$$;

create or replace function public.username_available(name text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select lower(btrim(name)) ~ '^[a-z][a-z0-9]{2,19}$'
     and not exists(select 1 from profiles where username = lower(btrim(name)) and id <> auth.uid());
$$;

create or replace function public.set_username(name text) returns text
language plpgsql security definer set search_path to 'public' as $$
declare n text := lower(btrim(name));
begin
  if auth.uid() is null then raise exception 'Masuk dulu' using errcode='P0001'; end if;
  if n !~ '^[a-z][a-z0-9]{2,19}$' then
    raise exception 'Nama pengguna: 3-20 huruf kecil/angka, diawali huruf' using errcode='P0001'; end if;
  if exists(select 1 from profiles where username = n and id <> auth.uid()) then
    raise exception 'Nama pengguna sudah dipakai' using errcode='P0001'; end if;
  update profiles set username = n where id = auth.uid();
  return n;
end $$;

create or replace function public.resolve_username(input text) returns uuid
language sql stable security definer set search_path to 'public' as $$
  select id from profiles where username = lower(btrim(regexp_replace(btrim(input), '^#', '')));
$$;

drop function public.admin_link_payment(bigint, text);
create function public.admin_link_payment(payment_id bigint, uname text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare pid uuid;
begin
  if not public.is_admin() then raise exception 'Hanya admin' using errcode = 'P0001'; end if;
  pid := public.resolve_username(uname);
  if pid is null then raise exception 'Nama pengguna tidak ditemukan' using errcode = 'P0001'; end if;
  update payments set parent_id = pid where id = payment_id;
  if not found then raise exception 'Pembayaran tidak ditemukan' using errcode = 'P0001'; end if;
  perform public.recompute_supporter_tier(pid);
end $$;

-- supporter tier: one account, no household
create or replace function public.recompute_supporter_tier(p uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare total bigint; t smallint; last_paid timestamptz; m numeric(5,1);
begin
  select coalesce(sum(amount_idr),0), max(created_at) into total, last_paid
    from payments where parent_id = p and created_at > now() - interval '30 days';
  select coalesce(max(tier),0) into t from supporter_tiers where min_total_idr <= total;
  -- above the top tier, show a multiplier rounded down to 1 decimal (620k -> 2.0, 465k -> 1.5)
  m := case when t = 4 and total > 310000 then least(floor(total * 10.0 / 310000) / 10, 9999.9) else null end;
  if m = 1.0 then m := null; end if;
  if t > 0 then
    update profiles set supporter_tier = t, supporter_until = last_paid + interval '30 days', supporter_mult = m where id = p;
  end if;
end $$;

create or replace function public.my_support_status()
returns table(tier smallint, active boolean, until timestamptz, last30_idr bigint)
language sql stable security definer set search_path to 'public' as $$
  select p.supporter_tier, coalesce(p.supporter_until > now(), false), p.supporter_until,
         (select coalesce(sum(amount_idr),0) from payments where parent_id = auth.uid() and created_at > now() - interval '30 days')
    from profiles p where p.id = auth.uid();
$$;

-- groups: no child/parent audience any more; anyone with the code can join
create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare g groups;
begin
  select * into g from groups where join_code = upper(btrim(code));
  if g.id is null then raise exception 'Kode grup tidak ditemukan' using errcode = 'P0001'; end if;
  insert into group_members(group_id, profile_id) values (g.id, auth.uid()) on conflict do nothing;
  return g.id;
end $$;
create or replace function public.group_owner_joins() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into group_members(group_id, profile_id) values (new.id, new.owner_id) on conflict do nothing;
  return new;
end $$;

-- ===== 2. visibility rules without family / parent-of =====
create or replace function public.can_see_private(p uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select p = auth.uid() or public.is_admin();
$$;
alter policy profiles_update_own on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy fi_read on public.farm_interactions using (visitor_id = (select auth.uid()) or owner_id = (select auth.uid()));
alter policy follows_delete on public.follows using (follower_id = (select auth.uid()));
alter policy posts_hide on public.posts using (public.is_admin()) with check (true);
alter policy comments_hide on public.comments using (public.is_admin()) with check (true);
alter policy profiles_read on public.profiles using (public.same_side(id) or public.is_admin());
alter policy farm_read on public.farm_public using (public.same_side(profile_id) or public.is_admin());
alter policy gm_delete on public.group_members using (profile_id = (select auth.uid()) or public.owns_group(group_id));

-- ===== 3. grants for the new functions =====
revoke execute on function public.gen_username(text), public.resolve_username(text) from public, anon, authenticated;
revoke execute on function public.my_username(), public.username_available(text), public.set_username(text),
  public.admin_link_payment(bigint, text) from public, anon;
grant execute on function public.my_username(), public.username_available(text), public.set_username(text),
  public.admin_link_payment(bigint, text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.recompute_supporter_tier(uuid) from public, anon, authenticated;

-- ===== 4. drop the old features (spouses, family, parent/child PINs) =====
drop function if exists public.accept_spouse(bigint, text);
drop function if exists public.decline_spouse(bigint);
drop function if exists public.invite_spouse(text);
drop function if exists public.spouse_invite_names(bigint);
drop function if exists public.set_parent_pin(text);
drop function if exists public.verify_parent_pin(text);
drop function if exists public.has_parent_pin();
drop function if exists public.check_child_pin(uuid, text);
drop function if exists public.set_child_pin(uuid, text);
drop function if exists public.my_family_name();
drop function if exists public.family_name_available(text);
drop function if exists public.set_family_name(text);
drop function if exists public.resolve_family(text);
drop function if exists public.gen_family_name(text);
drop function if exists public.is_family(uuid);
drop function if exists public.is_parent_of(uuid);
drop table public.spouse_invites;
drop table public.spouses;
drop table public.parent_secrets;
drop table public.child_secrets;
drop table public.family_members;
drop table public.families;
drop function if exists public.spouse_of(uuid);
drop function if exists public.inherit_supporter();
