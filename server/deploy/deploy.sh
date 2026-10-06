#!/usr/bin/env bash
# Deploys the game server on the host (Ubuntu with Docker and the devstack nginx).
#
#   deploy.sh          pull main from GitHub, build (the build runs the tests), restart, check health
#   deploy.sh cert     get the Let's Encrypt certificate for the site and install the nginx site
#
# Layout: /opt/zanis-games/repo (clone), /opt/zanis-games/.env (600, dashboard account),
# /opt/zanis-games/certs (certificate), Docker volume zanis-games-data (database and cookie keys).
set -euo pipefail
ROOT=/opt/zanis-games
NAME=zgp.game.aliizz.ir
REPO="$ROOT/repo"
COMPOSE=(docker compose -f "$REPO/server/deploy/docker-compose.yml")

if [ "${1:-}" = cert ]; then
  ACME="$HOME/.acme.sh/acme.sh"
  mkdir -p "$ROOT/certs"
  # Port 80 of the host already answers /.well-known/acme-challenge/ from /var/www/acme.
  "$ACME" --issue --server letsencrypt -d "$NAME" -w /var/www/acme --keylength ec-256 || [ $? -eq 2 ]
  sudo install -m 644 "$REPO/server/deploy/zanis-games.nginx.conf" /etc/nginx/conf.d/zanis-games.conf
  "$ACME" --install-cert -d "$NAME" --ecc \
    --fullchain-file "$ROOT/certs/fullchain.cer" \
    --key-file "$ROOT/certs/key.pem" \
    --reloadcmd "sudo nginx -t && sudo systemctl reload nginx"
  exit 0
fi

git -C "$REPO" fetch --quiet origin main
git -C "$REPO" reset --quiet --hard origin/main
echo "deploying $(git -C "$REPO" log -1 --format='%h %s')"
"${COMPOSE[@]}" build --pull
"${COMPOSE[@]}" up -d
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:18300/healthz >/dev/null; then
    echo "healthy"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 2
done
echo "the server did not become healthy"; "${COMPOSE[@]}" logs --tail 50; exit 1
