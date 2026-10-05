# Metanóia 🌱

Assistente inteligente de comportamento alimentar. O Metanóia ajuda pessoas que **já
têm um plano alimentar** mas têm dificuldade de segui-lo com consistência — usando
Terapia Cognitivo-Comportamental, Entrevista Motivacional, análise de padrões e
intervenções preventivas.

O Metanóia **não** cria dietas, não conta calorias, não calcula macros, não fiscaliza
refeições e não julga. Ele ensina a pessoa a **entender como pensa antes de decidir**.

---

## 1. Estrutura criada

```
src/
  app/
    page.tsx                 # entrada / login de demonstração (3 perfis)
    onboarding/              # onboarding conversacional + termos
    app/                     # área do USUÁRIO (layout com navegação)
      hoje/ ajuda/ registrar/ aprendizados/ norte/ conversas/ privacidade/
    pro/                     # painel do PROFISSIONAL (lista + perfil com 8 abas)
    admin/                   # painel ADMINISTRATIVO (métricas, vínculos, termos, logs)
  components/                # AppShell, PanelShell, chat principal e ui primitives
  lib/
    types.ts                 # modelo de dados (espelha o schema Postgres)
    store.tsx                # store React + localStorage (modo demo)
    demo-data.ts             # seed de demonstração (Mariana, Dra. Laura, admin)
    labels.ts                # rótulos pt-BR e opções dos fluxos
    consistency.ts           # índice de consistência (seção 20)
    patterns.ts              # classificação de padrões + regra preventiva
    reports.ts               # geração de relatórios semanais
    ai/
      provider.ts            # abstração AIProvider (local | anthropic)
      conversation.ts        # fallback adaptativo e estado da conversa pós-onboarding
      conversation-orchestrator.ts # único orquestrador pós-onboarding
      safety.ts              # camada de segurança (detecção de risco)
      schemas.ts             # schemas Zod para saídas estruturadas da IA
    __tests__/               # testes unitários (vitest)
  prompts/index.ts           # prompts modulares por função (uso em produção)
supabase/migrations/         # 0001_schema.sql ate 0004_patient_access.sql
```

### Áreas do app do usuário
**Hoje · Preciso de ajuda · Registrar · Aprendizados · Meu Norte** — navegação inferior no
mobile e lateral no desktop, com o botão de ajuda em destaque.

---

## 2. Como executar localmente

```bash
npm install
cp .env.example .env.local     # opcional: o padrão já roda em modo demo
npm run dev                    # http://localhost:3000
```

Build de produção e testes:

```bash
npm run build
npm test
```

Na tela inicial, entre como **Usuário (Mariana)**, **Profissional (Dra. Laura Mendes)**
ou **Administrador**. Em modo demo, os dados ficam no `localStorage` do navegador
(para reiniciar a demonstração, limpe o storage do site).

---

## 3. Configurar o Supabase (modo produção)

O app roda por padrão em `NEXT_PUBLIC_DATA_MODE=demo`, sem serviços externos. Para
usar Supabase:

1. Crie um projeto no Supabase e rode as migrations em `supabase/migrations/` na ordem:
   `0001_schema.sql` → `0002_rls.sql` → `0003_seed.sql` → `0004_patient_access.sql`
   (via `supabase db push` ou colando no SQL Editor).
2. Preencha em `.env.local`:
   ```
   NEXT_PUBLIC_DATA_MODE=supabase
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ADMIN_EMAILS=seu-email-admin@dominio.com
   ```
3. As políticas de **Row Level Security** (`0002_rls.sql`) já garantem que:
   - o usuário só acessa os próprios dados;
   - o profissional acessa **todos** os dados dos usuários **vinculados** (conversas
     completas, registros, padrões, alertas, Cartão de Enfrentamento);
   - notas profissionais privadas **nunca** são visíveis ao usuário;
   - o usuário **não** altera alertas nem relatórios profissionais;
   - o admin tem acesso operacional e a auditoria registra acessos sensíveis.

> Os **usuários de demonstração** devem ser criados via Supabase Auth no seu ambiente.
> Nenhuma senha real é versionada neste repositório.

---

## 3.1. Deploy na Vercel

O app é um projeto Next.js padrão e **roda na Vercel sem nenhuma configuração extra** —
em modo demo não precisa de variáveis de ambiente.

