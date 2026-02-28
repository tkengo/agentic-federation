#!/bin/bash
set -euo pipefail

echo "=== Running worktree-merge ==="
"$FED_REPO_DIR/scripts/worktree-merge.sh"

echo ""
echo "=== Uninstalling dev command ==="
"$FED_REPO_DIR/bin/uninstall" --dev "$FED_BRANCH"

echo ""
echo "=== Install latest CLI and dashboard ==="
$FED_REPO_ROOT/bin/install

echo ""
echo "=== Done ==="
