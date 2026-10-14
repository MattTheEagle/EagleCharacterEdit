import {
  submitCharacterCreate,
  type CharacterCreateOutcome,
  type FlightControlRequester,
  type OperationStore,
} from "./character-create";

export type CharacterReadEntry = "created" | "retried" | "sheet";

type CharacterCreateFailure = Exclude<CharacterCreateOutcome, { readonly status: "created" }>;
type ConfirmedCharacter = Extract<CharacterCreateOutcome, { readonly status: "created" }>;

export type CharacterCreateFlowOutcome =
  | CharacterCreateFailure
  | (ConfirmedCharacter & { readonly transition: "opened" })
  | (ConfirmedCharacter & {
      readonly transition: "confirmed-resumable";
      readonly reason: "closed" | "open-failed";
    });

export interface CharacterCreateFlowContext {
  readonly api: FlightControlRequester | undefined;
  readonly store: OperationStore;
  readonly newId: () => string;
  readonly isActive: () => boolean;
  readonly open: (actorId: string, entry: Exclude<CharacterReadEntry, "sheet">) => Promise<boolean>;
}

function resumable(
  outcome: ConfirmedCharacter,
  reason: "closed" | "open-failed",
): CharacterCreateFlowOutcome {
  return { ...outcome, transition: "confirmed-resumable", reason };
}

// Keeps the bounded M4 create transaction separate from the local M6 reader.
// A confirmed Actor is never downgraded to a create failure when opening fails.
export async function runCharacterCreateFlow(
  context: CharacterCreateFlowContext,
  name: string,
): Promise<CharacterCreateFlowOutcome> {
  if (!context.api) return { status: "request-failed" };
  const outcome = await submitCharacterCreate(context.api, context.store, context.newId, name);
  if (outcome.status !== "created") return outcome;
  if (!context.isActive()) return resumable(outcome, "closed");

  const entry = outcome.created ? "created" : "retried";
  try {
    if (await context.open(outcome.id, entry)) return { ...outcome, transition: "opened" };
  } catch {
    // Opening is local and optional after the Actor has already been confirmed.
  }
  return resumable(outcome, "open-failed");
}

export interface SingleInstanceSlot<T> {
  acquire(create: () => T): T;
  release(instance: T): void;
}

// Repeated Hub clicks share one visible create application. Identity-based
// release prevents an older close callback from clearing a newer instance.
export function createSingleInstanceSlot<T>(): SingleInstanceSlot<T> {
  let active: T | undefined;
  return {
    acquire: (create) => active ??= create(),
    release: (instance) => {
      if (active === instance) active = undefined;
    },
  };
}
