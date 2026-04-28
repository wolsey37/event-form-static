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
