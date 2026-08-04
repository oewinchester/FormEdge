#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(git rev-parse --show-toplevel)"
git_dir="$(git -C "$repo_root" rev-parse --git-dir)"
if [[ "$git_dir" != /* ]]; then
  git_dir="$repo_root/$git_dir"
fi
state_path="$git_dir/formedge-github-mirror.state"

if [[ ! -f "$state_path" ]]; then
  printf 'status=not_started\n'
  exit 0
fi
cat "$state_path"
