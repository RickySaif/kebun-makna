-- Spouse linking (merge children lists), Google-friendly display names,
-- and role separation: children interact only with children, parents only with parents.

-- ===== 1. children can have two parents =====
alter table public.family_members drop constraint family_members_pkey;
alter table public.family_members add primary key (child_id, parent_id);
create index if not exists family_members_child_idx on public.family_members(child_id);

-- ===== 2. spouses =====
create table public.spouses (
  parent_a uuid not null references public.profiles(id) on delete cascade,
  parent_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_a, parent_b),
  check (parent_a < parent_b)
);
create unique index spouses_a_once on public.spouses(parent_a);
create unique index spouses_b_once on public.spouses(parent_b);

create table public.spouse_invites (
  id bigint generated always as identity primary key,
  from_parent uuid not null references public.profiles(id) on delete cascade,
  to_parent uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  check (from_parent <> to_parent)
);
create index on public.spouse_invites(to_parent, status);
create index on public.spouse_invites(from_parent, status);
alter table public.spouses enable row level security;
alter table public.spouse_invites enable row level security;

create or replace function public.spouse_of(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when parent_a = p then parent_b else parent_a end from spouses where parent_a = p or parent_b = p limit 1;
$$;
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;
create or replace function public.same_side(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = p) = (select role from profiles where id = auth.uid()), false);
$$;
-- family relation: self, my child, my parent, my spouse
create or replace function public.is_family(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p = auth.uid()
      or exists(select 1 from family_members where (child_id = p and parent_id = auth.uid()) or (child_id = auth.uid() and parent_id = p))
      or public.spouse_of(auth.uid()) = p;
$$;

create policy spouses_read on public.spouses for select to authenticated
  using (parent_a = (select auth.uid()) or parent_b = (select auth.uid()));
create policy spouse_invites_read on public.spouse_invites for select to authenticated
  using (from_parent = (select auth.uid()) or to_parent = (select auth.uid()));

-- invite by the other parent's family code (KM-XXXXXX)
create or replace function public.invite_spouse(family_code text) returns bigint
language plpgsql security definer set search_path = public as $$
declare target uuid; iid bigint; c text;
begin
  if public.my_role() is distinct from 'parent' then raise exception 'Hanya orang tua' using errcode='P0001'; end if;
  c := upper(regexp_replace(btrim(family_code), '^KM-?', '', 'i'));
  select parent_id into target from families where code = c;
  if target is null then raise exception 'Kode keluarga tidak ditemukan' using errcode='P0001'; end if;
  if target = auth.uid() then raise exception 'Itu kode keluarga Anda sendiri' using errcode='P0001'; end if;
  if public.spouse_of(auth.uid()) is not null or public.spouse_of(target) is not null then
    raise exception 'Salah satu akun sudah terhubung dengan pasangan' using errcode='P0001'; end if;
  update spouse_invites set status = 'cancelled' where from_parent = auth.uid() and status = 'pending';
  insert into spouse_invites(from_parent, to_parent) values (auth.uid(), target) returning id into iid;
  return iid;
end $$;

create or replace function public.decline_spouse(invite_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update spouse_invites set status = case when from_parent = auth.uid() then 'cancelled' else 'declined' end
   where id = invite_id and status = 'pending' and (to_parent = auth.uid() or from_parent = auth.uid());
end $$;

-- accept: link spouses and merge both children lists; duplicate names get " 2", " 3"... (oldest keeps the name)
create or replace function public.accept_spouse(invite_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare inv spouse_invites; a uuid; b uuid; r record; base text; n int; candidate text;
begin
  select * into inv from spouse_invites where id = invite_id for update;
  if inv.id is null or inv.to_parent <> auth.uid() or inv.status <> 'pending' then
    raise exception 'Undangan tidak berlaku' using errcode='P0001'; end if;
  if public.spouse_of(inv.from_parent) is not null or public.spouse_of(inv.to_parent) is not null then
    raise exception 'Salah satu akun sudah terhubung dengan pasangan' using errcode='P0001'; end if;
  a := least(inv.from_parent, inv.to_parent); b := greatest(inv.from_parent, inv.to_parent);
  insert into spouses(parent_a, parent_b) values (a, b);
  update spouse_invites set status = 'accepted' where id = invite_id;

  for r in
    select p.id, p.display_name,
           row_number() over (partition by lower(btrim(p.display_name)) order by p.created_at, p.id) as rn
      from profiles p
     where p.id in (select child_id from family_members where parent_id in (a, b))
  loop
    if r.rn > 1 then
      base := btrim(r.display_name); n := r.rn;
      loop
        candidate := left(base, 36) || ' ' || n;
        exit when not exists(select 1 from profiles p2
                              where p2.id in (select child_id from family_members where parent_id in (a, b))
                                and lower(p2.display_name) = lower(candidate));
        n := n + 1;
      end loop;
      update profiles set display_name = candidate where id = r.id;
    end if;
  end loop;

  insert into family_members(child_id, parent_id)
    select child_id, a from family_members where parent_id = b
    union
    select child_id, b from family_members where parent_id = a
  on conflict do nothing;

  perform public.recompute_supporter_tier(a);
  insert into activity_log(profile_id, kind, detail) values (inv.from_parent, 'spouse_linked', jsonb_build_object('with', inv.to_parent)),
                                                            (inv.to_parent, 'spouse_linked', jsonb_build_object('with', inv.from_parent));
end $$;

-- ===== 3. supporter tier is per household (both spouses' payments) =====
create or replace function public.recompute_supporter_tier(p uuid) returns void
language plpgsql security definer set search_path = public as $$
declare hh uuid[]; total bigint; t smallint;
begin
  hh := array_remove(array[p, public.spouse_of(p)], null);
  select coalesce(sum(amount_idr),0) into total from payments where parent_id = any(hh);
  select coalesce(max(tier),0) into t from supporter_tiers where min_total_idr <= total;
  update profiles set supporter_tier = t
   where id = any(hh) or id in (select child_id from family_members where parent_id = any(hh));
end $$;
revoke execute on function public.recompute_supporter_tier(uuid) from public, anon, authenticated;

-- ===== 4. parent override PIN works with either parent =====
create or replace function public.verify_parent_pin(pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s parent_secrets; any_set boolean := false; any_locked boolean := false;
begin
  for s in
    select ps.* from parent_secrets ps
     where ps.parent_id in (select parent_id from family_members where child_id = auth.uid()
                            union select auth.uid() union select public.spouse_of(auth.uid()))
     for update
  loop
    any_set := true;
    if s.locked_until is not null and s.locked_until > now() then any_locked := true; continue; end if;
    if s.pin_hash = crypt(pin, s.pin_hash) then
      update parent_secrets set failed_attempts = 0 where parent_id = s.parent_id;
      insert into activity_log(profile_id, kind, detail) values (auth.uid(), 'parent_override', jsonb_build_object('by', s.parent_id));
      return 'ok';
    end if;
    update parent_secrets set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
     where parent_id = s.parent_id;
  end loop;
  if not any_set then return 'unset'; end if;
  if any_locked then return 'locked'; end if;
  return 'wrong';
end $$;

create or replace function public.has_parent_pin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from parent_secrets where parent_id in
    (select parent_id from family_members where child_id = auth.uid() union select auth.uid() union select public.spouse_of(auth.uid())));
$$;

-- ===== 5. Google / OAuth signups: nicer default display name =====
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data->>'kind','') = 'child' then return new; end if;
  insert into profiles(id, role, display_name)
  values (new.id, 'parent', left(coalesce(
      nullif(new.raw_user_meta_data->>'display_name',''),
      nullif(new.raw_user_meta_data->>'full_name',''),
      nullif(new.raw_user_meta_data->>'name',''),
      split_part(coalesce(new.email,'Orang tua'),'@',1)), 40));
  insert into families(parent_id) values (new.id);
  return new;
end $$;

-- ===== 6. role separation =====
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.same_side(id) or public.is_family(id) or public.is_admin());

drop policy farm_read on public.farm_public;
create policy farm_read on public.farm_public for select to authenticated
  using (public.same_side(profile_id) or public.is_family(profile_id) or public.is_admin());

drop policy follows_read on public.follows;
create policy follows_read on public.follows for select to authenticated
  using (public.same_side(follower_id) or public.can_see_private(follower_id) or public.can_see_private(followee_id));
drop policy follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()) and public.same_side(followee_id));

