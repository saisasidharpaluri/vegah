#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.production"
COMPOSE_FILE="$ROOT/docker-compose.yml"
NEW_TAG="${1:-}"

if [[ ! "$NEW_TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a full 40-character commit SHA" >&2
  exit 2
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production environment file: $ENV_FILE" >&2
  exit 2
fi

OLD_TAG="$(grep '^IMAGE_TAG=' "$ENV_FILE" | cut -d= -f2- || true)"
IMAGE_PREFIX="$(grep '^IMAGE_PREFIX=' "$ENV_FILE" | cut -d= -f2-)"
AWS_REGION="$(grep '^AWS_REGION=' "$ENV_FILE" | cut -d= -f2-)"
set_image_tag() {
  local tag="$1" tmp
  tmp="$(mktemp)"
  grep -v '^IMAGE_TAG=' "$ENV_FILE" > "$tmp"
  printf 'IMAGE_TAG=%s\n' "$tag" >> "$tmp"
  chmod 0600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

health_check() {
  for _ in $(seq 1 30); do
    if curl --fail --silent --show-error http://127.0.0.1/health/ready >/dev/null; then return 0; fi
    sleep 3
  done
  return 1
}

cd "$ROOT"
REGISTRY="${IMAGE_PREFIX%%/*}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
set_image_tag "$NEW_TAG"
if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull \
  && docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-build \
  && health_check; then
  echo "Deployment $NEW_TAG is healthy"
  exit 0
fi

echo "Deployment $NEW_TAG failed; restoring ${OLD_TAG:-unknown}" >&2
if [[ -n "$OLD_TAG" ]]; then
  set_image_tag "$OLD_TAG"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull || true
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-build || true
  health_check || true
fi
exit 1
