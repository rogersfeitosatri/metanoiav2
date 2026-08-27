-- Mantem a Data API fechada para visitantes e limita pacientes ao necessario.
revoke all privileges on table public.behavioral_episodes from anon;
revoke all privileges on table public.behavioral_episodes from authenticated;

grant select, insert, update on table public.behavioral_episodes to authenticated;
