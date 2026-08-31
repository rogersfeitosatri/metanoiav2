import {
  ConversationCapturedDataSchema,
  ConversationEngineStateSchema,
  type BehavioralEvidence,
  type ConversationCapturedData,
  type ConversationEngineState,
} from "./schemas";

const EMOTIONS: Array<[string, RegExp]> = [
  ["ansiedade", /\bansios[ao]s?\b|\bansiedade\b/i],
  ["frustração", /\bfrustrad[ao]s?\b|\bfrustra[cç][aã]o\b/i],
  ["raiva", /\braiva\b|\birritad[ao]s?\b/i],
  ["tristeza", /\btriste(?:za)?\b/i],
  ["culpa", /\bculpa(?:d[ao])?\b/i],
  ["tédio", /\bt[eé]dio\b|\bentediad[ao]s?\b/i],
  ["solidão", /\bsolid[aã]o\b|\bsozinh[ao]s?\b/i],
  ["vergonha", /\bvergonha\b|\benvergonhad[ao]s?\b/i],
];

const CONTEXTS: Array<[string, RegExp]> = [
  ["trabalho", /\btrabalho\b|\bchefe\b|\bescrit[oó]rio\b/i],
  ["reunião", /\breuni[aã]o\b/i],
  ["casa", /\bem casa\b|\bcheguei em casa\b/i],
  ["restaurante", /\brestaurante\b/i],
  ["sozinho", /\bsozinh[ao]s?\b/i],
  ["amigos", /\bamig[ao]s?\b/i],
  ["família", /\bfam[ií]lia\b|\bm[aã]e\b|\bpai\b|\birm[aã][oã]s?\b/i],
  ["festa", /\bfesta\b|\banivers[aá]rio\b/i],
  ["viagem", /\bviagem\b|\bviajando\b/i],
  ["rotina alterada", /\bfora da rotina\b|\brotina mudou\b|\brotina alterada\b/i],
];

const PHYSICAL_STATES: Array<[string, RegExp]> = [
  ["fome", /\bfome\b|\bfamint[ao]\b|\bmorrendo de fome\b/i],
  ["cansaço", /\bcansa[cç]o\b|\bcansad[ao]s?\b/i],
  ["sono", /\bsono\b|\bsonolent[ao]s?\b/i],
  ["tensão", /\btens[aã]o\b|\btens[ao]s?\b/i],
  ["estômago vazio", /\best[oô]mago vazio\b|\bvazio no est[oô]mago\b/i],
  ["desconforto físico", /\bdesconforto\b|\benjoo\b|\bdor\b/i],
  ["vontade específica", /\bvontade (?:forte )?(?:de|por)\b|\bfissura\b/i],
];

export interface BehavioralSufficiency {
  sufficient: boolean;
  missing: Array<"situation" | "factor" | "outcome">;
  practical: boolean;
  shouldExplorePhysical: boolean;
  shouldExploreThought: boolean;
  shouldExploreEmotion: boolean;
}

