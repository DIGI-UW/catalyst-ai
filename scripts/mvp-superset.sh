#!/usr/bin/env bash
# Explicit local operator boundary for Catalyst-owned Superset state.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
ENV_FILE="${ROOT_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  ENV_FILE="${ROOT_DIR}/env.recommended"
fi

compose=(docker compose --env-file "${ENV_FILE}" -f "${ROOT_DIR}/docker-compose.mvp.yml")
compose_override_file="${MVP_COMPOSE_OVERRIDE_FILE:-}"
if [ -n "${compose_override_file}" ]; then
  if [ ! -f "${compose_override_file}" ]; then
    echo "ERROR: compose override file does not exist: ${compose_override_file}" >&2
    exit 1
  fi
  compose+=(-f "${compose_override_file}")
fi
compose+=(--profile superset-import)

# Import receipts are durable evidence. Record the exact Catalyst source that
# produced them rather than an ambiguous worktree label.
catalyst_revision="$(git -C "${ROOT_DIR}" rev-parse --verify HEAD)"
if ! [[ "${catalyst_revision}" =~ ^[a-f0-9]{40}$ ]]; then
  echo "ERROR: unable to resolve an exact Catalyst revision for Superset import" >&2
  exit 1
fi
export CATALYST_IMPORTER_REVISION="${catalyst_revision}"

usage() {
  echo "Usage: scripts/mvp-superset.sh {status|import|reset}" >&2
}

require_running_configuration() {
  local service="$1" container state owner configured_service expected_hash actual_hash
  container="$("${compose[@]}" ps -q "${service}")"
  if [ -z "${container}" ]; then
    echo "ERROR: ${service} is not running. Start and check the stack through its lifecycle wrapper before importing." >&2
    exit 1
  fi
  state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "${container}")"
  if [ "${state}" != "running healthy" ]; then
    echo "ERROR: ${service} is not ready (${state}). Check the stack through its lifecycle wrapper before importing." >&2
    exit 1
  fi
  owner="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "${container}")"
  if [ "${owner}" != "${ROOT_DIR}" ]; then
    echo "ERROR: ${service} belongs to another checkout. Run the import from the checkout owning the running stack." >&2
    exit 1
  fi
  read -r configured_service expected_hash <<< "$("${compose[@]}" config --hash "${service}")"
  actual_hash="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "${container}")"
  if [ "${configured_service}" != "${service}" ] || [ -z "${expected_hash}" ] || [ "${expected_hash}" != "${actual_hash}" ]; then
    echo "ERROR: ${service} configuration differs from the running stack. Retry with its existing settings; use the lifecycle wrapper explicitly to apply intentional changes." >&2
    exit 1
  fi
}

case "${1:-}" in
  status)
    "${compose[@]}" ps superset superset-metadata-db
    # Status reads only the outbox and receipt mounts. It must not start or
    # recreate the application, analytics, or metadata services.
    "${compose[@]}" run --rm --no-deps superset-importer status
    ;;
  import)
    # Import must never recreate services from ambient settings (for example,
    # a standalone SUPERSET_PORT exported into an isolated recording process).
    require_running_configuration spark-thriftserver
    require_running_configuration superset
    "${compose[@]}" run --rm --no-deps superset-importer import
    ;;
  reset)
    echo "ERROR: reset requires the validated last-verified importer implementation" >&2
    exit 3
    ;;
  *)
    usage
    exit 2
    ;;
esac
