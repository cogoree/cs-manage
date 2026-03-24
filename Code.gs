var DB_SHEET_NAME = "CS DB";
var CODE_SHEET_CANDIDATES = ["code", "코드", "db", "data"];

var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

function doGet(e) {
  if (e.parameter && e.parameter.action) {
    var action = e.parameter.action;
    var payload = e.parameter.payload ? JSON.parse(e.parameter.payload) : null;
    var callback = e.parameter.callback || 'callback';
    var result;

    try {
      switch(action) {
        case 'getInitialData': result = getInitialData(); break;
        case 'saveCsLog': result = saveCsLog(payload); break;
        case 'updateCsLog': result = updateCsLog(payload); break;
        case 'deleteCsLog': result = deleteCsLog(payload); break;
        case 'searchCsLogs': result = searchCsLogs(payload.startDate, payload.endDate, payload.onlyIng, payload.hospital, payload.caller, payload.receiver); break;
        case 'getMyTodoList': result = getMyTodoList(payload); break;
        case 'getDashboardStats': result = getDashboardStats(payload.startDate, payload.endDate, payload.hospital, payload.caller, payload.receiver); break;
        case 'callGemini': result = callGemini(payload); break;
        case 'generateFaqByAI': result = generateFaqByAI(payload.question, payload.answer, payload.product, payload.hospital, payload.caller); break;
        case 'getQuickHistory': result = getQuickHistory(payload.hospital, payload.caller); break;
        case 'searchDevLogs': result = searchDevLogs(payload.startDate, payload.endDate, payload.receiver, payload.devStatus); break;
        case 'updateDevStatus': result = updateDevStatus(payload.index, payload.devStatus); break;
        default: throw new Error("알 수 없는 요청: " + action);
      }
      var json = JSON.stringify({ status: 'success', data: result });
    } catch(err) {
      var json = JSON.stringify({ status: 'error', message: err.toString() });
    }

    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // Apps Script 내부 접근용 (기존 유지)
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('CS 통합 관리 시스템')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getInitialData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var codeSheet = null;
  for (var i = 0; i < ss.getSheets().length; i++) {
    if (CODE_SHEET_CANDIDATES.includes(ss.getSheets()[i].getName().toLowerCase().replace(/\s/g, ""))) { codeSheet = ss.getSheets()[i]; break; }
  }
  if (!codeSheet) codeSheet = ss.getSheetByName("code");
  if (!codeSheet) return { error: "❌ 'code' 시트를 찾을 수 없습니다." };

  var lastRow = codeSheet.getLastRow();
  if (lastRow < 2) return { error: "⚠️ 'code' 시트에 데이터가 없습니다." };
  
  var data = codeSheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var result = { hospitals: [], depts: [], products: [], types: [], statuses: [], devStatuses: [], users: [], mapProductToCat1: [], mapCat1ToCat2: [] };

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if(row[9]) result.hospitals.push(String(row[9]).trim());
    if(row[2]) result.depts.push(String(row[2]).trim());
    if(row[1]) result.products.push(String(row[1]).trim());
    if(row[3]) result.types.push(String(row[3]).trim());
    if(row[8]) result.statuses.push(String(row[8]).trim());
    if(row[4] && row[5]) result.mapProductToCat1.push({ key: String(row[4]).trim(), val: String(row[5]).trim() });
    if(row[6] && row[7]) result.mapCat1ToCat2.push({ key: String(row[6]).trim(), val: String(row[7]).trim() });
    if(row[10]) result.devStatuses.push(String(row[10]).trim());
    if(row[0]) result.users.push(String(row[0]).trim());
  }
  return result;
}

