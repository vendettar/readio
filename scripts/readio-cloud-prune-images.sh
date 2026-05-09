#!/usr/bin/env bash
set -euo pipefail

context=${CLOUD_DOCKER_CONTEXT:-}
image_repo=${IMAGE_REPO:-}
keep_recent=${KEEP_RECENT_IMAGES:-5}
dry_run=${DRY_RUN:-0}

if [[ -z "$context" ]]; then
  printf '%s\n' 'Missing required variable: CLOUD_DOCKER_CONTEXT' >&2
  exit 1
fi

if [[ -z "$image_repo" ]]; then
  printf '%s\n' 'Missing required variable: IMAGE_REPO' >&2
  exit 1
fi

if [[ ! "$keep_recent" =~ ^[0-9]+$ ]]; then
  printf '%s\n' 'KEEP_RECENT_IMAGES must be a non-negative integer.' >&2
  exit 1
fi

preserve_file=$(mktemp)
trap 'rm -f "$preserve_file"' EXIT INT TERM

docker --context "$context" ps --format '{{.Image}}' \
  | awk -v prefix="${image_repo}:" 'index($0, prefix) == 1 { print }' \
  | sort -u > "$preserve_file"

docker --context "$context" image ls "$image_repo" --format '{{.Repository}}:{{.Tag}}' \
  | awk '!/:<none>$/ { print }' \
  | awk -v keep="$keep_recent" 'NR <= keep { print }' >> "$preserve_file"

sort -u "$preserve_file" -o "$preserve_file"

docker --context "$context" image ls "$image_repo" --format '{{.Repository}}:{{.Tag}}' \
  | awk '!/:<none>$/ { print }' \
  | while IFS= read -r image_ref; do
      if grep -Fxq "$image_ref" "$preserve_file"; then
        continue
      fi

      if [[ "$dry_run" == "1" ]]; then
        printf 'docker --context %q image rm %q\n' "$context" "$image_ref"
      else
        docker --context "$context" image rm "$image_ref" || true
      fi
    done
