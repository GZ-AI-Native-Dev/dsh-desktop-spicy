#!/usr/bin/env bash
#
# restore-node.sh — 补回 app/node_modules/node/bin/node（112 MiB，被 git 排除，
# 因为超过 GitHub 单文件 100 MiB 硬限）。
#
# 优先级：
#   1. 本机已装 node@24.9.0 → 直接从 npm 缓存/安装目录拷
#   2. npm install node@24.9.0（在该 app 目录里跑，走 registry 的 platform 包）
#   3. 从 nodejs.org 拉官方 darwin tarball，只取 bin/node
#
# 用法：
#   ./restore-node.sh                      # 目标 ./app
#   ./restore-node.sh --target /path/to/Contents/Resources/app
#
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SELF_DIR/app"
NODE_VER="24.9.0"
ARCH="$(uname -m)"

while [ $# -gt 0 ]; do
  case "$1" in
    --target) APP_DIR="${2:?--target needs a path}"; shift 2 ;;
    --version) NODE_VER="${2:?--version needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$*" >&2; }

DEST="$APP_DIR/node_modules/node/bin/node"

if [ -x "$DEST" ] && "$DEST" -v 2>/dev/null | grep -q "v$NODE_VER"; then
  say "already present and correct: $("$DEST" -v)"
  exit 0
fi

mkdir -p "$(dirname "$DEST")"

# --- 1) 本地已有的同版本 node ---------------------------------------------
if command -v node >/dev/null 2>&1; then
  LOCAL_VER="$(node -v | sed 's/^v//')"
  if [ "$LOCAL_VER" = "$NODE_VER" ]; then
    say "copying local node $LOCAL_VER from $(command -v node)"
    cp "$(command -v node)" "$DEST"
  else
    warn "local node is v$LOCAL_VER, want v$NODE_VER — will try npm instead"
  fi
fi

# --- 2) npm install node@<ver> --------------------------------------------
if [ ! -x "$DEST" ] && command -v npm >/dev/null 2>&1; then
  say "npm install node@$NODE_VER inside $APP_DIR"
  if ( cd "$APP_DIR" && npm install --no-save --no-audit --no-fund "node@$NODE_VER" >/dev/null 2>&1 ); then
    say "npm install ok"
  else
    warn "npm install failed"
  fi
fi

# --- 3) nodejs.org tarball ------------------------------------------------
if [ ! -x "$DEST" ]; then
  case "$ARCH" in
    arm64) NODE_ARCH="darwin-arm64" ;;
    x86_64) NODE_ARCH="darwin-x64" ;;
    *) warn "unsupported arch: $ARCH"; NODE_ARCH="darwin-arm64" ;;
  esac
  TARBALL="node-v$NODE_VER-$NODE_ARCH.tar.gz"
  URL="https://nodejs.org/dist/v$NODE_VER/$TARBALL"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  say "downloading $URL"
  if curl -fL --retry 3 -o "$TMP/$TARBALL" "$URL"; then
    tar -xzf "$TMP/$TARBALL" -C "$TMP"
    cp "$TMP/node-v$NODE_VER-$NODE_ARCH/bin/node" "$DEST"
  else
    warn "download failed: $URL"
  fi
fi

if [ -x "$DEST" ]; then
  chmod +x "$DEST"
  say "node runtime restored: $("$DEST" -v) @ $DEST"
else
  warn "could not restore $DEST — DSH Desktop falls back to Electron's node (ELECTRON_RUN_AS_NODE), most features still work."
  exit 1
fi