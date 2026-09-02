const path = require("path");
const fs = require("fs");
const { pathsToModuleNameMapper } = require("ts-jest");

const testsTsConfigPath = path.resolve(__dirname, "tests", "tsconfig.json");
const tsconfig = JSON.parse(
  fs.readFileSync(testsTsConfigPath, {
    encoding: "utf-8",
  })
);

const moduleNameMapper = {
  ...pathsToModuleNameMapper(tsconfig.compilerOptions.paths, {
    prefix: "<rootDir>",
  }),
  "\\.(css|less|sass|scss)$": "identity-obj-proxy",
};

const collectCoverageFrom = ["<rootDir>/src/**/!(*.d).ts*"];

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
const defaultConfig = {
  coverageDirectory: "coverage",
  globals: {
    "ts-jest": {
      diagnostics: false,
      isolatedModules: true,
      tsconfig: testsTsConfigPath,
    },
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper,
  preset: "ts-jest/presets/js-with-ts",
  setupFiles: [
    "jest-date-mock",
    "<rootDir>/tests/mocks/electron.ts",
    "<rootDir>/tests/mocks/new-user-config.ts",
    "<rootDir>/tests/mocks/i18next.ts",
    "<rootDir>/tests/setup/env.ts",
  ],
};

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  collectCoverageFrom,
  projects: [
    {
      displayName: "integration",
      // The equivalent extglob form ?(*.)(spec|test).(ts|tsx) breaks on
      // Windows: micromatch mis-parses the pattern right after `**/`,
      // turning that separator into a literal backslash and matching 0
      // files. Every test file in this repo is named *.test.ts(x) (no
      // *.spec.* or bare test.ts files), so a plain brace pattern covers
      // the exact same set without hitting the bug.
      testMatch: ["<rootDir>/tests/integration/**/*.test.{ts,tsx}"],
      ...defaultConfig,
    },
  ],
};
