-- Inventário somente leitura, sem nomes/CPF/e-mail, sem inferência ou correção automática.
begin transaction isolation level repeatable read read only;
select jsonb_build_object(
 'requests', (select count(*) from public.vacation_requests),
 'legacy_requests', (select count(*) from public.vacation_requests where context_bond_id is null),
 'legacy_decisions', (select count(*) from public.request_approvals a join public.vacation_requests r on r.id=a.request_id where r.context_bond_id is null),
 'legacy_scale_days', (select count(*) from public.minimum_scale_days),
 'legacy_scale_assignments', (select count(*) from public.minimum_scale_assignments),
 'modern_without_distribution', (select count(*) from public.vacation_requests r where context_bond_id is not null and not exists(select 1 from public.request_day_responsibilities d where d.request_id=r.id)),
 'employees_without_bond', (select count(*) from public.servidores s where not exists(select 1 from public.employment_bonds b where b.servidor_id=s.id)),
 'notifications_without_context', (select count(*) from public.notifications where context_cnes_unit_id is null),
 'audit_without_context', (select count(*) from public.audit_events where context_cnes_unit_id is null)
) as inventory;
select r.id,r.protocol,r.status,
 case when r.context_bond_id is not null then 'contextual'
      when r.status in ('cancelada','rejeitada','concluida') then 'legacy_terminal_preserved'
      else 'legacy_active_requires_manual_review' end as classification,
 (select count(*) from public.request_periods p where p.request_id=r.id) as periods,
 (select count(*) from public.request_approvals a where a.request_id=r.id) as legacy_decisions,
 (select count(*) from public.request_unit_reviews v where v.request_id=r.id) as contextual_reviews
from public.vacation_requests r order by r.id;
commit;
