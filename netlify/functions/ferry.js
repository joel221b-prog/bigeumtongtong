/**
 * ferry.js — KOMSA 운항 스케줄 API 프록시
 *
 * depPort 파라미터로 4개 노선 구분:
 *   남강_to_가산  : 남강-가산 면허 + 정방향 + oport=남강
 *   목포_to_가산  : 도초-목포 면허 + 정방향 + oport=목포
 *   가산_to_남강  : 남강-가산 면허 + 역방향 + oport=가산
 *   가산_to_목포  : 도초-목포 면허 + 역방향 + oport=비금·도초
 *
 * 도착시간:
 *   남강↔가산 직항 : +40분
 *   목포→가산      : +135분 (8:35→10:50)
 *   가산→목포      : +110분 (6:35→8:25)
 */

function fmtTime(t) {
  if (!t) return "";
  const s = String(t).padStart(4, "0");
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

function addMinutes(sailTm, min) {
  if (!sailTm) return "";
  const s   = String(sailTm).padStart(4, "0");
  const tot = parseInt(s.slice(0,2),10)*60 + parseInt(s.slice(2,4),10) + min;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot%60).padStart(2,"0")}`;
}

const ROUTE_CONFIG = {
  "남강_to_가산": [
    { lcns:["남강","가산"], drc:"정방향", oport:"남강", dest:"",      arrMin:40  },
    // 도초카훼리가 도초-목포 면허로 남강↔가산 구간 운항 (18:30, 20:10 등)
    { lcns:["도초","목포"], drc:"정방향", oport:"남강", dest:"",      arrMin:40  },
  ],
  "가산_to_남강": [
    { lcns:["남강","가산"], drc:"역방향", oport:"가산", dest:"",      arrMin:40  },
    // 도초카훼리 가산 출발 직항 (19:20, 21:00 등)
    { lcns:["도초","목포"], drc:"역방향", oport:"가산", dest:"",      arrMin:40  },
  ],
  "목포_to_가산": [
    { lcns:["도초","목포"], drc:"정방향", oport:"목포", dest:"비금",  arrMin:135 },
  ],
  "가산_to_목포": [
    { lcns:["도초","목포"], drc:"역방향", oport:"비금", dest:"목포",  arrMin:110 },
  ],
};

exports.handler = async (event) => {
  const API_KEY  = process.env.KOMSA_API_KEY;
  const BASE_URL = "https://apis.data.go.kr/B554035/oprt-schd-info-v2/get-oprt-schd-info-v2";

  if (!API_KEY) return res(500, { error: "KOMSA_API_KEY 환경변수가 없습니다." });

  const { depPort, date } = event.queryStringParameters || {};
  if (!date)    return res(400, { error: "date 파라미터가 필요합니다." });
  if (!depPort) return res(400, { error: "depPort 파라미터가 필요합니다." });

  const cfg = ROUTE_CONFIG[depPort];
  if (!cfg) return res(400, { error: `알 수 없는 depPort: ${depPort}` });

  // date 형식 검증: YYYYMMDD 숫자 8자리만 허용
  if (!/^\d{8}$/.test(date)) return res(400, { error: "date 형식 오류 (YYYYMMDD)" });

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
    console.log(`[ferry] ${depPort} | HTTP:${response.status}`);

    if (!response.ok) return res(502, { error: `HTTP ${response.status}` });

    let data;
    try { data = JSON.parse(text); }
    catch { return res(502, { error: "JSON 파싱 실패", raw: text.slice(0,200) }); }

    const resultCode = data?.response?.header?.resultCode;
    if (resultCode && resultCode !== "00" && resultCode !== "200") {
      return res(502, { error: `KOMSA 오류: ${data?.response?.header?.resultMsg}` });
    }

    const raw = data?.response?.body?.items?.item ?? [];
    const all = Array.isArray(raw) ? raw : (raw && Object.keys(raw).length ? [raw] : []);
    console.log("[ferry] 전체 항목:", all.length);

    /* ── 노선별 필터 (복수 조건 OR) ── */
    const cfgList = Array.isArray(cfg) ? cfg : [cfg];
    const matchItem = (item, c) => {
      const lcns  = item.lcns_seawy_nm ?? "";
      const drc   = item.nvg_drc_nm    ?? "";
      const oport = item.oport_nm      ?? "";
      const dest  = item.dest_nm       ?? "";
      return c.lcns.every(k=>lcns.includes(k))
          && drc.includes(c.drc)
          && oport.includes(c.oport)
          && (c.dest ? dest.includes(c.dest) : true);
    };
    const items = all.filter(item => cfgList.some(c => matchItem(item, c)));
    // arrMin은 매칭된 첫 cfg에서 가져옴
    const getArrMin = item => (cfgList.find(c=>matchItem(item,c))?.arrMin ?? 40);

    items.sort((a, b) => Number(a.sail_tm ?? 0) - Number(b.sail_tm ?? 0));
    console.log(`[ferry] ${depPort} 필터 후:`, items.length);

    const schedule = items.map((item, idx) => {
      const stts  = item.nvg_stts_nm ?? "";
      const nvgSe = item.nvg_se_nm   ?? "";
      const status = (item.cntrl_rsn_nm || nvgSe === "비운"
                     || stts.includes("통제") || stts.includes("결항")) ? "결항"
                   : stts.includes("운항중") ? "운항중"
                   : stts.includes("완료")   ? "완료"
                   : "예정";

      // 결항 사유: cntrl_rsn_nm 우선, 없으면 nvg_stts_nm에서 추출
      const rawReason = item.cntrl_rsn_nm ?? "";
      const reason = rawReason || (nvgSe === "비운" ? "선박 미운항" : stts.includes("통제") ? "항로 통제" : "");

      return {
        id:       idx + 1,
        dep:      fmtTime(item.sail_tm),
        arr:      addMinutes(item.sail_tm, getArrMin(item)),
        arrMin:   getArrMin(item),
        vessel:   item.psnshp_nm    ?? "정보없음",
        status,
        reason:   reason,
        depPort:  item.oport_nm     ?? "",
        destPort: item.dest_nm      ?? "",
        nvgSeawy: item.nvg_seawy_nm ?? "",
        nvgSe:    item.nvg_se_nm    ?? "",
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
