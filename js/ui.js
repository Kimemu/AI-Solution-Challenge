/* 텍스트 이스케이프와 DOM 이벤트를 한곳에서 처리하는 작은 화면 도우미입니다. */
(function () {
  const safeHtml = Symbol("safeHtml");
  const handlers = new Map();
  let nextHandler = 0;
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const raw = (value) => ({ [safeHtml]: true, value: String(value) });
  function content(value) {
    if (
      value === null ||
      value === undefined ||
      value === false ||
      value === true
    )
      return "";
    if (Array.isArray(value)) return value.map(content).join("");
    return value[safeHtml] ? value.value : escape(value);
  }
  function html(parts, ...values) {
    return raw(
      parts.reduce(
        (result, part, index) =>
          result + part + (index < values.length ? content(values[index]) : ""),
        "",
      ),
    );
  }
  function attributes(props) {
    const result = [];
    for (let [name, value] of Object.entries(props)) {
      if (
        value === undefined ||
        value === null ||
        name === "key" ||
        name === "children"
      )
        continue;
      if (name.startsWith("on") && typeof value === "function") {
        const id = String(++nextHandler);
        handlers.set(id, value);
        result.push(`data-on-${name.slice(2).toLowerCase()}="${id}"`);
        continue;
      }
      if (name === "className") name = "class";
      if (name === "htmlFor") name = "for";
      if (name === "style" && typeof value === "object") {
        value = Object.entries(value)
          .map(
            ([key, item]) =>
              `${key.startsWith("--") ? key : key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}:${item}`,
          )
          .join(";");
      }
      if (name === "value" || name === "defaultValue") {
        result.push(`data-initial-value="${escape(value)}"`);
        name = "value";
      }
      if (
        [
          "disabled",
          "checked",
          "selected",
          "required",
          "hidden",
          "multiple",
          "readOnly",
        ].includes(name)
      ) {
        if (value) result.push(name.toLowerCase());
        continue;
      }
      result.push(`${name}="${escape(value)}"`);
    }
    return raw(result.length ? " " + result.join(" ") : "");
  }
  function svgIcon(name, props = {}) {
    let svg = window.OrbitalIcons[name] || "";
    const size = Number(props.size) || 16;
    svg = svg
      .replace(/width="\d+"/, `width="${size}"`)
      .replace(/height="\d+"/, `height="${size}"`);
    if (props.className)
      svg = svg.replace("<svg ", `<svg class="${escape(props.className)}" `);
    return raw(svg);
  }
  function hydrate(root) {
    root.querySelectorAll("[data-initial-value]").forEach((element) => {
      if (element.tagName === "SELECT" || element.tagName === "TEXTAREA")
        element.value = element.dataset.initialValue;
    });
  }
  for (const type of [
    "click",
    "mousedown",
    "submit",
    "change",
    "input",
    "keydown",
  ]) {
    document.addEventListener(type, (event) => {
      const textual = event.target.matches?.(
        'textarea,input:not([type]),input[type="text"],input[type="search"]',
      );
      if (type === "change" && textual) return;
      const eventName = type === "input" && textual ? "change" : type;
      const element = event.target.closest?.(`[data-on-${eventName}]`);
      if (!element) return;
      const handler = handlers.get(
        element.getAttribute(`data-on-${eventName}`),
      );
      if (!handler) return;
      const proxy = {
        target: event.target,
        currentTarget: element,
        key: event.key,
        relatedTarget: event.relatedTarget,
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
      };
      try {
        Promise.resolve(handler(proxy)).catch((error) =>
          window.OrbitalApp?.notify(error.message),
        );
      } catch (error) {
        window.OrbitalApp?.notify(error.message);
      }
    });
  }
  window.OrbitalUI = {
    html,
    raw,
    attributes,
    svgIcon,
    hydrate,
    content,
    beginRender: () => handlers.clear(),
  };
})();
