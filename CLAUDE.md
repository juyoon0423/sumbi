# 숨비 (Sumbi)

웹 3D 제주 해녀 힐링 공간. 가입 없이 들어와 물질하고, 불턱에서 함께 쉰다. 경쟁·랭킹·채팅 없음.
기획 전체: [docs/PLAN.md](docs/PLAN.md)

## 시작 전에 꼭

1. **작업을 시작하기 전에 [docs/progress.md](docs/progress.md)를 먼저 읽는다** (현재 상태, 다음 할 일, 결정 기록).
2. 문제가 생기면 [docs/troubleshooting.md](docs/troubleshooting.md)에 비슷한 사례가 있는지 본다.

## 로컬 실행

```bash
./dev.sh                                    # 백엔드(8080) + 프론트(5173) 한 번에 (backend / frontend 로 하나만)
cd backend && ./gradlew test                # 백엔드 테스트 (Java 21: JAVA_HOME=$(/usr/libexec/java_home -v 21))
cd frontend && npm run build && npm run lint  # 타입 검사 + 빌드, oxlint
```

- 환경변수·설정은 README "로컬 실행" 참고 (`SUMBI_*`, `VITE_WS_URL`). 서버가 없으면 프론트는 혼자 하는 바다로 자동 전환.
- 개발용: `/dev/character` (캐릭터 랩), 브라우저 콘솔 `window.__sumbi` (플레이어·카메라·해산물·원격 해녀·게임 스토어·불턱·`setTime('night')`·`float.start()`·`gulls()`·`shootingStar()`), 시간대 고정 `?time=dawn|day|sunset|night`
- 백엔드를 끄고 켤 때 `lsof -ti tcp:8080 -sTCP:LISTEN` 으로 서버 프로세스만 고를 것 (그냥 `tcp:8080` 은 연결된 브라우저까지 잡음)

## 작업 규칙

- **화면이 바뀌는 작업은 Playwright로 직접 캡처해서 눈으로 확인**한다 (개발 서버를 켠 상태에서).
  - `npm run capture` (게임·캐릭터 랩) · `node scripts/capture-dive.mjs <폴더>` (잠수 연속) · `node scripts/capture-customize.mjs <폴더>` (꾸미기) · `node scripts/capture-multiplayer.mjs <폴더>` (브라우저 3개 멀티플레이, 백엔드 필요)
  - 4단계: `capture-bulteok.mjs` (불턱 손질·대야, 백엔드를 `SUMBI_BASIN_CAPACITY=6` 으로) · `capture-time.mjs` (시간대, 백엔드 없어도 됨) · `capture-journal.mjs` (물질 일지)
  - 불턱 자리 옮기기: `capture-bulteok-seat.mjs <폴더> [원본프레임폴더]` (백엔드 필요, 가짜 WebSocket 해녀로 24자리를 채움)
  - 둥둥: `capture-dungdung.mjs <폴더>` (백엔드 필요, 눕기·하늘·일어나기·다른 창·시간대 4개·별똥별·일지·모바일)
  - 설치된 Chrome을 씀 (`channel: 'chrome'`). 확정 캡처는 `docs/screenshots/<주제>/`에 JPEG로 저장 (용량 줄이기).
- **단계(또는 의미 있는 작업)가 끝날 때마다**: 비밀 정보 점검(API 키·비밀번호·토큰·`.env`·키 파일) → 의미 있는 단위로 커밋 → `main`에 push.
- **작업이 끝날 때마다 `docs/progress.md`와 `docs/troubleshooting.md`를 갱신하고, 그 변경도 같은 커밋에 포함**한다.
- 커밋 메시지는 한국어, `feat:` / `fix:` / `docs:` 접두어.
- 서버와 공유하는 값: 닉네임·꾸미기 목록은 `frontend/src/haenyeo/customize.ts` ↔ `backend/.../catalog/CustomizeCatalog.java` (`CustomizeCatalogTest` 가 같은지 확인), 메시지는 `frontend/src/net/protocol.ts` ↔ `backend/.../protocol/`. 바꾸면 PLAN.md 7장도 함께 고친다.
