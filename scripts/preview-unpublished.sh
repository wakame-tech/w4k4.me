#!/usr/bin/env bash
# Serve a local preview that also includes everything kept off the site:
# notes without `publish: true`, and the directories ignorePatterns hides
# (private/, daily/, lifelog/, techblog/, kibela/, so _paste/private/ images
# show too). Quartz always reads quartz.config.yaml from the cwd, so run it
# from a scratch dir that symlinks the repo and swaps in an edited config.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

shopt -s dotglob
for entry in "$root"/*; do
  name="$(basename "$entry")"
  case "$name" in quartz.config.yaml | public) continue ;; esac
  ln -s "$entry" "$work/$name"
done

sed -E \
  -e '/explicit-publish$/{n;s/enabled: true/enabled: false/;}' \
  -e '/^    - ("\*\*\/)?(private|daily|lifelog|techblog|kibela)(\/\*\*")?$/d' \
  "$root/quartz.config.yaml" > "$work/quartz.config.yaml"

cd "$work"
# One worker is about twice as fast here: each worker loads every plugin
# (syntax highlighting is the slowest to start), and ~300 files are too few
# to pay that back (daily/ adds ~1,500 more; try --concurrency 4 if that
# gets slow). Pass --concurrency N to override.
npx quartz build --serve --concurrency 1 -d content/wiki -o "$work/public" "$@"
