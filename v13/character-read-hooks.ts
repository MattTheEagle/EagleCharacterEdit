export const CHARACTER_READ_HEADER_ACTION = "eagle-character-edit-read";

export interface HeaderHookBus {
  on(name: string, callback: (...args: unknown[]) => void): unknown;
}

export interface CharacterReadHeaderDependencies {
  readonly hooks: HeaderHookBus;
  readonly isAvailable: () => boolean;
  readonly canRead: (actorId: string) => boolean;
  readonly open: (actorId: string) => void;
  readonly label: () => string;
}

interface HeaderDocument {
  readonly id?: unknown;
  readonly documentName?: unknown;
}

function actorId(application: unknown): string | undefined {
  const document = (application as { readonly document?: HeaderDocument } | undefined)?.document;
  if (document?.documentName !== "Actor" || typeof document.id !== "string" || document.id.trim() === "") return undefined;
  return document.id;
}

// The header only retains an ID. Both display and click resolution go back through the canonical read guard.
export function registerCharacterReadHeaderHook(deps: CharacterReadHeaderDependencies): void {
  deps.hooks.on("getHeaderControlsApplicationV2", (...args: unknown[]) => {
    const controls = args[1] as Array<Record<string, unknown>> | undefined;
    const id = actorId(args[0]);
    if (!controls || !id || !deps.isAvailable() || controls.some((control) => control.action === CHARACTER_READ_HEADER_ACTION)) return;
    if (!deps.canRead(id)) return;
    controls.push({
      action: CHARACTER_READ_HEADER_ACTION,
      label: deps.label(),
      icon: "fa-solid fa-eye",
      ownership: "OWNER",
      onClick: () => {
        if (deps.isAvailable() && deps.canRead(id)) deps.open(id);
      },
    });
  });
}
