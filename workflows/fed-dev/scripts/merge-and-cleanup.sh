#!/bin/bash
set -euo pipefail

# Merge worktree branch into main, then uninstall the dev fed command.
# Expected environment variables (defined in workflow YAML scripts.env):
#   FED_REPO_DIR   - worktree path
#   FED_BRANCH     - branch name
#   FED_SESSION    - tmux session name
#   FED_REPO_ROOT  - main repository root path

# --- Merge ---

echo "=== Running worktree-merge ==="
"$FED_REPO_DIR/scripts/worktree-merge.sh"

# --- Uninstall dev command ---

echo ""
echo "=== Uninstalling dev command ==="
"$FED_REPO_DIR/bin/uninstall" --dev "$FED_BRANCH"

echo ""
echo "=== Done ==="
