import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const project = path.resolve(import.meta.dirname, "..");
const core = { window: { OrbitalEarth: {} } };
vm.createContext(core);
vm.runInContext(
  fs.readFileSync(path.join(project, "js/globe-core.js"), "utf8"),
  core,
);
const { projectPoint, screenToGeo, globeBounds, ringContains } =
  core.window.OrbitalGlobeCore;

test("index.html uses only local, classic scripts and existing stylesheets", () => {
  const html = fs.readFileSync(path.join(project, "index.html"), "utf8");
  assert.equal(/type="module"/.test(html), false);
  for (const [, file] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^https?:/.test(file));
    assert.ok(fs.existsSync(path.join(project, file)), file);
  }
  assert.ok(!html.includes("node_modules"));
});
test("globe geography round-trips across rotations, latitudes, viewport sizes and zoom levels", () => {
  let cases = 0;
  for (const width of [300, 640, 1200])
    for (const yaw of [-179, -105, 0, 90, 179])
      for (const tilt of [-60, 18, 65])
        for (const zoom of [0.8, 1, 1.15]) {
          const view = { width, height: 500, yaw, tilt, zoom };
          for (const [lon, lat] of [
            [128, 36],
            [10, 50],
            [-101, 31],
            [179, 10],
            [-179, -20],
            [0, 89],
          ]) {
            const point = projectPoint(lon, lat, view);
            if (point.depth < 0.05) continue;
            const geo = screenToGeo(point.x, point.y, view);
            assert.ok(Math.abs(((geo.lon - lon + 540) % 360) - 180) < 1e-6);
            assert.ok(Math.abs(geo.lat - lat) < 1e-6);
            cases++;
          }
        }
  assert.ok(cases > 300);
});
test("empty space cannot select a country, including after zoom", () => {
  const view = { width: 600, height: 500, yaw: -105, tilt: 18, zoom: 1.15 };
  const { cx, cy, radius } = globeBounds(view);
  assert.equal(screenToGeo(cx + radius + 2, cy, view), null);
  const center = screenToGeo(cx, cy, view);
  assert.ok(Math.abs(center.lon - 105) < 1e-10);
  assert.ok(Math.abs(center.lat - 18) < 1e-10);
});
test("country polygons can cross the international date line", () => {
  const polygon = [
    [170, -10],
    [-170, -10],
    [-170, 10],
    [170, 10],
    [170, -10],
  ];
  assert.equal(ringContains(179, 0, polygon), true);
  assert.equal(ringContains(-179, 0, polygon), true);
  assert.equal(ringContains(0, 0, polygon), false);
});
test("the HTML helper escapes imported text and handles boolean form attributes", () => {
  const browser = {
    window: { OrbitalIcons: {} },
    document: { addEventListener() {} },
  };
  vm.createContext(browser);
  vm.runInContext(
    fs.readFileSync(path.join(project, "js/ui.js"), "utf8"),
    browser,
  );
  const ui = browser.window.OrbitalUI;
  assert.equal(
    ui.content(ui.html`<p>${"<script>alert(1)</script>"}</p>`),
    "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  );
  assert.equal(
    ui.content(ui.attributes({ disabled: false, required: true })),
    " required",
  );
  assert.equal(
    ui.content(ui.html`${[ui.html`<b>1</b>`, ui.html`<b>2</b>`]}`),
    "<b>1</b><b>2</b>",
  );
});
test("all three globe textures are bundled as data URLs for local-file rendering", () => {
  const browser = { window: {} };
  vm.createContext(browser);
  vm.runInContext(
    fs.readFileSync(path.join(project, "assets/earth-data.js"), "utf8"),
    browser,
  );
  for (const key of ["day", "night", "clouds"])
    assert.match(
      browser.window.OrbitalEarth[key],
      /^data:image\/(jpeg|png);base64,/,
    );
  assert.ok(browser.window.OrbitalEarth.countries.length > 100);
});
test("the same scoring rules are shared by browser and backend", () => {
  const { investmentScore } = require("../js/config.js");
  assert.equal(
    investmentScore({ fit: 5, demand: 5, economics: 5, moat: 5 }),
    100,
  );
  assert.equal(
    investmentScore({ fit: 4, demand: 3, economics: 3, moat: 3 }),
    66,
  );
});
