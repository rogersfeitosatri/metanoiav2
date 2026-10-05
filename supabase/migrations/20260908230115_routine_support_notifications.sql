-- Optional support only. Existing patients are not opted into device notifications.
-- Version aligned with the migration already applied to the hosted project.
alter table public.meal_schedules
  add column support_mode text not null default 'none' check (support_mode in ('none','before','after')),
  add column support_offset_minutes int not null default 30 check (support_offset_minutes between 5 and 180);
alter table public.notification_preferences
  add column push_enabled boolean not null default false,
  add column followup_enabled boolean not null default true;
alter table public.scheduled_interventions
  add column occurrence_key text,
  add column expires_at timestamptz,
  add column episode_id uuid references public.behavioral_episodes(id) on delete set null,
  add column opened_at timestamptz,
  add column attempted_at timestamptz,
  add column last_error text;
create unique index support_occurrence_unique on public.scheduled_interventions(user_id,occurrence_key);
create index support_episode on public.scheduled_interventions(episode_id) where episode_id is not null;
create index support_attempts on public.scheduled_interventions(user_id,attempted_at) where attempted_at is not null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  enabled boolean not null default true,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index push_active_user on public.push_subscriptions(user_id,last_used_at desc) where enabled;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- Subscription endpoints/keys are never included in the client database snapshot.
grant all on public.push_subscriptions to service_role;

create function public.support_relevant(i public.scheduled_interventions) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare p public.notification_preferences; m public.meal_schedules;
begin
  select * into p from public.notification_preferences where user_id=i.user_id;
  if not found or not p.enabled or i.rule_source<>'support_v1' or i.status in ('responded','cancelled','expired')
     or i.expires_at is null or i.expires_at<=now()
     or (i.payload->>'preferences_revision')::timestamptz is distinct from p.updated_at then return false; end if;
  if not exists(select 1 from public.profiles where id=i.user_id and role='user' and access_enabled
    and onboarding_completed and (access_starts_at is null or access_starts_at<=now())
    and (access_ends_at is null or access_ends_at>now())) then return false; end if;
  if i.intervention_type='strategy_followup' then
    return p.followup_enabled and exists(select 1 from public.strategy_trials t
      where t.id::text=i.payload->>'strategy_trial_id' and t.user_id=i.user_id
      and t.result in ('not_tested','situation_not_occurred'));
  end if;
  select * into m from public.meal_schedules where id=i.meal_schedule_id and user_id=i.user_id;
  if not found or not m.active or not m.reminder_enabled or m.support_mode='none'
    or (i.payload->>'revision')::timestamptz is distinct from m.updated_at then return false; end if;
  if i.intervention_type='preventive' and (not p.preventive_enabled or m.support_mode<>'before') then return false; end if;
  if i.intervention_type='meal_checkin' and (not p.checkin_enabled or m.support_mode<>'after') then return false; end if;
  return not exists(select 1 from public.meal_checkins c where c.user_id=i.user_id and c.schedule_id=m.id
    and (c.occurred_at at time zone p.timezone)::date::text=i.payload->>'local_date');
end $$;

-- One reservation per user across concurrent cron workers; at-most-once external attempt.
create function public.claim_support(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare i public.scheduled_interventions; p public.notification_preferences; local_now timestamp;
begin
  select * into i from public.scheduled_interventions where id=p_id;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(i.user_id::text,19));
  select * into i from public.scheduled_interventions where id=p_id for update;
  select * into p from public.notification_preferences where user_id=i.user_id for share;
  if not found or not p.push_enabled or i.status<>'scheduled' or i.attempted_at is not null
    or i.opened_at is not null or i.scheduled_for>now() or not public.support_relevant(i) then return false; end if;
  local_now=now() at time zone p.timezone;
  if not extract(dow from local_now)::int=any(p.allowed_days) then return false; end if;
  if p.allowed_start_time<p.allowed_end_time then
    if local_now::time<p.allowed_start_time or local_now::time>=p.allowed_end_time then return false; end if;
  elsif p.allowed_start_time>p.allowed_end_time then
    if local_now::time<p.allowed_start_time and local_now::time>=p.allowed_end_time then return false; end if;
  end if;
  if exists(select 1 from public.behavioral_episodes where user_id=i.user_id and status='active' and updated_at>now()-interval '15 minutes') then return false; end if;
  if not exists(select 1 from public.push_subscriptions where user_id=i.user_id and enabled) then return false; end if;
  if exists(select 1 from public.scheduled_interventions where user_id=i.user_id and attempted_at>now()-interval '90 minutes') then return false; end if;
  if (select count(*) from public.scheduled_interventions where user_id=i.user_id
    and (attempted_at at time zone p.timezone)::date=local_now::date)>=least(p.maximum_daily_notifications,4) then return false; end if;
  update public.scheduled_interventions set status='sending',attempted_at=now() where id=p_id;
  return true;
end $$;

create function public.open_support(p_id uuid,p_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.scheduled_interventions; c uuid; e uuid; intent text; kind text;
begin
  select * into i from public.scheduled_interventions where id=p_id and user_id=p_user for update;
  if not found then raise exception 'Invitation not found'; end if;
  if i.episode_id is not null then return i.episode_id; end if;
  if not public.support_relevant(i) then raise exception 'Invitation no longer available'; end if;
  intent=case i.intervention_type when 'preventive' then 'prepare' when 'strategy_followup' then 'review_strategy' else 'meal_checkin' end;
  kind=case intent when 'prepare' then 'preparation' when 'review_strategy' then 'strategy_review' else 'meal_checkin' end;
  insert into public.conversations(user_id,type,title) values(p_user,'open_chat','Conversa') returning id into c;
  insert into public.behavioral_episodes(user_id,conversation_id,episode_type,entry_intent,current_intent,
    event_occurred_at,event_time_description,event_time_precision)
    values(p_user,c,kind,intent,intent,null,'Convite de apoio: horario escolhido, acontecimento ainda nao confirmado','unknown') returning id into e;
  update public.scheduled_interventions set episode_id=e,opened_at=now() where id=p_id;
  return e;
end $$;

revoke all on function public.support_relevant(public.scheduled_interventions) from public,anon,authenticated;
revoke all on function public.claim_support(uuid) from public,anon,authenticated;
revoke all on function public.open_support(uuid,uuid) from public,anon,authenticated;
grant execute on function public.support_relevant(public.scheduled_interventions),public.claim_support(uuid),public.open_support(uuid,uuid) to service_role;

create function public.invalidate_support_schedule() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='meal_schedules' then
    update public.scheduled_interventions set status='cancelled' where meal_schedule_id=old.id
      and rule_source='support_v1' and status in ('scheduled','sent','sending','failed');
  else
    update public.scheduled_interventions set status='cancelled' where user_id=old.user_id
      and rule_source='support_v1' and status in ('scheduled','sent','sending','failed');
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger support_meal_changed before update or delete on public.meal_schedules for each row execute function public.invalidate_support_schedule();
create trigger support_preferences_changed before update on public.notification_preferences for each row execute function public.invalidate_support_schedule();
revoke all on function public.invalidate_support_schedule() from public,anon,authenticated;
