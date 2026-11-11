# 배포 (운영 안내서)

> 계획·비교·결정 배경은 [deploy-plan.md](deploy-plan.md). 이 문서는 **실제로 하는 법**.
> 2026-11-04: 1단계(코드·설정·로컬 확인) 끝. 2단계(실제 배포)는 아래 **"준비할 것"** 이 끝나면 진행.

## 한눈에

```
사람들 ──https──▶ Vercel (프론트, <도메인>)
   │
   └──wss://api.<도메인>/ws──▶ Cloudflare (프록시·DDoS·TLS)
                                   │ 443 (Origin 인증서, Cloudflare IP 만 허용)
                                   ▼
                     EC2 t4g.small (서울, arm64) ─ Docker Compose
                       nginx ──▶ backend-blue  ┐ (번갈아 배포)
                             └─▶ backend-green ┘──▶ redis (오늘의 바다·동시접속 상한)
```

| 무엇 | 어디 | 비고 |
|---|---|---|
| 백엔드 이미지 | `ghcr.io/juyoon0423/sumbi-backend:sha-<커밋 7자리>` (+ `main`) | main 에 push 하면 GitHub Actions 가 **arm64** 로 만들어 올림 |
| 배포 | GitHub **Actions › Deploy › Run workflow** | 버튼. 태그를 비우면 main 마지막 커밋 |
| 되돌리기 | 같은 버튼에 **이전 태그** | 서버의 `deploy.sh` 가 끝날 때 이전 태그를 알려 줌 |
| 동시접속 상한 | **Actions › Capacity** 버튼 또는 서버에서 `./deploy/cap.sh 50` | 재시작 없이 5초 안에 반영. 처음 20명 |
| 알림 | 디스코드(또는 텔레그램) 웹훅 → 휴대폰 | 서버 시작 · 상한 도달 · 대기 발생 · 상한 변경, 같은 종류는 10분에 한 번 |
| 서버 접속 | AWS 콘솔 **Session Manager** | SSH·22번 포트 없음 |

### 파일

