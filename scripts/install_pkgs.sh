#!/bin/bash
# Session bootstrap: install dependencies exactly as the lockfile pins them.
#
# This deliberately uses `npm ci`, not `npm install`. `npm install` only checks
# that what is already in node_modules *satisfies the range* in package.json, so
# a tree left over from another branch (or an older prettier that still matches)
# is silently kept and the lockfile is ignored. That is how prettier 3.7.4 kept
# reappearing and reformatting files nobody touched. `npm ci` deletes
# node_modules and rebuilds it from package-lock.json, so the installed versions
# always match the pins.
set -uo pipefail
cd "$CLAUDE_PROJECT_DIR" || exit 1

if npm ci; then
  exit 0
fi

# `npm ci` refuses to run when package.json and package-lock.json disagree.
# Fall back, but wipe node_modules first so the reinstall cannot inherit stale
# versions from the previous tree — that is the exact failure mode above.
echo "npm ci failed (package.json and package-lock.json are likely out of sync)." >&2
echo "Falling back to a clean npm install; commit the updated package-lock.json." >&2
rm -rf node_modules
npm install
