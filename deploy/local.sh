#!/usr/bin/env bash
# 로컬에서 운영과 같은 구성(nginx + blue/green + redis)을 띄워 확인. http://localhost:8090
#   ./local.sh up       백엔드 이미지 빌드 + 띄우기 (프론트는 VITE_WS_URL=ws://localhost:8090/ws npm run dev)
#   ./local.sh switch   이미지를 다시 빌드해 반대 색으로 배포 (접속 중인 화면이 1012 → 다시 붙는지 확인)
#   ./local.sh down     전부 내리기
#   ./local.sh cap 5    동시접속 상한을 바로 바꾸기 (cap off = 기본값으로, cap = 지금 값)
set -euo pipefail
cd "$(dirname "$0")"
export COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml
export SUMBI_STATE=.env.local SUMBI_SKIP_PULL=1 SUMBI_LOCAL=1
dc() { docker compose --env-file "$SUMBI_STATE" "$@"; }
touch "$SUMBI_STATE"
grep -q '^SUMBI_IMAGE=' "$SUMBI_STATE" || echo 'SUMBI_IMAGE=sumbi-backend' >> "$SUMBI_STATE"

build() {
  local tag="local-$(date +%H%M%S)"
  docker build -t "sumbi-backend:$tag" ../backend >&2
  echo "$tag"
}

case "${1:-}" in
  up | switch) ./deploy.sh "$(build)" ;;
  down) dc down ;;
  cap) shift; ./cap.sh "$@" ;;
  ps) dc ps ;;
  logs) dc logs -f --tail 50 ;;
  *) echo "사용법: ./local.sh up | switch | down | cap [숫자|off] | ps | logs"; exit 1 ;;
esac