1. Importe o repositório em [vercel.com/new](https://vercel.com/new). A Vercel detecta o
   framework **Next.js** automaticamente (build `next build`, sem overrides).
2. **Variáveis de ambiente:** nenhuma é obrigatória para o modo demo. Para produção com
   Supabase/IA, adicione em *Project Settings → Environment Variables* as chaves do
   `.env.example` (`NEXT_PUBLIC_DATA_MODE`, `NEXT_PUBLIC_SUPABASE_*`, `AI_PROVIDER`,
   `ANTHROPIC_API_KEY`, etc.).
3. Deploy. Node é fixado em `>=18.18` (`engines`) e `.nvmrc` sugere Node 22.

> O ESLint não bloqueia o build (`next.config.mjs` → `eslint.ignoreDuringBuilds: true`),
> mas a **checagem de tipos do TypeScript continua ativa** no build.

## 3.2. Variáveis de ambiente na Vercel (produção)

Adicione em *Project Settings → Environment Variables*:

| Variável | Valor | Exposta ao navegador? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ojrqbmayuimfzwlvxnei.supabase.co` | Sim (é público) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave *publishable* do projeto | Sim (é público) |
| `SUPABASE_SERVICE_ROLE_KEY` | chave *service_role* do projeto | **Não — secreta** |
| `ADMIN_EMAILS` | e-mails admin separados por vírgula | Não |
| `AI_PROVIDER` | `gemini` | Não |
| `GEMINI_API_KEY` | tua chave do Google AI Studio | **Não — secreta** |
| `AI_MODEL` | `gemini-3.6-flash` | Não |

Com as duas primeiras, o site passa a usar **login real e banco de dados**.
Com `SUPABASE_SERVICE_ROLE_KEY`, o app cria o perfil correspondente após o login.
Com `ADMIN_EMAILS`, os e-mails listados recebem `role=admin` automaticamente.
Sem elas, continua em modo demo. `GEMINI_API_KEY` nunca deve levar o prefixo
`NEXT_PUBLIC_` (isso a exporia no navegador).

## 4. Configurar o provedor de IA

A IA é acessada por uma camada abstrata (`src/lib/ai/provider.ts`). Trocar de provedor
é só mudar variáveis de ambiente — nenhuma linha de código muda.

| `AI_PROVIDER` | Chave necessária | Modelo padrão |
|---|---|---|
| `local` (padrão) | nenhuma | motor determinístico |
| `gemini` | `GEMINI_API_KEY` | `gemini-3.6-flash` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |

Para usar o **Google Gemini**:

1. Gere a chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Defina `AI_PROVIDER=gemini` e `GEMINI_API_KEY=...`
3. Opcional: `AI_MODEL=gemini-3.6-flash`. Em caso de erro 404, acesse
   `/api/ai/status?test=1` — ele informa qual modelo a tua chave aceita.

Toda resposta é validada por **Zod** antes de virar dado (`ai/schemas.ts`), e a camada
de segurança roda **antes** de qualquer chamada ao modelo. Se a chamada falhar por
qualquer motivo, o app cai automaticamente no motor determinístico — nunca quebra para
o usuário. Nunca se salva raciocínio interno do modelo.

## 5. Migrations

| Arquivo | Conteúdo |
|---|---|
| `supabase/migrations/0001_schema.sql` | Todas as tabelas da seção 26, enums, índices, FKs e constraints |
| `supabase/migrations/0002_rls.sql` | Funções auxiliares e políticas de RLS por tabela |
| `supabase/migrations/0003_seed.sql` | Estratégias globais e documentos legais (não sensível) |
| `supabase/migrations/0004_patient_access.sql` | Período de acesso dos pacientes e bloqueio por RLS |

Tabelas: `profiles, professionals, professional_user_links, behavioral_goals,
coping_cards, meal_checkins, difficulty_events, thought_records, conversations,
conversation_messages, strategies, strategy_trials, pattern_snapshots,
consistency_scores, weekly_reports, risk_flags, professional_notes,
notification_preferences, scheduled_interventions, legal_documents, legal_acceptances,
audit_logs`.

---

## 6. Usuários de demonstração

| Perfil | Nome | Detalhes |
|---|---|---|
| Usuário | **Mariana Alves** | Objetivo: "seguir meu plano sem desistir quando algo sai diferente". Padrões: final da tarde, muita fome, vontade de doce, "já estraguei tudo", ansiedade em dias intensos. Registros, conversas, pensamentos, estratégias testadas, relatório e 1 alerta de baixa gravidade. |
| Profissional | **Dra. Laura Mendes** | Nutricionista (CRN 12345), vinculada à Mariana. |
| Administrador | **Admin Metanóia** | Acesso operacional. |

Acesso pela tela inicial (sem senha, ambiente de demonstração).

---

## 7. Testes executados

Validação dos Passos 9 e 10 (2026-10-05): `npm test` (Vitest) — **190 testes em 19 arquivos, todos passando**. `npm run build` passou com checagem TypeScript. `npm audit --omit=dev` retornou zero vulnerabilidades.

Os testes originais continuam presentes:

- **consistency.test.ts** — índice de consistência: ausência de registro não é falha;
  parcial pontua positivamente; escolha isolada não derruba o indicador; retomada;
  tendência; linguagem sem fracasso.
- **safety.test.ts** — camada de segurança: mensagem comum não alerta; autolesão (com
  CVV 188), vômito e restrição severa são detectados; perda de controle é sinalizada
  sem interromper; validação Zod.
- **patterns.test.ts** — janela de horário difícil, gatilhos, estratégias eficazes,
  regra de intervenção preventiva (≥3 no final da tarde), `timeWindow`.
- **reports.test.ts** — relatório valida no schema, sem linguagem de fracasso, propõe
  próximo experimento.

As novas suítes cobrem proporções e amostras na Evolução, agenda/fuso/consentimento,
privacidade, respostas a convites, falhas de envio simuladas e permissões do aparelho.

---

## 8. Limitações e etapas que dependem de serviços externos

- **Modo demo (padrão)**: persistência em `localStorage`, sem autenticação real. É o
  modo totalmente navegável e usável para conhecer o produto.
- **Modo Supabase**: integrado a Auth, Postgres e RLS. O contexto da conversa e os
  convites são recuperados no servidor para o usuário autenticado.
- **IA com LLM real**: requer `ANTHROPIC_API_KEY` (ou outro provedor). Sem chave, o motor
  determinístico cobre os fluxos.
- **Notificações push / PWA**: Web Push, service worker e cron implementados.
  Configuração e limitações de validação estão na seção 10. Sucesso em teste com
  provedor simulado não comprova recebimento em um aparelho real.

---

## 9. Princípios de experiência mantidos

Conversas curtas · uma pergunta por vez · registro rápido · direcionamento imediato ·
acolhimento antes de investigação · autonomia · nunca julgar. Estados "realizei",
"parcial" e "não realizei" são visualmente distintos **sem** vermelho de erro. Toda a
interface em **português do Brasil**, tratando o usuário por **"tu"**.

> O Metanóia não ensina apenas o que comer. Ele ajuda a pessoa a entender como pensa
> antes de decidir.

---

## 10. Auditoria e operação dos Passos 9 e 10

### Base auditada

Base `b4a0728`, depois do PR de memória inteligente. A Evolução já tinha dimensões,
mas ainda usava contagens e registros de pensamento sem considerar todos os episódios.
Rotinas e intervenções existiam no modelo; não havia envio Web Push implementado.
A identificação de refeição próxima usava janela simétrica de 60 minutos e horário
do servidor. O Passo 8 não aparece como uma reconstrução concluída nessa base:
Aprendizados foi preservado, sem inventar um segundo motor de padrões.

### Evolução

`src/lib/evolution.ts` centraliza numerador, oportunidades, proporção, período anterior
e evidência. Compara janelas de sete dias; tendência exige ao menos cinco oportunidades
em cada janela e diferença de dez pontos percentuais. O limiar é de produto, não clínico.
Retomada tem histórico de quatro semanas. Não há score geral nem progresso deduzido
da quantidade de acessos. Convites sem refeição confirmada não entram nas oportunidades.
Pensamentos, emoções, corpo, retomada, compensação, ponto de decisão, estratégias e
uso de pensamentos alternativos são independentes. Autonomia só é descrita quando
explicitamente registrada. Criação de alternativa não é uso; `times_used` não multiplica
automaticamente o último resultado. Avaliações cognitivas usam evidência por tentativa.

### Apoio opcional

`support.ts` calcula ocorrências no fuso IANA escolhido. Cada horário tem dias,
pausa, modo antes/depois/nenhum e intervalo. Preferências iniciais limitam o envio
a dois convites/dia, ajustáveis entre um e quatro, com intervalo mínimo de 90 minutos.
Convites de refeição vencem após 90 minutos; revisão de experimento, após 24 horas.
Não há inferência de falha quando a pessoa ignora, dispensa ou ainda não comeu.
Preparação, refeição e acompanhamento entram em `/app/hoje` pelo motor existente.
O episódio anterior não é apagado. O usuário escolhe a transição quando necessário.

Chave de ocorrência única e reserva transacional no Postgres impedem envios concorrentes.
Abrir novamente o mesmo convite reutiliza o episódio sob bloqueio da linha.
Uma edição não recria uma ocorrência já aberta, respondida ou com envio tentado.
São preservados o resultado parcial, a situação não ocorrida e o não uso da estratégia.
O último aparelho ativado é o destinatário; não há disparo simultâneo para todos.

### Produção

- Migration: `supabase/migrations/20260908230115_routine_support_notifications.sql`.
  Aplicada ao projeto `ojrqbmayuimfzwlvxnei`; não executar novamente manualmente.
- `/api/support/dispatch` é chamado pelo Vercel Cron a cada cinco minutos, somente
  em produção. `CRON_SECRET` protege o endpoint. A configuração utiliza o plano
  Vercel já existente, sem contratação de outro serviço.
- Variáveis somente no servidor: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`, `CRON_SECRET`, além do `SUPABASE_SERVICE_ROLE_KEY` existente.
  A chave pública é entregue após autenticação. Chaves privadas nunca entram em
  variáveis `NEXT_PUBLIC_*`. As quatro variáveis de push foram cadastradas na Vercel.
- `scripts/configure-push.ps1` atende instalações novas. Ele recusa sobrescrever
  chaves existentes; não executar para rotacionar uma instalação com aparelhos inscritos.
- Permissão é solicitada somente no clique em Configurações. No iOS/iPadOS, Web Push
  exige uma instalação compatível na tela de início; validar no aparelho-alvo.
- Conteúdo de tela bloqueada é genérico. Banco autoriza somente o proprietário do
  convite; inscrições ficam inacessíveis a `anon` e `authenticated`.
- Envio aceito pelo provedor não prova visualização. Erros ficam `failed`; endpoints
  expirados são desativados. Há uma tentativa externa por ocorrência: não reenviamos
  automaticamente falhas ambíguas, para não duplicar notificações. Convite permanece
  disponível dentro do app enquanto relevante. Não há monitoramento de emergência.

### Verificação e pendências reais

- Testes automatizados: 190 aprovados; build de produção aprovado; auditoria de
  dependências de produção sem vulnerabilidades na data acima.
- Navegador local: cadastro/pausa de horário, convite posterior, proteção de episódio
  aberto, resposta "Ainda não comi", reload e Evolução sem progresso inventado.
  Configurações verificadas em viewport móvel, sem rolagem horizontal.
- Supabase foi reativado em 2026-10-05. Migration e privilégios foram conferidos por
  consultas de leitura; zero dispositivos e zero usuários optados em push nessa auditoria.
- `supabase/tests/support.sql` contém verificações transacionais com rollback.
  Não executadas no banco hospedado: o canal SQL disponível é somente leitura.
- Recebimento real com app fechado e clique no push em Android/iOS/desktop ainda
  precisam de uma conta e aparelho de teste. Nenhum paciente real recebeu disparos.
  O Passo 10 não deve ser anunciado como validado integralmente em dispositivo.
- Login real de paciente/profissional/admin não foi repetido com credenciais reais.
- O teste de saída detectou competição entre `router.replace` e `router.refresh`.
  Os três botões de saída agora navegam para a entrada em um documento novo após logout.
- Advisor: inscrições sem políticas RLS são intencionais (somente servidor e grants
  revogados). O aviso preexistente de proteção contra senhas vazadas desativada
  permanece: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- Aprendizados/Passo 8, testes de carga do cron e validação real em aparelhos são
  pendências separadas. Onboarding, Meu Norte e painel profissional não foram reconstruídos.
  Nenhuma implementação do Passo 11 foi iniciada.
