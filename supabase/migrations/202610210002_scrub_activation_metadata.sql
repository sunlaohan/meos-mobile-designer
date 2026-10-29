begin;
-- Auth may persist its in-memory metadata again after the insert trigger returns.
-- Strip the consumed secret on every subsequent metadata write as well.
create function public.scrub_activation_metadata() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.raw_user_meta_data := new.raw_user_meta_data - 'activation_code';
  return new;
end;
$$;
revoke all on function public.scrub_activation_metadata() from public, anon, authenticated;
create trigger scrub_activation_metadata before update on auth.users
  for each row execute function public.scrub_activation_metadata();
commit;
