import { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw, ChevronDown,
  Calendar, Wind, Waves,
  Sun, Cloud, CloudRain, Anchor, AlertCircle, AlertTriangle
} from "lucide-react";

/* ── 팔레트 ── */
const C = {
  deep:"#4aada0", mid:"#7ecdc0", light:"#b8e8e2", pale:"#e8f8f6", bg:"#f4fcfa",
  goldDark:"#b87820", goldAccent:"#e09828",
  white:"#ffffff",
  ink:"#1a3230", inkMid:"#4a6860", inkLight:"#8aaa9e", inkFaint:"#d4e8e4",
  done:"#a8c0bc", doneBg:"#f2f7f6",
  red:"#c0392b", redMid:"#e05040", redLight:"#fdf0ef",
  orange:"#d06020", orangeLight:"#fff4ec",
};

/* ── 날씨코드 → 아이콘 매핑 (Open-Meteo WMO) ── */
const toIcon = code => {
  if (code === 0) return "sun";
  if (code <= 3)  return "cloud";
  if (code <= 48) return "cloud";
  return "rain"; // 51+ 비/눈/뇌우
};

const DAY_LABELS = ["일","월","화","수","목","금","토"];

/* ── 유틸 ── */
const toDateStr = d => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}${m}${day}`;
};

function resolveStatus(apiStatus, dep, selDate) {
  if (["결항","통제"].includes(apiStatus)) return "결항";

  const today = new Date(); today.setHours(0,0,0,0);
  const sel   = new Date(selDate); sel.setHours(0,0,0,0);
  if (sel > today) return "예정";
  if (sel < today) return "완료";

  const [h,m] = dep.split(":").map(Number);
  const dMin  = h*60+m;
  const now   = new Date();
  const nMin  = now.getHours()*60+now.getMinutes();
  if (nMin>=dMin && nMin<dMin+80) return "운항중";
  if (nMin>=dMin+80) return "완료";
  return "예정";
}

/* ── 컴포넌트 ── */
function WIcon({t,size=15}){
  if(t==="sun")  return <Sun       size={size} strokeWidth={1.8} color="#f5b83a"/>;
  if(t==="rain") return <CloudRain size={size} strokeWidth={1.8} color="#7aaabb"/>;
  return <Cloud size={size} strokeWidth={1.8} color={C.inkLight}/>;
}

/* ── DatePicker: 네이티브 input 방식 ── */
function DatePicker({selectedDate,onChange}){
  const toValue = d => {
    if(!(d instanceof Date)) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };

  const handleChange = e => {
    if(!e.target.value) return;
    const [y,m,d] = e.target.value.split("-").map(Number);
    const date = new Date(y, m-1, d);
    date.setHours(0,0,0,0);
    onChange(date);
  };

  return(
    <div style={{position:"relative",display:"inline-block"}}>
      {/* 시각 레이어 — pointerEvents none으로 클릭을 input에 전달 */}
      <div style={{
        display:"flex",alignItems:"center",gap:6,
        background:C.white,border:`1.5px solid ${C.inkFaint}`,
        borderRadius:10,padding:"8px 14px",
        color:C.inkMid,fontSize:14,fontWeight:600,
        boxShadow:"0 1px 4px rgba(0,0,0,0.05)",
        pointerEvents:"none",
        userSelect:"none",
        whiteSpace:"nowrap",
      }}>
        <Calendar size={14} strokeWidth={2} color={C.deep}/>
        날짜 선택
        <ChevronDown size={13} strokeWidth={2.5} color={C.inkLight}/>
      </div>
      {/* 네이티브 date input — 전면에서 모든 탭 수신 */}
      <input
        type="date"
        value={toValue(selectedDate)}
        onChange={handleChange}
        style={{
          position:"absolute",
          inset:0,
          width:"100%",
          height:"100%",
          opacity:0,
          cursor:"pointer",
          fontSize:16,   /* iOS 자동 확대 방지 */
          border:"none",
        }}
      />
    </div>
  );
}

/* ── 메인 ── */
export default function App(){
  const todayBaseRef=useRef(null);
  if(!todayBaseRef.current){const d=new Date();d.setHours(0,0,0,0);todayBaseRef.current=d;}
  const todayBase=todayBaseRef.current;

  const [route,setRoute]       =useState("가산→남강");
  const [time,setTime]         =useState(new Date());
  const [selDate,setSelDate]   =useState(new Date(todayBase));
  const [expanded,setExpanded] =useState(null);

  /* API 상태 */
  const [schedule,setSchedule] =useState([]);
  const [loading,setLoading]   =useState(true);
  const [error,setError]       =useState(null);
  const [lastRefresh,setLastRefresh]=useState(new Date());

  /* 주간 날씨 상태 */
  const [weekly,setWeekly]     =useState([]);
  const [weatherLoading,setWeatherLoading]=useState(true);

  /* 출발항 매핑 */
  const DEP_PORT = {
    "가산→남강":"가산",
    "남강→가산":"남강",
  };

  /* API 호출 */
  const fetchSchedule = useCallback(async(rt, date)=>{
    setLoading(true);
    setError(null);
    try{
      const depPort  = DEP_PORT[rt];
      const dateStr  = toDateStr(date);
      const res      = await fetch(`/api/ferry?depPort=${encodeURIComponent(depPort)}&date=${dateStr}`);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data     = await res.json();
      if(data.error) throw new Error(data.error);

      /* 상태 보정 */
      const withStatus = (data.schedule||[]).map(item=>({
        ...item,
        status: resolveStatus(item.status, item.dep, date),
      }));
      setSchedule(withStatus);
      setLastRefresh(new Date());
    }catch(e){
      setError(e.message);
      setSchedule([]);
    }finally{
      setLoading(false);
    }
  },[]);

  useEffect(()=>{fetchSchedule(route,selDate)},[route,selDate,fetchSchedule]);
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t)},[]);

  /* Open-Meteo 날씨 fetch — 비금도 좌표 34.50, 126.01 */
  useEffect(()=>{
    const fetchWeather = async () => {
      setWeatherLoading(true);
      try {
        const [forecast, marine] = await Promise.all([
          fetch("https://api.open-meteo.com/v1/forecast?latitude=34.50&longitude=126.01&daily=temperature_2m_max,weathercode&timezone=Asia%2FSeoul").then(r=>r.json()),
          fetch("https://marine-api.open-meteo.com/v1/marine?latitude=34.50&longitude=126.01&daily=wave_height_max&timezone=Asia%2FSeoul").then(r=>r.json()),
        ]);

        const days    = forecast.daily.time;          // ["2025-05-12", ...]
        const temps   = forecast.daily.temperature_2m_max;
        const codes   = forecast.daily.weathercode;
        const waves   = marine.daily.wave_height_max;
        const todayStr= new Date().toISOString().slice(0,10);

        const result = days.slice(0,7).map((dateStr, i) => {
          const d = new Date(dateStr);
          return {
            day:   DAY_LABELS[d.getDay()],
            icon:  toIcon(codes[i]),
            high:  Math.round(temps[i]),
            wave:  Math.round((waves[i] || 0) * 10) / 10,
            today: dateStr === todayStr,
          };
        });
        setWeekly(result);
      } catch(e) {
        console.error("날씨 fetch 실패:", e);
        // 실패해도 빈 배열로 — UI는 로딩 스피너 없이 조용히 처리
      } finally {
        setWeatherLoading(false);
      }
    };
    fetchWeather();
  },[]);

  const handleRefresh=()=>fetchSchedule(route,selDate);
  const handleRoute =r=>{setRoute(r);setExpanded(null)};
  const handleDate  =d=>{setSelDate(d);setExpanded(null)};

  const isToday  =selDate.getTime()===todayBase.getTime();
  const isFuture =selDate>todayBase;

  const allCancelled =isToday&&schedule.length>0&&schedule.every(s=>s.status==="결항");
  const someCancelled=isToday&&!allCancelled&&schedule.some(s=>s.status==="결항");
  const activeDep    =schedule.find(s=>s.status==="운항중");
  const nextDep      =isToday&&!allCancelled?schedule.find(s=>s.status==="예정"):null;
  const highlight    =activeDep||nextDep;
  const allDone      =isToday&&!allCancelled&&schedule.length>0&&schedule.every(s=>s.status==="완료"||s.status==="결항");

  const weather = allCancelled
    ?{label:"풍랑주의보",color:C.red,  dot:C.red,  bg:"rgba(192,57,43,0.15)",wind:"북서 12m/s",wave:"파고 3.5m"}
    :someCancelled
    ?{label:"기상악화 주의",color:C.orange,dot:C.orange,bg:"rgba(208,96,32,0.12)",wind:"북서 8m/s",wave:"파고 2.0m"}
    :{label:"기상 양호",  color:C.deep, dot:C.deep, bg:"rgba(74,173,160,0.15)",wind:"북서 3m/s", wave:"파고 0.5m"};

  const dateLabel=isToday?"오늘":selDate.toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"});

  const badge=allCancelled  ?{label:"전편 결항",color:C.red,   bg:C.redLight,   border:"rgba(192,57,43,0.25)"}
             :someCancelled  ?{label:"일부 결항",color:C.orange,bg:C.orangeLight,border:"rgba(208,96,32,0.25)"}
             :isFuture       ?{label:"운항예정", color:"#7a9acc",bg:"#eef4ff",  border:"#b8ccee"}
             :allDone        ?{label:"운항종료", color:C.done,  bg:C.doneBg,    border:C.inkFaint}
             :               {label:"정상운항", color:C.deep,  bg:C.pale,      border:C.light};

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",color:C.ink,paddingBottom:24,maxWidth:480,margin:"0 auto"}}>

      {/* ── 헤더 ── */}
      <div style={{background:`linear-gradient(135deg,#3a9e96 0%,${C.mid} 100%)`,padding:"22px 22px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <h1 style={{fontFamily:"'Gowun Dodum','Noto Sans KR',sans-serif",fontSize:30,fontWeight:900,margin:0,color:C.white,letterSpacing:"-0.5px",lineHeight:1}}>
              비금통통
            </h1>
            <svg viewBox="0 0 112 16" style={{width:112,height:16,marginTop:4,display:"block"}}>
              <path d="M0,5 Q14,0 28,5 Q42,10 56,5 Q70,0 84,5 Q98,10 112,5 L112,16 L0,16 Z" fill="rgba(255,255,255,0.1)"/>
              <path d="M0,5 Q14,0 28,5 Q42,10 56,5 Q70,0 84,5 Q98,10 112,5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <path d="M0,10 Q14,6 28,10 Q42,14 56,10 Q70,6 84,10 Q98,14 112,10" stroke="rgba(245,200,122,0.9)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
            </svg>
            <p style={{fontSize:11,margin:"6px 0 0",color:"rgba(255,255,255,0.58)",letterSpacing:"0.4px",fontWeight:500}}>비금도 배편 시간표</p>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:22,fontWeight:700,color:C.white,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.5px",lineHeight:1}}>
              {time.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
            </div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginTop:3}}>
              {time.toLocaleDateString("ko-KR",{month:"short",day:"numeric",weekday:"short"})}
            </div>
          </div>
        </div>
      </div>

      {/* ── 날씨 + 새로고침 ── */}
      <div style={{background:C.white,borderBottom:`1px solid ${C.inkFaint}`,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <Wind size={14} strokeWidth={1.8} color={C.mid}/>
            <span style={{fontSize:13,color:C.inkMid,fontWeight:600}}>{weather.wind}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <Waves size={14} strokeWidth={1.8} color={C.mid}/>
            <span style={{fontSize:13,color:C.inkMid,fontWeight:600}}>{weather.wave}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:weather.dot,display:"inline-block",boxShadow:`0 0 0 2.5px ${weather.bg}`}}/>
            <span style={{fontSize:13,fontWeight:700,color:weather.color}}>{weather.label}</span>
          </div>
        </div>
        <button onClick={handleRefresh} disabled={loading} style={{
          display:"flex",alignItems:"center",gap:5,background:C.pale,
          border:`1.5px solid ${C.light}`,borderRadius:20,padding:"6px 13px",
          cursor:"pointer",color:C.deep,fontSize:12,fontWeight:700,opacity:loading?0.6:1,
        }}>
          <RefreshCw size={12} strokeWidth={2.5} style={{animation:loading?"spin 0.9s linear infinite":"none"}}/>
          새로고침
        </button>
      </div>
      <div style={{background:"rgba(244,252,250,0.9)",padding:"3px 18px",borderBottom:`1px solid ${C.inkFaint}`}}>
        <span style={{fontSize:10,color:C.inkLight}}>
          업데이트 {lastRefresh.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
        </span>
      </div>

      {/* ── 본문 ── */}
      <div style={{padding:"14px 16px 0"}}>

        {/* 항로 선택 */}
        <div style={{background:C.white,borderRadius:14,padding:5,display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:14,boxShadow:"0 1px 6px rgba(74,173,160,0.1)",border:`1px solid ${C.inkFaint}`}}>
          {["가산→남강","남강→가산"].map(r=>(
            <button key={r} onClick={()=>handleRoute(r)} style={{
              padding:"14px 8px",borderRadius:10,border:"none",cursor:"pointer",
              fontWeight:800,fontSize:15,transition:"all 0.2s",
              display:"flex",alignItems:"center",justifyContent:"center",gap:6,
              background:route===r?"linear-gradient(135deg,#b87820,#e09828)":"transparent",
              color:route===r?C.white:C.inkLight,
              boxShadow:route===r?"0 3px 12px rgba(224,152,40,0.35)":"none",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="20"/>
                <path d="M5,14 C5,18 19,18 19,14"/>
                <line x1="5" y1="20" x2="12" y2="20"/><line x1="19" y1="20" x2="12" y2="20"/>
              </svg>
              {r==="가산→남강"?"가산 → 남강":"남강 → 가산"}
            </button>
          ))}
        </div>

        {/* 날짜 + 상태 */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:20,fontWeight:900,color:C.ink}}>{dateLabel}</span>
            <span style={{fontSize:13,fontWeight:700,color:badge.color,background:badge.bg,borderRadius:20,padding:"3px 10px",border:`1px solid ${badge.border}`}}>
              ● {badge.label}
            </span>
          </div>
          <DatePicker selectedDate={selDate} onChange={handleDate}/>
        </div>

        {/* 로딩 */}
        {loading&&(
          <div style={{background:C.white,borderRadius:16,padding:"32px 20px",textAlign:"center",marginBottom:16,border:`1px solid ${C.inkFaint}`}}>
            <div style={{fontSize:13,color:C.inkLight,marginBottom:8}}>운항 정보를 불러오는 중...</div>
            <div style={{width:32,height:32,border:`3px solid ${C.pale}`,borderTop:`3px solid ${C.deep}`,borderRadius:"50%",margin:"0 auto",animation:"spin 0.8s linear infinite"}}/>
          </div>
        )}

        {/* 에러 */}
        {!loading&&error&&(
          <div style={{background:C.redLight,border:`1.5px solid rgba(192,57,43,0.2)`,borderRadius:16,padding:"16px 18px",marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:14,color:C.red,fontWeight:700,marginBottom:6}}>데이터를 불러오지 못했어요</div>
            <div style={{fontSize:12,color:"#a05050",marginBottom:10}}>{error}</div>
            <button onClick={handleRefresh} style={{background:C.red,color:C.white,border:"none",borderRadius:20,padding:"7px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
              다시 시도
            </button>
          </div>
        )}

        {/* ── 전편 결항 배너 ── */}
        {!loading&&!error&&allCancelled&&(
          <div style={{background:`linear-gradient(135deg,${C.red},${C.redMid})`,borderRadius:20,padding:"20px 22px",marginBottom:16,boxShadow:"0 8px 26px rgba(192,57,43,0.3)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <AlertTriangle size={18} strokeWidth={2} color={C.white}/>
              <span style={{fontSize:14,color:"rgba(255,255,255,0.85)",fontWeight:700}}>풍랑주의보 발효 중</span>
            </div>
            <div style={{fontSize:32,fontWeight:900,color:C.white,letterSpacing:"-1px",lineHeight:1,marginBottom:8}}>오늘 전편 결항</div>
            <div style={{fontSize:15,color:"rgba(255,255,255,0.8)",fontWeight:600}}>기상 호전 시 즉시 재운항 안내</div>
          </div>
        )}

        {/* ── 일부 결항 배너 ── */}
        {!loading&&!error&&someCancelled&&(
          <div style={{background:"linear-gradient(135deg,#b85018,#e06828)",borderRadius:20,padding:"18px 22px",marginBottom:16,boxShadow:"0 8px 24px rgba(208,96,32,0.28)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <AlertTriangle size={16} strokeWidth={2} color={C.white}/>
              <span style={{fontSize:13,color:"rgba(255,255,255,0.85)",fontWeight:700}}>기상 악화 · 일부 결항</span>
            </div>
            <div style={{fontSize:24,fontWeight:900,color:C.white,letterSpacing:"-0.5px",marginBottom:6}}>
              {schedule.filter(s=>s.status==="결항").map(s=>s.id+"항차").join(" · ")} 결항
            </div>
            <div style={{fontSize:14,color:"rgba(255,255,255,0.8)"}}>나머지 항차는 정상 운항 중입니다</div>
          </div>
        )}

        {/* ── 정상 출항 배너 ── */}
        {!loading&&!error&&!allCancelled&&highlight&&(
          <div style={{background:`linear-gradient(to right,${C.deep} 0%,${C.mid} 55%,${C.light} 100%)`,borderRadius:20,padding:"20px 22px",marginBottom:16,boxShadow:`0 8px 28px rgba(74,173,160,0.28)`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,color:"rgba(255,255,255,0.65)",marginBottom:6}}>
                  {activeDep?"현재 운항중인 배":"다음 출항하는 배"}
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}>
                  <span style={{fontSize:52,fontWeight:900,color:C.white,fontVariantNumeric:"tabular-nums",letterSpacing:"-2.5px",lineHeight:1}}>{highlight.dep}</span>
                  <span style={{fontSize:17,color:"rgba(255,255,255,0.6)",fontWeight:600}}>출발</span>
                </div>
                <div style={{fontSize:15,color:"rgba(255,255,255,0.82)",fontWeight:600}}>{highlight.vessel} · {highlight.arr} 도착</div>
              </div>
              <svg width="90" height="80" viewBox="0 0 100 90" fill="none">
                <circle cx="52" cy="10" r="6" fill="rgba(255,255,255,0.50)"/>
                <circle cx="58" cy="5" r="4.5" fill="rgba(255,255,255,0.35)"/>
                <circle cx="63" cy="1" r="3" fill="rgba(255,255,255,0.22)"/>
                <rect x="44" y="22" width="9" height="18" rx="4" fill="rgba(210,175,90,0.85)"/>
                <rect x="20" y="36" width="56" height="16" rx="8" fill="rgba(255,255,255,0.95)"/>
                <path d="M12,52 Q15,67 50,70 Q85,67 88,52 Z" fill="rgba(210,175,80,0.82)"/>
                <circle cx="32" cy="44" r="4.5" fill="rgba(126,205,192,0.55)"/>
                <circle cx="50" cy="44" r="4.5" fill="rgba(126,205,192,0.55)"/>
                <circle cx="68" cy="44" r="4.5" fill="rgba(126,205,192,0.55)"/>
                <path d="M4,75 Q16,71 28,75 Q40,79 52,75 Q64,71 76,75" stroke="rgba(255,255,255,0.55)" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
          </div>
        )}

        {/* ── 결항 안내 카드 ── */}
        {!loading&&!error&&(allCancelled||someCancelled)&&(
          <div style={{background:allCancelled?C.redLight:C.orangeLight,border:`1.5px solid ${allCancelled?"rgba(192,57,43,0.2)":"rgba(208,96,32,0.2)"}`,borderRadius:16,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,color:allCancelled?C.red:C.orange}}>
              <AlertCircle size={15} strokeWidth={2}/>
              <span style={{fontSize:14,fontWeight:800}}>결항 안내</span>
            </div>
            {(allCancelled?[
              "기상 회복 후 즉시 운항 재개 예정입니다",
              "여객 대기는 터미널 내에서 해주세요",
              "운항 재개 시 즉시 안내해 드립니다",
            ]:[
              "일부 항차가 기상 악화로 결항되었습니다",
              "나머지 항차는 정상 운항 중입니다",
              "기상 변화에 따라 추가 결항이 생길 수 있습니다",
            ]).map((t,i)=>(
              <div key={i} style={{fontSize:13,color:allCancelled?"#7a3030":"#7a4020",marginBottom:6,display:"flex",gap:7,lineHeight:1.5}}>
                <span style={{color:allCancelled?C.red:C.orange,flexShrink:0}}>—</span>{t}
              </div>
            ))}
            <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${allCancelled?"rgba(192,57,43,0.15)":"rgba(208,96,32,0.15)"}`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>📞</span>
              <div>
                <div style={{fontSize:11,color:allCancelled?"#a05050":"#a06030"}}>남강항 문의</div>
                <div style={{fontSize:20,fontWeight:900,color:C.ink}}>061-275-9915</div>
              </div>
            </div>
          </div>
        )}

        {/* ── 시간표 ── */}
        {!loading&&!error&&(
          <>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <Anchor size={15} strokeWidth={2} color={C.deep}/>
                <span style={{fontSize:15,fontWeight:800,color:C.ink}}>시간표</span>
              </div>
              <span style={{fontSize:13,color:C.inkLight}}>
                총 {schedule.length}항차 · 예정 {schedule.filter(s=>s.status==="예정").length}
              </span>
            </div>

            {schedule.length===0?(
              <div style={{background:C.white,borderRadius:14,padding:"24px",textAlign:"center",border:`1px solid ${C.inkFaint}`,marginBottom:16}}>
                <div style={{fontSize:14,color:C.inkLight}}>이 날짜의 운항 정보가 없습니다.</div>
              </div>
            ):(
              <div style={{background:C.white,borderRadius:16,overflow:"hidden",boxShadow:"0 2px 12px rgba(74,173,160,0.08)",border:`1px solid ${C.inkFaint}`,marginBottom:16}}>
                {schedule.map((item,i)=>{
                  const isDone  =item.status==="완료";
                  const isActive=item.status==="운항중";
                  const isNext  =item.status==="예정";
                  const isCancel=item.status==="결항";
                  const isOpen  =expanded===item.id;

                  const dotColor=isCancel?C.red:isActive?C.deep:isNext?C.goldAccent:C.done;
                  const timeColor=isCancel?C.done:isActive?C.deep:isNext?C.inkLight:C.done;
                  const tagBg   =isCancel?C.redLight:isActive?C.deep:isNext?"#fdf6e4":"#edf4f2";
                  const tagText =isActive?C.white:isCancel?C.red:isNext?"#a06818":C.done;
                  const tagLabel=isActive?"운항중":isCancel?"결항":isNext?"예정":"완료";

                  return(
                    <div key={item.id}>
                      {i>0&&<div style={{height:1,background:isCancel?"#fdf0ef":C.pale,marginLeft:58}}/>}
                      <div onClick={()=>setExpanded(isOpen?null:item.id)} style={{
                        padding:"14px 16px",cursor:"pointer",
                        display:"flex",alignItems:"center",gap:12,
                        background:isCancel?"#fdf8f8":isActive?"rgba(74,173,160,0.05)":"transparent",
                        position:"relative",
                      }}>
                        {(isActive||isNext)&&<div style={{position:"absolute",left:0,top:4,bottom:4,width:4,borderRadius:"0 3px 3px 0",background:isActive?C.goldAccent:C.light}}/>}
                        {isCancel&&<div style={{position:"absolute",left:0,top:4,bottom:4,width:4,borderRadius:"0 3px 3px 0",background:C.red}}/>}

                        <div style={{width:38,display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}>
                          <div style={{width:11,height:11,borderRadius:"50%",background:dotColor,
                            boxShadow:isActive?`0 0 0 4px rgba(74,173,160,0.18)`:isNext?`0 0 0 3px rgba(224,152,40,0.18)`:"none",
                            animation:isActive?"pulse 2s infinite":"none"}}/>
                          <span style={{fontSize:11,marginTop:3,fontWeight:700,color:isDone||isCancel?C.done:isActive?C.deep:C.inkLight}}>{i+1}차</span>
                        </div>

                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                            <span style={{
                              fontSize:27,fontWeight:900,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.8px",lineHeight:1,
                              color:timeColor,
                              textDecoration:isCancel?"line-through":"none",
                              textDecorationColor:"rgba(192,57,43,0.4)",
                            }}>{item.dep}</span>
                            <span style={{fontSize:14,color:C.inkFaint}}>→</span>
                            <span style={{fontSize:18,fontWeight:700,fontVariantNumeric:"tabular-nums",color:isCancel||isDone?C.done:C.mid}}>{item.arr}</span>
                          </div>
                          <span style={{fontSize:13,color:isCancel||isDone?C.done:C.inkLight}}>{item.vessel}</span>
                          {isCancel&&item.reason&&<span style={{fontSize:11,color:C.red,marginLeft:6}}>({item.reason})</span>}
                        </div>

                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                          <span style={{
                            background:tagBg,color:tagText,borderRadius:20,padding:"6px 15px",
                            fontSize:14,fontWeight:800,whiteSpace:"nowrap",
                            display:"flex",alignItems:"center",gap:5,
                            border:isCancel?`1px solid rgba(192,57,43,0.25)`:isActive?"none":isNext?`1px solid rgba(224,152,40,0.3)`:`1px solid ${C.inkFaint}`,
                          }}>
                            {isActive&&<span style={{width:5,height:5,borderRadius:"50%",background:C.white,display:"inline-block",animation:"blink 1.4s infinite"}}/>}
                            {tagLabel}
                          </span>
                          <ChevronDown size={14} strokeWidth={2.5} color={C.inkFaint}
                            style={{transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}/>
                        </div>
                      </div>

                      {isOpen&&(
                        <div style={{padding:"12px 16px 14px 66px",borderTop:`1px solid ${C.pale}`}}>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                            {[
                              ["출발",item.dep],["도착",item.arr],["소요","약 80분"],
                              ["정원",`${item.seats}명`],["차량","가능"],["선종","카페리"],
                            ].map(([l,v])=>(
                              <div key={l} style={{background:C.bg,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.inkFaint}`}}>
                                <div style={{fontSize:10,color:C.inkLight,marginBottom:3}}>{l}</div>
                                <div style={{fontSize:15,fontWeight:800,color:C.inkMid}}>{v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── 주간 날씨 ── */}
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <Sun size={14} strokeWidth={2} color={C.goldAccent}/>
              <span style={{fontSize:13,fontWeight:800,color:C.ink}}>이번 주 날씨</span>
              <span style={{fontSize:11,color:C.inkLight}}>비금도 기준</span>
            </div>
            <span style={{fontSize:10,color:C.inkLight}}>출처: Open-Meteo</span>
          </div>
          <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.inkFaint}`,padding:"10px 4px",display:"flex",minHeight:72,alignItems:"center",justifyContent:"center"}}>
            {weatherLoading?(
              <div style={{width:20,height:20,border:`2px solid ${C.pale}`,borderTop:`2px solid ${C.deep}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            ):weekly.length===0?(
              <span style={{fontSize:12,color:C.inkLight}}>날씨 정보를 불러올 수 없습니다</span>
            ):(
              weekly.map((w,i)=>(
                <div key={w.day} style={{
                  flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"4px 2px",
                  borderLeft:i>0?`1px solid ${C.inkFaint}`:"none",
                  background:w.today?C.pale:"transparent",borderRadius:w.today?10:0,
                }}>
                  <span style={{fontSize:12,fontWeight:w.today?800:600,color:w.today?C.deep:C.inkLight}}>{w.day}</span>
                  <WIcon t={w.icon} size={15}/>
                  <span style={{fontSize:13,fontWeight:700,color:w.today?C.ink:C.inkMid}}>{w.high}°</span>
                  <span style={{fontSize:10,fontWeight:700,color:w.wave>=3?"#c0392b":w.wave>=1.5?"#c88020":C.deep}}>{w.wave}m</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── 이용 안내 ── */}
        {!allCancelled&&!someCancelled&&(
          <div style={{background:C.orangeLight,border:`1.5px solid rgba(224,152,40,0.4)`,borderRadius:14,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,color:C.goldDark}}>
              <AlertCircle size={15} strokeWidth={2}/>
              <span style={{fontSize:14,fontWeight:800}}>이용 안내</span>
            </div>
            {["기상에 따라 운항이 변경될 수 있습니다","출발 30분 전 터미널 도착 필수","당일 운항 여부를 꼭 재확인하세요"].map((t,i)=>(
              <div key={i} style={{fontSize:14,color:"#7a5030",marginBottom:6,display:"flex",gap:8,lineHeight:1.5,alignItems:"flex-start"}}>
                <span style={{color:C.goldAccent,flexShrink:0}}>—</span>{t}
              </div>
            ))}
            <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid rgba(224,152,40,0.3)`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>📞</span>
              <div>
                <div style={{fontSize:11,color:C.goldDark}}>남강항 문의</div>
                <div style={{fontSize:20,fontWeight:900,color:C.ink}}>061-275-9915</div>
              </div>
            </div>
          </div>
        )}

        {/* ── 출처 표시 ── */}
        <div style={{
          marginBottom:20,padding:"10px 14px",
          background:"rgba(255,255,255,0.6)",
          borderRadius:12,border:`1px solid ${C.inkFaint}`,
        }}>
          <div style={{fontSize:10,color:C.inkLight,lineHeight:1.8}}>
            <div>⛴ 배편 시간표: 한국해양교통안전공단(KOMSA) · 공공데이터포털 제공</div>
            <div>🌤 날씨·파고: Open-Meteo (open-meteo.com) · 무료 기상 오픈 API</div>
            <div style={{marginTop:4,color:C.inkFaint}}>실제 운항 여부는 당일 반드시 재확인하세요</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{box-shadow:0 0 0 4px rgba(74,173,160,0.18)}50%{box-shadow:0 0 0 8px rgba(74,173,160,0)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        button{font-family:inherit}
        button:active{opacity:0.82;transform:scale(0.97)}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
