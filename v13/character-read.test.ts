import { afterEach, describe, expect, it, vi } from "vitest";
import { createFoundryCharacterReader } from "./character-read";

const originalGame = (globalThis as { game?: unknown }).game;

afterEach(() => {
  (globalThis as { game?: unknown }).game = originalGame;
});

function installGame(owner: boolean) {
  const actorSystem = { toObject: vi.fn(() => ({ hp: { value: 8 } })) };
  const itemSystem = { toObject: vi.fn(() => ({ prepared: true })) };
  const itemToObject = vi.fn(() => ({ name: "Sword", type: "weapon", system: { advancement: [] } }));
  const actorToObject = vi.fn(() => ({ name: "Timmy", type: "character", system: { hp: { value: 8 } } }));
  const actor = {
    id: "actor-a",
    uuid: "Actor.actor-a",
    name: "Timmy",
    img: "actor.svg",
    type: "character",
    system: actorSystem,
    items: {
      contents: [{ id: "item-a", uuid: "Actor.actor-a.Item.item-a", name: "Sword", img: "item.svg", type: "weapon", system: itemSystem, toObject: itemToObject }],
    },
    toObject: actorToObject,
    testUserPermission: vi.fn(() => owner),
    update: vi.fn(),
  };
  const get = vi.fn((id: string) => id === "actor-a" ? actor : undefined);
  (globalThis as { game?: unknown }).game = {
    system: { id: "dnd5e" },
    user: { id: "player", isGM: false },
    actors: { get },
  };
  return { actor, get, actorSystem, itemSystem, actorToObject, itemToObject };
}

describe("M6 Foundry character reader", () => {
  it("uses the canonical collection permission check before reading any actor or item snapshot", () => {
    const foundry = installGame(false);
    const reader = createFoundryCharacterReader();

    expect(reader.canRead("actor-a")).toBe(false);
    expect(reader.read("actor-a")).toBeUndefined();
    expect(foundry.actor.testUserPermission).toHaveBeenCalledWith({ id: "player", isGM: false }, "OWNER");
    expect(foundry.actorSystem.toObject).not.toHaveBeenCalled();
    expect(foundry.itemSystem.toObject).not.toHaveBeenCalled();
    expect(foundry.actorToObject).not.toHaveBeenCalled();
    expect(foundry.itemToObject).not.toHaveBeenCalled();
    expect(foundry.actor.update).not.toHaveBeenCalled();
  });

  it("reads fresh detached actor and item data only after the canonical permission succeeds", () => {
    const foundry = installGame(true);
    const reader = createFoundryCharacterReader();

    const model = reader.read("actor-a");

    expect(model).toMatchObject({ id: "actor-a", name: "Timmy", items: [{ id: "item-a", name: "Sword" }] });
    expect(foundry.actorSystem.toObject).toHaveBeenCalledWith(false);
    expect(foundry.itemSystem.toObject).toHaveBeenCalledWith(false);
    expect(foundry.actorToObject).toHaveBeenCalledOnce();
    expect(foundry.itemToObject).toHaveBeenCalledOnce();
    expect(foundry.actor.update).not.toHaveBeenCalled();
  });
});
