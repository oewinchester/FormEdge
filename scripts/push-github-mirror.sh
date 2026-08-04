#!/usr/bin/env bash
set -u

hook_mode=false
if [[ "${1:-}" == "--hook" ]]; then
  hook_mode=true
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
git_dir="$(git -C "$repo_root" rev-parse --git-dir)"
if [[ "$git_dir" != /* ]]; then
  git_dir="$repo_root/$git_dir"
fi

remote_name="github"
expected_remote_url="ssh://git@ssh.github.com:443/oewinchester/FormEdge.git"
key_path="${FORMEDGE_GITHUB_DEPLOY_KEY_PATH:-$git_dir/formedge-github-deploy-key}"
known_hosts_path="$git_dir/formedge-github-known-hosts"
ssh_wrapper_path="$git_dir/formedge-github-ssh"
state_path="$git_dir/formedge-github-mirror.state"
log_path="$git_dir/formedge-github-mirror.log"
lock_dir="$git_dir/formedge-github-mirror.lock"

record_state() {
  local status="$1"
  local detail="$2"
  local head_sha
  head_sha="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || printf 'unknown')"
  printf 'status=%s\nhead=%s\ntime=%s\ndetail=%s\n' \
    "$status" "$head_sha" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$detail" > "$state_path"
  printf '%s status=%s head=%s detail=%s\n' \
    "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$status" "$head_sha" "$detail" >> "$log_path"
}

finish_failure() {
  local detail="$1"
  record_state pending "$detail"
  if [[ "$hook_mode" == false ]]; then
    printf 'GitHub mirror tamamlanamadı: %s\n' "$detail" >&2
    exit 1
  fi
  exit 0
}

if ! mkdir "$lock_dir" 2>/dev/null; then
  finish_failure 'Başka bir mirror işlemi çalışıyor.'
fi
trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT

if [[ ! -f "$key_path" ]]; then
  finish_failure 'Repo-sınırlı deploy key çalışma alanında yok.'
fi
if [[ ! -s "$known_hosts_path" ]]; then
  finish_failure 'GitHub host anahtarı hazırlanmadı; önce mirror:setup çalıştırılmalı.'
fi
if [[ ! -x "$ssh_wrapper_path" ]]; then
  finish_failure 'GitHub HTTPS tünel wrapper’ı hazırlanmadı; önce mirror:setup çalıştırılmalı.'
fi

remote_url="$(git -C "$repo_root" remote get-url "$remote_name" 2>/dev/null || true)"
if [[ "$remote_url" != "$expected_remote_url" ]]; then
  finish_failure 'GitHub remote adresi güvenlik sözleşmesiyle eşleşmiyor.'
fi

export GIT_TERMINAL_PROMPT=0
export GIT_SSH="$ssh_wrapper_path"
unset GIT_SSH_COMMAND

push_output="$(git -C "$repo_root" push "$remote_name" HEAD:refs/heads/main 2>&1)"
push_status=$?
if [[ $push_status -ne 0 ]]; then
  safe_detail="$(printf '%s' "$push_output" | tail -n 1 | tr '\n\r' ' ' | cut -c1-240)"
  finish_failure "${safe_detail:-Git push başarısız oldu.}"
fi

record_state synced 'Sites checkpoint commit’i GitHub main dalına fast-forward push edildi.'
if [[ "$hook_mode" == false ]]; then
  printf 'GitHub mirror tamamlandı: %s\n' "$(git -C "$repo_root" rev-parse --short HEAD)"
fi
