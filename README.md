# 숨비

웹 3D 해녀 힐링 공간. 기획 문서는 [docs/PLAN.md](docs/PLAN.md).

## 구조

```
frontend/   Vite + React + TypeScript + React Three Fiber
backend/    Spring Boot (3단계에서 추가)
docs/       기획 문서
```

## 로컬 실행 (프론트엔드)

필요: Node.js 20 이상

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 열고 "바다로 들어가기"를 누르세요.

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
| 마우스 드래그 / 휠 | 시점 회전 / 줌 |

## 개발 메모

- 지금은 서버 없이 혼자 하는 바다(`OfflineNetClient`)로 동작합니다. 개발 모드(`npm run dev`)에서는 다른 해녀들의 행동 알림과 멀리서 들리는 숨비소리를 흉내냅니다. 배포 빌드에서는 꺼집니다.
- 소리 파일 교체: `frontend/public/sounds/README.md`
- 개발 모드 브라우저 콘솔에서 `window.__sumbi`로 플레이어·해산물 상태를 볼 수 있습니다.
- 브라우저 저장소(localStorage)를 지우면 닉네임·바구니·볼륨 설정이 초기화됩니다.
