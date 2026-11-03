# 문제 해결 기록

> 겪은 문제마다 증상 · 원인 · 해결 · 확인 방법. 작업이 끝날 때마다 새 문제를 추가하고 같은 커밋에 넣는다.

## 캐릭터·동작

### 잠수 시 머리부터 입수하지 않고 거의 선 채로 가라앉음 (2026-11-02)
- **증상**: Space를 누르면 잠깐 머리부터 들어가는 듯하다가, 곧 거의 서 있는 자세로 약간 기울어진 채 바닥까지 가라앉음.
- **원인**: 입수(`entering`, 0.7초)가 끝나면 바로 `underIdle`(pitch 0.75 ≈ 43°, 거의 선 자세)로 바뀌고 그 자세로 계속 하강. 머리-아래 하강 상태가 없었음. 입수 각도(pitch 2.6)도 수평에서 약 59°로 얕았고, 물보라·소리는 웅크리기 전(t=0)에, 카메라는 입수 즉시 물속으로 들어감. 회전 그룹(body)은 맞았고 대기 동작이 회전을 덮어쓰지도 않았음.
- **해결**: `descending` 상태 추가(pitch ≈2.82, 팔 머리 위, 파닥파닥 발차기) → 바닥 `levelOffHeight`(1.3m) 안쪽에서 `underIdle/underSwim`(엎드림 pitch 1.3~1.45). 입수 pitch 2.9, 물보라·첨벙은 웅크림 끝(`enterCrouch`)에, 입수 중엔 카메라를 물 위에. 상승 중 다시 Space → `descending`.
- **확인**: `node scripts/capture-dive.mjs <폴더>` → 옆·뒤 0.1초 간격 프레임에서 `descending` 프레임이 머리 아래인지. 캐릭터 랩 `/dev/character?solo=dive`.
- 파일: `haenyeo/types.ts`, `haenyeo/Haenyeo.tsx`, `player/LocalPlayer.tsx`, `player/FollowCamera.tsx`

### 하강 중 해녀가 화면 아래 끝에 붙음 (2026-11-02)
- **증상**: 머리 아래로 내려갈 때 해녀가 화면 맨 아래에 걸림.
- **원인**: 카메라 타깃이 `p.y + 0.55`(선 자세 기준)를 느리게 따라감. 거꾸로 서면 몸 중심이 낮아지고 계속 내려가서 뒤처짐.
- **해결**: `descending`일 때 타깃을 `p.y - 0.15`로, 더 빠르게(damp 9) 따라감.
- **확인**: 잠수 연속 캡처에서 하강 프레임의 해녀가 화면 가운데 근처인지.

### 카메라가 해녀 뒤통수만 보여 표정이 안 보임 (2026-11-02)
- **증상**: 귀여운 표정을 거의 볼 수 없음.
- **원인**: 3인칭 카메라가 항상 등 뒤.
- **해결**: 가만히 있을 때(2.5초)와 인사·숨비소리·채집 보여주기 때 해녀가 카메라 쪽으로 돌아봄 (`LocalPlayer` 돌아보기 블록).
- **확인**: 입장 후 가만히 3초 → 얼굴이 보이는지.

### 물안경 끈이 헤드셋처럼 튀어나옴 / 얼굴 아래쪽이 갈색으로 어두움 / 테왁이 입을 가림 (2026-11-02)
- **해결**: 끈 고리 제거 + 렌즈 사이 브리지 추가. 피부를 밝게 + 따뜻한 자체 발광(emissive 0.12). 테왁을 수면 −0.05로 내리고 몸 앞 0.47로, 몸은 `surfaceSink -0.06`.
- **확인**: `npm run capture` 의 `lab-idle`, `game-1-idle`.

## 화면·셰이더

### 바닥이 하얗게 타버림 (2026-11-02)
- **증상**: 물속 바닥이 하얗게 번쩍임.
- **원인**: 커스틱 셰이더의 나눗셈이 0 근처에서 폭주(NaN/무한대).
- **해결**: 사인 왜곡 기반의 안정적인 커스틱으로 교체, 세기 0.22.
- **확인**: 잠수해서 바닥이 잔잔한 물빛 무늬인지.

### 해녀 주변에 반투명 쐐기 모양이 보임 (2026-11-02)
- **원인**: 물속 빛줄기(원기둥) 윗부분이 파도 골 위로 튀어나옴.
- **해결**: 빛줄기를 y −0.4에 두고, 카메라가 물속일 때만 보이게.
- **확인**: 수면에서 해녀 주위에 이상한 도형이 없는지.

### 꾸미기 화면에서 짧은 카드일 때 해녀가 위쪽에 작게 보임 (2026-11-02)
- **증상**: 데스크톱 다시 방문 카드·바다 속 🎨 메뉴에서 해녀가 화면 위에 아주 작게.
- **원인**: 패널 위치를 `top > 화면 20%`로 판단해서, 세로 가운데에 놓인 짧은 카드를 "아래 시트"로 오인.
- **해결**: 패널 너비가 화면의 85% 이상일 때만 아래 시트로 판단 (`ui/CustomizePanel.tsx`).
- **확인**: `node scripts/capture-customize.mjs <폴더>` 의 `desktop-4-returning`, `desktop-6-sea-menu`.