export function extractBehavioralData(message: string): ConversationCapturedData {
  const text = message.trim();
  if (!text) return {};

  const context = collectLabels(text, CONTEXTS);
  const physicalState = collectLabels(text, PHYSICAL_STATES);
  const emotions = collectLabels(text, EMOTIONS);
  const emotionIntensity = extractScale(
    text,
    /\bansiedade\b|\bfrustra[cç][aã]o\b|\braiva\b|\btristeza\b|\bculpa\b|\bt[eé]dio\b|\bsolid[aã]o\b|\bvergonha\b/i
  );
  const hunger = extractScale(text, /\bfome\b/i);
  const satiety = extractScale(text, /\bsaciedad[eo]\b|\bsatisfeit[ao]\b/i);
  const urge = extractUrge(text);
  const urgeIntensity = extractScale(text, /\bvontade\b|\bimpulso\b|\bfissura\b/i);
  const thought = extractAutomaticThought(text);
  const behavior = extractBehavior(text);
  const compensation = extractCompensation(text);
  const immediateConsequence = extractImmediateConsequence(text);
  const laterConsequence = extractLaterConsequence(text);
  const recovery = extractRecovery(text);
  const decisionPoint = extractDecisionPoint(text);
  const mainFactor = inferMainFactor({
    text,
    emotions,
    hunger,
    thought,
    behavior,
    compensation,
  });

  const captured: ConversationCapturedData = {
    context: context.length ? context : undefined,
    physical_state: physicalState.length ? physicalState : undefined,
    hunger_intensity: hunger ?? undefined,
    satiety_intensity: satiety ?? undefined,
    urge: urge || undefined,
    urge_intensity: urgeIntensity ?? undefined,
    automatic_thought: thought || undefined,
    thought_self_identified: thought ? true : undefined,
    emotion: emotions[0],
    emotions: emotions.length ? emotions : undefined,
    emotion_self_identified: emotions.length ? true : undefined,
    emotional_intensity: emotionIntensity ?? undefined,
    behavior: behavior || undefined,
    immediate_consequence: immediateConsequence || undefined,
    later_consequence: laterConsequence || undefined,
    consequences: laterConsequence || immediateConsequence || undefined,
    recovery_outcome: recovery || undefined,
    compensatory_behavior: compensation || undefined,
    decision_point: decisionPoint || undefined,
    main_influencing_factor: mainFactor,
    all_or_nothing: thought ? isAllOrNothing(thought) : undefined,
  };
  captured.evidence = buildEvidence(captured, text);
  return ConversationCapturedDataSchema.parse(captured);
}

export function mergeCapturedDataIntoState(
  rawState: ConversationEngineState,
  captured: ConversationCapturedData | undefined
): ConversationEngineState {
  if (!captured) return ConversationEngineStateSchema.parse(rawState);
  const state = { ...rawState };

  state.context_tags = mergeList(state.context_tags, captured.context);
  state.physical_state = mergeList(state.physical_state, captured.physical_state);
  state.emotions = mergeList(
    state.emotions,
    captured.emotions || (captured.emotion ? [captured.emotion] : undefined)
  );
  state.captured_evidence = mergeEvidence(
    state.captured_evidence,
    captured.evidence
  );

  if (captured.physical_context) {
    state.physical_context = mergeText(state.physical_context, captured.physical_context);
  }
  if (captured.automatic_thought) {
    state.automatic_thought = mergeText(
      state.automatic_thought,
      captured.automatic_thought
    );
  }
  if (captured.emotion && !state.emotion) state.emotion = captured.emotion;
  if (state.emotions[0]) state.emotion = state.emotions[0];
  if (captured.behavior) state.behavior = mergeText(state.behavior, captured.behavior);
  if (captured.urge) state.urge = mergeText(state.urge, captured.urge);
  if (captured.immediate_consequence) {
    state.immediate_consequence = mergeText(
      state.immediate_consequence,
      captured.immediate_consequence
    );
  }
  if (captured.later_consequence || captured.consequences) {
    state.later_consequence = mergeText(
      state.later_consequence,
      captured.later_consequence || captured.consequences!
    );
  }
  if (captured.consequences) {
    state.consequence = mergeText(state.consequence, captured.consequences);
  }
  if (captured.compensatory_behavior) {
    state.compensatory_behavior = mergeText(
      state.compensatory_behavior,
      captured.compensatory_behavior
    );
  }
  if (captured.decision_point) {
    state.decision_point = mergeText(state.decision_point, captured.decision_point);
  }

  if (captured.hunger_intensity != null) {
    state.hunger_level = captured.hunger_intensity;
    state.noticed_hunger_early = captured.hunger_intensity <= 6;
  }
  if (captured.satiety_intensity != null) state.satiety_level = captured.satiety_intensity;
  if (captured.urge_intensity != null) state.urge_intensity = captured.urge_intensity;
  if (captured.emotional_intensity != null) {
    state.emotion_intensity = captured.emotional_intensity;
  }
  if (captured.recovery_outcome) state.recovery_outcome = captured.recovery_outcome;
  if (captured.thought_self_identified != null) {
    state.thought_self_identified = captured.thought_self_identified;
  }
  if (captured.emotion_self_identified != null) {
    state.emotion_self_identified = captured.emotion_self_identified;
  }
  if (captured.all_or_nothing != null) state.all_or_nothing = captured.all_or_nothing;
  if (captured.main_influencing_factor) {
    state.main_influencing_factor = mergeFactor(
      state.main_influencing_factor,
      captured.main_influencing_factor
    );
  }

  return ConversationEngineStateSchema.parse(state);
}

