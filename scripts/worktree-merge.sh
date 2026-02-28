#!/bin/bash
set -euo pipefail

# Merge current worktree branch into main via rebase + fast-forward merge.
# Expected environment variables (defined in workflow YAML scripts.env):
#   FED_REPO_DIR   - worktree path
#   FED_BRANCH     - branch name
#   FED_SESSION    - tmux session name
#   FED_REPO_ROOT  - main repository root path

# --- Pre-flight checks ---

# Check that the worktree directory exists, then cd into it
if [ ! -d "$FED_REPO_DIR" ]; then
  echo "ERROR: Worktree directory not found: $FED_REPO_DIR" >&2
  exit 1
fi
cd "$FED_REPO_DIR"

# Check that git recognizes this as a registered worktree
if ! git worktree list | grep -qF "$FED_REPO_DIR"; then
  echo "ERROR: Not a registered git worktree: $FED_REPO_DIR" >&2
  exit 1
fi

# Check that the branch exists in git
if ! git branch --list "$FED_BRANCH" | grep -q .; then
  echo "ERROR: Git branch not found: $FED_BRANCH" >&2
  exit 1
fi

# Check that the tmux session is alive
if ! tmux has-session -t "$FED_SESSION" 2>/dev/null; then
  echo "ERROR: tmux session not found: $FED_SESSION" >&2
  exit 1
fi

# --- Stage all changes ---

echo "Staging changes..."
git add -A

if git diff --cached --quiet; then
  echo "No changes to commit. Nothing to do."
  exit 0
fi

echo "Committing..."
gcauto

# --- Rebase onto main ---

echo "Rebasing onto main..."
if ! git rebase main; then
  echo "" >&2
  echo "ERROR: Rebase conflict detected." >&2
  echo "Please resolve conflicts manually:" >&2
  echo "  cd $FED_REPO_DIR" >&2
  echo "  git add <resolved-files>" >&2
  echo "  git rebase --continue" >&2
  exit 1
fi

# --- Fast-forward merge into main ---

echo "Merging into main..."
if [ -z "${FED_REPO_ROOT:-}" ]; then
  echo "ERROR: FED_REPO_ROOT is not set." >&2
  exit 1
fi

git -C "$FED_REPO_ROOT" merge "$FED_BRANCH"

echo "Successfully merged $FED_BRANCH into main."
