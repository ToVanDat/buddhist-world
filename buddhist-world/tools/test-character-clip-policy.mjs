import assert from "node:assert/strict";
import test from "node:test";
import { findMissingAnimationMotions, matchesAnimationAlias } from "../packages/shared/src/characterClipPolicy.mjs";
import contract from "../packages/shared/src/characterAnimationContract.json" with { type: "json" };

test("runtime and validator share exact-token alias matching", () => {
  assert.equal(matchesAnimationAlias("Armature|Idle", contract.player.idle), true);
  assert.equal(matchesAnimationAlias("Mixamo_Walk_Fwd", contract.player.walk), true);
  assert.equal(matchesAnimationAlias("idle_pose", contract.player.idle), true);
  assert.equal(matchesAnimationAlias("idlely", contract.player.idle), false);
  assert.equal(matchesAnimationAlias("walked_idle", contract.player.walk), false);
});

test("player contract requires all four directly-authored locomotion clips", () => {
  assert.deepEqual(findMissingAnimationMotions(
    ["Armature|Idle", "Walk_Fwd", "Run", "Jump"],
    contract.player,
  ), []);
  assert.deepEqual(findMissingAnimationMotions(
    ["Idle", "Walk", "Run"],
    contract.player,
  ), ["jump"]);
});

test("NPC contract requires the six authored social and schedule clips", () => {
  assert.deepEqual(findMissingAnimationMotions(
    ["Idle", "Walk", "Talk", "Pray", "Work", "Rest"],
    contract.npc,
  ), []);
  assert.deepEqual(findMissingAnimationMotions(
    ["Idle", "Walk", "Talk"],
    contract.npc,
  ), ["pray", "work", "rest"]);
});
