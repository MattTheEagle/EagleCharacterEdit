import {
  readEligibleCharacter,
  resolveEligibleCharacter,
  type CharacterReadEnvironment,
  type CharacterReadModel,
  type ReadableCharacterActor,
  type ReadableCharacterItem,
} from "../core/character-read";

interface FoundryDocumentLike {
  readonly id: string | null;
  readonly uuid?: string;
  readonly name: string;
  readonly img?: string;
  readonly type: string;
  readonly system: { toObject(source?: boolean | null): unknown } | unknown;
  toObject(source?: boolean | null): unknown;
}

interface FoundryActorLike extends FoundryDocumentLike {
  readonly items: { readonly contents: readonly FoundryItemLike[] };
  testUserPermission(user: unknown, permission: "OWNER"): boolean;
}

interface FoundryItemLike extends FoundryDocumentLike {}

function preparedSystem(document: FoundryDocumentLike): unknown {
  const system = document.system as { toObject?(source?: boolean | null): unknown } | undefined;
  return typeof system?.toObject === "function" ? system.toObject(false) : system;
}

function readItem(item: FoundryItemLike): ReadableCharacterItem | undefined {
  if (!item.id) return undefined;
  return {
    id: item.id,
    ...(item.uuid ? { uuid: item.uuid } : {}),
    name: item.name,
    ...(item.img ? { img: item.img } : {}),
    type: item.type,
    get preparedSystem(): unknown { return preparedSystem(item); },
    toObject: () => item.toObject(),
  };
}

function readActor(actor: FoundryActorLike): ReadableCharacterActor | undefined {
  if (!actor.id) return undefined;
  return {
    id: actor.id,
    ...(actor.uuid ? { uuid: actor.uuid } : {}),
    name: actor.name,
    ...(actor.img ? { img: actor.img } : {}),
    type: actor.type,
    get preparedSystem(): unknown { return preparedSystem(actor); },
    get items(): readonly ReadableCharacterItem[] {
      return actor.items.contents.map(readItem).filter((item): item is ReadableCharacterItem => item !== undefined);
    },
    toObject: () => actor.toObject(),
  };
}

function environment(): CharacterReadEnvironment {
  return {
    systemId: () => game.system?.id,
    currentUser: () => game.user ?? undefined,
    actorById: (id) => {
      const actor = game.actors?.get(id) as unknown as FoundryActorLike | undefined;
      return actor ? readActor(actor) : undefined;
    },
    isGamemaster: (user) => (user as { isGM?: unknown } | undefined)?.isGM === true,
    hasOwnerPermission: (actor, user) => {
      const canonical = game.actors?.get(actor.id) as unknown as FoundryActorLike | undefined;
      return canonical?.testUserPermission(user, "OWNER") === true;
    },
  };
}

export interface FoundryCharacterReader {
  canRead(actorId: string): boolean;
  read(actorId: string): CharacterReadModel | undefined;
}

// Recreate the environment for every call so the Foundry collection and current user are never cached.
export function createFoundryCharacterReader(): FoundryCharacterReader {
  return {
    canRead: (actorId) => resolveEligibleCharacter(actorId, environment()) !== undefined,
    read: (actorId) => readEligibleCharacter(actorId, environment()),
  };
}
