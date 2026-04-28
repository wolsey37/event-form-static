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
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/.../exec'; // 배포 후 교체
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
  <p><a class="admin-toggle" href="admin.html?login">관리자 페이지 →</a></p>
</div>
```

---

## 4. admin.html — 관리자 페이지

### JS 상수 및 초기화
```js
const ADMIN_ID = 'admin';
const ADMIN_PW = '1234';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/.../exec';
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

### Cloudflare Pages 최초 배포
```bash
npx wrangler login
npx wrangler pages project create event-form-static --production-branch main
cd event-form-static
npx wrangler pages deploy . --project-name event-form-static --branch main
```

### 재배포
```bash
cd event-form-static
npx wrangler pages deploy . --project-name event-form-static --branch main
```

### 배포 정보
| 구분 | URL |
|------|-----|
| **입력 폼** | https://event-form-static.pages.dev/ |
| **관리자** | https://event-form-static.pages.dev/admin.html |
| **Google Sheets** | https://docs.google.com/spreadsheets/d/1xhZ5W7YVJk9tWT8v5aL5ezab89YR-DgNut-1LbSjcYo |
| **Apps Script** | https://script.google.com/macros/s/AKfycbz4ihndsT6HQh1WYRch8vnCdRlY084Tw5sPrLDfLpCJ5raQROrUysoTEZMdjcLSWC3nbw/exec |
| Cloudflare 계정 | wolsey@pharma-bros.com |
