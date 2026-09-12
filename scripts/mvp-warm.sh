#!/usr/bin/env bash
# Prime each configured source's real writer prefix after services are healthy.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
  ENV_FILE="${ROOT_DIR}/env.recommended"
fi

compose=(docker compose --env-file "${ENV_FILE}" -f "${ROOT_DIR}/docker-compose.mvp.yml")
if [ -n "${MVP_COMPOSE_OVERRIDE_FILE:-}" ]; then
  compose+=(-f "${MVP_COMPOSE_OVERRIDE_FILE}")
fi

"${compose[@]}" exec -T catalyst-gateway uv run python -m src.warmup
