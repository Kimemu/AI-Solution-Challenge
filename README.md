# ORBITAL · AI Solution Challenge

기간·대륙별 뉴스를 검색하고, 키워드 한 번의 선택으로 기사·국가·사업 아이디어·평가·검증계획·예산·결재용 보고서를 연결하는 협업 워크스페이스입니다.

화면은 일반 HTML/CSS/JavaScript, 서버는 Node.js 기본 모듈, 기사 본문 수집기는 Python입니다. **npm 설치나 빌드 없이 `start.cmd`로 실행합니다.**

## 실행

서버 PC에 Node.js 22.13 이상(검증:24), Python 3.11 이상(검증:3.12), Codex CLI가 필요합니다. 서버를 실행하는 Windows 계정에서 `codex login`을 완료하세요.

1. `start.cmd` 또는 `start-team.cmd`를 실행합니다.
2. 처음에는 Python `.venv`와 `crawler/requirements.txt` 패키지를 자동으로 준비합니다. 인터넷 연결이 필요합니다.
3. 열린 브라우저에서 기간·대륙을 정해 검색하고 키워드를 선택합니다.
4. 종료는 실행 창의 `Ctrl+C`입니다. 수정한 서버 코드를 적용하려면 기존 창에서 종료한 후 다시 실행하세요.

이미 실행 중인 ORBITAL이 있으면 기존 화면을 엽니다. 다른 프로그램이 포트를 쓰면 자동 종료하지 않습니다. 기본 공유 포트는 **37214**입니다.

팀원은 같은 Wi-Fi·LAN에서 실행 창에 표시된 서버 주소(예: `http://192.168.0.10:37214/`)로 접속합니다. 팀원 PC에는 Git·Node·Python·Codex 설치가 필요 없습니다. `127.0.0.1`은 각자 자신의 PC이므로 공유 주소로 사용하지 않습니다.

모든 접속자는 같은 `data/orbital.sqlite`를 사용합니다. 변경 내용은 약 10초마다 조회하고 동시에 수정하면 revision 충돌을 안내합니다. 서버 재실행 후에도 저장 내용과 완료된 분석을 재사용합니다. 로그인·개인별 권한 없이 내부 팀이 함께 편집하는 구조입니다. 서버 PC가 켜져 있어야 합니다. 방화벽은 Node.js의 개인 네트워크 접근을 허용하고, 포트 포워딩은 필요하지 않습니다.

환경을 따로 준비하거나 콘솔에서 실행하려면:

```powershell
.\setup-crawler.cmd
node server.js
```

`index.html` 직접 실행도 화면·지구본을 표시하지만 수집·저장·AI 기능에는 실행 중인 서버가 필요합니다. 팀 협업은 LAN 웹 주소를 사용하세요. 백업은 서버 종료 후 `data` 폴더를 복사합니다.

## 주요 기능

- 최근 7·30·90일 또는 직접 지정 기간, 6개 대륙·전 세계 검색.
- 기존 8개 피드와 52개국의 주요 매체 각 5곳(260곳)을 Google News 검색에 활용. 매체는 선정 목록이며 순위나 기사 반환을 보장하지 않습니다. 피드당 최대20건, 건수는 실제 응답에 따라 달라집니다.
- 제목·RSS 설명의 문서 빈도로 키워드 추천, 동의어 정리·불용어 제거.
- 키워드 클릭 → 비동기 본문 수집·요약 → 관련 국가·최신순 기사 → 사업 아이디어·점수·단계·의사결정 로그 초안·검증 지표·보고서 생성.
- 기사와 연결된 국가만 지구본에 표시. 제목의 국가 언급과 매체 소재지 기준을 구분.
- Python Google News 주소 해석 + Trafilatura 공개 본문 추출. 본문 전체로 한국어 요약·키워드3개 생성. 차단·유료·추출 실패 및 요약 실패 기사는 최종 결과에서 제외. 제목 요약으로 대체하지 않음.
- 본문·해시·요약·분석 이력 SQLite 캐시. 완료된 동일 본문 요약은 재사용하며 실패 작업은 재시도 가능.
- 사업 아이디어는 GPT가 구체화하고 점수는 투명한 가중 산식으로 계산. 기준60/75/85점에 따라 투자검토·PoC·추진을 제안. 실제 승인은 담당자가 확정.
- 실제 측정 전 실적은 빈 값으로 유지. 목표·실적·변경 이력 기록.
- 결재용 사업제안 보고안, 편집 가능한8주 PoC 계획예산, 수량×단가+예비비, A4 PDF·인쇄. 계획단가는 견적 확인 전 가정.

