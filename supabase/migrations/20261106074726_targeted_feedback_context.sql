begin;
-- A new active questionnaire affects future offers only. Existing question and
-- offer snapshots remain immutable. Keep custom catalogs and choices intact.
do $$
declare cfg public.feedback_settings; questions jsonb; revised jsonb:='[]'::jsonb;
 q jsonb; options jsonb; improvement_found boolean:=false; needs_fallback boolean:=false;
begin
 select * into cfg from public.feedback_settings where id=1 for update;
 select catalog.questions into questions from public.feedback_questionnaires catalog where catalog.version=cfg.version;
 for q in select value from jsonb_array_elements(questions) loop
  if q->>'id'='improve' and q->>'type'='choices' then
   improvement_found:=true;
   select jsonb_agg(v order by n) into options from (
    select v,min(n) as n from (
     select case when value='Standort' then 'GPS / Standort' else value end as v,ordinality as n
      from jsonb_array_elements_text(q->'options') with ordinality
     union all select 'GPS / Standort',1000
     union all select 'Fangen',1001
     union all select 'Verbindung',1002
    ) candidates group by v
   ) distinct_choices;
   if jsonb_array_length(options)<=12 then q:=jsonb_set(q,'{options}',options);
   else needs_fallback:=true; end if;
  end if;
  revised:=revised||jsonb_build_array(q);
 end loop;
 needs_fallback:=needs_fallback or not improvement_found;
 if needs_fallback and not exists(select 1 from jsonb_array_elements(revised) item
   where item->>'id'='technical_issues_b22' and item->>'type'='choices'
    and item->>'feature'='all' and item->>'required'='false'
    and item->'options' @> '["GPS / Standort","Karte","Fangen","Verbindung"]'::jsonb) then
  if jsonb_array_length(revised)<20 and not exists(select 1 from jsonb_array_elements(revised) item where item->>'id'='technical_issues_b22') then
   revised:=revised||jsonb_build_array('{"id":"technical_issues_b22","label":"Wo gab es technische Probleme?","type":"choices","required":false,"feature":"all","options":["GPS / Standort","Karte","Fangen","Verbindung"]}'::jsonb);
  else
   raise notice 'MANHUNT: custom feedback catalog is full or owns technical_issues_b22; no custom question or choice was removed. Review technical issue choices manually.';
  end if;
 end if;
 if revised is distinct from questions then perform public.configure_feedback(cfg.version,revised); end if;
end;
$$;
commit;
