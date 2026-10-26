# ORBITAL 구조와 처리 규칙

## 실행 경로

```text
브라우저: index.html → 일반 JS/CSS → /api
  Node.js server.js (0.0.0.0:37214)
    api.js → research.js → research-sources.js → 실제 RSS
                      ├→ research-content.js → python-crawler.js
                      │    → .venv Python → Google News 주소 해석
                      │                    → 공개 원문 → Trafilatura
                      ├→ codex.js → GPT-6 Luna / Low
                      ├→ research-logic.js → 점수·단계·예산·목표
                      └→ reports.js → HTML / Edge PDF
    database.js → node:sqlite → data/orbital.sqlite
```

npm·번들러·프레임워크 없이 실행한다. `start.cmd`는 Node 버전을 확인하고 Python 가상환경을 준비한 뒤 서버를 실행한다. 팀원은 같은 LAN 서버에 접속하며 개별 DB를 만들지 않는다. 파일URL은 로컬 API 연결을 별도로 지원하나 협업에는 LAN 주소를 사용한다.

## 검색에서 보고서까지

1. 범위는 KST 날짜, 7·30·90일 또는 최대1년 직접 지정이다. 기간·대륙 변경은 검색 작업을 시작한다.
2. `research-sources.js`는 기존8개RSS와 해당 국가들의 등록 매체5곳을 묶은 site 검색을 생성한다. 최대6개 피드를 동시에 읽고 피드당20건을 정규화·중복 제거한다. 결과 수·실패·신규 수를 기록한다.
3. `research-core.js`는 제목·RSS 설명을 동의어로 묶어 문서 빈도로 추천한다. 국가를 제목에서 우선 찾고 매체 소재지로 보완하며 출처를 표시한다. 국가 미확인은 억지로 지정하지 않는다.
4. 키워드 선택 시 기사 묶음·단계 기준·파이프라인 버전으로 fingerprint를 만든다. 완료된 동일 분석은 기존 이력을 연다. 새 작업은 임시 아이디어·판단 초안·가정·보고서를 즉시 저장한다.
5. 본문 캐시를 확인하고 없는 것만 Python으로 수집한다. Google News RSS에 본문이 있는 것이 아니라 공개 원문 링크를 해석해 매체 페이지에서 추출한다.
6. 확보 실패 기사는 세션 최종근거에서 제외한다. 본문을 확보한 기사 전체를 최대6건·합계6만자 단위로 묶어 GPT 요약한다. 긴 단일 기사는 단독 호출하며 본문을 잘라 제목 요약으로 바꾸지 않는다.
7. 본문 기반 요약·키워드3개를 저장하고 요약 실패도 제외한다. 최종 아이디어는 이 요약들에서 구체화한다. 제공한 기사ID만 근거로 허용한다.
8. 규칙 점수와 단계·목표를 갱신하고 보고서를 동기화한다. 사용자 편집은 보존한다. 본문이 없으면 생성 가설은 보류·숨김 처리하고 예산은 산정 보류한다. DB에서 기존 기록을 삭제하지 않는다.

## Python 수집 경계

Python3.11+, Trafilatura2.3.1, googlenewsdecoder0.2.2를 사용한다. 주소 해석은 묶음10건·동시3개, 본문 다운로드도 제한된 병렬도로 처리한다. 입력은 stdin JSON, 결과는 기사별 JSONL이다. stdout은 결과, stderr는 진단이다.

요청은 HTTP/HTTPS 80/443과 공개 IPv4만 허용한다. DNS 결과를 검증·고정해 연결하고 TLS 인증서와 호스트를 확인한다. 리디렉션마다 다시 검사한다. 응답5MB, 추출본문300~100,000자를 제한하며 너무 긴 본문은 실패로 처리한다. 메뉴·댓글을 제거하고 JSON-LD articleBody를 보완한다. 명시된 동일호스트 공개 AMP 링크는 보완 수단이다. 로그인·유료벽·403·인증화면은 우회하지 않는다.

## 캐시와 재시작

