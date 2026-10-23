import { globeBounds, type GlobeView } from './globe-geometry';

const vertexSource = `attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

// An orthographic sphere, shaded per pixel. The inverse rotation is the same
// as screenToGeo, so texture geography and clickable locations stay aligned.
const fragmentSource = `precision highp float;
uniform vec2 resolution;
uniform vec2 center;
uniform float radius;
uniform float yaw;
uniform float tilt;
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D cloudMap;
const float PI = 3.141592653589793;
void main() {
  vec2 p = (gl_FragCoord.xy - center) / radius;
  float d = length(p);
  if (d > 1.11) { gl_FragColor = vec4(0.0); return; }
  if (d > 1.0) {
    float halo = exp(-(d - 1.0) * 62.0) * .48;
    gl_FragColor = vec4(.08, .32, .74, halo);
    return;
  }
  vec3 n = vec3(p, sqrt(max(0.0, 1.0 - dot(p, p))));
  float yy = n.y * cos(tilt) + n.z * sin(tilt);
  float zz = -n.y * sin(tilt) + n.z * cos(tilt);
  vec3 world = vec3(n.x * cos(yaw) - zz * sin(yaw), yy, n.x * sin(yaw) + zz * cos(yaw));
  vec2 uv = vec2(atan(world.x, world.z) / (2.0 * PI) + .5, asin(clamp(world.y, -1.0, 1.0)) / PI + .5);
  vec3 land = texture2D(dayMap, uv).rgb;
  float light = max(0.0, dot(n, normalize(vec3(-.65, .7, .85))));
  vec3 color = land * (.28 + .82 * light);
  vec3 cities = texture2D(nightMap, uv).rgb;
  color += cities * vec3(1.25, .86, .48) * (.8 - light * .48);
  vec4 clouds = texture2D(cloudMap, uv);
  color = mix(color, vec3(.68, .8, .93) * (.42 + .58 * light), clouds.a * .45);
  float rim = pow(1.0 - n.z, 3.0);
  color = mix(color, vec3(.025, .19, .45), rim * .55);
  color += vec3(.035, .14, .32) * pow(1.0 - n.z, 5.0);
  gl_FragColor = vec4(color, 1.0 - smoothstep(.997, 1.0, d));
}`;

export function createGlobeRenderer(canvas: HTMLCanvasElement, onError: () => void) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true, powerPreference: 'low-power' });
  if (!gl) throw new Error('WebGL unavailable');
  const shaders: WebGLShader[] = [], textures: WebGLTexture[] = [], images: HTMLImageElement[] = [];
  const program = gl.createProgram()!;
  function shader(type: number, source: string) {
    const result = gl!.createShader(type)!;
    shaders.push(result);
    gl!.shaderSource(result, source); gl!.compileShader(result);
    if (!gl!.getShaderParameter(result, gl!.COMPILE_STATUS)) throw new Error('Globe shader compilation failed');
    return result;
  }
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Globe shader linking failed');
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(['resolution', 'center', 'radius', 'yaw', 'tilt'].map(name => [name, gl.getUniformLocation(program, name)]));
  let disposed = false, loaded = false;
  const ready = Promise.all([
    ['dayMap', '/textures/earth-day.jpg', [20, 40, 66, 255]],
    ['nightMap', '/textures/earth-night.png', [0, 0, 0, 255]],
    ['cloudMap', '/textures/earth-clouds.png', [0, 0, 0, 0]],
  ].map(([name, url, pixel], unit) => {
    const texture = gl.createTexture()!;
    textures.push(texture); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pixel as number[]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, name as string), unit);
    return new Promise<void>((resolve, reject) => {
      const img = new Image(); images.push(img);
      img.onload = () => {
        if (!disposed) {
          gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        }
        resolve();
      };
      img.onerror = () => reject(new Error('Globe texture unavailable'));
      img.src = url as string;
    });
  })).then(() => { loaded = true; }).catch(() => { if (!disposed) onError(); });
  return {
    ready,
    get loaded() { return loaded; },
    render(view: GlobeView) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(view.width * dpr), h = Math.round(view.height * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      const { cx, cy, radius } = globeBounds(view);
      gl.uniform2f(uniforms.resolution, w, h);
      gl.uniform2f(uniforms.center, cx * dpr, (view.height - cy) * dpr);
      gl.uniform1f(uniforms.radius, radius * dpr);
      gl.uniform1f(uniforms.yaw, view.yaw * Math.PI / 180);
      gl.uniform1f(uniforms.tilt, view.tilt * Math.PI / 180);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose() {
      disposed = true;
      for (const img of images) { img.onload = null; img.onerror = null; }
      textures.forEach(t => gl.deleteTexture(t)); shaders.forEach(s => gl.deleteShader(s));
      gl.deleteBuffer(buffer); gl.deleteProgram(program);
    },
  };
}
