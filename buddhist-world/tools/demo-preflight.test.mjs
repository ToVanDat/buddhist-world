import test from "node:test";
import assert from "node:assert/strict";
import { parseEnv, isPlaceholderSecret } from "./demo-preflight.mjs";

test("parseEnv reads values, quoted values and ignores comments", () => {
  const parsed = parseEnv([
    "# comment",
    "PORT=3001",
    "DATABASE_URL='postgres://localhost:5433/buddhist_world'",
    "WORLD_WEATHER=clear # inline note",
    "INVALID_LINE",
  ].join("\n"));
  assert.deepEqual(parsed, {
    PORT: "3001",
    DATABASE_URL: "postgres://localhost:5433/buddhist_world",
    WORLD_WEATHER: "clear",
  });
});

test("placeholder and short JWT secrets are rejected", () => {
  assert.equal(isPlaceholderSecret("CHANGE_ME_generate_a_secret_that_is_long_enough"), true);
  assert.equal(isPlaceholderSecret("short"), true);
  assert.equal(isPlaceholderSecret("a".repeat(48)), false);
});

test("parseEnv keeps equals signs inside values", () => {
  assert.equal(parseEnv("TOKEN=abc==").TOKEN, "abc==");
});
