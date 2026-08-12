#!/bin/bash
# Vendor the superpowers skills into .claude/skills/.
#
# Why vendor instead of installing the plugin: the remote sandbox sets
# SKIP_PLUGIN_MARKETPLACE=true, so no plugin marketplace resolves there and the
# skills would only ever work on a local checkout. Skills committed under
# .claude/skills/ are discovered directly (Claude Code reads that path as
# "project-skill"), so they work everywhere the repo is cloned, offline included.
#
# SUPERPOWERS_REF is the exact commit the official claude-plugins-official
# marketplace pins for superpowers v6.2.0, so the vendored tree matches what
# `/plugin install superpowers@claude-plugins-official` would deliver. To update:
# bump the ref, re-run this script, review the diff, commit.
#
# Usage: scripts/vendor_superpowers.sh
set -euo pipefail

SUPERPOWERS_REPO=https://github.com/obra/superpowers.git
SUPERPOWERS_REF=44c9b2d6e889982ac18c27d05a19fefe335194e1

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DEST="$REPO_ROOT/.claude/skills"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "Fetching superpowers @ ${SUPERPOWERS_REF:0:12} ..."
git init -q "$WORK"
git -C "$WORK" remote add origin "$SUPERPOWERS_REPO"
git -C "$WORK" fetch -q --depth 1 origin "$SUPERPOWERS_REF"
git -C "$WORK" checkout -q FETCH_HEAD

if [ ! -d "$WORK/skills" ]; then
  echo "error: no skills/ directory at $SUPERPOWERS_REF" >&2
  exit 1
fi

# Replace wholesale rather than merging, so skills deleted upstream do not linger.
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$WORK"/skills/. "$DEST"/
# MIT-licensed third-party source: keep the license with the code it covers.
cp "$WORK/LICENSE" "$DEST/LICENSE"

# Upstream cross-references skills by their plugin-namespaced id
# ("superpowers:test-driven-development"). Vendored skills are project skills and
# are invoked by bare name, so the namespace prefix would not resolve. The name
# after the colon already matches the directory name, so stripping it is enough.
find "$DEST" -type f -name "*.md" -print0 |
  xargs -0 sed -i 's/superpowers:\([a-z][a-z-]*\)/\1/g'

if grep -rq "superpowers:[a-z]" "$DEST"; then
  echo "error: namespaced skill references survived the rewrite" >&2
  grep -rn "superpowers:[a-z]" "$DEST" >&2
  exit 1
fi

echo "Vendored $(find "$DEST" -name SKILL.md | wc -l | tr -d ' ') skills into .claude/skills/"