export function groundedModelCapture(
  candidate: ConversationCapturedData | undefined,
  message: string,
  deterministic: ConversationCapturedData
): ConversationCapturedData {
  if (!candidate) return deterministic;
  const result: ConversationCapturedData = { ...deterministic };
  const normalizedMessage = normalize(message);
  const stringFields: Array<keyof ConversationCapturedData> = [
    "physical_context",
    "automatic_thought",
    "emotion",
    "behavior",
    "consequences",
    "immediate_consequence",
    "later_consequence",
    "decision_point",
    "compensatory_behavior",
    "urge",
  ];
  for (const field of stringFields) {
    const value = candidate[field];
    if (typeof value === "string" && normalizedMessage.includes(normalize(value))) {
      Object.assign(result, { [field]: value });
    }
  }
  result.context = mergeList(
    result.context,
    candidate.context?.filter((value) => normalizedMessage.includes(normalize(value)))
  );
  result.physical_state = mergeList(
    result.physical_state,
    candidate.physical_state?.filter((value) =>
      normalizedMessage.includes(normalize(value))
    )
  );
  result.emotions = mergeList(
    result.emotions,
    candidate.emotions?.filter((value) => normalizedMessage.includes(normalize(value)))
  );
  return ConversationCapturedDataSchema.parse(result);
}

export function assessBehavioralSufficiency(
  state: ConversationEngineState
): BehavioralSufficiency {
  const practical =
    state.main_influencing_factor === "practical" ||
    /reuni[aã]o|sem tempo|hor[aá]rio|rotina|trabalho/i.test(
      `${state.situation || ""} ${state.physical_context || ""}`
    );
  const hasFactor = Boolean(
    state.main_influencing_factor && state.main_influencing_factor !== "unknown"
  );
  const hasOutcome = Boolean(state.behavior || state.recovery_outcome);
  const missing: BehavioralSufficiency["missing"] = [];
  if (!state.situation) missing.push("situation");
  if (!hasFactor) missing.push("factor");
  if (!hasOutcome) missing.push("outcome");
  const foodOrUrge = /comi|comer|comida|refei[cç][aã]o|fome|vontade|doce|delivery/i.test(
    `${state.situation || ""} ${state.behavior || ""} ${state.urge || ""}`
  );
  return {
    sufficient: missing.length === 0,
    missing,
    practical,
    shouldExplorePhysical: foodOrUrge && state.hunger_level == null,
    shouldExploreThought:
      !practical && !state.automatic_thought && Boolean(state.emotions.length),
    shouldExploreEmotion:
      !practical && !state.emotions.length && Boolean(state.automatic_thought),
  };
}

export function hasBehavioralDifficulty(state: ConversationEngineState): boolean {
  if (state.intent === "prepare" || state.intent === "review_strategy") return false;
  return Boolean(
    state.situation &&
      (state.behavior ||
        state.urge ||
        (state.hunger_level ?? 0) >= 7 ||
        state.automatic_thought ||
        state.emotions.length ||
        state.compensatory_behavior ||
        state.recovery_outcome)
  );
}

function buildEvidence(
  captured: ConversationCapturedData,
  message: string
): BehavioralEvidence[] {
  const entries: Array<[BehavioralEvidence["field"], unknown]> = [
    ["context", captured.context],
    ["physical_state", captured.physical_state],
    ["hunger", captured.hunger_intensity],
    ["satiety", captured.satiety_intensity],
    ["automatic_thought", captured.automatic_thought],
    ["emotion", captured.emotions || captured.emotion],
    ["urge", captured.urge],
    ["behavior", captured.behavior],
    ["immediate_consequence", captured.immediate_consequence],
    ["later_consequence", captured.later_consequence],
    ["recovery", captured.recovery_outcome],
    ["compensation", captured.compensatory_behavior],
    ["decision_point", captured.decision_point],
    ["main_factor", captured.main_influencing_factor],
  ];
  return entries.flatMap(([field, value]) => {
    if (value == null || value === "" || (Array.isArray(value) && !value.length)) return [];
    return [{
      field,
      value: Array.isArray(value) ? value.join(", ") : String(value),
      evidence: message,
      source: "user" as const,
      status: "reported" as const,
      confidence: 1,
    }];
  });
}