| 파일 | 하는 일 |
|---|---|
| `backend/Dockerfile` | 백엔드 이미지. 빌드 단계는 빌드하는 컴퓨터 아키텍처에서, 마지막 단계는 RUN 없이 (arm64 교차 빌드가 빠름). root 아닌 사용자, `SPRING_PROFILES_ACTIVE=prod` |
| `backend/src/main/resources/application-prod.yml` | 운영 설정: `SUMBI_ALLOWED_ORIGINS` 가 없으면 서버가 뜨지 않음, 상한 기본 20 |
| `deploy/docker-compose.yml` | 운영 구성 (nginx 443 · blue/green · redis, 메모리 제한, 로그 10MB×3) |
| `deploy/docker-compose.local.yml` | 로컬 확인용 덮어쓰기 (http://localhost:8090, TLS·Cloudflare 없이) |
| `deploy/deploy.sh <태그>` | 무중단 배포 (아래) |
| `deploy/cap.sh [숫자\|off]` | 동시접속 상한 보기·바꾸기 |
| `deploy/local.sh` | 로컬에서 운영 구성 띄우기 (`up` · `switch` · `cap` · `down`) |
| `deploy/nginx/` | `/ws` 프록시(업그레이드, 120초), `/health`, 나머지 404, IP 당 연결 8개·초당 5번, Cloudflare 진짜 IP |
| `deploy/.env.example` → 서버 `deploy/.env` | 이미지 주소 + 지금 쓰는 색·태그 (deploy.sh 가 관리) |
| `deploy/backend.env.example` → 서버 `deploy/backend.env` | **비밀**: 프론트 주소, 상한, 알림 웹훅. 저장소에 넣지 않음 (`.gitignore`) |
| `deploy/aws/` | EC2 사용자 데이터, 보안 그룹 스크립트, GitHub 용 IAM 정책 |
| `.github/workflows/ci.yml` | push 마다 백엔드 테스트·프론트 빌드/린트, main 이면 arm64 이미지 → GHCR |
| `.github/workflows/deploy.yml` | 배포 버튼 (OIDC → SSM → `deploy.sh`) |
| `.github/workflows/cap.yml` | 상한 버튼 (OIDC → SSM → `cap.sh`) |

**도메인이 들어갈 자리 (정해지면 이 세 곳만)**: 서버 `deploy/backend.env` 의 `SUMBI_ALLOWED_ORIGINS`, Vercel 의 `VITE_WS_URL`, Cloudflare Origin 인증서의 호스트 이름. nginx 는 `server_name _` 이라 바꿀 필요 없음.

---

## 늘 하는 일

### 배포하기 (버튼)
1. `main` 에 push → GitHub **Actions** 탭에서 **CI** 가 초록색이 될 때까지 (테스트 → 이미지). 요약에 `sha-xxxxxxx 준비됨`.
2. **Actions › Deploy › Run workflow** → 태그 칸 비우기(= main 마지막 커밋) → **Run workflow**.
3. 1~2분 뒤 초록색이면 끝. 접속 중인 사람은 "바다를 새로 단장하고 있어요" 가 1~3초 보였다가 다시 이어짐.

`deploy.sh` 가 하는 일: 쉬고 있는 색(blue/green)에 새 이미지 → 그 컨테이너 안에서 `/health` 확인(최대 2분) → nginx 를 새 색으로 바꾸고 reload → 이전 색을 멈춤(SIGTERM → 접속자에게 **1012** → 0.3~3초 사이 아무 때나 새 서버로 다시 접속).
**새 서버가 건강하지 않으면 nginx 를 바꾸지 않고 이전 서버를 그대로 둠** (로그 60줄을 보여 주고 실패).

> 다시 접속하면 새 서버에선 새 해녀 번호로 들어감 (방·재접속 정보는 서버 메모리). 오늘의 바다·동시접속 상한은 Redis 라 그대로.

### 되돌리기
**Actions › Deploy › Run workflow** 에 이전 태그(예: `sha-1a2b3c4`)를 넣고 실행. 태그는 Actions 의 이전 Deploy 기록이나 GitHub **Packages › sumbi-backend** 에서 확인.

### 동시접속 상한 바꾸기 (재시작 없이)
- **휴대폰에서**: GitHub 앱/웹 → 저장소 → **Actions › Capacity › Run workflow** → `50` (또는 `off` = 기본값, 빈칸 = 지금 값 보기)
- **서버에서 한 줄** (Session Manager): `cd /opt/sumbi && ./deploy/cap.sh 50`
- 같은 뜻의 Redis 한 줄: `docker compose -f /opt/sumbi/deploy/docker-compose.yml exec redis redis-cli SET sumbi:config:max-total 50`

서버는 5초마다 Redis 값 `sumbi:config:max-total` 을 읽음 (0~5000, 없거나 이상하면 `backend.env` 의 `SUMBI_MAX_TOTAL`). 올리면 기다리던 사람에게 바로 "바다에 자리가 났어요". 내려도 이미 들어온 사람을 내보내지는 않음 (새로 오는 사람부터 대기). **상한을 크게 올리기 전엔 k6 부하 테스트로 확인** (3단계).

### 대기·알림
- 상한에 닿으면 새로 온 사람은 **혼자 하는 바다에서 놀면서 대기** (구석에 `⏳ 대기 N번째 · 약 N분`). 자리가 나면 차임 + "🌊 바다에 자리가 났어요 · 바다에 들어가기" 카드(45초). 놓치면 대기열 맨 뒤로.
- 알림 (`SUMBI_ALERT_WEBHOOK_URL` 이 있을 때): `🟢 서버 시작`(배포 때마다 한 번) · `🌊 바다가 가득 찼어요: 20 / 20명` · `⏳ 대기 시작: N명이 기다려요` · `⚙️ 동시접속 상한 20 → 50명`. 같은 종류는 `SUMBI_ALERT_MIN_INTERVAL_MS`(10분)에 한 번, 다음 알림에 "지난 10분 동안 비슷한 알림 K번 더".

### 서버 들여다보기 (Session Manager)
```bash
cd /opt/sumbi/deploy
./cap.sh                                   # 상한·인원·대기
docker compose ps                          # 컨테이너 상태 (쉬는 색은 Exited 가 정상)
docker compose logs --tail 100 -f backend-blue   # 지금 색 로그 (ACTIVE 는 cat .env)
docker stats --no-stream                   # 메모리
```

---

## 로컬에서 운영 구성 확인 (Docker Desktop)

```bash
cd deploy && ./local.sh up                 # 이미지 빌드 + nginx·blue·redis (http://localhost:8090/health)
cd frontend && VITE_WS_URL=ws://localhost:8090/ws npx vite --port 5174   # 이 프론트로 접속
cd frontend && node scripts/capture-deploy-switch.mjs <폴더>            # 접속한 채 blue↔green 배포 → 1012 → 다시 접속 확인
SUMBI_URL=http://localhost:5174 SUMBI_API=http://localhost:8090 SUMBI_REDIS_CLI="redis-cli -p 6390" node scripts/capture-queue.mjs <폴더>
cd deploy && ./local.sh cap 5              # 상한 바꾸기 / ./local.sh down
```
평소 개발은 그대로 `./dev.sh`.

---

## 준비할 것 (사용자, 순서대로)

> 화면 이름은 2026-11 기준. 조금 달라도 같은 이름의 메뉴를 찾으면 됨.
> 비밀 값(인증서 키, 웹훅 주소, 토큰)은 **채팅·저장소·스크린샷에 남기지 말고** 비밀번호 관리자에 잠깐 두었다가 서버에 바로 넣기.

### 0. 정하기
- [ ] **도메인 이름** (예: `sumbi.kr`). 아래에서 `<도메인>` 이라고 쓴 자리. 프론트는 `<도메인>`·`www.<도메인>`, 서버는 `api.<도메인>`.

### 1. 도메인 사기
- [ ] **Cloudflare 에서 사면 가장 간단** (네임서버 바꾸기 단계가 없음): Cloudflare 가입 후 왼쪽 **Domain Registration › Register Domains** → 이름 검색 → **Purchase**. (`.kr` 은 Cloudflare 에서 못 사므로 가비아 등에서 사고 2번의 네임서버 바꾸기를 함)

### 2. Cloudflare
1. [ ] (다른 곳에서 샀으면) **Add a domain** → 도메인 입력 → **Free** 요금제 → **Continue** → 화면에 나온 네임서버 2개를 구매한 곳(예: 가비아 › My가비아 › 도메인 관리 › 네임서버 설정)에 입력 → Cloudflare 에서 상태가 **Active** 가 될 때까지 (몇 분~몇 시간).
2. [ ] **SSL/TLS › Overview** → 암호화 모드 **Full (strict)**.
3. [ ] **SSL/TLS › Edge Certificates** → **Always Use HTTPS** 켜기, **Minimum TLS Version** 1.2.
4. [ ] **SSL/TLS › Origin Server › Create Certificate** → "Generate private key and CSR with Cloudflare", 키 종류 **RSA (2048)**, 호스트 이름 `<도메인>`, `*.<도메인>`, 유효 기간 **15 years** → **Create**.
   - 나오는 **Origin Certificate** 와 **Private Key** 를 각각 복사해 둠. **개인 키는 이 화면에서만 볼 수 있음** (닫으면 새로 만들어야 함). 7-4 에서 서버에 넣음.
5. [ ] **Network** → **WebSockets** 켜짐 확인 (기본 켜짐).
6. [ ] DNS 레코드는 EC2(4번)·Vercel(6번)을 만든 뒤에 넣음.

### 3. AWS 계정 지키기 (처음 한 번)
1. [ ] 오른쪽 위 계정 이름 → **Security credentials** → **Multi-factor authentication (MFA) › Assign MFA device** → 인증 앱(Google Authenticator 등) → QR 찍고 코드 두 번 → 루트 계정 MFA.
2. [ ] **IAM › Users › Create user** → 이름 `juyoon-admin` → "Provide user access to the AWS Management Console" 체크 → **Attach policies directly › AdministratorAccess** → 만든 뒤 이 사용자에도 MFA. 이후로는 이 사용자로 로그인 (루트는 결제·계정 설정만).
3. [ ] **Billing and Cost Management › Budgets › Create budget** → **Use a template › Monthly cost budget** → 금액 `15` USD → 받을 이메일 → **Create**. (85%·100% 에서 메일)
4. [ ] 오른쪽 위 지역(Region)을 **아시아 태평양(서울) ap-northeast-2** 로.

### 4. AWS 서버 (EC2)
1. [ ] **IAM › Roles › Create role** → **AWS service** · **EC2** → **Next** → 정책 `AmazonSSMManagedInstanceCore` 체크 → 이름 `sumbi-ec2-ssm` → **Create role**. (서버가 Session Manager·배포 버튼을 받게 하는 권한)
2. [ ] **EC2 › Security Groups › Create security group** → 이름 `sumbi-web`, 설명 `cloudflare 443 only`, VPC 기본값 → 인바운드 규칙 **비워 둔 채** **Create** → 만들어진 ID(`sg-…`) 복사.
   - 위쪽 **CloudShell**(`>_` 아이콘) 열기 → 저장소의 `deploy/aws/allow-cloudflare.sh` 내용을 붙여 넣어 파일로 저장하거나, 아래처럼 실행:
     ```bash
     nano allow-cloudflare.sh   # 내용 붙여 넣고 Ctrl+O, Enter, Ctrl+X
     bash allow-cloudflare.sh sg-여기에ID
     ```
   - Cloudflare IP 22개에서 오는 **443 만** 허용됨. 22·80 은 열지 않음.
3. [ ] **EC2 › Instances › Launch instances**
   - 이름 `sumbi-1`
   - **Application and OS Images**: **Ubuntu** → `Ubuntu Server 24.04 LTS` → 아키텍처 **64-bit (Arm)**
   - **Instance type**: `t4g.small`
   - **Key pair**: **Proceed without a key pair** (접속은 Session Manager)
   - **Network settings › Edit** → Auto-assign public IP **Enable** → **Select existing security group** → `sumbi-web`
   - **Configure storage**: `20` GiB **gp3**
   - **Advanced details** → **IAM instance profile**: `sumbi-ec2-ssm` → **Metadata version**: **V2 only (token required)** → **User data**: `deploy/aws/ec2-user-data.sh` 내용을 통째로 붙여 넣기 (Docker·git·스왑 설치)
   - **Launch instance** → 인스턴스 ID(`i-…`) 복사
4. [ ] **EC2 › Elastic IPs › Allocate Elastic IP address › Allocate** → 만든 IP 선택 → **Actions › Associate Elastic IP address** → 인스턴스 `sumbi-1` → **Associate**. 이 IP 를 복사.
5. [ ] Cloudflare **DNS › Records › Add record**: 종류 **A**, 이름 `api`, IPv4 = Elastic IP, Proxy status **Proxied(주황 구름)** → **Save**.
6. [ ] 3~5분 뒤 **EC2 › Instances › sumbi-1 › Connect › Session Manager › Connect** → 검은 창이 열리면 성공. 아래 7번을 이 창에서.

### 5. GitHub → AWS 연결 (배포 버튼용, 비밀 키 없이)
1. [ ] **IAM › Identity providers › Add provider** → **OpenID Connect** → Provider URL `https://token.actions.githubusercontent.com` → Audience `sts.amazonaws.com` → **Add provider**.
2. [ ] **IAM › Roles › Create role** → **Web identity** → Identity provider `token.actions.githubusercontent.com`, Audience `sts.amazonaws.com`, GitHub organization `juyoon0423`, repository `sumbi` → **Next** → 정책은 고르지 않고 **Next** → 이름 `sumbi-github-deploy` → **Create role**.
3. [ ] 만든 역할 → **Trust relationships › Edit trust policy** → `deploy/aws/github-trust-policy.json` 내용으로 바꾸고 `<AWS 계정 번호 12자리>` 채우기 → **Update policy**. (`environment:production` 에서만 이 역할을 쓸 수 있게)
4. [ ] 같은 역할 → **Permissions › Add permissions › Create inline policy › JSON** → `deploy/aws/github-deploy-policy.json` 내용, 계정 번호·인스턴스 ID 채우기 → 이름 `sumbi-ssm-deploy` → **Create policy**. (이 서버에 명령 보내기만 가능)
5. [ ] 역할 맨 위 **ARN**(`arn:aws:iam::…:role/sumbi-github-deploy`) 복사.

### 6. Vercel (프론트)
1. [ ] vercel.com → **Continue with GitHub** → **Add New… › Project** → **Import Git Repository** → GitHub 권한 화면에서 **Only select repositories › sumbi** → **Import**.
2. [ ] **Root Directory**: `frontend` (Edit 눌러 고르기) → Framework Preset **Vite** (자동) → Build `npm run build`, Output `dist` (기본값).
3. [ ] **Environment Variables**: Key `VITE_WS_URL`, Value `wss://api.<도메인>/ws`, 환경은 **Production 만** 체크 (Preview·Development 해제) → **Deploy**.
   - 미리보기 배포는 이 값이 없어서 **혼자 하는 바다로만** 동작. 실수로 넣어도 코드가 Vercel 미리보기(`VITE_VERCEL_ENV`)에선 서버에 붙지 않음 (Settings › Environment Variables 의 "Automatically expose System Environment Variables" 는 켜진 채로 두기).
   - `VITE_WS_URL` 을 바꾸면 **Deployments › … › Redeploy** 해야 반영 (빌드할 때 들어감).
4. [ ] **Settings › Domains** → `<도메인>` 과 `www.<도메인>` 추가 → Vercel 이 알려 주는 레코드(보통 `A @ 76.76.21.21`, `CNAME www cname.vercel-dns.com`)를 Cloudflare **DNS** 에 추가하되 Proxy status **DNS only(회색 구름)**.

### 7. 서버 준비 (4-6 의 Session Manager 창에서)
1. [ ] ubuntu 사용자로 바꾸고 Docker 설치 확인
   ```bash
   sudo -iu ubuntu
   docker version && docker compose version   # 안 되면 몇 분 뒤 (사용자 데이터 설치 중) 또는 exit 후 다시
   ```
2. [ ] 저장소 읽기 전용 키 (서버가 `deploy/` 설정을 받아 오게)
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/sumbi_deploy -N "" -C sumbi-server
   printf 'Host github.com\n  IdentityFile ~/.ssh/sumbi_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
   cat ~/.ssh/sumbi_deploy.pub
   ```
   GitHub 저장소 → **Settings › Deploy keys › Add deploy key** → Title `sumbi-server`, Key 에 위 한 줄 → **Allow write access 체크하지 않음** → **Add key**.
   ```bash
   ssh -o StrictHostKeyChecking=accept-new -T git@github.com   # "successfully authenticated" 면 OK
   git clone git@github.com:juyoon0423/sumbi.git /opt/sumbi
   ```
3. [ ] 이미지 받기용 토큰 (GHCR, 읽기만): GitHub 오른쪽 위 프로필 → **Settings › Developer settings › Personal access tokens › Tokens (classic) › Generate new token (classic)** → Note `sumbi-server-ghcr`, Expiration 1년, 권한 **`read:packages` 하나만** → **Generate token** → 복사.
   ```bash
   docker login ghcr.io -u juyoon0423     # Password 에 토큰 붙여 넣기 (화면에 안 보임, 기록에 안 남음)
   ```
4. [ ] 설정·인증서
   ```bash
   cd /opt/sumbi/deploy
   cp .env.example .env
   cp backend.env.example backend.env && chmod 600 backend.env
   nano backend.env        # SUMBI_ALLOWED_ORIGINS=https://<도메인>,https://www.<도메인> · 알림 웹훅(8번) — Ctrl+O, Enter, Ctrl+X
   mkdir -p data/certs
   nano data/certs/origin.pem   # 2-4 의 Origin Certificate 붙여 넣기
   nano data/certs/origin.key   # 2-4 의 Private Key 붙여 넣기
   chmod 600 data/certs/origin.key
   ```

### 8. 휴대폰 알림 (디스코드 웹훅, 무료)
1. [ ] 디스코드 앱 → 왼쪽 **+ (서버 추가)** → **직접 만들기** → **나와 친구들을 위한 서버** → 이름 `숨비 알림` → **만들기**.
2. [ ] `# 일반` 채널 옆 **⚙️ 채널 편집** → **연동(Integrations)** → **웹후크 › 새 웹후크** → 이름 `숨비` → **웹후크 URL 복사**.
3. [ ] 서버의 `deploy/backend.env` 의 `SUMBI_ALERT_WEBHOOK_URL=` 뒤에 붙여 넣기 (7-4). **이 주소는 비밀** (아는 사람은 누구나 채널에 글을 씀).
4. [ ] 휴대폰 디스코드 → 서버 이름 길게 누르기 → **알림 설정 › 모든 메시지**.
5. [ ] 시험: 서버에서 `curl -H 'Content-Type: application/json' -d '{"content":"숨비 알림 시험"}' "$(grep ^SUMBI_ALERT_WEBHOOK_URL= /opt/sumbi/deploy/backend.env | cut -d= -f2-)"` → 휴대폰에 알림.
   - 텔레그램이 좋으면: @BotFather → `/newbot` → 토큰, 봇에게 말 한 번 건 뒤 `https://api.telegram.org/bot<토큰>/getUpdates` 에서 chat id → `SUMBI_ALERT_WEBHOOK_URL=https://api.telegram.org/bot<토큰>/sendMessage`, `SUMBI_ALERT_TELEGRAM_CHAT=<chat id>`.

### 9. GitHub 저장소 설정
1. [ ] 저장소 **Settings › Environments › New environment** → 이름 `production` → **Configure environment**
   - **Deployment branches and tags** → **Selected branches and tags** → `main` 추가
   - **Environment variables › Add variable** 세 개: `AWS_ROLE_ARN` = 5-5 의 ARN, `AWS_REGION` = `ap-northeast-2`, `EC2_INSTANCE_ID` = 4-3 의 `i-…`
   - (비밀 값은 없음: AWS 는 OIDC 라 키가 필요 없음)
2. [ ] 저장소를 공개로 바꿀 거면 "공개 전 점검"·"공개로 바꾸기" (아래).

### 10. 첫 배포 (2단계 — 함께)
1. [ ] main 에 push 되어 **Actions › CI** 초록색 → **Packages** 에 `sumbi-backend` 생김 (private).
2. [ ] **Actions › Deploy › Run workflow** (태그 비움).
3. [ ] 확인: `https://api.<도메인>/health` 에 `"status":"ok"` · `https://<도메인>` 에서 입장 → 휴대폰과 PC 가 같은 바다 · 휴대폰에 "서버 시작" 알림 · **Actions › Capacity** 에 `1` 을 넣고 두 번째 기기가 대기 화면이 되는지 → `off`.
4. [ ] **UptimeRobot** (무료): **Add New Monitor** → HTTP(s) → URL `https://api.<도메인>/health` → 5분 간격 → 알림 이메일/앱. (서버가 아예 죽으면 서버 알림은 못 보내므로)

---

## 공개 전 점검 (저장소를 public 으로 바꾸기 전에)
- [ ] 커밋 기록 전체에서 비밀 찾기 (Claude 에게 "공개 전 점검" 이라고 하면 함께): `git log -p --all` 에서 웹훅·토큰·키 모양 검색, `gitleaks` 같은 도구로 한 번 더, 지운 파일(`git log --all --diff-filter=D --name-only`)도 확인
- [ ] 나왔으면 그 값을 **먼저 폐기·재발급** (웹훅 삭제 후 새로, 토큰 revoke) → 그다음 기록 정리
- [ ] Actions 로그·Packages 공개 범위 확인 (패키지는 저장소와 따로 private 유지 가능)

> 2026-11-11 점검 완료: 파일·히스토리·지운 파일·브랜치에 비밀 없음. 커밋 작성자 이메일은 공개됨(그대로 두기로, 앞으로는 noreply). 라이선스 없이 "All rights reserved". Actions 실행 기록은 CI 4번뿐(배포 기록 없음)

## 공개로 바꾸기 (사용자가 GitHub 에서 직접)
1. [ ] **앞으로의 커밋 이메일을 noreply 로**: GitHub **Settings › Emails** → **Keep my email addresses private** 켜기 → 아래에 보이는 `<숫자>+juyoon0423@users.noreply.github.com` 복사 → 같은 화면 **Block command line pushes that expose my email** 켜기 → 이 저장소에서 `git config user.email "<복사한 주소>"` (모든 저장소면 `--global`) → `git config user.email` 로 확인
2. [ ] 저장소 **Settings › General › Danger Zone › Change repository visibility** → **Make public** → 저장소 이름 입력. Packages(`sumbi-backend`)는 따로 private 로 남음 (서버는 `read:packages` 토큰으로 받으니 그대로)
3. [ ] **Settings › Actions › General**
   - **Fork pull request workflows from outside collaborators** → **Require approval for all outside collaborators**
   - **Workflow permissions** → **Read repository contents and packages permissions** (지금 이미 읽기 전용) · **Allow GitHub Actions to create and approve pull requests** 끔
4. [ ] **Settings › Environments › production**: Deployment branches 가 `main` 만인지. (원하면 **Required reviewers** 에 본인 → 배포 버튼 뒤 한 번 더 승인)
5. [ ] **Settings › Rules › Rulesets › New branch ruleset** → 이름 `main`, Enforcement **Active**, Target **Include default branch** → **Restrict deletions**·**Block force pushes** 만 켬. (PR 필수·상태 검사 필수는 켜지 않음 — main 에 바로 push 하는 작업 방식이라)
6. [ ] **Settings › Advanced Security**(또는 Code security): **Secret scanning**·**Push protection** 켜기 (공개 저장소는 무료, 앞으로 실수로 올리는 토큰을 push 단계에서 막음) · **Dependabot alerts** 켜기
7. [ ] (선택) **Settings › General**: 안 쓰는 **Projects** 끄기 · **Social preview** 에 `docs/screenshots/sea-friends/dolphin-float.jpg` 올리기 · 저장소 **About** 에 설명·주제(threejs, react-three-fiber, spring-boot, websocket)
8. [ ] 확인: 로그아웃한 창(시크릿)에서 저장소 열어 README·사진 보이는지 → Claude 에게 "공개 전환 끝" → ci.yml ARM 러너로 바꾸기 ([progress.md](progress.md) "저장소 공개 뒤")

## 문제가 생기면
- 배포 버튼이 빨간색: Actions 로그 맨 아래 SSM 출력에 `deploy.sh` 결과 (새 서버가 건강하지 않으면 이전 서버가 그대로 돌고 있음)
- `Not authorized to perform sts:AssumeRoleWithWebIdentity`: 5-3 의 `sub` 가 `repo:juyoon0423/sumbi:environment:production` 인지, 9-1 의 환경 이름이 `production` 인지
- SSM `InvalidInstanceId`: 서버에 `sumbi-ec2-ssm` 역할이 붙었는지(4-3), 서버가 켜져 있는지
- 브라우저가 계속 "혼자 하는 바다": `backend.env` 의 `SUMBI_ALLOWED_ORIGINS` 가 실제 프론트 주소와 같은지 (https, www 포함 여부), Vercel `VITE_WS_URL` 후 Redeploy 했는지
- 그 밖: [troubleshooting.md](troubleshooting.md)
