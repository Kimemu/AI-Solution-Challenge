/** 서버 PC의 Python 수집 환경을 준비합니다. npm 패키지를 설치하지 않습니다. */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const venv = path.join(root, ".venv");
const local = path.join(
  venv,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
function call(command, args, inherited = false) {
  return spawnSync(command, args, {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
    stdio: inherited ? "inherit" : "pipe",
  });
}
function ready() {
  return (
    fs.existsSync(local) &&
    call(local, [path.join(root, "crawler/worker.py"), "--health"]).status === 0
  );
}
if (ready()) {
  console.log("Python article crawler: ready");
  process.exit(0);
}
if (process.argv.includes("--check")) process.exit(1);
const bundled =
  process.env.USERPROFILE &&
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
  );
const candidates = [
  [process.env.ORBITAL_PYTHON],
  ["py", "-3.12"],
  ["py", "-3.11"],
  [bundled],
  ["python"],
  ...(process.platform === "win32" ? [] : [["python3"]]),
].filter(
  ([command]) =>
    command && (!path.isAbsolute(command) || fs.existsSync(command)),
);
const python = candidates.find(
  ([command, ...prefix]) =>
    call(command, [
      ...prefix,
      "-c",
      "import sys;sys.exit(0 if sys.version_info>=(3,11) else 1)",
    ]).status === 0,
);
if (!python) {
  console.error(
    "Python 3.11+ is required. Install Python, then run setup-crawler.cmd again.",
  );
  process.exit(1);
}
if (!fs.existsSync(local)) {
  const [command, ...prefix] = python;
  if (call(command, [...prefix, "-m", "venv", venv], true).status !== 0)
    process.exit(1);
}
if (
  call(
    local,
    [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "-r",
      "crawler/requirements.txt",
    ],
    true,
  ).status !== 0 ||
  !ready()
)
  process.exit(1);
console.log("Python article crawler: installed and verified");
