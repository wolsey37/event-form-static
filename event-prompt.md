# 이벤트 당첨자 정보 입력 폼 — 제작 프롬프트

인스타그램 이벤트(공동구매·증정) 당첨자가 배송지를 제출하면, 운영자가 Google Sheets에서 응답을 확인하고 엑셀로 다운로드하는 **정적 HTML** 웹 애플리케이션을 만들어줘. 파일은 `index.html`, `admin.html`, `Code.gs` 세 개를 생성해.

---

## 1. 공통 스펙

### 파일 구성
| 파일 | 역할 |
|------|------|
| `index.html` | 당첨자 배송지 입력 폼 |
| `admin.html` | 응답 조회·삭제·내보내기 |
| `Code.gs` | Google Apps Script — Sheets 백엔드 |

### 의존성 (CDN, 외부 설치 없음)
- 폰트: `https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;600;700;800`
- 주소 검색: `//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js` (index.html만)
- 엑셀: `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js` (admin.html만)

### CSS 변수 (두 파일 공통)
```css
:root {
  --brand-primary: #FF6B35;
  --brand-secondary: #FF8C42;
  --brand-accent: #FFB088;
  --brand-dark: #E84E1B;
  --brand-soft: #FFF4ED;
  --brand-softer: #FFFAF6;
  --text-primary: #1A1A1A;
  --text-secondary: #4A4A4A;
  --text-tertiary: #9A9A9A;
  --border-light: #EEE6DE;
  --border-input: #E2D9D0;
  --error: #E03131;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
  --radius: 16px;
}
```

### 공통 body 스타일
```css
html, body {
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif;
  background: #FFF0E6;
  background-image:
    radial-gradient(ellipse at 20% 0%, rgba(255,140,66,0.18) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 100%, rgba(255,107,53,0.12) 0%, transparent 60%);
  background-attachment: fixed;
  color: var(--text-primary);
  line-height: 1.6;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
```

### 토스트 (두 파일 동일)
```css
.toast {
  position: fixed;
  bottom: calc(28px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%) translateY(120%);
  opacity: 0;
  background: #1A1A1A;
  color: white;
  padding: 12px 22px;
  border-radius: 100px;
  font-size: 13.5px;
  font-weight: 500;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
  z-index: 1000;
  pointer-events: none;
  white-space: nowrap;
}
.toast.show  { transform: translateX(-50%) translateY(0); opacity: 1; pointer-events: auto; }
.toast.success { background: linear-gradient(135deg, #2BA84A 0%, #1F8836 100%); }
.toast.error   { background: linear-gradient(135deg, #E03131 0%, #C92A2A 100%); }
```

```js
let _toastTimer = null;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (_toastTimer) clearTimeout(_toastTimer);
  t.className = 'toast show' + (type ? ' ' + type : '');
  t.textContent = msg;
  _toastTimer = setTimeout(() => { t.className = 'toast'; _toastTimer = null; }, 2400);
}
```

### Google Sheets 연동 상수 (두 파일 동일)
```js
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz4ihndsT6HQh1WYRch8vnCdRlY084Tw5sPrLDfLpCJ5raQROrUysoTEZMdjcLSWC3nbw/exec';
```

### Google Sheets API 호출 패턴
```js
// GET (데이터 조회)
const res = await fetch(APPS_SCRIPT_URL);
const result = await res.json(); // { success: true, data: [...] }

// POST (저장·삭제 등) — Content-Type 헤더 없이 보내야 CORS preflight 회피
await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
```

### 관리자 세션 키
- **SESSION_KEY**: `event_form_admin_session_v1` (값: `'ok'`, localStorage)

---

## 2. Code.gs — Google Apps Script 백엔드

