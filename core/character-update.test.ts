import { describe, expect, it, vi } from "vitest";
import {
  isCharacterUpdateOperation,
  submitCharacterUpdate,
  type CharacterUpdateStore,
  type PendingCharacterUpdate,
} from "./character-update";

const UUID = "Actor.AbCdEfGhIjKlMnOp";
const OP = "QwErTyUiOpAsDfGh";
const input = { uuid: UUID, revision: 0, abilities: { str: { from: 10, to: 12 } } } as const;

function store(initial?: PendingCharacterUpdate) {
  let pending = initial;
  const value: CharacterUpdateStore = {
    load: () => pending,
    save: vi.fn((operation) => { pending = operation; return true; }),
    clear: vi.fn(() => { pending = undefined; return true; }),
  };
  return { value, get pending() { return pending; } };
}

describe("character update adapter", () => {
  it("sends only the exact bounded request and reports an applied update", async () => {
    const request = vi.fn(async () => ({ ok: true, value: { uuid: UUID, revision: 1, applied: true, changed: ["str"] } }));
    const operations = store();
    await expect(submitCharacterUpdate({ request }, operations.value, () => OP, input)).resolves.toEqual({
      status: "updated", uuid: UUID, revision: 1, changed: ["str"],
    });
    expect(request).toHaveBeenCalledWith({
      module: "eagle-character-edit",
      type: "character.update",
      version: 1,
      payload: { uuid: UUID, operationId: OP, revision: 0, abilities: { str: { from: 10, to: 12 } } },
    });
    expect(operations.pending).toBeUndefined();
  });

  it("reports a confirmed retry separately", async () => {
    const operation = { ...input, operationId: OP };
    const operations = store(operation);
    const request = vi.fn(async () => ({ ok: true, value: { uuid: UUID, revision: 1, applied: false, changed: ["str"] } }));
    await expect(submitCharacterUpdate({ request }, operations.value, () => "ignored", input)).resolves.toMatchObject({ status: "retry" });
    expect(operations.pending).toBeUndefined();
  });

  it("keeps the exact retry after transport uncertainty", async () => {
    const operations = store();
    const request = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: false, reason: "relay-timeout", detail: "timeout" })
      .mockResolvedValueOnce({ ok: true, value: { uuid: UUID, revision: 1, applied: false, changed: ["str"] } });
    await expect(submitCharacterUpdate({ request }, operations.value, () => OP, input)).resolves.toEqual({ status: "unknown" });
    await expect(submitCharacterUpdate({ request }, operations.value, () => "ignored", input)).resolves.toEqual({ status: "unknown" });
    await expect(submitCharacterUpdate({ request }, operations.value, () => "ignored", input)).resolves.toMatchObject({ status: "retry" });
    expect(request.mock.calls.map((call) => (call[0] as { payload: PendingCharacterUpdate }).payload.operationId)).toEqual([OP, OP, OP]);
  });

  it("separates conflict, denied, a missing Gamemaster and other failures and keeps a conflict until a fresh read", async () => {
    for (const [reason, status] of [["conflict", "conflict"], ["not-permitted", "denied"], ["no-gm", "unavailable"], ["invalid-payload", "failure"]] as const) {
      const operations = store();
      const request = vi.fn(async () => ({ ok: false, reason, detail: "fixed" }));
      await expect(submitCharacterUpdate({ request }, operations.value, () => OP, input)).resolves.toEqual({ status });
      if (reason === "conflict") expect(operations.pending).toEqual({ ...input, operationId: OP });
      else expect(operations.pending).toBeUndefined();
    }
  });

  it("rejects invalid input, mismatched pending operations and malformed success", async () => {
    const invalid = { ...input, abilities: { str: { from: 10, to: 10 } } };
    const request = vi.fn();
    await expect(submitCharacterUpdate({ request }, store().value, () => OP, invalid)).resolves.toEqual({ status: "failure" });
    expect(request).not.toHaveBeenCalled();

    const pending = store({ ...input, operationId: OP });
    await expect(submitCharacterUpdate({ request }, pending.value, () => "ignored", { ...input, revision: 1 })).resolves.toEqual({ status: "failure" });
    expect(request).not.toHaveBeenCalled();

    const malformed = store();
    request.mockResolvedValueOnce({ ok: true, value: { uuid: UUID, revision: 1, applied: true, changed: ["dex"] } });
    await expect(submitCharacterUpdate({ request }, malformed.value, () => OP, input)).resolves.toEqual({ status: "failure" });
  });

  it("validates storage records without accepting extra mutation fields", () => {
    expect(isCharacterUpdateOperation({ ...input, operationId: OP })).toBe(true);
    expect(isCharacterUpdateOperation({ ...input, operationId: OP, ownership: { default: 3 } })).toBe(false);
    expect(isCharacterUpdateOperation({ ...input, operationId: OP, abilities: { str: { from: 10, to: 12, path: "system" } } })).toBe(false);
  });
});
