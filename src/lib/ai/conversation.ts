import type { ConversationIntent } from "../conversation-intent";
import { isUnsafeMicroexperiment } from "../microexperiments";
import {
  assessBehavioralSufficiency,
  extractBehavioralData,
  groundedModelCapture,
  hasBehavioralDifficulty,
  mergeCapturedDataIntoState,
} from "./behavioral-capture";
import {
  ConversationDecisionSchema,
  ConversationEngineStateSchema,
  type ConversationAction,
  type ConversationCapturedData,
  type ConversationContext,
  type ConversationDecision,
  type ConversationEngineState,
  type ConversationStage,
} from "./schemas";

export type ConversationState = ConversationEngineState;

export interface DeterministicTurnResult {
  decision: ConversationDecision;
  state: ConversationEngineState;
  actions: ConversationAction[];
}

const ENTRY_OPTIONS = [
  "Quero contar como estou",
  "Uma refeição foi difícil",
  "Algo deu certo",
  "Preciso de apoio agora",
];

const MEAL_STATUS_REPLIES = [
  "Realizei",
  "Realizei em parte",
  "Não realizei",
  "Prefiro só conversar",
];

const THOUGHT_EXAMPLES = [
  "Já estraguei tudo",
  "Só hoje",
  "Eu mereço",
  "Depois eu compenso",
  "Não consigo me controlar",
  "Já que comecei, tanto faz",
];

const RE = {
  clarification:
    /^\s*(n[ãa]o entendi|como assim|n[ãa]o saquei|explica melhor|pode explicar|o que quer dizer)\b/i,
  unknown:
    /^\s*(n[ãa]o sei|sei l[áa]|n[ãa]o fa[cç]o ideia|dif[ií]cil responder|nunca pensei nisso|n[ãa]o lembro|sla)\b/i,
  hunger:
    /muita fome|morrendo de fome|famint|fome\s*(?:de|tava|estava|era)?\s*(?:10|[7-9])\b|sem comer|n[ãa]o almocei|pulei (?:o )?(?:almo[cç]o|caf[eé]|jantar)|horas sem/i,
  bodyDeprivation:
    /sem comer|n[ãa]o (?:almocei|jantei|tomei caf[eé])|pulei (?:o )?(?:almo[cç]o|caf[eé]|jantar)|desde (?:o )?(?:almo[cç]o|caf[eé]|jantar)|horas sem/i,
  foodEvent:
    /comi|comer|comendo|refei[cç][aã]o|almo[cç]o|jantar|lanche|doce|chocolate|comida/i,
  emotional:
    /ansios|estress|nervos|brig|discuss|triste|chate|raiva|irrit|frustr|sozinh|entedia|t[eé]dio|ang[uú]stia/i,
  urge: /impulso|sem pensar|autom[aá]tic|nem percebi|do nada|vontade|desejo|fissura/i,
  guilt: /culpa|arrepend|me odeio|fracass|vergonha|nojo/i,
  allOrNothing:
    /estraguei tudo|estragado tudo|j[aá] que|tanto faz|perdi o dia|dia (?:j[aá] )?foi perdido|acabou mesmo|amanh[ãa] come[cç]o|larguei o dia/i,
  cognitiveThought:
    /estraguei tudo|estragado tudo|j[aá] que|tanto faz|perdi o dia|dia (?:j[aá] )?foi perdido|n[ãa]o consigo me controlar|nunca consigo (?:manter|me controlar)|eu mere[cç]o|amanh[ãa] (?:eu )?compenso|depois (?:eu )?compenso/i,
  decline: /n[ãa]o quero|prefiro n[ãa]o|deixa pra l[aá]|s[oó] registrar/i,
};

export interface ConversationSignals {
  hunger: boolean;
  bodyDeprivation: boolean;
  foodEvent: boolean;
  emotional: boolean;
  urge: boolean;
  guilt: boolean;
  allOrNothing: boolean;
}

export function detectSignals(text: string): ConversationSignals {
  return {
    hunger: RE.hunger.test(text),
    bodyDeprivation: RE.bodyDeprivation.test(text),
    foodEvent: RE.foodEvent.test(text),
    emotional: RE.emotional.test(text),
    urge: RE.urge.test(text),
    guilt: RE.guilt.test(text),
    allOrNothing: RE.allOrNothing.test(text),
  };
}

export function createConversationState(
  intent: ConversationIntent,
  context: ConversationContext
): ConversationEngineState {
  const pending = context.pending_strategies[0];
  const dueMeal = context.meals.find((meal) => meal.due);
  let stage: ConversationStage = "situation";

  if (intent === "prepare") stage = "prepare_situation";
  if (intent === "review_strategy") stage = "strategy_review";
  if (intent === "meal_checkin") stage = dueMeal ? "meal_status" : "meal_selection";
  if (intent === "default" && pending) stage = "strategy_review";
  else if (intent === "default" && dueMeal) stage = "meal_status";

  return ConversationEngineStateSchema.parse({
    intent,
    stage,
    asked: [],
    pending_strategy_id: stage === "strategy_review" ? pending?.id : undefined,
    pending_strategy_title: stage === "strategy_review" ? pending?.title : undefined,
    pending_strategy_key: stage === "strategy_review" ? pending?.strategy_key || undefined : undefined,
    pending_strategy_trigger:
      stage === "strategy_review" ? pending?.trigger_context || undefined : undefined,
    pending_strategy_action:
      stage === "strategy_review" ? pending?.experiment_action || undefined : undefined,
    pending_strategy_objective:
      stage === "strategy_review" ? pending?.test_objective || undefined : undefined,
    pending_strategy_confidence:
      stage === "strategy_review" ? pending?.confidence_level ?? undefined : undefined,
    pending_alternative_thought_id:
      stage === "strategy_review" ? pending?.alternative_thought_id || undefined : undefined,
    pending_alternative_thought:
      stage === "strategy_review" ? pending?.alternative_thought || undefined : undefined,
    meal_schedule_id: stage === "meal_status" ? dueMeal?.id : undefined,
    meal_name: stage === "meal_status" ? dueMeal?.name : undefined,
  });
}

export function createOpeningTurn(
  intent: ConversationIntent,
  context: ConversationContext
): DeterministicTurnResult {
  const state = createConversationState(intent, context);
  let decision: ConversationDecision;

  if (state.stage === "strategy_review" && state.pending_strategy_title) {
    decision = decisionOf(
      `Na última vez tu combinou testar “${state.pending_strategy_title}”. Essa situação aconteceu de novo?`,
      "strategy_review",
      [
        "Sim, e testei",
        "Aconteceu, mas não lembrei",
        "Ainda não aconteceu",
        "Não quero continuar",
      ]
    );
  } else if (state.stage === "meal_status") {
    decision = decisionOf(
      `${state.meal_name || "Essa refeição"} estava prevista para agora. Como foi para ti?`,
      "meal_status",
      MEAL_STATUS_REPLIES
    );
  } else if (intent === "help_now") {
    decision = decisionOf("O que tá pegando agora?", "situation", [
      "Vontade de comer",
      "Culpa depois de comer",
      "Ansiedade ou estresse",
      "Quero me preparar",
    ]);
  } else if (intent === "register_event") {
    decision = decisionOf("Tá. Me conta o que aconteceu.", "situation");
  } else if (intent === "prepare") {
    decision = decisionOf("O que tu quer se preparar para enfrentar?", "prepare_situation");
  } else if (intent === "review_strategy") {
    decision = decisionOf("Qual estratégia tu quer avaliar?", "strategy_review");
  } else if (intent === "meal_checkin") {
    decision = decisionOf(
      "Qual refeição tu quer registrar?",
      "meal_selection",
      context.meals.length
        ? context.meals.slice(0, 5).map((meal) => meal.name)
        : ["Café da manhã", "Almoço", "Lanche", "Jantar", "Outra"]
    );
  } else {
    const name = context.preferred_name ? `, ${context.preferred_name}` : "";
    decision = decisionOf(
      `Oi${name}. Como tu chega para esta conversa hoje?`,
      "situation",
      ENTRY_OPTIONS
    );
  }

  return finish(state, decision, []);
}