```js
const SHEET_NAME = '당첨자 명단';

// 최초 1회 실행: 시트 생성 + 헤더 + 열 너비 설정
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['제출번호','제출일시','제품명','인스타그램','수령인','배송주소','전화번호','주문번호']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 8, 120);
    sheet.setColumnWidth(3, 200); // 제품명
    sheet.setColumnWidth(6, 280); // 배송주소
  }
}

// GET — 전체 데이터 반환
function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return ok([]);
    const vals = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    const records = vals.map(r => ({
      id:          String(r[0]),
      submittedAt: r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
      product:     String(r[2] || ''),
      instagram:   String(r[3] || ''),
      recipient:   String(r[4] || ''),
      address:     String(r[5] || ''),
      phone:       String(r[6] || ''),
      orderNumber: String(r[7] || ''),
    }));
    return ok(records);
  } catch (e) {
    return fail(e.message);
  }
}

// POST — action 별 처리
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'delete':   return handleDelete(body.id);
      case 'clearAll': return handleClearAll();
      default:         return handleSubmit(body);
    }
  } catch (e) {
    return fail(e.message);
  }
}

function handleSubmit(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const newId = String(sheet.getLastRow()); // 헤더=1행, 첫 데이터 ID=1
  sheet.appendRow([newId, data.submittedAt, data.product, data.instagram,
                   data.recipient, data.address, data.phone, data.orderNumber]);
  return ok({ id: newId });
}

function handleDelete(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) { sheet.deleteRow(i + 1); return ok({}); }
  }
  return fail('ID not found: ' + id);
}

function handleClearAll() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  return ok({});
}

function ok(data)  { return ContentService.createTextOutput(JSON.stringify({ success: true, data })).setMimeType(ContentService.MimeType.JSON); }
function fail(msg) { return ContentService.createTextOutput(JSON.stringify({ success: false, error: msg })).setMimeType(ContentService.MimeType.JSON); }
```

### Apps Script 배포 설정
- **다음으로 실행**: 나(본인 계정)
- **액세스 권한**: 모든 사람(익명 포함)
- 배포 후 `exec` URL을 두 HTML 파일의 `APPS_SCRIPT_URL` 상수에 입력

---

## 3. index.html — 입력 폼

### 페이지 구조
```html
<div class="container" id="main-view"> ... </div>
<div class="container" id="success-view" style="display:none;"> ... </div>
<div class="toast" id="toast"></div>
```

`.container { max-width: 600px; margin: 0 auto; padding: 28px 16px 64px; }`  
모바일(`max-width: 540px`): `padding: 18px 12px 52px`

### 헤더 (`.header`)
```html
<div class="header-badge">친한약사</div>   <!-- 흰 pill, 왼쪽 오렌지 dot + pulse 애니메이션 -->
<h1>이벤트 당첨자 정보 입력</h1>
<p>당첨 너무너무 추카드려요 ❤<br>배송을 위해 아래 내용에 답변 부탁드립니다 :)</p>
```

### 상품 카드 (`.product-card`)
- 오렌지 그라디언트 배너: 태그 `🛒 공동구매 · YDY뉴트리션`, 제목 `[공동구매] 친한약사 X YDY 데일리 이뮨 C&D`
- 메타 **4개 가로 flex** (overflow-x auto, 스크롤바 숨김):
  `판매가 52,500원 (35%↓)` / `옵션 3 / 6박스` / `배송 무료 · CJ` / `소비기한 2027-08-20`

### 폼 항목 (`.form-card`, `<form id="event-form" novalidate>`)

| # | name | type | 필수 | 세부 |
|---|---|---|---|---|
| 1 | `product` | text | ✅ | `value="친한약사 X YDY 데일리 이뮨 C&D"` |
| 2 | `instagram` | text | ✅ | `.input-icon-wrap` + `<span class="prefix">@</span>`, 저장 시 `replace(/^@/, '')` |
| 3 | `recipient` | text | ✅ | placeholder: `홍길동` |
| 4 | 주소 | Daum Postcode | ✅ | 아래 구조 참고 |
| 5 | `phone` | tel | ✅ | `pattern="[0-9\-]{10,14}"`, `maxlength="13"`, input 시 하이픈 자동 포맷 |
| 6 | `order_number` | text | ✅ | placeholder: `예: 100001` |

