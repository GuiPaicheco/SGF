-- Índices de apoio às referências do histórico funcional.

create index employee_history_previous_lotacao_idx on public.employee_assignment_history(previous_lotacao_id) where previous_lotacao_id is not null;
create index employee_history_new_lotacao_idx on public.employee_assignment_history(new_lotacao_id) where new_lotacao_id is not null;
create index employee_history_previous_cargo_idx on public.employee_assignment_history(previous_cargo_id) where previous_cargo_id is not null;
create index employee_history_new_cargo_idx on public.employee_assignment_history(new_cargo_id) where new_cargo_id is not null;
create index employee_history_previous_funcao_idx on public.employee_assignment_history(previous_funcao_id) where previous_funcao_id is not null;
create index employee_history_new_funcao_idx on public.employee_assignment_history(new_funcao_id) where new_funcao_id is not null;
