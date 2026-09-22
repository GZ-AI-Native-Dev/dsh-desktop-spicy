"use strict";
const electron = require("electron");
function setupDesktopStoragePersistence() {
  let initialData = {};
  try {
    initialData = electron.ipcRenderer.sendSync("dsh:storage-load-sync") ?? {};
  } catch (error) {
    console.warn("[desktop-storage] Failed to load initial storage sync:", error);
  }
  const serializedInitial = JSON.stringify(initialData);
  const injectionScript = `
(function() {
  try {
    const initial = ${serializedInitial};
    const memoryStore = new Map(Object.entries(initial));

    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalClear = Storage.prototype.clear;
    const originalKey = Storage.prototype.key;

    Object.defineProperty(Storage.prototype, 'length', {
      get: function() {
        if (this === window.localStorage) return memoryStore.size;
        return 0;
      },
      configurable: true
    });

    Storage.prototype.getItem = function(key) {
      if (this === window.localStorage) {
        const k = String(key);
        return memoryStore.has(k) ? memoryStore.get(k) : null;
      }
      return originalGetItem.apply(this, arguments);
    };

    Storage.prototype.setItem = function(key, val) {
      if (this === window.localStorage) {
        const k = String(key);
        const v = String(val);
        memoryStore.set(k, v);
        window.dispatchEvent(new CustomEvent('__dsh_storage_sync__', {
          detail: { type: 'set', key: k, val: v }
        }));
        return;
      }
      return originalSetItem.apply(this, arguments);
    };

    Storage.prototype.removeItem = function(key) {
      if (this === window.localStorage) {
        const k = String(key);
        if (!memoryStore.has(k)) return;
        memoryStore.delete(k);
        window.dispatchEvent(new CustomEvent('__dsh_storage_sync__', {
          detail: { type: 'remove', key: k }
        }));
        return;
      }
      return originalRemoveItem.apply(this, arguments);
    };

    Storage.prototype.clear = function() {
      if (this === window.localStorage) {
        if (memoryStore.size === 0) return;
        memoryStore.clear();
        window.dispatchEvent(new CustomEvent('__dsh_storage_sync__', {
          detail: { type: 'clear' }
        }));
        return;
      }
      return originalClear.apply(this, arguments);
    };

    Storage.prototype.key = function(index) {
      if (this === window.localStorage) {
        const keys = Array.from(memoryStore.keys());
        return keys[index] ?? null;
      }
      return originalKey.apply(this, arguments);
    };

    try {
      const storageProxy = new Proxy(window.localStorage, {
        get(target, prop, receiver) {
          if (
            prop in target ||
            typeof prop === 'symbol' ||
            prop === 'getItem' ||
            prop === 'setItem' ||
            prop === 'removeItem' ||
            prop === 'clear' ||
            prop === 'key' ||
            prop === 'length'
          ) {
            return Reflect.get(target, prop, receiver);
          }
          return target.getItem(String(prop));
        },
        set(target, prop, value, receiver) {
          if (prop in target) {
            return Reflect.set(target, prop, value, receiver);
          }
          target.setItem(String(prop), String(value));
          return true;
        },
        deleteProperty(target, prop) {
          target.removeItem(String(prop));
          return true;
        }
      });

      Object.defineProperty(window, 'localStorage', {
        value: storageProxy,
        configurable: true,
        writable: true
      });
    } catch {
      // Ignore if Object.defineProperty on window.localStorage is restricted;
      // Storage.prototype overrides handle .getItem/.setItem regardless.
    }
  } catch (err) {
    console.error('[desktop-storage] Injected persistence setup failed:', err);
  }
})();
`;
  function inject() {
    const container = document.documentElement || document.head;
    if (container) {
      const script = document.createElement("script");
      script.textContent = injectionScript;
      container.appendChild(script);
      script.remove();
      return true;
    }
    return false;
  }
  if (!inject()) {
    const observer = new MutationObserver(() => {
      if (inject()) {
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true });
  }
  window.addEventListener("__dsh_storage_sync__", (event) => {
    const detail = event.detail;
    if (detail && typeof detail === "object") {
      electron.ipcRenderer.send("dsh:storage-sync", detail);
    }
  });
}
function shouldShowUpdate(status) {
  if (["available", "downloading", "downloaded"].includes(status.phase)) return true;
  return status.manual && ["checking", "up-to-date", "error", "unsupported"].includes(status.phase);
}
function isUpdateDismissed(status, dismissedVersion2, dismissedTransientPhase2 = null) {
  if (status.availableVersion) return status.availableVersion === dismissedVersion2;
  return status.phase === dismissedTransientPhase2;
}
function updateHeadline(status, locale2) {
  const zh = locale2 === "zh";
  const version = status.availableVersion ? `v${status.availableVersion}` : "";
  if (status.downgrade && status.availableVersion) {
    return {
      title: zh ? `正在降级到 ${version}` : `Downgrading to ${version}`,
      description: zh ? `将当前 v${status.currentVersion} 回退到 ${version}` : `Rolling back v${status.currentVersion} to ${version}`
    };
  }
  switch (status.phase) {
    case "checking":
      return {
        title: zh ? "正在检查更新" : "Checking for updates",
        description: zh ? `当前 v${status.currentVersion}` : `Currently on v${status.currentVersion}`
      };
    case "available":
      return {
        title: zh ? "有可用更新" : "Update available",
        description: zh ? `${version} 已发布，同意后开始下载。` : `${version} is ready to download.`
      };
    case "downloading":
      return {
        title: zh ? "正在下载更新" : "Downloading update",
        description: zh ? `${version} · ${Math.round(status.percent ?? 0)}%` : `${version} · ${Math.round(status.percent ?? 0)}%`
      };
    case "downloaded":
      return {
        title: zh ? "更新已就绪" : "Update ready",
        description: zh ? `${version} 将在重启后生效。` : `${version} will be applied on next launch.`
      };
    case "up-to-date":
      return {
        title: zh ? "已是最新版本" : "Up to date",
        description: zh ? `当前 v${status.currentVersion}` : `Currently on v${status.currentVersion}`
      };
    case "unsupported":
      return {
        title: zh ? "此版本不支持自动更新" : "Automatic updates unavailable",
        description: zh ? "请从官网下载新版本。" : "Download new versions from the website."
      };
    case "error":
      return {
        title: zh ? "更新失败" : "Update failed",
        description: zh ? "无法检查或下载更新。" : "Unable to check for or download updates."
      };
    case "idle":
      return { title: "", description: "" };
  }
}
function isPluginLoadError(error) {
  if (!error) return false;
  const message = error instanceof Error ? `${error.message}
${error.stack ?? ""}` : typeof error === "string" ? error : typeof error.message === "string" ? error.message : typeof error.reason === "string" ? error.reason : String(error.reason?.message ?? "");
  return /client-modules:\s*bundle\s*script\s*.*failed\s*to\s*load/i.test(message) || /failed\s*to\s*import\s*loader\s*entry/i.test(message) || /client-modules:.*missed\s*the\s*module\s*table/i.test(message);
}
const BOOT_FAILURE_ROOT_SELECTOR = "[data-dsh-boot]";
const BOOT_FAILURE_TITLE = "Failed to load plugins";
function extractBootFailureText(root) {
  if (!root) return void 0;
  const text = root.innerText || root.textContent;
  if (!text?.includes(BOOT_FAILURE_TITLE)) return void 0;
  return text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).join("\n");
}
function findBootFailureText(document2) {
  return extractBootFailureText(
    document2.querySelector(BOOT_FAILURE_ROOT_SELECTOR)
  );
}
const LAYOUT_STYLE_ID = "dsh-desktop-windows-titlebar-layout-style";
const DRAG_REGION_ID = "dsh-desktop-windows-drag-region";
const SIDEBAR_WIDTH_PROPERTY = "--dsh-desktop-windows-sidebar-width";
const CAPTION_WIDTH_PROPERTY = "--dsh-desktop-windows-caption-width";
function mountWindowsTitlebarLayout(options) {
  const { document: document2, ipcRenderer } = options;
  if (!document2.body) return;
  installLayout(document2);
  installDragRegion(document2);
  trackSidebarLayout(document2);
  document2.addEventListener("pointerdown", () => {
    void ipcRenderer.invoke("desktop-titlebar:close-menu").catch((error) => {
      console.warn("[desktop-titlebar] unable to close the application menu", error);
    });
  });
  syncTheme(document2, ipcRenderer);
  const themeObserver = new MutationObserver(() => syncTheme(document2, ipcRenderer));
  themeObserver.observe(document2.body, {
    attributes: true,
    attributeFilter: ["data-ds-dark-theme", "class", "style"]
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    syncTheme(document2, ipcRenderer);
  });
}
function installLayout(document2) {
  document2.body.classList.add("dsh-desktop-windows-titlebar-layout");
  if (document2.getElementById(LAYOUT_STYLE_ID)) return;
  const style = document2.createElement("style");
  style.id = LAYOUT_STYLE_ID;
  style.textContent = `
    html, body { height: 100% !important; }
    body.dsh-desktop-windows-titlebar-layout {
      ${CAPTION_WIDTH_PROPERTY}: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, calc(100vw - 140px)));
      box-sizing: border-box !important;
      height: 100% !important;
      padding-top: 0 !important;
    }
    body.dsh-desktop-windows-titlebar-layout > #root {
      height: 100% !important;
      min-height: 0 !important;
    }
    :root {
      --dsh-titlebar-safe-inset-top: 36px;
      --dsh-titlebar-safe-inset-right: calc(var(${CAPTION_WIDTH_PROPERTY}, 140px) + 44px);
    }
    body.dsh-desktop-windows-titlebar-layout [data-dsh-sidebar-root][data-dsh-sidebar-wide="true"] {
      padding-top: 6px !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-sidebar-right-panel],
    body.dsh-desktop-windows-titlebar-layout [data-sidebar-right-panel="fullscreen"],
    body.dsh-desktop-windows-titlebar-layout [data-rightbar-col] > div,
    body.dsh-desktop-windows-titlebar-layout [data-side="rightbar"] {
      top: var(--dsh-titlebar-safe-inset-top, 36px) !important;
      height: calc(100% - var(--dsh-titlebar-safe-inset-top, 36px)) !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header {
      position: relative !important;
      min-height: 76px !important;
      padding-top: 6px !important;
      padding-right: 20px !important;
      box-sizing: border-box !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header > div:first-child {
      padding-right: calc(var(${CAPTION_WIDTH_PROPERTY}, 140px) + 52px) !important;
      box-sizing: border-box !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header div[data-conversation-header-corner],
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerCorner"] {
      position: absolute !important;
      top: 38px !important;
      right: 20px !important;
      margin: 0 !important;
      z-index: 20 !important;
      display: flex !important;
      align-items: center !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerUtilities"] {
      position: absolute !important;
      top: 38px !important;
      right: 56px !important;
      margin: 0 !important;
      z-index: 20 !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerUtilities"]:has(+ [data-conversation-header-corner]:empty),
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerUtilities"]:has(+ [class*="headerCorner"]:empty),
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerUtilities"]:has(+ div:empty),
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerUtilities"]:last-child {
      right: 20px !important;
    }
    body.dsh-desktop-windows-titlebar-layout [class*="headerUtilities"] button[aria-label="更多操作"],
    body.dsh-desktop-windows-titlebar-layout [class*="headerUtilities"] button[aria-label="More actions"],
    body.dsh-desktop-windows-titlebar-layout [class*="headerUtilities"] [class*="moreButton"] {
      display: none !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header div[role="tablist"] {
      padding-right: 180px !important;
      box-sizing: border-box !important;
    }
    body.dsh-desktop-windows-titlebar-layout button,
    body.dsh-desktop-windows-titlebar-layout a,
    body.dsh-desktop-windows-titlebar-layout input,
    body.dsh-desktop-windows-titlebar-layout select,
    body.dsh-desktop-windows-titlebar-layout textarea,
    body.dsh-desktop-windows-titlebar-layout [role="button"],
    body.dsh-desktop-windows-titlebar-layout [role="tab"],
    body.dsh-desktop-windows-titlebar-layout [role="menuitem"],
    body.dsh-desktop-windows-titlebar-layout [data-dsh-no-drag] {
      -webkit-app-region: no-drag !important;
    }
    #${DRAG_REGION_ID} {
      position: fixed;
      z-index: 10;
      top: 0;
      left: 0;
      right: calc(var(${CAPTION_WIDTH_PROPERTY}, 140px) + 44px);
      height: 36px;
      background: transparent;
      user-select: none;
      -webkit-app-region: drag;
    }
  `;
  document2.head.appendChild(style);
}
function installDragRegion(document2) {
  if (document2.getElementById(DRAG_REGION_ID)) return;
  const dragRegion = document2.createElement("div");
  dragRegion.id = DRAG_REGION_ID;
  dragRegion.setAttribute("aria-hidden", "true");
  document2.body.appendChild(dragRegion);
  const modalSelector = 'dialog[open], [role="dialog"], [aria-modal="true"], [class*="modal" i], [class*="dialog" i]';
  const updateDragRegionVisibility = () => {
    const hasModal = Array.from(document2.querySelectorAll(modalSelector)).some((el) => {
      if (el.id === DRAG_REGION_ID) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && el.offsetWidth > 0 && el.offsetHeight > 0;
    });
    dragRegion.style.display = hasModal ? "none" : "block";
  };
  const observer = new MutationObserver(() => updateDragRegionVisibility());
  observer.observe(document2.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open", "style", "class", "hidden", "aria-hidden"]
  });
  updateDragRegionVisibility();
}
function trackSidebarLayout(document2) {
  let observedSidebarColumn = null;
  const resizeObserver = new ResizeObserver(() => updateSidebarWidth());
  const updateSidebarWidth = () => {
    if (!observedSidebarColumn) {
      document2.documentElement.style.setProperty(SIDEBAR_WIDTH_PROPERTY, "0px");
      return;
    }
    const width = observedSidebarColumn.getBoundingClientRect().width;
    document2.documentElement.style.setProperty(SIDEBAR_WIDTH_PROPERTY, `${Math.max(0, width)}px`);
  };
  const sync = () => {
    const sidebarRoot2 = document2.querySelector("[data-dsh-sidebar-root]");
    const sidebarColumn = sidebarRoot2?.parentElement ?? null;
    if (sidebarColumn !== observedSidebarColumn) {
      if (observedSidebarColumn) resizeObserver.unobserve(observedSidebarColumn);
      observedSidebarColumn = sidebarColumn;
      if (sidebarColumn) resizeObserver.observe(sidebarColumn);
    }
    updateSidebarWidth();
  };
  const observer = new MutationObserver(sync);
  observer.observe(document2.documentElement, { childList: true, subtree: true });
  sync();
}
function syncTheme(document2, ipcRenderer) {
  const isDark = documentIsDark(document2);
  void ipcRenderer.invoke("desktop-titlebar:set-theme", isDark).catch((error) => {
    console.warn("[desktop-titlebar] unable to synchronize native theme", error);
  });
}
function documentIsDark(document2) {
  if (document2.body.hasAttribute("data-ds-dark-theme")) return true;
  const color = document2.defaultView?.getComputedStyle(document2.body).backgroundColor ?? "";
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length < 3 || channels.some(Number.isNaN)) {
    return document2.defaultView?.matchMedia("(prefers-color-scheme: dark)").matches ?? false;
  }
  const [red = 255, green = 255, blue = 255] = channels;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 128;
}
setupDesktopStoragePersistence();
const ROOT_ID = "dsh-desktop-update-root";
const MOBILE_BUTTON_ID = "dsh-desktop-mobile-button";
const SAFE_MODE_BANNER_ID = "dsh-desktop-safe-mode-banner";
const locale = navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
let host;
let content;
let currentStatus;
let dismissedVersion = null;
let dismissedTransientPhase = null;
let installing = false;
let accepting = false;
let versionPickerOpen = false;
let versionPickerLoading = false;
let versionPickerError = false;
let versionPickerList = null;
let installingVersion = null;
const ABOUT_ROOT_ID = "dsh-desktop-about-root";
let aboutHost = null;
let aboutShadow = null;
let aboutOpen = false;
let aboutInfo = null;
let receivedStatusEvent = false;
let phoneConnected = false;
let sidebarSettingsArea;
let sidebarRoot;
let mobileButton;
let domSyncScheduled = false;
let bootScanSettled = false;
let bootFailureTriggered = false;
let bootFailureTimer;
let rendererHealthReportInFlight = false;
let rendererHealthHeartbeat;
const pendingBootFailureMessages = [];
const BOOT_FAILURE_SETTLE_MS = 400;
const RENDERER_HEALTH_HEARTBEAT_MS = 5e3;
function reportRendererHealthy() {
  if (rendererHealthReportInFlight || !sidebarRoot?.isConnected) return;
  rendererHealthReportInFlight = true;
  void electron.ipcRenderer.invoke("harness:renderer-healthy").catch(() => void 0).finally(() => {
    rendererHealthReportInFlight = false;
  });
}
function startRendererHealthHeartbeat() {
  reportRendererHealthy();
  if (rendererHealthHeartbeat !== void 0) return;
  rendererHealthHeartbeat = window.setInterval(reportRendererHealthy, RENDERER_HEALTH_HEARTBEAT_MS);
}
function currentBootFailureText() {
  return findBootFailureText(document);
}
function addBootFailureMessage(message) {
  const normalized = message?.trim();
  if (!normalized || pendingBootFailureMessages.includes(normalized)) return;
  pendingBootFailureMessages.push(normalized);
}
function queueBootFailure(message) {
  if (bootFailureTriggered) return;
  addBootFailureMessage(message);
  addBootFailureMessage(currentBootFailureText());
  if (pendingBootFailureMessages.length === 0) return;
  if (bootFailureTimer !== void 0) window.clearTimeout(bootFailureTimer);
  bootFailureTimer = window.setTimeout(() => {
    bootFailureTimer = void 0;
    if (bootFailureTriggered) return;
    addBootFailureMessage(currentBootFailureText());
    const errorText = pendingBootFailureMessages.join("\n");
    if (!errorText) return;
    bootFailureTriggered = true;
    void electron.ipcRenderer.invoke("harness:open-recovery", errorText);
  }, BOOT_FAILURE_SETTLE_MS);
}
function checkBootFailureInDom() {
  const errorText = currentBootFailureText();
  if (!errorText) return;
  queueBootFailure(errorText);
}
const domObserver = new MutationObserver(scheduleDomSync);
function scheduleDomSync() {
  if (domSyncScheduled) return;
  domSyncScheduled = true;
  window.requestAnimationFrame(runDomSync);
}
function runDomSync() {
  domSyncScheduled = false;
  mountMobileButton();
  if (bootScanSettled) return;
  if (sidebarRoot?.isConnected) {
    bootScanSettled = true;
    startRendererHealthHeartbeat();
  } else checkBootFailureInDom();
}
electron.contextBridge.exposeInMainWorld("dshDesktopDirectoryPicker", {
  pick: () => electron.ipcRenderer.invoke("directory-picker:open")
});
function liveElement(cached, selector) {
  if (cached?.isConnected) return cached;
  return document.querySelector(selector) ?? void 0;
}
function mountMobileButton() {
  if (!document.getElementById(`${MOBILE_BUTTON_ID}-style`)) {
    const style = document.createElement("style");
    style.id = `${MOBILE_BUTTON_ID}-style`;
    style.textContent = mobileButtonStyles;
    document.head.appendChild(style);
  }
  sidebarSettingsArea = liveElement(sidebarSettingsArea, "[data-dsh-sidebar-settings]");
  const settingsArea = sidebarSettingsArea;
  if (!settingsArea) return;
  if (!mobileButton?.isConnected) {
    mobileButton = document.getElementById(MOBILE_BUTTON_ID) ?? void 0;
  }
  if (!mobileButton) {
    const created = document.createElement("button");
    created.id = MOBILE_BUTTON_ID;
    created.type = "button";
    created.innerHTML = `${phoneIcon}<span aria-hidden="true"></span>`;
    created.addEventListener("click", () => {
      void electron.ipcRenderer.invoke("mobile:open-pairing").catch((error) => {
        console.error("[mobile] unable to open pairing window", error);
      });
    });
    mobileButton = created;
  }
  if (mobileButton.parentElement !== settingsArea) settingsArea.appendChild(mobileButton);
  renderMobileButton();
}
function renderMobileButton() {
  const button2 = mobileButton;
  sidebarRoot = liveElement(sidebarRoot, "[data-dsh-sidebar-root]");
  const root = sidebarRoot;
  if (!button2 || !root) return;
  const wide = root.dataset.dshSidebarWide === "true";
  const hidden = !wide && !phoneConnected;
  const label = phoneConnected ? locale === "zh" ? "管理手机连接" : "Manage phone connection" : locale === "zh" ? "连接手机" : "Connect phone";
  if (button2.hidden !== hidden) button2.hidden = hidden;
  if (button2.classList.contains("is-connected") !== phoneConnected) {
    button2.classList.toggle("is-connected", phoneConnected);
  }
  if (button2.title !== label) {
    button2.setAttribute("aria-label", label);
    button2.title = label;
  }
}
async function mountSafeModeBanner() {
  if (location.protocol === "file:" || document.getElementById(SAFE_MODE_BANNER_ID)) return;
  try {
    const status = await electron.ipcRenderer.invoke("safe-mode:status");
    if (status.active !== true) return;
    const safeModeLocale = status.locale === "zh" ? "zh" : "en";
    const host2 = document.createElement("div");
    host2.id = SAFE_MODE_BANNER_ID;
    host2.style.cssText = [
      "position:fixed",
      "top:8px",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:2147483645",
      "max-width:calc(100vw - 32px)",
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(";");
    const shadow = host2.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      .bar { display:flex; align-items:center; gap:10px; min-height:42px; padding:5px 6px 5px 12px; border:1px solid rgba(120,120,125,.35); border-radius:14px; color:#27272a; background:rgba(255,255,255,.94); box-shadow:0 5px 18px rgba(0,0,0,.12); backdrop-filter:blur(12px); white-space:nowrap; }
      .dot { width:7px; height:7px; border-radius:50%; background:#d97706; }
      .copy { display:grid; gap:1px; min-width:0; }
      .title { font-size:12px; font-weight:700; }
      .description { max-width:390px; overflow:hidden; color:#71717a; font-size:10px; font-weight:500; text-overflow:ellipsis; }
      .actions { display:flex; align-items:center; gap:4px; }
      button { min-height:22px; padding:2px 8px; border:0; border-radius:999px; color:#3f3f46; background:#f1f1f3; cursor:pointer; font:inherit; font-size:11px; }
      button:hover { background:#e4e4e7; }
      button:disabled { opacity:.55; cursor:default; }
      @media (prefers-color-scheme:dark) { .bar { color:#f4f4f5; background:rgba(32,32,35,.94); border-color:rgba(180,180,190,.28); } .description { color:#a5a7ad; } button { color:#e4e4e7; background:#343438; } button:hover { background:#44444a; } }
      @media (max-width:760px) { .description { display:none; } }
    `;
    const bar = document.createElement("div");
    bar.className = "bar";
    const dot = document.createElement("span");
    dot.className = "dot";
    const copy = document.createElement("span");
    copy.className = "copy";
    const label = document.createElement("span");
    label.className = "title";
    label.textContent = safeModeLocale === "zh" ? "安全模式" : "Safe Mode";
    const description = document.createElement("span");
    description.className = "description";
    description.textContent = safeModeLocale === "zh" ? "已暂时停用所有第三方插件，可卸载有问题的插件后重启。" : "All third-party plugins are temporarily disabled. Remove a problematic plugin, then restart.";
    copy.append(label, description);
    const actions = document.createElement("span");
    actions.className = "actions";
    const manage = document.createElement("button");
    manage.type = "button";
    manage.textContent = safeModeLocale === "zh" ? "卸载插件" : "Remove plugins";
    manage.setAttribute("aria-label", safeModeLocale === "zh" ? "卸载第三方插件" : "Remove third-party plugins");
    manage.addEventListener("click", () => {
      void electron.ipcRenderer.invoke("safe-mode:manage");
    });
    const exit = document.createElement("button");
    exit.type = "button";
    exit.textContent = safeModeLocale === "zh" ? "退出安全模式" : "Exit Safe Mode";
    exit.setAttribute("aria-label", safeModeLocale === "zh" ? "退出安全模式并重启" : "Exit Safe Mode and restart");
    exit.addEventListener("click", () => {
      manage.disabled = true;
      exit.disabled = true;
      void electron.ipcRenderer.invoke("safe-mode:exit").then((result) => {
        if (result?.blocked) {
          manage.disabled = false;
          exit.disabled = false;
        }
      }).catch(() => {
        manage.disabled = false;
        exit.disabled = false;
      });
    });
    actions.append(manage, exit);
    bar.append(dot, copy, actions);
    shadow.append(style, bar);
    document.documentElement.appendChild(host2);
  } catch (error) {
    console.warn("[safe-mode] unable to mount status banner", error);
  }
}
function applyMobileStatus(connected) {
  if (phoneConnected === connected) return;
  phoneConnected = connected;
  mountMobileButton();
}
async function refreshMobileStatus() {
  try {
    const status = await electron.ipcRenderer.invoke("mobile:status");
    applyMobileStatus(status.connected === true);
  } catch (error) {
    console.warn("[mobile] unable to read connection status", error);
  }
}
electron.ipcRenderer.on("mobile:status-changed", (_event, status) => {
  applyMobileStatus(status?.connected === true);
});
function initializeUi() {
  if (process.platform === "win32") {
    mountWindowsTitlebarLayout({ document, ipcRenderer: electron.ipcRenderer });
  }
  mount();
  mountAbout();
  mountMobileButton();
  checkBootFailureInDom();
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  void refreshMobileStatus();
  void mountSafeModeBanner();
}
window.addEventListener("error", (event) => {
  const err = event.error ?? event.message;
  if (isPluginLoadError(err)) {
    const errorText = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
    queueBootFailure(errorText);
  }
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  if (isPluginLoadError(reason)) {
    const errorText = typeof reason === "string" ? reason : reason instanceof Error ? reason.message : String(reason);
    queueBootFailure(errorText);
  }
});
window.addEventListener("pagehide", () => {
  if (rendererHealthHeartbeat !== void 0) window.clearInterval(rendererHealthHeartbeat);
  rendererHealthHeartbeat = void 0;
});
electron.contextBridge.exposeInMainWorld(
  "dshDesktop",
  Object.freeze({
    restartHarness: () => electron.ipcRenderer.invoke("harness:restart"),
    uninstallMarket: () => electron.ipcRenderer.invoke("market:uninstall"),
    openInFinder: (path) => electron.ipcRenderer.invoke("harness:open-in-finder", path)
  })
);
electron.contextBridge.exposeInMainWorld(
  "dshRecovery",
  Object.freeze({
    action: (action) => electron.ipcRenderer.invoke("recovery:action", action)
  })
);
electron.contextBridge.exposeInMainWorld(
  "dshWebImport",
  Object.freeze({
    action: (action) => electron.ipcRenderer.invoke("web-import:action", action)
  })
);
electron.contextBridge.exposeInMainWorld(
  "dshSafeMode",
  Object.freeze({
    action: (action, selection) => electron.ipcRenderer.invoke("safe-mode:action", action, selection)
  })
);
function mount() {
  if (document.getElementById(ROOT_ID)) return;
  host = document.createElement("div");
  host.id = ROOT_ID;
  host.style.cssText = [
    "position:fixed",
    "right:20px",
    "bottom:20px",
    "z-index:2147483646",
    "display:none",
    "width:min(384px,calc(100vw - 40px))",
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
  ].join(";");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = styles;
  content = document.createElement("div");
  shadow.append(style, content);
  document.documentElement.appendChild(host);
  render();
}
function applyStatus(status) {
  currentStatus = status;
  if (host) {
    host.dataset.updatePhase = status.phase;
    host.dataset.updateManual = String(status.manual);
  }
  if (status.phase === "error") installing = false;
  if (["error", "downloading", "downloaded", "up-to-date"].includes(status.phase)) {
    installingVersion = null;
  }
  if (status.phase !== "available") accepting = false;
  render();
}
function render() {
  if (!host || !content || !currentStatus) return;
  if (!shouldShowUpdate(currentStatus) || isUpdateDismissed(currentStatus, dismissedVersion, dismissedTransientPhase)) {
    host.style.display = "none";
    content.replaceChildren();
    return;
  }
  host.style.display = "block";
  const status = currentStatus;
  const card = element("aside", "card");
  card.setAttribute("aria-live", "polite");
  card.setAttribute("aria-label", locale === "zh" ? "DSH Desktop 更新" : "DSH Desktop update");
  const row = element("div", "row");
  const badge = element("span", status.phase === "error" ? "badge warning" : "badge");
  badge.setAttribute("aria-hidden", "true");
  if (isBusy(status)) badge.appendChild(element("span", "spinner"));
  else badge.innerHTML = updateIcon;
  row.appendChild(badge);
  const headline = updateHeadline(status, locale);
  const body = element("div", "body");
  const title = element("p", "title");
  title.textContent = headline.title;
  body.appendChild(title);
  const description = element("p", "description");
  description.textContent = status.phase === "error" && status.message ? status.message : headline.description;
  if (description.textContent) body.appendChild(description);
  if (status.phase === "downloading") {
    const progress = element("div", "progress");
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", String(Math.round(status.percent ?? 0)));
    const value = element("div", "progressValue");
    value.style.width = `${status.percent ?? 0}%`;
    progress.appendChild(value);
    body.appendChild(progress);
  }
  if (status.phase === "available") {
    const actions = element("div", "actions");
    const accept = button(locale === "zh" ? "同意更新" : "Update now", "primary");
    accept.disabled = accepting;
    accept.addEventListener("click", () => {
      accepting = true;
      render();
      void electron.ipcRenderer.invoke("updates:download").catch((error) => {
        accepting = false;
        console.error("[updater] unable to download update", error);
        render();
      });
    });
    actions.append(accept, skipButton(status));
    body.appendChild(actions);
  }
  if (status.phase === "downloading") {
    const actions = element("div", "actions");
    actions.appendChild(skipButton(status));
    body.appendChild(actions);
  }
  if (status.phase === "downloaded") {
    const actions = element("div", "actions");
    const install = button(
      installing ? locale === "zh" ? "正在重启…" : "Restarting…" : locale === "zh" ? "重新启动并安装" : "Restart and install",
      "primary"
    );
    install.disabled = installing;
    install.addEventListener("click", () => {
      installing = true;
      render();
      void electron.ipcRenderer.invoke("updates:install").catch((error) => {
        installing = false;
        console.error("[updater] unable to install update", error);
        render();
      });
    });
    actions.append(install, skipButton(status));
    body.appendChild(actions);
  }
  row.appendChild(body);
  const close = button("×", "close");
  close.setAttribute("aria-label", locale === "zh" ? "关闭" : "Close");
  close.addEventListener("click", dismissCurrent);
  row.appendChild(close);
  card.appendChild(row);
  content.replaceChildren(card);
}
function skipButton(status) {
  const skip = button(locale === "zh" ? "跳过此版本" : "Skip this version", "secondary");
  skip.addEventListener("click", () => {
    const version = status.availableVersion;
    if (!version) return;
    dismissCurrent();
    void electron.ipcRenderer.invoke("updates:skip", version).catch((error) => {
      console.error("[updater] unable to skip update", error);
    });
  });
  return skip;
}
function comparePreloadVersions(a, b) {
  const parse = (value) => {
    const [core = "", ...pre] = value.trim().split("-");
    const nums = core.split(".").map((part) => Number.parseInt(part, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return [nums, pre.join("-")];
  };
  const [an, ap] = parse(a);
  const [bn, bp] = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if ((an[i] ?? 0) !== (bn[i] ?? 0)) return (an[i] ?? 0) - (bn[i] ?? 0);
  }
  return comparePrerelease(ap, bp);
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
function loadVersionList(onDone) {
  versionPickerLoading = true;
  versionPickerError = false;
  if (onDone) onDone();
  void electron.ipcRenderer.invoke("updates:list-versions").then((releases) => {
    versionPickerList = Array.isArray(releases) ? releases : [];
  }).catch((error) => {
    console.error("[updater] unable to list versions", error);
    versionPickerError = true;
    versionPickerList = null;
  }).finally(() => {
    versionPickerLoading = false;
    if (onDone) onDone();
  });
}
function mountAbout() {
  if (document.getElementById(ABOUT_ROOT_ID)) return;
  aboutHost = document.createElement("div");
  aboutHost.id = ABOUT_ROOT_ID;
  aboutHost.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:none",
    "align-items:center",
    "justify-content:center",
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
  ].join(";");
  aboutShadow = aboutHost.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = aboutStyles;
  aboutShadow.appendChild(style);
  document.documentElement.appendChild(aboutHost);
  renderAbout();
}
function renderAbout() {
  if (!aboutHost || !aboutShadow) return;
  if (!aboutOpen || !aboutInfo) {
    aboutHost.style.display = "none";
    const existing = aboutShadow.querySelector(".about-overlay");
    if (existing) existing.remove();
    return;
  }
  aboutHost.style.display = "flex";
  const info = aboutInfo;
  const zh = info.locale === "zh";
  const currentVer = info.desktopVersion;
  let overlay = aboutShadow.querySelector(".about-overlay");
  if (!overlay) {
    overlay = element("div", "about-overlay");
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        aboutOpen = false;
        versionPickerOpen = false;
        renderAbout();
      }
    });
    aboutShadow.appendChild(overlay);
  }
  const card = element("div", "about-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", zh ? "关于 DSH Desktop" : "About DSH Desktop");
  const header = element("div", "about-header");
  const title = element("h2", "about-title");
  title.textContent = zh ? "关于 DSH Desktop" : "About DSH Desktop";
  header.appendChild(title);
  const closeBtn = button("×", "about-close");
  closeBtn.setAttribute("aria-label", zh ? "关闭" : "Close");
  closeBtn.addEventListener("click", () => {
    aboutOpen = false;
    versionPickerOpen = false;
    renderAbout();
  });
  header.appendChild(closeBtn);
  card.appendChild(header);
  const body = element("div", "about-body");
  const line1 = element("p", "about-line");
  line1.textContent = `${zh ? "DSH Desktop 版本： " : "DSH Desktop version: "}${info.desktopVersion}`;
  body.appendChild(line1);
  const line2 = element("p", "about-line");
  line2.textContent = `${zh ? "内置 Harness 版本： " : "Bundled Harness version: "}${info.harnessVersion}`;
  body.appendChild(line2);
  const hint = element("p", "about-hint");
  hint.textContent = zh ? "Harness 随 DSH Desktop 更新。" : "Harness is updated with DSH Desktop.";
  body.appendChild(hint);
  card.appendChild(body);
  const actions = element("div", "about-actions");
  const selectVersionBtn = button(
    zh ? "选择版本" : "Select version",
    versionPickerOpen ? "btn-action active" : "btn-action"
  );
  selectVersionBtn.addEventListener("click", () => {
    versionPickerOpen = !versionPickerOpen;
    if (versionPickerOpen && versionPickerList === null && !versionPickerLoading) {
      loadVersionList(renderAbout);
    }
    renderAbout();
  });
  actions.appendChild(selectVersionBtn);
  const checkUpdatesBtn = button(zh ? "检查更新" : "Check for updates", "btn-action");
  checkUpdatesBtn.addEventListener("click", () => {
    aboutOpen = false;
    versionPickerOpen = false;
    renderAbout();
    void electron.ipcRenderer.invoke("updates:check").catch((error) => {
      console.error("[updater] unable to check updates", error);
    });
  });
  actions.appendChild(checkUpdatesBtn);
  card.appendChild(actions);
  if (versionPickerOpen) {
    const pickerContainer = element("div", "version-picker-container");
    if (versionPickerLoading) {
      const line = element("p", "version-status-text");
      line.textContent = zh ? "正在获取版本列表…" : "Loading versions…";
      pickerContainer.appendChild(line);
    } else if (versionPickerError) {
      const line = element("p", "version-status-text");
      line.textContent = zh ? "暂时无法获取版本列表" : "Unable to load version list";
      pickerContainer.appendChild(line);
    } else if (versionPickerList && versionPickerList.length > 0) {
      const newer = versionPickerList.filter(
        (release) => comparePreloadVersions(release.version, currentVer) > 0
      );
      const older = versionPickerList.filter(
        (release) => comparePreloadVersions(release.version, currentVer) < 0
      );
      appendAboutVersionGroup(pickerContainer, zh ? "较新版本" : "Newer versions", newer, currentVer, zh);
      appendAboutVersionGroup(pickerContainer, zh ? "历史版本（回退）" : "Roll back", older, currentVer, zh);
    } else {
      const line = element("p", "version-status-text");
      line.textContent = zh ? "没有可选的其它版本" : "No other versions available";
      pickerContainer.appendChild(line);
    }
    card.appendChild(pickerContainer);
  }
  overlay.replaceChildren(card);
}
function appendAboutVersionGroup(container, heading, releases, currentVersion, zh) {
  if (releases.length === 0) return;
  const group = element("div", "version-group");
  const label = element("p", "version-group-title");
  label.textContent = heading;
  group.appendChild(label);
  const buttonsRow = element("div", "version-buttons");
  for (const release of releases.slice(0, 12)) {
    const pick = button(`v${release.version}`, "version-tag-btn");
    pick.disabled = installingVersion !== null;
    pick.addEventListener("click", () => {
      selectVersionFromAbout(release, currentVersion, zh);
    });
    buttonsRow.appendChild(pick);
  }
  group.appendChild(buttonsRow);
  container.appendChild(group);
}
function selectVersionFromAbout(release, currentVersion, zh) {
  const downgrade = comparePreloadVersions(release.version, currentVersion) < 0;
  const message = downgrade ? zh ? `将降级到 ${release.version}（当前 ${currentVersion}）。降级不会迁移新版本写入的数据，可能导致配置不兼容。确定继续？` : `This downgrades to ${release.version} (currently ${currentVersion}). A downgrade does not migrate data written by newer versions and may be config-incompatible. Continue?` : zh ? `将安装 ${release.version}，确定继续？` : `Install ${release.version}?`;
  if (!window.confirm(message)) return;
  installingVersion = release.version;
  aboutOpen = false;
  versionPickerOpen = false;
  renderAbout();
  void electron.ipcRenderer.invoke("updates:install-version", release.version).catch((error) => {
    console.error("[updater] unable to install version", error);
  });
}
function dismissCurrent() {
  if (!currentStatus) return;
  if (currentStatus.availableVersion) {
    dismissedVersion = currentStatus.availableVersion;
  } else {
    dismissedTransientPhase = currentStatus.phase;
  }
  render();
}
function isBusy(status) {
  return status.phase === "checking" || status.phase === "downloading";
}
function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
function button(label, className) {
  const node = element("button", className);
  node.type = "button";
  node.textContent = label;
  return node;
}
const styles = `
  :host { color-scheme: light dark; }
  * { box-sizing: border-box; }
  .card {
    color: var(--dsw-alias-label-primary, #202124);
    background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.98));
    border: 1px solid var(--dsw-alias-border-l2, rgba(32, 33, 36, 0.14));
    border-radius: 14px;
    padding: 15px 16px;
    box-shadow: 0 14px 38px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
    backdrop-filter: blur(18px);
  }
  .row { display: flex; align-items: flex-start; gap: 12px; }
  .body { min-width: 0; flex: 1; }
  .title { margin: 0; font-size: 14px; font-weight: 650; line-height: 20px; letter-spacing: -0.1px; }
  .description {
    margin: 3px 0 0;
    color: var(--dsw-alias-label-secondary, #666b73);
    font-size: 12.5px;
    line-height: 18px;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .badge {
    width: 34px;
    height: 34px;
    margin-top: -1px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    color: #2ea043;
    background: rgba(46, 160, 67, 0.14);
  }
  .badge.warning { color: #d29922; background: rgba(210, 153, 34, 0.16); }
  .spinner {
    width: 16px;
    height: 16px;
    flex: none;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 999px;
    opacity: 0.85;
    animation: spin 0.75s linear infinite;
  }
  .progress {
    height: 5px;
    margin-top: 11px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--dsw-alias-bg-layer-2, rgba(32, 33, 36, 0.1));
  }
  .progressValue {
    height: 100%;
    min-width: 2px;
    border-radius: inherit;
    background: #2ea043;
    transition: width 180ms ease;
  }
  .actions { display: flex; gap: 8px; margin-top: 13px; }
  button {
    appearance: none;
    border: 0;
    font: inherit;
    cursor: pointer;
  }
  button:focus-visible { outline: 2px solid #4d6bfe; outline-offset: 2px; }
  button:disabled { cursor: default; opacity: 0.55; }
  .primary, .secondary {
    min-height: 32px;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 600;
  }
  .primary { color: #fff; background: #4d6bfe; }
  .primary:hover:not(:disabled) { background: #3e5de7; }
  /* Ghosted, so the accepted action is the only filled thing on the card. */
  .secondary {
    color: var(--dsw-alias-label-secondary, #666b73);
    background: transparent;
    border: 1px solid var(--dsw-alias-border-l2, rgba(32, 33, 36, 0.16));
  }
  .secondary:hover {
    color: var(--dsw-alias-label-primary, #202124);
    background: var(--dsw-alias-interactive-bg-hover, rgba(32, 33, 36, 0.06));
  }
  .close {
    width: 24px;
    height: 24px;
    margin: -4px -6px 0 0;
    flex: none;
    color: var(--dsw-alias-label-secondary, #73777f);
    background: transparent;
    border-radius: 7px;
    font-size: 20px;
    line-height: 20px;
  }
  .close:hover { color: var(--dsw-alias-label-primary, #202124); background: rgba(127, 127, 127, 0.1); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-color-scheme: dark) {
    .card {
      color: var(--dsw-alias-label-primary, #f3f4f6);
      background: var(--dsw-alias-bg-layer-1, rgba(31, 32, 35, 0.98));
      border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.42), 0 2px 8px rgba(0, 0, 0, 0.25);
    }
    .description { color: var(--dsw-alias-label-secondary, #a9adb5); }
    .badge { color: #3fb950; background: rgba(63, 185, 80, 0.16); }
    .badge.warning { color: #e3b341; background: rgba(227, 179, 65, 0.18); }
    .secondary {
      color: var(--dsw-alias-label-secondary, #a9adb5);
      border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
    }
    .secondary:hover { color: var(--dsw-alias-label-primary, #f3f4f6); background: rgba(255, 255, 255, 0.08); }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
    .progressValue { transition: none; }
  }
`;
const updateIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M4.6 12a7.4 7.4 0 0 1 12.6-5.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M19.4 12a7.4 7.4 0 0 1-12.6 5.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M17.6 3.5v3.4h-3.4M6.4 20.5v-3.4h3.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const phoneIcon = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true"><rect x="7" y="2.75" width="10" height="18.5" rx="2.25" stroke="currentColor" stroke-width="1.7"/><path d="M10.2 5.5h3.6M10.5 18.35h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
const mobileButtonStyles = `
  [data-dsh-sidebar-settings] { position:relative; box-sizing:border-box; }
  [data-dsh-sidebar-root][data-dsh-sidebar-wide="true"] [data-dsh-sidebar-settings] { padding-right:38px; }
  #${MOBILE_BUTTON_ID} { appearance:none; position:relative; width:32px; height:32px; color:var(--dsw-alias-label-secondary,#73777f); background:transparent; border:0; border-radius:9px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
  [data-dsh-sidebar-root][data-dsh-sidebar-wide="true"] #${MOBILE_BUTTON_ID} { position:absolute; right:0; top:50%; transform:translateY(-50%); }
  [data-dsh-sidebar-root][data-dsh-sidebar-wide="false"] [data-dsh-sidebar-settings] { flex-direction:column; align-items:center; }
  [data-dsh-sidebar-root][data-dsh-sidebar-wide="false"] #${MOBILE_BUTTON_ID} { flex:none; margin-top:5px; }
  #${MOBILE_BUTTON_ID}:hover { color:var(--dsw-alias-label-primary,#202124); background:var(--dsw-alias-interactive-bg-hover,rgba(32,33,36,.08)); }
  #${MOBILE_BUTTON_ID}:focus-visible { outline:2px solid #4d6bfe; outline-offset:1px; }
  #${MOBILE_BUTTON_ID}[hidden] { display:none; }
  #${MOBILE_BUTTON_ID} > span { position:absolute; top:4px; right:4px; width:7px; height:7px; border:1.5px solid var(--dsw-specific-sidebar-fill,#fff); border-radius:50%; background:#4da66d; opacity:0; }
  #${MOBILE_BUTTON_ID}.is-connected > span { opacity:1; }
`;
const aboutStyles = `
  :host { color-scheme: light dark; }
  * { box-sizing: border-box; }
  .about-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .about-card {
    position: relative;
    width: min(380px, calc(100vw - 40px));
    max-height: min(560px, calc(100vh - 60px));
    overflow-y: auto;
    color: var(--dsw-alias-label-primary, #202124);
    background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.98));
    border: 1px solid var(--dsw-alias-border-l2, rgba(32, 33, 36, 0.14));
    border-radius: 14px;
    padding: 18px 20px 20px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08);
  }
  .about-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .about-title {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    line-height: 20px;
    letter-spacing: -0.1px;
    color: var(--dsw-alias-label-primary, #202124);
  }
  .about-close {
    width: 26px;
    height: 26px;
    margin: -4px -6px 0 0;
    flex: none;
    color: var(--dsw-alias-label-secondary, #73777f);
    background: transparent;
    border: 0;
    border-radius: 7px;
    font-size: 20px;
    line-height: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .about-close:hover {
    color: var(--dsw-alias-label-primary, #202124);
    background: rgba(127, 127, 127, 0.12);
  }
  .about-body {
    font-size: 13px;
    line-height: 21px;
    margin-bottom: 18px;
    color: var(--dsw-alias-label-primary, #202124);
  }
  .about-line {
    margin: 2px 0;
  }
  .about-hint {
    margin: 12px 0 0;
    color: var(--dsw-alias-label-secondary, #666b73);
    font-size: 12.5px;
  }
  .about-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  button {
    appearance: none;
    border: 0;
    font: inherit;
    cursor: pointer;
  }
  button:focus-visible { outline: 2px solid #4d6bfe; outline-offset: 2px; }
  button:disabled { cursor: default; opacity: 0.55; }
  .btn-action {
    flex: 1;
    min-height: 34px;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    color: var(--dsw-alias-label-primary, #202124);
    background: var(--dsw-alias-interactive-bg, rgba(32, 33, 36, 0.06));
    border: 1px solid var(--dsw-alias-border-l2, rgba(32, 33, 36, 0.14));
  }
  .btn-action:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover, rgba(32, 33, 36, 0.1));
  }
  .btn-action.active {
    background: rgba(77, 107, 254, 0.12);
    border-color: rgba(77, 107, 254, 0.35);
    color: #4d6bfe;
  }
  .version-picker-container {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--dsw-alias-border-l2, rgba(32, 33, 36, 0.1));
  }
  .version-group {
    margin-top: 10px;
  }
  .version-group-title {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--dsw-alias-label-secondary, #666b73);
  }
  .version-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .version-tag-btn {
    min-height: 28px;
    padding: 4px 11px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
    color: var(--dsw-alias-label-secondary, #666b73);
    background: transparent;
    border: 1px solid var(--dsw-alias-border-l2, rgba(32, 33, 36, 0.16));
  }
  .version-tag-btn:hover:not(:disabled) {
    color: var(--dsw-alias-label-primary, #202124);
    background: var(--dsw-alias-interactive-bg-hover, rgba(32, 33, 36, 0.08));
  }
  .version-status-text {
    margin: 6px 0;
    font-size: 12px;
    color: var(--dsw-alias-label-secondary, #666b73);
  }
  @media (prefers-color-scheme: dark) {
    .about-card {
      color: var(--dsw-alias-label-primary, #f3f4f6);
      background: var(--dsw-alias-bg-layer-1, rgba(31, 32, 35, 0.98));
      border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.25);
    }
    .about-title, .about-body { color: var(--dsw-alias-label-primary, #f3f4f6); }
    .about-hint, .version-status-text, .about-close { color: var(--dsw-alias-label-secondary, #a9adb5); }
    .about-close:hover { color: var(--dsw-alias-label-primary, #f3f4f6); background: rgba(255, 255, 255, 0.1); }
    .btn-action {
      color: var(--dsw-alias-label-primary, #f3f4f6);
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
    }
    .btn-action:hover:not(:disabled) { background: rgba(255, 255, 255, 0.13); }
    .btn-action.active {
      background: rgba(77, 107, 254, 0.2);
      border-color: rgba(77, 107, 254, 0.45);
      color: #7b93ff;
    }
    .version-picker-container { border-top-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14)); }
    .version-group-title, .version-tag-btn { color: var(--dsw-alias-label-secondary, #a9adb5); }
    .version-tag-btn { border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18)); }
    .version-tag-btn:hover:not(:disabled) {
      color: var(--dsw-alias-label-primary, #f3f4f6);
      background: rgba(255, 255, 255, 0.1);
    }
  }
`;
electron.ipcRenderer.on("updates:status-changed", (_event, status) => {
  receivedStatusEvent = true;
  applyStatus(status);
});
electron.ipcRenderer.on("desktop:show-about", (_event, info) => {
  aboutInfo = info;
  aboutOpen = true;
  versionPickerOpen = false;
  renderAbout();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && aboutOpen) {
    aboutOpen = false;
    versionPickerOpen = false;
    renderAbout();
  }
});
void electron.ipcRenderer.invoke("updates:status").then((status) => {
  if (!receivedStatusEvent) applyStatus(status);
}).catch((error) => console.warn("[updater] unable to read update status", error));
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initializeUi, { once: true });
} else {
  initializeUi();
}
