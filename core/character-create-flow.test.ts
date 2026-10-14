import { describe, expect, it, vi } from "vitest";
import {
  createSingleInstanceSlot,
  runCharacterCreateFlow,
  type CharacterCreateFlowContext,
} from "./character-create-flow";
import type { OperationStore, PendingCharacterCreate } from "./character-create";

const ID = "AbCdEfGhIjKlMnOp";

function store(initial?: PendingCharacterCreate): OperationStore {
  let pending = initial;
  return {
    load: () => pending,
    save: (operation) => {
      pending = operation;
      return true;
    },
    clear: () => {
      pending = undefined;
      return true;
    },
  };
}

function context(overrides: Partial<CharacterCreateFlowContext> = {}): CharacterCreateFlowContext {
  return {
    api: { request: vi.fn(async () => ({ ok: true, value: { id: ID, name: "New hero", created: true } })) },
    store: store(),
    newId: () => ID,
    isActive: () => true,
    open: vi.fn(async () => true),
    ...overrides,
  };
}

describe("M7 character create lifecycle", () => {
  it("opens a newly confirmed Actor with its exact id", async () => {
    const open = vi.fn(async () => true);
    await expect(runCharacterCreateFlow(context({ open }), "New hero")).resolves.toEqual({
      status: "created",
      transition: "opened",
      id: ID,
      name: "New hero",
      created: true,
    });
    expect(open).toHaveBeenCalledWith(ID, "created");
  });

  it("opens the same Actor after a safe retry reports an existing create", async () => {
    const open = vi.fn(async () => true);
    const api = { request: vi.fn(async () => ({ ok: true, value: { id: ID, name: "New hero", created: false } })) };
    await expect(runCharacterCreateFlow(context({ api, store: store({ name: "New hero", operationId: ID }), open }), "New hero"))
      .resolves.toMatchObject({ status: "created", transition: "opened", id: ID, created: false });
    expect(open).toHaveBeenCalledWith(ID, "retried");
  });

  it("keeps a confirmed Actor resumable without opening after the view closed", async () => {
    const open = vi.fn(async () => true);
    await expect(runCharacterCreateFlow(context({ isActive: () => false, open }), "New hero")).resolves.toMatchObject({
      status: "created",
      transition: "confirmed-resumable",
      reason: "closed",
      id: ID,
    });
    expect(open).not.toHaveBeenCalled();
  });

  it("keeps a confirmed Actor resumable when local opening refuses or throws", async () => {
    await expect(runCharacterCreateFlow(context({ open: async () => false }), "New hero")).resolves.toMatchObject({
      status: "created",
      transition: "confirmed-resumable",
      reason: "open-failed",
      id: ID,
    });
    await expect(runCharacterCreateFlow(context({ open: async () => { throw new Error("render failed"); } }), "New hero"))
      .resolves.toMatchObject({ status: "created", transition: "confirmed-resumable", reason: "open-failed", id: ID });
  });

  it("never opens a reader for an unavailable API or failed create", async () => {
    const open = vi.fn(async () => true);
    await expect(runCharacterCreateFlow(context({ api: undefined, open }), "New hero")).resolves.toEqual({ status: "request-failed" });
    const api = { request: vi.fn(async () => ({ ok: false, reason: "denied" })) };
    await expect(runCharacterCreateFlow(context({ api, open }), "New hero")).resolves.toEqual({ status: "request-failed" });
    expect(open).not.toHaveBeenCalled();
  });

  it("reuses one active application and releases only that exact instance", () => {
    const slot = createSingleInstanceSlot<object>();
    const first = {};
    const second = {};
    expect(slot.acquire(() => first)).toBe(first);
    expect(slot.acquire(() => second)).toBe(first);
    slot.release(second);
    expect(slot.acquire(() => second)).toBe(first);
    slot.release(first);
    expect(slot.acquire(() => second)).toBe(second);
  });
});