export function runDeterministicTurn(
  rawState: ConversationEngineState,
  rawMessage: string,
  context: ConversationContext
): DeterministicTurnResult {
  const message = rawMessage.trim();
  let state = ConversationEngineStateSchema.parse(rawState);

  if (state.stage === "done") {
    state = createConversationState("default", context);
    state.stage = "situation";
  }

  if (RE.clarification.test(message)) {
    const next = { ...state, clarification_count: state.clarification_count + 1 };
    return finish(next, rephraseStage(next, context), []);
  }

  if (RE.unknown.test(message)) {
    const next = { ...state, unknown_count: state.unknown_count + 1 };
    return finish(next, alternatePath(next, context), []);
  }

  if (state.stage === "situation") {
    if (/^\s*(quero me preparar|me preparar|preparar uma situa[cç][aã]o)\s*$/i.test(message)) {
      return finish(
        { ...state, intent: "prepare", stage: "prepare_situation" },
        decisionOf("O que tu quer se preparar para enfrentar?", "prepare_situation"),
        []
      );
    }
    if (/^\s*preciso de apoio agora\s*$/i.test(message)) {
      return finish(
        { ...state, intent: "help_now" },
        decisionOf("O que tá pegando agora?", "situation"),
        []
      );
    }
    if (/^\s*uma refei[cç][aã]o foi dif[ií]cil\s*$/i.test(message)) {
      return finish(
        state,
        decisionOf("Tá. O que aconteceu nessa refeição?", "situation"),
        []
      );
    }
    if (/^\s*algo deu certo\s*$/i.test(message)) {
      return finish(
        state,
        decisionOf("O que aconteceu e ajudou esse momento a dar certo?", "meal_success"),
        []
      );
    }
    if (/^\s*quero contar como estou\s*$/i.test(message)) {
      return finish(state, decisionOf("Como tu tá agora?", "situation"), []);
    }
  }

  const currentStage = state.stage;
  const extracted = extractBehavioralData(message);
  let next: ConversationEngineState = mergeCapturedDataIntoState({
    ...state,
    asked: [...new Set([...state.asked, currentStage])],
  }, extracted);
  const actions: ConversationAction[] = [];
  const signals = detectSignals(`${message} ${state.situation || ""}`);
  let decision: ConversationDecision;

  switch (currentStage) {
    case "situation": {
      next.situation = mergeText(next.situation, message);
      if (!next.captured_evidence.some((item) => item.field === "situation")) {
        next.captured_evidence.push({
          field: "situation",
          value: message,
          evidence: message,
          source: "user",
          status: "reported",
          confidence: 1,
        });
      }
      const hunger = extractHunger(message);
      if (hunger != null) {
        next.hunger_level = hunger;
        next.noticed_hunger_early = hunger <= 6;
      }
      if (signals.bodyDeprivation) next.physical_context = message;
      if (signals.allOrNothing) {
        next.automatic_thought = extractThought(message);
        next.thought_self_identified = true;
        next.all_or_nothing = true;
      }
      if (signals.guilt) next.guilt_level = 7;

      const sufficiency = assessBehavioralSufficiency(next);
      if (sufficiency.practical && next.behavior) {
        decision = decisionOf(
          "Então teve um obstáculo bem prático aí. Isso costuma acontecer ou hoje foi exceção?",
          "context",
          ["Costuma acontecer", "Hoje foi exceção", "Acontece às vezes"]
        );
      } else if (next.hunger_level != null && next.hunger_level >= 7) {
        decision = highHungerDecision(next);
      } else if (
        next.hunger_level == null &&
        (signals.hunger || signals.bodyDeprivation || signals.foodEvent || signals.urge)
      ) {
        decision = decisionOf(
          "Antes de procurar outro motivo, tua fome tava quanto de 0 a 10?",
          "hunger",
          ["Até 3", "Entre 4 e 6", "7 ou mais"]
        );
      } else if (isCognitivelyRelevant(next)) {
        decision = cognitiveEntryDecision(next);
      } else if (signals.emotional) {
        decision = next.automatic_thought
          ? next.behavior
            ? recoveryDecision()
            : behaviorDecision()
          : decisionOf(
              "Depois disso, qual frase passou pela tua cabeça?",
              "thought",
              ["Não lembro", "Não sei dizer"]
            );
      } else if (next.behavior) {
        decision = recoveryDecision();
      } else {
        decision = decisionOf(
          "O que tu acabou fazendo nessa situação?",
          "behavior"
        );
      }
      break;
    }

    case "context": {
      if (/costuma|frequente|sempre|muitas vezes/i.test(message)) {
        next.context_recurrence = "recurring";
      } else if (/exce[cç][aã]o|s[oó] hoje|foi diferente/i.test(message)) {
        next.context_recurrence = "exception";
      } else {
        next.context_recurrence = "unknown";
      }
      decision = next.context_recurrence === "recurring"
        ? interventionPointDecision(next)
        : decisionOf(
            "Entendi. Hoje a rotina bateu de frente com a refeição. Como foi exceção, não precisa inventar uma técnica para preencher espaço.",
            "done",
            [],
            { kind: "reflection", suggestClose: true }
          );
      break;
    }

    case "hunger": {
      const hunger = extractHunger(message);
      if (hunger == null) {
        return finish(
          { ...state, clarification_count: state.clarification_count + 1 },
          decisionOf(
            "Pode ser aproximado: 0 é sem fome e 10 é fome muito forte. Em qual número tu tava?",
            "hunger",
            ["2", "5", "8", "10"],
            { needsClarification: true }
          ),
          []
        );
      }
      next.hunger_level = hunger;
      next.noticed_hunger_early = hunger <= 6;
      if (hunger >= 7) {
        decision = highHungerDecision(next);
      } else if (isCognitivelyRelevant(next) || signals.allOrNothing) {
        decision = cognitiveEntryDecision(next);
      } else if (detectSignals(next.situation || "").emotional) {
        decision = decisionOf(
          `Tá. A fome tava ${hunger}/10. O que tava mais forte em ti nessa hora?`,
          "emotion",
          ["Ansiedade", "Raiva", "Tristeza", "Frustração", "Cansaço", "Não sei"]
        );
      } else {
        decision = decisionOf(
          `Tá. A fome tava ${hunger}/10. Teve alguma frase que passou pela tua cabeça?`,
          "thought",
          ["Não lembro", "Não sei dizer"]
        );
      }
      break;
    }

    case "physical_context": {
      next.physical_context = mergeText(next.physical_context, message);
      if (isCognitivelyRelevant(next)) {
        decision = cognitiveEntryDecision(next);
      } else if (!next.behavior) {
        decision = decisionOf(
          `Então tem um fator bem objetivo aqui: a fome ${next.hunger_level ?? "alta"}/10 chegou junto com um intervalo grande. O que aconteceu na prática quando tu chegou?`,
          "behavior"
        );
      } else {
        decision = interventionPointDecision(next);
      }
      break;
    }

    case "thought": {
      if (/nenhuma dessas|nenhuma delas|n[aã]o era nada disso/i.test(message)) {
        next.thought_self_identified = false;
        decision = !next.behavior
          ? behaviorDecision()
          : !next.emotions.length
            ? decisionOf(
                "Tá. Não precisa forçar uma frase. O que tu tava sentindo nessa hora?",
                "emotion",
                ["Ansiedade", "Raiva", "Tristeza", "Frustração", "Culpa", "Não sei"]
              )
            : recoveryDecision();
        break;
      }
      next.automatic_thought = next.automatic_thought || message;
      next.thought_self_identified =
        next.thought_self_identified ?? !THOUGHT_EXAMPLES.includes(message);
      next.all_or_nothing = next.all_or_nothing || signals.allOrNothing;
      if (isCognitivelyRelevant(next)) {
        next.cognitive_stage = "identifying";
        decision = cognitiveEntryDecision(next);
      } else if (!next.behavior) {
        decision = behaviorDecision();
      } else if (!next.emotions.length) {
        decision = decisionOf(
          "E o que tu tava sentindo nessa hora?",
          "emotion",
          ["Ansiedade", "Raiva", "Tristeza", "Frustração", "Culpa", "Não sei"]
        );
      } else {
        decision = recoveryDecision();
      }
      break;
    }

    case "emotion": {
      if (/nenhuma dessas|nenhuma delas|n[aã]o era nada disso/i.test(message)) {
        next.emotion_self_identified = false;
        decision = next.behavior ? recoveryDecision() : behaviorDecision();
        break;
      }
      if (!next.emotions.length && !next.physical_state.length) {
        next.emotion = message;
        next.emotions = [message];
        next.emotion_self_identified = true;
      }
      if (signals.guilt) next.guilt_level = 7;
      decision = next.behavior ? recoveryDecision() : behaviorDecision();
      break;
    }

    case "behavior": {
      next.behavior = next.behavior || message;
      if (isCognitivelyRelevant(next)) {
        next.thought_effect = next.thought_effect || message;
        next.cognitive_stage = "examining_evidence";
        decision = cognitiveExaminationDecision(next);
      } else {
        decision = recoveryDecision();
      }
      break;
    }

    case "consequence": {
      next.consequence = message;
      decision = isCognitivelyRelevant(next)
        ? cognitiveExaminationDecision(next)
        : recoveryDecision();
      break;
    }

    case "immediate_consequence": {
      next.immediate_consequence = mergeText(next.immediate_consequence, message);
      decision = decisionOf(
        "E um pouco depois, o que aconteceu?",
        "later_consequence"
      );
      break;
    }

    case "later_consequence": {
      next.later_consequence = mergeText(next.later_consequence, message);
      next.consequence = mergeText(next.consequence, message);
      decision = recoveryDecision();
      break;
    }

    case "recovery": {
      next.recovery_outcome = mapRecovery(message);
      if (next.recovery_outcome === "compensou" && !next.compensatory_behavior) {
        next.compensatory_behavior = message;
      }
      decision = next.all_or_nothing && !next.decision_point
        ? decisionOf(
            "Em que momento talvez ainda desse para fazer alguma coisa diferente, sem tentar compensar?",
            "decision_point"
          )
        : interventionPointDecision(next);
      break;
    }

    case "decision_point": {
      next.decision_point = mergeText(next.decision_point, message);
      decision = experimentActionDecision(next);
      break;
    }

    case "cognitive_effect": {
      next.thought_effect = mergeText(next.thought_effect, message);
      if (!next.behavior && extracted.behavior) next.behavior = extracted.behavior;
      next.cognitive_stage = "examining_evidence";
      decision = cognitiveExaminationDecision(next);
      break;
    }

    case "cognitive_examine": {
      next.cognitive_examination = mergeText(next.cognitive_examination, message);
      next.cognitive_stage = "seeking_perspective";
      decision = cognitivePerspectiveDecision(next);
      break;
    }

    case "cognitive_perspective": {
      next.cognitive_perspective = mergeText(next.cognitive_perspective, message);
      next.cognitive_stage = "building_alternative";
      decision = decisionOf(
        "Então qual seria uma forma mais justa de olhar pra isso?",
        "alternative"
      );
      break;
    }

    case "alternative": {
      if (/nenhuma dessas|nenhuma delas|n[aã]o era nada disso/i.test(message)) {
        next.alternative = undefined;
        next.alternative_from_suggestion = false;
        decision = decisionOf(
          "Tá. O que essas frases não conseguem dizer sobre o que aconteceu contigo?",
          "alternative"
        );
        break;
      }
      next.alternative = message;
      next.alternative_from_suggestion = isSuggestedAlternative(message);
      next.belief_level = null;
      next.cognitive_stage = "checking_belief";
      decision = next.alternative_from_suggestion
        ? decisionOf(
            "Quer deixar essa frase mais com a tua cara ou assim já diz o que tu pensa?",
            "alternative_personalize",
            ["Assim faz sentido", "Quero ajustar"]
          )
        : beliefDecision(next);
      break;
    }

    case "alternative_personalize": {
      if (/quero ajustar|ajustar|mudar a frase/i.test(message)) {
        next.cognitive_stage = "building_alternative";
        decision = decisionOf(
          "Como tu diria essa ideia do teu jeito?",
          "alternative"
        );
      } else if (/assim|faz sentido|pode ser/i.test(message)) {
        next.cognitive_stage = "checking_belief";
        decision = beliefDecision(next);
      } else {
        next.alternative = message;
        next.alternative_from_suggestion = false;
        next.cognitive_stage = "checking_belief";
        decision = beliefDecision(next);
      }
      break;
    }

    case "alternative_belief": {
      const belief = extractBelief(message);
      if (belief == null) {
        return finish(
          { ...state, clarification_count: state.clarification_count + 1 },
          decisionOf(
            "Pode ser aproximado: 0 é nada verdadeira e 10 é muito verdadeira. Quanto essa frase parece verdadeira agora?",
            "alternative_belief",
            ["2", "5", "8", "10"],
            { needsClarification: true }
          ),
          []
        );
      }
      next.belief_level = belief;
      if (belief <= 3) {
        next.cognitive_stage = "refining_alternative";
        decision = decisionOf(
          "Essa frase ainda parece bonita mais do que verdadeira. O que deixa ela difícil de acreditar?",
          "alternative_refine"
        );
      } else {
        next.cognitive_stage = "completed";
        next.alternative_recorded = true;
        actions.push({
          type: "upsert_alternative_thought",
          original_thought: next.automatic_thought!,
          alternative: next.alternative!,
          belief_level: belief,
        });
        decision = interventionPointDecision(next);
      }
      break;
    }

    case "alternative_refine": {
      next.alternative_doubt = mergeText(next.alternative_doubt, message);
      next.cognitive_stage = "building_alternative";
      decision = decisionOf(
        "Levando isso em conta, como tu deixaria a frase mais verdadeira e acreditável?",
        "alternative"
      );
      break;
    }

    case "strategy": {
      next.experiment_action = message;
      next.strategy = message;
      next.experiment_objective = experimentObjective(next);
      decision = triggerDecision(next);
      break;
    }

    case "intervention_point": {
      next.decision_point = mergeText(next.decision_point, message);
      decision = experimentActionDecision(next);
      break;
    }

    case "experiment_action": {
      if (RE.decline.test(message)) {
        decision = decisionOf(
          "Tá. O episódio fica registrado sem transformar isso numa obrigação.",
          "done",
          [],
          { kind: "closing", suggestClose: true }
        );
        break;
      }
      if (isUnsafeMicroexperiment(message)) {
        decision = decisionOf(
          "Isso parece entrar em compensação ou restrição, então não vou guardar como estratégia. Vale levar essa ideia para o profissional que te acompanha e pensar numa opção que não seja punição.",
          "experiment_action",
          safeExperimentOptions(next),
          { kind: "guidance" }
        );
        break;
      }
      next.experiment_action = message;
      next.strategy = message;
      next.experiment_objective = experimentObjective(next);
      decision = triggerDecision(next);
      break;
    }

    case "experiment_trigger": {
      next.experiment_trigger = message;
      decision = confidenceDecision(next);
      break;
    }

    case "experiment_confidence": {
      const confidence = extractBelief(message);
      if (confidence == null) {
        decision = decisionOf(
          "Pode ser aproximado: 0 é nenhuma chance de testar e 10 é muita chance. Quanto fica?",
          "experiment_confidence",
          ["2", "5", "7", "9"],
          { needsClarification: true }
        );
        break;
      }
      next.experiment_confidence = confidence;
      if (confidence <= 6) {
        decision = decisionOf(
          confidence <= 3
            ? `${confidence}? Então ficou grande demais. Como fica uma versão menor, em uma ação concreta?`
            : `Tá em ${confidence}. O que tu mudaria nessa ação para ela chegar mais perto de 7?`,
          "experiment_adjust"
        );
      } else {
        decision = completeExperiment(next, actions);
      }
      break;
    }

    case "experiment_adjust": {
      if (isUnsafeMicroexperiment(message)) {
        decision = decisionOf(
          "Essa versão ainda depende de compensar ou restringir, então não vou guardar assim. Qual seria uma ação pequena sem punição?",
          "experiment_adjust",
          safeExperimentOptions(next),
          { kind: "guidance" }
        );
        break;
      }
      next.experiment_adjustment = message;
      next.experiment_action = message;
      next.strategy = message;
      decision = confidenceDecision(next);
      break;
    }

    case "prepare_situation": {
      next.situation = message;
      decision = decisionOf("O que parece mais difícil nessa situação?", "prepare_obstacle");
      break;
    }

    case "prepare_obstacle": {
      next.preparation_obstacle = message;
      next.main_influencing_factor = inferPreparationFactor(message);
      next.decision_point = "antes de entrar na situação";
      decision = experimentActionDecision(next, true);
      break;
    }

    case "prepare_action": {
      next.experiment_action = message;
      next.strategy = message;
      next.experiment_objective = experimentObjective(next);
      decision = triggerDecision(next);
      break;
    }

    case "strategy_review": {
      if (!next.pending_strategy_title) {
        next.pending_strategy_title = message;
        decision = decisionOf(
          `Tá. Pensando em “${shorten(message)}”, essa situação aconteceu de novo?`,
          "strategy_review",
          ["Sim, e testei", "Aconteceu, mas não lembrei", "Ainda não aconteceu"]
        );
        break;
      }
      const occurrence = mapStrategyOccurrence(message);
      if (occurrence === "tested") {
        decision = decisionOf(
          "O que mudou quando tu fez isso?",
          "strategy_review_change",
          ["Ajudou", "Ajudou em parte", "Não mudou nada"]
        );
      } else if (occurrence === "did_not_use") {
        next.strategy_review_result = "did_not_use";
        next.strategy_review_feedback = message;
        if (next.pending_strategy_id) {
          actions.push(strategyUpdate(next, "did_not_use", message));
        }
        decision = decisionOf(
          "Então a estratégia nem chegou a entrar na situação. O que poderia ajudar ela a aparecer na hora certa?",
          "strategy_review_barrier"
        );
      } else if (occurrence === "situation_not_occurred") {
        next.strategy_review_result = "situation_not_occurred";
        if (next.pending_strategy_id) {
          actions.push(strategyUpdate(next, "situation_not_occurred", message));
        }
        decision = decisionOf(
          "Tá. Então ainda não existe evidência de que ajudou ou não ajudou. Ela continua como um teste pendente.",
          "done",
          [],
          { kind: "closing", suggestClose: true }
        );
      } else if (occurrence === "discarded") {
        next.strategy_review_result = "discarded";
        if (next.pending_strategy_id) {
          actions.push(strategyUpdate(next, "discarded", message));
        }
        decision = decisionOf(
          "Tá. Vou encerrar essa tentativa sem tratar isso como fracasso.",
          "done",
          [],
          { kind: "closing", suggestClose: true }
        );
      } else {
        decision = decisionOf(
          "Quero separar duas coisas: a situação aconteceu e tu testou, aconteceu mas tu não lembrou, ou ainda não aconteceu?",
          "strategy_review",
          ["Sim, e testei", "Aconteceu, mas não lembrei", "Ainda não aconteceu"],
          { needsClarification: true }
        );
      }
      break;
    }

    case "strategy_review_change": {
      const result = mapStrategyResult(message);
      if (!result) {
        decision = decisionOf(
          "Olhando o que mudou, isso ajudou, ajudou só em parte ou não ajudou?",
          "strategy_review_change",
          ["Ajudou", "Ajudou em parte", "Não ajudou"],
          { needsClarification: true }
        );
        break;
      }
      next.strategy_review_result = result;
      next.strategy_review_feedback = message;
      if (next.pending_alternative_thought_id) {
        decision = decisionOf(
          "E aquela resposta que tu tinha construído apareceu na hora?",
          "strategy_review_cognitive",
          [
            "Lembrei e agi diferente",
            "Lembrei, mas fiz igual",
            "Na hora não lembrei",
            "Usei, mas não ajudou",
          ]
        );
      } else if (result === "helped") {
        if (next.pending_strategy_id) actions.push(strategyUpdate(next, result, message));
        decision = helpedThisTimeDecision();
      } else {
        if (next.pending_strategy_id) actions.push(strategyUpdate(next, result, message));
        decision = decisionOf(
          result === "partially_helped"
            ? "Ajudou uma parte, mas não resolveu tudo. O que limitou a estratégia naquela hora?"
            : "O que fez essa estratégia não funcionar naquela hora?",
          "strategy_review_barrier"
        );
      }
      break;
    }

    case "strategy_review_cognitive": {
      const cognitiveResult = mapAlternativeResult(message);
      if (!cognitiveResult) {
        decision = decisionOf(
          "Tu lembrou e agiu diferente, lembrou mas fez igual, não lembrou ou usou sem ajudar?",
          "strategy_review_cognitive",
          ["Lembrei e agi diferente", "Lembrei, mas fiz igual", "Na hora não lembrei", "Usei, mas não ajudou"],
          { needsClarification: true }
        );
        break;
      }
      let result: Exclude<
        NonNullable<ConversationEngineState["strategy_review_result"]>,
        "not_tested"
      > =
        next.strategy_review_result && next.strategy_review_result !== "not_tested"
          ? next.strategy_review_result
          : "did_not_help";
      if (cognitiveResult === "did_not_use") result = "did_not_use";
      if (cognitiveResult === "did_not_help") result = "did_not_help";
      next.strategy_review_result = result;
      if (next.pending_strategy_id) actions.push(strategyUpdate(next, result, message));
      if (next.pending_alternative_thought_id) {
        actions.push({
          type: "update_alternative_thought_result",
          alternative_thought_id: next.pending_alternative_thought_id,
          result: cognitiveResult,
        });
      }
      decision = result === "helped"
        ? helpedThisTimeDecision()
        : decisionOf(
            result === "did_not_use"
              ? "Então talvez o problema não seja a frase em si: ela nem chegou a aparecer. O que ajudaria a lembrar dela?"
              : "O que limitou isso naquela hora?",
            "strategy_review_barrier"
          );
      break;
    }

    case "strategy_review_barrier": {
      next.strategy_review_feedback = mergeText(next.strategy_review_feedback, message);
      decision = decisionOf(
        "Olhando isso, vale adaptar, tentar a mesma ideia mais uma vez ou deixar essa ideia?",
        "strategy_review_decision",
        ["Adaptar", "Tentar igual", "Deixar essa ideia"]
      );
      break;
    }

    case "strategy_review_decision": {
      if (/deixar|parar|descartar/i.test(message)) {
        decision = decisionOf(
          "Tá. A tentativa fica encerrada com o que ela ensinou, sem virar obrigação.",
          "done",
          [],
          { kind: "closing", suggestClose: true }
        );
      } else {
        next.experiment_action = next.pending_strategy_action || next.pending_strategy_title;
        next.strategy = next.experiment_action;
        next.experiment_trigger = next.pending_strategy_trigger;
        next.experiment_objective = next.pending_strategy_objective || experimentObjective(next);
        next.experiment_confidence = null;
        decision = /tentar igual/i.test(message)
          ? confidenceDecision(next)
          : next.strategy_review_result === "did_not_use"
            ? decisionOf(
                "Então vamos mexer no sinal. Como fica um gatilho mais visível para essa ação aparecer na hora?",
                "experiment_trigger"
              )
            : decisionOf(
                "Como fica uma versão diferente e mais simples dessa ação?",
                "experiment_adjust"
              );
      }
      break;
    }

    case "meal_selection": {
      const meal = findMeal(message, context);
      next.meal_schedule_id = meal?.id ?? null;
      next.meal_name = meal?.name || message;
      decision = decisionOf(`Como foi ${next.meal_name}?`, "meal_status", MEAL_STATUS_REPLIES);
      break;
    }

    case "meal_status": {
      if (/prefiro/i.test(message)) {
        next.intent = "default";
        next.stage = "situation";
        decision = decisionOf("Tá. O que tu quer conversar agora?", "situation");
        break;
      }
      const status = mapMealStatus(message);
      if (!status) {
        return finish(
          { ...state, clarification_count: state.clarification_count + 1 },
          decisionOf(
            "Quis dizer se a refeição aconteceu, aconteceu em parte ou não aconteceu. Qual se aproxima mais?",
            "meal_status",
            MEAL_STATUS_REPLIES,
            { needsClarification: true }
          ),
          []
        );
      }
      next.meal_status = status;
      next.checkin_recorded = true;
      actions.push({
        type: "create_meal_checkin",
        schedule_id: next.meal_schedule_id ?? null,
        meal_name: next.meal_name ?? null,
        status,
      });
      decision = status === "completed"
        ? decisionOf("O que ajudou essa refeição a acontecer desse jeito?", "meal_success")
        : decisionOf(
            "Tu prefere só registrar ou quer entender o que tornou esse momento mais difícil?",
            "meal_difficulty_consent",
            ["Só registrar", "Quero entender"]
          );
      break;
    }

    case "meal_difficulty_consent": {
      if (RE.decline.test(message) || /s[oó] registrar/i.test(message)) {
        decision = decisionOf(
          "Registrado. Não precisa transformar toda refeição em análise.",
          "done",
          [],
          { kind: "closing", suggestClose: true }
        );
      } else {
        next.situation = next.situation || `Dificuldade em ${next.meal_name || "uma refeição"}`;
        decision = decisionOf(
          "Primeiro, como estava tua fome naquele momento de 0 a 10?",
          "hunger",
          ["Até 3", "Entre 4 e 6", "7 ou mais"]
        );
      }
      break;
    }

    case "meal_success": {
      actions.push({
        type: "save_memory",
        memory: {
          memory_kind: "protective_factor",
          topic: next.meal_name || "refeicao",
          content: message,
          source: "user",
          validation_status: "confirmed",
          confidence: 1,
        },
      });
      decision = decisionOf(
        "Guardei isso como algo que ajudou nessa refeição.",
        "done",
        [],
        { kind: "closing", suggestClose: true }
      );
      break;
    }

  }

  addDifficultyAction(next, actions);
  const captured = toCapturedData(next);
  decision = ConversationDecisionSchema.parse({
    ...decision,
    captured_data: Object.keys(captured).length ? captured : undefined,
  });
  return finish(next, decision, actions);
}

