#!/usr/bin/env bash
# Mirrors the CI "tests" job in .github/workflows/pr_check.yml so the full PR
# checklist runs locally inside Docker. Set SKIP_AUDIT=1 to skip the network scan.
set -euo pipefail

export SECRET_KEY="${SECRET_KEY:-ci-test-secret-key-not-for-production-use-32chars}"
export MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"

step() {
  echo
  echo "=================================================================="
  echo ">> $1"
  echo "=================================================================="
}

if [ "${SKIP_AUDIT:-0}" = "1" ]; then
  echo "SKIP_AUDIT=1 — skipping pip-audit"
else
  step "pip-audit — dependency vulnerability scan"
  pip-audit -r requirements.txt
fi

step "ruff — lint (app/ tests/)"
ruff check app/ tests/

step "mypy — type check (app/)"
mypy app/ --ignore-missing-imports

step "pytest — unit tests + 80% coverage gate"
pytest --cov=app --cov-report=term-missing --cov-fail-under=80

echo
echo "All PR checks passed. Safe to open/update the PR."
