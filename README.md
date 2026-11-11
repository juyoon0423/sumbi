<div align="center">

# 숨비 · Sumbi

**웹 3D 제주 해녀 힐링 공간**

가입 없이 들어와 제주 바다에서 물질하고, 불턱에 둘러앉아 함께 쉰다.<br/>
경쟁도, 랭킹도, 채팅도 없이 — 말없이 곁에 누가 있다는 감각만.

![숨비 — 둥둥 떠서 하늘을 보는데 돌고래 무리가 지나간다](docs/screenshots/sea-friends/dolphin-float.jpg)

</div>

---

## 어떤 곳인가요

귀여운 제주 해녀가 되어 바다에서 헤엄치고, 잠수해 소라·전복·성게를 따고, 물 위로 떠오르며 숨비소리("호오이~")를 냅니다.
주변엔 다른 사람들의 주황 테왁이 둥둥 떠 있고, 멀리서 그들의 숨비소리가 들립니다. 물질을 마치면 불턱에 올라와 모닥불 둘레에 함께 앉아 쉽니다.

- **가입 없음** — 버튼 한 번으로 바로 바다. 닉네임("반짝이는 윤슬", "느린 파도")은 자동으로 정해지고 브라우저에 기억됩니다.
- **없는 것** — 경쟁, 랭킹, 채팅, 실패·페널티. 다른 사람과는 *행동*으로만 이어집니다 (인사, 숨비소리, 손질한 해산물이 모이는 공동 대야).
- **실제 시간** — 한국 시간을 따라 새벽·낮·노을·밤이 바뀝니다.
- **혼자여도 괜찮게** — 서버에 닿지 않으면 혼자 하는 바다로 자연스럽게 바뀝니다.

기획 전체는 [docs/PLAN.md](docs/PLAN.md)에 있습니다.

## 둘러보기

### 물질 — 잠수하고, 따고, 숨비소리

Space 를 누르고 있으면 웅크렸다가 머리부터 입수해 바닥까지 내려갑니다. 숨 게이지가 줄어들면 볼이 부풀고, 다 되면 저절로 떠오릅니다(실패 연출은 없어요). 떠오를 때 "호오이~" 숨비소리가 납니다.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/stage2/game-5-sumbi.png" alt="떠오르며 숨비소리"/></td>
    <td width="50%"><img src="docs/screenshots/stage2/game-3-diving.png" alt="물속 잠수"/></td>
  </tr>
  <tr>
    <td align="center">떠오르며 "호오이~"</td>
    <td align="center">물속에서 해산물 찾기</td>
  </tr>
</table>

### 실제 시간을 따라가는 바다

하늘 산란 그라데이션, 뭉게구름, 별 4,800개와 은하수, 실제 날짜의 달 위상. 바다엔 잔물결·프레넬 반사·햇빛 반짝임·노을빛 길·달빛 길이 있고, 밤 물속에선 헤엄친 자리에 푸른 플랑크톤이 흩어집니다.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/readme/dawn-surface.jpg" alt="새벽"/></td>
    <td width="50%"><img src="docs/screenshots/readme/day-surface.jpg" alt="낮"/></td>
  </tr>
  <tr><td align="center">새벽</td><td align="center">낮</td></tr>
  <tr>
    <td><img src="docs/screenshots/readme/sunset-surface.jpg" alt="노을"/></td>
    <td><img src="docs/screenshots/readme/night-moonlight.jpg" alt="밤 달빛 길"/></td>
  </tr>
  <tr><td align="center">노을</td><td align="center">밤 — 달빛 길</td></tr>
</table>

### 바다 친구들

