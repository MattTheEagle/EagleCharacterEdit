import { validateBases, type AttributeMethod, type DraftBases, type RuleViolation } from "./ability-rules";
import { valuesOf, type AttributeModel } from "./attributes";
import {
  ABILITY_KEYS,
  type AbilityChange,
  type AbilityKey,
  type CharacterUpdateInput,
  type CharacterUpdateOutcome,
  type PendingCharacterUpdate,
} from "./character-update";

export type AttributeChange =
  | { readonly status: "not-editable" }
  | { readonly status: "invalid"; readonly violation: RuleViolation }
  | { readonly status: "unchanged" }
  | { readonly status: "change"; readonly input: CharacterUpdateInput };

// Builds the one bounded write from the baseline the draft started on. `from` is the stored score of that baseline and
// `to` keeps the improvement bonus, so a later change on the sheet is answered by Flight Control with a conflict.
export function attributeChange(baseline: AttributeModel, method: AttributeMethod, draft: DraftBases): AttributeChange {
  const scores = baseline.scores;
  if (!baseline.editable || !scores || !baseline.uuid) return { status: "not-editable" };
  const violation = validateBases(method, draft, valuesOf(scores, "bonus"));
  if (violation) return { status: "invalid", violation };
  const abilities: Partial<Record<AbilityKey, AbilityChange>> = {};
  for (const key of ABILITY_KEYS) {
    const to = draft[key]! + scores[key].bonus;
    if (to !== scores[key].stored) abilities[key] = { from: scores[key].stored, to };
  }
  if (Object.keys(abilities).length === 0) return { status: "unchanged" };
  return { status: "change", input: { uuid: baseline.uuid, revision: baseline.revision, abilities } };
}

// Whether the character changed in the world since the draft was started (the save would then be a conflict).
export function baselineChanged(baseline: AttributeModel, current: AttributeModel): boolean {
  if (baseline.revision !== current.revision || !baseline.scores || !current.scores) return true;
  return ABILITY_KEYS.some((key) =>
    baseline.scores![key].stored !== current.scores![key].stored || baseline.scores![key].bonus !== current.scores![key].bonus);
}

// The update store has one slot per world and user, so a pending write can belong to another character.
export type PendingRelation = "none" | "this" | "other";

export function pendingRelation(pending: PendingCharacterUpdate | undefined, uuid: string | undefined): PendingRelation {
  if (!pending) return "none";
  return uuid !== undefined && pending.uuid === uuid ? "this" : "other";
}

export function pendingInput(pending: PendingCharacterUpdate): CharacterUpdateInput {
  return { uuid: pending.uuid, revision: pending.revision, abilities: pending.abilities };
}

export interface OutcomeReaction {
  readonly level: "info" | "warn";
  readonly key: string;
  // Drop the draft and start again from the current world state.
  readonly discardDraft: boolean;
  // Remove the stored operation after the fresh read (a conflict stays stored by the adapter until then).
  readonly clearStore: boolean;
}

export function reactionTo(outcome: CharacterUpdateOutcome): OutcomeReaction {
  switch (outcome.status) {
    case "updated":
    case "retry":
      return { level: "info", key: "EAGLECHARACTEREDIT.attributes.saved", discardDraft: true, clearStore: false };
    case "conflict":
      return { level: "warn", key: "EAGLECHARACTEREDIT.attributes.conflict", discardDraft: true, clearStore: true };
    case "unknown":
      return { level: "warn", key: "EAGLECHARACTEREDIT.attributes.unknown", discardDraft: true, clearStore: false };
    case "denied":
      return { level: "warn", key: "EAGLECHARACTEREDIT.attributes.denied", discardDraft: false, clearStore: false };
    case "unavailable":
      return { level: "warn", key: "EAGLECHARACTEREDIT.attributes.noGamemaster", discardDraft: false, clearStore: false };
    case "failure":
      return { level: "warn", key: "EAGLECHARACTEREDIT.attributes.failed", discardDraft: false, clearStore: false };
  }
}
