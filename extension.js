const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");

function execGit(args, cwd) {
  return new Promise((resolve, reject) => {
    cp.execFile(
      "git",
      args,
      { cwd, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      }
    );
  });
}

async function findRepoRoot(cwd) {
  const out = await execGit(["rev-parse", "--show-toplevel"], cwd);
  return out.trim();
}

async function pickRepo() {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) {
    throw new Error("No workspace folder is open.");
  }
  const roots = [];
  for (const f of folders) {
    try {
      const root = await findRepoRoot(f.uri.fsPath);
      if (!roots.includes(root)) roots.push(root);
    } catch {
      /* not a git repo, skip */
    }
  }
  if (roots.length === 0) throw new Error("No git repositories in workspace.");
  if (roots.length === 1) return roots[0];
  const pick = await vscode.window.showQuickPick(
    roots.map((r) => ({ label: path.basename(r), description: r, root: r })),
    { placeHolder: "Select git repository" }
  );
  if (!pick) return undefined;
  return pick.root;
}

async function listAllTracked(repo) {
  const out = await execGit(["ls-files", "-v"], repo);
  const lines = out.split("\n").filter(Boolean);
  return lines.map((line) => {
    const flag = line[0];
    const file = line.slice(2);
    return { flag, file, skipped: flag === "S" || flag === "s" };
  });
}

async function cmdToggle() {
  try {
    const repo = await pickRepo();
    if (!repo) return;

    const files = await listAllTracked(repo);
    if (files.length === 0) {
      vscode.window.showInformationMessage("No tracked files in repo.");
      return;
    }

    const items = files.map((f) => ({
      label: (f.skipped ? "$(eye-closed) " : "$(eye) ") + f.file,
      description: f.skipped ? "skip-worktree" : "tracked",
      file: f.file,
      picked: f.skipped,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      matchOnDescription: true,
      placeHolder:
        "Checked = skip-worktree ON. Toggle selection then press Enter.",
    });
    if (!picked) return;

    const desiredSkipped = new Set(picked.map((p) => p.file));
    const toSkip = [];
    const toUnskip = [];
    for (const f of files) {
      const want = desiredSkipped.has(f.file);
      if (want && !f.skipped) toSkip.push(f.file);
      else if (!want && f.skipped) toUnskip.push(f.file);
    }

    if (toSkip.length === 0 && toUnskip.length === 0) {
      vscode.window.showInformationMessage("No changes.");
      return;
    }

    const CHUNK = 200;
    for (let i = 0; i < toSkip.length; i += CHUNK) {
      await execGit(
        ["update-index", "--skip-worktree", ...toSkip.slice(i, i + CHUNK)],
        repo
      );
    }
    for (let i = 0; i < toUnskip.length; i += CHUNK) {
      await execGit(
        ["update-index", "--no-skip-worktree", ...toUnskip.slice(i, i + CHUNK)],
        repo
      );
    }

    vscode.window.showInformationMessage(
      `skip-worktree updated: +${toSkip.length} / -${toUnskip.length} in ${path.basename(repo)}`
    );
  } catch (e) {
    vscode.window.showErrorMessage(`skip-worktree: ${e.message}`);
  }
}

async function cmdList() {
  try {
    const repo = await pickRepo();
    if (!repo) return;
    const files = (await listAllTracked(repo)).filter((f) => f.skipped);
    if (files.length === 0) {
      vscode.window.showInformationMessage(
        `No skip-worktree files in ${path.basename(repo)}.`
      );
      return;
    }
    const doc = await vscode.workspace.openTextDocument({
      language: "plaintext",
      content:
        `# skip-worktree files in ${repo}\n\n` +
        files.map((f) => f.file).join("\n") +
        "\n",
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch (e) {
    vscode.window.showErrorMessage(`skip-worktree: ${e.message}`);
  }
}

async function cmdUnskip() {
  try {
    const repo = await pickRepo();
    if (!repo) return;

    const skipped = (await listAllTracked(repo)).filter((f) => f.skipped);
    if (skipped.length === 0) {
      vscode.window.showInformationMessage(
        `No skip-worktree files in ${path.basename(repo)}.`
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(
      skipped.map((f) => ({ label: f.file, picked: true })),
      {
        canPickMany: true,
        placeHolder:
          "Uncheck files to KEEP skipped. Checked files will be unskipped.",
      }
    );
    if (!picked) return;
    if (picked.length === 0) {
      vscode.window.showInformationMessage("No files selected.");
      return;
    }

    const files = picked.map((p) => p.label);
    const CHUNK = 200;
    for (let i = 0; i < files.length; i += CHUNK) {
      await execGit(
        ["update-index", "--no-skip-worktree", ...files.slice(i, i + CHUNK)],
        repo
      );
    }
    vscode.window.showInformationMessage(
      `Unskipped ${files.length} file(s) in ${path.basename(repo)}.`
    );
  } catch (e) {
    vscode.window.showErrorMessage(`skip-worktree: ${e.message}`);
  }
}

async function cmdToggleCurrentFile() {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active file.");
      return;
    }
    const filePath = editor.document.uri.fsPath;
    const repo = await findRepoRoot(path.dirname(filePath));
    const rel = path.relative(repo, filePath);

    const out = await execGit(["ls-files", "-v", "--", rel], repo);
    if (!out.trim()) {
      vscode.window.showWarningMessage(`${rel} is not tracked by git.`);
      return;
    }
    const flag = out.trim()[0];
    const isSkipped = flag === "S" || flag === "s";
    const action = isSkipped ? "--no-skip-worktree" : "--skip-worktree";

    await execGit(["update-index", action, rel], repo);
    vscode.window.showInformationMessage(
      `skip-worktree ${isSkipped ? "cleared" : "set"} on ${rel}`
    );
  } catch (e) {
    vscode.window.showErrorMessage(`skip-worktree: ${e.message}`);
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("skipWorktree.toggle", cmdToggle),
    vscode.commands.registerCommand("skipWorktree.unskip", cmdUnskip),
    vscode.commands.registerCommand("skipWorktree.list", cmdList),
    vscode.commands.registerCommand(
      "skipWorktree.toggleCurrentFile",
      cmdToggleCurrentFile
    )
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
