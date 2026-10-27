/** 3D 지구본의 회전·거점·조작을 관리합니다. */
(function () {
  const {
    globeBounds,
    INITIAL_TILT,
    INITIAL_YAW,
    projectPoint,
    screenToGeo,
    ringContains,
    createGlobeRenderer,
    locations,
  } = window.OrbitalGlobeCore;
  class Globe {
    constructor(root, model, saved = {}) {
      this.model = model;
      this.view = {
        width: 600,
        height: 500,
        yaw: INITIAL_YAW,
        tilt: INITIAL_TILT,
        zoom: 1,
        ...saved,
      };
      this.media = matchMedia("(prefers-reduced-motion: reduce)");
      this.playing = saved.playing ?? !this.media.matches;
      this.resumeAt = saved.resumeAt || 0;
      this.activePointers = new Set();
      this.dirty = true;
      this.disposed = false;
      this.visible = true;
      this.drag = null;
      this.lastFrame = 0;
      root.innerHTML = `<div class="globe-scene"><canvas class="globe-surface" tabindex="0" role="img" aria-label="3D 지구본. 방향키로 회전, 더하기와 빼기로 확대·축소, Home으로 초기화합니다."></canvas><canvas class="globe-decoration" aria-hidden="true"></canvas><div class="globe-top"><span>ORBITAL VIEW / EARTH</span><span>3D EARTH VIEW</span></div><div class="globe-markers"></div><p class="globe-caption">드래그하여 회전 · 빛나는 거점을 클릭하세요</p><div class="globe-controls" role="group" aria-label="지구본 조작"><button data-globe="play" aria-label="지구 자전 일시정지"></button><span></span><button data-globe="plus" aria-label="지구 확대">＋</button><button data-globe="minus" aria-label="지구 축소">−</button><span></span><button data-globe="reset" aria-label="아시아로 보기 초기화">↺</button></div><div class="globe-status" role="status" hidden></div></div>`;
      this.scene = root.firstElementChild;
      this.canvas = this.scene.querySelector(".globe-surface");
      this.overlay = this.scene.querySelector(".globe-decoration");
      this.context = this.overlay.getContext("2d");
      this.status = this.scene.querySelector(".globe-status");
      this.updatePlayButton();
      this.update(model);
      try {
        this.renderer = createGlobeRenderer(this.canvas, () =>
          this.showError(),
        );
      } catch {
        this.showError();
        return;
      }
      this.renderer.ready.then(() => {
        if (!this.disposed && this.renderer.loaded) {
          this.status.hidden = true;
          this.dirty = true;
        }
      });
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.scene);
      this.resize();
      this.visibilityObserver = new IntersectionObserver((entries) => {
        this.visible = entries[0].isIntersecting;
        this.dirty = true;
      });
      this.visibilityObserver.observe(this.scene);
      this.onMotionChange = () => {
        if (this.media.matches) this.playing = false;
        this.updatePlayButton();
      };
      this.media.addEventListener("change", this.onMotionChange);
      this.bindControls();
      this.frame = requestAnimationFrame((time) => this.draw(time));
    }
    update(model) {
      this.model = model;
      const locations = model.globeLocations || [];
      const signature = JSON.stringify([model.selectedCountry, locations]);
      this.dirty = true;
      if (this.renderer?.loaded) this.renderer.render(this.view);
      if (signature === this.markerSignature) return;
      this.markerSignature = signature;
      this.locations = locations;
      const holder = this.scene.querySelector(".globe-markers");
      holder.replaceChildren();
      this.scene.querySelector(".globe-country-selection")?.remove();
      this.markers = this.locations.map((location) => {
        const button = document.createElement("button");
        button.className = "globe-marker has-articles";
        button.hidden = true;
        button.setAttribute("aria-label", location.name + " 거점 선택");
        button.setAttribute("aria-pressed", String(model.selectedCountry === location.country));
        if (model.selectedCountry === location.country)
          button.classList.add("is-selected");
        const dot = document.createElement("span");
        dot.className = "globe-marker-dot";
        const label = document.createElement("span");
        label.className = "globe-marker-label";
        const title = document.createElement("strong");
        title.textContent = location.name;
        const subtitle = document.createElement("small");
        subtitle.textContent = `관련 기사 ${location.count}건`;
        label.append(title, subtitle);
        button.append(dot, label);
        holder.append(button);
        button.addEventListener("click", () => {
          this.pauseForInteraction();
          window.OrbitalApp.selectLocation(location);
        });
        return button;
      });
      if (model.selectedCountry) {
        const clear = document.createElement("button");
        clear.className = "globe-country-selection";
        clear.textContent = (this.locations.find((item) => item.country === model.selectedCountry)?.name || model.selectedCountry) + " ×";
        clear.setAttribute("aria-label", "선택 국가 해제");
        clear.onclick = () => {
          this.pauseForInteraction();
          this.model.setSelectedCountry(null);
        };
        this.scene.append(clear);
      }
      if (this.renderer?.loaded) this.positionMarkers();
    }
    showError() {
      this.status.hidden = false;
      this.status.textContent =
        "3D 지구본을 표시할 수 없습니다. 아래 분야 버튼을 이용해 주세요.";
    }
    updatePlayButton() {
      const button = this.scene.querySelector('[data-globe="play"]');
      button.textContent = this.playing ? "Ⅱ" : "▷";
      button.setAttribute(
        "aria-label",
        this.playing ? "지구 자전 일시정지" : "지구 자전 시작",
      );
      button.setAttribute("aria-pressed", String(!this.playing));
      this.dirty = true;
    }
    resize() {
      const rect = this.scene.getBoundingClientRect();
      this.view.width = rect.width;
      this.view.height = rect.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      this.overlay.width = Math.round(rect.width * ratio);
      this.overlay.height = Math.round(rect.height * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.dirty = true;
    }
    bindControls() {
      this.scene.addEventListener("pointerdown", (event) => {
        this.activePointers.add(event.pointerId);
        this.pauseForInteraction();
      });
      this.onPointerEnd = (event) => {
        if (this.activePointers.delete(event.pointerId))
          this.pauseForInteraction();
      };
      window.addEventListener("pointerup", this.onPointerEnd, true);
      window.addEventListener("pointercancel", this.onPointerEnd, true);
      this.scene.addEventListener("wheel", () => this.pauseForInteraction(), { passive: true });
      this.scene.addEventListener("keydown", (event) => {
        if (event.target !== this.canvas || event.key !== " ")
          this.pauseForInteraction();
      });
      this.scene.querySelector('[data-globe="play"]').onclick = () => this.togglePlay();
      this.scene.querySelector('[data-globe="plus"]').onclick = () =>
        this.zoom(0.05);
      this.scene.querySelector('[data-globe="minus"]').onclick = () =>
        this.zoom(-0.05);
      this.scene.querySelector('[data-globe="reset"]').onclick = () =>
        this.reset();
      this.canvas.addEventListener("keydown", (event) => {
        if (
          ![
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "+",
            "=",
            "-",
            "Home",
            " ",
          ].includes(event.key)
        )
          return;
        event.preventDefault();
        if (event.key === "ArrowLeft") this.view.yaw -= 8;
        if (event.key === "ArrowRight") this.view.yaw += 8;
        if (event.key === "ArrowUp")
          this.view.tilt = Math.min(65, this.view.tilt + 6);
        if (event.key === "ArrowDown")
          this.view.tilt = Math.max(-60, this.view.tilt - 6);
        if (event.key === "+" || event.key === "=") this.zoom(0.05);
        if (event.key === "-") this.zoom(-0.05);
        if (event.key === "Home") this.reset();
        if (event.key === " ") {
          this.togglePlay();
        }
        this.dirty = true;
      });
      this.canvas.addEventListener("pointerdown", (event) => {
        if (!event.isPrimary || event.button !== 0) return;
        this.drag = {
          x: event.clientX,
          y: event.clientY,
          yaw: this.view.yaw,
          tilt: this.view.tilt,
          moved: false,
          pointerId: event.pointerId,
        };
        this.canvas.setPointerCapture(event.pointerId);
        this.canvas.style.cursor = "grabbing";
      });
      this.canvas.addEventListener("pointermove", (event) => {
        if (!this.drag || this.drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - this.drag.x,
          dy = event.clientY - this.drag.y;
        this.drag.moved ||= Math.hypot(dx, dy) > 5;
        this.view.yaw = this.drag.yaw + dx * 0.32;
        this.view.tilt = Math.max(
          -60,
          Math.min(65, this.drag.tilt + dy * 0.24),
        );
        this.dirty = true;
      });
      this.canvas.addEventListener("pointerup", (event) => {
        if (!this.drag || this.drag.pointerId !== event.pointerId) return;
        const clicked = !this.drag.moved;
        this.drag = null;
        this.canvas.style.cursor = "grab";
        if (this.canvas.hasPointerCapture(event.pointerId))
          this.canvas.releasePointerCapture(event.pointerId);
        if (clicked) {
          const rect = this.canvas.getBoundingClientRect();
          const geo = screenToGeo(
            event.clientX - rect.left,
            event.clientY - rect.top,
            this.view,
          );
          const country =
            geo &&
            window.OrbitalEarth.countries.find((item) =>
              item.rings.some((ring) => ringContains(geo.lon, geo.lat, ring)),
            );
          if (
            country &&
            this.locations.some((location) => location.country === country.name)
          )
            this.model.setSelectedCountry(
              this.model.selectedCountry === country.name ? null : country.name,
            );
        }
      });
      for (const name of ["pointercancel", "lostpointercapture"])
        this.canvas.addEventListener(name, (event) => {
          this.drag = null;
          this.onPointerEnd(event);
          this.canvas.style.cursor = "grab";
        });
      this.canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        this.showError();
      });
    }
    pauseForInteraction() {
      this.resumeAt = performance.now() + 3000;
      this.dirty = true;
    }
    togglePlay() {
      this.playing = !this.playing;
      if (this.playing) this.resumeAt = 0;
      this.updatePlayButton();
    }
    advanceRotation(time, elapsed) {
      if (
        !this.playing || this.drag || this.activePointers.size ||
        time < this.resumeAt || this.media.matches
      ) return false;
      const easing = this.resumeAt ? Math.min(1, (time - this.resumeAt) / 600) : 1;
      this.view.yaw = (this.view.yaw + elapsed * 0.0025 * easing) % 360;
      return true;
    }
    zoom(delta) {
      this.pauseForInteraction();
      this.view.zoom = Math.max(0.8, Math.min(1.15, this.view.zoom + delta));
      this.dirty = true;
    }
    reset() {
      this.pauseForInteraction();
      Object.assign(this.view, {
        yaw: INITIAL_YAW,
        tilt: INITIAL_TILT,
        zoom: 1,
      });
      this.dirty = true;
      this.model.setSelectedCountry(null);
    }
    draw(time) {
      if (this.disposed) return;
      this.frame = requestAnimationFrame((next) => this.draw(next));
      if (time - this.lastFrame < 32) return;
      const elapsed = this.lastFrame ? Math.min(time - this.lastFrame, 80) : 0;
      this.lastFrame = time;
      if (!this.visible || document.hidden || !this.view.width) return;
      if (this.advanceRotation(time, elapsed)) this.dirty = true;
      if (!this.dirty) return;
      this.dirty = false;
      this.renderer.render(this.view);
      const ctx = this.context,
        view = this.view,
        { cx, cy, radius } = globeBounds(view);
      ctx.clearRect(0, 0, view.width, view.height);
      for (let i = 0; i < 58; i++) {
        ctx.fillStyle = `rgba(157,188,218,${0.08 + (i % 4) * 0.035})`;
        ctx.fillRect(
          (((i * 7919) % 997) / 997) * view.width,
          (((i * 3533) % 991) / 991) * view.height,
          1,
          1,
        );
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, view.width, view.height);
      ctx.arc(cx, cy, radius * 1.015, 0, Math.PI * 2, true);
      ctx.clip("evenodd");
      for (const [rx, ry, angle] of [
        [1.31, 0.58, -0.14],
        [1.4, 0.88, 0.12],
        [1.22, 0.45, -0.37],
      ]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius * rx, radius * ry, angle, 0, Math.PI * 2);
        ctx.strokeStyle = "#80a2c118";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
      const selected = window.OrbitalEarth.countries.find(
        (country) => country.name === this.model.selectedCountry,
      );
      if (selected) {
        ctx.strokeStyle = "#ffb06eaa";
        ctx.lineWidth = 1.2;
        for (const ring of selected.rings) {
          ctx.beginPath();
          let pen = false;
          for (const [lon, lat] of ring) {
            const point = projectPoint(lon, lat, view);
            if (point.depth <= 0.03) {
              pen = false;
              continue;
            }
            if (pen) ctx.lineTo(point.x, point.y);
            else ctx.moveTo(point.x, point.y);
            pen = true;
          }
          ctx.stroke();
        }
      }
      this.positionMarkers();
    }
    positionMarkers() {
      const placed = [];
      let count = 0;
      const view = this.view;
      const points = this.locations.map((location, index) => ({
        location,
        index,
        ...projectPoint(location.lon, location.lat, view),
      }));
      points.sort(
        (a, b) =>
          Number(b.location.country === this.model.selectedCountry) -
            Number(a.location.country === this.model.selectedCountry) ||
          Number(!!b.location.sector) - Number(!!a.location.sector) ||
          b.depth - a.depth,
      );
      for (const point of points) {
        const button = this.markers[point.index],
          active = point.location.country === this.model.selectedCountry;
        button.hidden =
          !this.renderer.loaded ||
          point.depth < 0.08 ||
          point.x < 10 ||
          point.x > view.width - 10 ||
          point.y < 32 ||
          point.y > view.height - 60;
        if (button.hidden) continue;
        button.style.transform = `translate(${point.x - 14}px,${point.y - 14}px)`;
        button.style.zIndex = String(
          active ? 40 : 10 + Math.round(point.depth * 10),
        );
        button.style.opacity =
          this.model.sector === "all" ||
          !point.location.sector ||
          this.model.sector === point.location.sector
            ? "1"
            : ".45";
        const label = button.querySelector(".globe-marker-label"),
          width = Math.max(70, label.offsetWidth),
          height = 44;
        const candidates = [
          [point.x + 14, point.y - 15],
          [point.x - width - 14, point.y - 15],
          [point.x + 12, point.y + 17],
          [point.x - width - 12, point.y - 53],
        ];
        const spot = candidates.find(
          ([x, y]) =>
            x >= 10 &&
            x + width <= view.width - 10 &&
            y >= 35 &&
            y + height <= view.height - 66 &&
            placed.every(
              (other) =>
                x + width + 6 < other.x ||
                x > other.x + other.width + 6 ||
                y + height + 5 < other.y ||
                y > other.y + other.height + 5,
            ),
        );
        const show =
          !!spot &&
          (active ||
            (!!point.location.label && count < (view.width < 380 ? 4 : 7)));
        button.classList.toggle("has-label", show);
        if (show) {
          label.style.left = `${spot[0] - point.x + 14}px`;
          label.style.top = `${spot[1] - point.y + 14}px`;
          placed.push({ x: spot[0], y: spot[1], width, height });
          count++;
        }
      }
    }
    destroy() {
      this.disposed = true;
      cancelAnimationFrame(this.frame);
      this.resizeObserver?.disconnect();
      this.visibilityObserver?.disconnect();
      if (this.onPointerEnd) {
        window.removeEventListener("pointerup", this.onPointerEnd, true);
        window.removeEventListener("pointercancel", this.onPointerEnd, true);
      }
      if (this.onMotionChange)
        this.media.removeEventListener("change", this.onMotionChange);
      this.renderer?.dispose();
    }
  }
  window.OrbitalGlobe = Globe;
})();
