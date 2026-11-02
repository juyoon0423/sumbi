# 숨비

웹 3D 해녀 힐링 공간. 기획 문서는 [docs/PLAN.md](docs/PLAN.md).

## 구조

```
frontend/   Vite + React + TypeScript + React Three Fiber
backend/    Spring Boot 3 + Java 21 + Gradle (순수 WebSocket JSON)
docs/       기획·진행 현황·문제 해결 기록
dev.sh      백엔드 + 프론트 한 번에 실행
```

## 로컬 실행

필요: Node.js 20 이상, Java 21 (Gradle 은 `backend/gradlew` 가 알아서 받음)

```bash
./dev.sh             # 백엔드(8080) + 프론트(5173) 한 번에, Ctrl+C 로 둘 다 종료
./dev.sh backend     # 백엔드만
./dev.sh frontend    # 프론트만 (서버가 없으면 혼자 하는 바다로 동작)
```

브라우저에서 http://localhost:5173 을 열고 "바다로 들어가기"를 누르세요. 창을 여러 개 열면(시크릿 창 등 저장소가 다른 창) 서로의 해녀가 보입니다.

따로 실행하려면:

```bash
cd backend && ./gradlew bootRun     # 백엔드 (JAVA_HOME 이 Java 21 이어야 함)
cd frontend && npm install && npm run dev
```

### 백엔드

| 명령 (backend/) | 설명 |
|---|---|
| `./gradlew bootRun` | 서버 실행 (http://localhost:8080, WebSocket `/ws`, 상태 `/health`) |
| `./gradlew test` | 단위 테스트 + WebSocket 통합 테스트 |
| `./gradlew bootJar` | 배포용 jar (`build/libs/sumbi-backend.jar`) |

설정은 `backend/src/main/resources/application.yml`, 환경변수로 덮어쓰기:

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 8080 | 서버 포트 |
| `SUMBI_ALLOWED_ORIGINS` | `http://localhost:*,http://127.0.0.1:*` | 접속을 허용할 프론트 주소 (쉼표로 여러 개, `*` 패턴 가능) |
| `SUMBI_ROOM_CAPACITY` | 50 | 한 바다 최대 인원 |
| `SUMBI_MAX_TOTAL` | 500 | 전체 동시 접속 상한 (넘으면 대기) |
| `SUMBI_HEARTBEAT_TIMEOUT_MS` | 30000 | 이 시간 동안 메시지가 없으면 연결 정리 |
| `SUMBI_RECONNECT_GRACE_MS` | 20000 | 잠깐 끊겼을 때 같은 해녀로 돌아올 수 있는 시간 |

### 프론트엔드

서버 주소는 `VITE_WS_URL` (`frontend/.env.example` 참고). 비워 두면 개발 모드에선 `ws://<지금 호스트>:8080/ws`, 접속에 실패하면 혼자 하는 바다로 자동 전환합니다.

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (코드 수정 시 자동 반영) |
| `npm run build` | 배포용 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | 린트 |

## 조작

| PC | 동작 |
|---|---|
| WASD / 방향키 | 수면·물속 이동 (카메라 기준) |
| Space 누르고 있기 | 잠수. 떼면 상승 |
| 1 | 손 흔들어 인사 |
| 🎨 (오른쪽 위) | 해녀 꾸미기 (수면에 있을 때) |
| 마우스 드래그 / 휠 | 시점 회전 / 줌 |

## 개발 메모

- 서버에 연결되면 같은 바다의 다른 해녀들이 보입니다. 서버에 못 붙으면 혼자 하는 바다(`OfflineNetClient`)로 바뀌고, 개발 모드에서만 가짜 이웃의 행동 알림·숨비소리를 흉내냅니다.
- 멀티플레이 확인: 백엔드·프론트를 켠 상태에서 `node scripts/capture-multiplayer.mjs <출력폴더>` (frontend/) — 브라우저 3개로 서로 보이기·움직임·잠수·테왁·토스트·퇴장을 자동 확인
- 소리 파일 교체: `frontend/public/sounds/README.md`
- 개발 모드 브라우저 콘솔에서 `window.__sumbi`로 플레이어·해산물 상태를 볼 수 있습니다.
- 캐릭터 랩: 개발 서버에서 http://localhost:5173/dev/character — 동작·표정·닉네임별 외형을 나란히 봅니다. `?solo=sumbi&t=0.6`처럼 하나를 크게, 한 순간에 고정할 수 있습니다.
- 화면 캡처: 개발 서버를 켠 상태에서 `npm run capture` → `docs/screenshots/latest/` (설치된 Chrome을 Playwright로 사용)
- 잠수 동작 연속 캡처(0.1초 간격, 옆·뒤): `node scripts/capture-dive.mjs <출력폴더>`
- 꾸미기 화면 캡처: `node scripts/capture-customize.mjs <출력폴더>` (데스크톱·모바일 세로, 처음/다시 방문, 바다 속 🎨 메뉴)
- 브라우저 저장소(localStorage)를 지우면 꾸민 해녀(닉네임·색)·바구니·볼륨 설정이 초기화됩니다.
