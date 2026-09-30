-- Indices para os relacionamentos consultados e removidos na escala minima.
create index if not exists minimum_scale_assignments_servidor_idx
  on public.minimum_scale_assignments(servidor_id);
create index if not exists minimum_scale_assignments_created_by_idx
  on public.minimum_scale_assignments(created_by) where created_by is not null;
