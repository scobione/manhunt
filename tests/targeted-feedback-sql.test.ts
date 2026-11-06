/** Execute real migrations in isolated PostgreSQL; no external service access. */
import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFile,readdir} from 'node:fs/promises';
const migration='20261106074726_targeted_feedback_context.sql';
it('FEED-ISSUES-SQL-01: new default choices use a fresh version, preserve old offers and remain optional',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
  await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
  for(const file of(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<migration).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const old=(await db.query<{version:number;questions:any[]}>(`select s.version,q.questions from public.feedback_settings s join public.feedback_questionnaires q on q.version=s.version where s.id=1`)).rows[0];
  const user='40000000-0000-4000-8000-000000000004',match='50000000-0000-4000-8000-000000000005';
  await db.query('insert into auth.users(id,email_confirmed_at,raw_user_meta_data) values($1,now(),$2)',[user,{username:'Feedback_Migration'}]);
  await db.query('insert into public.feature_match_events(match_id) values($1)',[match]);
  await db.query(`insert into public.feedback_offers(match_id,user_id,version,questions,modes) values($1,$2,$3,$4,array['normal'])`,[match,user,old.version,old.questions]);
  const sql=await readFile('supabase/migrations/'+migration,'utf8');await db.exec(sql);
  const next=(await db.query<{version:number;questions:any[]}>(`select s.version,q.questions from public.feedback_settings s join public.feedback_questionnaires q on q.version=s.version where s.id=1`)).rows[0];
  expect(Number(next.version)).toBeGreaterThan(Number(old.version));expect(next.questions.find(q=>q.id==='improve')?.options).toEqual(expect.arrayContaining(['GPS / Standort','Karte','Fangen','Verbindung']));expect(next.questions.every(q=>q.required===false)).toBe(true);
  expect((await db.query<any>('select version,questions from public.feedback_offers where user_id=$1',[user])).rows[0]).toEqual(old);
  expect((await db.query<any>('select questions from public.feedback_questionnaires where version=$1',[old.version])).rows[0].questions).toEqual(old.questions);
  await db.exec(sql);expect(Number((await db.query<any>('select version from public.feedback_settings where id=1')).rows[0].version)).toBe(Number(next.version));
  const customOptions=Array.from({length:12},(_,i)=>`Eigenes Thema ${i+1}`),custom=[...old.questions.filter(q=>['overall','recommend'].includes(q.id)),{id:'improve',label:'Welche eigenen Themen?',type:'choices',required:false,feature:'all',options:customOptions}];
  await db.query('select public.configure_feedback($1,$2)',[next.version,custom]);await db.exec(sql);
  const fallback=(await db.query<any>(`select s.version,q.questions from public.feedback_settings s join public.feedback_questionnaires q on q.version=s.version where s.id=1`)).rows[0];
  expect(fallback.questions.find((q:any)=>q.id==='improve').options).toEqual(customOptions);expect(fallback.questions.find((q:any)=>q.id==='technical_issues_b22')).toMatchObject({type:'choices',required:false,feature:'all',options:['GPS / Standort','Karte','Fangen','Verbindung']});
  await db.exec(sql);expect(Number((await db.query<any>('select version from public.feedback_settings where id=1')).rows[0].version)).toBe(Number(fallback.version));
  const full=[...custom,...Array.from({length:17},(_,i)=>({id:`custom_${i}`,label:`Eigene Frage Nummer ${i}`,type:'text',required:false,feature:'all'}))];expect(full).toHaveLength(20);
  const configured=(await db.query<any>('select public.configure_feedback($1,$2) as value',[fallback.version,full])).rows[0].value;
  await db.exec(sql);const preserved=(await db.query<any>(`select s.version,q.questions from public.feedback_settings s join public.feedback_questionnaires q on q.version=s.version where s.id=1`)).rows[0];
  expect(String(preserved.version)).toBe(configured.version);expect(preserved.questions).toEqual(full);
 }finally{await db.close();}
},30000);
