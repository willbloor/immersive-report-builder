#!/usr/bin/env bash
set -euo pipefail

EXPECTED_REPO_ROOT="/Users/will.bloor/Documents/app-builder"
EXPECTED_ORIGIN_URL="https://github.com/willbloor/immersive-report-builder.git"
DEFAULT_PROD_URL="https://immersive-report-builder.vercel.app/"
DEFAULT_TIMEOUT_SECONDS=300
POLL_INTERVAL_SECONDS=10

DRY_RUN=0
PROD_URL="$DEFAULT_PROD_URL"
TIMEOUT_SECONDS="$DEFAULT_TIMEOUT_SECONDS"
DEPLOY_SHA="$(git -C "$EXPECTED_REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "<sha>")"

timestamp_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  printf '[go-release] %s\n' "$*"
}

print_usage() {
  cat <<'USAGE'
Usage:
  bash /Users/will.bloor/Documents/app-builder/scripts/go-release.sh [options]

Options:
  --dry-run            Run all preflight checks without pushing or URL polling.
  --url <prod-url>     Production base URL to validate (default: https://immersive-report-builder.vercel.app/).
  --timeout <seconds>  Maximum polling time for live URL checks (default: 300).
  --help               Show this help message.
USAGE
}

print_rollback_guide() {
  cat <<EOF

Rollback guide:
1) Vercel dashboard rollback:
   - Open the project in Vercel and redeploy the last known-good deployment.
2) Git rollback deploy:
   - cd /Users/will.bloor/Documents/app-builder
   - git revert ${DEPLOY_SHA}
   - git push origin main
EOF
}

fail() {
  local message="$1"
  printf '[go-release] ERROR: %s\n' "$message" >&2
  print_rollback_guide >&2
  exit 1
}

require_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "Required command not found: $cmd"
}

get_http_code() {
  local url="$1"
  local code
  code="$(curl -L -sS -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
  if [[ -z "$code" ]]; then
    code="000"
  fi
  printf '%s' "$code"
}

is_positive_integer() {
  [[ "$1" =~ ^[0-9]+$ ]] && [[ "$1" -gt 0 ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --url)
      [[ $# -ge 2 ]] || fail "--url requires a value"
      PROD_URL="$2"
      shift 2
      ;;
    --timeout)
      [[ $# -ge 2 ]] || fail "--timeout requires a value"
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

require_command git
require_command curl
require_command python3

if ! is_positive_integer "$TIMEOUT_SECONDS"; then
  fail "--timeout must be a positive integer (seconds), got: $TIMEOUT_SECONDS"
fi

if ! REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  fail "Not inside a git repository."
fi
if [[ "$REPO_ROOT" != "$EXPECTED_REPO_ROOT" ]]; then
  fail "Repo root mismatch. Expected: $EXPECTED_REPO_ROOT, got: $REPO_ROOT"
fi

cd "$EXPECTED_REPO_ROOT"

ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
if [[ "$ORIGIN_URL" != "$EXPECTED_ORIGIN_URL" ]]; then
  fail "origin URL mismatch. Expected: $EXPECTED_ORIGIN_URL, got: ${ORIGIN_URL:-<missing>}"
fi

BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH_NAME" != "main" ]]; then
  fail "Release is only allowed from branch 'main'. Current branch: $BRANCH_NAME"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  fail "Working tree is not clean. Commit, stash, or discard changes before release."
fi

log "Fetching origin/main..."
if ! git fetch origin main --quiet; then
  fail "git fetch origin main failed."
fi

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"
DEPLOY_SHA="$(git rev-parse --short HEAD)"

if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]] && git merge-base --is-ancestor "$LOCAL_SHA" "$REMOTE_SHA"; then
  fail "Local main is behind origin/main. Pull/rebase before release."
fi

if [[ ! -f "vercel.json" ]]; then
  fail "Missing vercel.json in repo root."
fi
if ! python3 -m json.tool "vercel.json" >/dev/null 2>&1; then
  fail "vercel.json is invalid JSON."
fi

if [[ ! -f "index.html" ]]; then
  fail "Missing index.html in repo root."
fi

log "Preflight checks passed at $(timestamp_utc)"
log "Commit: $DEPLOY_SHA"
log "Production URL: $PROD_URL"

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "Dry run enabled. Skipping git push and live URL polling."
  exit 0
fi

log "Pushing main to origin..."
if ! git push origin main; then
  fail "git push origin main failed."
fi

BASE_URL="${PROD_URL%/}"
ROOT_URL="$BASE_URL/"
INDEX_URL="$BASE_URL/Index.html"

deadline=$((SECONDS + TIMEOUT_SECONDS))
last_root_code="000"
last_index_code="000"

log "Polling production URLs every ${POLL_INTERVAL_SECONDS}s for up to ${TIMEOUT_SECONDS}s..."
while (( SECONDS <= deadline )); do
  last_root_code="$(get_http_code "$ROOT_URL")"
  last_index_code="$(get_http_code "$INDEX_URL")"

  log "Check root=$last_root_code index=$last_index_code"

  if [[ "$last_root_code" == "200" && "$last_index_code" == "200" ]]; then
    log "Release succeeded."
    log "Timestamp: $(timestamp_utc)"
    log "Commit: $DEPLOY_SHA"
    log "Validated URLs:"
    log "  $ROOT_URL -> 200"
    log "  $INDEX_URL -> 200"
    exit 0
  fi

  sleep "$POLL_INTERVAL_SECONDS"
done

fail "Post-deploy URL validation failed before timeout. root=${last_root_code}, index=${last_index_code}"
