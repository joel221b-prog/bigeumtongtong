/**
 * Netlify Function: ferry.js
 * KOMSA 운항 스케줄 API 프록시
 *
 * 확인된 API 필드: rlvt_ymd, sail_tm, psnshp_nm, oport_nm, dest_nm,
 *   lcns_seawy_nm, nvg_seawy_nm, nvg_se_nm, nvg_stts_nm, cntrl_rsn_nm
 * ※ 정원(psngr_cap, car_cap) 필드는 이 API에 존재하지 않음
 */

/* "830" → "08:30" */
function fmtTime(t) {
  if (!t) return "";
  const s = String(t).padStart(4, "0");
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

/* 출발시각 + 분 → "HH:MM" */
function addMinutes(sailTm, min) {
  if (!sailTm) return "";
  const s   = String(sailTm).padStart(4, "0");
  const tot = parseInt(s.slice(0,2),10)*60 + parseInt(s.slice(2,4),10) + min;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot%60).padStart(2,"0")}`;
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
      numOfRows:  "1000",
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
      return res(502, { error: `KOMSA 오류: ${data?.response?.header?.resultMsg}`, code: resultCode });
    }

    const raw = data?.response?.body?.items?.item ?? [];
    const all = Array.isArray(raw) ? raw : (raw && Object.keys(raw).length ? [raw] : []);
    console.log("[ferry] 전체 항목:", all.length);

    /* 필터: 면허항로명(lcns_seawy_nm)에 가산+남강 포함 + 출항지 일치 */
    const items = all.filter(item => {
      const lcns  = item.lcns_seawy_nm ?? "";
      const oport = item.oport_nm      ?? "";
      return lcns.includes("가산") && lcns.includes("남강") && oport.includes(depPort);
    });

    items.sort((a, b) => Number(a.sail_tm ?? 0) - Number(b.sail_tm ?? 0));
    console.log("[ferry] 필터 후:", items.length, "/ 출항:", depPort);

    const schedule = items.map((item, idx) => {
      const stts   = item.nvg_stts_nm ?? "";
      const nvgSe  = item.nvg_se_nm   ?? "";
      /* 비운(비운항) 또는 통제사유 있으면 결항 처리 */
      const status = (item.cntrl_rsn_nm || nvgSe === "비운"
                     || stts.includes("통제") || stts.includes("결항")) ? "결항"
                   : stts.includes("운항중") ? "운항중"
                   : stts.includes("완료")   ? "완료"
                   : "예정";
      return {
        id:       idx + 1,
        dep:      fmtTime(item.sail_tm),
        arr:      addMinutes(item.sail_tm, 40), // API에 도착시각 없음 → +40분
        vessel:   item.psnshp_nm    ?? "정보없음",
        status,
        reason:   item.cntrl_rsn_nm ?? "",
        depPort:  item.oport_nm     ?? "",
        destPort: item.dest_nm      ?? "",
        routeNm:  item.lcns_seawy_nm ?? "",   // 면허항로명 (남강-가산, 하이픈 포함)
        nvgDrc:   item.nvg_drc_nm   ?? "",   // 운항방향 (정방향/역방향)
        nvgSe:    item.nvg_se_nm    ?? "",   // 운항구분 (정상/증회/비운)
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
