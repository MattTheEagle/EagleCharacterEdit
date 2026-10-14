import type { OperationStore, PendingCharacterCreate } from "../core/character-create";

const PREFIX = "eagle-character-edit.character-create.v1";
const ID_PATTERN = /^[A-Za-z0-9]{16}$/;

function key(): string | undefined {
  const worldId = game.world?.id;
  const userId = game.user?.id;
  return typeof worldId === "string" && worldId !== "" && typeof userId === "string" && userId !== ""
    ? `${PREFIX}.${worldId}.${userId}`
    : undefined;
}

function isOperation(value: unknown): value is PendingCharacterCreate {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const operation = value as Record<string, unknown>;
  return (
    typeof operation.name === "string" &&
    operation.name === operation.name.trim() &&
    operation.name !== "" &&
    operation.name.length <= 200 &&
    typeof operation.operationId === "string" &&
    ID_PATTERN.test(operation.operationId)
  );
}

// Browser storage holds only a retry reference, never rights or actor data.
// A malformed existing value blocks a replacement operation, because replacing
// it could turn an unknown previous result into an accidental second create.
export function localCharacterCreateStore(): OperationStore {
  let malformed = false;
  return {
    load: () => {
      const storageKey = key();
      if (!storageKey) return undefined;
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored === null) return undefined;
        const parsed: unknown = JSON.parse(stored);
        if (isOperation(parsed)) return parsed;
        malformed = true;
        return undefined;
      } catch {
        malformed = true;
        return undefined;
      }
    },
    save: (operation) => {
      const storageKey = key();
      if (!storageKey || malformed) return false;
      try {
        localStorage.setItem(storageKey, JSON.stringify(operation));
        return true;
      } catch {
        return false;
      }
    },
    clear: () => {
      const storageKey = key();
      if (!storageKey) return false;
      try {
        localStorage.removeItem(storageKey);
        return true;
      } catch {
        return false;
      }
    },
  };
}
