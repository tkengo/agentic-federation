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
echo "=== Pushing main to origin ==="
if ! git -C "$FED_REPO_ROOT" push origin main; then
  echo "" >&2
  echo "ERROR: Failed to push main to origin." >&2
  echo "The merge was successful, but the push failed." >&2
  echo "Please push manually: git -C $FED_REPO_ROOT push origin main" >&2
  exit 1
fi

echo ""
echo "=== Done ==="
