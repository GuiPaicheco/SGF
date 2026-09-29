-- Impede ciclos diretos ou indiretos na hierarquia de lotações.

create or replace function private.guard_location_hierarchy()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception using message='LOCATION_HIERARCHY_CYCLE',errcode='23514'; end if;
  if exists (
    with recursive ancestors(id,parent_id) as (
      select id,parent_id from public.lotacoes where id=new.parent_id
      union all
      select location.id,location.parent_id from public.lotacoes location
      join ancestors on location.id=ancestors.parent_id
    ) select 1 from ancestors where id=new.id
  ) then raise exception using message='LOCATION_HIERARCHY_CYCLE',errcode='23514'; end if;
  return new;
end $$;

revoke all on function private.guard_location_hierarchy() from public,anon,authenticated;
drop trigger if exists guard_location_hierarchy on public.lotacoes;
create trigger guard_location_hierarchy before insert or update of parent_id on public.lotacoes
for each row execute function private.guard_location_hierarchy();
