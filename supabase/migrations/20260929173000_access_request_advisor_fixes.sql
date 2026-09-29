-- Mantém a fila privada e adiciona os índices recomendados pelos advisors.

create policy access_requests_client_deny
on public.access_requests for all to authenticated
using (false) with check (false);

create index access_requests_reviewed_by_idx
  on public.access_requests (reviewed_by) where reviewed_by is not null;
create index access_requests_auth_user_id_idx
  on public.access_requests (auth_user_id) where auth_user_id is not null;
