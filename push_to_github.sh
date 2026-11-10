#!/usr/bin/env bash
# Helper script to push to GitHub with a Personal Access Token (PAT)
# Usage: ./push_to_github.sh YOUR_GITHUB_TOKEN

set -e

TOKEN="$1"

if [ -z "$TOKEN" ]; then
  echo "Error: Please provide your GitHub Personal Access Token."
  echo "Usage: ./push_to_github.sh ghp_yourPersonalAccessTokenHere"
  exit 1
fi

REPO="okorotochukwu007-art/TK-AI-MOVIES"
REMOTE_URL="https://${TOKEN}@github.com/${REPO}.git"

echo "Setting remote origin..."
git remote set-url origin "$REMOTE_URL" 2>/dev/null || git remote add origin "$REMOTE_URL"

echo "Pushing branch main to https://github.com/${REPO}..."
git push -u origin main

# Clean up token from remote URL for security
git remote set-url origin "https://github.com/${REPO}.git"

echo "Successfully pushed to https://github.com/${REPO}!"