잡을 수는 없고, 반응만 합니다. 다가가면 흩어지는 자리돔 떼, 바위 틈에서 빼꼼하다 "쏙" 숨는 문어, 밤에 은은하게 빛나는 해파리.
가끔 바다거북이 눈앞을 지나가고, **남방큰돌고래 무리**는 서버가 바다마다 시각을 정해 **같은 바다의 모두가 같은 순간에** 봅니다.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/sea-friends/dolphin-surface.jpg" alt="돌고래 무리"/></td>
    <td width="50%"><img src="docs/screenshots/sea-friends/day-damsel.jpg" alt="자리돔 떼"/></td>
  </tr>
  <tr><td align="center">"돌고래가 지나가요!"</td><td align="center">자리돔 떼와 빛줄기</td></tr>
  <tr>
    <td><img src="docs/screenshots/sea-friends/turtle-meet.jpg" alt="바다거북"/></td>
    <td><img src="docs/screenshots/sea-friends/night-jelly.jpg" alt="밤 해파리"/></td>
  </tr>
  <tr><td align="center">바다거북을 만났어요</td><td align="center">밤의 해파리와 플랑크톤</td></tr>
</table>

### 둥둥 — 물 위에 누워 하늘 보기

테왁을 배에 안고 누우면 몇 초 뒤 UI 가 사라지고 하늘만 남습니다. 낮엔 구름과 갈매기, 노을엔 물드는 구름, 밤엔 은하수와 가끔 별똥별.

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/dungdung/dd-day-4-gulls.jpg" alt="낮 하늘과 갈매기"/></td>
    <td width="33%"><img src="docs/screenshots/dungdung/dd-sunset-sky.jpg" alt="노을 하늘"/></td>
    <td width="33%"><img src="docs/screenshots/dungdung/dd-night-milkyway.jpg" alt="밤 은하수"/></td>
  </tr>
  <tr><td align="center">낮 · 갈매기</td><td align="center">노을</td><td align="center">밤 · 은하수</td></tr>
</table>

### 불턱 — 모닥불 둘레에서 함께 쉬기

불턱에 오르면 둥근 돌담 안 빈자리에 앉아 불을 쬡니다. 내가 딴 해산물을 손질하면(소라 두드리기, 전복 떼기, 성게 알 맛보기) **공동 대야**가 차오르고, 가득 차면 그 자리의 해녀 모두가 만세를 합니다. 귤을 까먹거나 꾸벅꾸벅 졸 수도 있고, 빈 방석 돌을 눌러 자리를 옮길 수도 있습니다.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/stage4/bt-9-basin-full-celebrate.jpg" alt="대야가 가득 차 만세"/></td>
    <td width="50%"><img src="docs/screenshots/readme/night-bulteok.jpg" alt="밤 불턱"/></td>
  </tr>
  <tr><td align="center">대야가 가득 차면 다 같이 만세</td><td align="center">밤의 불턱</td></tr>
  <tr>
    <td><img src="docs/screenshots/stage4/bt-11-B-dozing-zzz.jpg" alt="꾸벅꾸벅 졸기"/></td>
    <td><img src="docs/screenshots/bulteok-seat/seat-11-full-standing-outside.jpg" alt="24자리가 다 찬 불턱"/></td>
  </tr>
  <tr><td align="center">꾸벅꾸벅 zzz</td><td align="center">24자리가 다 차면 담 밖에서</td></tr>
</table>

### 말없이, 함께

같은 바다의 다른 해녀가 꾸민 모습 그대로 보입니다. 잠수하면 테왁만 수면에 남아 둥둥 뜨고, 숨비소리는 거리와 방향에 따라 작게 들립니다. 채팅 대신 상단 토스트로 행동만 전해집니다("작은 소라님이 전복을 땄어요").

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/stage3/mp-1-A-sees-B-and-C.jpg" alt="다른 해녀들"/></td>
    <td width="50%"><img src="docs/screenshots/stage3/mp-3-B-underwater-tewak-floats.jpg" alt="잠수한 해녀의 테왁"/></td>
  </tr>
  <tr><td align="center">같은 바다의 해녀들</td><td align="center">잠수하면 테왁만 둥둥</td></tr>
</table>

### 꾸미기와 물질 일지

물수건 8가지 · 테왁 6가지 · 볼 4색, 닉네임 36×36 조합. 물질을 마치면 머문 시간·숨비소리·딴 것·함께한 해녀를 담은 1080×1350 카드를 이미지로 저장할 수 있습니다.

