do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
 request_id uuid:='f6000000-0000-0000-0000-000000000800';result jsonb;entry uuid;bond uuid;person uuid;before_people integer;
 values_json jsonb:='{"fullName":"PESSOA MANUAL FICTÍCIA","registration":"MANUAL-FIXTURE-001","municipalPosition":"CARGO FICTÍCIO","weeklyHours":32.5,"admissionDate":"2020-01-01","employmentType":"estatutario","teamLabel":"EQUIPE FICTÍCIA"}';
begin
 select count(*) into before_people from public.servidores;
 result:=public.create_manual_registry_entry(actor,unit_id,request_id,'123456',values_json,'Alternativa manual fictícia');entry:=(result->>'id')::uuid;
 if result->>'status'<>'created' then raise exception 'MANUAL_CREATE_FAILED';end if;
 result:=public.create_manual_registry_entry(actor,unit_id,request_id,'123456',values_json,'Alternativa manual fictícia');
 if result->>'status'<>'already_created' or (result->>'id')::uuid<>entry then raise exception 'MANUAL_REPLAY_FAILED';end if;
 if (select source_data ? 'cns' or source_data ? 'principalCns' or source_data->>'origin'<>'manual' from private.cnes_registry_entries where id=entry) then raise exception 'FAKE_SOURCE_IDENTITY';end if;
 if (select count(*) from public.servidores)<>before_people then raise exception 'AUTOMATIC_PERSON';end if;
 begin perform public.create_manual_registry_entry(actor,unit_id,gen_random_uuid(),'123456',values_json,'Outra tentativa');raise exception 'DUPLICATE_ACCEPTED';
 exception when others then if sqlerrm<>'CNES_MANUAL_DUPLICATE' then raise;end if;end;
 begin perform public.create_manual_registry_entry(actor,unit_id,request_id,'123457',values_json,'Alteração');raise exception 'REPLAY_CHANGED';
 exception when others then if sqlerrm<>'CNES_VERSION_CONFLICT' then raise;end if;end;
 begin perform public.rh_bind_registry_bond(actor,entry,1,null,0,true,'Conferência fictícia');raise exception 'UNREVIEWED_BOUND';
 exception when others then if sqlerrm<>'RH_ENTRY_REVIEW_REQUIRED' then raise;end if;end;
 perform public.review_cnes_registry_entry(actor,entry,1,values_json,null);
 result:=public.rh_bind_registry_bond(actor,entry,2,null,0,true,'Polo conferido no ensaio');bond:=(result->>'bond_id')::uuid;
 select servidor_id into person from public.employment_bonds where id=bond;
 if (select cpf is not null or profile_id is not null from public.servidores where id=person) then raise exception 'FAKE_AUTH_CREATED';end if;
 if (select count(*) from public.servidores)<>before_people+1 then raise exception 'PERSON_COUNT';end if;
 if not exists(select 1 from public.audit_events where entity_id=entry and action='manual_registry_created' and actor_id=actor) then raise exception 'MISSING_AUDIT';end if;
 perform set_config('request.headers',jsonb_build_object('x-sgf-role','rh','x-sgf-actor',actor)::text,true);
 begin perform public.create_manual_registry_entry(actor,unit_id,gen_random_uuid(),'123456',values_json,'Tentativa RH');raise exception 'RH_ALLOWED';
 exception when others then if sqlerrm<>'CNES_ADMIN_REQUIRED' then raise;end if;end;
 perform set_config('request.headers',jsonb_build_object('x-sgf-role','administrador','x-sgf-actor',actor)::text,true);
end $$;
