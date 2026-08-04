#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(git rev-parse --show-toplevel)"
git_dir="$(git -C "$repo_root" rev-parse --git-dir)"
if [[ "$git_dir" != /* ]]; then
  git_dir="$repo_root/$git_dir"
fi

remote_name="github"
remote_url="ssh://git@ssh.github.com:443/oewinchester/FormEdge.git"
legacy_remote_url="git@github.com:oewinchester/FormEdge.git"
key_path="${FORMEDGE_GITHUB_DEPLOY_KEY_PATH:-$git_dir/formedge-github-deploy-key}"
known_hosts_path="$git_dir/formedge-github-known-hosts"
ssh_wrapper_path="$git_dir/formedge-github-ssh"
proxy_script_path="$repo_root/scripts/ssh-http-connect-proxy.mjs"

if [[ ! -f "$key_path" ]]; then
  printf 'FormEdge GitHub deploy key bulunamadı: %s\n' "$key_path" >&2
  exit 2
fi
chmod 600 "$key_path"

existing_remote="$(git -C "$repo_root" remote get-url "$remote_name" 2>/dev/null || true)"
if [[ -n "$existing_remote" && "$existing_remote" != "$remote_url" && "$existing_remote" != "$legacy_remote_url" ]]; then
  printf '%s remote beklenmeyen bir adrese bağlı; otomatik değiştirilmedi.\n' "$remote_name" >&2
  exit 3
fi
if [[ -z "$existing_remote" ]]; then
  git -C "$repo_root" remote add "$remote_name" "$remote_url"
elif [[ "$existing_remote" == "$legacy_remote_url" ]]; then
  git -C "$repo_root" remote set-url "$remote_name" "$remote_url"
fi

tmp_known_hosts="$known_hosts_path.tmp"
curl --fail --silent --show-error --location \
  --proto '=https' --tlsv1.2 \
  --connect-timeout 10 --max-time 20 \
  'https://api.github.com/meta' \
  | node --input-type=module -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        const payload = JSON.parse(input);
        const keys = Array.isArray(payload.ssh_keys) ? payload.ssh_keys : [];
        if (keys.length === 0) throw new Error("GitHub Meta API SSH anahtarı döndürmedi.");
        const hosts = ["github.com", "[ssh.github.com]:443"];
        process.stdout.write(hosts.flatMap((host) => keys.map((key) => `${host} ${key}`)).join("\n") + "\n");
      });
    ' > "$tmp_known_hosts"
chmod 600 "$tmp_known_hosts"
mv "$tmp_known_hosts" "$known_hosts_path"

{
  printf '#!/usr/bin/env bash\n'
  printf 'exec ssh -i %q -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=%q -o %q "$@"\n' \
    "$key_path" "$known_hosts_path" "ProxyCommand=node $proxy_script_path %h %p"
} > "$ssh_wrapper_path"
chmod 700 "$ssh_wrapper_path"

git -C "$repo_root" config core.hooksPath .githooks
printf 'FormEdge GitHub mirror hazır. Remote: %s\n' "$remote_url"
