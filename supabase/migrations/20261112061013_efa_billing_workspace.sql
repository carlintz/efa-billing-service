begin;
create schema if not exists efa_private;
revoke all on schema efa_private from public;
grant usage on schema efa_private to authenticated, service_role;

create table if not exists public.efa_allowed_emails (
 email text primary key check (email=lower(email)), role text not null check(role in ('admin','editor'))
);
create table if not exists public.efa_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null, role text not null check(role in ('admin','editor')),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.efa_access_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null, requested_at timestamptz not null default now()
);
create table if not exists public.efa_settlements (
 month date primary key check (extract(day from month)=1),
 version integer not null check (version>0),
 rate numeric not null check(rate>0), rate_origin text not null,
 source_path text not null, source_filename text not null, source_sha256 text not null,
 status text not null check(status in ('draft','final')), note text not null default '',
 snapshot jsonb not null,
 updated_at timestamptz not null default now(), updated_by uuid not null references auth.users(id), updated_by_email text not null
);
create table if not exists public.efa_settlement_versions (
 month date not null references public.efa_settlements(month), version integer not null,
 rate numeric not null check(rate>0), rate_origin text not null,
 source_path text not null, source_filename text not null, source_sha256 text not null,
 status text not null check(status in ('draft','final')), note text not null,
 snapshot jsonb not null,
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id), created_by_email text not null,
 primary key(month,version)
);
create or replace function efa_private.is_member() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.efa_members where user_id=auth.uid() and active);
$$;
create or replace function efa_private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.efa_members where user_id=auth.uid() and active and role='admin');
$$;
revoke all on function efa_private.is_member(),efa_private.is_admin() from public;
grant execute on function efa_private.is_member(),efa_private.is_admin() to authenticated;

alter table public.efa_allowed_emails enable row level security;
alter table public.efa_members enable row level security;
alter table public.efa_access_requests enable row level security;
alter table public.efa_settlements enable row level security;
alter table public.efa_settlement_versions enable row level security;
revoke all on public.efa_allowed_emails,public.efa_members,public.efa_access_requests,public.efa_settlements,public.efa_settlement_versions from anon,authenticated;
grant all on public.efa_allowed_emails,public.efa_members,public.efa_access_requests,public.efa_settlements,public.efa_settlement_versions to service_role;
grant select on public.efa_members,public.efa_access_requests,public.efa_settlements,public.efa_settlement_versions to authenticated;
create policy efa_members_read on public.efa_members for select to authenticated using(user_id=auth.uid() or efa_private.is_admin());
create policy efa_requests_read on public.efa_access_requests for select to authenticated using(user_id=auth.uid() or efa_private.is_admin());
create policy efa_settlements_read on public.efa_settlements for select to authenticated using(efa_private.is_member());
create policy efa_versions_read on public.efa_settlement_versions for select to authenticated using(efa_private.is_member());

-- The owner is promoted only after Supabase has verified their email address.
create or replace function public.efa_request_access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_email text; v_role text; v_member public.efa_members;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select lower(email) into v_email from auth.users where id=v_user and email_confirmed_at is not null;
 if v_email is null then raise exception 'Verified email required' using errcode='42501'; end if;
 select * into v_member from public.efa_members where user_id=v_user;
 if found then return jsonb_build_object('role',v_member.role,'active',v_member.active,'email',v_member.email); end if;
 select role into v_role from public.efa_allowed_emails where email=v_email;
 if v_role is not null then
  insert into public.efa_members(user_id,email,role) values(v_user,v_email,v_role);
  delete from public.efa_access_requests where user_id=v_user;
  return jsonb_build_object('role',v_role,'active',true,'email',v_email);
 end if;
 insert into public.efa_access_requests(user_id,email) values(v_user,v_email) on conflict(user_id) do nothing;
 return jsonb_build_object('role','pending','active',false,'email',v_email);
end; $$;
revoke all on function public.efa_request_access() from public,anon;
grant execute on function public.efa_request_access() to authenticated;

