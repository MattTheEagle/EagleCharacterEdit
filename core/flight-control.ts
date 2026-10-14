import { CHARACTER_EDIT_ID, REQUIRED_API_VERSION } from "./index";

export type RegistrationFailure =
  | "invalid-descriptor"
  | "invalid-api-version"
  | "unknown-module"
  | "inactive-module"
  | "already-registered"
  | "incompatible-api-version"
  | "internal-error";

export interface RegisteredModule {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  readonly apiVersion: string;
}

export interface RegistrationApi {
  registerModule(descriptor: { id: string; apiVersion: string; open?: () => void | Promise<void> }): unknown;
}

export interface RegistrationSource {
  api(): RegistrationApi | undefined;
}

export interface RegistrationLog {
  info(message: string): void;
  warn(message: string): void;
}

export type RegistrationOutcome =
  | { readonly status: "registered"; readonly module: RegisteredModule }
  | { readonly status: "missing" }
  | { readonly status: "rejected"; readonly reason: RegistrationFailure; readonly detail: string }
  | { readonly status: "invalid-response"; readonly detail: string }
  | { readonly status: "error"; readonly detail: string };

export function registrationDescriptor(open?: () => void | Promise<void>): { id: string; apiVersion: string; open?: () => void | Promise<void> } {
  return { id: CHARACTER_EDIT_ID, apiVersion: REQUIRED_API_VERSION, ...(open ? { open } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRegisteredModule(value: unknown): value is RegisteredModule {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.version === "string" &&
    typeof value.apiVersion === "string"
  );
}

function isRegistrationFailure(value: unknown): value is RegistrationFailure {
  return (
    value === "invalid-descriptor" ||
    value === "invalid-api-version" ||
    value === "unknown-module" ||
    value === "inactive-module" ||
    value === "already-registered" ||
    value === "incompatible-api-version" ||
    value === "internal-error"
  );
}

function parseResult(result: unknown): RegistrationOutcome {
  if (!isRecord(result)) {
    return { status: "invalid-response", detail: "registerModule returned a non-object response" };
  }

  if (result.ok === true && isRegisteredModule(result.module)) {
    return { status: "registered", module: result.module };
  }

  if (result.ok === false && isRegistrationFailure(result.reason) && typeof result.detail === "string") {
    return { status: "rejected", reason: result.reason, detail: result.detail };
  }

  return { status: "invalid-response", detail: "registerModule returned an invalid response" };
}

export function registerWithFlightControl(
  source: RegistrationSource,
  log: RegistrationLog,
  open?: () => void | Promise<void>,
): RegistrationOutcome {
  let api: RegistrationApi | undefined;
  try {
    api = source.api();
  } catch (error) {
    const detail = messageOf(error);
    log.warn(`${CHARACTER_EDIT_ID} | could not read Eagle Flight Control: ${detail}`);
    return { status: "error", detail };
  }

  if (!api) {
    log.warn(`${CHARACTER_EDIT_ID} | Eagle Flight Control is unavailable; dependent features are disabled`);
    return { status: "missing" };
  }

  let outcome: RegistrationOutcome;
  try {
    outcome = parseResult(api.registerModule(registrationDescriptor(open)));
  } catch (error) {
    const detail = messageOf(error);
    log.warn(`${CHARACTER_EDIT_ID} | registration call failed: ${detail}`);
    return { status: "error", detail };
  }

  if (outcome.status === "registered") {
    log.info(`${CHARACTER_EDIT_ID} | registered with Eagle Flight Control (API ${outcome.module.apiVersion})`);
  } else if (outcome.status === "rejected") {
    log.warn(`${CHARACTER_EDIT_ID} | registration rejected: ${outcome.reason} - ${outcome.detail}`);
  } else if (outcome.status === "invalid-response") {
    log.warn(`${CHARACTER_EDIT_ID} | registration response is invalid: ${outcome.detail}`);
  } else {
    log.warn(`${CHARACTER_EDIT_ID} | registration ended unexpectedly: ${outcome.status}`);
  }
  return outcome;
}
