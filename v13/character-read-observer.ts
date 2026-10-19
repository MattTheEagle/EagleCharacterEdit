export interface ObserverHookBus {
  on(name: string, callback: (...args: unknown[]) => void): number;
  off(name: string, id: number): void;
}

export interface CharacterReadObserverDependencies {
  readonly hooks: ObserverHookBus;
  readonly actorId: string;
  readonly refresh: () => void | Promise<void>;
}

function idOf(value: unknown): string | undefined {
  const id = (value as { readonly id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : undefined;
}

function parentActorId(item: unknown): string | undefined {
  const candidate = item as { readonly actor?: unknown; readonly parent?: unknown } | undefined;
  return idOf(candidate?.actor) ?? idOf(candidate?.parent);
}

// An Active Effect sits on the Actor itself or on one of its embedded Items; both change the prepared scores.
function effectActorId(effect: unknown): string | undefined {
  const parent = (effect as { readonly parent?: unknown } | undefined)?.parent;
  const documentName = (parent as { readonly documentName?: unknown } | undefined)?.documentName;
  if (documentName === "Actor") return idOf(parent);
  if (documentName === "Item") return parentActorId(parent);
  return undefined;
}

// Subscribe only for the lifetime of one open read-only window. It does not inspect changes and never calls a Document API.
export function observeCharacterRead(deps: CharacterReadObserverDependencies): () => void {
  const refreshActor = (actor: unknown): void => {
    if (idOf(actor) === deps.actorId) void deps.refresh();
  };
  const refreshItem = (item: unknown): void => {
    if (parentActorId(item) === deps.actorId) void deps.refresh();
  };
  const refreshEffect = (effect: unknown): void => {
    if (effectActorId(effect) === deps.actorId) void deps.refresh();
  };
  const registrations: ReadonlyArray<readonly [string, number]> = [
    ["updateActor", deps.hooks.on("updateActor", refreshActor)],
    ["createItem", deps.hooks.on("createItem", refreshItem)],
    ["updateItem", deps.hooks.on("updateItem", refreshItem)],
    ["deleteItem", deps.hooks.on("deleteItem", refreshItem)],
    ["createActiveEffect", deps.hooks.on("createActiveEffect", refreshEffect)],
    ["updateActiveEffect", deps.hooks.on("updateActiveEffect", refreshEffect)],
    ["deleteActiveEffect", deps.hooks.on("deleteActiveEffect", refreshEffect)],
  ];
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    for (const [name, id] of registrations) deps.hooks.off(name, id);
  };
}
