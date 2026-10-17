const $=s=>document.querySelector(s), API={wx:"https://api.open-meteo.com/v1/forecast",aq:"https://air-quality-api.open-meteo.com/v1/air-quality",geo:"https://geocoding-api.open-meteo.com/v1/search"};
let S={loc:null,unit:"celsius",wx:null,aq:null,tmode:"h"},charts={};
const V=(x,d=0,u="")=>(x==null||isNaN(x))?"—":(+x).toFixed(d)+u;
const tu=()=>S.unit==="celsius"?"°C":"°F";
const unav=(m)=>`<div class="unav">⚠ ${m}</div>`;
const alerts=[];function addErr(t,m){alerts.push(`<div class="err"><b>${t}</b>${m}</div>`)}

async function getJSON(url,label){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);
  try{
    const r=await fetch(url,{signal:c.signal});let j=null;try{j=await r.json()}catch{}
    if(!r.ok||(j&&j.error))throw new Error(`${j&&j.reason?j.reason:"HTTP "+r.status}${r.status===429?" (rate limit reached, try again later)":""}`);
    return j;
  }catch(e){
    throw new Error(e.name==="AbortError"?`${label} timed out after 15 s.`:(e instanceof TypeError?`${label}: network request failed. Check your connection, or whether the page is blocked from reaching the API (offline, ad blocker, sandboxed preview).`:`${label}: ${e.message}`));
  }finally{clearTimeout(t)}
}

