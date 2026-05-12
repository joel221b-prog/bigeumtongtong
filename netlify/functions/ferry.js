/**
 * Netlify Function: ferry.js
 * KOMSA 운항 스케줄 API 프록시
 *
 * ✅ 확인된 실제 응답 필드 (snake_case):
 *   rlvt_ymd, sail_tm, psnshp_nm, oport_nm, dest_nm,
 *   lcns_seawy_nm, nvg_seawy_nm, nvg_drc_nm, nvg_se_cd ...
 */

/* "830" → "08:30", "1530" → "15:30" */
function fmtTime(t) {
  if (!t) return "";
  const s = String(t).padStart(4, "0");
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
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

    /* 출항지(oport_nm)로 필터링 — "가산" 또는 "남강" 포함 여부 */
    const keyword = depPort === "가산→남강" ? "가산"
                  : depPort === "남강→가산" ? "남강"
                  : null;

    const items = keyword
      ? all.filter(item => (item.oport_nm ?? "").includes(keyword))
      : all;

    console.log("[ferry] 필터 후:", items.length, "/ keyword:", keyword);

    /* 출발 시간 기준 정렬 */
    items.sort((a, b) => Number(a.sail_tm ?? 0) - Number(b.sail_tm ?? 0));

    const schedule = items.map((item, idx) => ({
      id:      idx + 1,
      dep:     fmtTime(item.sail_tm),          // 출항시각
      arr:     fmtTime(item.arvl_tm),          // 도착시각
      vessel:  item.psnshp_nm ?? "정보없음",    // 여객선명
      seats:   Number(item.psngr_cap ?? item.psnshp_cap ?? 0), // 여객정원
      status:  item.ntc_stts_nm ?? "예정",     // 통제상태명
      reason:  item.ntc_rsn_nm  ?? "",         // 통제사유
      depPort: item.oport_nm    ?? "",         // 출항지명
      destPort:item.dest_nm     ?? "",         // 도착지명
      routeNm: item.lcns_seawy_nm ?? "",       // 면허항로명
    }));

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
