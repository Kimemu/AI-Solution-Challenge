# ORBITAL 구조 설명

## 실행 구조

```text
index.html
  ├─ css/                     화면 스타일
  ├─ assets/                  로컬 이미지·아이콘·뉴스 저장본
  ├─ js/config.js             서버·화면 공통 설정
  ├─ js/ui.js                 안전한 HTML 출력·이벤트 위임
  ├─ js/views.js              화면별 템플릿
  ├─ js/globe*.js             지구본
  └─ js/app.js                화면 상태와 HTTP 요청
          │
          │ fetch /api/...
          ▼
server.js                     Node.js 기본 HTTP 서버 (127.0.0.1:8001)
  └─ server/api.js            경로 분배
       ├─ state.js            초기 자료·전체 상태 조회
       ├─ records.js          안건·결정·가정·실적 처리
       ├─ collection.js       수집 실행·일괄 저장
       ├─ signals.js          RSS 파싱·정규화·분류
       ├─ validation.js       요청 입력 검증
       └─ database.js
            └─ sqlite.js      node:sqlite
                 └─ data/orbital.sqlite
```

실행 시 패키지 설치·JSX 변환·TypeScript 컴파일·개발 서버가 필요하지 않다. 브라우저는 일반 script 태그로 파일을 순서대로 읽는다. `start.cmd`는 Node.js 서버를 실행하며 서버가 준비된 뒤 브라우저를 연다.

## 화면 코드

`app.js`의 `ui` 객체가 현재 메뉴·검색·분야·입력 창을 보관한다. 서버 자료는 `state`에 보관한다. `render()`는 선택한 화면의 HTML을 출력하고 `globe.js`가 Canvas와 거점을 구성한다.

`views.js`는 메뉴별 함수로 나뉜다. 각 함수는 JavaScript의 html 태그 템플릿으로 HTML을 만든다. React 컴포넌트나 외부 템플릿 라이브러리가 아니다.

`ui.js`는 외부 기사 제목과 사용자 입력이 HTML 코드로 해석되지 않게 이스케이프하고 이벤트를 DOM에 연결한다. HTML 코드만 의도적으로 출력하는 경로와 일반 텍스트를 구분한다. 복잡한 화면마다 이를 다시 구현하지 않는다.

`selectors.js`는 목록·필터·집계를 계산하며 화면이나 서버를 수정하지 않는다. `config.js`의 점수 기준·분야·RSS 목록은 브라우저와 서버가 함께 사용한다.

## 백엔드

`server.js`는 Node.js 기본 http, fs, path 모듈을 사용한다. API는 Web 표준 Request/Response 형태로 업무 로직에 전달한다. 정적 제공 대상은 HTML, CSS, JS, 공개 에셋으로 제한한다. DB와 서버 소스는 정적 파일로 제공하지 않는다.

Node.js의 기본 SQLite 모듈을 `sqlite.js`에서 연결한다. `schema.sql`로 테이블을 준비하고 처음에는 공개 뉴스 저장본과 검토 예시를 넣는다. 데이터는 로컬 data 폴더에 저장하며 Git에 포함하지 않는다.

| API                      | 역할                              |
| ------------------------ | --------------------------------- |
| GET `/api/state`         | 기사·안건·실적·실행 기록 조회     |
| POST `/api/refresh`      | 공개 RSS 수집                     |
| POST `/api/records`      | 안건·가정 생성                    |
| PATCH `/api/records/:id` | revision 확인 후 수정             |
| POST `/api/decisions`    | 결정 단계·근거 기록               |
| POST `/api/actuals`      | 실적 기록                         |
| POST `/api/verify`       | 사용자의 원문 확인 기록           |
| POST `/api/ingest`       | 정해진 피드의 외부 수집 결과 반영 |

기존 데이터 형태와 업무 규칙은 유지한다. SQL 매개변수 바인딩, 근거가 필요한 단계, revision 충돌 확인, 실적 이력 보존이 포함된다. RSS 직접 수집과 외부 수집의 기사 정규화·중복 제거·일괄 저장은 공통 함수를 사용한다.

## HTML 직접 실행

브라우저 파일 URL에서는 상대 API 대신 로컬 백엔드에 연결한다. 서버의 CORS 처리는 이 로컬 파일 연결을 지원한다. 백엔드가 꺼져 있으면 공개 저장본을 읽는 미리보기로 표시하며 쓰기 작업은 막는다.

텍스처와 국가 데이터는 `assets/earth-data.js`에 데이터 URL로 묶었다. 이 파일은 코드 로직이 아닌 에셋이므로 보통 수정하지 않는다.

자동 브라우저의 파일 URL 정책 때문에 직접 더블클릭 경로의 자동 검증은 완료하지 못했다. 동일 HTML의 HTTP 실행, 파일 경로 연결, 로컬 에셋, 파일 Origin의 API 요청은 별도로 검사했다.

## 정리한 내용

- React·Next·Vinext·Cloudflare 실행 의존성과 빌드 설정 제거.
- HTML/CSS/일반 JS와 Node 기본 모듈만 사용.
- 화면·상태·설정·수집·저장의 역할 명시와 중복 처리 통합.
- 줄바꿈·들여쓰기·함수 이름 정돈.
- 지구본과 업무 흐름 유지, 로컬 SQLite로 저장.
- 기초 자료·저장본·실시간 수집 결과와 규칙 기반 가설 구분.

프레임워크 원본은 Git 이력 `e2cb021`에서 확인할 수 있다. 로컬 이전 파일은 Git에서 제외된 `outputs/framework-backup/`에 보존했다. 이전 실행 캐시·D1 데이터는 삭제하지 않았다.
