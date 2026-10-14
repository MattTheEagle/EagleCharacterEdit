import { FLIGHT_CONTROL_ID, logCharacterEditReady } from "../core/index";
import type { FlightControlRequester } from "../core/character-create";
import { createSingleInstanceSlot, type CharacterReadEntry } from "../core/character-create-flow";
import {
  registerWithFlightControl,
  type RegistrationLog,
  type RegistrationOutcome,
  type RegistrationSource,
} from "../core/flight-control";
import { createCharacterCreateApplicationClass } from "./character-create-application";
import type { CharacterCreateApplicationHandle } from "./character-create-application";
import { createCharacterReadApplicationClass } from "./character-read-application";
import { registerCharacterReadHeaderHook } from "./character-read-hooks";
import { observeCharacterRead } from "./character-read-observer";
import { createFoundryCharacterReader } from "./character-read";
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

function isRegistered(): boolean {
  return registration?.status === "registered";
}

function unavailable(): void {
  ui.notifications?.warn(text("EAGLECHARACTEREDIT.read.unavailable"));
}

function notify(level: "info" | "warn", key: string): void {
  ui.notifications?.[level](text(key));
}

const createApplicationSlot = createSingleInstanceSlot<CharacterCreateApplicationHandle>();

const CharacterCreateApplication = createCharacterCreateApplicationClass({
  api: requestApi,
  store: localCharacterCreateStore,
  newId: () => foundry.utils.randomID(),
  openCharacter: (actorId, entry) => openCharacterRead(actorId, entry),
  notify,
  onClose: (application) => createApplicationSlot.release(application),
  text,
});

const characterReader = createFoundryCharacterReader();
const CharacterReadApplication = createCharacterReadApplicationClass({
  read: (actorId) => isRegistered() ? characterReader.read(actorId) : undefined,
  observe: (actorId, refresh) => observeCharacterRead({ hooks: Hooks, actorId, refresh }),
  text,
});

function openCharacterCreate(): void {
  if (!isRegistered()) return;
  const application = createApplicationSlot.acquire(() => new CharacterCreateApplication());
  void application.render(true);
}

async function openCharacterRead(actorId: string, entry: CharacterReadEntry = "sheet"): Promise<boolean> {
  if (!isRegistered() || !characterReader.canRead(actorId)) {
    unavailable();
    return false;
  }
  try {
    await new CharacterReadApplication(actorId, entry).render(true);
    return true;
  } catch {
    unavailable();
    return false;
  }
}

function warnGamemasters(): void {
  if (isRegistered() || game.user?.isGM !== true) return;
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
  registerCharacterReadHeaderHook({
    hooks: Hooks,
    isAvailable: isRegistered,
    canRead: (actorId) => isRegistered() && characterReader.canRead(actorId),
    open: (actorId) => void openCharacterRead(actorId),
    label: () => text("EAGLECHARACTEREDIT.read.open"),
  });
});
