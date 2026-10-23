'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { sectors } from '../../lib/strategy-config';
import { globeBounds, INITIAL_TILT, INITIAL_YAW, projectPoint, ringContains, screenToGeo, type CountryShape, type GlobeView } from '../../lib/globe-geometry';
import { createGlobeRenderer } from '../../lib/globe-renderer';

// Exploration locations are illustrative; counts belong to sectors, not countries.
const locations = [
  { name: '대한민국', country: 'South Korea', lon: 128, lat: 36, sector: 'space', label: true },
  { name: '중국', country: 'China', lon: 104, lat: 35, label: true },
  { name: '일본', country: 'Japan', lon: 139.7, lat: 35.7 },
  { name: '러시아', country: 'Russia', lon: 90, lat: 60, label: true },
  { name: '카자흐스탄', country: 'Kazakhstan', lon: 67, lat: 48, label: true },
  { name: '아랍에미리트', country: 'United Arab Emirates', lon: 54, lat: 24, label: true },
  { name: '싱가포르', country: 'Singapore', lon: 103.8, lat: 1.3, sector: 'maritime', label: true },
  { name: '인도', country: 'India', lon: 79, lat: 22, label: true },
  { name: '호주', country: 'Australia', lon: 134, lat: -25, label: true },
  { name: '인도네시아', country: 'Indonesia', lon: 116, lat: -4 },
  { name: '베트남', country: 'Vietnam', lon: 108, lat: 16 },
  { name: '유럽', country: 'Germany', lon: 10, lat: 50, sector: 'infrastructure', label: true },
  { name: '프랑스', country: 'France', lon: 2, lat: 46, label: true },
  { name: '스페인', country: 'Spain', lon: -4, lat: 40, label: true },
  { name: '영국', country: 'United Kingdom', lon: -2, lat: 54 },
  { name: '노르웨이', country: 'Norway', lon: 9, lat: 62 },
  { name: '스웨덴', country: 'Sweden', lon: 17, lat: 62 },
  { name: '핀란드', country: 'Finland', lon: 26, lat: 64 },
  { name: '폴란드', country: 'Poland', lon: 19, lat: 52 },
  { name: '튀르키예', country: 'Turkey', lon: 35, lat: 39 },
  { name: '중동', country: 'Qatar', lon: 51, lat: 25, sector: 'emissions' },
  { name: '남아프리카공화국', country: 'South Africa', lon: 25, lat: -29 },
  { name: '미국', country: 'United States of America', lon: -101, lat: 31, sector: 'solar', label: true },
  { name: '캐나다', country: 'Canada', lon: -106, lat: 56, label: true },
  { name: '브라질', country: 'Brazil', lon: -52, lat: -13, sector: 'agriculture', label: true },
  { name: '칠레', country: 'Chile', lon: -71, lat: -30 },
];

type Props = {
  selected: string; onSelect: (id: string) => void; counts: Record<string, number>;
  selectedCountry: string | null; onCountrySelect: (name: string | null) => void;
};
type Drag = { x: number; y: number; yaw: number; tilt: number; moved: boolean; pointerId: number };

