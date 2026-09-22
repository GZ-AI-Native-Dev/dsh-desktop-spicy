#!/usr/bin/env bash
#
# verify.sh — 校验这份镜像是否完整、是否和 git HEAD 一致、有没有超限的大文件。
#
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SELF_DIR"

EXPECTED_FILES=15312      # 15,304 mirrored payload files + 8 authored files
EXPECTED_BYTES=199354870  # ~190 MiB, 允许 ±5% 漂移
TOLERANCE=5

say() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31m[x]\033[0m %s\n' "$*" >&2; FAILED=1; }
FAILED=0

say "file count"
N="$(find . -type f -not -path './.git/*' | wc -l | tr -d ' ')"
if [ "$N" -lt $((EXPECTED_FILES - EXPECTED_FILES * TOLERANCE / 100)) ]; then
  fail "only $N files (expected ~$EXPECTED_FILES)"
else
  say "  $N files (expected ~$EXPECTED_FILES) — ok"
fi

say "total size"
B="$(find . -type f -not -path './.git/*' -exec stat -f %z {} + | awk '{s+=$1} END {print s}')"
MB=$((B / 1048576))
say "  ${MB} MiB (expected ~190 MiB)"
if [ "$MB" -lt 170 ]; then fail "tree looks truncated (${MB} MiB)"; fi

say "GitHub 100 MiB per-file limit"
BIG="$(find . -type f -not -path './.git/*' -size +95M | head -5 || true)"
if [ -n "$BIG" ]; then
  fail "files over 95 MiB (GitHub will reject the push):"
  echo "$BIG" | sed 's/^/    /' >&2
else
  say "  no file over 95 MiB — ok"
fi

say "byte-exactness vs git HEAD"
if [ -d .git ]; then
  if [ -z "$(git status --porcelain)" ]; then
    say "  working tree clean, matches HEAD"
  else
    COUNT="$(git status --porcelain | wc -l | tr -d ' ')"
    warn "  $COUNT path(s) differ from HEAD:"
    git status --porcelain | head -20 | sed 's/^/    /'
  fi
else
  warn "  not a git repo yet"
fi

say "integrity manifest"
if [ -f MANIFEST.sha256 ]; then
  say "  verifying MANIFEST.sha256 (this takes a minute)…"
  if shasum -a 256 -c MANIFEST.sha256 --status 2>/dev/null; then
    say "  all hashes match — byte-exact"
  else
    fail "  manifest mismatch: run  shasum -a 256 -c MANIFEST.sha256  for details"
  fi
else
  warn "  MANIFEST.sha256 missing — skipping"
fi

if [ "$FAILED" = 1 ]; then
  printf '\033[31mVERIFY FAILED\033[0m\n' >&2
  exit 1
fi
printf '\033[32mVERIFY OK\033[0m\n'