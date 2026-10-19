/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import packageRaw from "../package.json?raw";
import manifestRaw from "../v13/module.json?raw";
import {
  CHARACTER_EDIT_ID,
  CHARACTER_EDIT_TITLE,
  FLIGHT_CONTROL_ID,
  FLIGHT_CONTROL_MIN_MODULE_VERSION,
} from "./index";

interface Manifest {
  id: string;
  title: string;
  version: string;
  compatibility: { minimum: string; verified: string };
  relationships: unknown;
  esmodules: string[];
  languages: { lang: string; name: string; path: string }[];
}

interface PackageJson {
  name: string;
  version: string;
}

const packageJson = JSON.parse(packageRaw) as PackageJson;
const manifest = JSON.parse(manifestRaw) as Manifest;

describe("Eagle Character Edit manifest", () => {
  it("describes the approved local v13 consumer module", () => {
    expect(packageJson.name).toBe(CHARACTER_EDIT_ID);
    expect(packageJson.version).toBe("0.5.0");
    expect(manifest).toMatchObject({
      id: CHARACTER_EDIT_ID,
      title: CHARACTER_EDIT_TITLE,
      version: packageJson.version,
      compatibility: { minimum: "13", verified: "13" },
      esmodules: ["dist/module.js"],
      languages: [{ lang: "en", name: "English", path: "lang/en.json" }],
    });
  });

  it("requires the Flight Control version that first provides API 0.16.1", () => {
    expect(manifest.relationships).toEqual({
      requires: [
        {
          id: FLIGHT_CONTROL_ID,
          type: "module",
          compatibility: { minimum: FLIGHT_CONTROL_MIN_MODULE_VERSION },
        },
      ],
    });
  });

  it("contains no invented online or release address", () => {
    for (const field of ["url", "bugs", "manifest", "download"]) {
      expect(manifest).not.toHaveProperty(field);
    }
  });
});