### 주소 필드 (`id="field-address"`)
```html
<div class="addr-row">
  <input type="text" id="addr-zipcode" placeholder="우편번호" readonly />
  <button type="button" class="btn-addr-search" id="addr-search-btn">🔍 주소 검색</button>
</div>
<input type="text" id="addr-base" class="addr-base" placeholder="기본 주소 (자동 입력)" readonly />
<input type="text" id="addr-detail" name="address_detail" placeholder="상세 주소 (또는 전체 주소 직접 입력)" />
<input type="hidden" name="address" id="addr-full" />
<div class="field-error-msg" id="addr-error-msg">주소를 검색해 주세요.</div>
```

Daum Postcode 팝업은 화면 정중앙에 표시:
```js
const w = 500, h = 600;
new daum.Postcode({
  width: w, height: h,
  oncomplete(data) { ... },
}).open({
  left: Math.round((window.screen.width - w) / 2),
  top:  Math.round((window.screen.height - h) / 2),
});
```

### 폼 버튼
```html
<button type="button" class="btn btn-secondary" id="reset-btn">지우기</button>
<button type="submit" class="btn btn-primary">제출하기</button>
```

### 제출 로직 (비동기)
```js
form.addEventListener('submit', async e => {
  e.preventDefault();
  // 1. 검증
  // 2. 버튼 비활성화 + '제출 중...' 텍스트
  const payload = { action: 'submit', submittedAt, product, instagram, recipient, address, phone, orderNumber };
  // 3. fetch POST (Content-Type 헤더 없이)
  const res = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await res.json();
  // 4. result.data.id — 서버에서 발급된 ID 사용
  // 5. 성공 시 renderSuccess() 호출
  // 6. 실패 시 버튼 복구 + 에러 토스트
});
```

**ID 생성**: 서버(Apps Script)에서 `sheet.getLastRow()` 기준 발급. 클라이언트에서 직접 생성하지 않음.

### 성공 화면 (`#success-view`)
- 오렌지 원형 아이콘 + 체크마크 SVG (bounce 애니메이션)
- `<h2>제출이 완료되었어요!</h2>`
- 제출 요약 카드: 제출번호(서버 발급) / 수령인 / 연락처 / 인스타 / 주문번호
- "돌아가기" 버튼 → 폼 초기화 + **submit 버튼 `disabled` 및 텍스트 복구** 후 `#main-view` 복귀

```js
document.getElementById('back-btn').addEventListener('click', () => {
  // main-view 복귀 + 폼 초기화
  const submitBtn = form.querySelector('.btn-primary');
  submitBtn.disabled = false;
  submitBtn.textContent = '제출하기';
});
```

### 푸터
```html
<div class="footer">
  <p>제출하신 정보는 배송 목적에만 이용되며, 배송 완료 후 즉시 파기됩니다.</p>
  <p><a class="admin-toggle" href="admin.html?login">관리자 로그인 →</a></p>
</div>
```

- 링크 클릭 시 항상 **로그인 페이지로 이동**해야 함 (`?login` 파라미터로 기존 세션 강제 초기화 → admin.html의 로그인 화면이 노출됨).
- 링크 텍스트는 `관리자 로그인 →` 으로 표기하여 동작을 명확히 한다.

---

## 4. admin.html — 관리자 페이지

### JS 상수 및 초기화
```js
const ADMIN_ID = 'admin';
const ADMIN_PW = '1234';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz4ihndsT6HQh1WYRch8vnCdRlY084Tw5sPrLDfLpCJ5raQROrUysoTEZMdjcLSWC3nbw/exec';
const SESSION_KEY = 'event_form_admin_session_v1';

let cachedSubs = []; // 로드한 데이터 인메모리 캐시
```

### JS 초기화 순서 (script 최상단, 순서 엄수)
```js
// 1. DOM refs
const loginView = document.getElementById('login-view');
const adminView = document.getElementById('admin-view');
const loginForm = document.getElementById('login-form');
const loginErr  = document.getElementById('login-err');
const searchInput = document.getElementById('search-input');

// 2. ?login 파라미터가 있으면 세션 강제 초기화
if (location.search.includes('login')) {
  localStorage.removeItem(SESSION_KEY);
  history.replaceState(null, '', location.pathname);
}

// 3. 이미 로그인 상태면 바로 어드민 표시
if (localStorage.getItem(SESSION_KEY) === 'ok') showAdmin();
```

