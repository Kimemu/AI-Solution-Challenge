# ORBITAL 소스 분석 및 인수인계

분석일: 2026-10-23 (Asia/Seoul). 실제 소스와 로컬 실행을 기준으로 작성했다. 첨부 이미지는 지구본 시각 참고자료로만 사용했다.

## 1. 프로젝트 범위

위성 활용 정보를 수집하고, 분야별 사업 가설 → 검토 안건 → 의사결정 → 가정·실적 이력으로 연결하는 웹 대시보드다. 팀원의 기존 사업 흐름을 유지하고 지구본 표현과 로컬 실행 준비를 개선했다.

이 폴더는 **독립적인 프런트엔드·백엔드 프로젝트**다. 상위 `solution` 폴더의 Express/Cheerio 프로젝트와 package.json, 서버, API가 다르다. 현재 ORBITAL은 상위 프로젝트의 `/api/v1/tools/crawl`을 호출하지 않는다. 상위 폴더에서 실행하면 ORBITAL이 아닌 별도 도구가 열린다.

소스는 Git 저장소가 없는 상태로 전달되었다. 이번 수정 전 주요 원본은 `docs/original/`에 보관했다. 호스팅 설정의 기존 Site ID는 유지했으며, 이번 작업에서 원격 배포는 수행하지 않았다.

## 2. 실행 기술과 주요 파일

| 영역 | 구현 | 수정·분석 시작점 |
|---|---|---|
| 화면 | React 19, TypeScript, Next App Router 호환 Vinext/Vite | `app/page.tsx` |
| 스타일 | Tailwind 4 로딩 + 직접 작성한 전역 CSS | `app/globals.css` |
| 지구본 UI | React, HTML 버튼, Canvas 2D 장식 | `app/components/Globe.tsx` |
| 지구 표면 | 별도 패키지 없이 WebGL 셰이더, 로컬 텍스처 | `lib/globe-renderer.ts` |
| 좌표·선택 | 회전 투영, 역투영, 국가 폴리곤 판정 | `lib/globe-geometry.ts` |
| 분야·RSS 정의 | 6개 분야, 대표 위치, 사업 질문·가설·주의사항, 8개 피드 | `lib/strategy-config.ts` |
| API 진입 | 모든 API를 단일 디스패처에 전달 | `app/api/[...path]/route.ts` |
| 업무 로직 | 수집·분류·검증·기록 저장·충돌 처리 | `lib/strategy-server.ts` |
| DB | Cloudflare D1(SQLite), Drizzle 스키마 | `db/schema.ts`, `drizzle/0000_perpetual_polaris.sql` |
| 런타임 | Cloudflare Worker, 로컬 D1 바인딩 | `worker/index.ts`, `vite.config.ts` |
| 선택적 연동 | 요청 단위 커넥터 컨텍스트, 로컬 로그인 도우미 | `lib/connector-*`, `app/chatgpt-auth.ts` |
| 외부 수집 보조 | RSS 결과를 서버로 전달하는 Python 스크립트 | `public/updater.py` |

`components/ui/`는 공유 UI 라이브러리다. 주요 업무 화면은 `app/page.tsx`에 집중되어 있고, 지구본은 독립 컴포넌트다. 지구본 개선만 할 때 전체 페이지를 재작성할 필요가 없다.

## 3. 화면과 데이터 흐름

```text
브라우저 app/page.tsx
  ├─ 최초 로딩 / 60초 간격 GET /api/state
  │    └─ 기본 자료 생성 → D1 조회 → 상태·기사·안건·이력 표시
  ├─ 사용자의 '지금 수집' POST /api/refresh
  │    └─ 8개 RSS 요청 → 분류·중복 제거 → D1 저장 → 상태 다시 로딩
  └─ 검토·결정·실적 입력 → 해당 API → D1 기록 + audit 이력

Globe.tsx
  ├─ 로컬 지형·야간·구름 텍스처 → WebGL 지구 표면
  ├─ 동일한 회전 수식 → 위경도 거점 HTML 버튼 위치
  ├─ 분야가 지정된 거점 → onSelect → 분야별 기사 필터
  └─ 국가 선택 → 국가 표시·윤곽 강조 (국가별 기사 필터 아님)
```

