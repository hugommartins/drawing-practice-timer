#!/usr/bin/env bash
# Build Hatchmark and put Hatchmark.app in ~/Applications. Run from the repo root: npm run install:mac
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script is for macOS. On other systems use: npm start" >&2
  exit 1
fi
cd "$(dirname "$0")/.."

[[ -d node_modules ]] || npm install
npm run package

app="$(find release -maxdepth 2 -name 'Hatchmark.app' -type d | head -n 1)"
if [[ -z "$app" ]]; then
  echo "Build finished but Hatchmark.app was not found under release/." >&2
  exit 1
fi

mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Plchldr.app"   # build installed under the old name
rm -rf "$HOME/Applications/Hatchmark.app"
cp -R "$app" "$HOME/Applications/Hatchmark.app"
# Unsigned local build: clear the quarantine flag so macOS opens it without the "damaged" prompt.
xattr -cr "$HOME/Applications/Hatchmark.app" || true

echo "Installed: $HOME/Applications/Hatchmark.app"
echo "Your data lives in: $HOME/Library/Application Support/Hatchmark/data"