### 꾸미기 중 머리 위 닉네임이 거대하게 보임 (2026-11-02)
- **원인**: 카메라가 아주 가까워져 drei `Html` 이름표가 크게 그려짐.
- **해결**: 꾸미는 동안 이름표 숨김 (패널에 닉네임이 있음).

### 모바일에서 고른 색 테두리가 잘림 / 상단 안내가 버튼과 겹침 (2026-11-02)
- **해결**: 색 목록에 `padding: 4px; margin: -4px`. 640px 이하에서 상단 안내를 `top: 70px`로 내림.
- **확인**: 꾸미기 캡처 `mobile-*`.

## 개발 환경·도구

### Playwright가 브라우저를 못 찾음 (2026-11-02)
- **증상**: chromium-1248을 요구하는데 캐시에는 1234만 있음.
- **해결**: 설치된 Chrome 사용 `chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })`.

### 캡처 타이밍이 어긋남 (채집 손 뻗기 순간이 찍힘 등) (2026-11-02)
- **해결**: 상태와 경과 시간을 기다렸다 찍기 (`waitForFunction(... pose.stateTime > 0.72)`). 캐릭터 랩은 `?solo=<id>&t=<초>`로 한 순간 고정.

### 테스트 중 이동 키가 눌린 채로 남음 (2026-11-02)
- **원인**: HMR + 스크립트로 보낸 키 이벤트가 섞임.
- **해결**: 페이지 새로고침. 창 blur 시 키 초기화는 `input.ts`에 있음.

### StrictMode에서 오프라인 접속이 두 번 일어남 (2026-11-02)
- **해결**: `OfflineNetClient.connect()` 시작 때 기존 타이머 정리.

### `/dev/character`에서 "synchronously unmount a root" 콘솔 오류 15개 (2026-11-02 해결)
- **증상**: 캐릭터 랩을 열면 React 콘솔 오류 15개 (라벨 수만큼).
- **원인**: drei `Html` 은 자기 React 루트를 만든다. Canvas 가 처음 그려지는 중(바깥 React 가 렌더 중)에 라벨이 같이 마운트되면, StrictMode 의 가짜 해제가 "렌더 중 루트 해제"가 됨. 게임 화면 이름표는 나중에 마운트돼서 괜찮았음.
- **해결**: 라벨을 첫 프레임 뒤에 붙임 (`labelReady` 상태, `useFrame` 에서 true).
- **확인**: Playwright 로 `/dev/character` 열고 콘솔 오류 0개.

### macOS에 `timeout`, Python PIL 없음
- 여러 캡처를 한 장으로 보기: Playwright로 HTML 그리드를 띄워 스크린샷. 이미지 변환은 `sips -s format jpeg`.

## 멀티플레이 (3단계)

### 서버를 끄는 명령이 브라우저까지 죽임 (2026-11-02)
- **증상**: 재접속 테스트에서 서버를 끄자 페이지가 처음 상태(selfId 없음)로 돌아가 재접속을 확인할 수 없었음.
- **원인**: `kill $(lsof -ti tcp:8080)` 이 8080 에 **연결된** Chrome 프로세스까지 골라 죽임.
- **해결**: 듣고 있는 서버만: `lsof -ti tcp:8080 -sTCP:LISTEN`.
- **확인**: 서버를 껐다 켜면 "연결이 잠깐 끊겼어요" 표시 → 자동으로 online.

### 다른 해녀 이름표가 너무 작거나, 가까이 있으면 화면을 덮음 (2026-11-02)
- **원인**: drei `Html distanceFactor` 는 거리에 정비례로 줄임 → 8m 밖 이름은 8px 정도, 카메라 바로 옆이면 거대.
- **해결**: `distanceFactor` 대신 `useFrame` 에서 카메라 거리로 직접 크기를 정하고 0.85~1.15배로 제한 (`ui/NameTag.tsx`). CSS 의 `translateY(-50%)` 도 같이 넣어야 위치가 안 틀어짐.
- **확인**: `capture-multiplayer.mjs` 의 `mp-1-*`.

### 백엔드 테스트: `List.of(...).contains(null)` 이 예외 (2026-11-02)
- **증상**: 색이 빠진 `look`(null)을 검증하다 NullPointerException.
- **원인**: `List.of` 로 만든 불변 목록은 null 을 찾기만 해도 예외.
- **해결**: `in(list, value)` 도우미로 null 먼저 확인 (`CustomizeCatalog`).

### 백엔드 테스트: 초당 메시지 제한이 다음 초에도 풀리지 않음 (2026-11-02)
- **원인**: 창 시작값을 `Long.MIN_VALUE` 로 두어 `now - windowStart` 가 넘침(음수) → 창이 한 번도 안 바뀜.
- **해결**: `started` 플래그로 첫 메시지에 창 시작 (`RateLimiter`).
- **확인**: `RateLimiterTest`.

### 원격 해녀가 떠오를 때 퐁 튀어오름이 안 나옴 (2026-11-02, 미리 막음)
- **원인**: 해녀 모델은 "직전 상태가 ascending 이었을 때" 퐁을 재생하는데, `surface` 이벤트에서 바로 수면 대기로 바꾸면 ascending 을 건너뜀.
- **해결**: `surface` 이벤트는 ascending 으로만 바꾸고, 다음 프레임에 `drivePose` 가 수면 대기로 (`net/remotes.ts`).

