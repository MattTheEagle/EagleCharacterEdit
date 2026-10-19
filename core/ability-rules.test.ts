import { describe, expect, it } from "vitest";
import {
  inferMethod,
  pointBuySpent,
  switchMethod,
  validateBases,
  type AbilityValues,
  type DraftBases,
} from "./ability-rules";

function values(str: number, dex: number, con: number, int: number, wis: number, cha: number): AbilityValues {
  return { str, dex, con, int, wis, cha };
}
const NO_BONUS = values(0, 0, 0, 0, 0, 0);
const UNASSIGNED: DraftBases = { str: null, dex: null, con: null, int: null, wis: null, cha: null };

describe("M9 point buy", () => {
  it("prices 8 to 15 with the 27-point table and nothing outside it", () => {
    expect(pointBuySpent(values(15, 15, 15, 8, 8, 8))).toBe(27);
    expect(pointBuySpent(values(8, 9, 10, 11, 12, 13))).toBe(15);
    expect(pointBuySpent(values(14, 8, 8, 8, 8, 8))).toBe(7);
    expect(pointBuySpent(values(16, 8, 8, 8, 8, 8))).toBeUndefined();
    expect(pointBuySpent(values(7, 8, 8, 8, 8, 8))).toBeUndefined();
    expect(pointBuySpent({ ...values(8, 8, 8, 8, 8, 8), str: null })).toBeUndefined();
  });

  it("accepts up to 27 points and reports range and budget separately", () => {
    expect(validateBases("point-buy", values(15, 15, 15, 8, 8, 8), NO_BONUS)).toBeUndefined();
    expect(validateBases("point-buy", values(10, 10, 10, 10, 10, 10), NO_BONUS)).toBeUndefined();
    expect(validateBases("point-buy", values(15, 15, 15, 9, 8, 8), NO_BONUS)).toEqual({ rule: "point-buy-budget", spent: 28 });
    expect(validateBases("point-buy", values(10, 16, 10, 10, 10, 10), NO_BONUS)).toEqual({ rule: "point-buy-range", key: "dex" });
  });
});

describe("M9 standard array", () => {
  it("requires each of 15, 14, 13, 12, 10 and 8 exactly once", () => {
    expect(validateBases("standard-array", values(8, 15, 13, 12, 14, 10), NO_BONUS)).toBeUndefined();
    expect(validateBases("standard-array", values(15, 15, 13, 12, 10, 8), NO_BONUS)).toEqual({ rule: "standard-array" });
    expect(validateBases("standard-array", { ...values(15, 14, 13, 12, 10, 8), cha: null }, NO_BONUS)).toEqual({ rule: "standard-array" });
  });
});

describe("M9 manual entry and totals", () => {
  it("allows any whole base from 1 while base plus bonus stays from 1 to 30", () => {
    expect(validateBases("manual", values(18, 3, 17, 9, 12, 7), NO_BONUS)).toBeUndefined();
    expect(validateBases("manual", values(18, 0, 17, 9, 12, 7), NO_BONUS)).toEqual({ rule: "manual-range", key: "dex" });
    expect(validateBases("manual", values(18, 3.5, 17, 9, 12, 7), NO_BONUS)).toEqual({ rule: "manual-range", key: "dex" });
    expect(validateBases("manual", values(29, 10, 10, 10, 10, 10), values(2, 0, 0, 0, 0, 0))).toEqual({ rule: "total-range", key: "str" });
    expect(validateBases("manual", values(28, 10, 10, 10, 10, 10), values(2, 0, 0, 0, 0, 0))).toBeUndefined();
  });

  it("checks the total for point buy and standard array as well", () => {
    expect(validateBases("point-buy", values(15, 8, 8, 8, 8, 8), values(16, 0, 0, 0, 0, 0))).toEqual({ rule: "total-range", key: "str" });
  });
});

describe("M9 method without storage", () => {
  it("derives standard array, then point buy, then manual from the saved bases", () => {
    expect(inferMethod(values(8, 15, 13, 12, 14, 10))).toBe("standard-array");
    expect(inferMethod(values(10, 10, 10, 10, 10, 10))).toBe("point-buy");
    expect(inferMethod(values(15, 15, 15, 9, 8, 8))).toBe("manual");
    expect(inferMethod(values(17, 10, 10, 10, 10, 10))).toBe("manual");
  });

  it("keeps valid draft values on a switch and otherwise starts the method from its neutral state", () => {
    const saved = values(17, 12, 14, 10, 9, 11);
    expect(switchMethod("point-buy", values(15, 15, 15, 8, 8, 8), saved)).toEqual(values(15, 15, 15, 8, 8, 8));
    expect(switchMethod("point-buy", saved, saved)).toEqual(values(8, 8, 8, 8, 8, 8));
    expect(switchMethod("standard-array", values(8, 15, 13, 12, 14, 10), saved)).toEqual(values(8, 15, 13, 12, 14, 10));
    expect(switchMethod("standard-array", saved, saved)).toEqual(UNASSIGNED);
    expect(switchMethod("manual", { ...UNASSIGNED, str: 15 }, saved)).toEqual({ ...saved, str: 15 });
  });
});
