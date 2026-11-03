#!/usr/bin/env bash
# 동시접속 상한을 서버를 끄지 않고 바꾸기 (5초 안에 반영, 배포·재시작 필요 없음)
#   ./cap.sh          지금 상한·인원·대기 보기
#   ./cap.sh 50       상한을 50명으로
#   ./cap.sh off      Redis 값을 지우고 기본값(backend.env 의 SUMBI_MAX_TOTAL)으로
set -euo pipefail
cd "$(dirname "$0")"
STATE="${SUMBI_STATE:-.env}"
dc() { docker compose --env-file "$STATE" "$@"; }
KEY=sumbi:config:max-total

case "${1:-}" in
  "") ;;
  off) dc exec -T redis redis-cli DEL "$KEY" > /dev/null; echo "상한: 기본값으로 되돌림 (5초 안에 반영)"; sleep 6 ;;
  *[!0-9]*) echo "숫자(0~5000) 또는 off"; exit 1 ;;
  *)
    [ "$1" -le 5000 ] || { echo "5000 이하로"; exit 1; }
    dc exec -T redis redis-cli SET "$KEY" "$1" > /dev/null
    echo "상한: $1 명으로 바꿈 (5초 안에 반영)"
    sleep 6 ;;
esac

ACTIVE="$(grep -E '^ACTIVE=' "$STATE" | tail -1 | cut -d= -f2-)"
echo "Redis 값: $(dc exec -T redis redis-cli GET "$KEY" | sed 's/^$/(없음 → 기본값)/')"
if [ -n "$ACTIVE" ]; then
  echo -n "서버 상태: "
  dc exec -T "backend-$ACTIVE" bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 && printf "GET /health HTTP/1.0\r\n\r\n" >&3 && cat <&3' | tail -1
  echo
fi
