# 이벤트 당첨자 정보 입력 폼

인스타그램 이벤트(공동구매·증정) 당첨자가 배송지를 제출하면, 운영자가 Google Sheets에서 응답을 확인하고 엑셀로 다운로드하는 정적 HTML 웹 애플리케이션입니다.

## 구성

| 파일 | 역할 |
|------|------|
| `index.html` | 당첨자 배송지 입력 폼 |
| `admin.html` | 응답 조회·삭제·엑셀/CSV 내보내기 |
| `Code.gs` | Google Apps Script — Sheets 백엔드 |

외부 서버 없이 Google Apps Script를 백엔드로 사용하며, Cloudflare Pages 등 정적 호스팅에 바로 배포할 수 있습니다.

## Claude Code로 바로 시작하기

이 레포를 클론한 뒤 Claude Code를 실행하고, 아래 프롬프트를 입력하면 됩니다.

```
@event-prompt.md 파일을 참고해서 index.html, admin.html, Code.gs 를 만들어줘
```

Claude가 스펙 문서를 읽고 세 파일을 모두 생성해 줍니다.

## 배포 순서

### 1. Google Apps Script 설정

1. 새 Google 스프레드시트 생성
2. **확장 프로그램 → Apps Script** 열기
3. `Code.gs` 코드 붙여넣기 후 저장
4. `setup` 함수 실행 (시트·헤더 자동 생성)
5. **배포 → 새 배포 → 웹 앱**
   - 다음으로 실행: **나**
   - 액세스 권한: **모든 사람(익명 포함)**
6. 발급된 `exec` URL을 `index.html`, `admin.html`의 `APPS_SCRIPT_URL` 상수에 입력

### 2. Cloudflare Pages 배포

```bash
npx wrangler login
npx wrangler pages project create event-form-static --production-branch main
npx wrangler pages deploy . --project-name event-form-static --branch main
```

### 로컬 실행

```bash
npx serve .
```

## 관리자 페이지

- 기본 계정: `admin` / `1234`
- `admin.html?login` 으로 접속하면 세션 초기화 후 로그인 화면 표시
