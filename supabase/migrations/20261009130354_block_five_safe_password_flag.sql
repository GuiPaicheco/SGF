create or replace function private.sanitize_audit_json(value jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb; k text; v jsonb;
begin
  if value is null then return null; end if;
  if jsonb_typeof(value)='object' then
    result:='{}';
    for k,v in select entries.key,entries.item from jsonb_each(value) as entries(key,item) loop
      if (k='must_change_password' and jsonb_typeof(v)='boolean') or k !~* 'password|senha|token|secret|api.?key|authorization|credential|cookie' then
        result:=result||jsonb_build_object(k,private.sanitize_audit_json(v));
      end if;
    end loop;
    return result;
  elsif jsonb_typeof(value)='array' then
    select coalesce(jsonb_agg(private.sanitize_audit_json(item)),'[]') into result from jsonb_array_elements(value) item;
    return result;
  elsif jsonb_typeof(value)='string' and value::text ~* 'Bearer[[:space:]]|sb_secret_|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.' then
    return to_jsonb('[credencial removida]'::text);
  end if;
  return value;
end $$;
