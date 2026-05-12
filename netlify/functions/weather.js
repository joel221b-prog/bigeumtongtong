/**
 * Netlify Function: weather.js
 * 기상청 단기예보 API 프록시
 *
 * Endpoint: https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst
 * 환경변수:  KOMSA_API_KEY (공공데이터 공통 키)
 *
 * 비금도 인근 목포 격자 좌표 사용 (nx=51, ny=68)
 * ※ 비금도(nx=44, ny=61)는 해상 격자라 기상청 서비스 불가
 */

const NX = 44;  // 비금도 격자 X (전남 신안군 비금면)
const NY = 61;  // 비금도 격자 Y
const BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

/* KST 기준 발표 시간 (02/05/08/11/14/17/20/23시)
   안전하게: 현재 시간보다 1시간 이상 지난 발표 시간 사용 */
function getBaseDateTime() {
  const kst    = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const ymd    = d => d.toISOString().slice(0, 10).replace(/-/g, "");
  const h      = kst.getHours();
  const BASES  = [2, 5, 8, 11, 14, 17, 20, 23];

  /* 현재 시간에서 1시간 여유를 두고 이전 발표 시간 선택 */
  const safeH = h - 1;  // 1시간 전 기준
  let bt = 23;
  for (const t of BASES) { if (safeH >= t) bt = t; }

  if (safeH < 2) {  // 새벽 00~02시 → 전날 23시 발표분
    const prev = new Date(kst.getTime() - 86400000);
    return { date: ymd(prev), time: "2300" };
  }
  return { date: ymd(kst), time: String(bt).padStart(2, "0") + "00" };
}

/* 풍향(degree) → 한글 */
function degToDir(v) {
  if (v == null) return "";
  const dirs = ["북","북북동","북동","동북동","동","동남동","남동","남남동",
                "남","남남서","남서","서남서","서","서북서","북서","북북서"];
  return dirs[Math.round(Number(v) / 22.5) % 16];
}

/* SKY+PTY → 아이콘 타입 */
function toType(skyArr, ptyArr) {
  if (ptyArr.some(p => Number(p) > 0)) return "rain";
  const avg = skyArr.length
    ? skyArr.reduce((a, b) => a + Number(b), 0) / skyArr.length : 1;
  return avg <= 1 ? "sun" : "cloud";
}

exports.handler = async () => {
  const API_KEY = process.env.KOMSA_API_KEY;
  if (!API_KEY) return res(500, { error: "KOMSA_API_KEY 환경변수가 없습니다." });

  try {
    const { date, time } = getBaseDateTime();

    const params = new URLSearchParams({
      serviceKey: API_KEY,
      pageNo:     "1",
      numOfRows:  "1000",
      dataType:   "JSON",
      base_date:  date,
      base_time:  time,
      nx:         NX,
      ny:         NY,
    });

    const url = `${BASE_URL}?${params}`;
    console.log(`[weather] 요청 base_date=${date} base_time=${time} nx=${NX} ny=${NY}`);

    const response = await fetch(url);
    const text     = await response.text();
    console.log("[weather] HTTP 상태:", response.status, "/ 앞부분:", text.slice(0, 200));

    let data;
    try { data = JSON.parse(text); }
    catch { return res(502, { error: "JSON 파싱 실패", raw: text.slice(0, 200) }); }

    const code = data?.response?.header?.resultCode;
    console.log("[weather] resultCode:", code, data?.response?.header?.resultMsg);

    if (code && code !== "00") {
      return res(502, {
        error: `기상청 오류: ${data?.response?.header?.resultMsg}`,
        code,
      });
    }

    const items = data?.response?.body?.items?.item ?? [];
    console.log("[weather] 수신 항목:", items.length);

    if (items.length === 0) {
      return res(502, { error: "기상청 데이터 없음 (빈 응답)", date, time });
    }

    /* 날짜별 집계 */
    const byDate = {};
    for (const { fcstDate, category, fcstValue } of items) {
      if (!byDate[fcstDate]) {
        byDate[fcstDate] = { sky:[], pty:[], tmp:[], tmx:null, wav:[], wsd:[], vec:[] };
      }
      const d = byDate[fcstDate];
      if (category === "SKY") d.sky.push(fcstValue);
      if (category === "PTY") d.pty.push(fcstValue);
      if (category === "TMP") d.tmp.push(Number(fcstValue));
      if (category === "TMX") d.tmx = Number(fcstValue);
      if (category === "WAV") d.wav.push(Number(fcstValue));
      if (category === "WSD") d.wsd.push(Number(fcstValue));
      if (category === "VEC") d.vec.push(Number(fcstValue));
    }

    const daily = Object.keys(byDate).sort().map(dt => {
      const d     = byDate[dt];
      const tmax  = d.tmx ?? (d.tmp.length ? Math.max(...d.tmp) : null);
      const waveH = d.wav.length ? parseFloat(Math.max(...d.wav).toFixed(1)) : null;
      return {
        date:  dt,
        type:  toType(d.sky, d.pty),
        tmax:  tmax !== null ? Math.round(tmax) : null,
        waveH,
      };
    });

    const today   = byDate[date] ?? {};
    const current = {
      windSpeed: today.wsd?.[0] ?? null,
      windDir:   degToDir(today.vec?.[0]),
      waveH:     today.wav?.[0] ?? null,
    };

    console.log("[weather] 완료:", daily.length, "일, 현재기상:", JSON.stringify(current));
    return res(200, { daily, current });

  } catch (err) {
    console.error("[weather] 오류:", err.message);
    return res(502, { error: "날씨 API 호출 실패", detail: err.message });
  }
};

function res(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify(body),
  };
}
