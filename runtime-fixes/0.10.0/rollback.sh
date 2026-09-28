#!/usr/bin/env bash
set -euo pipefail

backup=${1:?Pass the backup app path printed by apply.sh}
app=${2:-/Applications/DSH Desktop.app}
prefix=Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai
packages=(dsh-client-ui-deliverables dsh-client-ui-sidebar-documentpreview dsh-api-session-controller)
files=(client.js client.js index.js)
base=(21971f469f6f7135e91d258c026f1ac70856b9e9a9acd2a9916fca5b8e7b2a22 d8d2b78c89febaef7f1188c7435d01e70693d73494b8f288f09c5c6dedbd7cc5 e82d226f27f97acf9123e986e5991b20bb560a41601f0ffb46fb0fa0e57278fb)
if pgrep -f "^${app}/Contents/MacOS/DSH Desktop$" >/dev/null; then
  echo 'Quit DSH Desktop before rollback.' >&2
  exit 2
fi
for i in "${!packages[@]}"; do
  [[ $(shasum -a 256 "$backup/$prefix/${packages[i]}/lib/${files[i]}" | cut -d ' ' -f 1) == "${base[i]}" ]]
done
codesign --verify --deep --strict "$backup"
ditto "$backup" "$app"
for i in "${!packages[@]}"; do
  [[ $(shasum -a 256 "$app/$prefix/${packages[i]}/lib/${files[i]}" | cut -d ' ' -f 1) == "${base[i]}" ]]
done
codesign --verify --deep --strict "$app"
echo "restored=$app"
