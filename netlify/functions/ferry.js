/**
 * Netlify Function: ferry.js
 * KOMSA 운항 스케줄 API 프록시
 *
 * ✅ 확인된 파라미터 (data.go.kr 확인 버튼 기준):
 *   - rlvtYmd  : 해당일자 (YYYYMMDD)
 *   - dataType : JSON
 *   - pageNo, numOfRows
 *   출항지 필터 파라미터 없음 → 전체 조회 후 서버에서 필터링
 */

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
      numOfRows:  "100",   // 하루 전체 스케줄 가져오기
      dataType:   "JSON",  // _type 아님!
      rlvtYmd:    date,    // schDt 아님!
    });

    const url = `${BASE_URL}?${params}`;
    console.log("[ferry] 요청:", url.replace(API_KEY, "***"));

    const response = await fetch(url);
    const text     = await response.text();
    console.log("[ferry] 상태:", response.status);
    console.log("[ferry] 응답 앞부분:", text.slice(0, 400));

    if (!response.ok) {
      return res(502, { error: `HTTP ${response.status}`, raw: text.slice(0, 300) });
    }

    let data;
    try { data = JSON.parse(text); }
    catch { return res(502, { error: "JSON 파싱 실패", raw: text.slice(0, 300) }); }

    const resultCode = data?.response?.header?.resultCode;
    if (resultCode && resultCode !== "00") {
      return res(502, {
        error: `KOMSA 오류: ${data?.response?.header?.resultMsg}`,
        code: resultCode,
      });
    }

    const raw   = data?.response?.body?.items?.item ?? [];
    const all   = Array.isArray(raw) ? raw : (raw && Object.keys(raw).length ? [raw] : []);

    console.log("[ferry] 전체 항목 수:", all.length);
    if (all.length > 0) {
      console.log("[ferry] 첫 항목 키:", Object.keys(all[0]).join(", "));
      console.log("[ferry] 첫 항목 값:", JSON.stringify(all[0]).slice(0, 300));
    }

    /* 출항지로 필터링 — 가능한 필드명 모두 시도 */
    const DEP_KEYWORDS = {
      "가산→남강": ["가산"],
      "남강→가산": ["남강"],
    };
    const keywords = depPort ? (DEP_KEYWORDS[depPort] ?? [depPort]) : [];

    const filtered = keywords.length > 0
      ? all.filter(item => {
          const portVal = [
            item.dpdtPlcNm, item.dprtPlcNm, item.hpolNm,
            item.startPlcNm, item.depPlcNm, item.dprPlcNm,
          ].filter(Boolean).join(" ");
          return keywords.some(k => portVal.includes(k));
        })
      : all;

    /* 필터 결과 없으면 전체 반환 (필드명 파악용) */
    const items = filtered.length > 0 ? filtered : all;
    console.log("[ferry] 필터 후:", filtered.length, "/ 전체:", all.length);

    const schedule = items.map((item, idx) => ({
      id:      idx + 1,
      dep:     (item.dpdtTm ?? item.dprtTm ?? item.dptTm ?? "").slice(0, 5),
      arr:     (item.arvlTm ?? item.arrvTm ?? item.arrTm ?? "").slice(0, 5),
      vessel:  item.psnshpNm ?? item.shipNm ?? item.vslNm ?? "정보없음",
      seats:   Number(item.psngrCapa ?? item.pssngrCap ?? 0),
      status:  item.ntcSttusNm ?? item.ctlSttusNm ?? "예정",
      reason:  item.ntcRsnNm  ?? item.ctlRsnNm  ?? "",
      routeNm: item.oprtRouteNm ?? item.rteNm ?? "",
      depPort: item.dpdtPlcNm ?? item.dprtPlcNm ?? item.hpolNm ?? "",
      rawKeys: idx === 0 ? Object.keys(item).join(",") : undefined,
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