### 데이터 흐름
```
showAdmin() → loadAndRender()
  → fetchSubs() [GET /exec]
  → cachedSubs 갱신
  → renderTable() [캐시에서 필터링·렌더]

searchInput.input → renderTable() [서버 재호출 없음]
refresh-btn.click → loadAndRender() [서버 재호출]
```

### API 함수
```js
async function fetchSubs() {
  const res = await fetch(APPS_SCRIPT_URL);
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
}

async function apiPost(body) {
  const res = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify(body) });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result;
}
```

### 로딩 상태
`loadAndRender()` 시작 시 테이블에 "불러오는 중..." 행 표시. 성공/실패 여부를 `boolean`으로 반환.

```js
async function loadAndRender() {
  // ...
  try { cachedSubs = await fetchSubs(); renderTable(); return true; }
  catch { /* 에러 행 표시 + 에러 toast */; return false; }
}

// 새로고침 버튼: 성공 시에만 '새로고침 했어요' toast 표시
document.getElementById('refresh-btn').addEventListener('click', async () => {
  const ok = await loadAndRender();
  if (ok) showToast('새로고침 했어요', 'success');
});
```

### 관리자 화면 구조 (기존과 동일)
`.container { max-width: 1200px; }`

상단 바, 통계 카드 3개, 툴바(검색 + 새로고침), 테이블 구조는 기존 스펙과 동일.

### 삭제
```js
// 개별 삭제
await apiPost({ action: 'delete', id });
cachedSubs = cachedSubs.filter(x => x.id !== id);
renderTable();

// 전체 삭제
await apiPost({ action: 'clearAll' });
cachedSubs = [];
renderTable();
```

삭제 버튼 클릭 시 비활성화 + '삭제 중...' 표시. 실패 시 복구.

### 내보내기
- **엑셀**: SheetJS `XLSX.utils.aoa_to_sheet`, 시트명 `당첨자 명단`, 파일명 `친한약사_이벤트당첨자_YYYY-MM-DD.xlsx`
- **CSV**: UTF-8 BOM(`﻿`) 포함, 동일 파일명 규칙 `.csv`
- 헤더: `['제출번호','제출일시','제품명','인스타그램','수령인','배송주소','전화번호','주문번호']`
- 두 내보내기 모두 현재 검색 필터 적용 결과(`getFiltered()`)만 대상

---

## 5. 배포

### Google Apps Script 초기 설정 (최초 1회)
```
1. 스프레드시트 열기 → 확장 프로그램 → Apps Script
2. Code.gs 코드 붙여넣기 → 저장
3. setup 함수 실행 (시트 + 헤더 자동 생성)
4. 배포 → 새 배포 → 웹 앱
   - 다음으로 실행: 나
   - 액세스 권한: 모든 사람(익명 포함)
5. 발급된 exec URL을 index.html, admin.html의 APPS_SCRIPT_URL에 입력
```

### Cloudflare API Token 발급 (최초 1회)
1. https://dash.cloudflare.com/profile/api-tokens → **Create Token**
2. 템플릿 사용: **Edit Cloudflare Workers** (Pages 권한 포함)
   - 또는 Custom Token: `Account > Cloudflare Pages > Edit` 권한
3. 발급된 토큰 + Account ID(`https://dash.cloudflare.com` 우측 사이드바)를 안전하게 보관
4. 로컬 환경변수로 등록:
   ```bash
   export CLOUDFLARE_API_TOKEN="발급받은_토큰"
   export CLOUDFLARE_ACCOUNT_ID="계정_ID"
   ```
   - 영구 적용: `~/.zshrc`(또는 `~/.bashrc`)에 위 두 줄 추가 후 `source ~/.zshrc`
   - CI/CD(GitHub Actions 등)에서는 동일 키명으로 Secret 등록