### 동시성 점검: 느린 클라이언트 하나가 방 전체를 멈출 수 있었음 (2026-11-03)
- **증상** (테스트로 재현한 상황): 네트워크가 막힌 클라이언트가 있으면 그 방의 방송이 멈출 수 있음. 실제 화면에서 겪은 적은 없음.
- **원인**:
  1. 방 메서드는 `synchronized` 이고 그 안에서 `send()` 를 부름. `ConcurrentWebSocketSessionDecorator` 는 동시에 보내는 것은 막아 주지만, **실제로 쓰는 스레드는 호출한 스레드**(= 방 잠금을 쥔 스레드). TCP 버퍼가 꽉 차면 그 스레드가 쓰기에서 멈추고 방 잠금도 그대로 쥠. 스냅샷 스레드는 하나뿐이라 다른 방까지 늦어짐.
  2. decorator 의 전송 시간 초과는 `SessionLimitExceededException`(RuntimeException)으로 던져지는데 `IOException` 만 잡고 있어서, 방송 루프가 중간에 끊겨 뒤 사람들이 메시지를 못 받음.
  3. `DROP` 설정은 쌓인 메시지를 조용히 버리기만 하고 연결은 정리하지 않음 → join/leave 가 빠져 화면이 어긋날 수 있음.
- **해결** (`ws/ClientConnection.java`): 연결마다 보낼 줄 + 전송 가상 스레드 하나.
  - `send()` 는 JSON 으로 바꿔 줄에 넣고 바로 돌아옴 → 방 잠금 안에서 네트워크를 기다리지 않음.
  - 줄은 `draining` 플래그로 연결당 한 스레드만 비움 → 세션에 동시에 쓰지 않고 넣은 순서대로 나감.
  - "보낼 내용만 잠금 안에서 만들고 전송은 잠금 밖" 을 글자 그대로 하면(잠금을 푼 뒤 각자 send) 두 스레드의 join·leave 순서가 뒤바뀔 수 있어서, **줄에 넣는 것은 잠금 안**에서 함.
  - 전송 하나가 `SUMBI_SEND_TIME_LIMIT_MS`(3초)를 넘기거나 못 보낸 양이 `SUMBI_SEND_BUFFER_BYTES`(256KB)를 넘으면 그 연결만 끊고, 게임 정리(`disconnected`, 재접속 유예)를 전송 스레드에서 바로 부름 (닫기가 오래 걸려도 정리는 바로).
  - 같은 메시지를 여러 명에게 보낼 때 JSON 은 한 번만 만듦 (`MessageCodec.encodeBytes`).
- **확인**: `ClientConnectionTest` — 막힌 연결이 있어도 방송 200번이 0.5초 안에 끝나고 다른 사람은 200개 다 받음 / 256KB(테스트는 2KB) 넘으면 그 연결만 `SESSION_NOT_RELIABLE` 로 닫힘 / 전송 3초 초과 시 정리 / 8 스레드 × 300개 동시 전송에도 세션 동시 쓰기 0, 스레드별 순서 유지.

### 동시성 점검: 방금 정리된 빈 바다에 들어가는 해녀 (2026-11-03)
- **증상**: 여러 명이 동시에 들어오고 나가면 가끔 welcome 은 받았는데 방 목록에 없는 바다에 들어가 있음 → 스냅샷이 안 나가서 아무도 못 봄. 테스트(600명, 16스레드, 정원 3) 10번 중 2번 재현: "남은 사람 수 300, 방 인원 합 299".
- **원인**: `assign()`(빈자리 있는 바다 고르기)과 `join()` 사이에 다른 스레드가 마지막 사람을 내보내고 `removeIfEmpty()` 로 그 바다를 목록에서 뺌. 그 뒤 `join()` 은 그대로 성공.
- **해결**: 바다에 `closed` 표시. `removeIfEmpty` 는 방 잠금 안에서 비었는지 확인하고 닫음(`closeIfEmpty`), 닫힌 바다의 `join` 은 거절 → `GameServer.enter` 가 다른 바다로 다시 배정. 같은 김에 `disconnected`·`admitWaiting` 도 `GameServer` 잠금 안으로 (같은 토큰의 재접속과 끊김 처리가 엇갈리지 않게, 대기열에서 두 스레드가 동시에 꺼내 전체 상한을 넘지 않게). 잠금 순서는 GameServer → RoomManager → Room 한 방향뿐이라 교착 없음.
- **확인**: `ConcurrentJoinLeaveTest` (5번 반복) — 방 인원 합 = 남은 사람, 모두 목록에 있는 바다에 자기 연결로 앉아 있음, 같은 자리 두 명 없음, 대기열이 있어도 동시에 바다에 있는 인원 ≤ 상한. 예전 코드로 되돌려 돌리면 실패하는 것을 확인함.

