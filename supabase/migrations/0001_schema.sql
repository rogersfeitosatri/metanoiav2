-- Metanóia — schema completo (seção 26).
-- Requer extensão pgcrypto para gen_random_uuid().
create extension if not exists pgcrypto;

-- ========== Enums ==========
create type role as enum ('user', 'professional', 'admin');
create type checkin_status as enum ('completed', 'partial', 'not_completed');
create type conversation_type as enum (
  'checkin_followup','immediate_help','prevention','onboarding','coping_card','open_chat','strategy_review'
);
create type risk_level as enum ('none','low','medium','high');
create type sender_type as enum ('user','assistant','system','professional');
create type trial_result as enum ('helped','partially_helped','did_not_help','not_tested','situation_not_occurred');
create type risk_status as enum ('open','viewed','in_followup','resolved','false_positive');
create type severity as enum ('low','medium','high');

-- ========== profiles ==========
create table profiles (
  id uuid primary key default gen_random_uuid(),
  role role not null default 'user',
  full_name text not null,
  preferred_name text not null,
  avatar_url text,
  email text unique not null,
  phone text,
  timezone text not null default 'America/Sao_Paulo',
  professional_id uuid,
  onboarding_completed boolean not null default false,
  terms_version text,
  terms_accepted_at timestamptz,
  privacy_version text,
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== professionals ==========
create table professionals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  profession text not null check (profession in ('nutricionista','psicologo')),
  registration_number text not null,
  organization_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles
  add constraint profiles_professional_fk
  foreign key (professional_id) references professionals(id) on delete set null;

-- ========== professional_user_links ==========
create table professional_user_links (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active boolean not null default true
);
create index idx_links_professional on professional_user_links(professional_id) where active;
create index idx_links_user on professional_user_links(user_id) where active;

-- ========== behavioral_goals ==========
create table behavioral_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  goal_type text not null,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_goals_user on behavioral_goals(user_id);

-- ========== coping_cards ==========
create table coping_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  desired_identity text,
  main_goal text,
  why_it_matters text,
  future_difference text,
  cost_of_no_change text,
  sabotaging_thoughts text[],
  reminder_statement text,
  personal_commitment text,
  completed_percentage int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- ========== meal_checkins ==========
create table meal_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  meal_type text,
  custom_meal_name text,
  status checkin_status not null,
  occurred_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);
create index idx_checkins_user_time on meal_checkins(user_id, occurred_at desc);

-- ========== conversations ==========
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  professional_id uuid references professionals(id) on delete set null,
  type conversation_type not null,
  status text not null default 'open' check (status in ('open','closed')),
  title text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  risk_level risk_level not null default 'none',
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_conv_user on conversations(user_id, started_at desc);

-- ========== conversation_messages ==========
create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type sender_type not null,
  content text not null,
  structured_content jsonb,
  model_name text,
  prompt_version text,
  quick_replies text[],
  created_at timestamptz not null default now()
);
create index idx_msg_conv on conversation_messages(conversation_id, created_at);

-- ========== difficulty_events ==========
create table difficulty_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  checkin_id uuid references meal_checkins(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  occurred_at timestamptz not null default now(),
  primary_reason text,
  reasons text[] not null default '{}',
  context text,
  hunger_intensity int,
  urge_intensity int,
  emotional_intensity int,
  created_at timestamptz not null default now()
);
create index idx_diff_user_time on difficulty_events(user_id, occurred_at desc);

-- ========== thought_records ==========
create table thought_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  difficulty_event_id uuid not null references difficulty_events(id) on delete cascade,
  situation text,
  automatic_thought text,
  emotions text[] not null default '{}',
  behavior text,
  consequences text,
  decision_point text,
  alternative_thought text,
  created_at timestamptz not null default now()
);
create index idx_thoughts_user on thought_records(user_id);

-- ========== strategies ==========
create table strategies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null,
  instructions text not null default '',
  source_type text not null default 'global',
  professional_id uuid references professionals(id) on delete set null,
  global boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== strategy_trials ==========
create table strategy_trials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  strategy_id uuid,
  difficulty_event_id uuid references difficulty_events(id) on delete set null,
  planned_for timestamptz,
  tested_at timestamptz,
  result trial_result not null default 'not_tested',
  user_feedback text,
  title_snapshot text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_trials_user on strategy_trials(user_id, created_at desc);

-- ========== pattern_snapshots ==========
create table pattern_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  pattern_type text not null,
  pattern_data jsonb not null,
  confidence real not null default 0,
  generated_at timestamptz not null default now()
);

-- ========== consistency_scores ==========
create table consistency_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  internal_score int not null,
  trend text not null,
  components jsonb not null,
  generated_at timestamptz not null default now()
);

-- ========== weekly_reports ==========
create table weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  professional_id uuid references professionals(id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  report_data jsonb not null,
  user_summary text not null,
  professional_summary text not null,
  generated_at timestamptz not null default now()
);

-- ========== risk_flags ==========
create table risk_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  message_id uuid references conversation_messages(id) on delete set null,
  category text not null,
  severity severity not null,
  evidence text not null,
  status risk_status not null default 'open',
  reviewed_by uuid references professionals(id) on delete set null,
  reviewed_at timestamptz,
  professional_note text,
  created_at timestamptz not null default now()
);
create index idx_risk_user on risk_flags(user_id, created_at desc);
create index idx_risk_status on risk_flags(status);

-- ========== professional_notes ==========
create table professional_notes (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== notification_preferences ==========
create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  enabled boolean not null default true,
  allowed_days int[] not null default '{0,1,2,3,4,5,6}',
  allowed_start_time time not null default '08:00',
  allowed_end_time time not null default '21:00',
  maximum_daily_notifications int not null default 2,
  preventive_enabled boolean not null default true,
  checkin_enabled boolean not null default true,
  support_times text[] not null default '{}',
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- ========== scheduled_interventions ==========
create table scheduled_interventions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  intervention_type text not null,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled',
  rule_source text not null,
  payload jsonb not null default '{}',
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_sched_due on scheduled_interventions(scheduled_for) where status = 'scheduled';

-- ========== legal_documents ==========
create table legal_documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('terms','privacy')),
  version text not null,
  content text not null,
  active_from timestamptz not null default now(),
  active boolean not null default true
);

-- ========== legal_acceptances ==========
create table legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  document_id uuid not null references legal_documents(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

-- ========== audit_logs ==========
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_audit_actor on audit_logs(actor_id, created_at desc);