### Cloudflare Pages 최초 배포 (API 토큰 사용)
```bash
# wrangler login 불필요 — 환경변수의 토큰으로 인증
npx wrangler pages project create event-form-static --production-branch main
cd event-form-static
npx wrangler pages deploy . --project-name event-form-static --branch main
```

### 재배포
```bash
# CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID 가 셸 환경에 있어야 함
cd event-form-static
npx wrangler pages deploy . --project-name event-form-static --branch main
```

### GitHub Actions 자동 배포 (선택)
`.github/workflows/deploy.yml`:
```yaml
name: Deploy to Cloudflare Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy . --project-name=event-form-static --branch=main
```
- GitHub 리포지토리 → Settings → Secrets and variables → Actions 에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 등록

### 배포 정보
| 구분 | URL |
|------|-----|
| **입력 폼** | https://event-form-static.pages.dev/ |
| **관리자** | https://event-form-static.pages.dev/admin.html |
| **Google Sheets** | https://docs.google.com/spreadsheets/d/1xhZ5W7YVJk9tWT8v5aL5ezab89YR-DgNut-1LbSjcYo |
| **Apps Script** | https://script.google.com/macros/s/AKfycbz4ihndsT6HQh1WYRch8vnCdRlY084Tw5sPrLDfLpCJ5raQROrUysoTEZMdjcLSWC3nbw/exec |
| Cloudflare 계정 | wolsey@pharma-bros.com |

---

## 6. 디자인 디테일 보정사항 (배포 사이트 기준)

기존 스펙(섹션 1~4)에서 누락되었거나 모호했던 디테일을, 실제 배포된 `event-form-static.pages.dev`를 기준으로 보정합니다.
**이 섹션이 위 본문과 충돌할 경우 이 섹션이 우선합니다.**

### 6.1 공통

- **HTML `<title>`**
  - `index.html` → `[친한약사 X YDY] 이벤트 당첨자 정보 입력`
  - `admin.html` → `[친한약사 X YDY] 관리자 — 응답 조회`
- **CSS reset**: `* { margin: 0; padding: 0; box-sizing: border-box; }` 명시
- **Pretendard import**: `&display=swap` 포함

### 6.2 index.html 보정

#### 헤더 배지
- `.header-badge`: 흰 배경 + `var(--brand-primary)` 글자색, `border: 1px solid rgba(255,107,53,0.15)`, padding `5px 14px`, 글자 12px
- 점 애니메이션은 **opacity 기반** (ripple 아님):
  ```css
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.5; transform: scale(0.8); }
  }
  ```
- 점 크기 `6px × 6px`
- h1 `22px` / 본문 p `13.5px line-height: 1.7`

#### 상품 카드
- `.product-card`에 `border: 1px solid var(--border-light)` 추가
- `.product-banner`
  - 그라디언트 방향: `linear-gradient(135deg, #FF8C42 0%, #FF6B35 100%)` (secondary→primary)
  - `padding: 16px 20px`
  - **데코 원**: `::before`로 우상단 반투명 화이트 원 배치
    ```css
    .product-banner::before {
      content: '';
      position: absolute; right: -20px; top: -30px;
      width: 120px; height: 120px;
      background: radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%);
      border-radius: 50%;
    }
    ```
  - 태그 클래스명: `.product-banner-tag` (페이지 내 일관성), 글자 11px
  - 제목은 banner 내부 `<h2>`, 글자 15px
- `.product-meta`
  - **세로 정렬 컬럼 4개** (라벨 + 값), `border-right`로 구분, 좌우 패딩 `12px 20px`
  - `.meta-label`: 10px / uppercase / letter-spacing 0.3px / `var(--text-tertiary)`
  - `.meta-value`: 12.5px / 700 / `var(--text-primary)` / nowrap
  - 판매가 값에는 `<span style="color:var(--brand-primary);font-size:10px;">(35%↓)</span>` 인라인

