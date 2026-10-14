export const DND5E_SYSTEM_ID = "dnd5e";
export const CHARACTER_ACTOR_TYPE = "character";

export interface ReadableCharacterItem {
  readonly id: string;
  readonly uuid?: string;
  readonly name: string;
  readonly img?: string;
  readonly type: string;
  readonly preparedSystem: unknown;
  toObject(): unknown;
}

export interface ReadableCharacterActor {
  readonly id: string;
  readonly uuid?: string;
  readonly name: string;
  readonly img?: string;
  readonly type: string;
  readonly preparedSystem: unknown;
  readonly items: Iterable<ReadableCharacterItem>;
  toObject(): unknown;
}

export interface CharacterReadEnvironment {
  systemId(): unknown;
  currentUser(): unknown;
  actorById(id: string): ReadableCharacterActor | undefined;
  isGamemaster(user: unknown): boolean;
  hasOwnerPermission(actor: ReadableCharacterActor, user: unknown): boolean;
}

export interface OriginProvenance {
  readonly compendiumSource: unknown;
  readonly duplicateSource: unknown;
  readonly coreSourceId: unknown;
  readonly dnd5eSourceId: unknown;
  readonly librarySubspecies: unknown;
  readonly state: "library-marker-present" | "external-or-unknown";
}

export type AdvancementSnapshot =
  | { readonly present: false }
  | { readonly present: true; readonly value: unknown };

export interface CharacterItemReadModel {
  readonly id: string;
  readonly uuid?: string;
  readonly name: string;
  readonly img?: string;
  readonly type: string;
  readonly preparedSystem: unknown;
  readonly source: unknown;
  readonly advancement: AdvancementSnapshot;
  readonly provenance: OriginProvenance;
}

export interface CharacterReadModel {
  readonly id: string;
  readonly uuid?: string;
  readonly name: string;
  readonly img?: string;
  readonly type: "character";
  readonly preparedSystem: unknown;
  readonly source: unknown;
  readonly provenance: OriginProvenance;
  readonly items: readonly CharacterItemReadModel[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

// Foundry's Document#toObject and DataModel#toObject return data, not live Documents. Clone it once more so neither
// the view nor a future adapter can mutate a value held by a canonical document.
function snapshot(value: unknown): unknown {
  if (value === undefined || value === null || typeof value !== "object") return value;
  return structuredClone(value);
}

function provenance(source: unknown): OriginProvenance {
  const root = asRecord(source);
  const stats = asRecord(root?._stats);
  const flags = asRecord(root?.flags);
  const core = asRecord(flags?.core);
  const dnd5e = asRecord(flags?.dnd5e);
  const eagleLibrary = asRecord(flags?.["eagle-library"]);
  const librarySubspecies = snapshot(eagleLibrary?.subspecies);
  return {
    compendiumSource: snapshot(stats?.compendiumSource),
    duplicateSource: snapshot(stats?.duplicateSource),
    coreSourceId: snapshot(core?.sourceId),
    dnd5eSourceId: snapshot(dnd5e?.sourceId),
    librarySubspecies,
    state: librarySubspecies === undefined ? "external-or-unknown" : "library-marker-present",
  };
}

function advancement(source: unknown): AdvancementSnapshot {
  const system = asRecord(asRecord(source)?.system);
  if (!system || !("advancement" in system)) return { present: false };
  return { present: true, value: snapshot(system.advancement) };
}

function validActorId(value: string): boolean {
  return value.trim() !== "";
}

// This is the only authority boundary for M6: it starts with the collection lookup and never accepts a caller-supplied
// Actor, permission result, UUID, or role as authoritative.
export function resolveEligibleCharacter(
  actorId: string,
  environment: CharacterReadEnvironment,
): ReadableCharacterActor | undefined {
  if (!validActorId(actorId) || environment.systemId() !== DND5E_SYSTEM_ID) return undefined;
  try {
    const actor = environment.actorById(actorId);
    if (!actor || actor.id !== actorId || actor.type !== CHARACTER_ACTOR_TYPE) return undefined;
    const user = environment.currentUser();
    if (!user) return undefined;
    return environment.isGamemaster(user) || environment.hasOwnerPermission(actor, user) ? actor : undefined;
  } catch {
    return undefined;
  }
}

function itemModel(item: ReadableCharacterItem): CharacterItemReadModel {
  const source = snapshot(item.toObject());
  return {
    id: item.id,
    ...(item.uuid ? { uuid: item.uuid } : {}),
    name: item.name,
    ...(item.img ? { img: item.img } : {}),
    type: item.type,
    preparedSystem: snapshot(item.preparedSystem),
    source,
    advancement: advancement(source),
    provenance: provenance(source),
  };
}

// The builder intentionally has no mutating dependency: it can only receive a canonical read-only adapter and return
// detached data. Keeping the full source snapshot is how unfamiliar Library/import fields survive this first view.
export function buildCharacterReadModel(actor: ReadableCharacterActor): CharacterReadModel {
  const source = snapshot(actor.toObject());
  return {
    id: actor.id,
    ...(actor.uuid ? { uuid: actor.uuid } : {}),
    name: actor.name,
    ...(actor.img ? { img: actor.img } : {}),
    type: CHARACTER_ACTOR_TYPE,
    preparedSystem: snapshot(actor.preparedSystem),
    source,
    provenance: provenance(source),
    items: [...actor.items].map(itemModel),
  };
}

export function readEligibleCharacter(actorId: string, environment: CharacterReadEnvironment): CharacterReadModel | undefined {
  const actor = resolveEligibleCharacter(actorId, environment);
  if (!actor) return undefined;
  try {
    return buildCharacterReadModel(actor);
  } catch {
    return undefined;
  }
}
