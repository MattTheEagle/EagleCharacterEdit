import { describe, expect, it, vi } from "vitest";
import {
  buildCharacterReadModel,
  readEligibleCharacter,
  resolveEligibleCharacter,
  type CharacterReadEnvironment,
  type ReadableCharacterActor,
  type ReadableCharacterItem,
} from "./character-read";

const player = { id: "player", isGM: false };
const gm = { id: "gm", isGM: true };

function item(id: string, source: Record<string, unknown>): ReadableCharacterItem {
  return {
    id,
    uuid: `Actor.a.Item.${id}`,
    name: source.name as string,
    img: "icons/item.svg",
    type: source.type as string,
    preparedSystem: { prepared: id, advancement: "prepared-only" },
    toObject: () => source,
  };
}

function actor(source: Record<string, unknown>, items: readonly ReadableCharacterItem[] = []): ReadableCharacterActor {
  return {
    id: "a",
    uuid: "Actor.a",
    name: "Timmy",
    img: "icons/actor.svg",
    type: "character",
    preparedSystem: { abilities: { str: { value: 12 } } },
    items,
    toObject: () => source,
  };
}

function environment(current: unknown, canonical: ReadableCharacterActor | undefined, owner = true): CharacterReadEnvironment {
  return {
    systemId: () => "dnd5e",
    currentUser: () => current,
    actorById: vi.fn((id: string) => id === "a" ? canonical : undefined),
    isGamemaster: (user) => (user as { isGM?: unknown }).isGM === true,
    hasOwnerPermission: vi.fn(() => owner),
  };
}

describe("M6 character read model", () => {
  it("reads only the current player's own canonical character and returns detached snapshots", () => {
    const source = { name: "Timmy", system: { hp: { value: 8 } }, flags: { core: { sourceId: "Actor.source" } } };
    const swordSource = {
      name: "Sword",
      type: "weapon",
      system: { advancement: [{ type: "ItemGrant", configuration: { uuid: "Compendium.example.sword" } }] },
      _stats: { compendiumSource: "Compendium.example.sword" },
    };
    const canonical = actor(source, [item("sword", swordSource)]);
    const env = environment(player, canonical);

    const model = readEligibleCharacter("a", env);

    expect(model).toMatchObject({ id: "a", name: "Timmy", type: "character" });
    expect(model?.items).toHaveLength(1);
    expect(model?.items[0]).toMatchObject({ id: "sword", name: "Sword", advancement: { present: true } });
    expect(model?.items[0].provenance).toMatchObject({ compendiumSource: "Compendium.example.sword", state: "external-or-unknown" });
    expect(model?.source).not.toBe(source);
    expect(model?.preparedSystem).not.toBe(canonical.preparedSystem);
    expect(model?.items[0].source).not.toBe(swordSource);
    expect(source).toEqual({ name: "Timmy", system: { hp: { value: 8 } }, flags: { core: { sourceId: "Actor.source" } } });
    expect(swordSource.system).toEqual({ advancement: [{ type: "ItemGrant", configuration: { uuid: "Compendium.example.sword" } }] });
  });

  it("refuses foreign, missing, stale, wrong-system, and non-character targets without exposing a model", () => {
    const canonical = actor({ name: "Timmy", system: {} });
    const foreign = environment(player, canonical, false);
    expect(readEligibleCharacter("a", foreign)).toBeUndefined();
    expect(readEligibleCharacter("missing", environment(player, canonical))).toBeUndefined();
    expect(readEligibleCharacter("", environment(player, canonical))).toBeUndefined();
    expect(readEligibleCharacter("a", { ...environment(player, canonical), systemId: () => "pf2e" })).toBeUndefined();
    expect(readEligibleCharacter("a", environment(undefined, canonical))).toBeUndefined();
    expect(readEligibleCharacter("a", environment(player, { ...canonical, type: "npc" }))).toBeUndefined();
    expect(resolveEligibleCharacter("a", { ...environment(player, { ...canonical, id: "different" }) })).toBeUndefined();
  });

  it("allows Foundry GM and Assistant semantics without changing ownership", () => {
    const ownership = { default: 0, player: 3 };
    const source = { name: "Unowned", ownership, system: {} };
    const canonical = actor(source);
    const gmEnv = environment(gm, canonical, false);
    const assistantEnv = environment({ id: "assistant", isGM: true }, canonical, false);

    expect(readEligibleCharacter("a", gmEnv)?.name).toBe("Timmy");
    expect(readEligibleCharacter("a", assistantEnv)?.name).toBe("Timmy");
    expect(gmEnv.hasOwnerPermission).not.toHaveBeenCalled();
    expect(ownership).toEqual({ default: 0, player: 3 });
  });

  it("preserves Library-marked, external, unknown, and incomplete advancement source data without normalization", () => {
    const librarySource = {
      name: "Library lineage",
      type: "feat",
      system: { advancement: [{ type: "ScaleValue", value: undefined }] },
      _stats: { duplicateSource: "Actor.original" },
      flags: { "eagle-library": { subspecies: true }, dnd5e: { sourceId: "Compendium.dnd5e.feats.Item.x" } },
      unknownImportField: { still: "here" },
    };
    const externalSource = { name: "External item", type: "equipment", system: { other: true }, flags: { other: { untouched: true } } };
    const model = buildCharacterReadModel(actor({ name: "Timmy", system: {} }, [item("library", librarySource), item("external", externalSource)]));

    expect(model.items[0]).toMatchObject({
      advancement: { present: true },
      provenance: { state: "library-marker-present", duplicateSource: "Actor.original", dnd5eSourceId: "Compendium.dnd5e.feats.Item.x", librarySubspecies: true },
    });
    expect(model.items[1]).toMatchObject({ advancement: { present: false }, provenance: { state: "external-or-unknown" } });
    expect(model.items[0].source).toMatchObject({ unknownImportField: { still: "here" } });
    expect(model.items[1].source).toMatchObject({ flags: { other: { untouched: true } } });
    expect(librarySource).toMatchObject({ unknownImportField: { still: "here" } });
  });
});