function saveCsLog(form) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dbSheet = ss.getSheetByName(DB_SHEET_NAME);
  if (!dbSheet) return "오류: 'CS DB' 시트가 없습니다.";

  try {
    var lastRow = dbSheet.getLastRow();
    var newIndex = 1;
    if (lastRow > 1) {
      var indexes = dbSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
      var maxVal = 0;
      for(var i=0; i<indexes.length; i++) { var num = Number(indexes[i]); if(!isNaN(num) && num > maxVal) maxVal = num; }
      newIndex = maxVal + 1;
    }
    // 💡 [수정] form.rawContent (P열, 인덱스 15) 추가
    var rowData = [
      newIndex, form.date, form.hospital, form.product, form.dept,
      form.caller, form.callType, form.category1, form.category2,
      form.content, form.answer, form.status, form.receiver, form.duration, form.callback, form.rawContent, form.devStatus || "", form.handover || ""
    ];
    dbSheet.appendRow(rowData);
    return "SUCCESS";
  } catch (e) { return "에러: " + e.toString(); }
}

function updateCsLog(form) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dbSheet = ss.getSheetByName(DB_SHEET_NAME);
  try {
    var targetIndex = Number(form.index);
    var lastRow = dbSheet.getLastRow();
    var indexList = dbSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    var rowIndex = -1;
    for(var i=0; i<indexList.length; i++) { if(indexList[i] == targetIndex) { rowIndex = i + 2; break; } }
    if (rowIndex === -1) return "수정 대상을 찾을 수 없습니다.";
    
    // 💡 [수정] form.rawContent (P열) 추가 및 17열 업데이트
    var rowData = [
      targetIndex, form.date, form.hospital, form.product, form.dept,
      form.caller, form.callType, form.category1, form.category2,
      form.content, form.answer, form.status, form.receiver, form.duration, form.callback, form.rawContent, form.devStatus || "", form.handover || ""
    ];
    dbSheet.getRange(rowIndex, 1, 1, 18).setValues([rowData]);
    return "UPDATED";
  } catch (e) { return "에러: " + e.toString(); }
}

function deleteCsLog(index) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dbSheet = ss.getSheetByName(DB_SHEET_NAME);
  if (!dbSheet) return "오류: 시트 없음";
  try {
    var targetIndex = Number(index);
    var lastRow = dbSheet.getLastRow();
    var indexList = dbSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    var rowIndex = -1;
    for(var i=0; i<indexList.length; i++) { if(indexList[i] == targetIndex) { rowIndex = i + 2; break; } }
    if (rowIndex === -1) return "삭제할 데이터를 찾을 수 없습니다.";
    dbSheet.deleteRow(rowIndex);
    return "DELETED";
  } catch (e) { return "에러: " + e.toString(); }
}

function searchCsLogs(startDate, endDate, onlyIng, hospital, caller, receiver) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DB_SHEET_NAME);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
  var results = [];
  
  var start = new Date(startDate); start.setHours(0,0,0,0); var startTime = start.getTime();
  var end = new Date(endDate); end.setHours(23,59,59,999); var endTime = end.getTime();
  
  var sHosp = hospital ? String(hospital).toLowerCase().trim() : "";
  var sCaller = caller ? String(caller).toLowerCase().trim() : ""; 
  var sRecv = receiver ? String(receiver).toLowerCase().trim() : "";

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowDate = row[1];
    var dTime = (rowDate instanceof Date) ? rowDate.getTime() : new Date(rowDate).getTime();
    
    // 날짜 범위 필터
    if (isNaN(dTime) || dTime < startTime || dTime > endTime) continue;

    var s = String(row[11]); // 상태
    if (onlyIng && s.includes('완료')) continue;
    if (sHosp && !String(row[2]).toLowerCase().includes(sHosp)) continue;
    if (sCaller && !String(row[5]).toLowerCase().includes(sCaller)) continue; 
    if (sRecv && !String(row[12]).toLowerCase().includes(sRecv)) continue;

    results.push({
      index: row[0], 
      dateObj: dTime, // 💡 정렬을 위한 숫자형 날짜 데이터 임시 저장
      date: Utilities.formatDate(new Date(dTime), "Asia/Seoul", "yyyy-MM-dd"), 
      hospital: row[2], product: row[3], dept: row[4], caller: row[5],
      type: row[6], cat1: row[7], cat2: row[8], content: row[9],
      answer: row[10], status: s, receiver: row[12], duration: row[13], callback: row[14],
      rawContent: row[15],
      devStatus: row[16],
      handover: row[17]
    });
  }

  // 💡 [핵심 수정] B열 날짜(dateObj) 기준 내림차순 정렬 (최신 날짜가 위로 오게)
  results.sort(function(a, b) {
    return b.dateObj - a.dateObj;
  });

  // 최대 100개까지만 잘라서 반환 (속도 최적화)
  return results.slice(0, 100);
}

