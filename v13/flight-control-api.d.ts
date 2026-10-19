// Local copy of the Eagle Flight Control 0.16.1 public API contract.
// It is intentionally local: this consumer does not import implementation files from another module repository.
type RegistrationFailure =
  | "invalid-descriptor"
  | "invalid-api-version"
  | "unknown-module"
  | "inactive-module"
  | "already-registered"
  | "incompatible-api-version"
  | "internal-error";

type RegistrationResult =
  | {
      readonly ok: true;
      readonly module: {
        readonly id: string;
        readonly title: string;
        readonly version: string;
        readonly apiVersion: string;
      };
    }
  | { readonly ok: false; readonly reason: RegistrationFailure; readonly detail: string };

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

type CharacterUpdateAbility = "str" | "dex" | "con" | "int" | "wis" | "cha";
interface CharacterUpdateV1 {
  readonly uuid: `Actor.${string}`;
  readonly operationId: string;
  readonly revision: number;
  readonly abilities: Readonly<Partial<Record<CharacterUpdateAbility, { readonly from: number; readonly to: number }>>>;
}
interface CharacterUpdateResultV1 {
  readonly uuid: string;
  readonly revision: number;
  readonly applied: boolean;
  readonly changed: readonly CharacterUpdateAbility[];
}

type RequestFailure =
  | "invalid-request"
  | "not-registered"
  | "unknown-request"
  | "unsupported-version"
  | "invalid-payload"
  | "handler-failed"
  | "internal-error"
  | "no-gm"
  | "relay-timeout"
  | "relay-failed"
  | "not-permitted"
  | "conflict";

type RequestResult =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly reason: RequestFailure; readonly detail: string };

type RightsLevel = "denied" | "own" | "all";

type RightsResult =
  | { readonly ok: true; readonly value: { readonly level: RightsLevel } }
  | {
      readonly ok: false;
      readonly reason: "invalid-request" | "not-registered" | "internal-error";
      readonly detail: string;
    };

type SystemStatus = "tested" | "same-line" | "untested" | "other-system" | "unknown";

type SystemInfoResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly id: string | null;
        readonly version: string | null;
        readonly status: SystemStatus;
        readonly testedVersions: readonly string[];
      };
    }
  | { readonly ok: false; readonly reason: "internal-error"; readonly detail: string };

interface EagleFlightControlApi {
  readonly version: string;
  registerModule(descriptor: {
    id: string;
    apiVersion: string;
    open?: () => void | Promise<void>;
  }): RegistrationResult;
  request(request: {
    module: string;
    type: string;
    version?: number;
    payload?: JsonValue;
  }): Promise<RequestResult>;
  getRights(moduleId: string): RightsResult;
  getSystemInfo(): SystemInfoResult;
}

declare global {
  interface ModuleConfig {
    "eagle-flight-control": { api: EagleFlightControlApi };
  }
}

export {};
