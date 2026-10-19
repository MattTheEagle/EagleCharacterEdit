import {
  isCharacterUpdateOperation,
  type CharacterUpdateStore,
} from "../core/character-update";

const PREFIX = "eagle-character-edit.character-update.v1";

function key(): string | undefined {
  const worldId = game.world?.id;
  const userId = game.user?.id;
  return typeof worldId === "string" && worldId !== "" && typeof userId === "string" && userId !== ""
    ? `${PREFIX}.${worldId}.${userId}`
    : undefined;
}

// This retry record is deliberately separate from character.create storage.
export function localCharacterUpdateStore(): CharacterUpdateStore {
  let malformed = false;
  return {
    load: () => {
      const storageKey = key();
      if (!storageKey) return undefined;
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored === null) return undefined;
        const parsed: unknown = JSON.parse(stored);
        if (isCharacterUpdateOperation(parsed)) return parsed;
        malformed = true;
        return undefined;
      } catch {
        malformed = true;
        return undefined;
      }
    },
    save: (operation) => {
      const storageKey = key();
      if (!storageKey || malformed || !isCharacterUpdateOperation(operation)) return false;
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
