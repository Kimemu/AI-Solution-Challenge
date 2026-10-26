# 작업 기준

- 이 폴더가 사용자가 지정한 실제 작업 폴더입니다. 앞으로 코드 수정과 서버 실행은 이 폴더에서 수행합니다.
- 이전 `ORBITAL-source-code` 폴더는 보존본입니다. 그쪽을 수정하거나 서버를 실행하지 않습니다.
- 일반 HTML/CSS/JavaScript와 Node.js 기본 모듈 구조를 유지합니다. npm 설치나 빌드 없이 `start.cmd`로 실행합니다.
- 기사 본문은 Python 3.11+와 `crawler/requirements.txt`의 추출기로 수집합니다. `setup-crawler.cmd`가 `.venv`를 준비하며, Node.js 서버가 Python 작업을 호출합니다. 본문을 확보하지 못한 기사를 제목 요약으로 대체하지 않습니다.
- 서버는 사용자 PC에서 포트 37214로 호스팅하며 팀원은 서버의 LAN 주소로 접속합니다.
- `data/`의 사용자 입력은 보존하고 Git에 포함하지 않습니다.
