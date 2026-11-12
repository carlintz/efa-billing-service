begin;
create table public.efa_settlement_artifacts (
 month date not null, version integer not null,
 path text not null unique, filename text not null, sha256 text not null,
 created_at timestamptz not null default now(),
 primary key(month,version),
 foreign key(month,version) references public.efa_settlement_versions(month,version)
);
alter table public.efa_settlement_artifacts enable row level security;
revoke all on public.efa_settlement_artifacts from anon,authenticated;
grant select on public.efa_settlement_artifacts to authenticated;
grant all on public.efa_settlement_artifacts to service_role;
create policy efa_artifacts_read on public.efa_settlement_artifacts for select to authenticated using(efa_private.is_member());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('efa-billing-excel','efa-billing-excel',false,52428800,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
create policy efa_excel_read on storage.objects for select to authenticated using(bucket_id='efa-billing-excel' and efa_private.is_member());
-- Only server-generated workbooks can be inserted. No browser write/update/delete policy.
commit;
