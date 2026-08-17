-- Exclusao definitiva: remover o Auth user apaga o perfil e todos os dados vinculados.

alter table profiles
  add constraint profiles_auth_user_fk
  foreign key (id) references auth.users(id) on delete cascade;

create or replace function private.purge_patient_audit_logs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'user' then
    delete from public.audit_logs
    where actor_id = old.id
       or resource_id = old.id
       or metadata ->> 'user_id' = old.id::text;
  end if;
  return old;
end;
$$;

revoke all on function private.purge_patient_audit_logs() from public, anon, authenticated;

create trigger purge_patient_audit_logs_before_delete
before delete on profiles
for each row execute function private.purge_patient_audit_logs();
