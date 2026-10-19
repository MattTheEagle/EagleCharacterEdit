import { CHARACTER_EDIT_ID } from "./index";
import type { FlightControlRequester } from "./character-create";

export const CHARACTER_UPDATE_TYPE = "character.update";
export const CHARACTER_UPDATE_VERSION = 1;
export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export interface AbilityChange {
  readonly from: number;
  readonly to: number;
}

export interface CharacterUpdateInput {
  readonly uuid: string;
  readonly revision: number;
  readonly abilities: Readonly<Partial<Record<AbilityKey, AbilityChange>>>;
}

export interface PendingCharacterUpdate extends CharacterUpdateInput {
  readonly operationId: string;
}

export interface CharacterUpdateStore {
  load(): PendingCharacterUpdate | undefined;
  save(operation: PendingCharacterUpdate): boolean;
  clear(): boolean;
}

export type CharacterUpdateOutcome =
  | { readonly status: "updated"; readonly uuid: string; readonly revision: number; readonly changed: readonly AbilityKey[] }
  | { readonly status: "retry"; readonly uuid: string; readonly revision: number; readonly changed: readonly AbilityKey[] }
  | { readonly status: "conflict" }
  | { readonly status: "denied" }
  | { readonly status: "unknown" }
  // No Gamemaster is connected; Flight Control sent nothing.
  | { readonly status: "unavailable" }
  | { readonly status: "failure" };

const UUID_PATTERN = /^Actor\.[A-Za-z0-9]{16}$/;
const ID_PATTERN = /^[A-Za-z0-9]{16}$/;

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function isCharacterUpdateOperation(value: unknown): value is PendingCharacterUpdate {
  const operation = object(value);
  if (
    !operation ||
    Object.keys(operation).length !== 4 ||
    typeof operation.uuid !== "string" ||
    !UUID_PATTERN.test(operation.uuid) ||
    typeof operation.operationId !== "string" ||
    !ID_PATTERN.test(operation.operationId) ||
    typeof operation.revision !== "number" ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 0
  ) return false;
  const abilities = object(operation.abilities);
  if (!abilities) return false;
  const keys = Object.keys(abilities);
  if (keys.length < 1 || keys.length > 6 || keys.some((key) => !ABILITY_KEYS.includes(key as AbilityKey))) return false;
  return keys.every((key) => {
    const change = object(abilities[key]);
    if (!change || Object.keys(change).length !== 2 || !("from" in change) || !("to" in change)) return false;
    const { from, to } = change;
    return typeof from === "number" && typeof to === "number" && Number.isInteger(from) && Number.isInteger(to) &&
      from >= 0 && from <= 30 && to >= 0 && to <= 30 && from !== to;
  });
}

function canonical(input: CharacterUpdateInput, operationId: string): PendingCharacterUpdate | undefined {
  const operation: PendingCharacterUpdate = {
    uuid: input.uuid,
    operationId,
    revision: input.revision,
    abilities: Object.fromEntries(ABILITY_KEYS.filter((key) => input.abilities[key]).map((key) => [key, input.abilities[key]])),
  };
  return isCharacterUpdateOperation(operation) ? operation : undefined;
}

function sameOperation(left: PendingCharacterUpdate, right: PendingCharacterUpdate): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function success(
  value: unknown,
  operation: PendingCharacterUpdate,
): { uuid: string; revision: number; applied: boolean; changed: AbilityKey[] } | undefined {
  const result = object(value);
  const response = object(result?.value);
  if (result?.ok !== true || !response || response.uuid !== operation.uuid || typeof response.revision !== "number" ||
      !Number.isSafeInteger(response.revision) || response.revision !== operation.revision + 1 || typeof response.applied !== "boolean" ||
      !Array.isArray(response.changed)) return undefined;
  const changed = response.changed;
  const expected = ABILITY_KEYS.filter((key) => operation.abilities[key]);
  if (changed.length !== expected.length || changed.some((key, index) => key !== expected[index])) return undefined;
  return { uuid: operation.uuid, revision: response.revision, applied: response.applied, changed: expected };
}

function failure(value: unknown): string | undefined {
  const result = object(value);
  return result?.ok === false && typeof result.reason === "string" ? result.reason : undefined;
}

function clear(store: CharacterUpdateStore): void {
  try { store.clear(); } catch { /* a confirmed result remains confirmed */ }
}

// Validates the complete bounded mutation again, persists its retry identity before sending, and
// delegates the only write to Flight Control. It has no direct Foundry update fallback.
export async function submitCharacterUpdate(
  api: FlightControlRequester,
  store: CharacterUpdateStore,
  newId: () => string,
  input: CharacterUpdateInput,
): Promise<CharacterUpdateOutcome> {
  const pending = store.load();
  let operation: PendingCharacterUpdate;
  if (pending) {
    const expected = canonical(input, pending.operationId);
    const normalizedPending = isCharacterUpdateOperation(pending) ? canonical(pending, pending.operationId) : undefined;
    if (!normalizedPending || !expected || !sameOperation(normalizedPending, expected)) return { status: "failure" };
    operation = normalizedPending;
  } else {
    const candidate = canonical(input, newId());
    if (!candidate || !store.save(candidate)) return { status: "failure" };
    operation = candidate;
  }

  let response: unknown;
  try {
    response = await api.request({
      module: CHARACTER_EDIT_ID,
      type: CHARACTER_UPDATE_TYPE,
      version: CHARACTER_UPDATE_VERSION,
      payload: operation,
    });
  } catch {
    return { status: "unknown" };
  }

  const accepted = success(response, operation);
  if (accepted) {
    clear(store);
    return {
      status: accepted.applied ? "updated" : "retry",
      uuid: accepted.uuid,
      revision: accepted.revision,
      changed: accepted.changed,
    };
  }
  const reason = failure(response);
  if (reason === "relay-timeout" || reason === "relay-failed") return { status: "unknown" };
  if (reason === "conflict") return { status: "conflict" };
  clear(store);
  if (reason === "not-permitted") return { status: "denied" };
  if (reason === "no-gm") return { status: "unavailable" };
  return { status: "failure" };
}
