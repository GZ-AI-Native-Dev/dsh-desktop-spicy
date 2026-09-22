#!/usr/bin/env bash
#
# install.sh — 把本仓库的 Contents/Resources 镜像铺回一个已安装的 DSH Desktop。
#
# 本脚本会：
#   1. 把目标 app 现有的 Contents/Resources 完整备份到仓库外（可回滚）
#   2. rsync 本仓库 → <target>/Contents/Resources/（--delete，完整替换）
#   3. 补回被 git 排除的 node 运行时二进制（restore-node.sh）
#   4. 修复执行位 + 去掉 quarantine 属性
#   5. ad-hoc 重新签名（原签名在资源被替换后必然失效）
#
# 用法：
#   ./install.sh                      # 默认目标 /Applications/DSH Desktop.app
#   ./install.sh --target /path/to/DSH\ Desktop.app
#   ./install.sh --dry-run            # 只看会动什么，不写盘
#   ./install.sh --no-resign          # 跳过 codesign
#   ./install.sh --restore            # 从最近一次备份回滚
#
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${DSH_APP:-/Applications/DSH Desktop.app}"
BACKUP_ROOT="${DSH_SPICY_BACKUP_ROOT:-$HOME/Library/Application Support/dsh-desktop-spicy-backups}"
DRY_RUN=0
RESIGN=1
MODE="install"

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:?--target needs a path}"; shift 2 ;;
    --backup-root) BACKUP_ROOT="${2:?--backup-root needs a path}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-resign) RESIGN=0; shift ;;
    --restore) MODE="restore"; shift ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

RES_DIR="$TARGET/Contents/Resources"

if [ "$MODE" = "restore" ]; then
  [ -d "$BACKUP_ROOT" ] || die "no backups under $BACKUP_ROOT"
  LATEST="$(ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | head -1 || true)"
  [ -n "$LATEST" ] || die "no backup directory found under $BACKUP_ROOT"
  say "restoring from $LATEST"
  [ -d "$RES_DIR" ] || die "$RES_DIR not found — is DSH Desktop installed at $TARGET ?"
  rsync -a --delete "$LATEST" "$RES_DIR/"
  if [ "$RESIGN" = 1 ]; then
    say "ad-hoc re-signing"
    codesign --force --deep --sign - "$TARGET" >/dev/null 2>&1 || warn "codesign failed — app may refuse to launch"
  fi
  say "restored. launch DSH Desktop to verify."
  exit 0
fi

[ -f "$TARGET/Contents/Info.plist" ] || die \
  "$TARGET is not a DSH Desktop bundle.
  Install the official DSH Desktop first: https://www.dshdesktop.com/#download
  ...or point at it with --target /path/to/DSH\\ Desktop.app"

say "source : $SELF_DIR"
say "target : $TARGET"
say "backup : $BACKUP_ROOT"

if [ "$DRY_RUN" = 1 ]; then
  say "--- dry run: rsync plan ---"
  rsync -an --delete --itemize-changes \
    --exclude='.DS_Store' \
    --exclude='app/node_modules/node/bin/node' \
    --exclude='install.sh' --exclude='restore-node.sh' --exclude='verify.sh' \
    --exclude='README.md' --exclude='LICENSE' --exclude='.git' --exclude='.gitignore' \
    --exclude='THIRD_PARTY_NOTICES.md' --exclude='MANIFEST.sha256' \
    "$SELF_DIR/" "$RES_DIR/" | head -80
  say "dry run only — nothing written."
  exit 0
fi

TS="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$TS"
mkdir -p "$DEST"
say "backing up current Resources → $DEST"
rsync -a "$RES_DIR/" "$DEST/"

say "syncing mirror into the bundle"
rsync -a --delete \
  --exclude='.DS_Store' \
  --exclude='app/node_modules/node/bin/node' \
  --exclude='install.sh' --exclude='restore-node.sh' --exclude='verify.sh' \
  --exclude='README.md' --exclude='LICENSE' --exclude='.git' --exclude='.gitignore' \
  --exclude='THIRD_PARTY_NOTICES.md' --exclude='MANIFEST.sha256' \
  "$SELF_DIR/" "$RES_DIR/"

if [ ! -x "$RES_DIR/app/node_modules/node/bin/node" ]; then
  warn "bundled node runtime missing — restoring"
  "$SELF_DIR/restore-node.sh" --target "$RES_DIR/app" || warn "restore-node.sh failed; DSH may still run on Electron's node"
fi

say "fixing permissions"
chmod +x "$RES_DIR/app/node_modules/node/bin/node" 2>/dev/null || true
find "$RES_DIR" -name '*.mjs' -maxdepth 1 -exec chmod +x {} \; 2>/dev/null || true

if xattr -p com.apple.quarantine "$TARGET" >/dev/null 2>&1; then
  say "clearing quarantine attribute"
  xattr -dr com.apple.quarantine "$TARGET" || true
fi

if [ "$RESIGN" = 1 ]; then
  say "ad-hoc re-signing (the original notarized seal is void after resource replacement)"
  codesign --force --deep --sign - "$TARGET" >/dev/null 2>&1 \
    && say "signed ad-hoc" \
    || warn "codesign failed — if macOS refuses to launch, run: codesign --force --deep --sign - \"$TARGET\""
fi

say "done. rollback with: ./install.sh --restore"