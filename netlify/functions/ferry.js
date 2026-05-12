/**
 * Netlify Function: ferry.js
 * KOMSA 운항 스케줄 API 프록시
 * Node 18+ (fetch 내장) 필요 → netlify.toml에서 NODE_VERSION=18 지정
 */

exports.handler = async (event) => {
  const API_KEY  = process.env.KOMSA_API_KEY;
  const BASE_URL = "https://apis.data.go.kr/B554035/oprt-schd-info-v2/getOprtSchdInfo";

  if (!API_KEY) {
    return res(500, { error: "KOMSA_API_KEY 환경변수가 없습니다." });
  }

  const { depPort, date } = event.queryStringParameters || {};
  if (!depPort || !date) {
    return res(400, { error: "depPort, date 파라미터가 필요합니다." });
  }

  try {
    /* URLSearchParams로 파라미터 구성 — serviceKey는 인코딩 없이 그대로 */
    const url = `${BASE_URL}?serviceKey=${API_KEY}&pageNo=1&numOfRows=20&hpolNm=${encodeURIComponent(depPort)}&schDt=${date}&_type=json`;

    console.log("[ferry] 요청 URL:", url.replace(API_KEY, "***"));

    const response = await fetch(url);
    const text     = await response.text();

    console.log("[ferry] 응답 status:", response.status);
    console.log("[ferry] 응답 앞부분:", text.slice(0, 300));

    if (!response.ok) {
      return res(502, { error: `KOMSA HTTP ${response.status}`, raw: text.slice(0, 200) });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res(502, { error: "JSON 파싱 실패 — API가 XML을 반환했을 수 있습니다.", raw: text.slice(0, 300) });
    }

    const raw   = data?.response?.body?.items?.item ?? [];
    const items = Array.isArray(raw) ? raw : (raw && Object.keys(raw).length ? [raw] : []);

    const schedule = items.map((item, idx) => ({
      id:      idx + 1,
      dep:     (item.dpdtTm  ?? "").slice(0, 5),
      arr:     (item.arvlTm  ?? "").slice(0, 5),
      vessel:  item.shipNm   ?? "정보없음",
      seats:   Number(item.psngrCapa ?? 0),
      status:  item.ntcSttusNm ?? "예정",
      reason:  item.ntcRsnNm  ?? "",
      routeNm: item.rteNm     ?? "",
    }));

    return res(200, { schedule, date, depPort, total: schedule.length });

  } catch (err) {
    console.error("[ferry] catch 오류:", err.message, err.stack);
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
