begin;
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  request jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index generation_jobs_active on public.generation_jobs (status, created_at);
alter table public.generation_jobs enable row level security;
revoke all on public.generation_jobs from anon, authenticated;
grant select (id, status, result, error, created_at) on public.generation_jobs to authenticated;
grant all on public.generation_jobs to service_role;
create policy own_generation_result on public.generation_jobs for select to authenticated using ((select auth.uid()) = user_id);

create function public.enqueue_generation(p_user_id uuid, p_request jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare job_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(117032, 1);
  update public.generation_jobs set status = 'failed', request = null, error = '生成已超时，请重新生成。'
    where status in ('queued', 'running') and created_at < now() - interval '10 minutes';
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception '账号尚未激活'; end if;
  if (select count(*) from public.generation_jobs where status in ('queued', 'running')) >= 2 then raise exception '正在处理其他生成请求，请稍后再试。'; end if;
  insert into public.generation_jobs (user_id, request) values (p_user_id, p_request) returning id into job_id;
  return job_id;
end;
$$;
create function public.claim_generation(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare payload jsonb;
begin
  select request into payload from public.generation_jobs where id = p_id and status = 'queued' for update;
  if payload is null then return null; end if;
  -- Clear uploaded images/code from storage as soon as the worker takes the job.
  update public.generation_jobs set status = 'running', request = null where id = p_id;
  return payload;
end;
$$;
revoke all on function public.enqueue_generation(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_generation(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_generation(uuid, jsonb) to service_role;
grant execute on function public.claim_generation(uuid) to service_role;
commit;