#### 폼 카드
- `.form-card`에 `border: 1px solid var(--border-light)` 추가
- **상단에 `.form-intro` 섹션** 필수:
  ```html
  <div class="form-intro">
    <h3>당첨자 정보</h3>
    <p>입력하신 정보로 상품을 배송해 드릴 예정이에요.</p>
    <div class="required-note">* 표시는 필수 입력 항목이에요</div>
  </div>
  ```
  - h3 앞에 그라디언트 세로바 데코(`::before`, 3×15px, primary→secondary)
  - 하단 `border-bottom: 1px solid var(--border-light)`로 구분

#### 필드 구조
- 필드 래퍼 클래스명은 **`.field`** (not `.form-field`)
- 라벨 안에 `field-hint`(서브설명) 포함:
  ```html
  <label>
    구매하신 제품명 <span class="required">*</span>
    <div class="field-hint">옵션(박스 수)을 포함해 주세요</div>
  </label>
  ```
- 필수표시: `<span class="required">*</span>` (red, margin-left:2px)
- 입력 필드 스타일:
  - `padding: 11px 14px`, `font-size: 14px`, `border-radius: 10px`
  - 기본 배경 `#FAFAF8`, hover/focus 시 `white`
  - placeholder 색 `#C4BBB3`, 글자 13px
- 에러 표시: `.field.error`가 부모에 추가되면 input은 `border-color: var(--error); background: #FFF5F5;`
- `.field-error-msg` 11px / red, `.field.error` 일 때만 display

#### 필드별 hint 텍스트
| 필드 | 라벨 | hint |
|---|---|---|
| product | 구매하신 제품명 | 옵션(박스 수)을 포함해 주세요 |
| instagram | 인스타그램 아이디 | 본인 확인에 사용돼요 |
| recipient | 수령인 성함 | (없음) |
| address | 배송 주소 | 검색 후 상세 주소(동·호수)를 입력해 주세요 |
| phone | 연락처 | 배송 연락에 사용돼요 |
| order_number | 주문번호 | 결제 완료 후 받은 주문번호예요 |

- 제품명 placeholder: `예: 친한약사 X YDY 데일리 이뮨 C&D / 3박스`
- 인스타 placeholder: `your_id`
- 연락처 placeholder: `010-0000-0000`

#### 주소 필드
- `.addr-row input`, `.addr-base` 는 readonly 시 배경 `#F3F2F0 !important`, 글자 `var(--text-secondary)`, focus 효과 제거
- `.btn-addr-search`: `linear-gradient(135deg, var(--brand-primary), var(--brand-dark))`, height 44px, padding `0 16px`, 그림자 `0 3px 8px rgba(255,107,53,0.3)`
- **주소 직렬화 형식** (hidden `address` 필드 값):
  ```js
  // (우편번호) 기본주소 상세주소
  addrFull.value = zip
    ? `(${zip}) ${base}${detail ? ' ' + detail : ''}`
    : (base ? `${base}${detail ? ' ' + detail : ''}` : detail);
  ```

#### 전화번호 자동 포맷·검증
- 자동 포맷:
  ```js
  function formatPhone(v) {
    const n = v.replace(/\D/g, '');
    if (n.length <= 3) return n;
    if (n.length <= 7) return `${n.slice(0,3)}-${n.slice(3)}`;
    return `${n.slice(0,3)}-${n.slice(3,7)}-${n.slice(7,11)}`;
  }
  ```
- 검증 정규식: `/^01[0-9]-\d{3,4}-\d{4}$/` — 휴대폰만 허용

#### 검증 동작
- 각 input에 `blur`로 per-field 검증 → `.field.error` 토글
- `input` 이벤트는 이미 에러인 필드만 재검증
- submit 시 모든 필드 검증 → 실패하면 토스트 `'필수 항목을 확인해 주세요'` + 첫 에러 필드로 `scrollIntoView({behavior:'smooth', block:'center'})`
- 주소는 `validateAddress()`로 별도 검증 (zipcode 없어도 detail만으로 통과 가능)