<table>
  <tr>
    <td width="60%"><img src="docs/screenshots/customize/desktop-1-first-visit.jpg" alt="입장 화면 꾸미기"/></td>
    <td width="40%"><img src="docs/screenshots/stage4/jn-2-day-card.jpg" alt="물질 일지 카드"/></td>
  </tr>
  <tr><td align="center">입장 화면 — 랜덤으로 준비된 해녀</td><td align="center">물질 일지 카드</td></tr>
</table>

### 휴대폰에서도

왼쪽 아래 어디든 엄지를 대면 조이스틱, 오른쪽엔 세로 버튼(잠수는 톡 누르면 계속 잠수), 화면을 끌어 둘러보기, 두 손가락으로 줌. 기기 성능에 맞춰 품질 단계(높음·보통·낮음)가 자동으로 정해지고 프레임이 떨어지면 한 단계 낮춥니다.

<img src="docs/screenshots/mobile/overview.jpg" alt="휴대폰 화면 — 바다, 둥둥, 불턱" width="100%"/>

## 조작

| PC | 휴대폰 | 동작 |
|---|---|---|
| WASD / 방향키 | 왼쪽 아래 조이스틱 | 수면·물속 이동 (카메라 기준) |
| Space 누르고 있기 | 🤿 톡 (다시 톡 하면 올라감) | 잠수 · 떼면 상승 |
| 1 | 👋 | 손 흔들어 인사 |
| F | ☁️ | 둥둥 (물 위에 누워 하늘 보기) |
| 2 / 3 / 4 | 버튼 | 불턱에서 소라·전복·성게 손질 |
| T / Z | 버튼 | 불턱에서 귤 까먹기 / 졸기 |
| 마우스 드래그 / 휠 | 화면 끌기 / 두 손가락 | 시점 회전 / 줌 |
| 🎨 · 📔 (오른쪽 위) | 같음 | 꾸미기 · 물질 마치기(일지) |

## 기술 스택