-- Writes are server-only: the API verifies identity, recomputes totals from the private CSV,
-- and invokes these functions with the service role. Browsers never receive that key.
create or replace function public.efa_save_settlement(p_actor uuid,p_month date,p_expected_version integer,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_current public.efa_settlements; v_result public.efa_settlements; v_email text; v_next integer;
begin
 if extract(day from p_month)<>1 or p_expected_version<0 then raise exception 'Invalid month/version'; end if;
 select email into v_email from public.efa_members where user_id=p_actor and active;
 if v_email is null then raise exception 'EFA access required' using errcode='42501'; end if;
 -- Locks both creation and update, so two new-month saves cannot race.
 perform pg_catalog.pg_advisory_xact_lock(20261112,(p_month-date '2000-01-01')::integer);
 select * into v_current from public.efa_settlements where month=p_month for update;
 if coalesce(v_current.version,0)<>p_expected_version then raise exception 'EFA_VERSION_CONFLICT' using errcode='40001'; end if;
 if not exists(select 1 from storage.objects where bucket_id='efa-billing-raw' and name=p_document->>'source_path') then raise exception 'Source file missing'; end if;
 if (p_document->>'source_path') not like 'uploads/'||to_char(p_month,'YYYY-MM')||'/%' then raise exception 'Invalid source path'; end if;
 v_next:=p_expected_version+1;
 insert into public.efa_settlements(month,version,rate,rate_origin,source_path,source_filename,source_sha256,status,note,snapshot,updated_by,updated_by_email)
 values(p_month,v_next,(p_document->>'rate')::numeric,p_document->>'rate_origin',p_document->>'source_path',p_document->>'source_filename',p_document->>'source_sha256',p_document->>'status',p_document->>'note',p_document->'snapshot',p_actor,v_email)
 on conflict(month) do update set version=excluded.version,rate=excluded.rate,rate_origin=excluded.rate_origin,source_path=excluded.source_path,source_filename=excluded.source_filename,source_sha256=excluded.source_sha256,status=excluded.status,note=excluded.note,snapshot=excluded.snapshot,updated_at=now(),updated_by=excluded.updated_by,updated_by_email=excluded.updated_by_email
 returning * into v_result;
 insert into public.efa_settlement_versions(month,version,rate,rate_origin,source_path,source_filename,source_sha256,status,note,snapshot,created_by,created_by_email)
 values(v_result.month,v_result.version,v_result.rate,v_result.rate_origin,v_result.source_path,v_result.source_filename,v_result.source_sha256,v_result.status,v_result.note,v_result.snapshot,p_actor,v_email);
 return to_jsonb(v_result);
end; $$;
revoke all on function public.efa_save_settlement(uuid,date,integer,jsonb) from public,anon,authenticated;
grant execute on function public.efa_save_settlement(uuid,date,integer,jsonb) to service_role;

create or replace function public.efa_manage_member(p_actor uuid,p_user uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_email text;
begin
 if not exists(select 1 from public.efa_members where user_id=p_actor and active and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 if p_actor=p_user then raise exception 'Cannot change your own access'; end if;
 if p_action='approve' then
  select email into v_email from public.efa_access_requests where user_id=p_user;
  if v_email is null then raise exception 'Request missing'; end if;
  insert into public.efa_members(user_id,email,role) values(p_user,v_email,'editor') on conflict(user_id) do update set active=true;
  delete from public.efa_access_requests where user_id=p_user;
 elsif p_action='disable' then update public.efa_members set active=false where user_id=p_user and role<>'admin';
 elsif p_action='enable' then update public.efa_members set active=true where user_id=p_user and role<>'admin';
 else raise exception 'Unknown action'; end if;
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.efa_manage_member(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.efa_manage_member(uuid,uuid,text) to service_role;

create or replace function public.efa_add_member(p_actor uuid,p_user uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.efa_members where user_id=p_actor and active and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 if p_actor=p_user or exists(select 1 from public.efa_allowed_emails where email=lower(p_email) and role='admin') then raise exception 'Protected administrator account'; end if;
 if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(p_email)) then raise exception 'Identity mismatch'; end if;
 insert into public.efa_members(user_id,email,role) values(p_user,lower(p_email),'editor');
end; $$;
revoke all on function public.efa_add_member(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.efa_add_member(uuid,uuid,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('efa-billing-raw','efa-billing-raw',false,20971520,array['text/csv','application/csv','text/plain','application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy efa_raw_read on storage.objects for select to authenticated using(bucket_id='efa-billing-raw' and efa_private.is_member());
create policy efa_raw_insert on storage.objects for insert to authenticated with check(bucket_id='efa-billing-raw' and efa_private.is_member() and name ~ '^uploads/[0-9]{4}-(0[1-9]|1[0-2])/[0-9a-f-]{36}\.csv$');
-- No update/delete policy: saved source files and historical versions are immutable.
commit;
