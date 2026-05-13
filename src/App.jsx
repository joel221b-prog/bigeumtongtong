import { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw,
  Wind, Waves,
  Sun, Cloud, CloudRain, Anchor, AlertTriangle
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

function resolveStatus(apiStatus, dep) {
  if (apiStatus === "결항") return "결항";

  if (!dep) return apiStatus;
  const [h,m] = dep.split(":").map(Number);
  if (isNaN(h)||isNaN(m)) return apiStatus;
  const dMin = h*60+m;
  const now  = new Date();
  const nMin = now.getHours()*60+now.getMinutes();
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

/* ── 메인 ── */
export default function App(){
  const todayBaseRef=useRef(null);
  if(!todayBaseRef.current){const d=new Date();d.setHours(0,0,0,0);todayBaseRef.current=d;}
  const todayBase=todayBaseRef.current;

  const [route,setRoute]       =useState("가산→남강");
  const [time,setTime]         =useState(new Date());

  /* API 상태 */
  const [schedule,setSchedule] =useState([]);
  const [loading,setLoading]   =useState(true);
  const [error,setError]       =useState(null);
  const [lastRefresh,setLastRefresh]=useState(new Date());

  /* 주간 날씨 상태 */
  const [weekly,setWeekly]     =useState([]);
  const [weatherLoading,setWeatherLoading]=useState(true);
  const [realWeather,setRealWeather]=useState(null); // 기상청 현재 기상

  /* 법적 고지 모달 */
  const [legalModal,setLegalModal]=useState(null); // null | "privacy" | "terms"
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
        status: resolveStatus(item.status, item.dep),
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

  useEffect(()=>{fetchSchedule(route,todayBase)},[route,fetchSchedule]);
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t)},[]);

  /* 기상청 단기예보 날씨 fetch */
  useEffect(()=>{
    const fetchWeather = async () => {
      setWeatherLoading(true);
      try {
        const res  = await fetch("/api/weather");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const todayStr = new Date().toISOString().slice(0,10).replace(/-/g,"");

        const result = (data.daily || []).map(d => {
          // "20260513" → Date
          const dateObj = new Date(
            `${d.date.slice(0,4)}-${d.date.slice(4,6)}-${d.date.slice(6,8)}`
          );
          return {
            day:   DAY_LABELS[dateObj.getDay()],
            icon:  d.type,           // "sun" | "cloud" | "rain"
            high:  d.tmax,
            wave:  d.waveH ?? 0,
            today: d.date === todayStr,
          };
        });
        setWeekly(result);

        /* 현재 기상 정보 헤더 표시용 */
        if (data.current) setRealWeather(data.current);

      } catch(e) {
        console.error("날씨 fetch 실패:", e);
      } finally {
        setWeatherLoading(false);
      }
    };
    fetchWeather();
  },[]);

  const handleRefresh=()=>fetchSchedule(route,todayBase);
  const handleRoute =r=>{setRoute(r);setExpanded(null)};

  const allCancelled =schedule.length>0&&schedule.every(s=>s.status==="결항");
  const someCancelled=!allCancelled&&schedule.some(s=>s.status==="결항");
  const activeDep    =schedule.find(s=>s.status==="운항중");
  const nextDep      =!allCancelled?schedule.find(s=>s.status==="예정"):null;
  const highlight    =activeDep||nextDep;
  const allDone      =!allCancelled&&schedule.length>0&&schedule.every(s=>s.status==="완료"||s.status==="결항");

  const weather = allCancelled
    ?{label:"풍랑주의보",color:C.red,  dot:C.red,  bg:"rgba(192,57,43,0.15)"}
    :someCancelled
    ?{label:"기상악화 주의",color:C.orange,dot:C.orange,bg:"rgba(208,96,32,0.12)"}
    :{label:"기상 양호",  color:C.deep, dot:C.deep, bg:"rgba(74,173,160,0.15)"};

  /* 헤더 기상 표시값 — 실제 기상청 데이터 우선, 없으면 placeholder */
  const windLabel = realWeather?.windDir && realWeather?.windSpeed != null
    ? `${realWeather.windDir} ${realWeather.windSpeed}m/s`
    : "풍속 -";
  const waveLabel = realWeather?.waveH != null
    ? `파고 ${realWeather.waveH}m`
    : "파고 -";



  const badge=allCancelled  ?{label:"전편 결항",color:C.red,   bg:C.redLight,   border:"rgba(192,57,43,0.25)"}
             :someCancelled  ?{label:"일부 결항",color:C.orange,bg:C.orangeLight,border:"rgba(208,96,32,0.25)"}
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
            <p style={{fontSize:11,margin:"5px 0 0",color:"rgba(255,255,255,0.58)",letterSpacing:"0.4px",fontWeight:500,paddingLeft:1}}>비금도 배편 시간표</p>
          </div>
          <div style={{textAlign:"right"}}>
            {/* 시간대 뱃지 */}
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:5}}>
              <span style={{
                background:"rgba(255,255,255,0.18)",borderRadius:20,padding:"3px 10px",
                fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.9)",letterSpacing:"0.5px",
              }}>
                {(()=>{const h=time.getHours();return h<6?"🌙 새벽":h<12?"🌅 오전":h<18?"☀️ 오후":"🌆 저녁"})()}
              </span>
            </div>
            {/* 시간 */}
            <div style={{fontSize:26,fontWeight:900,color:C.white,fontVariantNumeric:"tabular-nums",letterSpacing:"-1px",lineHeight:1}}>
              {time.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
            </div>
            {/* 날짜 — 골드 */}
            <div style={{fontSize:13,fontWeight:700,color:"#f5c870",marginTop:5,letterSpacing:"0.2px"}}>
              {time.getMonth()+1}월 {time.getDate()}일
              <span style={{opacity:0.75}}> ({["일","월","화","수","목","금","토"][time.getDay()]})</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 날씨 + 새로고침 ── */}
      <div style={{background:C.white,borderBottom:`1px solid ${C.inkFaint}`,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <Wind size={14} strokeWidth={1.8} color={C.mid}/>
            <span style={{fontSize:13,color:C.inkMid,fontWeight:600}}>{windLabel}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <Waves size={14} strokeWidth={1.8} color={C.mid}/>
            <span style={{fontSize:13,color:C.inkMid,fontWeight:600}}>{waveLabel}</span>
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
      <div style={{background:"rgba(244,252,250,0.9)",padding:"4px 18px",borderBottom:`1px solid ${C.inkFaint}`,textAlign:"right"}}>
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

        {/* 오늘 날짜 + 운항 상태 */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontSize:20,fontWeight:900,color:C.ink}}>오늘</span>
          <span style={{fontSize:13,fontWeight:700,color:badge.color,background:badge.bg,borderRadius:20,padding:"3px 10px",border:`1px solid ${badge.border}`}}>
            ● {badge.label}
          </span>
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
                <div style={{fontSize:15,color:"rgba(255,255,255,0.82)",fontWeight:600}}>
                  {highlight.vessel}{highlight.arr ? ` · ${highlight.arr} 도착` : ""}
                </div>
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

                  const dotColor=isCancel?C.red:isActive?C.deep:isNext?C.goldAccent:C.done;
                  const timeColor=isCancel?C.done:isActive?C.deep:isNext?C.inkLight:C.done;
                  const tagBg   =isCancel?C.redLight:isActive?C.deep:isNext?"#fdf6e4":"#edf4f2";
                  const tagText =isActive?C.white:isCancel?C.red:isNext?"#a06818":C.done;
                  const tagLabel=isActive?"운항중":isCancel?"결항":isNext?"예정":"완료";

                  return(
                    <div key={item.id}>
                      {i>0&&<div style={{height:1,background:isCancel?"#fdf0ef":C.pale,marginLeft:58}}/>}
                      <div style={{
                        padding:"13px 16px",
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

                        <div style={{flex:1,minWidth:0}}>
                          {/* 시간 */}
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                            <span style={{
                              fontSize:26,fontWeight:900,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.8px",lineHeight:1,
                              color:timeColor,
                              textDecoration:isCancel?"line-through":"none",
                              textDecorationColor:"rgba(192,57,43,0.4)",
                            }}>{item.dep}</span>
                            <span style={{fontSize:14,color:C.inkFaint}}>→</span>
                            <span style={{fontSize:17,fontWeight:700,fontVariantNumeric:"tabular-nums",color:isCancel||isDone?C.done:C.mid}}>{item.arr}</span>
                          </div>
                          {/* 선명 + 항로 태그 한 줄 */}
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                            <span style={{fontSize:12,color:isCancel||isDone?C.done:C.inkLight,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {item.vessel}
                              {isCancel&&item.reason&&<span style={{fontSize:11,color:C.red,marginLeft:4}}>({item.reason})</span>}
                            </span>
                            {item.routeNm&&(
                              <span style={{
                                fontSize:10,fontWeight:700,
                                color:isActive?C.deep:C.inkMid,
                                background:isActive?C.pale:"rgba(212,232,228,0.45)",
                                borderRadius:20,padding:"2px 8px",
                                whiteSpace:"nowrap",flexShrink:0,
                              }}>
                                {item.routeNm}
                                {item.nvgDrc&&<span style={{fontWeight:400,color:C.inkLight}}> ({item.nvgDrc})</span>}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 상태 태그 */}
                        <div style={{flexShrink:0}}>
                          <span style={{
                            background:tagBg,color:tagText,borderRadius:20,padding:"6px 14px",
                            fontSize:13,fontWeight:800,whiteSpace:"nowrap",
                            display:"flex",alignItems:"center",gap:5,
                            border:isCancel?`1px solid rgba(192,57,43,0.25)`:isActive?"none":isNext?`1px solid rgba(224,152,40,0.3)`:`1px solid ${C.inkFaint}`,
                          }}>
                            {isActive&&<span style={{width:5,height:5,borderRadius:"50%",background:C.white,display:"inline-block",animation:"blink 1.4s infinite"}}/>}
                            {tagLabel}
                          </span>
                        </div>
                      </div>
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
              <span style={{fontSize:11,color:C.inkLight}}>비금도 인근 기준</span>
            </div>
            <span style={{fontSize:10,color:C.inkLight}}>출처: 기상청 단기예보</span>
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
                  <span style={{fontSize:13,fontWeight:700,color:w.today?C.ink:C.inkMid}}>{w.high != null ? `${w.high}°` : "-"}</span>
                  {/* 파고: 0이거나 없으면 "-" 표시 */}
                  <span style={{fontSize:10,fontWeight:700,color:w.wave>=3?"#c0392b":w.wave>=1.5?"#c88020":C.deep}}>
                    {w.wave > 0 ? `${w.wave}m` : "-"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── 이용 안내 (C-β) ── */}
        <div style={{background:C.white,borderRadius:16,overflow:"hidden",border:`1px solid ${C.inkFaint}`,marginBottom:16}}>
          <div style={{background:`linear-gradient(135deg,rgba(74,173,160,0.1),rgba(126,205,192,0.15))`,padding:"11px 16px",borderBottom:`1px solid ${C.inkFaint}`}}>
            <span style={{fontSize:12,fontWeight:800,color:C.deep}}>⚓ 이용 안내</span>
          </div>
          {[
            {icon:"⛈", text:"기상에 따라 운항이 변경될 수 있습니다"},
            {icon:"⏰", text:"출발 30분 전 터미널 도착 필수"},
            {icon:"📋", text:"당일 운항 여부를 꼭 재확인하세요"},
          ].map((t,i)=>(
            <div key={i} style={{
              padding:"11px 16px",
              display:"flex",alignItems:"center",gap:12,
              borderBottom:i<2?`1px solid ${C.pale}`:"none",
            }}>
              <span style={{
                width:22,height:22,borderRadius:"50%",
                background:C.pale,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:11,flexShrink:0,
              }}>{t.icon}</span>
              <span style={{fontSize:13,color:C.inkMid,lineHeight:1.5}}>{t.text}</span>
            </div>
          ))}
          {/* 전화 — SVG 아이콘 C-β 미드 틸 */}
          <div style={{padding:"13px 16px",display:"flex",alignItems:"center",gap:14,borderTop:`1px solid ${C.inkFaint}`}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke={C.mid} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.56A2 2 0 0 1 3.59 1.36h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.37a16 16 0 0 0 6.72 6.72l.88-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <div>
              <div style={{fontSize:10,color:C.inkLight,marginBottom:1}}>남강항 문의</div>
              <div style={{fontSize:19,fontWeight:900,color:C.ink,letterSpacing:"-0.5px"}}>061-275-9915</div>
            </div>
          </div>
        </div>

        {/* ── 출처 + 법적 고지 ── */}
        {/* 푸터 파도 배경 */}
        <div style={{margin:"0 -18px", overflow:"hidden"}}>
          <svg viewBox="0 0 480 40" xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            style={{display:"block",width:"100%",height:36,marginBottom:-2}}>
            <path d="M0,28 Q80,4 160,24 Q240,44 320,20 Q400,-4 480,22 L480,40 L0,40 Z"
              fill={C.light} opacity="0.55"/>
            <path d="M0,34 Q80,14 160,30 Q240,46 320,28 Q400,10 480,30 L480,40 L0,40 Z"
              fill={C.light}/>
          </svg>
        </div>
        <div style={{
          margin:"0 -18px",padding:"16px 18px 0",
          background:C.light,
        }}>
          <div style={{
            padding:"12px 14px",marginBottom:8,
            background:"rgba(255,255,255,0.7)",
            borderRadius:12,border:`1px solid rgba(255,255,255,0.9)`,
          }}>
            <div style={{fontSize:10,color:C.inkMid,lineHeight:2}}>
              <div>⛴ <strong>배편 시간표</strong>: 한국해양교통안전공단(KOMSA) 제공</div>
              <div style={{fontSize:9,color:C.inkLight,marginLeft:14}}>
                출처: 공공데이터포털 · 이용허락범위: CC BY (저작자표시)
              </div>
              <div>🌤 <strong>날씨·파고</strong>: 기상청 단기예보 제공</div>
              <div style={{fontSize:9,color:C.inkLight,marginLeft:14}}>
                출처: 공공데이터포털 · 이용허락범위: 공공저작물 출처표시 (제1유형)
              </div>
              <div style={{marginTop:6,paddingTop:6,borderTop:`1px solid ${C.inkFaint}`,color:C.inkLight}}>
                실제 운항 여부는 당일 반드시 재확인하세요
              </div>
            </div>
          </div>

          {/* 법적 링크 */}
          <div style={{
            display:"flex",justifyContent:"center",gap:16,
            padding:"10px 0 24px",
          }}>
            {[["privacy","개인정보처리방침"],["terms","이용약관"]].map(([key,label])=>(
              <button key={key} onClick={()=>setLegalModal(key)} style={{
                background:"none",border:"none",padding:0,cursor:"pointer",
                fontSize:11,color:C.inkMid,textDecoration:"underline",
                textUnderlineOffset:3,fontFamily:"inherit",
              }}>{label}</button>
            ))}
          </div>
        </div>

      </div>{/* ── 본문 wrapper 닫기 ── */}

      {/* ── 법적 고지 모달 ── */}
      {legalModal&&(
        <div onClick={()=>setLegalModal(null)} style={{
          position:"fixed",inset:0,zIndex:500,
          background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",
          display:"flex",alignItems:"flex-end",justifyContent:"center",
        }}>
          <div onClick={e=>e.stopPropagation()} style={{
            width:"100%",maxWidth:480,maxHeight:"82vh",
            background:C.white,borderRadius:"24px 24px 0 0",
            overflow:"hidden",display:"flex",flexDirection:"column",
          }}>
            {/* 모달 헤더 */}
            <div style={{
              padding:"16px 20px 14px",
              borderBottom:`1px solid ${C.inkFaint}`,
              display:"flex",justifyContent:"space-between",alignItems:"center",
              flexShrink:0,
            }}>
              <span style={{fontSize:16,fontWeight:800,color:C.ink}}>
                {legalModal==="privacy"?"개인정보처리방침":"이용약관"}
              </span>
              <button onClick={()=>setLegalModal(null)} style={{
                background:C.pale,border:"none",borderRadius:50,
                width:32,height:32,cursor:"pointer",fontSize:16,
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>✕</button>
            </div>
            {/* 모달 내용 */}
            <div style={{overflowY:"auto",padding:"20px",fontSize:13,color:C.inkMid,lineHeight:1.9}}>
              {legalModal==="privacy"?(
                <>
                  <p style={{fontSize:12,color:C.inkLight,marginBottom:16}}>시행일: 2026년 5월 13일</p>

                  <h3 style={{fontSize:14,fontWeight:800,color:C.ink,margin:"0 0 8px"}}>1. 수집하는 개인정보</h3>
                  <p style={{marginBottom:16}}>비금통통은 회원가입, 로그인, 개인 식별 등의 절차가 없으며 <strong>어떠한 개인정보도 수집하지 않습니다.</strong></p>

                  <h3 style={{fontSize:14,fontWeight:800,color:C.ink,margin:"0 0 8px"}}>2. 이용하는 외부 서비스</h3>
                  <p style={{marginBottom:4}}>앱은 다음 공공 API를 활용합니다.</p>
                  <ul style={{paddingLeft:18,marginBottom:16}}>
                    <li>한국해양교통안전공단(KOMSA) 운항 스케줄 API — 공공데이터포털 제공</li>
                    <li>기상청 단기예보 API — 공공데이터포털 제공</li>
                    <li>Netlify (서버 호스팅) — 서버 로그에 IP 주소가 일시 기록될 수 있습니다</li>
                  </ul>

                  <h3 style={{fontSize:14,fontWeight:800,color:C.ink,margin:"0 0 8px"}}>3. 쿠키 및 추적</h3>
                  <p style={{marginBottom:16}}>비금통통은 쿠키, 광고 추적, 분석 도구를 사용하지 않습니다.</p>

                  <h3 style={{fontSize:14,fontWeight:800,color:C.ink,margin:"0 0 8px"}}>4. 문의</h3>
                  <p>개인정보 관련 문의는 앱 스토어 개발자 연락처로 해주세요.</p>
                </>
              ):(
                <>
                  <p style={{fontSize:12,color:C.inkLight,marginBottom:16}}>시행일: 2026년 5월 13일</p>

                  <h3 style={{fontSize:14,fontWeight:800,color:C.ink,margin:"0 0 8px"}}>1. 서비스 목적</h3>
                  <p style={{marginBottom:16}}>비금통통은 비금도(가산항) ↔ 암태도(남강항) 간 여객선 운항 시간표 및 기상 정보를 제공하는 비공식 정보 서비스입니다.</p>

                  <h3 style={{fontSize:14,fontWeight:800,color:C.ink,margin:"0 0 8px"}}>2. 정보의 정확성 면책</h3>
                  <p style={{marginBottom:8}}>표시되는 운항 정보는 공공데이터포털(한국해양교통안전공단)에서 제공하는 데이터를 기반으로 하며, 다음과 같은 이유로 실제 운항과 차이가 있을 수 있습니다.</p>
                  <ul style={{paddingLeft:18,marginBottom:16}}>
                    <li>기상 악화, 기계 결함 등 돌발 상황에 의한 결항</li>
                    <li>선사의 사정에 따른 시간표 변경</li>
                    <li>API 데이터 갱신 지연</li>
                  </ul>
                  <p style={{marginBottom:16,fontWeight:700,color:C.ink}}>승선 전 반드시 해당 선사 또는 터미널에 운항 여부를 확인하시기 바랍니다.</p>

                  <h3 style={{fontSize:14,fontWeight:800,color:C.ink,margin:"0 0 8px"}}>3. 책임 한계</h3>
                  <p style={{marginBottom:16}}>비금통통은 제공된 정보를 이용함으로써 발생하는 직·간접적 손해에 대해 법적 책임을 지지 않습니다.</p>

                  <h3 style={{fontSize:14,fontWeight:800,color:C.ink,margin:"0 0 8px"}}>4. 데이터 출처 및 라이선스</h3>
                  <ul style={{paddingLeft:18,marginBottom:16}}>
                    <li>배편 정보: 한국해양교통안전공단(KOMSA) / 공공데이터포털<br/>
                      <span style={{fontSize:11,color:C.inkLight}}>이용허락: CC BY (저작자표시) · 공공저작물 출처표시 제1유형</span></li>
                    <li style={{marginTop:6}}>날씨·파고: 기상청 / 공공데이터포털<br/>
                      <span style={{fontSize:11,color:C.inkLight}}>이용허락: 공공저작물 출처표시 제1유형</span></li>
                  </ul>

                  <h3 style={{fontSize:14,fontWeight:800,color:C.ink,margin:"0 0 8px"}}>5. 약관 변경</h3>
                  <p>약관은 서비스 개선에 따라 변경될 수 있으며, 변경 시 앱 내 공지를 통해 안내합니다.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
