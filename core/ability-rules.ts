import { ABILITY_KEYS, type AbilityKey } from "./character-update";

export const ATTRIBUTE_METHODS = ["point-buy", "standard-array", "manual"] as const;
export type AttributeMethod = (typeof ATTRIBUTE_METHODS)[number];

// The 2014 Basic Rules and the 2024 SRD 5.2 use the same budget, costs and array (milestone M9 Discover F14-F16).
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
const POINT_BUY_COSTS: ReadonlyMap<number, number> = new Map([[8, 0], [9, 1], [10, 2], [11, 3], [12, 4], [13, 5], [14, 7], [15, 9]]);
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
// The highest stored score the character.update transport accepts; the lowest useful score is 1.
export const SCORE_LIMIT = 30;

export type AbilityValues = Readonly<Record<AbilityKey, number>>;
// A base of null is a Standard Array slot that has no value assigned yet.
export type DraftBases = Readonly<Record<AbilityKey, number | null>>;

export type RuleViolation =
  | { readonly rule: "point-buy-range"; readonly key: AbilityKey }
  | { readonly rule: "point-buy-budget"; readonly spent: number }
  | { readonly rule: "standard-array" }
  | { readonly rule: "manual-range"; readonly key: AbilityKey }
  | { readonly rule: "total-range"; readonly key: AbilityKey };

function fill<T>(value: (key: AbilityKey) => T): Record<AbilityKey, T> {
  return Object.fromEntries(ABILITY_KEYS.map((key) => [key, value(key)])) as Record<AbilityKey, T>;
}

// The points the bases cost, or undefined when a base is outside the cost table.
export function pointBuySpent(bases: DraftBases): number | undefined {
  let spent = 0;
  for (const key of ABILITY_KEYS) {
    const base = bases[key];
    const cost = base === null ? undefined : POINT_BUY_COSTS.get(base);
    if (cost === undefined) return undefined;
    spent += cost;
  }
  return spent;
}

function isStandardArray(bases: DraftBases): boolean {
  const values = ABILITY_KEYS.map((key) => bases[key]);
  if (values.some((value) => value === null)) return false;
  const sorted = (values as number[]).sort((a, b) => b - a);
  return sorted.every((value, index) => value === STANDARD_ARRAY[index]);
}

// The first broken rule, or undefined when the draft may be saved. Bonus and Active Effects are never changed, so the
// total range is checked on base plus the bonus from ability score improvements.
export function validateBases(method: AttributeMethod, bases: DraftBases, bonus: AbilityValues): RuleViolation | undefined {
  if (method === "point-buy") {
    for (const key of ABILITY_KEYS) {
      const base = bases[key];
      if (base === null || !POINT_BUY_COSTS.has(base)) return { rule: "point-buy-range", key };
    }
    const spent = pointBuySpent(bases)!;
    if (spent > POINT_BUY_BUDGET) return { rule: "point-buy-budget", spent };
  } else if (method === "standard-array") {
    if (!isStandardArray(bases)) return { rule: "standard-array" };
  } else {
    for (const key of ABILITY_KEYS) {
      const base = bases[key];
      if (base === null || !Number.isSafeInteger(base) || base < 1) return { rule: "manual-range", key };
    }
  }
  for (const key of ABILITY_KEYS) {
    const total = bases[key]! + bonus[key];
    if (!Number.isSafeInteger(total) || total < 1 || total > SCORE_LIMIT) return { rule: "total-range", key };
  }
  return undefined;
}

// No method is stored on the character (character.update V1 writes the six scores only), so the editor derives one.
export function inferMethod(bases: AbilityValues): AttributeMethod {
  if (isStandardArray(bases)) return "standard-array";
  const spent = pointBuySpent(bases);
  return spent !== undefined && spent <= POINT_BUY_BUDGET ? "point-buy" : "manual";
}

// Switching only changes the draft: valid values are kept, otherwise the method starts from its own neutral state.
export function switchMethod(target: AttributeMethod, draft: DraftBases, saved: AbilityValues): DraftBases {
  if (target === "point-buy") {
    const spent = pointBuySpent(draft);
    return spent !== undefined && spent <= POINT_BUY_BUDGET ? draft : fill(() => POINT_BUY_MIN);
  }
  if (target === "standard-array") return isStandardArray(draft) ? draft : fill(() => null);
  return fill((key) => draft[key] ?? saved[key]);
}