function getMyTodoList(user) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DB_SHEET_NAME);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // 💡 [수정] Q열(17번째 열)까지 가져오기
  var data = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
  var results = [];
  var today = new Date(); today.setHours(0,0,0,0); 

  for (var i = data.length - 1; i >= 0; i--) {
    var row = data[i];
    var status = String(row[11]);
    var receiver = String(row[12]);
    var handover = String(row[17] || "");

    if (!status.includes('완료') && (receiver === user || handover === user)) {
      var rowDate = row[1];
      var dTime = (rowDate instanceof Date) ? rowDate : new Date(rowDate);
      dTime.setHours(0,0,0,0);
      var diffTime = today.getTime() - dTime.getTime();
      var diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
      var dTag = "D+" + diffDays;
      if (diffDays === 0) dTag = "오늘";

      results.push({
        index: row[0], date: Utilities.formatDate(dTime, "Asia/Seoul", "yyyy-MM-dd"), 
        hospital: row[2], product: row[3], caller: row[5], type: row[6],
        content: row[9], answer: row[10], status: status, receiver: receiver,
        dTag: dTag, cat1: row[7], cat2: row[8], dept: row[4], duration: row[13], callback: row[14],
        rawContent: row[15],
        devStatus: row[16],
        handover: row[17]
      });
    }
  }
  return results;
}

function getDashboardStats(startDate, endDate, hospital, caller, receiver) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DB_SHEET_NAME);
  if (!sheet) return { total: 0, rate: 0, topHospitals: [], topCallers: [], topCategories: [], monthlyTrend: {} };
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { total: 0, rate: 0, topHospitals: [], topCallers: [], topCategories: [], monthlyTrend: {} };

  var data = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
  
  var start = startDate ? new Date(startDate) : new Date("2000-01-01"); start.setHours(0,0,0,0);
  var startTime = start.getTime();
  var end = endDate ? new Date(endDate) : new Date(); end.setHours(23,59,59,999);
  var endTime = end.getTime();
  
  var sHosp = hospital ? String(hospital).toLowerCase().trim() : "";
  var sCaller = caller ? String(caller).toLowerCase().trim() : "";
  var sRecv = receiver ? String(receiver).toLowerCase().trim() : "";

  var totalCount = 0; var doneCount = 0; var hospMap = {}; var callerMap = {}; var catMap = {}; var trendMap = {};

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowDate = row[1];
    var dTime = (rowDate instanceof Date) ? rowDate.getTime() : new Date(rowDate).getTime();
    
    if (isNaN(dTime) || dTime < startTime || dTime > endTime) continue;
    if (sHosp && !String(row[2]).toLowerCase().includes(sHosp)) continue;
    if (sCaller && !String(row[5]).toLowerCase().includes(sCaller)) continue;
    if (sRecv && !String(row[12]).toLowerCase().includes(sRecv)) continue;

    totalCount++;
    if (String(row[11]).includes('완료')) doneCount++;

    var hName = String(row[2]).trim() || "미기재"; hName = hName.replace(/\(.*\)/g, '').trim(); 
    hospMap[hName] = (hospMap[hName] || 0) + 1;

    var cName = String(row[5]).trim();
    if (cName !== "") { var cKey = cName + (hName !== "미기재" ? " (" + hName + ")" : ""); callerMap[cKey] = (callerMap[cKey] || 0) + 1; }

    var cat1 = String(row[7]).trim(); var cat2 = String(row[8]).trim(); var catKey = "";
    if (cat1 && cat2) catKey = cat1 + " > " + cat2; 
    else if (cat1) catKey = cat1;                
    else catKey = String(row[3]).trim() || "기타"; 
    catMap[catKey] = (catMap[catKey] || 0) + 1;

    var dObj = new Date(dTime);
    var keyYM = dObj.getFullYear() + "-" + String(dObj.getMonth() + 1).padStart(2, '0');
    trendMap[keyYM] = (trendMap[keyYM] || 0) + 1;
  }

  var sortedHosp = Object.keys(hospMap).map(function(k) { return { label: k, data: hospMap[k] }; }).sort(function(a, b) { return b.data - a.data; }).slice(0, 5);
  var sortedCaller = Object.keys(callerMap).map(function(k) { return { label: k, data: callerMap[k] }; }).sort(function(a, b) { return b.data - a.data; }).slice(0, 5);
  var sortedCat = Object.keys(catMap).map(function(k) { return { label: k, data: catMap[k] }; }).sort(function(a, b) { return b.data - a.data; }).slice(0, 5);
  var sortedTrend = Object.keys(trendMap).sort().map(function(k) { return { label: k, data: trendMap[k] }; });

  return { total: totalCount, rate: totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100), topHospitals: sortedHosp, topCallers: sortedCaller, topCategories: sortedCat, monthlyTrend: sortedTrend };
}

