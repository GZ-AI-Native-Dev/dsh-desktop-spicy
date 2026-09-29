#!/usr/bin/env bash
set -euo pipefail

APP=${1:-/Applications/DSH Desktop.app}
ROOT=$(cd "$(dirname "$0")" && pwd)
PREFIX=Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai
PACKAGES=(dsh-client-ui-deliverables dsh-client-ui-sidebar-documentpreview dsh-api-session-controller)
FILES=(client.js client.js index.js)
PATCHES=(deliverables-preview.patch documentpreview.patch session-controller.patch)
BASE=(21971f469f6f7135e91d258c026f1ac70856b9e9a9acd2a9916fca5b8e7b2a22 d8d2b78c89febaef7f1188c7435d01e70693d73494b8f288f09c5c6dedbd7cc5 e82d226f27f97acf9123e986e5991b20bb560a41601f0ffb46fb0fa0e57278fb)
FIXED=(6d1a112354bb5fb07888058f42d8ce2571d347b037824b506bd823e81dc6f2a5 ce8672d7ee378d9b44c20cffd2dccb1c4fda64dea9a95a18fbfcb43987f13347 5d1016513c7fbbf93e423ee7b3690b2f1532b01ab6db17348b8f1e63d84114d0)
NODE="$APP/Contents/Resources/app.asar.unpacked/node_modules/node/bin/node"
PROFILE="$HOME/Library/Application Support/dsh-desktop/harness/profiles/web/cordis.patch.yml"
PROFILE_BASE=f4d655e016a2965d40c315e7333d618f1ffe2fb83a0dcc744d1aad4e540d416f
PROFILE_FIXED=446a4a2530648281c5d43494bfaaf83445e7e52166fdfbc04d69100f4986abbb

hash() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
if pgrep -f "^${APP}/Contents/MacOS/DSH Desktop$" >/dev/null; then
  echo 'DSH Desktop is running; finish its active sessions and quit it before applying.' >&2
  exit 2
fi
version=$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")
[[ $version == 0.10.0 ]] || { echo "Expected DSH Desktop 0.10.0, found $version" >&2; exit 2; }
all_fixed=1
for i in "${!PACKAGES[@]}"; do
  file="$APP/$PREFIX/${PACKAGES[i]}/lib/${FILES[i]}"
  current=$(hash "$file")
  [[ $current == "${FIXED[i]}" ]] || all_fixed=0
  [[ $current == "${BASE[i]}" || $current == "${FIXED[i]}" ]] || { echo "Unexpected plugin hash: $file $current" >&2; exit 2; }
done
profile_current=$(hash "$PROFILE")
[[ $profile_current == "$PROFILE_BASE" || $profile_current == "$PROFILE_FIXED" ]] || { echo "Unexpected model profile hash: $profile_current" >&2; exit 2; }
[[ $profile_current == "$PROFILE_FIXED" ]] || all_fixed=0
[[ $all_fixed == 0 ]] || { echo 'Preview fix already applied.'; exit 0; }
[[ $profile_current == "$PROFILE_BASE" ]] || { echo 'Partial model profile patch detected.' >&2; exit 2; }
patch --dry-run --directory "$(dirname "$PROFILE")" --strip 0 < "$ROOT/model-context.patch" >/dev/null
for i in "${!PACKAGES[@]}"; do
  file="$APP/$PREFIX/${PACKAGES[i]}/lib/${FILES[i]}"
  [[ $(hash "$file") == "${BASE[i]}" ]] || { echo "Partial patch detected: $file" >&2; exit 2; }
  patch --dry-run --directory "$(dirname "$file")" --strip 0 < "$ROOT/${PATCHES[i]}" >/dev/null
done

backup_root=${DSH_PREVIEW_BACKUP_ROOT:-$HOME/Library/Application Support/dsh-desktop-spicy/preview-fix-backups}
backup="$backup_root/$(date +%Y%m%d-%H%M%S)/DSH Desktop.app"
mkdir -p "$(dirname "$backup")"
ditto "$APP" "$backup"
cp -p "$PROFILE" "$(dirname "$backup")/cordis.patch.yml"
[[ $(hash "$(dirname "$backup")/cordis.patch.yml") == "$PROFILE_BASE" ]] || { echo 'Profile backup hash mismatch' >&2; exit 1; }
for i in "${!PACKAGES[@]}"; do
  [[ $(hash "$backup/$PREFIX/${PACKAGES[i]}/lib/${FILES[i]}") == "${BASE[i]}" ]] || { echo 'Backup hash mismatch' >&2; exit 1; }
done
codesign --verify --deep --strict "$backup"
echo "backup=$backup"

restore_on_error() {
  echo 'Patch failed; restoring the original app.' >&2
  ditto "$backup" "$APP"
  cp -p "$(dirname "$backup")/cordis.patch.yml" "$PROFILE"
}
trap restore_on_error ERR
for i in "${!PACKAGES[@]}"; do
  file="$APP/$PREFIX/${PACKAGES[i]}/lib/${FILES[i]}"
  patch --batch --directory "$(dirname "$file")" --strip 0 < "$ROOT/${PATCHES[i]}"
  "$NODE" --check "$file"
  [[ $(hash "$file") == "${FIXED[i]}" ]]
  echo "modified=$file"
done
codesign --force --deep --sign - "$APP" >/dev/null
codesign --verify --deep --strict "$APP"
patch --batch --directory "$(dirname "$PROFILE")" --strip 0 < "$ROOT/model-context.patch"
[[ $(hash "$PROFILE") == "$PROFILE_FIXED" ]]
trap - ERR
echo "modified=$PROFILE"
echo "rollback=$ROOT/rollback.sh '$backup' '$APP'"