export function validateModelDecision(
  candidate: ConversationDecision,
  fallback: ConversationDecision,
  state: ConversationEngineState,
  message: string
): ConversationDecision {
  const parsed = ConversationDecisionSchema.parse(candidate);
  const groundedCapture = groundedModelCapture(
    parsed.captured_data,
    message,
    extractBehavioralData(message)
  );
  if (fallback.needs_clarification) return fallback;
  if (countQuestions(parsed.reply) > 1) return fallback;
  if (containsBannedCliche(parsed.reply)) return fallback;
  if (!isStageCompatible(parsed.next_stage, state)) return fallback;
  if (asksKnownField(parsed.next_stage, state)) return fallback;

  const mustStayPhysical =
    fallback.next_stage === "hunger" || fallback.next_stage === "physical_context";
  if (mustStayPhysical && parsed.next_stage !== fallback.next_stage) return fallback;
  const cognitiveStages: ConversationStage[] = [
    "cognitive_effect",
    "cognitive_examine",
    "cognitive_perspective",
    "alternative",
    "alternative_personalize",
    "alternative_belief",
    "alternative_refine",
  ];
  if (
    cognitiveStages.includes(fallback.next_stage) &&
    parsed.next_stage !== fallback.next_stage
  ) return fallback;
  const experimentStages: ConversationStage[] = [
    "intervention_point",
    "experiment_action",
    "experiment_trigger",
    "experiment_confidence",
    "experiment_adjust",
    "strategy_review",
    "strategy_review_change",
    "strategy_review_barrier",
    "strategy_review_decision",
    "strategy_review_cognitive",
  ];
  if (
    experimentStages.includes(fallback.next_stage) &&
    parsed.next_stage !== fallback.next_stage
  ) return fallback;

  const memoryUpdates = parsed.memory_updates.map((memory) => {
    const directUserFact =
      memory.source === "user" && normalize(message).includes(normalize(memory.content));
    if (directUserFact) {
      return { ...memory, validation_status: "confirmed" as const, confidence: 1 };
    }
    return {
      ...memory,
      source: "ai" as const,
      validation_status: "proposed" as const,
      confidence: Math.min(memory.confidence, 0.75),
    };
  });

  const strategyProposal = parsed.strategy_proposal
    ? {
        ...parsed.strategy_proposal,
        accepted_by_user:
          parsed.strategy_proposal.accepted_by_user &&
          (state.stage === "strategy" ||
            state.stage === "prepare_action" ||
            state.stage === "experiment_action"),
      }
    : undefined;

  return ConversationDecisionSchema.parse({
    ...parsed,
    captured_data: {
      ...groundedCapture,
      ...(fallback.captured_data || {}),
    },
    memory_updates: memoryUpdates,
    strategy_proposal: strategyProposal,
  });
}

