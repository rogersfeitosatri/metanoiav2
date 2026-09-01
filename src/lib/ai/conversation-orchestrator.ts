import { motivationalPrompt, orchestratorPrompt, tccPrompt } from "../../prompts";
import {
  actionsFromModelDecision,
  createConversationState,
  createOpeningTurn,
  runDeterministicTurn,
  validateModelDecision,
} from "./conversation";
import { getProvider, isLlmConfigured, type AIProvider } from "./provider";
import {
  ConversationDecisionSchema,
  ConversationEngineResponseSchema,
  ConversationEngineStateSchema,
  type ConversationAction,
  type ConversationContext,
  type ConversationDecision,
  type ConversationEngineResponse,
  type ConversationRequest,
  type SafetyResult,
} from "./schemas";
import { analyzeSafetyLocal } from "./safety";
import { mergeCapturedDataIntoState } from "./behavioral-capture";

interface OrchestratorDependencies {
  provider?: AIProvider | null;
  llmConfigured?: boolean;
  safety?: SafetyResult;
  alertRecorded?: boolean;
  onProviderError?: (provider: string) => void;
}

export async function orchestrateConversation(
  request: ConversationRequest,
  dependencies: OrchestratorDependencies = {}
): Promise<ConversationEngineResponse> {
  const message = (request.message || "").trim();
  const safety = dependencies.safety || analyzeSafetyLocal(message);
  const state =
    request.state?.intent === request.intent
      ? request.state
      : createConversationState(request.intent, request.context);

  // A camada de segurança sempre decide antes de selecionar ou chamar um provedor.
  if (safety.safe_message) {
    return safetyResponse(
      state,
      safety,
      dependencies.alertRecorded || false
    );
  }

  if (request.operation === "start") {
    const opening = createOpeningTurn(request.intent, request.context);
    return responseOf(
      opening.decision,
      opening.state,
      opening.actions,
      "local",
      null,
      safety,
      false
    );
  }

  const local = runDeterministicTurn(state, message, request.context);
  const configured = dependencies.llmConfigured ?? isLlmConfigured();
  const provider = dependencies.provider === undefined ? getProvider() : dependencies.provider;

  if (!configured || !provider || provider.name === "local") {
    return responseOf(
      local.decision,
      local.state,
      local.actions,
      "local",
      null,
      safety,
      false
    );
  }

  try {
    const generated = await provider.generateStructuredResponse(
      {
        system: buildSystemPrompt(request.context),
        prompt: buildTurnPrompt(request, local.decision, local.state),
        temperature: 0.55,
      },
      ConversationDecisionSchema
    );
    const candidate = ConversationDecisionSchema.parse(generated);
    const decision = validateModelDecision(
      candidate,
      local.decision,
      local.state,
      message
    );
    const usedLocalDecision = decision === local.decision;
    const stateWithCapture = mergeCapturedDataIntoState(
      local.state,
      decision.captured_data
    );
    const nextState = ConversationEngineStateSchema.parse({
      ...stateWithCapture,
      stage: decision.next_stage,
      last_question: decision.reply,
    });
    const actions = dedupeActions([
      ...local.actions,
      ...(usedLocalDecision ? [] : actionsFromModelDecision(decision)),
    ]);
    return responseOf(
      decision,
      nextState,
      actions,
      usedLocalDecision ? "local" : "ai",
      usedLocalDecision ? null : provider.name,
      safety,
      false
    );
  } catch {
    dependencies.onProviderError?.(provider.name);
    return responseOf(
      local.decision,
      local.state,
      local.actions,
      "local",
      null,
      safety,
      false
    );
  }
}