60초 간격 요청은 **저장된 상태 조회**다. 자동 RSS 수집이 아니다. `/api/schedule`도 자동화 설정에 관한 메타데이터만 저장한다. 지속적인 정시 수집에는 실제 외부 스케줄러가 연결되어 있어야 한다.

## 4. API와 저장 구조

| 메서드 | 경로 | 역할 |
|---|---|---|
| GET | `/api/state` | 초기 자료 생성 및 전체 상태 조회 |
| GET | `/api/update-manifest` | 외부 수집기가 사용할 소스·전송 규격 |
| POST | `/api/refresh` | RSS 수집. 약 60초 중복 실행 제한 |
| POST | `/api/ingest` | 외부 수집 결과 반영 |
| POST | `/api/records` | opportunity / assumption 생성 |
| PATCH | `/api/records/:id` | revision 확인 후 수정 |
| POST | `/api/decisions` | 검토 단계 변경 및 판단 근거 저장 |
| POST | `/api/actuals` | 가정에 연결된 실적 입력 및 이력 |
| POST | `/api/verify` | 사용자의 원문 확인 기록 |
| POST | `/api/schedule` | 자동화 식별자·활성 상태 기록 |

| 테이블 | 주요 내용 |
|---|---|
| signals | URL 고유값, JSON 형태 기사·자료, 수집 시간 |
| records | 안건·가정·의사결정·실적·스케줄·시스템 잠금, revision |
| audit | 행위, 대상, 내용, 기록자, 시각 |
| refresh_runs | 수집 시작·완료 시간, 상태, 추가 수, 소스별 성공·실패 |

기본 자료 6건과 샘플 검토 안건 3건을 `initialize()`에서 `INSERT OR IGNORE`로 생성한다. 실제 투자 등록액과 샘플 안건은 화면 집계에서 구분한다. `revision`이 다른 수정은 409로 거부한다.

## 5. 현재 'AI' 기능의 실제 구현

현재 소스에는 LLM 호출·임베딩 검색·RAG 파이프라인이 없다.

- 분야 분류: 기사 제목의 키워드/정규식과 피드의 기본 분야.
- 엔터티: 정의된 기업·기술 단어 목록의 문자열 매칭.
- 사업 영향·불확실성: `strategy-config.ts`의 분야별 고정 가설.
- 투자 점수: 적합성 30%, 수요 25%, 경제성 25%, 차별성 20%의 가중 점수.
- 기사 수집: RSS 메타데이터. 일반 뉴스 검색 결과는 본문을 분석하지 않는다.
- 원문 검증: 사용자가 작성한 확인 기록. 자동 사실 검증이 아니다.

제출 설명에서도 이 구현 범위를 그대로 설명하는 것이 적절하다. AI 모델 기반 기사별 분석을 추가하려면 서버 분석 단계와 분석 결과·모델·근거의 저장 구조를 별도로 설계해야 한다.

## 6. 지구본: 원인과 변경

### 기존 문제

기존 `Globe.tsx`는 Canvas 2D에 국가 폴리곤을 단색으로 그렸다. 위성 지형·야간 도시 불빛·구름 텍스처가 없고, 청록 계열 지도/격자/영문 국가명이 중심이어서 참고 이미지의 사진 기반 지구와 달랐다. 국가가 수평선 뒤로 넘어갈 때 폴리곤을 단순히 잇는 방식도 왜곡 가능성이 있었다.

### 적용한 변경

- 위경도 기반 텍스처를 직교 투영 구면에 샘플링하는 WebGL 렌더러.
- 지형, 도시 불빛, 구름, 방향광과 푸른 가장자리 대기광.
- 짙은 남색 패널, 희미한 궤도, 주황색 거점, 한글 반투명 라벨.
- 뒷면 거점 숨김, 화면 안의 라벨 충돌 회피, 선택 국가 윤곽 표시.
- 가로·세로 드래그, 자동 회전, 일시정지, 확대·축소, 아시아 시점/확대 초기화.
- 방향키·+/−·Home·Space 조작, 거점 Tab/Enter 선택, 모션 감소 설정 반영.
- 화면 밖이나 숨겨진 탭에서 그리기 생략. 정지 상태는 변경이 있을 때만 다시 그린다.
- WebGL/텍스처 오류 안내와 기존 분야 버튼 유지.

