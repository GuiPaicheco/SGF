-- Day-off de aniversário é um direito de calendário, não uma modalidade solicitável.
alter table public.vacation_requests
  add constraint vacation_requests_dayoff_not_requestable
  check (type <> 'dayoff_aniversario'::public.vacation_type);