#### 폼 액션 영역
```css
.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--border-light);
}
```
- 버튼 padding `13px 20px`, font 14px, border-radius 10px
- `.btn-primary` 그라디언트: `linear-gradient(135deg, var(--brand-primary), var(--brand-dark))` (primary→dark)
- `.btn-secondary`: `flex: 0 0 auto`, padding `0 16px`, font 13px
- **모바일(`max-width:540px`)**: `flex-direction: column-reverse` (제출 버튼이 위로), `.btn-secondary { flex: 1; }`

#### 제출 결과
- 성공 시 토스트 `'제출 완료! 🎉'` 표시 후 `renderSuccess` 호출
- `renderSuccess(data)` 는 `id, recipient, phone, instagram, orderNumber` 행을 동적 innerHTML로 주입

#### 성공 화면
- 클래스명: `.success-screen` (not `.success-card`), padding `40px 24px`
- 진입 애니메이션: `fadeInUp 0.4s ease`
- 아이콘 컨테이너 `68×68`, 그라디언트 `linear-gradient(135deg, #FFB088, #FF6B35)` (밝은쪽→primary)
- 아이콘 SVG 체크: `viewBox="0 0 24 24" stroke-width="3"`, points `20 6 9 17 4 12`
- 아이콘 bounce는 **반복(0%,100% scale1; 50% scale1.12)** 가 아닌 **0.5s 1회** 형태로 사용
- 본문 카피: `입력하신 정보를 기반으로<br>빠르게 상품을 준비해서 보내드릴게요 ❤`
- 요약 카드 클래스 `.success-summary`, dashed border (`var(--brand-accent)`), padding `16px 18px`
- 요약 행 `.success-summary-row`: label / value 양 끝 정렬, value `max-width: 60%; text-align:right; word-break:break-word`
- 돌아가기 버튼: `.btn.btn-secondary`, `max-width: 180px; margin: 0 auto; display: block`

#### 푸터
- 글자 11.5px, line-height 1.8
- 두 번째 `<p>`에 `style="margin-top:6px;"` 적용

### 6.3 admin.html 보정

#### 배경
- `body` 배경을 index와 다르게:
  ```css
  background: linear-gradient(135deg, #FFF4ED 0%, #FFE8D6 50%, #FFF4ED 100%);
  background-attachment: fixed;
  ```
- `--text-tertiary: #8A8A8A`, `--border-light: #F0E8E0`, `--border-input: #E5DDD4` 로 약간 조정
- 그림자 변수 추가: `--shadow-lg: 0 12px 32px rgba(255,107,53,0.12), 0 4px 12px rgba(0,0,0,0.06)`

#### 로그인 화면
- **풀스크린 센터링**: 별도 래퍼 `.login-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; padding: 32px 20px; }`
- `.login-card`: `border-radius: 20px; padding: 40px 32px; max-width: 420px; box-shadow: var(--shadow-lg)`, `fadeInUp 0.5s ease` 진입
- **상단 배지**: `.login-logo { background: var(--brand-soft); color: var(--brand-primary); padding: 8px 18px; border-radius:100px; font-size:13px; font-weight:700; }` + `::before { content: '🔒'; }`
- 텍스트:
  - `<div class="login-logo">관리자 로그인</div>`
  - `<h1>이벤트 응답 관리</h1>`
  - `<p class="sub">응답 데이터를 조회하려면 로그인하세요.</p>`
- **input value 사전 입력**: `value="admin"` / `value="1234"` (편의성)
- 로그인 실패 메시지: `<div class="login-err">아이디 또는 비밀번호가 올바르지 않습니다.</div>` — 빨간 배경 박스 (`#FFF5F5`, padding `10px 14px`, border-radius 10px)
- 로그인 버튼 클래스: `.btn-login` (primary 그라디언트, full-width, padding 14px)

#### 어드민 상단
- 구조: 좌측 `.admin-title`(세로) + 우측 `.admin-actions` (flex-wrap)
- `.admin-title .badge`: 흰 배경, primary 글자색, 점 데코(6×6), `width: fit-content`
- `.admin-title h1`: `26px / 800 / 📋 이벤트 응답 관리`
- **액션 버튼은 모두 상단에 모여 있음** (`.admin-actions`):
  ```
  [입력 폼 →]  [📊 구글 시트]  [엑셀 내보내기 (primary)]  [CSV 내보내기]  [전체 삭제 (danger)]  [로그아웃]
  ```
