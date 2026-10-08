-- Ser titular não amplia a visão de gestão quando o perfil ativo é RH/Diretor.
alter policy request_unit_reviews_read_scoped on public.request_unit_reviews using (
  private.account_active() and exists(select 1 from public.vacation_requests request
    where request.id=request_unit_reviews.request_id and (
      (private.actor_role((select auth.uid()))='servidor' and exists(select 1 from public.servidores employee
        where employee.id=request.servidor_id and employee.profile_id=(select auth.uid())))
      or (private.can_manage_servidor(request.servidor_id) and (
        private.actor_role((select auth.uid()))='administrador'
        or (request_unit_reviews.cnes_unit_id=private.current_context_cnes()
          and request_unit_reviews.lotacao_id is not distinct from private.current_context_internal_lotacao()))))));
alter policy request_day_responsibilities_read_scoped on public.request_day_responsibilities using (
  private.account_active() and exists(select 1 from public.vacation_requests request
    where request.id=request_day_responsibilities.request_id and (
      (private.actor_role((select auth.uid()))='servidor' and exists(select 1 from public.servidores employee
        where employee.id=request.servidor_id and employee.profile_id=(select auth.uid())))
      or (private.can_manage_servidor(request.servidor_id) and (
        private.actor_role((select auth.uid()))='administrador'
        or (request_day_responsibilities.cnes_unit_id=private.current_context_cnes()
          and request_day_responsibilities.lotacao_id is not distinct from private.current_context_internal_lotacao()))))));