function callGemini(input) {
  var cleanKey = GEMINI_API_KEY.trim();
  if (!cleanKey || cleanKey.includes("API_KEY")) return "Error: API Key Check";

  // ✅ 수정 1: 올바른 모델명으로 변경
  var modelName = "gemini-2.0-flash";
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + cleanKey;
  
  var userContent = []; 
  
  var promptText = "너는 베테랑 CS 상담원이야. 제공된 내용(텍스트 또는 오디오)을 분석해서 요약, 핵심 질문, 처리 답변, 그리고 카테고리 분류를 작성해줘.\n" +
                   "1. **[요약]**: 전체 내용을 1줄로 요약.\n" +
                   "2. **[질문]**: 고객의 핵심 질문 1줄 (답변 포함 X).\n" +
                   "3. **[답변]**: **CS 이력 기록용**이므로 '~습니다' 같은 대화체를 쓰지 말고, '**~안내함', '~완료', '~예정'**과 같은 **개조식** 문체로 간결하게 3줄 이내 작성.\n" +
                   "4. **[분류]**: 내용에서 파악되는 '분과', '제품', '구분', '분류1', '분류2'를 유추해서 적어줘. (정확히 모르면 빈칸으로 둬)\n" +
                   "5. **주의**: 출력 텍스트에 ** 같은 마크다운 강조 기호를 절대 넣지 마.\n\n" +
                   "[출력 형식]\n[요약]\n(내용)\n\n[질문]\n(내용)\n\n[답변]\n(내용)\n\n[분류]\n분과: (내용)\n제품: (내용)\n구분: (내용)\n분류1: (내용)\n분류2: (내용)";

  if (typeof input === 'string') { 
    userContent.push({ "text": "[통화 내용]\n" + input + "\n\n" + promptText }); 
  } else if (input && input.mimeType && input.data) { 
    userContent.push({ "text": "아래는 고객과의 통화 녹음 파일이야. 내용을 듣고 분석해줘.\n" + promptText }); 
    userContent.push({ "inlineData": { "mimeType": input.mimeType, "data": input.data } }); 
  } else { 
    return "Error: Data Format Error"; 
  }

  var payload = { "contents": [{ "parts": userContent }] };
  
  // ✅ 수정 2: API 응답 대기 시간 명시적으로 설정
  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true,
    "deadline": 50  // ✅ UrlFetchApp 최대 대기 50초 (기본값 10초라 timeout 나던 원인 중 하나)
  };

  // ✅ 수정 3: 503 retry 대기시간 단축 (1500ms → 500ms)
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();
      if (code === 200) { 
        var json = JSON.parse(response.getContentText()); 
        if (json.candidates && json.candidates.length > 0) return json.candidates[0].content.parts[0].text; 
        return "❌ AI No Response";
      } else if (code === 503) { 
        Utilities.sleep(500 * attempt); continue;  // ✅ 1500ms → 500ms
      } else { 
        return "AI Error (" + code + "): " + response.getContentText(); 
      }
    } catch (e) { 
      return "Conn Error: " + e.toString(); 
    }
  }
  return "❌ AI No Response";
}