### 동시성 점검: 문제없던 부분과 근거 (2026-11-03)
- **방 인원 상한**: `join` 이 방 잠금 안에서 인원을 세고 넣으므로 정원을 넘을 수 없음.
- **스냅샷과 위치 갱신**: `move`(저장)와 `snapshot`(모아서 비움)이 같은 방 잠금 → 반쯤 쓴 위치가 나가지 않음. 스냅샷 배열은 매번 새로 만듦.
- **welcome 은 다른 메시지보다 먼저**: welcome 을 방 잠금 안에서 줄에 넣고, 줄은 순서대로 나감.
- **한 연결의 받는 메시지**: Tomcat 이 세션마다 순서대로 한 번에 하나씩 `handleTextMessage` 를 부름. `ClientState` 필드는 `volatile`.
- **오늘의 바다**: `InMemoryDailyStats` 메서드가 모두 `synchronized`. welcome 에 넣을 값은 방 잠금 밖에서 미리 읽음 (Redis 가 되어도 방을 붙잡지 않게).

### Spring Boot 실행 시 Java 버전
- 이 컴퓨터 기본 Java 는 23. 백엔드는 Java 21 툴체인: `JAVA_HOME=$(/usr/libexec/java_home -v 21)` (`dev.sh` 는 자동으로 찾음).

## 불턱 (4단계)

### 공동 대야가 모닥불과 겹쳐 보임 (2026-11-03)
- **증상**: 바다 쪽에서 불턱을 보면 불꽃이 대야 안에서 솟는 것처럼 보임.
- **원인**: 대야를 모닥불 중심에서 1.15m 에 두어 가장자리 사이가 0.7m 뿐이고, 불꽃 원뿔이 커서 대야를 가림.
- **해결**: 대야를 1.32m 로 (`world/bulteok/layout.ts`, 입구 쪽 빈 틈이라 자리 0·11 과 겹치지 않음), 불꽃 크기 약 15% 줄임.

### 대야가 가득 찬 순간 끝난 손질이 사라짐 (2026-11-03, 미리 막음)
- **상황**: 만세 시간(4초) 동안 다른 사람의 손질이 끝나면 넣을 곳이 없음.
- **해결**: `room/Basin.java` 가 그 사이 끝난 손질을 `carry` 로 모아 다음 대야에 먼저 넣음 (다음 대야 크기 − 1 까지, 바로 또 가득 차지 않게). `BulteokTest` 로 확인.

### 캡처: 앉은 해녀 정면을 찍으려면 카메라 yaw 를 `player.yaw + 0` 근처로 (2026-11-03)
- 카메라 리그 yaw 기준이 "해녀 앞" 이라 `+π` 를 주면 등 뒤에서 찍힘. 손질 손동작은 화면 아래 손질 패널에 가리지 않게 거리 3.5, pitch 0.1 정도.
- 불턱 확인 스크립트: `node scripts/capture-bulteok.mjs <폴더>` (백엔드를 `SUMBI_BASIN_CAPACITY=6` 으로 켜면 대야가 빨리 참).

## 오늘의 바다 Redis (4단계)

### Redis 가 꺼져 있을 때 서버가 느려지거나 멈출까 (2026-11-03 확인)
- **확인한 것**: 서버 실행 중 `redis-cli shutdown` → 다음 접속에서 `Redis command timed out`(500ms) 한 번 기다린 뒤 `Redis 집계 실패 → 30초 동안 메모리 집계로` 경고, 그 뒤 채집·입장은 바로 메모리로 처리. 30초 뒤 다시 Redis 를 시도.
- **설정**: `spring.data.redis.timeout`·`connect-timeout` 500ms. 기본 Lettuce 는 명령 시간 제한이 60초라 그대로 두면 접속 처리 스레드가 오래 멈춤.
- **통합 테스트**는 `sumbi.stats-store=memory` 로 고정 (로컬 Redis 가 켜져 있으면 테스트가 실제 집계를 올려 버리므로).

