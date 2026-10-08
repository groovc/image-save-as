#!/bin/sh
# Builds dist/image-save-as-<version>.zip containing only the files the extension needs.
# The same zip is uploaded to the Chrome Web Store and attached to GitHub releases.
set -eu

cd "$(dirname "$0")/.."

FILES="manifest.json background.js lib offscreen popup icons LICENSE"

version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' manifest.json)
if [ -z "$version" ]; then
  echo "Couldn't read the version from manifest.json" >&2
  exit 1
fi

out="dist/image-save-as-$version.zip"
mkdir -p dist
rm -f "$out"
# -X drops macOS extended attributes; .DS_Store files are excluded.
zip -rqX "$out" $FILES -x '*.DS_Store'

echo "$out"
