#!/usr/bin/env bash
# One-shot installer: package the extension, install it via the editor CLI,
# and patch the editor's extensions.json so the workbench scanner accepts it.
#
# Usage:
#   ./install.sh                # auto-detect editor (prefers cursor, then code)
#   ./install.sh cursor         # force a specific CLI
#   ./install.sh code
#   ./install.sh code-insiders

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

EXT_ID="local.skip-worktree-toggle"
VSIX="skip-worktree-toggle.vsix"

# ---------- pick CLI ----------
pick_cli() {
  if [[ $# -ge 1 ]]; then echo "$1"; return; fi
  for c in cursor code code-insiders; do
    if command -v "$c" >/dev/null 2>&1; then echo "$c"; return; fi
  done
  return 1
}

CLI="$(pick_cli "$@" || true)"
if [[ -z "${CLI:-}" ]]; then
  echo "error: no editor CLI found (looked for: cursor, code, code-insiders)" >&2
  echo "       install one and re-run, or pass it explicitly: ./install.sh cursor" >&2
  exit 1
fi
if ! command -v "$CLI" >/dev/null 2>&1; then
  echo "error: '$CLI' is not on PATH" >&2
  exit 1
fi
echo "==> using editor CLI: $CLI"

# ---------- locate extensions dir ----------
case "$CLI" in
  cursor)         EXT_DIR="$HOME/.cursor/extensions" ;;
  code)           EXT_DIR="$HOME/.vscode/extensions" ;;
  code-insiders)  EXT_DIR="$HOME/.vscode-insiders/extensions" ;;
  *)              EXT_DIR="$HOME/.${CLI}/extensions" ;;
esac
EXT_JSON="$EXT_DIR/extensions.json"
echo "==> extensions registry: $EXT_JSON"

# ---------- prerequisites ----------
for bin in npx python3; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "error: '$bin' is required but not on PATH" >&2
    exit 1
  fi
done

# ---------- package ----------
echo "==> packaging $VSIX"
npx --yes @vscode/vsce@latest package \
  --out "$VSIX" \
  --allow-missing-repository \
  --skip-license \
  --no-dependencies >/dev/null

# ---------- install ----------
echo "==> installing $VSIX into $CLI"
"$CLI" --install-extension "$SCRIPT_DIR/$VSIX" --force >/dev/null

# ---------- patch metadata ----------
# Cursor (and some VSCode forks) silently drop VSIX-installed extensions whose
# registry entry lacks publisher metadata. We backfill the fields a gallery-
# installed extension would have so the workbench scanner picks ours up.
if [[ -f "$EXT_JSON" ]]; then
  echo "==> patching $EXT_JSON metadata"
  python3 - "$EXT_JSON" "$EXT_ID" <<'PY'
import json, os, sys, uuid
path, ext_id = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
patched = False
for e in data:
    if e.get("identifier", {}).get("id") != ext_id:
        continue
    e["identifier"].setdefault("uuid", str(uuid.uuid4()))
    m = e.setdefault("metadata", {})
    m.setdefault("id", e["identifier"]["uuid"])
    m.setdefault("publisherId", str(uuid.uuid4()))
    m.setdefault("publisherDisplayName", ext_id.split(".", 1)[0])
    m.setdefault("targetPlatform", "undefined")
    m.setdefault("isPreReleaseVersion", False)
    m.setdefault("hasPreReleaseVersion", False)
    m.setdefault("preRelease", False)
    m.setdefault("private", False)
    m.setdefault("updated", False)
    m["isApplicationScoped"] = True
    patched = True
    break
if not patched:
    print(f"warning: {ext_id} not found in registry", file=sys.stderr)
    sys.exit(0)
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(data, f)
os.replace(tmp, path)
print("ok: metadata patched")
PY
else
  echo "note: $EXT_JSON not found; skipping metadata patch"
fi

cat <<EOF

==> done.
Now fully quit and reopen $CLI (Cmd+Q on macOS) so the workbench rescans
extensions. Then open the command palette and search "Git Skip-Worktree".
EOF
