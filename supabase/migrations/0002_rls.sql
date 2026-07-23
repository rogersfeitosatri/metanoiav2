-- Metanóia — Row Level Security (seção 27).
-- Pressupõe Supabase Auth: auth.uid() = profiles.id.

-- Funções auxiliares -------------------------------------------------
create or replace function current_role_is(target role)
returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = target);
$$;

create or replace function is_admin() returns boolean language sql stable as $$
  select current_role_is('admin');
$$;

-- Retorna o professionals.id do usuário logado (se profissional).
create or replace function my_professional_id() returns uuid language sql stable as $$
  select p.id from professionals p where p.profile_id = auth.uid();
$$;

-- Verdadeiro se o usuário logado é o profissional vinculado (ativo) do user alvo.
create or replace function is_linked_professional(target_user uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from professional_user_links l
    where l.user_id = target_user
      and l.professional_id = my_professional_id()
      and l.active
  );
$$;

-- Habilita RLS ------------------------------------------------------
alter table profiles enable row level security;
alter table professionals enable row level security;
alter table professional_user_links enable row level security;
alter table behavioral_goals enable row level security;
alter table coping_cards enable row level security;
alter table meal_checkins enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table difficulty_events enable row level security;
alter table thought_records enable row level security;
alter table strategies enable row level security;
alter table strategy_trials enable row level security;
alter table pattern_snapshots enable row level security;
alter table consistency_scores enable row level security;
alter table weekly_reports enable row level security;
alter table risk_flags enable row level security;
alter table professional_notes enable row level security;
alter table notification_preferences enable row level security;
alter table scheduled_interventions enable row level security;
alter table legal_documents enable row level security;
alter table legal_acceptances enable row level security;
alter table audit_logs enable row level security;

-- profiles ----------------------------------------------------------
create policy profiles_self on profiles
  for select using (id = auth.uid() or is_admin() or is_linked_professional(id));
create policy profiles_self_update on profiles
  for update using (id = auth.uid() or is_admin());

-- professionals -----------------------------------------------------
create policy professionals_read on professionals
  for select using (profile_id = auth.uid() or is_admin());
create policy professionals_admin_write on professionals
  for all using (is_admin()) with check (is_admin());

-- links -------------------------------------------------------------
create policy links_read on professional_user_links
  for select using (
    user_id = auth.uid() or professional_id = my_professional_id() or is_admin()
  );
create policy links_admin_write on professional_user_links
  for all using (is_admin()) with check (is_admin());

-- Macro: dados do usuário legíveis pelo dono, pelo profissional vinculado e pelo admin.
-- (aplicado individualmente por tabela)

-- behavioral_goals
create policy goals_owner on behavioral_goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_pro on behavioral_goals
  for select using (is_linked_professional(user_id) or is_admin());

-- coping_cards
create policy card_owner on coping_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy card_pro on coping_cards
  for select using (is_linked_professional(user_id) or is_admin());

-- meal_checkins
create policy checkins_owner on meal_checkins
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy checkins_pro on meal_checkins
  for select using (is_linked_professional(user_id) or is_admin());

-- conversations
create policy conv_owner on conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy conv_pro on conversations
  for select using (is_linked_professional(user_id) or is_admin());

-- conversation_messages (via conversa)
create policy msg_owner on conversation_messages
  for all using (
    exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );
create policy msg_pro on conversation_messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = conversation_id and (is_linked_professional(c.user_id) or is_admin())
    )
  );

-- difficulty_events
create policy diff_owner on difficulty_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy diff_pro on difficulty_events
  for select using (is_linked_professional(user_id) or is_admin());

-- thought_records
create policy thought_owner on thought_records
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy thought_pro on thought_records
  for select using (is_linked_professional(user_id) or is_admin());

-- strategies: globais legíveis por todos; profissionais gerenciam as suas.
create policy strat_read on strategies
  for select using (global or professional_id = my_professional_id() or is_admin());
create policy strat_pro_write on strategies
  for all using (professional_id = my_professional_id() or is_admin())
  with check (professional_id = my_professional_id() or is_admin());

-- strategy_trials
create policy trials_owner on strategy_trials
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy trials_pro on strategy_trials
  for select using (is_linked_professional(user_id) or is_admin());

-- pattern_snapshots / consistency_scores / weekly_reports (leitura)
create policy patterns_owner on pattern_snapshots
  for select using (user_id = auth.uid() or is_linked_professional(user_id) or is_admin());
create policy scores_owner on consistency_scores
  for select using (user_id = auth.uid() or is_linked_professional(user_id) or is_admin());
create policy reports_owner on weekly_reports
  for select using (user_id = auth.uid() or is_linked_professional(user_id) or is_admin());

-- risk_flags: usuário NÃO altera; profissional vinculado lê e atualiza.
create policy risk_owner_read on risk_flags
  for select using (user_id = auth.uid() or is_linked_professional(user_id) or is_admin());
create policy risk_pro_update on risk_flags
  for update using (is_linked_professional(user_id) or is_admin())
  with check (is_linked_professional(user_id) or is_admin());

-- professional_notes: privadas ao profissional (usuário NUNCA acessa).
create policy notes_pro on professional_notes
  for all using (professional_id = my_professional_id() or is_admin())
  with check (professional_id = my_professional_id() or is_admin());

-- notification_preferences
create policy prefs_owner on notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- scheduled_interventions
create policy sched_owner on scheduled_interventions
  for select using (user_id = auth.uid() or is_linked_professional(user_id) or is_admin());

-- legal_documents: leitura pública dos ativos.
create policy legal_read on legal_documents for select using (true);
create policy legal_admin on legal_documents
  for all using (is_admin()) with check (is_admin());

-- legal_acceptances
create policy acc_owner on legal_acceptances
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy acc_admin on legal_acceptances for select using (is_admin());

-- audit_logs: apenas admin lê; inserção server-side (service role ignora RLS).
create policy audit_admin on audit_logs for select using (is_admin());