drop policy posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated
  using ((not hidden and public.same_side(author_id)) or public.can_see_private(author_id));

drop policy comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated
  using ((not hidden and public.same_side(author_id)) or public.can_see_private(author_id));
drop policy comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid())
              and exists(select 1 from posts p where p.id = post_id and public.same_side(p.author_id)));

drop policy reactions_read on public.reactions;
create policy reactions_read on public.reactions for select to authenticated
  using (public.same_side(profile_id) or public.can_see_private(profile_id));
drop policy reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert to authenticated
  with check (profile_id = (select auth.uid())
              and exists(select 1 from posts p where p.id = post_id and public.same_side(p.author_id)));

drop policy fi_insert on public.farm_interactions;
create policy fi_insert on public.farm_interactions for insert to authenticated
  with check (visitor_id = (select auth.uid()) and public.same_side(owner_id));

-- groups have an audience; members must match it (owner manages even if not a member)
alter table public.groups add column audience text not null default 'child' check (audience in ('child','parent'));
create or replace function public.group_owner_joins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select role from profiles where id = new.owner_id) = new.audience then
    insert into group_members(group_id, profile_id) values (new.id, new.owner_id) on conflict do nothing;
  end if;
  return new;
end $$;
create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  select * into g from groups where join_code = upper(btrim(code));
  if g.id is null then raise exception 'Kode grup tidak ditemukan' using errcode = 'P0001'; end if;
  if public.my_role() is distinct from g.audience then
    raise exception 'Grup ini untuk %', case g.audience when 'child' then 'anak-anak' else 'orang tua' end using errcode = 'P0001'; end if;
  insert into group_members(group_id, profile_id) values (g.id, auth.uid()) on conflict do nothing;
  return g.id;
end $$;
drop policy gm_read on public.group_members;
create policy gm_read on public.group_members for select to authenticated
  using (public.same_side(profile_id) or public.can_see_private(profile_id)
         or exists(select 1 from groups g where g.id = group_id and g.owner_id = (select auth.uid())));

-- ===== grants =====
revoke execute on function public.spouse_of(uuid), public.my_role(), public.same_side(uuid), public.is_family(uuid),
  public.invite_spouse(text), public.decline_spouse(bigint), public.accept_spouse(bigint) from public, anon;
grant execute on function public.spouse_of(uuid), public.my_role(), public.same_side(uuid), public.is_family(uuid),
  public.invite_spouse(text), public.decline_spouse(bigint), public.accept_spouse(bigint) to authenticated;
revoke execute on function public.handle_new_user(), public.group_owner_joins() from public, anon, authenticated;
