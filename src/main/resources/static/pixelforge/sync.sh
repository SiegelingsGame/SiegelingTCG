#!/usr/bin/env bash
# Copy this PixelForge folder over the copies in other repos so all projects share one tool.
#   ./pixelforge/sync.sh <target-dir> [<target-dir> ...]
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)"
files=(core.js presets.js player.js cli.js test.js editor.js editor.css index.html README.md sync.sh)
[ $# -gt 0 ] || { echo "usage: $0 <target-dir>..."; exit 1; }
for dst in "$@"; do
  mkdir -p "$dst"
  for f in "${files[@]}"; do
    if [ -f "$dst/$f" ] && [ "$dst/$f" -nt "$src/$f" ] && ! cmp -s "$dst/$f" "$src/$f"; then
      echo "refusing: $dst/$f is newer than $src/$f (edited there?) — sync from that copy instead" >&2
      exit 2
    fi
  done
  for f in "${files[@]}"; do cp -p "$src/$f" "$dst/$f"; done
  echo "synced -> $dst"
done
