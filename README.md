# dsh-desktop-spicy

**DSH Desktop 0.9.0 的完整运行时镜像（turnkey 快照）。**

把一台能跑的 DSH Desktop 里 `Contents/Resources/` 的每一个字节都摊开放在这里 —— **15,304 个镜像文件 / ~188 MiB**（仓库合计 15,312 文件 / ~190 MiB），包含打包好的主进程/预加载 bundle（`app/out/`）、600 个依赖包（`app/node_modules/`）、Cordis 插件装配用的 `.patch.yml`、启动页/安全模式/插件恢复页面和品牌资源。

Clone 下来就是那台机器的 DSH Desktop。铺回去就是那台机器。

> ⚠️ 这不是上游源码仓库。上游是 **[dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop)**（MIT，TypeScript + electron-vite，`src/` + `packages/` + `patches/`）。本仓库是**编译产物 + 依赖树的快照**，用来做备份、审计、离网重装和差分研究。要改代码请去上游。

---

## 这是什么 / What this is

| 项 | 值 |
| --- | --- |
| 来源 app | `/Applications/DSH Desktop.app` |
| `CFBundleShortVersionString` | `0.9.0` |
| `CFBundleIdentifier` | `io.dsh.desktop` |
| 快照范围 | `Contents/Resources/` 全量 |
| 镜像文件数 | **15,304**（仓库内含 8 个自撰文件，合计 15,312） |
| 镜像体积 | **188.2 MiB** / 197,295,684 bytes（原始 `Resources/` 为 300 MiB / 15,305 文件；差额就是被排除的 node 二进制 117,361,888 bytes） |
| 仓库体积 | **~190 MiB**（多出的 ~2 MB 是 `MANIFEST.sha256` 本身） |
| 平台 | `darwin-arm64`（Apple Silicon） |
| Electron | `43.4.0`（Chrome `150.0.7871.224`） |
| Harness 内核 | `@deepseek-ai/dsh` **`0.1.5-rc.2`** |
| `@deepseek-ai/*` 包 | 242 个（**全 MIT**，另有 2 个 BSD-3-Clause） |
| 依赖包总数 | 600 |
| 原签名 | Notarized Developer ID · *Beijing Shuju Xiangsu Intelligence Technology Co., Ltd. (`93RLD96LCP`)* |
| 快照时间 | 2026-09-22 |

---

## 目录结构

```
.
├── app/                          ← Contents/Resources/app/ 原样搬过来
│   ├── out/
│   │   ├── main/index.js         Electron 主进程 bundle (862 KB)
│   │   └── preload/              index.cjs + windows-menu.cjs
│   ├── node_modules/             600 个包 / 239 个直接依赖
│   └── package.json              dsh-desktop@0.9.0, private, MIT, 239 deps
├── dsh-desktop.patch.yml         Cordis 插件装配：brand 替换 + market 安装器 + PPT + preset 转移 + HMR fallback
├── dsh-desktop-safe.patch.yml    安全模式装配（只留 brand + runtime adapter）
├── harness-node-entry.mjs        harness 的 node 入口
├── plugin-recovery.html          插件崩了之后的恢复页
├── safe-mode.html                安全模式页
├── web-import.html               web → desktop 导入页
├── splash.html                   启动页
├── windows-child-process-hide.mjs / windows-hidden-console.mjs / windows-menu.html
├── icon.icns / icon.png / dsh-loader.gif / dsh-loader-dark.gif
├── community-wechat-qr.png
├── en.lproj / zh_CN.lproj / zh_TW.lproj
├── app-update.yml
├── install.sh                    把镜像铺回一个已安装的 .app
├── restore-node.sh               补回被 git 排除的 112 MiB node 二进制
├── verify.sh                     完整性 + 超限大文件 + 与 HEAD 一致性校验
├── THIRD_PARTY_NOTICES.md        600 个包的 license 清单（从各自 package.json 生成）
├── MANIFEST.sha256               全量 sha256，用于证明逐字节一致
└── LICENSE
```

---

## 快速开始