function collectLabels(text: string, definitions: Array<[string, RegExp]>): string[] {
  return definitions.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function extractAutomaticThought(text: string): string | null {
  const known = text.match(
    /\b(j[aá] (?:estraguei|(?:tinha )?estragad[oa]) tudo|eu mere[cç]o(?: comer isso| alguma coisa boa)?|s[oó] hoje|(?:depois|amanh[ãa]) (?:eu )?compenso|j[aá] que (?:comecei|foi),? tanto faz|agora tanto faz|n[aã]o consigo me controlar|nunca consigo (?:manter|me controlar)|(?:o )?dia (?:j[aá] )?foi perdido)\b/i
  );
  if (known) return known[1];
  const stated = text.match(
    /\b(?:pensei|pensava|passou pela minha cabe[cç]a)\s*(?:que|:)?\s*["'“”]?([^.!?;\n"”']{2,180})/i
  );
  return stated?.[1]?.trim() || null;
}

function extractBehavior(text: string): string | null {
  const patterns = [
    /\b(n[ãa]o almocei[^,.!?;]*)/i,
    /\b(n[ãa]o jantei[^,.!?;]*)/i,
    /\b(pulei (?:o |a )?(?:almo[cç]o|jantar|caf[eé](?: da manh[ãa])?)[^,.!?;]*)/i,
    /\b(continuei comendo[^,.!?;]*)/i,
    /\b(n[ãa]o consegui parar[^,.!?;]*)/i,
    /\b(consegui parar[^,.!?;]*)/i,
    /\b(fui comer[^,.!?;]*)/i,
    /\b(pedi[^,.!?;]*(?:delivery|comida|pizza|hamb[uú]rguer)[^,.!?;]*)/i,
    /\b(?:acabei\s+)?(comi\b[^,.!?;]*)/i,
    /\b(retomei[^,.!?;]*)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return (match[1] || match[0]).trim();
  }
  return null;
}

function extractUrge(text: string): string | null {
  const match = text.match(/\b((?:muita |forte |intensa )?vontade (?:de|por) [^,.!?;]{2,120}|fissura (?:de|por) [^,.!?;]{2,120})/i);
  return match?.[1]?.trim() || null;
}

function extractCompensation(text: string): string | null {
  const match = text.match(
    /\b(n[ãa]o vou jantar[^,.!?;]*|amanh[ãa] n[ãa]o (?:vou )?comer[^,.!?;]*|vou (?:correr|treinar|malhar) (?:para|pra) (?:queimar|compensar)[^,.!?;]*|vou cortar tudo[^,.!?;]*|tentei compensar[^,.!?;]*)/i
  );
  return match?.[1]?.trim() || null;
}

function extractImmediateConsequence(text: string): string | null {
  const match = text.match(
    /\b(?:na hora|logo depois|de imediato)[^.!?;]*(al[ií]vio|prazer|distra[cç][aã]o|acalmei|ansiedade (?:baixou|diminuiu)|perda de controle)[^.!?;]*/i
  );
  return match?.[0]?.trim() || null;
}

function extractLaterConsequence(text: string): string | null {
  const match = text.match(
    /\b(?:depois|mais tarde|no restante do dia)[^.!?;]*(culpa|frustra[cç][aã]o|continuei|compensei|retomei|voltei ao normal)[^.!?;]*/i
  );
  return match?.[0]?.trim() || null;
}

function extractDecisionPoint(text: string): string | null {
  const match = text.match(
    /\b(?:dava para|poderia|ainda dava|o momento foi|antes de)[^.!?;]*(?:parar|escolher|decidir|fazer diferente|pedir|comer)[^.!?;]*/i
  );
  return match?.[0]?.trim() || null;
}

function extractRecovery(text: string): ConversationCapturedData["recovery_outcome"] | null {
  if (/segui normalmente|retomei na pr[oó]xima|voltei ao normal/i.test(text)) return "retomou";
  if (/demorei[^.!?]*(?:retomei|voltei)|retomei depois/i.test(text)) return "retomou_depois";
  if (/larguei|abandonei|desisti do resto|puxou o resto do dia/i.test(text)) return "abandonou_dia";
  if (/compens|n[ãa]o vou jantar|amanh[ãa] n[ãa]o (?:vou )?comer|vou (?:correr|treinar|malhar) (?:para|pra) queimar/i.test(text)) {
    return "compensou";
  }
  return null;
}

function inferMainFactor(input: {
  text: string;
  emotions: string[];
  hunger: number | null;
  thought: string | null;
  behavior: string | null;
  compensation: string | null;
}): ConversationCapturedData["main_influencing_factor"] {
  const factors = new Set<Exclude<ConversationCapturedData["main_influencing_factor"], undefined | "mixed" | "unknown">>();
  if (/reuni[aã]o|sem tempo|hor[aá]rio|trabalho[^.!?]*(?:impediu|atrapalhou)|n[ãa]o tinha op[cç][aã]o/i.test(input.text)) {
    factors.add("practical");
  }
  if ((input.hunger ?? 0) >= 7 || /muitas horas sem comer|n[ãa]o comia desde|est[oô]mago vazio/i.test(input.text)) {
    factors.add("physical");
  }
  if (input.emotions.length || /briguei|discuss[aã]o|dia horr[ií]vel/i.test(input.text)) {
    factors.add("emotional");
  }
  if (input.thought) factors.add("cognitive");
  if (/press[aã]o|coment[aá]rio|com amigos|fam[ií]lia|festa/i.test(input.text)) factors.add("social");
  if (input.compensation) factors.add("cognitive");
  if (factors.size > 1) return "mixed";
  return [...factors][0] || (input.behavior ? "unknown" : undefined);
}

function extractScale(text: string, anchor: RegExp): number | null {
  const anchored = text.match(
    new RegExp(`(?:${anchor.source})[^0-9]{0,18}(10|[0-9])(?:\\s*\\/\\s*10)?`, "i")
  );
  if (anchored) return Number(anchored[1]);
  if (anchor.test(text) && /\b(?:muito alta|muita|forte|intensa)\b/i.test(text)) return 8;
  return null;
}

function mergeList(current: string[] | undefined, additions: string[] | undefined): string[] {
  const result = [...(current || [])];
  for (const addition of additions || []) {
    if (!result.some((item) => normalize(item) === normalize(addition))) result.push(addition);
  }
  return result;
}

function mergeEvidence(
  current: BehavioralEvidence[] | undefined,
  additions: BehavioralEvidence[] | undefined
): BehavioralEvidence[] {
  const result = [...(current || [])];
  for (const addition of additions || []) {
    if (!result.some((item) => item.field === addition.field && normalize(item.value) === normalize(addition.value))) {
      result.push(addition);
    }
  }
  return result.slice(-60);
}

function mergeFactor(
  current: ConversationEngineState["main_influencing_factor"],
  addition: ConversationEngineState["main_influencing_factor"]
) {
  if (!current || current === "unknown") return addition;
  if (!addition || addition === "unknown" || current === addition) return current;
  return "mixed" as const;
}

function mergeText(current: string | undefined, addition: string): string {
  if (!current) return addition;
  if (normalize(current).includes(normalize(addition))) return current;
  if (normalize(addition).includes(normalize(current))) return addition;
  return `${current} | ${addition}`.slice(0, 1000);
}

function isAllOrNothing(text: string): boolean {
  return /estraguei tudo|estragado tudo|j[aá] que|tanto faz|perdi o dia|dia (?:j[aá] )?foi perdido|amanh[ãa] come[cç]o/i.test(text);
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}
