#!/bin/bash
set -euo pipefail

# Install fed in dev mode for the current branch.
# Expected environment variables (defined in workflow YAML scripts.env):
#   FED_REPO_DIR - worktree path (contains bin/install)
#   FED_BRANCH   - branch name

if [ -z "${FED_REPO_DIR:-}" ]; then
  echo "ERROR: FED_REPO_DIR is not set." >&2
  exit 1
fi

if [ -z "${FED_BRANCH:-}" ]; then
  echo "ERROR: FED_BRANCH is not set." >&2
  exit 1
fi

echo "Installing fed in dev mode for branch: $FED_BRANCH"
"$FED_REPO_DIR/bin/install" --dev "$FED_BRANCH"

echo ""
echo "fed-${FED_BRANCH} is now available. You can use it instead of fed."
