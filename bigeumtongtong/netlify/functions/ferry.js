/**
 * Netlify Function: ferry.js
 * KOMSA 운항 스케줄 API 프록시
 *
 * ✅ 승인된 엔드포인트:
 *    https://apis.data.go.kr/B554035/oprt-schd-info-v2
 *    오퍼레이션: 운항 스케줄 정보 조회
 *
 * 호출 예시: /api/ferry?depPort=가산&date=20260512
 */

export const handler = async (event) => {
  const API_KEY  = process.env.KOMSA_API_KEY;
  const BASE_URL = "https://apis.data.go.kr/B554035/oprt-schd-info-v2/getOprtSchdInfo";

  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "API 키가 없습니다. Netlify 환경변수 KOMSA_API_KEY를 설정하세요." }),
    };
  }

  const { depPort, date } = event.queryStringParameters || {};
  if (!depPort || !date) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "depPort, date 파라미터가 필요합니다." }),
    };
  }

  try {
    const params = new URLSearchParams({
      serviceKey: API_KEY,
      pageNo:     "1",
      numOfRows:  "20",
      hpolNm:     depPort,   // 출발항명 (예: 가산, 남강)
      schDt:      date,      // 조회일자 YYYYMMDD
      _type:      "json",
    });

    const res  = await fetch(`${BASE_URL}?${params}`);

    if (!res.ok) {
      throw new Error(`KOMSA API HTTP 오류: ${res.status}`);
    }

    const data = await res.json();

    /* 응답 정규화 */
    const raw   = data?.response?.body?.items?.item ?? [];
    const items = Array.isArray(raw) ? raw : [raw];

    const schedule = items.map((item, idx) => ({
      id:      idx + 1,
      dep:     (item.dpdtTm   ?? "").slice(0, 5),   // 출항시각 HH:MM
      arr:     (item.arvlTm   ?? "").slice(0, 5),   // 도착시각 HH:MM
      vessel:  item.shipNm    ?? "정보없음",          // 선박명
      seats:   Number(item.psngrCapa ?? 0),          // 여객정원
      status:  item.ntcSttusNm ?? "예정",            // 운항상태 (운항/결항/통제)
      reason:  item.ntcRsnNm  ?? "",                 // 통제사유
      routeNm: item.rteNm     ?? "",                 // 운항항로명
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({ schedule, date, depPort }),
    };

  } catch (err) {
    console.error("ferry.js 오류:", err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "API 호출 실패", detail: err.message }),
    };
  }
};


  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "API 키가 설정되지 않았습니다. Netlify 환경변수를 확인하세요." }),
    };
  }

  const { depPort, date } = event.queryStringParameters || {};

  if (!depPort || !date) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "depPort, date 파라미터가 필요합니다." }),
    };
  }

  try {
    const params = new URLSearchParams({
      serviceKey: API_KEY,
      pageNo:     "1",
      numOfRows:  "20",
      hpolNm:     depPort,  // 출발항 이름 (예: 남강, 가산)
      schDt:      date,     // 조회일자 YYYYMMDD
      _type:      "json",
    });

    const res  = await fetch(`${BASE_URL}?${params}`);
    const data = await res.json();

    /* API 응답 정규화 */
    const items = data?.response?.body?.items?.item || [];
    const list  = Array.isArray(items) ? items : [items];

    const schedule = list.map((item, idx) => ({
      id:       idx + 1,
      dep:      item.dpdtTm?.slice(0, 5) ?? "--:--",   // 출항시각 HH:MM
      arr:      item.arvlTm?.slice(0, 5) ?? "--:--",   // 도착시각 HH:MM
      vessel:   item.shipNm  ?? "정보없음",              // 선박명
      seats:    Number(item.psngrCapa ?? 0),            // 여객정원
      status:   item.ntcSttusNm ?? "예정",              // 통제상태명 (운항/결항/검토)
      reason:   item.ntcRsnNm  ?? "",                   // 통제사유
      routeNm:  item.rteNm    ?? "",                    // 운항항로명
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule, date, depPort }),
    };

  } catch (err) {
    console.error("KOMSA API 오류:", err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "API 호출 실패", detail: err.message }),
    };
  }
};
