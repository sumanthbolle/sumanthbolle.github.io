#!/usr/bin/env bash
# Commit generated data and push it, surviving concurrent writers.
#
#   scripts/upsc/push-with-retry.sh -m "commit message" [-r "regenerate command"] -- path [path ...]
#
# Stages the paths and commits once. Then up to 5 push attempts. When the push
# is rejected: fetch and rebase onto origin/$REF. When the rebase conflicts:
# abort it, start again from origin/$REF, take this run's version of every file
# it changed (other writers' files stay as they are on the remote), run the
# optional regenerate command so derived files (indexes, sitemap) reflect both
# sides, stage the paths again and recommit.
#
# REF defaults to $GITHUB_REF_NAME. Exits 0 when there is nothing to commit.
set -euo pipefail

message=""
regenerate=""
while [ $# -gt 0 ]; do
  case "$1" in
    -m) message="$2"; shift 2 ;;
    -r) regenerate="$2"; shift 2 ;;
    --) shift; break ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$message" ] || [ $# -eq 0 ]; then
  echo "usage: $0 -m message [-r command] -- path [path ...]" >&2
  exit 2
fi
paths=("$@")
ref="${REF:-${GITHUB_REF_NAME:-}}"
if [ -z "$ref" ]; then
  echo "REF or GITHUB_REF_NAME must name the branch to push" >&2
  exit 2
fi
attempts="${PUSH_ATTEMPTS:-5}"
pause="${PUSH_PAUSE_SECONDS:-5}"

stage() {
  git add -A -- "${paths[@]}"
}

stage
if git diff --cached --quiet; then
  echo "No changes to commit"
  exit 0
fi
git commit -q -m "$message"

if [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo false)" = "true" ]; then
  git fetch -q --unshallow origin "$ref" || true
fi

rebuild_from_remote() {
  local saved base changed file
  saved="$(git rev-parse HEAD)"
  base="$(git merge-base "$saved" "origin/$ref")"
  changed="$(git diff --name-only "$base" "$saved")"
  git reset -q --hard "origin/$ref"
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if git cat-file -e "$saved:$file" 2>/dev/null; then
      mkdir -p "$(dirname "$file")"
      git show "$saved:$file" > "$file"
    else
      rm -f -- "$file"
    fi
  done <<< "$changed"
  if [ -n "$regenerate" ]; then
    echo "Regenerating derived files: $regenerate"
    bash -c "$regenerate"
  fi
  stage
  if git diff --cached --quiet; then
    echo "Nothing left to commit after merging with origin/$ref"
    return 1
  fi
  git commit -q -m "$message"
}

for attempt in $(seq 1 "$attempts"); do
  if git push -q origin "HEAD:$ref"; then
    echo "Pushed on attempt $attempt"
    exit 0
  fi
  echo "Push rejected (attempt $attempt); updating from origin/$ref"
  git fetch -q origin "$ref"
  if ! git rebase -q "origin/$ref"; then
    git rebase --abort
    echo "Rebase conflicted; rebuilding this run's changes on origin/$ref"
    if ! rebuild_from_remote; then
      exit 0
    fi
  fi
  sleep $((attempt * pause))
done
echo "::error::Could not push to $ref after $attempts attempts."
exit 1
