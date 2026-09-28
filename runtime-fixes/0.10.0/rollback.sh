#!/usr/bin/env bash
set -euo pipefail

backup=${1:?Pass the backup app path printed by apply.sh}
app=${2:-/Applications/DSH Desktop.app}
rel=Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js
base=21971f469f6f7135e91d258c026f1ac70856b9e9a9acd2a9916fca5b8e7b2a22
if pgrep -f "^${app}/Contents/MacOS/DSH Desktop$" >/dev/null; then
  echo 'Quit DSH Desktop before rollback.' >&2
  exit 2
fi
[[ $(shasum -a 256 "$backup/$rel" | cut -d ' ' -f 1) == "$base" ]]
codesign --verify --deep --strict "$backup"
ditto "$backup" "$app"
[[ $(shasum -a 256 "$app/$rel" | cut -d ' ' -f 1) == "$base" ]]
codesign --verify --deep --strict "$app"
echo "restored=$app"
