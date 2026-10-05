-- Transaction-only synthetic fixtures; no patient data or real push subscriptions.
begin;
do $$
declare u uuid=gen_random_uuid(); other_user uuid=gen_random_uuid(); m uuid; i uuid; e uuid; e2 uuid;
  p public.notification_preferences; meal public.meal_schedules; row public.scheduled_interventions;
begin
  insert into auth.users(id,email) values(u,'support-test-'||u||'@example.invalid');
  insert into public.profiles(id,email,full_name,preferred_name,onboarding_completed,access_enabled)
    values(u,'support-test-'||u||'@example.invalid','Synthetic support test','Test',true,true);
  insert into public.notification_preferences(user_id,push_enabled,allowed_start_time,allowed_end_time)
    values(u,true,'00:00','00:00') returning * into p;
  insert into public.meal_schedules(user_id,name,time_of_day,days_of_week,support_mode,reminder_enabled)
    values(u,'Synthetic meal','12:00','{0,1,2,3,4,5,6}','after',true) returning * into meal;
  m=meal.id;
  insert into public.scheduled_interventions(user_id,meal_schedule_id,intervention_type,rule_source,scheduled_for,expires_at,occurrence_key,payload)
    values(u,m,'meal_checkin','support_v1',now()-interval '1 minute',now()+interval '1 hour','test',
      jsonb_build_object('revision',meal.updated_at,'preferences_revision',p.updated_at,'local_date',(now() at time zone p.timezone)::date::text,'meal_name','Synthetic meal')) returning * into row;
  i=row.id;
  assert public.support_relevant(row),'relevance failed';
  assert not public.claim_support(i),'must not claim without a device';
  insert into public.push_subscriptions(user_id,endpoint,keys) values(u,'https://fcm.googleapis.com/test/'||u,'{}');
  assert public.claim_support(i),'first claim failed';
  assert not public.claim_support(i),'duplicate claim succeeded';
  begin
    perform public.open_support(i,other_user);
    raise exception 'Cross-owner open unexpectedly succeeded';
  exception when others then
    if sqlerrm='Cross-owner open unexpectedly succeeded' then raise; end if;
  end;
  e=public.open_support(i,u); e2=public.open_support(i,u);
  assert e=e2,'duplicate episode';
  assert (select count(*)=1 from public.behavioral_episodes where user_id=u),'duplicate episode rows';
  assert (select current_intent='meal_checkin' from public.behavioral_episodes where id=e),'wrong intent';
  update public.meal_schedules set time_of_day='15:00',updated_at=now()+interval '1 second' where id=m;
  assert (select time_of_day='15:00' from public.meal_schedules where id=m),'update trigger lost new row';
  assert (select status='cancelled' from public.scheduled_interventions where id=i),'schedule edit did not cancel';
  assert not has_function_privilege('authenticated','public.open_support(uuid,uuid)','execute'),'public open RPC';
  assert not has_function_privilege('anon','public.claim_support(uuid)','execute'),'public claim RPC';
  assert not has_table_privilege('authenticated','public.push_subscriptions','select'),'client can read push keys';
end $$;
rollback;