export function actionsFromModelDecision(
  decision: ConversationDecision
): ConversationAction[] {
  return decision.memory_updates.map((memory) => ({
    type: "save_memory" as const,
    memory,
  }));
}

function decisionOf(
  reply: string,
  nextStage: ConversationStage,
  quickReplies: string[] = [],
  options: {
    kind?: ConversationDecision["response_kind"];
    needsClarification?: boolean;
    suggestClose?: boolean;
    strategyProposal?: ConversationDecision["strategy_proposal"];
  } = {}
): ConversationDecision {
  return ConversationDecisionSchema.parse({
    reply,
    quick_replies: quickReplies,
    next_stage: nextStage,
    response_kind: options.kind || (nextStage === "done" ? "closing" : "question"),
    needs_clarification: options.needsClarification || false,
    strategy_proposal: options.strategyProposal,
    suggest_close: options.suggestClose || false,
  });
}

function finish(
  state: ConversationEngineState,
  decision: ConversationDecision,
  actions: ConversationAction[]
): DeterministicTurnResult {
  const nextState = ConversationEngineStateSchema.parse({
    ...state,
    stage: decision.next_stage,
    last_question: decision.reply,
  });
  return {
    decision: ConversationDecisionSchema.parse(decision),
    state: nextState,
    actions,
  };
}

