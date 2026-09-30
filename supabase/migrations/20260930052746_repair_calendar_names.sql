-- Corrige nomes da carga inicial que foram gravados com UTF-8 interpretado como Latin-1.
update public.calendar_events set name='Independência do Brasil' where event_date='2026-09-07' and name='IndependÃªncia do Brasil';
update public.calendar_events set name='Dia do Servidor Público' where event_date='2026-10-30' and name='Dia do Servidor PÃºblico';
update public.calendar_events set name='Proclamação da República' where event_date='2026-11-15' and name='ProclamaÃ§Ã£o da RepÃºblica';
update public.calendar_events set name='Dia da Consciência Negra' where event_date='2026-11-20' and name='Dia da ConsciÃªncia Negra';
update public.calendar_events set name='Véspera de Natal' where event_date='2026-12-24' and name='VÃ©spera de Natal';
update public.calendar_events set name='Véspera de Ano-Novo' where event_date='2026-12-31' and name='VÃ©spera de Ano-Novo';
