import type { AbilityValues } from "./ability-rules";
import type { CharacterReadModel } from "./character-read";
import { ABILITY_KEYS, type AbilityKey } from "./character-update";

// dnd5e falls back to CONFIG.DND5E.maxAbilityScore when an ability has no stored maximum.
export const DEFAULT_ABILITY_MAX = 20;
const WORLD_ACTOR_UUID = /^Actor\.[A-Za-z0-9]{16}$/;

export interface AbilityScore {
  readonly key: AbilityKey;
  // The stored score (_source): what the dnd5e sheet edits and character.update compares and writes.
  readonly stored: number;
  // The sum of the applied ability score improvements of all embedded items.
  readonly bonus: number;
  readonly base: number;
  // The prepared score after Active Effects, for display only.
  readonly final: number | undefined;
  readonly max: number;
}

export interface AttributeModel {
  // Undefined when a stored score is not a whole number; the editor then shows nothing it could misread.
  readonly scores: Readonly<Record<AbilityKey, AbilityScore>> | undefined;
  // False when anything the write depends on is irregular: the tab is read-only then (fail closed).
  readonly editable: boolean;
  readonly uuid: string | undefined;
  readonly revision: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

// system.advancement is an object keyed by id since dnd5e 4; older data may still be an array.
function advancementEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const entries = record(value);
  return entries ? Object.values(entries) : [];
}

// Only applied improvements of type "asi" count: those are what dnd5e added to the stored score and what its reverse
// subtracts again. An improvement taken as a feat adds nothing itself; the feat's own advancement is its own item.
function improvementBonus(model: CharacterReadModel): { bonus: Record<AbilityKey, number>; regular: boolean } {
  const bonus = Object.fromEntries(ABILITY_KEYS.map((key) => [key, 0])) as Record<AbilityKey, number>;
  let regular = true;
  for (const item of model.items) {
    if (!item.advancement.present) continue;
    for (const entry of advancementEntries(item.advancement.value)) {
      const advancement = record(entry);
      if (advancement?.type !== "AbilityScoreImprovement") continue;
      const value = record(advancement.value);
      if (value?.type !== "asi" || value.assignments === undefined || value.assignments === null) continue;
      const assignments = record(value.assignments);
      if (!assignments) {
        regular = false;
        continue;
      }
      for (const key of ABILITY_KEYS) {
        const delta = assignments[key];
        if (delta === undefined) continue;
        if (typeof delta !== "number" || !Number.isSafeInteger(delta)) regular = false;
        else bonus[key] += delta;
      }
    }
  }
  return { bonus, regular };
}

function revisionOf(source: Record<string, unknown> | undefined): number | undefined {
  const marker = record(record(record(source?.flags)?.["eagle-character-edit"])?.characterWrite);
  if (!marker) return 0;
  const revision = marker.revision;
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined;
}

export function buildAttributeModel(model: CharacterReadModel): AttributeModel {
  const source = record(model.source);
  const storedAbilities = record(record(source?.system)?.abilities);
  const preparedAbilities = record(record(model.preparedSystem)?.abilities);
  const { bonus, regular } = improvementBonus(model);
  const revision = revisionOf(source);
  const uuid = typeof model.uuid === "string" && WORLD_ACTOR_UUID.test(model.uuid) ? model.uuid : undefined;

  const scores = {} as Record<AbilityKey, AbilityScore>;
  for (const key of ABILITY_KEYS) {
    const stored = record(storedAbilities?.[key])?.value;
    if (typeof stored !== "number" || !Number.isSafeInteger(stored)) {
      return { scores: undefined, editable: false, uuid, revision: revision ?? 0 };
    }
    const prepared = record(preparedAbilities?.[key]);
    const final = typeof prepared?.value === "number" && Number.isFinite(prepared.value) ? prepared.value : undefined;
    const max = typeof prepared?.max === "number" && Number.isFinite(prepared.max) ? prepared.max : DEFAULT_ABILITY_MAX;
    scores[key] = { key, stored, bonus: bonus[key], base: stored - bonus[key], final, max };
  }
  const basesUsable = ABILITY_KEYS.every((key) => scores[key].base >= 1);
  return {
    scores,
    editable: regular && basesUsable && uuid !== undefined && revision !== undefined,
    uuid,
    revision: revision ?? 0,
  };
}

export function valuesOf(scores: Readonly<Record<AbilityKey, AbilityScore>>, field: "stored" | "bonus" | "base"): AbilityValues {
  return Object.fromEntries(ABILITY_KEYS.map((key) => [key, scores[key][field]])) as Record<AbilityKey, number>;
}
