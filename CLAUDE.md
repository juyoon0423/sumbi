# 숨비 (Sumbi)

웹 3D 제주 해녀 힐링 공간. 가입 없이 들어와 물질하고, 불턱에서 함께 쉰다. 경쟁·랭킹·채팅 없음.
기획 전체: [docs/PLAN.md](docs/PLAN.md)

## 시작 전에 꼭

1. **작업을 시작하기 전에 [docs/progress.md](docs/progress.md)를 먼저 읽는다** (현재 상태, 다음 할 일, 결정 기록).
2. 문제가 생기면 [docs/troubleshooting.md](docs/troubleshooting.md)에 비슷한 사례가 있는지 본다.

## 로컬 실행

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
npm run build                               # 타입 검사 + 빌드
npm run lint                                # oxlint
```

- 백엔드(Spring Boot, `backend/`)는 3단계에서 추가 예정. 추가되면 여기에 실행 방법을 적는다.
- 개발용: `/dev/character` (캐릭터 랩), 브라우저 콘솔 `window.__sumbi` (플레이어·카메라·해산물 상태)

## 작업 규칙

- **화면이 바뀌는 작업은 Playwright로 직접 캡처해서 눈으로 확인**한다 (개발 서버를 켠 상태에서).
  - `npm run capture` (게임·캐릭터 랩) · `node scripts/capture-dive.mjs <폴더>` (잠수 연속) · `node scripts/capture-customize.mjs <폴더>` (꾸미기)
  - 설치된 Chrome을 씀 (`channel: 'chrome'`). 확정 캡처는 `docs/screenshots/<주제>/`에 JPEG로 저장 (용량 줄이기).
- **단계(또는 의미 있는 작업)가 끝날 때마다**: 비밀 정보 점검(API 키·비밀번호·토큰·`.env`·키 파일) → 의미 있는 단위로 커밋 → `main`에 push.
- **작업이 끝날 때마다 `docs/progress.md`와 `docs/troubleshooting.md`를 갱신하고, 그 변경도 같은 커밋에 포함**한다.
- 커밋 메시지는 한국어, `feat:` / `fix:` / `docs:` 접두어.
- 해산물·닉네임·꾸미기 목록처럼 서버와 공유하는 값은 `frontend/src/haenyeo/customize.ts`, `frontend/src/net/protocol.ts`를 기준으로 하고, 바꾸면 PLAN.md 7장도 함께 고친다.
