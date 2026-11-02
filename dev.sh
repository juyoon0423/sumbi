#!/usr/bin/env bash
# 숨비 로컬 실행: 백엔드(8080) + 프론트(5173)를 한 번에 띄운다. Ctrl+C 로 둘 다 종료.
#   ./dev.sh            둘 다
#   ./dev.sh backend    백엔드만
#   ./dev.sh frontend   프론트만 (서버가 없으면 혼자 하는 바다로 동작)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
WHAT="${1:-all}"

# 끝낼 때 이 스크립트가 띄운 프로세스 전부 정리
trap 'trap - EXIT INT TERM; kill 0 2>/dev/null || true' EXIT INT TERM

# Java 21 (macOS 면 자동으로 찾음)
if [[ -z "${JAVA_HOME:-}" && -x /usr/libexec/java_home ]]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  export JAVA_HOME
fi

# 오늘의 바다 집계용 Redis: 이미 켜져 있으면 그대로, 설치돼 있으면 띄움(데이터는 .redis/), 없으면 서버가 메모리 집계로 동작
start_redis() {
  [[ -n "${SUMBI_REDIS_URL:-}" ]] && return   # 다른 Redis 를 지정했으면 건드리지 않음
  if command -v redis-cli >/dev/null && redis-cli -p 6379 ping >/dev/null 2>&1; then
    echo "✓ Redis 이미 실행 중 (6379)"
    return
  fi
  if ! command -v redis-server >/dev/null; then
    echo "· Redis 없음 → 오늘의 바다는 메모리 집계 (설치: brew install redis)"
    return
  fi
  mkdir -p "$ROOT/.redis"
  echo "▶ Redis 시작 (6379, 데이터 .redis/)"
  redis-server --port 6379 --bind 127.0.0.1 --dir "$ROOT/.redis" --save "60 1" --appendonly no --loglevel warning &
  for _ in $(seq 1 20); do
    redis-cli -p 6379 ping >/dev/null 2>&1 && return
    sleep 0.2
  done
  echo "✗ Redis 가 뜨지 않음 → 메모리 집계로 계속" >&2
}

start_backend() {
  start_redis
  echo "▶ 백엔드 시작 (http://localhost:8080, WebSocket /ws)"
  (cd "$ROOT/backend" && ./gradlew bootRun -q) &
  for _ in $(seq 1 90); do
    if curl -sf http://localhost:8080/health >/dev/null; then
      echo "✓ 백엔드 준비됨"
      return
    fi
    sleep 1
  done
  echo "✗ 백엔드가 90초 안에 뜨지 않았어요 (Java 21 이 있는지 확인)" >&2
  exit 1
}

start_frontend() {
  echo "▶ 프론트 시작 (http://localhost:5173)"
  cd "$ROOT/frontend"
  [[ -d node_modules ]] || npm install
  npm run dev &
}

case "$WHAT" in
  backend) start_backend ;;
  frontend) start_frontend ;;
  *) start_backend; start_frontend ;;
esac
wait