function generateFaqByAI(question, answer, product, hospital, caller) {
  var cleanKey = GEMINI_API_KEY.trim();
  if (!cleanKey || cleanKey.includes("API_KEY")) return "Error: API Key Check";

  var modelName = "gemini-2.0-flash"; 
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + cleanKey;
  
  var promptText = "너는 고객지원(CS) 전문가야. 다음은 고객의 문의 내용과 상담원의 짧은 조치 결과(메모)야.\n" +
                   "이 내용을 바탕으로, 고객(" + hospital + " " + caller + "님)에게 카카오톡이나 이메일로 바로 보낼 수 있는 '친절하고 상세한 매뉴얼/가이드 형태의 답변 템플릿'을 작성해줘.\n" +
                   "상담원의 답변이 '안내함', '설명드림' 처럼 아주 짧더라도, 관련 솔루션(" + product + ")의 상황을 유추해서 고객이 이해하고 직접 따라할 수 있게 살을 붙여서 작성해줘.\n\n" +
                   "[고객 문의]: " + question + "\n" +
                   "[상담원 메모]: " + answer + "\n\n" +
                   "[출력 조건]\n1. 인사말 포함 (안녕하세요 " + hospital + " " + caller + "님)\n2. 문의하신 내용에 대한 공감 및 안내\n3. 해결 방법 (단계별로 상세히)\n4. 마무리 인사 (감사합니다)\n5. 마크다운(**) 기호는 빼고 순수 텍스트로만 작성해줘.";

  var payload = { "contents": [{ "parts": [{ "text": promptText }] }] };
  var options = { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true };

  for (var attempt = 1; attempt <= 2; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      if (response.getResponseCode() === 200) { 
        var json = JSON.parse(response.getContentText()); 
        if (json.candidates && json.candidates.length > 0) return json.candidates[0].content.parts[0].text; 
      } 
    } catch (e) { return "Conn Error: " + e.toString(); }
  }
  return "❌ AI 응답 실패";
}

function getQuickHistory(hospital, caller) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DB_SHEET_NAME);
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // 전체 데이터 가져오기
  var data = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
  var results = [];
  
  var sHosp = hospital ? String(hospital).toLowerCase().replace(/\s/g, "") : "";
  var sCaller = caller ? String(caller).toLowerCase().replace(/\s/g, "") : "";

  // 둘 다 비어있으면 검색 안 함
  if (sHosp === "" && sCaller === "") return [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowDate = row[1];
    // 정렬을 위한 시간값 추출
    var dTime = (rowDate instanceof Date) ? rowDate.getTime() : new Date(rowDate).getTime();

    var dbHosp = String(row[2]).toLowerCase().replace(/\s/g, ""); // 병원명 (C열)
    var dbCaller = String(row[5]).toLowerCase().replace(/\s/g, ""); // 발신자 (F열)

    var isMatch = false;

    // 로직: 입력된 값만 검사 (둘 다 입력했으면 둘 다 맞아야 함 / 하나만 입력했으면 그것만 맞으면 됨)
    if (sHosp && sCaller) {
      if (dbHosp.includes(sHosp) && dbCaller.includes(sCaller)) isMatch = true;
    } else if (sHosp) {
      if (dbHosp.includes(sHosp)) isMatch = true;
    } else if (sCaller) {
      if (dbCaller.includes(sCaller)) isMatch = true;
    }

    if (isMatch) {
      results.push({
        dateObj: dTime, // 💡 정렬용 날짜 데이터 추가
        date: Utilities.formatDate(new Date(dTime), "Asia/Seoul", "yyyy-MM-dd"),
        hospital: row[2],
        caller: row[5],
        product: row[3],
        content: row[9],
        answer: row[10],
        status: row[11],
        receiver: row[12] // 상담원
      });
    }
  }

  // 💡 [핵심] 단순 역순(reverse)이 아니라, 실제 날짜(dateObj) 기준 내림차순 정렬
  results.sort(function(a, b) {
    return b.dateObj - a.dateObj;
  });

  return results;
}

