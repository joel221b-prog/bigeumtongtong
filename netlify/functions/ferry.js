/**
 * Netlify Function: ferry.js
 * KOMSA 운항 스케줄 API 프록시
 *
 * ✅ 정확한 엔드포인트 (data.go.kr 확인):
 *    https://apis.data.go.kr/B554035/oprt-schd-info-v2/get-oprt-schd-info-v2
 */

exports.handler = async (event) => {
  const API_KEY  = process.env.KOMSA_API_KEY;
  const BASE_URL = "https://apis.data.go.kr/B554035/oprt-schd-info-v2/get-oprt-schd-info-v2";

  if (!API_KEY) {
    return res(500, { error: "KOMSA_API_KEY 환경변수가 없습니다." });
  }

  const { depPort, date } = event.queryStringParameters || {};
  if (!depPort || !date) {
    return res(400, { error: "depPort, date 파라미터가 필요합니다." });
  }

  try {
    const params = new URLSearchParams({
      serviceKey: API_KEY,
      pageNo:     "1",
      numOfRows:  "20",
      hpolNm:     depPort,   // 출발항명 (가산 / 남강)
      schDt:      date,      // 조회일자 YYYYMMDD
      _type:      "json",
    });

    const url = `${BASE_URL}?${params}`;
    console.log("[ferry] 요청:", url.replace(API_KEY, "***"));

    const response = await fetch(url);
    const text     = await response.text();
    console.log("[ferry] 상태:", response.status, "/ 앞부분:", text.slice(0, 200));

    if (!response.ok) {
      return res(502, { error: `KOMSA HTTP ${response.status}`, raw: text.slice(0, 300) });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res(502, { error: "JSON 파싱 실패 (XML 응답)", raw: text.slice(0, 300) });
    }

    /* API 결과 코드 확인 */
    const resultCode = data?.response?.header?.resultCode;
    if (resultCode && resultCode !== "00") {
      return res(502, {
        error: `KOMSA 오류: ${data?.response?.header?.resultMsg}`,
        code:  resultCode,
      });
    }

    const raw   = data?.response?.body?.items?.item ?? [];
    const items = Array.isArray(raw) ? raw : (raw && Object.keys(raw).length ? [raw] : []);

    const schedule = items.map((item, idx) => ({
      id:      idx + 1,
      dep:     (item.dpdtTm  ?? "").slice(0, 5),   // 출항시각
      arr:     (item.arvlTm  ?? "").slice(0, 5),   // 도착시각
      vessel:  item.shipNm   ?? "정보없음",          // 여객선명
      seats:   Number(item.psngrCapa ?? 0),          // 여객정원수
      status:  item.ntcSttusNm ?? "예정",            // 통제상태
      reason:  item.ntcRsnNm  ?? "",                 // 통제사유
      routeNm: item.rteNm     ?? "",                 // 운항항로명
    }));

    console.log("[ferry] 스케줄 수:", schedule.length);

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
