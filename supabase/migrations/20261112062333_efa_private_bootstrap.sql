begin;
alter table public.efa_allowed_emails set schema efa_private;
create or replace function efa_private.request_access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_email text; v_role text; v_member public.efa_members;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select lower(email) into v_email from auth.users where id=v_user and email_confirmed_at is not null;
 if v_email is null then raise exception 'Verified email required' using errcode='42501'; end if;
 select * into v_member from public.efa_members where user_id=v_user;
 if found then return jsonb_build_object('role',v_member.role,'active',v_member.active,'email',v_member.email); end if;
 select role into v_role from efa_private.efa_allowed_emails where email=v_email;
 if v_role is not null then
  insert into public.efa_members(user_id,email,role) values(v_user,v_email,v_role) on conflict(user_id) do nothing;
  delete from public.efa_access_requests where user_id=v_user;
  return jsonb_build_object('role',v_role,'active',true,'email',v_email);
 end if;
 insert into public.efa_access_requests(user_id,email) values(v_user,v_email) on conflict(user_id) do nothing;
 return jsonb_build_object('role','pending','active',false,'email',v_email);
end; $$;
revoke all on function efa_private.request_access() from public,anon;
grant execute on function efa_private.request_access() to authenticated;
create or replace function public.efa_request_access() returns jsonb language sql security invoker set search_path='' as $$
 select efa_private.request_access();
$$;
revoke all on function public.efa_request_access() from public,anon;
grant execute on function public.efa_request_access() to authenticated;
create or replace function public.efa_add_member(p_actor uuid,p_user uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.efa_members where user_id=p_actor and active and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 if p_actor=p_user or exists(select 1 from efa_private.efa_allowed_emails where email=lower(p_email) and role='admin') then raise exception 'Protected administrator account'; end if;
 if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(p_email)) then raise exception 'Identity mismatch'; end if;
 insert into public.efa_members(user_id,email,role) values(p_user,lower(p_email),'editor');
end; $$;
commit;
