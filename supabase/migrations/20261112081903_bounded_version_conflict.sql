begin;
-- A stale application revision is a terminal conflict, not a retryable serialization failure.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.efa_save_settlement(uuid,date,integer,jsonb)'::regprocedure) into definition;
 if position('errcode=''40001''' in definition)=0 then raise exception 'Expected version conflict definition missing'; end if;
 execute replace(definition,'errcode=''40001''','errcode=''PT409''');
end $$;
commit;
