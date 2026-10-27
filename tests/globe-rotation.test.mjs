import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function fixture() {
  let clock = 0;
  const sceneEvents = new Map(), canvasEvents = new Map(), globalEvents = new Map();
  const buttons = new Map(["play", "plus", "minus", "reset"].map((name) => [name, {}]));
  const canvas = {
    style: {},
    addEventListener: (name, handler) => canvasEvents.set(name, handler),
    setPointerCapture() {}, hasPointerCapture: () => false,
  };
  const scene = {
    addEventListener: (name, handler) => sceneEvents.set(name, handler),
    querySelector: (selector) => buttons.get(selector.match(/="(\w+)"/)[1]),
  };
  const window = {
    OrbitalGlobeCore: { INITIAL_YAW: -105, INITIAL_TILT: 18 },
    addEventListener: (name, handler) => globalEvents.set(name, handler),
    removeEventListener: (name, handler) => {
      assert.equal(globalEvents.get(name), handler);
      globalEvents.delete(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(new URL("../js/globe.js", import.meta.url), "utf8"), {
    window, performance: { now: () => clock }, cancelAnimationFrame() {},
  });
  const globe = Object.create(window.OrbitalGlobe.prototype);
  Object.assign(globe, {
    scene, canvas, view: { yaw: 0, tilt: 18, zoom: 1 },
    playing: true, resumeAt: 0, activePointers: new Set(), drag: null,
    media: { matches: false }, model: { setSelectedCountry() {} },
    updatePlayButton() {},
  });
  globe.bindControls();
  return { globe, buttons, sceneEvents, canvasEvents, globalEvents, at: (time) => { clock = time; } };
}

test("auto rotation pauses throughout a drag and resumes three seconds after release", () => {
  const { globe, sceneEvents, canvasEvents, globalEvents, at } = fixture();
  assert.equal(globe.advanceRotation(1000, 32), true);
  assert.ok(globe.view.yaw > 0);
  at(1000);
  const down = { pointerId: 1, isPrimary: true, button: 0, clientX: 10, clientY: 10 };
  sceneEvents.get("pointerdown")(down);
  canvasEvents.get("pointerdown")(down);
  at(6000);
  assert.equal(globe.advanceRotation(6000, 32), false);
  canvasEvents.get("pointermove")({ pointerId: 1, clientX: 40, clientY: 20 });
  globalEvents.get("pointerup")({ pointerId: 1 });
  canvasEvents.get("pointerup")({ pointerId: 1 });
  const pausedYaw = globe.view.yaw;
  assert.equal(globe.resumeAt, 9000);
  assert.equal(globe.advanceRotation(8999, 32), false);
  assert.equal(globe.view.yaw, pausedYaw);
  assert.equal(globe.advanceRotation(9100, 32), true);
  assert.ok(globe.view.yaw > pausedYaw);
  // A pointer or keyboard focus left over the globe must not prevent resuming.
  globe.hover = true;
  globe.focused = true;
  assert.equal(globe.advanceRotation(10000, 32), true);
});

test("zoom, wheel and keyboard interactions restart the idle countdown", () => {
  const { globe, buttons, sceneEvents, canvasEvents, at } = fixture();
  at(1000);
  sceneEvents.get("wheel")();
  assert.equal(globe.resumeAt, 4000);
  at(2500);
  buttons.get("plus").onclick();
  assert.equal(globe.resumeAt, 5500);
  assert.equal(globe.view.zoom, 1.05);
  at(4000);
  const key = { target: globe.canvas, key: "ArrowRight", preventDefault() {} };
  canvasEvents.get("keydown")(key);
  sceneEvents.get("keydown")(key);
  assert.equal(globe.resumeAt, 7000);
  assert.equal(globe.advanceRotation(6999, 32), false);
  assert.equal(globe.advanceRotation(7100, 32), true);
});

test("cancelled gestures release the pause and explicit play controls retain their meaning", () => {
  const { globe, buttons, sceneEvents, globalEvents, at } = fixture();
  at(1000);
  sceneEvents.get("pointerdown")({ pointerId: 4 });
  assert.equal(globe.advanceRotation(6000, 32), false);
  at(6000);
  globalEvents.get("pointercancel")({ pointerId: 4 });
  assert.equal(globe.advanceRotation(9100, 32), true);
  buttons.get("play").onclick();
  assert.equal(globe.playing, false);
  assert.equal(globe.advanceRotation(50000, 32), false);
  buttons.get("play").onclick();
  assert.equal(globe.playing, true);
  assert.equal(globe.resumeAt, 0);
  assert.equal(globe.advanceRotation(50001, 32), true);
  globe.destroy();
  assert.equal(globalEvents.size, 0);
});
