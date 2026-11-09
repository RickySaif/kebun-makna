create extension if not exists pgcrypto with schema extensions;

-- ========== accounts ==========
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('parent','child')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar smallint not null default 0,
  supporter_tier smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.families (
  parent_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique default upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,6)),
  created_at timestamptz not null default now()
);

create table public.family_members (
  child_id uuid primary key references public.profiles(id) on delete cascade,
  parent_id uuid not null references public.profiles(id) on delete cascade
);
create index on public.family_members(parent_id);

-- service-role only (RLS on, no policies)
create table public.child_secrets (
  child_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz
);

create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);

create or replace function public.is_parent_of(child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from family_members where child_id = child and parent_id = auth.uid());
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;
create or replace function public.can_see_private(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p = auth.uid() or public.is_parent_of(p) or public.is_admin();
$$;

-- every new non-child auth user becomes a parent with a family code.
-- children are created by the `family` edge function with user_metadata.kind='child'.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data->>'kind','') = 'child' then
    return new; -- edge function inserts profile + link
  end if;
  insert into profiles(id, role, display_name)
  values (new.id, 'parent', coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,'Orang tua'),'@',1)));
  insert into families(parent_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== game ==========
create table public.game_saves (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  version int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.farm_public (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  level int not null default 1,
  surahs_done int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.activity_log(profile_id, created_at desc);

create table public.farm_interactions (
  id bigint generated always as identity primary key,
  visitor_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('water','salam')),
  preset text check (preset in ('assalamualaikum','masyaallah','barakallah','semangat','jazakallah')),
  created_on date not null default current_date,
  created_at timestamptz not null default now(),
  check (visitor_id <> owner_id)
);
create unique index farm_water_once_a_day on public.farm_interactions(visitor_id, owner_id, kind, created_on);
create index on public.farm_interactions(owner_id, created_at desc);

-- ========== verified sources (read-only reference library) ==========
create table public.sources (
  id text primary key,                     -- quran:112:1 | bukhari:1 | muslim:1
  kind text not null check (kind in ('quran','bukhari','muslim')),
  ref_label text not null,                 -- "QS. Al-Ikhlas 112:1" | "HR. Bukhari no. 1"
  surah smallint, ayah smallint, number int,
  arabic text not null,
  indonesian text not null,
  attribution text not null,
  search tsvector generated always as (to_tsvector('simple', ref_label || ' ' || indonesian)) stored
);
create index on public.sources using gin(search);
create index on public.sources(kind, surah, ayah);
create index on public.sources(kind, number);

-- ========== social ==========
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index on public.follows(followee_id);

create table public.posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  source_id text not null references public.sources(id),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.posts(author_id, created_at desc);
create index on public.posts(created_at desc);

create table public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.comments(post_id, created_at);
create index on public.comments(author_id);

create table public.reactions (
  post_id bigint not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('masyaallah','jazakallah','aamiin','subhanallah')),
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id, kind)
);
create index on public.reactions(profile_id);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id bigint references public.posts(id) on delete cascade,
  comment_id bigint references public.comments(id) on delete cascade,
  reason text check (char_length(reason) <= 200),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)
);
create index on public.reports(post_id);
create index on public.reports(comment_id);
create index on public.reports(reporter_id);

-- ========== groups (family / class / TPA) ==========
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  join_code text not null unique default upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,6)),
  created_at timestamptz not null default now()
);
create index on public.groups(owner_id);
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index on public.group_members(profile_id);

-- ========== supporters (written only by payment webhook) ==========
create table public.payments (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('trakteer','saweria','manual')),
  provider_ref text not null,
  parent_id uuid references public.profiles(id) on delete set null,
  amount_idr bigint not null,
  supporter_name text,
  message text,
  raw jsonb not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index on public.payments(parent_id);

create table public.supporter_tiers (
  tier smallint primary key,
  name text not null,
  min_total_idr bigint not null,
  badge text not null
);
insert into public.supporter_tiers values
  (1,'Penanam',   25000,'🌱'),
  (2,'Perawat Kebun',100000,'🌳'),
  (3,'Penjaga Desa', 500000,'🏡'),
  (4,'Sahabat Kebun Makna',1000000,'🌟');