/* ---------- helpers ---------- */
const kind=c=>c==null?null:c===0?"clear":c<=2?"partly":c===3?"cloud":c<=48?"fog":c<=57?"rain":c<=67?"rain":c<=77?"snow":c<=82?"rain":c<=86?"snow":"storm";
const WMO={0:"Clear sky",1:"Mostly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Rime fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",56:"Freezing drizzle",57:"Freezing drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",66:"Freezing rain",67:"Freezing rain",71:"Light snow",73:"Snow",75:"Heavy snow",77:"Snow grains",80:"Rain showers",81:"Rain showers",82:"Violent showers",85:"Snow showers",86:"Heavy snow showers",95:"Thunderstorm",96:"Thunderstorm, hail",99:"Thunderstorm, heavy hail"};
const CLOUD='<path d="M20 48a10 10 0 0 1 1-20 14 14 0 0 1 27 4 8 8 0 0 1-1 16z" fill="#dfe7ef" stroke="#9fb0c2" stroke-width="1.5"/>';
function icon(code,day=1){
  const k=kind(code);if(!k)return`<svg viewBox="0 0 64 64"><text x="32" y="42" text-anchor="middle" font-size="30" fill="#9fb0c2">?</text></svg>`;
  const sun='<g class="ray"><circle cx="32" cy="32" r="11" fill="#f7b731"/>'+[...Array(8)].map((_,i)=>`<line x1="32" y1="12" x2="32" y2="6" stroke="#f7b731" stroke-width="3" stroke-linecap="round" transform="rotate(${i*45} 32 32)"/>`).join("")+"</g>";
  const moon='<path d="M40 14a18 18 0 1 0 12 30A15 15 0 0 1 40 14z" fill="#e9e3b4"/>';
  const body=day?sun:moon,small=day?'<circle cx="24" cy="24" r="9" fill="#f7b731"/>':'<path d="M30 10a13 13 0 1 0 8 22 11 11 0 0 1-8-22z" fill="#e9e3b4"/>';
  let s="";
  if(k==="clear")s=body;
  else if(k==="partly")s=small+CLOUD;
  else if(k==="cloud")s=CLOUD;
  else if(k==="fog")s=CLOUD+[52,58].map(y=>`<line x1="16" y1="${y}" x2="50" y2="${y}" stroke="#9fb0c2" stroke-width="3" stroke-linecap="round"/>`).join("");
  else if(k==="rain")s='<g class="sky-rain">'+CLOUD+[22,32,42].map(x=>`<line class="r" x1="${x}" y1="52" x2="${x-3}" y2="60" stroke="#4dabf7" stroke-width="3" stroke-linecap="round"/>`).join("")+"</g>";
  else if(k==="snow")s=CLOUD+[22,32,42].map(x=>`<circle cx="${x}" cy="56" r="2.5" fill="#fff" stroke="#9fb0c2"/>`).join("");
  else s=CLOUD+'<path d="M33 44l-7 10h6l-3 8 10-12h-6z" fill="#f7b731"/>';
  return`<svg viewBox="0 0 64 64" role="img" aria-label="${WMO[code]||"Weather"}">${s}</svg>`;
}
const SKY={clear:["#1c7ed6","#74c0fc"],night:["#1b2a52","#3b4d85"],partly:["#3b82c4","#8fbbe0"],cloud:["#5f7183","#9aabbb"],fog:["#6b7b88","#a7b4be"],rain:["#35506b","#6b8aa6"],snow:["#6d8fb0","#c3d6e8"],storm:["#2b2d42","#5a5d7a"]};
const dir=d=>d==null?"—":["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(d/22.5)%16];
const uvInfo=v=>v==null?["Unavailable","var(--mute)"]:v<3?["Low","#2b9348"]:v<6?["Moderate","#d4a017"]:v<8?["High","#e8590c"]:v<11?["Very high","#d64545"]:["Extreme","#8e44ad"];
const aqInfo=v=>v==null?["Unavailable",0]:v<=50?["Good",.04]:v<=100?["Moderate",.2]:v<=150?["Unhealthy for sensitive groups",.4]:v<=200?["Unhealthy",.6]:v<=300?["Very unhealthy",.8]:["Hazardous",.97];
const hr=t=>{const h=+t.slice(11,13);return h===0?"12 AM":h<12?h+" AM":h===12?"12 PM":(h-12)+" PM"};
const dn=(t,i)=>i===0?"Today":new Date(t+"T12:00").toLocaleDateString(undefined,{weekday:"short"});
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- load ---------- */
async function load(){
  alerts.length=0;$("#alerts").innerHTML="";
  $("#hero").innerHTML='<div class="skel"></div><div class="skel"></div>';
  const {latitude:la,longitude:lo}=S.loc,tz="timezone=auto";
  const wxUrl=`${API.wx}?latitude=${la}&longitude=${lo}&${tz}&forecast_days=7&temperature_unit=${S.unit}&wind_speed_unit=kmh&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,is_day,uv_index,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset`;
  const aqUrl=`${API.aq}?latitude=${la}&longitude=${lo}&${tz}&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide`;
  const [w,a]=await Promise.allSettled([getJSON(wxUrl,"Weather forecast"),getJSON(aqUrl,"Air quality")]);
  S.wx=w.status==="fulfilled"?w.value:null;S.aq=a.status==="fulfilled"?a.value:null;
  if(w.status==="rejected")addErr("Weather forecast unavailable",w.reason.message);
  if(a.status==="rejected")addErr("Air-quality data unavailable",a.reason.message+" The rest of the dashboard still works.");
  $("#place").textContent=S.loc.name?`Current weather · ${S.loc.name}`:"Current weather";
  [renderNow,renderHourly,renderDaily,renderCharts,renderUV,renderAQ,renderWind].forEach(fn=>{try{fn()}catch(e){console.error(fn.name,e);addErr("Display problem in "+fn.name.replace("render",""),e.message)}});
  if(!window.Chart)addErr("Charts unavailable","Chart.js could not be loaded from cdnjs.cloudflare.com. Check your connection or content blocker.");
  $("#alerts").innerHTML=alerts.join("");
}
const noW=m=>S.wx?null:m;

function renderNow(){
  const h=$("#hero");if(!S.wx){h.innerHTML=`<div class="card" style="grid-column:1/-1">${unav("Current conditions unavailable. See the error above.")}</div>`;return}
  const c=S.wx.current,k=kind(c.weather_code),pal=SKY[c.is_day?k:"night"]||SKY.clear;
  const el=$("#hero");el.style.setProperty("--now1",pal[0]);el.style.setProperty("--now2",pal[1]);
  const d=S.wx.daily;
  h.innerHTML=`<div class="card now">${icon(c.weather_code,c.is_day)}<div><div class="big">${V(c.temperature_2m,0,"°")}</div><div>${WMO[c.weather_code]||"Condition unavailable"}</div><div class="sm">Feels like ${V(c.apparent_temperature,0,"°")} · H ${V(d.temperature_2m_max[0],0,"°")} L ${V(d.temperature_2m_min[0],0,"°")}</div></div></div>
  <div class="stats">
  <div class="stat"><small>Humidity</small><b>${V(c.relative_humidity_2m,0,"%")}</b></div>
  <div class="stat"><small>Wind</small><b>${V(c.wind_speed_10m,0," km/h")} ${dir(c.wind_direction_10m)}</b></div>
  <div class="stat"><small>Pressure</small><b>${V(c.pressure_msl,0," hPa")}</b></div>
  <div class="stat"><small>Precipitation</small><b>${V(c.precipitation,1," mm")}</b></div>
  <div class="stat"><small>UV index</small><b>${V(c.uv_index,1)}</b></div>
  <div class="stat"><small>Sunrise / sunset</small><b style="font-size:16px">${d.sunrise[0]?d.sunrise[0].slice(11):"—"} / ${d.sunset[0]?d.sunset[0].slice(11):"—"}</b></div></div>`;
}
function hourIdx(){const w=S.wx,n=w.current.time.slice(0,13)+":00";const i=w.hourly.time.findIndex(t=>t>=n);return i<0?0:i}
function renderHourly(){
  const s=$("#strip");if(!S.wx){s.innerHTML=unav("Hourly forecast unavailable.");return}
  const H=S.wx.hourly,i=hourIdx();s.innerHTML="";
  for(let j=i;j<i+24&&j<H.time.length;j++)s.insertAdjacentHTML("beforeend",`<div class="h"><small>${j===i?"Now":hr(H.time[j])}</small>${icon(H.weather_code[j],H.is_day[j])}<b>${V(H.temperature_2m[j],0,"°")}</b><div class="pp">${V(H.precipitation_probability[j],0,"%")}</div><small>${H.wind_direction_10m[j]==null?"—":`<span style="display:inline-block;transform:rotate(${H.wind_direction_10m[j]+180}deg)">↑</span>`} ${V(H.wind_speed_10m[j],0)}</small></div>`);
}
function renderDaily(){
  const e=$("#days");if(!S.wx){e.innerHTML=unav("7-day forecast unavailable.");return}
  const d=S.wx.daily,lo=Math.min(...d.temperature_2m_min.filter(x=>x!=null)),hi=Math.max(...d.temperature_2m_max.filter(x=>x!=null)),span=(hi-lo)||1;
  e.innerHTML=d.time.map((t,i)=>{const a=d.temperature_2m_min[i],b=d.temperature_2m_max[i],ok=a!=null&&b!=null;
  return`<div class="d"><b>${dn(t,i)}</b>${icon(d.weather_code[i],1)}<div><div class="rng" title="${WMO[d.weather_code[i]]||""}">${ok?`<i style="left:${(a-lo)/span*100}%;right:${100-(b-lo)/span*100}%"></i>`:""}</div><small style="color:var(--mute)">${WMO[d.weather_code[i]]||"Unavailable"}</small></div><span>${V(a,0,"°")} / ${V(b,0,"°")}</span><span class="pr" style="color:var(--acc)">💧${V(d.precipitation_probability_max[i],0,"%")}</span></div>`}).join("");
}

/* ---------- charts ---------- */
function mk(id,boxId,cfg,msg){
  if(charts[id]){charts[id].destroy();delete charts[id]}
  const box=$("#"+boxId);
  if(msg){box.innerHTML=unav(msg);return}
  if(!window.Chart){box.innerHTML=unav("Chart.js failed to load.");return}
  if(!box.querySelector("canvas"))box.innerHTML=`<canvas id="${id}"></canvas>`;
  const ink=css("--mute"),line=css("--line");
  cfg.options=Object.assign({responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false}},cfg.options||{});
  const sc=cfg.options.scales=cfg.options.scales||{x:{},y:{}};
  Object.values(sc).forEach(a=>{a.ticks=Object.assign({color:ink,maxTicksLimit:8},a.ticks||{});a.grid=Object.assign({color:line},a.grid||{})});
  cfg.options.plugins=Object.assign({legend:{labels:{color:ink}}},cfg.options.plugins||{});
  charts[id]=new Chart(box.querySelector("canvas"),cfg);
}
function renderCharts(){
  const m=S.wx?null:"Chart data unavailable because the forecast failed to load.";
  const w=S.wx,i=w?hourIdx():0,H=w&&w.hourly,D=w&&w.daily,sl=a=>a.slice(i,i+24);
  const lab=w&&sl(H.time).map(hr);
  // temperature
  if(S.tmode==="h")mk("cT","cvT",w&&{type:"line",data:{labels:lab,datasets:[{label:"Temperature",data:sl(H.temperature_2m),borderColor:css("--acc2"),backgroundColor:"rgba(232,89,12,.12)",fill:true,tension:.35,pointRadius:0},{label:"Feels like",data:sl(H.apparent_temperature),borderColor:css("--acc"),borderDash:[5,4],tension:.35,pointRadius:0}]},options:{scales:{x:{},y:{ticks:{callback:v=>v+"°"}}}}},m);
  else mk("cT","cvT",w&&{type:"line",data:{labels:D.time.map(dn),datasets:[{label:"High",data:D.temperature_2m_max,borderColor:css("--acc2"),tension:.3},{label:"Low",data:D.temperature_2m_min,borderColor:css("--acc"),tension:.3,fill:"-1",backgroundColor:"rgba(90,162,245,.12)"}]},options:{scales:{x:{},y:{ticks:{callback:v=>v+"°"}}}}},m);
  mk("cP","cvP",w&&{type:"bar",data:{labels:lab,datasets:[{label:"Chance of precipitation (%)",data:sl(H.precipitation_probability),backgroundColor:css("--acc"),borderRadius:4}]},options:{scales:{x:{},y:{min:0,max:100,ticks:{callback:v=>v+"%"}}}}},m);
  mk("cP2","cvP2",w&&{type:"bar",data:{labels:D.time.map(dn),datasets:[{label:"Chance (%)",data:D.precipitation_probability_max,backgroundColor:css("--acc"),borderRadius:4,yAxisID:"y"},{type:"line",label:"Total (mm)",data:D.precipitation_sum,borderColor:css("--acc2"),yAxisID:"y1",tension:.3}]},options:{scales:{x:{},y:{min:0,max:100},y1:{position:"right",min:0,grid:{drawOnChartArea:false}}}}},m);
}
function renderUV(){
  const b=$("#uvBox");if(!S.wx){b.innerHTML="<b>UV index</b>"+unav("UV data unavailable.");return}
  const c=S.wx.current,[t,col]=uvInfo(c.uv_index),mx=S.wx.daily.uv_index_max[0],i=hourIdx();
  b.innerHTML=`<b>UV index</b><div class="aqi" style="color:${col}">${V(c.uv_index,1)}</div><div>${t} now · today's peak ${V(mx,1)} (${uvInfo(mx)[0]})</div><div class="cv" style="height:150px;margin-top:10px"><canvas id="cU"></canvas></div><small style="color:var(--mute)">${mx>=3?"Sun protection recommended when UV is 3 or higher.":"Sun protection not usually needed."}</small>`;
  const H=S.wx.hourly;
  if(window.Chart){const cv=b.querySelector("canvas");charts.cU&&charts.cU.destroy();charts.cU=new Chart(cv,{type:"line",data:{labels:H.time.slice(i,i+24).map(hr),datasets:[{label:"UV index",data:H.uv_index.slice(i,i+24),borderColor:"#d4a017",backgroundColor:"rgba(212,160,23,.18)",fill:true,tension:.35,pointRadius:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:css("--mute"),maxTicksLimit:6},grid:{color:css("--line")}},y:{min:0,suggestedMax:11,ticks:{color:css("--mute")},grid:{color:css("--line")}}}}})}
}
function renderAQ(){
  const b=$("#aqBox");if(!S.aq){b.innerHTML="<b>Air quality</b>"+unav("Air-quality data unavailable for this location or the service is down.");return}
  const c=S.aq.current||{},[t,p]=aqInfo(c.us_aqi),u=S.aq.current_units||{};
  const P=(n,k)=>`<div>${n}<b>${V(c[k],1)}</b><small>${u[k]||""}</small></div>`;
  b.innerHTML=`<b>Air quality (US AQI)</b><div class="aqi">${V(c.us_aqi,0)}</div><div>${t}</div>${c.us_aqi==null?unav("No AQI value reported for this location."):`<div class="bar"><i style="left:${Math.min(p*100,100)}%"></i></div>`}<div class="pol">${P("PM2.5","pm2_5")}${P("PM10","pm10")}${P("Ozone","ozone")}${P("NO₂","nitrogen_dioxide")}${P("SO₂","sulphur_dioxide")}${P("CO","carbon_monoxide")}</div>`;
}
function renderWind(){
  const b=$("#windBox");if(!S.wx){b.innerHTML=unav("Wind data unavailable.");return}
  const c=S.wx.current,d=c.wind_direction_10m,ink=css("--mute");
  const ticks=["N","E","S","W"].map((l,i)=>{const a=i*90*Math.PI/180;return`<text x="${75+Math.sin(a)*60}" y="${80-Math.cos(a)*60}" text-anchor="middle" font-size="12" fill="${ink}">${l}</text>`}).join("");
  b.innerHTML=`<svg viewBox="0 0 150 150" role="img" aria-label="Wind from ${dir(d)}"><circle cx="75" cy="75" r="52" fill="none" stroke="${css("--line")}" stroke-width="2"/>${ticks}${d==null?`<text x="75" y="80" text-anchor="middle" fill="${ink}">n/a</text>`:`<g transform="rotate(${d+180} 75 75)" style="transition:transform .6s"><path d="M75 30l9 30H66z" fill="${css("--acc")}"/><rect x="73" y="58" width="4" height="34" rx="2" fill="${css("--acc")}"/></g>`}</svg>
  <div><div class="aqi">${V(c.wind_speed_10m,0)} <span style="font-size:16px">km/h</span></div><div>From the <b>${dir(d)}</b> (${V(d,0,"°")}) · gusts ${V(c.wind_gusts_10m,0," km/h")}</div><small style="color:var(--mute)">The arrow points the way the wind is blowing.</small></div>`;
}

