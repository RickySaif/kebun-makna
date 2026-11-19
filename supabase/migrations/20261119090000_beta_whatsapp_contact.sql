-- Beta testers give a WhatsApp number so Ricky can ask for feedback (Ricky, 2026-11-19).
-- Kept in its own table, not in `profiles`: every signed-in player can read `profiles`, and a phone number must stay
-- private to its owner and the admin. The app asks for the number at sign-up and, once, after login for anyone
-- who has none (Google sign-in, accounts made before this migration). Remove the table when the beta ends.

create table public.beta_contacts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  whatsapp   text not null check (whatsapp ~ '^[1-9][0-9]{7,14}$'), -- digits with country code, no "+", e.g. 6281234567890
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.beta_contacts enable row level security;
revoke all on public.beta_contacts from anon;

create policy beta_contacts_select on public.beta_contacts for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy beta_contacts_insert on public.beta_contacts for insert to authenticated
  with check (profile_id = auth.uid());
create policy beta_contacts_update on public.beta_contacts for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create or replace function public.beta_contacts_touch() returns trigger
language plpgsql set search_path to 'public' as $$
begin new.updated_at := now(); return new; end $$;
create trigger beta_contacts_touch before update on public.beta_contacts
  for each row execute function public.beta_contacts_touch();

-- Email sign-up sends the number in the sign-up metadata; save it with the new profile.
-- A missing or malformed number never blocks sign-up (Google has none): the app asks for it after login instead.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare nm text; wa text;
begin
  nm := left(coalesce(
      nullif(new.raw_user_meta_data->>'display_name',''),
      nullif(new.raw_user_meta_data->>'full_name',''),
      nullif(new.raw_user_meta_data->>'name',''),
      split_part(coalesce(new.email,'Pemain'),'@',1)), 40);
  insert into profiles(id, role, display_name, username) values (new.id, 'parent', nm, public.gen_username(nm));
  wa := regexp_replace(coalesce(new.raw_user_meta_data->>'whatsapp',''), '[^0-9]', '', 'g');
  if wa ~ '^[1-9][0-9]{7,14}$' then
    insert into beta_contacts(profile_id, whatsapp) values (new.id, wa) on conflict do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Accounts that exist today are Ricky's family (Ricky, 2026-11-19): give them a placeholder so the game does not stop them
-- at the number screen. The placeholder is 62 + ten zeros; the admin list marks it, and a player can replace it on Profil.
insert into public.beta_contacts(profile_id, whatsapp)
  select id, '620000000000' from public.profiles
  on conflict do nothing;
