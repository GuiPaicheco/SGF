create index if not exists profiles_primary_lotacao_id_idx
  on public.profiles(primary_lotacao_id);

create index if not exists request_archives_request_id_idx
  on public.request_archives(request_id);
