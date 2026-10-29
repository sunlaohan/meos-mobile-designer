-- Run once in the dedicated Supabase project's SQL editor.
begin;

create table public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^MEOS-[A-F0-9]{8}-[A-F0-9]{8}$'),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  used_email text,
  deleted_at timestamptz
);
alter table public.activation_codes enable row level security;
revoke all on public.activation_codes from anon, authenticated;
grant all on public.activation_codes to service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy own_profile on public.profiles for select to authenticated using ((select auth.uid()) = id);

create table public.design_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '未命名页面' check (char_length(trim(title)) between 1 and 100),
  document jsonb not null default '{"version":1,"nodes":[]}'::jsonb
    check (jsonb_typeof(document) = 'object' and document->>'version' = '1' and jsonb_typeof(document->'nodes') = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index design_pages_owner_updated on public.design_pages (user_id, updated_at desc);
alter table public.design_pages enable row level security;
revoke all on public.design_pages from anon, authenticated;
grant select, insert, update on public.design_pages to authenticated;
grant all on public.design_pages to service_role;
create policy own_pages_read on public.design_pages for select to authenticated using ((select auth.uid()) = user_id);
create policy own_pages_insert on public.design_pages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy own_pages_update on public.design_pages for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.touch_design_page() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  new.created_at := old.created_at;
  return new;
end;
$$;
create trigger touch_design_page before update on public.design_pages for each row execute function public.touch_design_page();

-- A row lock and conditional UPDATE make consumption atomic, including concurrent registrations.
-- Raising an exception rolls back both auth.users and code consumption if signup fails.
create function public.activate_designer_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  update public.activation_codes set used_at = now(), used_by = new.id, used_email = new.email
    where code = upper(trim(coalesce(new.raw_user_meta_data->>'activation_code', '')))
      and used_at is null and deleted_at is null
    returning id into claimed;
  if claimed is null then
    raise exception '激活码无效、已使用或已被删除' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, email) values (new.id, new.email);
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'activation_code' where id = new.id;
  return new;
end;
$$;
revoke all on function public.activate_designer_account() from public, anon, authenticated;
revoke all on function public.touch_design_page() from public, anon, authenticated;
create trigger activate_designer_account after insert on auth.users for each row execute function public.activate_designer_account();
commit;
