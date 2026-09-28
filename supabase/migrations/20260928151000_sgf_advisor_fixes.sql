create index if not exists profile_scopes_lotacao_id_idx on public.profile_scopes(lotacao_id);
create index if not exists request_approvals_decided_by_idx on public.request_approvals(decided_by);
create index if not exists request_status_history_actor_id_idx on public.request_status_history(actor_id);
create index if not exists time_bank_accounts_updated_by_idx on public.time_bank_accounts(updated_by);
create index if not exists time_bank_entries_created_by_idx on public.time_bank_entries(created_by);
create index if not exists time_bank_entries_request_id_idx on public.time_bank_entries(request_id);
create index if not exists vacation_requests_created_by_idx on public.vacation_requests(created_by);

drop policy if exists "approvals_manage_staff" on public.request_approvals;
create policy "approvals_insert_staff" on public.request_approvals for insert to authenticated
with check (exists (
  select 1 from public.vacation_requests r
  where r.id = request_id and private.can_manage_servidor(r.servidor_id)
));
create policy "approvals_update_staff" on public.request_approvals for update to authenticated
using (exists (
  select 1 from public.vacation_requests r
  where r.id = request_id and private.can_manage_servidor(r.servidor_id)
)) with check (exists (
  select 1 from public.vacation_requests r
  where r.id = request_id and private.can_manage_servidor(r.servidor_id)
));
create policy "approvals_delete_staff" on public.request_approvals for delete to authenticated
using (exists (
  select 1 from public.vacation_requests r
  where r.id = request_id and private.can_manage_servidor(r.servidor_id)
));

drop policy if exists "time_accounts_staff_manage" on public.time_bank_accounts;
create policy "time_accounts_insert_staff" on public.time_bank_accounts for insert to authenticated
with check (private.can_manage_servidor(servidor_id));
create policy "time_accounts_update_staff" on public.time_bank_accounts for update to authenticated
using (private.can_manage_servidor(servidor_id)) with check (private.can_manage_servidor(servidor_id));
create policy "time_accounts_delete_staff" on public.time_bank_accounts for delete to authenticated
using (private.can_manage_servidor(servidor_id));

drop policy if exists "time_entries_own_declare" on public.time_bank_entries;
drop policy if exists "time_entries_staff_manage" on public.time_bank_entries;
create policy "time_entries_insert_scoped" on public.time_bank_entries for insert to authenticated
with check (
  (
    validated = false and created_by = (select auth.uid())
    and exists (
      select 1 from public.servidores s
      where s.id = servidor_id and s.profile_id = (select auth.uid())
    )
  ) or private.can_manage_servidor(servidor_id)
);
create policy "time_entries_update_staff" on public.time_bank_entries for update to authenticated
using (private.can_manage_servidor(servidor_id)) with check (private.can_manage_servidor(servidor_id));
create policy "time_entries_delete_staff" on public.time_bank_entries for delete to authenticated
using (private.can_manage_servidor(servidor_id));