-- recompute tier for a parent and all their children from total paid
create or replace function public.recompute_supporter_tier(p uuid) returns void
language plpgsql security definer set search_path = public as $$
declare total bigint; t smallint;
begin
  select coalesce(sum(amount_idr),0) into total from payments where parent_id = p;
  select coalesce(max(tier),0) into t from supporter_tiers where min_total_idr <= total;
  update profiles set supporter_tier = t
   where id = p or id in (select child_id from family_members where parent_id = p);
end $$;
revoke execute on function public.recompute_supporter_tier(uuid) from public, anon, authenticated;

-- ========== guards: word filter + rate limits ==========
create table public.banned_words (word text primary key);
insert into public.banned_words values
 ('anjing'),('bangsat'),('babi'),('goblok'),('tolol'),('kontol'),('memek'),('ngentot'),('bajingan'),('kampret'),('tai'),('fuck'),('shit'),('bitch');

create or replace function public.guard_text() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; lim int; bad text;
begin
  if new.author_id <> auth.uid() then raise exception 'author must be current user'; end if;
  select word into bad from banned_words
   where lower(new.body) ~ ('(^|[^a-z])' || word || '([^a-z]|$)') limit 1;
  if bad is not null then raise exception 'Kata-kata ini tidak sopan. Yuk pakai kata yang baik.' using errcode = 'P0001'; end if;
  if tg_table_name = 'posts' then
    select count(*) into n from posts where author_id = new.author_id and created_at > now() - interval '1 day'; lim := 10;
  else
    select count(*) into n from comments where author_id = new.author_id and created_at > now() - interval '1 day'; lim := 60;
  end if;
  if n >= lim then raise exception 'Batas harian tercapai. Coba lagi besok, ya.' using errcode = 'P0001'; end if;
  new.hidden := false;
  return new;
end $$;
create trigger posts_guard before insert on public.posts for each row execute function public.guard_text();
create trigger comments_guard before insert on public.comments for each row execute function public.guard_text();

-- auto-hide after 3 distinct reports
create or replace function public.auto_hide_reported() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.post_id is not null and (select count(distinct reporter_id) from reports where post_id = new.post_id) >= 3 then
    update posts set hidden = true where id = new.post_id; end if;
  if new.comment_id is not null and (select count(distinct reporter_id) from reports where comment_id = new.comment_id) >= 3 then
    update comments set hidden = true where id = new.comment_id; end if;
  return new;
end $$;
create trigger reports_autohide after insert on public.reports for each row execute function public.auto_hide_reported();

-- ========== RLS ==========
alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.child_secrets enable row level security;
alter table public.admins enable row level security;
alter table public.game_saves enable row level security;
alter table public.farm_public enable row level security;
alter table public.activity_log enable row level security;
alter table public.farm_interactions enable row level security;
alter table public.sources enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.reports enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.payments enable row level security;
alter table public.supporter_tiers enable row level security;
alter table public.banned_words enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_parent_of(id))
  with check (id = (select auth.uid()) or public.is_parent_of(id));
-- supporter_tier / role must not be user-editable
revoke update on public.profiles from authenticated;
grant update (display_name, avatar) on public.profiles to authenticated;

create policy families_read_own on public.families for select to authenticated using (parent_id = (select auth.uid()));
create policy family_members_read on public.family_members for select to authenticated
  using (parent_id = (select auth.uid()) or child_id = (select auth.uid()));
create policy admins_read_self on public.admins for select to authenticated using (user_id = (select auth.uid()));

create policy saves_read on public.game_saves for select to authenticated using (public.can_see_private(profile_id));
create policy saves_insert on public.game_saves for insert to authenticated with check (profile_id = (select auth.uid()));
create policy saves_update on public.game_saves for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create policy farm_read on public.farm_public for select to authenticated using (true);
create policy farm_insert on public.farm_public for insert to authenticated with check (profile_id = (select auth.uid()));
create policy farm_update on public.farm_public for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create policy activity_read on public.activity_log for select to authenticated using (public.can_see_private(profile_id));
create policy activity_insert on public.activity_log for insert to authenticated with check (profile_id = (select auth.uid()));

