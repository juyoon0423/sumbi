#!/usr/bin/env bash
# 무중단 배포: 쉬고 있는 색(blue/green)에 새 이미지를 띄우고 → 건강 확인 → nginx 를 그쪽으로 → 이전 색을 멈춤.
# 이전 색이 멈출 때 접속자는 1012(서버 재시작) 신호를 받고 몇 초 안에 새 서버로 다시 붙음.
#
#   ./deploy.sh <이미지 태그>     예) ./deploy.sh sha-1a2b3c4
#   되돌리기 = 이전 태그로 다시 ./deploy.sh (끝날 때 이전 태그를 알려 줌)
#
# 환경변수: SUMBI_STATE (기본 .env) · SUMBI_SKIP_PULL=1 (로컬 이미지 그대로) · SUMBI_LOCAL=1 (로컬 확인용)
set -euo pipefail
cd "$(dirname "$0")"

TAG="${1:-}"
if [[ ! "$TAG" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "사용법: ./deploy.sh <이미지 태그>  (예: sha-1a2b3c4)"
  exit 1
fi
STATE="${SUMBI_STATE:-.env}"
dc() { docker compose --env-file "$STATE" "$@"; }

mkdir -p data/nginx data/certs data/redis
touch "$STATE"
get() { grep -E "^$1=" "$STATE" | tail -1 | cut -d= -f2- || true; }
put() {
  if grep -qE "^$1=" "$STATE"; then sed -i.bak "s|^$1=.*|$1=$2|" "$STATE" && rm -f "$STATE.bak"
  else echo "$1=$2" >> "$STATE"; fi
}

if [ -z "${SUMBI_LOCAL:-}" ]; then
  [ -f backend.env ] || { echo "backend.env 가 없어요 (backend.env.example 을 복사해 채우기)"; exit 1; }
  [ -f data/certs/origin.pem ] && [ -f data/certs/origin.key ] || { echo "data/certs/origin.pem, origin.key 가 없어요 (Cloudflare Origin 인증서)"; exit 1; }
fi

ACTIVE="$(get ACTIVE)"
if [ "$ACTIVE" = "blue" ]; then NEXT=green; NEXT_VAR=GREEN_TAG; OLD_VAR=BLUE_TAG
else NEXT=blue; NEXT_VAR=BLUE_TAG; OLD_VAR=GREEN_TAG; fi
PREV_TAG="$(get "$OLD_VAR")"
echo "▶ $TAG 를 backend-$NEXT 에 배포 (지금: ${ACTIVE:-없음}${PREV_TAG:+ / $PREV_TAG})"

put "$NEXT_VAR" "$TAG"
[ -n "${SUMBI_SKIP_PULL:-}" ] || dc pull "backend-$NEXT"
dc up -d redis
dc up -d --force-recreate "backend-$NEXT"

# 건강 확인: 컨테이너 안에서 /health (이미지에 curl 이 없어 bash 의 /dev/tcp 로)
echo -n "▶ backend-$NEXT 건강 확인 "
ok=""
for _ in $(seq 1 60); do
  if dc exec -T "backend-$NEXT" bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 && printf "GET /health HTTP/1.0\r\n\r\n" >&3 && cat <&3' 2>/dev/null | grep -q '"status":"ok"'; then
    ok=1; break
  fi
  echo -n "."; sleep 2
done
echo
if [ -z "$ok" ]; then
  echo "✗ 새 서버가 건강하지 않아요. 이전 서버(${ACTIVE:-없음})를 그대로 둡니다. 로그:"
  dc logs --tail 60 "backend-$NEXT" || true
  dc stop "backend-$NEXT" || true
  exit 1
fi

# nginx 를 새 색으로
UP=data/nginx/upstream.conf
[ -f "$UP" ] && cp "$UP" "$UP.prev"
printf 'upstream sumbi_backend {\n    server backend-%s:8080;\n}\n' "$NEXT" > "$UP"
if [ -n "$(dc ps -q --status running nginx 2>/dev/null)" ]; then
  if ! dc exec -T nginx nginx -t -q; then
    echo "✗ nginx 설정 오류: 이전 설정으로 되돌려요"
    [ -f "$UP.prev" ] && mv "$UP.prev" "$UP"
    dc stop "backend-$NEXT" || true
    exit 1
  fi
  dc exec -T nginx nginx -s reload
else
  dc up -d nginx
fi
put ACTIVE "$NEXT"
echo "▶ nginx → backend-$NEXT"

# 이전 색 멈추기: 접속자에게 1012 → 새 서버로 다시 붙음
if [ -n "$ACTIVE" ] && [ "$ACTIVE" != "$NEXT" ]; then
  sleep 2
  dc stop -t 20 "backend-$ACTIVE"
  echo "▶ backend-$ACTIVE 멈춤"
fi

echo "✓ 배포 끝: $TAG (backend-$NEXT)"
[ -n "$PREV_TAG" ] && echo "  되돌리려면: ./deploy.sh $PREV_TAG"
exit 0
