# 숨비 (Sumbi)

웹 3D 제주 해녀 힐링 공간. 가입 없이 들어와 물질하고, 불턱에서 함께 쉰다. 경쟁·랭킹·채팅 없음.
기획 전체: [docs/PLAN.md](docs/PLAN.md)

## 시작 전에 꼭

1. **새 세션을 시작하면 [docs/progress.md](docs/progress.md)의 "다음 할 일"부터 확인한다** (그다음 현재 상태·미완성 작업·결정 기록). 작업 전에 PLAN.md 의 해당 장도 읽는다.
2. 문제가 생기면 [docs/troubleshooting.md](docs/troubleshooting.md)에 비슷한 사례가 있는지 본다.

## 로컬 실행

```bash
./dev.sh                                    # 백엔드(8080) + 프론트(5173) 한 번에 (backend / frontend 로 하나만)
cd backend && ./gradlew test                # 백엔드 테스트 (Java 21: JAVA_HOME=$(/usr/libexec/java_home -v 21))
cd frontend && npm run build && npm run lint  # 타입 검사 + 빌드, oxlint
```

- 환경변수·설정은 README "로컬 실행" 참고 (`SUMBI_*`, `VITE_WS_URL`). 서버가 없으면 프론트는 혼자 하는 바다로 자동 전환.
- `./dev.sh` 는 Redis 가 설치돼 있으면 함께 띄움(`.redis/`, 커밋 안 함), 없으면 메모리 집계. Ctrl+C 로 전부 종료.
- 개발용: `/dev/character` (캐릭터 랩), 브라우저 콘솔 `window.__sumbi` (플레이어·카메라·해산물·원격 해녀·게임 스토어·불턱·`setTime('night')`·`float.start()`·`gulls()`·`shootingStar()`·`dolphin()`·`turtle()`·`friends`), 시간대 고정 `?time=dawn|day|sunset|night` 또는 `?hour=5.6`, `?quality=high|medium|low`, `?event=dolphin|turtle` (바다 친구 바로 부르기, 개발 빌드만), `?debug=1` (fps·품질 표시)
- 휴대폰 확인: 같은 와이파이에서 `./dev.sh` 가 찍어 주는 `http://<내부 IP>:5173/?debug=1`
- 백엔드를 끄고 켤 때 `lsof -ti tcp:8080 -sTCP:LISTEN` 으로 서버 프로세스만 고를 것 (그냥 `tcp:8080` 은 연결된 브라우저까지 잡음)
- **배포**: [docs/deploy.md](docs/deploy.md). 운영 구성 로컬 확인은 `cd deploy && ./local.sh up` (Docker Desktop, http://localhost:8090) → 프론트는 `VITE_WS_URL=ws://localhost:8090/ws npx vite --port 5174`, 끝나면 `./local.sh down`. 동시접속 상한: `./local.sh cap 5` (운영 `deploy/cap.sh`)
- 비밀(웹훅·인증서·토큰)은 서버 `deploy/backend.env`·`deploy/data/` 에만. 저장소·채팅에 남기지 않음

## 작업 규칙

- **화면이 바뀌는 작업은 Playwright로 직접 캡처해서 눈으로 확인**한다 (개발 서버를 켠 상태에서).
  - `npm run capture` (게임·캐릭터 랩) · `node scripts/capture-dive.mjs <폴더>` (잠수 연속) · `node scripts/capture-customize.mjs <폴더>` (꾸미기) · `node scripts/capture-multiplayer.mjs <폴더>` (브라우저 3개 멀티플레이, 백엔드 필요)
  - 4단계: `capture-bulteok.mjs` (불턱 손질·대야, 백엔드를 `SUMBI_BASIN_CAPACITY=6` 으로) · `capture-time.mjs` (시간대, 백엔드 없어도 됨) · `capture-journal.mjs` (물질 일지)
  - 불턱 자리 옮기기: `capture-bulteok-seat.mjs <폴더> [원본프레임폴더]` (백엔드 필요, 가짜 WebSocket 해녀로 24자리를 채움)
  - 휴대폰 조작: `capture-mobile.mjs <폴더>` (실제 터치 이벤트로 조이스틱·둘러보기·잠수 버튼·두 손가락, HUD 겹침 검사, 세로·가로·데스크톱)
  - 둥둥: `capture-dungdung.mjs <폴더>` (백엔드 필요, 눕기·하늘·일어나기·다른 창·시간대 4개·별똥별·일지·모바일)
  - 대기열: `capture-queue.mjs <폴더>` (백엔드·Redis 필요, Redis 로 상한을 바꿔 대기·자리 카드·입장·상한 올리기. `SUMBI_URL`·`SUMBI_API`·`SUMBI_REDIS_CLI` 로 Docker 구성에도)
  - 바다 친구들: `capture-sea-friends.mjs <폴더> [all|under|approach|turtle|dolphin]` (백엔드 필요, `SUMBI_DEV_EVENTS=true` — dev.sh 기본. 물속 생물 낮/밤·흩어짐·문어·거북·돌고래 브라우저 3개) · `fps-sea-friends.mjs <폴더> <이름>` (휴대폰 크기 fps, `SUMBI_QUALITY=`)
  - 무중단 배포: `capture-deploy-switch.mjs <폴더>` (`deploy/local.sh up` + 5174 프론트, 접속한 채 blue↔green → 1012 → 다시 접속)
  - 설치된 Chrome을 씀 (`channel: 'chrome'`). 확정 캡처는 `docs/screenshots/<주제>/`에 JPEG로 저장 (용량 줄이기).
- **단계(또는 의미 있는 작업)가 끝날 때마다**: 비밀 정보 점검(API 키·비밀번호·토큰·`.env`·키 파일) → 의미 있는 단위로 커밋 → `main`에 push.
- **작업이 끝날 때마다 `docs/progress.md`와 `docs/troubleshooting.md`를 갱신하고, 그 변경도 같은 커밋에 포함**한다.
- 커밋 메시지는 한국어, `feat:` / `fix:` / `docs:` 접두어.
- `main` 은 항상 실행 가능하게: 끝나지 않은 작업은 `wip/<주제>` 브랜치에 커밋한다.
- 하루를 마칠 때: 개발 서버·캡처 스크립트 종료, `git status` 깨끗한지, 로컬과 `origin/main` 이 같은지 확인.
- 서버와 공유하는 값: 닉네임·꾸미기 목록은 `frontend/src/haenyeo/customize.ts` ↔ `backend/.../catalog/CustomizeCatalog.java` (`CustomizeCatalogTest` 가 같은지 확인), 메시지는 `frontend/src/net/protocol.ts` ↔ `backend/.../protocol/`. 바꾸면 PLAN.md 7장도 함께 고친다.