/* ---------- location & events ---------- */
function setLoc(l){S.loc=l;try{localStorage.setItem("wxloc",JSON.stringify(l))}catch{}load()}
$("#f").addEventListener("submit",async e=>{
  e.preventDefault();const q=$("#q").value.trim(),sg=$("#sug");if(!q)return;
  try{const j=await getJSON(`${API.geo}?name=${encodeURIComponent(q)}&count=5`,"City search");
    if(!j.results||!j.results.length){sg.hidden=false;sg.innerHTML=`<button disabled>No city found for “${q.replace(/</g,"&lt;")}”. Check the spelling.</button>`;return}
    sg.hidden=false;sg.innerHTML="";j.results.forEach(r=>{const b=document.createElement("button");b.type="button";b.textContent=[r.name,r.admin1,r.country].filter(Boolean).join(", ");b.onclick=()=>{sg.hidden=true;$("#q").value="";setLoc({name:b.textContent,latitude:r.latitude,longitude:r.longitude})};sg.appendChild(b)});
  }catch(err){sg.hidden=true;alerts.length=0;addErr("Search failed",err.message);$("#alerts").innerHTML=alerts.join("")}
});
document.addEventListener("click",e=>{if(!e.target.closest("#f"))$("#sug").hidden=true});
$("#geo").onclick=()=>{
  const fail=m=>{alerts.length=0;addErr("Location unavailable",m);$("#alerts").innerHTML=alerts.join("")};
  if(!navigator.geolocation)return fail("This browser does not support geolocation. Search for a city instead.");
  navigator.geolocation.getCurrentPosition(p=>setLoc({name:"Your location",latitude:p.coords.latitude,longitude:p.coords.longitude}),er=>fail(er.code===1?"Location permission was denied. Allow it in the browser, or search for a city.":"Your position could not be determined. Search for a city instead."),{timeout:10000});
};
function unit(u){S.unit=u;$("#uC").classList.toggle("on",u==="celsius");$("#uF").classList.toggle("on",u==="fahrenheit");if(S.loc)load()}
$("#uC").onclick=()=>unit("celsius");$("#uF").onclick=()=>unit("fahrenheit");
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{S.tmode=b.dataset.m;document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("on",x===b));renderCharts()});
// sidebar active state
const links=[...document.querySelectorAll("#nav a")];
const io=new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting)links.forEach(a=>a.classList.toggle("on",a.hash==="#"+en.target.id))}),{rootMargin:"-30% 0px -60% 0px"});
document.querySelectorAll("main section").forEach(s=>io.observe(s));
// start
let saved=null;try{saved=JSON.parse(localStorage.getItem("wxloc"))}catch{}
setLoc(saved||{name:"London, United Kingdom",latitude:51.5072,longitude:-0.1276});
