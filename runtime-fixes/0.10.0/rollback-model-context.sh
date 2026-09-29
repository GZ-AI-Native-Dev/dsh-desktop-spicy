#!/usr/bin/env bash
set -euo pipefail

profile=${1:-$HOME/Library/Application Support/dsh-desktop/harness/profiles/web/cordis.patch.yml}
root=$(cd "$(dirname "$0")" && pwd)
patch --dry-run --reverse --directory "$(dirname "$profile")" --strip 0 < "$root/model-context.patch" >/dev/null
patch --batch --reverse --directory "$(dirname "$profile")" --strip 0 < "$root/model-context.patch"
! grep -A 1 '^          - id: qwen3.8-max$' "$profile" | grep -q 'contextWindow: 1000000'
echo "restored=$profile"