```sh
git clone https://github.com/GZ-AI-Native-Dev/dsh-desktop-spicy.git
cd dsh-desktop-spicy
./restore-node.sh      # 补回 node 运行时（112 MiB，git 装不下）
./verify.sh            # 校验 15,304 文件 / 体积 / 与 HEAD 一致
```

### 铺回一个已安装的 DSH Desktop

先装上官方 DSH Desktop（[dshdesktop.com](https://www.dshdesktop.com/#download)），然后：

```sh
./install.sh --dry-run              # 先看要动哪些文件
./install.sh                        # 备份 → rsync → 补 node → ad-hoc 重签
./install.sh --target "/path/to/DSH Desktop.app"
./install.sh --restore              # 从最近一次备份整包回滚
```

`install.sh` 干的事：

1. 把目标 app 现有的 `Contents/Resources` **完整备份**到 `~/Library/Application Support/dsh-desktop-spicy-backups/<时间戳>/`
2. `rsync -a --delete` 本仓库 → 目标 `Contents/Resources/`（**完整替换**，多余文件会被删）
3. 缺 node 运行时就从 npm / nodejs.org 补
4. 修执行位、清 quarantine
5. **ad-hoc 重新签名** —— 原 notarized 签名在资源被替换后必然失效，必须重签才能启动

---

## 不在仓库里的东西

| 缺失 | 原因 | 怎么补 |
| --- | --- | --- |
| `app/node_modules/node/bin/node`（**112 MiB**, Node v24.9.0） | 超过 GitHub 单文件 **100 MiB 硬限**，推不上去 | `./restore-node.sh`（本机同版本 node → `npm i node@24.9.0` → nodejs.org tarball，三级回退） |
| `Contents/Frameworks/`（**230 MiB**） | Electron 43.4.0 运行时（Electron Framework + 4 个 Helper.app + Squirrel + Mantle + ReactiveObjC），从官方 `.dmg` 重装即可，塞进 git 纯属浪费 | 装官方 DSH Desktop |
| `Contents/MacOS/`、`Contents/Info.plist`、`_CodeSignature/` | 壳层 + 签名，不是 Resources 的一部分 | 同上 |
| 任何密钥 / 会话 / 用户数据 | **本仓库一个都没有**（扫过：无 `sk-`/`gho_`/`AKIA`/`AIza` 真命中，唯一命中的是 CSS 的 `mask-image` 和 wasm 里的 base64 噪声） | — |

运行时所需的 `node` 也可以直接用 Electron 自带的（harness home 里 `.desktop-bin/node` 就是这么干的，`ELECTRON_RUN_AS_NODE=1` + Helper 可执行文件），所以缺那个二进制不会让整个 app 起不来。

---

## 归属与许可

这个仓库**不主张对 DSH Desktop 本体的任何著作权**。它是别人的编译产物的镜像。

| 层 | 归属 | 许可 |
| --- | --- | --- |
| DSH Desktop 应用壳 / `out/` bundle / `.patch.yml` / 品牌资源 | DataElement · Beijing Shuju Xiangsu Intelligence Technology Co., Ltd. | 上游开源项目 [dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop) 为 **MIT**；本仓库按 MIT 原样转载，署名归原作者 |
| `@deepseek-ai/*` × 242 | DeepSeek | **MIT**（2 个 BSD-3-Clause） |
| 其余依赖 × 358 | 各作者 | 绝大多数 MIT / Apache-2.0 / ISC / BSD；逐包清单见 **[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)** |
| 本仓库的 `install.sh` / `restore-node.sh` / `verify.sh` / `README` | GZ-AI-Native-Dev | **MIT**（见 [LICENSE](LICENSE)） |

### ⚠️ 一个需要注意的 license

| 包 | 许可 | 说明 |
| --- | --- | --- |
| `@img/sharp-libvips-darwin-arm64@1.3.3` | **LGPL-3.0-or-later** | libvips 的预编译二进制（sharp 的底层）。LGPL 允许再分发二进制，但要求接收方有能力替换/重链接该库。源代码：<https://github.com/lovell/sharp-libvips> · libvips: <https://github.com/libvips/libvips>。**商业再分发前请自行评估。** |
| `jszip@3.10.2` | MIT **OR** GPL-3.0-or-later | 双许可，这里按 MIT 使用。 |

---

## 已知坑

- **签名一定会坏。** 任何对 Resources 的写操作都会让 notarized 签名失效。`install.sh` 用 ad-hoc 重签（`codesign --force --deep --sign -`）绕过，本机自用没问题，但会掉 Gatekeeper 的「已验证开发者」身份。想干净就重装官方 `.dmg`。
- **`--delete` 是真的会删。** `install.sh` 做的是完整替换，目标 app 里本仓库没有的文件会被移除（node 二进制和 `.DS_Store` 已加进 exclude 白名单保护）。
- **只对得上 0.9.0。** DSH Desktop 更新后，`out/` bundle 和依赖树都会变，这份镜像就是旧版本的。差分对比才是它最有用的时候。
- **arm64 only。** `@img/sharp-darwin-arm64` 等平台包是 Apple Silicon 的，Intel Mac 上要用得换平台包。
- **Windows 版结构相同但不等价。** Windows 上 harness home 是 `%APPDATA%\dsh-desktop\harness`，`app/` 布局一致，壳层不同。

---

## 关于 / 相关

这是我的 DSH Desktop「spicy」全家桶的快照层。其余几层：

| 仓库 | 作用 |
| --- | --- |
| **dsh-desktop-spicy**（本仓库） | DSH Desktop 运行时全量镜像 —— 备份 / 审计 / 离网重装 |
| `harness-spicy` | 启动器（`dsh-spicy` / `dsh-desktop-spicy` / `dsh-session-sync`）+ spicy preset + 百炼 provider 配置 + 一键装机 |
| `dsh-provider-qoder` | Qoder provider 插件 |
| `dsh-purge` | 破甲插件 |

---

# English

**A complete, turnkey mirror of the DSH Desktop 0.9.0 runtime plane.**

Every byte of `Contents/Resources/` from a working install: 15,304 mirrored files, 188.2 MiB — the compiled Electron main/preload bundles (`app/out/`), 600 dependency packages (`app/node_modules/`), the Cordis `.patch.yml` composition files, the splash / safe-mode / plugin-recovery pages, and the branding assets. (Plus 8 authored files; 15,312 tracked, ~190 MiB total.)

Clone it and you have that machine's DSH Desktop. Run `install.sh` and you're back on it.

**This is not the upstream source repo.** Upstream is [dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop) (MIT, TypeScript + electron-vite). This is a snapshot of *compiled output plus the dependency tree*, for backup, audit, offline reinstall, and diffing.

```sh
git clone https://github.com/GZ-AI-Native-Dev/dsh-desktop-spicy.git
cd dsh-desktop-spicy
./restore-node.sh                       # restore the 112 MiB Node runtime git can't hold
./verify.sh                             # 15,304 files, size, HEAD parity
./install.sh --target "/Applications/DSH Desktop.app"
./install.sh --restore                  # roll back
```

**Not included:** `app/node_modules/node/bin/node` (112 MiB — GitHub's per-file hard limit is 100 MiB; `restore-node.sh` restores it three ways), `Contents/Frameworks/` (230 MiB Electron 43.4.0 runtime), `Contents/MacOS/`, `Info.plist`, and the code signature. No secrets, no sessions, no user data — this snapshot is clean.

**Licensing:** we claim no copyright over DSH Desktop itself. The app shell and `out/` bundles derive from the MIT-licensed upstream project; the 242 `@deepseek-ai/*` packages are MIT; the remaining 358 are mostly MIT/Apache-2.0/ISC/BSD — full per-package list in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). One caveat: `@img/sharp-libvips-darwin-arm64` is **LGPL-3.0-or-later** — evaluate before commercial redistribution. Our own scripts are MIT.

**Caveats:** replacing `Resources` voids the notarized signature (ad-hoc re-sign is applied); `install.sh` does a full replace, not a merge; this only matches version 0.9.0; platform packages are arm64.