create policy fi_read on public.farm_interactions for select to authenticated
  using (visitor_id = (select auth.uid()) or owner_id = (select auth.uid()) or public.is_parent_of(visitor_id) or public.is_parent_of(owner_id));
create policy fi_insert on public.farm_interactions for insert to authenticated with check (visitor_id = (select auth.uid()));

create policy sources_read on public.sources for select to anon, authenticated using (true);
create policy tiers_read on public.supporter_tiers for select to anon, authenticated using (true);

create policy follows_read on public.follows for select to authenticated using (true);
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = (select auth.uid()));
create policy follows_delete on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()) or public.is_parent_of(follower_id));

create policy posts_read on public.posts for select to authenticated
  using (not hidden or public.can_see_private(author_id));
create policy posts_insert on public.posts for insert to authenticated with check (author_id = (select auth.uid()));
create policy posts_delete on public.posts for delete to authenticated using (public.can_see_private(author_id));
create policy posts_hide on public.posts for update to authenticated
  using (public.is_parent_of(author_id) or public.is_admin()) with check (true);
revoke update on public.posts from authenticated;
grant update (hidden) on public.posts to authenticated;

create policy comments_read on public.comments for select to authenticated
  using (not hidden or public.can_see_private(author_id));
create policy comments_insert on public.comments for insert to authenticated with check (author_id = (select auth.uid()));
create policy comments_delete on public.comments for delete to authenticated
  using (public.can_see_private(author_id)
         or exists(select 1 from posts p where p.id = post_id and p.author_id = (select auth.uid())));
create policy comments_hide on public.comments for update to authenticated
  using (public.is_parent_of(author_id) or public.is_admin()) with check (true);
revoke update on public.comments from authenticated;
grant update (hidden) on public.comments to authenticated;

create policy reactions_read on public.reactions for select to authenticated using (true);
create policy reactions_insert on public.reactions for insert to authenticated with check (profile_id = (select auth.uid()));
create policy reactions_delete on public.reactions for delete to authenticated using (profile_id = (select auth.uid()));

create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy reports_read on public.reports for select to authenticated using (reporter_id = (select auth.uid()) or public.is_admin());
create policy reports_update_admin on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy groups_read on public.groups for select to authenticated
  using (owner_id = (select auth.uid()) or exists(select 1 from group_members m where m.group_id = id and m.profile_id = (select auth.uid())));
create policy groups_insert on public.groups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy groups_delete on public.groups for delete to authenticated using (owner_id = (select auth.uid()));
create policy gm_read on public.group_members for select to authenticated using (true);
create policy gm_delete on public.group_members for delete to authenticated
  using (profile_id = (select auth.uid()) or public.is_parent_of(profile_id)
         or exists(select 1 from groups g where g.id = group_id and g.owner_id = (select auth.uid())));

create policy payments_read on public.payments for select to authenticated using (parent_id = (select auth.uid()) or public.is_admin());

-- join a group by code (members can't insert themselves directly)
create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select id into g from groups where join_code = upper(btrim(code));
  if g is null then raise exception 'Kode grup tidak ditemukan' using errcode = 'P0001'; end if;
  insert into group_members(group_id, profile_id) values (g, auth.uid()) on conflict do nothing;
  return g;
end $$;
revoke execute on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;

-- owner auto-joins own group
create or replace function public.group_owner_joins() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into group_members(group_id, profile_id) values (new.id, new.owner_id) on conflict do nothing; return new; end $$;
create trigger groups_owner_join after insert on public.groups for each row execute function public.group_owner_joins();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_text() from public, anon, authenticated;
revoke execute on function public.auto_hide_reported() from public, anon, authenticated;
revoke execute on function public.group_owner_joins() from public, anon, authenticated;
