// Shared by the WebGL surface, geographic picking and HTML markers.
export const INITIAL_YAW = -105;
export const INITIAL_TILT = 18;
const RAD = Math.PI / 180;
export type GlobeView = { width: number; height: number; yaw: number; tilt: number; zoom: number };
export type CountryShape = { name: string; rings: number[][][] };

export function globeBounds(view: GlobeView) {
  return { cx: view.width / 2, cy: view.height * .5, radius: Math.min(view.width * .385, view.height * .425) * view.zoom };
}

export function projectPoint(lon: number, lat: number, view: GlobeView) {
  const a = view.yaw * RAD, b = view.tilt * RAD;
  const x = Math.cos(lat * RAD) * Math.sin(lon * RAD);
  const y = Math.sin(lat * RAD), z = Math.cos(lat * RAD) * Math.cos(lon * RAD);
  const xx = x * Math.cos(a) + z * Math.sin(a), zz = z * Math.cos(a) - x * Math.sin(a);
  const yy = y * Math.cos(b) - zz * Math.sin(b), depth = y * Math.sin(b) + zz * Math.cos(b);
  const { cx, cy, radius } = globeBounds(view);
  return { x: cx + xx * radius, y: cy - yy * radius, depth };
}

export function screenToGeo(x: number, y: number, view: GlobeView) {
  const { cx, cy, radius } = globeBounds(view);
  const sx = (x - cx) / radius, sy = (cy - y) / radius, q = sx * sx + sy * sy;
  if (q > 1 || !Number.isFinite(q)) return null;
  const sz = Math.sqrt(1 - q), a = view.yaw * RAD, b = view.tilt * RAD;
  const yy = sy * Math.cos(b) + sz * Math.sin(b), zz = -sy * Math.sin(b) + sz * Math.cos(b);
  return { lon: Math.atan2(sx * Math.cos(a) - zz * Math.sin(a), sx * Math.sin(a) + zz * Math.cos(a)) / RAD,
    lat: Math.asin(Math.max(-1, Math.min(1, yy))) / RAD };
}

export function ringContains(lon: number, lat: number, ring: number[][]) {
  if (ring.length < 3) return false;
  let prev = lon;
  const points = ring.map(([rawX, y]) => {
    let x = rawX;
    while (x - prev > 180) x -= 360;
    while (x - prev < -180) x += 360;
    prev = x;
    return { x, y };
  });
  let q = lon;
  while (q - points[0].x > 180) q -= 360;
  while (q - points[0].x < -180) q += 360;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > lat) !== (b.y > lat) && q < (b.x - a.x) * (lat - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