처음 보이는 임시 초안은 본문 확인 후 갱신됩니다. 본문이 한 건도 없으면 사업 근거와 예산 산정을 보류합니다. 사용자 수정은 자동 갱신으로 덮어쓰지 않습니다. 예산·점수·분류는 수익 보장이나 투자 승인이 아닙니다.

Google News는 검색 입구이며 본문은 매체의 공개 페이지에서 가져옵니다. 모든 원문의 수집 성공을 보장하지 않습니다. 정시 외부 수집 스케줄러는 없고 화면의 주기 요청은 저장 상태 조회입니다. 새 DB에 고정 뉴스70건을 자동 주입하지 않으며 예시는 기본 숨김입니다.

## 코드 읽기

| 파일                                             | 역할                                         |
| ------------------------------------------------ | -------------------------------------------- |
| `index.html`                                     | 일반 script·CSS 진입점                       |
| `js/app.js`, `js/views.js`                       | 화면 상태·기존 업무 입력 폼                  |
| `js/research-controller.js`                      | 검색·비동기 분석·이력·PDF 요청               |
| `js/research-views.js`                           | 탐색·출처·보고서·편집 화면                   |
| `js/research-config.js`, `research-core.js`      | 국가·매체·기간·빈도·국가 추론·단계 공통 규칙 |
| `js/globe.js`, `globe-core.js`                   | 거점·지구본 조작·WebGL                       |
| `server.js`, `server/api.js`                     | HTTP·정적 파일·API                           |
| `server/research.js`                             | 영구 작업·초안·본문 확인·AI·보고서 연결      |
| `server/research-sources.js`                     | 실제 RSS 검색·동시 수집                      |
| `server/research-logic.js`                       | 사업 평가·단계·계획예산·목표                 |
| `server/python-crawler.js`, `crawler/worker.py`  | Python 실행·원문 추출                        |
| `server/article-content.js`, `article-worker.js` | 본문 캐시·기사별 영구 요약 대기열            |
| `server/codex.js`, `keywords.js`                 | 구조화된 Codex 호출·검증                     |
| `server/reports.js`                              | DB에서 HTML·PDF 생성                         |
| `server/records.js`, `database.js`, `schema.sql` | 업무 검증·revision·SQLite                    |
| `css/workspace.css`                              | 새 탐색·보고서·가독성 스타일                 |

자세한 [구조 설명](docs/ARCHITECTURE.md), [기능 설명·3분 영상 대본](docs/DEMO-VIDEO.md)을 참고하세요.

## AI·PDF 설정

기본 모델은 `gpt-6-luna`, 추론 강도 `low`입니다. 서버의 Codex 로그인과 사용 한도를 사용하며 한 호출은 최대3분입니다. `ORBITAL_CODEX_PATH`로 실행 파일을 지정할 수 있습니다. `ORBITAL_AI_ENABLED=0`은 기사별 백그라운드 자동요약을 중지하며 사용자가 선택한 연구 분석은 별도로 실행합니다.

PDF 다운로드는 서버에 설치된 Edge/Chrome을 사용합니다. 없으면 인쇄 화면에서 PDF로 저장하세요. `ORBITAL_PDF_BROWSER`로 브라우저 실행 파일을 지정할 수 있습니다. Python은 프로젝트 `.venv`를 우선 사용하며 `ORBITAL_PYTHON`으로 지정할 수 있습니다.

## 검증

```powershell
node --test tests/*.test.mjs
node tests/workflow.mjs
.venv\Scripts\python.exe -m unittest discover -s crawler/tests -v
```

자동 검사는 네트워크·Codex 호출을 대체한 고정 자료를 사용하며 실제 기사와 GPT의 연결은 별도로 확인했습니다. 테스트는 사용자 기본DB를 사용하지 않습니다. GitHub Actions는 Node·Python 검사를 수행합니다. 파일URL 직접 브라우저 실행은 자동화 도구의 정책으로 미검증이며 동일 HTML의 HTTP 실행과 파일 Origin의 API 연결은 검증했습니다.

텍스처는 [이미지 출처](assets/textures/ATTRIBUTION.md), Google News 주소 해석기의 MIT 고지는 `assets/GOOGLE-NEWS-DECODER-LICENSE.txt`, 그 외 에셋 고지는 `assets/`에 있습니다. 이전 프레임워크 버전은 Git 이력 `e2cb021`에 보존되어 있습니다.