function rephraseStage(
  state: ConversationEngineState,
  context: ConversationContext
): ConversationDecision {
  const replies = clarificationCopy(state, context);
  return decisionOf(
    `Foi mal, falei meio complicado. ${replies.reply}`,
    state.stage,
    replies.quickReplies,
    { needsClarification: true }
  );
}

function alternatePath(
  state: ConversationEngineState,
  context: ConversationContext
): ConversationDecision {
  const byStage: Partial<Record<ConversationStage, { reply: string; quickReplies?: string[] }>> = {
    situation: {
      reply: "Tá. Vamos por um exemplo concreto: qual foi a última situação com comida que te incomodou?",
      quickReplies: ["Hoje", "Ontem", "No fim de semana", "Prefiro falar de agora"],
    },
    context: {
      reply: "Quero só diferenciar uma coisa prática: isso costuma acontecer ou hoje foi exceção?",
      quickReplies: ["Costuma acontecer", "Hoje foi exceção", "Acontece às vezes"],
    },
    hunger: {
      reply: "Pensa nos sinais do corpo: vazio no estômago, fraqueza ou irritação. Tava mais perto de fome baixa, média ou alta?",
      quickReplies: ["Baixa", "Média", "Alta"],
    },
    physical_context: {
      reply: "Vamos pelo relógio: fazia pouco tempo ou muitas horas desde que tu tinha comido?",
      quickReplies: ["Pouco tempo", "Algumas horas", "Muitas horas"],
    },
    thought: {
      reply: "Alguma dessas frases chega perto do que passou, mesmo que não seja exatamente isso?",
      quickReplies: [...THOUGHT_EXAMPLES.slice(0, 5), "Nenhuma dessas"],
    },
    emotion: {
      reply: "Não precisa achar a palavra perfeita. Era mais ansiedade, raiva, frustração, tédio, tristeza ou nenhuma dessas?",
      quickReplies: ["Ansiedade", "Raiva", "Frustração", "Tédio", "Tristeza", "Nenhuma dessas"],
    },
    behavior: {
      reply: "Quis dizer o que aconteceu na prática depois disso. Tu comeu, continuou, parou ou fez outra coisa?",
      quickReplies: ["Comi", "Continuei comendo", "Consegui parar", "Foi outra coisa"],
    },
    consequence: {
      reply: "Na prática, o que mudou depois: a próxima refeição, teu humor ou o resto do dia?",
      quickReplies: ["A próxima refeição", "Meu humor", "O resto do dia"],
    },
    immediate_consequence: {
      reply: "Logo na hora, isso trouxe alívio, prazer, distração ou outra coisa?",
      quickReplies: ["Alívio", "Prazer", "Distração", "Foi outra coisa"],
    },
    later_consequence: {
      reply: "Um pouco depois, veio culpa, frustração, continuação do episódio ou nada relevante?",
      quickReplies: ["Culpa", "Frustração", "Continuei", "Nada relevante"],
    },
    recovery: {
      reply: "Depois disso, tu conseguiu seguir normalmente ou aquilo continuou pesando?",
      quickReplies: ["Segui normalmente", "Pesou por um tempo", "Larguei o resto do dia", "Compensei"],
    },
    decision_point: {
      reply: "Pensa na sequência toda. Teve algum momento em que ainda parecia possível escolher outra coisa?",
    },
    cognitive_effect: {
      reply: "Quis dizer o que esse pensamento puxou na prática. Tu continuou, desistiu do resto do dia ou aconteceu outra coisa?",
      quickReplies: ["Continuei", "Desisti do resto do dia", "Tentei compensar", "Foi outra coisa"],
    },
    cognitive_examine: {
      reply: "Vamos deixar mais concreto: essa frase vale em todas as situações ou apareceu por causa desse momento?",
      quickReplies: ["Vale sempre", "Apareceu nesse momento", "Não tenho certeza"],
    },
    cognitive_perspective: {
      reply: "Se isso tivesse acontecido com alguém que tu gosta, qual parte da conclusão pareceria exagerada?",
    },
    alternative: {
      reply: "Tá. Vamos montar juntos. Qual dessas parece mais verdadeira, mesmo que ainda precise de ajuste?",
      quickReplies: alternativeSuggestions(state),
    },
    alternative_personalize: {
      reply: "Quis dizer se essa frase já parece tua ou se tu quer trocar alguma palavra.",
      quickReplies: ["Assim faz sentido", "Quero ajustar"],
    },
    alternative_belief: {
      reply: "De 0 a 10, quanto essa frase parece verdadeira pra ti agora?",
      quickReplies: ["2", "5", "8", "10"],
    },
    alternative_refine: {
      reply: "O que nessa frase não combina com o que tu vive de verdade?",
    },
    strategy: {
      reply: "Pensa numa ação bem pequena para a próxima vez. Qual dessas chega mais perto?",
      quickReplies: buildStrategySuggestions(state),
    },
    intervention_point: {
      reply: "Pensa na sequência como uma linha. Em qual momento ainda dava para mexer em uma coisa pequena?",
    },
    experiment_action: {
      reply: "Não precisa ser a solução inteira. Qual é a menor ação observável que tu toparia testar?",
      quickReplies: [...safeExperimentOptions(state), "Nenhuma dessas"],
    },
    experiment_trigger: {
      reply: "Qual sinal concreto avisaria que chegou a hora: um horário, um lugar, uma sensação ou uma frase na cabeça?",
    },
    experiment_confidence: {
      reply: "De 0 a 10, qual a chance real de tu testar isso quando o gatilho aparecer?",
      quickReplies: ["2", "5", "7", "9"],
    },
    experiment_adjust: {
      reply: "Como fica uma versão menor dessa ação, que dependa menos de esforço na hora?",
    },
    prepare_situation: {
      reply: "Pensa numa situação que vai acontecer em breve. Onde tu vai estar?",
    },
    prepare_obstacle: {
      reply: "Nessa situação, o que pode apertar mais: fome, falta de opção, pressão das pessoas ou emoção?",
      quickReplies: ["Fome", "Falta de opção", "Pressão das pessoas", "Emoção"],
    },
    prepare_action: {
      reply: "Qual seria a menor preparação possível antes de chegar lá?",
      quickReplies: buildPreparationSuggestions(state.preparation_obstacle || "", context),
    },
    strategy_review: {
      reply: state.pending_strategy_title
        ? "A situação aconteceu e tu testou, aconteceu mas tu não lembrou, ou ainda não aconteceu?"
        : "Qual era a ação que tu queria testar?",
      quickReplies: state.pending_strategy_title
        ? ["Sim, e testei", "Aconteceu, mas não lembrei", "Ainda não aconteceu"]
        : undefined,
    },
    strategy_review_change: {
      reply: "O que mudou na situação quando tu conseguiu testar a ação?",
      quickReplies: ["Ajudou", "Ajudou em parte", "Não mudou nada"],
    },
    strategy_review_barrier: {
      reply: "Qual foi o principal obstáculo para essa ideia entrar ou ajudar naquela hora?",
    },
    strategy_review_decision: {
      reply: "Com isso em mente, vale adaptar, tentar igual ou deixar essa ideia?",
      quickReplies: ["Adaptar", "Tentar igual", "Deixar essa ideia"],
    },
    strategy_review_cognitive: {
      reply: "Tu lembrou da frase e agiu diferente, lembrou mas fez igual, não lembrou ou ela não ajudou?",
      quickReplies: ["Lembrei e agi diferente", "Lembrei, mas fiz igual", "Na hora não lembrei", "Usei, mas não ajudou"],
    },
    meal_selection: {
      reply: "Quis dizer qual momento tu quer registrar: café, almoço, lanche, jantar ou outro?",
      quickReplies: context.meals.length
        ? context.meals.slice(0, 5).map((meal) => meal.name)
        : ["Café da manhã", "Almoço", "Lanche", "Jantar", "Outra"],
    },
    meal_status: {
      reply: "Quis dizer se a refeição aconteceu, aconteceu em parte ou não aconteceu. Qual foi?",
      quickReplies: MEAL_STATUS_REPLIES,
    },
    meal_success: {
      reply: "O que tornou essa refeição mais fácil hoje? Pode ser horário, organização, companhia ou outra coisa.",
      quickReplies: ["Horário", "Organização", "Companhia", "Outra coisa"],
    },
    meal_difficulty_consent: {
      reply: "Tu quer só deixar o registro ou olhar comigo o que dificultou?",
      quickReplies: ["Só registrar", "Quero entender"],
    },
  };
  const copy = byStage[state.stage] || {
    reply: "Não sei se peguei bem essa parte. Me explica de outro jeito?",
  };
  return decisionOf(copy.reply, state.stage, copy.quickReplies || [], {
    needsClarification: true,
  });
}

