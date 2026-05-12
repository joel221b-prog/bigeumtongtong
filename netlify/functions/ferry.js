/**
 * Netlify Function: ferry.js
 * KOMSA 운항 스케줄 API 프록시
 *
 * ✅ 확인된 실제 응답 필드 (snake_case):
 *   rlvt_ymd, sail_tm, psnshp_nm, oport_nm, dest_nm,
 *   lcns_seawy_nm, nvg_seawy_nm, nvg_drc_nm, nvg_se_cd ...
 */

/* "830" → "08:30" */
function fmtTime(t) {
  if (!t) return "";
  const s = String(t).padStart(4, "0");
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

/* 출발시각(숫자) + 분 → "HH:MM" */
function addMinutes(sailTm, min) {
  if (!sailTm) return "";
  const s   = String(sailTm).padStart(4, "0");
  const h   = parseInt(s.slice(0, 2), 10);
  const m   = parseInt(s.slice(2, 4), 10);
  const tot = h * 60 + m + min;
  const rh  = Math.floor(tot / 60) % 24;
  const rm  = tot % 60;
  return `${String(rh).padStart(2,"0")}:${String(rm).padStart(2,"0")}`;
}

exports.handler = async (event) => {
  const API_KEY  = process.env.KOMSA_API_KEY;
  const BASE_URL = "https://apis.data.go.kr/B554035/oprt-schd-info-v2/get-oprt-schd-info-v2";

  if (!API_KEY) return res(500, { error: "KOMSA_API_KEY 환경변수가 없습니다." });

  const { depPort, date } = event.queryStringParameters || {};
  if (!date) return res(400, { error: "date 파라미터가 필요합니다." });

  try {
    const params = new URLSearchParams({
      serviceKey: API_KEY,
      pageNo:     "1",
      numOfRows:  "1000",  // 전국 모든 항로 포함 → 충분히 크게
      dataType:   "JSON",
      rlvtYmd:    date,
    });

    const response = await fetch(`${BASE_URL}?${params}`);
    const text     = await response.text();
    console.log("[ferry] 상태:", response.status, "앞부분:", text.slice(0, 200));

    if (!response.ok) return res(502, { error: `HTTP ${response.status}` });

    let data;
    try { data = JSON.parse(text); }
    catch { return res(502, { error: "JSON 파싱 실패", raw: text.slice(0, 200) }); }

    const resultCode = data?.response?.header?.resultCode;
    if (resultCode && resultCode !== "00" && resultCode !== "200") {
      return res(502, {
        error: `KOMSA 오류: ${data?.response?.header?.resultMsg}`,
        code: resultCode,
      });
    }

    const raw  = data?.response?.body?.items?.item ?? [];
    const all  = Array.isArray(raw) ? raw : (raw && Object.keys(raw).length ? [raw] : []);
    console.log("[ferry] 전체 항목:", all.length);

    /* 필터: 면허항로명(lcns_seawy_nm)에 가산+남강 포함 + 출항지 일치
       - 직항(남강-가산): lcns_seawy_nm = "남강-가산" → 포함
       - 도초카훼리(도초-목포): lcns_seawy_nm = "도초-목포" → 가산/남강 없음 → 제외 */
    const items = all.filter(item => {
      const lcns  = item.lcns_seawy_nm ?? "";
      const oport = item.oport_nm      ?? "";
      const licenseMatch = lcns.includes("가산") && lcns.includes("남강");
      const depMatch     = oport.includes(depPort);
      return licenseMatch && depMatch;
    });

    console.log("[ferry] 필터 후:", items.length, "/ 출항:", depPort);

    /* 출발 시간 기준 정렬 */
    items.sort((a, b) => Number(a.sail_tm ?? 0) - Number(b.sail_tm ?? 0));

    if (items.length > 0) {
      const s = items[0];
      console.log("[ferry] 첫항목 lcns_seawy_nm:", s.lcns_seawy_nm,
        "/ nvg_seawy_nm:", s.nvg_seawy_nm, "/ nvg_se_nm:", s.nvg_se_nm);
      console.log("[ferry] 정원 필드 확인 — psngr_cap:", s.psngr_cap,
        "/ psnshp_cap:", s.psnshp_cap, "/ car_cap:", s.car_cap,
        "/ vhcl_cap:", s.vhcl_cap, "/ 전체키:", Object.keys(s).join(","));
    }

    const schedule = items.map((item, idx) => {
      const raw = item.nvg_stts_nm ?? "";
      const status = raw.includes("운항중") ? "운항중"
                   : raw.includes("완료")   ? "완료"
                   : (item.cntrl_rsn_nm || raw.includes("통제") || raw.includes("결항")) ? "결항"
                   : "예정";
      return {
        id:       idx + 1,
        dep:      fmtTime(item.sail_tm),
        arr:      item.arvl_tm ? fmtTime(item.arvl_tm) : addMinutes(item.sail_tm, 40), // API 없으면 +40분
        vessel:   item.psnshp_nm    ?? "정보없음",
        seats:    Number(item.psngr_cap ?? item.psnshp_cap ?? item.psnger_cap ?? item.psg_cap ?? 0),
        carCap:   Number(item.car_cap   ?? item.vhcl_cap   ?? item.cago_cap   ?? 0), // 차량 정원
        status,
        reason:   item.cntrl_rsn_nm ?? "",
        depPort:  item.oport_nm     ?? "",
        destPort: item.dest_nm      ?? "",
        routeNm:  item.nvg_seawy_nm  ?? "",   // 운항항로명 (표시용: 남강-가산(수치)-도초 등)
        lcnsNm:   item.lcns_seawy_nm ?? "",   // 면허항로명 (필터용: 남강-가산)
        nvgSe:    item.nvg_se_nm    ?? "",   // 운항구분 (정상/비운/증회)
      };
    });

    return res(200, { schedule, date, depPort, total: schedule.length });

  } catch (err) {
    console.error("[ferry] 오류:", err.message);
    return res(502, { error: "API 호출 실패", detail: err.message });
  }
};

function res(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify(body),
  };
}