| 영역 | 사용 |
|---|---|
| 프론트엔드 | Vite · React 19 · TypeScript · [React Three Fiber](https://github.com/pmndrs/react-three-fiber) (three.js) · drei · postprocessing · zustand |
| 백엔드 | Spring Boot 3.5 · Java 21 · 순수 WebSocket (JSON) · Redis (선택) |
| 운영 | Docker (arm64) · nginx · blue/green 무중단 배포 · GitHub Actions (OIDC → AWS SSM) · Cloudflare · Vercel |
| 검증 | JUnit (단위·동시성·WebSocket 통합·Redis) · Playwright (실제 Chrome 으로 화면 캡처·멀티 브라우저 시나리오) |

외부 3D 모델·텍스처·음원 없이, **캐릭터·바다·하늘·생물은 모두 코드(도형·셰이더)로**, 소리는 브라우저 합성음으로 만들었습니다.

```mermaid
flowchart LR
    subgraph Browser["브라우저 (React Three Fiber)"]
        UI[화면·HUD] --- Scene[3D 바다·불턱]
        Scene --- Net[NetClient]
    end
    Net -- "WebSocket (JSON)<br/>위치 10Hz · 행동 즉시" --> Nginx
    Net -. 서버가 없으면 .-> Offline[혼자 하는 바다<br/>OfflineNetClient]
    subgraph Server["서버"]
        Nginx[nginx] --> Blue[backend-blue]
        Nginx --> Green[backend-green]
        Blue --> Redis[(Redis<br/>오늘의 바다 집계<br/>동시접속 상한)]
        Green --> Redis
    end
```

### 신경 쓴 부분

- **방과 동기화** — 바다 하나에 최대 50명, 꽉 차면 새 바다. 위치는 서버가 10Hz 로 묶어 방송하고 클라이언트는 100ms 버퍼로 보간. 행동(인사·숨비소리·채집)은 즉시 방송. 위치 범위·속도 보정, 초당 메시지 수·크기 제한, 닉네임·색은 허용 목록으로 검증.
- **느린 연결 하나가 바다 전체를 막지 않게** — 연결마다 보낼 줄과 전송 스레드를 따로 두고, 전송이 3초를 넘거나 쌓인 메시지가 256KB 를 넘는 연결만 정리.
- **재접속** — 재접속 토큰으로 20초 안에 돌아오면 같은 해녀로. 끊기면 지수 백오프(±30% 지터)로 자동 재시도.
- **불턱 자리 옮기기** — 같은 자리를 둘이 동시에 눌러도 서버가 한 명만 승인 (16명 동시 요청 50회 테스트). 걷는 경로는 위치를 보내지 않고 양쪽이 같은 계산으로 그림.
- **오늘의 바다 집계** — Redis Lua 스크립트로 원자적으로 더하고 KST 날짜 키로 나눔. Redis 가 멈추면 메모리로 자동 전환, 다시 살아나면 복귀.
- **모두가 같은 돌고래** — 돌고래 일정은 서버가 바다마다 정하고, 늦게 들어온 사람도 남은 장면부터 봄.
- **동시접속 상한과 대기** — 상한은 Redis 값을 5초마다 읽어 재시작 없이 바뀜. 대기 중에도 혼자 하는 바다에서 놀다가 자리가 나면 "🌊 바다에 자리가 났어요" 카드.
- **무중단 배포** — 새 버전이 건강 확인을 통과해야 nginx 를 전환. 꺼지는 서버는 모든 접속에 `1012 (server restart)` 를 보내고, 브라우저는 0.3~3초 사이 흩어져 다시 접속.
- **눈으로 확인하는 개발** — 화면이 바뀌는 작업마다 Playwright 스크립트로 여러 브라우저를 띄워 캡처하고 확인 항목을 자동 검사 ([docs/screenshots/](docs/screenshots/)).

## 로컬 실행

필요: Node.js 20 이상, Java 21 (Gradle 은 `backend/gradlew` 가 알아서 받음). Redis 는 선택.

```bash
./dev.sh             # 백엔드(8080) + 프론트(5173) 한 번에, Ctrl+C 로 둘 다 종료
./dev.sh backend     # 백엔드만
./dev.sh frontend    # 프론트만 (서버가 없으면 혼자 하는 바다로 동작)
```

http://localhost:5173 을 열고 "바다로 들어가기"를 누르세요. 저장소가 다른 창(시크릿 창 등)을 여러 개 열면 서로의 해녀가 보입니다.

<details>
<summary><b>따로 실행하기 · 휴대폰으로 보기 · Redis</b></summary>

```bash
cd backend && ./gradlew bootRun              # JAVA_HOME 이 Java 21 이어야 함
cd frontend && npm install && npm run dev
```

**휴대폰** (같은 와이파이): `./dev.sh` 가 시작할 때 찍어 주는 `http://<내부 IP>:5173/?debug=1` 을 엽니다. 프론트는 `--host` 로 열리고, `SUMBI_ALLOWED_ORIGINS` 를 직접 주지 않았다면 내부 IP 를 허용 origin 에 더합니다. 안 열리면 macOS 방화벽을 확인하세요.

**Redis**: `brew install redis` 해 두면 `./dev.sh` 가 6379 에 띄웁니다(데이터는 `.redis/`). 없으면 오늘의 바다는 서버 메모리에만 남습니다.

</details>

<details>
<summary><b>개발용 주소·콘솔</b></summary>

| | |
|---|---|
| `?time=dawn\|day\|sunset\|night`, `?hour=5.6` | 시간대 고정 |
| `?quality=high\|medium\|low` | 품질 단계 고정 |
| `?debug=1` | fps·가장 긴 프레임·품질·dpr 표시 (개발 서버만) |
| `?event=dolphin\|turtle` | 바다 친구 바로 부르기 (개발 빌드만) |
| `?touch=1\|0` | 터치 조작 강제 |
| `/dev/character` | 캐릭터 랩 — 동작·표정·꾸미기를 나란히 |
| `window.__sumbi` | 플레이어·카메라·스토어, `setTime('night')`·`float.start()`·`dolphin()`·`turtle()` 등 |

</details>

<details>
<summary><b>백엔드 환경변수</b></summary>

설정은 `backend/src/main/resources/application.yml`, 환경변수로 덮어씁니다.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 8080 | 서버 포트 |
| `SUMBI_ALLOWED_ORIGINS` | `http://localhost:*,http://127.0.0.1:*` | 허용할 프론트 주소 (쉼표로 여러 개, `*` 패턴 가능) |
| `SUMBI_ROOM_CAPACITY` | 50 | 한 바다 최대 인원 |
| `SUMBI_MAX_TOTAL` | 500 | 전체 동시 접속 상한 (넘으면 대기) |
| `SUMBI_HEARTBEAT_TIMEOUT_MS` | 30000 | 이 시간 동안 메시지가 없으면 연결 정리 |
| `SUMBI_RECONNECT_GRACE_MS` | 20000 | 끊겼을 때 같은 해녀로 돌아올 수 있는 시간 |
| `SUMBI_SEND_TIME_LIMIT_MS` | 3000 | 메시지 하나 보내는 데 이보다 오래 걸리면 끊음 |
| `SUMBI_SEND_BUFFER_BYTES` | 262144 | 연결 하나에 쌓인 메시지 상한 |
| `SUMBI_REDIS_URL` | `redis://localhost:6379` | Redis 주소 (비밀번호는 환경변수로만) |
| `SUMBI_STATS_STORE` | `auto` | `auto` · `redis` · `memory` |
| `SUMBI_BASIN_CAPACITY` | 20 | 불턱 첫 대야 크기 |
| `SUMBI_ALERT_WEBHOOK_URL` | (없음) | 디스코드/텔레그램 알림 웹훅 — 비우면 끔 |

프론트 서버 주소는 `VITE_WS_URL` ([frontend/.env.example](frontend/.env.example)).

</details>

## 테스트

```bash
cd backend && ./gradlew test                      # 단위·동시성·WebSocket 통합·Redis
cd frontend && npm run build && npm run lint      # 타입 검사 + 빌드, oxlint
cd frontend && node scripts/capture-sea-friends.mjs out/   # 예: Playwright 시나리오 (개발 서버 필요)
```

`frontend/scripts/` 에 기능별 캡처·검증 스크립트(잠수, 꾸미기, 멀티플레이, 불턱, 둥둥, 휴대폰 조작, 대기열, 무중단 배포 등)가 있습니다. 목록은 [CLAUDE.md](CLAUDE.md#작업-규칙).

## 프로젝트 구조

```
frontend/            Vite + React + TypeScript + React Three Fiber
  src/world/         바다·하늘·해안·불턱·바다 친구들
  src/haenyeo/       해녀 캐릭터·애니메이션·꾸미기
  src/net/           WebSocket 클라이언트·프로토콜·원격 해녀 보간
  scripts/           Playwright 캡처·검증 스크립트
backend/             Spring Boot (room·game·admission·stats·ws …)
deploy/              docker compose · nginx · 무중단 배포 스크립트 · AWS 정책 템플릿
docs/                기획·진행 현황·문제 해결·배포 문서, 캡처 사진
dev.sh               백엔드 + 프론트 한 번에 실행
```

## 문서

| 문서 | 내용 |
|---|---|
| [PLAN.md](docs/PLAN.md) | 기획 전체 — 콘셉트, 화면 흐름, 기능 명세, 프로토콜 |
| [progress.md](docs/progress.md) | 단계별 진행 현황과 결정 기록 |
| [troubleshooting.md](docs/troubleshooting.md) | 개발하며 만난 문제와 해결 |
| [deploy.md](docs/deploy.md) · [deploy-plan.md](docs/deploy-plan.md) | 운영 구성과 배포 절차 |
| [screenshots/](docs/screenshots/) | 단계별 확인 캡처 |
