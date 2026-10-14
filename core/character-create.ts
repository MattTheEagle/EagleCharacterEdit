import { CHARACTER_EDIT_ID } from "./index";

export const CHARACTER_CREATE_TYPE = "character.create";
export const CHARACTER_CREATE_VERSION = 1;

const OPERATION_ID = /^[A-Za-z0-9]{16}$/;
const MAX_NAME_LENGTH = 200;

export interface PendingCharacterCreate {
  readonly name: string;
  readonly operationId: string;
}

export interface OperationStore {
  load(): PendingCharacterCreate | undefined;
  save(operation: PendingCharacterCreate): boolean;
  clear(): boolean;
}

export interface FlightControlRequester {
  request(request: unknown): Promise<unknown>;
}

export type CharacterCreateOutcome =
  | { readonly status: "created"; readonly id: string; readonly name: string; readonly created: boolean }
  | { readonly status: "invalid-name" }
  | { readonly status: "storage-unavailable" }
  | { readonly status: "pending-name-mismatch" }
  | { readonly status: "request-failed" };

function normalizeName(value: string): string | undefined {
  const name = value.trim();
  return name !== "" && name.length <= MAX_NAME_LENGTH ? name : undefined;
}

function validOperation(operation: PendingCharacterCreate | undefined): operation is PendingCharacterCreate {
  return Boolean(operation && normalizeName(operation.name) === operation.name && OPERATION_ID.test(operation.operationId));
}

function isSuccess(value: unknown, operation: PendingCharacterCreate): value is { ok: true; value: { id: string; name: string; created: boolean } } {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  if (result.ok !== true || typeof result.value !== "object" || result.value === null) return false;
  const created = result.value as Record<string, unknown>;
  return created.id === operation.operationId && created.name === operation.name && typeof created.created === "boolean";
}

// Persists a new operation before its first request. A stored operation is
// retried only with the exact same name and operationId; no retry creates a
// replacement id after an unknown transport result.
export async function submitCharacterCreate(
  api: FlightControlRequester,
  store: OperationStore,
  newId: () => string,
  enteredName: string,
): Promise<CharacterCreateOutcome> {
  const normalized = normalizeName(enteredName);
  if (!normalized) return { status: "invalid-name" };

  const pending = store.load();
  let operation: PendingCharacterCreate;
  if (pending) {
    if (!validOperation(pending) || normalized !== pending.name) return { status: "pending-name-mismatch" };
    operation = pending;
  } else {
    const operationId = newId();
    if (!OPERATION_ID.test(operationId)) return { status: "storage-unavailable" };
    operation = { name: normalized, operationId };
    if (!store.save(operation)) return { status: "storage-unavailable" };
  }

  let result: unknown;
  try {
    result = await api.request({
      module: CHARACTER_EDIT_ID,
      type: CHARACTER_CREATE_TYPE,
      version: CHARACTER_CREATE_VERSION,
      payload: { name: operation.name, operationId: operation.operationId },
    });
  } catch {
    return { status: "request-failed" };
  }
  if (!isSuccess(result, operation)) return { status: "request-failed" };
  try {
    store.clear();
  } catch {
    // The Actor is already confirmed. A stale local reference can only retry
    // this same idempotent operation and must not turn success into failure.
  }
  return { status: "created", id: result.value.id, name: operation.name, created: result.value.created };
}
