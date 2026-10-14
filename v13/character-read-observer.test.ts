import { describe, expect, it, vi } from "vitest";
import { observeCharacterRead } from "./character-read-observer";

describe("M6 Character Edit observer", () => {
  it("refreshes only the selected actor and its embedded items, then removes every hook", () => {
    let nextId = 0;
    const callbacks = new Map<number, { name: string; callback: (...args: unknown[]) => void }>();
    const off = vi.fn((_: string, id: number) => callbacks.delete(id));
    const refresh = vi.fn();
    const close = observeCharacterRead({
      hooks: {
        on: (name, callback) => {
          const id = ++nextId;
          callbacks.set(id, { name, callback });
          return id;
        },
        off,
      },
      actorId: "actor-a",
      refresh,
    });
    const call = (name: string, document: unknown) => [...callbacks.values()].filter((entry) => entry.name === name).forEach((entry) => entry.callback(document));

    call("updateActor", { id: "actor-b" });
    call("createItem", { id: "item-b", actor: { id: "actor-b" } });
    call("updateItem", { id: "item-a", parent: { id: "actor-a" } });
    call("deleteItem", { id: "item-a", actor: { id: "actor-a" } });
    call("updateActor", { id: "actor-a" });

    expect(refresh).toHaveBeenCalledTimes(3);
    close();
    close();
    expect(off).toHaveBeenCalledTimes(4);
    expect(callbacks).toHaveLength(0);
  });
});
