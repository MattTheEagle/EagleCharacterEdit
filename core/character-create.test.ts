import { describe, expect, it, vi } from "vitest";
import { submitCharacterCreate, type OperationStore, type PendingCharacterCreate } from "./character-create";
import { CHARACTER_EDIT_ID } from "./index";

const ID = "AbCdEfGhIjKlMnOp";

function store(initial?: PendingCharacterCreate): OperationStore & { saved: PendingCharacterCreate[]; cleared: number } {
  let pending = initial;
  const saved: PendingCharacterCreate[] = [];
  let cleared = 0;
  return {
    get saved() { return saved; },
    get cleared() { return cleared; },
    load: () => pending,
    save: (operation) => {
      saved.push(operation);
      pending = operation;
      return true;
    },
    clear: () => {
      cleared += 1;
      pending = undefined;
      return true;
    },
  };
}

describe("Character Edit character creation request", () => {
  it("stores before it sends precisely the approved request and clears only after a matching success", async () => {
    const operations = store();
    const request = vi.fn(async () => ({ ok: true, value: { id: ID, name: "New hero", created: true } }));

    await expect(submitCharacterCreate({ request }, operations, () => ID, "  New hero  ")).resolves.toEqual({
      status: "created",
      id: ID,
      name: "New hero",
      created: true,
    });
    expect(operations.saved).toEqual([{ name: "New hero", operationId: ID }]);
    expect(request).toHaveBeenCalledWith({
      module: CHARACTER_EDIT_ID,
      type: "character.create",
      version: 1,
      payload: { name: "New hero", operationId: ID },
    });
    expect(operations.cleared).toBe(1);
  });

  it("retries a stored operation with the same id after every unknown failure", async () => {
    const operations = store({ name: "New hero", operationId: ID });
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: "relay-timeout", detail: "unknown" })
      .mockResolvedValueOnce({ ok: true, value: { id: ID, name: "New hero", created: false } });
    const ids = vi.fn(() => "QwErTyUiOpAsDfGh");

    await expect(submitCharacterCreate({ request }, operations, ids, "New hero")).resolves.toEqual({ status: "request-failed" });
    await expect(submitCharacterCreate({ request }, operations, ids, "New hero")).resolves.toEqual({
      status: "created",
      id: ID,
      name: "New hero",
      created: false,
    });
    expect(ids).not.toHaveBeenCalled();
    expect(request.mock.calls.map((call) => (call[0] as { payload: { operationId: string } }).payload.operationId)).toEqual([ID, ID]);
  });

  it("never sends when name, storage, generated id, pending name, or a success result is unsafe", async () => {
    const request = vi.fn();
    await expect(submitCharacterCreate({ request }, store(), () => ID, " ")).resolves.toEqual({ status: "invalid-name" });
    await expect(submitCharacterCreate({ request }, store(), () => "short", "New hero")).resolves.toEqual({ status: "storage-unavailable" });
    await expect(
      submitCharacterCreate({ request }, store({ name: "Saved name", operationId: ID }), () => ID, "Other name"),
    ).resolves.toEqual({ status: "pending-name-mismatch" });

    const malformed = store();
    request.mockResolvedValueOnce({ ok: true, value: { id: ID, name: "Other name", created: true } });
    await expect(submitCharacterCreate({ request }, malformed, () => ID, "New hero")).resolves.toEqual({ status: "request-failed" });
    expect(malformed.cleared).toBe(0);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps a confirmed Actor openable when local retry cleanup reports or throws a failure", async () => {
    const clears = [
      vi.fn(() => false),
      vi.fn(() => { throw new Error("storage removal failed"); }),
    ];
    for (const clear of clears) {
      const operations: OperationStore = {
        load: () => undefined,
        save: () => true,
        clear,
      };
      const request = vi.fn(async () => ({ ok: true, value: { id: ID, name: "New hero", created: true } }));

      await expect(submitCharacterCreate({ request }, operations, () => ID, "New hero")).resolves.toEqual({
        status: "created",
        id: ID,
        name: "New hero",
        created: true,
      });
      expect(clear).toHaveBeenCalledOnce();
    }
  });
});