- `signals.data.articleContent`: 원문주소·전체본문·본문SHA256·추출방법·시각·파이프라인버전·원제목.
- `signals.data.articleAnalysis`: 한국어요약·키워드3개·본문해시·article-body 근거·모델·분석시각.
- 본문해시가 같으면 완료된 요약을 재사용한다. 이전 제목기반 요약은 별도 보존하고 본문기반 결과로 교체한다.
- 본문캐시는 기본적으로 재다운로드하지 않는다. 제목 변경 등 무효화 조건에만 다시 수집하며 정기적인 원문수정 감지는 별도 기능이다.
- `article_jobs`: 개별기사 영구대기열. `research_jobs`: 검색·키워드 전체작업 영구대기열. 재시작 시 queued/running만 재개한다. 완료된 작업은 다시 호출하지 않는다.
- 연구 분석이 처리 중인 기사는 개별 워커에서 중복 처리하지 않는다. Codex 실행은 공통직렬큐를 사용한다. 실패 기사·부분완료 분석은 재시도 가능하다.
- 전역 뉴스검색 수집과 연구분석은 비동기 작업으로 분리한다. 검색이 끝난 뒤 모든 기사를 즉시 요약하지 않고 선택한 키워드의 근거를 처리한다.

## 점수와 예산

점수는 GPT의 임의 숫자가 아닌 적합도30%·기사 관심빈도25%·수익신호25%·기술차별가설20%의 1~5점 가중합이다. 기사 수·매체 다양성·제목과 본문기반 요약의 키워드를 사용하는 초기 선별 규칙이다. 실제 수요·수익·특허 검증을 뜻하지 않는다. 기본60/75/85점으로 다음 검토 단계를 제안한다. 단계와 산식·통과내역을 표시하고 수동 수정도 지원한다.

예산은8주 PoC를 위한 내부 계획단가이다. 수량×단가 소계+기본15%예비비이며 항목·수량·단가·예비비를 편집한다. 사업규모 전체의 최소견적이 아니다. 검증 지표는 고객인터뷰·데이터확보율·예산상한이며 실적은 실제입력 전 null이다.

## 화면·수정·PDF

`app.js`는 서버상태와 UI를 연결한다. `research-controller.js`는 비동기 작업조회·분석이력·기사·PDF를 다룬다. `views.js`는 기존업무폼, `research-views.js`는 새탐색·출처·보고서다. `ui.js`가 외부문자열을 HTML 이스케이프한다. `selectors.js`는 현재분석 관련 기록과 국가·기사 수를 계산하며 예시·제외기록은 숨긴다. `globe.js`는 이 국가목록의 실제기사 수만 거점에 표시한다.

모든 수정은 revision을 확인한다. 사람이 수정한 생성 기록은 userEdited로 보호한다. 일반목록 응답은 큰 본문을 제거하고 기사상세에서만 전체본문을 제공한다. 약10초 상태조회이며 WebSocket이나 개인별 인증은 없다.

보고서는 Five Case Model 참고의 결재용 검토 초안이다. `reports.js`가 최신DB에서 HTML을 만들고 Edge/Chrome headless로 A4 PDF를 생성한다. 외부JS·CSS가 필요 없고 한글·출처 링크·예산·목표·측정 전 상태가 포함된다. 브라우저가 없으면 인쇄화면에서 PDF저장한다.

## API

| 경로                                           | 역할                           |
| ---------------------------------------------- | ------------------------------ |
| GET `/api/state`                               | 공유자료와 작업이력            |
| GET `/api/signals/:id`                         | 기사상세·전체본문              |
| POST `/api/research/discover`                  | 실제범위뉴스검색 시작          |
| POST `/api/research/recommendations`           | 해당범위 저장기사 빈도조회     |
| POST `/api/research/analyze`                   | 키워드 업무전체 생성시작       |
| GET `/api/research/jobs/:id`                   | 진행률·실패                    |
| GET `/api/research/results/:sessionId`         | 유효기사·국가·결과             |
| POST `/api/research/retry`                     | 부분완료·실패 재시도           |
| POST `/api/research/settings`                  | 단계기준 변경                  |
| POST `/api/article-analysis`                   | 기사본문·요약 요청             |
| GET `/api/reports/:id/html` · `/pdf`           | 최신DB 보고서출력              |
| POST `/api/records` · PATCH `/api/records/:id` | 안건·가정·보고서 등 생성·수정  |
| POST `/api/decisions` · `/actuals`             | 확정판단·측정실적              |
| POST `/api/refresh`                            | 기존8개피드 수집·실패분 재시도 |

SQL은 매개변수 바인딩을 사용한다. 정적파일은 HTML·JS·CSS·공개에셋만 제공하고 DB·서버코드는 제외한다. 사용자data폴더는 Git에 포함하지 않는다. 새DB에 고정70개뉴스를 넣지 않으며 `ORBITAL_SEED_NEWS=1`로만 예시뉴스를 추가한다. 이전데이터는 보존한다.
