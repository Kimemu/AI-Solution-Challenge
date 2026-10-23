// 위도·경도 변환과 WebGL 렌더러. DOM 조작은 globe.js에서 처리합니다.
(function () {
  // Shared by the WebGL surface, geographic picking and HTML markers.
  const INITIAL_YAW = -105;
  const INITIAL_TILT = 18;
  const RAD = Math.PI / 180;
  function globeBounds(view) {
    return {
      cx: view.width / 2,
      cy: view.height * 0.5,
      radius: Math.min(view.width * 0.385, view.height * 0.425) * view.zoom,
    };
  }
  function projectPoint(lon, lat, view) {
    const a = view.yaw * RAD;
    const b = view.tilt * RAD;
    const x = Math.cos(lat * RAD) * Math.sin(lon * RAD);
    const y = Math.sin(lat * RAD);
    const z = Math.cos(lat * RAD) * Math.cos(lon * RAD);
    const xx = x * Math.cos(a) + z * Math.sin(a);
    const zz = z * Math.cos(a) - x * Math.sin(a);
    const yy = y * Math.cos(b) - zz * Math.sin(b);
    const depth = y * Math.sin(b) + zz * Math.cos(b);
    const { cx, cy, radius } = globeBounds(view);
    return { x: cx + xx * radius, y: cy - yy * radius, depth };
  }
  function screenToGeo(x, y, view) {
    const { cx, cy, radius } = globeBounds(view);
    const sx = (x - cx) / radius;
    const sy = (cy - y) / radius;
    const q = sx * sx + sy * sy;
    if (q > 1 || !Number.isFinite(q)) return null;
    const sz = Math.sqrt(1 - q);
    const a = view.yaw * RAD;
    const b = view.tilt * RAD;
    const yy = sy * Math.cos(b) + sz * Math.sin(b);
    const zz = -sy * Math.sin(b) + sz * Math.cos(b);
    return {
      lon:
        Math.atan2(
          sx * Math.cos(a) - zz * Math.sin(a),
          sx * Math.sin(a) + zz * Math.cos(a),
        ) / RAD,
      lat: Math.asin(Math.max(-1, Math.min(1, yy))) / RAD,
    };
  }
  function ringContains(lon, lat, ring) {
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
      const a = points[i];
      const b = points[j];
      if (
        a.y > lat !== b.y > lat &&
        q < ((b.x - a.x) * (lat - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside;
    }
    return inside;
  }

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
  function createGlobeRenderer(canvas, onError) {
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("WebGL unavailable");
    const shaders = [];
    const textures = [];
    const images = [];
    const program = gl.createProgram();
    function shader(type, source) {
      const result = gl.createShader(type);
      shaders.push(result);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS))
        throw new Error("Globe shader compilation failed");
      return result;
    }
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("Globe shader linking failed");
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniforms = Object.fromEntries(
      ["resolution", "center", "radius", "yaw", "tilt"].map((name) => [
        name,
        gl.getUniformLocation(program, name),
      ]),
    );
    let disposed = false;
    let loaded = false;
    const ready = Promise.all(
      [
        ["dayMap", window.OrbitalEarth.day, [20, 40, 66, 255]],
        ["nightMap", window.OrbitalEarth.night, [0, 0, 0, 255]],
        ["cloudMap", window.OrbitalEarth.clouds, [0, 0, 0, 0]],
      ].map(([name, url, pixel], unit) => {
        const texture = gl.createTexture();
        textures.push(texture);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          1,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array(pixel),
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(program, name), unit);
        return new Promise((resolve, reject) => {
          const img = new Image();
          images.push(img);
          img.onload = () => {
            if (!disposed) {
              gl.activeTexture(gl.TEXTURE0 + unit);
              gl.bindTexture(gl.TEXTURE_2D, texture);
              gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
              gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                img,
              );
            }
            resolve();
          };
          img.onerror = () => reject(new Error("Globe texture unavailable"));
          img.src = url;
        });
      }),
    )
      .then(() => {
        loaded = true;
      })
      .catch(() => {
        if (!disposed) onError();
      });
    return {
      ready,
      get loaded() {
        return loaded;
      },
      render(view) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(view.width * dpr);
        const h = Math.round(view.height * dpr);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
        const { cx, cy, radius } = globeBounds(view);
        gl.uniform2f(uniforms.resolution, w, h);
        gl.uniform2f(uniforms.center, cx * dpr, (view.height - cy) * dpr);
        gl.uniform1f(uniforms.radius, radius * dpr);
        gl.uniform1f(uniforms.yaw, (view.yaw * Math.PI) / 180);
        gl.uniform1f(uniforms.tilt, (view.tilt * Math.PI) / 180);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
      dispose() {
        disposed = true;
        for (const img of images) {
          img.onload = null;
          img.onerror = null;
        }
        textures.forEach((t) => gl.deleteTexture(t));
        shaders.forEach((s) => gl.deleteShader(s));
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      },
    };
  }

  // Representative exploration coordinates; counts refer to sectors.
  const locations = [
    {
      name: "대한민국",
      country: "South Korea",
      lon: 128,
      lat: 36,
      sector: "space",
      label: true,
    },
    { name: "중국", country: "China", lon: 104, lat: 35, label: true },
    { name: "일본", country: "Japan", lon: 139.7, lat: 35.7 },
    { name: "러시아", country: "Russia", lon: 90, lat: 60, label: true },
    {
      name: "카자흐스탄",
      country: "Kazakhstan",
      lon: 67,
      lat: 48,
      label: true,
    },
    {
      name: "아랍에미리트",
      country: "United Arab Emirates",
      lon: 54,
      lat: 24,
      label: true,
    },
    {
      name: "싱가포르",
      country: "Singapore",
      lon: 103.8,
      lat: 1.3,
      sector: "maritime",
      label: true,
    },
    { name: "인도", country: "India", lon: 79, lat: 22, label: true },
    { name: "호주", country: "Australia", lon: 134, lat: -25, label: true },
    { name: "인도네시아", country: "Indonesia", lon: 116, lat: -4 },
    { name: "베트남", country: "Vietnam", lon: 108, lat: 16 },
    {
      name: "유럽",
      country: "Germany",
      lon: 10,
      lat: 50,
      sector: "infrastructure",
      label: true,
    },
    { name: "프랑스", country: "France", lon: 2, lat: 46, label: true },
    { name: "스페인", country: "Spain", lon: -4, lat: 40, label: true },
    { name: "영국", country: "United Kingdom", lon: -2, lat: 54 },
    { name: "노르웨이", country: "Norway", lon: 9, lat: 62 },
    { name: "스웨덴", country: "Sweden", lon: 17, lat: 62 },
    { name: "핀란드", country: "Finland", lon: 26, lat: 64 },
    { name: "폴란드", country: "Poland", lon: 19, lat: 52 },
    { name: "튀르키예", country: "Turkey", lon: 35, lat: 39 },
    { name: "중동", country: "Qatar", lon: 51, lat: 25, sector: "emissions" },
    { name: "남아프리카공화국", country: "South Africa", lon: 25, lat: -29 },
    {
      name: "미국",
      country: "United States of America",
      lon: -101,
      lat: 31,
      sector: "solar",
      label: true,
    },
    { name: "캐나다", country: "Canada", lon: -106, lat: 56, label: true },
    {
      name: "브라질",
      country: "Brazil",
      lon: -52,
      lat: -13,
      sector: "agriculture",
      label: true,
    },
    { name: "칠레", country: "Chile", lon: -71, lat: -30 },
  ];

  window.OrbitalGlobeCore = {
    globeBounds,
    INITIAL_TILT,
    INITIAL_YAW,
    projectPoint,
    ringContains,
    screenToGeo,
    createGlobeRenderer,
    locations,
  };
})();
