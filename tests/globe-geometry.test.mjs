import test from 'node:test';
import assert from 'node:assert/strict';
import { globeBounds, projectPoint, screenToGeo, ringContains } from '../lib/globe-geometry.ts';

test('visible locations project and pick back to their original coordinates through rotation, tilt and zoom', () => {
  let checked = 0;
  for (const width of [300, 640, 1200]) for (const yaw of [-179, -105, 0, 90, 179]) for (const tilt of [-60, 18, 65]) for (const zoom of [.8, 1, 1.15]) {
    const view = { width, height: 500, yaw, tilt, zoom };
    for (const [lon, lat] of [[128, 36], [10, 50], [-101, 31], [179, 10], [-179, -20], [0, 89]]) {
      const p = projectPoint(lon, lat, view);
      if (p.depth < .05) continue;
      const geo = screenToGeo(p.x, p.y, view);
      assert.ok(geo);
      const delta = ((geo.lon - lon + 540) % 360) - 180;
      assert.ok(Math.abs(delta) < 1e-6 && Math.abs(geo.lat - lat) < 1e-6);
      checked++;
    }
  }
  assert.ok(checked > 300);
});

test('sphere center follows the view direction and empty space cannot select a country', () => {
  const view = { width: 600, height: 500, yaw: -105, tilt: 18, zoom: 1 };
  const { cx, cy, radius } = globeBounds(view);
  assert.deepEqual(screenToGeo(cx + radius + 2, cy, view), null);
  const center = screenToGeo(cx, cy, view);
  assert.ok(Math.abs(center.lon - 105) < 1e-10 && Math.abs(center.lat - 18) < 1e-10);
});

test('country picking handles polygons crossing the international date line', () => {
  const ring = [[170, -10], [-170, -10], [-170, 10], [170, 10], [170, -10]];
  assert.equal(ringContains(179, 0, ring), true);
  assert.equal(ringContains(-179, 0, ring), true);
  assert.equal(ringContains(0, 0, ring), false);
  assert.equal(ringContains(179, 30, ring), false);
  assert.equal(ringContains(0, 0, []), false);
});