- **📊 구글 시트** 버튼: `<a class="btn-sm" target="_blank" rel="noopener">` — Google Sheets 원본을 새 탭으로 연다.
  - 링크: `https://docs.google.com/spreadsheets/d/1xhZ5W7YVJk9tWT8v5aL5ezab89YR-DgNut-1LbSjcYo/edit?gid=1036698934#gid=1036698934`
- `.btn-sm`: padding `9px 16px`, font 13px, border-radius 10px, 흰 배경 + border, hover 시 primary 컬러
- `.btn-sm.primary`: primary→dark 그라디언트, 흰 글자
- `.btn-sm.danger`: hover 시 `border-color: var(--error); color: var(--error)`

#### 통계 카드 (3개)
| 라벨 | 값 |
|---|---|
| 총 제출 건수 | 전체 응답 수 |
| 오늘 제출 | 오늘 날짜의 응답 수 |
| 최근 업데이트 | **가장 최신 제출 시각** (timestamp, `YYYY-MM-DD HH:mm`), 데이터 없으면 `-` |

- `.stat-label`: 11px, uppercase, letter-spacing 0.3px
- `.stat-value`: 28px, 800, **`var(--brand-primary)` 색상**
- `.stat-value.small { font-size: 16px; }` — 최근 업데이트 셀에 적용

#### 툴바
```
[검색 input]  [새로고침]                        조회: <strong>0</strong>건
```
- 검색 placeholder: `🔍 인스타 / 수령인 / 주문번호 검색`
- `.stats-inline { margin-left: auto; font-size: 13px; color: var(--text-tertiary); }`, strong은 primary
- 검색 input 너비 `min-width: 220px`, 모바일에서 `width: 100%`

#### 테이블
- **컬럼 10개** (행 번호 포함):
  ```
  # | 제출번호 | 제출시각 | 상품 | 인스타그램 | 수령인 | 주소 | 연락처 | 주문번호 | (삭제버튼)
  ```
- thead th: `font-size: 11px`, `text-transform: uppercase`, `letter-spacing: 0.4px`, `color: var(--text-tertiary)`, 배경 `var(--brand-softer)`
- `td.num`: 행 번호, tertiary 색
- `td.id-cell`: **`var(--brand-primary)` 색**, 700, 12px
- `td.date-cell`: tertiary, 12px
- `td.addr-cell`: max-width 220px, 12px
- 정렬: 항상 `submittedAt` desc
- 삭제 버튼 `.submission-del`: 작고 중립적(border-input + tertiary), hover 시 빨강

#### Empty state (테이블 비어있을 때)
- 별도 박스 `.empty-state`: 80px 패딩, dashed border, 가운데 정렬
- 📭 아이콘(56px, opacity 0.5) + 메시지
- 메시지는 상황별:
  - 데이터 0건: `아직 제출된 데이터가 없어요`
  - 검색 결과 0건: `검색 결과가 없어요`

#### 로그아웃
- `localStorage.removeItem(SESSION_KEY)` 후 `location.reload()` (페이지 새로고침으로 로그인 화면 복귀)

#### 삭제 확인
- 개별 삭제: `이 응답을 삭제할까요? 되돌릴 수 없습니다.`
- 전체 삭제: `모든 제출 데이터를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.` (단일 confirm)

#### Toast 사이즈
- admin.html 토스트는 약간 큼: `padding: 14px 24px; font-size: 14px; bottom: 32px`

#### 반응형 (`max-width: 600px`)
- `.admin-top { flex-direction: column; align-items: flex-start; }`
- `.admin-stats { grid-template-columns: 1fr; }`
- `.toolbar input[type="text"] { width: 100%; min-width: 0; }`
- `.toolbar .stats-inline { margin-left: 0; }`
- `.admin-actions { width: 100%; }` + `.admin-actions .btn-sm { flex: 1; }`