function clarificationCopy(
  state: ConversationEngineState,
  context: ConversationContext
): { reply: string; quickReplies: string[] } {
  const alternative = alternatePath(state, context);
  return { reply: alternative.reply, quickReplies: alternative.quick_replies };
}

function highHungerDecision(state: ConversationEngineState): ConversationDecision {
  if (state.physical_context) {
    return decisionOf(
      `Antes de culpar tua força de vontade, tem um dado concreto: tua fome tava ${state.hunger_level}/10. Isso costuma acontecer ou hoje foi diferente?`,
      "physical_context",
      ["Costuma acontecer", "Hoje foi diferente"]
    );
  }
  return decisionOf(
    `Tua fome tava ${state.hunger_level}/10. Quanto tempo fazia desde que tu tinha comido?`,
    "physical_context",
    ["Até 2 horas", "De 3 a 5 horas", "Mais de 5 horas"]
  );
}

function cognitiveEntryDecision(state: ConversationEngineState): ConversationDecision {
  const thought = state.automatic_thought || "esse pensamento";
  state.cognitive_stage = "identifying";
  if (!state.behavior) {
    return decisionOf(
      `Tá. O pensamento foi “${shorten(thought)}”. E depois que ele apareceu, o que tu acabou fazendo?`,
      "behavior"
    );
  }
  state.cognitive_stage = "examining_effect";
  return decisionOf(
    `E quando tu comprou essa ideia de que “${shorten(thought)}”, o que aconteceu depois?`,
    "cognitive_effect"
  );
}

function cognitiveExaminationDecision(
  state: ConversationEngineState
): ConversationDecision {
  const thought = normalize(state.automatic_thought || "");
  state.cognitive_stage = "examining_evidence";
  if (/estraguei tudo|estragado tudo|tanto faz|perdi o dia|dia .*perdido|ja que/.test(thought)) {
    return decisionOf(
      "Quando tu fala “tudo”, o que exatamente foi estragado?",
      "cognitive_examine"
    );
  }
  if (/nao consigo me controlar|nunca consigo/.test(thought)) {
    return decisionOf(
      "Isso acontece em qualquer situação ou tem momentos específicos em que fica muito mais difícil?",
      "cognitive_examine"
    );
  }
  if (/eu mereco/.test(thought)) {
    return decisionOf(
      "Quando tu fala “eu mereço”, o que tu tá precisando naquela hora?",
      "cognitive_examine"
    );
  }
  if (/compenso|compensar|amanha/.test(thought)) {
    return decisionOf(
      "Quando tu pensa em compensar amanhã, o que tu espera que isso resolva?",
      "cognitive_examine"
    );
  }
  return decisionOf(
    "Isso é o que aconteceu ou é a conclusão que veio depois?",
    "cognitive_examine"
  );
}

function cognitivePerspectiveDecision(
  state: ConversationEngineState
): ConversationDecision {
  const thought = normalize(state.automatic_thought || "");
  if (/estraguei tudo|estragado tudo|tanto faz|perdi o dia|dia .*perdido|ja que/.test(thought)) {
    return decisionOf(
      "O que aconteceu nessa refeição obriga a próxima a seguir pelo mesmo caminho?",
      "cognitive_perspective"
    );
  }
  if (/nao consigo me controlar|nunca consigo/.test(thought)) {
    return decisionOf(
      "Nas vezes em que tu conseguiu parar ou retomar, o que estava diferente?",
      "cognitive_perspective"
    );
  }
  if (/eu mereco/.test(thought)) {
    return decisionOf(
      "O que tu precisava era do alimento em si ou de algum alívio naquele dia ruim?",
      "cognitive_perspective"
    );
  }
  if (/compenso|compensar|amanha/.test(thought)) {
    return decisionOf(
      "Nas outras vezes em que tu tentou compensar, o que aconteceu depois?",
      "cognitive_perspective"
    );
  }
  return decisionOf(
    "Olhando para os fatos, que parte dessa conclusão parece justa e que parte passou do ponto?",
    "cognitive_perspective"
  );
}

function beliefDecision(state: ConversationEngineState): ConversationDecision {
  state.cognitive_stage = "checking_belief";
  return decisionOf(
    "De 0 a 10, quanto essa frase parece verdadeira pra ti agora?",
    "alternative_belief",
    ["2", "5", "8", "10"]
  );
}

function behaviorDecision(): ConversationDecision {
  return decisionOf("E depois disso, o que tu acabou fazendo?", "behavior");
}

function recoveryDecision(): ConversationDecision {
  return decisionOf(
    "Depois disso tu conseguiu seguir normalmente ou aquilo acabou puxando o resto do dia?",
    "recovery",
    recoveryReplies()
  );
}

function recoveryReplies(): string[] {
  return [
    "Segui normalmente depois",
    "Demorei, mas retomei",
    "Acabei largando o resto do dia",
    "Tentei compensar depois",
  ];
}

function interventionPointDecision(state: ConversationEngineState): ConversationDecision {
  if (state.decision_point) return experimentActionDecision(state);
  if (state.main_influencing_factor === "physical" || (state.hunger_level ?? 0) >= 7) {
    return decisionOf(
      "Olhando a sequência toda, onde seria mais fácil mexer: antes da fome chegar no limite ou quando tu entra na situação?",
      "intervention_point",
      ["Antes da fome chegar no limite", "Quando entro na situação"]
    );
  }
  if (state.main_influencing_factor === "practical") {
    return decisionOf(
      "Olhando a sequência toda, onde parece mais fácil mexer: antes da rotina apertar ou quando o horário já passou?",
      "intervention_point",
      ["Antes da rotina apertar", "Quando o horário passar"]
    );
  }
  if (state.alternative) {
    return decisionOf(
      "Essa frase só ajuda se aparecer na hora certa. Em que momento seria mais útil lembrar dela?",
      "intervention_point"
    );
  }
  return decisionOf(
    "Olhando a sequência toda, onde parece que seria mais fácil mexer em alguma coisa?",
    "intervention_point"
  );
}

function experimentActionDecision(
  state: ConversationEngineState,
  preparation = false
): ConversationDecision {
  const options = safeExperimentOptions(state);
  const intro = preparation
    ? "Tenho duas possibilidades que combinam com o obstáculo que tu trouxe."
    : "Dá para mexer em uma coisa só nesse ponto.";
  return decisionOf(
    `${intro} Qual parece mais possível na tua rotina?`,
    "experiment_action",
    [...options, "Nenhuma dessas"].slice(0, 3),
    {
      strategyProposal: options[0]
        ? {
            title: options[0],
            accepted_by_user: false,
            trigger_context: state.decision_point,
            experiment_action: options[0],
            test_objective: experimentObjective(state),
          }
        : undefined,
    }
  );
}

function safeExperimentOptions(state: ConversationEngineState): string[] {
  if (state.alternative) {
    return [
      "Lembrar dessa frase antes da próxima decisão",
      "Deixar essa frase visível perto do momento do gatilho",
    ];
  }
  if (state.main_influencing_factor === "practical") {
    return [
      "Definir um plano B antes da rotina apertar",
      "Criar um sinal para perceber o horário antes de ficar sem opção",
    ];
  }
  if (state.main_influencing_factor === "physical" || (state.hunger_level ?? 0) >= 7) {
    return [
      "Perceber a fome antes de ela passar de 7",
      "Criar um sinal para não deixar o intervalo chegar ao limite",
    ];
  }
  if (state.main_influencing_factor === "emotional" || state.emotion) {
    return [
      "Ficar dois minutos sem decidir nada",
      "Perceber do que preciso antes de abrir o delivery",
    ];
  }
  return [
    "Fazer uma pausa antes da próxima decisão",
    "Perceber o primeiro sinal de que a sequência começou",
  ];
}

