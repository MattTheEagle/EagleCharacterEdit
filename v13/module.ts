import { FLIGHT_CONTROL_ID, logCharacterEditReady } from "../core/index";
import type { FlightControlRequester } from "../core/character-create";
import {
  registerWithFlightControl,
  type RegistrationLog,
  type RegistrationOutcome,
  type RegistrationSource,
} from "../core/flight-control";
import { createCharacterCreateApplicationClass } from "./character-create-application";
import { localCharacterCreateStore } from "./operation-store";

const consoleLog: RegistrationLog = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};

const flightControlSource: RegistrationSource = {
  api: () => game.modules?.get(FLIGHT_CONTROL_ID)?.api,
};

let registration: RegistrationOutcome | undefined;

function text(key: string): string {
  return game.i18n?.localize(key) ?? key;
}

function requestApi(): FlightControlRequester | undefined {
  const api = game.modules?.get(FLIGHT_CONTROL_ID)?.api;
  return api && typeof api.request === "function" ? api : undefined;
}

const CharacterCreateApplication = createCharacterCreateApplicationClass({
  api: requestApi,
  store: localCharacterCreateStore,
  newId: () => foundry.utils.randomID(),
  text,
});

function openCharacterCreate(): void {
  if (registration?.status !== "registered") return;
  void new CharacterCreateApplication().render(true);
}

function warnGamemasters(): void {
  if (registration?.status === "registered" || game.user?.isGM !== true) return;
  const fallback = "Eagle Character Edit is unavailable because Eagle Flight Control is missing, inactive, or incompatible.";
  const message = game.i18n?.localize("EAGLECHARACTEREDIT.registration.unavailable") ?? fallback;
  ui.notifications?.warn(message);
}

Hooks.once("init", () => {
  logCharacterEditReady("13");
});

Hooks.once("setup", () => {
  registration = registerWithFlightControl(flightControlSource, consoleLog, openCharacterCreate);
});

Hooks.once("ready", () => {
  warnGamemasters();
});
