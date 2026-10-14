import { describe, expect, it, vi } from "vitest";
import {
  registerWithFlightControl,
  registrationDescriptor,
  type RegistrationApi,
  type RegistrationLog,
  type RegistrationSource,
} from "./flight-control";
import { CHARACTER_EDIT_ID, REQUIRED_API_VERSION } from "./index";

const log: RegistrationLog = { info: vi.fn(), warn: vi.fn() };

function source(api: RegistrationApi | undefined): RegistrationSource {
  return { api: () => api };
}

describe("Eagle Character Edit Flight Control registration", () => {
  it("registers the approved consumer descriptor with its local opener", () => {
    const open = vi.fn();
    const registerModule = vi.fn(() => ({
      ok: true as const,
      module: { id: CHARACTER_EDIT_ID, title: "Eagle Character Edit", version: "0.1.0", apiVersion: REQUIRED_API_VERSION },
    }));
    const api: RegistrationApi = { registerModule };

    const outcome = registerWithFlightControl(source(api), log, open);

    expect(registrationDescriptor(open)).toEqual({ id: CHARACTER_EDIT_ID, apiVersion: REQUIRED_API_VERSION, open });
    expect(Object.keys(registrationDescriptor(open)).sort()).toEqual(["apiVersion", "id", "open"]);
    expect(registerModule).toHaveBeenCalledOnce();
    expect(registerModule).toHaveBeenCalledWith({ id: CHARACTER_EDIT_ID, apiVersion: REQUIRED_API_VERSION, open });
    expect(outcome).toMatchObject({ status: "registered", module: { id: CHARACTER_EDIT_ID, apiVersion: REQUIRED_API_VERSION } });
  });

  it("does not need any other API member to register", () => {
    const api = {
      registerModule: vi.fn(() => ({
        ok: true as const,
        module: { id: CHARACTER_EDIT_ID, title: "Eagle Character Edit", version: "0.1.0", apiVersion: REQUIRED_API_VERSION },
      })),
      get request(): never {
        throw new Error("registration must not access requests");
      },
    } as unknown as RegistrationApi;

    expect(registerWithFlightControl(source(api), log)).toMatchObject({ status: "registered" });
  });

  it("turns missing, throwing, and malformed API responses into controlled outcomes", () => {
    expect(registerWithFlightControl(source(undefined), log)).toEqual({ status: "missing" });
    expect(
      registerWithFlightControl(
        { api: () => { throw new Error("module lookup failed"); } },
        log,
      ),
    ).toEqual({ status: "error", detail: "module lookup failed" });
    expect(
      registerWithFlightControl(source({ registerModule: () => ({ ok: true }) }), log),
    ).toEqual({ status: "invalid-response", detail: "registerModule returned an invalid response" });
  });

  it.each([
    "invalid-descriptor",
    "invalid-api-version",
    "unknown-module",
    "inactive-module",
    "already-registered",
    "incompatible-api-version",
    "internal-error",
  ])("preserves documented registration rejection %s", (reason) => {
    const outcome = registerWithFlightControl(
      source({ registerModule: () => ({ ok: false, reason, detail: "contract result" }) }),
      log,
    );

    expect(outcome).toEqual({ status: "rejected", reason, detail: "contract result" });
  });
});
