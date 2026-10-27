import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("dashboard refresh reuses the globe and keeps its view until leaving the page", () => {
  const instances = [];
  let placeholder;
  const root = {
    set innerHTML(value) {
      placeholder = value === "globe" ? { replaceChildren(scene) { this.scene = scene; } } : null;
    },
    querySelectorAll() { return []; },
  };
  const window = {
    scrollTo() {},
    OrbitalConfig: { sourceFeeds: [], sectorOf() {} },
    OrbitalResearchConfig: { countries: [{ mapName: "Japan", lon: 138, lat: 37 }] },
    OrbitalResearchCore: { isArticleVisible: () => true },
    OrbitalResearchController: {
      create: () => ({ data: {}, model: () => ({}), async afterLoad() {} }),
    },
    OrbitalSelect: () => ({}),
    OrbitalUI: { beginRender() {}, content: (value) => value, hydrate() {} },
    OrbitalViews: {
      renderDashboard: () => window.OrbitalApp.getModel().view === "overview" ? "globe" : "other",
    },
    OrbitalGlobe: class {
      constructor(host, model, saved) {
        this.view = { yaw: 0, tilt: 0, zoom: 1, ...saved };
        this.playing = saved?.playing ?? true;
        this.resumeAt = saved?.resumeAt || 0;
        this.scene = {};
        this.renderer = {};
        this.updates = 0;
        host.replaceChildren(this.scene);
        instances.push(this);
      }
      update(model) { this.model = model; this.updates++; }
      updatePlayButton() {}
      pauseForInteraction() { this.resumeAt = 3000; }
      destroy() { this.disposed = true; }
    },
  };
  vm.runInNewContext(fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8"), {
    window,
    document: {
      activeElement: null,
      getElementById: (id) => id === "app" ? root : placeholder,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    location: { protocol: "http:" },
    fetch: () => new Promise(() => {}),
    setInterval() {}, setTimeout() {}, clearTimeout() {}, AbortSignal,
  });
  const globe = instances[0];
  const renderer = globe.renderer;
  globe.view.yaw = 74;
  globe.view.zoom = 1.1;
  for (let i = 0; i < 5; i++) window.OrbitalApp.render();
  assert.equal(instances.length, 1);
  assert.equal(globe.renderer, renderer);
  assert.equal(placeholder.scene, globe.scene);
  assert.equal(globe.view.yaw, 74);
  assert.equal(globe.view.zoom, 1.1);
  assert.equal(globe.disposed, undefined);
  window.OrbitalApp.getModel().setSelectedCountry("Japan");
  assert.equal(instances.length, 1);
  assert.equal(globe.view.yaw, -138);
  assert.equal(globe.view.tilt, 37);
  assert.equal(globe.playing, true);
  assert.equal(globe.resumeAt, 3000);
  window.OrbitalApp.getModel().setView("knowledge");
  assert.equal(globe.disposed, true);
  window.OrbitalApp.getModel().setView("overview");
  assert.equal(instances.length, 2);
  assert.equal(instances[1].view.yaw, -138);
  assert.equal(instances[1].view.zoom, 1.1);
  assert.equal(instances[1].playing, true);
  assert.equal(instances[1].resumeAt, 3000);
});

test("globe data updates replace markers without resetting the loaded surface or camera", () => {
  const children = [];
  const scene = {
    selection: null,
    querySelector(selector) {
      return selector === ".globe-markers"
        ? { replaceChildren() { children.length = 0; }, append(child) { children.push(child); } }
        : this.selection;
    },
    append(child) { this.selection = child; },
  };
  const createElement = () => ({
    children: [],
    classList: { add() {} },
    setAttribute() {},
    append(...items) { this.children.push(...items); },
    addEventListener() {},
    remove() { scene.selection = null; },
  });
  const window = { OrbitalGlobeCore: {} };
  vm.runInNewContext(fs.readFileSync(new URL("../js/globe.js", import.meta.url), "utf8"), {
    window, document: { createElement }, performance: { now: () => 0 },
  });
  const globe = Object.create(window.OrbitalGlobe.prototype);
  let repaints = 0;
  const renderer = { loaded: true, render() { repaints++; } };
  const view = { yaw: 17, zoom: 1.1 };
  Object.assign(globe, { scene, renderer, view, positionMarkers() {} });
  const location = { country: "Japan", name: "일본", count: 3 };
  const model = { globeLocations: [location], selectedCountry: null };
  globe.update(model);
  const marker = globe.markers[0];
  globe.update({ ...model });
  assert.equal(globe.markers[0], marker);
  assert.equal(globe.renderer, renderer);
  assert.equal(globe.view, view);
  globe.update({ ...model, globeLocations: [{ ...location, count: 7 }] });
  assert.notEqual(globe.markers[0], marker);
  assert.equal(globe.markers[0].children[1].children[1].textContent, "관련 기사 7건");
  let cleared = false;
  globe.update({ ...model, selectedCountry: "Japan", setSelectedCountry() { throw new Error("stale model"); } });
  globe.update({ ...model, selectedCountry: "Japan", setSelectedCountry(value) { cleared = value === null; } });
  scene.selection.onclick();
  assert.equal(cleared, true);
  assert.equal(globe.renderer, renderer);
  assert.equal(globe.view.yaw, 17);
  assert.equal(repaints, 5);
});
