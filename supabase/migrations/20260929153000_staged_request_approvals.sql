-- Torna as decisões da chefia e do RH explícitas e atômicas.

insert into public.request_approvals(request_id, stage)
select request.id, stage.value
from public.vacation_requests request
cross join (values ('chefia_imediata'::public.approval_stage), ('rh'::public.approval_stage)) as stage(value)
on conflict (request_id, stage) do nothing;

update public.request_approvals approval
set decision = 'aprovada',
    notes = coalesce(approval.notes, 'Etapa conciliada a partir da situação anterior da solicitação.'),
    decided_at = coalesce(approval.decided_at, request.updated_at)
from public.vacation_requests request
where approval.request_id = request.id and approval.decision = 'pendente'
  and ((approval.stage = 'chefia_imediata' and request.status in ('em_analise','aprovada','programada','reprogramada','concluida'))
    or (approval.stage = 'rh' and request.status in ('aprovada','programada','reprogramada','concluida')));

create or replace function public.decide_request_approval(
  target_request_id uuid,
  target_stage public.approval_stage,
  target_decision public.approval_decision,
  target_notes text default null
)
returns public.request_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role public.app_role := private.current_app_role();
  request_row public.vacation_requests%rowtype;
  next_status public.request_status;
begin
  if target_decision not in ('aprovada','rejeitada') then raise exception using message = 'DECISION_NOT_ALLOWED', errcode = 'P0001'; end if;
  if target_decision = 'rejeitada' and nullif(btrim(target_notes), '') is null then raise exception using message = 'REJECTION_REASON_REQUIRED', errcode = 'P0001'; end if;
  if actor_role = 'diretor' and target_stage <> 'chefia_imediata' then raise exception using message = 'STAGE_NOT_ALLOWED', errcode = 'P0001';
  elsif actor_role = 'rh' and target_stage <> 'rh' then raise exception using message = 'STAGE_NOT_ALLOWED', errcode = 'P0001';
  elsif actor_role not in ('diretor','rh','administrador') then raise exception using message = 'ROLE_NOT_ALLOWED', errcode = 'P0001'; end if;

  select request.* into request_row from public.vacation_requests request
  where request.id = target_request_id and private.can_manage_servidor(request.servidor_id)
  for update;
  if not found then raise exception using message = 'REQUEST_NOT_FOUND', errcode = 'P0001'; end if;
  if request_row.status not in ('enviada','em_analise') then raise exception using message = 'REQUEST_ALREADY_DECIDED', errcode = 'P0001'; end if;
  if target_stage = 'rh' and not exists (
    select 1 from public.request_approvals approval where approval.request_id = target_request_id
      and approval.stage = 'chefia_imediata' and approval.decision = 'aprovada'
  ) then raise exception using message = 'MANAGER_APPROVAL_REQUIRED', errcode = 'P0001'; end if;

  update public.request_approvals
  set decision = target_decision, decided_by = (select auth.uid()), notes = nullif(btrim(target_notes), ''), decided_at = now()
  where request_id = target_request_id and stage = target_stage and decision = 'pendente';
  if not found then raise exception using message = 'STAGE_ALREADY_DECIDED', errcode = 'P0001'; end if;

  next_status := case when target_decision = 'rejeitada' then 'rejeitada'::public.request_status
    when target_stage = 'chefia_imediata' then 'em_analise'::public.request_status else 'aprovada'::public.request_status end;
  update public.vacation_requests set status = next_status where id = target_request_id;
  return next_status;
end
$$;

revoke all on function public.decide_request_approval(uuid, public.approval_stage, public.approval_decision, text) from public, anon;
grant execute on function public.decide_request_approval(uuid, public.approval_stage, public.approval_decision, text) to authenticated;
comment on function public.decide_request_approval(uuid, public.approval_stage, public.approval_decision, text) is
  'Registra a decisão da etapa autorizada e atualiza a situação geral atomicamente.';
