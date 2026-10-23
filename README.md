# ORBITAL · AI Solution Challenge

위성 활용 정보를 모아 **사업 기회 검토 → 의사결정 → 가정·실적 관리**로 연결하는 전략 인텔리전스 대시보드입니다.

기존 팀 프로젝트의 업무 흐름을 유지하면서, 위성 지형·구름·도시 불빛과 주황색 거점이 표시되는 3D 지구본으로 개선했습니다.

![ORBITAL 지구본과 분야별 정보 화면](docs/orbital-preview.png)

## 실행

Node.js **22.13 이상**, pnpm **11.25.0**이 필요합니다. 검증 환경은 Windows / Node.js 24입니다.

```powershell
npm run install:ci
npm run build
npm run db:setup
npm run dev -- --hostname 127.0.0.1
```

브라우저에서 [http://127.0.0.1:5173](http://127.0.0.1:5173)을 엽니다. 처음 조회할 때 기초자료 6건과 검토 예시 3건을 생성합니다. `지금 수집`은 실제 RSS 피드를 요청하므로 인터넷 연결이 필요합니다. 이후 실행은 `npm run dev`만으로 가능합니다.

`db:setup`은 로컬 DB 테이블이 이미 있으면 데이터를 유지합니다. 데이터는 Git에서 제외되는 `.wrangler/state/`에 저장됩니다. 서버 종료는 실행 터미널에서 Ctrl+C를 누릅니다.

## 주요 기능

- **글로벌 인사이트:** 지구본 거점 탐색, 분야 선택, 최근 수집 정보.
- **뉴스·지식베이스:** 검색, 분야 필터, 공식 출처 구분, 원문 확인 기록.
- **사업·투자 검토:** 사업 가설, 근거 자료, 가중 점수와 검토 단계.
- **의사결정 기록:** 추진·보류·종료의 근거와 조건 저장.
- **가정·실적 관리:** 목표와 실제 측정값 비교 및 이력.
- **수집·업데이트:** 8개 RSS 피드의 수집 결과와 소스별 상태.

지구본은 드래그/방향키로 회전하고, +/−로 확대·축소, Home으로 초기화할 수 있습니다. Space는 자동 회전을 전환합니다. 거점은 Tab/Enter로도 선택할 수 있습니다.

## 구현 범위

현재 정보 분류는 **키워드 규칙**을 사용하고 사업 영향은 **분야별 고정 가설**입니다. LLM·RAG·자동 사실 검증은 포함하지 않습니다. 기사 본문과 계약·금액·일정 등은 원문 확인이 필요합니다.

거점은 탐색용 대표 좌표입니다. `N건 · 분야 신호`는 **분야 전체의 자료 수**이며 국가별 기사 수가 아닙니다. 국가 선택은 지구본 표시와 연결되며, 기사 데이터에 국가 필드는 없습니다. 구름과 조명은 실시간 관측이 아닌 시각 표현입니다.

60초마다 저장된 상태를 조회하지만, 이것이 자동 RSS 수집을 실행하지는 않습니다. 지속적인 정시 수집에는 별도의 스케줄러 연결이 필요합니다. 공개 운영 전에는 호스팅 접근 정책과 업무 API의 인증·권한 처리를 별도로 구성해야 합니다.

## 소스 구조

```text
app/
  page.tsx                 # 대시보드와 업무 화면
  globals.css              # 스타일 / 마지막 부분에 지구본 디자인
  components/Globe.tsx     # 지구본·거점·조작
  api/[...path]/route.ts   # API 진입
lib/
  globe-renderer.ts        # WebGL 표면·불빛·구름·대기광
  globe-geometry.ts        # 좌표 투영·선택
  strategy-config.ts       # 분야·사업 가설·RSS 소스
  strategy-server.ts       # 수집 및 업무 API
db/                        # Drizzle 스키마
drizzle/                   # 초기 DB SQL
public/textures/           # 로컬 지구 텍스처 및 출처
docs/                      # 소스 분석·디자인 명세·원본 보관
tests/                     # 지구본 좌표 검증
```

기술: React 19, TypeScript, Vinext/Vite(Next App Router 호환), Cloudflare Workers/D1, Drizzle. 지구본은 WebGL + Canvas 2D + HTML 버튼으로 구성하며 추가 3D 라이브러리를 사용하지 않습니다.

## 검증

```powershell
npm run typecheck
npm run test:globe
npm run test:workflow
npm run build
```

좌표·역투영·날짜변경선 테스트 3개와 업무 흐름 검증 26개를 포함합니다. 업무 흐름 검증은 메모리 DB를 사용합니다.

자세한 인수인계는 [프로젝트 분석](docs/PROJECT-ANALYSIS.md), 시각 명세는 [지구본 디자인](docs/element.md), 이미지 출처는 [텍스처 출처](public/textures/ATTRIBUTION.md)를 참고하세요. 전달받은 프레임워크 설명은 [원본 README](docs/original/README.md.txt)에 보관했습니다.
