-- Seed mínimo e não sensível (seção 32): estratégias globais e documentos legais.
-- Usuários de demonstração devem ser criados via Supabase Auth no ambiente local
-- (nunca versionar senhas reais no repositório).

insert into legal_documents (type, version, content, active) values
  ('terms', '1.0', 'TERMOS E CONDIÇÕES DE USO — METANÓIA (ver README para o texto completo).', true),
  ('privacy', '1.0', 'POLÍTICA DE PRIVACIDADE — METANÓIA (ver README para o texto completo).', true);

insert into strategies (title, description, category, instructions, source_type, global, active) values
  ('Pausa de dois minutos', 'Criar um intervalo curto entre a vontade e a ação.', 'pausa', 'Marque dois minutos, respire e só então escolha de forma consciente.', 'global', true, true),
  ('Identificar o pensamento automático', 'Nomear o pensamento antes da escolha difícil.', 'cognitiva', 'Pergunte-se: que frase está passando pela minha cabeça agora? Escreva.', 'global', true, true),
  ('Retornar na próxima escolha', 'Recomeçar sem compensar.', 'retorno', 'A próxima escolha simplesmente recomeça, sem punição.', 'global', true, true),
  ('Preparar uma alternativa antes de sair', 'Verificar uma opção antes do momento difícil.', 'preparacao', 'Antes de sair, confira se há algo organizado para o próximo horário.', 'global', true, true),
  ('Observar a fome mais cedo', 'Perceber a fome antes que fique intensa.', 'fome', 'Num horário anterior ao crítico, observe como está a fome.', 'global', true, true),
  ('Fazer um plano mínimo', 'Reduzir a complexidade para o viável.', 'planejamento', 'Escolha a versão mais simples possível do plano.', 'global', true, true);
