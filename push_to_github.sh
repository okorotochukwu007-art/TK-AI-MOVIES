#!/usr/bin/env bash
# Helper script to sync and push workspace changes to GitHub safely.
# Usage:
#   GITHUB_TOKEN=your_token ./push_to_github.sh [optional commit message]
#   ./push_to_github.sh your_token [optional commit message]

set -euo pipefail

REPO="okorotochukwu007-art/TK-AI-MOVIES"
PUBLIC_URL="https://github.com/${REPO}.git"

TOKEN="${GITHUB_TOKEN:-}"
COMMIT_MSG="chore: sync latest workspace changes"

if [ -z "$TOKEN" ] && [ $# -ge 1 ]; then
  TOKEN="$1"
  shift
fi

if [ $# -ge 1 ]; then
  COMMIT_MSG="$1"
fi

if [ -z "$TOKEN" ]; then
  read -rsp "Enter your GitHub Personal Access Token: " TOKEN
  echo ""
fi

if [ -z "$TOKEN" ]; then
  echo "Error: No GitHub token provided."
  exit 1
fi

cleanup() {
  if [ -d ".git" ]; then
    git remote set-url origin "$PUBLIC_URL" 2>/dev/null || true
  fi
}
trap cleanup EXIT

AUTH_URL="https://x-access-token:${TOKEN}@github.com/${REPO}.git"

if [ ! -d ".git" ]; then
  echo "Initializing local Git repository..."
  git init -b main
  git remote add origin "$AUTH_URL"

  if [ -z "$(git config user.name || true)" ]; then
    git config user.name "TK Cinema Admin"
  fi
  if [ -z "$(git config user.email || true)" ]; then
    git config user.email "okorotochukwu007@gmail.com"
  fi

  echo "Linking to remote branch main..."
  if git fetch origin main 2>/dev/null; then
    # Attach local working tree cleanly on top of remote main without overwriting local files
    git reset --soft origin/main
  fi
else
  git remote set-url origin "$AUTH_URL" 2>/dev/null || git remote add origin "$AUTH_URL"
  git checkout -B main
fi

echo "Staging changes..."
git add -A

if git diff --cached --quiet; then
  echo "No new changes to commit."
else
  echo "Committing changes..."
  git commit -m "$COMMIT_MSG"
fi

echo "Pushing branch main to ${PUBLIC_URL}..."
if ! git push -u origin main; then
  echo "Remote main has newer commits. Pulling with rebase and retrying..."
  git pull --rebase --autostash origin main
  git push -u origin main
fi

echo "Successfully pushed to https://github.com/${REPO}!"