### Redis 테스트가 건너뛰어짐
- `RedisDailyStatsTest` 는 `redis-server` 실행 파일을 찾아 빈 포트에 직접 띄움 (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`). 없으면 건너뜀 → `brew install redis`.

### `dev.sh` 를 끄면 Redis 도 같이 꺼짐
- `dev.sh` 가 띄운 Redis 는 Ctrl+C 때 같이 종료되고, 끌 때 `.redis/dump.rdb` 에 저장 → 다음 실행 때 그대로 불러옴. 따로 켜 둔 Redis(6379)가 있으면 그걸 쓰고 건드리지 않음.

## 숨 고르기 (4단계, 2026-11-03 삭제 → 둥둥)

> 기능이 없어져 아래 기록은 참고용. `capture-breathe.mjs` 도 지움.

### 다른 해녀의 숨 고르기 빛이 밝은 물 위에서 거의 안 보임 (2026-11-03)
- **원인**: 더하기 블렌딩 스프라이트라 낮의 밝은 수면(흰 반사) 위에서는 차이가 작음.
- **해결**: 불투명도 0.28~0.5 → 0.4~0.7, 크기 1.7~2.3 → 1.9~2.6 (`haenyeo/BreatheGlow.tsx`). 밤 바다(시간대 작업)에서는 더 잘 보임.

### 숨 고르기 확인을 30초씩 기다리지 않으려면
- `capture-breathe.mjs` 는 시작 전에 `localStorage['sumbi.breathe'] = {date: 오늘(KST), cycles: 2}` 를 넣어 두고 숨 하나(10초)만 마쳐 보상(+2초)을 확인함.
- 숨 수는 `pose.breatheTime` 이 10초 경계를 **프레임 안에서** 넘을 때만 셈. 콘솔에서 `breatheTime` 을 바로 바꾸면 넘은 것으로 치지 않음.

## 시간대 (4단계)

### 밤 수면에 커다란 흰 얼룩 (2026-11-03)
- **증상**: 밤 화면 오른쪽 아래 수면이 하얗게 번쩍임.
- **원인**: 달빛 반짝임을 넓게 하려고 반사 지수를 50 까지 낮추고 세기 0.9 → 가까운 수면 전체가 하이라이트.
- **해결**: 지수 120, 세기 0.45 (`world/time/palette.ts` NIGHT·DUSK, `TimeOfDay.tsx` glintPow). 달 쪽을 볼 때 수평선까지 이어지는 달빛 길만 남음.

### 밤 플랑크톤이 헤엄쳐도 잘 안 빛남 (2026-11-03)
- **원인**: 셰이더에서 해녀 근처 입자만 밝히는 방식은 근처(반경 2m)에 입자가 10개 남짓이라 티가 안 남.
- **해결**: 지나간 자리에 새로 빛 입자를 흘림(160개 고리 버퍼, 헤엄 속도만큼 초당 최대 55개, 2.2초 동안 퍼지며 사라짐). 떠다니는 플랑크톤은 그대로 가물거림.

### 캡처: 특정 방향을 보는 카메라 yaw
- 카메라는 `(sin yaw, cos yaw)` 쪽에 있고 그 반대 방향을 봄 → 방향 `(dx, dz)` 를 보려면 `yaw = atan2(-dx, -dz)`.
- 시간대 확인: `node scripts/capture-time.mjs <폴더>` (백엔드 없어도 됨).

## 물질 일지 (4단계)

### 휴대폰(세로 화면)에서 일지 사진이 얼굴만 크게 나옴 (2026-11-03)
- **원인**: 화면 비율(세로)로 찍고 가운데를 가로 사진 비율로 잘라서, 세로 화면에선 좁은 띠만 남음.
- **해결**: 일지 카메라의 비율을 사진 비율(984×652)로 두고 캔버스 전체에 그린 다음, 캔버스 전체를 사진 크기로 옮겨 담음 (화면 비율과 상관없이 같은 구도). `journal/JournalCamera.tsx`

### 일지 카드 아래쪽 글이 겹침 (2026-11-03)
- 숨 고르기 줄이 생기면 기록이 5줄 → 마무리 문장과 겹침. 사진 높이 780 → 700, 줄 간격 5줄일 때 66.

### 파일을 지웠더니 Vite 개발 서버가 "Failed to load url …/capture.tsx" (2026-11-03)
- **원인**: 확장자 없이 import 한 `./capture` 를 Vite 가 예전 `.tsx` 로 기억. 새 `capture.ts` 를 만들어도 그 파일을 import 하는 쪽이 바뀌지 않으면 다시 찾지 않음.
- **해결**: import 하는 파일(`journal.ts`)을 `touch` 하거나 개발 서버 재시작.

### 일지 확인
- `node scripts/capture-journal.mjs <폴더>` (백엔드 필요): 잠수 → 숨비소리 기록, 카드, 이미지 저장(내려받기 파일), 계속하기, 바다 떠나기 → 다른 화면에서 사라짐 → 다시 들어오기, 휴대폰 화면.
- 내려받은 카드 PNG 는 `jn-2-day-card`, `jn-3-night-bulteok-card` 로 저장됨.

## 불턱 자리 옮기기 (2026-11-03)

### 같은 자리 동시 요청 테스트가 가끔 "두 명 승인"으로 실패 (2026-11-03)
- **증상**: `SeatMoveTest` 의 16명 동시 요청에서 승인 수가 1이 아닐 때가 있음.
- **원인**: 서버 버그가 아니라 테스트 순서 문제. 한 스레드가 20번을 받은 뒤 이어서 다른 자리를 마구 요청해 20번을 비우면, 늦게 출발한 스레드의 첫 요청이 빈 20번을 정당하게 받음.
- **해결**: "모두 같은 자리 요청" → `CyclicBarrier` 로 다 같이 기다림 → "아무 자리나 마구 요청" 두 단계로 나눔. 자리 겹침 검사는 마지막에 따로.
- **확인**: `./gradlew test` (50회 반복).

### 캡처: 자리를 눌렀는데 걸어가지 않음 (2026-11-03)
- **증상**: Playwright 로 자리 화면 좌표를 눌렀는데 아무 일도 없음.
- **원인**: 그 시점(해녀 옆 카메라)에서 목적지 자리가 하단 손질 패널 밑에 있어 HTML 패널이 클릭을 받음.
- **해결**: 위에서 내려다보는 넓은 시점에서 누르고, 누른 직후 카메라를 옮김. 좌표는 개발용 `__sumbi.toScreen(x, y, z)` + `__sumbi.seatPose(i)`.
- **확인**: `capture-bulteok-seat.mjs` 의 "B 화면: A 가 3번으로 걷는 중".

### 불턱 정면 시점이 너무 느리게 돌아옴 / 모닥불이 화면 귀퉁이에 잘림 (2026-11-03, 기능은 되돌림)
- **원인**: 처음엔 물질 일지 사진 구도(정면에서 0.42rad, 3.1m)를 그대로 썼고 따라가는 속도 0.7 → 등 뒤에서 앞으로 오는 데 5초 넘게 걸림, 불은 화면 밖에 가까움.
- **해결**: 0.72rad·3.6m·pitch 0.3, 속도 1.1 (처음 1.2초는 서서히 출발). 걸을 땐 등 뒤로 2.4.
- **이후**: 사용자 요청으로 정면 시점 자동 전환 자체를 되돌림 (카메라는 이전처럼 등 뒤). 다시 만들 때 위 값을 참고.

### 자리 옮기기 확인
- 백엔드를 켠 상태에서 `node scripts/capture-bulteok-seat.mjs <폴더> [원본프레임폴더]` (브라우저 4개 + 가짜 WebSocket 해녀 21명으로 24자리를 채움, 28개 항목). 0.1초 간격 원본 프레임은 두 번째 폴더에, 한 장 모음은 첫 폴더에.
- 개발용 콘솔: `__sumbi.seat(5)` (5번 자리 요청), `__sumbi.player.walk` (걷는 길·시간).
- 연달아 돌리면 앞 실행의 가짜 해녀가 끊김 유예(20초) 동안 자리를 잡고 있어 "동시 요청"·"비워진 자리" 항목이 어긋날 수 있음 → 20초 기다리거나 백엔드 재시작. 스크립트는 끝날 때 가짜 해녀를 정상 종료하고 잠깐 기다림.
- 서버를 새로 빌드하지 않고 켜 둔 채면 `seat` 메시지를 몰라 아무 일도 안 일어남 → 백엔드 재시작.

## 둥둥 (2026-11-03)

### 누운 해녀를 보는 카메라에서 테왁이 얼굴을 가림
- 테왁을 배 가운데(몸 중심 + 앞 0.1)에 두면 발 쪽 카메라에서 테왁이 머리를 통째로 가림.
- 테왁을 발 쪽으로(앞 0.46, 높이 +0.12) 내리고 고개를 들게(`headTilt` 0.75, 해달이 배 위를 보듯) 하니 테왁 위로 얼굴이 보임.
- 카메라 시선을 고정 각도로 두면 몸이 천천히 돌거나 떠내려갈 때 해녀가 화면 밖으로 나감 → 머리 쪽 점을 향한 방향 + `elev` 만큼 위로. 구도 값은 콘솔 `Object.assign(__sumbi.float.view, {...})` 로 바로 바꿔 볼 수 있음.

### 누워 있을 때 숨 게이지가 그대로 보임
- 숨 게이지는 잠수할 때만 차오르지만 수면에서도 막대는 보임. 둥둥 중엔 `BreathGauge` 를 아예 그리지 않음.

### 일지 카드 캡처에서 `localStorage` 접근 오류
- `about:blank` 에서 `page.setContent` 를 쓰면 `addInitScript`(localStorage 쓰기)가 그 문서에서도 돌아 "Access is denied" pageerror. 카드 이미지는 `toDataURL` 을 받아 Node 에서 파일로 저장.

### 별이 물속에서도 보일 수 있음
- 별(Points)·구름은 `fog: false` 라 물속 안개에 묻히지 않음. 카메라가 물속이면(`cameraUnderwater`) 둘 다 끔.

### `Haenyeo.tsx` 가 `player/float.ts` 를 가져오자 순환 import 로 화면이 안 뜸 (2026-11-03)
- **원인**: `player/float.ts` → `net` → `remotes` → `haenyeo` 로 다시 이어짐. 캐릭터 모델 쪽이 플레이어 로직을 가져오면 고리가 생김.
- **해결**: 두 쪽이 같이 쓰는 값(`FLOAT_UP` 일어나는 시간)을 `haenyeo/types.ts` 에 두고 `float.ts` 는 다시 내보내기만. 규칙: `haenyeo/` 는 `player/`·`net/` 을 가져오지 않는다.

### 기능을 지운 뒤 확인할 것 (숨 고르기 삭제, 2026-11-03)
- 프론트·백엔드·문서·캡처 스크립트에서 이름 검색: `grep -rni "breathe\|숨 고르기" frontend/src backend/src frontend/scripts` → 남은 것은 "삭제했다"는 주석·`main.tsx` 의 옛 저장값 지우기뿐이어야 함.
- 옛 브라우저 저장값은 시작할 때 지움(`localStorage.removeItem('sumbi.breathe')`), 옛 일지 기록에 남은 필드는 그냥 무시(타입에서 빠져도 JSON 읽기는 안 깨짐).
- 파일을 지운 뒤 Vite 가 옛 import 를 붙잡고 있으면 가져오던 파일을 저장(touch)해서 다시 읽게 함 (위 "Failed to load url" 항목).
- 백엔드 서버를 다시 켜야 지운 메시지(`breathe`)를 거절함 — 켜 둔 서버는 옛 코드.

## 하늘·바다 v2 (2026-11-04)

### 후처리(EffectComposer)를 켜자 하늘이 회색으로 바램
- **원인**: `EffectComposer` 는 렌더러 톤 매핑을 `NoToneMapping` 으로 바꿈 → `ToneMapping` 효과를 따로 넣어야 하는데, ACES 는 파랑·노을 채도를 많이 깎음.
- **해결**: `ToneMappingMode.NEUTRAL`. 블룸이 꺼진 낮음 단계(후처리 없음)도 같은 색이 나오게 Canvas `gl.toneMapping = NeutralToneMapping`, 물질 일지 사진(`JournalCamera`, 직접 `gl.render`)도 그동안만 Neutral 로.
- 직접 만든 ShaderMaterial 은 `#include <tonemapping_fragment>` 가 있어야 톤 매핑을 따름.

### `onBeforeCompile` 셰이더 컴파일 오류 ("'material' : syntax error")
- 문자열 치환으로 GLSL 을 끼워 넣다가 `}` 가 하나 남아 함수 밖으로 나감. 콘솔의 `THREE.WebGLProgram` 오류 줄 번호 근처를 보면 끼워 넣은 부분이 보임. 끼워 넣는 코드는 `{ ... }` 블록 하나로 감싸 변수 이름 충돌도 막음.

### 바깥 바다(고리 모양)에 포말이 온통 깔림
- 포말·옥빛은 정점마다 넣은 물 깊이 `aDepth` 로 정함. 바깥 `RingGeometry` 엔 그 속성이 없어 0(= 해안선)으로 읽힘 → 바깥 고리에도 `aDepth` 를 60 으로 채움.

### 다른 해녀를 파도 높이에 맞췄더니 헤엄 동작이 떨림
- 보간 위치(`rm.pos`)의 y 를 바꾸면 그 값으로 계산하는 속도가 파도만큼 흔들림. 보이는 위치(`shown`)만 따로 두고 `root.position` 에만 씀. 불턱 걷기처럼 바다가 아닌 곳은 `rm.pos` 그대로.

### 물속에서 수평선 쪽에 밝은 선
- 하늘 돔(`fog: false`)이 물속에서도 그려져 수면 아래로 보임. 카메라가 물속이면 하늘 돔도 끔 (별·구름과 같은 방식).

### 세로 휴대폰 화면 둥둥에서 밤에 달이 안 보임
- 가로 화면 기준 옆 구도(`side`)라 좁은 세로 화면에선 달이 화면 밖. `FollowCamera` 에서 화면 비율로 `portrait` 배율을 구해 옆 거리를 줄이고 방향을 머리·달 쪽 사이로 섞음.

### 프레임 수 재기 (`capture-skysea.mjs ... fps`)
- headless Chrome 은 60fps 에 묶여 차이가 안 보임 → `--disable-gpu-vsync --disable-frame-rate-limit`. 같은 조건에서도 실행마다 ±40% 흔들리므로 여러 번 재서 범위로 적음 (`docs/screenshots/sky-sea-v2/fps.md`). 실제 휴대폰 값은 아님.

### 캡처 스크립트에서 불턱 이동이 시간 초과
- 물속에서 올라오는 중엔 `travel('bulteok')` 이 거절됨. `pose.state === 'surfaceIdle'` 이 될 때까지 기다린 뒤 이동.

### `capture-journal.mjs` "함께한 해녀" 실패
- 같은 백엔드(:8080)에 사용자 Chrome 같은 다른 브라우저가 붙어 있으면 함께한 해녀 수가 늘어남. 다른 연결을 닫고 다시 돌림 (`lsof -i tcp:8080` 으로 확인).

## 휴대폰으로 개발 서버 보기 (2026-11-04)

### 휴대폰에서 페이지가 안 열림
- Vite 는 기본으로 localhost 에만 열림 → `npm run dev -- --host` (`dev.sh` 가 함). Mac 과 휴대폰이 같은 와이파이인지, macOS 방화벽이 node 들어오는 연결을 막지 않는지 확인. 내부 IP 는 `ipconfig getifaddr en0`.

### 페이지는 열리는데 혼자 하는 바다로 바뀜
- WebSocket 주소는 개발 모드에서 `location.hostname` 을 따라가므로 IP 로 열면 `ws://<IP>:8080/ws`. 서버가 origin `http://<IP>:5173` 을 거절하면(403) 연결 실패 → `dev.sh` 로 켰는지(허용 origin 에 내부 IP 추가), 와이파이가 바뀌어 IP 가 달라졌으면 서버를 다시 켬. 확인: `curl -H "Origin: http://<IP>:5173" -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" http://<IP>:8080/ws` → 101 이면 허용.

### 휴대폰(iPhone)에서 화면을 끌어도 시점이 안 돌아감
- **원인(추정)**: iOS WebKit 은 손가락 끌기를 페이지 스크롤·바운스로 가져가며 `pointercancel` 을 보냄 → 카메라 끌기가 바로 끝남. Chrome 터치 흉내에선 재현되지 않음 (`touch-action: none` 만으로 충분).
- **해결**: 캔버스·조이스틱·문서 전체에 `touchmove` 를 `{ passive: false }` 로 막고(`lib/device.ts` `blockNativeTouch`, `Hud` `useBlockPageScroll`), iOS 두 손가락 `gesturestart` 도 막음. `overscroll-behavior: none`, viewport `maximum-scale=1, user-scalable=no, viewport-fit=cover`.
- `touchstart` 는 막지 않음: 막으면 탭 뒤 `click` 이 안 와서 R3F `onClick`(불턱 빈자리)이 안 됨.

### 휴대폰 HUD 가 겹침
- 데스크톱 배치(아래 가운데 행동 바 + 왼쪽 아래 카드)를 좁은 화면에 그대로 쓰면 오늘의 바다·행동 바·손질 패널이 겹침. 터치 화면은 `.hud.touch` 로 따로 배치하고, `capture-mobile.mjs` 가 보이는 HUD 상자끼리 겹치는지·화면 밖인지 검사.
- 버튼 글자를 CSS 로 숨기면 접근 이름도 사라짐(`getByRole(name)` 실패) → `aria-label` 을 둠 (📔 물질 마치기).
- 겹침 검사는 그 순간 보이는 것만 봄: 잠수 중에만 나오는 숨 게이지가 조이스틱·잠수 버튼과 겹쳤던 걸 놓쳤음 → 잠수 중에도 한 번 더 검사(`.breath:not(.hidden)` 포함).
- 두 손가락 줌: 캔버스 위 손가락이 둘이면 둘러보기를 멈추고 두 손가락 거리 비율로 `cameraRig.distance`(둥둥은 `floatCam.fov`)를 곱함. 한 손가락을 떼면 남은 손가락의 지금 자리부터 둘러보기를 이어서 시점이 튀지 않게.


## 배포 1단계: Docker·대기열·무중단 배포 (2026-11-04)

### Docker 이미지에서 서버가 안 뜸: `No implementation of the random number generator algorithm "L32X64MixRandom"`
- **원인**: `RandomGenerator.getDefault()` 는 `jdk.random` 모듈에서 구현을 찾는데 `eclipse-temurin:21-jre` 이미지에는 그 모듈이 없음 (JDK 에선 되므로 테스트·`dev.sh` 로는 안 보임).
- **해결**: 서버 코드는 `ThreadLocalRandom.current()` (java.base, 여러 스레드에서 써도 됨). 확인: `docker run --rm eclipse-temurin:21-jre java --list-modules | grep random` 이 비어 있음.
- deploy.sh 는 이때 새 서버 건강 확인에서 실패 → nginx 를 바꾸지 않고 이전 서버를 그대로 둠 (실제로 그렇게 동작함을 확인).

### 로컬 덮어쓰기에서 `env file backend.env not found`
- `docker-compose.local.yml` 에서 `env_file: !reset []` 로 지우려 했지만 YAML 앵커(`<<: *backend`)로 합친 값엔 적용되지 않음 → 운영 파일에서 `env_file: [{ path: backend.env, required: false }]`, 운영에서 있는지는 `deploy.sh` 가 확인.

### nginx 설정 파일 하나만 마운트하면 바꿔도 안 바뀜
- 파일을 새로 써서 바꾸면(아이노드가 바뀜) 파일 단위 bind mount 는 옛 파일을 계속 봄 → 바뀌는 `upstream.conf` 는 **폴더**(`data/nginx`)째 마운트.

### blue/green 전환 확인에서 "다시 online" 이 가끔 실패 (테스트 문제)
- 상태 기록은 50ms 마다인데 기다리는 조건은 지금 상태(`netStatus === 'online'`)를 바로 봐서, 기록이 따라오기 전에 끝남 → 조건도 기록(`restarting` 뒤에 `online` 이 있는지)으로.

### `cap.sh off` 직후 값이 그대로
- 서버가 5초마다 Redis 를 읽으므로 바로 다시 보면 이전 값. `cap.sh` 는 바꾼 뒤 6초 기다렸다가 보여 줌.

### 대기열 테스트가 9~11명만 들어감 (`ConcurrentJoinLeaveTest`)
- 자리가 나면 자동 입장이 아니라 **제안(`slot`) → `enter`** 로 바뀌어서. 가짜 클라이언트가 `slot` 을 받으면 바로 `enter` 를 보내게 함.

### 알림 테스트에서 받은 요청이 0개 (`WebhookAlertsTest`)
- `HttpClient` 에 테스트용 실행기를 넘겼더니 테스트가 실행기를 닫아 응답 처리가 멈춤 → `HttpClient` 는 기본 실행기, 보내기만 넘겨받은 실행기에서. 테스트는 받은 요청을 잠깐 기다리며 확인.

### 개발용 fps 표시(`?debug=1`)를 내렸더니 휴대폰 겹침 검사 실패
- 98px 로 내리면 잠수 중 숨 게이지·가로 화면 행동 바와 겹침 → 60px 그대로. 대기 순번(오른쪽 위)과는 개발 모드 `?debug=1` 일 때만 겹칠 수 있음 (운영엔 없음).

### 운영 설정이 빠졌는데 서버가 그냥 뜸 (`SUMBI_ALLOWED_ORIGINS`)
- **원인**: Spring Boot 는 못 찾은 환경변수 `${SUMBI_ALLOWED_ORIGINS}` 를 오류 없이 **글자 그대로** 넣음 → 아무 origin 도 맞지 않아 모두가 혼자 하는 바다로 떨어지는데 서버는 건강해 보임.
- **해결**: `SumbiProperties` 가 비었거나 `${`·`<도메인>` 이 남은 값이면 시작을 멈춤 (`SumbiPropertiesTest`). deploy.sh 건강 확인에서 걸려 이전 서버가 그대로 남음.