function triggerDecision(state: ConversationEngineState): ConversationDecision {
  const suggestions = [
    state.alternative && state.automatic_thought
      ? `Quando aparecer “${shorten(state.automatic_thought)}”`
      : "",
    state.decision_point ? `Quando ${lowerFirst(shorten(state.decision_point))}` : "",
    state.intent === "prepare" && state.situation
      ? `Quando chegar em “${shorten(state.situation)}”`
      : "",
  ].filter(Boolean);
  return decisionOf(
    "Qual é o sinal claro de que chegou a hora de testar essa ação?",
    "experiment_trigger",
    [...new Set(suggestions)].slice(0, 3)
  );
}

function confidenceDecision(state: ConversationEngineState): ConversationDecision {
  const trigger = state.experiment_trigger || state.decision_point || "a situação aparecer";
  const action = state.experiment_action || state.strategy || "fazer essa ação";
  return decisionOf(
    `Então fica: se ${lowerFirst(shorten(trigger))}, tu vai ${lowerFirst(shorten(action))}. De 0 a 10, qual a chance de tu realmente testar isso?`,
    "experiment_confidence",
    ["2", "5", "7", "9"]
  );
}

function completeExperiment(
  state: ConversationEngineState,
  actions: ConversationAction[]
): ConversationDecision {
  const trigger = state.experiment_trigger || state.decision_point || state.situation;
  const action = state.experiment_action || state.strategy;
  if (!trigger || !action || state.experiment_confidence == null) {
    return decisionOf(
      "Quero deixar o teste observável. Qual ação concreta tu vai experimentar?",
      "experiment_action"
    );
  }
  if (isUnsafeMicroexperiment(`${trigger} ${action}`)) {
    return decisionOf(
      "Não vou guardar compensação ou restrição como estratégia. Qual ação pequena pode aumentar tua margem de escolha sem virar punição?",
      "experiment_action",
      safeExperimentOptions(state),
      { kind: "guidance" }
    );
  }
  state.strategy_recorded = true;
  state.strategy = action;
  actions.push({
    type: "create_strategy_trial",
    title: `Se ${lowerFirst(shorten(trigger))}, então ${lowerFirst(shorten(action))}`,
    trigger_context: trigger,
    experiment_action: action,
    test_objective: state.experiment_objective || experimentObjective(state),
    confidence_level: state.experiment_confidence,
    planned_for: null,
    alternative_thought: state.alternative || null,
  });
  return decisionOf(
    `Combinado como experimento, não como obrigação: se ${lowerFirst(shorten(trigger))}, então ${lowerFirst(shorten(action))}. A confiança ficou em ${state.experiment_confidence}/10. Depois a gente olha o que aconteceu de verdade.`,
    "done",
    [],
    { kind: "closing", suggestClose: true }
  );
}

function experimentObjective(state: ConversationEngineState): string {
  if (state.alternative) return "Fazer a resposta alternativa aparecer antes da próxima decisão.";
  if (state.main_influencing_factor === "physical" || (state.hunger_level ?? 0) >= 7) {
    return "Perceber o fator físico mais cedo e aumentar a margem de escolha.";
  }
  if (state.main_influencing_factor === "practical") {
    return "Reduzir o impacto do obstáculo prático com uma resposta antecipada.";
  }
  if (state.main_influencing_factor === "emotional" || state.emotion) {
    return "Criar espaço entre o estado emocional e a próxima decisão.";
  }
  return "Testar uma resposta pequena e observável nessa situação.";
}

function inferPreparationFactor(text: string): ConversationEngineState["main_influencing_factor"] {
  if (/fome|sono|cansa|intervalo/i.test(text)) return "physical";
  if (/hor[aá]rio|tempo|reuni[aã]o|op[cç][aã]o|rotina|viagem/i.test(text)) return "practical";
  if (/ansios|emo[cç][aã]o|estress|raiva|frustr/i.test(text)) return "emotional";
  if (/pens|estraguei|tanto faz|mere[cç]o/i.test(text)) return "cognitive";
  return "unknown";
}

function strategyUpdate(
  state: ConversationEngineState,
  result: Exclude<NonNullable<ConversationEngineState["strategy_review_result"]>, "not_tested">,
  feedback: string
): Extract<ConversationAction, { type: "update_strategy_trial" }> {
  return {
    type: "update_strategy_trial",
    strategy_trial_id: state.pending_strategy_id!,
    result,
    feedback,
    title: state.pending_strategy_title || "Estratégia",
  };
}

function helpedThisTimeDecision(): ConversationDecision {
  return decisionOf(
    "Ajudou dessa vez. Vou guardar como uma tentativa que ajudou, sem chamar ainda de algo que sempre funciona pra ti.",
    "done",
    [],
    { kind: "closing", suggestClose: true }
  );
}

function addDifficultyAction(
  state: ConversationEngineState,
  actions: ConversationAction[]
) {
  if (!hasBehavioralDifficulty(state) || !assessBehavioralSufficiency(state).sufficient) return;
  const data = toCapturedData(state);
  if (actions.some((action) => action.type === "record_difficulty")) return;
  actions.push({ type: "record_difficulty", data });
  state.difficulty_recorded = true;
}

function toCapturedData(state: ConversationEngineState): ConversationCapturedData {
  const reasons = [
    (state.hunger_level ?? 0) >= 7 ? "Fome alta" : "",
    state.emotion || "",
    state.all_or_nothing ? "Pensamento tudo-ou-nada" : "",
    state.main_influencing_factor === "practical" ? "Obstáculo prático" : "",
    state.main_influencing_factor === "physical" ? "Fator físico" : "",
  ].filter(Boolean);
  return {
    reasons: reasons.length ? reasons : undefined,
    situation: state.situation,
    context: state.context_tags.length ? state.context_tags : undefined,
    physical_context: state.physical_context,
    physical_state: state.physical_state.length ? state.physical_state : undefined,
    automatic_thought: state.automatic_thought,
    emotion: state.emotion,
    emotions: state.emotions.length ? state.emotions : undefined,
    behavior: state.behavior,
    consequences: state.consequence,
    immediate_consequence: state.immediate_consequence,
    later_consequence: state.later_consequence,
    decision_point: state.decision_point,
    compensatory_behavior: state.compensatory_behavior,
    urge: state.urge,
    hunger_intensity: state.hunger_level ?? undefined,
    satiety_intensity: state.satiety_level ?? undefined,
    urge_intensity: state.urge_intensity ?? undefined,
    emotional_intensity: state.emotion_intensity ?? state.guilt_level ?? undefined,
    recovery_outcome: state.recovery_outcome,
    main_influencing_factor: state.main_influencing_factor,
    all_or_nothing: state.all_or_nothing,
    thought_self_identified: state.thought_self_identified,
    emotion_self_identified: state.emotion_self_identified,
    thought_effect: state.thought_effect,
    cognitive_stage: state.cognitive_stage,
    alternative_thought: state.alternative_recorded ? state.alternative : undefined,
    belief_level: state.alternative_recorded
      ? state.belief_level ?? undefined
      : undefined,
    evidence: state.captured_evidence.length ? state.captured_evidence.slice(-20) : undefined,
  };
}

function buildStrategySuggestions(state: ConversationEngineState): string[] {
  return [...safeExperimentOptions(state), "Nenhuma dessas"];
}

function buildPreparationSuggestions(
  obstacle: string,
  context: ConversationContext
): string[] {
  const state = ConversationEngineStateSchema.parse({
    intent: "prepare",
    stage: "prepare_action",
    asked: [],
    preparation_obstacle: obstacle,
    main_influencing_factor: inferPreparationFactor(obstacle),
  });
  return [...safeExperimentOptions(state), ...context.effective_strategies].slice(0, 3);
}

function extractHunger(text: string): number | null {
  const normalized = normalize(text);
  const numeric = normalized.match(
    /(?:fome\s*(?:tava|estava|era|de)?\s*|^)(10|[0-9])(?:\s*\/\s*10)?\b/
  );
  if (numeric) return Number(numeric[1]);
  if (
    /^(alta|muita|forte)$/.test(normalized) ||
    /fome.{0,12}(alta|muita|forte)|morrendo de fome|7 ou mais/.test(normalized)
  ) return 8;
  if (/m[eé]dia|entre 4 e 6/i.test(text)) return 5;
  if (/baixa|at[eé] 3|pouca/i.test(text)) return 2;
  return null;
}

function extractBelief(text: string): number | null {
  const match = normalize(text).match(/(?:^|\b)(10|[0-9])(?:\s*\/\s*10)?(?:\b|$)/);
  return match ? Number(match[1]) : null;
}

