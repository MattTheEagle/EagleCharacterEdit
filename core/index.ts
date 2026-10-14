export const CHARACTER_EDIT_ID = "eagle-character-edit";
export const CHARACTER_EDIT_TITLE = "Eagle Character Edit";
export const FLIGHT_CONTROL_ID = "eagle-flight-control";
export const REQUIRED_API_VERSION = "0.15.0";
export const FLIGHT_CONTROL_MIN_MODULE_VERSION = "0.10.0";

export function logCharacterEditReady(foundryVersion: string): void {
  console.log(`${CHARACTER_EDIT_ID} | ready (Foundry v${foundryVersion})`);
}