function buildSystemPrompt(context: ConversationContext): string {
  const readableContext = [
    context.preferred_name ? `Nome preferido: ${context.preferred_name}` : "",
    context.north.length ? `Meu Norte confirmado: ${context.north.join("; ")}` : "",
    context.confirmed_memories.length
      ? `Fatos confirmados: ${context.confirmed_memories.join("; ")}`
      : "",
    context.proposed_hypotheses.length
      ? `Hipóteses não confirmadas: ${context.proposed_hypotheses.join("; ")}`
      : "",
    context.effective_strategies.length
      ? `Estratégias avaliadas como úteis: ${context.effective_strategies.join("; ")}`
      : "",
    context.pending_strategies.length
      ? `Estratégias pendentes: ${context.pending_strategies.map((item) => item.title).join("; ")}`
      : "",
    context.meals.length
      ? `Refeições cadastradas: ${context.meals.map((meal) => `${meal.name} às ${meal.time}`).join("; ")}`
      : "",
  ].filter(Boolean).join("\n");

  return `${orchestratorPrompt(readableContext)}

${motivationalPrompt}

${tccPrompt}

CONTRATO DESTE TURNO
- Devolve exatamente o contrato recebido pelo schema.
- Escolhe uma única próxima pergunta útil. No máximo um ponto de interrogação.
- next_stage representa o único assunto que a próxima resposta deve preencher.
- Não muda de estágio quando a pessoa não entendeu ou não soube responder.
- captured_data contém somente informação explícita na mensagem atual.
- Situação, contexto, corpo, pensamento, emoção, ação, consequências e retomada podem ser extraídos juntos quando estiverem explícitos.
- Fome, tempo sem comer e obstáculos práticos vêm antes de interpretações emocionais.
- Não pergunta de novo um campo que já esteja preenchido no estado.
- Quando houver trabalho cognitivo, examina o efeito e os fatos antes de construir uma alternativa.
- Não corrige o pensamento com frase motivacional; ajuda a pessoa a formular uma leitura realista.
- Uma alternativa só conclui quando belief_level foi informado e é maior que 3.
- cognitive_stage e os estágios cognitivos do fallback são obrigatórios; a IA pode humanizar a linguagem sem saltar etapas.
- Uma estratégia nasce do ponto de decisão, tem gatilho e ação observáveis e é construída com o usuário.
- Não oferece uma lista genérica de dicas nem prescreve alimentação.
- Confiança abaixo de 7 exige reduzir ou ajustar o experimento antes de registrá-lo.
- Uma tentativa nova começa como not_tested; nenhuma resposta a classifica como eficaz antes do follow-up.
- No follow-up, diferencia situação não ocorrida, não lembrou, ajudou, ajudou parcialmente e não ajudou.
- Compensação, restrição punitiva e exercício punitivo nunca viram estratégia.
- Interpretações entram em memory_updates como source=ai e validation_status=proposed.
- Não ordena gravação no banco e não afirma que alguém foi avisado.
- O fallback determinístico abaixo já respeita segurança, intenção e fatores físicos. Só diverge dele quando o histórico realmente justificar.`;
}

function buildTurnPrompt(
  request: ConversationRequest,
  localDecision: ConversationDecision,
  state: ReturnType<typeof ConversationEngineStateSchema.parse>
): string {
  const history = request.history
    .slice(-10)
    .map((item) => `${item.from}: ${item.text}`)
    .join("\n");
  return [
    `Intenção de entrada: ${state.intent}`,
    `Estado já validado depois da mensagem atual: ${JSON.stringify(state)}`,
    history ? `Histórico recente:\n${history}` : "",
    `Mensagem atual: ${JSON.stringify(request.message || "")}`,
    `Decisão determinística segura: ${JSON.stringify(localDecision)}`,
    "Produz a melhor decisão para este turno sem repetir informação já presente no estado.",
  ].filter(Boolean).join("\n\n");
}

function safetyResponse(
  state: ReturnType<typeof ConversationEngineStateSchema.parse>,
  safety: SafetyResult,
  alertRecorded: boolean
): ConversationEngineResponse {
  const recorded = alertRecorded
    ? " Este sinal ficou registrado com segurança no teu acompanhamento."
    : "";
  const decision = ConversationDecisionSchema.parse({
    reply: `${safety.safe_message}${recorded}`,
    quick_replies: ["Quero ajuda para ficar seguro agora", "Vou contatar alguém"],
    next_stage: state.stage,
    response_kind: "guidance",
    needs_clarification: false,
    suggest_close: false,
  });
  return responseOf(
    decision,
    state,
    [],
    "safety",
    null,
    safety,
    true,
    alertRecorded
  );
}

function responseOf(
  decision: ConversationDecision,
  state: ReturnType<typeof ConversationEngineStateSchema.parse>,
  actions: ConversationAction[],
  source: "ai" | "local" | "safety",
  provider: string | null,
  safety: SafetyResult,
  interrupted: boolean,
  alertRecorded = false
): ConversationEngineResponse {
  return ConversationEngineResponseSchema.parse({
    ...decision,
    state,
    actions,
    source,
    provider,
    safety: {
      risk: safety.risk,
      level: safety.level,
      categories: safety.categories,
      alert_recorded: alertRecorded,
      interrupted,
    },
  });
}

function dedupeActions(actions: ConversationAction[]): ConversationAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = JSON.stringify(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
