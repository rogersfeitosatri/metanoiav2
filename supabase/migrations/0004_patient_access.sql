-- Periodo de acesso gerenciado pelo administrador.
alter table profiles
  add column if not exists access_enabled boolean not null default true,
  add column if not exists access_starts_at timestamptz,
  add column if not exists access_ends_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_access_period_valid'
  ) then
    alter table profiles
      add constraint profiles_access_period_valid
      check (
        access_starts_at is null
        or access_ends_at is null
        or access_ends_at >= access_starts_at
      );
  end if;
end $$;

create index if not exists idx_profiles_access_period
  on profiles(access_enabled, access_starts_at, access_ends_at)
  where role = 'user';

-- Pacientes podem editar dados pessoais, mas nunca o proprio papel ou periodo de acesso.
revoke update on profiles from authenticated;
grant update (
  full_name,
  preferred_name,
  avatar_url,
  phone,
  timezone,
  professional_id,
  onboarding_completed,
  terms_version,
  terms_accepted_at,
  privacy_version,
  privacy_accepted_at,
  updated_at
) on profiles to authenticated;

-- Centraliza a validacao para que o bloqueio tambem exista no banco, nao apenas na tela.
create or replace function has_active_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and (
        role <> 'user'
        or (
          access_enabled
          and (access_starts_at is null or access_starts_at <= now())
          and (access_ends_at is null or access_ends_at >= now())
        )
      )
  );
$$;

-- Substitui somente as politicas do proprio paciente. Admin e profissional
-- continuam acessando pelas politicas especificas definidas na migracao 0002.
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for select using (
    (id = auth.uid() and has_active_access()) or is_admin() or is_linked_professional(id)
  );

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update using ((id = auth.uid() and has_active_access()) or is_admin());

drop policy if exists links_read on professional_user_links;
create policy links_read on professional_user_links
  for select using (
    (user_id = auth.uid() and has_active_access())
    or professional_id = my_professional_id()
    or is_admin()
  );

drop policy if exists goals_owner on behavioral_goals;
create policy goals_owner on behavioral_goals
  for all using (user_id = auth.uid() and has_active_access())
  with check (user_id = auth.uid() and has_active_access());

drop policy if exists card_owner on coping_cards;
create policy card_owner on coping_cards
  for all using (user_id = auth.uid() and has_active_access())
  with check (user_id = auth.uid() and has_active_access());

drop policy if exists checkins_owner on meal_checkins;
create policy checkins_owner on meal_checkins
  for all using (user_id = auth.uid() and has_active_access())
  with check (user_id = auth.uid() and has_active_access());

drop policy if exists conv_owner on conversations;
create policy conv_owner on conversations
  for all using (user_id = auth.uid() and has_active_access())
  with check (user_id = auth.uid() and has_active_access());

drop policy if exists msg_owner on conversation_messages;
create policy msg_owner on conversation_messages
  for all using (
    has_active_access()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  ) with check (
    has_active_access()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists diff_owner on difficulty_events;
create policy diff_owner on difficulty_events
  for all using (user_id = auth.uid() and has_active_access())
  with check (user_id = auth.uid() and has_active_access());

drop policy if exists thought_owner on thought_records;
create policy thought_owner on thought_records
  for all using (user_id = auth.uid() and has_active_access())
  with check (user_id = auth.uid() and has_active_access());

drop policy if exists trials_owner on strategy_trials;
create policy trials_owner on strategy_trials
  for all using (user_id = auth.uid() and has_active_access())
  with check (user_id = auth.uid() and has_active_access());

drop policy if exists patterns_owner on pattern_snapshots;
create policy patterns_owner on pattern_snapshots
  for select using (
    (user_id = auth.uid() and has_active_access()) or is_linked_professional(user_id) or is_admin()
  );

drop policy if exists scores_owner on consistency_scores;
create policy scores_owner on consistency_scores
  for select using (
    (user_id = auth.uid() and has_active_access()) or is_linked_professional(user_id) or is_admin()
  );

drop policy if exists reports_owner on weekly_reports;
create policy reports_owner on weekly_reports
  for select using (
    (user_id = auth.uid() and has_active_access()) or is_linked_professional(user_id) or is_admin()
  );

drop policy if exists risk_owner_read on risk_flags;
create policy risk_owner_read on risk_flags
  for select using (
    (user_id = auth.uid() and has_active_access()) or is_linked_professional(user_id) or is_admin()
  );

drop policy if exists prefs_owner on notification_preferences;
create policy prefs_owner on notification_preferences
  for all using (user_id = auth.uid() and has_active_access())
  with check (user_id = auth.uid() and has_active_access());

drop policy if exists sched_owner on scheduled_interventions;
create policy sched_owner on scheduled_interventions
  for select using (
    (user_id = auth.uid() and has_active_access()) or is_linked_professional(user_id) or is_admin()
  );

drop policy if exists acc_owner on legal_acceptances;
create policy acc_owner on legal_acceptances
  for all using (user_id = auth.uid() and has_active_access())
  with check (user_id = auth.uid() and has_active_access());
