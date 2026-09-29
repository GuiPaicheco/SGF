-- Disponibiliza o calendário institucional ao simulador público.

drop policy if exists "calendar_read" on public.calendar_events;
create policy "calendar_read"
on public.calendar_events
for select
to anon, authenticated
using (active);

grant select on public.calendar_events to anon, authenticated;

insert into public.calendar_events(event_date, type, name, active)
values
  ('2026-09-07', 'feriado', 'Independência do Brasil', true),
  ('2026-10-12', 'feriado', 'Nossa Senhora Aparecida', true),
  ('2026-10-30', 'ponto_facultativo', 'Dia do Servidor Público', true),
  ('2026-11-02', 'feriado', 'Finados', true),
  ('2026-11-15', 'feriado', 'Proclamação da República', true),
  ('2026-11-20', 'feriado', 'Dia da Consciência Negra', true),
  ('2026-12-24', 'ponto_facultativo', 'Véspera de Natal', true),
  ('2026-12-25', 'feriado', 'Natal', true),
  ('2026-12-31', 'ponto_facultativo', 'Véspera de Ano-Novo', true)
on conflict (event_date, type) do update
set name = excluded.name,
    active = excluded.active;
