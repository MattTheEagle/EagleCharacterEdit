import { describe, expect, it, vi } from "vitest";
import { CHARACTER_READ_HEADER_ACTION, registerCharacterReadHeaderHook } from "./character-read-hooks";

describe("M6 Character Edit header hook", () => {
  it("adds one guarded control and resolves the actor again when clicked", () => {
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    const canRead = vi.fn(() => true);
    const open = vi.fn();
    registerCharacterReadHeaderHook({
      hooks: { on: (name, callback) => callbacks.set(name, callback) },
      isAvailable: () => true,
      canRead,
      open,
      label: () => "Open in Eagle Character Edit",
    });
    const controls: Record<string, unknown>[] = [];
    const application = { document: { id: "actor-a", documentName: "Actor", type: "character" } };

    callbacks.get("getHeaderControlsApplicationV2")!(application, controls);
    callbacks.get("getHeaderControlsApplicationV2")!(application, controls);

    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({ action: CHARACTER_READ_HEADER_ACTION, ownership: "OWNER" });
    expect(canRead).toHaveBeenCalledTimes(1);
    (controls[0].onClick as () => void)();
    expect(canRead).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith("actor-a");
  });

  it("does not expose a control for unavailable, foreign, missing, or non-Actor documents", () => {
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    const canRead = vi.fn(() => false);
    registerCharacterReadHeaderHook({
      hooks: { on: (name, callback) => callbacks.set(name, callback) },
      isAvailable: () => true,
      canRead,
      open: vi.fn(),
      label: () => "Open",
    });
    const callback = callbacks.get("getHeaderControlsApplicationV2")!;
    const controls: Record<string, unknown>[] = [];
    callback({ document: { id: "foreign", documentName: "Actor" } }, controls);
    callback({ document: { id: "item", documentName: "Item" } }, controls);
    callback({ document: { id: "", documentName: "Actor" } }, controls);
    expect(controls).toEqual([]);
    expect(canRead).toHaveBeenCalledOnce();
  });

  it("rechecks availability and eligibility after the header was rendered", () => {
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    let permitted = true;
    const open = vi.fn();
    registerCharacterReadHeaderHook({
      hooks: { on: (name, callback) => callbacks.set(name, callback) },
      isAvailable: () => true,
      canRead: () => permitted,
      open,
      label: () => "Open",
    });
    const controls: Record<string, unknown>[] = [];
    callbacks.get("getHeaderControlsApplicationV2")!({ document: { id: "actor-a", documentName: "Actor" } }, controls);
    permitted = false;
    (controls[0].onClick as () => void)();
    expect(open).not.toHaveBeenCalled();
  });
});
