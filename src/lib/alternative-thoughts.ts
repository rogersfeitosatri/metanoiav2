import type { AlternativeThought } from "./types";

export interface AlternativeThoughtInput {
  user_id: string;
  thought_record_id: string;
  original_thought: string;
  alternative: string;
  belief_level: number;
}

export function resolveAlternativeThought(
  existing: AlternativeThought | undefined,
  input: AlternativeThoughtInput,
  id: string,
  nowIso: string
): AlternativeThought {
  if (existing) {
    return {
      ...existing,
      original_thought: input.original_thought,
      alternative: input.alternative,
      belief_level: input.belief_level,
      updated_at: nowIso,
    };
  }
  return {
    id,
    user_id: input.user_id,
    thought_record_id: input.thought_record_id,
    original_thought: input.original_thought,
    alternative: input.alternative,
    belief_level: input.belief_level,
    result: "pending",
    times_used: 0,
    last_used_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}
