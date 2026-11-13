#!/usr/bin/env bash
# Build, then publish dist/ to the gh-pages branch that Pages serves.
#
#   bash scripts/deploy.sh
#
# The peer site is published from the repository itself (jsDelivr and
# raw.githubusercontent), so this only has to handle the main bundle.
set -euo pipefail

REPO_SLUG="hkmpn9s6dh-commits/hackathon-2026-saddle-and-spoke"
TOKEN="${GH_TOKEN:-$(gh auth token)}"
if [ -z "$TOKEN" ]; then
  echo "No GitHub token. Set GH_TOKEN or run 'gh auth login'." >&2
  exit 1
fi

npm run build

touch dist/.nojekyll

cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="Saddle & Spoke" -c user.email="build@example.invalid" commit -q -m "Publish the site"
git push -f "https://x-access-token:${TOKEN}@github.com/${REPO_SLUG}.git" gh-pages:gh-pages
rm -rf .git

echo "pushed gh-pages; Pages will rebuild at https://hkmpn9s6dh-commits.github.io/hackathon-2026-saddle-and-spoke/"