function searchDevLogs(startDate, endDate, receiver, devStatus) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DB_SHEET_NAME);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
  var results = [];
  var start = new Date(startDate); start.setHours(0,0,0,0);
  var end = new Date(endDate); end.setHours(23,59,59,999);
  var sRecv = receiver ? String(receiver).toLowerCase().trim() : "";
  var sDev = devStatus ? String(devStatus).trim() : "";
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowDevStatus = String(row[16] || "").trim();
    if (!rowDevStatus) continue;
    var rowDate = row[1];
    var dTime = (rowDate instanceof Date) ? rowDate.getTime() : new Date(rowDate).getTime();
    if (isNaN(dTime) || dTime < start.getTime() || dTime > end.getTime()) continue;
    if (sRecv && !String(row[12]).toLowerCase().includes(sRecv)) continue;
    if (sDev && rowDevStatus !== sDev) continue;
    results.push({
      index: row[0], dateObj: dTime,
      date: Utilities.formatDate(new Date(dTime), "Asia/Seoul", "yyyy-MM-dd"),
      hospital: row[2], product: row[3], dept: row[4], caller: row[5],
      type: row[6], cat1: row[7], cat2: row[8], content: row[9],
      answer: row[10], status: row[11], receiver: row[12],
      devStatus: rowDevStatus, handover: row[17]
    });
  }
  results.sort(function(a, b) { return b.dateObj - a.dateObj; });
  return results.slice(0, 200);
}

function updateDevStatus(index, devStatus) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DB_SHEET_NAME);
  if (!sheet) return "오류: 시트 없음";
  try {
    var targetIndex = Number(index);
    var lastRow = sheet.getLastRow();
    var indexList = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    var rowIndex = -1;
    for (var i = 0; i < indexList.length; i++) {
      if (indexList[i] == targetIndex) { rowIndex = i + 2; break; }
    }
    if (rowIndex === -1) return "대상을 찾을 수 없습니다.";
    sheet.getRange(rowIndex, 17).setValue(devStatus);
    return "UPDATED";
  } catch(e) { return "에러: " + e.toString(); }
}


function doPost(e) {
  try {
    // 폼 데이터 방식 대신 다시 원래의 깔끔한 JSON 방식으로 복구합니다.
    var params = JSON.parse(e.postData.contents);
    var action = params.action;
    var payload = params.payload;
    var result;

    switch(action) {
      case 'getInitialData': result = getInitialData(); break;
      case 'saveCsLog': result = saveCsLog(payload); break;
      case 'updateCsLog': result = updateCsLog(payload); break;
      case 'deleteCsLog': result = deleteCsLog(payload); break;
      case 'searchCsLogs': result = searchCsLogs(payload.startDate, payload.endDate, payload.onlyIng, payload.hospital, payload.caller, payload.receiver); break;
      case 'getMyTodoList': result = getMyTodoList(payload); break;
      case 'getDashboardStats': result = getDashboardStats(payload.startDate, payload.endDate, payload.hospital, payload.caller, payload.receiver); break;
      case 'callGemini': result = callGemini(payload); break;
      case 'generateFaqByAI': result = generateFaqByAI(payload.question, payload.answer, payload.product, payload.hospital, payload.caller); break;
      case 'getQuickHistory': result = getQuickHistory(payload.hospital, payload.caller); break;
      case 'searchDevLogs': result = searchDevLogs(payload.startDate, payload.endDate, payload.receiver, payload.devStatus); break;
      case 'updateDevStatus': result = updateDevStatus(payload.index, payload.devStatus); break;
      default: throw new Error("알 수 없는 요청: " + action);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: result }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
