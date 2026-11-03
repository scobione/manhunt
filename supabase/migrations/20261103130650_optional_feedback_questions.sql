begin;
-- Individual omissions never disqualify an explicitly submitted response.
-- Preserve earlier questionnaire/answer snapshots; only future offers use vNext.
do $$ declare cfg public.feedback_settings; questions jsonb; begin
 select * into cfg from public.feedback_settings where id=1 for update;
 select jsonb_agg(jsonb_set(q,'{required}','false'::jsonb) order by n) into questions
 from public.feedback_questionnaires v cross join lateral jsonb_array_elements(v.questions) with ordinality t(q,n) where v.version=cfg.version;
 perform public.configure_feedback(cfg.version,questions);
 update public.badge_definitions set definition=jsonb_set(definition,'{description}',to_jsonb('Sende Feedback ab. Einzelne Fragen dürfen übersprungen werden; jede Bewertung zählt gleichermaßen.'::text)),updated_at=now() where id='beta-tester';
end $$;
commit;
