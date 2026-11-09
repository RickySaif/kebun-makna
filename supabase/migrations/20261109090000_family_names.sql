-- Family names (lowercase handle, e.g. "saif", "saif2") replace KM-XXXXXX codes in the UI.
-- Legacy codes still resolve. Linked spouses choose one name; the other is released (set null).
alter table public.families add column handle text;
alter table public.families add constraint families_handle_format check (handle is null or handle ~ '^[a-z][a-z0-9]{2,19}$');
create unique index families_handle_key on public.families(handle);

create or replace function public.gen_family_name(base text) returns text
language plpgsql stable security definer set search_path = public as $$
declare b text; cand text; n int := 1;
begin
  b := lower(coalesce(base, ''));
  b := translate(b, 'àáâãäåèéêëìíîïòóôõöùúûüñç', 'aaaaaaeeeeiiiiooooouuuunc');
  b := regexp_replace(split_part(btrim(b), ' ', 1), '[^a-z0-9]', '', 'g');
  b := regexp_replace(b, '^[0-9]+', '');
  if char_length(b) < 3 then b := 'keluarga'; end if;
  b := left(b, 17);
  cand := b;
  while exists(select 1 from families where handle = cand) loop
    n := n + 1; cand := b || n;
  end loop;
  return cand;
end $$;

create or replace function public.resolve_family(input text) returns uuid
language sql stable security definer set search_path = public as $$
  select parent_id from families
   where handle = lower(btrim(input))
      or code = upper(regexp_replace(btrim(input), '^KM-?', '', 'i'))
   limit 1;
$$;

create or replace function public.my_family_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select handle from families where parent_id = auth.uid()),
                  (select handle from families where parent_id = public.spouse_of(auth.uid())));
$$;

create or replace function public.family_name_available(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(btrim(name)) ~ '^[a-z][a-z0-9]{2,19}$'
     and not exists(select 1 from families where handle = lower(btrim(name)));
$$;

create or replace function public.set_family_name(name text) returns text
language plpgsql security definer set search_path = public as $$
declare n text := lower(btrim(name)); holder uuid;
begin
  if public.my_role() is distinct from 'parent' then raise exception 'Hanya orang tua' using errcode='P0001'; end if;
  if n !~ '^[a-z][a-z0-9]{2,19}$' then
    raise exception 'Nama keluarga: 3-20 huruf kecil/angka, diawali huruf' using errcode='P0001'; end if;
  select parent_id into holder from families
   where parent_id in (auth.uid(), public.spouse_of(auth.uid())) and handle is not null limit 1;
  if holder is null then holder := auth.uid(); end if;
  if exists(select 1 from families where handle = n and parent_id <> holder) then
    raise exception 'Nama keluarga sudah dipakai' using errcode='P0001'; end if;
  update families set handle = n where parent_id = holder;
  return n;
end $$;

do $$ declare r record; begin
  for r in select f.parent_id, p.display_name from families f join profiles p on p.id = f.parent_id where f.handle is null order by f.created_at loop
    update families set handle = public.gen_family_name(r.display_name) where parent_id = r.parent_id;
  end loop;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  if coalesce(new.raw_user_meta_data->>'kind','') = 'child' then return new; end if;
  nm := left(coalesce(
      nullif(new.raw_user_meta_data->>'display_name',''),
      nullif(new.raw_user_meta_data->>'full_name',''),
      nullif(new.raw_user_meta_data->>'name',''),
      split_part(coalesce(new.email,'Orang tua'),'@',1)), 40);
  insert into profiles(id, role, display_name) values (new.id, 'parent', nm);
  insert into families(parent_id, handle) values (new.id, public.gen_family_name(nm));
  return new;
end $$;

create or replace function public.invite_spouse(family_code text) returns bigint
language plpgsql security definer set search_path = public as $$
declare target uuid; iid bigint;
begin
  if public.my_role() is distinct from 'parent' then raise exception 'Hanya orang tua' using errcode='P0001'; end if;
  target := public.resolve_family(family_code);
  if target is null then raise exception 'Nama keluarga tidak ditemukan' using errcode='P0001'; end if;
  if target = auth.uid() then raise exception 'Itu nama keluarga Anda sendiri' using errcode='P0001'; end if;
  if public.spouse_of(auth.uid()) is not null or public.spouse_of(target) is not null then
    raise exception 'Salah satu akun sudah terhubung dengan pasangan' using errcode='P0001'; end if;
  update spouse_invites set status = 'cancelled' where from_parent = auth.uid() and status = 'pending';
  insert into spouse_invites(from_parent, to_parent) values (auth.uid(), target) returning id into iid;
  return iid;
end $$;

drop function public.accept_spouse(bigint);
create or replace function public.accept_spouse(invite_id bigint, family_name text) returns void
language plpgsql security definer set search_path = public as $$
declare inv spouse_invites; a uuid; b uuid; r record; base text; n int; candidate text; keep text := lower(btrim(family_name)); keeper uuid;
begin
  select * into inv from spouse_invites where id = invite_id for update;
  if inv.id is null or inv.to_parent <> auth.uid() or inv.status <> 'pending' then
    raise exception 'Undangan tidak berlaku' using errcode='P0001'; end if;
  if public.spouse_of(inv.from_parent) is not null or public.spouse_of(inv.to_parent) is not null then
    raise exception 'Salah satu akun sudah terhubung dengan pasangan' using errcode='P0001'; end if;
  select parent_id into keeper from families where handle = keep and parent_id in (inv.from_parent, inv.to_parent);
  if keeper is null then raise exception 'Pilih salah satu dari dua nama keluarga' using errcode='P0001'; end if;

  a := least(inv.from_parent, inv.to_parent); b := greatest(inv.from_parent, inv.to_parent);
  insert into spouses(parent_a, parent_b) values (a, b);
  update spouse_invites set status = 'accepted' where id = invite_id;
  update families set handle = null where parent_id in (a, b) and parent_id <> keeper;

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
  insert into activity_log(profile_id, kind, detail) values (inv.from_parent, 'spouse_linked', jsonb_build_object('with', inv.to_parent, 'family_name', keep)),
                                                            (inv.to_parent, 'spouse_linked', jsonb_build_object('with', inv.from_parent, 'family_name', keep));
end $$;

create or replace function public.spouse_invite_names(invite_id bigint) returns table(mine text, theirs text, inviter_name text)
language sql stable security definer set search_path = public as $$
  select (select handle from families where parent_id = i.to_parent),
         (select handle from families where parent_id = i.from_parent),
         (select display_name from profiles where id = i.from_parent)
    from spouse_invites i
   where i.id = invite_id and i.to_parent = auth.uid() and i.status = 'pending';
$$;

revoke execute on function public.gen_family_name(text), public.resolve_family(text) from public, anon, authenticated;
revoke execute on function public.my_family_name(), public.family_name_available(text), public.set_family_name(text),
  public.accept_spouse(bigint, text), public.spouse_invite_names(bigint) from public, anon;
grant execute on function public.my_family_name(), public.family_name_available(text), public.set_family_name(text),
  public.accept_spouse(bigint, text), public.spouse_invite_names(bigint) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
