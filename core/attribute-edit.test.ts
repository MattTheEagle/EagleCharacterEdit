import { describe, expect, it } from "vitest";
import { attributeChange, baselineChanged, pendingInput, pendingRelation, reactionTo } from "./attribute-edit";
import type { AttributeModel, AbilityScore } from "./attributes";
import type { AbilityKey, CharacterUpdateOutcome } from "./character-update";

const UUID = "Actor.AbCdEfGhIjKlMnOp";
const KEYS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

function model(stored: number[], bonus: number[] = [0, 0, 0, 0, 0, 0], revision = 4, editable = true): AttributeModel {
  const scores = Object.fromEntries(KEYS.map((key, index) => [key, {
    key, stored: stored[index]!, bonus: bonus[index]!, base: stored[index]! - bonus[index]!, final: stored[index]!, max: 20,
  } satisfies AbilityScore])) as Record<AbilityKey, AbilityScore>;
  return { scores, editable, uuid: UUID, revision };
}

function bases(values: number[]) {
  return Object.fromEntries(KEYS.map((key, index) => [key, values[index]!])) as Record<AbilityKey, number>;
}

describe("M9 attribute change", () => {
  it("writes only changed scores, from the stored baseline to base plus the kept bonus", () => {
    const baseline = model([10, 10, 12, 10, 10, 10], [0, 0, 2, 0, 0, 0]);
    expect(attributeChange(baseline, "point-buy", bases([15, 10, 14, 8, 10, 10]))).toEqual({
      status: "change",
      input: { uuid: UUID, revision: 4, abilities: { str: { from: 10, to: 15 }, con: { from: 12, to: 16 }, int: { from: 10, to: 8 } } },
    });
  });

  it("sends nothing when unchanged, invalid or not editable", () => {
    const baseline = model([10, 10, 12, 10, 10, 10], [0, 0, 2, 0, 0, 0]);
    expect(attributeChange(baseline, "point-buy", bases([10, 10, 10, 10, 10, 10]))).toEqual({ status: "unchanged" });
    expect(attributeChange(baseline, "point-buy", bases([16, 10, 10, 10, 10, 10]))).toMatchObject({ status: "invalid" });
    expect(attributeChange(model([10, 10, 10, 10, 10, 10], undefined, 0, false), "manual", bases([12, 10, 10, 10, 10, 10])))
      .toEqual({ status: "not-editable" });
  });

  it("notices a world change of stored score, bonus or revision since the draft started", () => {
    const baseline = model([10, 10, 10, 10, 10, 10]);
    expect(baselineChanged(baseline, model([10, 10, 10, 10, 10, 10]))).toBe(false);
    expect(baselineChanged(baseline, model([11, 10, 10, 10, 10, 10]))).toBe(true);
    expect(baselineChanged(baseline, model([12, 10, 10, 10, 10, 10], [2, 0, 0, 0, 0, 0]))).toBe(true);
    expect(baselineChanged(baseline, model([10, 10, 10, 10, 10, 10], undefined, 5))).toBe(true);
  });
});

describe("M9 pending writes and outcomes", () => {
  const pending = { uuid: UUID, operationId: "QwErTyUiOpAsDfGh", revision: 4, abilities: { str: { from: 10, to: 12 } } };

  it("relates the single pending slot to this or another character and retries it without its operation id", () => {
    expect(pendingRelation(undefined, UUID)).toBe("none");
    expect(pendingRelation(pending, UUID)).toBe("this");
    expect(pendingRelation(pending, "Actor.ZzZzZzZzZzZzZzZz")).toBe("other");
    expect(pendingInput(pending)).toEqual({ uuid: UUID, revision: 4, abilities: { str: { from: 10, to: 12 } } });
  });

  it("reacts to every outcome; only a conflict clears the store after the fresh read", () => {
    const outcomes: CharacterUpdateOutcome[] = [
      { status: "updated", uuid: UUID, revision: 5, changed: ["str"] },
      { status: "retry", uuid: UUID, revision: 5, changed: ["str"] },
      { status: "conflict" },
      { status: "unknown" },
      { status: "denied" },
      { status: "unavailable" },
      { status: "failure" },
    ];
    expect(outcomes.map((outcome) => {
      const reaction = reactionTo(outcome);
      return [reaction.key.split(".").at(-1), reaction.level, reaction.discardDraft, reaction.clearStore];
    })).toEqual([
      ["saved", "info", true, false],
      ["saved", "info", true, false],
      ["conflict", "warn", true, true],
      ["unknown", "warn", true, false],
      ["denied", "warn", false, false],
      ["noGamemaster", "warn", false, false],
      ["failed", "warn", false, false],
    ]);
  });
});
