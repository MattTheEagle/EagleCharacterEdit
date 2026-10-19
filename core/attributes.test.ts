import { describe, expect, it } from "vitest";
import { buildAttributeModel, valuesOf } from "./attributes";
import type { CharacterItemReadModel, CharacterReadModel } from "./character-read";

const UUID = "Actor.AbCdEfGhIjKlMnOp";
const PROVENANCE = {
  compendiumSource: undefined,
  duplicateSource: undefined,
  coreSourceId: undefined,
  dnd5eSourceId: undefined,
  librarySubspecies: undefined,
  state: "external-or-unknown",
} as const;

function abilities(values: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, ...extra }]));
}

function item(id: string, advancement: unknown): CharacterItemReadModel {
  return {
    id,
    name: id,
    type: "background",
    preparedSystem: {},
    source: { system: { advancement } },
    advancement: advancement === undefined ? { present: false } : { present: true, value: advancement },
    provenance: PROVENANCE,
  };
}

function character(options: {
  stored?: Record<string, unknown>;
  prepared?: Record<string, unknown>;
  items?: CharacterItemReadModel[];
  flags?: unknown;
  uuid?: string;
} = {}): CharacterReadModel {
  const stored = options.stored ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  return {
    id: "AbCdEfGhIjKlMnOp",
    uuid: options.uuid ?? UUID,
    name: "Test",
    type: "character",
    preparedSystem: { abilities: abilities(options.prepared ?? stored, { max: 20 }) },
    source: { system: { abilities: abilities(stored) }, flags: options.flags ?? {} },
    provenance: PROVENANCE,
    items: options.items ?? [],
  };
}

describe("M9 attribute model", () => {
  it("reads a new character as base 10 without bonus, revision 0 and editable", () => {
    const model = buildAttributeModel(character());
    expect(model).toMatchObject({ editable: true, uuid: UUID, revision: 0 });
    expect(model.scores?.str).toEqual({ key: "str", stored: 10, bonus: 0, base: 10, final: 10, max: 20 });
  });

  it("sums applied asi assignments of all items in object or array form and ignores feats and other advancement", () => {
    const background = item("background", {
      a1: { type: "AbilityScoreImprovement", value: { type: "asi", assignments: { int: 2, wis: 1 } } },
      a2: { type: "ItemGrant", value: { added: {} } },
    });
    const species = item("species", [{ type: "AbilityScoreImprovement", value: { type: "asi", assignments: { con: 2 } } }]);
    const classItem = item("class", {
      c1: { type: "AbilityScoreImprovement", value: { type: "feat", feat: { FeatFeatFeatFeat: "Compendium.x" } } },
      c2: { type: "AbilityScoreImprovement", value: {} },
      c3: { type: "AbilityScoreImprovement", value: { type: "asi", assignments: { int: 1 } } },
      c4: { type: "AbilityScoreImprovement", value: { type: "feat", assignments: { str: 2 } } },
    });
    const model = buildAttributeModel(character({
      stored: { str: 8, dex: 14, con: 15, int: 18, wis: 13, cha: 10 },
      items: [background, species, classItem, item("plain", undefined)],
    }));
    expect(valuesOf(model.scores!, "bonus")).toEqual({ str: 0, dex: 0, con: 2, int: 3, wis: 1, cha: 0 });
    expect(valuesOf(model.scores!, "base")).toEqual({ str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 });
    expect(model.editable).toBe(true);
  });

  it("keeps the stored score as total and shows Active Effects only as the prepared final score", () => {
    const model = buildAttributeModel(character({
      stored: { str: 15, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      prepared: { str: 21, dex: 10, con: 12, int: 10, wis: 10, cha: 10 },
    }));
    expect(model.scores?.str).toMatchObject({ stored: 15, base: 15, final: 21 });
    expect(model.scores?.con).toMatchObject({ stored: 10, final: 12 });
  });

  it("reads the revision of the stored write marker", () => {
    const model = buildAttributeModel(character({ flags: { "eagle-character-edit": { characterWrite: { version: 1, revision: 3 } } } }));
    expect(model).toMatchObject({ revision: 3, editable: true });
  });

  it("fails closed on unreadable scores, irregular assignments, bases below 1, a foreign uuid or a broken marker", () => {
    expect(buildAttributeModel(character({ stored: { str: "x", dex: 10, con: 10, int: 10, wis: 10, cha: 10 } })))
      .toMatchObject({ scores: undefined, editable: false });
    const irregular = item("odd", { a: { type: "AbilityScoreImprovement", value: { type: "asi", assignments: { str: 1.5 } } } });
    expect(buildAttributeModel(character({ items: [irregular] })).editable).toBe(false);
    const big = item("big", { a: { type: "AbilityScoreImprovement", value: { type: "asi", assignments: { str: 2 } } } });
    expect(buildAttributeModel(character({ stored: { str: 2, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, items: [big] })).editable).toBe(false);
    expect(buildAttributeModel(character({ uuid: "Scene.x.Token.y.Actor.AbCdEfGhIjKlMnOp" })).editable).toBe(false);
    expect(buildAttributeModel(character({ flags: { "eagle-character-edit": { characterWrite: { revision: -1 } } } })).editable).toBe(false);
  });
});