function isCognitivelyRelevant(state: ConversationEngineState): boolean {
  if (!state.automatic_thought) return false;
  if (state.main_influencing_factor === "practical") return false;
  return Boolean(
    state.all_or_nothing ||
      RE.cognitiveThought.test(state.automatic_thought) ||
      state.recovery_outcome === "abandonou_dia" ||
      state.recovery_outcome === "compensou" ||
      (state.guilt_level ?? 0) >= 7
  );
}

function alternativeSuggestions(state: ConversationEngineState): string[] {
  const thought = normalize(state.automatic_thought || "");
  if (/nao consigo me controlar|nunca consigo/.test(thought)) {
    return [
      "Isso fica mais difícil em algumas situações, não em todas.",
      "Uma situação difícil não prova que eu nunca consigo.",
      "Posso perceber o que torna alguns momentos mais difíceis.",
      "Nenhuma dessas",
    ];
  }
  if (/eu mereco/.test(thought)) {
    return [
      "Eu precisava de alívio, e posso entender melhor essa necessidade.",
      "Querer algo bom não me obriga a continuar no automático.",
      "Posso querer a comida sem fingir que ela resolve o dia ruim.",
      "Nenhuma dessas",
    ];
  }
  if (/compenso|amanha/.test(thought)) {
    return [
      "Compensar amanhã não apaga o que aconteceu hoje.",
      "Posso retomar sem transformar isso em punição.",
      "Restringir depois costuma prolongar o problema.",
      "Nenhuma dessas",
    ];
  }
  return [
    "Foi uma refeição diferente, não o dia inteiro.",
    "Ainda posso decidir o que faço depois.",
    "Sair do planejado não me obriga a continuar.",
    "Nenhuma dessas",
  ];
}

function isSuggestedAlternative(message: string): boolean {
  const normalized = normalize(message);
  return [
    "foi uma refeicao diferente, nao o dia inteiro",
    "ainda posso decidir o que faco depois",
    "sair do planejado nao me obriga a continuar",
    "isso fica mais dificil em algumas situacoes, nao em todas",
    "uma situacao dificil nao prova que eu nunca consigo",
    "posso perceber o que torna alguns momentos mais dificeis",
    "eu precisava de alivio, e posso entender melhor essa necessidade",
    "querer algo bom nao me obriga a continuar no automatico",
    "posso querer a comida sem fingir que ela resolve o dia ruim",
    "compensar amanha nao apaga o que aconteceu hoje",
    "posso retomar sem transformar isso em punicao",
    "restringir depois costuma prolongar o problema",
  ].includes(normalized.replace(/[.!?]+$/, ""));
}

function extractThought(text: string): string {
  const match = text.match(/(j[aá] estraguei tudo|tanto faz|amanh[ãa] come[cç]o[^.!?]*)/i);
  return match?.[1] || text;
}

function mapRecovery(
  text: string
): ConversationEngineState["recovery_outcome"] {
  if (/segui normalmente|retomei na pr[oó]xima|normal/i.test(text)) return "retomou";
  if (/demorei|pesou por um tempo/i.test(text)) return "retomou_depois";
  if (/larg|abandon|resto do dia|desisti/i.test(text)) return "abandonou_dia";
  if (/compens|pulei|jejum|treinar|malhar/i.test(text)) return "compensou";
  return "indefinido";
}

function mapStrategyResult(
  text: string
): "helped" | "partially_helped" | "did_not_help" | null {
  if (/em parte|um pouco|parcial/i.test(text)) return "partially_helped";
  if (/n[ãa]o ajudou|n[ãa]o mudou|mudou nada/i.test(text)) return "did_not_help";
  if (/ajudou|funcionou/i.test(text)) return "helped";
  return null;
}

function mapStrategyOccurrence(
  text: string
): "tested" | "did_not_use" | "situation_not_occurred" | "discarded" | null {
  if (/n[ãa]o quero|deixar|parar com/i.test(text)) return "discarded";
  if (/n[ãa]o aconteceu|ainda n[ãa]o|situa[cç][aã]o n[ãa]o/i.test(text)) {
    return "situation_not_occurred";
  }
  if (/n[ãa]o lembrei|nem lembrei|esqueci/i.test(text)) return "did_not_use";
  if (/sim|testei|usei|experimentei|aconteceu/i.test(text)) return "tested";
  return null;
}

function mapAlternativeResult(
  text: string
): "helped_changed" | "thought_only" | "did_not_use" | "did_not_help" | null {
  if (/agi diferente|fiz diferente|mudei o que fiz/i.test(text)) return "helped_changed";
  if (/fiz igual|comportamento igual|n[ãa]o mudou o que fiz/i.test(text)) return "thought_only";
  if (/n[ãa]o lembrei|nem lembrei|esqueci/i.test(text)) return "did_not_use";
  if (/n[ãa]o ajudou/i.test(text)) return "did_not_help";
  return null;
}

function mapMealStatus(
  text: string
): ConversationEngineState["meal_status"] | null {
  if (/em parte|parcial/i.test(text)) return "partial";
  if (/n[ãa]o realizei|n[ãa]o aconteceu|n[ãa]o fiz/i.test(text)) return "not_completed";
  if (/realizei|aconteceu|fiz/i.test(text)) return "completed";
  return null;
}

function findMeal(message: string, context: ConversationContext) {
  const wanted = normalize(message);
  return context.meals.find((meal) => normalize(meal.name) === wanted);
}

function asksKnownField(
  stage: ConversationStage,
  state: ConversationEngineState
): boolean {
  const known: Partial<Record<ConversationStage, unknown>> = {
    situation: state.situation,
    context: state.context_recurrence,
    hunger: state.hunger_level,
    physical_context: state.physical_context,
    thought: state.automatic_thought,
    emotion: state.emotions.length ? state.emotions : state.emotion,
    behavior: state.behavior,
    consequence: state.consequence,
    immediate_consequence: state.immediate_consequence,
    later_consequence: state.later_consequence,
    recovery: state.recovery_outcome,
    decision_point: state.decision_point,
    cognitive_effect: state.thought_effect,
    cognitive_examine: state.cognitive_examination,
    cognitive_perspective: state.cognitive_perspective,
    alternative: state.alternative,
    alternative_belief: state.belief_level,
    alternative_refine: state.alternative_doubt,
    strategy: state.strategy,
    prepare_situation: state.situation,
    prepare_obstacle: state.preparation_obstacle,
    meal_selection: state.meal_name,
    meal_status: state.meal_status,
  };
  return known[stage] !== undefined && stage !== state.stage;
}

function isStageCompatible(
  candidate: ConversationStage,
  state: ConversationEngineState
): boolean {
  const current = state.stage;
  const preparation: ConversationStage[] = [
    "prepare_situation",
    "prepare_obstacle",
    "prepare_action",
    "strategy",
    "intervention_point",
    "experiment_action",
    "experiment_trigger",
    "experiment_confidence",
    "experiment_adjust",
    "done",
  ];
  const review: ConversationStage[] = [
    "strategy_review",
    "strategy_review_change",
    "strategy_review_barrier",
    "strategy_review_decision",
    "strategy_review_cognitive",
    "experiment_action",
    "experiment_trigger",
    "experiment_confidence",
    "experiment_adjust",
    "done",
  ];
  const meal: ConversationStage[] = [
    "meal_selection",
    "meal_status",
    "meal_success",
    "meal_difficulty_consent",
    "situation",
    "hunger",
    "physical_context",
    "thought",
    "emotion",
    "behavior",
    "consequence",
    "immediate_consequence",
    "later_consequence",
    "recovery",
    "decision_point",
    "cognitive_effect",
    "cognitive_examine",
    "cognitive_perspective",
    "alternative",
    "alternative_personalize",
    "alternative_belief",
    "alternative_refine",
    "strategy",
    "intervention_point",
    "experiment_action",
    "experiment_trigger",
    "experiment_confidence",
    "experiment_adjust",
    "done",
  ];
  if (preparation.includes(current)) return preparation.includes(candidate);
  if (review.includes(current)) return review.includes(candidate);
  if (meal.includes(current) && current.startsWith("meal_")) {
    return meal.includes(candidate);
  }
  return !candidate.startsWith("meal_") && !candidate.startsWith("prepare_");
}

function containsBannedCliche(reply: string): boolean {
  return /uma escolha n[ãa]o define sua jornada|seja gentil consigo|honre seu processo|pratique autocompaix[aã]o|excelente reflex[aã]o|parab[eé]ns por reconhecer|como voc[eê] deseja cuidar de si/i.test(
    reply
  );
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) || []).length;
}

function mergeText(current: string | undefined, addition: string): string {
  if (!current) return addition;
  if (normalize(current).includes(normalize(addition))) return current;
  return `${current} ${addition}`.slice(0, 1000);
}

function shorten(text: string): string {
  const trimmed = text.trim().replace(/[.!?]+$/, "");
  return trimmed.length > 90 ? `${trimmed.slice(0, 90).trim()}...` : trimmed;
}

function lowerFirst(text: string): string {
  return text ? `${text[0].toLocaleLowerCase("pt-BR")}${text.slice(1)}` : text;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
