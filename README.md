# Git Skip-Worktree Toggle

Quickly toggle `git update-index --skip-worktree` on tracked files from the
editor command palette. Useful for keeping local-only edits to files that are
tracked in git (e.g. `.vscode/launch.json`, dev configs) without risk of
committing them.

Works with VSCode, Cursor, and other VSCode-compatible editors.

## Commands

All commands live under the **Git Skip-Worktree** category in the palette:

- **Toggle skip-worktree (pick files)** — multi-select picker over every tracked file.
- **Unskip files (pick from currently skipped)** — focused picker showing only files currently flagged.
- **Toggle skip-worktree on current file** — flip the active editor's file.
- **List skip-worktree files** — open a buffer with all currently-skipped files.

Multi-root workspaces are supported; you'll be asked which repo to act on.

## Install

Requires Node.js (for `npx`), Python 3, and your editor's CLI (`code`, `cursor`, etc.) on your `PATH`.

### Recommended: one-shot script

```bash
./install.sh           # auto-detects cursor / code / code-insiders
./install.sh cursor    # or pin a specific editor
```

The script packages the VSIX, installs it via the editor CLI, and patches the editor's `extensions.json` to ensure the workbench scanner accepts the locally-built extension. (Without that patch some editors — notably Cursor — silently drop VSIX-installed extensions.)

### Manual install

```bash
npx --yes @vscode/vsce@latest package \
  --out skip-worktree-toggle.vsix \
  --allow-missing-repository --skip-license --no-dependencies

code   --install-extension "$PWD/skip-worktree-toggle.vsix" --force   # VSCode
# cursor --install-extension "$PWD/skip-worktree-toggle.vsix" --force # Cursor
```

After installing, fully quit and reopen the editor (`Cmd+Q` on macOS) so the workbench picks up the new extension.

## Suggested keybindings

Add to your user `keybindings.json` (Command Palette → **Preferences: Open Keyboard Shortcuts (JSON)**):

```json
[
  { "key": "cmd+alt+s",       "command": "skipWorktree.toggleCurrentFile" },
  { "key": "cmd+alt+shift+s", "command": "skipWorktree.toggle" },
  { "key": "cmd+alt+u",       "command": "skipWorktree.unskip" }
]
```

On Linux/Windows replace `cmd` with `ctrl`.

Note: `Cmd+Alt+S` is **Save Without Formatting** by default — the binding above will override it.

## Uninstall

```bash
code   --uninstall-extension local.skip-worktree-toggle
# cursor --uninstall-extension local.skip-worktree-toggle
```