export default function Globe(props: Props) {
  const surface = useRef<HTMLCanvasElement>(null), overlay = useRef<HTMLCanvasElement>(null);
  const scene = useRef<HTMLDivElement>(null), markers = useRef<(HTMLButtonElement | null)[]>([]);
  const view = useRef<GlobeView>({ width: 600, height: 500, yaw: INITIAL_YAW, tilt: INITIAL_TILT, zoom: 1 });
  const latest = useRef(props), drag = useRef<Drag | null>(null), hover = useRef(false), focus = useRef(false);
  const running = useRef(true), dirty = useRef(true), reducedMotion = useRef(false), countryShapes = useRef<CountryShape[]>([]);
  const [playing, setPlaying] = useState(true), [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => { latest.current = props; dirty.current = true; }, [props]);
  useEffect(() => { running.current = playing; dirty.current = true; }, [playing]);

  useEffect(() => {
    const el = surface.current!, decoration = overlay.current!, container = scene.current!;
    const ctx = decoration.getContext('2d');
    if (!ctx) { setStatus('error'); return; }
    let disposed = false, visible = true, frame = 0, last = 0;
    let renderer: ReturnType<typeof createGlobeRenderer>;
    try { renderer = createGlobeRenderer(el, () => setStatus('error')); }
    catch { setStatus('error'); return; }
    renderer.ready.then(() => { if (!disposed && renderer.loaded) { setStatus('ready'); dirty.current = true; } });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChange = () => { reducedMotion.current = media.matches; if (media.matches) setPlaying(false); };
    motionChange(); media.addEventListener('change', motionChange);
    const abort = new AbortController();
    fetch('/countries.json', { signal: abort.signal }).then(r => { if (!r.ok) throw new Error('Map unavailable'); return r.json(); })
      .then(data => { countryShapes.current = data as CountryShape[]; dirty.current = true; }).catch(() => { /* Named markers work without outlines. */ });
    const resize = () => {
      const rect = container.getBoundingClientRect();
      view.current.width = rect.width; view.current.height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      decoration.width = Math.round(rect.width * dpr); decoration.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dirty.current = true;
    };
    const ro = new ResizeObserver(resize); ro.observe(container); resize();
    const io = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; dirty.current = true; }); io.observe(container);
    const draw = (time: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(draw);
      if (time - last < 32) return;
      const dt = last ? Math.min(time - last, 80) : 0; last = time;
      if (!visible || document.hidden || !view.current.width) return;
      const moving = running.current && !drag.current && !hover.current && !focus.current && !reducedMotion.current;
      if (moving) { view.current.yaw = (view.current.yaw + dt * .0025) % 360; dirty.current = true; }
      if (!dirty.current) return;
      dirty.current = false;
      const v = view.current, { cx, cy, radius } = globeBounds(v);
      renderer.render(v); ctx.clearRect(0, 0, v.width, v.height);
      for (let i = 0; i < 58; i++) {
        ctx.fillStyle = `rgba(157,188,218,${.08 + (i % 4) * .035})`;
        ctx.fillRect(((i * 7919) % 997) / 997 * v.width, ((i * 3533) % 991) / 991 * v.height, 1, 1);
      }
      // Orbit lines stay outside the sphere silhouette.
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, v.width, v.height); ctx.arc(cx, cy, radius * 1.015, 0, Math.PI * 2, true); ctx.clip('evenodd');
      for (const [rx, ry, angle] of [[1.31, .58, -.14], [1.4, .88, .12], [1.22, .45, -.37]]) {
        ctx.beginPath(); ctx.ellipse(cx, cy, radius * rx, radius * ry, angle, 0, Math.PI * 2);
        ctx.strokeStyle = '#80a2c118'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
      const country = countryShapes.current.find(c => c.name === latest.current.selectedCountry);
      if (country) {
        ctx.strokeStyle = '#ffb06eaa'; ctx.lineWidth = 1.2;
        for (const ring of country.rings) {
          ctx.beginPath(); let pen = false;
          for (const [lon, lat] of ring) {
            const p = projectPoint(lon, lat, v);
            if (p.depth <= .03) { pen = false; continue; }
            if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
            pen = true;
          }
          ctx.stroke();
        }
      }
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const projected = locations.map((location, i) => ({ location, i, ...projectPoint(location.lon, location.lat, v) }));
      projected.sort((a, b) => Number(b.location.country === latest.current.selectedCountry) - Number(a.location.country === latest.current.selectedCountry)
        || Number(!!b.location.sector) - Number(!!a.location.sector) || b.depth - a.depth);
      let labelCount = 0;
      for (const p of projected) {
        const button = markers.current[p.i]; if (!button) continue;
        const active = latest.current.selectedCountry === p.location.country;
        button.hidden = !renderer.loaded || p.depth < .08 || p.x < 10 || p.x > v.width - 10 || p.y < 32 || p.y > v.height - 60;
        if (button.hidden) continue;
        button.style.transform = `translate(${p.x - 14}px, ${p.y - 14}px)`;
        button.style.zIndex = String(active ? 40 : 10 + Math.round(p.depth * 10));
        button.style.opacity = latest.current.selected === 'all' || !p.location.sector || latest.current.selected === p.location.sector ? '1' : '.45';
        const label = button.querySelector<HTMLElement>('.globe-marker-label')!;
        const w = Math.max(70, label.offsetWidth), h = 44;
        const candidates = [[p.x + 14, p.y - 15], [p.x - w - 14, p.y - 15], [p.x + 12, p.y + 17], [p.x - w - 12, p.y - 53]];
        const spot = candidates.find(([x, y]) => x >= 10 && x + w <= v.width - 10 && y >= 35 && y + h <= v.height - 66
          && placed.every(a => x + w + 6 < a.x || x > a.x + a.w + 6 || y + h + 5 < a.y || y > a.y + a.h + 5));
        const show = !!spot && (active || (!!p.location.label && labelCount < (v.width < 380 ? 4 : 7)));
        button.classList.toggle('has-label', show);
        if (spot && show) {
          label.style.left = `${spot[0] - p.x + 14}px`; label.style.top = `${spot[1] - p.y + 14}px`;
          placed.push({ x: spot[0], y: spot[1], w, h }); labelCount++;
        }
      }
    };
    frame = requestAnimationFrame(draw);
    const contextLost = (event: Event) => { event.preventDefault(); setStatus('error'); };
    el.addEventListener('webglcontextlost', contextLost);
    return () => {
      disposed = true; abort.abort(); ro.disconnect(); io.disconnect(); cancelAnimationFrame(frame); renderer.dispose();
      media.removeEventListener('change', motionChange); el.removeEventListener('webglcontextlost', contextLost);
    };
  }, []);

  const changeZoom = (delta: number) => { view.current.zoom = Math.max(.8, Math.min(1.15, view.current.zoom + delta)); dirty.current = true; };
  const reset = () => {
    view.current.yaw = INITIAL_YAW; view.current.tilt = INITIAL_TILT; view.current.zoom = 1;
    props.onCountrySelect(null); dirty.current = true;
  };
  const countryName = locations.find(l => l.country === props.selectedCountry)?.name || props.selectedCountry;
  return <div className="globe-scene" ref={scene} onFocusCapture={() => { focus.current = true; }} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) focus.current = false; }}>
    <canvas ref={surface} className="globe-surface" tabIndex={0} role="img"
      aria-label="3D 지구본. 방향키로 회전, 더하기·빼기로 확대·축소, Home으로 초기화합니다. 거점은 Tab 키로 선택할 수 있습니다."
      onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home', ' '].includes(e.key)) return;
        e.preventDefault();
        if (e.key === 'ArrowLeft') view.current.yaw -= 8;
        if (e.key === 'ArrowRight') view.current.yaw += 8;
        if (e.key === 'ArrowUp') view.current.tilt = Math.min(65, view.current.tilt + 6);
        if (e.key === 'ArrowDown') view.current.tilt = Math.max(-60, view.current.tilt - 6);
        if (e.key === '+' || e.key === '=') changeZoom(.05);
        if (e.key === '-') changeZoom(-.05);
        if (e.key === 'Home') reset();
        if (e.key === ' ') setPlaying(p => !p);
        dirty.current = true;
      }}
      onPointerDown={e => {
        if (!e.isPrimary || e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY, yaw: view.current.yaw, tilt: view.current.tilt, moved: false, pointerId: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.style.cursor = 'grabbing';
      }}
      onPointerMove={e => {
        const d = drag.current; if (!d || d.pointerId !== e.pointerId) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        d.moved ||= Math.hypot(dx, dy) > 5;
        view.current.yaw = d.yaw + dx * .32; view.current.tilt = Math.max(-60, Math.min(65, d.tilt + dy * .24)); dirty.current = true;
      }}
      onPointerUp={e => {
        const d = drag.current; if (!d || d.pointerId !== e.pointerId) return;
        if (!d.moved) {
          const rect = e.currentTarget.getBoundingClientRect(), geo = screenToGeo(e.clientX - rect.left, e.clientY - rect.top, view.current);
          if (geo) {
            const country = countryShapes.current.find(c => c.rings.some(r => ringContains(geo.lon, geo.lat, r)));
            if (country) props.onCountrySelect(props.selectedCountry === country.name ? null : country.name);
          }
        }
        drag.current = null; e.currentTarget.style.cursor = 'grab';
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={e => { drag.current = null; e.currentTarget.style.cursor = 'grab'; }}
      onLostPointerCapture={() => { drag.current = null; }} />
    <canvas ref={overlay} className="globe-decoration" aria-hidden="true" />
    <div className="globe-top"><span>ORBITAL VIEW / EARTH</span><span>3D EARTH VIEW</span></div>
    <div className="globe-markers">{locations.map((location, i) => <button key={location.name}
      ref={el => { markers.current[i] = el; }} className={'globe-marker' + (props.selectedCountry === location.country ? ' is-selected' : '')}
      hidden={status !== 'ready'} aria-label={`${location.name} 거점 선택${location.sector ? ' · ' + sectors.find(s => s.id === location.sector)?.name : ''}`}
      aria-pressed={props.selectedCountry === location.country}
      onPointerEnter={() => { hover.current = true; }} onPointerLeave={() => { hover.current = false; }}
      onClick={() => {
        props.onCountrySelect(props.selectedCountry === location.country ? null : location.country);
        if (location.sector) props.onSelect(props.selected === location.sector ? 'all' : location.sector);
      }}><span className="globe-marker-dot" /><span className="globe-marker-label"><strong>{location.name}</strong><small>{location.sector ? `${props.counts[location.sector] || 0}건 · 분야 신호` : '거점 탐색'}</small></span></button>)}</div>
    {props.selectedCountry && <button className="globe-country-selection" onClick={() => props.onCountrySelect(null)} aria-label="선택 국가 해제">{countryName}<X size={12}/></button>}
    {status !== 'ready' && <div className="globe-status" role="status">{status === 'loading' ? '지구 표면을 불러오는 중입니다.' : '3D 지구본을 표시할 수 없습니다. 아래 분야 버튼을 이용해 주세요.'}</div>}
    <p className="globe-caption">드래그하여 회전 · 빛나는 거점을 클릭하세요</p>
    <div className="globe-controls" role="group" aria-label="지구본 조작">
      <button onClick={() => setPlaying(p => !p)} aria-label={playing ? '지구 자전 일시정지' : '지구 자전 시작'} aria-pressed={!playing} title={playing ? '자전 일시정지' : '자전 시작'}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button>
      <span/><button onClick={() => changeZoom(.05)} aria-label="지구 확대"><Plus size={20}/></button>
      <button onClick={() => changeZoom(-.05)} aria-label="지구 축소"><Minus size={20}/></button>
      <span/><button onClick={reset} aria-label="아시아로 보기 초기화" title="아시아로 초기화"><RotateCcw size={17}/></button>
    </div>
  </div>;
}
