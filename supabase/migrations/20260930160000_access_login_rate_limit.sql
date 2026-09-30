-- Limitação atômica para impedir rajadas e tentativas concorrentes no acesso.
create index if not exists submission_attempts_attempted_at_idx
  on public.submission_attempts(attempted_at);

create or replace function public.begin_access_attempt(
  target_key text,
  target_window_seconds integer,
  target_max_failures integer,
  target_cooldown_seconds integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  last_attempt timestamptz;
  oldest_failure timestamptz;
  failure_count integer;
  retry_seconds integer;
  result_id bigint;
begin
  if nullif(target_key, '') is null
    or target_window_seconds not between 1 and 86400
    or target_max_failures not between 1 and 1000
    or target_cooldown_seconds not between 0 and 3600 then
    raise exception using message='RATE_LIMIT_CONFIGURATION_INVALID', errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_key, 0));

  select max(attempted_at) into last_attempt
  from public.submission_attempts where ip_hash=target_key;

  if last_attempt is not null and last_attempt > clock_timestamp() - make_interval(secs => target_cooldown_seconds) then
    retry_seconds := greatest(1, ceil(extract(epoch from (last_attempt + make_interval(secs => target_cooldown_seconds) - clock_timestamp())))::integer);
    return jsonb_build_object('allowed',false,'retry_after',retry_seconds,'reason','cooldown');
  end if;

  select count(*), min(attempted_at) into failure_count, oldest_failure
  from public.submission_attempts
  where ip_hash=target_key and not accepted
    and attempted_at >= clock_timestamp() - make_interval(secs => target_window_seconds);

  if failure_count >= target_max_failures then
    retry_seconds := greatest(1, ceil(extract(epoch from (oldest_failure + make_interval(secs => target_window_seconds) - clock_timestamp())))::integer);
    return jsonb_build_object('allowed',false,'retry_after',retry_seconds,'reason','failures');
  end if;

  insert into public.submission_attempts(ip_hash,accepted)
  values(target_key,false) returning id into result_id;
  return jsonb_build_object('allowed',true,'attempt_id',result_id,'retry_after',0);
end $$;

revoke all on function public.begin_access_attempt(text,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.begin_access_attempt(text,integer,integer,integer)
  to service_role;

comment on function public.begin_access_attempt(text,integer,integer,integer) is
  'Registra tentativas sob advisory lock e devolve o tempo de espera quando o limite for atingido.';
