#!/usr/bin/env bash
set -euo pipefail

APP=${1:-/Applications/DSH Desktop.app}
ROOT=$(cd "$(dirname "$0")" && pwd)
REL=Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js
BASE=21971f469f6f7135e91d258c026f1ac70856b9e9a9acd2a9916fca5b8e7b2a22
FIXED=6d1a112354bb5fb07888058f42d8ce2571d347b037824b506bd823e81dc6f2a5
NODE="$APP/Contents/Resources/app.asar.unpacked/node_modules/node/bin/node"

hash() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
if pgrep -f "^${APP}/Contents/MacOS/DSH Desktop$" >/dev/null; then
  echo 'DSH Desktop is running; finish its active sessions and quit it before applying.' >&2
  exit 2
fi
version=$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")
[[ $version == 0.10.0 ]] || { echo "Expected DSH Desktop 0.10.0, found $version" >&2; exit 2; }
current=$(hash "$APP/$REL")
[[ $current != "$FIXED" ]] || { echo 'Preview fix already applied.'; exit 0; }
[[ $current == "$BASE" ]] || { echo "Unexpected plugin hash: $current" >&2; exit 2; }
patch --dry-run --directory "$(dirname "$APP/$REL")" --strip 0 < "$ROOT/deliverables-preview.patch" >/dev/null

backup_root=${DSH_PREVIEW_BACKUP_ROOT:-$HOME/Library/Application Support/dsh-desktop-spicy/preview-fix-backups}
backup="$backup_root/$(date +%Y%m%d-%H%M%S)/DSH Desktop.app"
mkdir -p "$(dirname "$backup")"
ditto "$APP" "$backup"
[[ $(hash "$backup/$REL") == "$BASE" ]] || { echo 'Backup hash mismatch' >&2; exit 1; }
codesign --verify --deep --strict "$backup"
echo "backup=$backup"

restore_on_error() {
  echo 'Patch failed; restoring the original app.' >&2
  ditto "$backup" "$APP"
}
trap restore_on_error ERR
patch --batch --directory "$(dirname "$APP/$REL")" --strip 0 < "$ROOT/deliverables-preview.patch"
"$NODE" --check "$APP/$REL"
[[ $(hash "$APP/$REL") == "$FIXED" ]]
codesign --force --deep --sign - "$APP" >/dev/null
codesign --verify --deep --strict "$APP"
trap - ERR
echo "modified=$APP/$REL"
echo "rollback=$ROOT/rollback.sh '$backup' '$APP'"