새 렌더링용 npm 의존성은 추가하지 않았다. 텍스처 3개의 합계는 약 1.44 MiB이며 브라우저 실행 중에는 외부 이미지 서버에 접근하지 않는다. 이미지 출처는 `public/textures/ATTRIBUTION.md`에 기록했다.

거점은 **탐색용 대표 좌표**다. `22건 · 분야 신호`와 같은 숫자는 우주·기술 등의 분야 전체 수이며 해당 국가의 기사 수가 아니다. 현재 기사 데이터에 국가 필드가 없으므로 국가별 기사 필터는 구현하지 않았다. 지구 조명도 시각 연출이며 실제 현재 태양 위치·실시간 기상 표현이 아니다.

### 조정 위치

| 바꾸려는 항목 | 파일·지점 |
|---|---|
| 초기 대륙·기울기 | `lib/globe-geometry.ts`: INITIAL_YAW, INITIAL_TILT |
| 지구 크기 | 같은 파일의 globeBounds |
| 회전 속도 | `Globe.tsx`: dt * .0025 |
| 거점·국가명·분야 연결 | `Globe.tsx`: locations |
| 지구 밝기·구름·불빛·대기광 | `lib/globe-renderer.ts`: fragmentSource |
| 패널·라벨·조작 버튼 | `app/globals.css` 마지막 Reference globe 구간 |
| 분야별 질문·가설 | `lib/strategy-config.ts`: sectors |

## 7. 로컬 실행과 확인

처음에는 의존성과 DB 테이블이 없어 실행 준비가 필요했다. pnpm 잠금 파일을 그대로 사용해 패키지를 설치하고, 로컬 D1에 원본 초기 SQL을 적용했다. Windows에서도 동작하도록 `install:ci` 진입점을 보완했다. `db:setup`은 기존 테이블이 모두 있으면 데이터를 유지하고 종료한다.

```powershell
# 이 프로젝트 폴더에서 실행. Node.js >=22.13, pnpm 11.25 필요.
npm run install:ci
npm run build
npm run db:setup
npm run dev -- --hostname 127.0.0.1
```

기본 주소: `http://127.0.0.1:5173/`. 상위 Express 프로젝트의 8000 포트와 다르다. DB는 `.wrangler/state/`에 저장되며 소스 배포 파일에 포함하지 않는다.

```powershell
npm run typecheck
npm run test:globe
npm run test:workflow
npm run build
```

확인 결과: 타입 검사 통과, 지구 좌표·역투영·날짜변경선 테스트 3개 통과, 기존 업무 흐름 검증 26개 통과, 클라이언트/서버 빌드 성공. 브라우저에서 텍스처 렌더링, 거점 선택에 따른 분야 연결, 확대, 일시정지, 초기화를 확인했다. 모바일 실제 기기와 WebGL 미지원 기기의 시각 검증은 수행하지 않았다.

`tests/globe-geometry.test.mjs`는 회전·기울기·줌·화면 크기를 바꿔 투영/선택 좌표가 일치하는지 확인한다. `scripts/verify-workflow.mjs`는 메모리 DB를 사용하므로 사용자 로컬 기록을 수정하지 않는다.

## 8. 제출 준비 우선순위

1. 지구본과 기존 업무 흐름을 시연하고, 기초 자료·검토 예시와 실제 수집 결과를 구분한다.
2. 기사별 AI 분석, 국가별 기사 연결, 정시 자동 수집은 현재 구현 범위를 정확히 밝힌다.
3. 공개 운영을 검토할 때 API의 사용자 인증/권한 검사를 점검한다. 현재 `handleApi`는 Origin 비교를 수행하지만 업무 API 자체의 로그인·사용자별 접근 제어는 없으며, '비공개 워크스페이스' 문구만으로 접근 제어가 생기지 않는다. 호스팅 접근 정책은 이번 로컬 분석에서 검증하지 않았다.
4. 추가 개발 시 `app/page.tsx`의 화면별 분리, API 요청 타입 정의부터 진행하면 작은 변경의 영향 범위를 줄일 수 있다.

이번 작업은 지구본·실행 준비·문서화에 한정했다. RSS 분류 기준, 업무 점수, 투자 판단 흐름은 기존 구현을 유지했다.
