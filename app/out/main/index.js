import { app, dialog, net, shell, WebContentsView, ipcMain, powerMonitor, BrowserWindow, Menu, clipboard, nativeTheme, Tray, utilityProcess } from "electron";
import { join, dirname, win32, posix, delimiter, resolve, relative, sep, isAbsolute, basename } from "node:path";
import { randomUUID, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, unlinkSync, readdirSync, statSync, writeFileSync, renameSync, openSync, fstatSync, readSync, closeSync, createWriteStream, realpathSync, createReadStream, appendFileSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import require$$0 from "process";
import require$$0$1 from "buffer";
import { readFile, writeFile, mkdir, chmod, readdir, stat, lstat, unlink, rmdir, rm, realpath, readlink, rename, copyFile, constants, link, cp, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { StringDecoder } from "node:string_decoder";
import { EventEmitter } from "node:events";
import { healProfilesModuleFallback, resolveProfileDir, PROFILE_TEMPLATES, initProfile } from "@deepseek-ai/dsh-app-boot";
import { withRegistryLock, readDesired, listGenerations, writeDesired, isGenerationPlugin, sweepRegistry, disableGeneration, resolveEnabledGenerations, ensureRegistryDirectories, generationId, writeGenerationMeta } from "dsh-desktop-market-installer/generations/registry";
import { installGeneration, verifyGenerationPeers } from "dsh-desktop-market-installer/generations/installer";
import { publishInstalledGeneration, projectGenerations } from "dsh-desktop-market-installer/generations/projection";
import { resolveMarketRegistry } from "dsh-desktop-market-installer/market-registry";
import { createRequire } from "node:module";
import { createServer as createServer$1 } from "node:http";
import { platform, arch, tmpdir, networkInterfaces, homedir } from "node:os";
import QRCode from "qrcode";
import WebSocket from "ws";
import { get } from "node:https";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
import electronUpdater from "electron-updater";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const STABLE_FEED_URL = "https://dshdesktop.com/updates/latest/";
const VERSION_INDEX_URL = "https://dshdesktop.com/updates/versions.json";
const INDEX_TIMEOUT_MS = 8e3;
function archiveFeedUrl(version) {
  return `https://dshdesktop.com/updates/archive/${version}/`;
}
function splitVersion(value) {
  const [core = "", ...preParts] = value.trim().split("-");
  const nums = core.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  while (nums.length < 3) nums.push(0);
  return { nums, pre: preParts.join("-") };
}
function compareVersions(a, b) {
  const left = splitVersion(a);
  const right = splitVersion(b);
  for (let i = 0; i < Math.max(left.nums.length, right.nums.length); i += 1) {
    const diff = (left.nums[i] ?? 0) - (right.nums[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return comparePrerelease(left.pre, right.pre);
}
function comparePrerelease(left, right) {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const l = left.split(".");
  const r = right.split(".");
  const length = Math.max(l.length, r.length);
  for (let i = 0; i < length; i += 1) {
    const x = l[i];
    const y = r[i];
    if (x === void 0) return -1;
    if (y === void 0) return 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const nx = x.replace(/^0+/, "") || "0";
      const ny = y.replace(/^0+/, "") || "0";
      if (nx.length !== ny.length) return nx.length < ny.length ? -1 : 1;
      if (nx !== ny) return nx < ny ? -1 : 1;
      continue;
    }
    if (xn) return -1;
    if (yn) return 1;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
function isRelease(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.version === "string" && record.version.length > 0 && typeof record.tag === "string" && record.tag.length > 0 && typeof record.archiveUrl === "string" && record.archiveUrl.length > 0;
}
function parseVersionIndex(raw) {
  if (typeof raw !== "object" || raw === null) return [];
  const versions = raw.versions;
  if (!Array.isArray(versions)) return [];
  return versions.filter(isRelease);
}
async function fetchAvailableReleases(currentVersion, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INDEX_TIMEOUT_MS);
  try {
    const response = await fetchImpl(VERSION_INDEX_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Version index request failed: ${response.status}`);
    }
    const releases = parseVersionIndex(await response.json());
    return releases.filter((release) => compareVersions(release.version, currentVersion) !== 0).sort((a, b) => compareVersions(b.version, a.version));
  } finally {
    clearTimeout(timer);
  }
}
const SERVICE_URL = "https://dshdesktop.com/crash";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/;
function isVersion(value) {
  if (typeof value !== "string" || value.length > 80 || !semver.test(value)) return false;
  return !semver.exec(value)?.[4]?.split(".").some((part) => /^0\d+$/.test(part));
}
function isPrereleaseVersion(value) {
  return Boolean(semver.exec(value)?.[4]);
}
function desktopPlatform(platform2, arch2) {
  if (platform2 === "darwin" && arch2 === "arm64") return "mac";
  if (platform2 === "darwin" && arch2 === "x64") return "mac-intel";
  if (platform2 === "win32" && arch2 === "x64") return "windows";
  throw new Error(`Unsupported desktop platform: ${platform2}/${arch2}`);
}
function redact(value) {
  return value.replace(/(Bearer\s+)[^\s"',;]+/gi, "$1[REDACTED]").replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|token)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi, "$1[REDACTED]").replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[REDACTED]").replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@").replace(/(?:\/Users\/|\/home\/)[^/\s]+/g, "/home/[USER]").replace(/C:\\Users\\[^\\\s]+/gi, "C:\\Users\\[USER]");
}
function atomic(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(value), { mode: 384 });
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}
function tailLog(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size, start = Math.max(0, size - 1024 * 1024);
    const buffer = Buffer.alloc(size - start);
    const read = readSync(fd, buffer, 0, buffer.length, start);
    let text = buffer.subarray(0, read).toString("utf8");
    if (start > 0) {
      const newline = text.indexOf("\n");
      text = newline < 0 ? "" : text.slice(newline + 1);
    }
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    const last = lines.slice(-100);
    const truncated = start > 0 && last.length < 100 || last.some((line) => line.length > 2e3);
    return { lines: last.map((line) => redact(line).slice(0, 2e3)), logStatus: truncated ? "truncated" : "ok" };
  } catch (error) {
    return { lines: [], logStatus: error.code === "ENOENT" ? "missing" : "unreadable" };
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}
function isHealthySessionLog(lines) {
  if (lines.length === 0) return false;
  const tail = lines.slice(-30);
  const hasError = tail.some(
    (line) => /render-process-gone:\s*reason=crashed/i.test(line) || /GPU process gone:\s*reason=crashed/i.test(line) || /Harness entry failed/i.test(line) || /DSH entry failed/i.test(line) || /uncaught exception/i.test(line) || /unhandled rejection/i.test(line) || /\bfatal\b/i.test(line) || /STATUS_ACCESS_VIOLATION/i.test(line) || /\(exit code [^0]\)/i.test(line)
  );
  if (hasError) return false;
  return lines.some(
    (line) => line.includes("Harness is ready") || line.includes("cleared 1 stale Harness authentication cookie") || line.includes("dsh web:")
  );
}
class DesktopService {
  constructor(options) {
    this.options = options;
    this.platform = desktopPlatform(options.platform, options.arch);
    if (!isVersion(options.version)) throw new Error("Invalid application version");
    this.outbox = join(options.stateDir, "outbox");
    this.marker = join(options.stateDir, "session.json");
    mkdirSync(this.outbox, { recursive: true, mode: 448 });
    const path = join(options.stateDir, "installation.json");
    if (!existsSync(path)) atomic(path, { id: randomUUID() });
    this.installationId = JSON.parse(readFileSync(path, "utf8")).id;
    if (!uuid.test(this.installationId)) throw new Error("Invalid installation ID");
  }
  options;
  installationId;
  platform;
  sessionId;
  flushing;
  outbox;
  marker;
  beginSession() {
    if (existsSync(this.marker)) {
      try {
        const old = JSON.parse(readFileSync(this.marker, "utf8"));
        if (uuid.test(old.eventId) && isVersion(old.version) && old.version === this.options.version) {
          const log2 = tailLog(this.options.logPath);
          if (!isHealthySessionLog(log2.lines)) {
            this.capture("unclean-exit", "Previous session ended without a clean shutdown (crash, power loss or forced termination).", old.eventId, old.version);
          }
        }
      } catch {
      }
    }
    this.sessionId = randomUUID();
    atomic(this.marker, { eventId: this.sessionId, version: this.options.version });
  }
  markCleanExit() {
    try {
      unlinkSync(this.marker);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  discard(eventId) {
    if (!uuid.test(eventId)) return false;
    const path = join(this.outbox, `${eventId}.json`);
    if (existsSync(path)) {
      try {
        unlinkSync(path);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
  capture(kind, message, eventId = randomUUID(), version = this.options.version) {
    if (!uuid.test(eventId)) throw new Error("Invalid event ID");
    const path = join(this.outbox, `${eventId}.json`);
    if (existsSync(path)) return eventId;
    const files = this.pending();
    while (files.length >= 50) unlinkSync(join(this.outbox, files.shift()));
    atomic(path, { eventId, installationId: this.installationId, version, platform: this.platform, kind, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), message: redact(message).slice(0, 4e3), ...tailLog(this.options.logPath) });
    return eventId;
  }
  captureFatal(error) {
    this.capture("main-crash", error.stack ?? error.message, this.sessionId);
  }
  pending() {
    return readdirSync(this.outbox).filter((name) => name.endsWith(".json") && uuid.test(name.slice(0, -5))).sort((a, b) => statSync(join(this.outbox, a)).mtimeMs - statSync(join(this.outbox, b)).mtimeMs);
  }
  flush() {
    this.flushing ??= this.flushPending().finally(() => {
      this.flushing = void 0;
    });
    return this.flushing;
  }
  async flushPending() {
    for (let name = this.pending()[0]; name; name = this.pending()[0]) {
      const path = join(this.outbox, name);
      const body = readFileSync(path, "utf8");
      unlinkSync(path);
      try {
        if (await this.options.confirmUpload(body) !== true) continue;
        await this.options.request(SERVICE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(5e3), redirect: "error" });
      } catch {
      }
    }
  }
  async checkUpdate() {
    const query = new URLSearchParams({ installationId: this.installationId, currentVersion: this.options.version, platform: this.platform });
    const response = await this.options.request(`${SERVICE_URL}/v1/updates/check?${query}`, { signal: AbortSignal.timeout(5e3), redirect: "error" });
    if (!response.ok) throw new Error(`Update policy unavailable (${response.status})`);
    const policy = await response.json();
    if (policy?.updateAvailable === false) return { updateAvailable: false };
    if (policy?.updateAvailable !== true || !isVersion(policy.version) || compareVersions(policy.version.split("+")[0], this.options.version.split("+")[0]) <= 0 || !isPrereleaseVersion(this.options.version) && isPrereleaseVersion(policy.version) || policy.feedUrl !== `https://dshdesktop.com/updates/archive/${policy.version}/`) throw new Error("Invalid update policy");
    return { updateAvailable: true, version: policy.version, feedUrl: policy.feedUrl };
  }
}
function attachDiagnostics(app2, service2, options = {}) {
  const processEvents = options.processEvents ?? process;
  const safe = (operation) => {
    try {
      operation();
    } catch (error) {
      options.onError?.(error);
    }
  };
  const flush = () => {
    void service2.flush().catch((error) => options.onError?.(error));
  };
  const randomId = () => {
    try {
      const { randomUUID: randomUUID2 } = require2("node:crypto");
      return randomUUID2();
    } catch {
      return "00000000-0000-4000-8000-000000000000";
    }
  };
  let canSend = false;
  let pendingPluginFailureEventId;
  let suppressPluginFailure = false;
  const capture = (kind, message, eventId) => {
    safe(() => service2.capture(kind, message, eventId));
    if (canSend && eventId !== pendingPluginFailureEventId) flush();
  };
  safe(() => service2.beginSession());
  const fatal = (error) => safe(() => service2.captureFatal(error));
  processEvents.on("uncaughtExceptionMonitor", fatal);
  const contentsListeners = /* @__PURE__ */ new Map();
  const created = (_event, contents) => {
    const gone = (_event2, details) => {
      if (!["clean-exit", "killed"].includes(details.reason)) {
        let urlInfo = "";
        try {
          const url = contents.getURL?.();
          if (url) urlInfo = ` url=${url}`;
        } catch {
        }
        capture("renderer-crash", `reason=${details.reason} exitCode=${details.exitCode}${urlInfo}`);
      }
    };
    contentsListeners.set(contents, gone);
    contents.prependListener("render-process-gone", gone);
    contents.once("destroyed", () => contentsListeners.delete(contents));
  };
  app2.on("web-contents-created", created);
  const childGone = (_event, details) => {
    if (details.type === "GPU" && !["clean-exit", "killed"].includes(details.reason)) capture("gpu-crash", `reason=${details.reason} exitCode=${details.exitCode}`);
  };
  app2.prependListener("child-process-gone", childGone);
  const clean = () => safe(() => service2.markCleanExit());
  app2.on("will-quit", clean);
  let previousAttempt = -1;
  let wasReady = false;
  let previousPhase;
  return {
    startSending() {
      if (canSend) return;
      canSend = true;
      flush();
    },
    runtimeChanged(snapshot, flushLog, attempt = 0) {
      if (attempt !== previousAttempt) {
        wasReady = false;
        suppressPluginFailure = false;
        pendingPluginFailureEventId = void 0;
      }
      if (snapshot.phase === "starting") {
        wasReady = false;
        suppressPluginFailure = false;
      }
      if (snapshot.phase === "ready") {
        wasReady = true;
        suppressPluginFailure = false;
        if (pendingPluginFailureEventId) {
          service2.discard(pendingPluginFailureEventId);
          pendingPluginFailureEventId = void 0;
        }
      }
      if (snapshot.phase === "failed" && (previousPhase !== "failed" || attempt !== previousAttempt)) {
        const kind = wasReady ? "harness-crash" : "startup-failure";
        void flushLog().catch((error) => options.onError?.(error)).then(() => {
          const isPluginFailure = Boolean(snapshot.pluginFailures && snapshot.pluginFailures.length > 0);
          if (!wasReady && isPluginFailure && suppressPluginFailure) {
            return;
          }
          const eventId = randomId();
          if (!wasReady && isPluginFailure) {
            pendingPluginFailureEventId = eventId;
          }
          capture(kind, snapshot.message, eventId);
        });
      }
      previousPhase = snapshot.phase;
      previousAttempt = attempt;
    },
    discardPendingPluginFailure() {
      suppressPluginFailure = true;
      if (pendingPluginFailureEventId) {
        service2.discard(pendingPluginFailureEventId);
        pendingPluginFailureEventId = void 0;
      }
    },
    startupFailed(error) {
      capture("startup-failure", error instanceof Error ? error.stack ?? error.message : String(error));
    },
    markCleanExit: clean,
    dispose() {
      processEvents.removeListener("uncaughtExceptionMonitor", fatal);
      app2.removeListener("web-contents-created", created);
      app2.removeListener("child-process-gone", childGone);
      app2.removeListener("will-quit", clean);
      for (const [contents, listener] of contentsListeners) contents.removeListener("render-process-gone", listener);
      contentsListeners.clear();
    }
  };
}
let service;
let desktopDiagnostics;
function initializeDesktopService() {
  if (!app.isPackaged || service) return;
  try {
    service = new DesktopService({
      stateDir: join(app.getPath("userData"), "desktop-service"),
      logPath: join(app.getPath("logs"), "harness.log"),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      // Chromium networking uses the same proxy configuration as the desktop app.
      request: (url, init) => net.fetch(url, init),
      confirmUpload: async (body) => {
        const report = JSON.parse(body);
        const { response } = await dialog.showMessageBox({
          type: "question",
          title: "发送故障报告",
          message: "是否发送本次故障报告，帮助排查问题？",
          detail: `版本：${report.version}
故障类型：${report.kind}

报告将发送到 https://dshdesktop.com/crash，包含安装 ID、版本、平台、故障时间、错误信息和 harness.log 最后最多 100 行（本次 ${report.lines.length} 行）。

点击“发送一次”仅同意发送本次报告；选择“不发送”将丢弃本次待传报告，不影响继续使用。`,
          buttons: ["不发送", "发送一次"],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        });
        return response === 1;
      }
    });
    desktopDiagnostics = attachDiagnostics(app, service, {
      onError: (error) => console.warn("[desktop-service]", error instanceof Error ? error.name : "Diagnostic failure")
    });
  } catch (error) {
    service = void 0;
    console.warn("[desktop-service] initialization failed", error instanceof Error ? error.name : "Unknown error");
  }
}
async function checkDesktopUpdate() {
  if (!service) throw new Error("Desktop update service is unavailable");
  return service.checkUpdate();
}
class PluginRecoveryEvidence {
  repaired = /* @__PURE__ */ new Set();
  blockers = [];
  installed(plugin) {
    this.repaired.add(plugin);
  }
  inspect(issues) {
    this.blockers = issues.filter((issue) => issue.severity === "blocking" && issue.resolution === "disable-plugin").map((issue) => issue.target);
  }
  freshLaunch() {
    this.repaired.clear();
    this.blockers = [];
  }
  targets(detected, removed) {
    return [.../* @__PURE__ */ new Set([...detected.filter((plugin) => !this.repaired.has(plugin)), ...this.blockers])].filter((plugin) => !removed.includes(plugin));
  }
}
async function runPluginRecoveryUpgrades(candidates, upgrade) {
  const results = [];
  for (const candidate of candidates) {
    try {
      results.push({ candidate, ...await upgrade(candidate) });
    } catch (error) {
      results.push({ candidate, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
function planPluginRecovery(checks) {
  const upgrades = [];
  const removals = [];
  const skipped = [];
  for (const check of checks) {
    if (check.upgradeCandidate) upgrades.push(check.upgradeCandidate);
    else if (check.removalRecommended) removals.push(check.packageName);
    else skipped.push(check.packageName);
  }
  return { upgrades, removals, skipped };
}
async function runPluginRecoveryPlan(plan, handlers) {
  const upgrades = await runPluginRecoveryUpgrades(plan.upgrades, handlers.upgrade);
  const removals = [];
  for (const plugin of plan.removals) {
    try {
      removals.push({ plugin, ...await handlers.remove(plugin) });
    } catch (error) {
      removals.push({ plugin, removed: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return { upgrades, removals };
}
async function checkBlockingPluginUpdates(options) {
  return Promise.all([...new Set(options.plugins)].map(async (packageName) => {
    try {
      const report = await options.check(packageName);
      const attempted = report.upgradeVersion !== void 0 && options.attemptedUpgrades.get(packageName) === report.upgradeVersion;
      const upgradeCandidate = report.upgradeReady && report.upgradeVersion && !attempted ? { packageName, targetVersion: report.upgradeVersion, installedVersion: report.installedVersion, upgradeHint: report.detail } : void 0;
      return {
        packageName,
        hint: attempted ? options.locale === "zh" ? "已尝试此版本，仍有启动问题，请卸载此插件并继续检测。" : "This version was already attempted; remove the plugin and continue checking." : report.detail ?? report.healthLabel,
        upgradeCandidate,
        removalRecommended: attempted || report.healthStatus === "incompatible-no-fix"
      };
    } catch {
      return {
        packageName,
        hint: options.locale === "zh" ? "未能检查更新，可卸载此插件或进入安全模式。" : "Update check failed; remove this plugin or enter Safe Mode."
      };
    }
  }));
}
function selectPluginRecoveryTarget(action, plugins) {
  const match = /^(upgrade|uninstall):(.+)$/.exec(action);
  if (!match || !plugins.includes(match[2])) return void 0;
  return { type: match[1], plugin: match[2] };
}
var dist = {};
var composer = {};
var directives = {};
var identity = {};
var hasRequiredIdentity;
function requireIdentity() {
  if (hasRequiredIdentity) return identity;
  hasRequiredIdentity = 1;
  const ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
  const DOC = /* @__PURE__ */ Symbol.for("yaml.document");
  const MAP = /* @__PURE__ */ Symbol.for("yaml.map");
  const PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
  const SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
  const SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
  const NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
  const isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
  const isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
  const isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
  const isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
  const isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
  const isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
  function isCollection(node) {
    if (node && typeof node === "object")
      switch (node[NODE_TYPE]) {
        case MAP:
        case SEQ:
          return true;
      }
    return false;
  }
  function isNode(node) {
    if (node && typeof node === "object")
      switch (node[NODE_TYPE]) {
        case ALIAS:
        case MAP:
        case SCALAR:
        case SEQ:
          return true;
      }
    return false;
  }
  const hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
  identity.ALIAS = ALIAS;
  identity.DOC = DOC;
  identity.MAP = MAP;
  identity.NODE_TYPE = NODE_TYPE;
  identity.PAIR = PAIR;
  identity.SCALAR = SCALAR;
  identity.SEQ = SEQ;
  identity.hasAnchor = hasAnchor;
  identity.isAlias = isAlias;
  identity.isCollection = isCollection;
  identity.isDocument = isDocument;
  identity.isMap = isMap;
  identity.isNode = isNode;
  identity.isPair = isPair;
  identity.isScalar = isScalar;
  identity.isSeq = isSeq;
  return identity;
}
var visit = {};
var hasRequiredVisit;
function requireVisit() {
  if (hasRequiredVisit) return visit;
  hasRequiredVisit = 1;
  var identity2 = requireIdentity();
  const BREAK = /* @__PURE__ */ Symbol("break visit");
  const SKIP = /* @__PURE__ */ Symbol("skip children");
  const REMOVE = /* @__PURE__ */ Symbol("remove node");
  function visit$1(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity2.isDocument(node)) {
      const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
      if (cd === REMOVE)
        node.contents = null;
    } else
      visit_(null, node, visitor_, Object.freeze([]));
  }
  visit$1.BREAK = BREAK;
  visit$1.SKIP = SKIP;
  visit$1.REMOVE = REMOVE;
  function visit_(key, node, visitor, path) {
    const ctrl = callVisitor(key, node, visitor, path);
    if (identity2.isNode(ctrl) || identity2.isPair(ctrl)) {
      replaceNode(key, path, ctrl);
      return visit_(key, ctrl, visitor, path);
    }
    if (typeof ctrl !== "symbol") {
      if (identity2.isCollection(node)) {
        path = Object.freeze(path.concat(node));
        for (let i = 0; i < node.items.length; ++i) {
          const ci = visit_(i, node.items[i], visitor, path);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            node.items.splice(i, 1);
            i -= 1;
          }
        }
      } else if (identity2.isPair(node)) {
        path = Object.freeze(path.concat(node));
        const ck = visit_("key", node.key, visitor, path);
        if (ck === BREAK)
          return BREAK;
        else if (ck === REMOVE)
          node.key = null;
        const cv = visit_("value", node.value, visitor, path);
        if (cv === BREAK)
          return BREAK;
        else if (cv === REMOVE)
          node.value = null;
      }
    }
    return ctrl;
  }
  async function visitAsync(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity2.isDocument(node)) {
      const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
      if (cd === REMOVE)
        node.contents = null;
    } else
      await visitAsync_(null, node, visitor_, Object.freeze([]));
  }
  visitAsync.BREAK = BREAK;
  visitAsync.SKIP = SKIP;
  visitAsync.REMOVE = REMOVE;
  async function visitAsync_(key, node, visitor, path) {
    const ctrl = await callVisitor(key, node, visitor, path);
    if (identity2.isNode(ctrl) || identity2.isPair(ctrl)) {
      replaceNode(key, path, ctrl);
      return visitAsync_(key, ctrl, visitor, path);
    }
    if (typeof ctrl !== "symbol") {
      if (identity2.isCollection(node)) {
        path = Object.freeze(path.concat(node));
        for (let i = 0; i < node.items.length; ++i) {
          const ci = await visitAsync_(i, node.items[i], visitor, path);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            node.items.splice(i, 1);
            i -= 1;
          }
        }
      } else if (identity2.isPair(node)) {
        path = Object.freeze(path.concat(node));
        const ck = await visitAsync_("key", node.key, visitor, path);
        if (ck === BREAK)
          return BREAK;
        else if (ck === REMOVE)
          node.key = null;
        const cv = await visitAsync_("value", node.value, visitor, path);
        if (cv === BREAK)
          return BREAK;
        else if (cv === REMOVE)
          node.value = null;
      }
    }
    return ctrl;
  }
  function initVisitor(visitor) {
    if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
      return Object.assign({
        Alias: visitor.Node,
        Map: visitor.Node,
        Scalar: visitor.Node,
        Seq: visitor.Node
      }, visitor.Value && {
        Map: visitor.Value,
        Scalar: visitor.Value,
        Seq: visitor.Value
      }, visitor.Collection && {
        Map: visitor.Collection,
        Seq: visitor.Collection
      }, visitor);
    }
    return visitor;
  }
  function callVisitor(key, node, visitor, path) {
    if (typeof visitor === "function")
      return visitor(key, node, path);
    if (identity2.isMap(node))
      return visitor.Map?.(key, node, path);
    if (identity2.isSeq(node))
      return visitor.Seq?.(key, node, path);
    if (identity2.isPair(node))
      return visitor.Pair?.(key, node, path);
    if (identity2.isScalar(node))
      return visitor.Scalar?.(key, node, path);
    if (identity2.isAlias(node))
      return visitor.Alias?.(key, node, path);
    return void 0;
  }
  function replaceNode(key, path, node) {
    const parent = path[path.length - 1];
    if (identity2.isCollection(parent)) {
      parent.items[key] = node;
    } else if (identity2.isPair(parent)) {
      if (key === "key")
        parent.key = node;
      else
        parent.value = node;
    } else if (identity2.isDocument(parent)) {
      parent.contents = node;
    } else {
      const pt = identity2.isAlias(parent) ? "alias" : "scalar";
      throw new Error(`Cannot replace node with ${pt} parent`);
    }
  }
  visit.visit = visit$1;
  visit.visitAsync = visitAsync;
  return visit;
}
var hasRequiredDirectives;
function requireDirectives() {
  if (hasRequiredDirectives) return directives;
  hasRequiredDirectives = 1;
  var identity2 = requireIdentity();
  var visit2 = requireVisit();
  const escapeChars = {
    "!": "%21",
    ",": "%2C",
    "[": "%5B",
    "]": "%5D",
    "{": "%7B",
    "}": "%7D"
  };
  const escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
  class Directives {
    constructor(yaml, tags2) {
      this.docStart = null;
      this.docEnd = false;
      this.yaml = Object.assign({}, Directives.defaultYaml, yaml);
      this.tags = Object.assign({}, Directives.defaultTags, tags2);
    }
    clone() {
      const copy = new Directives(this.yaml, this.tags);
      copy.docStart = this.docStart;
      return copy;
    }
    /**
     * During parsing, get a Directives instance for the current document and
     * update the stream state according to the current version's spec.
     */
    atDocument() {
      const res = new Directives(this.yaml, this.tags);
      switch (this.yaml.version) {
        case "1.1":
          this.atNextDocument = true;
          break;
        case "1.2":
          this.atNextDocument = false;
          this.yaml = {
            explicit: Directives.defaultYaml.explicit,
            version: "1.2"
          };
          this.tags = Object.assign({}, Directives.defaultTags);
          break;
      }
      return res;
    }
    /**
     * @param onError - May be called even if the action was successful
     * @returns `true` on success
     */
    add(line, onError) {
      if (this.atNextDocument) {
        this.yaml = { explicit: Directives.defaultYaml.explicit, version: "1.1" };
        this.tags = Object.assign({}, Directives.defaultTags);
        this.atNextDocument = false;
      }
      const parts = line.trim().split(/[ \t]+/);
      const name = parts.shift();
      switch (name) {
        case "%TAG": {
          if (parts.length !== 2) {
            onError(0, "%TAG directive should contain exactly two parts");
            if (parts.length < 2)
              return false;
          }
          const [handle, prefix] = parts;
          this.tags[handle] = prefix;
          return true;
        }
        case "%YAML": {
          this.yaml.explicit = true;
          if (parts.length !== 1) {
            onError(0, "%YAML directive should contain exactly one part");
            return false;
          }
          const [version] = parts;
          if (version === "1.1" || version === "1.2") {
            this.yaml.version = version;
            return true;
          } else {
            const isValid = /^\d+\.\d+$/.test(version);
            onError(6, `Unsupported YAML version ${version}`, isValid);
            return false;
          }
        }
        default:
          onError(0, `Unknown directive ${name}`, true);
          return false;
      }
    }
    /**
     * Resolves a tag, matching handles to those defined in %TAG directives.
     *
     * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
     *   `'!local'` tag, or `null` if unresolvable.
     */
    tagName(source, onError) {
      if (source === "!")
        return "!";
      if (source[0] !== "!") {
        onError(`Not a valid tag: ${source}`);
        return null;
      }
      if (source[1] === "<") {
        const verbatim = source.slice(2, -1);
        if (verbatim === "!" || verbatim === "!!") {
          onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
          return null;
        }
        if (source[source.length - 1] !== ">")
          onError("Verbatim tags must end with a >");
        return verbatim;
      }
      const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
      if (!suffix)
        onError(`The ${source} tag has no suffix`);
      const prefix = this.tags[handle];
      if (prefix) {
        try {
          return prefix + decodeURIComponent(suffix);
        } catch (error) {
          onError(String(error));
          return null;
        }
      }
      if (handle === "!")
        return source;
      onError(`Could not resolve tag: ${source}`);
      return null;
    }
    /**
     * Given a fully resolved tag, returns its printable string form,
     * taking into account current tag prefixes and defaults.
     */
    tagString(tag) {
      for (const [handle, prefix] of Object.entries(this.tags)) {
        if (tag.startsWith(prefix))
          return handle + escapeTagName(tag.substring(prefix.length));
      }
      return tag[0] === "!" ? tag : `!<${tag}>`;
    }
    toString(doc) {
      const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
      const tagEntries = Object.entries(this.tags);
      let tagNames;
      if (doc && tagEntries.length > 0 && identity2.isNode(doc.contents)) {
        const tags2 = {};
        visit2.visit(doc.contents, (_key, node) => {
          if (identity2.isNode(node) && node.tag)
            tags2[node.tag] = true;
        });
        tagNames = Object.keys(tags2);
      } else
        tagNames = [];
      for (const [handle, prefix] of tagEntries) {
        if (handle === "!!" && prefix === "tag:yaml.org,2002:")
          continue;
        if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
          lines.push(`%TAG ${handle} ${prefix}`);
      }
      return lines.join("\n");
    }
  }
  Directives.defaultYaml = { explicit: false, version: "1.2" };
  Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
  directives.Directives = Directives;
  return directives;
}
var Document = {};
var Alias = {};
var anchors = {};
var hasRequiredAnchors;
function requireAnchors() {
  if (hasRequiredAnchors) return anchors;
  hasRequiredAnchors = 1;
  var identity2 = requireIdentity();
  var visit2 = requireVisit();
  function anchorIsValid(anchor) {
    if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
      const sa = JSON.stringify(anchor);
      const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
      throw new Error(msg);
    }
    return true;
  }
  function anchorNames(root) {
    const anchors2 = /* @__PURE__ */ new Set();
    visit2.visit(root, {
      Value(_key, node) {
        if (node.anchor)
          anchors2.add(node.anchor);
      }
    });
    return anchors2;
  }
  function findNewAnchor(prefix, exclude) {
    for (let i = 1; true; ++i) {
      const name = `${prefix}${i}`;
      if (!exclude.has(name))
        return name;
    }
  }
  function createNodeAnchors(doc, prefix) {
    const aliasObjects = [];
    const sourceObjects = /* @__PURE__ */ new Map();
    let prevAnchors = null;
    return {
      onAnchor: (source) => {
        aliasObjects.push(source);
        prevAnchors ?? (prevAnchors = anchorNames(doc));
        const anchor = findNewAnchor(prefix, prevAnchors);
        prevAnchors.add(anchor);
        return anchor;
      },
      /**
       * With circular references, the source node is only resolved after all
       * of its child nodes are. This is why anchors are set only after all of
       * the nodes have been created.
       */
      setAnchors: () => {
        for (const source of aliasObjects) {
          const ref = sourceObjects.get(source);
          if (typeof ref === "object" && ref.anchor && (identity2.isScalar(ref.node) || identity2.isCollection(ref.node))) {
            ref.node.anchor = ref.anchor;
          } else {
            const error = new Error("Failed to resolve repeated object (this should not happen)");
            error.source = source;
            throw error;
          }
        }
      },
      sourceObjects
    };
  }
  anchors.anchorIsValid = anchorIsValid;
  anchors.anchorNames = anchorNames;
  anchors.createNodeAnchors = createNodeAnchors;
  anchors.findNewAnchor = findNewAnchor;
  return anchors;
}
var Node = {};
var applyReviver = {};
var hasRequiredApplyReviver;
function requireApplyReviver() {
  if (hasRequiredApplyReviver) return applyReviver;
  hasRequiredApplyReviver = 1;
  function applyReviver$1(reviver, obj, key, val) {
    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        for (let i = 0, len = val.length; i < len; ++i) {
          const v0 = val[i];
          const v1 = applyReviver$1(reviver, val, String(i), v0);
          if (v1 === void 0)
            delete val[i];
          else if (v1 !== v0)
            val[i] = v1;
        }
      } else if (val instanceof Map) {
        for (const k of Array.from(val.keys())) {
          const v0 = val.get(k);
          const v1 = applyReviver$1(reviver, val, k, v0);
          if (v1 === void 0)
            val.delete(k);
          else if (v1 !== v0)
            val.set(k, v1);
        }
      } else if (val instanceof Set) {
        for (const v0 of Array.from(val)) {
          const v1 = applyReviver$1(reviver, val, v0, v0);
          if (v1 === void 0)
            val.delete(v0);
          else if (v1 !== v0) {
            val.delete(v0);
            val.add(v1);
          }
        }
      } else {
        for (const [k, v0] of Object.entries(val)) {
          const v1 = applyReviver$1(reviver, val, k, v0);
          if (v1 === void 0)
            delete val[k];
          else if (v1 !== v0)
            val[k] = v1;
        }
      }
    }
    return reviver.call(obj, key, val);
  }
  applyReviver.applyReviver = applyReviver$1;
  return applyReviver;
}
var toJS = {};
var hasRequiredToJS;
function requireToJS() {
  if (hasRequiredToJS) return toJS;
  hasRequiredToJS = 1;
  var identity2 = requireIdentity();
  function toJS$1(value, arg, ctx) {
    if (Array.isArray(value))
      return value.map((v, i) => toJS$1(v, String(i), ctx));
    if (value && typeof value.toJSON === "function") {
      if (!ctx || !identity2.hasAnchor(value))
        return value.toJSON(arg, ctx);
      const data = { aliasCount: 0, count: 1, res: void 0 };
      ctx.anchors.set(value, data);
      ctx.onCreate = (res2) => {
        data.res = res2;
        delete ctx.onCreate;
      };
      const res = value.toJSON(arg, ctx);
      if (ctx.onCreate)
        ctx.onCreate(res);
      return res;
    }
    if (typeof value === "bigint" && !ctx?.keep)
      return Number(value);
    return value;
  }
  toJS.toJS = toJS$1;
  return toJS;
}
var hasRequiredNode;
function requireNode() {
  if (hasRequiredNode) return Node;
  hasRequiredNode = 1;
  var applyReviver2 = requireApplyReviver();
  var identity2 = requireIdentity();
  var toJS2 = requireToJS();
  class NodeBase {
    constructor(type) {
      Object.defineProperty(this, identity2.NODE_TYPE, { value: type });
    }
    /** Create a copy of this node.  */
    clone() {
      const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    /** A plain JavaScript representation of this node. */
    toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
      if (!identity2.isDocument(doc))
        throw new TypeError("A document argument is required");
      const ctx = {
        anchors: /* @__PURE__ */ new Map(),
        doc,
        keep: true,
        mapAsMap: mapAsMap === true,
        mapKeyWarned: false,
        maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
      };
      const res = toJS2.toJS(this, "", ctx);
      if (typeof onAnchor === "function")
        for (const { count, res: res2 } of ctx.anchors.values())
          onAnchor(res2, count);
      return typeof reviver === "function" ? applyReviver2.applyReviver(reviver, { "": res }, "", res) : res;
    }
  }
  Node.NodeBase = NodeBase;
  return Node;
}
var hasRequiredAlias;
function requireAlias() {
  if (hasRequiredAlias) return Alias;
  hasRequiredAlias = 1;
  var anchors2 = requireAnchors();
  var visit2 = requireVisit();
  var identity2 = requireIdentity();
  var Node2 = requireNode();
  var toJS2 = requireToJS();
  let Alias$1 = class Alias extends Node2.NodeBase {
    constructor(source) {
      super(identity2.ALIAS);
      this.source = source;
      Object.defineProperty(this, "tag", {
        set() {
          throw new Error("Alias nodes cannot have tags");
        }
      });
    }
    /**
     * Resolve the value of this alias within `doc`, finding the last
     * instance of the `source` anchor before this node.
     */
    resolve(doc, ctx) {
      if (ctx?.maxAliasCount === 0)
        throw new ReferenceError("Alias resolution is disabled");
      let nodes;
      if (ctx?.aliasResolveCache) {
        nodes = ctx.aliasResolveCache;
      } else {
        nodes = [];
        visit2.visit(doc, {
          Node: (_key, node) => {
            if (identity2.isAlias(node) || identity2.hasAnchor(node))
              nodes.push(node);
          }
        });
        if (ctx)
          ctx.aliasResolveCache = nodes;
      }
      let found = void 0;
      for (const node of nodes) {
        if (node === this)
          break;
        if (node.anchor === this.source)
          found = node;
      }
      return found;
    }
    toJSON(_arg, ctx) {
      if (!ctx)
        return { source: this.source };
      const { anchors: anchors3, doc, maxAliasCount } = ctx;
      const source = this.resolve(doc, ctx);
      if (!source) {
        const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
        throw new ReferenceError(msg);
      }
      let data = anchors3.get(source);
      if (!data) {
        toJS2.toJS(source, null, ctx);
        data = anchors3.get(source);
      }
      if (data?.res === void 0) {
        const msg = "This should not happen: Alias anchor was not resolved?";
        throw new ReferenceError(msg);
      }
      if (maxAliasCount >= 0) {
        data.count += 1;
        if (data.aliasCount === 0)
          data.aliasCount = getAliasCount(doc, source, anchors3);
        if (data.count * data.aliasCount > maxAliasCount) {
          const msg = "Excessive alias count indicates a resource exhaustion attack";
          throw new ReferenceError(msg);
        }
      }
      return data.res;
    }
    toString(ctx, _onComment, _onChompKeep) {
      const src = `*${this.source}`;
      if (ctx) {
        anchors2.anchorIsValid(this.source);
        if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new Error(msg);
        }
        if (ctx.implicitKey)
          return `${src} `;
      }
      return src;
    }
  };
  function getAliasCount(doc, node, anchors3) {
    if (identity2.isAlias(node)) {
      const source = node.resolve(doc);
      const anchor = anchors3 && source && anchors3.get(source);
      return anchor ? anchor.count * anchor.aliasCount : 0;
    } else if (identity2.isCollection(node)) {
      let count = 0;
      for (const item of node.items) {
        const c = getAliasCount(doc, item, anchors3);
        if (c > count)
          count = c;
      }
      return count;
    } else if (identity2.isPair(node)) {
      const kc = getAliasCount(doc, node.key, anchors3);
      const vc = getAliasCount(doc, node.value, anchors3);
      return Math.max(kc, vc);
    }
    return 1;
  }
  Alias.Alias = Alias$1;
  return Alias;
}
var Collection = {};
var createNode = {};
var Scalar = {};
var hasRequiredScalar;
function requireScalar() {
  if (hasRequiredScalar) return Scalar;
  hasRequiredScalar = 1;
  var identity2 = requireIdentity();
  var Node2 = requireNode();
  var toJS2 = requireToJS();
  const isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
  let Scalar$1 = class Scalar extends Node2.NodeBase {
    constructor(value) {
      super(identity2.SCALAR);
      this.value = value;
    }
    toJSON(arg, ctx) {
      return ctx?.keep ? this.value : toJS2.toJS(this.value, arg, ctx);
    }
    toString() {
      return String(this.value);
    }
  };
  Scalar$1.BLOCK_FOLDED = "BLOCK_FOLDED";
  Scalar$1.BLOCK_LITERAL = "BLOCK_LITERAL";
  Scalar$1.PLAIN = "PLAIN";
  Scalar$1.QUOTE_DOUBLE = "QUOTE_DOUBLE";
  Scalar$1.QUOTE_SINGLE = "QUOTE_SINGLE";
  Scalar.Scalar = Scalar$1;
  Scalar.isScalarValue = isScalarValue;
  return Scalar;
}
var hasRequiredCreateNode;
function requireCreateNode() {
  if (hasRequiredCreateNode) return createNode;
  hasRequiredCreateNode = 1;
  var Alias2 = requireAlias();
  var identity2 = requireIdentity();
  var Scalar2 = requireScalar();
  const defaultTagPrefix = "tag:yaml.org,2002:";
  function findTagObject(value, tagName, tags2) {
    if (tagName) {
      const match = tags2.filter((t) => t.tag === tagName);
      const tagObj = match.find((t) => !t.format) ?? match[0];
      if (!tagObj)
        throw new Error(`Tag ${tagName} not found`);
      return tagObj;
    }
    return tags2.find((t) => t.identify?.(value) && !t.format);
  }
  function createNode$1(value, tagName, ctx) {
    if (identity2.isDocument(value))
      value = value.contents;
    if (identity2.isNode(value))
      return value;
    if (identity2.isPair(value)) {
      const map2 = ctx.schema[identity2.MAP].createNode?.(ctx.schema, null, ctx);
      map2.items.push(value);
      return map2;
    }
    if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
      value = value.valueOf();
    }
    const { aliasDuplicateObjects, onAnchor, onTagObj, schema: schema2, sourceObjects } = ctx;
    let ref = void 0;
    if (aliasDuplicateObjects && value && typeof value === "object") {
      ref = sourceObjects.get(value);
      if (ref) {
        ref.anchor ?? (ref.anchor = onAnchor(value));
        return new Alias2.Alias(ref.anchor);
      } else {
        ref = { anchor: null, node: null };
        sourceObjects.set(value, ref);
      }
    }
    if (tagName?.startsWith("!!"))
      tagName = defaultTagPrefix + tagName.slice(2);
    let tagObj = findTagObject(value, tagName, schema2.tags);
    if (!tagObj) {
      if (value && typeof value.toJSON === "function") {
        value = value.toJSON();
      }
      if (!value || typeof value !== "object") {
        const node2 = new Scalar2.Scalar(value);
        if (ref)
          ref.node = node2;
        return node2;
      }
      tagObj = value instanceof Map ? schema2[identity2.MAP] : Symbol.iterator in Object(value) ? schema2[identity2.SEQ] : schema2[identity2.MAP];
    }
    if (onTagObj) {
      onTagObj(tagObj);
      delete ctx.onTagObj;
    }
    const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar2.Scalar(value);
    if (tagName)
      node.tag = tagName;
    else if (!tagObj.default)
      node.tag = tagObj.tag;
    if (ref)
      ref.node = node;
    return node;
  }
  createNode.createNode = createNode$1;
  return createNode;
}
var hasRequiredCollection;
function requireCollection() {
  if (hasRequiredCollection) return Collection;
  hasRequiredCollection = 1;
  var createNode2 = requireCreateNode();
  var identity2 = requireIdentity();
  var Node2 = requireNode();
  function collectionFromPath(schema2, path, value) {
    let v = value;
    for (let i = path.length - 1; i >= 0; --i) {
      const k = path[i];
      if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
        const a = [];
        a[k] = v;
        v = a;
      } else {
        v = /* @__PURE__ */ new Map([[k, v]]);
      }
    }
    return createNode2.createNode(v, void 0, {
      aliasDuplicateObjects: false,
      keepUndefined: false,
      onAnchor: () => {
        throw new Error("This should not happen, please report a bug.");
      },
      schema: schema2,
      sourceObjects: /* @__PURE__ */ new Map()
    });
  }
  const isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
  let Collection$1 = class Collection extends Node2.NodeBase {
    constructor(type, schema2) {
      super(type);
      Object.defineProperty(this, "schema", {
        value: schema2,
        configurable: true,
        enumerable: false,
        writable: true
      });
    }
    /**
     * Create a copy of this collection.
     *
     * @param schema - If defined, overwrites the original's schema
     */
    clone(schema2) {
      const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
      if (schema2)
        copy.schema = schema2;
      copy.items = copy.items.map((it) => identity2.isNode(it) || identity2.isPair(it) ? it.clone(schema2) : it);
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    /**
     * Adds a value to the collection. For `!!map` and `!!omap` the value must
     * be a Pair instance or a `{ key, value }` object, which may not have a key
     * that already exists in the map.
     */
    addIn(path, value) {
      if (isEmptyPath(path))
        this.add(value);
      else {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (identity2.isCollection(node))
          node.addIn(rest, value);
        else if (node === void 0 && this.schema)
          this.set(key, collectionFromPath(this.schema, rest, value));
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
    }
    /**
     * Removes a value from the collection.
     * @returns `true` if the item was found and removed.
     */
    deleteIn(path) {
      const [key, ...rest] = path;
      if (rest.length === 0)
        return this.delete(key);
      const node = this.get(key, true);
      if (identity2.isCollection(node))
        return node.deleteIn(rest);
      else
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
    /**
     * Returns item at `key`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    getIn(path, keepScalar) {
      const [key, ...rest] = path;
      const node = this.get(key, true);
      if (rest.length === 0)
        return !keepScalar && identity2.isScalar(node) ? node.value : node;
      else
        return identity2.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
    }
    hasAllNullValues(allowScalar) {
      return this.items.every((node) => {
        if (!identity2.isPair(node))
          return false;
        const n = node.value;
        return n == null || allowScalar && identity2.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
      });
    }
    /**
     * Checks if the collection includes a value with the key `key`.
     */
    hasIn(path) {
      const [key, ...rest] = path;
      if (rest.length === 0)
        return this.has(key);
      const node = this.get(key, true);
      return identity2.isCollection(node) ? node.hasIn(rest) : false;
    }
    /**
     * Sets a value in this collection. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    setIn(path, value) {
      const [key, ...rest] = path;
      if (rest.length === 0) {
        this.set(key, value);
      } else {
        const node = this.get(key, true);
        if (identity2.isCollection(node))
          node.setIn(rest, value);
        else if (node === void 0 && this.schema)
          this.set(key, collectionFromPath(this.schema, rest, value));
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
    }
  };
  Collection.Collection = Collection$1;
  Collection.collectionFromPath = collectionFromPath;
  Collection.isEmptyPath = isEmptyPath;
  return Collection;
}
var Pair = {};
var stringifyPair = {};
var stringify = {};
var stringifyComment = {};
var hasRequiredStringifyComment;
function requireStringifyComment() {
  if (hasRequiredStringifyComment) return stringifyComment;
  hasRequiredStringifyComment = 1;
  const stringifyComment$1 = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
  function indentComment(comment, indent) {
    if (/^\n+$/.test(comment))
      return comment.substring(1);
    return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
  }
  const lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
  stringifyComment.indentComment = indentComment;
  stringifyComment.lineComment = lineComment;
  stringifyComment.stringifyComment = stringifyComment$1;
  return stringifyComment;
}
var stringifyString = {};
var foldFlowLines = {};
var hasRequiredFoldFlowLines;
function requireFoldFlowLines() {
  if (hasRequiredFoldFlowLines) return foldFlowLines;
  hasRequiredFoldFlowLines = 1;
  const FOLD_FLOW = "flow";
  const FOLD_BLOCK = "block";
  const FOLD_QUOTED = "quoted";
  function foldFlowLines$1(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
    if (!lineWidth || lineWidth < 0)
      return text;
    if (lineWidth < minContentWidth)
      minContentWidth = 0;
    const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
    if (text.length <= endStep)
      return text;
    const folds = [];
    const escapedFolds = {};
    let end = lineWidth - indent.length;
    if (typeof indentAtStart === "number") {
      if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
        folds.push(0);
      else
        end = lineWidth - indentAtStart;
    }
    let split = void 0;
    let prev = void 0;
    let overflow = false;
    let i = -1;
    let escStart = -1;
    let escEnd = -1;
    if (mode === FOLD_BLOCK) {
      i = consumeMoreIndentedLines(text, i, indent.length);
      if (i !== -1)
        end = i + endStep;
    }
    for (let ch; ch = text[i += 1]; ) {
      if (mode === FOLD_QUOTED && ch === "\\") {
        escStart = i;
        switch (text[i + 1]) {
          case "x":
            i += 3;
            break;
          case "u":
            i += 5;
            break;
          case "U":
            i += 9;
            break;
          default:
            i += 1;
        }
        escEnd = i;
      }
      if (ch === "\n") {
        if (mode === FOLD_BLOCK)
          i = consumeMoreIndentedLines(text, i, indent.length);
        end = i + indent.length + endStep;
        split = void 0;
      } else {
        if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
          const next = text[i + 1];
          if (next && next !== " " && next !== "\n" && next !== "	")
            split = i;
        }
        if (i >= end) {
          if (split) {
            folds.push(split);
            end = split + endStep;
            split = void 0;
          } else if (mode === FOLD_QUOTED) {
            while (prev === " " || prev === "	") {
              prev = ch;
              ch = text[i += 1];
              overflow = true;
            }
            const j = i > escEnd + 1 ? i - 2 : escStart - 1;
            if (escapedFolds[j])
              return text;
            folds.push(j);
            escapedFolds[j] = true;
            end = j + endStep;
            split = void 0;
          } else {
            overflow = true;
          }
        }
      }
      prev = ch;
    }
    if (overflow && onOverflow)
      onOverflow();
    if (folds.length === 0)
      return text;
    if (onFold)
      onFold();
    let res = text.slice(0, folds[0]);
    for (let i2 = 0; i2 < folds.length; ++i2) {
      const fold = folds[i2];
      const end2 = folds[i2 + 1] || text.length;
      if (fold === 0)
        res = `
${indent}${text.slice(0, end2)}`;
      else {
        if (mode === FOLD_QUOTED && escapedFolds[fold])
          res += `${text[fold]}\\`;
        res += `
${indent}${text.slice(fold + 1, end2)}`;
      }
    }
    return res;
  }
  function consumeMoreIndentedLines(text, i, indent) {
    let end = i;
    let start = i + 1;
    let ch = text[start];
    while (ch === " " || ch === "	") {
      if (i < start + indent) {
        ch = text[++i];
      } else {
        do {
          ch = text[++i];
        } while (ch && ch !== "\n");
        end = i;
        start = i + 1;
        ch = text[start];
      }
    }
    return end;
  }
  foldFlowLines.FOLD_BLOCK = FOLD_BLOCK;
  foldFlowLines.FOLD_FLOW = FOLD_FLOW;
  foldFlowLines.FOLD_QUOTED = FOLD_QUOTED;
  foldFlowLines.foldFlowLines = foldFlowLines$1;
  return foldFlowLines;
}
var hasRequiredStringifyString;
function requireStringifyString() {
  if (hasRequiredStringifyString) return stringifyString;
  hasRequiredStringifyString = 1;
  var Scalar2 = requireScalar();
  var foldFlowLines2 = requireFoldFlowLines();
  const getFoldOptions = (ctx, isBlock) => ({
    indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
    lineWidth: ctx.options.lineWidth,
    minContentWidth: ctx.options.minContentWidth
  });
  const containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
  function lineLengthOverLimit(str, lineWidth, indentLength) {
    if (!lineWidth || lineWidth < 0)
      return false;
    const limit = lineWidth - indentLength;
    const strLen = str.length;
    if (strLen <= limit)
      return false;
    for (let i = 0, start = 0; i < strLen; ++i) {
      if (str[i] === "\n") {
        if (i - start > limit)
          return true;
        start = i + 1;
        if (strLen - start <= limit)
          return false;
      }
    }
    return true;
  }
  function doubleQuotedString(value, ctx) {
    const json = JSON.stringify(value);
    if (ctx.options.doubleQuotedAsJSON)
      return json;
    const { implicitKey } = ctx;
    const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
    const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
    let str = "";
    let start = 0;
    for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
      if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
        str += json.slice(start, i) + "\\ ";
        i += 1;
        start = i;
        ch = "\\";
      }
      if (ch === "\\")
        switch (json[i + 1]) {
          case "u":
            {
              str += json.slice(start, i);
              const code = json.substr(i + 2, 4);
              switch (code) {
                case "0000":
                  str += "\\0";
                  break;
                case "0007":
                  str += "\\a";
                  break;
                case "000b":
                  str += "\\v";
                  break;
                case "001b":
                  str += "\\e";
                  break;
                case "0085":
                  str += "\\N";
                  break;
                case "00a0":
                  str += "\\_";
                  break;
                case "2028":
                  str += "\\L";
                  break;
                case "2029":
                  str += "\\P";
                  break;
                default:
                  if (code.substr(0, 2) === "00")
                    str += "\\x" + code.substr(2);
                  else
                    str += json.substr(i, 6);
              }
              i += 5;
              start = i + 1;
            }
            break;
          case "n":
            if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
              i += 1;
            } else {
              str += json.slice(start, i) + "\n\n";
              while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                str += "\n";
                i += 2;
              }
              str += indent;
              if (json[i + 2] === " ")
                str += "\\";
              i += 1;
              start = i + 1;
            }
            break;
          default:
            i += 1;
        }
    }
    str = start ? str + json.slice(start) : json;
    return implicitKey ? str : foldFlowLines2.foldFlowLines(str, indent, foldFlowLines2.FOLD_QUOTED, getFoldOptions(ctx, false));
  }
  function singleQuotedString(value, ctx) {
    if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
      return doubleQuotedString(value, ctx);
    const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
    const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
    return ctx.implicitKey ? res : foldFlowLines2.foldFlowLines(res, indent, foldFlowLines2.FOLD_FLOW, getFoldOptions(ctx, false));
  }
  function quotedString(value, ctx) {
    const { singleQuote } = ctx.options;
    let qs;
    if (singleQuote === false)
      qs = doubleQuotedString;
    else {
      const hasDouble = value.includes('"');
      const hasSingle = value.includes("'");
      if (hasDouble && !hasSingle)
        qs = singleQuotedString;
      else if (hasSingle && !hasDouble)
        qs = doubleQuotedString;
      else
        qs = singleQuote ? singleQuotedString : doubleQuotedString;
    }
    return qs(value, ctx);
  }
  let blockEndNewlines;
  try {
    blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
  } catch {
    blockEndNewlines = /\n+(?!\n|$)/g;
  }
  function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
    const { blockQuote, commentString, lineWidth } = ctx.options;
    if (!blockQuote || /\n[\t ]+$/.test(value)) {
      return quotedString(value, ctx);
    }
    const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
    const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar2.Scalar.BLOCK_FOLDED ? false : type === Scalar2.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
    if (!value)
      return literal ? "|\n" : ">\n";
    let chomp;
    let endStart;
    for (endStart = value.length; endStart > 0; --endStart) {
      const ch = value[endStart - 1];
      if (ch !== "\n" && ch !== "	" && ch !== " ")
        break;
    }
    let end = value.substring(endStart);
    const endNlPos = end.indexOf("\n");
    if (endNlPos === -1) {
      chomp = "-";
    } else if (value === end || endNlPos !== end.length - 1) {
      chomp = "+";
      if (onChompKeep)
        onChompKeep();
    } else {
      chomp = "";
    }
    if (end) {
      value = value.slice(0, -end.length);
      if (end[end.length - 1] === "\n")
        end = end.slice(0, -1);
      end = end.replace(blockEndNewlines, `$&${indent}`);
    }
    let startWithSpace = false;
    let startEnd;
    let startNlPos = -1;
    for (startEnd = 0; startEnd < value.length; ++startEnd) {
      const ch = value[startEnd];
      if (ch === " ")
        startWithSpace = true;
      else if (ch === "\n")
        startNlPos = startEnd;
      else
        break;
    }
    let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
    if (start) {
      value = value.substring(start.length);
      start = start.replace(/\n+/g, `$&${indent}`);
    }
    const indentSize = indent ? "2" : "1";
    let header = (startWithSpace ? indentSize : "") + chomp;
    if (comment) {
      header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
      if (onComment)
        onComment();
    }
    if (!literal) {
      const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
      let literalFallback = false;
      const foldOptions = getFoldOptions(ctx, true);
      if (blockQuote !== "folded" && type !== Scalar2.Scalar.BLOCK_FOLDED) {
        foldOptions.onOverflow = () => {
          literalFallback = true;
        };
      }
      const body = foldFlowLines2.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines2.FOLD_BLOCK, foldOptions);
      if (!literalFallback)
        return `>${header}
${indent}${body}`;
    }
    value = value.replace(/\n+/g, `$&${indent}`);
    return `|${header}
${indent}${start}${value}${end}`;
  }
  function plainString(item, ctx, onComment, onChompKeep) {
    const { type, value } = item;
    const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
    if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
      return quotedString(value, ctx);
    }
    if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
      return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
    }
    if (!implicitKey && !inFlow && type !== Scalar2.Scalar.PLAIN && value.includes("\n")) {
      return blockString(item, ctx, onComment, onChompKeep);
    }
    if (containsDocumentMarker(value)) {
      if (indent === "") {
        ctx.forceBlockIndent = true;
        return blockString(item, ctx, onComment, onChompKeep);
      } else if (implicitKey && indent === indentStep) {
        return quotedString(value, ctx);
      }
    }
    const str = value.replace(/\n+/g, `$&
${indent}`);
    if (actualString) {
      const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
      const { compat, tags: tags2 } = ctx.doc.schema;
      if (tags2.some(test) || compat?.some(test))
        return quotedString(value, ctx);
    }
    return implicitKey ? str : foldFlowLines2.foldFlowLines(str, indent, foldFlowLines2.FOLD_FLOW, getFoldOptions(ctx, false));
  }
  function stringifyString$1(item, ctx, onComment, onChompKeep) {
    const { implicitKey, inFlow } = ctx;
    const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
    let { type } = item;
    if (type !== Scalar2.Scalar.QUOTE_DOUBLE) {
      if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
        type = Scalar2.Scalar.QUOTE_DOUBLE;
    }
    const _stringify = (_type) => {
      switch (_type) {
        case Scalar2.Scalar.BLOCK_FOLDED:
        case Scalar2.Scalar.BLOCK_LITERAL:
          return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
        case Scalar2.Scalar.QUOTE_DOUBLE:
          return doubleQuotedString(ss.value, ctx);
        case Scalar2.Scalar.QUOTE_SINGLE:
          return singleQuotedString(ss.value, ctx);
        case Scalar2.Scalar.PLAIN:
          return plainString(ss, ctx, onComment, onChompKeep);
        default:
          return null;
      }
    };
    let res = _stringify(type);
    if (res === null) {
      const { defaultKeyType, defaultStringType } = ctx.options;
      const t = implicitKey && defaultKeyType || defaultStringType;
      res = _stringify(t);
      if (res === null)
        throw new Error(`Unsupported default string type ${t}`);
    }
    return res;
  }
  stringifyString.stringifyString = stringifyString$1;
  return stringifyString;
}
var hasRequiredStringify;
function requireStringify() {
  if (hasRequiredStringify) return stringify;
  hasRequiredStringify = 1;
  var anchors2 = requireAnchors();
  var identity2 = requireIdentity();
  var stringifyComment2 = requireStringifyComment();
  var stringifyString2 = requireStringifyString();
  function createStringifyContext(doc, options) {
    const opt = Object.assign({
      blockQuote: true,
      commentString: stringifyComment2.stringifyComment,
      defaultKeyType: null,
      defaultStringType: "PLAIN",
      directives: null,
      doubleQuotedAsJSON: false,
      doubleQuotedMinMultiLineLength: 40,
      falseStr: "false",
      flowCollectionPadding: true,
      indentSeq: true,
      lineWidth: 80,
      minContentWidth: 20,
      nullStr: "null",
      simpleKeys: false,
      singleQuote: null,
      trailingComma: false,
      trueStr: "true",
      verifyAliasOrder: true
    }, doc.schema.toStringOptions, options);
    let inFlow;
    switch (opt.collectionStyle) {
      case "block":
        inFlow = false;
        break;
      case "flow":
        inFlow = true;
        break;
      default:
        inFlow = null;
    }
    return {
      anchors: /* @__PURE__ */ new Set(),
      doc,
      flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
      indent: "",
      indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
      inFlow,
      options: opt
    };
  }
  function getTagObject(tags2, item) {
    if (item.tag) {
      const match = tags2.filter((t) => t.tag === item.tag);
      if (match.length > 0)
        return match.find((t) => t.format === item.format) ?? match[0];
    }
    let tagObj = void 0;
    let obj;
    if (identity2.isScalar(item)) {
      obj = item.value;
      let match = tags2.filter((t) => t.identify?.(obj));
      if (match.length > 1) {
        const testMatch = match.filter((t) => t.test);
        if (testMatch.length > 0)
          match = testMatch;
      }
      tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
    } else {
      obj = item;
      tagObj = tags2.find((t) => t.nodeClass && obj instanceof t.nodeClass);
    }
    if (!tagObj) {
      const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
      throw new Error(`Tag not resolved for ${name} value`);
    }
    return tagObj;
  }
  function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
    if (!doc.directives)
      return "";
    const props = [];
    const anchor = (identity2.isScalar(node) || identity2.isCollection(node)) && node.anchor;
    if (anchor && anchors2.anchorIsValid(anchor)) {
      anchors$1.add(anchor);
      props.push(`&${anchor}`);
    }
    const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
    if (tag)
      props.push(doc.directives.tagString(tag));
    return props.join(" ");
  }
  function stringify$1(item, ctx, onComment, onChompKeep) {
    if (identity2.isPair(item))
      return item.toString(ctx, onComment, onChompKeep);
    if (identity2.isAlias(item)) {
      if (ctx.doc.directives)
        return item.toString(ctx);
      if (ctx.resolvedAliases?.has(item)) {
        throw new TypeError(`Cannot stringify circular structure without alias nodes`);
      } else {
        if (ctx.resolvedAliases)
          ctx.resolvedAliases.add(item);
        else
          ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
        item = item.resolve(ctx.doc);
      }
    }
    let tagObj = void 0;
    const node = identity2.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
    tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
    const props = stringifyProps(node, tagObj, ctx);
    if (props.length > 0)
      ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
    const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity2.isScalar(node) ? stringifyString2.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
    if (!props)
      return str;
    return identity2.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
  }
  stringify.createStringifyContext = createStringifyContext;
  stringify.stringify = stringify$1;
  return stringify;
}
var hasRequiredStringifyPair;
function requireStringifyPair() {
  if (hasRequiredStringifyPair) return stringifyPair;
  hasRequiredStringifyPair = 1;
  var identity2 = requireIdentity();
  var Scalar2 = requireScalar();
  var stringify2 = requireStringify();
  var stringifyComment2 = requireStringifyComment();
  function stringifyPair$1({ key, value }, ctx, onComment, onChompKeep) {
    const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
    let keyComment = identity2.isNode(key) && key.comment || null;
    if (simpleKeys) {
      if (keyComment) {
        throw new Error("With simple keys, key nodes cannot have comments");
      }
      if (identity2.isCollection(key) || !identity2.isNode(key) && typeof key === "object") {
        const msg = "With simple keys, collection cannot be used as a key value";
        throw new Error(msg);
      }
    }
    let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity2.isCollection(key) || (identity2.isScalar(key) ? key.type === Scalar2.Scalar.BLOCK_FOLDED || key.type === Scalar2.Scalar.BLOCK_LITERAL : typeof key === "object"));
    ctx = Object.assign({}, ctx, {
      allNullValues: false,
      implicitKey: !explicitKey && (simpleKeys || !allNullValues),
      indent: indent + indentStep
    });
    let keyCommentDone = false;
    let chompKeep = false;
    let str = stringify2.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
    if (!explicitKey && !ctx.inFlow && str.length > 1024) {
      if (simpleKeys)
        throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
      explicitKey = true;
    }
    if (ctx.inFlow) {
      if (allNullValues || value == null) {
        if (keyCommentDone && onComment)
          onComment();
        return str === "" ? "?" : explicitKey ? `? ${str}` : str;
      }
    } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
      str = `? ${str}`;
      if (keyComment && !keyCommentDone) {
        str += stringifyComment2.lineComment(str, ctx.indent, commentString(keyComment));
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    if (keyCommentDone)
      keyComment = null;
    if (explicitKey) {
      if (keyComment)
        str += stringifyComment2.lineComment(str, ctx.indent, commentString(keyComment));
      str = `? ${str}
${indent}:`;
    } else {
      str = `${str}:`;
      if (keyComment)
        str += stringifyComment2.lineComment(str, ctx.indent, commentString(keyComment));
    }
    let vsb, vcb, valueComment;
    if (identity2.isNode(value)) {
      vsb = !!value.spaceBefore;
      vcb = value.commentBefore;
      valueComment = value.comment;
    } else {
      vsb = false;
      vcb = null;
      valueComment = null;
      if (value && typeof value === "object")
        value = doc.createNode(value);
    }
    ctx.implicitKey = false;
    if (!explicitKey && !keyComment && identity2.isScalar(value))
      ctx.indentAtStart = str.length + 1;
    chompKeep = false;
    if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity2.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
      ctx.indent = ctx.indent.substring(2);
    }
    let valueCommentDone = false;
    const valueStr = stringify2.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
    let ws = " ";
    if (keyComment || vsb || vcb) {
      ws = vsb ? "\n" : "";
      if (vcb) {
        const cs = commentString(vcb);
        ws += `
${stringifyComment2.indentComment(cs, ctx.indent)}`;
      }
      if (valueStr === "" && !ctx.inFlow) {
        if (ws === "\n" && valueComment)
          ws = "\n\n";
      } else {
        ws += `
${ctx.indent}`;
      }
    } else if (!explicitKey && identity2.isCollection(value)) {
      const vs0 = valueStr[0];
      const nl0 = valueStr.indexOf("\n");
      const hasNewline = nl0 !== -1;
      const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
      if (hasNewline || !flow) {
        let hasPropsLine = false;
        if (hasNewline && (vs0 === "&" || vs0 === "!")) {
          let sp0 = valueStr.indexOf(" ");
          if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
            sp0 = valueStr.indexOf(" ", sp0 + 1);
          }
          if (sp0 === -1 || nl0 < sp0)
            hasPropsLine = true;
        }
        if (!hasPropsLine)
          ws = `
${ctx.indent}`;
      }
    } else if (valueStr === "" || valueStr[0] === "\n") {
      ws = "";
    }
    str += ws + valueStr;
    if (ctx.inFlow) {
      if (valueCommentDone && onComment)
        onComment();
    } else if (valueComment && !valueCommentDone) {
      str += stringifyComment2.lineComment(str, ctx.indent, commentString(valueComment));
    } else if (chompKeep && onChompKeep) {
      onChompKeep();
    }
    return str;
  }
  stringifyPair.stringifyPair = stringifyPair$1;
  return stringifyPair;
}
var addPairToJSMap = {};
var log = {};
var hasRequiredLog;
function requireLog() {
  if (hasRequiredLog) return log;
  hasRequiredLog = 1;
  var node_process = require$$0;
  function debug(logLevel, ...messages) {
    if (logLevel === "debug")
      console.log(...messages);
  }
  function warn(logLevel, warning) {
    if (logLevel === "debug" || logLevel === "warn") {
      if (typeof node_process.emitWarning === "function")
        node_process.emitWarning(warning);
      else
        console.warn(warning);
    }
  }
  log.debug = debug;
  log.warn = warn;
  return log;
}
var merge = {};
var hasRequiredMerge;
function requireMerge() {
  if (hasRequiredMerge) return merge;
  hasRequiredMerge = 1;
  var identity2 = requireIdentity();
  var Scalar2 = requireScalar();
  const MERGE_KEY = "<<";
  const merge$1 = {
    identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
    default: "key",
    tag: "tag:yaml.org,2002:merge",
    test: /^<<$/,
    resolve: () => Object.assign(new Scalar2.Scalar(Symbol(MERGE_KEY)), {
      addToJSMap: addMergeToJSMap
    }),
    stringify: () => MERGE_KEY
  };
  const isMergeKey = (ctx, key) => (merge$1.identify(key) || identity2.isScalar(key) && (!key.type || key.type === Scalar2.Scalar.PLAIN) && merge$1.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge$1.tag && tag.default);
  function addMergeToJSMap(ctx, map2, value) {
    const source = resolveAliasValue(ctx, value);
    if (identity2.isSeq(source))
      for (const it of source.items)
        mergeValue(ctx, map2, it);
    else if (Array.isArray(source))
      for (const it of source)
        mergeValue(ctx, map2, it);
    else
      mergeValue(ctx, map2, source);
  }
  function mergeValue(ctx, map2, value) {
    const source = resolveAliasValue(ctx, value);
    if (!identity2.isMap(source))
      throw new Error("Merge sources must be maps or map aliases");
    const srcMap = source.toJSON(null, ctx, Map);
    for (const [key, value2] of srcMap) {
      if (map2 instanceof Map) {
        if (!map2.has(key))
          map2.set(key, value2);
      } else if (map2 instanceof Set) {
        map2.add(key);
      } else if (!Object.prototype.hasOwnProperty.call(map2, key)) {
        Object.defineProperty(map2, key, {
          value: value2,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    }
    return map2;
  }
  function resolveAliasValue(ctx, value) {
    return ctx && identity2.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
  }
  merge.addMergeToJSMap = addMergeToJSMap;
  merge.isMergeKey = isMergeKey;
  merge.merge = merge$1;
  return merge;
}
var hasRequiredAddPairToJSMap;
function requireAddPairToJSMap() {
  if (hasRequiredAddPairToJSMap) return addPairToJSMap;
  hasRequiredAddPairToJSMap = 1;
  var log2 = requireLog();
  var merge2 = requireMerge();
  var stringify2 = requireStringify();
  var identity2 = requireIdentity();
  var toJS2 = requireToJS();
  function addPairToJSMap$1(ctx, map2, { key, value }) {
    if (identity2.isNode(key) && key.addToJSMap)
      key.addToJSMap(ctx, map2, value);
    else if (merge2.isMergeKey(ctx, key))
      merge2.addMergeToJSMap(ctx, map2, value);
    else {
      const jsKey = toJS2.toJS(key, "", ctx);
      if (map2 instanceof Map) {
        map2.set(jsKey, toJS2.toJS(value, jsKey, ctx));
      } else if (map2 instanceof Set) {
        map2.add(jsKey);
      } else {
        const stringKey = stringifyKey(key, jsKey, ctx);
        const jsValue = toJS2.toJS(value, stringKey, ctx);
        if (stringKey in map2)
          Object.defineProperty(map2, stringKey, {
            value: jsValue,
            writable: true,
            enumerable: true,
            configurable: true
          });
        else
          map2[stringKey] = jsValue;
      }
    }
    return map2;
  }
  function stringifyKey(key, jsKey, ctx) {
    if (jsKey === null)
      return "";
    if (typeof jsKey !== "object")
      return String(jsKey);
    if (identity2.isNode(key) && ctx?.doc) {
      const strCtx = stringify2.createStringifyContext(ctx.doc, {});
      strCtx.anchors = /* @__PURE__ */ new Set();
      for (const node of ctx.anchors.keys())
        strCtx.anchors.add(node.anchor);
      strCtx.inFlow = true;
      strCtx.inStringifyKey = true;
      const strKey = key.toString(strCtx);
      if (!ctx.mapKeyWarned) {
        let jsonStr = JSON.stringify(strKey);
        if (jsonStr.length > 40)
          jsonStr = jsonStr.substring(0, 36) + '..."';
        log2.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
        ctx.mapKeyWarned = true;
      }
      return strKey;
    }
    return JSON.stringify(jsKey);
  }
  addPairToJSMap.addPairToJSMap = addPairToJSMap$1;
  return addPairToJSMap;
}
var hasRequiredPair;
function requirePair() {
  if (hasRequiredPair) return Pair;
  hasRequiredPair = 1;
  var createNode2 = requireCreateNode();
  var stringifyPair2 = requireStringifyPair();
  var addPairToJSMap2 = requireAddPairToJSMap();
  var identity2 = requireIdentity();
  function createPair(key, value, ctx) {
    const k = createNode2.createNode(key, void 0, ctx);
    const v = createNode2.createNode(value, void 0, ctx);
    return new Pair$1(k, v);
  }
  let Pair$1 = class Pair2 {
    constructor(key, value = null) {
      Object.defineProperty(this, identity2.NODE_TYPE, { value: identity2.PAIR });
      this.key = key;
      this.value = value;
    }
    clone(schema2) {
      let { key, value } = this;
      if (identity2.isNode(key))
        key = key.clone(schema2);
      if (identity2.isNode(value))
        value = value.clone(schema2);
      return new Pair2(key, value);
    }
    toJSON(_, ctx) {
      const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
      return addPairToJSMap2.addPairToJSMap(ctx, pair, this);
    }
    toString(ctx, onComment, onChompKeep) {
      return ctx?.doc ? stringifyPair2.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
    }
  };
  Pair.Pair = Pair$1;
  Pair.createPair = createPair;
  return Pair;
}
var Schema = {};
var map = {};
var YAMLMap = {};
var stringifyCollection = {};
var hasRequiredStringifyCollection;
function requireStringifyCollection() {
  if (hasRequiredStringifyCollection) return stringifyCollection;
  hasRequiredStringifyCollection = 1;
  var identity2 = requireIdentity();
  var stringify2 = requireStringify();
  var stringifyComment2 = requireStringifyComment();
  function stringifyCollection$1(collection, ctx, options) {
    const flow = ctx.inFlow ?? collection.flow;
    const stringify3 = flow ? stringifyFlowCollection : stringifyBlockCollection;
    return stringify3(collection, ctx, options);
  }
  function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
    const { indent, options: { commentString } } = ctx;
    const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
    let chompKeep = false;
    const lines = [];
    for (let i = 0; i < items.length; ++i) {
      const item = items[i];
      let comment2 = null;
      if (identity2.isNode(item)) {
        if (!chompKeep && item.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
        if (item.comment)
          comment2 = item.comment;
      } else if (identity2.isPair(item)) {
        const ik = identity2.isNode(item.key) ? item.key : null;
        if (ik) {
          if (!chompKeep && ik.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
        }
      }
      chompKeep = false;
      let str2 = stringify2.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
      if (comment2)
        str2 += stringifyComment2.lineComment(str2, itemIndent, commentString(comment2));
      if (chompKeep && comment2)
        chompKeep = false;
      lines.push(blockItemPrefix + str2);
    }
    let str;
    if (lines.length === 0) {
      str = flowChars.start + flowChars.end;
    } else {
      str = lines[0];
      for (let i = 1; i < lines.length; ++i) {
        const line = lines[i];
        str += line ? `
${indent}${line}` : "\n";
      }
    }
    if (comment) {
      str += "\n" + stringifyComment2.indentComment(commentString(comment), indent);
      if (onComment)
        onComment();
    } else if (chompKeep && onChompKeep)
      onChompKeep();
    return str;
  }
  function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
    const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
    itemIndent += indentStep;
    const itemCtx = Object.assign({}, ctx, {
      indent: itemIndent,
      inFlow: true,
      type: null
    });
    let reqNewline = false;
    let linesAtValue = 0;
    const lines = [];
    for (let i = 0; i < items.length; ++i) {
      const item = items[i];
      let comment = null;
      if (identity2.isNode(item)) {
        if (item.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, item.commentBefore, false);
        if (item.comment)
          comment = item.comment;
      } else if (identity2.isPair(item)) {
        const ik = identity2.isNode(item.key) ? item.key : null;
        if (ik) {
          if (ik.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, ik.commentBefore, false);
          if (ik.comment)
            reqNewline = true;
        }
        const iv = identity2.isNode(item.value) ? item.value : null;
        if (iv) {
          if (iv.comment)
            comment = iv.comment;
          if (iv.commentBefore)
            reqNewline = true;
        } else if (item.value == null && ik?.comment) {
          comment = ik.comment;
        }
      }
      if (comment)
        reqNewline = true;
      let str = stringify2.stringify(item, itemCtx, () => comment = null);
      reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
      if (i < items.length - 1) {
        str += ",";
      } else if (ctx.options.trailingComma) {
        if (ctx.options.lineWidth > 0) {
          reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
        }
        if (reqNewline) {
          str += ",";
        }
      }
      if (comment)
        str += stringifyComment2.lineComment(str, itemIndent, commentString(comment));
      lines.push(str);
      linesAtValue = lines.length;
    }
    const { start, end } = flowChars;
    if (lines.length === 0) {
      return start + end;
    } else {
      if (!reqNewline) {
        const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
        reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
      }
      if (reqNewline) {
        let str = start;
        for (const line of lines)
          str += line ? `
${indentStep}${indent}${line}` : "\n";
        return `${str}
${indent}${end}`;
      } else {
        return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
      }
    }
  }
  function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
    if (comment && chompKeep)
      comment = comment.replace(/^\n+/, "");
    if (comment) {
      const ic = stringifyComment2.indentComment(commentString(comment), indent);
      lines.push(ic.trimStart());
    }
  }
  stringifyCollection.stringifyCollection = stringifyCollection$1;
  return stringifyCollection;
}
var hasRequiredYAMLMap;
function requireYAMLMap() {
  if (hasRequiredYAMLMap) return YAMLMap;
  hasRequiredYAMLMap = 1;
  var stringifyCollection2 = requireStringifyCollection();
  var addPairToJSMap2 = requireAddPairToJSMap();
  var Collection2 = requireCollection();
  var identity2 = requireIdentity();
  var Pair2 = requirePair();
  var Scalar2 = requireScalar();
  function findPair(items, key) {
    const k = identity2.isScalar(key) ? key.value : key;
    for (const it of items) {
      if (identity2.isPair(it)) {
        if (it.key === key || it.key === k)
          return it;
        if (identity2.isScalar(it.key) && it.key.value === k)
          return it;
      }
    }
    return void 0;
  }
  let YAMLMap$1 = class YAMLMap extends Collection2.Collection {
    static get tagName() {
      return "tag:yaml.org,2002:map";
    }
    constructor(schema2) {
      super(identity2.MAP, schema2);
      this.items = [];
    }
    /**
     * A generic collection parsing method that can be extended
     * to other node classes that inherit from YAMLMap
     */
    static from(schema2, obj, ctx) {
      const { keepUndefined, replacer } = ctx;
      const map2 = new this(schema2);
      const add = (key, value) => {
        if (typeof replacer === "function")
          value = replacer.call(obj, key, value);
        else if (Array.isArray(replacer) && !replacer.includes(key))
          return;
        if (value !== void 0 || keepUndefined)
          map2.items.push(Pair2.createPair(key, value, ctx));
      };
      if (obj instanceof Map) {
        for (const [key, value] of obj)
          add(key, value);
      } else if (obj && typeof obj === "object") {
        for (const key of Object.keys(obj))
          add(key, obj[key]);
      }
      if (typeof schema2.sortMapEntries === "function") {
        map2.items.sort(schema2.sortMapEntries);
      }
      return map2;
    }
    /**
     * Adds a value to the collection.
     *
     * @param overwrite - If not set `true`, using a key that is already in the
     *   collection will throw. Otherwise, overwrites the previous value.
     */
    add(pair, overwrite) {
      let _pair;
      if (identity2.isPair(pair))
        _pair = pair;
      else if (!pair || typeof pair !== "object" || !("key" in pair)) {
        _pair = new Pair2.Pair(pair, pair?.value);
      } else
        _pair = new Pair2.Pair(pair.key, pair.value);
      const prev = findPair(this.items, _pair.key);
      const sortEntries = this.schema?.sortMapEntries;
      if (prev) {
        if (!overwrite)
          throw new Error(`Key ${_pair.key} already set`);
        if (identity2.isScalar(prev.value) && Scalar2.isScalarValue(_pair.value))
          prev.value.value = _pair.value;
        else
          prev.value = _pair.value;
      } else if (sortEntries) {
        const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
        if (i === -1)
          this.items.push(_pair);
        else
          this.items.splice(i, 0, _pair);
      } else {
        this.items.push(_pair);
      }
    }
    delete(key) {
      const it = findPair(this.items, key);
      if (!it)
        return false;
      const del = this.items.splice(this.items.indexOf(it), 1);
      return del.length > 0;
    }
    get(key, keepScalar) {
      const it = findPair(this.items, key);
      const node = it?.value;
      return (!keepScalar && identity2.isScalar(node) ? node.value : node) ?? void 0;
    }
    has(key) {
      return !!findPair(this.items, key);
    }
    set(key, value) {
      this.add(new Pair2.Pair(key, value), true);
    }
    /**
     * @param ctx - Conversion context, originally set in Document#toJS()
     * @param {Class} Type - If set, forces the returned collection type
     * @returns Instance of Type, Map, or Object
     */
    toJSON(_, ctx, Type) {
      const map2 = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
      if (ctx?.onCreate)
        ctx.onCreate(map2);
      for (const item of this.items)
        addPairToJSMap2.addPairToJSMap(ctx, map2, item);
      return map2;
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      for (const item of this.items) {
        if (!identity2.isPair(item))
          throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
      }
      if (!ctx.allNullValues && this.hasAllNullValues(false))
        ctx = Object.assign({}, ctx, { allNullValues: true });
      return stringifyCollection2.stringifyCollection(this, ctx, {
        blockItemPrefix: "",
        flowChars: { start: "{", end: "}" },
        itemIndent: ctx.indent || "",
        onChompKeep,
        onComment
      });
    }
  };
  YAMLMap.YAMLMap = YAMLMap$1;
  YAMLMap.findPair = findPair;
  return YAMLMap;
}
var hasRequiredMap;
function requireMap() {
  if (hasRequiredMap) return map;
  hasRequiredMap = 1;
  var identity2 = requireIdentity();
  var YAMLMap2 = requireYAMLMap();
  const map$1 = {
    collection: "map",
    default: true,
    nodeClass: YAMLMap2.YAMLMap,
    tag: "tag:yaml.org,2002:map",
    resolve(map2, onError) {
      if (!identity2.isMap(map2))
        onError("Expected a mapping for this tag");
      return map2;
    },
    createNode: (schema2, obj, ctx) => YAMLMap2.YAMLMap.from(schema2, obj, ctx)
  };
  map.map = map$1;
  return map;
}
var seq = {};
var YAMLSeq = {};
var hasRequiredYAMLSeq;
function requireYAMLSeq() {
  if (hasRequiredYAMLSeq) return YAMLSeq;
  hasRequiredYAMLSeq = 1;
  var createNode2 = requireCreateNode();
  var stringifyCollection2 = requireStringifyCollection();
  var Collection2 = requireCollection();
  var identity2 = requireIdentity();
  var Scalar2 = requireScalar();
  var toJS2 = requireToJS();
  let YAMLSeq$1 = class YAMLSeq extends Collection2.Collection {
    static get tagName() {
      return "tag:yaml.org,2002:seq";
    }
    constructor(schema2) {
      super(identity2.SEQ, schema2);
      this.items = [];
    }
    add(value) {
      this.items.push(value);
    }
    /**
     * Removes a value from the collection.
     *
     * `key` must contain a representation of an integer for this to succeed.
     * It may be wrapped in a `Scalar`.
     *
     * @returns `true` if the item was found and removed.
     */
    delete(key) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        return false;
      const del = this.items.splice(idx, 1);
      return del.length > 0;
    }
    get(key, keepScalar) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        return void 0;
      const it = this.items[idx];
      return !keepScalar && identity2.isScalar(it) ? it.value : it;
    }
    /**
     * Checks if the collection includes a value with the key `key`.
     *
     * `key` must contain a representation of an integer for this to succeed.
     * It may be wrapped in a `Scalar`.
     */
    has(key) {
      const idx = asItemIndex(key);
      return typeof idx === "number" && idx < this.items.length;
    }
    /**
     * Sets a value in this collection. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     *
     * If `key` does not contain a representation of an integer, this will throw.
     * It may be wrapped in a `Scalar`.
     */
    set(key, value) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        throw new Error(`Expected a valid index, not ${key}.`);
      const prev = this.items[idx];
      if (identity2.isScalar(prev) && Scalar2.isScalarValue(value))
        prev.value = value;
      else
        this.items[idx] = value;
    }
    toJSON(_, ctx) {
      const seq2 = [];
      if (ctx?.onCreate)
        ctx.onCreate(seq2);
      let i = 0;
      for (const item of this.items)
        seq2.push(toJS2.toJS(item, String(i++), ctx));
      return seq2;
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      return stringifyCollection2.stringifyCollection(this, ctx, {
        blockItemPrefix: "- ",
        flowChars: { start: "[", end: "]" },
        itemIndent: (ctx.indent || "") + "  ",
        onChompKeep,
        onComment
      });
    }
    static from(schema2, obj, ctx) {
      const { replacer } = ctx;
      const seq2 = new this(schema2);
      if (obj && Symbol.iterator in Object(obj)) {
        let i = 0;
        for (let it of obj) {
          if (typeof replacer === "function") {
            const key = obj instanceof Set ? it : String(i++);
            it = replacer.call(obj, key, it);
          }
          seq2.items.push(createNode2.createNode(it, void 0, ctx));
        }
      }
      return seq2;
    }
  };
  function asItemIndex(key) {
    let idx = identity2.isScalar(key) ? key.value : key;
    if (idx && typeof idx === "string")
      idx = Number(idx);
    return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
  }
  YAMLSeq.YAMLSeq = YAMLSeq$1;
  return YAMLSeq;
}
var hasRequiredSeq;
function requireSeq() {
  if (hasRequiredSeq) return seq;
  hasRequiredSeq = 1;
  var identity2 = requireIdentity();
  var YAMLSeq2 = requireYAMLSeq();
  const seq$1 = {
    collection: "seq",
    default: true,
    nodeClass: YAMLSeq2.YAMLSeq,
    tag: "tag:yaml.org,2002:seq",
    resolve(seq2, onError) {
      if (!identity2.isSeq(seq2))
        onError("Expected a sequence for this tag");
      return seq2;
    },
    createNode: (schema2, obj, ctx) => YAMLSeq2.YAMLSeq.from(schema2, obj, ctx)
  };
  seq.seq = seq$1;
  return seq;
}
var string = {};
var hasRequiredString;
function requireString() {
  if (hasRequiredString) return string;
  hasRequiredString = 1;
  var stringifyString2 = requireStringifyString();
  const string$1 = {
    identify: (value) => typeof value === "string",
    default: true,
    tag: "tag:yaml.org,2002:str",
    resolve: (str) => str,
    stringify(item, ctx, onComment, onChompKeep) {
      ctx = Object.assign({ actualString: true }, ctx);
      return stringifyString2.stringifyString(item, ctx, onComment, onChompKeep);
    }
  };
  string.string = string$1;
  return string;
}
var tags = {};
var _null = {};
var hasRequired_null;
function require_null() {
  if (hasRequired_null) return _null;
  hasRequired_null = 1;
  var Scalar2 = requireScalar();
  const nullTag = {
    identify: (value) => value == null,
    createNode: () => new Scalar2.Scalar(null),
    default: true,
    tag: "tag:yaml.org,2002:null",
    test: /^(?:~|[Nn]ull|NULL)?$/,
    resolve: () => new Scalar2.Scalar(null),
    stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
  };
  _null.nullTag = nullTag;
  return _null;
}
var bool$1 = {};
var hasRequiredBool$1;
function requireBool$1() {
  if (hasRequiredBool$1) return bool$1;
  hasRequiredBool$1 = 1;
  var Scalar2 = requireScalar();
  const boolTag = {
    identify: (value) => typeof value === "boolean",
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
    resolve: (str) => new Scalar2.Scalar(str[0] === "t" || str[0] === "T"),
    stringify({ source, value }, ctx) {
      if (source && boolTag.test.test(source)) {
        const sv = source[0] === "t" || source[0] === "T";
        if (value === sv)
          return source;
      }
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
  };
  bool$1.boolTag = boolTag;
  return bool$1;
}
var float$1 = {};
var stringifyNumber = {};
var hasRequiredStringifyNumber;
function requireStringifyNumber() {
  if (hasRequiredStringifyNumber) return stringifyNumber;
  hasRequiredStringifyNumber = 1;
  function stringifyNumber$1({ format, minFractionDigits, tag, value }) {
    if (typeof value === "bigint")
      return String(value);
    const num = typeof value === "number" ? value : Number(value);
    if (!isFinite(num))
      return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
    let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
    if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
      let i = n.indexOf(".");
      if (i < 0) {
        i = n.length;
        n += ".";
      }
      let d = minFractionDigits - (n.length - i - 1);
      while (d-- > 0)
        n += "0";
    }
    return n;
  }
  stringifyNumber.stringifyNumber = stringifyNumber$1;
  return stringifyNumber;
}
var hasRequiredFloat$1;
function requireFloat$1() {
  if (hasRequiredFloat$1) return float$1;
  hasRequiredFloat$1 = 1;
  var Scalar2 = requireScalar();
  var stringifyNumber2 = requireStringifyNumber();
  const floatNaN = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber2.stringifyNumber
  };
  const floatExp = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "EXP",
    test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
    resolve: (str) => parseFloat(str),
    stringify(node) {
      const num = Number(node.value);
      return isFinite(num) ? num.toExponential() : stringifyNumber2.stringifyNumber(node);
    }
  };
  const float2 = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
    resolve(str) {
      const node = new Scalar2.Scalar(parseFloat(str));
      const dot = str.indexOf(".");
      if (dot !== -1 && str[str.length - 1] === "0")
        node.minFractionDigits = str.length - dot - 1;
      return node;
    },
    stringify: stringifyNumber2.stringifyNumber
  };
  float$1.float = float2;
  float$1.floatExp = floatExp;
  float$1.floatNaN = floatNaN;
  return float$1;
}
var int$1 = {};
var hasRequiredInt$1;
function requireInt$1() {
  if (hasRequiredInt$1) return int$1;
  hasRequiredInt$1 = 1;
  var stringifyNumber2 = requireStringifyNumber();
  const intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
  const intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
  function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value) && value >= 0)
      return prefix + value.toString(radix);
    return stringifyNumber2.stringifyNumber(node);
  }
  const intOct = {
    identify: (value) => intIdentify(value) && value >= 0,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "OCT",
    test: /^0o[0-7]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
    stringify: (node) => intStringify(node, 8, "0o")
  };
  const int2 = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^[-+]?[0-9]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
    stringify: stringifyNumber2.stringifyNumber
  };
  const intHex = {
    identify: (value) => intIdentify(value) && value >= 0,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "HEX",
    test: /^0x[0-9a-fA-F]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
    stringify: (node) => intStringify(node, 16, "0x")
  };
  int$1.int = int2;
  int$1.intHex = intHex;
  int$1.intOct = intOct;
  return int$1;
}
var schema$2 = {};
var hasRequiredSchema$3;
function requireSchema$3() {
  if (hasRequiredSchema$3) return schema$2;
  hasRequiredSchema$3 = 1;
  var map2 = requireMap();
  var _null2 = require_null();
  var seq2 = requireSeq();
  var string2 = requireString();
  var bool2 = requireBool$1();
  var float2 = requireFloat$1();
  var int2 = requireInt$1();
  const schema2 = [
    map2.map,
    seq2.seq,
    string2.string,
    _null2.nullTag,
    bool2.boolTag,
    int2.intOct,
    int2.int,
    int2.intHex,
    float2.floatNaN,
    float2.floatExp,
    float2.float
  ];
  schema$2.schema = schema2;
  return schema$2;
}
var schema$1 = {};
var hasRequiredSchema$2;
function requireSchema$2() {
  if (hasRequiredSchema$2) return schema$1;
  hasRequiredSchema$2 = 1;
  var Scalar2 = requireScalar();
  var map2 = requireMap();
  var seq2 = requireSeq();
  function intIdentify(value) {
    return typeof value === "bigint" || Number.isInteger(value);
  }
  const stringifyJSON = ({ value }) => JSON.stringify(value);
  const jsonScalars = [
    {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify: stringifyJSON
    },
    {
      identify: (value) => value == null,
      createNode: () => new Scalar2.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^null$/,
      resolve: () => null,
      stringify: stringifyJSON
    },
    {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^true$|^false$/,
      resolve: (str) => str === "true",
      stringify: stringifyJSON
    },
    {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^-?(?:0|[1-9][0-9]*)$/,
      resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
      stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
    },
    {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
      resolve: (str) => parseFloat(str),
      stringify: stringifyJSON
    }
  ];
  const jsonError = {
    default: true,
    tag: "",
    test: /^/,
    resolve(str, onError) {
      onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
      return str;
    }
  };
  const schema2 = [map2.map, seq2.seq].concat(jsonScalars, jsonError);
  schema$1.schema = schema2;
  return schema$1;
}
var binary = {};
var hasRequiredBinary;
function requireBinary() {
  if (hasRequiredBinary) return binary;
  hasRequiredBinary = 1;
  var node_buffer = require$$0$1;
  var Scalar2 = requireScalar();
  var stringifyString2 = requireStringifyString();
  const binary$1 = {
    identify: (value) => value instanceof Uint8Array,
    // Buffer inherits from Uint8Array
    default: false,
    tag: "tag:yaml.org,2002:binary",
    /**
     * Returns a Buffer in node and an Uint8Array in browsers
     *
     * To use the resulting buffer as an image, you'll want to do something like:
     *
     *   const blob = new Blob([buffer], { type: 'image/jpeg' })
     *   document.querySelector('#photo').src = URL.createObjectURL(blob)
     */
    resolve(src, onError) {
      if (typeof node_buffer.Buffer === "function") {
        return node_buffer.Buffer.from(src, "base64");
      } else if (typeof atob === "function") {
        const str = atob(src.replace(/[\n\r]/g, ""));
        const buffer = new Uint8Array(str.length);
        for (let i = 0; i < str.length; ++i)
          buffer[i] = str.charCodeAt(i);
        return buffer;
      } else {
        onError("This environment does not support reading binary tags; either Buffer or atob is required");
        return src;
      }
    },
    stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
      if (!value)
        return "";
      const buf = value;
      let str;
      if (typeof node_buffer.Buffer === "function") {
        str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
      } else if (typeof btoa === "function") {
        let s = "";
        for (let i = 0; i < buf.length; ++i)
          s += String.fromCharCode(buf[i]);
        str = btoa(s);
      } else {
        throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
      }
      type ?? (type = Scalar2.Scalar.BLOCK_LITERAL);
      if (type !== Scalar2.Scalar.QUOTE_DOUBLE) {
        const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
        const n = Math.ceil(str.length / lineWidth);
        const lines = new Array(n);
        for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
          lines[i] = str.substr(o, lineWidth);
        }
        str = lines.join(type === Scalar2.Scalar.BLOCK_LITERAL ? "\n" : " ");
      }
      return stringifyString2.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
    }
  };
  binary.binary = binary$1;
  return binary;
}
var omap = {};
var pairs = {};
var hasRequiredPairs;
function requirePairs() {
  if (hasRequiredPairs) return pairs;
  hasRequiredPairs = 1;
  var identity2 = requireIdentity();
  var Pair2 = requirePair();
  var Scalar2 = requireScalar();
  var YAMLSeq2 = requireYAMLSeq();
  function resolvePairs(seq2, onError) {
    if (identity2.isSeq(seq2)) {
      for (let i = 0; i < seq2.items.length; ++i) {
        let item = seq2.items[i];
        if (identity2.isPair(item))
          continue;
        else if (identity2.isMap(item)) {
          if (item.items.length > 1)
            onError("Each pair must have its own sequence indicator");
          const pair = item.items[0] || new Pair2.Pair(new Scalar2.Scalar(null));
          if (item.commentBefore)
            pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
          if (item.comment) {
            const cn = pair.value ?? pair.key;
            cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
          }
          item = pair;
        }
        seq2.items[i] = identity2.isPair(item) ? item : new Pair2.Pair(item);
      }
    } else
      onError("Expected a sequence for this tag");
    return seq2;
  }
  function createPairs(schema2, iterable, ctx) {
    const { replacer } = ctx;
    const pairs2 = new YAMLSeq2.YAMLSeq(schema2);
    pairs2.tag = "tag:yaml.org,2002:pairs";
    let i = 0;
    if (iterable && Symbol.iterator in Object(iterable))
      for (let it of iterable) {
        if (typeof replacer === "function")
          it = replacer.call(iterable, String(i++), it);
        let key, value;
        if (Array.isArray(it)) {
          if (it.length === 2) {
            key = it[0];
            value = it[1];
          } else
            throw new TypeError(`Expected [key, value] tuple: ${it}`);
        } else if (it && it instanceof Object) {
          const keys = Object.keys(it);
          if (keys.length === 1) {
            key = keys[0];
            value = it[key];
          } else {
            throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
          }
        } else {
          key = it;
        }
        pairs2.items.push(Pair2.createPair(key, value, ctx));
      }
    return pairs2;
  }
  const pairs$1 = {
    collection: "seq",
    default: false,
    tag: "tag:yaml.org,2002:pairs",
    resolve: resolvePairs,
    createNode: createPairs
  };
  pairs.createPairs = createPairs;
  pairs.pairs = pairs$1;
  pairs.resolvePairs = resolvePairs;
  return pairs;
}
var hasRequiredOmap;
function requireOmap() {
  if (hasRequiredOmap) return omap;
  hasRequiredOmap = 1;
  var identity2 = requireIdentity();
  var toJS2 = requireToJS();
  var YAMLMap2 = requireYAMLMap();
  var YAMLSeq2 = requireYAMLSeq();
  var pairs2 = requirePairs();
  class YAMLOMap extends YAMLSeq2.YAMLSeq {
    constructor() {
      super();
      this.add = YAMLMap2.YAMLMap.prototype.add.bind(this);
      this.delete = YAMLMap2.YAMLMap.prototype.delete.bind(this);
      this.get = YAMLMap2.YAMLMap.prototype.get.bind(this);
      this.has = YAMLMap2.YAMLMap.prototype.has.bind(this);
      this.set = YAMLMap2.YAMLMap.prototype.set.bind(this);
      this.tag = YAMLOMap.tag;
    }
    /**
     * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
     * but TypeScript won't allow widening the signature of a child method.
     */
    toJSON(_, ctx) {
      if (!ctx)
        return super.toJSON(_);
      const map2 = /* @__PURE__ */ new Map();
      if (ctx?.onCreate)
        ctx.onCreate(map2);
      for (const pair of this.items) {
        let key, value;
        if (identity2.isPair(pair)) {
          key = toJS2.toJS(pair.key, "", ctx);
          value = toJS2.toJS(pair.value, key, ctx);
        } else {
          key = toJS2.toJS(pair, "", ctx);
        }
        if (map2.has(key))
          throw new Error("Ordered maps must not include duplicate keys");
        map2.set(key, value);
      }
      return map2;
    }
    static from(schema2, iterable, ctx) {
      const pairs$1 = pairs2.createPairs(schema2, iterable, ctx);
      const omap2 = new this();
      omap2.items = pairs$1.items;
      return omap2;
    }
  }
  YAMLOMap.tag = "tag:yaml.org,2002:omap";
  const omap$1 = {
    collection: "seq",
    identify: (value) => value instanceof Map,
    nodeClass: YAMLOMap,
    default: false,
    tag: "tag:yaml.org,2002:omap",
    resolve(seq2, onError) {
      const pairs$1 = pairs2.resolvePairs(seq2, onError);
      const seenKeys = [];
      for (const { key } of pairs$1.items) {
        if (identity2.isScalar(key)) {
          if (seenKeys.includes(key.value)) {
            onError(`Ordered maps must not include duplicate keys: ${key.value}`);
          } else {
            seenKeys.push(key.value);
          }
        }
      }
      return Object.assign(new YAMLOMap(), pairs$1);
    },
    createNode: (schema2, iterable, ctx) => YAMLOMap.from(schema2, iterable, ctx)
  };
  omap.YAMLOMap = YAMLOMap;
  omap.omap = omap$1;
  return omap;
}
var schema = {};
var bool = {};
var hasRequiredBool;
function requireBool() {
  if (hasRequiredBool) return bool;
  hasRequiredBool = 1;
  var Scalar2 = requireScalar();
  function boolStringify({ value, source }, ctx) {
    const boolObj = value ? trueTag : falseTag;
    if (source && boolObj.test.test(source))
      return source;
    return value ? ctx.options.trueStr : ctx.options.falseStr;
  }
  const trueTag = {
    identify: (value) => value === true,
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
    resolve: () => new Scalar2.Scalar(true),
    stringify: boolStringify
  };
  const falseTag = {
    identify: (value) => value === false,
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
    resolve: () => new Scalar2.Scalar(false),
    stringify: boolStringify
  };
  bool.falseTag = falseTag;
  bool.trueTag = trueTag;
  return bool;
}
var float = {};
var hasRequiredFloat;
function requireFloat() {
  if (hasRequiredFloat) return float;
  hasRequiredFloat = 1;
  var Scalar2 = requireScalar();
  var stringifyNumber2 = requireStringifyNumber();
  const floatNaN = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber2.stringifyNumber
  };
  const floatExp = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "EXP",
    test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
    resolve: (str) => parseFloat(str.replace(/_/g, "")),
    stringify(node) {
      const num = Number(node.value);
      return isFinite(num) ? num.toExponential() : stringifyNumber2.stringifyNumber(node);
    }
  };
  const float$12 = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
    resolve(str) {
      const node = new Scalar2.Scalar(parseFloat(str.replace(/_/g, "")));
      const dot = str.indexOf(".");
      if (dot !== -1) {
        const f = str.substring(dot + 1).replace(/_/g, "");
        if (f[f.length - 1] === "0")
          node.minFractionDigits = f.length;
      }
      return node;
    },
    stringify: stringifyNumber2.stringifyNumber
  };
  float.float = float$12;
  float.floatExp = floatExp;
  float.floatNaN = floatNaN;
  return float;
}
var int = {};
var hasRequiredInt;
function requireInt() {
  if (hasRequiredInt) return int;
  hasRequiredInt = 1;
  var stringifyNumber2 = requireStringifyNumber();
  const intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
  function intResolve(str, offset, radix, { intAsBigInt }) {
    const sign = str[0];
    if (sign === "-" || sign === "+")
      offset += 1;
    str = str.substring(offset).replace(/_/g, "");
    if (intAsBigInt) {
      switch (radix) {
        case 2:
          str = `0b${str}`;
          break;
        case 8:
          str = `0o${str}`;
          break;
        case 16:
          str = `0x${str}`;
          break;
      }
      const n2 = BigInt(str);
      return sign === "-" ? BigInt(-1) * n2 : n2;
    }
    const n = parseInt(str, radix);
    return sign === "-" ? -1 * n : n;
  }
  function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value)) {
      const str = value.toString(radix);
      return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
    }
    return stringifyNumber2.stringifyNumber(node);
  }
  const intBin = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "BIN",
    test: /^[-+]?0b[0-1_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
    stringify: (node) => intStringify(node, 2, "0b")
  };
  const intOct = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "OCT",
    test: /^[-+]?0[0-7_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
    stringify: (node) => intStringify(node, 8, "0")
  };
  const int$12 = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^[-+]?[0-9][0-9_]*$/,
    resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
    stringify: stringifyNumber2.stringifyNumber
  };
  const intHex = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "HEX",
    test: /^[-+]?0x[0-9a-fA-F_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
    stringify: (node) => intStringify(node, 16, "0x")
  };
  int.int = int$12;
  int.intBin = intBin;
  int.intHex = intHex;
  int.intOct = intOct;
  return int;
}
var set = {};
var hasRequiredSet;
function requireSet() {
  if (hasRequiredSet) return set;
  hasRequiredSet = 1;
  var identity2 = requireIdentity();
  var Pair2 = requirePair();
  var YAMLMap2 = requireYAMLMap();
  class YAMLSet extends YAMLMap2.YAMLMap {
    constructor(schema2) {
      super(schema2);
      this.tag = YAMLSet.tag;
    }
    add(key) {
      let pair;
      if (identity2.isPair(key))
        pair = key;
      else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
        pair = new Pair2.Pair(key.key, null);
      else
        pair = new Pair2.Pair(key, null);
      const prev = YAMLMap2.findPair(this.items, pair.key);
      if (!prev)
        this.items.push(pair);
    }
    /**
     * If `keepPair` is `true`, returns the Pair matching `key`.
     * Otherwise, returns the value of that Pair's key.
     */
    get(key, keepPair) {
      const pair = YAMLMap2.findPair(this.items, key);
      return !keepPair && identity2.isPair(pair) ? identity2.isScalar(pair.key) ? pair.key.value : pair.key : pair;
    }
    set(key, value) {
      if (typeof value !== "boolean")
        throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
      const prev = YAMLMap2.findPair(this.items, key);
      if (prev && !value) {
        this.items.splice(this.items.indexOf(prev), 1);
      } else if (!prev && value) {
        this.items.push(new Pair2.Pair(key));
      }
    }
    toJSON(_, ctx) {
      return super.toJSON(_, ctx, Set);
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      if (this.hasAllNullValues(true))
        return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
      else
        throw new Error("Set items must all have null values");
    }
    static from(schema2, iterable, ctx) {
      const { replacer } = ctx;
      const set2 = new this(schema2);
      if (iterable && Symbol.iterator in Object(iterable))
        for (let value of iterable) {
          if (typeof replacer === "function")
            value = replacer.call(iterable, value, value);
          set2.items.push(Pair2.createPair(value, null, ctx));
        }
      return set2;
    }
  }
  YAMLSet.tag = "tag:yaml.org,2002:set";
  const set$1 = {
    collection: "map",
    identify: (value) => value instanceof Set,
    nodeClass: YAMLSet,
    default: false,
    tag: "tag:yaml.org,2002:set",
    createNode: (schema2, iterable, ctx) => YAMLSet.from(schema2, iterable, ctx),
    resolve(map2, onError) {
      if (identity2.isMap(map2)) {
        if (map2.hasAllNullValues(true))
          return Object.assign(new YAMLSet(), map2);
        else
          onError("Set items must all have null values");
      } else
        onError("Expected a mapping for this tag");
      return map2;
    }
  };
  set.YAMLSet = YAMLSet;
  set.set = set$1;
  return set;
}
var timestamp$2 = {};
var hasRequiredTimestamp;
function requireTimestamp() {
  if (hasRequiredTimestamp) return timestamp$2;
  hasRequiredTimestamp = 1;
  var stringifyNumber2 = requireStringifyNumber();
  function parseSexagesimal(str, asBigInt) {
    const sign = str[0];
    const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
    const num = (n) => asBigInt ? BigInt(n) : Number(n);
    const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
    return sign === "-" ? num(-1) * res : res;
  }
  function stringifySexagesimal(node) {
    let { value } = node;
    let num = (n) => n;
    if (typeof value === "bigint")
      num = (n) => BigInt(n);
    else if (isNaN(value) || !isFinite(value))
      return stringifyNumber2.stringifyNumber(node);
    let sign = "";
    if (value < 0) {
      sign = "-";
      value *= num(-1);
    }
    const _60 = num(60);
    const parts = [value % _60];
    if (value < 60) {
      parts.unshift(0);
    } else {
      value = (value - parts[0]) / _60;
      parts.unshift(value % _60);
      if (value >= 60) {
        value = (value - parts[0]) / _60;
        parts.unshift(value);
      }
    }
    return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
  }
  const intTime = {
    identify: (value) => typeof value === "bigint" || Number.isInteger(value),
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "TIME",
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
    resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
    stringify: stringifySexagesimal
  };
  const floatTime = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "TIME",
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
    resolve: (str) => parseSexagesimal(str, false),
    stringify: stringifySexagesimal
  };
  const timestamp2 = {
    identify: (value) => value instanceof Date,
    default: true,
    tag: "tag:yaml.org,2002:timestamp",
    // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
    // may be omitted altogether, resulting in a date format. In such a case, the time part is
    // assumed to be 00:00:00Z (start of day, UTC).
    test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
    resolve(str) {
      const match = str.match(timestamp2.test);
      if (!match)
        throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
      const [, year, month, day, hour, minute, second] = match.map(Number);
      const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
      let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
      const tz = match[8];
      if (tz && tz !== "Z") {
        let d = parseSexagesimal(tz, false);
        if (Math.abs(d) < 30)
          d *= 60;
        date -= 6e4 * d;
      }
      return new Date(date);
    },
    stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
  };
  timestamp$2.floatTime = floatTime;
  timestamp$2.intTime = intTime;
  timestamp$2.timestamp = timestamp2;
  return timestamp$2;
}
var hasRequiredSchema$1;
function requireSchema$1() {
  if (hasRequiredSchema$1) return schema;
  hasRequiredSchema$1 = 1;
  var map2 = requireMap();
  var _null2 = require_null();
  var seq2 = requireSeq();
  var string2 = requireString();
  var binary2 = requireBinary();
  var bool2 = requireBool();
  var float2 = requireFloat();
  var int2 = requireInt();
  var merge2 = requireMerge();
  var omap2 = requireOmap();
  var pairs2 = requirePairs();
  var set2 = requireSet();
  var timestamp2 = requireTimestamp();
  const schema$12 = [
    map2.map,
    seq2.seq,
    string2.string,
    _null2.nullTag,
    bool2.trueTag,
    bool2.falseTag,
    int2.intBin,
    int2.intOct,
    int2.int,
    int2.intHex,
    float2.floatNaN,
    float2.floatExp,
    float2.float,
    binary2.binary,
    merge2.merge,
    omap2.omap,
    pairs2.pairs,
    set2.set,
    timestamp2.intTime,
    timestamp2.floatTime,
    timestamp2.timestamp
  ];
  schema.schema = schema$12;
  return schema;
}
var hasRequiredTags;
function requireTags() {
  if (hasRequiredTags) return tags;
  hasRequiredTags = 1;
  var map2 = requireMap();
  var _null2 = require_null();
  var seq2 = requireSeq();
  var string2 = requireString();
  var bool2 = requireBool$1();
  var float2 = requireFloat$1();
  var int2 = requireInt$1();
  var schema2 = requireSchema$3();
  var schema$12 = requireSchema$2();
  var binary2 = requireBinary();
  var merge2 = requireMerge();
  var omap2 = requireOmap();
  var pairs2 = requirePairs();
  var schema$22 = requireSchema$1();
  var set2 = requireSet();
  var timestamp2 = requireTimestamp();
  const schemas = /* @__PURE__ */ new Map([
    ["core", schema2.schema],
    ["failsafe", [map2.map, seq2.seq, string2.string]],
    ["json", schema$12.schema],
    ["yaml11", schema$22.schema],
    ["yaml-1.1", schema$22.schema]
  ]);
  const tagsByName = {
    binary: binary2.binary,
    bool: bool2.boolTag,
    float: float2.float,
    floatExp: float2.floatExp,
    floatNaN: float2.floatNaN,
    floatTime: timestamp2.floatTime,
    int: int2.int,
    intHex: int2.intHex,
    intOct: int2.intOct,
    intTime: timestamp2.intTime,
    map: map2.map,
    merge: merge2.merge,
    null: _null2.nullTag,
    omap: omap2.omap,
    pairs: pairs2.pairs,
    seq: seq2.seq,
    set: set2.set,
    timestamp: timestamp2.timestamp
  };
  const coreKnownTags = {
    "tag:yaml.org,2002:binary": binary2.binary,
    "tag:yaml.org,2002:merge": merge2.merge,
    "tag:yaml.org,2002:omap": omap2.omap,
    "tag:yaml.org,2002:pairs": pairs2.pairs,
    "tag:yaml.org,2002:set": set2.set,
    "tag:yaml.org,2002:timestamp": timestamp2.timestamp
  };
  function getTags(customTags, schemaName, addMergeTag) {
    const schemaTags = schemas.get(schemaName);
    if (schemaTags && !customTags) {
      return addMergeTag && !schemaTags.includes(merge2.merge) ? schemaTags.concat(merge2.merge) : schemaTags.slice();
    }
    let tags2 = schemaTags;
    if (!tags2) {
      if (Array.isArray(customTags))
        tags2 = [];
      else {
        const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
        throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
      }
    }
    if (Array.isArray(customTags)) {
      for (const tag of customTags)
        tags2 = tags2.concat(tag);
    } else if (typeof customTags === "function") {
      tags2 = customTags(tags2.slice());
    }
    if (addMergeTag)
      tags2 = tags2.concat(merge2.merge);
    return tags2.reduce((tags3, tag) => {
      const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
      if (!tagObj) {
        const tagName = JSON.stringify(tag);
        const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
        throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
      }
      if (!tags3.includes(tagObj))
        tags3.push(tagObj);
      return tags3;
    }, []);
  }
  tags.coreKnownTags = coreKnownTags;
  tags.getTags = getTags;
  return tags;
}
var hasRequiredSchema;
function requireSchema() {
  if (hasRequiredSchema) return Schema;
  hasRequiredSchema = 1;
  var identity2 = requireIdentity();
  var map2 = requireMap();
  var seq2 = requireSeq();
  var string2 = requireString();
  var tags2 = requireTags();
  const sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  let Schema$1 = class Schema2 {
    constructor({ compat, customTags, merge: merge2, resolveKnownTags, schema: schema2, sortMapEntries, toStringDefaults }) {
      this.compat = Array.isArray(compat) ? tags2.getTags(compat, "compat") : compat ? tags2.getTags(null, compat) : null;
      this.name = typeof schema2 === "string" && schema2 || "core";
      this.knownTags = resolveKnownTags ? tags2.coreKnownTags : {};
      this.tags = tags2.getTags(customTags, this.name, merge2);
      this.toStringOptions = toStringDefaults ?? null;
      Object.defineProperty(this, identity2.MAP, { value: map2.map });
      Object.defineProperty(this, identity2.SCALAR, { value: string2.string });
      Object.defineProperty(this, identity2.SEQ, { value: seq2.seq });
      this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
    }
    clone() {
      const copy = Object.create(Schema2.prototype, Object.getOwnPropertyDescriptors(this));
      copy.tags = this.tags.slice();
      return copy;
    }
  };
  Schema.Schema = Schema$1;
  return Schema;
}
var stringifyDocument = {};
var hasRequiredStringifyDocument;
function requireStringifyDocument() {
  if (hasRequiredStringifyDocument) return stringifyDocument;
  hasRequiredStringifyDocument = 1;
  var identity2 = requireIdentity();
  var stringify2 = requireStringify();
  var stringifyComment2 = requireStringifyComment();
  function stringifyDocument$1(doc, options) {
    const lines = [];
    let hasDirectives = options.directives === true;
    if (options.directives !== false && doc.directives) {
      const dir = doc.directives.toString(doc);
      if (dir) {
        lines.push(dir);
        hasDirectives = true;
      } else if (doc.directives.docStart)
        hasDirectives = true;
    }
    if (hasDirectives)
      lines.push("---");
    const ctx = stringify2.createStringifyContext(doc, options);
    const { commentString } = ctx.options;
    if (doc.commentBefore) {
      if (lines.length !== 1)
        lines.unshift("");
      const cs = commentString(doc.commentBefore);
      lines.unshift(stringifyComment2.indentComment(cs, ""));
    }
    let chompKeep = false;
    let contentComment = null;
    if (doc.contents) {
      if (identity2.isNode(doc.contents)) {
        if (doc.contents.spaceBefore && hasDirectives)
          lines.push("");
        if (doc.contents.commentBefore) {
          const cs = commentString(doc.contents.commentBefore);
          lines.push(stringifyComment2.indentComment(cs, ""));
        }
        ctx.forceBlockIndent = !!doc.comment;
        contentComment = doc.contents.comment;
      }
      const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
      let body = stringify2.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
      if (contentComment)
        body += stringifyComment2.lineComment(body, "", commentString(contentComment));
      if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
        lines[lines.length - 1] = `--- ${body}`;
      } else
        lines.push(body);
    } else {
      lines.push(stringify2.stringify(doc.contents, ctx));
    }
    if (doc.directives?.docEnd) {
      if (doc.comment) {
        const cs = commentString(doc.comment);
        if (cs.includes("\n")) {
          lines.push("...");
          lines.push(stringifyComment2.indentComment(cs, ""));
        } else {
          lines.push(`... ${cs}`);
        }
      } else {
        lines.push("...");
      }
    } else {
      let dc = doc.comment;
      if (dc && chompKeep)
        dc = dc.replace(/^\n+/, "");
      if (dc) {
        if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
          lines.push("");
        lines.push(stringifyComment2.indentComment(commentString(dc), ""));
      }
    }
    return lines.join("\n") + "\n";
  }
  stringifyDocument.stringifyDocument = stringifyDocument$1;
  return stringifyDocument;
}
var hasRequiredDocument;
function requireDocument() {
  if (hasRequiredDocument) return Document;
  hasRequiredDocument = 1;
  var Alias2 = requireAlias();
  var Collection2 = requireCollection();
  var identity2 = requireIdentity();
  var Pair2 = requirePair();
  var toJS2 = requireToJS();
  var Schema2 = requireSchema();
  var stringifyDocument2 = requireStringifyDocument();
  var anchors2 = requireAnchors();
  var applyReviver2 = requireApplyReviver();
  var createNode2 = requireCreateNode();
  var directives2 = requireDirectives();
  let Document$1 = class Document2 {
    constructor(value, replacer, options) {
      this.commentBefore = null;
      this.comment = null;
      this.errors = [];
      this.warnings = [];
      Object.defineProperty(this, identity2.NODE_TYPE, { value: identity2.DOC });
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
        replacer = void 0;
      }
      const opt = Object.assign({
        intAsBigInt: false,
        keepSourceTokens: false,
        logLevel: "warn",
        prettyErrors: true,
        strict: true,
        stringKeys: false,
        uniqueKeys: true,
        version: "1.2"
      }, options);
      this.options = opt;
      let { version } = opt;
      if (options?._directives) {
        this.directives = options._directives.atDocument();
        if (this.directives.yaml.explicit)
          version = this.directives.yaml.version;
      } else
        this.directives = new directives2.Directives({ version });
      this.setSchema(version, options);
      this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
    }
    /**
     * Create a deep copy of this Document and its contents.
     *
     * Custom Node values that inherit from `Object` still refer to their original instances.
     */
    clone() {
      const copy = Object.create(Document2.prototype, {
        [identity2.NODE_TYPE]: { value: identity2.DOC }
      });
      copy.commentBefore = this.commentBefore;
      copy.comment = this.comment;
      copy.errors = this.errors.slice();
      copy.warnings = this.warnings.slice();
      copy.options = Object.assign({}, this.options);
      if (this.directives)
        copy.directives = this.directives.clone();
      copy.schema = this.schema.clone();
      copy.contents = identity2.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    /** Adds a value to the document. */
    add(value) {
      if (assertCollection(this.contents))
        this.contents.add(value);
    }
    /** Adds a value to the document. */
    addIn(path, value) {
      if (assertCollection(this.contents))
        this.contents.addIn(path, value);
    }
    /**
     * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
     *
     * If `node` already has an anchor, `name` is ignored.
     * Otherwise, the `node.anchor` value will be set to `name`,
     * or if an anchor with that name is already present in the document,
     * `name` will be used as a prefix for a new unique anchor.
     * If `name` is undefined, the generated anchor will use 'a' as a prefix.
     */
    createAlias(node, name) {
      if (!node.anchor) {
        const prev = anchors2.anchorNames(this);
        node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        !name || prev.has(name) ? anchors2.findNewAnchor(name || "a", prev) : name;
      }
      return new Alias2.Alias(node.anchor);
    }
    createNode(value, replacer, options) {
      let _replacer = void 0;
      if (typeof replacer === "function") {
        value = replacer.call({ "": value }, "", value);
        _replacer = replacer;
      } else if (Array.isArray(replacer)) {
        const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
        const asStr = replacer.filter(keyToStr).map(String);
        if (asStr.length > 0)
          replacer = replacer.concat(asStr);
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
        replacer = void 0;
      }
      const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
      const { onAnchor, setAnchors, sourceObjects } = anchors2.createNodeAnchors(
        this,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        anchorPrefix || "a"
      );
      const ctx = {
        aliasDuplicateObjects: aliasDuplicateObjects ?? true,
        keepUndefined: keepUndefined ?? false,
        onAnchor,
        onTagObj,
        replacer: _replacer,
        schema: this.schema,
        sourceObjects
      };
      const node = createNode2.createNode(value, tag, ctx);
      if (flow && identity2.isCollection(node))
        node.flow = true;
      setAnchors();
      return node;
    }
    /**
     * Convert a key and a value into a `Pair` using the current schema,
     * recursively wrapping all values as `Scalar` or `Collection` nodes.
     */
    createPair(key, value, options = {}) {
      const k = this.createNode(key, null, options);
      const v = this.createNode(value, null, options);
      return new Pair2.Pair(k, v);
    }
    /**
     * Removes a value from the document.
     * @returns `true` if the item was found and removed.
     */
    delete(key) {
      return assertCollection(this.contents) ? this.contents.delete(key) : false;
    }
    /**
     * Removes a value from the document.
     * @returns `true` if the item was found and removed.
     */
    deleteIn(path) {
      if (Collection2.isEmptyPath(path)) {
        if (this.contents == null)
          return false;
        this.contents = null;
        return true;
      }
      return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
    }
    /**
     * Returns item at `key`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    get(key, keepScalar) {
      return identity2.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
    }
    /**
     * Returns item at `path`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    getIn(path, keepScalar) {
      if (Collection2.isEmptyPath(path))
        return !keepScalar && identity2.isScalar(this.contents) ? this.contents.value : this.contents;
      return identity2.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
    }
    /**
     * Checks if the document includes a value with the key `key`.
     */
    has(key) {
      return identity2.isCollection(this.contents) ? this.contents.has(key) : false;
    }
    /**
     * Checks if the document includes a value at `path`.
     */
    hasIn(path) {
      if (Collection2.isEmptyPath(path))
        return this.contents !== void 0;
      return identity2.isCollection(this.contents) ? this.contents.hasIn(path) : false;
    }
    /**
     * Sets a value in this document. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    set(key, value) {
      if (this.contents == null) {
        this.contents = Collection2.collectionFromPath(this.schema, [key], value);
      } else if (assertCollection(this.contents)) {
        this.contents.set(key, value);
      }
    }
    /**
     * Sets a value in this document. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    setIn(path, value) {
      if (Collection2.isEmptyPath(path)) {
        this.contents = value;
      } else if (this.contents == null) {
        this.contents = Collection2.collectionFromPath(this.schema, Array.from(path), value);
      } else if (assertCollection(this.contents)) {
        this.contents.setIn(path, value);
      }
    }
    /**
     * Change the YAML version and schema used by the document.
     * A `null` version disables support for directives, explicit tags, anchors, and aliases.
     * It also requires the `schema` option to be given as a `Schema` instance value.
     *
     * Overrides all previously set schema options.
     */
    setSchema(version, options = {}) {
      if (typeof version === "number")
        version = String(version);
      let opt;
      switch (version) {
        case "1.1":
          if (this.directives)
            this.directives.yaml.version = "1.1";
          else
            this.directives = new directives2.Directives({ version: "1.1" });
          opt = { resolveKnownTags: false, schema: "yaml-1.1" };
          break;
        case "1.2":
        case "next":
          if (this.directives)
            this.directives.yaml.version = version;
          else
            this.directives = new directives2.Directives({ version });
          opt = { resolveKnownTags: true, schema: "core" };
          break;
        case null:
          if (this.directives)
            delete this.directives;
          opt = null;
          break;
        default: {
          const sv = JSON.stringify(version);
          throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
        }
      }
      if (options.schema instanceof Object)
        this.schema = options.schema;
      else if (opt)
        this.schema = new Schema2.Schema(Object.assign(opt, options));
      else
        throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
    }
    // json & jsonArg are only used from toJSON()
    toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
      const ctx = {
        anchors: /* @__PURE__ */ new Map(),
        doc: this,
        keep: !json,
        mapAsMap: mapAsMap === true,
        mapKeyWarned: false,
        maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
      };
      const res = toJS2.toJS(this.contents, jsonArg ?? "", ctx);
      if (typeof onAnchor === "function")
        for (const { count, res: res2 } of ctx.anchors.values())
          onAnchor(res2, count);
      return typeof reviver === "function" ? applyReviver2.applyReviver(reviver, { "": res }, "", res) : res;
    }
    /**
     * A JSON representation of the document `contents`.
     *
     * @param jsonArg Used by `JSON.stringify` to indicate the array index or
     *   property name.
     */
    toJSON(jsonArg, onAnchor) {
      return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
    }
    /** A YAML representation of the document. */
    toString(options = {}) {
      if (this.errors.length > 0)
        throw new Error("Document with errors cannot be stringified");
      if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
        const s = JSON.stringify(options.indent);
        throw new Error(`"indent" option must be a positive integer, not ${s}`);
      }
      return stringifyDocument2.stringifyDocument(this, options);
    }
  };
  function assertCollection(contents) {
    if (identity2.isCollection(contents))
      return true;
    throw new Error("Expected a YAML collection as document contents");
  }
  Document.Document = Document$1;
  return Document;
}
var errors = {};
var hasRequiredErrors;
function requireErrors() {
  if (hasRequiredErrors) return errors;
  hasRequiredErrors = 1;
  class YAMLError extends Error {
    constructor(name, pos, code, message) {
      super();
      this.name = name;
      this.code = code;
      this.message = message;
      this.pos = pos;
    }
  }
  class YAMLParseError extends YAMLError {
    constructor(pos, code, message) {
      super("YAMLParseError", pos, code, message);
    }
  }
  class YAMLWarning extends YAMLError {
    constructor(pos, code, message) {
      super("YAMLWarning", pos, code, message);
    }
  }
  const prettifyError = (src, lc) => (error) => {
    if (error.pos[0] === -1)
      return;
    error.linePos = error.pos.map((pos) => lc.linePos(pos));
    const { line, col } = error.linePos[0];
    error.message += ` at line ${line}, column ${col}`;
    let ci = col - 1;
    let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
    if (ci >= 60 && lineStr.length > 80) {
      const trimStart = Math.min(ci - 39, lineStr.length - 79);
      lineStr = "…" + lineStr.substring(trimStart);
      ci -= trimStart - 1;
    }
    if (lineStr.length > 80)
      lineStr = lineStr.substring(0, 79) + "…";
    if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
      let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
      if (prev.length > 80)
        prev = prev.substring(0, 79) + "…\n";
      lineStr = prev + lineStr;
    }
    if (/[^ ]/.test(lineStr)) {
      let count = 1;
      const end = error.linePos[1];
      if (end?.line === line && end.col > col) {
        count = Math.max(1, Math.min(end.col - col, 80 - ci));
      }
      const pointer = " ".repeat(ci) + "^".repeat(count);
      error.message += `:

${lineStr}
${pointer}
`;
    }
  };
  errors.YAMLError = YAMLError;
  errors.YAMLParseError = YAMLParseError;
  errors.YAMLWarning = YAMLWarning;
  errors.prettifyError = prettifyError;
  return errors;
}
var composeDoc = {};
var composeNode = {};
var composeCollection = {};
var resolveBlockMap = {};
var resolveProps = {};
var hasRequiredResolveProps;
function requireResolveProps() {
  if (hasRequiredResolveProps) return resolveProps;
  hasRequiredResolveProps = 1;
  function resolveProps$1(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
    let spaceBefore = false;
    let atNewline = startOnNewline;
    let hasSpace = startOnNewline;
    let comment = "";
    let commentSep = "";
    let hasNewline = false;
    let reqSpace = false;
    let tab = null;
    let anchor = null;
    let tag = null;
    let newlineAfterProp = null;
    let comma = null;
    let found = null;
    let start = null;
    for (const token of tokens) {
      if (reqSpace) {
        if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
          onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
        reqSpace = false;
      }
      if (tab) {
        if (atNewline && token.type !== "comment" && token.type !== "newline") {
          onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
        }
        tab = null;
      }
      switch (token.type) {
        case "space":
          if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
            tab = token;
          }
          hasSpace = true;
          break;
        case "comment": {
          if (!hasSpace)
            onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
          const cb = token.source.substring(1) || " ";
          if (!comment)
            comment = cb;
          else
            comment += commentSep + cb;
          commentSep = "";
          atNewline = false;
          break;
        }
        case "newline":
          if (atNewline) {
            if (comment)
              comment += token.source;
            else if (!found || indicator !== "seq-item-ind")
              spaceBefore = true;
          } else
            commentSep += token.source;
          atNewline = true;
          hasNewline = true;
          if (anchor || tag)
            newlineAfterProp = token;
          hasSpace = true;
          break;
        case "anchor":
          if (anchor)
            onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
          if (token.source.endsWith(":"))
            onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
          anchor = token;
          start ?? (start = token.offset);
          atNewline = false;
          hasSpace = false;
          reqSpace = true;
          break;
        case "tag": {
          if (tag)
            onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
          tag = token;
          start ?? (start = token.offset);
          atNewline = false;
          hasSpace = false;
          reqSpace = true;
          break;
        }
        case indicator:
          if (anchor || tag)
            onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
          if (found)
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
          found = token;
          atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
          hasSpace = false;
          break;
        case "comma":
          if (flow) {
            if (comma)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
            comma = token;
            atNewline = false;
            hasSpace = false;
            break;
          }
        // else fallthrough
        default:
          onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
          atNewline = false;
          hasSpace = false;
      }
    }
    const last = tokens[tokens.length - 1];
    const end = last ? last.offset + last.source.length : offset;
    if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
      onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
    }
    if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
      onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
    return {
      comma,
      found,
      spaceBefore,
      comment,
      hasNewline,
      anchor,
      tag,
      newlineAfterProp,
      end,
      start: start ?? end
    };
  }
  resolveProps.resolveProps = resolveProps$1;
  return resolveProps;
}
var utilContainsNewline = {};
var hasRequiredUtilContainsNewline;
function requireUtilContainsNewline() {
  if (hasRequiredUtilContainsNewline) return utilContainsNewline;
  hasRequiredUtilContainsNewline = 1;
  function containsNewline(key) {
    if (!key)
      return null;
    switch (key.type) {
      case "alias":
      case "scalar":
      case "double-quoted-scalar":
      case "single-quoted-scalar":
        if (key.source.includes("\n"))
          return true;
        if (key.end) {
          for (const st of key.end)
            if (st.type === "newline")
              return true;
        }
        return false;
      case "flow-collection":
        for (const it of key.items) {
          for (const st of it.start)
            if (st.type === "newline")
              return true;
          if (it.sep) {
            for (const st of it.sep)
              if (st.type === "newline")
                return true;
          }
          if (containsNewline(it.key) || containsNewline(it.value))
            return true;
        }
        return false;
      default:
        return true;
    }
  }
  utilContainsNewline.containsNewline = containsNewline;
  return utilContainsNewline;
}
var utilFlowIndentCheck = {};
var hasRequiredUtilFlowIndentCheck;
function requireUtilFlowIndentCheck() {
  if (hasRequiredUtilFlowIndentCheck) return utilFlowIndentCheck;
  hasRequiredUtilFlowIndentCheck = 1;
  var utilContainsNewline2 = requireUtilContainsNewline();
  function flowIndentCheck(indent, fc, onError) {
    if (fc?.type === "flow-collection") {
      const end = fc.end[0];
      if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline2.containsNewline(fc)) {
        const msg = "Flow end indicator should be more indented than parent";
        onError(end, "BAD_INDENT", msg, true);
      }
    }
  }
  utilFlowIndentCheck.flowIndentCheck = flowIndentCheck;
  return utilFlowIndentCheck;
}
var utilMapIncludes = {};
var hasRequiredUtilMapIncludes;
function requireUtilMapIncludes() {
  if (hasRequiredUtilMapIncludes) return utilMapIncludes;
  hasRequiredUtilMapIncludes = 1;
  var identity2 = requireIdentity();
  function mapIncludes(ctx, items, search) {
    const { uniqueKeys } = ctx.options;
    if (uniqueKeys === false)
      return false;
    const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity2.isScalar(a) && identity2.isScalar(b) && a.value === b.value;
    return items.some((pair) => isEqual(pair.key, search));
  }
  utilMapIncludes.mapIncludes = mapIncludes;
  return utilMapIncludes;
}
var hasRequiredResolveBlockMap;
function requireResolveBlockMap() {
  if (hasRequiredResolveBlockMap) return resolveBlockMap;
  hasRequiredResolveBlockMap = 1;
  var Pair2 = requirePair();
  var YAMLMap2 = requireYAMLMap();
  var resolveProps2 = requireResolveProps();
  var utilContainsNewline2 = requireUtilContainsNewline();
  var utilFlowIndentCheck2 = requireUtilFlowIndentCheck();
  var utilMapIncludes2 = requireUtilMapIncludes();
  const startColMsg = "All mapping items must start at the same column";
  function resolveBlockMap$1({ composeNode: composeNode2, composeEmptyNode }, ctx, bm, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLMap2.YAMLMap;
    const map2 = new NodeClass(ctx.schema);
    if (ctx.atRoot)
      ctx.atRoot = false;
    let offset = bm.offset;
    let commentEnd = null;
    for (const collItem of bm.items) {
      const { start, key, sep: sep2, value } = collItem;
      const keyProps = resolveProps2.resolveProps(start, {
        indicator: "explicit-key-ind",
        next: key ?? sep2?.[0],
        offset,
        onError,
        parentIndent: bm.indent,
        startOnNewline: true
      });
      const implicitKey = !keyProps.found;
      if (implicitKey) {
        if (key) {
          if (key.type === "block-seq")
            onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
          else if ("indent" in key && key.indent !== bm.indent)
            onError(offset, "BAD_INDENT", startColMsg);
        }
        if (!keyProps.anchor && !keyProps.tag && !sep2) {
          commentEnd = keyProps.end;
          if (keyProps.comment) {
            if (map2.comment)
              map2.comment += "\n" + keyProps.comment;
            else
              map2.comment = keyProps.comment;
          }
          continue;
        }
        if (keyProps.newlineAfterProp || utilContainsNewline2.containsNewline(key)) {
          onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
        }
      } else if (keyProps.found?.indent !== bm.indent) {
        onError(offset, "BAD_INDENT", startColMsg);
      }
      ctx.atKey = true;
      const keyStart = keyProps.end;
      const keyNode = key ? composeNode2(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
      if (ctx.schema.compat)
        utilFlowIndentCheck2.flowIndentCheck(bm.indent, key, onError);
      ctx.atKey = false;
      if (utilMapIncludes2.mapIncludes(ctx, map2.items, keyNode))
        onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
      const valueProps = resolveProps2.resolveProps(sep2 ?? [], {
        indicator: "map-value-ind",
        next: value,
        offset: keyNode.range[2],
        onError,
        parentIndent: bm.indent,
        startOnNewline: !key || key.type === "block-scalar"
      });
      offset = valueProps.end;
      if (valueProps.found) {
        if (implicitKey) {
          if (value?.type === "block-map" && !valueProps.hasNewline)
            onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
          if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
            onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
        }
        const valueNode = value ? composeNode2(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep2, null, valueProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck2.flowIndentCheck(bm.indent, value, onError);
        offset = valueNode.range[2];
        const pair = new Pair2.Pair(keyNode, valueNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        map2.items.push(pair);
      } else {
        if (implicitKey)
          onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
        if (valueProps.comment) {
          if (keyNode.comment)
            keyNode.comment += "\n" + valueProps.comment;
          else
            keyNode.comment = valueProps.comment;
        }
        const pair = new Pair2.Pair(keyNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        map2.items.push(pair);
      }
    }
    if (commentEnd && commentEnd < offset)
      onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
    map2.range = [bm.offset, offset, commentEnd ?? offset];
    return map2;
  }
  resolveBlockMap.resolveBlockMap = resolveBlockMap$1;
  return resolveBlockMap;
}
var resolveBlockSeq = {};
var hasRequiredResolveBlockSeq;
function requireResolveBlockSeq() {
  if (hasRequiredResolveBlockSeq) return resolveBlockSeq;
  hasRequiredResolveBlockSeq = 1;
  var YAMLSeq2 = requireYAMLSeq();
  var resolveProps2 = requireResolveProps();
  var utilFlowIndentCheck2 = requireUtilFlowIndentCheck();
  function resolveBlockSeq$1({ composeNode: composeNode2, composeEmptyNode }, ctx, bs, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLSeq2.YAMLSeq;
    const seq2 = new NodeClass(ctx.schema);
    if (ctx.atRoot)
      ctx.atRoot = false;
    if (ctx.atKey)
      ctx.atKey = false;
    let offset = bs.offset;
    let commentEnd = null;
    for (const { start, value } of bs.items) {
      const props = resolveProps2.resolveProps(start, {
        indicator: "seq-item-ind",
        next: value,
        offset,
        onError,
        parentIndent: bs.indent,
        startOnNewline: true
      });
      if (!props.found) {
        if (props.anchor || props.tag || value) {
          if (value?.type === "block-seq")
            onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
          else
            onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
        } else {
          commentEnd = props.end;
          if (props.comment)
            seq2.comment = props.comment;
          continue;
        }
      }
      const node = value ? composeNode2(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
      if (ctx.schema.compat)
        utilFlowIndentCheck2.flowIndentCheck(bs.indent, value, onError);
      offset = node.range[2];
      seq2.items.push(node);
    }
    seq2.range = [bs.offset, offset, commentEnd ?? offset];
    return seq2;
  }
  resolveBlockSeq.resolveBlockSeq = resolveBlockSeq$1;
  return resolveBlockSeq;
}
var resolveFlowCollection = {};
var resolveEnd = {};
var hasRequiredResolveEnd;
function requireResolveEnd() {
  if (hasRequiredResolveEnd) return resolveEnd;
  hasRequiredResolveEnd = 1;
  function resolveEnd$1(end, offset, reqSpace, onError) {
    let comment = "";
    if (end) {
      let hasSpace = false;
      let sep2 = "";
      for (const token of end) {
        const { source, type } = token;
        switch (type) {
          case "space":
            hasSpace = true;
            break;
          case "comment": {
            if (reqSpace && !hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += sep2 + cb;
            sep2 = "";
            break;
          }
          case "newline":
            if (comment)
              sep2 += source;
            hasSpace = true;
            break;
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
        }
        offset += source.length;
      }
    }
    return { comment, offset };
  }
  resolveEnd.resolveEnd = resolveEnd$1;
  return resolveEnd;
}
var hasRequiredResolveFlowCollection;
function requireResolveFlowCollection() {
  if (hasRequiredResolveFlowCollection) return resolveFlowCollection;
  hasRequiredResolveFlowCollection = 1;
  var identity2 = requireIdentity();
  var Pair2 = requirePair();
  var YAMLMap2 = requireYAMLMap();
  var YAMLSeq2 = requireYAMLSeq();
  var resolveEnd2 = requireResolveEnd();
  var resolveProps2 = requireResolveProps();
  var utilContainsNewline2 = requireUtilContainsNewline();
  var utilMapIncludes2 = requireUtilMapIncludes();
  const blockMsg = "Block collections are not allowed within flow collections";
  const isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
  function resolveFlowCollection$1({ composeNode: composeNode2, composeEmptyNode }, ctx, fc, onError, tag) {
    const isMap = fc.start.source === "{";
    const fcName = isMap ? "flow map" : "flow sequence";
    const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap2.YAMLMap : YAMLSeq2.YAMLSeq);
    const coll = new NodeClass(ctx.schema);
    coll.flow = true;
    const atRoot = ctx.atRoot;
    if (atRoot)
      ctx.atRoot = false;
    if (ctx.atKey)
      ctx.atKey = false;
    let offset = fc.offset + fc.start.source.length;
    for (let i = 0; i < fc.items.length; ++i) {
      const collItem = fc.items[i];
      const { start, key, sep: sep2, value } = collItem;
      const props = resolveProps2.resolveProps(start, {
        flow: fcName,
        indicator: "explicit-key-ind",
        next: key ?? sep2?.[0],
        offset,
        onError,
        parentIndent: fc.indent,
        startOnNewline: false
      });
      if (!props.found) {
        if (!props.anchor && !props.tag && !sep2 && !value) {
          if (i === 0 && props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
          else if (i < fc.items.length - 1)
            onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
          if (props.comment) {
            if (coll.comment)
              coll.comment += "\n" + props.comment;
            else
              coll.comment = props.comment;
          }
          offset = props.end;
          continue;
        }
        if (!isMap && ctx.options.strict && utilContainsNewline2.containsNewline(key))
          onError(
            key,
            // checked by containsNewline()
            "MULTILINE_IMPLICIT_KEY",
            "Implicit keys of flow sequence pairs need to be on a single line"
          );
      }
      if (i === 0) {
        if (props.comma)
          onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
      } else {
        if (!props.comma)
          onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
        if (props.comment) {
          let prevItemComment = "";
          loop: for (const st of start) {
            switch (st.type) {
              case "comma":
              case "space":
                break;
              case "comment":
                prevItemComment = st.source.substring(1);
                break loop;
              default:
                break loop;
            }
          }
          if (prevItemComment) {
            let prev = coll.items[coll.items.length - 1];
            if (identity2.isPair(prev))
              prev = prev.value ?? prev.key;
            if (prev.comment)
              prev.comment += "\n" + prevItemComment;
            else
              prev.comment = prevItemComment;
            props.comment = props.comment.substring(prevItemComment.length + 1);
          }
        }
      }
      if (!isMap && !sep2 && !props.found) {
        const valueNode = value ? composeNode2(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep2, null, props, onError);
        coll.items.push(valueNode);
        offset = valueNode.range[2];
        if (isBlock(value))
          onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
      } else {
        ctx.atKey = true;
        const keyStart = props.end;
        const keyNode = key ? composeNode2(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
        if (isBlock(key))
          onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
        ctx.atKey = false;
        const valueProps = resolveProps2.resolveProps(sep2 ?? [], {
          flow: fcName,
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (valueProps.found) {
          if (!isMap && !props.found && ctx.options.strict) {
            if (sep2)
              for (const st of sep2) {
                if (st === valueProps.found)
                  break;
                if (st.type === "newline") {
                  onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                  break;
                }
              }
            if (props.start < valueProps.found.offset - 1024)
              onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
          }
        } else if (value) {
          if ("source" in value && value.source?.[0] === ":")
            onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
          else
            onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
        }
        const valueNode = value ? composeNode2(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep2, null, valueProps, onError) : null;
        if (valueNode) {
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else if (valueProps.comment) {
          if (keyNode.comment)
            keyNode.comment += "\n" + valueProps.comment;
          else
            keyNode.comment = valueProps.comment;
        }
        const pair = new Pair2.Pair(keyNode, valueNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        if (isMap) {
          const map2 = coll;
          if (utilMapIncludes2.mapIncludes(ctx, map2.items, keyNode))
            onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
          map2.items.push(pair);
        } else {
          const map2 = new YAMLMap2.YAMLMap(ctx.schema);
          map2.flow = true;
          map2.items.push(pair);
          const endRange = (valueNode ?? keyNode).range;
          map2.range = [keyNode.range[0], endRange[1], endRange[2]];
          coll.items.push(map2);
        }
        offset = valueNode ? valueNode.range[2] : valueProps.end;
      }
    }
    const expectedEnd = isMap ? "}" : "]";
    const [ce, ...ee] = fc.end;
    let cePos = offset;
    if (ce?.source === expectedEnd)
      cePos = ce.offset + ce.source.length;
    else {
      const name = fcName[0].toUpperCase() + fcName.substring(1);
      const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
      onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
      if (ce && ce.source.length !== 1)
        ee.unshift(ce);
    }
    if (ee.length > 0) {
      const end = resolveEnd2.resolveEnd(ee, cePos, ctx.options.strict, onError);
      if (end.comment) {
        if (coll.comment)
          coll.comment += "\n" + end.comment;
        else
          coll.comment = end.comment;
      }
      coll.range = [fc.offset, cePos, end.offset];
    } else {
      coll.range = [fc.offset, cePos, cePos];
    }
    return coll;
  }
  resolveFlowCollection.resolveFlowCollection = resolveFlowCollection$1;
  return resolveFlowCollection;
}
var hasRequiredComposeCollection;
function requireComposeCollection() {
  if (hasRequiredComposeCollection) return composeCollection;
  hasRequiredComposeCollection = 1;
  var identity2 = requireIdentity();
  var Scalar2 = requireScalar();
  var YAMLMap2 = requireYAMLMap();
  var YAMLSeq2 = requireYAMLSeq();
  var resolveBlockMap2 = requireResolveBlockMap();
  var resolveBlockSeq2 = requireResolveBlockSeq();
  var resolveFlowCollection2 = requireResolveFlowCollection();
  function resolveCollection(CN, ctx, token, onError, tagName, tag) {
    const coll = token.type === "block-map" ? resolveBlockMap2.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq2.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection2.resolveFlowCollection(CN, ctx, token, onError, tag);
    const Coll = coll.constructor;
    if (tagName === "!" || tagName === Coll.tagName) {
      coll.tag = Coll.tagName;
      return coll;
    }
    if (tagName)
      coll.tag = tagName;
    return coll;
  }
  function composeCollection$1(CN, ctx, token, props, onError) {
    const tagToken = props.tag;
    const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
    if (token.type === "block-seq") {
      const { anchor, newlineAfterProp: nl } = props;
      const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
      if (lastProp && (!nl || nl.offset < lastProp.offset)) {
        const message = "Missing newline after block sequence props";
        onError(lastProp, "MISSING_CHAR", message);
      }
    }
    const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
    if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap2.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq2.YAMLSeq.tagName && expType === "seq") {
      return resolveCollection(CN, ctx, token, onError, tagName);
    }
    let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
    if (!tag) {
      const kt = ctx.schema.knownTags[tagName];
      if (kt?.collection === expType) {
        ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
        tag = kt;
      } else {
        if (kt) {
          onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
        } else {
          onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
        }
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
    }
    const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
    const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
    const node = identity2.isNode(res) ? res : new Scalar2.Scalar(res);
    node.range = coll.range;
    node.tag = tagName;
    if (tag?.format)
      node.format = tag.format;
    return node;
  }
  composeCollection.composeCollection = composeCollection$1;
  return composeCollection;
}
var composeScalar = {};
var resolveBlockScalar = {};
var hasRequiredResolveBlockScalar;
function requireResolveBlockScalar() {
  if (hasRequiredResolveBlockScalar) return resolveBlockScalar;
  hasRequiredResolveBlockScalar = 1;
  var Scalar2 = requireScalar();
  function resolveBlockScalar$1(ctx, scalar, onError) {
    const start = scalar.offset;
    const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
    if (!header)
      return { value: "", type: null, comment: "", range: [start, start, start] };
    const type = header.mode === ">" ? Scalar2.Scalar.BLOCK_FOLDED : Scalar2.Scalar.BLOCK_LITERAL;
    const lines = scalar.source ? splitLines(scalar.source) : [];
    let chompStart = lines.length;
    for (let i = lines.length - 1; i >= 0; --i) {
      const content = lines[i][1];
      if (content === "" || content === "\r")
        chompStart = i;
      else
        break;
    }
    if (chompStart === 0) {
      const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
      let end2 = start + header.length;
      if (scalar.source)
        end2 += scalar.source.length;
      return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
    }
    let trimIndent = scalar.indent + header.indent;
    let offset = scalar.offset + header.length;
    let contentStart = 0;
    for (let i = 0; i < chompStart; ++i) {
      const [indent, content] = lines[i];
      if (content === "" || content === "\r") {
        if (header.indent === 0 && indent.length > trimIndent)
          trimIndent = indent.length;
      } else {
        if (indent.length < trimIndent) {
          const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
          onError(offset + indent.length, "MISSING_CHAR", message);
        }
        if (header.indent === 0)
          trimIndent = indent.length;
        contentStart = i;
        if (trimIndent === 0 && !ctx.atRoot) {
          const message = "Block scalar values in collections must be indented";
          onError(offset, "BAD_INDENT", message);
        }
        break;
      }
      offset += indent.length + content.length + 1;
    }
    for (let i = lines.length - 1; i >= chompStart; --i) {
      if (lines[i][0].length > trimIndent)
        chompStart = i + 1;
    }
    let value = "";
    let sep2 = "";
    let prevMoreIndented = false;
    for (let i = 0; i < contentStart; ++i)
      value += lines[i][0].slice(trimIndent) + "\n";
    for (let i = contentStart; i < chompStart; ++i) {
      let [indent, content] = lines[i];
      offset += indent.length + content.length + 1;
      const crlf = content[content.length - 1] === "\r";
      if (crlf)
        content = content.slice(0, -1);
      if (content && indent.length < trimIndent) {
        const src = header.indent ? "explicit indentation indicator" : "first line";
        const message = `Block scalar lines must not be less indented than their ${src}`;
        onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
        indent = "";
      }
      if (type === Scalar2.Scalar.BLOCK_LITERAL) {
        value += sep2 + indent.slice(trimIndent) + content;
        sep2 = "\n";
      } else if (indent.length > trimIndent || content[0] === "	") {
        if (sep2 === " ")
          sep2 = "\n";
        else if (!prevMoreIndented && sep2 === "\n")
          sep2 = "\n\n";
        value += sep2 + indent.slice(trimIndent) + content;
        sep2 = "\n";
        prevMoreIndented = true;
      } else if (content === "") {
        if (sep2 === "\n")
          value += "\n";
        else
          sep2 = "\n";
      } else {
        value += sep2 + content;
        sep2 = " ";
        prevMoreIndented = false;
      }
    }
    switch (header.chomp) {
      case "-":
        break;
      case "+":
        for (let i = chompStart; i < lines.length; ++i)
          value += "\n" + lines[i][0].slice(trimIndent);
        if (value[value.length - 1] !== "\n")
          value += "\n";
        break;
      default:
        value += "\n";
    }
    const end = start + header.length + scalar.source.length;
    return { value, type, comment: header.comment, range: [start, end, end] };
  }
  function parseBlockScalarHeader({ offset, props }, strict, onError) {
    if (props[0].type !== "block-scalar-header") {
      onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
      return null;
    }
    const { source } = props[0];
    const mode = source[0];
    let indent = 0;
    let chomp = "";
    let error = -1;
    for (let i = 1; i < source.length; ++i) {
      const ch = source[i];
      if (!chomp && (ch === "-" || ch === "+"))
        chomp = ch;
      else {
        const n = Number(ch);
        if (!indent && n)
          indent = n;
        else if (error === -1)
          error = offset + i;
      }
    }
    if (error !== -1)
      onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
    let hasSpace = false;
    let comment = "";
    let length = source.length;
    for (let i = 1; i < props.length; ++i) {
      const token = props[i];
      switch (token.type) {
        case "space":
          hasSpace = true;
        // fallthrough
        case "newline":
          length += token.source.length;
          break;
        case "comment":
          if (strict && !hasSpace) {
            const message = "Comments must be separated from other tokens by white space characters";
            onError(token, "MISSING_CHAR", message);
          }
          length += token.source.length;
          comment = token.source.substring(1);
          break;
        case "error":
          onError(token, "UNEXPECTED_TOKEN", token.message);
          length += token.source.length;
          break;
        /* istanbul ignore next should not happen */
        default: {
          const message = `Unexpected token in block scalar header: ${token.type}`;
          onError(token, "UNEXPECTED_TOKEN", message);
          const ts = token.source;
          if (ts && typeof ts === "string")
            length += ts.length;
        }
      }
    }
    return { mode, indent, chomp, comment, length };
  }
  function splitLines(source) {
    const split = source.split(/\n( *)/);
    const first = split[0];
    const m = first.match(/^( *)/);
    const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
    const lines = [line0];
    for (let i = 1; i < split.length; i += 2)
      lines.push([split[i], split[i + 1]]);
    return lines;
  }
  resolveBlockScalar.resolveBlockScalar = resolveBlockScalar$1;
  return resolveBlockScalar;
}
var resolveFlowScalar = {};
var hasRequiredResolveFlowScalar;
function requireResolveFlowScalar() {
  if (hasRequiredResolveFlowScalar) return resolveFlowScalar;
  hasRequiredResolveFlowScalar = 1;
  var Scalar2 = requireScalar();
  var resolveEnd2 = requireResolveEnd();
  function resolveFlowScalar$1(scalar, strict, onError) {
    const { offset, type, source, end } = scalar;
    let _type;
    let value;
    const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
    switch (type) {
      case "scalar":
        _type = Scalar2.Scalar.PLAIN;
        value = plainValue(source, _onError);
        break;
      case "single-quoted-scalar":
        _type = Scalar2.Scalar.QUOTE_SINGLE;
        value = singleQuotedValue(source, _onError);
        break;
      case "double-quoted-scalar":
        _type = Scalar2.Scalar.QUOTE_DOUBLE;
        value = doubleQuotedValue(source, _onError);
        break;
      /* istanbul ignore next should not happen */
      default:
        onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
        return {
          value: "",
          type: null,
          comment: "",
          range: [offset, offset + source.length, offset + source.length]
        };
    }
    const valueEnd = offset + source.length;
    const re = resolveEnd2.resolveEnd(end, valueEnd, strict, onError);
    return {
      value,
      type: _type,
      comment: re.comment,
      range: [offset, valueEnd, re.offset]
    };
  }
  function plainValue(source, onError) {
    let badChar = "";
    switch (source[0]) {
      /* istanbul ignore next should not happen */
      case "	":
        badChar = "a tab character";
        break;
      case ",":
        badChar = "flow indicator character ,";
        break;
      case "%":
        badChar = "directive indicator character %";
        break;
      case "|":
      case ">": {
        badChar = `block scalar indicator ${source[0]}`;
        break;
      }
      case "@":
      case "`": {
        badChar = `reserved character ${source[0]}`;
        break;
      }
    }
    if (badChar)
      onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
    return foldLines(source);
  }
  function singleQuotedValue(source, onError) {
    if (source[source.length - 1] !== "'" || source.length === 1)
      onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
    return foldLines(source.slice(1, -1)).replace(/''/g, "'");
  }
  function foldLines(source) {
    let first, line;
    try {
      first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
      line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
    } catch {
      first = /(.*?)[ \t]*\r?\n/sy;
      line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
    }
    let match = first.exec(source);
    if (!match)
      return source;
    let res = match[1];
    let sep2 = " ";
    let pos = first.lastIndex;
    line.lastIndex = pos;
    while (match = line.exec(source)) {
      if (match[1] === "") {
        if (sep2 === "\n")
          res += sep2;
        else
          sep2 = "\n";
      } else {
        res += sep2 + match[1];
        sep2 = " ";
      }
      pos = line.lastIndex;
    }
    const last = /[ \t]*(.*)/sy;
    last.lastIndex = pos;
    match = last.exec(source);
    return res + sep2 + (match?.[1] ?? "");
  }
  function doubleQuotedValue(source, onError) {
    let res = "";
    for (let i = 1; i < source.length - 1; ++i) {
      const ch = source[i];
      if (ch === "\r" && source[i + 1] === "\n")
        continue;
      if (ch === "\n") {
        const { fold, offset } = foldNewline(source, i);
        res += fold;
        i = offset;
      } else if (ch === "\\") {
        let next = source[++i];
        const cc = escapeCodes[next];
        if (cc)
          res += cc;
        else if (next === "\n") {
          next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
        } else if (next === "\r" && source[i + 1] === "\n") {
          next = source[++i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
        } else if (next === "x" || next === "u" || next === "U") {
          const length = next === "x" ? 2 : next === "u" ? 4 : 8;
          res += parseCharCode(source, i + 1, length, onError);
          i += length;
        } else {
          const raw = source.substr(i - 1, 2);
          onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
          res += raw;
        }
      } else if (ch === " " || ch === "	") {
        const wsStart = i;
        let next = source[i + 1];
        while (next === " " || next === "	")
          next = source[++i + 1];
        if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
          res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
      } else {
        res += ch;
      }
    }
    if (source[source.length - 1] !== '"' || source.length === 1)
      onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
    return res;
  }
  function foldNewline(source, offset) {
    let fold = "";
    let ch = source[offset + 1];
    while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[offset + 2] !== "\n")
        break;
      if (ch === "\n")
        fold += "\n";
      offset += 1;
      ch = source[offset + 1];
    }
    if (!fold)
      fold = " ";
    return { fold, offset };
  }
  const escapeCodes = {
    "0": "\0",
    // null character
    a: "\x07",
    // bell character
    b: "\b",
    // backspace
    e: "\x1B",
    // escape character
    f: "\f",
    // form feed
    n: "\n",
    // line feed
    r: "\r",
    // carriage return
    t: "	",
    // horizontal tab
    v: "\v",
    // vertical tab
    N: "",
    // Unicode next line
    _: " ",
    // Unicode non-breaking space
    L: "\u2028",
    // Unicode line separator
    P: "\u2029",
    // Unicode paragraph separator
    " ": " ",
    '"': '"',
    "/": "/",
    "\\": "\\",
    "	": "	"
  };
  function parseCharCode(source, offset, length, onError) {
    const cc = source.substr(offset, length);
    const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
    const code = ok ? parseInt(cc, 16) : NaN;
    try {
      return String.fromCodePoint(code);
    } catch {
      const raw = source.substr(offset - 2, length + 2);
      onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
      return raw;
    }
  }
  resolveFlowScalar.resolveFlowScalar = resolveFlowScalar$1;
  return resolveFlowScalar;
}
var hasRequiredComposeScalar;
function requireComposeScalar() {
  if (hasRequiredComposeScalar) return composeScalar;
  hasRequiredComposeScalar = 1;
  var identity2 = requireIdentity();
  var Scalar2 = requireScalar();
  var resolveBlockScalar2 = requireResolveBlockScalar();
  var resolveFlowScalar2 = requireResolveFlowScalar();
  function composeScalar$1(ctx, token, tagToken, onError) {
    const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar2.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar2.resolveFlowScalar(token, ctx.options.strict, onError);
    const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
    let tag;
    if (ctx.options.stringKeys && ctx.atKey) {
      tag = ctx.schema[identity2.SCALAR];
    } else if (tagName)
      tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
    else if (token.type === "scalar")
      tag = findScalarTagByTest(ctx, value, token, onError);
    else
      tag = ctx.schema[identity2.SCALAR];
    let scalar;
    try {
      const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
      scalar = identity2.isScalar(res) ? res : new Scalar2.Scalar(res);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
      scalar = new Scalar2.Scalar(value);
    }
    scalar.range = range;
    scalar.source = value;
    if (type)
      scalar.type = type;
    if (tagName)
      scalar.tag = tagName;
    if (tag.format)
      scalar.format = tag.format;
    if (comment)
      scalar.comment = comment;
    return scalar;
  }
  function findScalarTagByName(schema2, value, tagName, tagToken, onError) {
    if (tagName === "!")
      return schema2[identity2.SCALAR];
    const matchWithTest = [];
    for (const tag of schema2.tags) {
      if (!tag.collection && tag.tag === tagName) {
        if (tag.default && tag.test)
          matchWithTest.push(tag);
        else
          return tag;
      }
    }
    for (const tag of matchWithTest)
      if (tag.test?.test(value))
        return tag;
    const kt = schema2.knownTags[tagName];
    if (kt && !kt.collection) {
      schema2.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
      return kt;
    }
    onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
    return schema2[identity2.SCALAR];
  }
  function findScalarTagByTest({ atKey, directives: directives2, schema: schema2 }, value, token, onError) {
    const tag = schema2.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema2[identity2.SCALAR];
    if (schema2.compat) {
      const compat = schema2.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema2[identity2.SCALAR];
      if (tag.tag !== compat.tag) {
        const ts = directives2.tagString(tag.tag);
        const cs = directives2.tagString(compat.tag);
        const msg = `Value may be parsed as either ${ts} or ${cs}`;
        onError(token, "TAG_RESOLVE_FAILED", msg, true);
      }
    }
    return tag;
  }
  composeScalar.composeScalar = composeScalar$1;
  return composeScalar;
}
var utilEmptyScalarPosition = {};
var hasRequiredUtilEmptyScalarPosition;
function requireUtilEmptyScalarPosition() {
  if (hasRequiredUtilEmptyScalarPosition) return utilEmptyScalarPosition;
  hasRequiredUtilEmptyScalarPosition = 1;
  function emptyScalarPosition(offset, before, pos) {
    if (before) {
      pos ?? (pos = before.length);
      for (let i = pos - 1; i >= 0; --i) {
        let st = before[i];
        switch (st.type) {
          case "space":
          case "comment":
          case "newline":
            offset -= st.source.length;
            continue;
        }
        st = before[++i];
        while (st?.type === "space") {
          offset += st.source.length;
          st = before[++i];
        }
        break;
      }
    }
    return offset;
  }
  utilEmptyScalarPosition.emptyScalarPosition = emptyScalarPosition;
  return utilEmptyScalarPosition;
}
var hasRequiredComposeNode;
function requireComposeNode() {
  if (hasRequiredComposeNode) return composeNode;
  hasRequiredComposeNode = 1;
  var Alias2 = requireAlias();
  var identity2 = requireIdentity();
  var composeCollection2 = requireComposeCollection();
  var composeScalar2 = requireComposeScalar();
  var resolveEnd2 = requireResolveEnd();
  var utilEmptyScalarPosition2 = requireUtilEmptyScalarPosition();
  const CN = { composeNode: composeNode$1, composeEmptyNode };
  function composeNode$1(ctx, token, props, onError) {
    const atKey = ctx.atKey;
    const { spaceBefore, comment, anchor, tag } = props;
    let node;
    let isSrcToken = true;
    switch (token.type) {
      case "alias":
        node = composeAlias(ctx, token, onError);
        if (anchor || tag)
          onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
        break;
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
      case "block-scalar":
        node = composeScalar2.composeScalar(ctx, token, tag, onError);
        if (anchor)
          node.anchor = anchor.source.substring(1);
        break;
      case "block-map":
      case "block-seq":
      case "flow-collection":
        try {
          node = composeCollection2.composeCollection(CN, ctx, token, props, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          onError(token, "RESOURCE_EXHAUSTION", message);
        }
        break;
      default: {
        const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
        onError(token, "UNEXPECTED_TOKEN", message);
        isSrcToken = false;
      }
    }
    node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
    if (anchor && node.anchor === "")
      onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
    if (atKey && ctx.options.stringKeys && (!identity2.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
      const msg = "With stringKeys, all keys must be strings";
      onError(tag ?? token, "NON_STRING_KEY", msg);
    }
    if (spaceBefore)
      node.spaceBefore = true;
    if (comment) {
      if (token.type === "scalar" && token.source === "")
        node.comment = comment;
      else
        node.commentBefore = comment;
    }
    if (ctx.options.keepSourceTokens && isSrcToken)
      node.srcToken = token;
    return node;
  }
  function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
    const token = {
      type: "scalar",
      offset: utilEmptyScalarPosition2.emptyScalarPosition(offset, before, pos),
      indent: -1,
      source: ""
    };
    const node = composeScalar2.composeScalar(ctx, token, tag, onError);
    if (anchor) {
      node.anchor = anchor.source.substring(1);
      if (node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
    }
    if (spaceBefore)
      node.spaceBefore = true;
    if (comment) {
      node.comment = comment;
      node.range[2] = end;
    }
    return node;
  }
  function composeAlias({ options }, { offset, source, end }, onError) {
    const alias = new Alias2.Alias(source.substring(1));
    if (alias.source === "")
      onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
    if (alias.source.endsWith(":"))
      onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
    const valueEnd = offset + source.length;
    const re = resolveEnd2.resolveEnd(end, valueEnd, options.strict, onError);
    alias.range = [offset, valueEnd, re.offset];
    if (re.comment)
      alias.comment = re.comment;
    return alias;
  }
  composeNode.composeEmptyNode = composeEmptyNode;
  composeNode.composeNode = composeNode$1;
  return composeNode;
}
var hasRequiredComposeDoc;
function requireComposeDoc() {
  if (hasRequiredComposeDoc) return composeDoc;
  hasRequiredComposeDoc = 1;
  var Document2 = requireDocument();
  var composeNode2 = requireComposeNode();
  var resolveEnd2 = requireResolveEnd();
  var resolveProps2 = requireResolveProps();
  function composeDoc$1(options, directives2, { offset, start, value, end }, onError) {
    const opts = Object.assign({ _directives: directives2 }, options);
    const doc = new Document2.Document(void 0, opts);
    const ctx = {
      atKey: false,
      atRoot: true,
      directives: doc.directives,
      options: doc.options,
      schema: doc.schema
    };
    const props = resolveProps2.resolveProps(start, {
      indicator: "doc-start",
      next: value ?? end?.[0],
      offset,
      onError,
      parentIndent: 0,
      startOnNewline: true
    });
    if (props.found) {
      doc.directives.docStart = true;
      if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
        onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
    }
    doc.contents = value ? composeNode2.composeNode(ctx, value, props, onError) : composeNode2.composeEmptyNode(ctx, props.end, start, null, props, onError);
    const contentEnd = doc.contents.range[2];
    const re = resolveEnd2.resolveEnd(end, contentEnd, false, onError);
    if (re.comment)
      doc.comment = re.comment;
    doc.range = [offset, contentEnd, re.offset];
    return doc;
  }
  composeDoc.composeDoc = composeDoc$1;
  return composeDoc;
}
var hasRequiredComposer;
function requireComposer() {
  if (hasRequiredComposer) return composer;
  hasRequiredComposer = 1;
  var node_process = require$$0;
  var directives2 = requireDirectives();
  var Document2 = requireDocument();
  var errors2 = requireErrors();
  var identity2 = requireIdentity();
  var composeDoc2 = requireComposeDoc();
  var resolveEnd2 = requireResolveEnd();
  function getErrorPos(src) {
    if (typeof src === "number")
      return [src, src + 1];
    if (Array.isArray(src))
      return src.length === 2 ? src : [src[0], src[1]];
    const { offset, source } = src;
    return [offset, offset + (typeof source === "string" ? source.length : 1)];
  }
  function parsePrelude(prelude) {
    let comment = "";
    let atComment = false;
    let afterEmptyLine = false;
    for (let i = 0; i < prelude.length; ++i) {
      const source = prelude[i];
      switch (source[0]) {
        case "#":
          comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
          atComment = true;
          afterEmptyLine = false;
          break;
        case "%":
          if (prelude[i + 1]?.[0] !== "#")
            i += 1;
          atComment = false;
          break;
        default:
          if (!atComment)
            afterEmptyLine = true;
          atComment = false;
      }
    }
    return { comment, afterEmptyLine };
  }
  class Composer {
    constructor(options = {}) {
      this.doc = null;
      this.atDirectives = false;
      this.prelude = [];
      this.errors = [];
      this.warnings = [];
      this.onError = (source, code, message, warning) => {
        const pos = getErrorPos(source);
        if (warning)
          this.warnings.push(new errors2.YAMLWarning(pos, code, message));
        else
          this.errors.push(new errors2.YAMLParseError(pos, code, message));
      };
      this.directives = new directives2.Directives({ version: options.version || "1.2" });
      this.options = options;
    }
    decorate(doc, afterDoc) {
      const { comment, afterEmptyLine } = parsePrelude(this.prelude);
      if (comment) {
        const dc = doc.contents;
        if (afterDoc) {
          doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
        } else if (afterEmptyLine || doc.directives.docStart || !dc) {
          doc.commentBefore = comment;
        } else if (identity2.isCollection(dc) && !dc.flow && dc.items.length > 0) {
          let it = dc.items[0];
          if (identity2.isPair(it))
            it = it.key;
          const cb = it.commentBefore;
          it.commentBefore = cb ? `${comment}
${cb}` : comment;
        } else {
          const cb = dc.commentBefore;
          dc.commentBefore = cb ? `${comment}
${cb}` : comment;
        }
      }
      if (afterDoc) {
        for (let i = 0; i < this.errors.length; ++i)
          doc.errors.push(this.errors[i]);
        for (let i = 0; i < this.warnings.length; ++i)
          doc.warnings.push(this.warnings[i]);
      } else {
        doc.errors = this.errors;
        doc.warnings = this.warnings;
      }
      this.prelude = [];
      this.errors = [];
      this.warnings = [];
    }
    /**
     * Current stream status information.
     *
     * Mostly useful at the end of input for an empty stream.
     */
    streamInfo() {
      return {
        comment: parsePrelude(this.prelude).comment,
        directives: this.directives,
        errors: this.errors,
        warnings: this.warnings
      };
    }
    /**
     * Compose tokens into documents.
     *
     * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
     * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
     */
    *compose(tokens, forceDoc = false, endOffset = -1) {
      for (const token of tokens)
        yield* this.next(token);
      yield* this.end(forceDoc, endOffset);
    }
    /** Advance the composer by one CST token. */
    *next(token) {
      if (node_process.env.LOG_STREAM)
        console.dir(token, { depth: null });
      switch (token.type) {
        case "directive":
          this.directives.add(token.source, (offset, message, warning) => {
            const pos = getErrorPos(token);
            pos[0] += offset;
            this.onError(pos, "BAD_DIRECTIVE", message, warning);
          });
          this.prelude.push(token.source);
          this.atDirectives = true;
          break;
        case "document": {
          const doc = composeDoc2.composeDoc(this.options, this.directives, token, this.onError);
          if (this.atDirectives && !doc.directives.docStart)
            this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
          this.decorate(doc, false);
          if (this.doc)
            yield this.doc;
          this.doc = doc;
          this.atDirectives = false;
          break;
        }
        case "byte-order-mark":
        case "space":
          break;
        case "comment":
        case "newline":
          this.prelude.push(token.source);
          break;
        case "error": {
          const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
          const error = new errors2.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
          if (this.atDirectives || !this.doc)
            this.errors.push(error);
          else
            this.doc.errors.push(error);
          break;
        }
        case "doc-end": {
          if (!this.doc) {
            const msg = "Unexpected doc-end without preceding document";
            this.errors.push(new errors2.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
            break;
          }
          this.doc.directives.docEnd = true;
          const end = resolveEnd2.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
          this.decorate(this.doc, true);
          if (end.comment) {
            const dc = this.doc.comment;
            this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
          }
          this.doc.range[2] = end.offset;
          break;
        }
        default:
          this.errors.push(new errors2.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
      }
    }
    /**
     * Call at end of input to yield any remaining document.
     *
     * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
     * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
     */
    *end(forceDoc = false, endOffset = -1) {
      if (this.doc) {
        this.decorate(this.doc, true);
        yield this.doc;
        this.doc = null;
      } else if (forceDoc) {
        const opts = Object.assign({ _directives: this.directives }, this.options);
        const doc = new Document2.Document(void 0, opts);
        if (this.atDirectives)
          this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
        doc.range = [0, endOffset, endOffset];
        this.decorate(doc, false);
        yield doc;
      }
    }
  }
  composer.Composer = Composer;
  return composer;
}
var cst = {};
var cstScalar = {};
var hasRequiredCstScalar;
function requireCstScalar() {
  if (hasRequiredCstScalar) return cstScalar;
  hasRequiredCstScalar = 1;
  var resolveBlockScalar2 = requireResolveBlockScalar();
  var resolveFlowScalar2 = requireResolveFlowScalar();
  var errors2 = requireErrors();
  var stringifyString2 = requireStringifyString();
  function resolveAsScalar(token, strict = true, onError) {
    if (token) {
      const _onError = (pos, code, message) => {
        const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
        if (onError)
          onError(offset, code, message);
        else
          throw new errors2.YAMLParseError([offset, offset + 1], code, message);
      };
      switch (token.type) {
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return resolveFlowScalar2.resolveFlowScalar(token, strict, _onError);
        case "block-scalar":
          return resolveBlockScalar2.resolveBlockScalar({ options: { strict } }, token, _onError);
      }
    }
    return null;
  }
  function createScalarToken(value, context) {
    const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
    const source = stringifyString2.stringifyString({ type, value }, {
      implicitKey,
      indent: indent > 0 ? " ".repeat(indent) : "",
      inFlow,
      options: { blockQuote: true, lineWidth: -1 }
    });
    const end = context.end ?? [
      { type: "newline", offset: -1, indent, source: "\n" }
    ];
    switch (source[0]) {
      case "|":
      case ">": {
        const he = source.indexOf("\n");
        const head = source.substring(0, he);
        const body = source.substring(he + 1) + "\n";
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, end))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        return { type: "block-scalar", offset, indent, props, source: body };
      }
      case '"':
        return { type: "double-quoted-scalar", offset, indent, source, end };
      case "'":
        return { type: "single-quoted-scalar", offset, indent, source, end };
      default:
        return { type: "scalar", offset, indent, source, end };
    }
  }
  function setScalarValue(token, value, context = {}) {
    let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
    let indent = "indent" in token ? token.indent : null;
    if (afterKey && typeof indent === "number")
      indent += 2;
    if (!type)
      switch (token.type) {
        case "single-quoted-scalar":
          type = "QUOTE_SINGLE";
          break;
        case "double-quoted-scalar":
          type = "QUOTE_DOUBLE";
          break;
        case "block-scalar": {
          const header = token.props[0];
          if (header.type !== "block-scalar-header")
            throw new Error("Invalid block scalar header");
          type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
          break;
        }
        default:
          type = "PLAIN";
      }
    const source = stringifyString2.stringifyString({ type, value }, {
      implicitKey: implicitKey || indent === null,
      indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
      inFlow,
      options: { blockQuote: true, lineWidth: -1 }
    });
    switch (source[0]) {
      case "|":
      case ">":
        setBlockScalarValue(token, source);
        break;
      case '"':
        setFlowScalarValue(token, source, "double-quoted-scalar");
        break;
      case "'":
        setFlowScalarValue(token, source, "single-quoted-scalar");
        break;
      default:
        setFlowScalarValue(token, source, "scalar");
    }
  }
  function setBlockScalarValue(token, source) {
    const he = source.indexOf("\n");
    const head = source.substring(0, he);
    const body = source.substring(he + 1) + "\n";
    if (token.type === "block-scalar") {
      const header = token.props[0];
      if (header.type !== "block-scalar-header")
        throw new Error("Invalid block scalar header");
      header.source = head;
      token.source = body;
    } else {
      const { offset } = token;
      const indent = "indent" in token ? token.indent : -1;
      const props = [
        { type: "block-scalar-header", offset, indent, source: head }
      ];
      if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
        props.push({ type: "newline", offset: -1, indent, source: "\n" });
      for (const key of Object.keys(token))
        if (key !== "type" && key !== "offset")
          delete token[key];
      Object.assign(token, { type: "block-scalar", indent, props, source: body });
    }
  }
  function addEndtoBlockProps(props, end) {
    if (end)
      for (const st of end)
        switch (st.type) {
          case "space":
          case "comment":
            props.push(st);
            break;
          case "newline":
            props.push(st);
            return true;
        }
    return false;
  }
  function setFlowScalarValue(token, source, type) {
    switch (token.type) {
      case "scalar":
      case "double-quoted-scalar":
      case "single-quoted-scalar":
        token.type = type;
        token.source = source;
        break;
      case "block-scalar": {
        const end = token.props.slice(1);
        let oa = source.length;
        if (token.props[0].type === "block-scalar-header")
          oa -= token.props[0].source.length;
        for (const tok of end)
          tok.offset += oa;
        delete token.props;
        Object.assign(token, { type, source, end });
        break;
      }
      case "block-map":
      case "block-seq": {
        const offset = token.offset + source.length;
        const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
        delete token.items;
        Object.assign(token, { type, source, end: [nl] });
        break;
      }
      default: {
        const indent = "indent" in token ? token.indent : -1;
        const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type, indent, source, end });
      }
    }
  }
  cstScalar.createScalarToken = createScalarToken;
  cstScalar.resolveAsScalar = resolveAsScalar;
  cstScalar.setScalarValue = setScalarValue;
  return cstScalar;
}
var cstStringify = {};
var hasRequiredCstStringify;
function requireCstStringify() {
  if (hasRequiredCstStringify) return cstStringify;
  hasRequiredCstStringify = 1;
  const stringify2 = (cst2) => "type" in cst2 ? stringifyToken(cst2) : stringifyItem(cst2);
  function stringifyToken(token) {
    switch (token.type) {
      case "block-scalar": {
        let res = "";
        for (const tok of token.props)
          res += stringifyToken(tok);
        return res + token.source;
      }
      case "block-map":
      case "block-seq": {
        let res = "";
        for (const item of token.items)
          res += stringifyItem(item);
        return res;
      }
      case "flow-collection": {
        let res = token.start.source;
        for (const item of token.items)
          res += stringifyItem(item);
        for (const st of token.end)
          res += st.source;
        return res;
      }
      case "document": {
        let res = stringifyItem(token);
        if (token.end)
          for (const st of token.end)
            res += st.source;
        return res;
      }
      default: {
        let res = token.source;
        if ("end" in token && token.end)
          for (const st of token.end)
            res += st.source;
        return res;
      }
    }
  }
  function stringifyItem({ start, key, sep: sep2, value }) {
    let res = "";
    for (const st of start)
      res += st.source;
    if (key)
      res += stringifyToken(key);
    if (sep2)
      for (const st of sep2)
        res += st.source;
    if (value)
      res += stringifyToken(value);
    return res;
  }
  cstStringify.stringify = stringify2;
  return cstStringify;
}
var cstVisit = {};
var hasRequiredCstVisit;
function requireCstVisit() {
  if (hasRequiredCstVisit) return cstVisit;
  hasRequiredCstVisit = 1;
  const BREAK = /* @__PURE__ */ Symbol("break visit");
  const SKIP = /* @__PURE__ */ Symbol("skip children");
  const REMOVE = /* @__PURE__ */ Symbol("remove item");
  function visit2(cst2, visitor) {
    if ("type" in cst2 && cst2.type === "document")
      cst2 = { start: cst2.start, value: cst2.value };
    _visit(Object.freeze([]), cst2, visitor);
  }
  visit2.BREAK = BREAK;
  visit2.SKIP = SKIP;
  visit2.REMOVE = REMOVE;
  visit2.itemAtPath = (cst2, path) => {
    let item = cst2;
    for (const [field, index] of path) {
      const tok = item?.[field];
      if (tok && "items" in tok) {
        item = tok.items[index];
      } else
        return void 0;
    }
    return item;
  };
  visit2.parentCollection = (cst2, path) => {
    const parent = visit2.itemAtPath(cst2, path.slice(0, -1));
    const field = path[path.length - 1][0];
    const coll = parent?.[field];
    if (coll && "items" in coll)
      return coll;
    throw new Error("Parent collection not found");
  };
  function _visit(path, item, visitor) {
    let ctrl = visitor(item, path);
    if (typeof ctrl === "symbol")
      return ctrl;
    for (const field of ["key", "value"]) {
      const token = item[field];
      if (token && "items" in token) {
        for (let i = 0; i < token.items.length; ++i) {
          const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            token.items.splice(i, 1);
            i -= 1;
          }
        }
        if (typeof ctrl === "function" && field === "key")
          ctrl = ctrl(item, path);
      }
    }
    return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
  }
  cstVisit.visit = visit2;
  return cstVisit;
}
var hasRequiredCst;
function requireCst() {
  if (hasRequiredCst) return cst;
  hasRequiredCst = 1;
  var cstScalar2 = requireCstScalar();
  var cstStringify2 = requireCstStringify();
  var cstVisit2 = requireCstVisit();
  const BOM = "\uFEFF";
  const DOCUMENT = "";
  const FLOW_END = "";
  const SCALAR = "";
  const isCollection = (token) => !!token && "items" in token;
  const isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
  function prettyToken(token) {
    switch (token) {
      case BOM:
        return "<BOM>";
      case DOCUMENT:
        return "<DOC>";
      case FLOW_END:
        return "<FLOW_END>";
      case SCALAR:
        return "<SCALAR>";
      default:
        return JSON.stringify(token);
    }
  }
  function tokenType(source) {
    switch (source) {
      case BOM:
        return "byte-order-mark";
      case DOCUMENT:
        return "doc-mode";
      case FLOW_END:
        return "flow-error-end";
      case SCALAR:
        return "scalar";
      case "---":
        return "doc-start";
      case "...":
        return "doc-end";
      case "":
      case "\n":
      case "\r\n":
        return "newline";
      case "-":
        return "seq-item-ind";
      case "?":
        return "explicit-key-ind";
      case ":":
        return "map-value-ind";
      case "{":
        return "flow-map-start";
      case "}":
        return "flow-map-end";
      case "[":
        return "flow-seq-start";
      case "]":
        return "flow-seq-end";
      case ",":
        return "comma";
    }
    switch (source[0]) {
      case " ":
      case "	":
        return "space";
      case "#":
        return "comment";
      case "%":
        return "directive-line";
      case "*":
        return "alias";
      case "&":
        return "anchor";
      case "!":
        return "tag";
      case "'":
        return "single-quoted-scalar";
      case '"':
        return "double-quoted-scalar";
      case "|":
      case ">":
        return "block-scalar-header";
    }
    return null;
  }
  cst.createScalarToken = cstScalar2.createScalarToken;
  cst.resolveAsScalar = cstScalar2.resolveAsScalar;
  cst.setScalarValue = cstScalar2.setScalarValue;
  cst.stringify = cstStringify2.stringify;
  cst.visit = cstVisit2.visit;
  cst.BOM = BOM;
  cst.DOCUMENT = DOCUMENT;
  cst.FLOW_END = FLOW_END;
  cst.SCALAR = SCALAR;
  cst.isCollection = isCollection;
  cst.isScalar = isScalar;
  cst.prettyToken = prettyToken;
  cst.tokenType = tokenType;
  return cst;
}
var lexer = {};
var hasRequiredLexer;
function requireLexer() {
  if (hasRequiredLexer) return lexer;
  hasRequiredLexer = 1;
  var cst2 = requireCst();
  function isEmpty(ch) {
    switch (ch) {
      case void 0:
      case " ":
      case "\n":
      case "\r":
      case "	":
        return true;
      default:
        return false;
    }
  }
  const hexDigits = new Set("0123456789ABCDEFabcdef");
  const tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
  const flowIndicatorChars = new Set(",[]{}");
  const invalidAnchorChars = new Set(" ,[]{}\n\r	");
  const isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
  class Lexer {
    constructor() {
      this.atEnd = false;
      this.blockScalarIndent = -1;
      this.blockScalarKeep = false;
      this.buffer = "";
      this.flowKey = false;
      this.flowLevel = 0;
      this.indentNext = 0;
      this.indentValue = 0;
      this.lineEndPos = null;
      this.next = null;
      this.pos = 0;
    }
    /**
     * Generate YAML tokens from the `source` string. If `incomplete`,
     * a part of the last line may be left as a buffer for the next call.
     *
     * @returns A generator of lexical tokens
     */
    *lex(source, incomplete = false) {
      if (source) {
        if (typeof source !== "string")
          throw TypeError("source is not a string");
        this.buffer = this.buffer ? this.buffer + source : source;
        this.lineEndPos = null;
      }
      this.atEnd = !incomplete;
      let next = this.next ?? "stream";
      while (next && (incomplete || this.hasChars(1)))
        next = yield* this.parseNext(next);
    }
    atLineEnd() {
      let i = this.pos;
      let ch = this.buffer[i];
      while (ch === " " || ch === "	")
        ch = this.buffer[++i];
      if (!ch || ch === "#" || ch === "\n")
        return true;
      if (ch === "\r")
        return this.buffer[i + 1] === "\n";
      return false;
    }
    charAt(n) {
      return this.buffer[this.pos + n];
    }
    continueScalar(offset) {
      let ch = this.buffer[offset];
      if (this.indentNext > 0) {
        let indent = 0;
        while (ch === " ")
          ch = this.buffer[++indent + offset];
        if (ch === "\r") {
          const next = this.buffer[indent + offset + 1];
          if (next === "\n" || !next && !this.atEnd)
            return offset + indent + 1;
        }
        return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
      }
      if (ch === "-" || ch === ".") {
        const dt = this.buffer.substr(offset, 3);
        if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
          return -1;
      }
      return offset;
    }
    getLine() {
      let end = this.lineEndPos;
      if (typeof end !== "number" || end !== -1 && end < this.pos) {
        end = this.buffer.indexOf("\n", this.pos);
        this.lineEndPos = end;
      }
      if (end === -1)
        return this.atEnd ? this.buffer.substring(this.pos) : null;
      if (this.buffer[end - 1] === "\r")
        end -= 1;
      return this.buffer.substring(this.pos, end);
    }
    hasChars(n) {
      return this.pos + n <= this.buffer.length;
    }
    setNext(state) {
      this.buffer = this.buffer.substring(this.pos);
      this.pos = 0;
      this.lineEndPos = null;
      this.next = state;
      return null;
    }
    peek(n) {
      return this.buffer.substr(this.pos, n);
    }
    *parseNext(next) {
      switch (next) {
        case "stream":
          return yield* this.parseStream();
        case "line-start":
          return yield* this.parseLineStart();
        case "block-start":
          return yield* this.parseBlockStart();
        case "doc":
          return yield* this.parseDocument();
        case "flow":
          return yield* this.parseFlowCollection();
        case "quoted-scalar":
          return yield* this.parseQuotedScalar();
        case "block-scalar":
          return yield* this.parseBlockScalar();
        case "plain-scalar":
          return yield* this.parsePlainScalar();
      }
    }
    *parseStream() {
      let line = this.getLine();
      if (line === null)
        return this.setNext("stream");
      if (line[0] === cst2.BOM) {
        yield* this.pushCount(1);
        line = line.substring(1);
      }
      if (line[0] === "%") {
        let dirEnd = line.length;
        let cs = line.indexOf("#");
        while (cs !== -1) {
          const ch = line[cs - 1];
          if (ch === " " || ch === "	") {
            dirEnd = cs - 1;
            break;
          } else {
            cs = line.indexOf("#", cs + 1);
          }
        }
        while (true) {
          const ch = line[dirEnd - 1];
          if (ch === " " || ch === "	")
            dirEnd -= 1;
          else
            break;
        }
        const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
        yield* this.pushCount(line.length - n);
        this.pushNewline();
        return "stream";
      }
      if (this.atLineEnd()) {
        const sp = yield* this.pushSpaces(true);
        yield* this.pushCount(line.length - sp);
        yield* this.pushNewline();
        return "stream";
      }
      yield cst2.DOCUMENT;
      return yield* this.parseLineStart();
    }
    *parseLineStart() {
      const ch = this.charAt(0);
      if (!ch && !this.atEnd)
        return this.setNext("line-start");
      if (ch === "-" || ch === ".") {
        if (!this.atEnd && !this.hasChars(4))
          return this.setNext("line-start");
        const s = this.peek(3);
        if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
          yield* this.pushCount(3);
          this.indentValue = 0;
          this.indentNext = 0;
          return s === "---" ? "doc" : "stream";
        }
      }
      this.indentValue = yield* this.pushSpaces(false);
      if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
        this.indentNext = this.indentValue;
      return yield* this.parseBlockStart();
    }
    *parseBlockStart() {
      const [ch0, ch1] = this.peek(2);
      if (!ch1 && !this.atEnd)
        return this.setNext("block-start");
      if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
        const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
        this.indentNext = this.indentValue + 1;
        this.indentValue += n;
        return "block-start";
      }
      return "doc";
    }
    *parseDocument() {
      yield* this.pushSpaces(true);
      const line = this.getLine();
      if (line === null)
        return this.setNext("doc");
      let n = yield* this.pushIndicators();
      switch (line[n]) {
        case "#":
          yield* this.pushCount(line.length - n);
        // fallthrough
        case void 0:
          yield* this.pushNewline();
          return yield* this.parseLineStart();
        case "{":
        case "[":
          yield* this.pushCount(1);
          this.flowKey = false;
          this.flowLevel = 1;
          return "flow";
        case "}":
        case "]":
          yield* this.pushCount(1);
          return "doc";
        case "*":
          yield* this.pushUntil(isNotAnchorChar);
          return "doc";
        case '"':
        case "'":
          return yield* this.parseQuotedScalar();
        case "|":
        case ">":
          n += yield* this.parseBlockScalarHeader();
          n += yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - n);
          yield* this.pushNewline();
          return yield* this.parseBlockScalar();
        default:
          return yield* this.parsePlainScalar();
      }
    }
    *parseFlowCollection() {
      let nl, sp;
      let indent = -1;
      do {
        nl = yield* this.pushNewline();
        if (nl > 0) {
          sp = yield* this.pushSpaces(false);
          this.indentValue = indent = sp;
        } else {
          sp = 0;
        }
        sp += yield* this.pushSpaces(true);
      } while (nl + sp > 0);
      const line = this.getLine();
      if (line === null)
        return this.setNext("flow");
      if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
        const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
        if (!atFlowEndMarker) {
          this.flowLevel = 0;
          yield cst2.FLOW_END;
          return yield* this.parseLineStart();
        }
      }
      let n = 0;
      while (line[n] === ",") {
        n += yield* this.pushCount(1);
        n += yield* this.pushSpaces(true);
        this.flowKey = false;
      }
      n += yield* this.pushIndicators();
      switch (line[n]) {
        case void 0:
          return "flow";
        case "#":
          yield* this.pushCount(line.length - n);
          return "flow";
        case "{":
        case "[":
          yield* this.pushCount(1);
          this.flowKey = false;
          this.flowLevel += 1;
          return "flow";
        case "}":
        case "]":
          yield* this.pushCount(1);
          this.flowKey = true;
          this.flowLevel -= 1;
          return this.flowLevel ? "flow" : "doc";
        case "*":
          yield* this.pushUntil(isNotAnchorChar);
          return "flow";
        case '"':
        case "'":
          this.flowKey = true;
          return yield* this.parseQuotedScalar();
        case ":": {
          const next = this.charAt(1);
          if (this.flowKey || isEmpty(next) || next === ",") {
            this.flowKey = false;
            yield* this.pushCount(1);
            yield* this.pushSpaces(true);
            return "flow";
          }
        }
        // fallthrough
        default:
          this.flowKey = false;
          return yield* this.parsePlainScalar();
      }
    }
    *parseQuotedScalar() {
      const quote = this.charAt(0);
      let end = this.buffer.indexOf(quote, this.pos + 1);
      if (quote === "'") {
        while (end !== -1 && this.buffer[end + 1] === "'")
          end = this.buffer.indexOf("'", end + 2);
      } else {
        while (end !== -1) {
          let n = 0;
          while (this.buffer[end - 1 - n] === "\\")
            n += 1;
          if (n % 2 === 0)
            break;
          end = this.buffer.indexOf('"', end + 1);
        }
      }
      const qb = this.buffer.substring(0, end);
      let nl = qb.indexOf("\n", this.pos);
      if (nl !== -1) {
        while (nl !== -1) {
          const cs = this.continueScalar(nl + 1);
          if (cs === -1)
            break;
          nl = qb.indexOf("\n", cs);
        }
        if (nl !== -1) {
          end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
        }
      }
      if (end === -1) {
        if (!this.atEnd)
          return this.setNext("quoted-scalar");
        end = this.buffer.length;
      }
      yield* this.pushToIndex(end + 1, false);
      return this.flowLevel ? "flow" : "doc";
    }
    *parseBlockScalarHeader() {
      this.blockScalarIndent = -1;
      this.blockScalarKeep = false;
      let i = this.pos;
      while (true) {
        const ch = this.buffer[++i];
        if (ch === "+")
          this.blockScalarKeep = true;
        else if (ch > "0" && ch <= "9")
          this.blockScalarIndent = Number(ch) - 1;
        else if (ch !== "-")
          break;
      }
      return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
    }
    *parseBlockScalar() {
      let nl = this.pos - 1;
      let indent = 0;
      let ch;
      loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
        switch (ch) {
          case " ":
            indent += 1;
            break;
          case "\n":
            nl = i2;
            indent = 0;
            break;
          case "\r": {
            const next = this.buffer[i2 + 1];
            if (!next && !this.atEnd)
              return this.setNext("block-scalar");
            if (next === "\n")
              break;
          }
          // fallthrough
          default:
            break loop;
        }
      }
      if (!ch && !this.atEnd)
        return this.setNext("block-scalar");
      if (indent >= this.indentNext) {
        if (this.blockScalarIndent === -1)
          this.indentNext = indent;
        else {
          this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
        }
        do {
          const cs = this.continueScalar(nl + 1);
          if (cs === -1)
            break;
          nl = this.buffer.indexOf("\n", cs);
        } while (nl !== -1);
        if (nl === -1) {
          if (!this.atEnd)
            return this.setNext("block-scalar");
          nl = this.buffer.length;
        }
      }
      let i = nl + 1;
      ch = this.buffer[i];
      while (ch === " ")
        ch = this.buffer[++i];
      if (ch === "	") {
        while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
          ch = this.buffer[++i];
        nl = i - 1;
      } else if (!this.blockScalarKeep) {
        do {
          let i2 = nl - 1;
          let ch2 = this.buffer[i2];
          if (ch2 === "\r")
            ch2 = this.buffer[--i2];
          const lastChar = i2;
          while (ch2 === " ")
            ch2 = this.buffer[--i2];
          if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
            nl = i2;
          else
            break;
        } while (true);
      }
      yield cst2.SCALAR;
      yield* this.pushToIndex(nl + 1, true);
      return yield* this.parseLineStart();
    }
    *parsePlainScalar() {
      const inFlow = this.flowLevel > 0;
      let end = this.pos - 1;
      let i = this.pos - 1;
      let ch;
      while (ch = this.buffer[++i]) {
        if (ch === ":") {
          const next = this.buffer[i + 1];
          if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
            break;
          end = i;
        } else if (isEmpty(ch)) {
          let next = this.buffer[i + 1];
          if (ch === "\r") {
            if (next === "\n") {
              i += 1;
              ch = "\n";
              next = this.buffer[i + 1];
            } else
              end = i;
          }
          if (next === "#" || inFlow && flowIndicatorChars.has(next))
            break;
          if (ch === "\n") {
            const cs = this.continueScalar(i + 1);
            if (cs === -1)
              break;
            i = Math.max(i, cs - 2);
          }
        } else {
          if (inFlow && flowIndicatorChars.has(ch))
            break;
          end = i;
        }
      }
      if (!ch && !this.atEnd)
        return this.setNext("plain-scalar");
      yield cst2.SCALAR;
      yield* this.pushToIndex(end + 1, true);
      return inFlow ? "flow" : "doc";
    }
    *pushCount(n) {
      if (n > 0) {
        yield this.buffer.substr(this.pos, n);
        this.pos += n;
        return n;
      }
      return 0;
    }
    *pushToIndex(i, allowEmpty) {
      const s = this.buffer.slice(this.pos, i);
      if (s) {
        yield s;
        this.pos += s.length;
        return s.length;
      } else if (allowEmpty)
        yield "";
      return 0;
    }
    *pushIndicators() {
      let n = 0;
      loop: while (true) {
        switch (this.charAt(0)) {
          case "!":
            n += yield* this.pushTag();
            n += yield* this.pushSpaces(true);
            continue loop;
          case "&":
            n += yield* this.pushUntil(isNotAnchorChar);
            n += yield* this.pushSpaces(true);
            continue loop;
          case "-":
          // this is an error
          case "?":
          // this is an error outside flow collections
          case ":": {
            const inFlow = this.flowLevel > 0;
            const ch1 = this.charAt(1);
            if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
              if (!inFlow)
                this.indentNext = this.indentValue + 1;
              else if (this.flowKey)
                this.flowKey = false;
              n += yield* this.pushCount(1);
              n += yield* this.pushSpaces(true);
              continue loop;
            }
          }
        }
        break loop;
      }
      return n;
    }
    *pushTag() {
      if (this.charAt(1) === "<") {
        let i = this.pos + 2;
        let ch = this.buffer[i];
        while (!isEmpty(ch) && ch !== ">")
          ch = this.buffer[++i];
        return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
      } else {
        let i = this.pos + 1;
        let ch = this.buffer[i];
        while (ch) {
          if (tagChars.has(ch))
            ch = this.buffer[++i];
          else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
            ch = this.buffer[i += 3];
          } else
            break;
        }
        return yield* this.pushToIndex(i, false);
      }
    }
    *pushNewline() {
      const ch = this.buffer[this.pos];
      if (ch === "\n")
        return yield* this.pushCount(1);
      else if (ch === "\r" && this.charAt(1) === "\n")
        return yield* this.pushCount(2);
      else
        return 0;
    }
    *pushSpaces(allowTabs) {
      let i = this.pos - 1;
      let ch;
      do {
        ch = this.buffer[++i];
      } while (ch === " " || allowTabs && ch === "	");
      const n = i - this.pos;
      if (n > 0) {
        yield this.buffer.substr(this.pos, n);
        this.pos = i;
      }
      return n;
    }
    *pushUntil(test) {
      let i = this.pos;
      let ch = this.buffer[i];
      while (!test(ch))
        ch = this.buffer[++i];
      return yield* this.pushToIndex(i, false);
    }
  }
  lexer.Lexer = Lexer;
  return lexer;
}
var lineCounter = {};
var hasRequiredLineCounter;
function requireLineCounter() {
  if (hasRequiredLineCounter) return lineCounter;
  hasRequiredLineCounter = 1;
  class LineCounter {
    constructor() {
      this.lineStarts = [];
      this.addNewLine = (offset) => this.lineStarts.push(offset);
      this.linePos = (offset) => {
        let low = 0;
        let high = this.lineStarts.length;
        while (low < high) {
          const mid = low + high >> 1;
          if (this.lineStarts[mid] < offset)
            low = mid + 1;
          else
            high = mid;
        }
        if (this.lineStarts[low] === offset)
          return { line: low + 1, col: 1 };
        if (low === 0)
          return { line: 0, col: offset };
        const start = this.lineStarts[low - 1];
        return { line: low, col: offset - start + 1 };
      };
    }
  }
  lineCounter.LineCounter = LineCounter;
  return lineCounter;
}
var parser = {};
var hasRequiredParser;
function requireParser() {
  if (hasRequiredParser) return parser;
  hasRequiredParser = 1;
  var node_process = require$$0;
  var cst2 = requireCst();
  var lexer2 = requireLexer();
  function includesToken(list, type) {
    for (let i = 0; i < list.length; ++i)
      if (list[i].type === type)
        return true;
    return false;
  }
  function findNonEmptyIndex(list) {
    for (let i = 0; i < list.length; ++i) {
      switch (list[i].type) {
        case "space":
        case "comment":
        case "newline":
          break;
        default:
          return i;
      }
    }
    return -1;
  }
  function isFlowToken(token) {
    switch (token?.type) {
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
      case "flow-collection":
        return true;
      default:
        return false;
    }
  }
  function getPrevProps(parent) {
    switch (parent.type) {
      case "document":
        return parent.start;
      case "block-map": {
        const it = parent.items[parent.items.length - 1];
        return it.sep ?? it.start;
      }
      case "block-seq":
        return parent.items[parent.items.length - 1].start;
      /* istanbul ignore next should not happen */
      default:
        return [];
    }
  }
  function getFirstKeyStartProps(prev) {
    if (prev.length === 0)
      return [];
    let i = prev.length;
    loop: while (--i >= 0) {
      switch (prev[i].type) {
        case "doc-start":
        case "explicit-key-ind":
        case "map-value-ind":
        case "seq-item-ind":
        case "newline":
          break loop;
      }
    }
    while (prev[++i]?.type === "space") {
    }
    return prev.splice(i, prev.length);
  }
  function arrayPushArray(target, source) {
    if (source.length < 1e5)
      Array.prototype.push.apply(target, source);
    else
      for (let i = 0; i < source.length; ++i)
        target.push(source[i]);
  }
  function fixFlowSeqItems(fc) {
    if (fc.start.type === "flow-seq-start") {
      for (const it of fc.items) {
        if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
          if (it.key)
            it.value = it.key;
          delete it.key;
          if (isFlowToken(it.value)) {
            if (it.value.end)
              arrayPushArray(it.value.end, it.sep);
            else
              it.value.end = it.sep;
          } else
            arrayPushArray(it.start, it.sep);
          delete it.sep;
        }
      }
    }
  }
  class Parser {
    /**
     * @param onNewLine - If defined, called separately with the start position of
     *   each new line (in `parse()`, including the start of input).
     */
    constructor(onNewLine) {
      this.atNewLine = true;
      this.atScalar = false;
      this.indent = 0;
      this.offset = 0;
      this.onKeyLine = false;
      this.stack = [];
      this.source = "";
      this.type = "";
      this.lexer = new lexer2.Lexer();
      this.onNewLine = onNewLine;
    }
    /**
     * Parse `source` as a YAML stream.
     * If `incomplete`, a part of the last line may be left as a buffer for the next call.
     *
     * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
     *
     * @returns A generator of tokens representing each directive, document, and other structure.
     */
    *parse(source, incomplete = false) {
      if (this.onNewLine && this.offset === 0)
        this.onNewLine(0);
      for (const lexeme of this.lexer.lex(source, incomplete))
        yield* this.next(lexeme);
      if (!incomplete)
        yield* this.end();
    }
    /**
     * Advance the parser by the `source` of one lexical token.
     */
    *next(source) {
      this.source = source;
      if (node_process.env.LOG_TOKENS)
        console.log("|", cst2.prettyToken(source));
      if (this.atScalar) {
        this.atScalar = false;
        yield* this.step();
        this.offset += source.length;
        return;
      }
      const type = cst2.tokenType(source);
      if (!type) {
        const message = `Not a YAML token: ${source}`;
        yield* this.pop({ type: "error", offset: this.offset, message, source });
        this.offset += source.length;
      } else if (type === "scalar") {
        this.atNewLine = false;
        this.atScalar = true;
        this.type = "scalar";
      } else {
        this.type = type;
        yield* this.step();
        switch (type) {
          case "newline":
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine)
              this.onNewLine(this.offset + source.length);
            break;
          case "space":
            if (this.atNewLine && source[0] === " ")
              this.indent += source.length;
            break;
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
            if (this.atNewLine)
              this.indent += source.length;
            break;
          case "doc-mode":
          case "flow-error-end":
            return;
          default:
            this.atNewLine = false;
        }
        this.offset += source.length;
      }
    }
    /** Call at end of input to push out any remaining constructions */
    *end() {
      while (this.stack.length > 0)
        yield* this.pop();
    }
    get sourceToken() {
      const st = {
        type: this.type,
        offset: this.offset,
        indent: this.indent,
        source: this.source
      };
      return st;
    }
    *step() {
      const top = this.peek(1);
      if (this.type === "doc-end" && top?.type !== "doc-end") {
        while (this.stack.length > 0)
          yield* this.pop();
        this.stack.push({
          type: "doc-end",
          offset: this.offset,
          source: this.source
        });
        return;
      }
      if (!top)
        return yield* this.stream();
      switch (top.type) {
        case "document":
          return yield* this.document(top);
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return yield* this.scalar(top);
        case "block-scalar":
          return yield* this.blockScalar(top);
        case "block-map":
          return yield* this.blockMap(top);
        case "block-seq":
          return yield* this.blockSequence(top);
        case "flow-collection":
          return yield* this.flowCollection(top);
        case "doc-end":
          return yield* this.documentEnd(top);
      }
      yield* this.pop();
    }
    peek(n) {
      return this.stack[this.stack.length - n];
    }
    *pop(error) {
      const token = error ?? this.stack.pop();
      if (!token) {
        const message = "Tried to pop an empty stack";
        yield { type: "error", offset: this.offset, source: "", message };
      } else if (this.stack.length === 0) {
        yield token;
      } else {
        const top = this.peek(1);
        if (token.type === "block-scalar") {
          token.indent = "indent" in top ? top.indent : 0;
        } else if (token.type === "flow-collection" && top.type === "document") {
          token.indent = 0;
        }
        if (token.type === "flow-collection")
          fixFlowSeqItems(token);
        switch (top.type) {
          case "document":
            top.value = token;
            break;
          case "block-scalar":
            top.props.push(token);
            break;
          case "block-map": {
            const it = top.items[top.items.length - 1];
            if (it.value) {
              top.items.push({ start: [], key: token, sep: [] });
              this.onKeyLine = true;
              return;
            } else if (it.sep) {
              it.value = token;
            } else {
              Object.assign(it, { key: token, sep: [] });
              this.onKeyLine = !it.explicitKey;
              return;
            }
            break;
          }
          case "block-seq": {
            const it = top.items[top.items.length - 1];
            if (it.value)
              top.items.push({ start: [], value: token });
            else
              it.value = token;
            break;
          }
          case "flow-collection": {
            const it = top.items[top.items.length - 1];
            if (!it || it.value)
              top.items.push({ start: [], key: token, sep: [] });
            else if (it.sep)
              it.value = token;
            else
              Object.assign(it, { key: token, sep: [] });
            return;
          }
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.pop(token);
        }
        if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
          const last = token.items[token.items.length - 1];
          if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
            if (top.type === "document")
              top.end = last.start;
            else
              top.items.push({ start: last.start });
            token.items.splice(-1, 1);
          }
        }
      }
    }
    *stream() {
      switch (this.type) {
        case "directive-line":
          yield { type: "directive", offset: this.offset, source: this.source };
          return;
        case "byte-order-mark":
        case "space":
        case "comment":
        case "newline":
          yield this.sourceToken;
          return;
        case "doc-mode":
        case "doc-start": {
          const doc = {
            type: "document",
            offset: this.offset,
            start: []
          };
          if (this.type === "doc-start")
            doc.start.push(this.sourceToken);
          this.stack.push(doc);
          return;
        }
      }
      yield {
        type: "error",
        offset: this.offset,
        message: `Unexpected ${this.type} token in YAML stream`,
        source: this.source
      };
    }
    *document(doc) {
      if (doc.value)
        return yield* this.lineEnd(doc);
      switch (this.type) {
        case "doc-start": {
          if (findNonEmptyIndex(doc.start) !== -1) {
            yield* this.pop();
            yield* this.step();
          } else
            doc.start.push(this.sourceToken);
          return;
        }
        case "anchor":
        case "tag":
        case "space":
        case "comment":
        case "newline":
          doc.start.push(this.sourceToken);
          return;
      }
      const bv = this.startBlockValue(doc);
      if (bv)
        this.stack.push(bv);
      else {
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML document`,
          source: this.source
        };
      }
    }
    *scalar(scalar) {
      if (this.type === "map-value-ind") {
        const prev = getPrevProps(this.peek(2));
        const start = getFirstKeyStartProps(prev);
        let sep2;
        if (scalar.end) {
          sep2 = scalar.end;
          sep2.push(this.sourceToken);
          delete scalar.end;
        } else
          sep2 = [this.sourceToken];
        const map2 = {
          type: "block-map",
          offset: scalar.offset,
          indent: scalar.indent,
          items: [{ start, key: scalar, sep: sep2 }]
        };
        this.onKeyLine = true;
        this.stack[this.stack.length - 1] = map2;
      } else
        yield* this.lineEnd(scalar);
    }
    *blockScalar(scalar) {
      switch (this.type) {
        case "space":
        case "comment":
        case "newline":
          scalar.props.push(this.sourceToken);
          return;
        case "scalar":
          scalar.source = this.source;
          this.atNewLine = true;
          this.indent = 0;
          if (this.onNewLine) {
            let nl = this.source.indexOf("\n") + 1;
            while (nl !== 0) {
              this.onNewLine(this.offset + nl);
              nl = this.source.indexOf("\n", nl) + 1;
            }
          }
          yield* this.pop();
          break;
        /* istanbul ignore next should not happen */
        default:
          yield* this.pop();
          yield* this.step();
      }
    }
    *blockMap(map2) {
      const it = map2.items[map2.items.length - 1];
      switch (this.type) {
        case "newline":
          this.onKeyLine = false;
          if (it.value) {
            const end = "end" in it.value ? it.value.end : void 0;
            const last = Array.isArray(end) ? end[end.length - 1] : void 0;
            if (last?.type === "comment")
              end?.push(this.sourceToken);
            else
              map2.items.push({ start: [this.sourceToken] });
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            it.start.push(this.sourceToken);
          }
          return;
        case "space":
        case "comment":
          if (it.value) {
            map2.items.push({ start: [this.sourceToken] });
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            if (this.atIndentedComment(it.start, map2.indent)) {
              const prev = map2.items[map2.items.length - 2];
              const end = prev?.value?.end;
              if (Array.isArray(end)) {
                arrayPushArray(end, it.start);
                end.push(this.sourceToken);
                map2.items.pop();
                return;
              }
            }
            it.start.push(this.sourceToken);
          }
          return;
      }
      if (this.indent >= map2.indent) {
        const atMapIndent = !this.onKeyLine && this.indent === map2.indent;
        const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
        let start = [];
        if (atNextItem && it.sep && !it.value) {
          const nl = [];
          for (let i = 0; i < it.sep.length; ++i) {
            const st = it.sep[i];
            switch (st.type) {
              case "newline":
                nl.push(i);
                break;
              case "space":
                break;
              case "comment":
                if (st.indent > map2.indent)
                  nl.length = 0;
                break;
              default:
                nl.length = 0;
            }
          }
          if (nl.length >= 2)
            start = it.sep.splice(nl[1]);
        }
        switch (this.type) {
          case "anchor":
          case "tag":
            if (atNextItem || it.value) {
              start.push(this.sourceToken);
              map2.items.push({ start });
              this.onKeyLine = true;
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "explicit-key-ind":
            if (!it.sep && !it.explicitKey) {
              it.start.push(this.sourceToken);
              it.explicitKey = true;
            } else if (atNextItem || it.value) {
              start.push(this.sourceToken);
              map2.items.push({ start, explicitKey: true });
            } else {
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: [this.sourceToken], explicitKey: true }]
              });
            }
            this.onKeyLine = true;
            return;
          case "map-value-ind":
            if (it.explicitKey) {
              if (!it.sep) {
                if (includesToken(it.start, "newline")) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else {
                  const start2 = getFirstKeyStartProps(it.start);
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                  });
                }
              } else if (it.value) {
                map2.items.push({ start: [], key: null, sep: [this.sourceToken] });
              } else if (includesToken(it.sep, "map-value-ind")) {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start, key: null, sep: [this.sourceToken] }]
                });
              } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                const start2 = getFirstKeyStartProps(it.start);
                const key = it.key;
                const sep2 = it.sep;
                sep2.push(this.sourceToken);
                delete it.key;
                delete it.sep;
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: start2, key, sep: sep2 }]
                });
              } else if (start.length > 0) {
                it.sep = it.sep.concat(start, this.sourceToken);
              } else {
                it.sep.push(this.sourceToken);
              }
            } else {
              if (!it.sep) {
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              } else if (it.value || atNextItem) {
                map2.items.push({ start, key: null, sep: [this.sourceToken] });
              } else if (includesToken(it.sep, "map-value-ind")) {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [], key: null, sep: [this.sourceToken] }]
                });
              } else {
                it.sep.push(this.sourceToken);
              }
            }
            this.onKeyLine = true;
            return;
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar": {
            const fs = this.flowScalar(this.type);
            if (atNextItem || it.value) {
              map2.items.push({ start, key: fs, sep: [] });
              this.onKeyLine = true;
            } else if (it.sep) {
              this.stack.push(fs);
            } else {
              Object.assign(it, { key: fs, sep: [] });
              this.onKeyLine = true;
            }
            return;
          }
          default: {
            const bv = this.startBlockValue(map2);
            if (bv) {
              if (bv.type === "block-seq") {
                if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                  yield* this.pop({
                    type: "error",
                    offset: this.offset,
                    message: "Unexpected block-seq-ind on same line with key",
                    source: this.source
                  });
                  return;
                }
              } else if (atMapIndent) {
                map2.items.push({ start });
              }
              this.stack.push(bv);
              return;
            }
          }
        }
      }
      yield* this.pop();
      yield* this.step();
    }
    *blockSequence(seq2) {
      const it = seq2.items[seq2.items.length - 1];
      switch (this.type) {
        case "newline":
          if (it.value) {
            const end = "end" in it.value ? it.value.end : void 0;
            const last = Array.isArray(end) ? end[end.length - 1] : void 0;
            if (last?.type === "comment")
              end?.push(this.sourceToken);
            else
              seq2.items.push({ start: [this.sourceToken] });
          } else
            it.start.push(this.sourceToken);
          return;
        case "space":
        case "comment":
          if (it.value)
            seq2.items.push({ start: [this.sourceToken] });
          else {
            if (this.atIndentedComment(it.start, seq2.indent)) {
              const prev = seq2.items[seq2.items.length - 2];
              const end = prev?.value?.end;
              if (Array.isArray(end)) {
                arrayPushArray(end, it.start);
                end.push(this.sourceToken);
                seq2.items.pop();
                return;
              }
            }
            it.start.push(this.sourceToken);
          }
          return;
        case "anchor":
        case "tag":
          if (it.value || this.indent <= seq2.indent)
            break;
          it.start.push(this.sourceToken);
          return;
        case "seq-item-ind":
          if (this.indent !== seq2.indent)
            break;
          if (it.value || includesToken(it.start, "seq-item-ind"))
            seq2.items.push({ start: [this.sourceToken] });
          else
            it.start.push(this.sourceToken);
          return;
      }
      if (this.indent > seq2.indent) {
        const bv = this.startBlockValue(seq2);
        if (bv) {
          this.stack.push(bv);
          return;
        }
      }
      yield* this.pop();
      yield* this.step();
    }
    *flowCollection(fc) {
      const it = fc.items[fc.items.length - 1];
      if (this.type === "flow-error-end") {
        let top;
        do {
          yield* this.pop();
          top = this.peek(1);
        } while (top?.type === "flow-collection");
      } else if (fc.end.length === 0) {
        switch (this.type) {
          case "comma":
          case "explicit-key-ind":
            if (!it || it.sep)
              fc.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
          case "map-value-ind":
            if (!it || it.value)
              fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
            else if (it.sep)
              it.sep.push(this.sourceToken);
            else
              Object.assign(it, { key: null, sep: [this.sourceToken] });
            return;
          case "space":
          case "comment":
          case "newline":
          case "anchor":
          case "tag":
            if (!it || it.value)
              fc.items.push({ start: [this.sourceToken] });
            else if (it.sep)
              it.sep.push(this.sourceToken);
            else
              it.start.push(this.sourceToken);
            return;
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar": {
            const fs = this.flowScalar(this.type);
            if (!it || it.value)
              fc.items.push({ start: [], key: fs, sep: [] });
            else if (it.sep)
              this.stack.push(fs);
            else
              Object.assign(it, { key: fs, sep: [] });
            return;
          }
          case "flow-map-end":
          case "flow-seq-end":
            fc.end.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(fc);
        if (bv)
          this.stack.push(bv);
        else {
          yield* this.pop();
          yield* this.step();
        }
      } else {
        const parent = this.peek(2);
        if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
          yield* this.pop();
          yield* this.step();
        } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          fixFlowSeqItems(fc);
          const sep2 = fc.end.splice(1, fc.end.length);
          sep2.push(this.sourceToken);
          const map2 = {
            type: "block-map",
            offset: fc.offset,
            indent: fc.indent,
            items: [{ start, key: fc, sep: sep2 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map2;
        } else {
          yield* this.lineEnd(fc);
        }
      }
    }
    flowScalar(type) {
      if (this.onNewLine) {
        let nl = this.source.indexOf("\n") + 1;
        while (nl !== 0) {
          this.onNewLine(this.offset + nl);
          nl = this.source.indexOf("\n", nl) + 1;
        }
      }
      return {
        type,
        offset: this.offset,
        indent: this.indent,
        source: this.source
      };
    }
    startBlockValue(parent) {
      switch (this.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return this.flowScalar(this.type);
        case "block-scalar-header":
          return {
            type: "block-scalar",
            offset: this.offset,
            indent: this.indent,
            props: [this.sourceToken],
            source: ""
          };
        case "flow-map-start":
        case "flow-seq-start":
          return {
            type: "flow-collection",
            offset: this.offset,
            indent: this.indent,
            start: this.sourceToken,
            items: [],
            end: []
          };
        case "seq-item-ind":
          return {
            type: "block-seq",
            offset: this.offset,
            indent: this.indent,
            items: [{ start: [this.sourceToken] }]
          };
        case "explicit-key-ind": {
          this.onKeyLine = true;
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          start.push(this.sourceToken);
          return {
            type: "block-map",
            offset: this.offset,
            indent: this.indent,
            items: [{ start, explicitKey: true }]
          };
        }
        case "map-value-ind": {
          this.onKeyLine = true;
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          return {
            type: "block-map",
            offset: this.offset,
            indent: this.indent,
            items: [{ start, key: null, sep: [this.sourceToken] }]
          };
        }
      }
      return null;
    }
    atIndentedComment(start, indent) {
      if (this.type !== "comment")
        return false;
      if (this.indent <= indent)
        return false;
      return start.every((st) => st.type === "newline" || st.type === "space");
    }
    *documentEnd(docEnd) {
      if (this.type !== "doc-mode") {
        if (docEnd.end)
          docEnd.end.push(this.sourceToken);
        else
          docEnd.end = [this.sourceToken];
        if (this.type === "newline")
          yield* this.pop();
      }
    }
    *lineEnd(token) {
      switch (this.type) {
        case "comma":
        case "doc-start":
        case "doc-end":
        case "flow-seq-end":
        case "flow-map-end":
        case "map-value-ind":
          yield* this.pop();
          yield* this.step();
          break;
        case "newline":
          this.onKeyLine = false;
        // fallthrough
        case "space":
        case "comment":
        default:
          if (token.end)
            token.end.push(this.sourceToken);
          else
            token.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
      }
    }
  }
  parser.Parser = Parser;
  return parser;
}
var publicApi = {};
var hasRequiredPublicApi;
function requirePublicApi() {
  if (hasRequiredPublicApi) return publicApi;
  hasRequiredPublicApi = 1;
  var composer2 = requireComposer();
  var Document2 = requireDocument();
  var errors2 = requireErrors();
  var log2 = requireLog();
  var identity2 = requireIdentity();
  var lineCounter2 = requireLineCounter();
  var parser2 = requireParser();
  function parseOptions(options) {
    const prettyErrors = options.prettyErrors !== false;
    const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter2.LineCounter() || null;
    return { lineCounter: lineCounter$1, prettyErrors };
  }
  function parseAllDocuments(source, options = {}) {
    const { lineCounter: lineCounter3, prettyErrors } = parseOptions(options);
    const parser$1 = new parser2.Parser(lineCounter3?.addNewLine);
    const composer$1 = new composer2.Composer(options);
    const docs = Array.from(composer$1.compose(parser$1.parse(source)));
    if (prettyErrors && lineCounter3)
      for (const doc of docs) {
        doc.errors.forEach(errors2.prettifyError(source, lineCounter3));
        doc.warnings.forEach(errors2.prettifyError(source, lineCounter3));
      }
    if (docs.length > 0)
      return docs;
    return Object.assign([], { empty: true }, composer$1.streamInfo());
  }
  function parseDocument(source, options = {}) {
    const { lineCounter: lineCounter3, prettyErrors } = parseOptions(options);
    const parser$1 = new parser2.Parser(lineCounter3?.addNewLine);
    const composer$1 = new composer2.Composer(options);
    let doc = null;
    for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
      if (!doc)
        doc = _doc;
      else if (doc.options.logLevel !== "silent") {
        doc.errors.push(new errors2.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
        break;
      }
    }
    if (prettyErrors && lineCounter3) {
      doc.errors.forEach(errors2.prettifyError(source, lineCounter3));
      doc.warnings.forEach(errors2.prettifyError(source, lineCounter3));
    }
    return doc;
  }
  function parse(src, reviver, options) {
    let _reviver = void 0;
    if (typeof reviver === "function") {
      _reviver = reviver;
    } else if (options === void 0 && reviver && typeof reviver === "object") {
      options = reviver;
    }
    const doc = parseDocument(src, options);
    if (!doc)
      return null;
    doc.warnings.forEach((warning) => log2.warn(doc.options.logLevel, warning));
    if (doc.errors.length > 0) {
      if (doc.options.logLevel !== "silent")
        throw doc.errors[0];
      else
        doc.errors = [];
    }
    return doc.toJS(Object.assign({ reviver: _reviver }, options));
  }
  function stringify2(value, replacer, options) {
    let _replacer = null;
    if (typeof replacer === "function" || Array.isArray(replacer)) {
      _replacer = replacer;
    } else if (options === void 0 && replacer) {
      options = replacer;
    }
    if (typeof options === "string")
      options = options.length;
    if (typeof options === "number") {
      const indent = Math.round(options);
      options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
    }
    if (value === void 0) {
      const { keepUndefined } = options ?? replacer ?? {};
      if (!keepUndefined)
        return void 0;
    }
    if (identity2.isDocument(value) && !_replacer)
      return value.toString(options);
    return new Document2.Document(value, _replacer, options).toString(options);
  }
  publicApi.parse = parse;
  publicApi.parseAllDocuments = parseAllDocuments;
  publicApi.parseDocument = parseDocument;
  publicApi.stringify = stringify2;
  return publicApi;
}
var hasRequiredDist;
function requireDist() {
  if (hasRequiredDist) return dist;
  hasRequiredDist = 1;
  var composer2 = requireComposer();
  var Document2 = requireDocument();
  var Schema2 = requireSchema();
  var errors2 = requireErrors();
  var Alias2 = requireAlias();
  var identity2 = requireIdentity();
  var Pair2 = requirePair();
  var Scalar2 = requireScalar();
  var YAMLMap2 = requireYAMLMap();
  var YAMLSeq2 = requireYAMLSeq();
  var cst2 = requireCst();
  var lexer2 = requireLexer();
  var lineCounter2 = requireLineCounter();
  var parser2 = requireParser();
  var publicApi2 = requirePublicApi();
  var visit2 = requireVisit();
  dist.Composer = composer2.Composer;
  dist.Document = Document2.Document;
  dist.Schema = Schema2.Schema;
  dist.YAMLError = errors2.YAMLError;
  dist.YAMLParseError = errors2.YAMLParseError;
  dist.YAMLWarning = errors2.YAMLWarning;
  dist.Alias = Alias2.Alias;
  dist.isAlias = identity2.isAlias;
  dist.isCollection = identity2.isCollection;
  dist.isDocument = identity2.isDocument;
  dist.isMap = identity2.isMap;
  dist.isNode = identity2.isNode;
  dist.isPair = identity2.isPair;
  dist.isScalar = identity2.isScalar;
  dist.isSeq = identity2.isSeq;
  dist.Pair = Pair2.Pair;
  dist.Scalar = Scalar2.Scalar;
  dist.YAMLMap = YAMLMap2.YAMLMap;
  dist.YAMLSeq = YAMLSeq2.YAMLSeq;
  dist.CST = cst2;
  dist.Lexer = lexer2.Lexer;
  dist.LineCounter = lineCounter2.LineCounter;
  dist.Parser = parser2.Parser;
  dist.parse = publicApi2.parse;
  dist.parseAllDocuments = publicApi2.parseAllDocuments;
  dist.parseDocument = publicApi2.parseDocument;
  dist.stringify = publicApi2.stringify;
  dist.visit = visit2.visit;
  dist.visitAsync = visit2.visitAsync;
  return dist;
}
var distExports = requireDist();
async function clearStaleLoopbackHttpCache(session, originStatePath, nextOrigin, note) {
  try {
    if ((await readFile(originStatePath, "utf8")).trim() === nextOrigin) return "unchanged";
  } catch (error) {
    if (error.code !== "ENOENT") {
      const detail = error instanceof Error ? error.message : String(error);
      note(`[desktop] loopback HTTP cache origin state read failed: ${detail}`);
    }
  }
  try {
    await session.clearCache();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    note(`[desktop] stale loopback HTTP cache cleanup failed: ${detail}`);
    return "failed";
  }
  try {
    await writeFile(originStatePath, `${nextOrigin}
`, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    note(`[desktop] loopback HTTP cache origin state write failed: ${detail}`);
  }
  return "cleared";
}
const SAFE_MODE_PROFILE = "desktop-safe-mode";
const SAFE_MODE_BUNDLES = [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app"
];
const SAFE_MODE_PATCH = `# Managed by DSH Desktop Safe Mode.
# Third-party bundles and the normal web profile's patch layer are intentionally omitted.
[]
`;
const SAFE_MODE_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`;
async function writeIfChanged(path, content) {
  try {
    if (await readFile(path, "utf8") === content) return;
  } catch {
  }
  await writeFile(path, content, "utf8");
}
async function ensureSafeModeProfile(dshHome) {
  const directory = join(dshHome, "profiles", SAFE_MODE_PROFILE);
  await mkdir(directory, { recursive: true });
  const manifest = `${JSON.stringify({
    name: "dsh-profile-desktop-safe-mode",
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...SAFE_MODE_BUNDLES] } }
  }, null, 2)}
`;
  await Promise.all([
    writeIfChanged(join(directory, "package.json"), manifest),
    writeIfChanged(join(directory, "cordis.patch.yml"), SAFE_MODE_PATCH),
    writeIfChanged(join(directory, "pnpm-workspace.yaml"), SAFE_MODE_WORKSPACE)
  ]);
  return directory;
}
const PLUGIN_FAILURE_PREFIX = "[harness-node] plugin failures: ";
function parsePluginStartupFailures(line) {
  if (!line.startsWith(PLUGIN_FAILURE_PREFIX)) return void 0;
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const optionalString = (value) => value === void 0 || typeof value === "string";
  try {
    const report = JSON.parse(line.slice(PLUGIN_FAILURE_PREFIX.length));
    if (!object(report) || report.version !== 1 || !Array.isArray(report.failures)) return void 0;
    const failures = [];
    for (const value of report.failures) {
      if (!object(value) || typeof value.stage !== "string" || typeof value.packageName !== "string" || typeof value.message !== "string" || !optionalString(value.entryId) || !Array.isArray(value.chain)) return void 0;
      if (value.owner !== void 0 && (!object(value.owner) || typeof value.owner.packageName !== "string" || !optionalString(value.owner.version) || !optionalString(value.owner.packageDir))) return void 0;
      if (!value.chain.every((row) => object(row) && typeof row.packageName === "string" && optionalString(row.entryId) && optionalString(row.baseUrl))) return void 0;
      failures.push(value);
    }
    return failures.length ? failures : void 0;
  } catch {
    return void 0;
  }
}
const DEFAULT_HARNESS_PORT = 43129;
let resolvedShellEnvironment;
function shellCapture() {
  if (process.platform === "win32") {
    return {
      // PowerShell with the user profile loaded captures both registry
      // environment variables and any PATH additions sourced in $PROFILE
      // (e.g. conda activate, nvm use, scoop shim).  -OutputFormat Text
      // avoids BOM/XML wrapping.
      file: "powershell",
      args: [
        "-NoLogo",
        "-NonInteractive",
        "-OutputFormat",
        "Text",
        "-Command",
        // Windows PowerShell writes stdout in the console codepage, not
        // UTF-8, and we decode as UTF-8 below. On a CJK install (ACP 936)
        // every non-ASCII byte then arrives as U+FFFD, so a user profile
        // directory like C:\Users\数据项素 comes back as eight replacement
        // characters — and TEMP, captured here and passed to Harness
        // unchanged, points nowhere. Harness dies in mkdtemp before it can
        // load a plugin tree. Pinning the output encoding is what makes the
        // decode below true; dropping undecodable values is the belt to its
        // braces.
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; . $PROFILE 2>$null; Get-ChildItem Env: | ForEach-Object { "$($_.Name)=$($_.Value)" }'
      ],
      timeout: 15e3,
      parse: (output) => withoutUndecodableValues(parseEnvOutput(output, /\r?\n/), process.env)
    };
  }
  return {
    // macOS / Linux: run a login + interactive shell so both .zprofile
    // (Homebrew, OrbStack) and .zshrc (mise shims, ~/.local/bin, cargo,
    // go, etc.) are sourced.  stderr is ignored to suppress prompt noise.
    file: process.env.SHELL ?? "/bin/sh",
    args: ["-l", "-i", "-c", "env"],
    timeout: 1e4,
    parse: (output) => parseEnvOutput(output, /\n/)
  };
}
let shellEnvironmentCapture;
function prewarmShellEnvironment() {
  if (resolvedShellEnvironment !== void 0) return Promise.resolve(resolvedShellEnvironment);
  shellEnvironmentCapture ??= new Promise((resolve2) => {
    let capture;
    try {
      capture = shellCapture();
    } catch {
      resolvedShellEnvironment = process.env;
      resolve2(resolvedShellEnvironment);
      return;
    }
    execFile(
      capture.file,
      capture.args,
      { encoding: "utf8", timeout: capture.timeout, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        resolvedShellEnvironment ??= error ? process.env : capture.parse(stdout);
        resolve2(resolvedShellEnvironment);
      }
    ).stdin?.end();
  });
  return shellEnvironmentCapture;
}
function withoutUndecodableValues(captured, inherited) {
  const result = {};
  for (const [name, value] of Object.entries(captured)) {
    if (value === void 0 || !value.includes("�")) {
      result[name] = value;
      continue;
    }
    const fallback = inherited[name];
    if (fallback !== void 0) result[name] = fallback;
  }
  return result;
}
function parseEnvOutput(output, lineSeparator) {
  const env = {};
  for (const line of output.split(lineSeparator)) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    env[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return env;
}
function extractLaunchToken(line) {
  const match = /\bdsh web:\s*(\S+)/u.exec(line);
  if (!match?.[1]) return void 0;
  try {
    const token = new URL(match[1]).searchParams.get("token");
    return token === null || token === "" ? void 0 : token;
  } catch {
    return void 0;
  }
}
function buildHarnessArguments(port, patchPath, profile = "web") {
  return [
    ...profile === "web" ? ["web"] : ["--profile", profile],
    ...patchPath ? ["--patch", patchPath] : [],
    // The desktop window is the only intended surface. Without this, Harness
    // hands the same loopback URL to the system browser on every launch.
    "--no-open",
    "--host",
    "127.0.0.1",
    "--port",
    String(port)
  ];
}
function resolveEnvironmentPath(environment, platform2 = process.platform) {
  if (platform2 !== "win32") return environment.PATH ?? "";
  const direct = environment.Path ?? environment.PATH;
  if (direct !== void 0) return direct;
  for (const [name, value] of Object.entries(environment)) {
    if (/^path$/iu.test(name) && value !== void 0) return value;
  }
  return "";
}
function buildHarnessSpawnOptions(launchDirectory2, dshHome, platform2 = process.platform, environment = process.env) {
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...parentEnvironment } = environment;
  const pathKey = platform2 === "win32" ? "Path" : "PATH";
  const pathApi = platform2 === "win32" ? win32 : posix;
  return {
    cwd: launchDirectory2,
    env: {
      ...parentEnvironment,
      DSH_HOME: dshHome,
      NO_COLOR: "1",
      // package-import-method/child-concurrency are left at pnpm's defaults
      // (hardlink, auto concurrency): forcing clone-or-copy made every
      // install do a full physical file copy across the profile's 150+
      // packages, which is what turned installs that should take seconds
      // into multi-minute (up to 30-minute) waits on Windows. The Windows
      // locked-rename problem this was meant to route around is handled by
      // the dedicated lock-recovery runner instead (see pnpm-runner.mjs).
      npm_config_side_effects_cache: "false",
      PNPM_CONFIG_SIDE_EFFECTS_CACHE: "false",
      NODE_COMPILE_CACHE: environment.NODE_COMPILE_CACHE ?? pathApi.join(dshHome, "cache", "compile-cache"),
      [pathKey]: resolveEnvironmentPath(environment, platform2)
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: platform2 === "win32"
  };
}
function buildNodeArguments(nodeEntryPath, dshEntryPath2, port, patchPath, profile = "web") {
  return [
    "--expose-internals",
    nodeEntryPath,
    dshEntryPath2,
    ...buildHarnessArguments(port, patchPath, profile)
  ];
}
function updateReadyStability(readySince, healthy, now, stabilityWindowMs = 500) {
  if (!healthy) return { readySince: void 0, ready: false };
  const stableSince = readySince ?? now;
  return {
    readySince: stableSince,
    ready: now - stableSince >= stabilityWindowMs
  };
}
function isHarnessStartupProbeHealthy(status2, launchToken) {
  return launchToken !== void 0 && status2 >= 200 && status2 < 500;
}
class HarnessRuntime {
  constructor(options) {
    this.options = options;
  }
  options;
  child;
  logStream;
  phase = "idle";
  message = "Harness is not running.";
  launchDirectory;
  url;
  launchToken;
  /**
   * Wall clock for the current launch. Every log line carries `+<ms>` from it,
   * so a slow start can be attributed to a phase instead of guessed at: the
   * file otherwise timestamps only the `starting` line.
   */
  launchClock;
  logLines = [];
  pluginFailures = [];
  logDecoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
  logRemainders = {
    stdout: "",
    stderr: ""
  };
  snapshot() {
    return {
      phase: this.phase,
      message: this.message,
      launchDirectory: this.launchDirectory,
      url: this.url,
      authToken: this.launchToken,
      pluginFailures: structuredClone(this.pluginFailures),
      logs: [...this.logLines]
    };
  }
  launchAttempts = 0;
  get launchAttemptId() {
    return this.launchAttempts;
  }
  async start(launchDirectory2, profile = "web") {
    await this.stop();
    this.launchAttempts++;
    this.logRemainders.stdout = "";
    this.logRemainders.stderr = "";
    this.pluginFailures = [];
    this.logDecoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
    this.launchDirectory = launchDirectory2;
    this.url = void 0;
    this.launchToken = void 0;
    if (!existsSync(this.options.dshEntryPath)) {
      this.setState("failed", `Harness entry was not found: ${this.options.dshEntryPath}`);
      return;
    }
    if (!existsSync(this.options.nodeExecutablePath)) {
      this.setState("failed", `Bundled Node.js runtime was not found: ${this.options.nodeExecutablePath}`);
      return;
    }
    if (!existsSync(this.options.nodeEntryPath)) {
      this.setState("failed", `Harness diagnostic entry was not found: ${this.options.nodeEntryPath}`);
      return;
    }
    const patchPath = profile === SAFE_MODE_PROFILE ? this.options.dshSafePatchPath : this.options.dshPatchPath;
    if (!existsSync(patchPath)) {
      this.setState("failed", `DSH Desktop patch was not found: ${patchPath}`);
      return;
    }
    await mkdir(this.options.dshHome, { recursive: true });
    await mkdir(dirname(this.options.logPath), { recursive: true });
    this.logStream ??= createWriteStream(this.options.logPath, { flags: "a" });
    const preferredPort = this.options.preferredPort ?? DEFAULT_HARNESS_PORT;
    const { port, usedPreferredPort } = await reserveLoopbackPort(preferredPort);
    const url = `http://127.0.0.1:${port}`;
    const args = buildNodeArguments(
      this.options.nodeEntryPath,
      this.options.dshEntryPath,
      port,
      patchPath,
      profile
    );
    const startupTimeoutMs = this.options.startupTimeoutMs ?? (process.platform === "win32" ? 18e4 : 45e3);
    this.launchClock ??= Date.now();
    this.writeLog(`[desktop] starting ${(/* @__PURE__ */ new Date()).toISOString()}`);
    this.writeLog(`[desktop] launch directory ${launchDirectory2}`);
    this.writeLog(`[desktop] profile ${profile}`);
    this.writeLog(`[desktop] patch ${patchPath}`);
    if (!usedPreferredPort) {
      this.writeLog(
        `[desktop] preferred endpoint http://127.0.0.1:${preferredPort} is unavailable; using a temporary port`
      );
    }
    this.writeLog(`[desktop] endpoint ${url}`);
    this.setState("starting", "Starting DeepSeek Harness…");
    const shellEnvironment = await prewarmShellEnvironment();
    let child;
    try {
      child = this.options.launchProcess(
        this.options.nodeExecutablePath,
        args,
        buildHarnessSpawnOptions(
          launchDirectory2,
          this.options.dshHome,
          process.platform,
          shellEnvironment
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.writeLog(`[utility] launch failed: ${message}`);
      this.setState("failed", `Harness could not start: ${message}`);
      return;
    }
    this.child = child;
    child.stdout.on("data", (chunk) => {
      if (this.child === child) this.writeChunk("stdout", chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (this.child !== child) return;
      this.writeChunk("stderr", chunk);
      if (this.child !== child || this.phase !== "starting") return;
      const cause = extractDshEntryFailureCause(this.logLines);
      if (!cause) return;
      this.child = void 0;
      this.url = void 0;
      this.launchToken = void 0;
      this.writeLog("[desktop] Harness entry failed during startup; stopping immediately");
      this.setState("failed", `Harness could not start.
${cause}`);
      void this.stopChild(child).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.writeLog(`[desktop] failed to stop rejected Harness launch: ${detail}`);
      });
    });
    child.once("spawn", () => this.writeLog("[desktop] Bundled Node.js Harness process started"));
    child.once("error", (error) => {
      this.writeLog(`[node] ${error.stack ?? error.message}`);
      if (this.child !== child) return;
      this.child = void 0;
      this.setState("failed", `Harness could not start: ${error.message}`);
    });
    child.once("exit", (code, signal) => {
      this.flushLogRemainders();
      const detail = signal ? `signal ${signal}` : formatExitCode(code ?? -1);
      this.writeLog(`[node] Harness process exited (${detail})`);
      if (this.child !== child) return;
      this.child = void 0;
      const cause = extractFailureCause(this.logLines);
      this.setState(
        "failed",
        cause ? `Harness stopped unexpectedly (${detail}).
${cause}` : `Harness stopped unexpectedly (${detail}).`
      );
    });
    const startedAt = Date.now();
    const progressTimer = setInterval(
      () => this.writeLog(`[desktop] waiting for Harness (${Math.round((Date.now() - startedAt) / 1e3)}s)`),
      5e3
    );
    const ready = await waitUntilReady(
      url,
      () => this.child === child && child.exitCode === null,
      () => this.launchToken,
      startupTimeoutMs
    ).finally(() => clearInterval(progressTimer));
    if (this.child !== child) return;
    if (!ready) {
      await this.stopChild(child);
      this.setState(
        "failed",
        `Harness did not become ready within ${Math.round(startupTimeoutMs / 1e3)} seconds.`
      );
      return;
    }
    this.url = url;
    this.writeLog("[desktop] Harness is ready");
    this.setState("ready", "Harness is ready.");
  }
  async stop() {
    const child = this.child;
    if (!child) {
      this.closeLog();
      if (this.phase !== "failed") this.setState("idle", "Harness is not running.");
      return;
    }
    this.setState("stopping", "Stopping Harness…");
    this.child = void 0;
    await this.stopChild(child);
    this.closeLog();
    this.url = void 0;
    this.launchToken = void 0;
    this.setState("idle", "Harness is not running.");
  }
  async stopChild(child) {
    if (child.exitCode !== null) return;
    const exitPromise = new Promise(
      (resolve2) => child.once("exit", () => resolve2(true))
    );
    child.kill("SIGTERM");
    const exited = await Promise.race([
      exitPromise,
      new Promise((resolve2) => setTimeout(() => resolve2(false), 4e3))
    ]);
    if (!exited && child.exitCode === null) child.kill("SIGKILL");
  }
  setState(phase, message) {
    this.phase = phase;
    this.message = message;
    this.options.onChanged(this.snapshot());
  }
  writeChunk(source, chunk) {
    const lines = `${this.logRemainders[source]}${this.logDecoders[source].write(chunk)}`.split(/\r?\n/);
    this.logRemainders[source] = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length === 0) continue;
      if (source === "stderr" && this.phase === "starting") {
        const failures = parsePluginStartupFailures(line);
        if (failures) this.pluginFailures.push(...failures);
      }
      this.writeLog(`[${source}] ${line}`);
      const hadToken = this.launchToken !== void 0;
      this.launchToken ??= extractLaunchToken(line);
      if (!hadToken && this.launchToken !== void 0) {
        this.writeLog("[desktop] Harness announced its endpoint; probing until it answers");
      }
    }
  }
  flushLogRemainders() {
    for (const source of ["stdout", "stderr"]) {
      const line = this.logRemainders[source] + this.logDecoders[source].end();
      this.logRemainders[source] = "";
      if (line.length > 0) this.writeLog(`[${source}] ${line}`);
    }
  }
  /**
   * Record a line the desktop wants in the Harness log, including before a
   * launch: what happens to the profile between launches is exactly what
   * someone reading the log after a failed install needs to see.
   */
  /**
   * Start this launch's clock before any pre-flight work runs. Profile
   * maintenance — migration recovery, the pnpm store, generation projection,
   * LaunchAgent audit — happens before `start()`, so a clock that began at
   * `starting` hid all of it and made the launch look faster than it felt.
   */
  beginLaunch(reason) {
    this.launchClock = Date.now();
    this.note(`
[desktop] launch requested (${reason})`);
  }
  note(line) {
    if (!this.logStream) {
      try {
        mkdirSync(dirname(this.options.logPath), { recursive: true });
        this.logStream = createWriteStream(this.options.logPath, { flags: "a" });
      } catch {
      }
    }
    this.writeLog(line);
  }
  writeLog(line) {
    this.logLines.push(line);
    if (this.logLines.length > 200) this.logLines.splice(0, this.logLines.length - 200);
    this.logStream?.write(`${this.stampLog(line)}
`);
  }
  /**
   * Prefix a log line with an ISO date and milliseconds since this launch began.
   * Only the file copy is stamped: `logLines` feeds recovery detection and failure-cause
   * extraction, which match on the line text.
   */
  stampLog(line) {
    const iso = (/* @__PURE__ */ new Date()).toISOString();
    const elapsed = this.launchClock !== void 0 ? `+${String(Date.now() - this.launchClock).padStart(5)}ms ` : "";
    const stamp = `[${iso}] ${elapsed}`;
    return line.startsWith("\n") ? `
${stamp}${line.slice(1)}` : `${stamp}${line}`;
  }
  flushLog() {
    const stream = this.logStream;
    if (!stream || stream.destroyed || stream.writableEnded) return Promise.resolve();
    return new Promise((resolve2, reject) => {
      stream.write("", (error) => error ? reject(error) : resolve2());
    });
  }
  closeLog() {
    this.logStream?.end();
    this.logStream = void 0;
  }
}
function latestHarnessAttemptLogs(logLines) {
  for (let index = logLines.length - 1; index >= 0; index -= 1) {
    if (logLines[index]?.trimStart().startsWith("[desktop] starting ")) {
      return logLines.slice(index + 1);
    }
  }
  return logLines;
}
function extractFailureCause(logLines) {
  const stderrLines = [];
  let dshEntryError;
  let uncaughtError;
  for (const line of latestHarnessAttemptLogs(logLines)) {
    if (!line.startsWith("[stderr] ")) continue;
    const text = line.slice(8);
    stderrLines.push(text);
    if (dshEntryError === void 0) {
      const m = text.match(/DSH entry failed:\s*(.+)/);
      if (m && m[1]) dshEntryError = m[1].trim();
    }
    if (uncaughtError === void 0) {
      const m1 = text.match(/uncaught exception:\s*(.+)/);
      if (m1 && m1[1]) {
        uncaughtError = m1[1].trim();
      } else {
        const m2 = text.match(/unhandled rejection:\s*(.+)/);
        if (m2 && m2[1]) uncaughtError = m2[1].trim();
      }
    }
  }
  if (dshEntryError) return dshEntryError;
  if (uncaughtError) return uncaughtError;
  for (let i = stderrLines.length - 1; i >= 0; i--) {
    const line = stderrLines[i]?.trim();
    if (!line) continue;
    if (line.length < 200 && /\b(error|Error|ERROR|failed|Failed|FAILED)\b/.test(line)) {
      return line;
    }
  }
  if (stderrLines.length > 0) {
    const last = stderrLines[stderrLines.length - 1]?.trim();
    if (last && last.length < 200) return last;
  }
  return void 0;
}
function extractDshEntryFailureCause(logLines) {
  for (const line of latestHarnessAttemptLogs(logLines)) {
    if (!line.startsWith("[stderr] ")) continue;
    const match = line.slice(8).match(/DSH entry failed:\s*(.+)/);
    if (match?.[1]) return match[1].trim();
  }
  return void 0;
}
const PACKAGE_REFERENCE_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
function isPackageReference(value) {
  const candidate = value.trim();
  if (!candidate || candidate.includes(":")) return false;
  return PACKAGE_REFERENCE_PATTERN.test(candidate);
}
function extractPluginReferences(logLines, accepts) {
  const plugins = /* @__PURE__ */ new Set();
  const attemptLogs = latestHarnessAttemptLogs(logLines);
  const hasDuplicatePrefixRoute = attemptLogs.some(
    (line) => line.startsWith("[stderr] ") && /duplicate prefix route ["'][^"']+["']/i.test(line)
  );
  for (const line of attemptLogs) {
    if (!line.startsWith("[stderr] ")) continue;
    const text = line.slice(8);
    const bootFailureLines = text.split(/\r?\n/).map((value) => value.trim());
    for (const match of text.matchAll(
      /failed to (?:apply|import) loader entry [^\s]+ \((@[^)]+|[^)]+)\)/gi
    )) {
      if (match[1] && accepts(match[1])) plugins.add(match[1].trim());
    }
    const m2 = text.match(/cannot resolve profile bundle ["']([^"']+)["']/i);
    if (m2 && m2[1] && accepts(m2[1])) {
      plugins.add(m2[1].trim());
    }
    const m3 = text.match(/profile bundle ["']([^"']+)["'] declares no dsh\.bundle/i);
    if (m3 && m3[1] && accepts(m3[1])) {
      plugins.add(m3[1].trim());
    }
    const m5 = text.match(/plugin\(s\) failed to load:\s*([a-zA-Z0-9@/_-]+)/i);
    if (m5 && m5[1] && accepts(m5[1])) {
      plugins.add(m5[1].trim());
    }
    for (const candidate of bootFailureLines) {
      const pendingEntry = candidate.match(
        /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*):\s*pending\s*\(waiting for service:\s*[^)]+\)\s*$/i
      );
      if (pendingEntry?.[1] && accepts(pendingEntry[1])) {
        plugins.add(pendingEntry[1].trim());
      }
    }
    if (hasDuplicatePrefixRoute) {
      for (const match of text.matchAll(
        /[\\/]profiles[\\/][^\\/\s]+[\\/]node_modules[\\/]((?:@[^\\/\s]+[\\/])?[^\\/\s)]+)/gi
      )) {
        const candidate = match[1]?.replace(/\\/g, "/");
        if (candidate && accepts(candidate)) plugins.add(candidate.trim());
      }
    }
    const bootFailureTitle = bootFailureLines.findIndex((value) => value === "Failed to load plugins");
    if (bootFailureTitle >= 0) {
      for (const candidate of bootFailureLines.slice(bootFailureTitle + 1)) {
        if (accepts(candidate)) plugins.add(candidate);
      }
    }
  }
  return [...plugins];
}
function extractPluginFailureReferences(logLines) {
  return extractPluginReferences(logLines, isPackageReference);
}
function extractDuplicateLoaderEntryId(logLines) {
  for (const line of latestHarnessAttemptLogs(logLines)) {
    if (!line.startsWith("[stderr] ")) continue;
    const match = line.slice(8).match(/duplicate loader entry id:\s*["']?([^\s"']+)["']?/i);
    if (match?.[1]) return match[1].trim();
  }
  return void 0;
}
function extractSlotConflictName(logLines) {
  for (const line of latestHarnessAttemptLogs(logLines)) {
    if (!line.startsWith("[stderr] ")) continue;
    const text = line.slice(8);
    const loaderMatch = text.match(
      /single slot\s+["']([^"']+)["']\s+already has a registration/i
    );
    if (loaderMatch?.[1]) return loaderMatch[1].trim();
    const rendererMatch = text.match(
      /UI slot\s+["']([^"']+)["']\s+has duplicate registrations/i
    );
    if (rendererMatch?.[1]) return rendererMatch[1].trim();
  }
  return void 0;
}
function formatExitCode(code) {
  const unsigned = code >>> 0;
  const hexadecimal = `0x${unsigned.toString(16).padStart(8, "0").toUpperCase()}`;
  if (unsigned === 4294930435) {
    return `exit code ${unsigned} (${hexadecimal}, Crashpad handler unavailable)`;
  }
  return `exit code ${code} (${hexadecimal})`;
}
async function reservePort(port) {
  return new Promise((resolve2, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local port."));
        return;
      }
      const { port: port2 } = address;
      server.close((error) => error ? reject(error) : resolve2(port2));
    });
  });
}
async function reserveLoopbackPort(preferredPort = DEFAULT_HARNESS_PORT) {
  try {
    return { port: await reservePort(preferredPort), usedPreferredPort: true };
  } catch {
    return { port: await reservePort(0), usedPreferredPort: false };
  }
}
async function waitUntilReady(url, isAlive, launchToken, timeoutMs) {
  let deadline = Date.now() + timeoutMs;
  let extendedForLaunch = false;
  const stabilityWindowMs = 0;
  let readySince;
  while (Date.now() < deadline && isAlive()) {
    if (!extendedForLaunch && launchToken() !== void 0) {
      extendedForLaunch = true;
      deadline = Math.max(deadline, Date.now() + 3e4);
    }
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1e3) });
      const stability = updateReadyStability(
        readySince,
        isHarnessStartupProbeHealthy(response.status, launchToken()),
        Date.now(),
        stabilityWindowMs
      );
      readySince = stability.readySince;
      if (stability.ready) return true;
    } catch {
      readySince = updateReadyStability(readySince, false, Date.now()).readySince;
    }
    await new Promise((resolve2) => setTimeout(resolve2, 100));
  }
  return false;
}
function buildDisclaimedUtilityProcessSpec(nodeArguments, spawnOptions, utilityProcessOptions) {
  const [internalLoaderFlag, modulePath, ...args] = nodeArguments;
  if (internalLoaderFlag !== "--expose-internals" || !modulePath) {
    throw new Error("Unexpected Harness Node arguments for the macOS utility process.");
  }
  return {
    modulePath,
    args,
    options: {
      cwd: typeof spawnOptions.cwd === "string" ? spawnOptions.cwd : spawnOptions.cwd ? fileURLToPath(spawnOptions.cwd) : void 0,
      env: definedEnvironment(spawnOptions.env),
      execArgv: [internalLoaderFlag],
      stdio: "pipe",
      serviceName: "DSH Harness",
      // Harness loads user-installed plugins and can launch third-party tools.
      // Keep their TCC requests out of DSH Desktop's responsibility chain in production.
      disclaim: utilityProcessOptions?.disclaim ?? true
    }
  };
}
function launchDisclaimedUtilityProcess(launcher, nodeArguments, spawnOptions, utilityProcessOptions) {
  const spec = buildDisclaimedUtilityProcessSpec(
    nodeArguments,
    spawnOptions,
    utilityProcessOptions
  );
  return new UtilityProcessAdapter(
    launcher.fork(spec.modulePath, spec.args, spec.options)
  );
}
function definedEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment ?? {}).filter(
      (entry) => entry[1] !== void 0
    )
  );
}
class UtilityProcessAdapter extends EventEmitter {
  constructor(child) {
    super();
    this.child = child;
    if (!child.stdout || !child.stderr) {
      child.kill();
      throw new Error("The DSH Harness utility process did not expose piped output.");
    }
    this.stdout = child.stdout;
    this.stderr = child.stderr;
    child.once("spawn", () => this.emit("spawn"));
    child.once("error", (type, location, report) => {
      const detail = [type, location, report].filter(Boolean).join(": ");
      this.emit("error", new Error(`Harness utility process failed: ${detail}`));
    });
    child.once("exit", (code) => {
      this.exitCode = code;
      this.emit("exit", code, null);
    });
  }
  child;
  stdout;
  stderr;
  exitCode = null;
  kill(signal) {
    if (signal === "SIGKILL" && this.child.pid !== void 0) {
      try {
        process.kill(this.child.pid, signal);
        return true;
      } catch {
        return false;
      }
    }
    return this.child.kill();
  }
}
const PROFILE = "web";
const OPERATION_TIMEOUT_MS = 15 * 60 * 1e3;
const REPAIR_CAP_MS = 30 * 60 * 1e3;
const IDLE_TIMEOUT_MS = 2 * 60 * 1e3;
const PROGRESS_POLL_MS = 5 * 1e3;
const PROGRESS_SCAN_DEPTH = 5;
const PROGRESS_SCAN_LIMIT = 1024;
const MAX_OUTPUT_BYTES = 32 * 1024;
function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
function buildProfilePluginRemoveArguments(dshEntryPath2, pluginName, workspaceRoot = false) {
  return [
    dshEntryPath2,
    "plugin",
    "--profile",
    PROFILE,
    "remove",
    ...workspaceRoot ? ["--workspace-root"] : [],
    pluginName
  ];
}
function buildProfileInstallArguments(dshEntryPath2) {
  return [dshEntryPath2, "plugin", "--profile", PROFILE, "install", "--no-frozen-lockfile"];
}
function buildPnpmShimCommand(options) {
  const runner = options.pnpmRunnerPath !== void 0 && existsSync(options.pnpmRunnerPath) ? [options.pnpmRunnerPath] : [];
  return [...runner, options.pnpmEntryPath];
}
async function ensureProfilePnpmShim(options) {
  const directory = join(options.dshHome, ".desktop-bin");
  await mkdir(directory, { recursive: true });
  const command = buildPnpmShimCommand(options);
  if (command.length === 1 && await profileHasGenerationProjection(options.dshHome)) {
    throw new Error(
      "The generation-aware pnpm runner is unavailable; refusing to mutate the projected Profile."
    );
  }
  if (process.platform === "win32") {
    await writeFile(
      join(directory, "pnpm.cmd"),
      `@chcp 65001 >nul\r
@echo off\r
"${options.nodeExecutablePath}" ${command.map((part) => `"${part}"`).join(" ")} %*\r
`,
      "utf8"
    );
    await writeFile(
      join(directory, "node.cmd"),
      `@chcp 65001 >nul\r
@echo off\r
"${options.nodeExecutablePath}" %*\r
`,
      "utf8"
    );
  } else {
    const pnpmPath = join(directory, "pnpm");
    await writeFile(
      pnpmPath,
      `#!/bin/sh
exec ${shellQuote(options.nodeExecutablePath)} ${command.map(shellQuote).join(" ")} "$@"
`,
      { encoding: "utf8", mode: 493 }
    );
    await chmod(pnpmPath, 493);
    const nodePath = join(directory, "node");
    await writeFile(
      nodePath,
      `#!/bin/sh
exec ${shellQuote(options.nodeExecutablePath)} "$@"
`,
      { encoding: "utf8", mode: 493 }
    );
    await chmod(nodePath, 493);
  }
  return directory;
}
async function profileHasGenerationProjection(dshHome) {
  try {
    const manifest = JSON.parse(
      await readFile(join(dshHome, "profiles", PROFILE, "package.json"), "utf8")
    );
    const plugins = manifest.dsh?.desktop?.generationProjection?.plugins;
    return typeof plugins === "object" && plugins !== null && Object.keys(plugins).length > 0;
  } catch {
    return false;
  }
}
function buildProfilePluginCommandEnvironment(environment, shimDirectory, nodeExecutablePath) {
  const result = { ...environment };
  delete result.ELECTRON_RUN_AS_NODE;
  const currentPath = resolveEnvironmentPath(result);
  const parts = currentPath.split(delimiter).filter(Boolean);
  const additions = [shimDirectory, dirname(nodeExecutablePath)].filter(
    (directory) => !parts.includes(directory)
  );
  const nextPath = [...additions, currentPath].filter(Boolean).join(delimiter);
  result.PATH = nextPath;
  if (process.platform === "win32") result.Path = nextPath;
  result.DSH_HOME = result.DSH_HOME ?? "";
  result.CI = "true";
  result.NO_COLOR = "1";
  result.npm_config_side_effects_cache = "false";
  result.PNPM_CONFIG_SIDE_EFFECTS_CACHE = "false";
  return result;
}
function diagnosticLine(output) {
  const lines = output.trim().split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const named = lines.filter(
    (line) => /EPERM|EBUSY|EACCES|EEXIST|ENOTEMPTY|ENOENT|ERR_PNPM|error:/u.test(line)
  );
  return (named.at(-1) ?? lines.at(-1))?.slice(0, 800);
}
async function progressSignature(profileDirectory2) {
  const root = join(profileDirectory2, "node_modules");
  const queue = [{ path: root, depth: 0 }];
  let directories = 0;
  let latest = 0;
  while (queue.length > 0 && directories < PROGRESS_SCAN_LIMIT) {
    const { path, depth } = queue.shift();
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      continue;
    }
    directories += 1;
    try {
      const info = await stat(path);
      if (info.mtimeMs > latest) latest = info.mtimeMs;
    } catch {
    }
    if (depth >= PROGRESS_SCAN_DEPTH) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      queue.push({ path: join(path, entry.name), depth: depth + 1 });
    }
  }
  return `${directories}:${latest}`;
}
function killProcessTree(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore"
    }).unref();
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}
async function removeProfilePluginWithDsh(options, pluginName, workspaceRoot = false) {
  return runProfileCommand(
    options,
    buildProfilePluginRemoveArguments(options.dshEntryPath, pluginName, workspaceRoot),
    "Plugin removal",
    OPERATION_TIMEOUT_MS
  );
}
async function installProfileDependenciesWithDsh(options, timeoutMs = REPAIR_CAP_MS) {
  return runProfileCommand(options, buildProfileInstallArguments(options.dshEntryPath), "Profile repair", timeoutMs);
}
async function runProfileCommand(options, commandArguments, label, timeoutMs, idleTimeoutMs = IDLE_TIMEOUT_MS) {
  const requiredPaths = [
    options.dshEntryPath,
    options.nodeExecutablePath,
    options.pnpmEntryPath
  ];
  if (requiredPaths.some((path) => !existsSync(path))) {
    return { ok: false, detail: "The bundled DSH, Node.js, or pnpm runtime was not found." };
  }
  const profileDirectory2 = join(options.dshHome, "profiles", PROFILE);
  if (!existsSync(profileDirectory2)) {
    return { ok: false, detail: "The web profile directory was not found." };
  }
  try {
    const shimDirectory = await ensureProfilePnpmShim(options);
    const environment = buildProfilePluginCommandEnvironment(
      options.environment ?? process.env,
      shimDirectory,
      options.nodeExecutablePath
    );
    environment.DSH_HOME = options.dshHome;
    const child = spawn(
      options.nodeExecutablePath,
      commandArguments,
      {
        cwd: profileDirectory2,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32"
      }
    );
    const completion = new Promise((resolve2) => {
      child.once("error", (error) => resolve2({ error }));
      child.once("exit", (code, signal) => resolve2({ exit: { code, signal } }));
    });
    let output = "";
    const append = (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-MAX_OUTPUT_BYTES);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const started2 = Date.now();
    let lastProgress = started2;
    let signature = await progressSignature(profileDirectory2);
    let expiry;
    const noteProgress = () => {
      lastProgress = Date.now();
    };
    child.stdout?.on("data", noteProgress);
    child.stderr?.on("data", noteProgress);
    const monitor = setInterval(() => {
      void (async () => {
        const current = await progressSignature(profileDirectory2);
        if (current !== signature) {
          signature = current;
          noteProgress();
        }
        const now = Date.now();
        if (now - started2 >= timeoutMs) expiry = "cap";
        else if (now - lastProgress >= idleTimeoutMs) expiry = "idle";
        else return;
        killProcessTree(child);
      })();
    }, PROGRESS_POLL_MS);
    try {
      const outcome = await completion;
      if ("error" in outcome) throw outcome.error;
      const { exit } = outcome;
      if (expiry !== void 0) {
        return {
          ok: false,
          detail: expiry === "idle" ? `${label} stalled: no progress for ${Math.round(idleTimeoutMs / 1e3)}s.` : `${label} timed out after ${Math.round(timeoutMs / 6e4)} minutes.`
        };
      }
      if (exit.code !== 0) {
        const detail = diagnosticLine(output);
        return {
          ok: false,
          detail: detail || `${label} exited with ${exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`}.`
        };
      }
      return { ok: true };
    } finally {
      clearInterval(monitor);
    }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}
async function removeTree(path) {
  let entry;
  try {
    entry = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    await unlink(path);
    return;
  }
  const children = await readdir(path, { withFileTypes: true });
  for (const child of children) {
    await removeTree(join(path, child.name));
  }
  await rmdir(path);
}
function bundleEntryIds(patchText) {
  let value;
  try {
    value = distExports.parse(patchText);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const ids = [];
  for (const row of value) {
    const insert = row?.insert;
    if (!Array.isArray(insert)) continue;
    for (const entry of insert) {
      const id = entry?.id;
      if (typeof id === "string") ids.push(id);
    }
  }
  return ids;
}
function belongsToPlugin(name, plugin) {
  return typeof name === "string" && (name === plugin || name.startsWith(`${plugin}/`));
}
function prunePatchLayer(text, plugin, entryIds) {
  let document;
  try {
    document = distExports.parseDocument(text);
  } catch {
    return { text, removed: [] };
  }
  const contents = document.contents;
  if (!distExports.isSeq(contents)) return { text, removed: [] };
  const removed = [];
  const kept = [];
  let header;
  for (const [index, row] of contents.items.entries()) {
    if (!distExports.isMap(row)) {
      kept.push(row);
      continue;
    }
    const id = row.get("id");
    if (typeof id === "string" && entryIds.includes(id)) {
      removed.push(`id: ${id}`);
      if (index === 0) header = row.commentBefore;
      continue;
    }
    const insert = row.get("insert");
    if (distExports.isSeq(insert)) {
      const survivors = insert.items.filter((entry) => {
        const name = distExports.isMap(entry) ? entry.get("name") : void 0;
        if (!belongsToPlugin(name, plugin)) return true;
        removed.push(`insert: ${String(name)}`);
        return false;
      });
      if (survivors.length === 0 && insert.items.length > 0) {
        if (index === 0) header = row.commentBefore;
        continue;
      }
      insert.items = survivors;
    }
    kept.push(row);
  }
  if (removed.length === 0) return { text, removed };
  if (typeof header === "string") {
    const first = kept[0];
    if (distExports.isMap(first)) first.commentBefore = [header, first.commentBefore].filter(Boolean).join("\n");
    else document.commentBefore = header;
  }
  contents.items = kept;
  return { text: String(document), removed };
}
function profilePackageJsonPath(dshHome) {
  return join(dshHome, "profiles", "web", "package.json");
}
function profileCordisPatchPath(dshHome) {
  return join(dshHome, "profiles", "web", "cordis.patch.yml");
}
async function resolveStartupFailureOwners(dshHome, owners, excludedPlugins = []) {
  try {
    const manifest = JSON.parse(await readFile(profilePackageJsonPath(dshHome), "utf8"));
    const configured = new Set(configuredProfilePlugins(manifest));
    const excluded = new Set(excludedPlugins);
    return [...new Set(owners)].filter((owner) => configured.has(owner) && !excluded.has(owner));
  } catch {
    return [];
  }
}
const CORE_BUNDLES = /* @__PURE__ */ new Set(["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dshmarket"]);
const PACKAGE_NAME_PATTERN$1 = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
function yamlPackageNamePattern(packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^\\s*name:\\s*(?:["']${escaped}["']|${escaped})(?:\\s*(?:#.*)?)?$`,
    "m"
  );
}
function isThirdPartyPackageName(packageName) {
  return PACKAGE_NAME_PATTERN$1.test(packageName) && !packageName.startsWith("@deepseek-ai/") && !CORE_BUNDLES.has(packageName);
}
function configuredProfilePlugins(manifest) {
  const dependencies = manifest.dependencies ?? {};
  const bundles = new Set(manifest.dsh?.profile?.bundles ?? []);
  const plugins = [];
  for (const dep of Object.keys(dependencies)) {
    if (bundles.has(dep) && isThirdPartyPackageName(dep)) {
      plugins.push(dep);
    }
  }
  return plugins;
}
async function isStaleGenerationBundle(dshHome, packageName) {
  const packagePath = join(dshHome, "profiles", "web", "node_modules", packageName);
  const generationsDirectory = resolve(dshHome, "profiles", ".generations", "live");
  try {
    if (!(await lstat(packagePath)).isSymbolicLink()) return false;
    const resolvedPackagePath = await realpath(packagePath);
    const insideGenerations = relative(generationsDirectory, resolvedPackagePath);
    if (insideGenerations === "" || insideGenerations === ".." || insideGenerations.startsWith(`..${sep}`) || isAbsolute(insideGenerations)) return false;
    const segments = insideGenerations.split(sep);
    const packageSegments = packageName.split("/");
    if (segments.length !== packageSegments.length + 2 || segments[1] !== "node_modules" || !packageSegments.every((segment, index) => segments[index + 2] === segment)) return false;
    const generation = JSON.parse(
      await readFile(join(generationsDirectory, segments[0], "generation.json"), "utf8")
    );
    return generation.pluginName === packageName;
  } catch {
    return false;
  }
}
async function listInstalledProfilePlugins(dshHome) {
  try {
    const manifest = JSON.parse(
      await readFile(profilePackageJsonPath(dshHome), "utf8")
    );
    const dependencies = manifest.dependencies ?? {};
    const configuredPlugins = configuredProfilePlugins(manifest);
    const residualCandidates = (manifest.dsh?.profile?.bundles ?? []).filter(
      (bundle) => isThirdPartyPackageName(bundle) && !(bundle in dependencies)
    );
    const residualPlugins = await Promise.all(
      residualCandidates.map(
        async (bundle) => await isStaleGenerationBundle(dshHome, bundle) ? bundle : void 0
      )
    );
    const plugins = [.../* @__PURE__ */ new Set([
      ...configuredPlugins,
      ...residualPlugins.filter((plugin) => plugin !== void 0)
    ])];
    const modulesDirectory = join(dshHome, "profiles", "web", "node_modules");
    const entries = await Promise.all(
      plugins.map(async (name, index) => {
        try {
          const info = await lstat(join(modulesDirectory, name));
          return { name, index, installedAt: Math.max(info.birthtimeMs, info.mtimeMs) };
        } catch {
          return { name, index, installedAt: void 0 };
        }
      })
    );
    entries.sort((left, right) => {
      if (left.installedAt === void 0 && right.installedAt === void 0) {
        return left.index - right.index;
      }
      if (left.installedAt === void 0) return 1;
      if (right.installedAt === void 0) return -1;
      return right.installedAt - left.installedAt || left.index - right.index;
    });
    return entries.map(({ name }) => name);
  } catch {
    return [];
  }
}
async function bundleOwnsPackage(profileDirectory2, bundle, packageName) {
  const packageDirectory = join(profileDirectory2, "node_modules", bundle);
  try {
    const rawManifest = await readFile(join(packageDirectory, "package.json"), "utf8");
    const manifest = JSON.parse(rawManifest);
    if (packageName in (manifest.dependencies ?? {}) || packageName in (manifest.optionalDependencies ?? {})) {
      return true;
    }
    const patch = manifest.dsh?.bundle?.patch;
    if (!patch) return false;
    const rawPatch = await readFile(resolve(packageDirectory, patch), "utf8");
    return yamlPackageNamePattern(packageName).test(rawPatch);
  } catch {
    return false;
  }
}
function loaderEntryPattern(entryId) {
  const escaped = entryId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^\\s*-\\s+id:\\s*(?:["']${escaped}["']|${escaped})(?:\\s*(?:#.*)?)?$`,
    "m"
  );
}
async function bundleDeclaresLoaderEntry(profileDirectory2, bundle, entryId) {
  const packageDirectory = join(profileDirectory2, "node_modules", bundle);
  const packageJsonPath = join(packageDirectory, "package.json");
  try {
    const rawManifest = await readFile(packageJsonPath, "utf8");
    const bundleManifest = JSON.parse(rawManifest);
    const patch = bundleManifest.dsh?.bundle?.patch;
    if (!patch) return false;
    const patchPath = resolve(packageDirectory, patch);
    const rawPatch = await readFile(patchPath, "utf8");
    return loaderEntryPattern(entryId).test(rawPatch);
  } catch {
    return false;
  }
}
async function pluginMatchesSlot(profileDirectory2, plugin, slotName) {
  const packageDir = join(profileDirectory2, "node_modules", plugin);
  const filesToCheck = [
    "cordis.patch.yml",
    "client.js",
    "lib/client.js",
    "dist/client.js",
    "package.json",
    "index.js",
    "lib/index.js",
    "dist/index.js"
  ];
  for (const file of filesToCheck) {
    try {
      const content = await readFile(join(packageDir, file), "utf8");
      if (content.includes(slotName)) return true;
    } catch {
    }
  }
  return false;
}
async function packagesProvidingSlot(nodeModulesPath, slotName) {
  const scopeDirectory = join(nodeModulesPath, "@deepseek-ai");
  const providers = [];
  try {
    const entries = await readdir(scopeDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.startsWith("dsh-client-ui-")) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const packageName = `@deepseek-ai/${entry.name}`;
      for (const file of ["client.js", "lib/client.js", "dist/client.js"]) {
        try {
          const content = await readFile(join(scopeDirectory, entry.name, file), "utf8");
          if (content.includes(slotName)) {
            providers.push(packageName);
            break;
          }
        } catch {
        }
      }
    }
  } catch {
  }
  return providers;
}
async function pluginReferencesPackage(profileDirectory2, plugin, packageNames) {
  const packageDirectory = join(profileDirectory2, "node_modules", plugin);
  try {
    const rawManifest = await readFile(join(packageDirectory, "package.json"), "utf8");
    const manifest = JSON.parse(rawManifest);
    const declaredPackages = /* @__PURE__ */ new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {})
    ]);
    if ([...packageNames].some((packageName) => declaredPackages.has(packageName))) return true;
  } catch {
  }
  for (const file of ["cordis.patch.yml", "index.js", "lib/index.js", "dist/index.js"]) {
    try {
      const content = await readFile(join(packageDirectory, file), "utf8");
      if ([...packageNames].some((packageName) => content.includes(packageName))) return true;
    } catch {
    }
  }
  return false;
}
async function resolveProfileRecoveryPlugins(dshHome, detectedPlugins, duplicateLoaderEntryId, slotConflictName, excludedPlugins = [], slotProviderNodeModulesPaths = []) {
  const manifestPath = profilePackageJsonPath(dshHome);
  try {
    const raw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    const excludedSet = new Set(excludedPlugins);
    const configuredPlugins = configuredProfilePlugins(manifest).filter(
      (plugin) => !excludedSet.has(plugin)
    );
    const configuredSet = new Set(configuredPlugins);
    const profileDirectory2 = dirname(manifestPath);
    const directlyConfiguredFailures = /* @__PURE__ */ new Set();
    const matchedPlugins = /* @__PURE__ */ new Set();
    for (const detected of detectedPlugins) {
      if (!PACKAGE_NAME_PATTERN$1.test(detected)) continue;
      if (configuredSet.has(detected)) {
        directlyConfiguredFailures.add(detected);
        continue;
      }
      for (const configured of configuredPlugins) {
        if (await bundleOwnsPackage(profileDirectory2, configured, detected)) {
          matchedPlugins.add(configured);
        }
      }
    }
    if (directlyConfiguredFailures.size > 0) return [...directlyConfiguredFailures];
    if (matchedPlugins.size === 1) return [...matchedPlugins];
    const dynamicallyReferencedOwners = /* @__PURE__ */ new Set();
    for (const detected of detectedPlugins) {
      if (!PACKAGE_NAME_PATTERN$1.test(detected) || configuredSet.has(detected)) continue;
      const packageNames = /* @__PURE__ */ new Set([detected]);
      for (const configured of configuredPlugins) {
        if (await pluginReferencesPackage(profileDirectory2, configured, packageNames)) {
          dynamicallyReferencedOwners.add(configured);
        }
      }
    }
    if (dynamicallyReferencedOwners.size === 1) return [...dynamicallyReferencedOwners];
    if (duplicateLoaderEntryId) {
      let offendingPlugin;
      for (const plugin of configuredPlugins) {
        if (await bundleDeclaresLoaderEntry(profileDirectory2, plugin, duplicateLoaderEntryId)) {
          offendingPlugin = plugin;
        }
      }
      if (offendingPlugin) return [offendingPlugin];
    }
    if (slotConflictName) {
      const slotMatched = /* @__PURE__ */ new Set();
      for (const plugin of configuredPlugins) {
        if (await pluginMatchesSlot(profileDirectory2, plugin, slotConflictName)) {
          slotMatched.add(plugin);
        }
      }
      if (slotMatched.size === 1) return [...slotMatched];
      const providerPackages = /* @__PURE__ */ new Set();
      const searchPaths = [
        join(profileDirectory2, "node_modules"),
        ...slotProviderNodeModulesPaths
      ];
      for (const nodeModulesPath of searchPaths) {
        for (const packageName of await packagesProvidingSlot(nodeModulesPath, slotConflictName)) {
          providerPackages.add(packageName);
        }
      }
      if (providerPackages.size > 0) {
        const providerOwners = /* @__PURE__ */ new Set();
        for (const plugin of configuredPlugins) {
          if (await pluginReferencesPackage(profileDirectory2, plugin, providerPackages)) {
            providerOwners.add(plugin);
          }
        }
        if (providerOwners.size === 1) return [...providerOwners];
      }
    }
    return [];
  } catch {
    return [];
  }
}
async function pluginDeclaredEntryIds(profileDirectory2, pluginName) {
  const packageDirectory = join(profileDirectory2, "node_modules", pluginName);
  try {
    const manifest = JSON.parse(
      await readFile(join(packageDirectory, "package.json"), "utf8")
    );
    const patch = manifest.dsh?.bundle?.patch;
    if (!patch) return [];
    return bundleEntryIds(await readFile(resolve(packageDirectory, patch), "utf8"));
  } catch {
    return [];
  }
}
async function prunePluginPatchLayer(dshHome, pluginName, entryIds) {
  const patchPath = profileCordisPatchPath(dshHome);
  try {
    const text = await readFile(patchPath, "utf8");
    const pruned = prunePatchLayer(text, pluginName, entryIds);
    if (pruned.removed.length === 0) return [];
    await writeFile(patchPath, pruned.text, "utf8");
    return pruned.removed;
  } catch {
    return [];
  }
}
async function resetPluginProfile(dshHome, failingPlugin, matchRelatedPackages = true) {
  const manifestPath = profilePackageJsonPath(dshHome);
  if (!existsSync(manifestPath)) return false;
  if (failingPlugin && !isThirdPartyPackageName(failingPlugin)) return false;
  try {
    const raw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    let modified = false;
    if (failingPlugin) {
      const scope = failingPlugin.startsWith("@") ? failingPlugin.split("/")[0] : void 0;
      if (manifest.dependencies) {
        if (failingPlugin in manifest.dependencies) {
          delete manifest.dependencies[failingPlugin];
          modified = true;
        }
        for (const dep of Object.keys(manifest.dependencies)) {
          if (matchRelatedPackages && (failingPlugin.includes(dep) || dep.includes(failingPlugin) || scope && dep.startsWith(scope))) {
            delete manifest.dependencies[dep];
            modified = true;
          }
        }
      }
      if (manifest.dsh?.profile?.bundles) {
        const origLen = manifest.dsh.profile.bundles.length;
        manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(
          (b) => b !== failingPlugin && (!matchRelatedPackages || !failingPlugin.includes(b) && !b.includes(failingPlugin) && (!scope || !b.startsWith(scope)))
        );
        if (manifest.dsh.profile.bundles.length !== origLen) {
          modified = true;
        }
      }
    } else {
      const safeBundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"];
      if (manifest.dependencies?.dshmarket) safeBundles.push("dshmarket");
      manifest.dsh ??= {};
      manifest.dsh.profile ??= {};
      manifest.dsh.profile.bundles = safeBundles;
      modified = true;
      if (manifest.dependencies) {
        for (const dep of Object.keys(manifest.dependencies)) {
          if (!CORE_BUNDLES.has(dep)) {
            delete manifest.dependencies[dep];
            modified = true;
          }
        }
      }
    }
    if (modified) {
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    }
    const patchPath = profileCordisPatchPath(dshHome);
    if (existsSync(patchPath)) {
      if (failingPlugin) {
        const entryIds = await pluginDeclaredEntryIds(dirname(manifestPath), failingPlugin);
        const removed = await prunePluginPatchLayer(dshHome, failingPlugin, entryIds);
        if (removed.length > 0) modified = true;
      } else {
        const patchContent = await readFile(patchPath, "utf8");
        if (patchContent.trim() !== "[]") {
          await writeFile(patchPath, "[]\n", "utf8");
          modified = true;
        }
      }
    }
    const nodeModulesPath = join(dshHome, "profiles", "web", "node_modules");
    if (existsSync(nodeModulesPath)) {
      if (failingPlugin) {
        const pluginDir = join(nodeModulesPath, failingPlugin);
        await removeTree(pluginDir).catch(() => void 0);
        if (failingPlugin.startsWith("@")) {
          const scope = failingPlugin.split("/")[0];
          if (scope) {
            const scopeDir = join(nodeModulesPath, scope);
            try {
              const files = await readdir(scopeDir);
              if (files.length === 0) {
                await removeTree(scopeDir).catch(() => void 0);
              }
            } catch {
            }
          }
        }
      }
    }
    const packagesDir = join(dshHome, "profiles", "web", "packages");
    if (failingPlugin && existsSync(packagesDir)) {
      const packageSourceDir = join(packagesDir, failingPlugin);
      if (existsSync(packageSourceDir)) {
        await removeTree(packageSourceDir).catch(() => void 0);
      }
    }
    const lockfilePath = join(dshHome, "profiles", "web", "pnpm-lock.yaml");
    if (existsSync(lockfilePath)) {
      await rm(lockfilePath, { force: true }).catch(() => void 0);
    }
    return modified;
  } catch {
    return false;
  }
}
const DEFAULT_NPM_REGISTRY = "https://registry.npmmirror.com";
const FALLBACK_NPM_REGISTRY = "https://registry.npmjs.org";
const DEFAULT_MARKET_CHECK_TIMEOUT_MS = 2500;
const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
function parseSemver(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  const match = SEMVER_PATTERN.exec(trimmed);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prerelease = match[4] ? match[4].split(".").map((part) => /^\d+$/.test(part) ? Number(part) : part) : [];
  return { major, minor, patch, prerelease };
}
function compareSemver(aStr, bStr) {
  const a = parseSemver(aStr);
  const b = parseSemver(bStr);
  if (!a && !b) return aStr.localeCompare(bStr);
  if (!a) return -1;
  if (!b) return 1;
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i += 1) {
    const aPart = a.prerelease[i];
    const bPart = b.prerelease[i];
    if (aPart === void 0) return -1;
    if (bPart === void 0) return 1;
    if (aPart === bPart) continue;
    const aNum = typeof aPart === "number";
    const bNum = typeof bPart === "number";
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return aPart > bPart ? 1 : -1;
  }
  return 0;
}
function satisfiesComparator(versionStr, comparator) {
  const comp = comparator.trim();
  if (!comp || comp === "*" || comp === "x" || comp === "X") return true;
  const v = parseSemver(versionStr);
  if (!v) return false;
  if (comp.startsWith("^")) {
    const target = comp.slice(1).trim();
    const t = parseSemver(target);
    if (!t) return false;
    if (v.prerelease.length > 0) {
      if (t.prerelease.length === 0 || v.major !== t.major || v.minor !== t.minor || v.patch !== t.patch) {
        return false;
      }
    }
    if (compareSemver(versionStr, target) < 0) return false;
    if (t.major > 0) {
      return v.major === t.major;
    }
    if (t.minor > 0) {
      return v.major === 0 && v.minor === t.minor;
    }
    return v.major === 0 && v.minor === 0 && v.patch === t.patch;
  }
  if (comp.startsWith("~")) {
    const target = comp.slice(1).trim();
    const t = parseSemver(target);
    if (!t) return false;
    if (v.prerelease.length > 0) {
      if (t.prerelease.length === 0 || v.major !== t.major || v.minor !== t.minor || v.patch !== t.patch) {
        return false;
      }
    }
    if (compareSemver(versionStr, target) < 0) return false;
    return v.major === t.major && v.minor === t.minor;
  }
  if (comp.startsWith(">=")) {
    const target = comp.slice(2).trim();
    return compareSemver(versionStr, target) >= 0;
  }
  if (comp.startsWith(">")) {
    const target = comp.slice(1).trim();
    return compareSemver(versionStr, target) > 0;
  }
  if (comp.startsWith("<=")) {
    const target = comp.slice(2).trim();
    return compareSemver(versionStr, target) <= 0;
  }
  if (comp.startsWith("<")) {
    const target = comp.slice(1).trim();
    return compareSemver(versionStr, target) < 0;
  }
  if (comp.startsWith("=")) {
    const target = comp.slice(1).trim();
    return compareSemver(versionStr, target) === 0;
  }
  return compareSemver(versionStr, comp) === 0;
}
function satisfiesRange(versionStr, range) {
  if (!range || range.trim() === "*" || range.trim() === "") return true;
  const alternatives = range.split("||").map((alt) => alt.trim()).filter(Boolean);
  if (alternatives.length === 0) return true;
  return alternatives.some((alt) => {
    const parts = alt.split(/\s+/).filter(Boolean);
    return parts.every((part) => satisfiesComparator(versionStr, part));
  });
}
const manifestCache = /* @__PURE__ */ new Map();
const CACHE_TTL_MS = 5 * 60 * 1e3;
async function fetchPluginVersionsFromRegistry(packageName, options) {
  const primaryRegistry = (options?.registry || DEFAULT_NPM_REGISTRY).replace(/\/$/, "");
  const cacheKey = `${primaryRegistry}/${packageName}`;
  const cached = manifestCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.metadata;
  const registries = [.../* @__PURE__ */ new Set([primaryRegistry, FALLBACK_NPM_REGISTRY])];
  const timeoutMs = options?.timeoutMs ?? DEFAULT_MARKET_CHECK_TIMEOUT_MS;
  const fetchImpl = options?.fetchFn ?? fetch;
  for (const registry of registries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${registry}/${encodeURIComponent(packageName)}`, {
        signal: controller.signal,
        // Full metadata preserves custom dsh.minVersion; abbreviated install
        // metadata is insufficient for this compatibility check.
        headers: { accept: "application/json", "user-agent": "dsh-desktop" }
      });
      if (!res.ok) {
        options?.onFailure?.(`${registry}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (!data?.versions || typeof data.versions !== "object" || Array.isArray(data.versions)) throw new Error("Invalid version metadata");
      const latest = data["dist-tags"]?.latest;
      if (typeof latest !== "string" || !parseSemver(latest)) throw new Error("Invalid latest version");
      const versions = Object.fromEntries(Object.entries(data.versions).filter(
        ([version, manifest]) => parseSemver(version) && manifest?.version === version && manifest.name === packageName
      ));
      if (!versions[latest]) throw new Error("Latest version manifest is missing");
      const metadata = { versions, "dist-tags": { latest } };
      manifestCache.set(cacheKey, { metadata, timestamp: Date.now() });
      return metadata;
    } catch (error) {
      const failure = error;
      options?.onFailure?.(`${registry}: ${failure.cause?.code ?? failure.message ?? "Request failed"}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
function selectCompatiblePluginUpgrade(metadata, installedVersion, currentRuntimeVersion) {
  const installed = installedVersion && parseSemver(installedVersion);
  if (!installed || !installedVersion) return void 0;
  const latest = metadata["dist-tags"].latest;
  return Object.values(metadata.versions).filter((manifest) => {
    const version = parseSemver(manifest.version);
    return version && !manifest.deprecated && compareSemver(manifest.version, installedVersion) > 0 && compareSemver(manifest.version, latest) <= 0 && (installed.prerelease.length > 0 || version.prerelease.length === 0);
  }).sort((left, right) => compareSemver(right.version, left.version)).find((manifest) => inferPluginRuntimeCompatibility(manifest, currentRuntimeVersion).isCompatible);
}
function inferPluginRuntimeCompatibility(manifest, currentRuntimeVersion) {
  const peers = manifest.peerDependencies ?? {};
  for (const [peerPkg, peerRange] of Object.entries(peers)) {
    if (peerPkg.startsWith("@deepseek-ai/") && peerPkg !== "@deepseek-ai/cordis") {
      if (peerRange && !satisfiesRange(currentRuntimeVersion, peerRange)) {
        return {
          isCompatible: false,
          reason: `Declares peer ${peerPkg} (${peerRange}), incompatible with runtime ${currentRuntimeVersion}`
        };
      }
    }
  }
  const minVersion = manifest.dsh?.minVersion;
  const constraints = [manifest.engines?.dsh, minVersion && parseSemver(minVersion) ? `>=${minVersion}` : minVersion];
  for (const constraint of constraints) {
    if (constraint && !satisfiesRange(currentRuntimeVersion, constraint)) {
      return {
        isCompatible: false,
        reason: `Requires DSH (${constraint}), incompatible with runtime ${currentRuntimeVersion}`
      };
    }
  }
  const deps = { ...manifest.dependencies ?? {}, ...manifest.optionalDependencies ?? {} };
  if (Object.keys(deps).includes("@deepseek-ai/dsh-host-apiproxy")) {
    return {
      isCompatible: false,
      reason: "Requires deprecated module @deepseek-ai/dsh-host-apiproxy"
    };
  }
  return { isCompatible: true };
}
async function readBundledDshVersion(bundledNodeModulesPath) {
  try {
    const raw = await readFile(join(bundledNodeModulesPath, "@deepseek-ai", "dsh", "package.json"), "utf8");
    const manifest = JSON.parse(raw);
    return manifest.version;
  } catch {
    return void 0;
  }
}
async function readInstalledPluginVersion(dshHome, pluginName) {
  try {
    const manifestPath = profilePackageJsonPath(dshHome);
    const profileDir2 = join(manifestPath, "..");
    const pkgPath = join(profileDir2, "node_modules", ...pluginName.split("/"), "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const manifest = JSON.parse(raw);
    return manifest.version;
  } catch {
    return void 0;
  }
}
async function evaluatePluginMarketCompatibility(options) {
  const {
    packageName,
    installedVersion,
    currentRuntimeVersion,
    hasLocalIssue = false,
    locale = "zh"
  } = options;
  const isZh = locale === "zh";
  const failures = [];
  const metadata = await fetchPluginVersionsFromRegistry(packageName, {
    registry: options.registry,
    timeoutMs: options.timeoutMs,
    fetchFn: options.fetchFn,
    onFailure: (reason) => failures.push(reason)
  });
  if (!metadata) {
    return {
      packageName,
      installedVersion,
      healthStatus: "check-failed",
      healthLabel: isZh ? "未能连接市场检查" : "Market check unavailable",
      upgradeReady: false,
      detail: (isZh ? "未能获取市场版本信息，请重新检查更新。" : "Could not fetch market versions; retry the update check.") + (failures.length ? ` ${failures.join("; ")}` : "")
    };
  }
  const latestVersion = metadata["dist-tags"].latest;
  if (!installedVersion || !parseSemver(installedVersion)) {
    return {
      packageName,
      installedVersion,
      latestVersion,
      healthStatus: "check-failed",
      upgradeReady: false,
      healthLabel: isZh ? "无法确定已安装版本" : "Installed version unavailable",
      detail: isZh ? "无法确定升级范围，请先检查已安装插件。" : "Cannot determine the upgrade range; inspect the installed plugin first."
    };
  }
  const candidate = selectCompatiblePluginUpgrade(metadata, installedVersion, currentRuntimeVersion);
  if (candidate) {
    return {
      packageName,
      installedVersion,
      latestVersion,
      healthStatus: hasLocalIssue ? "incompatible-upgrade-available" : "upgrade-available",
      healthLabel: isZh ? `${hasLocalIssue ? "加载异常，" : ""}可尝试升级至 v${candidate.version}` : `${hasLocalIssue ? "Load failure; " : ""}update candidate v${candidate.version}`,
      upgradeReady: true,
      upgradeVersion: candidate.version,
      detail: isZh ? `在当前版本至 latest（v${latestVersion}）之间，v${candidate.version} 是未发现 DSH ${currentRuntimeVersion} 声明冲突的最高可选版本；升级后仍需验证启动。` : `v${candidate.version} is the highest eligible update up to latest (v${latestVersion}) with no declared conflict with DSH ${currentRuntimeVersion}; startup must still be verified.`
    };
  }
  if (hasLocalIssue && compareSemver(latestVersion, installedVersion) > 0) {
    const compatibility = inferPluginRuntimeCompatibility(metadata.versions[latestVersion], currentRuntimeVersion);
    return {
      packageName,
      installedVersion,
      latestVersion,
      healthStatus: "incompatible-upgrade-available",
      healthLabel: isZh ? `未找到兼容更新，可尝试 latest v${latestVersion}（兼容性未确认）` : `No compatible update; try latest v${latestVersion} (compatibility unconfirmed)`,
      upgradeReady: true,
      upgradeVersion: latestVersion,
      detail: (isZh ? `未找到匹配当前 DSH 的更新版本，可尝试升级至 latest v${latestVersion}；不保证兼容，升级后仍需验证启动。` : `No update matches the current DSH; you can try latest v${latestVersion}. Compatibility is not guaranteed; verify startup after upgrading.`) + (compatibility.reason ? ` ${compatibility.reason}` : "")
    };
  }
  if (hasLocalIssue && compareSemver(installedVersion, latestVersion) >= 0) {
    return {
      packageName,
      installedVersion,
      latestVersion,
      healthStatus: "incompatible-no-fix",
      healthLabel: isZh ? "当前版本已是 latest 或更高，建议卸载问题插件" : "Already at latest or newer; remove the failing plugin",
      upgradeReady: false,
      detail: isZh ? `当前插件 v${installedVersion} 已是 latest（v${latestVersion}）或更高版本，仍阻挡启动。请卸载此插件并继续检测；不会降级或重复安装。` : `Plugin v${installedVersion} is already at latest (v${latestVersion}) or newer and still blocks startup. Remove this plugin and continue checking; no downgrade or reinstall will be attempted.`
    };
  }
  return {
    packageName,
    installedVersion,
    latestVersion,
    healthStatus: hasLocalIssue ? "incompatible-no-fix" : "up-to-date",
    healthLabel: isZh ? hasLocalIssue ? "加载异常，未找到兼容更新" : "未找到兼容更新" : hasLocalIssue ? "Load failure; no compatible update found" : "No compatible update found",
    upgradeReady: false,
    detail: isZh ? `在已安装版本之后、latest（v${latestVersion}）以内，没有符合当前 DSH 和发布版本筛选条件的更新。` : `No update after the installed version and up to latest (v${latestVersion}) satisfies the current DSH and release filters.`
  };
}
async function checkupAllProfilePlugins(options) {
  const currentRuntimeVersion = await readBundledDshVersion(options.bundledNodeModulesPath) || "0.1.2-alpha.1";
  const incompatibleSet = new Set(options.incompatiblePlugins ?? []);
  const reports = await Promise.all(
    options.plugins.map(async (plugin) => {
      const installedVersion = await readInstalledPluginVersion(options.dshHome, plugin);
      return evaluatePluginMarketCompatibility({
        packageName: plugin,
        installedVersion,
        currentRuntimeVersion,
        hasLocalIssue: incompatibleSet.has(plugin),
        registry: options.registry,
        timeoutMs: options.timeoutMs,
        fetchFn: options.fetchFn,
        locale: options.locale
      });
    })
  );
  return reports;
}
const MARKER_NAME = ".install-complete";
const FINGERPRINTED = ["package.json", "pnpm-lock.yaml"];
function profileDirectory$1(dshHome) {
  return dirname(profilePackageJsonPath(dshHome));
}
function profileInstallMarkerPath(dshHome) {
  return join(profileDirectory$1(dshHome), MARKER_NAME);
}
async function installFingerprint(dshHome) {
  const directory = profileDirectory$1(dshHome);
  const digest = createHash("sha256");
  for (const name of FINGERPRINTED) {
    try {
      digest.update(await readFile(join(directory, name)));
      digest.update("\0");
    } catch {
      return void 0;
    }
  }
  return digest.digest("hex");
}
async function markProfileInstallComplete(dshHome) {
  const fingerprint = await installFingerprint(dshHome);
  if (fingerprint === void 0) return;
  await writeFile(profileInstallMarkerPath(dshHome), `${fingerprint}
`, "utf8");
}
async function clearProfileInstallMarker(dshHome) {
  await rm(profileInstallMarkerPath(dshHome), { force: true });
}
async function upgradePluginToGeneration(options) {
  const { dshHome, pluginName, targetVersion, nodeExecutablePath, pnpmEntryPath, note } = options;
  const spec = `${pluginName}@${targetVersion}`;
  return withRegistryLock(dshHome, async () => {
    note?.(`[plugin-upgrade] installing ${spec} as a generation…`);
    const install = await installGeneration({
      dshHome,
      pluginSpec: spec,
      expectedVersion: targetVersion,
      nodeExecutablePath,
      pnpmEntryPath,
      // targetVersion came from the market's registry; fetch it from there
      // too rather than from whatever ~/.npmrc happens to name (#337).
      registry: await resolveMarketRegistry({ profileDir: join(dshHome, "profiles", "web") }),
      onTrace: (line) => note?.(`[plugin-upgrade] ${line}`)
    });
    if (!install.ok || !install.generation) {
      const detail = install.detail ?? "generation installation failed";
      note?.(`[plugin-upgrade] failed to install ${spec}: ${detail}`);
      return { ok: false, detail };
    }
    const [desired, generations] = await Promise.all([
      readDesired(dshHome),
      listGenerations(dshHome)
    ]);
    const byId = new Map(generations.map((g) => [g.id, g]));
    const kept = desired.filter((id) => {
      const g = byId.get(id);
      return g === void 0 || g.pluginName !== install.generation.pluginName;
    });
    await writeDesired(dshHome, [...kept, install.generation.id]);
    try {
      await publishInstalledGeneration(dshHome, pluginName, "web", { allowRealDirectory: true, syncBundles: true });
    } catch (error) {
      await writeDesired(dshHome, desired);
      throw error;
    }
    note?.(`[plugin-upgrade] successfully upgraded ${pluginName} to v${targetVersion} (${install.generation.id})`);
    return { ok: true };
  });
}
const MARKET_PACKAGE$1 = "dshmarket";
async function upgradeMarketInSharedTree(options) {
  const { dshHome, dshEntryPath: dshEntryPath2, targetVersion, nodeExecutablePath, pnpmEntryPath, pnpmRunnerPath, note } = options;
  const profileDirectory2 = join(dshHome, "profiles", "web");
  const manifestPath = join(profileDirectory2, "package.json");
  const marketPath = join(profileDirectory2, "node_modules", MARKET_PACKAGE$1);
  return withRegistryLock(dshHome, async () => {
    const before = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(before);
    let modified = false;
    const owned = manifest.dsh?.desktop?.generationProjection?.plugins?.[MARKET_PACKAGE$1];
    if (owned) {
      delete manifest.dsh.desktop.generationProjection.plugins[MARKET_PACKAGE$1];
      if (owned.previousOverride?.present) {
        manifest.pnpm ??= {};
        manifest.pnpm.overrides ??= {};
        manifest.pnpm.overrides[MARKET_PACKAGE$1] = owned.previousOverride.value;
      } else if (manifest.pnpm?.overrides) {
        delete manifest.pnpm.overrides[MARKET_PACKAGE$1];
      }
      modified = true;
    }
    manifest.dependencies ??= {};
    if (manifest.dependencies[MARKET_PACKAGE$1] !== targetVersion) {
      manifest.dependencies[MARKET_PACKAGE$1] = targetVersion;
      modified = true;
    }
    if (modified) await writeFile(manifestPath, `${JSON.stringify(manifest, void 0, 2)}
`, "utf8");
    try {
      const entry = await lstat(marketPath).catch((error) => {
        if (error.code === "ENOENT") return void 0;
        throw error;
      });
      if (entry?.isSymbolicLink()) {
        const target = await readlink(marketPath);
        const isGenLink = target.includes(".generations");
        note?.(`[plugin-upgrade] dropping the ${MARKET_PACKAGE$1} ${isGenLink ? "generation" : "store"} link before reinstalling`);
        await rm(marketPath, { force: true });
      }
      note?.(`[plugin-upgrade] installing ${MARKET_PACKAGE$1}@${targetVersion} into the shared profile…`);
      const registry = await resolveMarketRegistry({ profileDir: profileDirectory2 });
      const result = await installProfileDependenciesWithDsh({
        dshHome,
        dshEntryPath: dshEntryPath2,
        nodeExecutablePath,
        pnpmEntryPath,
        pnpmRunnerPath,
        environment: registry !== null ? { ...process.env, npm_config_registry: registry } : void 0
      });
      if (!result.ok) throw new Error(result.detail ?? "shared-tree install failed");
      const installed = JSON.parse(await readFile(join(marketPath, "package.json"), "utf8"));
      const afterEntry = await lstat(marketPath);
      const afterIsGenerationLink = afterEntry.isSymbolicLink() && (await readlink(marketPath)).includes(".generations");
      if (installed.version !== targetVersion || afterIsGenerationLink) {
        throw new Error(`Market install expected a shared directory at ${targetVersion}, found ${installed.version ?? "missing"} or a link`);
      }
      const [desired, generations] = await Promise.all([readDesired(dshHome), listGenerations(dshHome)]);
      const stale = new Set(
        generations.filter((generation) => generation.pluginName === MARKET_PACKAGE$1).map((generation) => generation.id)
      );
      if (desired.some((id) => stale.has(id))) {
        await writeDesired(dshHome, desired.filter((id) => !stale.has(id)));
      }
      note?.(`[plugin-upgrade] successfully upgraded ${MARKET_PACKAGE$1} to v${targetVersion}`);
      return { ok: true };
    } catch (error) {
      await writeFile(manifestPath, before, "utf8");
      const detail = error instanceof Error ? error.message : String(error);
      note?.(`[plugin-upgrade] failed to install ${MARKET_PACKAGE$1}@${targetVersion}: ${detail}`);
      return { ok: false, detail };
    }
  });
}
const VERIFIED_MARKET_BASELINE = "1.45.1";
const MARKET_PACKAGE = "dshmarket";
async function demoteMarketGeneration(dshHome, note) {
  const manifestPath = profilePackageJsonPath(dshHome);
  let raw;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const manifest = JSON.parse(raw);
  const marketPath = join(dirname(manifestPath), "node_modules", MARKET_PACKAGE);
  const owned = manifest.dsh?.desktop?.generationProjection?.plugins?.[MARKET_PACKAGE];
  const linked = await lstat(marketPath).then(async (info) => {
    if (!info.isSymbolicLink()) return false;
    const target = await readlink(marketPath);
    return target.includes(".generations");
  }).catch(() => false);
  const [desired, generations] = await Promise.all([readDesired(dshHome), listGenerations(dshHome)]);
  const marketGenerations = new Set(
    generations.filter((generation) => generation.pluginName === MARKET_PACKAGE).map((generation) => generation.id)
  );
  const desiredMarket = desired.filter((id) => marketGenerations.has(id));
  if (owned === void 0 && !linked && desiredMarket.length === 0) return false;
  note?.(`[market-baseline] dshmarket is projected as a generation; restoring it to the shared tree`);
  let actualInstalledVersion;
  try {
    actualInstalledVersion = await readInstalledPluginVersion(dshHome, MARKET_PACKAGE);
  } catch {
  }
  const isMeetsBaseline = (v) => {
    const clean = v?.replace(/^[~^v=><\s]+/g, "");
    return !!clean && !!parseSemver(clean) && compareSemver(clean, VERIFIED_MARKET_BASELINE) >= 0;
  };
  const candidateVersion = owned?.visibleVersion ?? (isMeetsBaseline(actualInstalledVersion) ? actualInstalledVersion : void 0) ?? (isMeetsBaseline(manifest.dependencies?.[MARKET_PACKAGE]) ? manifest.dependencies?.[MARKET_PACKAGE] : void 0) ?? (isMeetsBaseline(generations.find((g) => g.pluginName === MARKET_PACKAGE)?.version) ? generations.find((g) => g.pluginName === MARKET_PACKAGE)?.version : void 0) ?? VERIFIED_MARKET_BASELINE;
  manifest.dependencies ??= {};
  manifest.dependencies[MARKET_PACKAGE] = candidateVersion;
  if (owned !== void 0) {
    delete manifest.dsh.desktop.generationProjection.plugins[MARKET_PACKAGE];
    if (Object.keys(manifest.dsh.desktop.generationProjection.plugins).length === 0) {
      delete manifest.dsh.desktop.generationProjection;
    }
    if (owned.previousOverride?.present && typeof owned.previousOverride.value === "string") {
      manifest.pnpm ??= {};
      manifest.pnpm.overrides ??= {};
      manifest.pnpm.overrides[MARKET_PACKAGE] = owned.previousOverride.value;
    } else if (manifest.pnpm?.overrides) {
      delete manifest.pnpm.overrides[MARKET_PACKAGE];
    }
  } else if (manifest.pnpm?.overrides?.[MARKET_PACKAGE]?.includes(".generations/live/")) {
    delete manifest.pnpm.overrides[MARKET_PACKAGE];
  }
  const bundles = manifest.dsh?.profile?.bundles;
  if (Array.isArray(bundles) && !bundles.includes(MARKET_PACKAGE)) bundles.push(MARKET_PACKAGE);
  await writeFile(manifestPath, `${JSON.stringify(manifest, void 0, 2)}
`, "utf8");
  if (desiredMarket.length > 0) {
    await writeDesired(dshHome, desired.filter((id) => !marketGenerations.has(id)));
  }
  if (linked) {
    await rm(marketPath, { force: true });
  }
  return true;
}
async function ensureMarketBaseline(options, upgrade = upgradeMarketInSharedTree) {
  let raw;
  try {
    raw = await readFile(profilePackageJsonPath(options.dshHome), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const manifest = JSON.parse(raw);
  if (!manifest.dependencies?.dshmarket || !manifest.dsh?.profile?.bundles?.includes("dshmarket")) return;
  const meetsBaseline = (version) => !!version && !!parseSemver(version) && compareSemver(version, VERIFIED_MARKET_BASELINE) >= 0;
  const installed = await readInstalledPluginVersion(options.dshHome, "dshmarket");
  const dshmarketPath = join(dirname(profilePackageJsonPath(options.dshHome)), "node_modules", "dshmarket");
  const isGenerationLink = await lstat(dshmarketPath).then(async (info) => {
    if (!info.isSymbolicLink()) return false;
    const target = await readlink(dshmarketPath);
    return target.includes(".generations");
  }).catch(() => false);
  if (meetsBaseline(installed) && !isGenerationLink) return;
  const declaredVersion = manifest.dependencies.dshmarket;
  const declaredClean = declaredVersion?.replace(/^[~^v=><\s]+/g, "");
  const declaredParsed = declaredClean ? parseSemver(declaredClean) : null;
  const targetVersion = declaredParsed && compareSemver(declaredClean, VERIFIED_MARKET_BASELINE) > 0 ? declaredVersion : VERIFIED_MARKET_BASELINE;
  options.note?.(
    isGenerationLink ? `[market-baseline] dshmarket ${installed ?? "(unknown)"} is a generation link; reinstalling into the shared tree` : `[market-baseline] upgrading dshmarket ${installed ?? "(missing)"} to ${targetVersion}`
  );
  const profileDir2 = dirname(profilePackageJsonPath(options.dshHome));
  const workspaceYamlPath = join(profileDir2, "pnpm-workspace.yaml");
  try {
    await readFile(workspaceYamlPath, "utf8");
  } catch {
    await writeFile(workspaceYamlPath, "packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n", "utf8");
  }
  await healProfilesModuleFallback({
    installAnchor: join(dirname(options.dshEntryPath), "..", "package.json"),
    home: options.dshHome
  });
  await clearProfileInstallMarker(options.dshHome);
  const result = await upgrade({ ...options, targetVersion });
  if (!result.ok) throw new Error(result.detail ?? "dshmarket installation failed");
  const actual = await readInstalledPluginVersion(options.dshHome, "dshmarket");
  if (!meetsBaseline(actual)) {
    throw new Error(`dshmarket installation reported success, but the active version is ${actual ?? "missing"}; requires >=${VERIFIED_MARKET_BASELINE}`);
  }
  options.note?.(`[market-baseline] verified active dshmarket ${actual}`);
}
async function readManifest$1(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return void 0;
  }
}
async function inspectPackage(nodeModulesPath, packageName) {
  try {
    const manifest = JSON.parse(
      await readFile(join(nodeModulesPath, packageName, "package.json"), "utf8")
    );
    return { installed: true, bundle: manifest.dsh?.bundle?.patch !== void 0 };
  } catch {
    return { installed: false, bundle: false };
  }
}
function patchLayerInsertedPackages(text) {
  let document;
  try {
    document = distExports.parseDocument(text);
  } catch {
    return [];
  }
  if (!distExports.isSeq(document.contents)) return [];
  const names = [];
  for (const row of document.contents.items) {
    if (!distExports.isMap(row)) continue;
    const insert = row.get("insert");
    if (!distExports.isSeq(insert)) continue;
    for (const entry of insert.items) {
      const name = distExports.isMap(entry) ? entry.get("name") : void 0;
      if (typeof name === "string") names.push(name);
    }
  }
  return names;
}
async function undeclaredBundles(nodeModulesPath, dependencies, bundles) {
  let entries;
  try {
    entries = await readdir(nodeModulesPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const declared = /* @__PURE__ */ new Set([...dependencies, ...bundles]);
  const transitive = /* @__PURE__ */ new Set();
  for (const dependency of dependencies) {
    try {
      const manifest = JSON.parse(
        await readFile(join(nodeModulesPath, dependency, "package.json"), "utf8")
      );
      for (const name of Object.keys(manifest.dependencies ?? {})) transitive.add(name);
    } catch {
    }
  }
  const orphans = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("@")) continue;
    if (!entry.isDirectory() || declared.has(entry.name) || transitive.has(entry.name)) continue;
    const { bundle } = await inspectPackage(nodeModulesPath, entry.name);
    if (bundle) orphans.push(entry.name);
  }
  return orphans;
}
async function inspectProfileConsistency(dshHome) {
  const manifestPath = profilePackageJsonPath(dshHome);
  const manifest = await readManifest$1(manifestPath);
  if (manifest === void 0) return [];
  const nodeModulesPath = join(dirname(manifestPath), "node_modules");
  const bundles = manifest.dsh?.profile?.bundles ?? [];
  const dependencies = Object.keys(manifest.dependencies ?? {});
  const findings = [];
  for (const bundle of bundles) {
    if (!dependencies.includes(bundle)) continue;
    const { installed } = await inspectPackage(nodeModulesPath, bundle);
    if (!installed) findings.push(`bundle ${bundle} is declared but not installed`);
  }
  for (const dependency of dependencies) {
    if (bundles.includes(dependency)) continue;
    const { installed, bundle } = await inspectPackage(nodeModulesPath, dependency);
    if (installed && bundle) {
      findings.push(`${dependency} is installed and declares a bundle, but is not composed`);
    }
  }
  for (const orphan of await undeclaredBundles(nodeModulesPath, dependencies, bundles)) {
    findings.push(`${orphan} is installed but declared nowhere in the profile manifest`);
  }
  try {
    const layer = await readFile(profileCordisPatchPath(dshHome), "utf8");
    for (const packageName of patchLayerInsertedPackages(layer)) {
      const { installed } = await inspectPackage(nodeModulesPath, packageName);
      if (!installed) findings.push(`the patch layer inserts ${packageName}, which is not installed`);
    }
  } catch {
  }
  return findings;
}
async function healProfileBundles(dshHome) {
  const manifestPath = profilePackageJsonPath(dshHome);
  let manifestText;
  let manifest;
  try {
    manifestText = await readFile(manifestPath, "utf8");
    manifest = JSON.parse(manifestText);
  } catch {
    return [];
  }
  const nodeModulesPath = join(dirname(manifestPath), "node_modules");
  const currentBundles = manifest.dsh?.profile?.bundles ?? [];
  const bundleSet = new Set(currentBundles);
  const dependencies = Object.keys(manifest.dependencies ?? {});
  const healed = [];
  for (const dependency of dependencies) {
    if (bundleSet.has(dependency)) continue;
    const { installed, bundle } = await inspectPackage(nodeModulesPath, dependency);
    if (installed && bundle) {
      currentBundles.push(dependency);
      bundleSet.add(dependency);
      healed.push(dependency);
    }
  }
  if (healed.length > 0) {
    try {
      if (!manifest.dsh) manifest.dsh = {};
      if (!manifest.dsh.profile) manifest.dsh.profile = {};
      manifest.dsh.profile.bundles = currentBundles;
      const { writeFile: writeFile2 } = await import("node:fs/promises");
      await writeFile2(manifestPath, `${JSON.stringify(manifest, void 0, 2)}
`, "utf8");
    } catch {
    }
  }
  return healed;
}
function resolvesFrom(fromDir, specifier) {
  try {
    createRequire(join(fromDir, "noop.js")).resolve(specifier);
    return true;
  } catch {
    return existsSync(join(fromDir, "node_modules", ...specifier.split("/")));
  }
}
function pluginRealDirectory(profileNodeModules, pluginName) {
  const linked = join(profileNodeModules, ...pluginName.split("/"));
  try {
    return realpathSync(linked);
  } catch {
    return linked;
  }
}
function issueId(kind, target) {
  return `${kind}:${target}`;
}
async function readManifest(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return void 0;
  }
}
function packageNameFromRequest(request) {
  if (!request || request.startsWith(".") || request.startsWith("/")) return void 0;
  const parts = request.split("/");
  if (request.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : void 0;
  return parts[0];
}
function literalModuleRequests(source) {
  const requests = /* @__PURE__ */ new Set();
  const expressions = [
    /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g,
    /\bimport\(\s*(['"])([^'"]+)\1\s*\)/g,
    /\bfrom\s*(['"])([^'"]+)\1/g,
    /\bimport\s*(['"])([^'"]+)\1/g
  ];
  for (const expression of expressions) {
    for (const match of source.matchAll(expression)) {
      const request = match[2];
      if (request) requests.add(request);
    }
  }
  return [...requests];
}
async function pluginDependencyClosure(pluginDir, rootPackage) {
  const requiredPackages = /* @__PURE__ */ new Map();
  const require3 = createRequire(join(pluginDir, "noop.js"));
  const pending = [{ packageName: rootPackage, required: true, from: pluginDir }];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === void 0) continue;
    const previous = requiredPackages.get(next.packageName);
    if (previous === true || previous === next.required) continue;
    requiredPackages.set(next.packageName, next.required);
    let manifestPath;
    if (next.packageName === rootPackage) {
      manifestPath = join(pluginDir, "package.json");
    } else {
      try {
        manifestPath = require3.resolve(`${next.packageName}/package.json`);
      } catch {
        manifestPath = void 0;
      }
    }
    const manifest = manifestPath === void 0 ? void 0 : await readManifest(manifestPath);
    if (manifest === void 0) continue;
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      pending.push({ packageName: dependency, required: true, from: pluginDir });
    }
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
      pending.push({ packageName: dependency, required: false, from: pluginDir });
    }
  }
  return [...requiredPackages].map(([packageName, required]) => ({ packageName, required }));
}
function moduleSourcePaths(nodeModulesPath, packageName, manifest) {
  const packageDirectory = join(nodeModulesPath, packageName);
  const candidates = /* @__PURE__ */ new Set([
    "lib/client.js",
    "lib/index.js",
    ...typeof manifest.main === "string" ? [manifest.main] : [],
    ...typeof manifest.module === "string" ? [manifest.module] : []
  ]);
  const result = [];
  for (const candidate of candidates) {
    if (isAbsolute(candidate)) continue;
    const path = join(packageDirectory, candidate);
    const nested = relative(packageDirectory, path);
    if (!nested || nested.startsWith("..") || isAbsolute(nested)) continue;
    result.push({
      path,
      source: nested.replaceAll("\\", "/"),
      client: nested === join("lib", "client.js")
    });
  }
  return result;
}
async function installedPackageNames(nodeModulesPath) {
  const names = [];
  let entries;
  try {
    entries = await readdir(nodeModulesPath, { withFileTypes: true });
  } catch {
    return names;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    if (!entry.name.startsWith("@")) {
      names.push(entry.name);
      continue;
    }
    try {
      const scoped = await readdir(join(nodeModulesPath, entry.name), { withFileTypes: true });
      for (const child of scoped) {
        if (child.isDirectory() || child.isSymbolicLink()) names.push(`${entry.name}/${child.name}`);
      }
    } catch {
    }
  }
  return names;
}
async function workspaceManifests(profileDirectory2) {
  const packagesDirectory = join(profileDirectory2, "packages");
  const result = [];
  let entries;
  try {
    entries = await readdir(packagesDirectory, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    const directory = join(packagesDirectory, entry.name);
    const direct = await readManifest(join(directory, "package.json"));
    if (direct?.name) {
      result.push({ directory, manifest: direct });
      continue;
    }
    if (!entry.name.startsWith("@")) continue;
    try {
      const scoped = await readdir(directory, { withFileTypes: true });
      for (const child of scoped) {
        if (!child.isDirectory() && !child.isSymbolicLink()) continue;
        const childDirectory = join(directory, child.name);
        const manifest = await readManifest(join(childDirectory, "package.json"));
        if (manifest?.name) result.push({ directory: childDirectory, manifest });
      }
    } catch {
    }
  }
  return result;
}
async function packageVersion(nodeModulesPath, packageName) {
  return (await readManifest(join(nodeModulesPath, packageName, "package.json")))?.version;
}
async function inspectProfileCompatibility(dshHome, bundledNodeModulesPath) {
  const manifestPath = profilePackageJsonPath(dshHome);
  const profileDirectory2 = dirname(manifestPath);
  const profileManifest2 = await readManifest(manifestPath);
  if (profileManifest2 === void 0) return { issues: [], activePlugins: [] };
  const dependencies = profileManifest2.dependencies ?? {};
  const bundles = new Set(profileManifest2.dsh?.profile?.bundles ?? []);
  const activePlugins = Object.keys(dependencies).filter(
    (name) => bundles.has(name) && isThirdPartyPackageName(name)
  );
  const profileNodeModules = join(profileDirectory2, "node_modules");
  const profilePackages = await installedPackageNames(profileNodeModules);
  const profilePackageSet = new Set(profilePackages);
  const bundledPackages = new Set(await installedPackageNames(bundledNodeModulesPath));
  const issues = [];
  const incompatibleWorkspaces = [];
  for (const workspace of await workspaceManifests(profileDirectory2)) {
    const declared = {
      ...workspace.manifest.peerDependencies ?? {},
      ...workspace.manifest.devDependencies ?? {}
    };
    const mismatches = [];
    const mismatchPackages = [];
    for (const [dependency, range] of Object.entries(declared)) {
      if (!dependency.startsWith("@deepseek-ai/")) continue;
      const expectedVersion = await packageVersion(bundledNodeModulesPath, dependency);
      const compatible = expectedVersion !== void 0 && (range === expectedVersion || range === `^${expectedVersion}` || range === `~${expectedVersion}`);
      if (!compatible) {
        mismatchPackages.push(dependency);
        mismatches.push(`${dependency}@${range}${expectedVersion ? ` (bundled ${expectedVersion})` : " (removed)"}`);
      }
    }
    if (mismatches.length === 0) continue;
    incompatibleWorkspaces.push({
      directory: workspace.directory,
      packageName: workspace.manifest.name ?? basename(workspace.directory),
      manifest: workspace.manifest,
      mismatches,
      mismatchPackages
    });
  }
  for (const packageName of profilePackages) {
    if (!packageName.startsWith("@deepseek-ai/")) continue;
    const installedVersion = await packageVersion(profileNodeModules, packageName);
    const expectedVersion = await packageVersion(bundledNodeModulesPath, packageName);
    if (!installedVersion || !expectedVersion || installedVersion === expectedVersion) continue;
    const workspaceOwners = incompatibleWorkspaces.filter(
      (workspace) => workspace.mismatchPackages.includes(packageName)
    );
    const soleWorkspaceOwner = workspaceOwners.length === 1 ? workspaceOwners[0] : void 0;
    issues.push({
      id: issueId("core-version-mismatch", packageName),
      kind: "core-version-mismatch",
      severity: "blocking",
      packageName,
      installedVersion,
      expectedVersion,
      source: "Profile node_modules",
      detail: `${packageName} ${installedVersion} shadows the bundled ${expectedVersion} package.`,
      resolution: "rebuild-profile",
      target: packageName,
      groupId: soleWorkspaceOwner ? `workspace:${soleWorkspaceOwner.directory}` : "profile:core-dependencies",
      groupName: soleWorkspaceOwner?.packageName ?? "Profile core dependencies",
      groupKind: soleWorkspaceOwner ? "workspace" : "profile"
    });
  }
  for (const pluginName of activePlugins) {
    const pluginDir = pluginRealDirectory(profileNodeModules, pluginName);
    for (const component of await pluginDependencyClosure(pluginDir, pluginName)) {
      const componentName = component.packageName;
      const componentManifest = await readManifest(join(pluginDir, "node_modules", componentName, "package.json")) ?? await readManifest(join(profileNodeModules, componentName, "package.json"));
      if (componentManifest === void 0) {
        if (!component.required || bundledPackages.has(componentName) || resolvesFrom(pluginDir, componentName)) {
          continue;
        }
        issues.push({
          id: issueId("missing-client-module", `${pluginName}:missing:${componentName}`),
          kind: "missing-client-module",
          severity: "blocking",
          packageName: componentName,
          source: `${pluginName} dependency tree`,
          detail: `The plugin requires ${componentName}, which is not installed in this profile.`,
          resolution: "disable-plugin",
          target: pluginName,
          groupId: `plugin:${pluginName}`,
          groupName: pluginName,
          groupKind: "plugin"
        });
        continue;
      }
      const componentDir = componentName === pluginName ? pluginDir : existsSync(join(pluginDir, "node_modules", componentName)) ? join(pluginDir, "node_modules", componentName) : join(profileNodeModules, componentName);
      for (const moduleSource of moduleSourcePaths(dirname(componentDir), basename(componentDir), componentManifest)) {
        let source;
        try {
          source = await readFile(moduleSource.path, "utf8");
        } catch {
          continue;
        }
        for (const request of literalModuleRequests(source)) {
          const requiredPackage = packageNameFromRequest(request);
          if (!requiredPackage?.startsWith("@deepseek-ai/") || bundledPackages.has(requiredPackage) || resolvesFrom(componentDir, requiredPackage) || !moduleSource.client && profilePackageSet.has(requiredPackage)) {
            continue;
          }
          const target = componentName === pluginName ? `${pluginName}:${request}` : `${pluginName}:${componentName}:${request}`;
          issues.push({
            id: issueId("unverified-module-reference", target),
            kind: "unverified-module-reference",
            severity: "warning",
            packageName: componentName,
            installedVersion: componentManifest.version,
            source: `${componentName}/${moduleSource.source}`,
            detail: `静态扫描发现 ${request} 引用，但未在宿主依赖中确认该包。它可能仅用于旧版本兼容或条件分支，不代表加载失败；若插件运行正常，无需处理。 / Static scan found a reference to ${request} without confirming its package in the host dependencies. It may be a compatibility fallback or conditional path; this does not establish a load failure. No action is needed if the plugin works.`,
            resolution: "inspect-only",
            target: pluginName,
            groupId: `plugin:${pluginName}`,
            groupName: pluginName,
            groupKind: "plugin"
          });
        }
      }
    }
  }
  for (const workspace of incompatibleWorkspaces) {
    issues.push({
      id: issueId("workspace-version-mismatch", workspace.packageName),
      kind: "workspace-version-mismatch",
      severity: "blocking",
      packageName: workspace.packageName,
      installedVersion: workspace.manifest.version,
      source: workspace.directory,
      detail: `Workspace dependencies target another Harness generation: ${workspace.mismatches.join(", ")}.`,
      resolution: "quarantine-workspace",
      target: workspace.directory,
      groupId: `workspace:${workspace.directory}`,
      groupName: workspace.packageName,
      groupKind: "workspace"
    });
  }
  const unique = new Map(issues.map((issue) => [issue.id, issue]));
  return {
    issues: [...unique.values()].sort(
      (left, right) => (left.groupName ?? left.packageName).localeCompare(right.groupName ?? right.packageName) || left.packageName.localeCompare(right.packageName)
    ),
    activePlugins
  };
}
function recoveryStamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}
async function backupManifest(profileDirectory2, recoveryDirectory) {
  await mkdir(recoveryDirectory, { recursive: true });
  for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "cordis.patch.yml"]) {
    try {
      await copyFile(join(profileDirectory2, name), join(recoveryDirectory, name));
    } catch {
    }
  }
}
async function disableProfilePlugins(dshHome, pluginNames, now = /* @__PURE__ */ new Date()) {
  const manifestPath = profilePackageJsonPath(dshHome);
  const profileDirectory2 = dirname(manifestPath);
  const manifest = await readManifest(manifestPath);
  if (manifest === void 0) return [];
  const selected = new Set(pluginNames);
  const bundles = manifest.dsh?.profile?.bundles ?? [];
  const disabled = bundles.filter((name) => selected.has(name));
  if (disabled.length === 0) return [];
  const recoveryDirectory = join(
    dshHome,
    "recovery",
    "compatibility",
    recoveryStamp(now)
  );
  await backupManifest(profileDirectory2, recoveryDirectory);
  manifest.dsh ??= {};
  manifest.dsh.profile ??= {};
  manifest.dsh.profile.bundles = bundles.filter((name) => !selected.has(name));
  await writeFile(manifestPath, `${JSON.stringify(manifest, void 0, 2)}
`, "utf8");
  return disabled;
}
async function quarantineProfileWorkspaces(dshHome, workspaceDirectories, now = /* @__PURE__ */ new Date()) {
  const profileDirectory2 = dirname(profilePackageJsonPath(dshHome));
  const packagesDirectory = join(profileDirectory2, "packages");
  const recoveryDirectory = join(
    dshHome,
    "recovery",
    "compatibility",
    recoveryStamp(now)
  );
  const quarantined = [];
  await backupManifest(profileDirectory2, recoveryDirectory);
  for (const directory of workspaceDirectories) {
    const manifest = await readManifest(join(directory, "package.json"));
    if (!manifest?.name) continue;
    const nested = relative(packagesDirectory, directory);
    if (!nested || nested.startsWith("..") || isAbsolute(nested)) continue;
    const destination = join(
      recoveryDirectory,
      "workspaces",
      manifest.name.replaceAll("/", "__")
    );
    await mkdir(dirname(destination), { recursive: true });
    try {
      await rename(directory, destination);
      quarantined.push(manifest.name);
    } catch {
    }
  }
  if (quarantined.length > 0) {
    await rm(join(profileDirectory2, "pnpm-lock.yaml"), { force: true });
  }
  return quarantined;
}
async function quarantineProfileCorePackages(dshHome, packageNames, now = /* @__PURE__ */ new Date()) {
  const profileDirectory2 = dirname(profilePackageJsonPath(dshHome));
  const nodeModulesPath = join(profileDirectory2, "node_modules");
  const recoveryDirectory = join(
    dshHome,
    "recovery",
    "compatibility",
    recoveryStamp(now),
    "core-packages"
  );
  const quarantined = [];
  await mkdir(recoveryDirectory, { recursive: true });
  for (const packageName of packageNames) {
    if (!packageName.startsWith("@deepseek-ai/")) continue;
    const source = join(nodeModulesPath, packageName);
    const destination = join(recoveryDirectory, packageName.replaceAll("/", "__"));
    try {
      await rename(source, destination);
      quarantined.push(packageName);
    } catch {
    }
  }
  if (quarantined.length > 0) await rm(join(profileDirectory2, "pnpm-lock.yaml"), { force: true });
  return quarantined;
}
async function recordedStoreDir(profileDirectory2) {
  try {
    const raw = await readFile(join(profileDirectory2, "node_modules", ".modules.yaml"), "utf8");
    const quoted = /^\s*"?storeDir"?\s*:\s*"([^"]+)"/mu.exec(raw);
    const bare = /^\s*"?storeDir"?\s*:\s*([^"\s][^,\n]*?)\s*,?\s*$/mu.exec(raw);
    const value = (quoted?.[1] ?? bare?.[1])?.trim();
    return value ? value : void 0;
  } catch {
    return void 0;
  }
}
function configuredStoreDir(npmrc) {
  const match = /^\s*store-dir\s*=\s*(.+?)\s*$/mu.exec(npmrc);
  const value = match?.[1];
  return value ? value : void 0;
}
function pinStoreDir(npmrc, storeDir) {
  const configured = configuredStoreDir(npmrc);
  if (configured === storeDir) return void 0;
  const newline = npmrc.includes("\r\n") ? "\r\n" : "\n";
  const body = configured === void 0 ? npmrc : npmrc.replace(/^\s*store-dir\s*=.*(?:\r?\n|$)/mu, "");
  const separator = body.length === 0 || body.endsWith("\n") ? "" : newline;
  return `${body}${separator}store-dir=${storeDir}${newline}`;
}
async function writeFileAtomically(path, contents) {
  const temporary = `${path}.dsh-desktop-${process.pid}-${Date.now()}.tmp`;
  try {
    await writeFile(temporary, contents, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => void 0);
  }
}
function storeDirSetting(recorded) {
  return /[/\\]v\d+$/u.test(recorded) ? dirname(recorded) : recorded;
}
async function ensureStoreDirPinned(dshHome) {
  const profileDirectory2 = dirname(profilePackageJsonPath(dshHome));
  const recorded = await recordedStoreDir(profileDirectory2);
  if (recorded === void 0) return void 0;
  const npmrcPath = join(profileDirectory2, ".npmrc");
  let npmrc = "";
  try {
    npmrc = await readFile(npmrcPath, "utf8");
  } catch {
  }
  const expected = storeDirSetting(recorded);
  const pinned = pinStoreDir(npmrc, expected);
  if (pinned === void 0) return void 0;
  try {
    await writeFileAtomically(npmrcPath, pinned);
    return expected;
  } catch {
    return void 0;
  }
}
async function inspectStoreConsistency(dshHome) {
  const profileDirectory2 = dirname(profilePackageJsonPath(dshHome));
  const recorded = await recordedStoreDir(profileDirectory2);
  if (recorded === void 0) return void 0;
  let npmrc = "";
  try {
    npmrc = await readFile(join(profileDirectory2, ".npmrc"), "utf8");
  } catch {
  }
  const configured = configuredStoreDir(npmrc);
  const expected = storeDirSetting(recorded);
  if (configured === expected) return void 0;
  return configured === void 0 ? `node_modules was linked from ${recorded}, which no .npmrc pins — pnpm will refuse to run here` : `node_modules was linked from ${recorded}, but .npmrc pins ${configured} — pnpm will refuse to run here`;
}
const execFileAsync$1 = promisify(execFile);
const CLOUDFLARED_VERSION = "2026.8.2";
const CLOUDFLARED_DOWNLOAD_ATTEMPTS = 3;
const CLOUDFLARED_DOWNLOAD_TIMEOUT_MS = 3e4;
const CLOUDFLARED_ASSETS = {
  "darwin-arm64": {
    asset: "cloudflared-darwin-arm64.tgz",
    isTarGz: true,
    sha256: "9042c2c5d8b2de78e60f313d5fb31b6c5c1cebde787a3caf1f2c9588084ac442"
  },
  "darwin-x64": {
    asset: "cloudflared-darwin-amd64.tgz",
    isTarGz: true,
    sha256: "f1727723c586500e2092368ae21871b3df7ddfd2cb097f22d81bee4a9c458bb4"
  },
  "win32-x64": {
    asset: "cloudflared-windows-amd64.exe",
    isTarGz: false,
    sha256: "c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5"
  },
  "linux-x64": {
    asset: "cloudflared-linux-amd64",
    isTarGz: false,
    sha256: "fcfb02b575a52ca1af2e3267af4e1517bcdeb30ac48c834c69abaed3c0576ad2"
  },
  "linux-arm64": {
    asset: "cloudflared-linux-arm64",
    isTarGz: false,
    sha256: "7747d94570fb390cf47dcb4f9555c193c6355cda9793f0d878d9049e5d6a7790"
  }
};
function extractTryCloudflareUrl(text) {
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
  return match && match[0].toLowerCase() !== "https://api.trycloudflare.com" ? match[0] : null;
}
async function findCloudflaredOnPath() {
  const cmd = platform() === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync$1(cmd, ["cloudflared"], { timeout: 3e3 });
    const resolved = stdout.trim().split(/\r?\n/)[0];
    return resolved && existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}
function resolveCurrentAssetSpec(osPlatform = platform(), osArch = arch()) {
  const normalizedArch = osArch === "x64" || osArch === "amd64" ? "x64" : osArch;
  const key = `${osPlatform}-${normalizedArch}`;
  const spec = CLOUDFLARED_ASSETS[key];
  return spec ? { key, spec } : null;
}
async function sha256OfFile(path) {
  const hash = createHash("sha256");
  await new Promise((resolve2, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve2());
  });
  return hash.digest("hex");
}
async function ensureCloudflaredBinary(options) {
  if (options.customPath && existsSync(options.customPath)) {
    return options.customPath;
  }
  const find = options.findOnPath ?? findCloudflaredOnPath;
  const onPath = await find();
  if (onPath) return onPath;
  const target = resolveCurrentAssetSpec(options.osPlatform, options.osArch);
  if (!target) {
    throw new Error(`Unsupported platform/architecture for cloudflared: ${options.osPlatform ?? platform()}-${options.osArch ?? arch()}`);
  }
  const binaryName = (options.osPlatform ?? platform()) === "win32" ? "cloudflared.exe" : "cloudflared";
  const targetBinaryPath = join(options.cacheDir, binaryName);
  if (existsSync(targetBinaryPath)) {
    return targetBinaryPath;
  }
  await mkdir(options.cacheDir, { recursive: true });
  for (const entry of await readdir(options.cacheDir)) {
    if (entry.startsWith(".download-")) {
      await rm(join(options.cacheDir, entry), { force: true }).catch(() => void 0);
    }
  }
  const downloadUrl = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${target.spec.asset}`;
  const tempDownloadPath = join(options.cacheDir, `.download-${Date.now()}-${target.spec.asset}`);
  try {
    const download = options.download ?? downloadCloudflaredWithRetry;
    await download(downloadUrl, tempDownloadPath);
    const actualSha256 = await sha256OfFile(tempDownloadPath);
    if (actualSha256 !== target.spec.sha256) {
      await rm(tempDownloadPath, { force: true }).catch(() => void 0);
      throw new Error(
        `cloudflared checksum mismatch: expected ${target.spec.sha256}, got ${actualSha256}`
      );
    }
    if (target.spec.isTarGz) {
      await execFileAsync$1("tar", ["-xzf", tempDownloadPath, "-C", options.cacheDir]);
      await rm(tempDownloadPath, { force: true }).catch(() => void 0);
    } else {
      await rm(targetBinaryPath, { force: true }).catch(() => void 0);
      const { rename: rename2 } = await import("node:fs/promises");
      await rename2(tempDownloadPath, targetBinaryPath);
    }
    if ((options.osPlatform ?? platform()) !== "win32") {
      await chmod(targetBinaryPath, 493);
    }
    return targetBinaryPath;
  } catch (error) {
    await rm(tempDownloadPath, { force: true }).catch(() => void 0);
    throw new Error(`Failed to obtain cloudflared binary: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function isRetryableDownloadError(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code ?? "") : "";
  if (code === "ECONNRESET" || code === "ECONNREFUSED" || code === "ETIMEDOUT") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT/.test(message);
}
async function downloadCloudflaredWithRetry(url, destination, options) {
  const download = options?.download ?? downloadFileWithRedirects;
  const attempts = options?.attempts ?? CLOUDFLARED_DOWNLOAD_ATTEMPTS;
  const sleep = options?.sleep ?? ((ms) => new Promise((resolve2) => setTimeout(resolve2, ms)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await download(url, destination);
      return;
    } catch (error) {
      lastError = error;
      await rm(destination, { force: true }).catch(() => void 0);
      if (attempt === attempts || !isRetryableDownloadError(error)) throw error;
      await sleep(200 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}
function downloadFileWithRedirects(url, destination, maxRedirects = 5, timeoutMs = CLOUDFLARED_DOWNLOAD_TIMEOUT_MS) {
  return new Promise((resolvePromise, rejectPromise) => {
    if (maxRedirects <= 0) {
      return rejectPromise(new Error("Too many redirects while downloading cloudflared"));
    }
    const request = get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolvePromise(
          downloadFileWithRedirects(res.headers.location, destination, maxRedirects - 1, timeoutMs)
        );
      }
      if (res.statusCode !== 200) {
        res.resume();
        return rejectPromise(new Error(`Download failed with status ${res.statusCode}`));
      }
      const fileStream = createWriteStream(destination);
      res.once("aborted", () => {
        fileStream.destroy(
          Object.assign(new Error("cloudflared download response was aborted"), { code: "ECONNRESET" })
        );
      });
      void pipeline(res, fileStream).then(() => resolvePromise(), rejectPromise);
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(
        Object.assign(new Error(`cloudflared download timed out after ${timeoutMs / 1e3}s`), {
          code: "ETIMEDOUT"
        })
      );
    });
    request.once("error", rejectPromise);
  });
}
function terminateChildProcess(child, graceMs = 2e3) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, graceMs).unref?.();
}
async function startCloudflareQuickTunnel(options) {
  const { port, binaryPath, timeoutMs = 3e4, log: log2 } = options;
  return new Promise((resolvePromise, rejectPromise) => {
    let resolved = false;
    const child = spawn(binaryPath, ["tunnel", "--url", `http://127.0.0.1:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const timeoutTimer = setTimeout(() => {
      if (!resolved) {
        cleanup();
        rejectPromise(new Error(`Cloudflare Quick Tunnel timed out after ${timeoutMs / 1e3}s`));
      }
    }, timeoutMs);
    let capturedUrl = null;
    const handleOutput = (chunk) => {
      const text = chunk.toString();
      const extracted = extractTryCloudflareUrl(text);
      if (extracted && !capturedUrl) {
        capturedUrl = extracted;
        log2?.(`[cloudflared] Tunnel online: ${capturedUrl}`);
        resolved = true;
        clearTimeout(timeoutTimer);
        resolvePromise({
          provider: "cloudflare",
          url: capturedUrl,
          process: child,
          stop: async () => {
            cleanup();
          }
        });
      }
    };
    child.stdout?.on("data", handleOutput);
    child.stderr?.on("data", handleOutput);
    child.once("error", (err) => {
      if (!resolved) {
        clearTimeout(timeoutTimer);
        rejectPromise(err);
      }
    });
    child.once("close", (code, signal) => {
      if (!resolved) {
        clearTimeout(timeoutTimer);
        rejectPromise(new Error(`cloudflared exited unexpectedly with code ${code}, signal ${signal}`));
      }
    });
    const cleanup = () => {
      try {
        terminateChildProcess(child);
      } catch {
      }
    };
  });
}
async function startTunnelWithFallback(options) {
  try {
    if (options.forceCloudflareFailure) {
      throw new Error("Cloudflare failure forced by DSH_TUNNEL_FORCE_PINGGY");
    }
    return await options.startCloudflare();
  } catch (cloudflareError) {
    const cloudflareMessage = errorMessage$1(cloudflareError);
    options.log?.(`[tunnel] Cloudflare unavailable, falling back to Pinggy: ${cloudflareMessage}`);
    try {
      return await options.startPinggy();
    } catch (pinggyError) {
      throw new Error(
        `Unable to create an internet tunnel. Cloudflare: ${cloudflareMessage}; Pinggy: ${errorMessage$1(pinggyError)}`
      );
    }
  }
}
function errorMessage$1(error) {
  return error instanceof Error ? error.message : String(error);
}
const execFileAsync = promisify(execFile);
const PINGGY_HOST = "free.pinggy.io";
const PINGGY_USER = "dsh";
function extractPinggyUrl(text) {
  const matches = text.matchAll(
    /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:pinggy(?:-free)?\.link|pinggy\.online)/gi
  );
  for (const match of matches) return match[0];
  return null;
}
async function findSshOnPath(osPlatform = platform()) {
  const cmd = osPlatform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(cmd, ["ssh"], { timeout: 3e3 });
    const resolved = stdout.trim().split(/\r?\n/)[0];
    return resolved && existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}
function buildPinggySshArgs(options) {
  return [
    "-p",
    "443",
    "-R",
    `0:127.0.0.1:${options.port}`,
    "-i",
    options.identityPath,
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=15",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `UserKnownHostsFile=${options.knownHostsPath}`,
    "-o",
    `User=${PINGGY_USER}`,
    PINGGY_HOST
  ];
}
function pinggyIdentityPath(knownHostsPath) {
  return join(dirname(knownHostsPath), "pinggy-id");
}
async function ensurePinggyIdentity(options) {
  if (existsSync(options.identityPath)) return options.identityPath;
  await mkdir(dirname(options.identityPath), { recursive: true });
  if (options.createIdentity) {
    await options.createIdentity(options.identityPath);
  } else {
    const keygenPath = resolveSshKeygen(options.sshPath);
    await execFileAsync(keygenPath, ["-t", "ed25519", "-f", options.identityPath, "-N", "", "-q"], {
      timeout: 1e4
    });
  }
  if (!existsSync(options.identityPath)) {
    throw new Error(`ssh-keygen did not create Pinggy identity: ${options.identityPath}`);
  }
  return options.identityPath;
}
function resolveSshKeygen(sshPath) {
  if (sshPath) {
    const sibling = join(dirname(sshPath), platform() === "win32" ? "ssh-keygen.exe" : "ssh-keygen");
    if (existsSync(sibling)) return sibling;
  }
  return "ssh-keygen";
}
async function startPinggyTunnel(options) {
  const { port, knownHostsPath, timeoutMs = 3e4, log: log2 } = options;
  const sshPath = options.sshPath ?? await findSshOnPath();
  if (!sshPath) {
    throw new Error(`OpenSSH client was not found for ${platform()}-${arch()}`);
  }
  if (!existsSync(sshPath)) throw new Error(`OpenSSH client does not exist: ${sshPath}`);
  await mkdir(dirname(knownHostsPath), { recursive: true });
  const identityPath = await ensurePinggyIdentity({
    identityPath: options.identityPath ?? pinggyIdentityPath(knownHostsPath),
    sshPath,
    createIdentity: options.createIdentity
  });
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let output = "";
    const child = spawn(
      sshPath,
      buildPinggySshArgs({ port, knownHostsPath, identityPath }),
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    );
    const cleanup = () => {
      try {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM");
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
          }, 2e3).unref?.();
        }
      } catch {
      }
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      cleanup();
      rejectPromise(error);
    };
    const timeoutTimer = setTimeout(() => {
      const detail = lastOutputLine(output);
      fail(
        new Error(
          `Pinggy Tunnel timed out after ${timeoutMs / 1e3}s${detail ? `: ${detail}` : ""}`
        )
      );
    }, timeoutMs);
    const handleOutput = (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-16384);
      const capturedUrl = extractPinggyUrl(output);
      if (!capturedUrl || settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      log2?.(`[pinggy] Tunnel online: ${capturedUrl}`);
      resolvePromise({
        provider: "pinggy",
        url: capturedUrl,
        process: child,
        stop: async () => cleanup()
      });
    };
    child.stdout?.on("data", handleOutput);
    child.stderr?.on("data", handleOutput);
    child.once("error", (error) => fail(error));
    child.once("close", (code, signal) => {
      const detail = lastOutputLine(output);
      fail(
        new Error(
          `Pinggy exited unexpectedly with code ${code}, signal ${signal}${detail ? `: ${detail}` : ""}`
        )
      );
    });
  });
}
function lastOutputLine(output) {
  const lines = output.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return (lines.at(-1) ?? "").slice(0, 300);
}
function renderMobilePage({ locale }) {
  const zh = locale === "zh";
  return `<!doctype html>
<html lang="${zh ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme:light)">
  <meta name="theme-color" content="#141416" media="(prefers-color-scheme:dark)">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="DSH Mobile">
  <link rel="icon" href="/app-icon">
  <link rel="apple-touch-icon" href="/app-icon">
  <title>DSH Mobile</title>
  <style>
    :root{color-scheme:light;--paper:#fff;--sidebar:#f7f8fa;--ink:#18191c;--muted:#81858c;--line:#e5e7eb;--card:#fff;--hover:#f2f3f5;--surface:#f7f7f5;--brand:#4d6bfe}
    @media(prefers-color-scheme:dark){:root{color-scheme:dark;--paper:#141416;--sidebar:#19191b;--ink:#f5f5f6;--muted:#95979d;--line:#303034;--card:#1d1d20;--hover:#29292d;--surface:#202023;--brand:#6f86ff}}
    *{box-sizing:border-box}html,body{height:100%;overflow:hidden}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    button,input,textarea,select{font:inherit}.shell{max-width:760px;height:var(--app-height,100dvh);margin:auto;padding:calc(6px + env(safe-area-inset-top)) 14px calc(8px + env(safe-area-inset-bottom));display:flex;flex-direction:column}
    header{height:48px;display:flex;flex:none;align-items:center;justify-content:space-between;padding:0 3px}.brand{font-size:15px;font-weight:600;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}.brand img{width:35px;height:20px;object-fit:contain}.brand .dark-logo{display:none}@media(prefers-color-scheme:dark){.brand .light-logo{display:none}.brand .dark-logo{display:block}}.status{width:8px;height:8px;border-radius:50%;margin-right:4px;background:#35a867;box-shadow:0 0 0 0 rgba(53,168,103,.42);animation:connectedPulse 1.8s ease-out infinite}.status.connecting{background:var(--muted);animation:none}.status.error-state{background:#e34d59;animation:none}@keyframes connectedPulse{70%{box-shadow:0 0 0 7px rgba(53,168,103,0)}100%{box-shadow:0 0 0 0 rgba(53,168,103,0)}}
    .view{display:none;min-height:0}.view.active{display:flex;flex:1;flex-direction:column}.toolbar{display:flex;flex:none;gap:8px;align-items:center;padding:12px 0}.toolbar select{flex:1;min-width:0}#sessionsView{padding-top:2px}.session-hero{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 2px 11px}.session-heading{min-width:0}.session-heading h1{margin:0;font-size:24px;line-height:1.15;letter-spacing:-.035em;font-weight:650}.session-heading p{margin:0 0 1px;color:var(--muted);font-size:10.5px}.workspace-panel{flex:none;border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:9px}.workspace-label{display:block;margin:0 2px 4px;color:var(--muted);font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}.session-actions{display:flex;gap:7px}.session-actions select{flex:1;min-width:0;height:39px;background:var(--card);font-weight:500}.icon-button{display:grid;place-items:center;width:39px;height:39px;padding:0;background:var(--card)}.icon-button.refreshing svg{animation:spin .65s linear infinite}.new-session{display:flex;align-items:center;gap:5px;height:36px;flex:none;border-color:var(--ink);border-radius:11px;padding:6px 11px;background:var(--ink);color:var(--paper);font-weight:600}.new-session:hover{background:var(--ink);opacity:.86}.new-session:disabled{cursor:default;opacity:.35}.new-session svg{display:block}.workspace-hint{color:var(--muted);font-size:12px;line-height:1.4;padding:7px 2px 1px}.workspace-hint[hidden]{display:none}.list-heading{display:flex;align-items:center;justify-content:space-between;padding:14px 2px 6px}.list-heading strong{font-size:13px;font-weight:650}.session-count{display:grid;place-items:center;min-width:24px;height:20px;border-radius:999px;background:var(--surface);color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}body.chat-open header{display:none}body.chat-open .shell{padding:env(safe-area-inset-top) 14px 0}#chatView{position:relative}.chat-toolbar{position:absolute;inset:0 0 auto;z-index:2;min-height:40px;padding:0;background:transparent;pointer-events:none}.back{display:grid;place-items:center;flex:none;width:40px;height:40px;border:1px solid var(--line)!important;border-radius:50%;padding:0!important;background:var(--card)!important;box-shadow:0 2px 8px rgba(0,0,0,.06);pointer-events:auto}.back:hover{background:var(--hover)!important}.back svg{display:block}
    select,button,textarea{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:10px 12px}button{cursor:pointer}button:hover{background:var(--hover)}button.primary{display:flex;align-items:center;justify-content:center;gap:6px;flex:none;min-width:68px;height:40px;border:1px solid var(--ink);border-radius:13px;padding:0 11px 0 13px;background:var(--ink);color:var(--paper);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--paper) 10%,transparent),0 2px 5px rgba(0,0,0,.14);transition:transform .14s ease,opacity .14s ease,box-shadow .14s ease}.primary svg{display:block;flex:none}.primary:hover:not(:disabled){background:var(--ink);opacity:.88;transform:translateY(-1px)}.primary:active:not(:disabled){transform:translateY(0);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--paper) 8%,transparent),0 1px 2px rgba(0,0,0,.12)}.primary:disabled{cursor:default;border-color:var(--line);background:var(--surface);color:var(--muted);box-shadow:none}button.quiet{background:transparent}
    .list{display:grid;grid-template-columns:minmax(0,1fr);min-width:0;align-content:start;gap:8px;overflow-y:auto;padding:0 0 12px}.row{width:100%;min-width:0;display:flex;align-items:center;gap:11px;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:15px;padding:12px;transition:background .16s ease,transform .16s ease}.row:hover,.row:active{background:var(--surface);transform:translateY(-1px)}.session-mark{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:11px;background:var(--surface);color:var(--ink)}.row-copy{min-width:0;flex:1}.row strong{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row time{display:block;margin-top:2px;color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}.row-chevron{flex:none;color:var(--muted);opacity:.7}.empty{display:flex;min-height:190px;align-items:center;justify-content:center;flex-direction:column;padding:42px 18px;text-align:center;color:var(--muted)}.empty-mark{display:grid;place-items:center;width:44px;height:44px;margin-bottom:12px;border-radius:14px;background:var(--surface);color:var(--ink)}.empty strong{color:var(--ink);font-size:14px}.empty span:last-child{max-width:220px;margin-top:4px;font-size:12px}.messages{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:0;padding:18px 4px}.chat-open .messages{padding-top:4px;padding-bottom:84px}.message{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink);line-height:1.65}.message.user{align-self:flex-end;max-width:82%;background:var(--hover);border-radius:22px;padding:9px 15px;margin:8px 0 14px}.message.assistant{align-self:stretch;padding:0 4px;margin:0}.message .role{display:none}
    .markdown{white-space:normal}.markdown>*:first-child{margin-top:0}.markdown>*:last-child{margin-bottom:0}.markdown p{margin:0 0 10px}.markdown h1,.markdown h2,.markdown h3{line-height:1.3;margin:18px 0 8px}.markdown h1{font-size:22px}.markdown h2{font-size:19px}.markdown h3{font-size:16px}.markdown ul{margin:8px 0;padding-left:22px}.markdown pre{overflow:auto;background:var(--hover);border:1px solid var(--line);border-radius:10px;padding:12px;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}.markdown code{background:var(--hover);border-radius:5px;padding:2px 5px;font:13px ui-monospace,SFMono-Regular,Menlo,monospace}.markdown pre code{padding:0;background:none}.markdown a{color:var(--brand)}.table-wrap{width:100%;overflow-x:auto;margin:10px 0;-webkit-overflow-scrolling:touch}.markdown table{width:100%;min-width:420px;border-collapse:collapse;font-size:13px;line-height:1.5}.markdown th,.markdown td{padding:9px 10px;border:1px solid var(--line);text-align:left;vertical-align:top}.markdown th{background:var(--hover);font-weight:600}.thinking,.tool{position:relative;margin:0;white-space:normal}.thinking summary,.tool summary{position:relative;min-height:34px;cursor:pointer;list-style:none;border-radius:6px;padding:5px 2px;color:var(--ink);font-size:14px;line-height:24px;display:flex;align-items:center;gap:0;overflow:hidden}.thinking summary:hover,.tool summary:hover{background:var(--hover)}.thinking summary::-webkit-details-marker,.tool summary::-webkit-details-marker{display:none}.activity-leading{width:16px;height:16px;display:grid;place-items:center;flex:none;margin-right:6px;color:var(--muted)}.activity-leading svg{display:block}.activity-title{flex:none;font-weight:400}.activity-dot{width:2px;height:2px;margin:0 8px;border-radius:50%;background:var(--muted);opacity:.7;flex:none}.activity-summary{position:relative;min-width:0;flex:1;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.activity-chevron{width:16px;height:16px;display:grid;place-items:center;flex:none;color:var(--muted);transition:transform .14s ease}.thinking[open] .activity-chevron,.tool[open] .activity-chevron{transform:rotate(90deg)}.thinking-body{padding:3px 0 7px 22px;color:var(--muted);font-size:13px;line-height:22px}.tool-body{padding:3px 0 8px 20px;color:var(--muted);font-size:12px}.tool-body strong{display:block;margin:7px 0 3px;font-weight:500}.tool-status.error,.tool[data-state=error] .activity-leading{color:#e34d59}.tool pre{max-height:260px;white-space:pre-wrap;overflow:auto;overflow-wrap:anywhere;margin:0 0 4px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:10px 12px;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}.thinking[data-state=running] .activity-summary:after,.tool[data-state=running] .activity-summary:after{content:'';position:absolute;inset:0 auto 0 -240px;width:240px;pointer-events:none;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--paper) 72%,transparent),transparent);animation:activitySweep 2.6s ease-out infinite}.streaming:after{content:' ';display:inline-block;width:6px;height:15px;margin-left:2px;vertical-align:-2px;background:var(--brand);animation:pulse .7s infinite alternate}.turn-status{height:26px;display:inline-flex;align-items:center;margin:0 4px 6px;pointer-events:none;color:transparent;-webkit-text-fill-color:transparent;background:linear-gradient(90deg,var(--brand) 0%,var(--brand) 40%,color-mix(in srgb,var(--brand) 35%,var(--paper)) 50%,var(--brand) 60%,var(--brand) 100%);background-position:100% 0;background-size:250% 100%;-webkit-background-clip:text;background-clip:text;font-size:14px;font-weight:600;white-space:nowrap;animation:deepDiveShimmer 1.8s linear infinite}
    [hidden]{display:none!important}.message:empty{display:none}.composer{position:absolute;z-index:2;inset:auto 0 0;padding:10px 0 5px;background:transparent;pointer-events:none}.composer-inner{min-height:58px;display:flex;gap:8px;align-items:flex-end;border:1px solid var(--line);border-radius:23px;padding:8px 8px 8px 16px;background:var(--card);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--paper) 70%,transparent),0 2px 8px rgba(0,0,0,.06),0 14px 34px rgba(0,0,0,.06);pointer-events:auto;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}.composer-inner:focus-within{border-color:color-mix(in srgb,var(--ink) 28%,var(--line));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--paper) 72%,transparent),0 3px 10px rgba(0,0,0,.08),0 18px 38px rgba(0,0,0,.08);transform:translateY(-1px)}.composer textarea{flex:1;height:40px;min-height:40px;max-height:150px;overflow-y:auto;resize:none;border:0;outline:0;border-radius:0;padding:9px 0;background:transparent;color:var(--ink);caret-color:var(--brand);font-size:16px;letter-spacing:-.01em}.composer textarea::placeholder{color:var(--muted);opacity:.68}.composer .primary,.primary.cancel{width:40px;min-width:40px;border-radius:50%;padding:0;background:var(--ink);border-color:var(--ink)}.settings-trigger{display:grid;place-items:center;width:40px;min-width:40px;height:40px;border-radius:50%;padding:0;background:var(--surface);color:var(--muted)}.settings-trigger[aria-expanded=true]{border-color:var(--ink);background:var(--ink);color:var(--paper)}.session-settings{position:absolute;right:8px;bottom:76px;width:min(350px,calc(100vw - 28px));max-height:min(62vh,470px);overflow-y:auto;border:1px solid var(--line);border-radius:18px;padding:15px;background:var(--card);box-shadow:0 8px 26px rgba(0,0,0,.1),0 24px 60px rgba(0,0,0,.12);pointer-events:auto}.settings-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.settings-head strong{font-size:15px;font-weight:650}.settings-close{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:50%;padding:0;background:transparent;color:var(--muted);font-size:20px;line-height:1}.setting-field{display:block;margin-top:11px}.setting-field>span{display:block;margin:0 2px 5px;color:var(--muted);font-size:11px;font-weight:600}.setting-field select{width:100%;height:42px;background:var(--surface)}.setting-field select:disabled{opacity:.55}.setting-note{margin:5px 2px 0;color:var(--muted);font-size:11px;line-height:1.4}.settings-error{min-height:17px;margin-top:7px;color:#e34d59;font-size:11px}.settings-loading{padding:14px 2px;color:var(--muted);font-size:12px}.todo-dock{margin:0 0 8px;border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:hidden;pointer-events:auto}.todo-header{width:100%;height:38px;display:flex;align-items:center;gap:8px;border:0;border-radius:0;padding:0 11px;background:transparent;text-align:left}.todo-lead,.todo-chevron{display:grid;place-items:center;flex:none;color:var(--muted)}.todo-title{flex:none;font-size:13px;font-weight:600}.todo-progress{min-width:0;flex:1;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.todo-list{display:grid;gap:7px;max-height:180px;overflow-y:auto;margin:0;padding:1px 12px 10px;list-style:none}.todo-item{min-width:0;display:flex;align-items:center;gap:9px;color:var(--muted);font-size:13px}.todo-glyph{display:grid;place-items:center;width:16px;height:16px;flex:none}.todo-item[data-status=completed] .todo-glyph{color:#35a867}.todo-item[data-status=in_progress] .todo-glyph{color:var(--brand);animation:spin 1s linear infinite}.todo-content{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.turn-running .messages{padding-bottom:116px}.todo-open .messages{padding-bottom:130px}.turn-running.todo-open .messages{padding-bottom:162px}.todo-expanded .messages{padding-bottom:min(42vh,300px)}.turn-running.todo-expanded .messages{padding-bottom:min(42vh,332px)}.turn-running .session-settings{bottom:108px}.todo-open .session-settings{bottom:122px}.turn-running.todo-open .session-settings{bottom:154px}.todo-expanded .session-settings{bottom:min(42vh,292px)}.turn-running.todo-expanded .session-settings{bottom:min(42vh,324px)}.primary[hidden]{display:none}.question-composer{position:absolute;z-index:3;inset:auto 0 0;padding:10px 0 5px;pointer-events:none}.question-shell{max-height:min(70vh,580px);display:flex;flex-direction:column;border:1px solid var(--line);border-radius:23px;background:var(--card);box-shadow:0 4px 16px rgba(0,0,0,.08),0 22px 54px rgba(0,0,0,.1);overflow:hidden;pointer-events:auto}.question-top{display:flex;align-items:center;gap:9px;flex:none;padding:13px 16px 10px;border-bottom:1px solid var(--line)}.question-mark{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:var(--surface);color:var(--ink)}.question-context{min-width:0;flex:1}.question-context strong{display:block;font-size:13px;font-weight:650}.question-context span{display:block;color:var(--muted);font-size:11px}.question-close{width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:50%;padding:0;background:transparent;color:var(--muted)}.question-body{min-height:0;overflow-y:auto;padding:14px 16px 4px;-webkit-overflow-scrolling:touch}.question-title{margin:0;font-size:17px;line-height:1.45;letter-spacing:-.015em;font-weight:620}.question-detail{margin-top:7px;color:var(--muted);font-size:13px}.question-options{display:grid;gap:7px;margin-top:13px}.question-option{width:100%;display:flex;align-items:flex-start;gap:10px;border:1px solid var(--line);border-radius:13px;padding:10px 11px;background:var(--card);text-align:left}.question-option.selected{border-color:var(--ink);background:var(--surface)}.option-control{display:grid;place-items:center;width:19px;height:19px;flex:none;margin-top:1px;border:1px solid var(--muted);border-radius:50%;font-size:11px}.multi .option-control{border-radius:6px}.question-option.selected .option-control{border-color:var(--ink);background:var(--ink);color:var(--paper)}.option-copy{min-width:0;flex:1}.option-label{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:14px}.recommendation{border-radius:999px;background:var(--surface);color:var(--muted);padding:1px 6px;font-size:10px}.option-description{display:block;margin-top:2px;color:var(--muted);font-size:12px;line-height:1.45}.custom-label{display:block;margin:13px 1px 5px;color:var(--muted);font-size:11px;font-weight:600}.question-custom{width:100%;min-height:54px;max-height:110px;resize:vertical;border:1px solid var(--line);border-radius:13px;padding:10px 11px;background:var(--surface);outline:none}.question-custom:focus{border-color:color-mix(in srgb,var(--ink) 35%,var(--line))}.question-error{min-height:18px;padding:5px 16px 0;color:#e34d59;font-size:11px}.question-actions{display:flex;align-items:center;gap:7px;flex:none;padding:8px 12px 12px}.question-actions button{height:38px;padding:0 12px;border-radius:11px}.question-actions .spacer{flex:1}.question-actions .submit-answer{border-color:var(--ink);background:var(--ink);color:var(--paper);font-weight:600}.question-actions button:disabled{opacity:.45;cursor:default}.question-open .messages{padding-bottom:min(64vh,520px)}.error{color:#e34d59;font-size:13px;margin:8px 0}.toast{position:fixed;left:50%;top:calc(64px + env(safe-area-inset-top));z-index:5;transform:translate(-50%,-8px);background:var(--ink);color:var(--paper);border-radius:999px;padding:6px 11px;font-size:12px;opacity:0;pointer-events:none;transition:.18s ease}.toast.show{opacity:1;transform:translate(-50%,0)}.loading{display:grid;gap:12px;padding:22px 4px}.skeleton{height:14px;border-radius:7px;background:var(--hover);animation:pulse 1.1s ease-in-out infinite alternate}.skeleton:nth-child(2){width:82%}.skeleton:nth-child(3){width:64%}@keyframes pulse{to{opacity:.35}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes activitySweep{0%{left:-240px}90%,to{left:100%}}@keyframes deepDiveShimmer{to{background-position:0 0}}@media(display-mode:standalone){.chat-open .messages{padding-bottom:calc(84px + env(safe-area-inset-bottom))}.chat-open.turn-running .messages{padding-bottom:calc(116px + env(safe-area-inset-bottom))}.chat-open.todo-open .messages{padding-bottom:calc(130px + env(safe-area-inset-bottom))}.chat-open.turn-running.todo-open .messages{padding-bottom:calc(162px + env(safe-area-inset-bottom))}.chat-open.todo-expanded .messages{padding-bottom:min(42vh,calc(300px + env(safe-area-inset-bottom)))}.chat-open.turn-running.todo-expanded .messages{padding-bottom:min(42vh,calc(332px + env(safe-area-inset-bottom)))}.chat-open.question-open .messages{padding-bottom:min(64vh,520px)}.composer,.question-composer{padding-bottom:calc(5px + env(safe-area-inset-bottom))}}@media(prefers-reduced-motion:reduce){.skeleton,.status,.icon-button.refreshing svg,.thinking[data-state=running] .activity-summary:after,.tool[data-state=running] .activity-summary:after,.turn-status,.todo-item[data-status=in_progress] .todo-glyph{animation:none}.composer-inner,.primary{transition:none}}
    /* Keep the popover anchored to its trigger; composer docks may grow behind it. */
    #composer .session-settings{z-index:1;bottom:76px}
    .messages .turn-status{align-self:flex-start;flex:none;margin:3px 4px}
  </style>
</head>
<body><main class="shell">
  <div id="toast" class="toast" role="status"></div>
  <header><div class="brand"><img class="light-logo" src="/brand-logo/light" alt=""><img class="dark-logo" src="/brand-logo/dark" alt=""><span>DSH Desktop</span></div><div id="status" class="status connecting" role="status" aria-label="${zh ? "正在连接" : "Connecting"}"></div></header>
  <section id="sessionsView" class="view active">
    <div class="session-hero"><div class="session-heading"><p>${zh ? "移动工作台" : "Mobile workspace"}</p><h1>${zh ? "继续对话" : "Continue working"}</h1></div><button id="newSession" class="new-session" disabled><svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3.5V12.5M3.5 8H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>${zh ? "新会话" : "New session"}</button></div>
    <div class="workspace-panel"><label class="workspace-label" for="workspace">${zh ? "当前工作区" : "Current workspace"}</label><div class="session-actions"><select id="workspace" aria-label="${zh ? "当前工作区" : "Current workspace"}"></select><button id="refresh" class="icon-button" aria-label="${zh ? "刷新" : "Refresh"}"><svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M16 7.5A6.5 6.5 0 1 0 16 13M16 7.5V3.5M16 7.5H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div><div id="workspaceHint" class="workspace-hint"></div></div>
    <div class="list-heading"><strong>${zh ? "最近会话" : "Recent sessions"}</strong><span id="sessionCount" class="session-count">0</span></div>
    <div id="sessions" class="list"></div><div id="listError" class="error"></div>
  </section>
  <section id="chatView" class="view">
    <div class="toolbar chat-toolbar"><button id="back" class="quiet back" aria-label="${zh ? "返回会话列表" : "Back to sessions"}"><svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.5 3L5.5 8L10.5 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
    <div id="messages" class="messages"></div><div id="chatError" class="error"></div>
    <div id="questionComposer" class="question-composer" hidden></div>
    <div id="composer" class="composer"><div id="sessionSettings" class="session-settings" hidden></div><section id="todoDock" class="todo-dock" aria-label="${zh ? "任务" : "To-dos"}" hidden></section><div class="composer-inner"><textarea id="prompt" rows="1" placeholder="${zh ? "给智能体发消息" : "Message the agent"}"></textarea><button id="settings" class="settings-trigger" aria-label="${zh ? "会话设置" : "Session settings"}" aria-expanded="false"><svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 5h7M13 5h2M3 13h2M8 13h7M10 3v4M6 11v4" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg></button><button id="send" class="primary" aria-label="${zh ? "发送" : "Send"}" disabled><svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 12V4M8 4 4.75 7.25M8 4l3.25 3.25" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button id="cancel" class="primary cancel" aria-label="${zh ? "停止生成" : "Stop generating"}" hidden><svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor"/></svg></button></div></div>
  </section>
</main>
<script>
const L=${JSON.stringify({
    noSessions: zh ? "还没有会话" : "No sessions yet",
    emptyHint: zh ? "创建一个新会话，从这里继续电脑上的工作。" : "Start a session and continue your desktop work here.",
    untitled: zh ? "未命名会话" : "Untitled session",
    failed: zh ? "请求失败" : "Request failed",
    chooseWorkspace: zh ? "请先选择一个工作区。" : "Choose a workspace first.",
    running: zh ? "运行中" : "Running",
    done: zh ? "完成" : "Done",
    toolFailed: zh ? "失败" : "Failed",
    input: zh ? "输入" : "Input",
    output: zh ? "输出" : "Output",
    noWorkspaces: zh ? "暂无工作区，请先在 DSH Desktop 中创建第一个工作区。" : "No workspaces yet. Create your first workspace in DSH Desktop.",
    refreshed: zh ? "已刷新" : "Updated",
    justNow: zh ? "刚刚" : "Now",
    minute: zh ? " 分钟前" : "m ago",
    hour: zh ? " 小时前" : "h ago",
    day: zh ? " 天前" : "d ago",
    questionNeeded: zh ? "需要你的回答" : "Your input is needed",
    questionProgress: zh ? "个问题" : "questions",
    customAnswer: zh ? "或者输入其他回答" : "Or enter another answer",
    customPlaceholder: zh ? "输入你的回答…" : "Type your answer…",
    skip: zh ? "跳过" : "Skip",
    previous: zh ? "上一个" : "Back",
    next: zh ? "下一个" : "Next",
    submitAnswer: zh ? "提交回答" : "Submit answers",
    cancelQuestions: zh ? "取消这次提问" : "Cancel this request",
    chooseAnswer: zh ? "请选择一个选项、输入回答，或跳过。" : "Choose an option, enter an answer, or skip.",
    recommended: zh ? "推荐" : "Recommended",
    answering: zh ? "正在提交…" : "Submitting…",
    presetStandard: zh ? "标准模式" : "Standard mode",
    presetCode: zh ? "PTC 模式" : "PTC mode",
    presetMinimal: zh ? "极简模式" : "Minimal mode",
    presetCordis: zh ? "创造模式" : "Creator mode",
    customPreset: zh ? "自定义" : "Custom",
    sessionSettings: zh ? "会话设置" : "Session settings",
    preset: zh ? "Preset" : "Preset",
    model: zh ? "模型" : "Model",
    reasoningEffort: zh ? "思考强度" : "Reasoning effort",
    presetLocked: zh ? "发送首条消息后，Preset 已锁定。" : "Preset is locked after the first message.",
    presetEditable: zh ? "仅可在发送第一条消息前更改。" : "Can be changed before the first message only.",
    settingsLoading: zh ? "正在读取模型与 Preset…" : "Loading models and presets…",
    settingsUpdated: zh ? "会话设置已更新" : "Session settings updated",
    noModels: zh ? "当前没有可选模型" : "No models are available",
    defaultEffort: zh ? "默认" : "Default",
    todoTitle: zh ? "任务" : "To-dos",
    todoDone: zh ? "已完成" : "completed",
    todoActive: zh ? "进行中" : "in progress",
    todoPending: zh ? "待处理" : "pending"
  })};
  const HISTORY_POLL_ACTIVE_MS=250,HISTORY_POLL_IDLE_MS=750,HISTORY_POLL_IDLE_CAP_MS=5000,PENDING_SYNC_DEBOUNCE_MS=150;
  let idlePollMs=HISTORY_POLL_IDLE_MS;
  let activeSession=null,poll=null,sessionStream=null,streamConnected=false,streamEvents=[],streamProjections=null,streamRenderFrame=null,streamNeedsFullPaint=false,streamRevision=0,pendingSyncTimer=null,workspaces=[],presets=[],sessionSummaries=[],archivedSessionIds=[],historyBusy=false,lastHistoryKey='',lastDurableMessages=[],optimisticPrompts=[],latestUserTextCounts=new Map(),agentRunning=false,awaitingTurnStartedAt=0,pendingQuestion=null,questionIndex=0,questionDrafts={},questionBusy=false,sessionBlank=true,currentPreset=null,modelCatalog=null,settingsBusy=false,currentTodos=[],todoExpanded=false;
const $=id=>document.getElementById(id);
async function rpc(method,payload={}){let r;try{r=await fetch('/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,payload})})}catch{const e=new Error('');e.disconnected=true;throw e}if(r.status===401){const e=new Error('');e.disconnected=true;throw e}let j;try{j=await r.json()}catch{throw new Error(L.failed)}if(!r.ok||!j.ok)throw new Error(j.error||L.failed);return j.value}
function showError(id,error){$(id).textContent=error?.disconnected?'':error?.message||L.failed}
function stepKey(d){return String(d.turn)+':'+String(d.step)}
function contentBlocks(content){return(Array.isArray(content)?content:[]).flatMap(block=>{if(block?.type==='text'&&block.text)return[{kind:'text',text:block.text}];if(block?.type==='reasoning'&&block.text)return[{kind:'reasoning',text:block.text}];if(block?.type==='tool-call')return[{kind:'tool',id:block.id,name:block.name,args:block.arguments,status:'running'}];return[]})}
function visibleMessages(events){const out=[],steps=new Map();function ensureStep(d){const key=stepKey(d);if(!steps.has(key)){steps.set(key,{role:'assistant',blocks:[],streaming:true});out.push(steps.get(key))}return steps.get(key)}for(const entry of events){const e=entry.event||entry,d=e.data||{},t=String(e.type||'').toLowerCase();if(t==='user/message'){const message=d.message||d;if(message.source?.kind==='user'){const blocks=contentBlocks(message.content).filter(block=>block.kind==='text');if(blocks.length)out.push({role:'user',blocks})}continue}if(t==='assistant/chunk'){const chunk=d.chunk||{};if(chunk.type!=='text-delta'&&chunk.type!=='reasoning-delta')continue;const node=ensureStep(d),kind=chunk.type==='text-delta'?'text':'reasoning',streamKey=kind+':'+String(chunk.index??0);let block=node.blocks.find(item=>item?._streamKey===streamKey);if(!block){block={kind,text:'',_streamKey:streamKey};node.blocks.push(block)}block.text+=chunk.text||chunk.delta||'';continue}if(t==='assistant/message'){const node=ensureStep(d);node.blocks=contentBlocks(d.message?.content);node.streaming=false;continue}if(t==='tool/call'){const node=ensureStep(d);if(!node.blocks.some(block=>block?.kind==='tool'&&block.id===d.callId))node.blocks.push({kind:'tool',id:d.callId,name:d.name,args:d.arguments,status:'running'});continue}if(t==='tool/result'){const node=ensureStep(d),result=(d.message?.content||[]).find(block=>block?.type==='tool-result'),id=result?.toolCallId;let tool=node.blocks.find(block=>block?.kind==='tool'&&block.id===id);if(!tool){tool={kind:'tool',id,name:id||'tool',args:'',status:'running'};node.blocks.push(tool)}tool.status=d.error||result?.isError?'error':'done';tool.result=(result?.content||[]).filter(block=>block?.type==='text').map(block=>block.text).join('\\n');node.streaming=false}}return out.filter(node=>node.blocks?.some(Boolean))}
function inlineMarkdown(text){return esc(text).replace(/\\x60([^\\x60]+)\\x60/g,'<code>$1</code>').replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>').replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^ )]+)\\)/g,'<a href="$2" target="_blank" rel="noreferrer">$1</a>')}
function tableCells(line){let value=line.trim();if(value.startsWith('|'))value=value.slice(1);if(value.endsWith('|'))value=value.slice(0,-1);return value.split('|').map(cell=>cell.trim())}
function markdown(text){const lines=String(text||'').split('\\n');let html='',code=false,list=false;for(let i=0;i<lines.length;i++){const line=lines[i];if(line.trim().startsWith(String.fromCharCode(96,96,96))){if(list){html+='</ul>';list=false}html+=code?'</code></pre>':'<pre><code>';code=!code;continue}if(code){html+=esc(line)+'\\n';continue}const next=lines[i+1]||'',separator=next.trim().replace(/^\\||\\|$/g,'').split('|');if(line.includes('|')&&separator.length>0&&separator.every(cell=>/^\\s*:?-{3,}:?\\s*$/.test(cell))){if(list){html+='</ul>';list=false}const headers=tableCells(line);html+='<div class="table-wrap"><table><thead><tr>'+headers.map(cell=>'<th>'+inlineMarkdown(cell)+'</th>').join('')+'</tr></thead><tbody>';i+=2;while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){html+='<tr>'+tableCells(lines[i]).map(cell=>'<td>'+inlineMarkdown(cell)+'</td>').join('')+'</tr>';i++}i--;html+='</tbody></table></div>';continue}const heading=line.match(/^(#{1,3})\\s+(.+)$/);if(heading){if(list){html+='</ul>';list=false}const level=heading[1].length;html+='<h'+level+'>'+inlineMarkdown(heading[2])+'</h'+level+'>';continue}const bullet=line.match(/^[-*]\\s+(.+)$/);if(bullet){if(!list){html+='<ul>';list=true}html+='<li>'+inlineMarkdown(bullet[1])+'</li>';continue}if(list){html+='</ul>';list=false}if(line.trim())html+='<p>'+inlineMarkdown(line)+'</p>'}if(list)html+='</ul>';if(code)html+='</code></pre>';return html}
function pretty(value){if(!value)return'';try{return JSON.stringify(JSON.parse(value),null,2)}catch{return String(value)}}
function activityIcon(kind){return kind==='think'?'<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1.75a4 4 0 0 0-2.66 6.98c.43.38.66.88.66 1.4v.12h4v-.12c0-.52.23-1.02.66-1.4A4 4 0 0 0 7 1.75Z" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5.4 12h3.2M5.75 10.25h2.5" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/></svg>':'<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1.75" y="2.25" width="10.5" height="9.5" rx="2" stroke="currentColor" stroke-width="1.15"/><path d="m4 5 1.5 1.5L4 8M7.5 8h2.5" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>'}
function activityChevron(){return'<span class="activity-chevron" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'}
function reasoningSummary(text,streaming){const lines=String(text||'').split('\\n').map(line=>line.trim()).filter(Boolean);return lines.length?(streaming?lines[lines.length-1]:lines[0]):L.running}
  function renderBlock(block,streaming){if(!block)return'';if(block.kind==='text')return'<div class="markdown'+(streaming?' streaming':'')+'">'+markdown(block.text)+'</div>';if(block.kind==='reasoning'){const state=streaming?'running':'ok';return'<details class="thinking" data-state="'+state+'"><summary><span class="activity-leading">'+activityIcon('think')+'</span><span class="activity-title">Think</span><span class="activity-dot" aria-hidden="true"></span><span class="activity-summary">'+esc(reasoningSummary(block.text,streaming))+'</span>'+activityChevron()+'</summary><div class="thinking-body markdown'+(streaming?' streaming':'')+'">'+markdown(block.text)+'</div></details>'}if(block.kind==='tool'){if(pendingQuestion&&block.status==='running'&&block.name==='ask_user_question')return'';const label=block.status==='running'?L.running:block.status==='error'?L.toolFailed:L.done;return'<details class="tool" data-state="'+esc(block.status)+'"><summary><span class="activity-leading">'+activityIcon('tool')+'</span><span class="activity-title tool-name">'+esc(block.name||'tool')+'</span><span class="activity-dot" aria-hidden="true"></span><span class="activity-summary tool-status '+esc(block.status)+'">'+label+'</span>'+activityChevron()+'</summary><div class="tool-body">'+(block.args?'<strong>'+L.input+'</strong><pre>'+esc(pretty(block.args))+'</pre>':'')+(block.result?'<strong>'+L.output+'</strong><pre>'+esc(block.result)+'</pre>':'')+'</div></details>'}return''}
function renderMessage(message){const blocks=message.blocks.filter(Boolean);return'<div class="message '+message.role+'">'+blocks.map((block,index)=>renderBlock(block,message.streaming&&index===blocks.length-1&&(block.kind==='text'||block.kind==='reasoning'))).join('')+'</div>'}
  function syncPromptUi(){const prompt=$('prompt');prompt.style.height='40px';prompt.style.height=Math.min(150,Math.max(40,prompt.scrollHeight))+'px';$('send').disabled=agentRunning||!prompt.value.trim()}
  function updateRunning(events){let running=false,latestStart=0;for(const entry of events){const event=entry.event||entry,t=String(event.type||'').toLowerCase();if(t==='turn/start'){running=true;latestStart=Math.max(latestStart,Number(event.time)||0)}else if(t==='turn/end')running=false}if(awaitingTurnStartedAt&&latestStart>=awaitingTurnStartedAt){awaitingTurnStartedAt=0}agentRunning=running||awaitingTurnStartedAt>0;$('send').hidden=agentRunning;$('cancel').hidden=!agentRunning;$('prompt').disabled=agentRunning;syncPromptUi()}
  function todoProgress(){const done=currentTodos.filter(item=>item.status==='completed').length,active=currentTodos.filter(item=>item.status==='in_progress').length,pending=currentTodos.length-done-active;return[(done?done+' '+L.todoDone:''),(active?active+' '+L.todoActive:''),(pending?pending+' '+L.todoPending:'')].filter(Boolean).join(' · ')}
  function todoGlyph(status){if(status==='completed')return'<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/><path d="m4 7 2 2 4-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';if(status==='in_progress')return'<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1a6 6 0 1 1-5.2 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';return'<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2.4 2.4"/></svg>'}
  function renderTodoDock(){const host=$('todoDock'),visible=currentTodos.length>0;host.hidden=!visible;document.body.classList.toggle('todo-open',visible);document.body.classList.toggle('todo-expanded',visible&&todoExpanded);if(!visible){host.innerHTML='';return}const chevron=todoExpanded?'m3.5 5 3.5 3.5L10.5 5':'m3.5 9 3.5-3.5L10.5 9';host.innerHTML='<button class="todo-header" aria-expanded="'+todoExpanded+'"><span class="todo-lead"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4.75 3h7M4.75 7h7M4.75 11h7M2 3h.01M2 7h.01M2 11h.01" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></span><span class="todo-title">'+L.todoTitle+'</span><span class="todo-progress">'+esc(todoProgress())+'</span><span class="todo-chevron"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="'+chevron+'" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>'+(todoExpanded?'<ul class="todo-list">'+currentTodos.map(item=>'<li class="todo-item" data-status="'+esc(item.status)+'"><span class="todo-glyph">'+todoGlyph(item.status)+'</span><span class="todo-content">'+esc(item.content)+'</span></li>').join('')+'</ul>':'')}
  function updateTodos(projections){const value=projections?.values?.todos;if(value===null)currentTodos=[];else if(Array.isArray(value))currentTodos=value.filter(item=>item&&typeof item.content==='string'&&['pending','in_progress','completed'].includes(item.status));renderTodoDock()}
  function presetLabel(preset){const builtIn={standard:L.presetStandard,code:L.presetCode,minimal:L.presetMinimal,cordis:L.presetCordis};const name=preset.trust==='system'&&builtIn[preset.id]?builtIn[preset.id]:preset.name||preset.id;return preset.trust==='user'?name+' · '+L.customPreset:name}
  function presetIsLocked(){return!sessionBlank||optimisticPrompts.length>0}
  function closeSessionSettings(){$('sessionSettings').hidden=true;$('sessionSettings').innerHTML='';$('settings').setAttribute('aria-expanded','false')}
  function selectedModelEntry(){const value=$('modelSelect')?.value||'',parts=value.split(''),group=(modelCatalog?.groups||[]).find(item=>item.id===parts[0]);return{group,model:group?.models?.find(item=>item.id===parts[1])}}
  function syncEffortOptions(){const field=$('effortField'),select=$('effortSelect'),entry=selectedModelEntry().model,efforts=entry?.reasoning?.efforts||[];if(!field||!select)return;field.hidden=!efforts.length;if(!efforts.length){select.innerHTML='';return}const previous=select.value,current=(modelCatalog?.current??modelCatalog?.default)?.reasoningEffort,preferred=efforts.some(item=>item.id===previous)?previous:efforts.some(item=>item.id===current)?current:entry.reasoning.defaultEffort||efforts[0].id;select.innerHTML=efforts.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+'</option>').join('');select.value=preferred}
  function syncSettingsControls(){const locked=presetIsLocked(),preset=$('presetSelect'),note=$('presetNote');if(preset)preset.disabled=settingsBusy||locked;if(note)note.textContent=locked?L.presetLocked:L.presetEditable;const model=$('modelSelect'),effort=$('effortSelect'),routable=(modelCatalog?.routableProviders?.length??0)>0||modelCatalog?.routable===true;if(model)model.disabled=settingsBusy||!routable;if(effort)effort.disabled=settingsBusy||!routable}
  function renderSessionSettings(){const host=$('sessionSettings');if(!modelCatalog){host.innerHTML='<div class="settings-head"><strong>'+L.sessionSettings+'</strong><button class="settings-close" data-settings-close aria-label="Close">×</button></div><div class="settings-loading">'+L.settingsLoading+'</div>';return}const current=modelCatalog.current??modelCatalog.default??{},modelValue=current.provider+''+current.model,presetFallback=presets.find(item=>item.isDefault)?.id||presets[0]?.id||'',presetValue=presets.some(item=>item.id===currentPreset)?currentPreset:presetFallback;host.innerHTML='<div class="settings-head"><strong>'+L.sessionSettings+'</strong><button class="settings-close" data-settings-close aria-label="Close">×</button></div><label class="setting-field"><span>'+L.model+'</span><select id="modelSelect"'+(!modelCatalog.groups?.length?' disabled':'')+'>'+(modelCatalog.groups||[]).map(group=>'<optgroup label="'+esc(group.name)+'">'+(group.models||[]).map(model=>'<option value="'+esc(group.id+''+model.id)+'">'+esc(model.name)+'</option>').join('')+'</optgroup>').join('')+'</select></label><label id="effortField" class="setting-field" hidden><span>'+L.reasoningEffort+'</span><select id="effortSelect"></select></label><label class="setting-field"><span>'+L.preset+'</span><select id="presetSelect">'+presets.map(item=>'<option value="'+esc(item.id)+'">'+esc(presetLabel(item))+'</option>').join('')+'</select></label><div id="presetNote" class="setting-note"></div><div id="settingsError" class="settings-error">'+(!modelCatalog.groups?.length?L.noModels:'')+'</div>';if((modelCatalog.groups||[]).some(group=>(group.models||[]).some(model=>group.id+''+model.id===modelValue)))$('modelSelect').value=modelValue;if($('presetSelect'))$('presetSelect').value=presetValue;syncEffortOptions();syncSettingsControls()}
  async function refreshActiveSessionSummary(){if(!activeSession)return;const value=await rpc('session.list',{}),summary=(value.items||[]).find(item=>item.sessionId===activeSession);if(summary){sessionBlank=summary.blank;currentPreset=summary.agentPreset||currentPreset;sessionSummaries=value.items||[]}syncSettingsControls()}
  async function openSessionSettings(){if(!$('sessionSettings').hidden){closeSessionSettings();return}const sessionId=activeSession;if(!sessionId)return;$('sessionSettings').hidden=false;$('settings').setAttribute('aria-expanded','true');modelCatalog=null;renderSessionSettings();try{const [models,presetValue,sessions]=await Promise.all([rpc('session.models',{sessionId}),rpc('agentPreset.list',{}),rpc('session.list',{})]);if(activeSession!==sessionId)return;modelCatalog=models;presets=(presetValue.presets||[]).filter(preset=>!preset.broken);sessionSummaries=sessions.items||[];const summary=sessionSummaries.find(item=>item.sessionId===sessionId);if(summary){sessionBlank=summary.blank;currentPreset=summary.agentPreset||currentPreset}renderSessionSettings()}catch(e){if(activeSession!==sessionId)return;modelCatalog={default:{provider:'',model:''},routableProviders:[],groups:[],failures:[]};renderSessionSettings();showError('settingsError',e)}}
  async function selectPreset(){const select=$('presetSelect');if(!select||settingsBusy||presetIsLocked()||!activeSession)return;const previous=currentPreset,next=select.value;if(!next||next===previous)return;settingsBusy=true;syncSettingsControls();try{const value=await rpc('agentPreset.select',{sessionId:activeSession,agentPreset:next});currentPreset=value.agentPreset;showToast(L.settingsUpdated)}catch(e){select.value=previous||select.value;showError('settingsError',e);await refreshActiveSessionSummary().catch(()=>{})}finally{settingsBusy=false;syncSettingsControls()}}
  async function selectModel(){const select=$('modelSelect');if(!select||settingsBusy||!activeSession)return;const entry=selectedModelEntry(),provider=entry.group?.id,model=entry.model?.id;if(!provider||!model)return;settingsBusy=true;syncSettingsControls();const reasoningEffort=$('effortSelect')?.value||entry.model?.reasoning?.defaultEffort;try{const value=await rpc('session.selectModel',{sessionId:activeSession,provider,model,...(reasoningEffort?{reasoningEffort}:{})});modelCatalog.current=modelCatalog.default=value.selected;renderSessionSettings();showToast(L.settingsUpdated)}catch(e){showError('settingsError',e);syncSettingsControls()}finally{settingsBusy=false;syncSettingsControls()}}
  function durableUserTextCounts(messages){const counts=new Map();for(const message of messages){if(message.role!=='user')continue;const text=message.blocks?.filter(block=>block?.kind==='text').map(block=>block.text).join('\\n')||'';counts.set(text,(counts.get(text)||0)+1)}return counts}
  function messagesWithOptimistic(durable){const counts=durableUserTextCounts(durable);optimisticPrompts=optimisticPrompts.filter(item=>(counts.get(item.text)||0)<item.targetCount);latestUserTextCounts=counts;lastDurableMessages=durable;return[...durable,...optimisticPrompts.map(item=>({role:'user',blocks:[{kind:'text',text:item.text}],optimistic:true}))]}
  function nextOptimisticTarget(text){let target=latestUserTextCounts.get(text)||0;for(const item of optimisticPrompts)if(item.text===text)target=Math.max(target,item.targetCount);return target+1}
  function paintMessages(messages,stickToBottom=false){const box=$('messages'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90,status=agentRunning&&!pendingQuestion?'<div class="turn-status" role="status" aria-live="polite">Deep diving...</div>':'';box.innerHTML=messages.map(renderMessage).join('')+status;if(stickToBottom||nearBottom)box.scrollTop=box.scrollHeight}
  function syncTurnStatus(){const box=$('messages'),current=box.querySelector('.turn-status'),visible=agentRunning&&!pendingQuestion;if(visible&&!current)box.insertAdjacentHTML('beforeend','<div class="turn-status" role="status" aria-live="polite">Deep diving...</div>');else if(!visible&&current)current.remove()}
  function patchLastStreamMessage(messages){const box=$('messages'),nodes=box.querySelectorAll(':scope > .message'),index=messages.length-1,message=messages[index],nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90;if(!message||message.role!=='assistant'||index!==nodes.length-1){paintMessages(messages,false);return}nodes[index].outerHTML=renderMessage(message);syncTurnStatus();if(nearBottom)box.scrollTop=box.scrollHeight}
  function recommendation(label){const match=String(label||'').match(/\\s*\\((Recommended|推荐)\\)\\s*$/i);return{label:match?String(label).slice(0,match.index).trim():String(label||''),recommended:!!match}}
  function questionDraft(question){return questionDrafts[question.id]||(questionDrafts[question.id]={selected:[],custom:'',skipped:false})}
  function renderQuestionComposer(){const host=$('questionComposer'),composer=$('composer');if(!pendingQuestion||!pendingQuestion.questions?.length){host.hidden=true;composer.hidden=false;document.body.classList.remove('question-open');host.innerHTML='';return}questionIndex=Math.max(0,Math.min(questionIndex,pendingQuestion.questions.length-1));const question=pendingQuestion.questions[questionIndex],draft=questionDraft(question),options=question.options||[],last=questionIndex===pendingQuestion.questions.length-1;host.hidden=false;composer.hidden=true;document.body.classList.add('question-open');host.innerHTML='<div class="question-shell"><div class="question-top"><span class="question-mark">'+activityIcon('tool')+'</span><div class="question-context"><strong>'+esc(question.header||L.questionNeeded)+'</strong><span>'+(questionIndex+1)+' / '+pendingQuestion.questions.length+' '+L.questionProgress+'</span></div><button class="question-close" data-question-action="cancel" aria-label="'+esc(L.cancelQuestions)+'">×</button></div><div class="question-body"><h2 class="question-title">'+esc(question.question)+'</h2>'+(question.detail?'<div class="question-detail markdown">'+markdown(question.detail)+'</div>':'')+(options.length?'<div class="question-options'+(question.multiSelect?' multi':'')+'">'+options.map((option,index)=>{const display=recommendation(option.label),selected=draft.selected.includes(option.label);return'<button class="question-option'+(selected?' selected':'')+'" data-option-index="'+index+'"><span class="option-control">'+(selected?'✓':'')+'</span><span class="option-copy"><span class="option-label">'+esc(display.label)+(display.recommended?'<span class="recommendation">'+L.recommended+'</span>':'')+'</span>'+(option.description?'<span class="option-description">'+esc(option.description)+'</span>':'')+'</span></button>'}).join('')+'</div>':'')+'<label class="custom-label" for="questionCustom">'+L.customAnswer+'</label><textarea id="questionCustom" class="question-custom" placeholder="'+esc(L.customPlaceholder)+'">'+esc(draft.custom)+'</textarea></div><div id="questionError" class="question-error"></div><div class="question-actions">'+(questionIndex?'<button data-question-action="previous">'+L.previous+'</button>':'<button data-question-action="cancel">'+L.cancelQuestions+'</button>')+'<span class="spacer"></span><button data-question-action="skip">'+L.skip+'</button><button class="submit-answer" data-question-action="continue">'+(questionBusy?L.answering:last?L.submitAnswer:L.next)+'</button></div></div>';host.querySelectorAll('button').forEach(button=>button.disabled=questionBusy)}
  function syncPendingQuestion(next){const changed=(pendingQuestion?.rpcId||null)!==(next?.rpcId||null);pendingQuestion=next;if(changed){questionIndex=0;questionDrafts={};questionBusy=false;renderQuestionComposer()}}
  function advanceQuestion(skip=false){if(!pendingQuestion||questionBusy)return;const question=pendingQuestion.questions[questionIndex],draft=questionDraft(question);draft.custom=String($('questionCustom')?.value||'').trim();if(skip){draft.selected=[];draft.custom='';draft.skipped=true}else{draft.skipped=false;if(!draft.selected.length&&!draft.custom){$('questionError').textContent=L.chooseAnswer;return}}if(questionIndex<pendingQuestion.questions.length-1){questionIndex+=1;renderQuestionComposer()}else submitQuestionAnswers()}
  async function submitQuestionAnswers(){if(!pendingQuestion||questionBusy)return;questionBusy=true;renderQuestionComposer();const current=pendingQuestion;const answers=current.questions.map(question=>{const draft=questionDraft(question);return{id:question.id,selected:!question.multiSelect&&draft.custom?[]:draft.selected,...(draft.custom?{custom:draft.custom}:{})}});try{await rpc('interaction.answer',{rpcId:current.rpcId,sessionId:current.sessionId,answers});lastHistoryKey='';await loadHistory(false)}catch(e){questionBusy=false;renderQuestionComposer();showError('questionError',e)}}
  async function cancelQuestionRequest(){if(!pendingQuestion||questionBusy)return;questionBusy=true;renderQuestionComposer();const current=pendingQuestion;try{await rpc('interaction.cancel',{rpcId:current.rpcId,sessionId:current.sessionId});lastHistoryKey='';await loadHistory(false)}catch(e){questionBusy=false;renderQuestionComposer();showError('questionError',e)}}
async function loadWorkspaces(){const previous=$('workspace').value,value=await rpc('workspace.list');workspaces=value.items||[];archivedSessionIds=value.archivedSessionIds||[];if(workspaces.length){$('workspace').innerHTML=workspaces.map(w=>'<option value="'+esc(w.workspaceId)+'">'+esc(w.title||w.path)+'</option>').join('');$('workspace').value=workspaces.some(w=>w.workspaceId===previous)?previous:workspaces[0].workspaceId}else $('workspace').innerHTML='<option value="">'+L.noWorkspaces+'</option>'}
  function syncWorkspaceUi(){const selected=!!$('workspace').value;$('newSession').disabled=!selected;$('workspaceHint').hidden=selected;$('workspaceHint').textContent=selected?'':L.noWorkspaces;if(selected)$('listError').textContent=''}
function relativeTime(value){const parsed=typeof value==='number'?value:Date.parse(value),elapsed=Math.max(0,Date.now()-(Number.isFinite(parsed)?parsed:Date.now())),minutes=Math.floor(elapsed/60000);if(minutes<1)return L.justNow;if(minutes<60)return minutes+L.minute;const hours=Math.floor(minutes/60);if(hours<24)return hours+L.hour;return Math.floor(hours/24)+L.day}
async function loadSessions(){try{const value=await rpc('session.list',{}),wid=$('workspace').value,w=workspaces.find(x=>x.workspaceId===wid),allowed=w?new Set(w.sessionIds):new Set(),archived=new Set(archivedSessionIds);sessionSummaries=value.items||[];const items=sessionSummaries.filter(s=>allowed.has(s.sessionId)&&!archived.has(s.sessionId)).sort((a,b)=>b.updatedAt-a.updatedAt);$('sessionCount').textContent=String(items.length);$('sessions').innerHTML=!wid?'':items.length?items.map(s=>{const title=titleFor(s);return'<button class="row" data-id="'+esc(s.sessionId)+'" data-title="'+esc(title)+'"><span class="session-mark"><svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 5.75C4 4.78 4.78 4 5.75 4h8.5C15.22 4 16 4.78 16 5.75v5.5c0 .97-.78 1.75-1.75 1.75H9l-3.5 2.5V13A1.5 1.5 0 0 1 4 11.5V5.75Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></span><span class="row-copy"><strong>'+esc(title)+'</strong><time>'+esc(relativeTime(s.updatedAt))+'</time></span><svg class="row-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'}).join(''):'<div class="empty"><span class="empty-mark"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 5.75C4 4.78 4.78 4 5.75 4h8.5C15.22 4 16 4.78 16 5.75v5.5c0 .97-.78 1.75-1.75 1.75H9l-3.5 2.5V13A1.5 1.5 0 0 1 4 11.5V5.75Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></span><strong>'+L.noSessions+'</strong><span>'+L.emptyHint+'</span></div>';document.querySelectorAll('.row').forEach(b=>b.onclick=()=>openSession(b.dataset.id,b.dataset.title));$('listError').textContent=''}catch(e){showError('listError',e)}}
function recentSession(){const archived=new Set(archivedSessionIds),owned=new Set(workspaces.flatMap(w=>w.sessionIds||[]));return sessionSummaries.filter(s=>owned.has(s.sessionId)&&!archived.has(s.sessionId)).sort((a,b)=>b.updatedAt-a.updatedAt)[0]}
async function openRecentSession(){const recent=recentSession();if(!recent)return;const owner=workspaces.find(w=>(w.sessionIds||[]).includes(recent.sessionId));if(owner&&$('workspace').value!==owner.workspaceId){$('workspace').value=owner.workspaceId;syncWorkspaceUi();await loadSessions()}await openSession(recent.sessionId,titleFor(recent),true)}
  async function createSession(){const workspaceId=$('workspace').value;if(!workspaceId){$('listError').textContent=L.chooseWorkspace;return}try{const created=await rpc('session.create',{workspaceId});sessionSummaries.push({sessionId:created.sessionId,updatedAt:Date.now(),running:false,blank:true,agentPreset:created.agentPreset});await openSession(created.sessionId)}catch(e){showError('listError',e)}}
function showToast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>$('toast').classList.remove('show'),1000)}
  async function refreshAll(){const button=$('refresh');button.disabled=true;button.classList.add('refreshing');try{await loadWorkspaces();syncWorkspaceUi();await loadSessions();showToast(L.refreshed)}catch(e){showError('listError',e)}finally{setTimeout(()=>{button.disabled=false;button.classList.remove('refreshing')},350)}}
function titleFor(s){const p=s.projections&&s.projections.values||{};return p.title||p.sessionTitle||p['session.title']||L.untitled}
  function resetOptimisticMessages(){lastDurableMessages=[];optimisticPrompts=[];latestUserTextCounts=new Map();awaitingTurnStartedAt=0;agentRunning=false;currentTodos=[];todoExpanded=false;renderTodoDock()}
  function closeSessionStream(){if(sessionStream)sessionStream.close();if(streamRenderFrame!==null)cancelAnimationFrame(streamRenderFrame);if(pendingSyncTimer!==null)clearTimeout(pendingSyncTimer);sessionStream=null;streamConnected=false;streamEvents=[];streamProjections=null;streamRenderFrame=null;streamNeedsFullPaint=false;streamRevision=0;pendingSyncTimer=null}
  function applyHistory(value,pending,initial){if(pending!==undefined)syncPendingQuestion(pending);const events=value.events||[],durable=visibleMessages(events);if(durable.some(message=>message.role==='user'))sessionBlank=false;const messages=messagesWithOptimistic(durable);updateRunning(events);updateTodos(value.projections);const key=JSON.stringify([messages,pendingQuestion?.rpcId||null,agentRunning,currentTodos,todoExpanded]);syncSettingsControls();if(key!==lastHistoryKey){paintMessages(messages,initial);lastHistoryKey=key;idlePollMs=HISTORY_POLL_IDLE_MS}}
  function flushStreamRender(sessionId){streamRenderFrame=null;if(activeSession!==sessionId)return;const durable=visibleMessages(streamEvents),messages=messagesWithOptimistic(durable);if(durable.some(message=>message.role==='user'))sessionBlank=false;updateRunning(streamEvents);syncSettingsControls();if(streamNeedsFullPaint)paintMessages(messages,false);else patchLastStreamMessage(messages);streamNeedsFullPaint=false;lastHistoryKey='';idlePollMs=HISTORY_POLL_IDLE_MS}
  function queueStreamRender(sessionId,fullPaint){streamNeedsFullPaint=streamNeedsFullPaint||fullPaint;if(streamRenderFrame===null)streamRenderFrame=requestAnimationFrame(()=>flushStreamRender(sessionId))}
  function schedulePendingSync(sessionId){if(pendingSyncTimer!==null)return;pendingSyncTimer=setTimeout(()=>{pendingSyncTimer=null;if(activeSession===sessionId)void rpc('interaction.pending',{sessionId}).then(syncPendingQuestion).catch(()=>{})},PENDING_SYNC_DEBOUNCE_MS)}
  function openSessionStream(sessionId){closeSessionStream();const source=new EventSource('/api/session/stream?sessionId='+encodeURIComponent(sessionId));sessionStream=source;source.addEventListener('snapshot',event=>{if(activeSession!==sessionId)return;const frame=JSON.parse(event.data);streamEvents=frame.records||[];streamProjections=frame.projections;streamConnected=true;streamRevision+=1;applyHistory({events:streamEvents,projections:streamProjections},pendingQuestion,false)});source.addEventListener('event',event=>{if(activeSession!==sessionId)return;const frame=JSON.parse(event.data),entry=frame.event||frame,type=String(entry.type||'').toLowerCase();streamEvents.push(frame);streamRevision+=1;queueStreamRender(sessionId,type!=='assistant/chunk');if(type!=='assistant/chunk')schedulePendingSync(sessionId)});source.onerror=()=>{streamConnected=false;schedulePoll()}}
  function showSessionList(){clearTimeout(poll);poll=null;closeSessionStream();closeSessionSettings();activeSession=null;resetOptimisticMessages();syncPendingQuestion(null);document.body.classList.remove('chat-open');$('chatView').classList.remove('active');$('sessionsView').classList.add('active');loadSessions()}
  async function openSession(id,title,fromHistory=false){clearTimeout(poll);closeSessionStream();if(!fromHistory)history.pushState({view:'chat',sessionId:id,title:title||L.untitled},'');activeSession=id;const summary=sessionSummaries.find(item=>item.sessionId===id);sessionBlank=summary?.blank??true;currentPreset=summary?.agentPreset||null;modelCatalog=null;closeSessionSettings();lastHistoryKey='';resetOptimisticMessages();syncPendingQuestion(null);document.body.classList.add('chat-open');$('sessionsView').classList.remove('active');$('chatView').classList.add('active');$('messages').innerHTML='<div class="loading"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';openSessionStream(id);await loadHistory(true);schedulePoll()}
function handleHistory(state){if(state?.view==='chat'&&state.sessionId)openSession(state.sessionId,state.title,true);else showSessionList()}
  // Each poll refetches the last 100 messages through Harness, so an idle chat
  // left open used to cost the desktop a full history serialisation every
  // 750ms indefinitely. Back off while nothing changes, and stop entirely
  // while the tab is hidden.
  function schedulePoll(){clearTimeout(poll);poll=null;if(!activeSession||document.hidden)return;const delay=streamConnected?HISTORY_POLL_IDLE_CAP_MS:agentRunning||pendingQuestion?HISTORY_POLL_ACTIVE_MS:idlePollMs;poll=setTimeout(()=>{void loadHistory(false)},delay)}
  async function loadHistory(initial){if(!activeSession||historyBusy)return;historyBusy=true;const revision=streamRevision;try{const sessionId=activeSession,[value,pending]=await Promise.all([rpc('session.history',{sessionId,maxMessages:100}),rpc('interaction.pending',{sessionId})]);if(activeSession!==sessionId)return;if(streamConnected&&streamRevision!==revision){syncPendingQuestion(pending);return}applyHistory(value,pending,initial);if(!streamConnected&&!agentRunning&&!pendingQuestion)idlePollMs=Math.min(Math.round(idlePollMs*1.5),HISTORY_POLL_IDLE_CAP_MS);$('chatError').textContent=''}catch(e){showError('chatError',e)}finally{historyBusy=false;schedulePoll()}}
async function send(){const text=$('prompt').value.trim();if(!text||!activeSession)return;const optimistic={id:String(Date.now())+Math.random(),text,targetCount:nextOptimisticTarget(text)};optimisticPrompts.push(optimistic);sessionBlank=false;awaitingTurnStartedAt=Date.now()-1000;agentRunning=true;syncSettingsControls();$('send').hidden=true;$('cancel').hidden=false;$('prompt').disabled=true;$('send').disabled=true;$('prompt').value='';syncPromptUi();paintMessages([...lastDurableMessages,...optimisticPrompts.map(item=>({role:'user',blocks:[{kind:'text',text:item.text}],optimistic:true}))],true);lastHistoryKey='';try{await rpc('session.prompt',{sessionId:activeSession,mode:'steer',content:[{type:'text',text}],clientTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});await loadHistory(false)}catch(e){optimisticPrompts=optimisticPrompts.filter(item=>item.id!==optimistic.id);awaitingTurnStartedAt=0;agentRunning=false;$('send').hidden=false;$('cancel').hidden=true;$('prompt').disabled=false;showError('chatError',e);$('prompt').value=text;paintMessages([...lastDurableMessages,...optimisticPrompts.map(item=>({role:'user',blocks:[{kind:'text',text:item.text}],optimistic:true}))],true);await refreshActiveSessionSummary().catch(()=>{})}finally{syncPromptUi();syncSettingsControls()}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function syncViewport(){const viewport=window.visualViewport;document.documentElement.style.setProperty('--app-height',(viewport?.height||window.innerHeight)+'px');if(document.activeElement===$('prompt'))requestAnimationFrame(()=>$('prompt').scrollIntoView({block:'end'}))}
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(poll);poll=null;return}idlePollMs=HISTORY_POLL_IDLE_MS;if(activeSession)void loadHistory(false);void checkConnection()});
window.visualViewport?.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('scroll',syncViewport);window.addEventListener('resize',syncViewport);syncViewport();
history.replaceState({view:'sessions'},'');window.addEventListener('popstate',event=>handleHistory(event.state));
  $('workspace').onchange=()=>{syncWorkspaceUi();loadSessions()};$('newSession').onclick=createSession;$('refresh').onclick=refreshAll;$('settings').onclick=openSessionSettings;$('sessionSettings').onclick=e=>{if(e.target.closest('[data-settings-close]'))closeSessionSettings()};$('sessionSettings').onchange=e=>{if(e.target.id==='presetSelect')selectPreset();else if(e.target.id==='modelSelect'){syncEffortOptions();selectModel()}else if(e.target.id==='effortSelect')selectModel()};$('todoDock').onclick=e=>{if(e.target.closest('.todo-header')){todoExpanded=!todoExpanded;renderTodoDock();lastHistoryKey='';paintMessages(messagesWithOptimistic(lastDurableMessages),false)}};$('send').onclick=send;$('prompt').oninput=syncPromptUi;$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();send()}};$('prompt').onfocus=syncViewport;$('back').onclick=()=>{if(history.state?.view==='chat')history.back();else showSessionList()};$('cancel').onclick=async()=>{if(activeSession){awaitingTurnStartedAt=0;await rpc('session.cancel',{sessionId:activeSession});lastHistoryKey='';await loadHistory(false)}};$('questionComposer').onclick=e=>{const option=e.target.closest('[data-option-index]');if(option&&pendingQuestion&&!questionBusy){const question=pendingQuestion.questions[questionIndex],draft=questionDraft(question),label=question.options[Number(option.dataset.optionIndex)]?.label;if(label){draft.skipped=false;if(question.multiSelect)draft.selected=draft.selected.includes(label)?draft.selected.filter(item=>item!==label):[...draft.selected,label];else{draft.selected=[label];draft.custom=''}renderQuestionComposer()}return}const action=e.target.closest('[data-question-action]')?.dataset.questionAction;if(action==='continue')advanceQuestion(false);else if(action==='skip')advanceQuestion(true);else if(action==='cancel')cancelQuestionRequest();else if(action==='previous'&&pendingQuestion){const question=pendingQuestion.questions[questionIndex],draft=questionDraft(question);draft.custom=String($('questionCustom')?.value||'').trim();questionIndex=Math.max(0,questionIndex-1);renderQuestionComposer()}};$('questionComposer').oninput=e=>{if(e.target.id==='questionCustom'&&pendingQuestion){const question=pendingQuestion.questions[questionIndex],draft=questionDraft(question);draft.custom=e.target.value;if(!question.multiSelect&&draft.custom.trim()){draft.selected=[];$('questionComposer').querySelectorAll('.question-option.selected').forEach(option=>{option.classList.remove('selected');const control=option.querySelector('.option-control');if(control)control.textContent=''})}}};$('questionComposer').onkeydown=e=>{if(e.target.id==='questionCustom'&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.isComposing&&e.keyCode!==229){e.preventDefault();advanceQuestion(false)}};document.addEventListener('click',e=>{if(!$('sessionSettings').hidden&&!e.target.closest('#sessionSettings')&&!e.target.closest('#settings'))closeSessionSettings()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSessionSettings()});
async function checkConnection(){if(document.hidden)return;const status=$('status');try{const response=await fetch('/api/status',{cache:'no-store'});status.classList.remove('connecting','error-state');if(response.ok){status.setAttribute('aria-label',${JSON.stringify(zh ? "已连接" : "Connected")})}else{if(response.status===401){location.replace('/disconnected');return}status.classList.add('error-state');$('listError').textContent='';$('chatError').textContent='';status.setAttribute('aria-label',${JSON.stringify(zh ? "已断开" : "Disconnected")})}}catch{status.classList.remove('connecting');status.classList.add('error-state');$('listError').textContent='';$('chatError').textContent='';status.setAttribute('aria-label',${JSON.stringify(zh ? "已断开" : "Disconnected")})}}
setInterval(checkConnection,1500);checkConnection();
(async()=>{try{await loadWorkspaces();syncWorkspaceUi();await loadSessions();await openRecentSession()}catch(e){showError('listError',e)}})();
<\/script></body></html>`;
}
function renderMobileReconnectPage(locale, connectionMode = "lan") {
  const zh = locale === "zh";
  const text = {
    title: zh ? "重新连接 DSH" : "Reconnect DSH",
    heading: zh ? "连接已断开" : "Connection lost",
    action: zh ? "重新连接" : "Reconnect",
    guidance: connectionMode === "tunnel" ? zh ? "点击重新连接，然后在电脑上的 DSH Desktop 中允许此移动设备。" : "Reconnect, then approve this mobile device in DSH Desktop." : zh ? "请确保手机和电脑连接到同一 Wi-Fi。点击重新连接后，在电脑上的 DSH Desktop 中允许此手机。" : "Keep both devices on the same Wi-Fi, then reconnect and approve this phone in DSH Desktop."
  };
  return `<!doctype html><html lang="${zh ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff" media="(prefers-color-scheme:light)"><meta name="theme-color" content="#141416" media="(prefers-color-scheme:dark)"><title>${text.title}</title><style>:root{color-scheme:light;--bg:#fff;--ink:#18191c;--muted:#81858c}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#141416;--ink:#f5f5f6;--muted:#95979d}}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:100%;max-width:340px;text-align:center}.brand{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:22px;font-size:13px;font-weight:600}.brand img{width:35px;height:20px;object-fit:contain}.brand .dark-logo{display:none}@media(prefers-color-scheme:dark){.brand .light-logo{display:none}.brand .dark-logo{display:block}}h1{margin:0;font-size:28px;line-height:1.18;letter-spacing:-.03em}.guidance{margin:13px auto 0;max-width:310px;color:var(--muted);font-size:14px;line-height:1.65}.primary{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:50px;margin-top:26px;border-radius:15px;background:var(--ink);color:var(--bg);font-weight:650;text-decoration:none}</style></head><body><main class="card"><div class="brand"><img class="light-logo" src="/brand-logo/light" alt=""><img class="dark-logo" src="/brand-logo/dark" alt=""><span>DSH Desktop</span></div><h1>${text.heading}</h1><p class="guidance">${text.guidance}</p><a class="primary" href="/reconnect">${text.action}<svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg></a></main></body></html>`;
}
function renderDesktopPairingPage(options) {
  const zh = options.locale === "zh";
  const text = {
    title: zh ? "连接移动设备" : "Connect Mobile Device",
    heading: zh ? "连接移动设备" : "Connect a mobile device",
    hint: zh ? "请使用手机扫描二维码，在手机上继续对话。" : "Scan the QR code with your phone to continue conversation.",
    lanHint: zh ? "移动设备与电脑需连接至同一 WiFi，同步实时性高" : "Keep the mobile device and computer on the same WiFi for high real-time responsiveness.",
    tunnelHint: zh ? "移动设备通过互联网（如 4G/5G 或其他WiFi网络等）均可远程操控，同步实时性中等" : "Control remotely over the internet, including 4G/5G or other WiFi networks, with moderate real-time responsiveness.",
    tunnelLoading: zh ? "正在创建全球网络链接" : "Creating a global network link",
    lanLoading: zh ? "正在切换至 WiFi 连接模式" : "Switching to WiFi connection mode",
    modeLan: zh ? "WiFi连接模式" : "WiFi Connection Mode",
    modeTunnel: zh ? "互联网连接模式" : "Internet Connection Mode",
    manageHeading: zh ? "管理手机连接" : "Manage phone connection",
    manageHint: zh ? "这台手机当前已连接到 DSH Desktop。" : "Your phone is currently connected to DSH Desktop.",
    connected: zh ? "手机已连接" : "Phone connected",
    closeHint: zh ? "连接会在后台保持，现在可以关闭此窗口。" : "The connection stays active in the background. You can close this window now.",
    done: zh ? "完成" : "Done",
    disconnect: zh ? "断开连接" : "Disconnect",
    copy: zh ? "复制" : "Copy",
    copied: zh ? "已复制" : "Copied",
    waiting: zh ? "手机正在等待批准" : "Phone waiting for approval",
    deviceAddress: zh ? "设备地址：" : "Device address: ",
    requestLan: zh ? "连接方式：WiFi 连接模式" : "Connection: WiFi connection mode",
    requestTunnel: zh ? "连接方式：互联网连接模式" : "Connection: Internet connection mode",
    decline: zh ? "拒绝" : "Decline",
    allow: zh ? "允许" : "Allow",
    refresh: zh ? "二维码将在 " : "QR refreshes in ",
    seconds: zh ? " 秒后刷新" : "s",
    expired: zh ? "二维码已过期，正在自动刷新…" : "QR expired. Refreshing automatically…",
    tunnelError: zh ? "隧道建立失败：" : "Tunnel failed: ",
    fallbackLink: zh ? "扫码打不开？换一条线路" : "Can't open? Try another link",
    fallbackLoading: zh ? "正在切换备用线路" : "Switching to a backup link"
  };
  const showFallback = Boolean(
    options.tunnelActive && options.tunnelProvider === "cloudflare" && !options.connected
  );
  return `<!doctype html><html lang="${zh ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${text.title}</title><style>
  :root{color-scheme:light;--bg:#fff;--surface:#fff;--panel:#f7f8fa;--ink:#18191c;--muted:#81858c;--line:#e5e7eb;--brand:#4d6bfe;--success-bg:#f2f8f4;--success-ink:#277347;--success-muted:#557565;--request-accent:#c16f52;--request-border:#dfbcae;--request-bg:#fbf6f3}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#141416;--surface:#1d1d20;--panel:#202023;--ink:#f5f5f6;--muted:#95979d;--line:#303034;--brand:#6f86ff;--success-bg:#17261d;--success-ink:#75c991;--success-muted:#8ab99a;--request-accent:#df9275;--request-border:#68483d;--request-bg:#291f1c}}*{box-sizing:border-box}html,body{min-height:100%;background:var(--bg)}body{margin:0;color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:520px;margin:auto;padding:26px 32px 30px;text-align:center}.brand{display:flex;align-items:center;justify-content:center;gap:9px;font-weight:600;margin-bottom:14px}.brand img{width:39px;height:22px;object-fit:contain}.brand .dark-logo{display:none}@media(prefers-color-scheme:dark){.brand .light-logo{display:none}.brand .dark-logo{display:block}}h1{font-size:24px;line-height:1.25;font-weight:600;margin:0}p{margin:0;color:var(--muted)}
  .mode-panel{max-width:410px;margin:18px auto 0;padding:5px 8px 10px;border:1px solid var(--line);border-radius:15px;background:var(--panel)}
  .mode-switch{display:grid;grid-template-columns:1fr 1fr;width:100%;padding:3px;border-radius:11px;gap:3px}
  .mode-btn{min-width:0;height:34px;border:0;background:transparent;color:var(--muted);padding:0 10px;border-radius:9px;font-size:13px;font-weight:550;cursor:pointer;transition:background .15s,color .15s}
  .mode-btn.active{background:var(--surface);color:var(--ink);box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .mode-btn:disabled{cursor:not-allowed;opacity:.5}.mode-btn.active:disabled{opacity:.72}
  .connection{display:none;flex-direction:column;align-items:center;margin:24px auto 0;max-width:390px;padding:22px;border-radius:14px;background:var(--success-bg);color:var(--success-ink)}.connection.show{display:flex}.connection-title{font-size:16px;font-weight:600}.connection-title:before{content:'✓';display:inline-grid;place-items:center;width:24px;height:24px;margin-right:9px;border-radius:50%;background:#35a867;color:white}.connection-hint{max-width:310px;margin-top:8px;color:var(--success-muted);font-size:13px}.connection-actions{display:flex;gap:8px;margin-top:18px}.connection-actions button{min-width:94px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);padding:8px 14px;cursor:pointer}.connection-actions .done{background:var(--ink);color:var(--bg);border-color:var(--ink)}.phone-connected .pairing-content{display:none}.manage-connected .connection-hint,.manage-connected .done{display:none}.manage-connected .connection-actions{margin-top:16px}
  .pairing-content{margin-top:16px}.qr{display:inline-flex;background:#fff;padding:12px;border:1px solid var(--line);border-radius:16px;margin:0 0 10px;min-width:244px;min-height:244px;align-items:center;justify-content:center;position:relative}
  .qr svg{width:220px;height:220px;display:block}
  .qr-loading{position:absolute;inset:0;background:rgba(255,255,255,.94);border-radius:16px;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-size:13px;color:#18191c;font-weight:550}
  .qr-loading.show{display:flex}
  .loading-copy{display:flex;width:176px;align-items:center;justify-content:space-between;gap:12px}.loading-copy span:first-child{text-align:left}.loading-value{min-width:32px;text-align:right;color:#62666d;font-variant-numeric:tabular-nums}.tunnel-progress{width:176px;height:5px;overflow:hidden;border-radius:999px;background:#e5e7eb}.tunnel-progress span{display:block;width:0;height:100%;border-radius:inherit;background:var(--brand);transition:width .08s linear}@media(prefers-reduced-motion:reduce){.tunnel-progress span{transition:none}}
  .hint{min-height:38px;display:flex;align-items:center;justify-content:center;font-size:12.5px;line-height:1.55;max-width:370px;margin:7px auto 0;padding:0 5px}
  .url-row{display:flex;align-items:center;gap:8px;margin:10px auto 0;max-width:410px}.url{min-width:0;flex:1;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--panel);border-radius:9px;padding:9px 11px;text-align:left}.copy{position:relative;display:grid;place-items:center;width:28px;height:28px;flex:none;border:0;background:transparent;color:var(--muted);padding:0;cursor:pointer}.copy:hover{color:var(--ink)}.copy-icon{display:block}.copy-done{display:none;place-items:center;width:16px;height:16px;border-radius:50%;background:#35a867;color:#fff}.copy.copied .copy-icon{display:none}.copy.copied .copy-done{display:grid}.copy-done svg{display:block}.copy-tip{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);background:#fff;color:#18191c;border-radius:6px;padding:5px 8px;font-size:12px;line-height:1.2;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.12);opacity:0;pointer-events:none}.copy-tip:after{content:'';position:absolute;left:50%;top:100%;transform:translateX(-50%);border:5px solid transparent;border-top-color:#fff}.copy:hover .copy-tip,.copy.copied .copy-tip{opacity:1}.fallback-link{display:inline-block;margin:8px auto 0;border:0;background:transparent;color:var(--muted);font-size:12.5px;text-decoration:underline;text-underline-offset:2px;cursor:pointer}.fallback-link.hide{display:none}.expires{font-size:12px;margin-top:8px}
  .request{display:none;max-width:410px;margin:16px auto 0;padding:16px;border:1px solid var(--request-border);border-radius:14px;background:var(--request-bg);text-align:left}.request.show{display:block}.request-title{display:flex;align-items:center;gap:8px;font-weight:600}.request-title:before{content:'';width:8px;height:8px;border-radius:50%;background:var(--request-accent)}.request-meta{font-size:12px;color:var(--muted);margin:5px 0 0 16px}#address:empty{display:none}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.actions button{min-width:62px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);padding:8px 14px;cursor:pointer}.actions .allow{background:var(--ink);color:var(--bg);border-color:var(--ink)}.has-request .qr,.has-request .url-row,.has-request .expires,.has-request .fallback-link{display:none}.has-request .request{margin-top:0}
  .tunnel-err{display:none;color:#e34d59;font-size:12px;margin:5px 7px 0}.tunnel-err.show{display:block}
  </style></head><body class="${options.connected ? "phone-connected manage-connected" : ""}"><div class="wrap"><div class="brand"><img class="light-logo" src="/brand-logo/light" alt=""><img class="dark-logo" src="/brand-logo/dark" alt=""><span>DSH Desktop</span></div><h1>${options.connected ? text.manageHeading : text.heading}</h1>
  <div class="mode-panel"><div class="mode-switch"><button id="btnLan" class="mode-btn${!options.tunnelActive ? " active" : ""}" onclick="switchMode(false)"${options.connected ? " disabled" : ""}>${text.modeLan}</button><button id="btnTunnel" class="mode-btn${options.tunnelActive ? " active" : ""}" onclick="switchMode(true)"${options.connected ? " disabled" : ""}>${text.modeTunnel}</button></div><p class="hint" id="modeHint">${options.tunnelActive ? text.tunnelHint : text.lanHint}</p><div id="tunnelError" class="tunnel-err${options.tunnelActive && options.tunnelError ? " show" : ""}">${options.tunnelActive && options.tunnelError ? text.tunnelError + options.tunnelError : ""}</div></div>
  <div id="connection" class="connection${options.connected ? " show" : ""}"><div class="connection-title">${text.connected}</div><p class="connection-hint">${text.closeHint}</p><div class="connection-actions"><button onclick="disconnectPhone()">${text.disconnect}</button><button class="done" onclick="window.close()">${text.done}</button></div></div>
  <div class="pairing-content"><div id="qrContainer" class="qr"><div id="qrCode">${options.qrSvg}</div><div id="qrLoading" class="qr-loading${options.tunnelLoading ? " show" : ""}"><div class="loading-copy"><span id="tunnelLoadingText">${text.tunnelLoading}</span><span id="tunnelProgressValue" class="loading-value">0%</span></div><div class="tunnel-progress" aria-hidden="true"><span id="tunnelProgressBar"></span></div></div></div><div class="url-row"><div class="url" id="url">${escapeHtml(options.pairingUrl)}</div><button type="button" id="copyBtn" class="copy" onclick="copyUrl()" aria-label="${text.copy}"><svg class="copy-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.4" stroke="currentColor" stroke-width="1.3"/><path d="M3.75 10.25V3.75h6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="copy-done" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.4 6.2 4.7 8.5 9.6 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="copy-tip" id="copyTip">${text.copy}</span></button></div><button type="button" id="fallbackLink" class="fallback-link${showFallback ? "" : " hide"}" onclick="switchFallback()">${text.fallbackLink}</button><p id="expires" class="expires"></p><div id="request" class="request"><div class="request-title">${text.waiting}</div><div id="requestMode" class="request-meta"></div><div id="address" class="request-meta"></div><div class="actions"><button onclick="decide(false)">${text.decline}</button><button class="allow" onclick="decide(true)">${text.allow}</button></div></div></div></div>
  <script>let end=${options.expiresAt},pairingUrl=${JSON.stringify(options.pairingUrl)},T=${JSON.stringify(text)},pendingId=null,tunnelActive=${Boolean(options.tunnelActive)},selectedTunnelTab=${Boolean(options.tunnelActive)},tunnelProvider=${JSON.stringify(options.tunnelProvider ?? null)},phoneConnected=${options.connected},modeSwitching=false,tunnelProgressTimer=null,tunnelProgressStartedAt=0,copyFeedbackTimer=null;
  async function copyUrl(){try{await navigator.clipboard.writeText(pairingUrl)}catch{return}const btn=document.getElementById('copyBtn'),tip=document.getElementById('copyTip');btn.classList.add('copied');tip.textContent=T.copied;clearTimeout(copyFeedbackTimer);copyFeedbackTimer=setTimeout(()=>{btn.classList.remove('copied');tip.textContent=T.copy},1800)}
  function syncFallbackLink(){const link=document.getElementById('fallbackLink');if(!link)return;link.classList.toggle('hide',!(tunnelActive&&tunnelProvider==='cloudflare'&&!phoneConnected&&!modeSwitching))}
  function syncModeControls(connected){phoneConnected=connected;const disabled=connected||modeSwitching;document.getElementById('btnLan').disabled=disabled;document.getElementById('btnTunnel').disabled=disabled;syncFallbackLink()}
  function syncModeSelection(active){document.getElementById('btnLan').classList.toggle('active',!active);document.getElementById('btnTunnel').classList.toggle('active',active)}
  function syncTunnelError(){const el=document.getElementById('tunnelError');el.classList.toggle('show',selectedTunnelTab&&!!el.textContent)}
  function setTunnelProgress(value){const progress=Math.max(0,Math.min(100,Math.round(value)));document.getElementById('tunnelProgressBar').style.width=progress+'%';document.getElementById('tunnelProgressValue').textContent=progress+'%'}
  function startTunnelProgress(enableTunnel){const loading=document.getElementById('qrLoading'),duration=enableTunnel?4500:800;clearInterval(tunnelProgressTimer);tunnelProgressStartedAt=Date.now();document.getElementById('tunnelLoadingText').textContent=enableTunnel?T.tunnelLoading:T.lanLoading;setTunnelProgress(0);loading.classList.add('show');tunnelProgressTimer=setInterval(()=>{setTunnelProgress(Math.min(99,(Date.now()-tunnelProgressStartedAt)/duration*100))},50);return duration}
  async function finishTunnelProgress(completed,duration){const loading=document.getElementById('qrLoading');if(completed){const remaining=Math.max(0,duration-(Date.now()-tunnelProgressStartedAt));if(remaining)await new Promise(resolve=>setTimeout(resolve,remaining));setTunnelProgress(100);await new Promise(resolve=>setTimeout(resolve,180))}clearInterval(tunnelProgressTimer);tunnelProgressTimer=null;loading.classList.remove('show');setTunnelProgress(0)}
  async function switchMode(enableTunnel){if(phoneConnected||modeSwitching)return;if(selectedTunnelTab===enableTunnel&&tunnelActive===enableTunnel)return;const previous=tunnelActive;const previousProvider=tunnelProvider;let completed=false;modeSwitching=true;selectedTunnelTab=enableTunnel;syncModeControls(phoneConnected);syncModeSelection(enableTunnel);document.getElementById('modeHint').textContent=enableTunnel?T.tunnelHint:T.lanHint;syncTunnelError();const progressDuration=startTunnelProgress(enableTunnel);try{const r=await fetch('/desktop/tunnel/toggle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enable:enableTunnel})});const j=await r.json();if(j.ok){tunnelActive=j.active;tunnelProvider=j.provider||null;pairingUrl=j.pairingUrl;document.getElementById('url').textContent=pairingUrl;if(j.qrSvg)document.getElementById('qrCode').innerHTML=j.qrSvg;selectedTunnelTab=enableTunnel;syncModeSelection(enableTunnel);document.getElementById('modeHint').textContent=enableTunnel?T.tunnelHint:T.lanHint;if(j.active)document.getElementById('tunnelError').textContent='';syncTunnelError();if(j.expiresAt)end=j.expiresAt;completed=true}else{throw new Error(j.error||'Tunnel failed')}}catch(e){tunnelActive=previous;tunnelProvider=previousProvider;syncModeSelection(selectedTunnelTab);document.getElementById('modeHint').textContent=selectedTunnelTab?T.tunnelHint:T.lanHint;document.getElementById('tunnelError').textContent=T.tunnelError+(e.message||e);syncTunnelError()}finally{await finishTunnelProgress(completed,progressDuration);modeSwitching=false;syncModeControls(phoneConnected)}}
  async function switchFallback(){if(phoneConnected||modeSwitching||!tunnelActive||tunnelProvider!=='cloudflare')return;let completed=false;modeSwitching=true;syncModeControls(phoneConnected);const progressDuration=startTunnelProgress(true);document.getElementById('tunnelLoadingText').textContent=T.fallbackLoading;try{const r=await fetch('/desktop/tunnel/fallback',{method:'POST'});const j=await r.json();if(j.ok){tunnelActive=j.active;tunnelProvider=j.provider||null;selectedTunnelTab=true;pairingUrl=j.pairingUrl;document.getElementById('url').textContent=pairingUrl;if(j.qrSvg)document.getElementById('qrCode').innerHTML=j.qrSvg;document.getElementById('tunnelError').textContent='';syncTunnelError();if(j.expiresAt)end=j.expiresAt;completed=true}else{throw new Error(j.error||'Tunnel failed')}}catch(e){document.getElementById('tunnelError').textContent=T.tunnelError+(e.message||e);syncTunnelError()}finally{await finishTunnelProgress(completed,progressDuration);modeSwitching=false;syncModeControls(phoneConnected)}}
  async function poll(){const [pending,status]=await Promise.all([fetch('/desktop/pending'),fetch('/desktop/status')]);if(pending.ok){const j=await pending.json();pendingId=j.id||null;document.getElementById('requestMode').textContent=pendingId?(j.mode==='tunnel'?T.requestTunnel:T.requestLan):'';document.getElementById('address').textContent=j.remoteAddress?T.deviceAddress+j.remoteAddress:'';document.getElementById('request').classList.toggle('show',!!pendingId);document.body.classList.toggle('has-request',!!pendingId)}if(status.ok){const j=await status.json();const connected=!!j.connected;document.getElementById('connection').classList.toggle('show',connected);document.body.classList.toggle('phone-connected',connected);syncModeControls(connected)}}
  async function disconnectPhone(){await fetch('/desktop/disconnect',{method:'POST'});location.reload()}
  async function decide(approved){if(!pendingId)return;await fetch('/desktop/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:pendingId,approved})});pendingId=null;poll()}
  setInterval(()=>{const n=Math.max(0,Math.ceil((end-Date.now())/1000));document.getElementById('expires').textContent=n?T.refresh+n+T.seconds:T.expired;if(!n&&!phoneConnected&&!pendingId&&!modeSwitching)location.reload()},1000);
  setInterval(poll,800);poll()<\/script></body></html>`;
}
function renderPairingWaitPage(pairingId, locale) {
  const zh = locale === "zh";
  const text = {
    title: zh ? "连接 DSH" : "Pairing DSH",
    heading: zh ? "批准此手机" : "Approve this phone",
    hint: zh ? "请在 DSH Desktop 中确认连接请求。" : "Confirm the connection request in DSH Desktop.",
    waiting: zh ? "正在等待批准…" : "Waiting for approval…",
    connected: zh ? "连接成功，正在打开 DSH…" : "Connected. Opening DSH…",
    declined: zh ? "连接申请已被拒绝。" : "The connection request was declined.",
    expired: zh ? "本次连接申请已过期。" : "This connection request expired.",
    unavailable: zh ? "暂时无法连接桌面端，请先启动 DSH Desktop。" : "Cannot reach the desktop. Start DSH Desktop and try again.",
    retry: zh ? "再次发起申请" : "Request approval again",
    retrying: zh ? "正在重新发起申请…" : "Requesting approval again…"
  };
  return `<!doctype html><html lang="${zh ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff" media="(prefers-color-scheme:light)"><meta name="theme-color" content="#141416" media="(prefers-color-scheme:dark)"><title>${text.title}</title><style>:root{color-scheme:light;--bg:#fff;--card:#fff;--panel:#f7f8fa;--ink:#18191c;--muted:#81858c;--line:#e5e7eb;--brand:#4d6bfe}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#141416;--card:#1d1d20;--panel:#202023;--ink:#f5f5f6;--muted:#95979d;--line:#303034;--brand:#6f86ff}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}.card{width:100%;max-width:340px;text-align:center}.logo{width:54px;height:54px;display:grid;place-items:center;margin:0 auto 22px;border:1px solid var(--line);border-radius:16px;background:var(--card)}.logo img{width:39px;height:22px;object-fit:contain}.logo .dark-logo{display:none}@media(prefers-color-scheme:dark){.logo .light-logo{display:none}.logo .dark-logo{display:block}}h1{font-size:24px;line-height:1.25;font-weight:600;margin:0 0 8px}p{margin:0;color:var(--muted)}.waiting{display:flex;justify-content:center;gap:6px;margin:24px 0}.waiting i{width:7px;height:7px;border-radius:50%;background:var(--brand);animation:p 1s infinite alternate}.waiting i:nth-child(2){animation-delay:.2s}.waiting i:nth-child(3){animation-delay:.4s}.waiting.stopped i{animation:none;background:var(--muted)}@keyframes p{to{opacity:.2;transform:translateY(-3px)}}.note{margin-top:20px;padding:11px 13px;border-radius:10px;background:var(--panel);font-size:13px}.retry{display:none;width:100%;height:44px;margin-top:12px;border:1px solid var(--ink);border-radius:12px;background:var(--ink);color:var(--bg);font:inherit;font-weight:600;cursor:pointer}.retry.show{display:block}.retry:disabled{opacity:.55;cursor:default}</style></head><body><div class="card"><div class="logo"><img class="light-logo" src="/brand-logo/light" alt="DSH"><img class="dark-logo" src="/brand-logo/dark" alt="DSH"></div><h1>${text.heading}</h1><p>${text.hint}</p><div id="waiting" class="waiting"><i></i><i></i><i></i></div><div id="status" class="note">${text.waiting}</div><button id="retry" class="retry" onclick="retryPairing()">${text.retry}</button></div><script>let id=${JSON.stringify(pairingId)},timer;const T=${JSON.stringify(text)},status=document.getElementById('status'),retry=document.getElementById('retry'),waiting=document.getElementById('waiting');function showWaiting(){status.textContent=T.waiting;retry.classList.remove('show');waiting.classList.remove('stopped')}function showRetry(message,stop=true){status.textContent=message;retry.classList.add('show');waiting.classList.add('stopped');if(stop)clearInterval(timer)}async function poll(){try{const r=await fetch('/pair/status?id='+encodeURIComponent(id),{cache:'no-store'});if(!r.ok)throw new Error();const j=await r.json();if(j.approved){clearInterval(timer);status.textContent=T.connected;retry.classList.remove('show');location.replace('/')}else if(j.denied||j.expired){showRetry(j.denied?T.declined:T.expired)}else{showWaiting()}}catch{showRetry(T.unavailable,false)}}function startPolling(){clearInterval(timer);poll();timer=setInterval(poll,900)}async function retryPairing(){retry.disabled=true;status.textContent=T.retrying;try{const r=await fetch('/pair/retry',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw new Error();const j=await r.json();if(j.redirectUrl){location.replace(j.redirectUrl);return}if(!j.id)throw new Error();id=j.id;retry.disabled=false;showWaiting();startPolling()}catch{retry.disabled=false;showRetry(T.unavailable)}}startPolling()<\/script></body></html>`;
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return replacements[character];
  });
}
const MAX_BODY_BYTES = 64 * 1024;
const PAIRING_TTL_MS = 5 * 60 * 1e3;
const MUX_RECONNECT_MS = 500;
const MUX_RECONNECT_CAP_MS = 3e4;
const REMOTE_STREAM_MUX_PATH = "/api/remote.mux";
const REMOTE_EVENT_STREAM_ENDPOINT = "$events";
const REMOTE_EVENT_RESULT_ENDPOINT = "$events/result";
const USER_QUESTION_EVENT = "user-questions/request";
const EVENT_STREAM_ID = "mobile-events";
const WORKSPACE_STREAM_ID = "mobile-workspaces";
const MUX_STABLE_MS = 5e3;
const HARNESS_ENDPOINTS = {
  "agentPreset.list": { endpoint: "agentPresets/list", args: () => ({}) },
  // The preset selector is keyed by agent id, which for a top-level session is
  // the session id the mobile page already sends.
  "agentPreset.select": {
    endpoint: "agentPresets/select",
    args: (payload) => ({ agentId: payload.sessionId, agentPreset: payload.agentPreset })
  },
  "session.list": { endpoint: "session/list", args: () => ({ _request: {} }) },
  // The catalog is no longer per-session: it describes what the Host can route
  // to, so it takes no arguments and the page's sessionId is dropped.
  "session.models": { endpoint: "session/modelCatalog", args: () => ({}) },
  "session.selectModel": {
    endpoint: "session/selectModel",
    args: (payload) => ({ request: payload })
  },
  "session.create": { endpoint: "session/create", args: (payload) => ({ request: payload }) },
  "session.prompt": {
    endpoint: "session/prompt",
    args: (payload) => ({ request: { requestId: randomUUID(), ...payload } })
  },
  "session.cancel": { endpoint: "session/cancel", args: (payload) => ({ request: payload }) }
};
const RPC_ALLOWLIST = /* @__PURE__ */ new Set([...Object.keys(HARNESS_ENDPOINTS), "session.history", "workspace.list"]);
class LanMobileBridge {
  constructor(options) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }
  options;
  server;
  port;
  pairingToken;
  pairingExpiresAt;
  tunnelInstance;
  tunnelActive = false;
  tunnelLoading = false;
  tunnelError;
  tunnelLaunch;
  sessions = /* @__PURE__ */ new Map();
  suspendedSessions = /* @__PURE__ */ new Map();
  pendingPairings = /* @__PURE__ */ new Map();
  pendingQuestions = /* @__PURE__ */ new Map();
  /** Client generation id from the event stream's `ready` frame; results quote it. */
  eventClientId;
  /** Latest `workspace/follow` baseline, standing in for the removed unary list. */
  workspaceSnapshot;
  now;
  muxAbort;
  muxTask;
  sessionStreamAborts = /* @__PURE__ */ new Set();
  lastConnected = false;
  async start() {
    if (this.server) {
      if (!this.pairingTokenValid()) {
        this.rotatePairingToken();
      }
      this.syncConnected();
      return this.snapshot();
    }
    this.rotatePairingToken();
    this.server = createServer$1((request, response) => {
      void this.handle(request, response).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.json(response, 500, { ok: false, error: message });
      }).finally(() => this.syncConnected());
    });
    await new Promise((resolve2, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.options.port ?? 0, "0.0.0.0", resolve2);
    });
    this.port = this.server.address().port;
    this.syncConnected();
    return this.snapshot();
  }
  async stop() {
    const server = this.server;
    this.server = void 0;
    this.port = void 0;
    this.pairingToken = void 0;
    this.pairingExpiresAt = void 0;
    if (this.tunnelLaunch) {
      await this.tunnelLaunch.catch(() => void 0);
      this.tunnelLaunch = void 0;
    }
    if (this.tunnelInstance) {
      await this.tunnelInstance.stop().catch(() => void 0);
      this.tunnelInstance = void 0;
    }
    this.tunnelActive = false;
    this.tunnelLoading = false;
    this.tunnelError = void 0;
    this.sessions.clear();
    this.suspendedSessions.clear();
    this.pendingPairings.clear();
    this.pendingQuestions.clear();
    for (const abort of this.sessionStreamAborts) abort.abort();
    this.sessionStreamAborts.clear();
    this.syncConnected();
    this.muxAbort?.abort();
    const muxTask = this.muxTask;
    this.muxAbort = void 0;
    this.muxTask = void 0;
    if (muxTask) await muxTask.catch(() => void 0);
    if (!server) return;
    server.closeAllConnections();
    await new Promise((resolve2) => server.close(() => resolve2()));
  }
  async toggleTunnel(enable) {
    const targetState = enable !== void 0 ? enable : !this.tunnelActive;
    if (!targetState) {
      if (this.tunnelLaunch) {
        await this.tunnelLaunch.catch(() => void 0);
        this.tunnelLaunch = void 0;
      }
      if (this.tunnelInstance) {
        await this.tunnelInstance.stop().catch(() => void 0);
        this.tunnelInstance = void 0;
      }
      this.tunnelActive = false;
      this.tunnelLoading = false;
      this.tunnelError = void 0;
      return this.snapshot();
    }
    if (this.tunnelActive && this.tunnelInstance?.url) {
      return this.snapshot();
    }
    if (this.tunnelLaunch) {
      return this.snapshot();
    }
    this.tunnelLoading = true;
    this.tunnelError = void 0;
    const launch = this.launchTunnel();
    this.tunnelLaunch = launch;
    try {
      await launch;
      this.tunnelActive = true;
    } catch (error) {
      this.tunnelActive = false;
      this.tunnelError = error instanceof Error ? error.message : String(error);
    } finally {
      this.tunnelLoading = false;
      if (this.tunnelLaunch === launch) this.tunnelLaunch = void 0;
    }
    return this.snapshot();
  }
  async fallbackToPinggy() {
    if (this.sessions.size > 0) {
      throw new Error("Disconnect the phone before switching connection modes.");
    }
    if (!this.tunnelActive || this.tunnelInstance?.provider !== "cloudflare") {
      throw new Error("Fallback is only available for an active Cloudflare tunnel.");
    }
    if (this.tunnelLaunch) {
      throw new Error("A tunnel switch is already in progress.");
    }
    this.tunnelLoading = true;
    this.tunnelError = void 0;
    const launch = this.swapToPinggy();
    this.tunnelLaunch = launch;
    try {
      await launch;
    } catch (error) {
      this.tunnelError = error instanceof Error ? error.message : String(error);
    } finally {
      this.tunnelLoading = false;
      if (this.tunnelLaunch === launch) this.tunnelLaunch = void 0;
    }
    return this.snapshot();
  }
  async launchTunnel() {
    const port = this.port;
    if (!port) throw new Error("Bridge is not running.");
    this.tunnelInstance = await startTunnelWithFallback({
      forceCloudflareFailure: this.options.forceCloudflareFailure,
      startCloudflare: () => this.startCloudflareInstance(port),
      startPinggy: () => this.startPinggyInstance(port),
      log: this.options.tunnelLog
    });
  }
  async swapToPinggy() {
    const port = this.port;
    if (!port) throw new Error("Bridge is not running.");
    const pinggy = await this.startPinggyInstance(port);
    const previous = this.tunnelInstance;
    this.tunnelInstance = pinggy;
    this.tunnelActive = true;
    this.tunnelError = void 0;
    if (previous) await previous.stop().catch(() => void 0);
  }
  async startCloudflareInstance(port) {
    if (this.options.createCloudflareTunnel) return this.options.createCloudflareTunnel(port);
    const cacheDir = this.tunnelCacheDir();
    const binaryPath = await ensureCloudflaredBinary({
      cacheDir,
      customPath: this.options.cloudflaredPath
    });
    return startCloudflareQuickTunnel({
      port,
      binaryPath,
      log: this.options.tunnelLog
    });
  }
  async startPinggyInstance(port) {
    if (this.options.createPinggyTunnel) return this.options.createPinggyTunnel(port);
    const cacheDir = this.tunnelCacheDir();
    return startPinggyTunnel({
      port,
      sshPath: this.options.pinggySshPath,
      knownHostsPath: join(cacheDir, "pinggy-known-hosts"),
      log: this.options.tunnelLog
    });
  }
  tunnelCacheDir() {
    return this.options.cloudflaredCacheDir ?? join(tmpdir(), "dsh-cloudflared");
  }
  snapshot() {
    if (!this.server || !this.port) {
      return { running: false, connected: this.sessions.size > 0 };
    }
    const tokenValid = this.pairingTokenValid();
    const address = preferredLanAddress();
    const pairingUrl = !tokenValid ? void 0 : this.tunnelActive && this.tunnelInstance?.url ? `${this.tunnelInstance.url}/pair?token=${this.pairingToken}` : address ? `http://${address}:${this.port}/pair?token=${this.pairingToken}` : void 0;
    return {
      running: true,
      connected: this.sessions.size > 0,
      port: this.port,
      ...tokenValid && pairingUrl ? { pairingUrl, expiresAt: this.pairingExpiresAt } : {},
      desktopUrl: `http://127.0.0.1:${this.port}/desktop`,
      tunnelActive: this.tunnelActive,
      tunnelLoading: this.tunnelLoading,
      tunnelUrl: this.tunnelInstance?.url,
      tunnelProvider: this.tunnelInstance?.provider,
      tunnelError: this.tunnelError
    };
  }
  rotatePairingToken() {
    this.pairingToken = randomBytes(32).toString("base64url");
    this.pairingExpiresAt = this.now() + PAIRING_TTL_MS;
  }
  pairingTokenValid() {
    return Boolean(this.pairingToken && this.pairingExpiresAt && this.pairingExpiresAt >= this.now());
  }
  async handle(request, response) {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader(
      "content-security-policy",
      "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    );
    const transportAddress = normalizeRemoteAddress(request.socket.remoteAddress ?? "");
    if (!isPrivateAddress(transportAddress)) return this.text(response, 403, "Private network only.");
    const connectionMode = this.requestConnectionMode(request, transportAddress);
    const forwardedAddress = firstHeaderValue(request.headers["cf-connecting-ip"]) ?? firstHeaderValue(request.headers["x-forwarded-for"]);
    const remoteAddress = connectionMode === "tunnel" && forwardedAddress ? normalizeRemoteAddress(forwardedAddress) : transportAddress;
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname.startsWith("/brand-logo/")) {
      const variant = url.pathname === "/brand-logo/dark" ? "dark" : "light";
      const path = this.options.brandLogoPaths?.[variant];
      if (!path) return this.text(response, 404, "Brand asset not found.");
      try {
        const body = await readFile(path);
        response.statusCode = 200;
        response.setHeader("content-type", "image/png");
        response.setHeader("cache-control", "public, max-age=3600");
        response.end(body);
      } catch {
        this.text(response, 404, "Brand asset not found.");
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/app-icon") {
      const path = this.options.appIconPath;
      if (!path) return this.text(response, 404, "App icon not found.");
      try {
        const body = await readFile(path);
        response.statusCode = 200;
        response.setHeader("content-type", "image/png");
        response.setHeader("cache-control", "public, max-age=86400");
        response.end(body);
      } catch {
        this.text(response, 404, "App icon not found.");
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/desktop") {
      if (!isLoopbackAddress(remoteAddress)) return this.text(response, 403, "Desktop only.");
      this.verifyTrustedOrigin(request);
      if (!this.server || !this.port) return this.text(response, 503, "Bridge unavailable.");
      if (!this.pairingTokenValid()) {
        this.rotatePairingToken();
      }
      const snapshot = this.snapshot();
      if (!snapshot.pairingUrl || !snapshot.expiresAt) return this.text(response, 503, "Bridge unavailable.");
      const qrSvg = await QRCode.toString(snapshot.pairingUrl, { type: "svg", margin: 1, width: 260 });
      return this.html(
        response,
        renderDesktopPairingPage({
          qrSvg,
          pairingUrl: snapshot.pairingUrl,
          expiresAt: snapshot.expiresAt,
          locale: this.locale(),
          connected: this.sessions.size > 0,
          tunnelActive: snapshot.tunnelActive,
          tunnelLoading: snapshot.tunnelLoading,
          tunnelProvider: snapshot.tunnelProvider,
          tunnelUrl: snapshot.tunnelUrl,
          tunnelError: snapshot.tunnelError
        })
      );
    }
    if (request.method === "GET" && url.pathname === "/desktop/pending") {
      if (!isLoopbackAddress(remoteAddress)) return this.text(response, 403, "Desktop only.");
      const pending = [...this.pendingPairings.values()].find(
        (item) => item.decision === void 0 && item.expiresAt >= this.now()
      );
      return this.json(
        response,
        200,
        pending ? { id: pending.id, remoteAddress: pending.remoteAddress, mode: pending.mode } : {}
      );
    }
    if (request.method === "GET" && url.pathname === "/desktop/status") {
      if (!isLoopbackAddress(remoteAddress)) return this.text(response, 403, "Desktop only.");
      return this.json(response, 200, { connected: this.sessions.size > 0 });
    }
    if (request.method === "GET" && url.pathname === "/desktop/tunnel/status") {
      if (!isLoopbackAddress(remoteAddress)) return this.text(response, 403, "Desktop only.");
      const snapshot = this.snapshot();
      const qrSvg = snapshot.pairingUrl ? await QRCode.toString(snapshot.pairingUrl, { type: "svg", margin: 1, width: 260 }) : void 0;
      return this.json(response, 200, {
        active: snapshot.tunnelActive,
        loading: snapshot.tunnelLoading,
        url: snapshot.tunnelUrl,
        provider: snapshot.tunnelProvider,
        error: snapshot.tunnelError,
        pairingUrl: snapshot.pairingUrl,
        qrSvg,
        expiresAt: snapshot.expiresAt
      });
    }
    if (request.method === "POST" && url.pathname === "/desktop/tunnel/fallback") {
      if (!isLoopbackAddress(remoteAddress)) return this.text(response, 403, "Desktop only.");
      this.verifySameOrigin(request);
      if (this.sessions.size > 0) {
        return this.json(response, 409, {
          ok: false,
          error: "Disconnect the phone before switching connection modes."
        });
      }
      if (this.tunnelLoading || this.tunnelLaunch) {
        return this.json(response, 409, {
          ok: false,
          error: "A tunnel switch is already in progress."
        });
      }
      if (!this.tunnelActive || this.tunnelInstance?.provider !== "cloudflare") {
        return this.json(response, 400, {
          ok: false,
          error: "Fallback is only available for an active Cloudflare tunnel."
        });
      }
      const snapshot = await this.fallbackToPinggy();
      const qrSvg = snapshot.pairingUrl ? await QRCode.toString(snapshot.pairingUrl, { type: "svg", margin: 1, width: 260 }) : void 0;
      return this.json(response, 200, {
        ok: !snapshot.tunnelError,
        active: snapshot.tunnelActive,
        loading: snapshot.tunnelLoading,
        url: snapshot.tunnelUrl,
        provider: snapshot.tunnelProvider,
        error: snapshot.tunnelError,
        pairingUrl: snapshot.pairingUrl,
        qrSvg,
        expiresAt: snapshot.expiresAt
      });
    }
    if (request.method === "POST" && url.pathname === "/desktop/tunnel/toggle") {
      if (!isLoopbackAddress(remoteAddress)) return this.text(response, 403, "Desktop only.");
      this.verifySameOrigin(request);
      if (this.sessions.size > 0) {
        return this.json(response, 409, {
          ok: false,
          error: "Disconnect the phone before switching connection modes."
        });
      }
      let enable;
      try {
        const bodyText = await readBody(request);
        if (bodyText) {
          const parsed = JSON.parse(bodyText);
          if (typeof parsed.enable === "boolean") enable = parsed.enable;
        }
      } catch {
      }
      if (enable === true && this.tunnelLoading && !this.tunnelActive) {
        return this.json(response, 409, {
          ok: false,
          error: "A tunnel switch is already in progress."
        });
      }
      const snapshot = await this.toggleTunnel(enable);
      const qrSvg = snapshot.pairingUrl ? await QRCode.toString(snapshot.pairingUrl, { type: "svg", margin: 1, width: 260 }) : void 0;
      return this.json(response, 200, {
        ok: !snapshot.tunnelError,
        active: snapshot.tunnelActive,
        loading: snapshot.tunnelLoading,
        url: snapshot.tunnelUrl,
        provider: snapshot.tunnelProvider,
        error: snapshot.tunnelError,
        pairingUrl: snapshot.pairingUrl,
        qrSvg,
        expiresAt: snapshot.expiresAt
      });
    }
    if (request.method === "POST" && url.pathname === "/desktop/disconnect") {
      if (!isLoopbackAddress(remoteAddress)) return this.text(response, 403, "Desktop only.");
      this.verifySameOrigin(request);
      for (const [token, session] of this.sessions) this.suspendedSessions.set(token, session);
      this.sessions.clear();
      this.pendingPairings.clear();
      this.rotatePairingToken();
      return this.json(response, 200, { ok: true });
    }
    if (request.method === "POST" && url.pathname === "/desktop/decide") {
      if (!isLoopbackAddress(remoteAddress)) return this.text(response, 403, "Desktop only.");
      this.verifySameOrigin(request);
      const input = JSON.parse(await readBody(request));
      const pending = typeof input.id === "string" ? this.pendingPairings.get(input.id) : void 0;
      if (!pending || typeof input.approved !== "boolean") return this.text(response, 404, "Pairing request not found.");
      pending.decision = input.approved;
      return this.json(response, 200, { ok: true });
    }
    if (request.method === "GET" && url.pathname === "/disconnected") {
      const migrationUrl = this.tunnelMigrationUrl(url, connectionMode);
      if (migrationUrl) return this.redirect(response, migrationUrl);
      return this.html(response, renderMobileReconnectPage(this.locale(), connectionMode));
    }
    if (request.method === "GET" && url.pathname === "/reconnect") {
      const migrationUrl = this.tunnelMigrationUrl(url, connectionMode);
      if (migrationUrl) return this.redirect(response, migrationUrl);
      const pending = this.reconnectPairing(remoteAddress, connectionMode);
      this.options.onReconnectRequested?.();
      return this.html(response, renderPairingWaitPage(pending.id, this.locale()));
    }
    if (request.method === "POST" && url.pathname === "/pair/retry") {
      this.verifySameOrigin(request);
      const migrationUrl = this.tunnelMigrationUrl(new URL("/reconnect", url), connectionMode);
      if (migrationUrl) return this.json(response, 200, { redirectUrl: migrationUrl });
      const pending = this.reconnectPairing(remoteAddress, connectionMode);
      this.options.onReconnectRequested?.();
      return this.json(response, 200, { id: pending.id, expiresAt: pending.expiresAt });
    }
    if (request.method === "GET" && url.pathname === "/pair") {
      const migrationUrl = this.tunnelMigrationUrl(url, connectionMode);
      if (migrationUrl) return this.redirect(response, migrationUrl);
      if (this.authorized(request, remoteAddress)) {
        response.statusCode = 302;
        response.setHeader("location", "/");
        response.end();
        return;
      }
      if (!this.validPairingToken(url.searchParams.get("token"))) {
        return this.text(response, 401, "This pairing link is invalid or expired.");
      }
      const id = randomUUID();
      this.pendingPairings.set(id, {
        id,
        remoteAddress,
        mode: connectionMode,
        expiresAt: this.pairingExpiresAt
      });
      return this.html(response, renderPairingWaitPage(id, this.locale()));
    }
    if (request.method === "GET" && url.pathname === "/pair/status") {
      const id = url.searchParams.get("id");
      const pending = id ? this.pendingPairings.get(id) : void 0;
      if (!pending) return this.json(response, 200, { expired: true });
      if (pending.expiresAt < this.now()) {
        this.pendingPairings.delete(pending.id);
        return this.json(response, 200, { expired: true });
      }
      if (pending.decision === false) {
        this.pendingPairings.delete(pending.id);
        return this.json(response, 200, { denied: true });
      }
      if (pending.decision !== true) return this.json(response, 200, { pending: true });
      const token = randomBytes(32).toString("base64url");
      for (const [savedToken, session] of this.suspendedSessions) {
        if (session.remoteAddress !== pending.remoteAddress) continue;
        this.sessions.set(savedToken, session);
        this.suspendedSessions.delete(savedToken);
      }
      this.sessions.set(token, { token, remoteAddress: pending.remoteAddress });
      this.pendingPairings.delete(pending.id);
      this.pairingToken = void 0;
      this.pairingExpiresAt = void 0;
      response.setHeader("set-cookie", `dsh_mobile=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);
      return this.json(response, 200, { approved: true });
    }
    if (!this.authorized(request, remoteAddress)) {
      this.rememberMobileContext(request, remoteAddress);
      if (!this.authorized(request, remoteAddress)) {
        if (request.method === "GET" && url.pathname === "/") {
          const migrationUrl = this.tunnelMigrationUrl(url, connectionMode);
          if (migrationUrl) return this.redirect(response, migrationUrl);
          return this.html(response, renderMobileReconnectPage(this.locale(), connectionMode));
        }
        return this.text(response, 401, "Pair your phone again.");
      }
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      return this.json(response, 200, { connected: true });
    }
    if (request.method === "GET" && url.pathname === "/") {
      return this.html(response, renderMobilePage({ locale: this.locale() }));
    }
    if (request.method === "GET" && url.pathname === "/api/session/stream") {
      this.verifyTrustedOrigin(request);
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) return this.text(response, 400, "Session id is required.");
      return this.streamSession(request, response, sessionId);
    }
    if (request.method === "POST" && url.pathname === "/api/rpc") {
      this.verifySameOrigin(request);
      const input = JSON.parse(await readBody(request));
      if (input.method === "interaction.pending") {
        const sessionId = requiredStringField(input.payload, "sessionId");
        const pending = [...this.pendingQuestions.values()].find(
          (item) => item.sessionId === sessionId
        );
        return this.json(response, 200, { ok: true, value: pending ?? null });
      }
      if (input.method === "interaction.answer") {
        const answer = parseQuestionResponse(input.payload);
        const pending = this.assertPendingQuestion(answer.rpcId, answer.sessionId);
        validateQuestionAnswers(pending, answer.answers);
        const result2 = await this.respondToQuestion(answer.rpcId, {
          kind: "result",
          value: { answers: answer.answers }
        });
        return this.json(response, result2.ok ? 200 : 400, result2);
      }
      if (input.method === "interaction.cancel") {
        const rpcId = requiredStringField(input.payload, "rpcId");
        const sessionId = requiredStringField(input.payload, "sessionId");
        this.assertPendingQuestion(rpcId, sessionId);
        const result2 = await this.respondToQuestion(rpcId, {
          kind: "rejected",
          error: {
            name: "Error",
            message: "the user closed this question request",
            code: "cancelled"
          }
        });
        return this.json(response, result2.ok ? 200 : 400, result2);
      }
      if (typeof input.method !== "string" || !RPC_ALLOWLIST.has(input.method)) {
        return this.json(response, 403, { ok: false, error: "RPC method is not available on mobile." });
      }
      const result = await this.forwardRpc(input.method, input.payload ?? {});
      return this.json(response, result.ok ? 200 : 400, result);
    }
    this.text(response, 404, "Not found.");
  }
  locale() {
    const value = this.options.locale;
    return typeof value === "function" ? value() : value ?? "en";
  }
  validPairingToken(candidate) {
    if (!candidate || !this.pairingToken || !this.pairingExpiresAt) return false;
    if (this.now() > this.pairingExpiresAt) return false;
    const left = Buffer.from(candidate);
    const right = Buffer.from(this.pairingToken);
    return left.length === right.length && timingSafeEqual(left, right);
  }
  reconnectPairing(remoteAddress, mode) {
    const current = [...this.pendingPairings.values()].find(
      (item) => item.remoteAddress === remoteAddress && item.mode === mode && item.decision === void 0 && item.expiresAt >= this.now()
    );
    if (current) return current;
    const pending = {
      id: randomUUID(),
      remoteAddress,
      mode,
      expiresAt: this.now() + PAIRING_TTL_MS
    };
    this.pendingPairings.set(pending.id, pending);
    return pending;
  }
  authorized(request, remoteAddress) {
    const token = this.mobileToken(request);
    if (token && this.sessions.has(token)) return true;
    return [...this.sessions.values()].some((session) => session.remoteAddress === remoteAddress);
  }
  mobileToken(request) {
    const cookie = request.headers.cookie ?? "";
    return /(?:^|;\s*)dsh_mobile=([^;]+)/.exec(cookie)?.[1];
  }
  rememberMobileContext(request, remoteAddress) {
    const token = this.mobileToken(request);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    const sameDeviceIsActive = [...this.sessions.values()].some(
      (session) => session.remoteAddress === remoteAddress
    );
    if (sameDeviceIsActive) {
      this.sessions.set(token, { token, remoteAddress });
      this.suspendedSessions.delete(token);
      return;
    }
    if (!this.suspendedSessions.has(token) && this.suspendedSessions.size >= 16) {
      const oldest = this.suspendedSessions.keys().next().value;
      if (oldest) this.suspendedSessions.delete(oldest);
    }
    this.suspendedSessions.set(token, { token, remoteAddress });
  }
  verifySameOrigin(request) {
    this.verifyTrustedOrigin(request);
  }
  /**
   * Rejects browser-driven cross-site requests (CSRF / drive-by) against the
   * loopback-only desktop surface. The pairing window's own navigations and
   * same-origin fetches pass; requests without Fetch Metadata and Origin
   * headers (local tooling, tests) pass as well.
   */
  verifyTrustedOrigin(request) {
    const site = firstHeaderValue(request.headers["sec-fetch-site"]);
    if (site && site !== "same-origin" && site !== "none") {
      throw new Error("Cross-site request rejected.");
    }
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin && host && new URL(origin).host !== host) throw new Error("Cross-origin request rejected.");
  }
  requestConnectionMode(request, transportAddress) {
    if (!isLoopbackAddress(transportAddress)) return "lan";
    const host = (request.headers.host ?? "").split(":", 1)[0]?.toLowerCase() ?? "";
    const forwardedAddress = firstHeaderValue(request.headers["cf-connecting-ip"]);
    const ray = firstHeaderValue(request.headers["cf-ray"]);
    return isInternetTunnelHost(host) || Boolean(forwardedAddress && ray) ? "tunnel" : "lan";
  }
  tunnelMigrationUrl(url, connectionMode) {
    if (connectionMode === "tunnel" || !this.tunnelActive || !this.tunnelInstance?.url) return void 0;
    return new URL(`${url.pathname}${url.search}`, this.tunnelInstance.url).toString();
  }
  /**
   * The Host session cookie for one Harness base, obtained once and reused.
   *
   * Since 0.1.2-alpha.1 every Host API call is authenticated before dispatch:
   * an unauthenticated caller gets 401, and the launch token is accepted only
   * as `GET /?token=...` on the root — never on an API path and never in an
   * Authorization header. The bridge is a server-side client, not a browser,
   * so it performs that exchange itself.
   *
   * The cookie is signed against the request authority, so every later call
   * has to reach the Host under the same `Host` value the exchange used. That
   * is why the bridge talks to the loopback base rather than forwarding the
   * phone's own authority.
   */
  harnessCookie;
  async harnessSession(base) {
    if (this.harnessCookie?.base === base) return this.harnessCookie.cookie;
    const token = this.options.harnessAuthToken?.();
    if (token === void 0) return void 0;
    const url = new URL("/", base);
    url.searchParams.set("token", token);
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(1e4)
    });
    const cookie = cookiePair(response.headers.getSetCookie());
    if (cookie === void 0) return void 0;
    this.harnessCookie = { base, cookie };
    return cookie;
  }
  /**
   * Call the Host with the session cookie, exchanging the launch token first
   * and once more if the stored cookie has stopped being accepted.
   */
  async harnessFetch(url, init, base) {
    const send = async (cookie) => fetch(url, {
      ...init,
      headers: { ...init.headers, ...cookie === void 0 ? {} : { cookie } }
    });
    let response = await send(await this.harnessSession(base));
    if (response.status === 401) {
      this.harnessCookie = void 0;
      const retry = await this.harnessSession(base);
      if (retry !== void 0) response = await send(retry);
    }
    return response;
  }
  /**
   * Translate one mobile method onto its Host endpoint and drive it.
   *
   * `session.history` is the one call the page cannot express directly: the
   * Host replaced open-ended history reads with a cursor-bounded page, and
   * refuses a `throughSeq` past the session's own cursor. The cursor lives on
   * the session list row, so the read is two calls here rather than a
   * protocol the page has to learn.
   */
  async forwardRpc(method, payload) {
    const fields = typeof payload === "object" && payload !== null ? payload : {};
    if (method === "workspace.list") {
      const snapshot = this.workspaceSnapshot;
      if (snapshot === void 0) return { ok: false, error: "Harness workspaces are not loaded yet." };
      return { ok: true, value: snapshot };
    }
    if (method === "session.history") {
      const sessionId = fields.sessionId;
      const listed = await this.invokeHarness("session/list", { _request: {} });
      if (!listed.ok) return listed;
      const items = listed.value.items ?? [];
      const row = items.find((item) => item.sessionId === sessionId);
      const projections = row?.projections;
      const throughSeq = projections?.asOfSeq;
      if (typeof throughSeq !== "number") return { ok: false, error: "Harness has no cursor for this session." };
      const page = await this.invokeHarness("session/page", {
        request: {
          address: { kind: "session", sessionId },
          throughSeq,
          ...typeof fields.maxMessages === "number" ? { maxMessages: fields.maxMessages } : {}
        }
      });
      if (!page.ok) return page;
      const value = page.value;
      if (!Array.isArray(value?.records)) {
        return { ok: false, error: "Harness returned invalid session history." };
      }
      return {
        ok: true,
        value: {
          events: value.records,
          projections,
          hasMore: value.hasMore === true
        }
      };
    }
    const route = HARNESS_ENDPOINTS[method];
    if (route === void 0) return { ok: false, error: "RPC method is not available on mobile." };
    return this.invokeHarness(route.endpoint, route.args(fields));
  }
  async invokeHarness(endpoint, args) {
    const base = this.options.harnessUrl();
    if (!base) return { ok: false, error: "Harness is not ready." };
    const rpcId = randomUUID();
    const response = await this.harnessFetch(new URL(`/api/${endpoint}`, base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId, method: endpoint, payload: { args } }),
      signal: AbortSignal.timeout(3e4)
    }, base);
    if (!response.ok) return { ok: false, error: `Harness transport returned HTTP ${response.status}.` };
    const envelope = await response.json();
    if (envelope.rpcId !== rpcId) return { ok: false, error: "Harness RPC response did not match the request." };
    if (envelope.result?.ok !== true) {
      const message = envelope.result?.error?.message;
      return { ok: false, error: typeof message === "string" ? message : "Harness rejected the request." };
    }
    return { ok: true, value: envelope.result.value };
  }
  /**
   * Reconciles everything that depends on a phone being attached. The mux
   * downlink exists purely to track questions raised for a mobile client, so
   * running it with no client meant reconnecting twice a second, forever, on
   * every desktop that never used the feature.
   */
  syncConnected() {
    const connected = this.sessions.size > 0;
    if (connected) this.startMuxMonitor();
    else this.muxAbort?.abort();
    if (connected === this.lastConnected) return;
    this.lastConnected = connected;
    try {
      this.options.onConnectedChange?.(connected);
    } catch {
    }
  }
  startMuxMonitor() {
    if (this.muxTask) return;
    const abort = new AbortController();
    this.muxAbort = abort;
    this.muxTask = this.monitorMux(abort.signal).finally(() => {
      if (this.muxAbort === abort) {
        this.muxAbort = void 0;
        this.muxTask = void 0;
      }
    });
  }
  async monitorMux(signal) {
    let lastBase;
    let backoffMs = MUX_RECONNECT_MS;
    const backOff = async () => {
      await waitFor(backoffMs, signal);
      backoffMs = Math.min(backoffMs * 2, MUX_RECONNECT_CAP_MS);
    };
    while (!signal.aborted) {
      const base = this.options.harnessUrl();
      if (!base) {
        this.pendingQuestions.clear();
        await backOff();
        continue;
      }
      if (base !== lastBase) {
        this.pendingQuestions.clear();
        lastBase = base;
        backoffMs = MUX_RECONNECT_MS;
      }
      let openedAt;
      try {
        await this.consumeMux(base, signal, () => {
          openedAt = this.now();
        });
        backoffMs = MUX_RECONNECT_MS;
      } catch {
        if (signal.aborted) return;
        this.pendingQuestions.clear();
        if (openedAt !== void 0 && this.now() - openedAt >= MUX_STABLE_MS) {
          backoffMs = MUX_RECONNECT_MS;
        }
        await backOff();
      }
    }
  }
  async consumeMux(base, signal, onOpen) {
    const url = new URL(REMOTE_STREAM_MUX_PATH, base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const cookie = await this.harnessSession(base);
    await new Promise((resolve2, reject) => {
      const socket = new WebSocket(url, {
        headers: cookie === void 0 ? {} : { cookie }
      });
      socket.addEventListener("error", () => {
      });
      let settled = false;
      const cleanup = () => {
        signal.removeEventListener("abort", handleAbort);
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("close", handleClose);
        socket.removeEventListener("error", handleError);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
        if (error) reject(error);
        else resolve2();
      };
      const handleAbort = () => finish();
      const handleOpen = () => {
        onOpen?.();
        this.pendingQuestions.clear();
        this.eventClientId = void 0;
        socket.send(JSON.stringify({
          type: "open",
          streamId: EVENT_STREAM_ID,
          endpoint: REMOTE_EVENT_STREAM_ENDPOINT,
          payload: { args: {} }
        }));
        socket.send(JSON.stringify({
          type: "open",
          streamId: WORKSPACE_STREAM_ID,
          endpoint: "workspace/follow",
          payload: { args: {} }
        }));
      };
      const handleMessage = (event) => {
        const data = event.data;
        if (typeof data === "string") this.consumeMuxEnvelope(data);
        else if (Buffer.isBuffer(data)) this.consumeMuxEnvelope(data.toString("utf8"));
      };
      const handleClose = () => {
        finish(signal.aborted ? void 0 : new Error("Harness mux WebSocket closed."));
      };
      const handleError = () => finish(new Error("Harness mux WebSocket failed."));
      socket.addEventListener("open", handleOpen);
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("close", handleClose, { once: true });
      socket.addEventListener("error", handleError, { once: true });
      signal.addEventListener("abort", handleAbort, { once: true });
      if (signal.aborted) handleAbort();
    });
  }
  /** Forward one native Harness session/follow stream to an authenticated phone as SSE. */
  async streamSession(request, response, sessionId) {
    const base = this.options.harnessUrl();
    if (!base) return this.text(response, 503, "Harness is not ready.");
    const cookie = await this.harnessSession(base);
    const url = new URL(REMOTE_STREAM_MUX_PATH, base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const streamId = `mobile-session-${randomUUID()}`;
    const abort = new AbortController();
    this.sessionStreamAborts.add(abort);
    response.statusCode = 200;
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();
    response.write("retry: 500\n\n");
    await new Promise((resolve2) => {
      const socket = new WebSocket(url, { headers: cookie === void 0 ? {} : { cookie } });
      socket.addEventListener("error", () => {
      });
      let settled = false;
      const cleanup = () => {
        request.removeListener("close", finish);
        abort.signal.removeEventListener("abort", finish);
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("close", handleClose);
        socket.removeEventListener("error", handleError);
        this.sessionStreamAborts.delete(abort);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
        if (!response.writableEnded) response.end();
        resolve2();
      };
      const handleOpen = () => {
        socket.send(JSON.stringify({
          type: "open",
          streamId,
          endpoint: "session/follow",
          payload: {
            args: {
              request: { address: { kind: "session", sessionId }, maxMessages: 100 }
            }
          }
        }));
      };
      const handleMessage = (event) => {
        const text = typeof event.data === "string" ? event.data : Buffer.isBuffer(event.data) ? event.data.toString("utf8") : void 0;
        if (!text) return;
        let frame;
        try {
          frame = JSON.parse(text);
        } catch {
          return;
        }
        if (!isRecord(frame) || frame.streamId !== streamId) return;
        if (frame.type === "item") {
          const value = frame.value;
          const eventName = isRecord(value) && value.type === "snapshot" ? "snapshot" : "event";
          response.write(`event: ${eventName}
data: ${JSON.stringify(value)}

`);
        } else if (frame.type === "error" || frame.type === "end") {
          finish();
        }
      };
      const handleClose = () => finish();
      const handleError = () => finish();
      request.once("close", finish);
      abort.signal.addEventListener("abort", finish, { once: true });
      socket.addEventListener("open", handleOpen);
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("close", handleClose, { once: true });
      socket.addEventListener("error", handleError, { once: true });
      if (abort.signal.aborted) finish();
    });
  }
  /**
   * Consume one carrier frame.
   *
   * Every logical stream shares this socket, so a frame is routed by its
   * `streamId` first. The event stream replaces the old `server-request`
   * envelopes: a question now arrives as a `waterfall` frame carrying its own
   * `eventId`, which is also the id the phone answers with, and the opening
   * `ready` frame names the generation every answer has to quote.
   */
  consumeMuxEnvelope(data) {
    let frame;
    try {
      frame = JSON.parse(data);
    } catch {
      return;
    }
    if (!isRecord(frame) || frame.type !== "item") return;
    const value = frame.value;
    if (frame.streamId === WORKSPACE_STREAM_ID) {
      if (isRecord(value) && value.type === "baseline") this.workspaceSnapshot = value.value;
      return;
    }
    if (frame.streamId !== EVENT_STREAM_ID || !isRecord(value)) return;
    if (value.type === "ready" && typeof value.clientId === "string") {
      this.eventClientId = value.clientId;
      return;
    }
    if (value.type === "waterfall" && value.event === USER_QUESTION_EVENT) {
      const eventId = typeof value.eventId === "string" ? value.eventId : void 0;
      const request = isRecord(value.request) ? value.request : void 0;
      const agentId = typeof value.agentId === "string" ? value.agentId : void 0;
      if (!eventId || !request || !agentId) return;
      const pending = parsePendingQuestion(eventId, { ...request, sessionId: agentId });
      if (pending) this.pendingQuestions.set(eventId, pending);
      return;
    }
    if (value.type === "cancel" && typeof value.eventId === "string") {
      this.pendingQuestions.delete(value.eventId);
    }
  }
  assertPendingQuestion(rpcId, sessionId) {
    const pending = this.pendingQuestions.get(rpcId);
    if (!pending || pending.sessionId !== sessionId) {
      throw new Error("This question request is no longer pending.");
    }
    return pending;
  }
  /**
   * Settle one forwarded question.
   *
   * `/api/respond` went with the ApiProxy. A forwarded event is now settled
   * through the Gateway's own unary endpoint, which pairs the event with the
   * client generation that received it — so an answer sent after a reconnect
   * is refused rather than applied to a stale question.
   */
  async respondToQuestion(eventId, outcome) {
    const clientId = this.eventClientId;
    if (clientId === void 0) return { ok: false, error: "Harness event stream is not connected." };
    const settled = await this.invokeHarness(REMOTE_EVENT_RESULT_ENDPOINT, {
      clientId,
      eventId,
      outcome
    });
    if (settled.ok) this.pendingQuestions.delete(eventId);
    return settled;
  }
  html(response, body) {
    if (response.destroyed) return;
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(body);
  }
  redirect(response, location) {
    response.statusCode = 302;
    response.setHeader("location", location);
    response.end();
  }
  text(response, status2, body) {
    if (response.destroyed) return;
    response.statusCode = status2;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(body);
  }
  json(response, status2, body) {
    if (response.destroyed) return;
    if (response.headersSent) {
      response.end();
      return;
    }
    response.statusCode = status2;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
  }
}
function cookiePair(headers) {
  for (const header of headers) {
    const pair = header.split(";", 1)[0]?.trim();
    if (pair !== void 0 && pair.includes("=")) return pair;
  }
  return void 0;
}
function preferredLanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && isPrivateAddress(entry.address)) return entry.address;
    }
  }
  return void 0;
}
function normalizeRemoteAddress(address) {
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}
function isLoopbackAddress(address) {
  return address === "::1" || address === "127.0.0.1";
}
function isPrivateAddress(address) {
  if (isLoopbackAddress(address)) return true;
  if (/^10\./.test(address) || /^192\.168\./.test(address)) return true;
  const match = /^172\.(\d+)\./.exec(address);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return /^f[cd][0-9a-f]{2}:/i.test(address) || /^fe8[0-9a-f]:/i.test(address);
}
async function readBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function firstHeaderValue(value) {
  const first = Array.isArray(value) ? value[0] : value?.split(",", 1)[0];
  const normalized = first?.trim();
  return normalized || void 0;
}
function isInternetTunnelHost(host) {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return normalized.endsWith(".trycloudflare.com") && normalized !== "api.trycloudflare.com" || normalized.endsWith(".pinggy.link") || normalized.endsWith(".pinggy-free.link") || normalized.endsWith(".pinggy.online");
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requiredStringField(value, field) {
  if (!isRecord(value) || typeof value[field] !== "string" || !value[field]) {
    throw new Error(`Invalid ${field}.`);
  }
  return value[field];
}
function parsePendingQuestion(rpcId, payload) {
  if (typeof payload.sessionId !== "string" || !Array.isArray(payload.questions)) return void 0;
  const questions = [];
  for (const item of payload.questions.slice(0, 20)) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.question !== "string") continue;
    const question = { id: item.id, question: item.question };
    if (typeof item.detail === "string") question.detail = item.detail;
    if (typeof item.header === "string") question.header = item.header;
    if (typeof item.multiSelect === "boolean") question.multiSelect = item.multiSelect;
    if (typeof item.intent === "string") question.intent = item.intent;
    if (Array.isArray(item.options)) {
      question.options = item.options.slice(0, 50).flatMap((option) => {
        if (!isRecord(option) || typeof option.label !== "string") return [];
        return [{
          label: option.label,
          ...typeof option.description === "string" ? { description: option.description } : {}
        }];
      });
    }
    questions.push(question);
  }
  if (!questions.length) return void 0;
  return { rpcId, sessionId: payload.sessionId, questions };
}
function parseQuestionResponse(value) {
  const rpcId = requiredStringField(value, "rpcId");
  const sessionId = requiredStringField(value, "sessionId");
  if (!isRecord(value) || !Array.isArray(value.answers) || value.answers.length > 20) {
    throw new Error("Invalid question answers.");
  }
  const answers = value.answers.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !Array.isArray(item.selected)) {
      throw new Error("Invalid question answer.");
    }
    const selected = item.selected.map((label) => {
      if (typeof label !== "string") throw new Error("Invalid selected option.");
      return label;
    });
    if (selected.length > 50) throw new Error("Too many selected options.");
    return {
      id: item.id,
      selected,
      ...typeof item.custom === "string" && item.custom.trim() ? { custom: item.custom } : {}
    };
  });
  return { rpcId, sessionId, answers };
}
function validateQuestionAnswers(pending, answers) {
  if (answers.length !== pending.questions.length) throw new Error("Every question needs an answer or skip.");
  const answerById = new Map(answers.map((answer) => [answer.id, answer]));
  if (answerById.size !== answers.length) throw new Error("Duplicate question answer.");
  for (const question of pending.questions) {
    const answer = answerById.get(question.id);
    if (!answer) throw new Error("Every question needs an answer or skip.");
    const allowed = new Set((question.options ?? []).map((option) => option.label));
    if (answer.selected.some((label) => !allowed.has(label))) {
      throw new Error("Answer contains an unknown option.");
    }
    if (!question.multiSelect && answer.selected.length > 1) {
      throw new Error("Only one option can be selected.");
    }
  }
}
function waitFor(milliseconds, signal) {
  return new Promise((resolve2) => {
    if (signal.aborted) return resolve2();
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve2();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
const PLUGIN_RECOVERY_EVIDENCE_TIMEOUT_MS = 1500;
const PLUGIN_RECOVERY_EVIDENCE_POLL_MS = 100;
function mergeLogs(...groups) {
  return [...new Set(groups.flat())];
}
async function detectPluginRecovery(options) {
  if (options.startupFailures?.length) {
    const owners = options.startupFailures.flatMap(
      (failure) => failure.owner ? [failure.owner.packageName] : []
    );
    return {
      logs: mergeLogs(options.initialLogs, options.readLatestLogs?.() ?? []),
      plugins: await resolveStartupFailureOwners(options.dshHome, owners, options.excludedPlugins)
    };
  }
  const timeoutMs = Math.max(0, options.timeoutMs ?? 0);
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? PLUGIN_RECOVERY_EVIDENCE_POLL_MS);
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((milliseconds) => setTimeout$1(milliseconds));
  const deadline = now() + timeoutMs;
  while (true) {
    const logs = mergeLogs(options.initialLogs, options.readLatestLogs?.() ?? []);
    const plugins = await resolveProfileRecoveryPlugins(
      options.dshHome,
      extractPluginFailureReferences(logs),
      extractDuplicateLoaderEntryId(logs),
      extractSlotConflictName(logs),
      options.excludedPlugins,
      options.slotProviderNodeModulesPaths
    );
    if (plugins.length > 0 || now() >= deadline) {
      return { logs, plugins };
    }
    await wait(Math.min(pollIntervalMs, Math.max(1, deadline - now())));
  }
}
function isDaemonLaunch(environment, platform2) {
  if (platform2 !== "darwin") return false;
  const serviceName = environment.XPC_SERVICE_NAME;
  if (serviceName === void 0 || serviceName === "" || serviceName === "0") return false;
  return !serviceName.startsWith("application.");
}
const scriptArgumentPattern = /\.[mc]?js$/i;
function isUserInitiatedInstance(argv) {
  if (argv.length === 0) return true;
  const [binary2, ...rest] = argv;
  if (binary2.includes("/Contents/Frameworks/")) return false;
  const firstArgument = rest[0];
  if (firstArgument === void 0) return true;
  return !scriptArgumentPattern.test(firstArgument);
}
const levels = ["default", "sandbox-disabled", "gpu-disabled"];
const defaultGpuFallbackState = {
  level: "default",
  failures: 0,
  stableLaunches: 0
};
const GPU_FALLBACK_FAILURE_THRESHOLD = 3;
const GPU_FALLBACK_PROBE_LAUNCHES = 20;
const survivableReasons = /* @__PURE__ */ new Set(["clean-exit", "killed"]);
const windowsRendererFallbackCodes = /* @__PURE__ */ new Set([
  3221225477,
  // STATUS_ACCESS_VIOLATION
  2147483651
  // STATUS_BREAKPOINT
]);
function isGpuLossFatal(reason) {
  return !survivableReasons.has(reason);
}
function isRendererGpuFallbackCandidate(options) {
  if (options.platform !== "win32" || options.reason !== "crashed") return false;
  return windowsRendererFallbackCodes.has(options.exitCode >>> 0);
}
function gpuFallbackSwitches(level) {
  switch (level) {
    case "default":
      return [];
    case "sandbox-disabled":
      return ["disable-gpu-sandbox"];
    case "gpu-disabled":
      return ["disable-gpu-sandbox", "disable-gpu", "disable-gpu-compositing"];
  }
}
function planGpuFallbackResponse(options) {
  const { state, harnessRendered: harnessRendered2 } = options;
  const failures = state.failures + 1;
  const next = levels[levels.indexOf(state.level) + 1];
  if (next === void 0) {
    return { state: { ...state, failures, stableLaunches: 0 }, relaunch: false };
  }
  if (!harnessRendered2) {
    return { state: { level: next, failures: 0, stableLaunches: 0 }, relaunch: true };
  }
  if (failures < GPU_FALLBACK_FAILURE_THRESHOLD) {
    return { state: { ...state, failures, stableLaunches: 0 }, relaunch: false };
  }
  return { state: { level: next, failures: 0, stableLaunches: 0 }, relaunch: false };
}
function planStableLaunch(state) {
  if (state.level === "default") return defaultGpuFallbackState;
  const stableLaunches = state.stableLaunches + 1;
  if (stableLaunches < GPU_FALLBACK_PROBE_LAUNCHES) {
    return { level: state.level, failures: 0, stableLaunches };
  }
  const previous = levels[levels.indexOf(state.level) - 1];
  return { level: previous ?? state.level, failures: 0, stableLaunches: 0 };
}
function gpuFallbackStateEquals(a, b) {
  return a.level === b.level && a.failures === b.failures && a.stableLaunches === b.stableLaunches;
}
function serializeGpuFallbackState(state) {
  return JSON.stringify(state);
}
function readCount(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
function parseGpuFallbackState(raw) {
  try {
    const parsed = JSON.parse(raw);
    const level = parsed.level;
    if (!levels.includes(level)) return defaultGpuFallbackState;
    return {
      level,
      failures: readCount(parsed.failures),
      stableLaunches: readCount(parsed.stableLaunches)
    };
  } catch {
    return defaultGpuFallbackState;
  }
}
function isHarnessUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}
function isTrustedAppUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "file:" || parsed.protocol === "dsh-recovery:") return true;
  } catch {
    return false;
  }
  return isHarnessUrl(rawUrl);
}
function canGrantWindowPermission(permission, requestingUrl, isMainFrame) {
  return permission === "clipboard-sanitized-write" && isMainFrame && requestingUrl !== void 0 && isHarnessUrl(requestingUrl);
}
function secureWindow(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedAppUrl(url)) return { action: "allow" };
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isTrustedAppUrl(url)) return;
    event.preventDefault();
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.session.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) => canGrantWindowPermission(
      permission,
      details.requestingUrl ?? requestingOrigin,
      details.isMainFrame
    )
  );
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      callback(
        canGrantWindowPermission(permission, details.requestingUrl, details.isMainFrame)
      );
    }
  );
}
class SafeModeOverlay {
  constructor(parent, preload, onClose) {
    this.parent = parent;
    this.onClose = onClose;
    this.view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload,
        sandbox: true,
        webSecurity: true
      }
    });
    this.webContents = this.view.webContents;
    this.view.setBackgroundColor("#00000000");
    this.view.setVisible(false);
    secureWindow(this.view);
    parent.contentView.addChildView(this.view);
    parent.on("resize", this.syncBounds);
    parent.on("enter-full-screen", this.syncBounds);
    parent.on("leave-full-screen", this.syncBounds);
    parent.once("closed", this.close);
    parent.webContents.on("focus", this.focus);
    this.syncBounds();
  }
  parent;
  onClose;
  view;
  webContents;
  closed = false;
  isDestroyed() {
    return this.closed || this.webContents.isDestroyed();
  }
  syncBounds = () => {
    if (this.parent.isDestroyed() || this.isDestroyed()) return;
    const { width, height } = this.parent.getContentBounds();
    this.view.setBounds({ x: 0, y: 0, width, height });
  };
  focus = () => {
    if (!this.isDestroyed() && this.view.getVisible()) this.webContents.focus();
  };
  show() {
    this.syncBounds();
    this.view.setVisible(true);
    this.focus();
  }
  close = () => {
    if (this.closed) return;
    this.closed = true;
    this.parent.removeListener("resize", this.syncBounds);
    this.parent.removeListener("enter-full-screen", this.syncBounds);
    this.parent.removeListener("leave-full-screen", this.syncBounds);
    this.parent.removeListener("closed", this.close);
    if (!this.parent.isDestroyed()) {
      this.parent.webContents.removeListener("focus", this.focus);
      this.parent.contentView.removeChildView(this.view);
    }
    if (!this.webContents.isDestroyed()) this.webContents.close();
    if (!this.parent.isDestroyed() && this.parent.isFocused()) this.parent.webContents.focus();
    this.onClose();
  };
}
function launchRootPath(userDataPath) {
  return join(userDataPath, "launch-root");
}
async function ensureLaunchRoot(userDataPath) {
  const launchRoot = launchRootPath(userDataPath);
  await mkdir(launchRoot, { recursive: true });
  return launchRoot;
}
async function prepareGenerationsForLaunch(dshHome, note) {
  const { removed, failed } = await sweepRegistry(dshHome);
  if (removed.length > 0) {
    note(`[desktop] swept ${removed.length} unreferenced plugin generation(s)`);
  }
  if (failed.length > 0) {
    note(`[desktop] ${failed.length} generation(s) could not be removed yet, will retry`);
  }
  const profileDir2 = resolveProfileDir("web", dshHome);
  if (!existsSync(join(profileDir2, "package.json"))) {
    const template = PROFILE_TEMPLATES.web;
    if (template === void 0) throw new Error("Harness does not define the web profile template");
    initProfile(profileDir2, template.bundles, template.patchReload);
  }
  try {
    const projection = await projectGenerations(dshHome);
    if (projection.linked.length > 0 || projection.unlinked.length > 0) {
      note(
        `[desktop] projected generations: ${projection.linked.length} linked, ${projection.unlinked.length} unlinked`
      );
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    note(`[desktop] generation projection failed: ${detail}`);
    throw new Error(`generation projection failed: ${detail}`);
  }
}
async function isProjectedGenerationPlugin(dshHome, pluginName) {
  return isGenerationPlugin(dshHome, pluginName).catch(() => false);
}
async function uninstallGenerationPlugin(dshHome, pluginName, note) {
  if (!await isGenerationPlugin(dshHome, pluginName).catch(() => false)) return false;
  try {
    const removed = await disableGeneration(dshHome, pluginName);
    await projectGenerations(dshHome);
    const stillEnabled = (await resolveEnabledGenerations(dshHome)).has(pluginName);
    if (stillEnabled) {
      note(`[desktop] failed to disable the ${pluginName} generation`);
      return false;
    }
    note(
      removed ? `[desktop] disabled the ${pluginName} generation; it will be swept on a later cold start` : `[desktop] ${pluginName} was already not an enabled generation`
    );
    return true;
  } catch (error) {
    note(
      `[desktop] failed to disable the ${pluginName} generation: ${error instanceof Error ? error.message : error}`
    );
    return false;
  }
}
const MARKER = ".generations-migrated";
const DEFER_MARKER = ".generations-deferred.json";
const SNAPSHOT_SUFFIX = ".pre-generations";
const SNAPSHOT_STATE = ".generations-pre-migration.json";
const MIGRATION_PROTOCOL_VERSION = 6;
const SNAPSHOT_PROTOCOL_VERSION = 1;
const DEFER_RETRY_MS = 6 * 60 * 60 * 1e3;
const PROFILE_PATHS = [
  "node_modules",
  "package.json",
  "pnpm-lock.yaml",
  ".install-complete"
];
const KEEP_IN_SHARED_TREE$1 = /* @__PURE__ */ new Set([
  "dshmarket",
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app"
]);
function profileDir(dshHome) {
  return join(dshHome, "profiles", "web");
}
function isProfileMigrated(dshHome) {
  return existsSync(join(profileDir(dshHome), MARKER));
}
async function profileManifest(dshHome) {
  return JSON.parse(await readFile(join(profileDir(dshHome), "package.json"), "utf8"));
}
async function communityPlugins(dshHome) {
  const manifest = await profileManifest(dshHome);
  const names = /* @__PURE__ */ new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...manifest.dsh?.profile?.bundles ?? []
  ]);
  return [...names].filter((name) => !KEEP_IN_SHARED_TREE$1.has(name));
}
function usesExternalSource$1(spec) {
  return spec.includes(":") || spec.includes("/") || spec.startsWith(".");
}
async function migrationInputFingerprint(dshHome, plugins = []) {
  const root = profileDir(dshHome);
  const readInput = async (path) => readFile(path, "utf8").catch(
    (error) => `<unreadable:${error.code ?? error.message}>`
  );
  const inputs = await Promise.all([
    readInput(join(root, "package.json")),
    ...plugins.map((name) => readInput(join(root, "node_modules", name, "package.json")))
  ]);
  return createHash("sha256").update(JSON.stringify({
    protocol: MIGRATION_PROTOCOL_VERSION,
    plugins,
    inputs
  })).digest("hex");
}
async function migrationPlan(dshHome, plugins) {
  const root = profileDir(dshHome);
  const manifest = await profileManifest(dshHome);
  const planned = [];
  for (const name of plugins) {
    const packageDir = join(root, "node_modules", name);
    let installedManifest;
    try {
      installedManifest = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
    } catch {
      throw new Error(`${name} has no readable installed package manifest`);
    }
    const rawVersion = installedManifest.version;
    const version = typeof rawVersion === "string" && rawVersion.trim() !== "" ? rawVersion.trim() : "0.0.0";
    const declared = manifest.dependencies?.[name];
    const sourceSpec = typeof declared === "string" ? declared : `${name}@${version}`;
    planned.push({
      name,
      pluginSpec: usesExternalSource$1(sourceSpec) ? sourceSpec : `${name}@${version}`,
      sourceSpec,
      ...usesExternalSource$1(sourceSpec) ? { sourceDirectory: packageDir } : {},
      installedManifest
    });
  }
  const fingerprint = await migrationInputFingerprint(dshHome, plugins);
  return { fingerprint, plugins: planned };
}
async function readDeferredFingerprint(dshHome) {
  try {
    const value = JSON.parse(await readFile(join(profileDir(dshHome), DEFER_MARKER), "utf8"));
    const retryAfter = typeof value.retryAfter === "string" ? Date.parse(value.retryAfter) : Number.NaN;
    return value.protocol === MIGRATION_PROTOCOL_VERSION && typeof value.fingerprint === "string" && Number.isFinite(retryAfter) && retryAfter > Date.now() ? value.fingerprint : void 0;
  } catch {
    return void 0;
  }
}
async function writeDeferred(dshHome, fingerprint, reason) {
  const path = join(profileDir(dshHome), DEFER_MARKER);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(profileDir(dshHome), { recursive: true });
  await writeFile(temporary, `${JSON.stringify({
    protocol: MIGRATION_PROTOCOL_VERSION,
    fingerprint,
    reason,
    failedAt: (/* @__PURE__ */ new Date()).toISOString(),
    retryAfter: new Date(Date.now() + DEFER_RETRY_MS).toISOString()
  }, void 0, 2)}
`, "utf8");
  await rename(temporary, path);
}
function snapshotStatePath(dshHome) {
  return join(profileDir(dshHome), SNAPSHOT_STATE);
}
function snapshotPath(dshHome, name) {
  return `${join(profileDir(dshHome), name)}${SNAPSHOT_SUFFIX}`;
}
async function writeSnapshotState(dshHome, state) {
  const path = snapshotStatePath(dshHome);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, void 0, 2)}
`, "utf8");
  await rename(temporary, path);
}
async function writeSnapshotStateGuarded(dshHome, state, guard) {
  const path = snapshotStatePath(dshHome);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  let committed = false;
  try {
    await writeFile(temporary, `${JSON.stringify(state, void 0, 2)}
`, "utf8");
    if (!guard()) return false;
    await rename(temporary, path);
    committed = true;
    return true;
  } finally {
    if (!committed) await rm(temporary, { force: true }).catch(() => void 0);
  }
}
function isProfilePathName(value) {
  return typeof value === "string" && PROFILE_PATHS.includes(value);
}
function isExpectedQuarantinePath(dshHome, name, value) {
  const base = resolve(`${join(profileDir(dshHome), name)}.failed-generations`);
  const candidate = resolve(value);
  return candidate === base || candidate.startsWith(`${base}.`) && /^\d+$/u.test(candidate.slice(base.length + 1));
}
async function readSnapshotState(dshHome) {
  try {
    const parsed = JSON.parse(await readFile(snapshotStatePath(dshHome), "utf8"));
    if (parsed.protocol !== SNAPSHOT_PROTOCOL_VERSION || !Array.isArray(parsed.desired) || !parsed.desired.every((entry) => typeof entry === "string") || typeof parsed.fingerprint !== "string" || !["snapshotting", "awaiting-boot", "rolling-back", "rollback-cleanup", "confirmed"].includes(
      parsed.phase ?? ""
    ) || !Array.isArray(parsed.paths)) {
      return void 0;
    }
    const paths = parsed.paths.filter(
      (entry) => typeof entry === "object" && entry !== null && isProfilePathName(entry.name) && typeof entry.originallyPresent === "boolean" && typeof entry.restored === "boolean" && (entry.restoreStarted === void 0 || typeof entry.restoreStarted === "boolean") && (entry.quarantinePath === void 0 || typeof entry.quarantinePath === "string" && isExpectedQuarantinePath(
        dshHome,
        entry.name,
        entry.quarantinePath
      ))
    );
    const pathNames = new Set(paths.map((entry) => entry.name));
    if (paths.length !== PROFILE_PATHS.length || pathNames.size !== PROFILE_PATHS.length || !PROFILE_PATHS.every((name) => pathNames.has(name))) {
      return void 0;
    }
    return {
      protocol: SNAPSHOT_PROTOCOL_VERSION,
      phase: parsed.phase,
      desired: parsed.desired,
      fingerprint: parsed.fingerprint,
      paths
    };
  } catch {
    return void 0;
  }
}
async function inspectMigrationRecoveryLock(dshHome) {
  const hasJournal = existsSync(snapshotStatePath(dshHome));
  const hasSnapshot = PROFILE_PATHS.some((name) => existsSync(snapshotPath(dshHome, name)));
  if (!hasJournal) return hasSnapshot;
  const state = await readSnapshotState(dshHome);
  return state?.phase !== "confirmed";
}
function legacySnapshotState(dshHome, desired, fingerprint) {
  for (const name of ["node_modules", "package.json"]) {
    if (!existsSync(snapshotPath(dshHome, name))) {
      throw new Error(`legacy migration journal cannot prove the original ${name} snapshot`);
    }
  }
  return {
    protocol: SNAPSHOT_PROTOCOL_VERSION,
    phase: "rolling-back",
    desired,
    fingerprint,
    paths: PROFILE_PATHS.map((name) => {
      const snapshot = snapshotPath(dshHome, name);
      if (name === ".install-complete") {
        return { name, originallyPresent: false, restored: false };
      }
      return {
        name,
        // Old journals did not record absent paths. The two mandatory profile
        // roots above must have snapshots; an absent optional lockfile is safer
        // to regenerate than to mistake a migration-created lock for old data.
        originallyPresent: existsSync(snapshot),
        restored: false
      };
    })
  };
}
async function readSnapshotStateForRecovery(dshHome) {
  const current = await readSnapshotState(dshHome);
  if (current !== void 0) return current;
  const hasLegacySnapshot = PROFILE_PATHS.some((name) => existsSync(snapshotPath(dshHome, name)));
  const hasLegacyState = existsSync(snapshotStatePath(dshHome));
  if (!hasLegacySnapshot && !hasLegacyState) return void 0;
  if (!hasLegacyState) {
    throw new Error("migration snapshots exist without the journal that identifies their original state");
  }
  let desired = [];
  let fingerprint = "";
  let parsed;
  try {
    parsed = JSON.parse(await readFile(snapshotStatePath(dshHome), "utf8"));
  } catch (error) {
    throw new Error(
      `snapshot journal is unreadable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (parsed?.protocol !== void 0) {
    throw new Error(`unsupported or corrupt snapshot journal protocol ${String(parsed.protocol)}`);
  }
  if (!Array.isArray(parsed?.desired) || !parsed.desired.every((entry) => typeof entry === "string") || typeof parsed?.fingerprint !== "string") {
    throw new Error("legacy snapshot journal is missing desired or fingerprint evidence");
  }
  desired = parsed.desired;
  fingerprint = parsed.fingerprint;
  const state = legacySnapshotState(dshHome, desired, fingerprint);
  await writeSnapshotState(dshHome, state);
  return state;
}
async function snapshotProfile(dshHome, note, desired, fingerprint) {
  const dir = profileDir(dshHome);
  if (existsSync(snapshotStatePath(dshHome)) || PROFILE_PATHS.some((name) => existsSync(snapshotPath(dshHome, name)))) {
    throw new Error("a previous migration snapshot still requires recovery");
  }
  const state = {
    protocol: SNAPSHOT_PROTOCOL_VERSION,
    phase: "snapshotting",
    desired: [...desired],
    fingerprint,
    paths: PROFILE_PATHS.map((name) => ({
      name,
      originallyPresent: existsSync(join(dir, name)),
      restored: false
    }))
  };
  await writeSnapshotState(dshHome, state);
  let moved = 0;
  for (const entry of state.paths) {
    if (!entry.originallyPresent) continue;
    const live = join(dir, entry.name);
    const snapshot = snapshotPath(dshHome, entry.name);
    await rename(live, snapshot);
    moved += 1;
  }
  state.phase = "awaiting-boot";
  await writeSnapshotState(dshHome, state);
  note(`[desktop] migration: snapshotted ${moved} profile path(s)`);
}
async function discardConfirmedSnapshot(dshHome, note) {
  const state = await readSnapshotState(dshHome);
  if (state?.phase !== "confirmed") return false;
  const failures = [];
  for (const entry of state.paths) {
    for (const path of [snapshotPath(dshHome, entry.name), entry.quarantinePath]) {
      if (!path || !existsSync(path)) continue;
      try {
        await rm(path, { recursive: true, force: true });
      } catch (error) {
        failures.push(
          `discard ${entry.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
  if (failures.length > 0) {
    note(`[desktop] migration: confirmed snapshot cleanup deferred: ${failures.join("; ")}`);
    return false;
  }
  await rm(snapshotStatePath(dshHome), { force: true });
  await rm(join(profileDir(dshHome), DEFER_MARKER), { force: true });
  note("[desktop] migration: pre-upgrade snapshot discarded after a verified launch");
  return true;
}
async function validateGeneration(plugin, generation) {
  const packageDir = join(generation.directory, "node_modules", plugin.name);
  const manifest = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
  if (manifest.name !== plugin.installedManifest.name || manifest.version !== plugin.installedManifest.version) {
    throw new Error(`${plugin.name} generation does not match the installed package`);
  }
  const patch = manifest.dsh?.bundle?.patch;
  if (typeof patch !== "string" || !existsSync(join(packageDir, patch))) {
    throw new Error(`${plugin.name} generation has no readable bundle patch`);
  }
}
async function rewriteManifest(dshHome) {
  const dir = profileDir(dshHome);
  const snapshot = JSON.parse(await readFile(join(dir, `package.json${SNAPSHOT_SUFFIX}`), "utf8"));
  const keptDeps = {};
  for (const [name, spec] of Object.entries(snapshot.dependencies ?? {})) {
    if (KEEP_IN_SHARED_TREE$1.has(name)) keptDeps[name] = spec;
  }
  if (keptDeps.dshmarket === void 0) keptDeps.dshmarket = "^1.45.1";
  const keptBundles = (snapshot.dsh?.profile?.bundles ?? []).filter(
    (name) => KEEP_IN_SHARED_TREE$1.has(name)
  );
  const next = {
    ...snapshot,
    dependencies: keptDeps,
    dsh: {
      ...snapshot.dsh,
      profile: {
        ...snapshot.dsh?.profile ?? {},
        bundles: keptBundles
      }
    }
  };
  await writeFile(join(dir, "package.json"), `${JSON.stringify(next, void 0, 2)}
`, "utf8");
  await mkdir(join(dir, "node_modules"), { recursive: true });
}
function noop() {
  return { outcome: "no-op" };
}
function deferred(reason, profileState = "legacy-intact") {
  return { outcome: "deferred-failure", reason, profileState };
}
function migrated() {
  return { outcome: "migrated" };
}
async function migrateProfileToGenerations(deps) {
  const { dshHome, note } = deps;
  const recovery = await recoverInterruptedMigration(dshHome, note);
  if (recovery.outcome === "recovery-required") {
    return deferred(recovery.reason, "recovery-required");
  }
  if (isProfileMigrated(dshHome)) return noop();
  if (!existsSync(join(profileDir(dshHome), "package.json"))) {
    await writeFile(join(profileDir(dshHome), MARKER), `${(/* @__PURE__ */ new Date()).toISOString()}
`, "utf8").catch(
      () => void 0
    );
    return noop();
  }
  let plugins;
  try {
    plugins = await communityPlugins(dshHome);
  } catch (error) {
    const reason = `profile manifest is unreadable: ${error instanceof Error ? error.message : error}`;
    const fingerprint = await migrationInputFingerprint(dshHome);
    if (await readDeferredFingerprint(dshHome) === fingerprint) {
      note("[desktop] migration deferred: this exact unreadable profile already failed preflight");
      return deferred(reason);
    }
    note(`[desktop] migration deferred before planning: ${reason}`);
    await writeDeferred(dshHome, fingerprint, reason).catch(() => void 0);
    return deferred(reason);
  }
  if (plugins.length === 0) {
    note("[desktop] migration: no community plugins to move");
    await writeFile(
      join(profileDir(dshHome), MARKER),
      `${(/* @__PURE__ */ new Date()).toISOString()}
`,
      "utf8"
    );
    return noop();
  }
  let plan;
  try {
    plan = await migrationPlan(dshHome, plugins);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const fingerprint = await migrationInputFingerprint(dshHome, plugins);
    if (await readDeferredFingerprint(dshHome) === fingerprint) {
      note("[desktop] migration deferred: this exact profile already failed preflight");
      return deferred(reason);
    }
    note(`[desktop] migration deferred before staging: ${reason}`);
    await writeDeferred(dshHome, fingerprint, reason).catch(() => void 0);
    return deferred(reason);
  }
  if (await readDeferredFingerprint(dshHome) === plan.fingerprint) {
    note("[desktop] migration deferred: this exact profile already failed preflight");
    return deferred("previously failed preflight for this exact fingerprint");
  }
  note(`[desktop] migration: moving ${plugins.length} plugin(s) to generations: ${plugins.join(", ")}`);
  let previousDesired;
  try {
    previousDesired = await readDesired(dshHome);
  } catch (error) {
    const reason = `generation pointer is unreadable before migration: ${error instanceof Error ? error.message : String(error)}`;
    note(`[desktop] migration deferred before staging: ${reason}`);
    await writeDeferred(dshHome, plan.fingerprint, reason).catch(() => void 0);
    return deferred(reason);
  }
  try {
    const generationIds = [];
    for (const plugin of plan.plugins) {
      const result = await installGeneration({
        dshHome,
        pluginSpec: plugin.pluginSpec,
        expectedPluginName: plugin.name,
        sourceSpec: plugin.sourceSpec,
        sourceDirectory: plugin.sourceDirectory,
        nodeExecutablePath: deps.nodeExecutablePath,
        pnpmEntryPath: deps.pnpmEntryPath,
        // Registry-sourced plugins are re-fetched here; keep them on the
        // registry the market reads rather than on ~/.npmrc's (#337).
        registry: await resolveMarketRegistry({ profileDir: profileDir(dshHome) }),
        onTrace: (line) => note(`[desktop] ${line}`)
      });
      if (!result.ok || result.generation === void 0) {
        throw new Error(`could not stage ${plugin.name}: ${result.detail ?? "unknown"}`);
      }
      await validateGeneration(plugin, result.generation);
      const peers = await verifyGenerationPeers(dshHome, result.generation);
      if (!peers.ok) throw new Error(`${plugin.name} failed peer validation: ${peers.problems.join("; ")}`);
      generationIds.push(result.generation.id);
      note(`[desktop] migration: ${plugin.name} -> ${result.generation.id}`);
    }
    await snapshotProfile(dshHome, note, previousDesired, plan.fingerprint);
    await rewriteManifest(dshHome);
    const existingDesired = await readDesired(dshHome);
    await writeDesired(dshHome, [.../* @__PURE__ */ new Set([...existingDesired, ...generationIds])]);
    await projectGenerations(dshHome);
    const rebuild = await deps.reinstallSharedTree();
    if (!rebuild.ok) throw new Error(`shared-tree rebuild failed: ${rebuild.detail ?? "unknown"}`);
    await writeFile(
      join(profileDir(dshHome), MARKER),
      `${(/* @__PURE__ */ new Date()).toISOString()}
`,
      "utf8"
    );
    await rm(join(profileDir(dshHome), DEFER_MARKER), { force: true }).catch(() => void 0);
    note(`[desktop] migration: complete, ${generationIds.length} generation(s) enabled`);
    return migrated();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    note(
      `[desktop] migration failed, restoring the pre-upgrade profile: ` + reason
    );
    let snapshot;
    try {
      snapshot = await readSnapshotStateForRecovery(dshHome);
    } catch (snapshotError) {
      const combined = `${reason}; migration recovery journal could not be loaded: ${snapshotError instanceof Error ? snapshotError.message : String(snapshotError)}`;
      note(`[desktop] migration recovery required: ${combined}`);
      return deferred(combined, "recovery-required");
    }
    if (snapshot !== void 0) {
      const rollback = await rollBackMigration(dshHome, note, reason);
      if (rollback.outcome === "recovery-required") {
        const combined = `${reason}; ${rollback.reason}`;
        await writeDeferred(dshHome, plan.fingerprint, combined).catch(() => void 0);
        return deferred(combined, "recovery-required");
      }
    }
    await writeDeferred(dshHome, plan.fingerprint, reason).catch(() => void 0);
    return deferred(reason);
  }
}
async function recoverInterruptedMigration(dshHome, note) {
  let state;
  try {
    state = await readSnapshotStateForRecovery(dshHome);
  } catch (error) {
    const reason = `migration recovery journal is unreadable: ${error instanceof Error ? error.message : String(error)}`;
    note(`[desktop] ${reason}`);
    return { outcome: "recovery-required", reason };
  }
  if (state === void 0) return { outcome: "no-snapshot" };
  if (state.phase === "confirmed") {
    await discardConfirmedSnapshot(dshHome, note).catch((error) => {
      note(
        `[desktop] migration: confirmed snapshot cleanup deferred: ${error instanceof Error ? error.message : String(error)}`
      );
    });
    return { outcome: "no-snapshot" };
  }
  return rollBackMigration(
    dshHome,
    note,
    "an interrupted migration was found before normal profile maintenance"
  );
}
async function confirmMigration(dshHome, note, healthy = () => true) {
  if (!healthy()) return false;
  const state = await readSnapshotState(dshHome);
  if (state?.phase !== "awaiting-boot" || !isProfileMigrated(dshHome)) return false;
  state.phase = "confirmed";
  if (!await writeSnapshotStateGuarded(dshHome, state, healthy)) {
    note("[desktop] migration confirmation cancelled: normal Profile is no longer healthy");
    return false;
  }
  return discardConfirmedSnapshot(dshHome, note);
}
async function nextQuarantinePath$1(live) {
  const base = `${live}.failed-generations`;
  if (!existsSync(base)) return base;
  for (let suffix = 1; suffix < 1e4; suffix += 1) {
    const candidate = `${base}.${suffix}`;
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`could not allocate rollback quarantine for ${live}`);
}
function recoveryRequired(reason) {
  return { outcome: "recovery-required", reason };
}
async function rollBackMigration(dshHome, note, failureReason = "the migrated profile did not reach a healthy rendered window") {
  const dir = profileDir(dshHome);
  let state;
  try {
    state = await readSnapshotStateForRecovery(dshHome);
  } catch (error) {
    const reason = `migration recovery journal could not be loaded: ${error instanceof Error ? error.message : String(error)}`;
    note(`[desktop] migration rollback incomplete: ${reason}`);
    return recoveryRequired(reason);
  }
  if (state === void 0) return { outcome: "no-snapshot" };
  if (state.phase === "confirmed") return { outcome: "no-snapshot" };
  if (state.phase === "snapshotting") {
    for (const entry of state.paths) {
      const live = join(dir, entry.name);
      const snapshot = snapshotPath(dshHome, entry.name);
      if (entry.originallyPresent && !existsSync(snapshot) && existsSync(live)) {
        entry.restored = true;
      } else if (!entry.originallyPresent && !existsSync(live) && !existsSync(snapshot)) {
        entry.restored = true;
      }
    }
  }
  state.phase = state.phase === "rollback-cleanup" ? "rollback-cleanup" : "rolling-back";
  try {
    await writeSnapshotState(dshHome, state);
  } catch (error) {
    const reason = `rollback journal could not be updated: ${error instanceof Error ? error.message : String(error)}`;
    note(`[desktop] migration rollback incomplete, snapshot preserved: ${reason}`);
    return recoveryRequired(reason);
  }
  const failures = [];
  if (state.phase !== "rollback-cleanup") for (const entry of state.paths) {
    const live = join(dir, entry.name);
    const snapshot = snapshotPath(dshHome, entry.name);
    if (entry.restored) {
      if (entry.originallyPresent && !existsSync(live)) {
        failures.push(`verify ${entry.name}: restored live path is missing`);
      }
      if (!entry.originallyPresent && existsSync(live)) {
        failures.push(`verify ${entry.name}: path should be absent after rollback`);
      }
      continue;
    }
    if (entry.originallyPresent && !existsSync(snapshot)) {
      if (existsSync(live) && entry.restoreStarted === true && (entry.quarantinePath === void 0 || existsSync(entry.quarantinePath))) {
        entry.restored = true;
        try {
          await writeSnapshotState(dshHome, state);
        } catch (error) {
          failures.push(
            `journal ${entry.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        continue;
      }
      failures.push(`restore ${entry.name}: expected snapshot is missing`);
      continue;
    }
    if (existsSync(live)) {
      try {
        if (!entry.quarantinePath) {
          entry.quarantinePath = await nextQuarantinePath$1(live);
          await writeSnapshotState(dshHome, state);
        }
        if (!existsSync(entry.quarantinePath)) await rename(live, entry.quarantinePath);
      } catch (error) {
        failures.push(
          `quarantine ${entry.name}: ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
    }
    if (entry.originallyPresent) {
      try {
        if (entry.restoreStarted !== true) {
          entry.restoreStarted = true;
          await writeSnapshotState(dshHome, state);
        }
        await rename(snapshot, live);
      } catch (error) {
        failures.push(
          `restore ${entry.name}: ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
      if (existsSync(snapshot) || !existsSync(live)) {
        failures.push(`verify ${entry.name}: snapshot/live state does not match a completed restore`);
        continue;
      }
    } else if (existsSync(live)) {
      failures.push(`verify ${entry.name}: migration-created path is still active`);
      continue;
    }
    entry.restored = true;
    try {
      await writeSnapshotState(dshHome, state);
    } catch (error) {
      failures.push(
        `journal ${entry.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (failures.length === 0 && state.paths.some((entry) => !entry.restored)) {
    failures.push("rollback journal still contains incomplete paths");
  }
  if (failures.length === 0) {
    try {
      await writeDesired(dshHome, state.desired);
      if ((await readDesired(dshHome)).join("\0") !== [...state.desired].sort().join("\0")) {
        throw new Error("desired generation pointer did not match the pre-migration value");
      }
      await rm(join(dir, MARKER), { force: true });
      if (existsSync(join(dir, MARKER))) throw new Error("migration marker is still present");
      if (!state.fingerprint) {
        const plugins = await communityPlugins(dshHome);
        state.fingerprint = await migrationInputFingerprint(dshHome, plugins);
      }
      await writeDeferred(dshHome, state.fingerprint, failureReason);
      state.phase = "rollback-cleanup";
      await writeSnapshotState(dshHome, state);
    } catch (error) {
      failures.push(`commit rollback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) {
    const reason = `rollback could not be verified: ${failures.join("; ")}`;
    if (state.fingerprint) {
      await writeDeferred(dshHome, state.fingerprint, reason).catch((error) => {
        failures.push(
          `record deferred recovery: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
    note(`[desktop] migration rollback incomplete, recovery material preserved: ${failures.join("; ")}`);
    return recoveryRequired(reason);
  }
  for (const entry of state.paths) {
    if (!entry.quarantinePath || !existsSync(entry.quarantinePath)) continue;
    try {
      await rm(entry.quarantinePath, { recursive: true, force: true });
      if (existsSync(entry.quarantinePath)) {
        throw new Error("quarantined path still exists after cleanup");
      }
    } catch (error) {
      failures.push(
        `cleanup quarantined ${entry.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (failures.length > 0) {
    const reason = `rollback cleanup could not be verified: ${failures.join("; ")}`;
    note(`[desktop] migration rollback cleanup deferred, journal preserved: ${failures.join("; ")}`);
    return recoveryRequired(reason);
  }
  try {
    await rm(snapshotStatePath(dshHome), { force: true });
    if (existsSync(snapshotStatePath(dshHome))) throw new Error("rollback journal is still present");
  } catch (error) {
    const reason = `rollback journal cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
    note(`[desktop] migration rollback cleanup deferred: ${reason}`);
    return recoveryRequired(reason);
  }
  note("[desktop] migration rolled back to the verified pre-upgrade profile");
  return { outcome: "restored" };
}
async function runProfileStartupMaintenance(deps) {
  const reportConsistency = async () => {
    try {
      await deps.reportProfileConsistency();
    } catch (error) {
      deps.note(
        `[desktop] profile consistency inspection failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  const recovery = await deps.recoverInterruptedMigration();
  if (recovery.outcome === "recovery-required") {
    deps.note(`[desktop] normal profile maintenance blocked: ${recovery.reason}`);
    return { outcome: "safe-recovery", reason: recovery.reason };
  }
  let incompleteRestoreId;
  try {
    incompleteRestoreId = await deps.incompletePluginRestoreId();
  } catch (error) {
    const reason = `plugin restore recovery state is unreadable: ${error instanceof Error ? error.message : String(error)}`;
    deps.note(`[desktop] normal profile maintenance blocked: ${reason}`);
    return { outcome: "safe-recovery", reason };
  }
  if (incompleteRestoreId !== void 0) {
    const reason = `plugin restore ${incompleteRestoreId} is incomplete and must be retried in Safe Mode`;
    deps.note(`[desktop] normal profile maintenance blocked: ${reason}`);
    return {
      outcome: "safe-recovery",
      reason,
      allowedRestoreId: incompleteRestoreId
    };
  }
  try {
    await deps.preparePackageStore();
  } catch (error) {
    const reason = `profile package store preparation failed: ${error instanceof Error ? error.message : String(error)}`;
    deps.note(`[desktop] normal profile maintenance blocked: ${reason}`);
    return { outcome: "safe-recovery", reason };
  }
  const establishMarketBaseline = async () => {
    try {
      await deps.demoteMarketGeneration();
      await deps.ensureMarketBaseline();
      return void 0;
    } catch (error) {
      return `market baseline could not be established: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  let deferRemovalMaintenance;
  try {
    await deps.enforcePendingPluginRemovals();
    deferRemovalMaintenance = await deps.shouldDeferProfileMaintenance();
  } catch (error) {
    const reason = `plugin removal recovery state is unreadable: ${error instanceof Error ? error.message : String(error)}`;
    deps.note(`[desktop] normal profile maintenance blocked: ${reason}`);
    return { outcome: "safe-recovery", reason };
  }
  if (deferRemovalMaintenance) {
    const marketFailure2 = await establishMarketBaseline();
    if (marketFailure2 !== void 0) {
      deps.note(`[desktop] normal profile maintenance blocked: ${marketFailure2}`);
      return { outcome: "safe-recovery", reason: marketFailure2 };
    }
    try {
      await deps.prepareGenerationsForLaunch();
      await deps.enforcePendingPluginRemovals();
    } catch (error) {
      const reason = `pending plugin removal projection failed: ${error instanceof Error ? error.message : String(error)}`;
      deps.note(`[desktop] normal profile maintenance blocked: ${reason}`);
      return { outcome: "safe-recovery", reason };
    }
    deps.note(
      "[desktop] profile package maintenance deferred while plugin removal is pending verification"
    );
    await reportConsistency();
    return {
      outcome: "normal-profile",
      migration: { outcome: "maintenance-deferred" },
      migrationRebuiltSharedTree: false
    };
  }
  const migration = await deps.migrateProfileToGenerations();
  if (migration.outcome === "deferred-failure") {
    deps.note(`[desktop] profile maintenance frozen: migration deferred (${migration.reason})`);
    if (migration.profileState === "recovery-required") {
      return { outcome: "safe-recovery", reason: migration.reason };
    }
    await reportConsistency();
    return {
      outcome: "normal-profile",
      migration,
      migrationRebuiltSharedTree: false
    };
  }
  const marketFailure = await establishMarketBaseline();
  if (marketFailure !== void 0) {
    deps.note(`[desktop] normal profile maintenance blocked: ${marketFailure}`);
    return { outcome: "safe-recovery", reason: marketFailure };
  }
  try {
    await deps.prepareGenerationsForLaunch();
    await deps.enforcePendingPluginRemovals();
  } catch (error) {
    const reason = `profile maintenance transaction failed: ${error instanceof Error ? error.message : String(error)}`;
    deps.note(`[desktop] normal profile maintenance blocked: ${reason}`);
    return { outcome: "safe-recovery", reason };
  }
  await reportConsistency();
  return {
    outcome: "normal-profile",
    migration,
    migrationRebuiltSharedTree: migration.outcome === "migrated"
  };
}
async function launchServiceIsStoppedAfterBootout(bootout, serviceTarget, domainTarget, inspect) {
  if (bootout.code === 0) return true;
  try {
    const service2 = await inspect(serviceTarget);
    if (service2.code === 0) return false;
    const domain = await inspect(domainTarget);
    return domain.code === 0;
  } catch {
    return false;
  }
}
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const LAUNCH_AGENT_LABEL_PATTERN$1 = /^[a-z0-9._-]+$/i;
const COMPONENT_COMMAND_TIMEOUT_MS = 1e4;
const OWNED_COMPONENTS_PROTOCOL = 1;
const OWNED_COMPONENTS_MANIFEST = "owned-components.json";
const LAUNCH_AGENT_BACKUP_PREFIX = "owned-components/launch-agents/";
function isLegacyPluginComponentCandidate(value) {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value;
  return typeof candidate.sourcePath === "string" && isAbsolute(candidate.sourcePath) && typeof candidate.sourceDigest === "string" && /^[0-9a-f]{64}$/u.test(candidate.sourceDigest) && typeof candidate.quarantinedAt === "string" && Number.isFinite(Date.parse(candidate.quarantinedAt)) && Array.isArray(candidate.packageOwners) && candidate.packageOwners.length > 0 && candidate.packageOwners.every(
    (owner) => typeof owner === "string" && PACKAGE_NAME_PATTERN.test(owner)
  ) && isPluginOwnedComponentBackup(candidate.component);
}
function profileDirectory(dshHome) {
  return join(dshHome, "profiles", "web");
}
async function installedPackage(profile, packageName, ownerDirectory) {
  if (!PACKAGE_NAME_PATTERN.test(packageName)) return void 0;
  const candidates = ownerDirectory === void 0 ? [join(profile, "node_modules", packageName)] : [join(ownerDirectory, "node_modules", packageName), join(profile, "node_modules", packageName)];
  for (const directory of candidates) {
    try {
      const manifest = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8")
      );
      return {
        directory: resolve(directory),
        canonicalDirectory: await realpath(directory),
        manifest
      };
    } catch {
    }
  }
  return void 0;
}
async function packageClosure(profile, roots) {
  const closure = /* @__PURE__ */ new Map();
  const pending = roots.map(
    (packageName) => ({ packageName })
  );
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (!candidate) break;
    const found = await installedPackage(profile, candidate.packageName, candidate.ownerDirectory);
    if (!found || closure.has(found.canonicalDirectory)) continue;
    closure.set(found.canonicalDirectory, found);
    for (const dependency of [
      ...Object.keys(found.manifest.dependencies ?? {}),
      ...Object.keys(found.manifest.optionalDependencies ?? {})
    ]) {
      pending.push({ packageName: dependency, ownerDirectory: found.directory });
    }
  }
  return closure;
}
async function pluginPackageDirectories(dshHome, pluginName) {
  if (!PACKAGE_NAME_PATTERN.test(pluginName)) return [];
  const profile = profileDirectory(dshHome);
  const target = await packageClosure(profile, [pluginName]);
  const directories = /* @__PURE__ */ new Set();
  for (const pkg of target.values()) {
    directories.add(pkg.directory);
    directories.add(pkg.canonicalDirectory);
  }
  return [...directories];
}
function packageOwnersFromLaunchAgent(launchAgent) {
  const values = [
    typeof launchAgent.Program === "string" ? launchAgent.Program : void 0,
    ...Array.isArray(launchAgent.ProgramArguments) ? launchAgent.ProgramArguments.filter((value) => typeof value === "string") : []
  ].filter((value) => value !== void 0);
  const owners = /* @__PURE__ */ new Set();
  for (const value of values) {
    if (!posix.isAbsolute(value) || posix.normalize(value) !== value) continue;
    const segments = value.split("/");
    const marker = segments.lastIndexOf("node_modules");
    const first = segments[marker + 1];
    if (marker < 0 || !first) continue;
    if (!first.startsWith("@")) {
      owners.add(first);
      continue;
    }
    const second = segments[marker + 2];
    if (second) owners.add(`${first}/${second}`);
  }
  return [...owners].sort();
}
async function removalBackupPackageNames(backupDirectory, pluginName) {
  const names = /* @__PURE__ */ new Set([pluginName]);
  let visited = 0;
  const visit2 = async (directory, depth) => {
    if (depth > 16 || visited > 2e4) throw new Error("removal backup package closure is too large");
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      visited += 1;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`removal backup package closure contains a link: ${path}`);
      if (entry.isDirectory()) {
        await visit2(path, depth + 1);
      } else if (entry.isFile() && entry.name === "package.json") {
        const manifest = JSON.parse(await readFile(path, "utf8"));
        if (typeof manifest.name === "string" && PACKAGE_NAME_PATTERN.test(manifest.name)) {
          names.add(manifest.name);
        }
      }
    }
  };
  await visit2(join(backupDirectory, "profile-packages"), 0);
  await visit2(join(backupDirectory, "generations"), 0);
  return names;
}
async function orphanedPluginPackageDirectories(dshHome, pluginName) {
  if (!PACKAGE_NAME_PATTERN.test(pluginName)) return [];
  const profile = profileDirectory(dshHome);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(profile, "package.json"), "utf8"));
  } catch {
    return [];
  }
  if (!Object.hasOwn(manifest.dependencies ?? {}, pluginName)) return [];
  const target = await packageClosure(profile, [pluginName]);
  const remainingRoots = Object.keys(manifest.dependencies ?? {}).filter((name) => name !== pluginName);
  const remaining = await packageClosure(profile, remainingRoots);
  const directories = /* @__PURE__ */ new Set();
  for (const [canonicalDirectory, pkg] of target) {
    if (remaining.has(canonicalDirectory)) continue;
    directories.add(pkg.directory);
    directories.add(canonicalDirectory);
  }
  return [...directories];
}
function pathInside$1(parent, child) {
  const nested = relative(parent, child);
  return nested === "" || !nested.startsWith("..") && !isAbsolute(nested);
}
function containedPathParts(boundary, target) {
  const root = resolve(boundary);
  const destination = resolve(target);
  const nested = relative(root, destination);
  if (nested.startsWith("..") || isAbsolute(nested)) {
    throw new Error(`component recovery path is outside its boundary: ${destination}`);
  }
  return nested.split(sep).filter(Boolean);
}
async function assertNoLinkedPathSegments(boundary, target, allowMissingTail) {
  const root = resolve(boundary);
  const parts = containedPathParts(root, target);
  const rootMetadata = await lstat(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error(`component recovery boundary is a symbolic link, junction, or non-directory: ${root}`);
  }
  let cursor = root;
  let targetExists = true;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = join(cursor, parts[index]);
    let metadata;
    try {
      metadata = await lstat(cursor);
    } catch (error) {
      if (allowMissingTail && error.code === "ENOENT") {
        targetExists = false;
        break;
      }
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`component recovery path contains a symbolic link or junction: ${cursor}`);
    }
    if (index < parts.length - 1 && !metadata.isDirectory()) {
      throw new Error(`component recovery path contains a non-directory parent: ${cursor}`);
    }
  }
  if (!targetExists) return;
  const [realBoundary, realTarget] = await Promise.all([realpath(root), realpath(resolve(target))]);
  if (!pathInside$1(realBoundary, realTarget)) {
    throw new Error(`component recovery path resolves outside its boundary: ${target}`);
  }
}
async function ensureDirectoryWithoutLinks(boundary, directory) {
  const root = resolve(boundary);
  const parts = containedPathParts(root, directory);
  const rootMetadata = await lstat(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error(`component recovery boundary is a symbolic link, junction, or non-directory: ${root}`);
  }
  let cursor = root;
  for (const part of parts) {
    cursor = join(cursor, part);
    let metadata;
    try {
      metadata = await lstat(cursor);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      try {
        await mkdir(cursor);
      } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST") throw mkdirError;
      }
      metadata = await lstat(cursor);
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`component recovery directory contains a symbolic link, junction, or file: ${cursor}`);
    }
  }
  await assertNoLinkedPathSegments(root, resolve(directory), false);
}
async function validatePluginOwnedComponentBackupPath(backupDirectory, target, allowMissingTail = false) {
  await assertNoLinkedPathSegments(resolve(backupDirectory), resolve(target), allowMissingTail);
}
async function launchAgentReferencesDirectories(launchAgent, directories) {
  const values = [
    typeof launchAgent.Program === "string" ? launchAgent.Program : void 0,
    ...Array.isArray(launchAgent.ProgramArguments) ? launchAgent.ProgramArguments.filter((value) => typeof value === "string") : []
  ].filter((value) => value !== void 0 && isAbsolute(value));
  for (const value of values) {
    const lexical = resolve(value);
    let canonical = lexical;
    try {
      canonical = await realpath(value);
    } catch {
    }
    if (directories.some((directory) => pathInside$1(directory, lexical) || pathInside$1(directory, canonical))) {
      return true;
    }
  }
  return false;
}
function runCommand$1(command, args) {
  return new Promise((resolveResult) => {
    const child = spawn(command, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: COMPONENT_COMMAND_TIMEOUT_MS,
      killSignal: "SIGKILL"
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-65536);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-65536);
    });
    child.once("error", (error) => resolveResult({ code: null, stdout, stderr: error.message }));
    child.once("close", (code) => resolveResult({ code, stdout, stderr }));
  });
}
async function defaultReadLaunchAgent$1(plistPath) {
  const result = await runCommand$1("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath]);
  if (result.code !== 0) throw new Error(result.stderr.trim() || `plutil exited ${String(result.code)}`);
  return JSON.parse(result.stdout);
}
function defaultBootoutLaunchAgent$1(target) {
  return runCommand$1("/bin/launchctl", ["bootout", target]);
}
function defaultInspectLaunchAgent$1(target) {
  return runCommand$1("/bin/launchctl", ["print", target]);
}
function defaultBootstrapLaunchAgent$1(domain, plistPath) {
  return runCommand$1("/bin/launchctl", ["bootstrap", domain, plistPath]);
}
function quarantineTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}
function componentManifestPath(backupDirectory) {
  return join(backupDirectory, OWNED_COMPONENTS_MANIFEST);
}
function launchAgentBackupRelativePath(fileName) {
  return `${LAUNCH_AGENT_BACKUP_PREFIX}${fileName}`;
}
function isPluginOwnedComponentBackup(value) {
  if (typeof value !== "object" || value === null) return false;
  const entry = value;
  if (entry.kind !== "launch-agent" || typeof entry.label !== "string" || !LAUNCH_AGENT_LABEL_PATTERN$1.test(entry.label) || typeof entry.originalPath !== "string" || !isAbsolute(entry.originalPath) || typeof entry.backupRelativePath !== "string") return false;
  const fileName = basename(entry.originalPath);
  return fileName.endsWith(".plist") && entry.originalPath === join(dirname(entry.originalPath), fileName) && entry.backupRelativePath === launchAgentBackupRelativePath(fileName);
}
function sameComponentBackups$1(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
async function writeOwnedComponentsManifest(backupDirectory, manifest) {
  const path = componentManifestPath(backupDirectory);
  const temporary = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await validatePluginOwnedComponentBackupPath(backupDirectory, path, true);
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, void 0, 2)}
`, {
      encoding: "utf8",
      flag: "wx"
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => void 0);
  }
}
async function readPluginOwnedComponentBackups(backupDirectory, removalId, pluginName) {
  try {
    await validatePluginOwnedComponentBackupPath(
      backupDirectory,
      componentManifestPath(backupDirectory),
      true
    );
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(componentManifestPath(backupDirectory), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error(`owned component manifest could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("owned component manifest is invalid");
  }
  const manifest = parsed;
  if (manifest.protocol !== OWNED_COMPONENTS_PROTOCOL || manifest.removalId !== removalId || manifest.pluginName !== pluginName || !Array.isArray(manifest.components) || !manifest.components.every(isPluginOwnedComponentBackup)) {
    throw new Error("owned component manifest does not match its removal record");
  }
  const originalPaths = /* @__PURE__ */ new Set();
  const backupPaths = /* @__PURE__ */ new Set();
  for (const component of manifest.components) {
    if (originalPaths.has(component.originalPath) || backupPaths.has(component.backupRelativePath)) throw new Error("owned component manifest contains duplicate paths");
    originalPaths.add(component.originalPath);
    backupPaths.add(component.backupRelativePath);
    await validatePluginOwnedComponentBackupPath(
      backupDirectory,
      join(backupDirectory, ...component.backupRelativePath.split("/")),
      true
    );
  }
  return manifest.components;
}
async function discoverLegacyPluginOwnedComponents(options) {
  const root = join(options.dshHome, "recovery", "uninstalled-components");
  const candidates = [];
  const unverified = [];
  const readLaunchAgent = options.readLaunchAgent ?? defaultReadLaunchAgent$1;
  let stamps;
  try {
    await assertNoLinkedPathSegments(resolve(options.dshHome), resolve(root), true);
    stamps = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { candidates, unverified };
    return { candidates, unverified: [`cannot inspect legacy component recovery root: ${String(error)}`] };
  }
  const launchAgentsDirectory = join(options.homeDirectory ?? homedir(), "Library", "LaunchAgents");
  for (const stamp of stamps) {
    const stampPath = join(root, stamp.name);
    const quarantinedAt = legacyQuarantineTimestamp(stamp.name);
    if (!stamp.isDirectory()) {
      unverified.push(`${stampPath}: unexpected legacy recovery entry`);
      continue;
    }
    if (!quarantinedAt) {
      unverified.push(`${stampPath}: legacy recovery timestamp is invalid`);
      continue;
    }
    let entries;
    try {
      await assertNoLinkedPathSegments(resolve(options.dshHome), resolve(stampPath), false);
      entries = await readdir(stampPath, { withFileTypes: true });
    } catch (error) {
      unverified.push(`${stampPath}: cannot inspect legacy recovery entry (${String(error)})`);
      continue;
    }
    for (const entry of entries) {
      const sourcePath = join(stampPath, entry.name);
      if (!entry.isFile() || !entry.name.endsWith(".plist")) {
        unverified.push(`${sourcePath}: unexpected legacy recovery material`);
        continue;
      }
      try {
        const launchAgent = await readLaunchAgent(sourcePath);
        const label = typeof launchAgent.Label === "string" && LAUNCH_AGENT_LABEL_PATTERN$1.test(launchAgent.Label) ? launchAgent.Label : void 0;
        const packageOwners = packageOwnersFromLaunchAgent(launchAgent);
        if (!label || packageOwners.length === 0) throw new Error("cannot prove LaunchAgent package ownership");
        const originalPath = join(launchAgentsDirectory, entry.name);
        const candidate = {
          sourcePath,
          sourceDigest: await fileDigest(sourcePath),
          quarantinedAt,
          packageOwners,
          component: {
            kind: "launch-agent",
            label,
            originalPath,
            backupRelativePath: launchAgentBackupRelativePath(entry.name)
          }
        };
        await validateLegacyPluginComponentCandidateLocation({
          dshHome: options.dshHome,
          homeDirectory: options.homeDirectory,
          candidate,
          allowMissingSource: false
        });
        candidates.push(candidate);
      } catch (error) {
        unverified.push(`${sourcePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  candidates.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  unverified.sort();
  return { candidates, unverified };
}
function legacyQuarantineTimestamp(directoryName) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/u.exec(directoryName);
  if (!match) return void 0;
  const iso = `${match[1]}:${match[2]}:${match[3]}.${match[4]}`;
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime()) && quarantineTimestamp(parsed) === directoryName ? parsed.toISOString() : void 0;
}
async function validateLegacyPluginComponentCandidateLocation(options) {
  if (!isLegacyPluginComponentCandidate(options.candidate)) {
    throw new Error("legacy component claim candidate is malformed");
  }
  const root = resolve(options.dshHome, "recovery", "uninstalled-components");
  const source = resolve(options.candidate.sourcePath);
  const parts = containedPathParts(root, source);
  const expectedStamp = quarantineTimestamp(new Date(options.candidate.quarantinedAt));
  const fileName = basename(source);
  if (options.candidate.sourcePath !== source || parts.length !== 2 || parts[0] !== expectedStamp || parts[1] !== fileName || !fileName.endsWith(".plist")) {
    throw new Error("legacy component source path does not match its quarantine timestamp");
  }
  const launchAgents = join(options.homeDirectory ?? homedir(), "Library", "LaunchAgents");
  if (options.candidate.component.originalPath !== join(launchAgents, fileName)) {
    throw new Error("legacy component destination is outside the current user LaunchAgents directory");
  }
  await assertNoLinkedPathSegments(
    resolve(options.homeDirectory ?? homedir()),
    resolve(launchAgents),
    true
  );
  await assertNoLinkedPathSegments(
    resolve(options.dshHome),
    source,
    options.allowMissingSource ?? true
  );
}
async function adoptLegacyPluginOwnedComponents(options) {
  const components = options.candidates.map((candidate) => candidate.component);
  for (const candidate of options.candidates) {
    await validateLegacyPluginComponentCandidateLocation({
      dshHome: options.dshHome,
      candidate,
      allowMissingSource: false
    });
    if (await fileDigest(candidate.sourcePath) !== candidate.sourceDigest) {
      throw new Error(`legacy component source checksum changed: ${candidate.sourcePath}`);
    }
    const destination = join(
      options.backupDirectory,
      ...candidate.component.backupRelativePath.split("/")
    );
    await ensureDirectoryWithoutLinks(options.backupDirectory, dirname(destination));
    await validatePluginOwnedComponentBackupPath(options.backupDirectory, destination, true);
    await copyComponentWithoutOverwrite(candidate.sourcePath, destination);
    if (await fileDigest(candidate.sourcePath) !== candidate.sourceDigest || await fileDigest(destination) !== candidate.sourceDigest) {
      throw new Error(`legacy component claim copy checksum changed: ${destination}`);
    }
  }
  const existing = await readPluginOwnedComponentBackups(
    options.backupDirectory,
    options.removalId,
    options.pluginName
  );
  if (existing.length > 0 && !sameComponentBackups$1(existing, components)) {
    throw new Error("legacy component claim conflicts with existing recovery records");
  }
  await writeOwnedComponentsManifest(options.backupDirectory, {
    protocol: OWNED_COMPONENTS_PROTOCOL,
    removalId: options.removalId,
    pluginName: options.pluginName,
    components
  });
  return components;
}
async function verifyLegacyPluginComponentClaimMaterial(options) {
  for (const candidate of options.candidates) {
    await validateLegacyPluginComponentCandidateLocation({
      dshHome: options.dshHome,
      candidate,
      allowMissingSource: false
    });
    if (await fileDigest(candidate.sourcePath) !== candidate.sourceDigest) {
      throw new Error(`legacy component claim source checksum changed: ${candidate.sourcePath}`);
    }
    const destination = join(
      options.backupDirectory,
      ...candidate.component.backupRelativePath.split("/")
    );
    await validatePluginOwnedComponentBackupPath(options.backupDirectory, destination, true);
    try {
      await lstat(destination);
      if (!await filesMatch(candidate.sourcePath, destination)) {
        throw new Error(`legacy component claim material does not match its source: ${destination}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const recorded = await readPluginOwnedComponentBackups(
    options.backupDirectory,
    options.removalId,
    options.pluginName
  );
  const expected = options.candidates.map((candidate) => candidate.component);
  if (recorded.length > 0 && !sameComponentBackups$1(recorded, expected)) {
    throw new Error("legacy component claim manifest does not match its durable intent");
  }
}
async function fileDigest(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", rejectPromise);
    stream.once("end", resolvePromise);
  });
  return hash.digest("hex");
}
async function filesMatch(left, right) {
  try {
    const [leftStat, rightStat] = await Promise.all([lstat(left), lstat(right)]);
    return leftStat.isFile() && rightStat.isFile() && leftStat.size === rightStat.size && await fileDigest(left) === await fileDigest(right);
  } catch {
    return false;
  }
}
async function copyComponentWithoutOverwrite(source, destination) {
  const sourceStat = await lstat(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`component backup is not a regular file: ${source}`);
  }
  if (await filesMatch(source, destination)) return;
  try {
    await lstat(destination);
    throw new Error(`component restore destination contains different material: ${destination}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = `${destination}.${process.pid}.${Date.now()}.${randomUUID()}.restore`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await copyFile(source, temporary, constants.COPYFILE_EXCL);
    if (!await filesMatch(source, temporary)) {
      throw new Error(`component restore copy could not be verified: ${destination}`);
    }
    try {
      await link(temporary, destination);
    } catch (error) {
      if (error.code !== "EEXIST" || !await filesMatch(source, destination)) {
        throw error;
      }
    }
    if (!await filesMatch(source, destination)) {
      throw new Error(`restored component does not match its recovery backup: ${destination}`);
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => void 0);
  }
}
async function restorePluginOwnedComponents(options) {
  if (options.expectedComponents.length === 0) return;
  const platform2 = options.platform ?? process.platform;
  if (platform2 !== "darwin") throw new Error("LaunchAgent recovery is only supported on macOS");
  const recorded = await readPluginOwnedComponentBackups(
    options.backupDirectory,
    options.removalId,
    options.pluginName
  );
  if (!sameComponentBackups$1(recorded, options.expectedComponents)) {
    throw new Error("owned component recovery records do not match the removal ledger");
  }
  const homeDirectory = options.homeDirectory ?? homedir();
  const launchAgentsDirectory = join(homeDirectory, "Library", "LaunchAgents");
  await ensureDirectoryWithoutLinks(resolve(homeDirectory), resolve(launchAgentsDirectory));
  const activePackageDirectories = await pluginPackageDirectories(options.dshHome, options.pluginName);
  if (activePackageDirectories.length === 0) {
    throw new Error("restored plugin package closure is not active");
  }
  const readLaunchAgent = options.readLaunchAgent ?? defaultReadLaunchAgent$1;
  const bootstrapLaunchAgent = options.bootstrapLaunchAgent ?? defaultBootstrapLaunchAgent$1;
  const inspectLaunchAgent = options.inspectLaunchAgent ?? defaultInspectLaunchAgent$1;
  const uid = options.uid === void 0 ? process.getuid?.() ?? null : options.uid;
  if (typeof uid !== "number") throw new Error("cannot restore a LaunchAgent without a user id");
  const domain = `gui/${uid}`;
  for (const component of recorded) {
    const fileName = basename(component.originalPath);
    const destination = join(launchAgentsDirectory, fileName);
    if (component.originalPath !== destination) {
      throw new Error(`LaunchAgent recovery destination is outside the current user home: ${component.originalPath}`);
    }
    const source = join(options.backupDirectory, ...component.backupRelativePath.split("/"));
    await validatePluginOwnedComponentBackupPath(options.backupDirectory, source, false);
    const launchAgent = await readLaunchAgent(source);
    if (launchAgent.Label !== component.label) {
      throw new Error(`LaunchAgent backup label does not match its recovery record: ${source}`);
    }
    if (!await launchAgentReferencesDirectories(launchAgent, activePackageDirectories)) {
      throw new Error(`LaunchAgent backup does not reference the restored plugin closure: ${source}`);
    }
    await copyComponentWithoutOverwrite(source, destination);
    const target = `${domain}/${component.label}`;
    const bootstrap2 = await bootstrapLaunchAgent(domain, destination);
    let inspected = await inspectLaunchAgent(target);
    if (bootstrap2.code !== 0 && inspected.code !== 0) {
      throw new Error(
        `${destination}: launchctl bootstrap failed (${bootstrap2.stderr.trim() || String(bootstrap2.code)})`
      );
    }
    if (inspected.code !== 0) inspected = await inspectLaunchAgent(target);
    if (inspected.code !== 0) {
      throw new Error(`${destination}: restored LaunchAgent is not loaded`);
    }
    options.log?.(`[plugin-components] restored and loaded ${destination} for ${options.pluginName}`);
  }
}
async function cleanupPluginOwnedComponents(options) {
  const platform2 = options.platform ?? process.platform;
  if (platform2 !== "darwin") return { ok: true, matched: 0, quarantined: [], failures: [] };
  const tracked = options.backupDirectory !== void 0 && options.removalId !== void 0;
  if (tracked) {
    await ensureDirectoryWithoutLinks(resolve(options.dshHome), resolve(options.backupDirectory));
  }
  let componentBackups = tracked ? await readPluginOwnedComponentBackups(
    options.backupDirectory,
    options.removalId,
    options.pluginName
  ) : [];
  const directories = await orphanedPluginPackageDirectories(options.dshHome, options.pluginName);
  if (directories.length === 0 && componentBackups.length === 0) {
    return {
      ok: true,
      matched: 0,
      quarantined: [],
      failures: [],
      ...tracked ? { componentBackups } : {}
    };
  }
  const homeDirectory = options.homeDirectory ?? homedir();
  const launchAgentsDirectory = join(homeDirectory, "Library", "LaunchAgents");
  await assertNoLinkedPathSegments(resolve(homeDirectory), resolve(launchAgentsDirectory), true);
  const readLaunchAgent = options.readLaunchAgent ?? defaultReadLaunchAgent$1;
  const bootoutLaunchAgent = options.bootoutLaunchAgent ?? defaultBootoutLaunchAgent$1;
  const inspectLaunchAgent = options.inspectLaunchAgent ?? defaultInspectLaunchAgent$1;
  const moveComponent = options.moveComponent ?? rename;
  const uid = options.uid === void 0 ? process.getuid?.() ?? null : options.uid;
  const quarantined = [];
  const failures = [];
  let matched = 0;
  let entries = [];
  try {
    entries = await readdir(launchAgentsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`cannot inspect ${launchAgentsDirectory}: ${detail}`);
    }
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".plist")) continue;
    const plistPath = join(launchAgentsDirectory, entry.name);
    let launchAgent;
    try {
      launchAgent = await readLaunchAgent(plistPath);
    } catch {
      continue;
    }
    const recorded = componentBackups.find((component) => component.originalPath === plistPath);
    const matchesRecorded = recorded !== void 0 && launchAgent.Label === recorded.label;
    const matchesClosure = directories.length > 0 && await launchAgentReferencesDirectories(launchAgent, directories);
    if (!matchesRecorded && !matchesClosure) continue;
    if (recorded !== void 0 && !matchesRecorded) {
      failures.push(`${plistPath}: active LaunchAgent conflicts with its component recovery record`);
      continue;
    }
    matched += 1;
    const label = typeof launchAgent.Label === "string" && LAUNCH_AGENT_LABEL_PATTERN$1.test(launchAgent.Label) ? launchAgent.Label : void 0;
    if (label === void 0 || typeof uid !== "number") {
      failures.push(`${plistPath}: missing a safe LaunchAgent label or user id`);
      continue;
    }
    let quarantinePath2;
    if (tracked) {
      const fileName = basename(plistPath);
      const backupRelativePath = launchAgentBackupRelativePath(fileName);
      if (recorded && (recorded.label !== label || recorded.backupRelativePath !== backupRelativePath)) {
        failures.push(`${plistPath}: existing component recovery record does not match`);
        continue;
      }
      if (!recorded) {
        componentBackups = [
          ...componentBackups,
          { kind: "launch-agent", label, originalPath: plistPath, backupRelativePath }
        ];
        await writeOwnedComponentsManifest(options.backupDirectory, {
          protocol: OWNED_COMPONENTS_PROTOCOL,
          removalId: options.removalId,
          pluginName: options.pluginName,
          components: componentBackups
        });
      }
      quarantinePath2 = join(options.backupDirectory, ...backupRelativePath.split("/"));
      await ensureDirectoryWithoutLinks(options.backupDirectory, dirname(quarantinePath2));
      await validatePluginOwnedComponentBackupPath(
        options.backupDirectory,
        quarantinePath2,
        true
      );
    } else {
      const quarantineDirectory = join(
        options.dshHome,
        "recovery",
        "uninstalled-components",
        quarantineTimestamp((options.now ?? (() => /* @__PURE__ */ new Date()))())
      );
      quarantinePath2 = join(quarantineDirectory, basename(plistPath));
      await ensureDirectoryWithoutLinks(resolve(options.dshHome), dirname(quarantinePath2));
      await assertNoLinkedPathSegments(resolve(options.dshHome), quarantinePath2, true);
    }
    const quarantineExists = await lstat(quarantinePath2).then(() => true).catch((error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    const recreated = quarantineExists ? join(
      dirname(dirname(quarantinePath2)),
      "recreated-launch-agents",
      `${Date.now()}-${randomUUID()}-${basename(plistPath)}`
    ) : void 0;
    if (recreated) {
      if (tracked) {
        await ensureDirectoryWithoutLinks(options.backupDirectory, dirname(recreated));
        await validatePluginOwnedComponentBackupPath(options.backupDirectory, recreated, true);
      } else {
        await ensureDirectoryWithoutLinks(resolve(options.dshHome), dirname(recreated));
        await assertNoLinkedPathSegments(resolve(options.dshHome), recreated, true);
      }
    }
    const domain = `gui/${uid}`;
    const target = `${domain}/${label}`;
    let bootout;
    try {
      bootout = await bootoutLaunchAgent(target);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`${plistPath}: launchctl bootout failed (${detail})`);
      continue;
    }
    if (!await launchServiceIsStoppedAfterBootout(
      bootout,
      target,
      domain,
      inspectLaunchAgent
    )) {
      const detail = bootout.stderr.trim() || String(bootout.code);
      failures.push(`${plistPath}: launchctl bootout failed (${detail})`);
      continue;
    }
    try {
      if (recreated) {
        await moveComponent(plistPath, recreated);
        quarantined.push(recreated);
      } else {
        await moveComponent(plistPath, quarantinePath2);
        quarantined.push(quarantinePath2);
      }
      options.log?.(`[plugin-components] quarantined ${plistPath} for ${options.pluginName}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`${plistPath}: quarantine failed (${detail})`);
    }
  }
  if (tracked) {
    for (const component of componentBackups) {
      const sourceExists = await lstat(component.originalPath).then(() => true).catch(() => false);
      const backupPath = join(options.backupDirectory, ...component.backupRelativePath.split("/"));
      await validatePluginOwnedComponentBackupPath(options.backupDirectory, backupPath, true);
      const backupExists = await lstat(backupPath).then((entry) => entry.isFile()).catch(() => false);
      if (!sourceExists && !backupExists) {
        failures.push(`${component.originalPath}: recorded component recovery material is missing`);
      }
    }
  }
  return {
    ok: failures.length === 0,
    matched,
    quarantined,
    failures,
    ...tracked ? { componentBackups } : {}
  };
}
const PROTOCOL = 2;
const BACKUP_INTEGRITY_FILE = ".removal-backup.json";
const BACKUP_INTEGRITY_PROTOCOL = 1;
function ledgerPath$1(dshHome) {
  return join(dshHome, "recovery", "plugin-removals.json");
}
function removalRoot(dshHome) {
  return join(dshHome, "recovery", "plugin-removals");
}
function safePluginName(pluginName) {
  return pluginName.replace(/^@/u, "").replaceAll("/", "__");
}
function timestamp$1(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}
async function hashFile(hash, path) {
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", rejectPromise);
    stream.once("end", resolvePromise);
  });
}
async function contentDigest(root, excludedRootEntry) {
  const hash = createHash("sha256");
  const excluded = new Set(
    typeof excludedRootEntry === "string" ? [excludedRootEntry] : excludedRootEntry ?? []
  );
  const visit2 = async (directory, prefix) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (prefix === "" && excluded.has(entry.name)) continue;
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(directory, entry.name);
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) {
        hash.update(`L\0${relativePath}\0${await readlink(path)}\0`);
      } else if (metadata.isDirectory()) {
        hash.update(`D\0${relativePath}\0`);
        await visit2(path, relativePath);
      } else if (metadata.isFile()) {
        hash.update(`F\0${relativePath}\0${metadata.size}\0`);
        await hashFile(hash, path);
        hash.update("\0");
      }
    }
  };
  await visit2(root, "");
  return hash.digest("hex");
}
async function backupContentDigest(root) {
  return contentDigest(root, BACKUP_INTEGRITY_FILE);
}
async function preComponentClaimDigest(root) {
  return contentDigest(root, [
    BACKUP_INTEGRITY_FILE,
    "owned-components.json",
    "owned-components"
  ]);
}
function sameComponentBackups(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
async function verifyOwnedComponentBackups(entry, backupDirectory = entry.backupDirectory) {
  const recorded = await readPluginOwnedComponentBackups(
    backupDirectory,
    entry.removalId,
    entry.pluginName
  );
  if (!sameComponentBackups(recorded, entry.componentBackups)) {
    throw new Error("owned component recovery records do not match the removal ledger");
  }
  for (const component of recorded) {
    const path = join(backupDirectory, ...component.backupRelativePath.split("/"));
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`owned component recovery material is invalid: ${path}`);
    }
  }
}
async function writeBackupIntegrityManifest(entry) {
  const profileManifestPath = join(entry.backupDirectory, "package.json");
  await rejectLinkedPathSegments(resolve(entry.backupDirectory), profileManifestPath);
  for (const reserved of ["profile-packages", "generations", "profile-detached", "owned-components"]) {
    await rejectLinkedPathSegments(
      resolve(entry.backupDirectory),
      join(entry.backupDirectory, reserved)
    );
  }
  const manifest = JSON.parse(await readFile(profileManifestPath, "utf8"));
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("profile manifest backup is invalid");
  }
  await verifyOwnedComponentBackups(entry);
  await writeJsonAtomically(join(entry.backupDirectory, BACKUP_INTEGRITY_FILE), {
    protocol: BACKUP_INTEGRITY_PROTOCOL,
    removalId: entry.removalId,
    pluginName: entry.pluginName,
    digest: await backupContentDigest(entry.backupDirectory)
  });
}
function legacyRemovalId(pluginName, entry) {
  const suffix = Buffer.from(`${pluginName}\0${entry.disabledAt}\0${entry.backupDirectory}`).toString("base64url").slice(0, 40);
  return `legacy-${suffix}`;
}
const CURRENT_REMOVAL_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LEGACY_REMOVAL_ID = /^legacy-[A-Za-z0-9_-]{1,40}$/u;
function isValidRemovalId(removalId, legacy) {
  return legacy ? LEGACY_REMOVAL_ID.test(removalId) : CURRENT_REMOVAL_ID.test(removalId);
}
function normalizeLegacyLedger(parsed) {
  if (parsed.protocol !== 1 || typeof parsed.removals !== "object" || parsed.removals === null) {
    return void 0;
  }
  const removals = {};
  for (const [pluginName, legacy] of Object.entries(parsed.removals)) {
    if (!legacy || typeof legacy !== "object" || typeof legacy.backupDirectory !== "string" || typeof legacy.disabledAt !== "string" || typeof legacy.updatedAt !== "string" || !isRemovalStatus(legacy.status) || !Array.isArray(legacy.failures) || !legacy.failures.every((failure) => typeof failure === "string") || legacy.generationBackups !== void 0 && (!Array.isArray(legacy.generationBackups) || !legacy.generationBackups.every(isGenerationBackup)) || legacy.componentBackups !== void 0 && (!Array.isArray(legacy.componentBackups) || !legacy.componentBackups.every(isPluginOwnedComponentBackup)) || legacy.legacyComponentClaim !== void 0 && (typeof legacy.legacyComponentClaim !== "object" || typeof legacy.legacyComponentClaim.startedAt !== "string" || !Array.isArray(legacy.legacyComponentClaim.candidates) || legacy.legacyComponentClaim.candidates.length === 0 || !legacy.legacyComponentClaim.candidates.every(isLegacyPluginComponentCandidate))) {
      throw new Error(`legacy plugin removal entry ${pluginName} is invalid`);
    }
    const removalId = legacyRemovalId(pluginName, legacy);
    removals[removalId] = {
      ...legacy,
      removalId,
      pluginName: typeof legacy.pluginName === "string" ? legacy.pluginName : pluginName,
      generationBackups: Array.isArray(legacy.generationBackups) ? legacy.generationBackups : [],
      componentBackups: Array.isArray(legacy.componentBackups) ? legacy.componentBackups : [],
      legacy: true
    };
  }
  return { protocol: PROTOCOL, removals };
}
function isRemovalStatus(value) {
  return value === "backup-pending" || value === "disabled" || value === "cleanup-pending" || value === "removed";
}
function isGenerationBackup(value) {
  if (typeof value !== "object" || value === null) return false;
  const entry = value;
  return typeof entry.id === "string" && entry.id.length > 0 && entry.id !== "." && entry.id !== ".." && !entry.id.includes("/") && !entry.id.includes("\\") && typeof entry.version === "string" && typeof entry.wasDesired === "boolean" && (entry.sourceSpec === void 0 || typeof entry.sourceSpec === "string");
}
function assertCurrentLedger(value) {
  if (typeof value !== "object" || value === null) throw new Error("ledger root is not an object");
  const parsed = value;
  if (parsed.protocol !== PROTOCOL) throw new Error(`unsupported ledger protocol ${String(parsed.protocol)}`);
  if (typeof parsed.removals !== "object" || parsed.removals === null) {
    throw new Error("ledger removals map is invalid");
  }
  for (const [removalId, value2] of Object.entries(parsed.removals)) {
    if (typeof value2 !== "object" || value2 === null) throw new Error(`entry ${removalId} is invalid`);
    const entry = value2;
    if (entry.removalId !== removalId || typeof entry.pluginName !== "string" || !isThirdPartyPackageName(entry.pluginName) || !isRemovalStatus(entry.status) || typeof entry.disabledAt !== "string" || typeof entry.updatedAt !== "string" || typeof entry.backupDirectory !== "string" || !Array.isArray(entry.failures) || !entry.failures.every((failure) => typeof failure === "string") || !Array.isArray(entry.generationBackups) || !entry.generationBackups.every(isGenerationBackup) || entry.componentBackups !== void 0 && (!Array.isArray(entry.componentBackups) || !entry.componentBackups.every(isPluginOwnedComponentBackup)) || entry.legacyComponentClaim !== void 0 && (typeof entry.legacyComponentClaim !== "object" || typeof entry.legacyComponentClaim.startedAt !== "string" || !Array.isArray(entry.legacyComponentClaim.candidates) || entry.legacyComponentClaim.candidates.length === 0 || !entry.legacyComponentClaim.candidates.every(isLegacyPluginComponentCandidate)) || entry.bootVerifiedAt !== void 0 && typeof entry.bootVerifiedAt !== "string" || entry.backupDeletedAt !== void 0 && typeof entry.backupDeletedAt !== "string" || entry.backupCleanupRequestedAt !== void 0 && typeof entry.backupCleanupRequestedAt !== "string" || entry.backupTrashDirectory !== void 0 && typeof entry.backupTrashDirectory !== "string" || entry.restoreStartedAt !== void 0 && typeof entry.restoreStartedAt !== "string" || entry.restoreFailure !== void 0 && typeof entry.restoreFailure !== "string" || entry.restoredAt !== void 0 && typeof entry.restoredAt !== "string" || entry.legacy !== void 0 && entry.legacy !== true || !isValidRemovalId(removalId, entry.legacy === true)) {
      throw new Error(`entry ${removalId} is malformed`);
    }
    entry.componentBackups ??= [];
  }
  return parsed;
}
async function readLedger(dshHome) {
  await validatePluginRecoveryBoundary(dshHome);
  let text;
  try {
    text = await readFile(ledgerPath$1(dshHome), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return { protocol: PROTOCOL, removals: {} };
    }
    throw new Error(`plugin removal ledger could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`plugin removal ledger is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const normalized = parsed.protocol === PROTOCOL ? void 0 : normalizeLegacyLedger(parsed);
  const ledger = parsed.protocol === PROTOCOL ? assertCurrentLedger(parsed) : normalized === void 0 ? void 0 : assertCurrentLedger(normalized);
  if (!ledger) {
    throw new Error(`unsupported plugin removal ledger protocol ${String(parsed.protocol)}`);
  }
  const backupDirectories = /* @__PURE__ */ new Set();
  for (const entry of Object.values(ledger.removals)) {
    const backupDirectory = await validatedBackupDirectory(dshHome, entry);
    if (backupDirectories.has(backupDirectory)) {
      throw new Error("multiple plugin removal records resolve to the same backup directory");
    }
    backupDirectories.add(backupDirectory);
    for (const candidate of entry.legacyComponentClaim?.candidates ?? []) {
      await validateLegacyPluginComponentCandidateLocation({
        dshHome,
        candidate,
        allowMissingSource: true
      });
    }
  }
  return ledger;
}
async function writeLedger(dshHome, ledger) {
  await validatePluginRecoveryBoundary(dshHome);
  const path = ledgerPath$1(dshHome);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(ledger, void 0, 2)}
`, "utf8");
  await rename(temporary, path);
}
async function updateEntry(dshHome, removalId, update) {
  const ledger = await readLedger(dshHome);
  const next = update(ledger.removals[removalId]);
  ledger.removals[removalId] = next;
  await writeLedger(dshHome, ledger);
  return next;
}
async function copyOptional(from, to) {
  if (existsSync(to)) {
    const existing = await readFile(to, "utf8");
    if (to.endsWith("package.json")) {
      const parsed = JSON.parse(existing);
      if (typeof parsed !== "object" || parsed === null) throw new Error(`backup file is invalid: ${to}`);
    }
    return;
  }
  const temporary = `${to}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, temporary);
    await rename(temporary, to);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  } finally {
    await rm(temporary, { force: true }).catch(() => void 0);
  }
}
async function copyGenerationDirectory(from, to, pluginName) {
  if (existsSync(to)) {
    if (existsSync(join(to, "generation.json")) && existsSync(join(to, "node_modules", pluginName, "package.json")) && await contentDigest(from) === await contentDigest(to)) {
      return;
    }
    throw new Error(`generation material already exists but does not match the backup source: ${to}`);
  }
  const temporary = `${to}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(to), { recursive: true });
  try {
    await cp(from, temporary, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true
    });
    if (!existsSync(join(temporary, "generation.json")) || !existsSync(join(temporary, "node_modules", pluginName, "package.json"))) {
      throw new Error(`copied generation ${from} is incomplete`);
    }
    await rename(temporary, to);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => void 0);
    throw error;
  }
}
async function copyPackageSnapshot(from, to) {
  if (!existsSync(from)) return;
  if (existsSync(to)) {
    const manifest = JSON.parse(await readFile(join(to, "package.json"), "utf8"));
    if (typeof manifest?.name !== "string") throw new Error(`package snapshot is invalid: ${to}`);
    return;
  }
  const temporary = `${to}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await mkdir(dirname(to), { recursive: true });
  try {
    await cp(from, temporary, {
      recursive: true,
      dereference: true,
      errorOnExist: true,
      force: false
    });
    const manifest = JSON.parse(await readFile(join(temporary, "package.json"), "utf8"));
    if (typeof manifest?.name !== "string") throw new Error(`package snapshot is invalid: ${from}`);
    await rename(temporary, to);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => void 0);
    throw error;
  }
}
async function assertPackageSnapshotName(directory, pluginName, context) {
  const manifestPath = join(directory, "package.json");
  const metadata = await lstat(manifestPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${context} package manifest is not a regular file`);
  }
  const [realDirectory, realManifest] = await Promise.all([
    realpath(directory),
    realpath(manifestPath)
  ]);
  if (!isInside(realDirectory, realManifest)) {
    throw new Error(`${context} package manifest resolves outside its snapshot`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.name !== pluginName) {
    throw new Error(`${context} package name does not match ${pluginName}`);
  }
}
async function rejectLinkedTree(directory) {
  const metadata = await lstat(directory);
  if (metadata.isSymbolicLink()) {
    throw new Error(`backup material contains a symbolic link or junction: ${directory}`);
  }
  if (!metadata.isDirectory()) return;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`backup material contains a symbolic link or junction: ${path}`);
    }
    if (entry.isDirectory()) await rejectLinkedTree(path);
  }
}
async function ensureBackup(entry, dshHome) {
  await ensureDirectoryNoLinks(resolve(dshHome), resolve(entry.backupDirectory));
  const profile = dirname(profilePackageJsonPath(dshHome));
  const optionalCopies = [
    [profilePackageJsonPath(dshHome), join(entry.backupDirectory, "package.json")],
    [join(profile, "pnpm-lock.yaml"), join(entry.backupDirectory, "pnpm-lock.yaml")],
    [profileCordisPatchPath(dshHome), join(entry.backupDirectory, "cordis.patch.yml")]
  ];
  for (const [, destination] of optionalCopies) {
    await prepareBackupDestination(entry, destination);
  }
  await Promise.all(optionalCopies.map(([source, destination]) => copyOptional(source, destination)));
  const [generations, desired] = await Promise.all([
    listGenerations(dshHome),
    readDesired(dshHome)
  ]);
  const desiredIds = new Set(desired);
  const matching = generations.filter((generation) => generation.pluginName === entry.pluginName);
  const hasDesiredGeneration = matching.some((generation) => desiredIds.has(generation.id));
  if (!hasDesiredGeneration) {
    const packageSnapshot = join(
      entry.backupDirectory,
      "profile-packages",
      "node_modules",
      safePluginName(entry.pluginName)
    );
    const workspaceSnapshot = join(
      entry.backupDirectory,
      "profile-packages",
      "workspaces",
      safePluginName(entry.pluginName)
    );
    await prepareBackupDestination(entry, packageSnapshot);
    await prepareBackupDestination(entry, workspaceSnapshot);
    await copyPackageSnapshot(
      join(profile, "node_modules", entry.pluginName),
      packageSnapshot
    );
    await copyPackageSnapshot(
      join(profile, "packages", entry.pluginName),
      workspaceSnapshot
    );
  }
  const backedUp = [...entry.generationBackups];
  for (const generation of matching) {
    const existing = backedUp.find((candidate) => candidate.id === generation.id);
    const generationBackup = join(entry.backupDirectory, "generations", generation.id);
    await prepareBackupDestination(entry, generationBackup);
    await copyGenerationDirectory(
      generation.directory,
      generationBackup,
      entry.pluginName
    );
    if (!existing) {
      backedUp.push({
        id: generation.id,
        version: generation.version,
        ...generation.sourceSpec === void 0 ? {} : { sourceSpec: generation.sourceSpec },
        wasDesired: desiredIds.has(generation.id)
      });
    } else if (desiredIds.has(generation.id)) {
      existing.wasDesired = true;
    }
  }
  for (const generation of backedUp) {
    const backup = join(entry.backupDirectory, "generations", generation.id);
    if (!existsSync(join(backup, "generation.json")) || !existsSync(join(backup, "node_modules", entry.pluginName, "package.json"))) {
      throw new Error(`generation backup ${generation.id} is incomplete`);
    }
  }
  const generationsManifest = join(entry.backupDirectory, "generations.json");
  await prepareBackupDestination(entry, generationsManifest);
  await writeJsonAtomically(generationsManifest, backedUp);
  return backedUp;
}
async function disableInManifest(dshHome, pluginNames) {
  const path = profilePackageJsonPath(dshHome);
  const manifest = JSON.parse(await readFile(path, "utf8"));
  const bundles = manifest.dsh?.profile?.bundles;
  if (!bundles) return;
  const next = bundles.filter((name) => !pluginNames.has(name));
  if (next.length === bundles.length) return;
  manifest.dsh ??= {};
  manifest.dsh.profile ??= {};
  manifest.dsh.profile.bundles = next;
  await writeFile(path, `${JSON.stringify(manifest, void 0, 2)}
`, "utf8");
}
async function markFailure(dshHome, entry, status2, failures) {
  return updateEntry(dshHome, entry.removalId, (current) => ({
    ...current ?? entry,
    status: status2,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    failures: [.../* @__PURE__ */ new Set([...current?.failures ?? entry.failures, ...failures])]
  }));
}
async function beginRemoval(dshHome, pluginName, now) {
  if (!isThirdPartyPackageName(pluginName)) throw new Error(`Refusing to remove core package ${pluginName}`);
  const ledger = await readLedger(dshHome);
  const current = Object.values(ledger.removals).filter((entry2) => entry2.pluginName === pluginName && entry2.status !== "removed").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const started2 = now();
  if (current) {
    current.updatedAt = started2.toISOString();
    await writeLedger(dshHome, ledger);
    return current;
  }
  const removalId = `${timestamp$1(started2)}-${randomUUID()}`;
  const entry = {
    removalId,
    pluginName,
    status: "backup-pending",
    disabledAt: started2.toISOString(),
    updatedAt: started2.toISOString(),
    backupDirectory: join(removalRoot(dshHome), removalId, safePluginName(pluginName)),
    failures: [],
    generationBackups: [],
    componentBackups: []
  };
  ledger.removals[removalId] = entry;
  await writeLedger(dshHome, ledger);
  return entry;
}
async function nextQuarantinePath(base) {
  if (!existsSync(base)) return base;
  for (let index = 2; index < 1e3; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`Too many quarantine copies at ${base}`);
}
async function quarantinePath(from, baseDestination, backupEntry) {
  if (!existsSync(from)) return void 0;
  if (backupEntry) await prepareBackupDestination(backupEntry, baseDestination);
  const destination = await nextQuarantinePath(baseDestination);
  if (backupEntry) {
    await prepareBackupDestination(backupEntry, destination);
  } else {
    await mkdir(dirname(destination), { recursive: true });
  }
  await rename(from, destination);
  return destination;
}
async function detachLegacyPlugin(entry, dshHome) {
  const manifestPath = profilePackageJsonPath(dshHome);
  const profile = dirname(manifestPath);
  const entryIds = await pluginDeclaredEntryIds(profile, entry.pluginName);
  await quarantinePath(
    join(profile, "node_modules", entry.pluginName),
    join(entry.backupDirectory, "profile-detached", "node_modules", safePluginName(entry.pluginName)),
    entry
  );
  await quarantinePath(
    join(profile, "packages", entry.pluginName),
    join(entry.backupDirectory, "profile-detached", "workspaces", safePluginName(entry.pluginName)),
    entry
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.dependencies) delete manifest.dependencies[entry.pluginName];
  if (manifest.dsh?.profile?.bundles) {
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(
      (name) => name !== entry.pluginName
    );
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, void 0, 2)}
`, "utf8");
  await prunePluginPatchLayer(dshHome, entry.pluginName, entryIds);
  await rm(join(profile, "pnpm-lock.yaml"), { force: true });
}
async function verifyDetached(dshHome, pluginName) {
  try {
    const profile = dirname(profilePackageJsonPath(dshHome));
    const manifest = JSON.parse(await readFile(profilePackageJsonPath(dshHome), "utf8"));
    return !Object.hasOwn(manifest.dependencies ?? {}, pluginName) && !(manifest.dsh?.profile?.bundles ?? []).includes(pluginName) && !existsSync(join(profile, "node_modules", pluginName)) && !existsSync(join(profile, "packages", pluginName));
  } catch {
    return false;
  }
}
function blocksPlugin(entry) {
  return entry.status === "disabled" || entry.status === "cleanup-pending";
}
async function enforcePendingPluginRemovals(dshHome, note = () => void 0) {
  const ledger = await readLedger(dshHome);
  const blocked = Object.values(ledger.removals).filter(blocksPlugin);
  if (blocked.length === 0) return;
  const names = new Set(blocked.map((entry) => entry.pluginName));
  for (const pluginName of names) {
    if (await isGenerationPlugin(dshHome, pluginName)) {
      await disableGeneration(dshHome, pluginName);
      if ((await resolveEnabledGenerations(dshHome)).has(pluginName)) {
        throw new Error(`generation removal tombstone could not disable ${pluginName}`);
      }
    }
  }
  await disableInManifest(dshHome, names);
  const manifest = JSON.parse(await readFile(profilePackageJsonPath(dshHome), "utf8"));
  const remaining = (manifest.dsh?.profile?.bundles ?? []).filter((name) => names.has(name));
  if (remaining.length > 0) throw new Error(`removal tombstone is still composed: ${remaining.join(", ")}`);
  note(`[desktop] enforced ${blocked.length} pending plugin removal tombstone(s)`);
}
async function listPendingPluginRemovals(dshHome) {
  const ledger = await readLedger(dshHome);
  return [...new Set(
    Object.values(ledger.removals).filter((entry) => entry.status !== "removed").map((entry) => entry.pluginName)
  )].sort();
}
async function incompletePluginRestoreId(dshHome) {
  const ledger = await readLedger(dshHome);
  const incomplete = Object.values(ledger.removals).filter(
    (entry) => entry.restoreStartedAt !== void 0 || entry.legacyComponentClaim !== void 0
  );
  if (incomplete.length > 1) {
    throw new Error("multiple incomplete plugin restore transactions require manual recovery");
  }
  return incomplete[0]?.removalId;
}
async function shouldDeferProfileMaintenance(dshHome) {
  const ledger = await readLedger(dshHome);
  const incompleteRestore = Object.values(ledger.removals).find(
    (entry) => entry.restoreStartedAt !== void 0 || entry.legacyComponentClaim !== void 0
  );
  if (incompleteRestore) {
    throw new Error(
      `plugin restore ${incompleteRestore.removalId} for ${incompleteRestore.pluginName} is incomplete`
    );
  }
  return Object.values(ledger.removals).some(
    (entry) => entry.status !== "removed" || entry.bootVerifiedAt === void 0
  );
}
async function confirmPluginRemovalsBooted(dshHome, note = () => void 0) {
  const ledger = await readLedger(dshHome);
  let changed = false;
  const verifiedAt = (/* @__PURE__ */ new Date()).toISOString();
  for (const entry of Object.values(ledger.removals)) {
    if (entry.status !== "removed" || entry.restoreStartedAt !== void 0 || entry.legacyComponentClaim !== void 0) continue;
    if (entry.bootVerifiedAt === void 0) {
      entry.bootVerifiedAt = verifiedAt;
      entry.updatedAt = verifiedAt;
      changed = true;
      note(entry.restoredAt === void 0 ? `[plugin-removal] boot-verified removal ${entry.removalId} of ${entry.pluginName}; recovery backup will be auto-cleaned on next launch` : `[plugin-removal] boot-verified restored plugin ${entry.pluginName}; recovery backup ${entry.removalId} remains user-managed`);
      continue;
    }
    if (entry.restoredAt !== void 0 || entry.backupDeletedAt !== void 0) continue;
    try {
      await rm(entry.backupDirectory, { recursive: true, force: true });
      entry.backupDeletedAt = verifiedAt;
      entry.updatedAt = verifiedAt;
      changed = true;
      note(`[plugin-removal] auto-cleaned verified recovery backup for ${entry.pluginName} (${entry.removalId})`);
    } catch (error) {
      const detail = `verified backup cleanup failed: ${error instanceof Error ? error.message : error}`;
      if (!entry.failures.includes(detail)) entry.failures.push(detail);
      entry.updatedAt = verifiedAt;
      changed = true;
      note(`[plugin-removal] failed to auto-clean recovery backup for ${entry.pluginName}: ${detail}`);
    }
  }
  if (changed) await writeLedger(dshHome, ledger);
}
function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}
async function rejectLinkedPathSegments(boundary, directory) {
  try {
    const boundaryMetadata = await lstat(boundary);
    if (boundaryMetadata.isSymbolicLink() || !boundaryMetadata.isDirectory()) {
      throw new Error(`backup boundary is a symbolic link, junction, or non-directory: ${boundary}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const path = relative(boundary, directory);
  if (path.startsWith("..") || isAbsolute(path)) {
    throw new Error("backup path is outside the recovery boundary");
  }
  let cursor = boundary;
  for (const part of path.split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) {
        throw new Error(`backup path contains a symbolic link or junction: ${cursor}`);
      }
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
  }
  if (!existsSync(boundary) || !existsSync(directory)) return;
  const [realBoundary, realDirectory] = await Promise.all([
    realpath(boundary),
    realpath(directory)
  ]);
  const resolvedPath = relative(realBoundary, realDirectory);
  if (resolvedPath.startsWith("..") || isAbsolute(resolvedPath)) {
    throw new Error("backup path resolves outside the recovery root");
  }
}
async function ensureDirectoryNoLinks(boundary, directory) {
  const root = resolve(boundary);
  const destination = resolve(directory);
  const path = relative(root, destination);
  if (path.startsWith("..") || isAbsolute(path)) {
    throw new Error("backup path is outside the recovery boundary");
  }
  const rootMetadata = await lstat(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error(`backup boundary is a symbolic link, junction, or non-directory: ${root}`);
  }
  let cursor = root;
  for (const part of path.split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    let metadata;
    try {
      metadata = await lstat(cursor);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      try {
        await mkdir(cursor);
      } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST") throw mkdirError;
      }
      metadata = await lstat(cursor);
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`backup path contains a symbolic link, junction, or file: ${cursor}`);
    }
  }
  await rejectLinkedPathSegments(root, destination);
}
async function prepareBackupDestination(entry, target) {
  const boundary = resolve(entry.backupDirectory);
  const destination = resolve(target);
  const path = relative(boundary, destination);
  if (path.startsWith("..") || isAbsolute(path)) {
    throw new Error("backup destination is outside its removal directory");
  }
  await ensureDirectoryNoLinks(boundary, dirname(destination));
  await rejectLinkedPathSegments(boundary, destination);
}
async function validatePluginRecoveryBoundary(dshHome) {
  const boundary = resolve(dshHome);
  await rejectLinkedPathSegments(boundary, resolve(dshHome, "recovery"));
  await rejectLinkedPathSegments(boundary, resolve(ledgerPath$1(dshHome)));
  await rejectLinkedPathSegments(boundary, resolve(removalRoot(dshHome)));
}
async function validatedBackupDirectory(dshHome, entry) {
  const root = resolve(removalRoot(dshHome));
  const directory = resolve(entry.backupDirectory);
  if (!isInside(root, directory)) throw new Error("backup path is outside the recovery root");
  if (entry.legacy) {
    const parts = relative(root, directory).split(sep).filter(Boolean);
    const disabledAt = new Date(entry.disabledAt);
    if (!Number.isFinite(disabledAt.getTime()) || parts.length !== 2 || parts[0] !== timestamp$1(disabledAt) || parts[1] !== safePluginName(entry.pluginName)) {
      throw new Error("legacy backup path does not match its plugin record");
    }
  } else {
    const expected = resolve(root, entry.removalId, safePluginName(entry.pluginName));
    if (directory !== expected) throw new Error("backup path does not match its removal id");
  }
  await rejectLinkedPathSegments(resolve(dshHome), directory);
  return directory;
}
async function validatedTrashDirectory(dshHome, entry) {
  const root = resolve(removalRoot(dshHome));
  const expected = resolve(root, ".trash", entry.removalId);
  if (entry.backupTrashDirectory !== void 0 && resolve(entry.backupTrashDirectory) !== expected) {
    throw new Error("backup trash path does not match its removal id");
  }
  await rejectLinkedPathSegments(resolve(dshHome), expected);
  return expected;
}
async function effectiveBackupDirectory(dshHome, entry) {
  const directory = await validatedBackupDirectory(dshHome, entry);
  if (existsSync(directory)) return directory;
  if (entry.backupCleanupRequestedAt !== void 0) {
    const trash = await validatedTrashDirectory(dshHome, entry);
    if (existsSync(trash)) return trash;
  }
  return directory;
}
async function assessLegacyComponentClaim(dshHome, ledger, entry, backupDirectory) {
  if (!entry.legacy || entry.componentBackups.length > 0) return {};
  const discovery = await discoverLegacyPluginOwnedComponents({ dshHome });
  if (discovery.candidates.length === 0 && discovery.unverified.length === 0) return {};
  if (discovery.unverified.length > 0) {
    return {
      blockedReason: `legacy component recovery material cannot be attributed safely: ${discovery.unverified[0]}`
    };
  }
  const entries = Object.values(ledger.removals);
  const packageNames = /* @__PURE__ */ new Map();
  for (const candidate of entries) {
    if (candidate.backupDeletedAt !== void 0) {
      packageNames.set(candidate.removalId, /* @__PURE__ */ new Set([candidate.pluginName]));
      continue;
    }
    const directory = candidate.removalId === entry.removalId ? backupDirectory : await effectiveBackupDirectory(dshHome, candidate);
    packageNames.set(
      candidate.removalId,
      await removalBackupPackageNames(directory, candidate.pluginName)
    );
  }
  const currentNames = packageNames.get(entry.removalId) ?? /* @__PURE__ */ new Set([entry.pluginName]);
  const matches = discovery.candidates.filter(
    (candidate) => candidate.packageOwners.some((owner) => currentNames.has(owner))
  );
  if (matches.length === 0) return {};
  const disabledAt = Date.parse(entry.disabledAt);
  const updatedAt = Date.parse(entry.updatedAt);
  if (!Number.isFinite(disabledAt) || !Number.isFinite(updatedAt) || updatedAt < disabledAt) {
    return { blockedReason: "plugin removal transaction has an invalid legacy component time window" };
  }
  const outsideWindow = matches.find((candidate) => {
    const quarantinedAt = Date.parse(candidate.quarantinedAt);
    return quarantinedAt < disabledAt || quarantinedAt > updatedAt;
  });
  if (outsideWindow) {
    return {
      blockedReason: `legacy component backup is outside this removal transaction window: ${outsideWindow.sourcePath}`
    };
  }
  if (entries.filter((candidate) => candidate.pluginName === entry.pluginName).length !== 1) {
    return { blockedReason: "multiple removals of this plugin make legacy component ownership ambiguous" };
  }
  for (const selected of matches) {
    const owners = entries.filter(
      (candidate) => selected.packageOwners.some((owner) => packageNames.get(candidate.removalId)?.has(owner))
    );
    if (owners.length !== 1 || owners[0]?.removalId !== entry.removalId) {
      return { blockedReason: "legacy component backup matches more than one removal transaction" };
    }
  }
  const originalPaths = new Set(matches.map((candidate) => candidate.component.originalPath));
  if (originalPaths.size !== matches.length) {
    return { blockedReason: "legacy component recovery contains duplicate destination paths" };
  }
  return { candidates: matches };
}
async function resumeLegacyComponentClaim(dshHome, ledger, entry, backupDirectory) {
  const intent = entry.legacyComponentClaim;
  if (!intent) return;
  const reassessed = await assessLegacyComponentClaim(
    dshHome,
    ledger,
    { ...entry, componentBackups: [] },
    backupDirectory
  );
  if (reassessed.blockedReason || !reassessed.candidates || JSON.stringify(reassessed.candidates) !== JSON.stringify(intent.candidates)) {
    throw new Error(
      reassessed.blockedReason ?? "legacy component claim no longer has a unique verified owner"
    );
  }
  const componentBackups = await adoptLegacyPluginOwnedComponents({
    dshHome,
    backupDirectory,
    removalId: entry.removalId,
    pluginName: entry.pluginName,
    candidates: intent.candidates
  });
  entry.componentBackups = componentBackups;
  await writeLedger(dshHome, ledger);
  await writeBackupIntegrityManifest(entry);
  delete entry.legacyComponentClaim;
  entry.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await writeLedger(dshHome, ledger);
}
async function inspectBackup(dshHome, entry, ledger) {
  let directory;
  let integrity = "verified";
  let integrityDetail;
  let legacyCanRestore = false;
  try {
    directory = await effectiveBackupDirectory(dshHome, entry);
    if (!existsSync(directory)) throw new Error("backup directory is missing");
    for (const reserved of [
      "package.json",
      BACKUP_INTEGRITY_FILE,
      "profile-packages",
      "generations",
      "profile-detached",
      "owned-components",
      "owned-components.json"
    ]) {
      await rejectLinkedPathSegments(directory, join(directory, reserved));
    }
    if (!existsSync(join(directory, "package.json"))) {
      throw new Error("profile manifest backup is missing");
    }
    for (const generation of entry.generationBackups) {
      const generationDirectory = join(directory, "generations", generation.id);
      await rejectLinkedPathSegments(directory, generationDirectory);
      if (!existsSync(join(generationDirectory, "generation.json")) || !existsSync(join(generationDirectory, "node_modules", entry.pluginName, "package.json"))) {
        throw new Error(`generation backup ${generation.id} is incomplete`);
      }
      await assertPackageSnapshotName(
        join(generationDirectory, "node_modules", entry.pluginName),
        entry.pluginName,
        `generation backup ${generation.id}`
      );
    }
    const legacyPackage = join(
      directory,
      "profile-packages",
      "node_modules",
      safePluginName(entry.pluginName)
    );
    await rejectLinkedPathSegments(directory, legacyPackage);
    if (existsSync(join(legacyPackage, "package.json"))) {
      await rejectLinkedTree(legacyPackage);
      await assertPackageSnapshotName(legacyPackage, entry.pluginName, "legacy backup");
      legacyCanRestore = true;
    }
    const legacyWorkspace = join(
      directory,
      "profile-packages",
      "workspaces",
      safePluginName(entry.pluginName)
    );
    await rejectLinkedPathSegments(directory, legacyWorkspace);
    if (existsSync(join(legacyWorkspace, "package.json"))) {
      await rejectLinkedTree(legacyWorkspace);
      await assertPackageSnapshotName(legacyWorkspace, entry.pluginName, "legacy workspace backup");
    }
    const integrityPath = join(directory, BACKUP_INTEGRITY_FILE);
    if (entry.legacyComponentClaim) {
      await verifyLegacyPluginComponentClaimMaterial({
        dshHome,
        backupDirectory: directory,
        removalId: entry.removalId,
        pluginName: entry.pluginName,
        candidates: entry.legacyComponentClaim.candidates
      });
      if (!existsSync(integrityPath) && entry.legacy) {
        integrity = "legacy-unverified";
      } else {
        const recorded = JSON.parse(await readFile(integrityPath, "utf8"));
        const [baseDigest, currentDigest] = await Promise.all([
          preComponentClaimDigest(directory),
          backupContentDigest(directory)
        ]);
        if (recorded.protocol !== BACKUP_INTEGRITY_PROTOCOL || recorded.removalId !== entry.removalId || recorded.pluginName !== entry.pluginName || typeof recorded.digest !== "string" || recorded.digest !== baseDigest && recorded.digest !== currentDigest) throw new Error("legacy component claim base checksum does not match");
      }
    } else if (!existsSync(integrityPath) && entry.legacy) {
      integrity = "legacy-unverified";
    } else {
      const recorded = JSON.parse(await readFile(integrityPath, "utf8"));
      if (recorded.protocol !== BACKUP_INTEGRITY_PROTOCOL || recorded.removalId !== entry.removalId || recorded.pluginName !== entry.pluginName || typeof recorded.digest !== "string") {
        throw new Error("backup integrity manifest does not match its removal record");
      }
      if (await backupContentDigest(directory) !== recorded.digest) {
        throw new Error("backup content checksum does not match");
      }
    }
    if (!entry.legacyComponentClaim) await verifyOwnedComponentBackups(entry, directory);
    if (ledger && !entry.legacyComponentClaim) {
      const legacyClaim = await assessLegacyComponentClaim(dshHome, ledger, entry, directory);
      if (legacyClaim.blockedReason) throw new Error(legacyClaim.blockedReason);
    }
  } catch (error) {
    directory = resolve(entry.backupDirectory);
    integrity = "incomplete";
    integrityDetail = error instanceof Error ? error.message : String(error);
  }
  return {
    removalId: entry.removalId,
    pluginName: entry.pluginName,
    backupDirectory: directory,
    status: entry.status,
    disabledAt: entry.disabledAt,
    ...entry.bootVerifiedAt === void 0 ? {} : { bootVerifiedAt: entry.bootVerifiedAt },
    ...entry.backupDeletedAt === void 0 ? {} : { backupDeletedAt: entry.backupDeletedAt },
    ...entry.restoreStartedAt === void 0 && entry.legacyComponentClaim === void 0 ? {} : { restoreStartedAt: entry.restoreStartedAt ?? entry.legacyComponentClaim.startedAt },
    ...entry.restoreFailure === void 0 && entry.legacyComponentClaim === void 0 ? {} : {
      restoreFailure: entry.restoreFailure ?? "legacy component recovery claim was interrupted before Profile restore"
    },
    ...entry.restoredAt === void 0 ? {} : { restoredAt: entry.restoredAt },
    generationIds: entry.generationBackups.map((generation) => generation.id),
    failures: [...entry.failures],
    integrity,
    ...integrityDetail === void 0 ? {} : { integrityDetail },
    canRestore: entry.status === "removed" && entry.backupCleanupRequestedAt === void 0 && integrity !== "incomplete" && (entry.generationBackups.some((generation) => generation.wasDesired) || legacyCanRestore)
  };
}
async function snapshotPluginRemovalLedger(dshHome) {
  const ledger = await readLedger(dshHome);
  const entries = Object.values(ledger.removals).filter((entry) => entry.backupDeletedAt === void 0);
  const backups = (await Promise.all(entries.map((entry) => inspectBackup(dshHome, entry, ledger)))).sort((left, right) => right.disabledAt.localeCompare(left.disabledAt));
  return {
    backups,
    pendingDeletion: backups.filter(
      (entry) => entry.status === "removed" && entry.bootVerifiedAt !== void 0
    )
  };
}
async function resolvePluginRemovalBackup(dshHome, removalId) {
  const ledger = await readLedger(dshHome);
  const entry = ledger.removals[removalId];
  if (!entry || entry.backupDeletedAt !== void 0) return void 0;
  try {
    await effectiveBackupDirectory(dshHome, entry);
  } catch {
    return void 0;
  }
  return inspectBackup(dshHome, entry, ledger);
}
async function copyRestoredDirectory(from, to) {
  const temporary = `${to}.${process.pid}.${Date.now()}.restore`;
  await mkdir(dirname(to), { recursive: true });
  try {
    await cp(from, temporary, {
      recursive: true,
      dereference: true,
      errorOnExist: true,
      force: false
    });
    if (existsSync(to)) {
      if (await contentDigest(temporary) === await contentDigest(to)) {
        await rm(temporary, { recursive: true, force: true });
        return;
      }
      throw new Error(`restore destination already contains different package material: ${to}`);
    }
    await rename(temporary, to);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => void 0);
    throw error;
  }
}
async function restoreDirectoryWithConflictQuarantine(dshHome, entry, from, to, kind) {
  try {
    await copyRestoredDirectory(from, to);
  } catch (error) {
    if (!existsSync(to)) throw error;
    const conflictBase = join(
      dshHome,
      "recovery",
      "plugin-restore-conflicts",
      entry.removalId,
      kind,
      safePluginName(entry.pluginName)
    );
    await ensureDirectoryNoLinks(resolve(dshHome), dirname(conflictBase));
    await rejectLinkedPathSegments(resolve(dshHome), conflictBase);
    const conflict = await nextQuarantinePath(conflictBase);
    await rejectLinkedPathSegments(resolve(dshHome), conflict);
    await rename(to, conflict);
    await copyRestoredDirectory(from, to);
  }
}
async function restoreGenerationDirectory(dshHome, source, preferredId, pluginName) {
  const layout = await ensureRegistryDirectories(dshHome);
  const sourceDigest = await contentDigest(source);
  let id = preferredId;
  let directory = join(layout.generations, id);
  if (existsSync(directory) && await contentDigest(directory) !== sourceDigest) {
    id = `${preferredId}.recovered-${sourceDigest.slice(0, 12)}`;
    directory = join(layout.generations, id);
  }
  await copyGenerationDirectory(source, directory, pluginName);
  if (await contentDigest(directory) !== sourceDigest) {
    throw new Error(`restored generation ${id} does not match its recovery backup`);
  }
  return { id, directory };
}
async function patchRestorePlan(dshHome, backupDirectory, pluginName, packageDirectory) {
  const backupPatch = join(backupDirectory, "cordis.patch.yml");
  const activePatch = profileCordisPatchPath(dshHome);
  if (!existsSync(backupPatch)) return { path: activePatch };
  const manifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
  const bundlePatch = manifest.dsh?.bundle?.patch;
  const entryIds = typeof bundlePatch === "string" ? bundleEntryIds(await readFile(resolve(packageDirectory, bundlePatch), "utf8")) : [];
  const before = await readFile(backupPatch, "utf8");
  const current = await readFile(activePatch, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "[]\n";
    throw error;
  });
  if (current === before) return { path: activePatch };
  const beforeRows = distExports.parse(before);
  const currentRows = distExports.parse(current);
  if (!Array.isArray(beforeRows) || !Array.isArray(currentRows)) {
    throw new Error("profile patch layer is not a YAML sequence");
  }
  const targetRows = [];
  for (const row of beforeRows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row;
    if (typeof record.id === "string" && entryIds.includes(record.id)) {
      targetRows.push(row);
      continue;
    }
    if (!Array.isArray(record.insert)) continue;
    const targetInsert = record.insert.filter((item) => {
      const name = item?.name;
      return typeof name === "string" && (name === pluginName || name.startsWith(`${pluginName}/`));
    });
    if (targetInsert.length > 0) targetRows.push({ ...record, insert: targetInsert });
  }
  if (targetRows.length === 0) return { path: activePatch };
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  for (const target of targetRows) {
    const record = target;
    if (typeof record.id === "string") {
      const existing = currentRows.find(
        (row) => row?.id === record.id
      );
      if (existing !== void 0) {
        if (!same(existing, target)) throw new Error(`profile patch id ${record.id} now has conflicting content`);
        continue;
      }
    } else if (Array.isArray(record.insert)) {
      const missing = [];
      for (const item of record.insert) {
        const name = item?.name;
        const existing = currentRows.flatMap(
          (row) => Array.isArray(row?.insert) ? row.insert : []
        ).find((candidate) => candidate?.name === name);
        if (existing !== void 0 && !same(existing, item)) {
          throw new Error(`profile patch insert ${String(name)} now has conflicting content`);
        }
        if (existing === void 0) missing.push(item);
      }
      if (missing.length === 0) {
        targetRows[targetRows.indexOf(target)] = { ...record, insert: [] };
        continue;
      }
      targetRows[targetRows.indexOf(target)] = { ...record, insert: missing };
    }
  }
  const document = distExports.parseDocument(current);
  if (!distExports.isSeq(document.contents)) throw new Error("profile patch layer is not a YAML sequence");
  for (const target of targetRows) {
    const record = target;
    if (typeof record.id === "string" && currentRows.some(
      (row) => same(row, target)
    ) || Array.isArray(record.insert) && record.insert.length === 0) continue;
    document.contents.items.push(document.createNode(target));
  }
  return { path: activePatch, text: String(document) };
}
async function applyPatchRestorePlan(plan) {
  if (plan.text === void 0) return;
  const temporary = `${plan.path}.${process.pid}.${Date.now()}.restore`;
  await writeFile(temporary, plan.text, "utf8");
  await rename(temporary, plan.path);
}
async function writeJsonAtomically(path, value) {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, void 0, 2)}
`, "utf8");
  await rename(temporary, path);
}
async function restoreGenerationBackup(dshHome, entry, backupDirectory) {
  const selected = entry.generationBackups.filter((generation) => generation.wasDesired);
  if (selected.length === 0) throw new Error("backup does not record an enabled generation");
  const primaryPackage = join(
    backupDirectory,
    "generations",
    selected[0].id,
    "node_modules",
    entry.pluginName
  );
  await rejectLinkedPathSegments(resolve(backupDirectory), resolve(primaryPackage));
  const patchPlan = await patchRestorePlan(dshHome, backupDirectory, entry.pluginName, primaryPackage);
  const restored = [];
  for (const generation of selected) {
    const generationSource = join(backupDirectory, "generations", generation.id);
    await rejectLinkedPathSegments(resolve(backupDirectory), resolve(generationSource));
    const material = await restoreGenerationDirectory(
      dshHome,
      generationSource,
      generation.id,
      entry.pluginName
    );
    const candidate = {
      ...material,
      pluginName: entry.pluginName,
      version: generation.version
    };
    const peers = await verifyGenerationPeers(dshHome, candidate);
    if (!peers.ok) {
      throw new Error(`restored generation failed peer validation: ${peers.problems.join("; ")}`);
    }
    restored.push(candidate);
  }
  const [desired, generations] = await Promise.all([readDesired(dshHome), listGenerations(dshHome)]);
  const byId = new Map(generations.map((generation) => [generation.id, generation]));
  const withoutPlugin = desired.filter((id) => byId.get(id)?.pluginName !== entry.pluginName);
  await writeDesired(dshHome, [...withoutPlugin, ...restored.map((generation) => generation.id)]);
  await projectGenerations(dshHome);
  await applyPatchRestorePlan(patchPlan);
  const enabled = (await resolveEnabledGenerations(dshHome)).get(entry.pluginName);
  if (!enabled || !restored.some((generation) => generation.id === enabled.id)) {
    throw new Error("restored generation did not become the enabled plugin");
  }
}
async function restoreLegacyBackupAsGeneration(dshHome, entry, backupDirectory, sourcePackage) {
  const manifest = JSON.parse(await readFile(join(sourcePackage, "package.json"), "utf8"));
  if (manifest.name !== entry.pluginName || typeof manifest.version !== "string") {
    throw new Error("legacy package backup identity is invalid");
  }
  const patch = manifest.dsh?.bundle?.patch;
  if (typeof patch !== "string" || !existsSync(resolve(sourcePackage, patch))) {
    throw new Error("legacy package backup has no readable bundle patch");
  }
  const patchPlan = await patchRestorePlan(dshHome, backupDirectory, entry.pluginName, sourcePackage);
  const layout = await ensureRegistryDirectories(dshHome);
  const digest = await contentDigest(sourcePackage);
  const id = generationId(entry.pluginName, manifest.version, `legacy-recovery:${digest}`);
  const staging = join(layout.staging, `${id}.${randomUUID()}`);
  await mkdir(join(staging, "node_modules", dirname(entry.pluginName)), { recursive: true });
  try {
    await cp(sourcePackage, join(staging, "node_modules", entry.pluginName), {
      recursive: true,
      dereference: true,
      errorOnExist: true,
      force: false
    });
    await writeGenerationMeta(staging, {
      pluginName: entry.pluginName,
      version: manifest.version,
      sourceSpec: `recovery:${entry.removalId}`
    });
    const restored = await restoreGenerationDirectory(dshHome, staging, id, entry.pluginName);
    const candidate = { ...restored, pluginName: entry.pluginName, version: manifest.version };
    const peers = await verifyGenerationPeers(dshHome, candidate);
    if (!peers.ok) throw new Error(`restored generation failed peer validation: ${peers.problems.join("; ")}`);
    const [desired, generations] = await Promise.all([readDesired(dshHome), listGenerations(dshHome)]);
    const byId = new Map(generations.map((generation) => [generation.id, generation]));
    await writeDesired(dshHome, [
      ...desired.filter((generation) => byId.get(generation)?.pluginName !== entry.pluginName),
      restored.id
    ]);
    await projectGenerations(dshHome);
    await applyPatchRestorePlan(patchPlan);
    if (!(await resolveEnabledGenerations(dshHome)).has(entry.pluginName)) {
      throw new Error("restored legacy backup did not become an enabled generation");
    }
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => void 0);
  }
}
async function restoreLegacyBackup(dshHome, entry, backupDirectory) {
  const profile = dirname(profilePackageJsonPath(dshHome));
  const sourcePackage = join(
    backupDirectory,
    "profile-packages",
    "node_modules",
    safePluginName(entry.pluginName)
  );
  await rejectLinkedPathSegments(resolve(backupDirectory), resolve(sourcePackage));
  if (!existsSync(join(sourcePackage, "package.json"))) {
    throw new Error("legacy package backup is incomplete");
  }
  await rejectLinkedTree(sourcePackage);
  await assertPackageSnapshotName(sourcePackage, entry.pluginName, "legacy backup");
  if (existsSync(join(profile, ".generations-migrated"))) {
    await restoreLegacyBackupAsGeneration(dshHome, entry, backupDirectory, sourcePackage);
    return;
  }
  const [backupManifest2, currentManifest] = await Promise.all([
    readFile(join(backupDirectory, "package.json"), "utf8").then(JSON.parse),
    readFile(profilePackageJsonPath(dshHome), "utf8").then(JSON.parse)
  ]);
  const spec = backupManifest2.dependencies?.[entry.pluginName];
  if (typeof spec !== "string") throw new Error("legacy backup has no dependency declaration");
  const currentBundles = currentManifest.dsh?.profile?.bundles ?? [];
  const targetPackage = join(profile, "node_modules", entry.pluginName);
  const patchPlan = await patchRestorePlan(dshHome, backupDirectory, entry.pluginName, sourcePackage);
  const declaredSpec = currentManifest.dependencies?.[entry.pluginName];
  if (declaredSpec !== void 0 && declaredSpec !== spec || currentBundles.includes(entry.pluginName) && declaredSpec !== spec) {
    throw new Error("active Profile already declares conflicting plugin material");
  }
  await restoreDirectoryWithConflictQuarantine(
    dshHome,
    entry,
    sourcePackage,
    targetPackage,
    "node_modules"
  );
  const alreadyRestored = currentManifest.dependencies?.[entry.pluginName] === spec && currentBundles.includes(entry.pluginName) && existsSync(join(targetPackage, "package.json"));
  const sourceWorkspace = join(
    backupDirectory,
    "profile-packages",
    "workspaces",
    safePluginName(entry.pluginName)
  );
  await rejectLinkedPathSegments(resolve(backupDirectory), resolve(sourceWorkspace));
  if (existsSync(sourceWorkspace)) {
    await rejectLinkedTree(sourceWorkspace);
    await assertPackageSnapshotName(sourceWorkspace, entry.pluginName, "legacy workspace backup");
    await restoreDirectoryWithConflictQuarantine(
      dshHome,
      entry,
      sourceWorkspace,
      join(profile, "packages", entry.pluginName),
      "workspaces"
    );
  }
  if (!alreadyRestored) {
    currentManifest.dependencies ??= {};
    currentManifest.dependencies[entry.pluginName] = spec;
    currentManifest.dsh ??= {};
    currentManifest.dsh.profile ??= {};
    currentManifest.dsh.profile.bundles = [.../* @__PURE__ */ new Set([...currentBundles, entry.pluginName])];
    await writeJsonAtomically(profilePackageJsonPath(dshHome), currentManifest);
  }
  await applyPatchRestorePlan(patchPlan);
  await clearProfileInstallMarker(dshHome);
}
async function restorePluginRemovalBackup(dshHome, removalId, note = () => void 0, options = {}) {
  let ledger;
  try {
    ledger = await readLedger(dshHome);
    const entry = ledger.removals[removalId];
    if (!entry) return { ok: false, reason: "no removal recorded for this id" };
    const incompleteRestores = Object.values(ledger.removals).filter(
      (candidate) => candidate.restoreStartedAt !== void 0 || candidate.legacyComponentClaim !== void 0
    );
    if (incompleteRestores.length > 0 && (incompleteRestores.length !== 1 || incompleteRestores[0]?.removalId !== removalId)) {
      return { ok: false, reason: "another plugin restore transaction must be resolved first" };
    }
    if (entry.status !== "removed") return { ok: false, reason: "plugin removal is not complete" };
    if (entry.backupDeletedAt !== void 0) return { ok: false, reason: "backup has been deleted" };
    if (entry.backupCleanupRequestedAt !== void 0) {
      return { ok: false, reason: "backup deletion is pending explicit retry" };
    }
    const conflictingRemoval = Object.values(ledger.removals).find(
      (candidate) => candidate.removalId !== entry.removalId && candidate.pluginName === entry.pluginName && candidate.status !== "removed"
    );
    if (conflictingRemoval) {
      return {
        ok: false,
        reason: `another removal transaction is still pending (${conflictingRemoval.removalId})`
      };
    }
    const backupDirectory = await effectiveBackupDirectory(dshHome, entry);
    if (entry.legacyComponentClaim) {
      await resumeLegacyComponentClaim(dshHome, ledger, entry, backupDirectory);
    }
    let inspected = await inspectBackup(dshHome, entry, ledger);
    if (!inspected.canRestore) {
      return { ok: false, reason: inspected.integrityDetail ?? "backup cannot be restored automatically" };
    }
    const legacyClaim = await assessLegacyComponentClaim(
      dshHome,
      ledger,
      entry,
      inspected.backupDirectory
    );
    if (legacyClaim.blockedReason) return { ok: false, reason: legacyClaim.blockedReason };
    if (legacyClaim.candidates) {
      entry.legacyComponentClaim = {
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        candidates: legacyClaim.candidates
      };
      await writeLedger(dshHome, ledger);
      await resumeLegacyComponentClaim(dshHome, ledger, entry, inspected.backupDirectory);
      inspected = await inspectBackup(dshHome, entry, ledger);
      if (!inspected.canRestore) {
        return { ok: false, reason: inspected.integrityDetail ?? "claimed component backup is incomplete" };
      }
    }
    const restoreStartedAt = (/* @__PURE__ */ new Date()).toISOString();
    entry.restoreStartedAt = restoreStartedAt;
    entry.updatedAt = restoreStartedAt;
    delete entry.bootVerifiedAt;
    delete entry.restoreFailure;
    await writeLedger(dshHome, ledger);
    if (entry.generationBackups.some((generation) => generation.wasDesired) || existsSync(join(dirname(profilePackageJsonPath(dshHome)), ".generations-migrated"))) {
      await withRegistryLock(dshHome, async () => {
        if (entry.generationBackups.some((generation) => generation.wasDesired)) {
          await restoreGenerationBackup(dshHome, entry, inspected.backupDirectory);
        } else {
          await restoreLegacyBackup(dshHome, entry, inspected.backupDirectory);
        }
      });
    } else {
      await restoreLegacyBackup(dshHome, entry, inspected.backupDirectory);
    }
    await (options.restoreOwnedComponents ?? restorePluginOwnedComponents)({
      dshHome,
      pluginName: entry.pluginName,
      removalId: entry.removalId,
      backupDirectory: inspected.backupDirectory,
      expectedComponents: entry.componentBackups,
      log: note
    });
    const restoredAt = (/* @__PURE__ */ new Date()).toISOString();
    const completed = { ...entry, restoredAt, updatedAt: restoredAt };
    delete completed.restoreStartedAt;
    delete completed.restoreFailure;
    ledger.removals[removalId] = completed;
    try {
      await writeLedger(dshHome, ledger);
    } catch (error) {
      ledger.removals[removalId] = entry;
      throw error;
    }
    note(`[plugin-removal] restored ${entry.pluginName} from recovery backup ${removalId}`);
    return { ok: true };
  } catch (error) {
    const reason = `backup restore failed: ${error instanceof Error ? error.message : String(error)}`;
    if (ledger) {
      const entry = ledger.removals[removalId];
      if (entry?.restoreStartedAt !== void 0) {
        entry.restoreFailure = reason;
        entry.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        delete entry.bootVerifiedAt;
        await writeLedger(dshHome, ledger).catch(() => void 0);
      }
    }
    note(`[plugin-removal] ${reason}`);
    return { ok: false, reason };
  }
}
async function cleanupVerifiedRemovalBackup(dshHome, removalId, note = () => void 0) {
  let ledger;
  try {
    ledger = await readLedger(dshHome);
  } catch (error) {
    const reason = `recovery ledger validation failed: ${error instanceof Error ? error.message : String(error)}`;
    note(`[plugin-removal] cleanup blocked: ${reason}`);
    return { ok: false, reason };
  }
  const entry = ledger.removals[removalId];
  if (!entry) return { ok: false, reason: "no removal recorded for this id" };
  if (entry.status !== "removed") return { ok: false, reason: "plugin is not in the removed state" };
  if (entry.backupDeletedAt !== void 0) return { ok: true };
  if (entry.bootVerifiedAt === void 0) {
    return { ok: false, reason: "plugin has not been boot-verified yet" };
  }
  if (entry.restoreStartedAt !== void 0 || entry.legacyComponentClaim !== void 0) {
    return { ok: false, reason: "plugin restore is incomplete; recovery backup must be kept" };
  }
  let directory;
  let trash;
  try {
    directory = await validatedBackupDirectory(dshHome, entry);
    trash = await validatedTrashDirectory(dshHome, entry);
    if (entry.backupCleanupRequestedAt === void 0) {
      if (!existsSync(directory)) throw new Error("backup directory is missing before cleanup starts");
      if (existsSync(trash)) throw new Error("record-specific cleanup trash already exists");
      entry.backupCleanupRequestedAt = (/* @__PURE__ */ new Date()).toISOString();
      entry.backupTrashDirectory = trash;
      entry.updatedAt = entry.backupCleanupRequestedAt;
      await writeLedger(dshHome, ledger);
    }
    if (existsSync(directory)) {
      if (existsSync(trash)) throw new Error("record-specific cleanup trash already exists");
      await mkdir(dirname(trash), { recursive: true });
      await rename(directory, trash);
    }
    if (existsSync(trash)) await rm(trash, { recursive: true, force: true });
    if (existsSync(directory) || existsSync(trash)) {
      throw new Error("backup material still exists after cleanup");
    }
  } catch (error) {
    const detail = `verified backup cleanup failed: ${error instanceof Error ? error.message : error}`;
    if (!entry.failures.includes(detail)) entry.failures.push(detail);
    entry.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await writeLedger(dshHome, ledger).catch(() => void 0);
    note(`[plugin-removal] kept recovery backup ${removalId} for ${entry.pluginName}: ${detail}`);
    return { ok: false, reason: detail };
  }
  entry.backupDeletedAt = (/* @__PURE__ */ new Date()).toISOString();
  entry.updatedAt = entry.backupDeletedAt;
  delete entry.backupCleanupRequestedAt;
  delete entry.backupTrashDirectory;
  await writeLedger(dshHome, ledger);
  note(`[plugin-removal] deleted recovery backup ${removalId} for ${entry.pluginName} (user-confirmed)`);
  return { ok: true };
}
async function removePluginSafely(options) {
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  let entry;
  try {
    entry = await beginRemoval(options.dshHome, options.pluginName, now);
  } catch (error) {
    const detail = `removal journal could not be started: ${error instanceof Error ? error.message : String(error)}`;
    options.note?.(`[plugin-removal] ${detail}`);
    return {
      pluginName: options.pluginName,
      disabled: false,
      removed: false,
      pending: true,
      failures: [detail]
    };
  }
  try {
    const generationBackups = await ensureBackup(entry, options.dshHome);
    entry = await updateEntry(options.dshHome, entry.removalId, (current) => ({
      ...current ?? entry,
      generationBackups
    }));
    await disableInManifest(options.dshHome, /* @__PURE__ */ new Set([options.pluginName]));
    entry = await updateEntry(options.dshHome, entry.removalId, (current) => ({
      ...current ?? entry,
      status: "disabled",
      updatedAt: now().toISOString()
    }));
  } catch (error) {
    const detail = `backup/disable failed: ${error instanceof Error ? error.message : error}`;
    entry = await markFailure(options.dshHome, entry, "backup-pending", [detail]).catch(() => entry);
    return {
      removalId: entry.removalId,
      pluginName: options.pluginName,
      disabled: false,
      removed: false,
      pending: true,
      backupDirectory: entry.backupDirectory,
      failures: [detail]
    };
  }
  let cleanup = await options.cleanupOwnedComponents({
    removalId: entry.removalId,
    backupDirectory: entry.backupDirectory
  }).catch((error) => ({
    ok: false,
    failures: [error instanceof Error ? error.message : String(error)]
  }));
  try {
    const componentBackups = await readPluginOwnedComponentBackups(
      entry.backupDirectory,
      entry.removalId,
      entry.pluginName
    );
    if (cleanup.componentBackups !== void 0 && !sameComponentBackups(cleanup.componentBackups, componentBackups)) {
      throw new Error("component cleanup result does not match its durable recovery manifest");
    }
    entry = await updateEntry(options.dshHome, entry.removalId, (current) => ({
      ...current ?? entry,
      componentBackups
    }));
  } catch (error) {
    const detail = `component recovery journal failed: ${error instanceof Error ? error.message : String(error)}`;
    cleanup = { ok: false, failures: [...cleanup.failures, detail] };
  }
  if (!cleanup.ok) {
    entry = await markFailure(options.dshHome, entry, "cleanup-pending", cleanup.failures).catch(() => entry);
    return {
      removalId: entry.removalId,
      pluginName: options.pluginName,
      disabled: true,
      removed: false,
      pending: true,
      backupDirectory: entry.backupDirectory,
      failures: cleanup.failures
    };
  }
  let detachedLegacyPlugin = false;
  try {
    if (entry.generationBackups.some((generation) => generation.wasDesired)) {
      if (!await options.uninstallGeneration()) {
        const [desired, generations] = await Promise.all([
          readDesired(options.dshHome),
          listGenerations(options.dshHome)
        ]);
        const byId = new Map(generations.map((generation) => [generation.id, generation]));
        if (desired.some((id) => byId.get(id)?.pluginName === options.pluginName)) {
          throw new Error("generation pointer could not be disabled");
        }
      }
    } else {
      await detachLegacyPlugin(entry, options.dshHome);
      if (!await verifyDetached(options.dshHome, options.pluginName)) {
        throw new Error("plugin is still present in the active profile");
      }
      detachedLegacyPlugin = true;
    }
    await writeBackupIntegrityManifest(entry);
  } catch (error) {
    const detail = `detach failed: ${error instanceof Error ? error.message : error}`;
    entry = await markFailure(options.dshHome, entry, "cleanup-pending", [detail]).catch(() => entry);
    return {
      removalId: entry.removalId,
      pluginName: options.pluginName,
      disabled: true,
      removed: false,
      pending: true,
      backupDirectory: entry.backupDirectory,
      failures: [detail]
    };
  }
  if (detachedLegacyPlugin && options.reconcileLegacyProfile) {
    const reconciliation = await options.reconcileLegacyProfile().catch((error) => ({
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    }));
    if (!reconciliation.ok) {
      const detail = `profile rebuild failed: ${reconciliation.detail ?? "unknown error"}`;
      entry = await markFailure(options.dshHome, entry, "cleanup-pending", [detail]).catch(() => entry);
      return {
        pluginName: options.pluginName,
        disabled: true,
        removed: false,
        pending: true,
        backupDirectory: entry.backupDirectory,
        failures: [detail]
      };
    }
  }
  try {
    entry = await updateEntry(options.dshHome, entry.removalId, (current) => ({
      ...current ?? entry,
      status: "removed",
      updatedAt: now().toISOString(),
      failures: []
    }));
  } catch (error) {
    const detail = `removal commit failed: ${error instanceof Error ? error.message : error}`;
    return {
      removalId: entry.removalId,
      pluginName: options.pluginName,
      disabled: true,
      removed: false,
      pending: true,
      backupDirectory: entry.backupDirectory,
      failures: [detail]
    };
  }
  options.note?.(
    `[plugin-removal] removed ${options.pluginName}; recovery backup ${entry.removalId} kept at ${entry.backupDirectory}`
  );
  return {
    removalId: entry.removalId,
    pluginName: options.pluginName,
    disabled: true,
    removed: true,
    pending: false,
    backupDirectory: entry.backupDirectory,
    failures: []
  };
}
const REPAIR_ESCALATION_THRESHOLD = 3;
function ledgerPath(dshHome) {
  return join(dshHome, "recovery", "launch-agent-ledger.json");
}
async function readComponentLedger(dshHome) {
  try {
    const parsed = JSON.parse(await readFile(ledgerPath(dshHome), "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}
async function recordComponentRepair(dshHome, label, now = () => /* @__PURE__ */ new Date()) {
  const ledger = await readComponentLedger(dshHome);
  const entry = {
    repairs: (ledger[label]?.repairs ?? 0) + 1,
    lastRepairAt: now().toISOString()
  };
  ledger[label] = entry;
  const path = ledgerPath(dshHome);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(ledger, void 0, 2)}
`);
  return entry;
}
function shouldEscalateRepairs(entry) {
  return entry.repairs >= REPAIR_ESCALATION_THRESHOLD;
}
const LAUNCH_AGENT_LABEL_PATTERN = /^[a-z0-9._-]+$/i;
const COMMAND_TIMEOUT_MS = 1e4;
function pathInside(parent, child) {
  const nested = relative(parent, child);
  return nested === "" || !nested.startsWith("..") && !isAbsolute(nested);
}
function executablePath(record) {
  if (typeof record.Program === "string" && isAbsolute(record.Program)) return record.Program;
  const args = Array.isArray(record.ProgramArguments) ? record.ProgramArguments : [];
  const first = args[0];
  return typeof first === "string" && isAbsolute(first) ? first : void 0;
}
function runsAsNode(record) {
  const environment = record.EnvironmentVariables;
  if (typeof environment !== "object" || environment === null) return false;
  const flag = environment.ELECTRON_RUN_AS_NODE;
  return flag === "1" || flag === 1 || flag === true;
}
function repairedLaunchAgent(record) {
  const environment = typeof record.EnvironmentVariables === "object" && record.EnvironmentVariables !== null ? record.EnvironmentVariables : {};
  return {
    ...record,
    EnvironmentVariables: { ...environment, ELECTRON_RUN_AS_NODE: "1" }
  };
}
function describesDaemonisedAppBinary(record, appBundlePath) {
  return referencesAppBundleExecutable(record, appBundlePath) && !runsAsNode(record);
}
function referencesAppBundleExecutable(record, appBundlePath) {
  const executable = executablePath(record);
  if (executable === void 0) return false;
  return pathInside(resolve(appBundlePath), resolve(executable));
}
function appBundlePathFromExecutable(executable) {
  const segments = executable.split("/");
  const bundle = segments.findIndex((segment) => segment.endsWith(".app"));
  if (bundle === -1) return void 0;
  return segments.slice(0, bundle + 1).join("/");
}
function pluginOwnerFromArguments(record) {
  const args = Array.isArray(record.ProgramArguments) ? record.ProgramArguments : [];
  const candidates = [
    typeof record.Program === "string" ? record.Program : void 0,
    ...args.filter((value) => typeof value === "string")
  ].filter((value) => value !== void 0);
  for (const candidate of candidates) {
    const segments = candidate.split("/");
    const marker = segments.lastIndexOf("node_modules");
    if (marker === -1) continue;
    const first = segments[marker + 1];
    if (first === void 0 || first === "") continue;
    if (first.startsWith("@")) {
      const second = segments[marker + 2];
      if (second !== void 0 && second !== "") return `${first}/${second}`;
      continue;
    }
    return first;
  }
  return void 0;
}
function runCommand(command, args) {
  return new Promise((resolveResult) => {
    const child = spawn(command, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: COMMAND_TIMEOUT_MS,
      killSignal: "SIGKILL"
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-65536);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-65536);
    });
    child.once("error", (error) => resolveResult({ code: null, stdout, stderr: error.message }));
    child.once("close", (code) => resolveResult({ code, stdout, stderr }));
  });
}
async function defaultReadLaunchAgent(plistPath) {
  const result = await runCommand("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath]);
  if (result.code !== 0) throw new Error(result.stderr.trim() || `plutil exited ${String(result.code)}`);
  return JSON.parse(result.stdout);
}
async function defaultWriteLaunchAgent(plistPath, record) {
  const staging = await mkdtemp(join(tmpdir(), "dsh-launch-agent-"));
  const source = join(staging, "agent.json");
  try {
    await writeFile(source, JSON.stringify(record));
    const result = await runCommand("/usr/bin/plutil", ["-convert", "xml1", "-o", plistPath, source]);
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || `plutil exited ${String(result.code)}`);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
function defaultBootoutLaunchAgent(target) {
  return runCommand("/bin/launchctl", ["bootout", target]);
}
function defaultInspectLaunchAgent(target) {
  return runCommand("/bin/launchctl", ["print", target]);
}
function defaultBootstrapLaunchAgent(domain, plistPath) {
  return runCommand("/bin/launchctl", ["bootstrap", domain, plistPath]);
}
function defaultDisableLaunchAgent(target) {
  return runCommand("/bin/launchctl", ["disable", target]);
}
function timestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}
async function quarantineLaunchAgent(options) {
  const domain = `gui/${String(options.uid)}`;
  const target = `${domain}/${options.label}`;
  const bootout = await options.bootoutLaunchAgent(target);
  if (!await launchServiceIsStoppedAfterBootout(
    bootout,
    target,
    domain,
    options.inspectLaunchAgent
  )) {
    throw new Error(bootout.stderr.trim() || `launchctl bootout exited ${String(bootout.code)}`);
  }
  const quarantineDirectory = join(
    options.dshHome,
    "recovery",
    "quarantined-components",
    timestamp(options.now())
  );
  await mkdir(quarantineDirectory, { recursive: true });
  const quarantinePath2 = join(quarantineDirectory, basename(options.plistPath));
  await rename(options.plistPath, quarantinePath2);
  return quarantinePath2;
}
async function quarantineAppBundleLaunchAgents(options) {
  const platform2 = options.platform ?? process.platform;
  const findings = [];
  const failures = [];
  if (platform2 !== "darwin") return { findings, failures };
  const homeDirectory = options.homeDirectory ?? homedir();
  const launchAgentsDirectory = join(homeDirectory, "Library", "LaunchAgents");
  const readLaunchAgent = options.readLaunchAgent ?? defaultReadLaunchAgent;
  const bootoutLaunchAgent = options.bootoutLaunchAgent ?? defaultBootoutLaunchAgent;
  const inspectLaunchAgent = options.inspectLaunchAgent ?? defaultInspectLaunchAgent;
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const uid = options.uid === void 0 ? process.getuid?.() ?? null : options.uid;
  let entries;
  try {
    entries = await readdir(launchAgentsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { findings, failures };
    const detail = error instanceof Error ? error.message : String(error);
    return { findings, failures: [`cannot inspect ${launchAgentsDirectory}: ${detail}`] };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".plist")) continue;
    const plistPath = join(launchAgentsDirectory, entry.name);
    let record;
    try {
      record = await readLaunchAgent(plistPath);
    } catch {
      continue;
    }
    if (!referencesAppBundleExecutable(record, options.appBundlePath)) continue;
    const label = typeof record.Label === "string" && LAUNCH_AGENT_LABEL_PATTERN.test(record.Label) ? record.Label : void 0;
    if (label === void 0 || typeof uid !== "number") {
      failures.push(`${plistPath}: missing a safe LaunchAgent label or user id`);
      continue;
    }
    try {
      const quarantinePath2 = await quarantineLaunchAgent({
        dshHome: options.dshHome,
        plistPath,
        label,
        uid,
        bootoutLaunchAgent,
        inspectLaunchAgent,
        now
      });
      const owner = pluginOwnerFromArguments(record);
      findings.push({ label, plistPath, action: "quarantined", owner, backupPath: quarantinePath2 });
      options.log?.(`[launch-agents] quarantined ${label} before replacing the application bundle`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`${plistPath}: quarantine failed (${detail})`);
    }
  }
  return { findings, failures };
}
async function auditLaunchAgents(options) {
  const platform2 = options.platform ?? process.platform;
  const findings = [];
  const failures = [];
  if (platform2 !== "darwin") return { findings, failures };
  const homeDirectory = options.homeDirectory ?? homedir();
  const launchAgentsDirectory = join(homeDirectory, "Library", "LaunchAgents");
  const readLaunchAgent = options.readLaunchAgent ?? defaultReadLaunchAgent;
  const writeLaunchAgent = options.writeLaunchAgent ?? defaultWriteLaunchAgent;
  const bootoutLaunchAgent = options.bootoutLaunchAgent ?? defaultBootoutLaunchAgent;
  const inspectLaunchAgent = options.inspectLaunchAgent ?? defaultInspectLaunchAgent;
  const bootstrapLaunchAgent = options.bootstrapLaunchAgent ?? defaultBootstrapLaunchAgent;
  const disableLaunchAgent = options.disableLaunchAgent ?? defaultDisableLaunchAgent;
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const uid = options.uid === void 0 ? process.getuid?.() ?? null : options.uid;
  let entries;
  try {
    entries = await readdir(launchAgentsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { findings, failures };
    const detail = error instanceof Error ? error.message : String(error);
    return { findings, failures: [`cannot inspect ${launchAgentsDirectory}: ${detail}`] };
  }
  const ledger = await readComponentLedger(options.dshHome);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".plist")) continue;
    const plistPath = join(launchAgentsDirectory, entry.name);
    let record;
    try {
      record = await readLaunchAgent(plistPath);
    } catch {
      continue;
    }
    if (!describesDaemonisedAppBinary(record, options.appBundlePath)) continue;
    const label = typeof record.Label === "string" && LAUNCH_AGENT_LABEL_PATTERN.test(record.Label) ? record.Label : void 0;
    if (label === void 0 || typeof uid !== "number") {
      failures.push(`${plistPath}: missing a safe LaunchAgent label or user id`);
      continue;
    }
    const owner = pluginOwnerFromArguments(record);
    const previous = ledger[label];
    if (previous !== void 0 && shouldEscalateRepairs(previous)) {
      try {
        const target2 = `gui/${String(uid)}/${label}`;
        const disabled = await disableLaunchAgent(target2);
        if (disabled.code !== 0) {
          throw new Error(
            disabled.stderr.trim() || `launchctl disable exited ${String(disabled.code)}`
          );
        }
        const quarantinePath2 = await quarantineLaunchAgent({
          dshHome: options.dshHome,
          plistPath,
          label,
          uid,
          bootoutLaunchAgent,
          inspectLaunchAgent,
          now
        });
        findings.push({
          label,
          plistPath,
          action: "disabled",
          owner,
          backupPath: quarantinePath2,
          repairs: previous.repairs
        });
        options.log?.(`[launch-agents] disabled ${label} after repeated unsafe recreation`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push(`${plistPath}: disable/quarantine failed (${detail})`);
      }
      continue;
    }
    const target = `gui/${String(uid)}/${label}`;
    const domain = `gui/${String(uid)}`;
    const stampDirectory = join(options.dshHome, "recovery", "repaired-components", timestamp(now()));
    const backupPath = join(stampDirectory, basename(plistPath));
    try {
      await mkdir(stampDirectory, { recursive: true });
      await copyFile(plistPath, backupPath);
      await bootoutLaunchAgent(target);
      await writeLaunchAgent(plistPath, repairedLaunchAgent(record));
      await bootstrapLaunchAgent(domain, plistPath);
      const recorded = await recordComponentRepair(options.dshHome, label, now);
      findings.push({ label, plistPath, action: "repaired", owner, backupPath, repairs: recorded.repairs });
      options.log?.(`[launch-agents] repaired ${label} to run as node`);
      continue;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`${plistPath}: repair failed (${detail})`);
    }
    try {
      const quarantinePath2 = await quarantineLaunchAgent({
        dshHome: options.dshHome,
        plistPath,
        label,
        uid,
        bootoutLaunchAgent,
        inspectLaunchAgent,
        now
      });
      findings.push({ label, plistPath, action: "quarantined", owner, backupPath: quarantinePath2 });
      options.log?.(`[launch-agents] quarantined ${label} after a failed repair`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`${plistPath}: quarantine failed (${detail})`);
    }
  }
  return { findings, failures };
}
const WINDOWS_TITLEBAR_HEIGHT = 36;
const desktopMenuCommands = [
  "connect-phone",
  "restart-harness",
  "safe-mode",
  "show-harness-log",
  "check-for-updates",
  "export-session",
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "select-all",
  "reload",
  "toggle-devtools",
  "zoom-reset",
  "zoom-in",
  "zoom-out",
  "toggle-fullscreen",
  "about",
  "quit"
];
const desktopMenuCommandSet = new Set(desktopMenuCommands);
function isZoomMenuCommand(command) {
  return command === "zoom-reset" || command === "zoom-in" || command === "zoom-out";
}
function isDesktopMenuCommand(value) {
  return typeof value === "string" && desktopMenuCommandSet.has(value);
}
function shouldLoadHarnessUrl(currentUrl, targetUrl) {
  if (currentUrl === "" || currentUrl === "about:blank") return true;
  try {
    return new URL(currentUrl).origin !== new URL(targetUrl).origin;
  } catch {
    return true;
  }
}
function desktopHarnessUrl(url, platform2, authToken) {
  if (platform2 !== "win32" && authToken === void 0) return url;
  try {
    const parsed = new URL(url);
    if (authToken !== void 0) parsed.searchParams.set("token", authToken);
    if (platform2 === "win32") {
      parsed.searchParams.set("dsh-desktop-mode", "advanced");
      parsed.searchParams.set("dsh-desktop-platform", platform2);
      parsed.searchParams.set("dsh-desktop-titlebar-inset", String(WINDOWS_TITLEBAR_HEIGHT));
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
async function clearStaleHarnessAuthCookies(cookies, rendererUrl, authToken) {
  if (authToken === void 0) return 0;
  let origin;
  try {
    const parsed = new URL(rendererUrl);
    if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) return 0;
    origin = `${parsed.origin}/`;
  } catch {
    return 0;
  }
  const stale = (await cookies.get({ url: origin })).filter(
    ({ name }) => name.startsWith("dsh-auth-")
  );
  await Promise.all(stale.map(({ name }) => cookies.remove(origin, name)));
  return stale.length;
}
function isAbortedNavigationError(error) {
  if (typeof error !== "object" || error === null) return false;
  const navigationError = error;
  if (navigationError.code === "ERR_ABORTED" || navigationError.errno === -3) return true;
  return typeof navigationError.message === "string" && /(?:^|\s)ERR_ABORTED\s*\(-3\)(?:\s|$)/.test(navigationError.message);
}
const STORAGE_FILENAME = "desktop-storage.json";
class DesktopStorageManager {
  memoryStore = /* @__PURE__ */ new Map();
  filePath;
  debounceMs;
  flushTimer;
  isDirty = false;
  onError;
  constructor(profileDirectory2, options = {}) {
    this.filePath = join(profileDirectory2, STORAGE_FILENAME);
    this.debounceMs = options.debounceMs ?? 200;
    this.onError = options.onError;
    this.loadFromDiskSync();
  }
  getStorageFilePath() {
    return this.filePath;
  }
  /**
   * Returns a snapshot of all stored keys and values.
   */
  getAll() {
    const result = {};
    for (const [key, value] of this.memoryStore.entries()) {
      result[key] = value;
    }
    return result;
  }
  getItem(key) {
    return this.memoryStore.get(key) ?? null;
  }
  setItem(key, value) {
    const stringKey = String(key);
    const stringVal = String(value);
    if (this.memoryStore.get(stringKey) === stringVal) return;
    this.memoryStore.set(stringKey, stringVal);
    this.markDirty();
  }
  removeItem(key) {
    const stringKey = String(key);
    if (!this.memoryStore.has(stringKey)) return;
    this.memoryStore.delete(stringKey);
    this.markDirty();
  }
  clear() {
    if (this.memoryStore.size === 0) return;
    this.memoryStore.clear();
    this.markDirty();
  }
  applyAction(action) {
    switch (action.type) {
      case "set":
        this.setItem(action.key, action.val);
        break;
      case "remove":
        this.removeItem(action.key);
        break;
      case "clear":
        this.clear();
        break;
    }
  }
  /**
   * Switch the storage manager to a new profile directory.
   * Flushes any pending changes for the previous profile first.
   */
  switchProfile(profileDirectory2) {
    this.flushSync();
    this.filePath = join(profileDirectory2, STORAGE_FILENAME);
    this.memoryStore.clear();
    this.loadFromDiskSync();
  }
  /**
   * Flushes any dirty state asynchronously.
   */
  async flush() {
    if (this.flushTimer !== void 0) {
      clearTimeout(this.flushTimer);
      this.flushTimer = void 0;
    }
    if (!this.isDirty) return;
    this.isDirty = false;
    const serialized = JSON.stringify(this.getAll(), null, 2);
    const tmpPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(tmpPath, serialized, "utf8");
      await rename(tmpPath, this.filePath);
    } catch (error) {
      this.isDirty = true;
      this.handleError(error, "async-flush");
    }
  }
  /**
   * Flushes any dirty state synchronously (e.g., during app before-quit or window close).
   */
  flushSync() {
    if (this.flushTimer !== void 0) {
      clearTimeout(this.flushTimer);
      this.flushTimer = void 0;
    }
    if (!this.isDirty) return;
    this.isDirty = false;
    const serialized = JSON.stringify(this.getAll(), null, 2);
    const tmpPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(tmpPath, serialized, "utf8");
      renameSync(tmpPath, this.filePath);
    } catch (error) {
      this.isDirty = true;
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      } catch {
      }
      this.handleError(error, "sync-flush");
    }
  }
  markDirty() {
    this.isDirty = true;
    if (this.flushTimer !== void 0) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = void 0;
      void this.flush();
    }, this.debounceMs);
  }
  loadFromDiskSync() {
    this.isDirty = false;
    if (!existsSync(this.filePath)) {
      return;
    }
    try {
      const raw = readFileSync(this.filePath, "utf8").trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") {
            this.memoryStore.set(k, v);
          } else {
            this.memoryStore.set(k, String(v));
          }
        }
      }
    } catch (error) {
      this.handleError(error, "load-from-disk");
    }
  }
  handleError(error, context) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (this.onError) {
      this.onError(err, context);
    }
  }
}
function raiseWindowWithoutStealingFocus(window, platform2, isAppActive, intent = "automatic") {
  if (window.isDestroyed()) return;
  if (platform2 === "darwin" && intent === "automatic" && !isAppActive()) {
    window.showInactive();
    return;
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1e3;
const UPDATE_STARTUP_DELAY_MS = 15e3;
const UPDATE_STARTUP_JITTER_MS = 15e3;
const AUTO_INSTALL_ON_APP_QUIT = false;
function supportsAutoUpdates(isPackaged, platform2) {
  return isPackaged && (platform2 === "darwin" || platform2 === "win32");
}
function shouldCheckAfterResume(lastCheckedAt2, now = Date.now()) {
  return now - lastCheckedAt2 >= UPDATE_CHECK_INTERVAL_MS;
}
function initialUpdateStatus(currentVersion) {
  return { phase: "idle", currentVersion, manual: false };
}
function reduceUpdateStatus(current, event) {
  const base = {
    currentVersion: current.currentVersion,
    manual: current.manual,
    downgrade: current.downgrade
  };
  switch (event.type) {
    case "check":
      return { ...base, phase: "checking", manual: event.manual };
    case "available":
      return { ...base, phase: "available", availableVersion: event.version };
    case "progress":
      return { ...current, phase: "downloading", percent: clampPercent(event.percent) };
    case "downloaded":
      return { ...base, phase: "downloaded", availableVersion: event.version };
    case "not-available":
      return { ...base, phase: "up-to-date" };
    case "error":
      return { ...base, phase: "error", message: event.message };
    case "unsupported":
      return { ...base, phase: "unsupported", message: event.message };
    case "reset":
      return initialUpdateStatus(current.currentVersion);
  }
}
function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}
function skippedVersionPath(userDataPath) {
  return join(userDataPath, "update-skip.json");
}
function shouldOfferUpdate(version, skippedVersion2, manual) {
  return manual || version !== skippedVersion2;
}
function readSkippedVersion(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return typeof value.version === "string" && value.version ? value.version : void 0;
  } catch {
    return void 0;
  }
}
function writeSkippedVersion(path, version) {
  try {
    writeFileSync(path, `${JSON.stringify({ version }, void 0, 2)}
`, "utf8");
    return true;
  } catch {
    return false;
  }
}
const { autoUpdater } = electronUpdater;
const TRANSIENT_STATUS_MS = 8e3;
let status = initialUpdateStatus(app.getVersion());
let prepareToInstall;
let startupTimer;
let intervalTimer;
let resetTimer;
let checkPromise;
let lastCheckedAt = 0;
let installing = false;
let downloading = false;
let started = false;
let handlersRegistered = false;
let skippedVersion;
let skipLoaded = false;
let manualCheck = false;
let pendingDowngrade = false;
let selectedUpdateVersion;
function getUpdateStatus() {
  return { ...status };
}
function registerUpdateHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  ipcMain.handle("updates:status", () => getUpdateStatus());
  ipcMain.handle("updates:check", () => checkForUpdates(true));
  ipcMain.handle("updates:install", () => installDownloadedUpdate());
  ipcMain.handle("updates:skip", (_event, version) => skipUpdate(version));
  ipcMain.handle("updates:download", () => downloadAvailableUpdate());
  ipcMain.handle("updates:list-versions", () => fetchAvailableReleases(app.getVersion()));
  ipcMain.handle(
    "updates:install-version",
    (_event, version) => installSpecificVersion(version)
  );
}
function skipFile() {
  return skippedVersionPath(app.getPath("userData"));
}
function currentSkippedVersion() {
  if (!skipLoaded) {
    skippedVersion = readSkippedVersion(skipFile());
    skipLoaded = true;
  }
  return skippedVersion;
}
function skipUpdate(version) {
  if (typeof version !== "string" || !version) return getUpdateStatus();
  skippedVersion = version;
  skipLoaded = true;
  writeSkippedVersion(skipFile(), version);
  transition({ type: "reset" });
  return getUpdateStatus();
}
function startUpdateManager(options) {
  prepareToInstall = options.prepareToInstall;
  if (started) return;
  started = true;
  if (!supportsUpdates()) {
    transition({
      type: "unsupported",
      message: "Updates are available in installed macOS and Windows builds."
    });
    return;
  }
  configureUpdater();
  startupTimer = setTimeout(
    () => void checkForUpdates(),
    UPDATE_STARTUP_DELAY_MS + Math.random() * UPDATE_STARTUP_JITTER_MS
  );
  intervalTimer = setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
  powerMonitor.on("resume", checkAfterResume);
}
async function checkForUpdates(manual = false) {
  if (!supportsUpdates()) {
    transition(
      {
        type: "unsupported",
        message: "Update checks are only available in installed macOS and Windows builds."
      },
      manual
    );
    if (manual) scheduleReset();
    return getUpdateStatus();
  }
  if (checkPromise || ["available", "downloading", "downloaded"].includes(status.phase)) {
    return getUpdateStatus();
  }
  transition({ type: "check", manual });
  manualCheck = manual;
  lastCheckedAt = Date.now();
  selectedUpdateVersion = void 0;
  checkPromise = (async () => {
    const policy = await checkDesktopUpdate();
    if (!policy.updateAvailable) {
      transition({ type: "not-available" });
      scheduleReset();
      return;
    }
    selectedUpdateVersion = policy.version;
    autoUpdater.setFeedURL({ provider: "generic", url: policy.feedUrl });
    autoUpdater.allowPrerelease = isPrereleaseVersion(policy.version);
    autoUpdater.allowDowngrade = false;
    const result = await autoUpdater.checkForUpdates();
    if (result?.updateInfo.version !== policy.version) throw new Error("Update archive does not match the selected version");
  })();
  try {
    await checkPromise;
  } catch (error) {
    transition({ type: "error", message: errorMessage(error) });
    if (manual) scheduleReset();
  } finally {
    checkPromise = void 0;
  }
  return getUpdateStatus();
}
async function downloadAvailableUpdate() {
  if (status.phase !== "available" || downloading) return getUpdateStatus();
  downloading = true;
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    transition({ type: "error", message: errorMessage(error) });
    if (status.manual) scheduleReset();
  } finally {
    downloading = false;
  }
  return getUpdateStatus();
}
async function installSpecificVersion(version) {
  if (!isVersion(version)) return getUpdateStatus();
  if (!supportsUpdates()) return getUpdateStatus();
  if (checkPromise || ["checking", "downloading", "downloaded"].includes(status.phase)) {
    return getUpdateStatus();
  }
  selectedUpdateVersion = version;
  pendingDowngrade = compareVersions(version, app.getVersion()) < 0;
  autoUpdater.setFeedURL({ provider: "generic", url: archiveFeedUrl(version) });
  autoUpdater.allowDowngrade = true;
  autoUpdater.allowPrerelease = isPrereleaseVersion(version);
  manualCheck = true;
  transition({ type: "check", manual: true });
  lastCheckedAt = Date.now();
  checkPromise = autoUpdater.checkForUpdates();
  try {
    await checkPromise;
    if (status.phase === "available" && status.availableVersion === version) {
      await downloadAvailableUpdate();
    } else if (status.phase !== "downloading" && status.phase !== "downloaded") {
      transition({ type: "error", message: "在更新源未找到该版本" });
      scheduleReset();
    }
  } catch (error) {
    transition({ type: "error", message: errorMessage(error) });
    scheduleReset();
  } finally {
    checkPromise = void 0;
    autoUpdater.setFeedURL({ provider: "generic", url: STABLE_FEED_URL });
    autoUpdater.allowDowngrade = false;
    pendingDowngrade = false;
    autoUpdater.allowPrerelease = false;
  }
  return getUpdateStatus();
}
async function installDownloadedUpdate() {
  if (status.phase !== "downloaded" || installing) return;
  installing = true;
  try {
    await prepareToInstall?.();
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    installing = false;
    transition({ type: "error", message: errorMessage(error) }, true);
    scheduleReset();
  }
}
function stopUpdateManager() {
  if (startupTimer) clearTimeout(startupTimer);
  if (intervalTimer) clearInterval(intervalTimer);
  if (resetTimer) clearTimeout(resetTimer);
  startupTimer = void 0;
  intervalTimer = void 0;
  resetTimer = void 0;
  if (started && app.isReady()) powerMonitor.removeListener("resume", checkAfterResume);
}
function configureUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoInstallOnAppQuit = AUTO_INSTALL_ON_APP_QUIT;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (...args) => console.info("[updater]", ...args),
    warn: (...args) => console.warn("[updater]", ...args),
    error: (...args) => console.error("[updater]", ...args),
    debug: (...args) => console.debug("[updater]", ...args)
  };
  autoUpdater.on(
    "checking-for-update",
    () => transition({ type: "check", manual: status.manual })
  );
  autoUpdater.on("update-available", (info) => {
    if (info.version !== selectedUpdateVersion) {
      transition({ type: "error", message: "Update archive does not match the selected version" });
      return;
    }
    if (!shouldOfferUpdate(info.version, currentSkippedVersion(), manualCheck)) {
      console.info("[updater] skipping", info.version, "at the user’s request");
      transition({ type: "reset" });
      return;
    }
    transition({ type: "available", version: info.version });
  });
  autoUpdater.on(
    "download-progress",
    (progress) => transition({ type: "progress", percent: progress.percent })
  );
  autoUpdater.on("update-not-available", () => {
    transition({ type: "not-available" });
    scheduleReset();
  });
  autoUpdater.on(
    "update-downloaded",
    (info) => transition({ type: "downloaded", version: info.version })
  );
  autoUpdater.on("error", (error) => {
    transition({ type: "error", message: errorMessage(error) });
    if (status.manual) scheduleReset();
  });
}
function transition(event, manualOverride) {
  if (event.type !== "reset" && resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = void 0;
  }
  status = reduceUpdateStatus(status, event);
  if (manualOverride !== void 0) status.manual = manualOverride;
  if (pendingDowngrade && event.type !== "reset") status.downgrade = true;
  console.info("[updater] status", status.phase, status.percent ?? "");
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("updates:status-changed", getUpdateStatus());
  }
}
function scheduleReset() {
  if (!status.manual) return;
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => transition({ type: "reset" }), TRANSIENT_STATUS_MS);
}
function checkAfterResume() {
  if (shouldCheckAfterResume(lastCheckedAt)) void checkForUpdates();
}
function supportsUpdates() {
  return supportsAutoUpdates(app.isPackaged, process.platform);
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function resolveHarnessLocale(preference, preferredSystemLanguages) {
  if (preference === "zh" || preference === "en") return preference;
  return preferredSystemLanguages[0]?.toLowerCase().startsWith("zh") ? "zh" : "en";
}
const labels = {
  en: {
    openLink: "Open Link in Browser",
    copyLink: "Copy Link Address",
    copyImage: "Copy Image",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All"
  },
  zh: {
    openLink: "在浏览器中打开链接",
    copyLink: "复制链接地址",
    copyImage: "复制图片",
    undo: "撤销",
    redo: "重做",
    cut: "剪切",
    copy: "复制",
    paste: "粘贴",
    selectAll: "全选"
  }
};
function isExternalWebUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "127.0.0.1" && url.hostname !== "localhost";
  } catch {
    return false;
  }
}
function appendSection(template, section) {
  if (section.length === 0) return;
  if (template.length > 0) template.push({ type: "separator" });
  template.push(...section);
}
function buildContextMenuTemplate(state, locale, actions) {
  const text = labels[locale];
  const template = [];
  const hasSelection = state.selectionText.trim().length > 0;
  if (state.linkURL) {
    const linkItems = [];
    if (isExternalWebUrl(state.linkURL)) {
      linkItems.push({
        label: text.openLink,
        click: () => actions.openLink(state.linkURL)
      });
    }
    linkItems.push({
      label: text.copyLink,
      click: () => actions.copyLink(state.linkURL)
    });
    appendSection(template, linkItems);
  }
  if (state.hasImageContents) {
    appendSection(template, [
      {
        label: text.copyImage,
        click: actions.copyImage
      }
    ]);
  }
  if (state.isEditable) {
    appendSection(template, [
      { label: text.undo, role: "undo", enabled: state.editFlags.canUndo },
      { label: text.redo, role: "redo", enabled: state.editFlags.canRedo },
      { type: "separator" },
      { label: text.cut, role: "cut", enabled: state.editFlags.canCut },
      {
        label: text.copy,
        role: "copy",
        enabled: state.editFlags.canCopy || hasSelection
      },
      { label: text.paste, role: "paste", enabled: state.editFlags.canPaste },
      { type: "separator" },
      { label: text.selectAll, role: "selectAll", enabled: state.editFlags.canSelectAll }
    ]);
  } else {
    const contentItems = [];
    if (hasSelection) {
      contentItems.push({ label: text.copy, role: "copy" });
    }
    contentItems.push({ label: text.selectAll, role: "selectAll" });
    appendSection(template, contentItems);
  }
  return template;
}
function installContextMenu(window, locale) {
  window.webContents.on("context-menu", (_event, params) => {
    const template = buildContextMenuTemplate(params, locale(), {
      openLink: (url) => {
        void shell.openExternal(url);
      },
      copyLink: (url) => clipboard.writeText(url),
      copyImage: () => {
        if (window.isDestroyed()) return;
        window.webContents.copyImageAt(params.x, params.y);
      }
    });
    if (template.length === 0 || window.isDestroyed()) return;
    Menu.buildFromTemplate(template).popup({ window });
  });
}
function displayPluginName(packageName) {
  if (!packageName.startsWith("@")) return packageName;
  return packageName.slice(packageName.indexOf("/") + 1);
}
function latestAttemptText(logs) {
  let startIndex = -1;
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    if (logs[index]?.trimStart().startsWith("[desktop] starting ")) {
      startIndex = index;
      break;
    }
  }
  return logs.slice(startIndex + 1).join("\n");
}
function describePluginFailure(logs, locale) {
  const text = latestAttemptText(logs);
  const duplicateRoute = text.match(/duplicate prefix route ["']([^"']+)["']/i)?.[1];
  if (duplicateRoute) {
    return locale === "zh" ? {
      title: "插件使用了重复的服务入口",
      detail: `启动日志显示 ${duplicateRoute} 被重复注册，因此 Harness 无法继续启动。`
    } : {
      title: "A plugin registered a duplicate service route",
      detail: `The startup log shows that ${duplicateRoute} was registered more than once, so Harness could not continue.`
    };
  }
  if (/duplicate loader entry id/i.test(text)) {
    const entryId = text.match(/duplicate loader entry id:\s*([^\s]+)/i)?.[1];
    return locale === "zh" ? {
      title: "插件注册了重复的服务组件",
      detail: `启动日志显示组件 ${entryId ? `"${entryId}"` : ""} 被重复定义，插件之间存在加载冲突，因此 Harness 无法继续启动。`
    } : {
      title: "A plugin registered a duplicate service component",
      detail: `The startup log shows that component ${entryId ? `"${entryId}"` : ""} was registered more than once due to a plugin conflict.`
    };
  }
  if (/cannot resolve profile bundle/i.test(text)) {
    return locale === "zh" ? {
      title: "插件没有完整安装",
      detail: "配置中仍然引用了这个插件，但本地找不到对应的插件包。"
    } : {
      title: "The plugin is not fully installed",
      detail: "The profile still references this plugin, but its package cannot be found locally."
    };
  }
  if (/declares no dsh\.bundle/i.test(text)) {
    return locale === "zh" ? {
      title: "安装的包不是兼容的 DSH 插件",
      detail: "这个包缺少 DSH 插件所需的入口声明，因此 Harness 无法加载。"
    } : {
      title: "The package is not a compatible DSH plugin",
      detail: "It does not declare the entry point required by Harness."
    };
  }
  if (/single slot\s+["'][^"']+["']\s+already has a registration/i.test(text)) {
    const slotName = text.match(/single slot\s+["']([^"']+)["']/i)?.[1];
    return locale === "zh" ? {
      title: "插件存在界面插槽冲突",
      detail: `检测到界面插槽 ${slotName ? `"${slotName}"` : ""} 存在重复注册，多个第三方插件试图占用相同的界面组件，导致前端无法正常渲染。`
    } : {
      title: "A plugin has a UI slot conflict",
      detail: `UI slot ${slotName ? `"${slotName}"` : ""} has duplicate registrations from conflicting plugins.`
    };
  }
  if (/failed to import loader entry/i.test(text)) {
    return locale === "zh" ? {
      title: "插件代码加载失败",
      detail: "插件文件可能损坏、缺少依赖，或与当前 Harness 版本不兼容。"
    } : {
      title: "The plugin code could not be loaded",
      detail: "Its files may be damaged, missing a dependency, or incompatible with this Harness version."
    };
  }
  return locale === "zh" ? {
    title: "插件启动失败",
    detail: "Harness 在加载插件时发生错误，但暂时无法自动判断更具体的原因。"
  } : {
    title: "A plugin failed during startup",
    detail: "Harness reported an error while loading a plugin, but the exact cause could not be determined automatically."
  };
}
function buildPluginRecoveryViewModel(options) {
  const { snapshot, locale, notice, upgradeCandidate } = options;
  const pluginPackages = [...new Set(options.plugins)];
  const plugins = pluginPackages.map(displayPluginName);
  const removedPlugins = [...new Set(options.removedPlugins)].map(displayPluginName);
  const canUninstall = plugins.length > 0;
  const description = describePluginFailure(snapshot.logs, locale);
  const multiple = plugins.length > 1;
  const plan = planPluginRecovery(options.pluginChecks ?? []);
  const hasActions = plan.upgrades.length + plan.removals.length > 0;
  const retryCheck = (options.pluginChecks?.length ?? 0) > 0 && !hasActions;
  if (locale === "zh") {
    return {
      locale,
      brand: "DSH Desktop",
      badge: "启动修复",
      heading: canUninstall ? multiple ? `发现 ${plugins.length} 个导致启动失败的插件` : "发现导致启动失败的插件" : "Harness 暂时无法启动",
      summary: canUninstall ? "" : "暂时无法定位到具体插件。你可以进入安全模式，停用所有第三方插件并继续使用 Agent。",
      reasonTitle: description.title,
      reasonDetail: description.detail,
      plugins,
      removedPlugins,
      progress: removedPlugins.length > 0 ? `已处理 ${removedPlugins.length} 个插件，正在继续检查剩余问题。` : void 0,
      notice,
      safetyNote: "工作区、会话、模型配置和其他插件不会被删除。",
      primaryLabel: canUninstall ? multiple ? `卸载这 ${plugins.length} 个插件并继续检测` : "卸载此插件并继续检测" : "进入安全模式",
      primaryBusyLabel: canUninstall ? "正在处理并重新检测…" : "正在进入安全模式…",
      autoProcessLabel: hasActions ? `一键自动处理（升级 ${plan.upgrades.length}，卸载 ${plan.removals.length}）` : void 0,
      retryCheckLabel: retryCheck ? "重新检查更新" : void 0,
      pluginChecks: options.pluginChecks,
      upgradeCandidate,
      upgradeLabel: upgradeCandidate ? "升级插件并重启" : void 0,
      upgradeBusyLabel: upgradeCandidate ? "正在升级…" : void 0,
      upgradeHint: upgradeCandidate ? upgradeCandidate.upgradeHint ?? `该插件有新的兼容版本（${upgradeCandidate.targetVersion.startsWith("v") ? upgradeCandidate.targetVersion : `v${upgradeCandidate.targetVersion}`}）` : void 0,
      uninstallLabel: upgradeCandidate ? "卸载插件" : void 0,
      logLabel: "打开 Harness 日志",
      advancedLabel: "查看技术详情",
      errorLabel: "错误信息",
      launchDirectoryLabel: "启动目录",
      launchDirectory: snapshot.launchDirectory,
      rawError: snapshot.message,
      quitLabel: "退出 DSH Desktop",
      safeModeLabel: "进入安全模式",
      canUninstall
    };
  }
  return {
    locale,
    brand: "DSH Desktop",
    badge: "Startup recovery",
    heading: canUninstall ? multiple ? `${plugins.length} plugins are preventing startup` : "A plugin is preventing startup" : "Harness could not start",
    summary: canUninstall ? "" : "No specific plugin could be identified. Enter Safe Mode to disable all third-party plugins and keep using the Agent.",
    reasonTitle: description.title,
    reasonDetail: description.detail,
    plugins,
    removedPlugins,
    progress: removedPlugins.length > 0 ? `${removedPlugins.length} plugin${removedPlugins.length === 1 ? "" : "s"} handled. Checking for remaining issues.` : void 0,
    notice,
    safetyNote: "Your workspaces, sessions, model settings, and other plugins will not be removed.",
    primaryLabel: canUninstall ? multiple ? `Remove these ${plugins.length} plugins and continue` : "Remove this plugin and continue" : "Enter Safe Mode",
    primaryBusyLabel: canUninstall ? "Removing and checking again…" : "Entering Safe Mode…",
    autoProcessLabel: hasActions ? `Auto-recover (${plan.upgrades.length} upgrades, ${plan.removals.length} removals)` : void 0,
    retryCheckLabel: retryCheck ? "Retry update checks" : void 0,
    pluginChecks: options.pluginChecks,
    upgradeCandidate,
    upgradeLabel: upgradeCandidate ? "Upgrade plugin and restart" : void 0,
    upgradeBusyLabel: upgradeCandidate ? "Upgrading…" : void 0,
    upgradeHint: upgradeCandidate ? upgradeCandidate.upgradeHint ?? `A compatible update is available (${upgradeCandidate.targetVersion.startsWith("v") ? upgradeCandidate.targetVersion : `v${upgradeCandidate.targetVersion}`})` : void 0,
    uninstallLabel: upgradeCandidate ? "Uninstall plugin" : void 0,
    logLabel: "Open Harness log",
    advancedLabel: "View technical details",
    errorLabel: "Error details",
    launchDirectoryLabel: "Launch directory",
    launchDirectory: snapshot.launchDirectory,
    rawError: snapshot.message,
    quitLabel: "Quit DSH Desktop",
    safeModeLabel: "Enter Safe Mode",
    canUninstall
  };
}
function buildWebImportViewModel(options) {
  const zh = options.locale === "zh";
  const sessionCount = options.preview.sessionCount ?? 0;
  const workspaceCount = options.preview.workspaceCount ?? 0;
  const presetCount = options.preview.presetCount ?? 0;
  const plugins = [...options.preview.plugins ?? []];
  const stats = zh ? [
    `${sessionCount} 个会话`,
    `${workspaceCount} 个工作区`,
    `${presetCount} 个自定义 Preset`,
    options.preview.hasCredentials ? "已保存模型密钥" : "未检测到模型密钥"
  ] : [
    `${sessionCount} session${sessionCount === 1 ? "" : "s"}`,
    `${workspaceCount} workspace${workspaceCount === 1 ? "" : "s"}`,
    `${presetCount} custom preset${presetCount === 1 ? "" : "s"}`,
    options.preview.hasCredentials ? "Model credentials found" : "No model credentials found"
  ];
  return {
    locale: options.locale,
    brand: "DSH Desktop",
    badge: zh ? "导入" : "Import",
    heading: zh ? "发现网页版数据" : "Web Harness data found",
    summary: zh ? "本机已有 DeepSeek Harness 网页版数据。导入后桌面与网页版各自独立，网页版数据不会被改写。" : "This computer already has DeepSeek Harness web data. Import copies it once; the web home is left unchanged and the two copies stay independent.",
    stats,
    plugins,
    pluginsLabel: plugins.length > 0 ? zh ? `将重装 ${plugins.length} 个社区插件` : `${plugins.length} community plugin${plugins.length === 1 ? "" : "s"} will be reinstalled` : void 0,
    safetyNote: zh ? "只复制会话、设置、密钥和工作区清单。网页版可以继续使用。" : "Only sessions, settings, credentials, and workspace records are copied. The web copy remains usable.",
    primaryLabel: zh ? "导入并继续" : "Import and continue",
    primaryBusyLabel: zh ? "正在导入…" : "Importing…",
    secondaryLabel: zh ? "从空白开始" : "Start empty",
    notice: options.notice
  };
}
const DECISION_FILE = ".web-import-decision.json";
const IMPORT_TMP_SUFFIX = ".import-tmp";
const KEEP_IN_SHARED_TREE = /* @__PURE__ */ new Set([
  "dshmarket",
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app"
]);
const HOME_FILES = ["settings.yaml", ".credentials.yaml"];
const HOME_DIRECTORIES = [
  "sessions",
  "storages",
  ".agent-presets",
  "skills",
  "attachments",
  "plugins"
];
const PROFILE_FILES = [
  "package.json",
  "cordis.patch.yml",
  ".npmrc",
  "pnpm-workspace.yaml"
];
const WORKSPACE_REGISTRY = "workspace.json";
function defaultWebHome() {
  return join(homedir(), ".dsh");
}
function importDecisionPath(desktopHome) {
  return join(desktopHome, DECISION_FILE);
}
function importTmpPath(desktopHome) {
  return `${resolve(desktopHome)}${IMPORT_TMP_SUFFIX}`;
}
async function inspectWebHome(path) {
  if (!path || !await isDirectory(path)) return false;
  return await isFile(join(path, "settings.yaml")) || await isDirectory(join(path, "sessions")) || await isFile(join(path, "profiles", "web", "package.json"));
}
async function desktopHomeIsUnused(desktopHome) {
  if (await readImportDecision(desktopHome)) return false;
  if (await isFile(join(desktopHome, "settings.yaml"))) return false;
  if (await directoryHasEntries(join(desktopHome, "sessions"))) return false;
  return true;
}
async function shouldOfferWebHomeImport(desktopHome, webHome = defaultWebHome()) {
  if (!desktopHome || !webHome) return false;
  if (resolve(desktopHome) === resolve(webHome)) return false;
  if (!await desktopHomeIsUnused(desktopHome)) return false;
  return inspectWebHome(webHome);
}
async function previewWebHome(path) {
  const looksLikeHome = await inspectWebHome(path);
  if (!looksLikeHome) {
    return {
      path,
      looksLikeHome: false,
      sessionCount: 0,
      workspaceCount: 0,
      presetCount: 0,
      plugins: [],
      hasCredentials: false
    };
  }
  const plugins = await communityPluginNames(path);
  return {
    path,
    looksLikeHome: true,
    sessionCount: await countChildDirectories(join(path, "sessions")),
    workspaceCount: await countWorkspaceEntries(join(path, "storages")),
    presetCount: await countPresets(join(path, ".agent-presets")),
    plugins,
    hasCredentials: await hasCredentials(join(path, ".credentials.yaml"))
  };
}
async function readImportDecision(desktopHome) {
  try {
    const value = JSON.parse(await readFile(importDecisionPath(desktopHome), "utf8"));
    if (value.decision !== "imported" && value.decision !== "skipped") return void 0;
    return value;
  } catch {
    return void 0;
  }
}
async function writeSkipDecision(desktopHome, source = defaultWebHome()) {
  await writeDecision(desktopHome, "skipped", source);
}
async function writeImportedDecision(desktopHome, source) {
  await writeDecision(desktopHome, "imported", source);
}
async function importWebHome(options) {
  const source = resolve(options.source);
  const dest = resolve(options.dest);
  if (source === dest) {
    throw new Error("web home and desktop home must be different directories");
  }
  if (!await inspectWebHome(source)) {
    throw new Error("source is not a Harness home");
  }
  if (!await desktopHomeIsUnused(dest)) {
    throw new Error("desktop home already has user data");
  }
  const tmp = importTmpPath(dest);
  const note = options.onProgress ?? (() => void 0);
  await rm(tmp, { recursive: true, force: true });
  try {
    await mkdir(tmp, { recursive: true });
    await copyHomePayload(source, tmp, note);
    await replaceUnusedDest(dest, tmp);
    await writeImportedDecision(dest, source);
    note("imported");
  } catch (error) {
    await rm(tmp, { recursive: true, force: true });
    throw error;
  }
}
async function writeDecision(desktopHome, decision, source) {
  await mkdir(desktopHome, { recursive: true });
  const payload = {
    decision,
    source,
    at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeFile(importDecisionPath(desktopHome), `${JSON.stringify(payload)}
`, "utf8");
}
async function copyHomePayload(source, dest, note) {
  for (const name of HOME_FILES) {
    await copyIfPresent(join(source, name), join(dest, name), dest, note);
  }
  for (const name of HOME_DIRECTORIES) {
    await copyIfPresent(join(source, name), join(dest, name), dest, note);
  }
  const sourceProfile = join(source, "profiles", "web");
  const destProfile = join(dest, "profiles", "web");
  for (const name of PROFILE_FILES) {
    await copyIfPresent(join(sourceProfile, name), join(destProfile, name), dest, note);
  }
  const destWorkspaceYaml = join(destProfile, "pnpm-workspace.yaml");
  if (!await exists(destWorkspaceYaml)) {
    await writeFile(
      destWorkspaceYaml,
      "packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n",
      "utf8"
    );
  }
  const plugins = await plannedCommunityPlugins(source);
  for (const plugin of plugins) {
    const sourcePath = plugin.copyDirectory ? plugin.packageDir : join(plugin.packageDir, "package.json");
    const destPath = plugin.copyDirectory ? join(destProfile, "node_modules", plugin.name) : join(destProfile, "node_modules", plugin.name, "package.json");
    await copyIfPresent(sourcePath, destPath, dest, note);
  }
}
async function plannedCommunityPlugins(webHome) {
  const names = await communityPluginNames(webHome);
  const manifest = await readProfileManifest(webHome);
  const planned = [];
  for (const name of names) {
    const packageDir = join(webHome, "profiles", "web", "node_modules", name);
    const declared = manifest.dependencies?.[name];
    const sourceSpec = typeof declared === "string" ? declared : `${name}@0.0.0`;
    planned.push({
      name,
      packageDir,
      copyDirectory: usesExternalSource(sourceSpec)
    });
  }
  return planned;
}
async function communityPluginNames(webHome) {
  const manifest = await readProfileManifest(webHome);
  const names = /* @__PURE__ */ new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...manifest.dsh?.profile?.bundles ?? []
  ]);
  return [...names].filter((name) => !KEEP_IN_SHARED_TREE.has(name)).sort();
}
function usesExternalSource(spec) {
  return spec.includes(":") || spec.includes("/") || spec.startsWith(".");
}
function assertInsideDest(destRoot, target) {
  const path = relative(resolve(destRoot), resolve(target));
  if (path.startsWith("..") || isAbsolute(path)) {
    throw new Error("copy destination escaped the desktop home");
  }
}
async function readProfileManifest(webHome) {
  try {
    const value = JSON.parse(
      await readFile(join(webHome, "profiles", "web", "package.json"), "utf8")
    );
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
async function copyIfPresent(sourcePath, destPath, destRoot, note) {
  if (!await exists(sourcePath)) return;
  assertInsideDest(destRoot, destPath);
  await mkdir(dirname(destPath), { recursive: true });
  note(relative(destRoot, destPath) || destPath);
  await cp(sourcePath, destPath, {
    recursive: true,
    dereference: true,
    force: true,
    errorOnExist: false
  });
}
async function replaceUnusedDest(dest, tmp) {
  if (!await desktopHomeIsUnused(dest)) {
    throw new Error("desktop home became used while copying");
  }
  if (existsSync(dest)) {
    await rm(dest, { recursive: true, force: true });
  }
  await rename(tmp, dest);
}
async function countWorkspaceEntries(storagesDir) {
  const registryPath = join(storagesDir, WORKSPACE_REGISTRY);
  try {
    const value = JSON.parse(await readFile(registryPath, "utf8"));
    return countWorkspaceValue(value);
  } catch {
    return 0;
  }
}
function countWorkspaceValue(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  const record = value;
  for (const key of ["items", "workspaces", "entries"]) {
    if (Array.isArray(record[key])) return record[key].length;
  }
  const values = Object.values(record).filter((entry) => entry && typeof entry === "object");
  if (values.some((entry) => {
    const item = entry;
    return typeof item.path === "string" || typeof item.workspaceId === "string";
  })) {
    return values.length;
  }
  return Object.keys(record).filter((key) => !key.startsWith("_") && key !== "version").length;
}
async function countPresets(presetDir) {
  if (!await isDirectory(presetDir)) return 0;
  const entries = await readdir(presetDir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => !entry.name.startsWith(".")).length;
}
async function countChildDirectories(directory) {
  if (!await isDirectory(directory)) return 0;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).length;
}
async function directoryHasEntries(directory) {
  if (!await isDirectory(directory)) return false;
  const entries = await readdir(directory).catch(() => []);
  return entries.some((name) => !name.startsWith("."));
}
async function hasCredentials(path) {
  try {
    const text = await readFile(path, "utf8");
    return text.trim().length > 0;
  } catch {
    return false;
  }
}
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
function shouldStartInSafeMode(argv) {
  return argv.includes("--safe-mode");
}
function buildSafeModeViewModel(options) {
  const issues = (options.issues ?? []).map((issue) => {
    const zh = options.locale === "zh";
    const kindLabel = issue.kind === "unverified-module-reference" ? zh ? "兼容性待确认" : "Compatibility unverified" : zh ? issue.kind === "core-version-mismatch" ? "核心版本冲突" : issue.kind === "missing-client-module" ? "插件版本不兼容" : "Workspace 依赖污染" : issue.kind === "core-version-mismatch" ? "Core version conflict" : issue.kind === "missing-client-module" ? "Incompatible plugin" : "Workspace dependency conflict";
    const actionLabel = issue.resolution === "inspect-only" ? zh ? "仅提示；运行正常时无需处理" : "Informational; no action needed if working" : zh ? issue.resolution === "disable-plugin" ? "暂停插件（保留数据）" : issue.resolution === "quarantine-workspace" ? "隔离 Workspace（可恢复）" : "重建冲突依赖" : issue.resolution === "disable-plugin" ? "Disable plugin (keep data)" : issue.resolution === "quarantine-workspace" ? "Quarantine workspace (recoverable)" : "Rebuild conflicting dependencies";
    const versionLabel = issue.installedVersion ? zh ? `当前 ${issue.installedVersion}${issue.expectedVersion ? ` · 需要 ${issue.expectedVersion}` : ""}` : `Installed ${issue.installedVersion}${issue.expectedVersion ? ` · expected ${issue.expectedVersion}` : ""}` : void 0;
    return {
      ...issue,
      kindLabel,
      severityLabel: zh ? issue.severity === "blocking" ? "阻断" : "警告" : issue.severity,
      actionLabel,
      versionLabel
    };
  });
  const pluginIssues = issues.filter((issue) => issue.resolution === "disable-plugin");
  const incompatiblePlugins = new Set(pluginIssues.map((issue) => issue.target));
  const suspectedPlugins = new Set(options.suspectedPlugins ?? []);
  const plugins = [.../* @__PURE__ */ new Set([
    ...options.plugins,
    ...incompatiblePlugins,
    ...suspectedPlugins
  ])].sort((left, right) => Number(suspectedPlugins.has(right)) - Number(suspectedPlugins.has(left)));
  const healthReportByPlugin = new Map(
    (options.healthReports ?? []).map((report) => [report.packageName, report])
  );
  const pluginItems = plugins.map((name) => {
    const incompatible = incompatiblePlugins.has(name);
    const suspected = suspectedPlugins.has(name);
    const report = healthReportByPlugin.get(name);
    const labels2 = [
      ...suspected ? [options.locale === "zh" ? "本次启动日志推断" : "inferred from this startup log"] : [],
      ...incompatible ? [options.locale === "zh" ? "版本不兼容" : "version incompatible"] : []
    ];
    if (report?.healthLabel) {
      labels2.push(report.healthLabel);
    }
    const statusTone = incompatible ? "danger" : suspected ? "warning" : report?.upgradeReady ? "success" : void 0;
    const upgradeButtonLabel = report?.upgradeReady && report.upgradeVersion ? options.locale === "zh" ? `升级至 v${report.upgradeVersion}` : `Upgrade to v${report.upgradeVersion}` : void 0;
    return {
      name,
      statusLabel: labels2.length > 0 ? options.locale === "zh" ? `（${labels2.join("，")}）` : `(${labels2.join(", ")})` : void 0,
      statusTone,
      actionLabel: options.locale === "zh" ? "卸载插件" : "Remove plugin",
      incompatible,
      suspected,
      ...report?.healthStatus !== void 0 ? { healthStatus: report.healthStatus } : {},
      ...report?.healthLabel !== void 0 ? { healthLabel: report.healthLabel } : {},
      ...report?.installedVersion !== void 0 ? { installedVersion: report.installedVersion } : {},
      ...report?.latestVersion !== void 0 ? { latestVersion: report.latestVersion } : {},
      ...report?.upgradeReady !== void 0 ? { upgradeReady: report.upgradeReady } : {},
      ...report?.upgradeVersion !== void 0 ? { upgradeVersion: report.upgradeVersion } : {},
      ...upgradeButtonLabel !== void 0 ? { upgradeButtonLabel } : {}
    };
  });
  const upgradeReadyCount = pluginItems.filter((item) => item.upgradeReady).length;
  const groups = /* @__PURE__ */ new Map();
  for (const issue of issues.filter((issue2) => issue2.resolution !== "disable-plugin")) {
    const id = issue.groupId ?? `${issue.resolution}:${issue.target}`;
    const grouped = groups.get(id) ?? [];
    grouped.push(issue);
    groups.set(id, grouped);
  }
  const issueGroups = [...groups.entries()].map(([id, grouped]) => {
    const first = grouped[0];
    const zh = options.locale === "zh";
    const groupKind = first.groupKind ?? (first.resolution === "disable-plugin" ? "plugin" : first.resolution === "quarantine-workspace" ? "workspace" : "profile");
    const name = groupKind === "profile" ? "Profile" : first.groupName ?? first.packageName;
    const actionLabel = [...new Set(grouped.map((issue) => issue.actionLabel))].join(zh ? "；" : "; ");
    return {
      id,
      name,
      kindLabel: zh ? groupKind === "plugin" ? "根插件" : groupKind === "workspace" ? "Workspace" : "Profile" : groupKind === "plugin" ? "Root plugin" : groupKind === "workspace" ? "Workspace" : "Profile",
      severityLabel: grouped.some((issue) => issue.severity === "blocking") ? zh ? "阻断" : "blocking" : zh ? "警告" : "warning",
      actionLabel,
      countLabel: zh ? `包含 ${grouped.length} 项检测结果` : `${grouped.length} finding${grouped.length === 1 ? "" : "s"}`,
      detailLabel: zh ? `查看 ${grouped.length} 项详情` : `View ${grouped.length} detail${grouped.length === 1 ? "" : "s"}`,
      issueIds: grouped.filter((issue) => issue.resolution !== "inspect-only").map((issue) => issue.id),
      issues: grouped
    };
  });
  const blockingGroups = new Set(
    issues.filter((issue) => issue.severity === "blocking").map((issue) => issue.groupId ?? `${issue.resolution}:${issue.target}`)
  ).size;
  const backupItems = (options.backups ?? []).map((backup) => {
    const zh = options.locale === "zh";
    const cleanupReady = backup.bootVerifiedAt !== void 0 && backup.restoreStartedAt === void 0;
    const generationCount = backup.generationIds?.length ?? 0;
    const incomplete = backup.integrity === "incomplete";
    const restoreLocked = options.backupRestoreLocked ?? options.recoveryLocked;
    const restoreReady = backup.canRestore === true && (restoreLocked !== true || options.allowedRestoreId === backup.removalId);
    const statusLabel = incomplete ? zh ? `备份校验失败：${backup.integrityDetail ?? "内容不完整"}。已禁止自动恢复。` : `Backup verification failed: ${backup.integrityDetail ?? "content is incomplete"}. Automatic restore is blocked.` : backup.restoreStartedAt !== void 0 ? zh ? `上次恢复未完成，正常 Profile 已锁定。请重试恢复；备份仍保留。${backup.restoreFailure ? ` ${backup.restoreFailure}` : ""}` : `The previous restore is incomplete and the normal Profile is locked. Retry restore; the backup is still kept.${backup.restoreFailure ? ` ${backup.restoreFailure}` : ""}` : backup.integrity === "legacy-unverified" ? zh ? "这是旧版保留的备份，没有内容校验清单；恢复前请先检查目录。" : "This backup was kept by an older version and has no checksum inventory; inspect it before restoring." : backup.status !== void 0 && backup.status !== "removed" ? zh ? `卸载尚未完成（${backup.status}）；恢复材料继续保留。` : `Removal is incomplete (${backup.status}); recovery material is still kept.` : backup.restoredAt !== void 0 ? zh ? `已于 ${backup.restoredAt} 恢复；备份仍会保留，直到你明确删除。` : `Restored ${backup.restoredAt}; the backup remains until you explicitly delete it.` : cleanupReady ? zh ? "已通过正常启动验证；仍会保留，直到你确认删除" : "Boot verified; kept until you confirm deletion" : zh ? "尚未通过正常启动验证，禁止删除" : "Not boot verified; deletion is blocked";
    return {
      removalId: backup.removalId,
      pluginName: backup.pluginName,
      backupDirectory: backup.backupDirectory,
      disabledAtLabel: zh ? `卸载于 ${backup.disabledAt}` : `Removed ${backup.disabledAt}`,
      ...generationCount === 0 ? {} : {
        generationLabel: zh ? `包含 ${generationCount} 个 generation 备份` : `${generationCount} generation backup${generationCount === 1 ? "" : "s"}`
      },
      cleanupReady: cleanupReady && (backup.status ?? "removed") === "removed" && options.recoveryLocked !== true,
      restoreReady,
      statusLabel,
      openLabel: zh ? "打开备份" : "Open backup",
      restoreLabel: zh ? "恢复插件…" : "Restore plugin…",
      deleteLabel: zh ? "永久删除…" : "Delete permanently…",
      deleteConfirm: zh ? `永久删除 ${backup.pluginName} 的这份恢复备份？此操作不可撤销。` : `Permanently delete this recovery backup for ${backup.pluginName}? This cannot be undone.`
    };
  });
  if (options.locale === "zh") {
    return {
      locale: "zh",
      brand: "DSH Desktop",
      badge: "安全模式",
      heading: "",
      summary: "部分第三方插件可能导致系统异常。安全模式会暂时停用所有第三方插件，确保基础功能正常使用，但不会删除插件。如需恢复正常模式，可尝试卸载近期安装的插件后重启。",
      plugins,
      pluginItems,
      issueGroups,
      backupItems,
      backupHeading: "插件恢复备份",
      backupSummary: options.recoveryLocked ? options.allowedRestoreId !== void 0 ? "正常 Profile 已锁定；只允许重试对应的插件备份恢复。备份不能删除。" : "恢复事务尚未完成。恢复材料已锁定，只允许查看，不能修复、卸载或删除，也不能恢复。" : "备份不会按启动次数自动删除。你可以打开目录检查；只有正常模式稳定启动后，才允许逐份永久清理。",
      recoveryLocked: options.recoveryLocked === true,
      recoveryOpenLabel: "打开恢复材料目录",
      emptyMessage: "当前 Profile 中没有可卸载的第三方插件。",
      selectionHint: "选择要卸载的插件",
      safetyNote: "工作区、会话、模型配置和未选中的插件不会被删除。",
      applyLabel: "卸载所选插件",
      applyBusyLabel: "正在卸载…",
      selectAllLabel: "全选",
      agentLabel: "关闭",
      agentBusyLabel: "正在关闭…",
      restartLabel: "退出安全模式并重启",
      restartBusyLabel: "正在重启…",
      restartConfirm: blockingGroups > 0 ? `仍有 ${blockingGroups} 组阻断问题。退出后会重新启用第三方插件，可能再次启动失败。仍然退出安全模式吗？` : void 0,
      quitLabel: "退出 DSH Desktop",
      notice: options.notice,
      noticeTone: options.noticeTone,
      upgradeAllLabel: upgradeReadyCount > 0 ? `一键升级 ${upgradeReadyCount} 个有更新的插件` : void 0,
      upgradeAllBusyLabel: "正在批量升级…",
      upgradeReadyCount
    };
  }
  return {
    locale: "en",
    brand: "DSH Desktop",
    badge: "Safe Mode",
    heading: "",
    summary: "Some third-party plugins may cause startup problems. Safe Mode temporarily disables all of them while the Agent remains available; the plugins are not deleted. Remove a recently installed plugin, then restart to try again.",
    plugins,
    pluginItems,
    issueGroups,
    backupItems,
    backupHeading: "Plugin recovery backups",
    backupSummary: options.recoveryLocked ? options.allowedRestoreId !== void 0 ? "The normal Profile is locked; only the matching plugin-backup restore retry is allowed. Backups cannot be deleted." : "A recovery transaction is incomplete. Recovery material is inspection-only; repair, removal, restore, and deletion are blocked." : "Backups are never deleted by launch count. Inspect them first; permanent per-backup cleanup is enabled only after a stable normal boot.",
    recoveryLocked: options.recoveryLocked === true,
    recoveryOpenLabel: "Open recovery material folder",
    emptyMessage: "There are no removable third-party plugins in this profile.",
    selectionHint: "Select plugins to remove",
    safetyNote: "Workspaces, sessions, model settings, and unselected plugins will not be removed.",
    applyLabel: "Remove selected plugins",
    applyBusyLabel: "Removing…",
    selectAllLabel: "Select all",
    agentLabel: "Close",
    agentBusyLabel: "Closing…",
    restartLabel: "Exit Safe Mode and restart",
    restartBusyLabel: "Restarting…",
    restartConfirm: blockingGroups > 0 ? `${blockingGroups} blocking group${blockingGroups === 1 ? "" : "s"} remain. Third-party plugins will be enabled again and startup may fail. Exit Safe Mode anyway?` : void 0,
    quitLabel: "Quit DSH Desktop",
    notice: options.notice,
    noticeTone: options.noticeTone,
    upgradeAllLabel: upgradeReadyCount > 0 ? `Upgrade ${upgradeReadyCount} plugin${upgradeReadyCount === 1 ? "" : "s"} with updates` : void 0,
    upgradeAllBusyLabel: "Upgrading plugins…",
    upgradeReadyCount
  };
}
function readPackageMetadata(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return void 0;
  }
}
function validVersion(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function bundledHarnessVersion(appPath) {
  const installedMetadata = readPackageMetadata(
    join(appPath, "node_modules", "@deepseek-ai", "dsh", "package.json")
  );
  const installedVersion = validVersion(installedMetadata?.version);
  if (installedVersion) return installedVersion;
  const appMetadata = readPackageMetadata(join(appPath, "package.json"));
  return validVersion(appMetadata?.dependencies?.["@deepseek-ai/dsh"]);
}
function aboutDetail(desktopVersion, harnessVersion, locale) {
  const harness = harnessVersion ?? (locale === "zh" ? "未知" : "Unknown");
  if (locale === "zh") {
    return `DSH Desktop 版本：${desktopVersion}
内置 Harness 版本：${harness}

Harness 随 DSH Desktop 更新。`;
  }
  return `DSH Desktop version: ${desktopVersion}
Bundled Harness version: ${harness}

Harness is updated with DSH Desktop.`;
}
const WINDOWS_CAPTION_CONTROLS_WIDTH = 140;
const WINDOWS_MENU_BUTTON_WIDTH = 44;
const WINDOWS_MENU_PANEL_WIDTH = 304;
const WINDOWS_MENU_PANEL_MAX_HEIGHT = 760;
function windowsMenuViewBounds(contentSize, menuOpen, fullscreen = false) {
  const contentWidth = Math.max(0, Math.floor(contentSize.width));
  const contentHeight = Math.max(0, Math.floor(contentSize.height));
  const captionWidth = fullscreen ? 0 : Math.min(WINDOWS_CAPTION_CONTROLS_WIDTH, contentWidth);
  const availableWidth = Math.max(0, contentWidth - captionWidth);
  const requestedWidth = menuOpen ? WINDOWS_MENU_PANEL_WIDTH : WINDOWS_MENU_BUTTON_WIDTH;
  const width = Math.min(requestedWidth, availableWidth);
  const height = menuOpen ? Math.min(WINDOWS_MENU_PANEL_MAX_HEIGHT, contentHeight) : Math.min(WINDOWS_TITLEBAR_HEIGHT, contentHeight);
  return {
    x: Math.max(0, contentWidth - captionWidth - width),
    y: 0,
    width,
    height
  };
}
function shouldKeepRunningInBackground(platform2, quitting2) {
  return platform2 === "win32" && !quitting2;
}
const MAIN_WINDOW_RECOVERY_RELOAD_COOLDOWN_MS = 5e3;
const MAIN_WINDOW_RECOVERY_MAX_RELOADS = 3;
function shouldReloadAfterMainWindowRendererLoss(options) {
  const cooldown = options.cooldownMs ?? MAIN_WINDOW_RECOVERY_RELOAD_COOLDOWN_MS;
  const maxReloads = options.maxReloads ?? MAIN_WINDOW_RECOVERY_MAX_RELOADS;
  if (options.reloadCount >= maxReloads) return false;
  if (options.lastReloadAt === 0) return true;
  return options.now - options.lastReloadAt >= cooldown;
}
const PLUGIN_RECOVERY_ACTIONS = /* @__PURE__ */ new Set([
  "check-updates",
  "auto-process",
  "uninstall",
  "upgrade",
  "show-log",
  "quit",
  "restart",
  "safe-mode"
]);
let mainWindow;
let windowsMenuView;
let windowsMenuOpen = false;
let windowsMenuDark = false;
let mobileWindow;
let tray;
let runtime;
let desktopStorageManager;
let mobileBridge;
let launchDirectory;
let quitting = false;
let failureRecoveryVisible = false;
let harnessLaunchOperation;
let pluginRecoveryActionResolver;
let webImportActionResolver;
let mainWindowNavigationVersion = 0;
let rendererPluginFailureLogs = [];
let pluginRecoveryRemovedPlugins = [];
let pluginRecoveryResetTimer;
let pendingFrontendPluginRecovery = false;
let pendingFrontendPluginRecoveryMessage;
let safeModeVisible = false;
let safeModeManagerVisible = false;
let safeModeManager;
let safeModeActionResolver;
let migrationRecoveryLocked = false;
let maintenanceRecoveryLocked = false;
let maintenanceAllowedRestoreId;
let profileBootConfirmationTimer;
let profileRendererHealthAt = 0;
let profileBootNavigationVersion = 0;
let profileBootConfirmationComplete = false;
let safeModeSuspectedPlugins = [];
let mainWindowRecoveryReloadAt = 0;
let mainWindowRecoveryReloadCount = 0;
const startInSafeMode = shouldStartInSafeMode(process.argv);
let harnessRendered = false;
let gpuFallbackState = defaultGpuFallbackState;
let gpuFallbackRelaunching = false;
let gpuStableLaunchTimer;
function appendRendererPluginFailureLog(message) {
  const trimmed = message.trim();
  if (!trimmed) return;
  const logLine = `[stderr] ${trimmed}`;
  if (rendererPluginFailureLogs.at(-1) === logLine) return;
  rendererPluginFailureLogs.push(logLine);
  rendererPluginFailureLogs = rendererPluginFailureLogs.slice(-50);
}
function queuePendingFrontendPluginRecovery(message) {
  pendingFrontendPluginRecovery = true;
  if (message) pendingFrontendPluginRecoveryMessage = message;
  resolvePluginRecoveryAction("refresh");
}
function takePendingFrontendPluginRecovery() {
  const pending = pendingFrontendPluginRecovery;
  const message = pendingFrontendPluginRecoveryMessage;
  pendingFrontendPluginRecovery = false;
  pendingFrontendPluginRecoveryMessage = void 0;
  return { pending, message };
}
function cancelPluginRecoverySessionReset() {
  if (pluginRecoveryResetTimer) clearTimeout(pluginRecoveryResetTimer);
  pluginRecoveryResetTimer = void 0;
}
function schedulePluginRecoverySessionReset() {
  cancelPluginRecoverySessionReset();
  pluginRecoveryResetTimer = setTimeout(() => {
    pluginRecoveryResetTimer = void 0;
    pluginRecoveryRemovedPlugins = [];
  }, 6e4);
}
function appendRendererPluginRecoveryLog(logs) {
  if (logs.length === 0) return;
  try {
    const evidence = logs.slice(-50).join("\n").slice(-2e4).split(/\r?\n/).map((line) => `[renderer] ${line}`).join("\n");
    appendFileSync(
      join(app.getPath("logs"), "harness.log"),
      `
[desktop] frontend plugin recovery ${(/* @__PURE__ */ new Date()).toISOString()}
${evidence}
`,
      "utf8"
    );
  } catch (error) {
    console.warn("[desktop] failed to persist frontend plugin recovery evidence", error);
  }
}
function appendPluginRecoveryDetectionLog(plugins) {
  try {
    const result = plugins.length > 0 ? plugins.join(", ") : "unresolved";
    appendFileSync(
      join(app.getPath("logs"), "harness.log"),
      `[desktop] plugin recovery detection: ${result}
`,
      "utf8"
    );
  } catch (error) {
    console.warn("[desktop] failed to persist plugin recovery detection", error);
  }
}
function isDevelopmentBuild() {
  if (!app.isPackaged) return true;
  try {
    const metadata = JSON.parse(
      readFileSync(join(app.getAppPath(), "package.json"), "utf8")
    );
    return metadata.dshDesktopChannel === "development";
  } catch {
    return false;
  }
}
const developmentBuild = isDevelopmentBuild();
function recordMainWindowRendererLoss(source, details) {
  if (!runtime) return;
  runtime.note(`[desktop] main window ${source}: ${details}`);
}
function reloadMainWindowAfterRendererLoss(window) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return;
  const now = Date.now();
  if (!shouldReloadAfterMainWindowRendererLoss({
    now,
    lastReloadAt: mainWindowRecoveryReloadAt,
    reloadCount: mainWindowRecoveryReloadCount
  })) {
    recordMainWindowRendererLoss(
      "render-process-gone",
      "reload throttled; surfacing harness failure instead"
    );
    const snapshot = runtime?.snapshot();
    if (snapshot && runtime?.snapshot().phase === "ready") {
      void showPluginRecovery({
        message: "Harness web view stopped responding. Reload it to continue.",
        logs: snapshot.logs
      }).catch(showUnexpectedError);
    }
    return;
  }
  mainWindowRecoveryReloadAt = now;
  mainWindowRecoveryReloadCount += 1;
  setTimeout(() => {
    mainWindowRecoveryReloadCount = 0;
  }, MAIN_WINDOW_RECOVERY_RELOAD_COOLDOWN_MS * 4).unref?.();
  try {
    void window.webContents.reload();
  } catch (error) {
    recordMainWindowRendererLoss(
      "render-process-gone",
      `reload threw: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
function installMainWindowRendererRecovery(window) {
  const webContents = window.webContents;
  webContents.on("render-process-gone", (event, details) => {
    clearProfileBootConfirmation();
    event.preventDefault();
    const reason = details?.reason ?? "unknown";
    const exitCode = details?.exitCode ?? -1;
    const currentUrl = (() => {
      try {
        return webContents.getURL();
      } catch {
        return "";
      }
    })();
    const gpuStatus = (() => {
      try {
        return JSON.stringify(app.getGPUFeatureStatus());
      } catch {
        return "";
      }
    })();
    recordMainWindowRendererLoss(
      "render-process-gone",
      `reason=${reason} exitCode=${exitCode}${currentUrl ? ` url=${currentUrl}` : ""}${gpuStatus ? ` gpu=${gpuStatus}` : ""}`
    );
    const unusableLaunch = !harnessRendered || mainWindowRecoveryReloadCount > 0;
    if (isRendererGpuFallbackCandidate({ platform: process.platform, reason, exitCode }) && respondToGpuFallbackSignal(
      `renderer native crash: reason=${reason} exitCode=${exitCode}`,
      { unusableLaunch }
    )) return;
    reloadMainWindowAfterRendererLoss(window);
  });
  webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    clearProfileBootConfirmation();
    recordMainWindowRendererLoss(
      "did-fail-load",
      `errorCode=${errorCode} description=${errorDescription} url=${validatedURL}`
    );
    reloadMainWindowAfterRendererLoss(window);
  });
  webContents.on("unresponsive", () => {
    clearProfileBootConfirmation();
    recordMainWindowRendererLoss("unresponsive", "main window webContents became unresponsive");
  });
  webContents.on("responsive", () => {
    if (!runtime) return;
    runtime.note("[desktop] main window webContents became responsive again");
  });
  webContents.on("did-start-navigation", (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) clearProfileBootConfirmation();
  });
}
function windowsTitleBarOverlay(isDark) {
  return {
    color: "#00000000",
    symbolColor: isDark ? "#f3f4f6" : "#202124",
    height: WINDOWS_TITLEBAR_HEIGHT
  };
}
function applyWindowChromeTheme(window, isDark) {
  if (window.isDestroyed()) return;
  window.setBackgroundColor(isDark ? "#141416" : "#ffffff");
  if (process.platform === "win32") {
    windowsMenuDark = isDark;
    window.setTitleBarOverlay(windowsTitleBarOverlay(isDark));
    if (windowsMenuView && !windowsMenuView.webContents.isDestroyed()) {
      windowsMenuView.webContents.send("desktop-titlebar:theme-changed", isDark);
    }
  }
}
function updateWindowsMenuViewBounds(window) {
  if (!windowsMenuView || windowsMenuView.webContents.isDestroyed() || window.isDestroyed()) return;
  const contentSize = window.getContentSize();
  const width = contentSize[0] ?? 0;
  const height = contentSize[1] ?? 0;
  windowsMenuView.setBounds(
    windowsMenuViewBounds({ width, height }, windowsMenuOpen, window.isFullScreen())
  );
}
function setWindowsMenuOpen(window, open, notifyRenderer = false) {
  windowsMenuOpen = open;
  updateWindowsMenuViewBounds(window);
  if (notifyRenderer && windowsMenuView && !windowsMenuView.webContents.isDestroyed()) {
    windowsMenuView.webContents.send("desktop-titlebar:close-menu");
  }
}
function attachWindowsMenuView(window) {
  const menuView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(import.meta.dirname, "../preload/windows-menu.cjs"),
      sandbox: true,
      webSecurity: true
    }
  });
  windowsMenuView = menuView;
  windowsMenuOpen = false;
  windowsMenuDark = nativeTheme.shouldUseDarkColors;
  menuView.setBackgroundColor("#00000000");
  menuView.webContents.setZoomFactor(1);
  menuView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  menuView.webContents.on("did-finish-load", () => {
    if (!menuView.webContents.isDestroyed()) {
      menuView.webContents.send("desktop-titlebar:theme-changed", windowsMenuDark);
    }
  });
  window.contentView.addChildView(menuView);
  updateWindowsMenuViewBounds(window);
  const updateBounds = () => updateWindowsMenuViewBounds(window);
  window.on("resize", updateBounds);
  window.on("enter-full-screen", updateBounds);
  window.on("leave-full-screen", updateBounds);
  window.on("blur", () => setWindowsMenuOpen(window, false, true));
  void loadDesktopResource(menuView.webContents, desktopResourcePath("windows-menu.html"), {
    query: {
      locale: harnessLocale(),
      theme: windowsMenuDark ? "dark" : "light"
    }
  }).catch(showUnexpectedError);
}
function configureAppIdentity() {
  if (developmentBuild) {
    app.setName("DSH Desktop Dev");
    app.setPath("userData", join(app.getPath("appData"), "dsh-desktop-dev"));
    return;
  }
  app.setName("DSH Desktop");
  app.setPath("userData", join(app.getPath("appData"), "dsh-desktop"));
}
async function syncNativeTheme(window) {
  if (window.isDestroyed()) return;
  const isDark = await window.webContents.executeJavaScript(
    `(() => {
      if (${process.platform === "darwin"}) {
        let dragRegion = document.getElementById('dsh-desktop-drag-region')
        if (!dragRegion) {
          dragRegion = document.createElement('div')
          dragRegion.id = 'dsh-desktop-drag-region'
          dragRegion.setAttribute('aria-hidden', 'true')
          Object.assign(dragRegion.style, {
            position: 'fixed',
            zIndex: '18',
            top: '0',
            left: '80px',
            right: '220px',
            height: '24px',
            background: 'transparent',
            pointerEvents: 'auto',
            userSelect: 'none'
          })
          dragRegion.style.setProperty('-webkit-app-region', 'drag')
          document.body.appendChild(dragRegion)
        }
      }
      if (document.body.hasAttribute('data-ds-dark-theme')) return true
      const color = getComputedStyle(document.body).backgroundColor
      const channels = color.match(/[\\d.]+/g)?.slice(0, 3).map(Number)
      if (!channels || channels.length < 3) {
        return matchMedia('(prefers-color-scheme: dark)').matches
      }
      const [red, green, blue] = channels
      return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 128
    })()`
  );
  applyWindowChromeTheme(window, isDark);
}
function dshEntryPath() {
  if (app.isPackaged) {
    return join(
      process.resourcesPath,
      "app",
      "node_modules",
      "@deepseek-ai",
      "dsh",
      "lib",
      "bin.js"
    );
  }
  return join(app.getAppPath(), "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
}
function bundledNodePath() {
  const executable = process.platform === "win32" ? "node.exe" : "node";
  return join(app.getAppPath(), "node_modules", "node", "bin", executable);
}
function bundledPnpmRunnerPath() {
  return join(
    app.getAppPath(),
    "node_modules",
    "dsh-desktop-market-installer",
    "pnpm-runner.mjs"
  );
}
function bundledPnpmEntryPath() {
  const root = join(app.getAppPath(), "node_modules", "pnpm", "bin");
  const candidates = [join(root, "pnpm.cjs"), join(root, "pnpm.mjs")];
  return candidates.find((candidate) => existsSync(candidate)) ?? join(root, "pnpm.cjs");
}
function harnessNodeEntryPath() {
  return app.isPackaged ? join(process.resourcesPath, "harness-node-entry.mjs") : join(app.getAppPath(), "build", "harness-node-entry.mjs");
}
function desktopResourcePath(name) {
  return app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), "build", name);
}
async function loadDesktopResource(target, filePath, options) {
  const query = options?.query ?? {};
  try {
    const fileUrl = pathToFileURL(filePath);
    for (const [key, value] of Object.entries(query)) {
      fileUrl.searchParams.set(key, value);
    }
    await target.loadURL(fileUrl.href);
  } catch {
    await target.loadFile(filePath, options);
  }
}
function desktopIconPath() {
  return app.isPackaged ? join(process.resourcesPath, "icon.png") : join(app.getAppPath(), "build", "app-icon.png");
}
function dshBrandLogoPath(variant) {
  return join(
    app.getAppPath(),
    "node_modules",
    "@deepseek-ai",
    "dsh-web-frontend",
    "dist",
    `dsh-desktop-logo-${variant}.png`
  );
}
function harnessLocale() {
  try {
    const settings = distExports.parse(
      readFileSync(join(app.getPath("userData"), "harness", "settings.yaml"), "utf8")
    );
    return resolveHarnessLocale(
      settings.locale?.preference,
      app.getPreferredSystemLanguages()
    );
  } catch {
    return resolveHarnessLocale(void 0, app.getPreferredSystemLanguages());
  }
}
function gpuFallbackStatePath() {
  return join(app.getPath("userData"), "gpu-fallback.json");
}
function readGpuFallbackState() {
  try {
    return parseGpuFallbackState(readFileSync(gpuFallbackStatePath(), "utf8"));
  } catch {
    return defaultGpuFallbackState;
  }
}
function writeGpuFallbackState(state) {
  try {
    writeFileSync(gpuFallbackStatePath(), serializeGpuFallbackState(state));
  } catch {
  }
}
function configureGpuFallback() {
  gpuFallbackState = readGpuFallbackState();
  for (const name of gpuFallbackSwitches(gpuFallbackState.level)) {
    app.commandLine.appendSwitch(name);
  }
  if (gpuFallbackState.level === "gpu-disabled") app.disableHardwareAcceleration();
}
const GPU_STABLE_LAUNCH_DELAY_MS = 6e4;
const PROFILE_BOOT_STABILITY_MS = 6e4;
const PROFILE_RENDERER_HEARTBEAT_MAX_AGE_MS = 15e3;
function clearProfileBootConfirmation() {
  if (profileBootConfirmationTimer) clearTimeout(profileBootConfirmationTimer);
  profileBootConfirmationTimer = void 0;
  profileRendererHealthAt = 0;
  profileBootNavigationVersion = 0;
  profileBootConfirmationComplete = false;
}
function normalProfileBootIsHealthy(expectedNavigationVersion) {
  const snapshot = runtime.snapshot();
  const window = mainWindow;
  return !safeModeVisible && !failureRecoveryVisible && snapshot.phase === "ready" && !!window && !window.isDestroyed() && expectedNavigationVersion === mainWindowNavigationVersion && Date.now() - profileRendererHealthAt <= PROFILE_RENDERER_HEARTBEAT_MAX_AGE_MS && window.webContents.getURL().startsWith("http://127.0.0.1:");
}
function scheduleNormalProfileBootConfirmation() {
  if (safeModeVisible || failureRecoveryVisible || runtime.snapshot().phase !== "ready") return;
  profileRendererHealthAt = Date.now();
  if (profileBootConfirmationComplete || profileBootConfirmationTimer) return;
  profileBootNavigationVersion = mainWindowNavigationVersion;
  profileBootConfirmationTimer = setTimeout(() => {
    profileBootConfirmationTimer = void 0;
    const expectedNavigationVersion = profileBootNavigationVersion;
    const healthy = () => normalProfileBootIsHealthy(expectedNavigationVersion);
    if (!healthy()) {
      profileRendererHealthAt = 0;
      profileBootNavigationVersion = 0;
      return;
    }
    profileBootConfirmationComplete = true;
    const dshHome = join(app.getPath("userData"), "harness");
    void (async () => {
      await confirmMigration(dshHome, (line) => runtime.note(line), healthy);
      if (!healthy()) {
        profileBootConfirmationComplete = false;
        return;
      }
      await confirmPluginRemovalsBooted(dshHome, (line) => runtime.note(line));
    })().catch((error) => {
      profileBootConfirmationComplete = false;
      runtime.note(
        `[desktop] normal Profile boot confirmation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }, PROFILE_BOOT_STABILITY_MS);
  profileBootConfirmationTimer.unref?.();
}
function markHarnessRendered() {
  if (harnessRendered) return;
  harnessRendered = true;
  if (gpuFallbackState.level === "default" && gpuFallbackState.stableLaunches === 0) return;
  gpuStableLaunchTimer = setTimeout(() => {
    gpuStableLaunchTimer = void 0;
    const next = planStableLaunch(gpuFallbackState);
    if (gpuFallbackStateEquals(next, gpuFallbackState)) return;
    if (next.level !== gpuFallbackState.level) {
      runtime?.note(
        `[desktop] GPU fallback lowered to ${next.level} after ${gpuFallbackState.stableLaunches + 1} stable launches`
      );
    }
    gpuFallbackState = next;
    writeGpuFallbackState(next);
  }, GPU_STABLE_LAUNCH_DELAY_MS);
  gpuStableLaunchTimer.unref?.();
}
function installGpuFallbackWatch() {
  app.on("child-process-gone", (_event, details) => {
    if (details.type !== "GPU") return;
    if (gpuFallbackRelaunching || quitting) return;
    if (!isGpuLossFatal(details.reason)) return;
    respondToGpuFallbackSignal(
      `GPU process gone: reason=${details.reason} exitCode=${details.exitCode}`
    );
  });
}
function respondToGpuFallbackSignal(details, options = {}) {
  if (gpuFallbackRelaunching || quitting) return false;
  if (gpuStableLaunchTimer) {
    clearTimeout(gpuStableLaunchTimer);
    gpuStableLaunchTimer = void 0;
  }
  runtime?.note(
    `[desktop] ${details} fallback=${gpuFallbackState.level} failures=${gpuFallbackState.failures}`
  );
  const plan = planGpuFallbackResponse({
    state: gpuFallbackState,
    harnessRendered: options.unusableLaunch === true ? false : harnessRendered
  });
  const escalated = plan.state.level !== gpuFallbackState.level;
  if (!gpuFallbackStateEquals(plan.state, gpuFallbackState)) {
    gpuFallbackState = plan.state;
    writeGpuFallbackState(plan.state);
  }
  if (escalated) runtime?.note(`[desktop] GPU fallback raised to ${plan.state.level}`);
  if (!plan.relaunch) return false;
  gpuFallbackRelaunching = true;
  app.relaunch();
  desktopDiagnostics?.markCleanExit();
  app.exit(0);
  return true;
}
function configureApplicationLocale() {
  app.commandLine.appendSwitch("lang", harnessLocale() === "zh" ? "zh-CN" : "en-US");
}
function harnessThemePreference() {
  try {
    const settings = distExports.parse(
      readFileSync(join(app.getPath("userData"), "harness", "settings.yaml"), "utf8")
    );
    const preference = settings["ui-theme"]?.preference;
    return preference === "light" || preference === "dark" || preference === "system" ? preference : "system";
  } catch {
    return "system";
  }
}
function isPluginRecoveryPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:" && parsed.pathname.endsWith("/plugin-recovery.html");
  } catch {
    return false;
  }
}
function isWebImportPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:" && parsed.pathname.endsWith("/web-import.html");
  } catch {
    return false;
  }
}
function resolvePluginRecoveryAction(action) {
  const resolve2 = pluginRecoveryActionResolver;
  pluginRecoveryActionResolver = void 0;
  resolve2?.(action);
}
function resolveWebImportAction(action) {
  const resolve2 = webImportActionResolver;
  webImportActionResolver = void 0;
  resolve2?.(action);
}
function resolveSafeModeAction(action) {
  const resolve2 = safeModeActionResolver;
  safeModeActionResolver = void 0;
  resolve2?.(action);
}
function installPluginRecoveryNavigation(window) {
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl.startsWith("dsh-import://")) {
      event.preventDefault();
      if (!isWebImportPage(window.webContents.getURL())) return;
      const action = new URL(targetUrl).hostname;
      if (action === "import" || action === "skip") resolveWebImportAction(action);
      return;
    }
    if (!targetUrl.startsWith("dsh-recovery://")) return;
    event.preventDefault();
    if (!isPluginRecoveryPage(window.webContents.getURL())) return;
    try {
      const action = new URL(targetUrl).hostname;
      const plugin = new URL(targetUrl).searchParams.get("plugin");
      if (plugin && (action === "upgrade" || action === "uninstall")) resolvePluginRecoveryAction(`${action}:${plugin}`);
      else if (PLUGIN_RECOVERY_ACTIONS.has(action)) resolvePluginRecoveryAction(action);
    } catch {
    }
  });
}
function restoreMainWindow() {
  const window = mainWindow;
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return;
  }
  const snapshot = runtime?.snapshot();
  if (snapshot?.phase === "ready" && snapshot.url) {
    void openHarness(snapshot.url, "user").catch(showUnexpectedError);
  } else if (snapshot?.phase === "idle") {
    void launchHarness().catch(showUnexpectedError);
  }
}
function ensureTray() {
  if (process.platform !== "win32" || tray) return;
  const locale = harnessLocale();
  tray = new Tray(desktopIconPath());
  tray.setToolTip("DSH Desktop");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: locale === "zh" ? "显示 DSH Desktop" : "Show DSH Desktop", click: restoreMainWindow },
      { type: "separator" },
      { label: locale === "zh" ? "退出" : "Exit", click: () => app.quit() }
    ])
  );
  tray.on("click", restoreMainWindow);
}
function createWindow() {
  const isWindows = process.platform === "win32";
  const window = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: "",
    icon: desktopIconPath(),
    frame: process.platform !== "darwin",
    ...process.platform === "darwin" ? { titleBarStyle: "hidden" } : {},
    ...isWindows ? {
      titleBarStyle: "hidden",
      titleBarOverlay: windowsTitleBarOverlay(nativeTheme.shouldUseDarkColors),
      autoHideMenuBar: true
    } : {},
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#141416" : "#f8f8f6",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      sandbox: true,
      webSecurity: true
    }
  });
  if (process.platform === "darwin") {
    window.setWindowButtonVisibility(true);
    const alignWindowButtons = () => {
      if (window.isDestroyed()) return;
      window.setWindowButtonPosition({
        x: Math.round(16 * window.webContents.getZoomFactor()) - 2,
        y: 9
      });
    };
    alignWindowButtons();
    window.webContents.on("did-finish-load", alignWindowButtons);
    window.webContents.on("zoom-changed", () => setImmediate(alignWindowButtons));
  } else if (isWindows) {
    window.setMenuBarVisibility(false);
  }
  window.on("close", (event) => {
    desktopStorageManager?.flushSync();
    if (!shouldKeepRunningInBackground(process.platform, quitting)) return;
    event.preventDefault();
    window.hide();
  });
  window.on("session-end", () => {
    desktopDiagnostics?.markCleanExit();
    desktopStorageManager?.flushSync();
  });
  window.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle("");
  });
  window.webContents.on("console-message", (details) => {
    if (details.level !== "error") return;
    const sourceUrl = details.sourceId || window.webContents.getURL();
    if (!sourceUrl.startsWith("http://127.0.0.1:")) return;
    appendRendererPluginFailureLog(details.message);
  });
  installPluginRecoveryNavigation(window);
  secureWindow(window);
  installContextMenu(window, harnessLocale);
  installMainWindowRendererRecovery(window);
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = void 0;
    if (windowsMenuView && !windowsMenuView.webContents.isDestroyed()) {
      windowsMenuView.webContents.close();
    }
    windowsMenuView = void 0;
    windowsMenuOpen = false;
    resolvePluginRecoveryAction("quit");
    resolveWebImportAction("skip");
    resolveSafeModeAction({ type: "quit" });
  });
  mainWindow = window;
  if (isWindows) attachWindowsMenuView(window);
  return window;
}
async function openHarness(url, focusIntent = "automatic") {
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  const rendererUrl = desktopHarnessUrl(url, process.platform, runtime.snapshot().authToken);
  if (shouldLoadHarnessUrl(window.webContents.getURL(), url)) {
    const navigationVersion = ++mainWindowNavigationVersion;
    rendererPluginFailureLogs = [];
    window.webContents.stop();
    await clearStaleLoopbackHttpCache(
      window.webContents.session,
      join(app.getPath("userData"), "http-cache-origin"),
      new URL(url).origin,
      (line) => runtime.note(line)
    );
    const clearedCookies = await clearStaleHarnessAuthCookies(
      window.webContents.session.cookies,
      rendererUrl,
      runtime.snapshot().authToken
    ).catch((error) => {
      runtime.note(
        `[desktop] stale Harness cookie cleanup failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return 0;
    });
    if (clearedCookies > 0) {
      runtime.note(`[desktop] cleared ${clearedCookies} stale Harness authentication cookie(s)`);
    }
    try {
      await window.loadURL(rendererUrl);
    } catch (error) {
      if (navigationVersion !== mainWindowNavigationVersion) return;
      if (isAbortedNavigationError(error)) return;
      const snapshot = runtime.snapshot();
      if (snapshot.phase !== "ready" || snapshot.url !== url) return;
      throw error;
    }
    if (navigationVersion !== mainWindowNavigationVersion) return;
  }
  markHarnessRendered();
  if (runtime.snapshot().url !== url || window.isDestroyed()) return;
  await syncNativeTheme(window);
  raiseWindowWithoutStealingFocus(
    window,
    process.platform,
    () => app.isActive(),
    focusIntent
  );
}
async function maybeImportWebHome(dshHome) {
  if (startInSafeMode) return;
  const webHome = defaultWebHome();
  if (!await shouldOfferWebHomeImport(dshHome, webHome)) return;
  let notice;
  while (!quitting) {
    const preview = await previewWebHome(webHome);
    const choice = await showWebHomeImport(preview, notice);
    if (choice !== "import") {
      await writeSkipDecision(dshHome, webHome);
      runtime.note("[desktop] skipped importing web Harness home");
      return;
    }
    const window = mainWindow;
    try {
      await importWebHome({
        source: webHome,
        dest: dshHome,
        onProgress: (line) => {
          runtime.note(`[desktop] web import: ${line}`);
          if (!window || window.isDestroyed()) return;
          void window.webContents.executeJavaScript(
            `(() => { const node = document.getElementById('progress'); if (!node) return; node.textContent = ${JSON.stringify(line)}; node.classList.add('visible'); })()`
          ).catch(() => void 0);
        }
      });
      runtime.note("[desktop] imported web Harness home");
      await showSplash();
      return;
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
      runtime.note(`[desktop] web import failed: ${notice}`);
    }
  }
}
async function showWebHomeImport(preview, notice) {
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  const state = buildWebImportViewModel({
    locale: harnessLocale(),
    preview,
    notice
  });
  const actionPromise = new Promise((resolve2) => {
    webImportActionResolver = resolve2;
  });
  const navigationVersion = ++mainWindowNavigationVersion;
  window.webContents.stop();
  try {
    await window.loadFile(desktopResourcePath("web-import.html"), {
      query: {
        state: JSON.stringify(state),
        icon: app.isPackaged ? "icon.png" : "app-icon.png",
        theme: harnessThemePreference()
      }
    });
  } catch (error) {
    webImportActionResolver = void 0;
    throw error;
  }
  if (window.isDestroyed() || navigationVersion !== mainWindowNavigationVersion) return "skip";
  raiseWindowWithoutStealingFocus(window, process.platform, () => app.isActive());
  return actionPromise;
}
async function showSplash() {
  clearProfileBootConfirmation();
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  const navigationVersion = ++mainWindowNavigationVersion;
  window.webContents.stop();
  await loadDesktopResource(window, desktopResourcePath("splash.html"), {
    query: { theme: nativeTheme.shouldUseDarkColors ? "dark" : "light" }
  });
  if (window.isDestroyed() || navigationVersion !== mainWindowNavigationVersion) return;
  raiseWindowWithoutStealingFocus(window, process.platform, () => app.isActive());
}
async function reportProfileConsistency(dshHome) {
  try {
    const healed = await healProfileBundles(dshHome);
    if (healed.length > 0) {
      runtime.note(`[desktop] auto-composed ${healed.length} missing bundle(s): ${healed.join(", ")}`);
    }
  } catch (error) {
    runtime.note(
      `[desktop] bundle healing skipped: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  void Promise.all([
    inspectProfileConsistency(dshHome),
    inspectStoreConsistency(dshHome)
  ]).then(([findings, store]) => {
    if (store) findings.push(store);
    for (const finding of findings) runtime.note(`[desktop] profile inconsistency: ${finding}`);
  }).catch((error) => {
    runtime.note(
      `[desktop] profile consistency inspection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  });
}
async function auditInstalledLaunchAgents(dshHome) {
  const appBundlePath = appBundlePathFromExecutable(process.execPath);
  if (appBundlePath === void 0) return;
  try {
    const result = await auditLaunchAgents({
      dshHome,
      appBundlePath,
      log: (message) => runtime.note(message)
    });
    for (const finding of result.findings) {
      const owner = finding.owner === void 0 ? "" : ` installed by ${finding.owner}`;
      runtime.note(`[desktop] ${finding.action} the background service ${finding.label}${owner}`);
    }
    for (const failure of result.failures) runtime.note(`[desktop] launch agent audit: ${failure}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    runtime.note(`[desktop] launch agent audit failed: ${detail}`);
  }
}
async function quarantineInstalledLaunchAgentsForUpdate(dshHome) {
  const appBundlePath = appBundlePathFromExecutable(process.execPath);
  if (appBundlePath === void 0) return;
  const result = await quarantineAppBundleLaunchAgents({
    dshHome,
    appBundlePath,
    log: (message) => runtime.note(message)
  });
  for (const finding of result.findings) {
    const owner = finding.owner === void 0 ? "" : ` installed by ${finding.owner}`;
    runtime.note(
      `[desktop] quarantined the background service ${finding.label}${owner} before update`
    );
  }
  if (result.failures.length > 0) {
    for (const failure of result.failures) runtime.note(`[desktop] pre-update launch agent: ${failure}`);
    throw new Error("Unable to stop background services before replacing DSH Desktop.");
  }
}
function profileRecoveryLocked() {
  return maintenanceRecoveryLocked || migrationRecoveryLocked;
}
async function refreshMigrationRecoveryLock(dshHome) {
  migrationRecoveryLocked = await inspectMigrationRecoveryLock(dshHome);
  return profileRecoveryLocked();
}
async function canRetryLockedPluginRestore(dshHome, removalId) {
  await refreshMigrationRecoveryLock(dshHome);
  if (migrationRecoveryLocked) return false;
  if (!maintenanceRecoveryLocked) {
    try {
      const incompleteRestore = await incompletePluginRestoreId(dshHome);
      if (incompleteRestore === void 0) return true;
      maintenanceRecoveryLocked = true;
      maintenanceAllowedRestoreId = incompleteRestore;
    } catch {
      maintenanceRecoveryLocked = true;
      maintenanceAllowedRestoreId = void 0;
      return false;
    }
  }
  if (maintenanceAllowedRestoreId !== removalId) return false;
  try {
    return await incompletePluginRestoreId(dshHome) === removalId;
  } catch {
    return false;
  }
}
async function enterMigrationSafeRecovery(dshHome, reason, allowedRestoreId) {
  if (failureRecoveryVisible) resolvePluginRecoveryAction("safe-mode");
  safeModeVisible = true;
  maintenanceRecoveryLocked = true;
  maintenanceAllowedRestoreId = allowedRestoreId;
  await refreshMigrationRecoveryLock(dshHome);
  runtime.note(`[desktop] Profile recovery requires Safe Mode: ${reason}`);
  await runtime.stop();
  await ensureSafeModeProfile(dshHome);
  runtime.note("[desktop] safe mode: normal Profile maintenance is blocked until recovery succeeds");
  await runtime.start(launchDirectory, SAFE_MODE_PROFILE);
  if (runtime.snapshot().phase !== "ready") return;
  void mobileBridge.start().catch(showUnexpectedError);
  const notice = harnessLocale() === "zh" ? `正常 Profile 恢复尚未完成，已停止所有自动修复并进入安全模式。恢复材料仍保留。${reason}` : `Normal Profile recovery is incomplete. Automatic maintenance is blocked and recovery material is preserved. ${reason}`;
  queueMicrotask(() => {
    void showSafeModeManager({ notice, noticeTone: "error" }).catch(showUnexpectedError);
  });
}
function launchHarness() {
  if (harnessLaunchOperation) return harnessLaunchOperation;
  harnessLaunchOperation = (async () => {
    safeModeVisible = false;
    runtime.beginLaunch("web profile");
    const dshHome = join(app.getPath("userData"), "harness");
    await showSplash();
    runtime.note("[desktop] splash shown");
    await runtime.stop();
    runtime.note("[desktop] previous Harness stopped; starting profile maintenance");
    await maybeImportWebHome(dshHome);
    const maintenance = await runProfileStartupMaintenance({
      note: (line) => runtime.note(line),
      recoverInterruptedMigration: () => recoverInterruptedMigration(dshHome, (line) => runtime.note(line)),
      incompletePluginRestoreId: () => incompletePluginRestoreId(dshHome),
      preparePackageStore: async () => {
        const pinned = await ensureStoreDirPinned(dshHome);
        if (pinned) runtime.note(`[desktop] pinned the profile's pnpm store: ${pinned}`);
      },
      enforcePendingPluginRemovals: () => enforcePendingPluginRemovals(dshHome, (line) => runtime.note(line)),
      prepareGenerationsForLaunch: () => prepareGenerationsForLaunch(dshHome, (line) => runtime.note(line)),
      shouldDeferProfileMaintenance: () => shouldDeferProfileMaintenance(dshHome),
      migrateProfileToGenerations: () => migrateProfileToGenerations({
        dshHome,
        nodeExecutablePath: bundledNodePath(),
        pnpmEntryPath: bundledPnpmEntryPath(),
        dshEntryPath: dshEntryPath(),
        note: (line) => runtime.note(line),
        reinstallSharedTree: async () => {
          await clearProfileInstallMarker(dshHome);
          const result = await installProfileDependenciesWithDsh({
            dshHome,
            dshEntryPath: dshEntryPath(),
            nodeExecutablePath: bundledNodePath(),
            pnpmEntryPath: bundledPnpmEntryPath(),
            pnpmRunnerPath: bundledPnpmRunnerPath()
          });
          if (result.ok) await markProfileInstallComplete(dshHome);
          return result;
        }
      }),
      demoteMarketGeneration: () => demoteMarketGeneration(dshHome, (line) => runtime.note(line)),
      ensureMarketBaseline: () => ensureMarketBaseline({
        dshHome,
        dshEntryPath: dshEntryPath(),
        nodeExecutablePath: bundledNodePath(),
        pnpmEntryPath: bundledPnpmEntryPath(),
        pnpmRunnerPath: bundledPnpmRunnerPath(),
        note: (line) => runtime.note(line)
      }),
      reportProfileConsistency: () => reportProfileConsistency(dshHome)
    });
    if (maintenance.outcome === "safe-recovery") {
      await enterMigrationSafeRecovery(
        dshHome,
        maintenance.reason,
        maintenance.allowedRestoreId
      );
      return;
    }
    maintenanceRecoveryLocked = false;
    maintenanceAllowedRestoreId = void 0;
    runtime.note("[desktop] profile maintenance done");
    await refreshMigrationRecoveryLock(dshHome);
    void auditInstalledLaunchAgents(dshHome).then(() => {
      runtime.note("[desktop] LaunchAgent audit done");
    }).catch((error) => {
      runtime.note(
        `[desktop] LaunchAgent audit failed: ${error instanceof Error ? error.message : String(error)}`
      );
    });
    desktopStorageManager?.switchProfile(join(dshHome, "profiles", "web"));
    await runtime.start(launchDirectory);
    if (runtime.snapshot().phase !== "ready") {
      if (maintenance.migrationRebuiltSharedTree) {
        const rollback = await rollBackMigration(dshHome, (line) => runtime.note(line));
        if (rollback.outcome === "restored") {
          runtime.note("[desktop] restarting the verified pre-upgrade Profile without package repair");
          await runtime.start(launchDirectory);
        } else {
          const reason = rollback.outcome === "recovery-required" ? rollback.reason : "the pre-upgrade migration snapshot is missing";
          await enterMigrationSafeRecovery(dshHome, reason);
        }
      }
    }
    if (runtime.snapshot().phase === "ready") safeModeSuspectedPlugins = [];
  })().finally(() => {
    harnessLaunchOperation = void 0;
  });
  return harnessLaunchOperation;
}
function launchSafeHarness() {
  if (harnessLaunchOperation) return harnessLaunchOperation;
  harnessLaunchOperation = (async () => {
    safeModeVisible = true;
    runtime.beginLaunch("safe mode");
    const dshHome = join(app.getPath("userData"), "harness");
    await refreshMigrationRecoveryLock(dshHome);
    await showSplash();
    await runtime.stop();
    await ensureSafeModeProfile(dshHome);
    runtime.note("[desktop] safe mode: third-party web profile bundles are blocked");
    desktopStorageManager?.switchProfile(join(dshHome, "profiles", SAFE_MODE_PROFILE));
    await runtime.start(launchDirectory, SAFE_MODE_PROFILE);
    if (runtime.snapshot().phase === "ready") {
      void mobileBridge.start().catch(showUnexpectedError);
    }
  })().finally(() => {
    harnessLaunchOperation = void 0;
  });
  return harnessLaunchOperation;
}
function restartHarness() {
  if (failureRecoveryVisible) resolvePluginRecoveryAction("restart");
  if (safeModeVisible) {
    resolveSafeModeAction({ type: "agent" });
    return launchSafeHarness();
  }
  return launchHarness();
}
async function disableMarketGeneration(dshHome) {
  if (await uninstallGenerationPlugin(dshHome, "dshmarket", (line) => runtime.note(line))) {
    return { ok: true };
  }
  return {
    ok: false,
    detail: "The plugin market generation could not be disabled; it is still enabled for the next launch."
  };
}
async function uninstallMarketAndRestart() {
  const dshHome = join(app.getPath("userData"), "harness");
  await showSplash();
  await runtime.stop();
  const projected = await isProjectedGenerationPlugin(dshHome, "dshmarket");
  const result = projected ? await disableMarketGeneration(dshHome) : await removeProfilePluginWithDsh(
    {
      dshHome,
      dshEntryPath: dshEntryPath(),
      nodeExecutablePath: bundledNodePath(),
      pnpmEntryPath: bundledPnpmEntryPath(),
      pnpmRunnerPath: bundledPnpmRunnerPath()
    },
    "dshmarket",
    true
  );
  await launchHarness();
  if (!result.ok) {
    throw new Error(result.detail ?? "Plugin market removal failed.");
  }
  return { ok: runtime.snapshot().phase === "ready" };
}
function registerHarnessHandlers() {
  ipcMain.removeAllListeners("dsh:storage-load-sync");
  ipcMain.on("dsh:storage-load-sync", (event) => {
    event.returnValue = desktopStorageManager?.getAll() ?? {};
  });
  ipcMain.removeAllListeners("dsh:storage-sync");
  ipcMain.on("dsh:storage-sync", (_event, action) => {
    if (action && typeof action === "object") {
      desktopStorageManager?.applyAction(action);
    }
  });
  ipcMain.removeHandler("harness:restart");
  ipcMain.handle("harness:restart", async (event) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error("Harness restart is only available from the DSH Desktop window.");
    }
    if (runtime.snapshot().phase !== "ready") {
      throw new Error("Harness is not ready to restart.");
    }
    await restartHarness();
    return { ok: runtime.snapshot().phase === "ready" };
  });
  ipcMain.removeHandler("market:uninstall");
  ipcMain.handle("market:uninstall", async (event) => {
    assertTrustedMainWindowEvent(event);
    if (runtime.snapshot().phase !== "ready") {
      throw new Error("Harness is not ready to uninstall the plugin market.");
    }
    return uninstallMarketAndRestart();
  });
  ipcMain.removeHandler("desktop-menu:execute");
  ipcMain.handle("desktop-menu:execute", async (event, command) => {
    assertTrustedDesktopMenuEvent(event);
    if (!isDesktopMenuCommand(command)) {
      throw new Error("Unknown DSH Desktop menu command.");
    }
    const zoomFactor = await executeDesktopMenuCommand(command);
    return zoomFactor === void 0 ? { ok: true } : { ok: true, zoomFactor };
  });
  ipcMain.removeHandler("desktop-menu:get-zoom-factor");
  ipcMain.handle("desktop-menu:get-zoom-factor", (event) => {
    assertTrustedDesktopMenuEvent(event);
    return { zoomFactor: mainWindow?.webContents.getZoomFactor() ?? 1 };
  });
  ipcMain.removeHandler("desktop-titlebar:set-menu-open");
  ipcMain.handle("desktop-titlebar:set-menu-open", (event, open) => {
    assertTrustedWindowsMenuEvent(event);
    if (typeof open !== "boolean") {
      throw new Error("The application menu state must be a boolean.");
    }
    if (mainWindow && !mainWindow.isDestroyed()) setWindowsMenuOpen(mainWindow, open);
    return { ok: true };
  });
  ipcMain.removeHandler("desktop-titlebar:close-menu");
  ipcMain.handle("desktop-titlebar:close-menu", (event) => {
    assertTrustedMainWindowEvent(event);
    if (mainWindow && !mainWindow.isDestroyed()) setWindowsMenuOpen(mainWindow, false, true);
    return { ok: true };
  });
  ipcMain.removeHandler("desktop-titlebar:set-theme");
  ipcMain.handle("desktop-titlebar:set-theme", (event, isDark) => {
    assertTrustedMainWindowEvent(event);
    if (typeof isDark !== "boolean") {
      throw new Error("The DSH Desktop titlebar theme must be a boolean.");
    }
    if (process.platform === "win32" && mainWindow) {
      applyWindowChromeTheme(mainWindow, isDark);
    }
    return { ok: true };
  });
  ipcMain.removeHandler("desktop:about-info");
  ipcMain.handle("desktop:about-info", (event) => {
    assertTrustedMainWindowEvent(event);
    const locale = harnessLocale();
    return {
      desktopVersion: app.getVersion(),
      harnessVersion: bundledHarnessVersion(app.getAppPath()) ?? (locale === "zh" ? "未知" : "Unknown"),
      locale
    };
  });
}
function assertTrustedDesktopMenuEvent(event) {
  const fromMainWindow = mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;
  const fromWindowsMenu = windowsMenuView && !windowsMenuView.webContents.isDestroyed() && event.sender === windowsMenuView.webContents && event.senderFrame === windowsMenuView.webContents.mainFrame;
  if (!fromMainWindow && !fromWindowsMenu) {
    throw new Error("This action is only available from the DSH Desktop window.");
  }
}
function assertTrustedWindowsMenuEvent(event) {
  if (!windowsMenuView || windowsMenuView.webContents.isDestroyed() || event.sender !== windowsMenuView.webContents || event.senderFrame !== windowsMenuView.webContents.mainFrame) {
    throw new Error("This action is only available from the Windows application menu.");
  }
}
function assertTrustedMainWindowEvent(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error("This action is only available from the main DSH Desktop window.");
  }
}
function assertTrustedSafeModeManagerEvent(event) {
  if (!safeModeManager || safeModeManager.isDestroyed() || event.sender !== safeModeManager.webContents || event.senderFrame !== safeModeManager.webContents.mainFrame) {
    throw new Error("This action is only available from the Safe Mode manager.");
  }
}
async function showAbout(window) {
  const locale = harnessLocale();
  const info = {
    desktopVersion: app.getVersion(),
    harnessVersion: bundledHarnessVersion(app.getAppPath()) ?? (locale === "zh" ? "未知" : "Unknown"),
    locale
  };
  if (window && !window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
    try {
      window.webContents.send("desktop:show-about", info);
      return;
    } catch {
    }
  }
  const checkForUpdatesLabel = locale === "zh" ? "检查更新" : "Check for Updates";
  const result = await dialog.showMessageBox(window, {
    type: "info",
    title: "DSH Desktop",
    message: locale === "zh" ? "关于 DSH Desktop" : "About DSH Desktop",
    detail: aboutDetail(
      app.getVersion(),
      bundledHarnessVersion(app.getAppPath()),
      locale
    ),
    buttons: [checkForUpdatesLabel, locale === "zh" ? "关闭" : "Close"],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });
  if (result.response === 0) await checkForUpdates(true);
}
async function executeDesktopMenuCommand(command) {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return;
  const contents = window.webContents;
  switch (command) {
    case "connect-phone":
      await showMobilePairing();
      break;
    case "restart-harness":
      await restartHarness();
      break;
    case "safe-mode":
      void showSafeMode().catch(showUnexpectedError);
      break;
    case "show-harness-log":
      shell.showItemInFolder(join(app.getPath("logs"), "harness.log"));
      break;
    case "check-for-updates":
      await checkForUpdates(true);
      break;
    case "export-session":
      await contents.executeJavaScript(
        `(() => {
          const moreBtn = document.querySelector('button[aria-label="更多操作"], button[aria-label="More actions"], button[class*="moreButton"]')
          if (moreBtn instanceof HTMLElement) {
            moreBtn.click()
            setTimeout(() => {
              const item = document.querySelector('[role="menuitem"]')
              if (item instanceof HTMLElement) item.click()
            }, 50)
            return true
          }
          const legacyBtn = document.querySelector('button[class*="sessionLogButton"]')
          if (legacyBtn instanceof HTMLElement) {
            legacyBtn.click()
            return true
          }
          return false
        })()`
      ).catch(showUnexpectedError);
      break;
    case "undo":
      contents.undo();
      break;
    case "redo":
      contents.redo();
      break;
    case "cut":
      contents.cut();
      break;
    case "copy":
      contents.copy();
      break;
    case "paste":
      contents.paste();
      break;
    case "select-all":
      contents.selectAll();
      break;
    case "reload":
      contents.reload();
      break;
    case "toggle-devtools":
      contents.toggleDevTools();
      break;
    case "zoom-reset":
      contents.setZoomLevel(0);
      break;
    case "zoom-in":
      contents.setZoomLevel(Math.min(3, contents.getZoomLevel() + 0.5));
      break;
    case "zoom-out":
      contents.setZoomLevel(Math.max(-3, contents.getZoomLevel() - 0.5));
      break;
    case "toggle-fullscreen":
      window.setFullScreen(!window.isFullScreen());
      break;
    case "about":
      await showAbout(window);
      break;
    case "quit":
      app.quit();
      break;
  }
  return isZoomMenuCommand(command) ? contents.getZoomFactor() : void 0;
}
async function waitForPluginRecoveryAction(options) {
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  const state = buildPluginRecoveryViewModel({
    ...options,
    locale: harnessLocale()
  });
  const actionPromise = new Promise((resolve2) => {
    pluginRecoveryActionResolver = resolve2;
  });
  const navigationVersion = ++mainWindowNavigationVersion;
  window.webContents.stop();
  try {
    await loadDesktopResource(window, desktopResourcePath("plugin-recovery.html"), {
      query: {
        state: JSON.stringify(state),
        icon: app.isPackaged ? "icon.png" : "app-icon.png",
        theme: harnessThemePreference()
      }
    });
  } catch (error) {
    pluginRecoveryActionResolver = void 0;
    throw error;
  }
  if (window.isDestroyed() || navigationVersion !== mainWindowNavigationVersion) return "quit";
  raiseWindowWithoutStealingFocus(window, process.platform, () => app.isActive());
  return actionPromise;
}
function showUnexpectedError(error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  dialog.showErrorBox("DSH Desktop encountered an error", message);
}
async function showPluginRecovery(options) {
  if (failureRecoveryVisible || quitting) return;
  failureRecoveryVisible = true;
  const dshHome = join(app.getPath("userData"), "harness");
  const isChinese = harnessLocale() === "zh";
  cancelPluginRecoverySessionReset();
  const removedPlugins = pluginRecoveryRemovedPlugins;
  let notice;
  let recoveryMessage = options?.message;
  let recoveryLogs = options?.logs;
  let followRendererLogs = options?.followRendererLogs === true;
  let waitForRendererEvidence = followRendererLogs;
  const applyPendingFrontendEvidence = () => {
    const pending = takePendingFrontendPluginRecovery();
    if (!pending.pending) return false;
    recoveryMessage = pending.message ?? recoveryMessage;
    recoveryLogs = [...rendererPluginFailureLogs];
    followRendererLogs = true;
    waitForRendererEvidence = false;
    return true;
  };
  const attemptedUpgrades = /* @__PURE__ */ new Map();
  const evidence = new PluginRecoveryEvidence();
  const launchWithFreshEvidence = async () => {
    const previousAttempt = runtime.launchAttemptId;
    recoveryMessage = void 0;
    recoveryLogs = void 0;
    followRendererLogs = false;
    waitForRendererEvidence = false;
    rendererPluginFailureLogs = [];
    takePendingFrontendPluginRecovery();
    await launchHarness();
    if (runtime.launchAttemptId !== previousAttempt) evidence.freshLaunch();
  };
  try {
    while (!quitting) {
      const snapshot = runtime.snapshot();
      const message = recoveryMessage ?? snapshot.message;
      const detection = await detectPluginRecovery({
        dshHome,
        initialLogs: recoveryLogs ?? snapshot.logs,
        startupFailures: followRendererLogs ? void 0 : snapshot.pluginFailures,
        readLatestLogs: followRendererLogs ? () => rendererPluginFailureLogs : void 0,
        excludedPlugins: removedPlugins,
        slotProviderNodeModulesPaths: [join(app.getAppPath(), "node_modules")],
        timeoutMs: waitForRendererEvidence ? PLUGIN_RECOVERY_EVIDENCE_TIMEOUT_MS : 0
      });
      detection.plugins = evidence.targets(detection.plugins, removedPlugins);
      appendPluginRecoveryDetectionLog(detection.plugins);
      waitForRendererEvidence = false;
      if (applyPendingFrontendEvidence()) continue;
      const runtimeVersion = await readBundledDshVersion(join(app.getAppPath(), "node_modules")) || "0.1.2-alpha.1";
      const pluginChecks = await checkBlockingPluginUpdates({
        plugins: detection.plugins,
        attemptedUpgrades,
        locale: harnessLocale(),
        check: async (targetPlugin) => {
          const loadedVersion = followRendererLogs || attemptedUpgrades.has(targetPlugin) ? void 0 : snapshot.pluginFailures?.find((failure) => failure.owner?.packageName === targetPlugin)?.owner?.version;
          const installedVersion = loadedVersion ?? await readInstalledPluginVersion(dshHome, targetPlugin);
          return evaluatePluginMarketCompatibility({
            packageName: targetPlugin,
            installedVersion,
            currentRuntimeVersion: runtimeVersion,
            hasLocalIssue: true,
            locale: harnessLocale(),
            fetchFn: (input, init) => net.fetch(input instanceof URL ? input.href : input, init)
          });
        }
      });
      let upgradeCandidate = detection.plugins.length === 1 ? pluginChecks[0]?.upgradeCandidate : void 0;
      const action = await waitForPluginRecoveryAction({
        snapshot: {
          ...snapshot,
          message: message || snapshot.message,
          logs: detection.logs
        },
        plugins: detection.plugins,
        removedPlugins,
        notice,
        upgradeCandidate,
        pluginChecks
      });
      notice = void 0;
      const target = selectPluginRecoveryTarget(action, detection.plugins);
      if ((action.startsWith("upgrade:") || action.startsWith("uninstall:")) && !target) continue;
      if (target?.type === "upgrade") {
        upgradeCandidate = pluginChecks.find((check) => check.packageName === target.plugin)?.upgradeCandidate;
        if (!upgradeCandidate) continue;
      }
      const removalTargets = target?.type === "uninstall" ? [target.plugin] : detection.plugins;
      if (action === "refresh" || action === "check-updates") {
        applyPendingFrontendEvidence();
        continue;
      } else if (action === "auto-process" || (action === "upgrade" || target?.type === "upgrade") && upgradeCandidate) {
        const plan = action === "auto-process" ? planPluginRecovery(pluginChecks) : { upgrades: [upgradeCandidate], removals: [], skipped: [] };
        if (plan.upgrades.length + plan.removals.length === 0) {
          notice = isChinese ? "尚未确定处理方案，请重试检查或逐项处理。" : "No recovery actions are confirmed yet. Retry the check or handle plugins individually.";
          continue;
        }
        await runtime.stop();
        const processed = await runPluginRecoveryPlan(plan, {
          upgrade: (candidate) => upgradePluginToGeneration({
            dshHome,
            pluginName: candidate.packageName,
            targetVersion: candidate.targetVersion,
            nodeExecutablePath: bundledNodePath(),
            pnpmEntryPath: bundledPnpmEntryPath(),
            note: (line) => runtime.note(line)
          }),
          remove: (plugin) => removeProfilePluginCompletely(dshHome, plugin, "plugin-recovery")
        });
        const results = processed.upgrades;
        for (const removal of processed.removals) {
          if (removal.removed && !removedPlugins.includes(removal.plugin)) removedPlugins.push(removal.plugin);
        }
        for (const result of results) {
          if (result.ok) {
            attemptedUpgrades.set(result.candidate.packageName, result.candidate.targetVersion);
            evidence.installed(result.candidate.packageName);
          }
        }
        const failed = results.filter((result) => !result.ok);
        const failedRemovals = processed.removals.filter((result) => !result.removed || result.pending);
        const processingFailed = failed.length > 0 || failedRemovals.length > 0 || plan.skipped.length > 0;
        notice = [
          ...failed.map((result) => `${result.candidate.packageName}: ${result.detail ?? (isChinese ? "升级失败，可重试" : "Upgrade failed; retry available")}`),
          ...failedRemovals.map((result) => `${result.plugin}: ${result.detail ?? (isChinese ? "卸载未完成，请重试或进入安全模式" : "Removal incomplete; retry or enter Safe Mode")}`),
          ...plan.skipped.map((plugin) => isChinese ? `${plugin}: 未能确定更新状态，已跳过自动处理。` : `${plugin}: update status is unknown; skipped automatic processing.`)
        ].join("\n") || void 0;
        const compatibility = await inspectProfileCompatibility(
          dshHome,
          join(app.getAppPath(), "node_modules")
        );
        evidence.inspect(compatibility.issues);
        const blockingIssues = compatibility.issues.filter((issue) => issue.severity === "blocking");
        if (blockingIssues.length > 0) {
          runtime.note(
            `[plugin-recovery] normal mode remains blocked by ${blockingIssues.length} profile compatibility issue${blockingIssues.length === 1 ? "" : "s"} after upgrade`
          );
          notice = [
            notice,
            isChinese ? `已完成本轮处理，仍有 ${blockingIssues.length} 项兼容问题，请继续处理剩余插件或进入安全模式。` : `This recovery pass is complete; ${blockingIssues.length} compatibility issues remain. Handle the remaining plugins or enter Safe Mode.`
          ].filter(Boolean).join("\n");
          continue;
        }
        if (processingFailed) continue;
        await launchWithFreshEvidence();
        if (applyPendingFrontendEvidence()) continue;
        if (runtime.snapshot().phase === "ready") {
          schedulePluginRecoverySessionReset();
          return;
        }
        continue;
      } else if ((action === "uninstall" || target?.type === "uninstall") && removalTargets.length > 0) {
        await runtime.stop();
        const failedPlugins = [];
        const pendingPlugins = [];
        for (const plugin of removalTargets) {
          const removal = await removeProfilePluginCompletely(dshHome, plugin, "plugin-recovery");
          if (removal.removed) {
            if (!removedPlugins.includes(plugin)) removedPlugins.push(plugin);
          } else if (removal.pending) {
            pendingPlugins.push(plugin);
          } else {
            failedPlugins.push(plugin);
          }
        }
        if (pendingPlugins.length > 0) {
          notice = isChinese ? `已禁用以下插件，但 Profile 依赖清理失败，尚未恢复正常模式：${pendingPlugins.join("、")}。请重试卸载或进入安全模式。` : `These plugins are disabled, but profile dependency cleanup failed, so normal mode was not restarted: ${pendingPlugins.join(", ")}. Retry removal or enter Safe Mode.`;
          continue;
        }
        if (failedPlugins.length === removalTargets.length) {
          notice = isChinese ? "未能修改插件配置。请打开 Harness 日志查看详情，或选择其他恢复方式。" : "The plugin profile could not be updated. Open the Harness log for details or choose another recovery option.";
          continue;
        }
        if (failedPlugins.length > 0) {
          notice = isChinese ? `以下插件未能移除：${failedPlugins.join("、")}` : `These plugins could not be removed: ${failedPlugins.join(", ")}`;
        }
        const compatibility = await inspectProfileCompatibility(
          dshHome,
          join(app.getAppPath(), "node_modules")
        );
        evidence.inspect(compatibility.issues);
        const blockingIssues = compatibility.issues.filter((issue) => issue.severity === "blocking");
        if (blockingIssues.length > 0) {
          runtime.note(
            `[plugin-recovery] normal mode remains blocked by ${blockingIssues.length} profile compatibility issue${blockingIssues.length === 1 ? "" : "s"}`
          );
          notice = isChinese ? `插件已移除，但 Profile 仍有 ${blockingIssues.length} 项兼容问题。为避免再次进入空白界面，请进入安全模式继续处理。` : `The plugin was removed, but ${blockingIssues.length} blocking profile compatibility issue${blockingIssues.length === 1 ? " remains" : "s remain"}. Continue in Safe Mode to avoid another blank normal window.`;
          continue;
        }
        await launchWithFreshEvidence();
        if (applyPendingFrontendEvidence()) continue;
        if (runtime.snapshot().phase === "ready") {
          schedulePluginRecoverySessionReset();
          return;
        }
        continue;
      } else if (action === "restart") {
        await (safeModeVisible ? launchSafeHarness() : launchWithFreshEvidence());
        if (applyPendingFrontendEvidence()) continue;
        if (runtime.snapshot().phase === "ready") {
          schedulePluginRecoverySessionReset();
          return;
        }
        continue;
      } else if (action === "show-log") {
        shell.showItemInFolder(join(app.getPath("logs"), "harness.log"));
        continue;
      } else if (action === "safe-mode") {
        safeModeSuspectedPlugins = [...new Set(detection.plugins)];
        takePendingFrontendPluginRecovery();
        queueMicrotask(() => void showSafeMode().catch(showUnexpectedError));
        return;
      } else {
        app.quit();
        return;
      }
    }
  } catch (error) {
    showUnexpectedError(error);
  } finally {
    failureRecoveryVisible = false;
    const pending = takePendingFrontendPluginRecovery();
    if (pending.pending && !quitting) {
      queueMicrotask(() => {
        void showPluginRecovery({
          message: pending.message,
          logs: [...rendererPluginFailureLogs],
          followRendererLogs: true
        });
      });
    }
  }
}
async function showRuntimeFailure(snapshot) {
  await showPluginRecovery({ message: snapshot.message, logs: snapshot.logs });
}
async function waitForSafeModeAction(options) {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  const window = safeModeManager && !safeModeManager.isDestroyed() ? safeModeManager : (() => {
    const manager = new SafeModeOverlay(parent, join(import.meta.dirname, "../preload/index.cjs"), () => {
      if (safeModeManager === manager) safeModeManager = void 0;
      resolveSafeModeAction({ type: "agent" });
    });
    safeModeManager = manager;
    return manager;
  })();
  const model = buildSafeModeViewModel({
    locale: harnessLocale(),
    plugins: options.plugins,
    suspectedPlugins: options.suspectedPlugins,
    issues: options.issues,
    healthReports: options.healthReports,
    backups: options.backups,
    recoveryLocked: options.recoveryLocked,
    backupRestoreLocked: options.backupRestoreLocked,
    allowedRestoreId: options.allowedRestoreId,
    notice: options.notice,
    noticeTone: options.noticeTone
  });
  const actionPromise = new Promise((resolve2) => {
    safeModeActionResolver = resolve2;
  });
  window.webContents.stop();
  try {
    await loadDesktopResource(window.webContents, desktopResourcePath("safe-mode.html"), {
      query: {
        state: JSON.stringify(model),
        icon: app.isPackaged ? "icon.png" : "app-icon.png",
        theme: harnessThemePreference()
      }
    });
  } catch (error) {
    safeModeActionResolver = void 0;
    throw error;
  }
  if (window.isDestroyed()) {
    return { type: "quit" };
  }
  window.show();
  raiseWindowWithoutStealingFocus(parent, process.platform, () => app.isActive());
  return actionPromise;
}
async function removeSafeModePlugin(dshHome, pluginName) {
  return removeProfilePluginCompletely(dshHome, pluginName, "safe-mode");
}
async function repairSafeModeCompatibilityIssues(dshHome, issues) {
  const repaired = [];
  const failed = [];
  const pluginIssues = issues.filter((issue) => issue.resolution === "disable-plugin");
  const workspaceIssues = issues.filter((issue) => issue.resolution === "quarantine-workspace");
  const coreIssues = issues.filter((issue) => issue.resolution === "rebuild-profile");
  if (pluginIssues.length > 0) {
    const targets = [...new Set(pluginIssues.map((issue) => issue.target))];
    const disabled = await disableProfilePlugins(dshHome, targets);
    repaired.push(...pluginIssues.filter((issue) => disabled.includes(issue.target)).map((issue) => issue.id));
    failed.push(...pluginIssues.filter((issue) => !disabled.includes(issue.target)).map((issue) => issue.id));
  }
  if (workspaceIssues.length > 0) {
    const targets = [...new Set(workspaceIssues.map((issue) => issue.target))];
    const quarantined = await quarantineProfileWorkspaces(dshHome, targets);
    repaired.push(
      ...workspaceIssues.filter((issue) => quarantined.includes(issue.packageName)).map((issue) => issue.id)
    );
    failed.push(
      ...workspaceIssues.filter((issue) => !quarantined.includes(issue.packageName)).map((issue) => issue.id)
    );
  }
  if (coreIssues.length > 0) {
    const targets = [...new Set(coreIssues.map((issue) => issue.target))];
    const quarantined = await quarantineProfileCorePackages(dshHome, targets);
    repaired.push(...coreIssues.filter((issue) => quarantined.includes(issue.target)).map((issue) => issue.id));
    failed.push(...coreIssues.filter((issue) => !quarantined.includes(issue.target)).map((issue) => issue.id));
  }
  if (workspaceIssues.length > 0 || coreIssues.length > 0) {
    await clearProfileInstallMarker(dshHome);
    const result = await installProfileDependenciesWithDsh({
      dshHome,
      dshEntryPath: dshEntryPath(),
      nodeExecutablePath: bundledNodePath(),
      pnpmEntryPath: bundledPnpmEntryPath(),
      pnpmRunnerPath: bundledPnpmRunnerPath()
    });
    if (!result.ok) return { repaired, failed, installFailed: result.detail ?? "unknown error" };
    await markProfileInstallComplete(dshHome);
  }
  return { repaired, failed };
}
async function removeProfilePluginCompletely(dshHome, pluginName, logPrefix) {
  runtime.note(`[${logPrefix}] removing ${pluginName} from the web profile`);
  const result = await removePluginSafely({
    dshHome,
    pluginName,
    cleanupOwnedComponents: ({ removalId, backupDirectory }) => cleanupPluginOwnedComponents({
      dshHome,
      pluginName,
      removalId,
      backupDirectory,
      log: (message) => runtime.note(`[${logPrefix}] ${message}`)
    }),
    uninstallGeneration: () => uninstallGenerationPlugin(
      dshHome,
      pluginName,
      (line) => runtime.note(line)
    ),
    reconcileLegacyProfile: async () => {
      runtime.note(`[${logPrefix}] rebuilding the web profile after removing ${pluginName}`);
      await clearProfileInstallMarker(dshHome);
      const rebuild = await installProfileDependenciesWithDsh({
        dshHome,
        dshEntryPath: dshEntryPath(),
        nodeExecutablePath: bundledNodePath(),
        pnpmEntryPath: bundledPnpmEntryPath(),
        pnpmRunnerPath: bundledPnpmRunnerPath()
      });
      if (!rebuild.ok) {
        runtime.note(
          `[${logPrefix}] web profile rebuild failed after removing ${pluginName}: ${rebuild.detail ?? "unknown error"}`
        );
        return rebuild;
      }
      await markProfileInstallComplete(dshHome);
      const compatibility = await inspectProfileCompatibility(
        dshHome,
        join(app.getAppPath(), "node_modules")
      );
      runtime.note(
        `[${logPrefix}] rebuilt the web profile after removing ${pluginName}; ${compatibility.issues.length} compatibility issue${compatibility.issues.length === 1 ? "" : "s"} remain`
      );
      return rebuild;
    },
    note: (line) => runtime.note(`[${logPrefix}] ${line}`)
  });
  for (const failure of result.failures) {
    runtime.note(`[${logPrefix}] ${pluginName} remains disabled; cleanup pending: ${failure}`);
  }
  return result;
}
async function showSafeMode() {
  if (quitting) return;
  if (failureRecoveryVisible) {
    resolvePluginRecoveryAction("safe-mode");
    return;
  }
  if (safeModeVisible) {
    await launchSafeHarness();
    return;
  }
  await launchSafeHarness();
}
async function showSafeModeManager(initial) {
  if (!safeModeVisible || safeModeManagerVisible || quitting) return;
  safeModeManagerVisible = true;
  const dshHome = join(app.getPath("userData"), "harness");
  const isChinese = harnessLocale() === "zh";
  let notice = initial?.notice;
  let noticeTone = initial?.noticeTone;
  try {
    while (!quitting) {
      let recoveryLocked = await refreshMigrationRecoveryLock(dshHome);
      let removalLedgerReadable = true;
      let active = [];
      let pendingRemovals = [];
      let compatibility = { issues: [] };
      let removalBackups = {
        backups: [],
        pendingDeletion: []
      };
      try {
        removalBackups = await snapshotPluginRemovalLedger(dshHome);
        const incompleteRestoreIds = removalBackups.backups.filter((backup) => backup.restoreStartedAt !== void 0).map((backup) => backup.removalId);
        if (incompleteRestoreIds.length > 0) {
          if (!maintenanceRecoveryLocked) {
            const incompleteRestore = await incompletePluginRestoreId(dshHome);
            maintenanceRecoveryLocked = true;
            maintenanceAllowedRestoreId = incompleteRestore;
          }
          recoveryLocked = true;
          active = [];
          pendingRemovals = [];
          compatibility = { issues: [] };
        }
        if (!recoveryLocked) {
          active = await listInstalledProfilePlugins(dshHome);
          pendingRemovals = await listPendingPluginRemovals(dshHome);
          compatibility = await inspectProfileCompatibility(
            dshHome,
            join(app.getAppPath(), "node_modules")
          );
        }
      } catch (error) {
        removalLedgerReadable = false;
        maintenanceRecoveryLocked = true;
        maintenanceAllowedRestoreId = void 0;
        recoveryLocked = true;
        active = [];
        pendingRemovals = [];
        compatibility = { issues: [] };
        const detail = error instanceof Error ? error.message : String(error);
        runtime.note(`[plugin-removal] recovery ledger inspection failed: ${detail}`);
        notice ??= isChinese ? `卸载恢复账本无法读取，已锁定正常 Profile 并保留原文件：${detail}` : `The removal recovery ledger is unreadable. The normal Profile is locked and the original file is preserved: ${detail}`;
        noticeTone ??= "error";
      }
      const installed = [.../* @__PURE__ */ new Set([...active, ...pendingRemovals])];
      let healthReports;
      if (installed.length > 0 && !recoveryLocked) {
        try {
          const incompatiblePluginNames = compatibility.issues.filter((issue) => issue.resolution === "disable-plugin").map((issue) => issue.target);
          healthReports = await checkupAllProfilePlugins({
            plugins: installed,
            dshHome,
            bundledNodeModulesPath: join(app.getAppPath(), "node_modules"),
            incompatiblePlugins: [.../* @__PURE__ */ new Set([...safeModeSuspectedPlugins, ...incompatiblePluginNames])],
            fetchFn: (input, init) => net.fetch(input instanceof URL ? input.href : input, init),
            locale: harnessLocale()
          });
        } catch (error) {
          runtime.note(`[safe-mode] plugin market health checkup failed: ${String(error)}`);
        }
      }
      const allowedRestoreId = recoveryLocked && !migrationRecoveryLocked && removalLedgerReadable && maintenanceAllowedRestoreId !== void 0 && removalBackups.backups.some(
        (backup) => backup.removalId === maintenanceAllowedRestoreId && backup.restoreStartedAt !== void 0
      ) ? maintenanceAllowedRestoreId : void 0;
      const backupRestoreLocked = recoveryLocked || !removalLedgerReadable;
      const action = await waitForSafeModeAction({
        plugins: installed,
        suspectedPlugins: safeModeSuspectedPlugins,
        issues: compatibility.issues,
        healthReports,
        backups: removalBackups.backups,
        recoveryLocked,
        backupRestoreLocked,
        allowedRestoreId,
        notice,
        noticeTone
      });
      notice = void 0;
      noticeTone = void 0;
      if (action.type === "quit") {
        app.quit();
        return;
      }
      if (action.type === "agent") {
        const snapshot = runtime.snapshot();
        if (snapshot.phase === "ready" && snapshot.url) await openHarness(snapshot.url);
        return;
      }
      if (action.type === "recovery-open") {
        const openError = await shell.openPath(dshHome);
        notice = openError ? isChinese ? `无法打开恢复目录：${openError}` : `Unable to open the recovery folder: ${openError}` : isChinese ? "已打开 Profile 恢复材料目录。" : "Opened the Profile recovery material folder.";
        noticeTone = openError ? "error" : "success";
        continue;
      }
      if (action.type === "backup-open") {
        const backup = await resolvePluginRemovalBackup(dshHome, action.removalId);
        if (!backup) {
          notice = isChinese ? "这份恢复备份已不存在。" : "This recovery backup no longer exists.";
          noticeTone = "error";
          continue;
        }
        const openError = await shell.openPath(backup.backupDirectory);
        notice = openError ? isChinese ? `无法打开备份目录：${openError}` : `Unable to open the backup: ${openError}` : isChinese ? `已打开 ${backup.pluginName} 的恢复备份。` : `Opened the recovery backup for ${backup.pluginName}.`;
        noticeTone = openError ? "error" : "success";
        continue;
      }
      if (action.type === "backup-restore") {
        if (!await canRetryLockedPluginRestore(dshHome, action.removalId)) {
          notice = isChinese ? "另一个恢复事务尚未完成，只能重试对应的插件备份。" : "Another recovery transaction is incomplete; only its matching plugin backup can be retried.";
          noticeTone = "error";
          continue;
        }
        const backup = await resolvePluginRemovalBackup(dshHome, action.removalId);
        if (!backup || !backup.canRestore) {
          notice = isChinese ? `这份备份无法自动恢复：${backup?.integrityDetail ?? "恢复材料不存在或不完整"}` : `This backup cannot be restored automatically: ${backup?.integrityDetail ?? "recovery material is missing or incomplete"}`;
          noticeTone = "error";
          continue;
        }
        const confirmationOptions = {
          type: "warning",
          title: isChinese ? "恢复插件" : "Restore plugin",
          message: isChinese ? `从这份备份恢复 ${backup.pluginName}？` : `Restore ${backup.pluginName} from this backup?`,
          detail: isChinese ? "若当前已启用该插件的其他 generation，将切换为这份备份记录的版本。备份本身不会删除。" : "If another generation of this plugin is enabled, it will switch to the version recorded here. The backup itself will be kept.",
          buttons: [isChinese ? "取消" : "Cancel", isChinese ? "恢复" : "Restore"],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        };
        const owner = safeModeManager?.parent;
        const confirmation = owner && !owner.isDestroyed() ? await dialog.showMessageBox(owner, confirmationOptions) : await dialog.showMessageBox(confirmationOptions);
        if (confirmation.response !== 1) {
          notice = isChinese ? "未恢复插件，备份保持不变。" : "The plugin was not restored; the backup is unchanged.";
          continue;
        }
        const restored = await restorePluginRemovalBackup(
          dshHome,
          action.removalId,
          (line) => runtime.note(line)
        );
        notice = restored.ok ? isChinese ? `已恢复 ${backup.pluginName}；请重启正常模式验证。` : `Restored ${backup.pluginName}; restart in normal mode to verify it.` : isChinese ? `恢复失败：${restored.reason ?? "未知错误"}` : `Restore failed: ${restored.reason ?? "unknown error"}`;
        noticeTone = restored.ok ? "success" : "error";
        continue;
      }
      if (action.type === "backup-delete") {
        if (await refreshMigrationRecoveryLock(dshHome)) {
          notice = isChinese ? "Profile 恢复事务完成前禁止修改任何恢复材料。" : "Recovery material is locked until the Profile recovery transaction completes.";
          noticeTone = "error";
          continue;
        }
        const backup = await resolvePluginRemovalBackup(dshHome, action.removalId);
        if (!backup) {
          notice = isChinese ? "这份恢复备份已不存在。" : "This recovery backup no longer exists.";
          noticeTone = "error";
          continue;
        }
        const confirmationOptions = {
          type: "warning",
          title: isChinese ? "永久删除恢复备份" : "Permanently delete recovery backup",
          message: isChinese ? `永久删除 ${backup.pluginName} 的这份恢复备份？` : `Permanently delete this recovery backup for ${backup.pluginName}?`,
          detail: isChinese ? "此操作不可撤销。" : "This action cannot be undone.",
          buttons: [isChinese ? "取消" : "Cancel", isChinese ? "永久删除" : "Delete permanently"],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        };
        const owner = safeModeManager?.parent;
        const confirmation = owner && !owner.isDestroyed() ? await dialog.showMessageBox(owner, confirmationOptions) : await dialog.showMessageBox(confirmationOptions);
        if (confirmation.response !== 1) {
          notice = isChinese ? "已保留恢复备份。" : "The recovery backup was kept.";
          continue;
        }
        const cleaned = await cleanupVerifiedRemovalBackup(
          dshHome,
          action.removalId,
          (line) => runtime.note(line)
        );
        notice = cleaned.ok ? isChinese ? `已永久删除 ${backup.pluginName} 的这份恢复备份。` : `Permanently deleted the recovery backup for ${backup.pluginName}.` : isChinese ? `备份未删除：${cleaned.reason ?? "尚未通过正常启动验证"}` : `Backup kept: ${cleaned.reason ?? "normal boot has not been verified"}`;
        noticeTone = cleaned.ok ? "success" : "error";
        continue;
      }
      if (action.type === "restart") {
        const unresolved = compatibility.issues.filter((issue) => issue.severity === "blocking");
        if (unresolved.length > 0) {
          runtime.note(
            `[safe-mode] user exited with ${unresolved.length} unresolved compatibility issue${unresolved.length === 1 ? "" : "s"}`
          );
        }
        await launchHarness();
        if (await refreshMigrationRecoveryLock(dshHome)) {
          notice = isChinese ? "Profile 恢复事务仍未完成。已继续保留恢复材料和安全模式；请按提示重试。" : "The Profile recovery transaction is still incomplete. Recovery material and Safe Mode remain active; follow the prompt and retry.";
          noticeTone = "error";
          continue;
        }
        void mobileBridge.start().catch(showUnexpectedError);
        return;
      }
      if (action.type === "upgrade") {
        if (await refreshMigrationRecoveryLock(dshHome)) {
          notice = isChinese ? "Profile 恢复事务完成前禁止升级插件。" : "Plugins cannot be upgraded until the recovery transaction completes.";
          noticeTone = "error";
          continue;
        }
        const reportsByPkg = new Map((healthReports ?? []).map((r) => [r.packageName, r]));
        const targets = action.plugins.filter((pkg) => {
          const report = reportsByPkg.get(pkg);
          return report?.upgradeReady && report.upgradeVersion;
        });
        if (targets.length === 0) {
          notice = isChinese ? "所选插件没有可升级的兼容版本。" : "No compatible upgrade candidate found for selected plugins.";
          noticeTone = "error";
          continue;
        }
        let upgradedCount = 0;
        const failedPackages = [];
        for (const pkg of targets) {
          const report = reportsByPkg.get(pkg);
          const res = await upgradePluginToGeneration({
            dshHome,
            pluginName: pkg,
            targetVersion: report.upgradeVersion,
            nodeExecutablePath: bundledNodePath(),
            pnpmEntryPath: bundledPnpmEntryPath(),
            note: (line) => runtime.note(line)
          });
          if (res.ok) {
            upgradedCount++;
          } else {
            failedPackages.push(pkg);
          }
        }
        if (failedPackages.length === 0) {
          notice = isChinese ? `成功升级 ${upgradedCount} 个插件。` : `Successfully upgraded ${upgradedCount} plugin${upgradedCount === 1 ? "" : "s"}.`;
          noticeTone = "success";
        } else {
          notice = isChinese ? `成功升级 ${upgradedCount} 个插件，${failedPackages.length} 个升级失败（${failedPackages.join("、")}）。` : `Upgraded ${upgradedCount} plugin${upgradedCount === 1 ? "" : "s"}; ${failedPackages.length} failed (${failedPackages.join(", ")}).`;
          noticeTone = "error";
        }
        continue;
      }
      if (await refreshMigrationRecoveryLock(dshHome)) {
        notice = isChinese ? "Profile 恢复事务完成前禁止修改正常 Profile。" : "The normal Profile is locked until the recovery transaction completes.";
        noticeTone = "error";
        continue;
      }
      const issueById = new Map(compatibility.issues.map((issue) => [issue.id, issue]));
      const selectedIssues = [...new Set(action.issues)].map((id) => issueById.get(id)).filter((issue) => issue !== void 0 && issue.resolution !== "inspect-only");
      const installedSet = new Set(installed);
      const selectedPlugins = [...new Set(action.plugins)].filter((plugin) => installedSet.has(plugin));
      if (selectedIssues.length === 0 && selectedPlugins.length === 0) {
        notice = isChinese ? "请选择要处理的插件或遗留项。" : "Select at least one plugin or leftover to process.";
        noticeTone = "error";
        continue;
      }
      let repaired = 0;
      let repairFailures = 0;
      if (selectedIssues.length > 0) {
        const result = await repairSafeModeCompatibilityIssues(dshHome, selectedIssues);
        if (result.installFailed) {
          notice = isChinese ? `已备份并应用部分修复，但依赖重建失败：${result.installFailed}` : `Some recoverable repairs were applied, but dependency rebuild failed: ${result.installFailed}`;
          noticeTone = "error";
          continue;
        }
        repaired = result.repaired.length;
        repairFailures = result.failed.length;
      }
      const failedPlugins = [];
      const pendingPlugins = [];
      for (const plugin of selectedPlugins) {
        const removal = await removeSafeModePlugin(dshHome, plugin);
        if (!removal.disabled) failedPlugins.push(plugin);
        else if (removal.pending) pendingPlugins.push(plugin);
      }
      const disabledPlugins = new Set(selectedPlugins.filter((plugin) => !failedPlugins.includes(plugin)));
      safeModeSuspectedPlugins = safeModeSuspectedPlugins.filter((plugin) => !disabledPlugins.has(plugin));
      const failed = repairFailures + failedPlugins.length;
      notice = pendingPlugins.length > 0 ? isChinese ? `已禁用 ${pendingPlugins.length} 个插件；Profile 依赖清理待重试。插件不会在后续启动中重新启用。` : `Disabled ${pendingPlugins.length} plugin${pendingPlugins.length === 1 ? "" : "s"}; profile dependency cleanup is pending. They will stay disabled on later launches.` : failed === 0 ? isChinese ? `处理完成：修复 ${repaired} 项，卸载 ${selectedPlugins.length} 个插件。` : `Completed: ${repaired} repair${repaired === 1 ? "" : "s"} and ${selectedPlugins.length} plugin removal${selectedPlugins.length === 1 ? "" : "s"}.` : isChinese ? `已修复 ${repaired} 项、卸载 ${selectedPlugins.length - failedPlugins.length} 个插件；${failed} 项未能处理。` : `Completed ${repaired} repairs and removed ${selectedPlugins.length - failedPlugins.length} plugins; ${failed} items could not be processed.`;
      noticeTone = failed === 0 && pendingPlugins.length === 0 ? "success" : "error";
    }
  } finally {
    safeModeActionResolver = void 0;
    safeModeManagerVisible = false;
    const window = safeModeManager;
    safeModeManager = void 0;
    if (window && !window.isDestroyed()) window.close();
  }
}
function installMenu() {
  const isChinese = harnessLocale() === "zh";
  const checkForUpdatesLabel = isChinese ? "检查更新…" : "Check for Updates…";
  const template = [
    ...process.platform === "darwin" ? [
      {
        label: app.name,
        submenu: [
          {
            label: isChinese ? "关于 DSH Desktop" : "About DSH Desktop",
            click: () => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                void showAbout(mainWindow).catch(showUnexpectedError);
              }
            }
          },
          {
            label: checkForUpdatesLabel,
            accelerator: "CmdOrCtrl+U",
            click: () => void checkForUpdates(true).catch(showUnexpectedError)
          },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" }
        ]
      }
    ] : [],
    {
      label: "Harness",
      submenu: [
        {
          label: isChinese ? "连接手机…" : "Connect Phone…",
          accelerator: "CmdOrCtrl+Shift+M",
          click: () => void showMobilePairing().catch(showUnexpectedError)
        },
        { type: "separator" },
        {
          label: isChinese ? "重启 Harness" : "Restart Harness",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => void restartHarness().catch(showUnexpectedError)
        },
        {
          label: isChinese ? "以安全模式重启…" : "Restart as Safe Mode…",
          click: () => void showSafeMode().catch(showUnexpectedError)
        },
        {
          label: isChinese ? "查看 Harness 日志" : "Show Harness Log",
          click: () => shell.showItemInFolder(join(app.getPath("logs"), "harness.log"))
        },
        ...process.platform === "darwin" ? [] : [
          { type: "separator" },
          {
            label: checkForUpdatesLabel,
            accelerator: "CmdOrCtrl+U",
            click: () => void checkForUpdates(true).catch(showUnexpectedError)
          }
        ],
        ...process.platform === "darwin" ? [] : [{ type: "separator" }, { role: "quit" }]
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  if (process.platform === "win32" && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setMenuBarVisibility(false);
  }
}
function broadcastMobileStatus(connected) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send("mobile:status-changed", { connected });
  }
}
async function showMobilePairing() {
  if (runtime.snapshot().phase !== "ready") {
    const options = {
      type: "info",
      message: "Harness is still starting.",
      detail: "Wait until DSH Desktop is ready, then connect your phone again.",
      buttons: ["OK"]
    };
    await (mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options));
    return;
  }
  let snapshot = await mobileBridge.start();
  if (!snapshot.desktopUrl) {
    await mobileBridge.stop();
    const options = {
      type: "warning",
      message: "Failed to start mobile bridge.",
      detail: "Please try again.",
      buttons: ["OK"]
    };
    await (mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options));
    return;
  }
  if (!snapshot.pairingUrl && !snapshot.tunnelActive) {
    snapshot = await mobileBridge.toggleTunnel(true);
  }
  if (mobileWindow && !mobileWindow.isDestroyed()) mobileWindow.destroy();
  nativeTheme.themeSource = harnessThemePreference();
  mobileWindow = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 420,
    minHeight: 560,
    title: harnessLocale() === "zh" ? "连接移动设备" : "Connect Mobile Device",
    icon: desktopIconPath(),
    parent: mainWindow,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#141416" : "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  secureWindow(mobileWindow);
  mobileWindow.on("closed", () => {
    mobileWindow = void 0;
  });
  if (!snapshot.desktopUrl) return;
  await mobileWindow.loadURL(snapshot.desktopUrl);
  mobileWindow.show();
  mobileWindow.focus();
}
async function bootstrap() {
  desktopDiagnostics?.startSending();
  if (process.platform === "darwin") app.dock?.setIcon(desktopIconPath());
  launchDirectory = await ensureLaunchRoot(app.getPath("userData"));
  registerUpdateHandlers();
  nativeTheme.themeSource = harnessThemePreference();
  ensureTray();
  const dshHome = join(app.getPath("userData"), "harness");
  desktopStorageManager = new DesktopStorageManager(join(dshHome, "profiles", "web"), {
    onError: (error, context) => {
      console.warn(`[desktop-storage] error during ${context}:`, error);
    }
  });
  createWindow();
  runtime = new HarnessRuntime({
    dshEntryPath: dshEntryPath(),
    nodeExecutablePath: bundledNodePath(),
    nodeEntryPath: harnessNodeEntryPath(),
    dshPatchPath: desktopResourcePath("dsh-desktop.patch.yml"),
    dshSafePatchPath: desktopResourcePath("dsh-desktop-safe.patch.yml"),
    dshHome: join(app.getPath("userData"), "harness"),
    logPath: join(app.getPath("logs"), "harness.log"),
    // Keep the Harness origin stable across launches. These ports are separate
    // from the production/development mobile bridge ports (43127/43128).
    preferredPort: DEFAULT_HARNESS_PORT + (developmentBuild ? 1 : 0),
    launchProcess: (executablePath2, args, options) => process.platform === "darwin" ? launchDisclaimedUtilityProcess(utilityProcess, args, options, {
      disclaim: !developmentBuild
    }) : spawn(executablePath2, args, options),
    onChanged: (snapshot) => {
      desktopDiagnostics?.runtimeChanged(snapshot, () => runtime.flushLog(), runtime.launchAttemptId);
      if (snapshot.phase === "ready" && snapshot.url) {
        void openHarness(snapshot.url).catch(showUnexpectedError);
      } else if (snapshot.phase === "failed") {
        void showRuntimeFailure(snapshot);
      }
    }
  });
  registerHarnessHandlers();
  mobileBridge = new LanMobileBridge({
    harnessUrl: () => runtime.snapshot().url,
    harnessAuthToken: () => runtime.snapshot().authToken,
    locale: harnessLocale,
    brandLogoPaths: {
      light: dshBrandLogoPath("light"),
      dark: dshBrandLogoPath("dark")
    },
    appIconPath: desktopIconPath(),
    cloudflaredCacheDir: join(app.getPath("userData"), "bin"),
    forceCloudflareFailure: process.env.DSH_TUNNEL_FORCE_PINGGY === "1",
    tunnelLog: (message) => console.warn(message),
    port: developmentBuild ? 43128 : 43127,
    onReconnectRequested: () => {
      void showMobilePairing().catch(showUnexpectedError);
    },
    onConnectedChange: (connected) => broadcastMobileStatus(connected)
  });
  if (!startInSafeMode) void mobileBridge.start().catch(showUnexpectedError);
  ipcMain.handle("directory-picker:open", async (event) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error("Directory picker requests are only allowed from the main Harness window");
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: harnessLocale() === "zh" ? "选择工作区目录" : "Select Workspace Directory",
      properties: ["openDirectory"]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("mobile:open-pairing", () => showMobilePairing());
  ipcMain.handle("mobile:status", () => ({ connected: mobileBridge.snapshot().connected }));
  ipcMain.handle("harness:show-log", () => {
    shell.showItemInFolder(join(app.getPath("logs"), "harness.log"));
  });
  ipcMain.handle("harness:open-in-finder", async (event, path) => {
    assertTrustedMainWindowEvent(event);
    if (typeof path !== "string" || path.length === 0) {
      throw new Error("A directory path is required.");
    }
    const errorMessage2 = await shell.openPath(path);
    if (errorMessage2) throw new Error(errorMessage2);
    return { ok: true };
  });
  ipcMain.removeHandler("harness:renderer-healthy");
  ipcMain.handle("harness:renderer-healthy", (event) => {
    assertTrustedMainWindowEvent(event);
    if (safeModeVisible || failureRecoveryVisible || runtime.snapshot().phase !== "ready") {
      return { ok: false };
    }
    scheduleNormalProfileBootConfirmation();
    return { ok: true };
  });
  ipcMain.removeHandler("harness:open-recovery");
  ipcMain.handle("harness:open-recovery", async (event, frontendErrorMessage) => {
    assertTrustedMainWindowEvent(event);
    desktopDiagnostics?.discardPendingPluginFailure();
    const message = typeof frontendErrorMessage === "string" ? frontendErrorMessage : void 0;
    if (message) appendRendererPluginFailureLog(message);
    const logs = [...rendererPluginFailureLogs];
    appendRendererPluginRecoveryLog(logs);
    if (failureRecoveryVisible) {
      queuePendingFrontendPluginRecovery(message);
      return { ok: true };
    }
    void showPluginRecovery({ message, logs, followRendererLogs: true });
    return { ok: true };
  });
  ipcMain.removeHandler("recovery:action");
  ipcMain.handle("recovery:action", (event, action) => {
    assertTrustedMainWindowEvent(event);
    if (typeof action === "string" && (PLUGIN_RECOVERY_ACTIONS.has(action) || /^(upgrade|uninstall):.+$/.test(action))) {
      resolvePluginRecoveryAction(action);
      return { ok: true };
    }
    return { ok: false };
  });
  ipcMain.removeHandler("web-import:action");
  ipcMain.handle("web-import:action", (event, action) => {
    assertTrustedMainWindowEvent(event);
    if (!isWebImportPage(event.sender.getURL())) return { ok: false };
    if (action === "import" || action === "skip") {
      resolveWebImportAction(action);
      return { ok: true };
    }
    return { ok: false };
  });
  ipcMain.removeHandler("safe-mode:action");
  ipcMain.handle("safe-mode:action", async (event, action, selection) => {
    assertTrustedSafeModeManagerEvent(event);
    if (!safeModeVisible || !safeModeManagerVisible || action !== "apply" && action !== "upgrade" && action !== "recovery-open" && action !== "backup-open" && action !== "backup-restore" && action !== "backup-delete" && action !== "agent" && action !== "restart" && action !== "quit") {
      return { ok: false };
    }
    await refreshMigrationRecoveryLock(join(app.getPath("userData"), "harness"));
    if ((action === "apply" || action === "upgrade" || action === "backup-delete") && profileRecoveryLocked()) return { ok: false };
    if (action === "apply") {
      if (typeof selection !== "object" || selection === null) return { ok: false };
      const { plugins, issues } = selection;
      if (!Array.isArray(plugins) || !plugins.every((plugin) => typeof plugin === "string") || !Array.isArray(issues) || !issues.every((issue) => typeof issue === "string")) {
        return { ok: false };
      }
      resolveSafeModeAction({ type: "apply", plugins, issues });
    } else if (action === "upgrade") {
      if (typeof selection !== "object" || selection === null) return { ok: false };
      const { plugins } = selection;
      if (!Array.isArray(plugins) || !plugins.every((plugin) => typeof plugin === "string")) {
        return { ok: false };
      }
      resolveSafeModeAction({ type: "upgrade", plugins });
    } else if (action === "backup-open" || action === "backup-restore" || action === "backup-delete") {
      if (typeof selection !== "object" || selection === null) return { ok: false };
      const { removalId } = selection;
      if (typeof removalId !== "string" || removalId.length === 0) return { ok: false };
      if (action === "backup-restore" && !await canRetryLockedPluginRestore(join(app.getPath("userData"), "harness"), removalId)) return { ok: false };
      resolveSafeModeAction({ type: action, removalId });
    } else {
      resolveSafeModeAction({ type: action });
    }
    return { ok: true };
  });
  ipcMain.removeHandler("safe-mode:status");
  ipcMain.handle("safe-mode:status", (event) => {
    assertTrustedMainWindowEvent(event);
    return { active: safeModeVisible, locale: harnessLocale() };
  });
  ipcMain.removeHandler("safe-mode:manage");
  ipcMain.handle("safe-mode:manage", (event) => {
    assertTrustedMainWindowEvent(event);
    if (!safeModeVisible) return { ok: false };
    void showSafeModeManager().catch(showUnexpectedError);
    return { ok: true };
  });
  ipcMain.removeHandler("safe-mode:exit");
  ipcMain.handle("safe-mode:exit", async (event) => {
    assertTrustedMainWindowEvent(event);
    if (!safeModeVisible) return { ok: false };
    const dshHome2 = join(app.getPath("userData"), "harness");
    if (await refreshMigrationRecoveryLock(dshHome2)) {
      resolveSafeModeAction({ type: "agent" });
      await launchHarness();
      if (await refreshMigrationRecoveryLock(dshHome2)) {
        void showSafeModeManager({
          notice: harnessLocale() === "zh" ? "Profile 恢复事务仍未完成，正常 Profile 继续保持锁定。" : "The Profile recovery transaction is still incomplete; the normal Profile remains locked.",
          noticeTone: "error"
        }).catch(showUnexpectedError);
        return { ok: false, blocked: true };
      }
      void mobileBridge.start().catch(showUnexpectedError);
      return { ok: true };
    }
    const compatibility = await inspectProfileCompatibility(
      dshHome2,
      join(app.getAppPath(), "node_modules")
    );
    if (compatibility.issues.some((issue) => issue.severity === "blocking")) {
      void showSafeModeManager().catch(showUnexpectedError);
      return { ok: false, blocked: true };
    }
    resolveSafeModeAction({ type: "agent" });
    await launchHarness();
    void mobileBridge.start().catch(showUnexpectedError);
    return { ok: true };
  });
  ipcMain.removeHandler("harness:reset-plugins");
  ipcMain.handle("harness:reset-plugins", async (event, pluginName) => {
    assertTrustedMainWindowEvent(event);
    if (pluginName !== void 0 && typeof pluginName !== "string") {
      throw new Error("The failing plugin name must be a string.");
    }
    const dshHome2 = join(app.getPath("userData"), "harness");
    await resetPluginProfile(dshHome2, pluginName);
    await launchHarness();
    return { ok: runtime.snapshot().phase === "ready" };
  });
  installMenu();
  if (startInSafeMode) {
    void showSafeMode().catch(showUnexpectedError);
  } else {
    await launchHarness();
  }
  if (!developmentBuild) {
    startUpdateManager({
      prepareToInstall: async () => {
        await runtime.stop();
        const dshHome2 = join(app.getPath("userData"), "harness");
        await quarantineInstalledLaunchAgentsForUpdate(dshHome2);
        quitting = true;
        desktopDiagnostics?.markCleanExit();
        stopUpdateManager();
      }
    });
  }
}
if (isDaemonLaunch(process.env, process.platform)) {
  app.exit(0);
} else {
  configureAppIdentity();
  configureApplicationLocale();
  configureGpuFallback();
  installGpuFallbackWatch();
  const singleInstance = app.requestSingleInstanceLock();
  if (!singleInstance) {
    app.quit();
  } else {
    void prewarmShellEnvironment();
    initializeDesktopService();
    app.on("second-instance", (_event, argv) => {
      if (!isUserInitiatedInstance(argv)) return;
      if (shouldStartInSafeMode(argv)) {
        void showSafeMode().catch(showUnexpectedError);
        return;
      }
      const snapshot = runtime?.snapshot();
      if (snapshot?.phase === "ready" && snapshot.url) {
        void openHarness(snapshot.url, "user").catch(showUnexpectedError);
      }
    });
    app.whenReady().then(bootstrap).catch((error) => {
      desktopDiagnostics?.startupFailed(error);
      showUnexpectedError(error);
      app.quit();
    });
    app.on("activate", () => {
      if (safeModeVisible && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        return;
      }
      const snapshot = runtime?.snapshot();
      if (snapshot?.phase === "ready" && snapshot.url) {
        void openHarness(snapshot.url, "user").catch(showUnexpectedError);
      } else if (snapshot?.phase === "idle") {
        void launchHarness().catch(showUnexpectedError);
      }
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
    app.on("before-quit", (event) => {
      desktopDiagnostics?.markCleanExit();
      if (quitting || !runtime) return;
      event.preventDefault();
      quitting = true;
      desktopStorageManager?.flushSync();
      stopUpdateManager();
      if (tray && !tray.isDestroyed()) tray.destroy();
      tray = void 0;
      void Promise.all([runtime.stop(), mobileBridge?.stop()]).finally(() => app.quit());
    });
  }
}
