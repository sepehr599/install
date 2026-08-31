import { useEffect, useMemo, useState } from 'react'
import { Camera, ChevronLeft, ClipboardList, CloudOff, Coffee, Gauge, Home, MapPin, Menu, Mic, Moon, Plus, Search, Settings, Sun, Trash2, Upload, Waves, X } from 'lucide-react'
import { supabase } from './supabase'
import { AppData, City, InstallSnapshot, Mission, MediaItem, Well, WellStatus } from './types'
import { id, loadData, saveData } from './store'
import { loadCloudData, syncCloudData } from './cloudStore'
import { Empty, Modal, RowLink, Section } from './components'
import MapPicker from './MapPicker'

const statusLabels: Record<WellStatus, string> = { not_installed: 'نصب نشده', installed: 'نصب شده', needs_followup: 'نیازمند مراجعه مجدد', completed: 'تکمیل شده', inactive: 'غیرفعال' }
const signalTone = (n?: number) => n == null ? 'muted' : n < 50 ? 'danger' : n < 80 ? 'warn' : 'good'

function money(n: number) { return new Intl.NumberFormat('fa-IR').format(n) + ' تومان' }
function todayISO() { return new Date().toISOString().slice(0,10) }
function nowTime() { return new Date().toTimeString().slice(0,5) }

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData())
  const [cloudLoading, setCloudLoading] = useState(true)
  const [cloudError, setCloudError] = useState('')
  const [page, setPage] = useState<'dashboard'|'cities'|'wells'|'missions'|'reports'|'settings'>('dashboard')
  const [selectedCity, setSelectedCity] = useState<string | null>(null)
  const [selectedWell, setSelectedWell] = useState<string | null>(null)
  const [selectedMission, setSelectedMission] = useState<string | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [search, setSearch] = useState('')
  useEffect(() => {
    let alive = true
    loadCloudData(data.theme).then(cloud => { if (alive) { setData(cloud); saveData(cloud) } }).catch(err => { if (alive) setCloudError(err?.message || 'خطا در اتصال به Supabase') }).finally(() => { if (alive) setCloudLoading(false) })
    return () => { alive = false }
  }, [])
  const persist = (next: AppData) => { setData(next); saveData(next); syncCloudData(next).catch(err => setCloudError(err?.message || 'ذخیره در Supabase ناموفق بود')) }
  const setTheme = () => {
  const next: AppData = {
    ...data,
    theme: data.theme === 'light' ? 'dark' : 'light'
  }
  persist(next)
}
  const nav = [
    ['dashboard','داشبورد',Home], ['cities','شهرها',MapPin], ['wells','چاه‌ها',Waves], ['missions','مأموریت‌ها',ClipboardList], ['reports','گزارش‌ها',Gauge], ['settings','تنظیمات',Settings],
  ] as const

  const counts = useMemo(() => ({ cities: data.cities.length, wells: data.wells.length, installs: data.snapshots.filter(x => x.type === 'installation').length, visits: data.snapshots.filter(x => x.type === 'visit').length, missions: data.missions.length, followups: data.wells.filter(w => w.status === 'needs_followup').length }), [data])
  const totalCosts = useMemo(() => data.missions.reduce((sum, m) => sum + (m.meal?.amount || 0) + m.travel.reduce((a,t) => a+t.amount,0) + m.otherExpenses.reduce((a,t) => a+t.amount,0), 0), [data])

  const goWell = (wellId: string) => { setSelectedWell(wellId); setSelectedCity(data.wells.find(w=>w.id===wellId)?.cityId ?? null); setPage('wells') }
  const goMission = (missionId: string) => { setSelectedMission(missionId); setPage('missions') }
  const currentCity = selectedCity ? data.cities.find(c=>c.id===selectedCity) : undefined
  const currentWell = selectedWell ? data.wells.find(w=>w.id===selectedWell) : undefined
  const currentMission = selectedMission ? data.missions.find(m=>m.id===selectedMission) : undefined

  return <div className={`app ${data.theme}`}>
    <aside className={`sidebar ${mobileMenu?'open':''}`}>
      <div className="brand"><div className="brand-mark"><Waves size={22}/></div><div><strong>FlowMeter</strong><small>Mission Manager</small></div></div>
      <nav>{nav.map(([key,label,Icon]) => <button key={key} className={page===key?'active':''} onClick={()=>{setPage(key);setMobileMenu(false)}}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-foot"><div className="storage"><span className="dot"/><span>{cloudLoading ? 'در حال اتصال به Supabase...' : cloudError ? 'خطا در Supabase' : 'اتصال Supabase فعال'}</span><CloudOff size={15}/></div><small>نسخه 1.0</small></div>
    </aside>

    <main className="main">
      <header className="topbar"><button className="icon-btn mobile-only" onClick={()=>setMobileMenu(!mobileMenu)}><Menu size={22}/></button><div className="top-search"><Search size={18}/><input placeholder="جستجوی شهر، چاه، سریال..." value={search} onChange={e=>setSearch(e.target.value)} /></div><div className="top-actions"><button className="icon-btn" onClick={setTheme}>{data.theme==='light'?<Moon size={19}/>:<Sun size={19}/>}</button></div></header>
      <div className="content">
        {page==='dashboard' && <Dashboard data={data} counts={counts} totalCosts={totalCosts} goWell={goWell} goMission={goMission} setPage={setPage} />}
        {page==='cities' && <Cities data={data} persist={persist} selectedCity={selectedCity} setSelectedCity={setSelectedCity} setPage={setPage} />}
        {page==='wells' && <Wells data={data} persist={persist} city={currentCity} well={currentWell} selectedCity={selectedCity} selectedWell={selectedWell} setSelectedCity={setSelectedCity} setSelectedWell={setSelectedWell} search={search} goWell={goWell} />}
        {page==='missions' && <Missions data={data} persist={persist} mission={currentMission} selectedMission={selectedMission} setSelectedMission={setSelectedMission} goMission={goMission} />}
        {page==='reports' && <Reports data={data} />}
        {page==='settings' && <SettingsPage data={data} persist={persist} />}
      </div>
    </main>
  </div>
}

function Dashboard({ data, counts, totalCosts, goWell, goMission, setPage }: { data: AppData; counts: any; totalCosts: number; goWell:(id:string)=>void; goMission:(id:string)=>void; setPage:(p:any)=>void }) {
  const recentSnapshots = [...data.snapshots].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5)
  const followups = data.wells.filter(w=>w.status==='needs_followup')
  return <>
    <div className="page-head"><div><span className="eyebrow">مدیریت عملیات میدانی</span><h1>داشبورد</h1><p>وضعیت سریع نصب‌ها، بازدیدها و مأموریت‌ها</p></div><button className="primary" onClick={()=>setPage('missions')}><Plus size={18}/> مأموریت جدید</button></div>
    <div className="stats-grid">
      {[[MapPin,'شهرها',counts.cities], [Waves,'چاه‌ها',counts.wells], [Gauge,'نصب‌ها',counts.installs], [ClipboardList,'بازدیدهای مجدد',counts.visits], [Coffee,'مأموریت‌ها',counts.missions], [Search,'نیازمند پیگیری',counts.followups]].map(([Icon,label,val])=>{const I=Icon as any; return <div className="stat" key={label as string}><div className="stat-icon"><I size={20}/></div><span>{label as string}</span><strong>{val as number}</strong></div>})}
    </div>
    <div className="dashboard-grid">
      <Section title="چاه‌های نیازمند مراجعه مجدد" subtitle="آخرین وضعیت ثبت‌شده"><div className="card-list">{followups.length?followups.map(w=><RowLink key={w.id} title={w.name} meta={`${w.code} • ${data.cities.find(c=>c.id===w.cityId)?.name || ''}`} onClick={()=>goWell(w.id)}/>):<Empty title="موردی برای پیگیری نیست" text="همه چاه‌ها وضعیت عادی دارند."/>}</div></Section>
      <Section title="آخرین فعالیت‌ها" subtitle="نصب و مراجعه‌ها"><div className="card-list">{recentSnapshots.map(s=>{const w=data.wells.find(x=>x.id===s.wellId); return <RowLink key={s.id} title={`${s.type==='installation'?'نصب اولیه':'مراجعه مجدد'} • ${w?.name||''}`} meta={`${s.date} • Signal ${s.signalQuality??'-'}% • Flow ${s.flow??'-'} L/s`} onClick={()=>goWell(s.wellId)}/>})}</div></Section>
    </div>
    <Section title="نمای کلی هزینه مأموریت‌ها" subtitle="جمع کل ثبت‌شده"><div className="cost-hero"><div><span>کل هزینه‌ها</span><strong>{money(totalCosts)}</strong></div><button className="secondary" onClick={()=>setPage('reports')}>مشاهده گزارش‌ها</button></div></Section>
    <Section title="مأموریت‌های اخیر" subtitle="برای مشاهده جزئیات انتخاب کنید"><div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>عنوان</th><th>شهر</th><th>چاه‌ها</th><th>هزینه</th></tr></thead><tbody>{data.missions.slice(-5).reverse().map(m=><tr key={m.id} onClick={()=>goMission(m.id)}><td>{m.date}</td><td>{m.title}</td><td>{data.cities.find(c=>c.id===m.cityId)?.name}</td><td>{m.wellIds.length}</td><td>{money((m.meal?.amount||0)+m.travel.reduce((a,t)=>a+t.amount,0)+m.otherExpenses.reduce((a,t)=>a+t.amount,0))}</td></tr>)}</tbody></table>{!data.missions.length&&<Empty title="هنوز مأموریتی ثبت نشده" text="از دکمه مأموریت جدید شروع کنید."/>}</div></Section>
  </>
}

function Cities({ data, persist, selectedCity, setSelectedCity, setPage }: any) {
  const [add, setAdd] = useState(false); const [edit, setEdit] = useState<City|null>(null)
  const [q,setQ]=useState('')
  const list=data.cities.filter((c:City)=>c.name.includes(q))
  const save=(name:string,description:string,city?:City)=>{ const next=[...data.cities]; if(city){const i=next.findIndex(x=>x.id===city.id);next[i]={...city,name,description}} else next.push({id:id(),name,description,createdAt:new Date().toISOString()}); persist({...data,cities:next});setAdd(false);setEdit(null)}
  return <><div className="page-head"><div><span className="eyebrow">موقعیت‌های پروژه</span><h1>شهرها</h1><p>هر شهر مجموعه‌ای از چاه‌ها و مأموریت‌ها را در خود دارد.</p></div><button className="primary" onClick={()=>setAdd(true)}><Plus size={18}/> افزودن شهر</button></div>
    <div className="toolbar"><div className="top-search compact"><Search size={17}/><input placeholder="جستجوی شهر..." value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    <div className="city-grid">{list.map((c:City)=><div className="city-card" key={c.id}><div className="city-head"><div className="city-icon"><MapPin size={20}/></div><button className="icon-btn" onClick={()=>setEdit(c)}>✎</button></div><h3>{c.name}</h3><p>{c.description||'بدون توضیحات'}</p><div className="city-meta"><span>{data.wells.filter((w:Well)=>w.cityId===c.id).length} چاه</span><span>{data.missions.filter((m:Mission)=>m.cityId===c.id).length} مأموریت</span></div><button className="secondary full" onClick={()=>{setSelectedCity(c.id);setPage('wells')}}>ورود به چاه‌ها <ChevronLeft size={17}/></button></div>)}{!list.length&&<Empty title="شهری پیدا نشد"/>}</div>
    {(add||edit)&&<Modal title={edit?'ویرایش شهر':'افزودن شهر'} onClose={()=>{setAdd(false);setEdit(null)}}><CityForm initial={edit} onSave={(name,desc)=>save(name,desc,edit||undefined)}/></Modal>}
  </>
}

function CityForm({ initial,onSave }: {initial?:City|null;onSave:(name:string,desc:string)=>void}) { const [name,setName]=useState(initial?.name||'');const [desc,setDesc]=useState(initial?.description||'');return <div className="form"><label>نام شهر<input value={name} onChange={e=>setName(e.target.value)} autoFocus/></label><label>توضیحات<textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4}/></label><div className="modal-actions"><button className="secondary">انصراف</button><button className="primary" disabled={!name.trim()} onClick={()=>onSave(name.trim(),desc.trim())}>ذخیره</button></div></div> }

function Wells({ data, persist, city, well, selectedCity, selectedWell, setSelectedCity, setSelectedWell, search, goWell }: any) {
  const [addWell,setAddWell]=useState(false); const [showInstall,setShowInstall]=useState(false);const [showVisit,setShowVisit]=useState(false)
  const cityWells=data.wells.filter((w:Well)=>(!selectedCity||w.cityId===selectedCity) && (!search || w.name.includes(search)||w.code.toLowerCase().includes(search.toLowerCase())))
  const snapshots=data.snapshots.filter((s:InstallSnapshot)=>s.wellId===selectedWell).sort((a,b)=>b.date.localeCompare(a.date))
  const selectCity = (v:string)=>{setSelectedCity(v);setSelectedWell(null)}
  const add=(name:string,code:string)=>{const next=[...data.wells,{id:id(),cityId:selectedCity||data.cities[0]?.id||'',name,code,status:'not_installed' as WellStatus,createdAt:new Date().toISOString()}];persist({...data,wells:next});setAddWell(false)}
  const saveSnapshot=(s:Omit<InstallSnapshot,'id'|'createdAt'|'wellId'>)=>{const snap:InstallSnapshot={...s,id:id(),createdAt:new Date().toISOString(),wellId:selectedWell};const nextSnaps=[...data.snapshots,snap];const nextWells=data.wells.map((w:Well)=>w.id===selectedWell?{...w,status:'needs_followup'===w.status?'needs_followup':'installed',location:s.latitude&&s.longitude?{latitude:s.latitude,longitude:s.longitude,accuracy:s.accuracy}:w.location}:w);persist({...data,snapshots:nextSnaps,wells:nextWells});setShowInstall(false);setShowVisit(false)}
  if(!selectedWell) return <><div className="page-head"><div><span className="eyebrow">ساختار پروژه</span><h1>چاه‌ها</h1><p>یک شهر را انتخاب کنید تا چاه‌های آن نمایش داده شوند.</p></div></div><div className="city-tabs">{data.cities.map((c:City)=><button key={c.id} className={selectedCity===c.id?'active':''} onClick={()=>selectCity(c.id)}>{c.name}<span>{data.wells.filter((w:Well)=>w.cityId===c.id).length}</span></button>)}</div><div className="well-grid">{cityWells.map((w:Well)=><WellCard key={w.id} well={w} city={data.cities.find((c:City)=>c.id===w.cityId)} onClick={()=>goWell(w.id)}/>)}</div><button className="floating-add" onClick={()=>setAddWell(true)}><Plus size={22}/></button>{addWell&&<Modal title="افزودن چاه" onClose={()=>setAddWell(false)}><WellForm onSave={add}/></Modal>}</>
  return <><div className="breadcrumb"><button onClick={()=>setSelectedWell(null)}>چاه‌ها</button><ChevronLeft size={16}/><span>{city?.name}</span><ChevronLeft size={16}/><strong>{well.name}</strong></div><div className="page-head"><div><div className="eyebrow">{well.code}</div><h1>{well.name}</h1><p>{city?.name} • وضعیت: <span className={`status ${well.status}`}>{statusLabels[well.status]}</span></p></div><div className="head-actions"><button className="secondary" onClick={()=>setShowVisit(true)}><Plus size={18}/> مراجعه مجدد</button><button className="primary" onClick={()=>setShowInstall(true)}>{snapshots.length?'ثبت نصب/اطلاعات':'ثبت نصب اولیه'}</button></div></div>
    <div className="well-detail-grid"><section className="detail-card"><div className="detail-title"><MapPin size={19}/> موقعیت آخرین ثبت</div>{well.location?<><div className="coords"><span>Latitude<strong>{well.location.latitude.toFixed(6)}</strong></span><span>Longitude<strong>{well.location.longitude.toFixed(6)}</strong></span><span>Accuracy<strong>{well.location.accuracy?`${well.location.accuracy.toFixed(1)} m`:'-'}</strong></span></div><MapPicker lat={well.location.latitude} lng={well.location.longitude} onChange={()=>{}}/></>:<Empty icon={<MapPin/>} title="موقعیت ثبت نشده" text="در اولین نصب، GPS را دریافت و تأیید کنید."/>}</section><section className="detail-card"><div className="detail-title"><Waves size={19}/> آخرین وضعیت فنی</div>{snapshots.length?<SnapshotSummary snapshot={snapshots[0]}/>:<Empty icon={<Gauge/>} title="هنوز نصب یا بازدید ثبت نشده"/>}</section></div>
    <Section title="تاریخچه نصب و بازدید" subtitle="تمام Snapshotهای این چاه"><div className="timeline">{snapshots.map((s,i)=><div className="timeline-item" key={s.id}><div className="timeline-dot"/><div className="timeline-card"><div className="timeline-head"><strong>{s.type==='installation'?'نصب اولیه':'مراجعه مجدد'}</strong><span>{s.date}</span></div><div className="chips"><span className={`chip ${signalTone(s.signalQuality)}`}>کیفیت {s.signalQuality??'-'}%</span><span className={`chip ${signalTone(s.signalPower)}`}>قدرت {s.signalPower??'-'}%</span><span className="chip">Path {s.soundPath||'-'}</span><span className="chip">Flow {s.flow??'-'} L/s</span></div><p>{s.notes||'بدون توضیحات'}</p><button className="text-btn" onClick={()=>alert(JSON.stringify(s,null,2))}>مشاهده جزئیات</button>{i===1&&snapshots[0]&&<Comparison current={snapshots[0]} previous={s}/>}</div></div>)}</div></Section>
    {(showInstall||showVisit)&&<Modal title={showVisit?'ثبت مراجعه مجدد':'ثبت نصب'} onClose={()=>{setShowInstall(false);setShowVisit(false)}} wide><SnapshotForm previous={snapshots[0]} defaultType={showVisit?'visit':'installation'} well={well} onSave={saveSnapshot}/></Modal>}
  </>
}

function WellCard({ well, city, onClick }: {well:Well;city?:City;onClick:()=>void}) {return <button className="well-card" onClick={onClick}><div className="well-card-top"><div className="well-icon"><Waves size={20}/></div><span className={`status ${well.status}`}>{statusLabels[well.status]}</span></div><h3>{well.name}</h3><p>{well.code} • {city?.name}</p><div className="well-card-bottom"><span>{well.location?'📍 موقعیت ثبت شده':'📍 بدون موقعیت'}</span><ChevronLeft size={18}/></div></button>}
function WellForm({ onSave }: {onSave:(n:string,c:string)=>void}){const[n,setN]=useState('');const[c,setC]=useState('');return <div className="form"><label>نام چاه<input value={n} onChange={e=>setN(e.target.value)}/></label><label>کد چاه<input value={c} onChange={e=>setC(e.target.value)}/></label><div className="modal-actions"><button className="secondary">انصراف</button><button className="primary" disabled={!n.trim()} onClick={()=>onSave(n.trim(),c.trim())}>افزودن</button></div></div>}

function SnapshotSummary({ snapshot:s }: {snapshot:InstallSnapshot}) {return <><div className="metric-grid"><Metric label="Signal Quality" value={s.signalQuality != null ? `${s.signalQuality}%` : '-'} tone={signalTone(s.signalQuality)}/><Metric label="Signal Power" value={s.signalPower != null ? `${s.signalPower}%` : '-'} tone={signalTone(s.signalPower)}/><Metric label="Sound Path" value={s.soundPath||'-'}/><Metric label="Flow" value={s.flow != null ? `${s.flow} L/s` : '-'}/></div><div className="spec-grid"><span>جنس لوله<strong>{s.pipeMaterial||'-'}</strong></span><span>قطر<strong>{s.pipeDiameter??'-'} mm</strong></span><span>ضخامت<strong>{s.pipeThickness??'-'} mm</strong></span><span>Lining<strong>{s.liningThickness??'-'} mm</strong></span><span>Transmitter<strong>{s.transmitterSerial||'-'}</strong></span><span>Sensor<strong>{s.sensorSerial||'-'}</strong></span></div></>}
function Metric({label,value,tone}:{label:string;value:string;tone?:string}){return <div className={`metric ${tone||''}`}><span>{label}</span><strong>{value}</strong></div>}
function Comparison({ current, previous }: {current:InstallSnapshot;previous:InstallSnapshot}) { const rows:[[string,any,any]]|any = [['Signal Quality',previous.signalQuality,current.signalQuality],['Signal Power',previous.signalPower,current.signalPower],['Flow',previous.flow,current.flow],['Sound Path',previous.soundPath,current.soundPath],['Transmitter',previous.transmitterSerial,current.transmitterSerial],['Sensor',previous.sensorSerial,current.sensorSerial]]; return <div className="comparison"><div className="comparison-title">مقایسه با بازدید قبلی</div>{rows.map((r:any)=><div className="comparison-row" key={r[0]}><span>{r[0]}</span><span>{r[1]??'-'}</span><strong>{r[2]??'-'} {r[1]===r[2]?'':typeof r[1]==='number'&&typeof r[2]==='number' ? `(${(r[2]-r[1]>=0?'+':'')+(r[2]-r[1])})`:'• تغییر'}</strong></div>)}</div>}

function SnapshotForm({ previous, defaultType, well, onSave }:{previous?:InstallSnapshot;defaultType:'installation'|'visit';well:Well;onSave:(s:Omit<InstallSnapshot,'id'|'createdAt'|'wellId'>)=>void}) {
  const [date,setDate]=useState(todayISO());const [lat,setLat]=useState<number|undefined>(well.location?.latitude);const[lng,setLng]=useState<number|undefined>(well.location?.longitude);const[acc,setAcc]=useState<number|undefined>();const[material,setMaterial]=useState(previous?.pipeMaterial||'Steel');const[diameter,setDiameter]=useState(previous?.pipeDiameter?.toString()||'');const[thickness,setThickness]=useState(previous?.pipeThickness?.toString()||'');const[lining,setLining]=useState(previous?.liningThickness?.toString()||'');const[quality,setQuality]=useState(previous?.signalQuality?.toString()||'');const[power,setPower]=useState(previous?.signalPower?.toString()||'');const[path,setPath]=useState<'Z'|'V'>(previous?.soundPath||'V');const[tx,setTx]=useState(previous?.transmitterSerial||'');const[sensor,setSensor]=useState(previous?.sensorSerial||'');const[flow,setFlow]=useState(previous?.flow?.toString()||'');const[notes,setNotes]=useState('');const[photos,setPhotos]=useState<MediaItem[]>([]);const[voices,setVoices]=useState<MediaItem[]>([]);const[recording,setRecording]=useState(false);const [mediaRecorder,setMediaRecorder]=useState<MediaRecorder|null>(null);const [mapPos,setMapPos]=useState<{lat:number;lng:number}|null>(null)
  const gps=()=>navigator.geolocation?.getCurrentPosition(p=>{setLat(p.coords.latitude);setLng(p.coords.longitude);setAcc(p.coords.accuracy);setMapPos({lat:p.coords.latitude,lng:p.coords.longitude})},()=>alert('دسترسی به موقعیت مکانی ممکن نشد.'))
  const fileToItem=(file:File,type:'photo'|'receipt'|'screenshot'|'invoice')=>{const reader=new FileReader();reader.onload=()=>setPhotos(prev=>[...prev,{id:id(),name:file.name,type,dataUrl:String(reader.result),createdAt:new Date().toISOString()}]);reader.readAsDataURL(file)}
  const startRec=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const rec=new MediaRecorder(stream);const chunks:BlobPart[]=[];rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=()=>{const blob=new Blob(chunks,{type:rec.mimeType});const r=new FileReader();r.onload=()=>setVoices(v=>[...v,{id:id(),name:`voice-${new Date().toLocaleTimeString()}`,type:'audio',dataUrl:String(r.result),createdAt:new Date().toISOString()}]);r.readAsDataURL(blob);stream.getTracks().forEach(t=>t.stop())};rec.start();setMediaRecorder(rec);setRecording(true)}catch{alert('دسترسی به میکروفون ممکن نشد.')}}
  const stopRec=()=>{mediaRecorder?.stop();setMediaRecorder(null);setRecording(false)}
  const save=()=>{onSave({type:defaultType,date,latitude:lat,longitude:lng,accuracy:acc,pipeMaterial:material,pipeDiameter:Number(diameter)||undefined,pipeThickness:Number(thickness)||undefined,liningThickness:Number(lining)||undefined,signalQuality:Number(quality)||undefined,signalPower:Number(power)||undefined,soundPath:path,transmitterSerial:tx,sensorSerial:sensor,flow:Number(flow)||undefined,notes,photos,voices})}
  return <div className="wizard"><div className="notice">اطلاعات قبلی به عنوان مقدار اولیه نمایش داده شده‌اند؛ برای Visit جدید فقط مقدارهای تغییرکرده را اصلاح کنید.</div><div className="form-grid"><label>تاریخ<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><div className="full-span"><div className="inline-head"><span>موقعیت GPS</span><button className="secondary" onClick={gps}><MapPin size={17}/> دریافت موقعیت فعلی</button></div><MapPicker lat={lat} lng={lng} onChange={(a,b)=>{setLat(a);setLng(b);setMapPos({lat:a,lng:b})}}/><div className="coords small"><span>Latitude<strong>{lat?.toFixed(6)||'-'}</strong></span><span>Longitude<strong>{lng?.toFixed(6)||'-'}</strong></span><span>Accuracy<strong>{acc?`${acc.toFixed(1)} m`:'-'}</strong></span></div></div><label>جنس لوله<select value={material} onChange={e=>setMaterial(e.target.value)}><option>Steel</option><option>Cast Iron</option><option>Ductile Iron</option><option>PVC</option><option>HDPE</option><option>Concrete</option><option>Other</option></select></label><label>قطر لوله (mm)<input inputMode="decimal" value={diameter} onChange={e=>setDiameter(e.target.value)}/></label><label>ضخامت لوله (mm)<input inputMode="decimal" value={thickness} onChange={e=>setThickness(e.target.value)}/></label><label>ضخامت Lining (mm)<input inputMode="decimal" value={lining} onChange={e=>setLining(e.target.value)}/></label><label>کیفیت سیگنال (%)<input min="0" max="100" inputMode="numeric" value={quality} onChange={e=>setQuality(e.target.value)}/></label><label>قدرت سیگنال (%)<input min="0" max="100" inputMode="numeric" value={power} onChange={e=>setPower(e.target.value)}/></label><label>Sound Path<select value={path} onChange={e=>setPath(e.target.value as 'Z'|'V')}><option>V</option><option>Z</option></select></label><label>Serial ترنسمیتر<input value={tx} onChange={e=>setTx(e.target.value)}/></label><label>Serial سنسور<input value={sensor} onChange={e=>setSensor(e.target.value)}/></label><label>Flow (L/s)<input inputMode="decimal" value={flow} onChange={e=>setFlow(e.target.value)}/></label><label className="full-span">توضیحات<textarea rows={5} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="توضیحات فنی، مشکل، اقدام انجام‌شده و نتیجه..."/></label><div className="full-span upload-box"><div className="inline-head"><span>عکس‌های نصب</span><label className="secondary file-btn"><Camera size={17}/> گرفتن/انتخاب عکس<input type="file" accept="image/*" capture="environment" multiple hidden onChange={e=>Array.from(e.target.files||[]).forEach(f=>fileToItem(f,'photo'))}/></label></div><div className="thumbs">{photos.map(p=><div className="thumb" key={p.id}><img src={p.dataUrl}/><button onClick={()=>setPhotos(v=>v.filter(x=>x.id!==p.id))}>×</button></div>)}</div></div><div className="full-span upload-box"><div className="inline-head"><span>Voice Notes</span><button className={`secondary ${recording?'recording':''}`} onClick={recording?stopRec:startRec}>{recording?<><X size={17}/> توقف ضبط</>:<><Mic size={17}/> ضبط ویس</>}</button></div><div className="voice-list">{voices.map(v=><div className="voice-row" key={v.id}><Mic size={17}/><span>{v.name}</span><audio controls src={v.dataUrl}/><button className="icon-btn" onClick={()=>setVoices(vs=>vs.filter(x=>x.id!==v.id))}>×</button></div>)}</div></div></div><div className="modal-actions"><button className="secondary">بستن</button><button className="primary" onClick={save}>ثبت نهایی</button></div></div>
}

function Missions({ data, persist, mission, selectedMission, setSelectedMission, goMission }: any) {
  const [add, setAdd] = useState(false)
  const saveMission = (m: Mission) => { persist({ ...data, missions: [...data.missions, m] }); setAdd(false); setSelectedMission(m.id) }

  if (!selectedMission) {
    return <>
      <div className="page-head">
        <div><span className="eyebrow">سفرهای کاری</span><h1>مأموریت‌ها</h1><p>غذا و رفت‌وآمد در سطح مأموریت ثبت می‌شوند، نه در سطح چاه.</p></div>
        <button className="primary" onClick={() => setAdd(true)}><Plus size={18}/> مأموریت جدید</button>
      </div>
      <div className="mission-grid">
        {data.missions.map((m: Mission) => (
          <button className="mission-card" key={m.id} onClick={() => goMission(m.id)}>
            <div className="mission-head"><span>{m.date}</span><span className={`mission-status ${m.status}`}>{m.status === 'done' ? 'انجام شده' : m.status === 'in_progress' ? 'در حال انجام' : m.status === 'planned' ? 'برنامه‌ریزی شده' : 'لغو شده'}</span></div>
            <h3>{m.title}</h3>
            <p>{data.cities.find((c: City) => c.id === m.cityId)?.name} • {m.wellIds.length} چاه</p>
            <strong>{money((m.meal?.amount || 0) + m.travel.reduce((a: number, t: any) => a + t.amount, 0) + m.otherExpenses.reduce((a: number, t: any) => a + t.amount, 0))}</strong>
          </button>
        ))}
        {!data.missions.length && <Empty icon={<ClipboardList/>} title="هنوز مأموریتی ثبت نشده" text="مأموریت روزانه خود را ثبت کنید."/>}
      </div>
      {add && <Modal title="مأموریت جدید" onClose={() => setAdd(false)} wide><MissionForm data={data} onSave={saveMission}/></Modal>}
    </>
  }

  const city = data.cities.find((c: City) => c.id === mission.cityId)
  const wells = data.wells.filter((w: Well) => mission.wellIds.includes(w.id))
  const total = (mission.meal?.amount || 0) + mission.travel.reduce((a: number, t: any) => a + t.amount, 0) + mission.otherExpenses.reduce((a: number, t: any) => a + t.amount, 0)
  const update = (next: Mission) => persist({ ...data, missions: data.missions.map((m: Mission) => m.id === next.id ? next : m) })

  const addTravel = () => {
    const origin = prompt('مبدا')
    const destination = prompt('مقصد')
    const amount = prompt('مبلغ')
    if (origin && destination) {
      const seg = { id: id(), missionId: mission.id, origin, destination, vehicle: 'Snapp / Taxi', amount: Number(amount) || 0, dateTime: new Date().toISOString(), notes: '', files: [] }
      update({ ...mission, travel: [...mission.travel, seg] })
    }
  }

  const addOther = () => {
    const title = prompt('عنوان هزینه')
    const amount = prompt('مبلغ')
    if (title) {
      const item = { id: id(), missionId: mission.id, title, amount: Number(amount) || 0, notes: '', files: [] }
      update({ ...mission, otherExpenses: [...mission.otherExpenses, item] })
    }
  }

  const editMeal = () => {
    const amount = prompt('مبلغ غذا را وارد کنید', String(mission.meal?.amount || ''))
    if (amount !== null) {
      update({ ...mission, meal: {
        id: mission.meal?.id || id(), missionId: mission.id,
        title: mission.meal?.title || 'غذا', amount: Number(amount) || 0,
        vendor: mission.meal?.vendor || '', notes: mission.meal?.notes || '', files: mission.meal?.files || []
      }})
    }
  }

  return <>
    <div className="breadcrumb"><button onClick={() => setSelectedMission(null)}>مأموریت‌ها</button><ChevronLeft size={16}/><strong>{mission.title}</strong></div>
    <div className="page-head">
      <div><div className="eyebrow">{mission.date}</div><h1>{mission.title}</h1><p>{city?.name} • {mission.startTime} تا {mission.endTime}</p></div>
      <div className="cost-pill">{money(total)}</div>
    </div>
    <div className="mission-detail-grid">
      <Section title="چاه‌های این مأموریت">
        <div className="selected-wells">{wells.map((w: Well) => <div className="selected-well" key={w.id}><Waves size={17}/><span>{w.name}</span><small>{w.code}</small></div>)}</div>
      </Section>
      <Section title="غذا" action={<button className="secondary" onClick={editMeal}><Plus size={16}/> افزودن / ویرایش</button>}>
        <div className="expense-card">{mission.meal ? <><strong>{money(mission.meal.amount)}</strong><p>{mission.meal.vendor || 'بدون نام فروشنده'} • {mission.meal.title}</p></> : <Empty icon={<Coffee/>} title="برای این مأموریت غذایی ثبت نشده"/>}</div>
      </Section>
      <Section title="رفت‌وآمد" action={<button className="secondary" onClick={addTravel}><Plus size={16}/> مسیر جدید</button>}>
        <div className="expense-list">{mission.travel.map((t: any) => <div className="expense-row" key={t.id}><div><strong>{t.origin} ← {t.destination}</strong><small>{t.vehicle}</small></div><b>{money(t.amount)}</b></div>)}{!mission.travel.length && <Empty icon={<MapPin/>} title="رفت‌وآمدی ثبت نشده"/>}</div>
      </Section>
      <Section title="سایر هزینه‌ها" action={<button className="secondary" onClick={addOther}><Plus size={16}/> افزودن هزینه</button>}>
        <div className="expense-list">{mission.otherExpenses.map((o: any) => <div className="expense-row" key={o.id}><div><strong>{o.title}</strong><small>{o.notes}</small></div><b>{money(o.amount)}</b></div>)}{!mission.otherExpenses.length && <Empty title="هزینه دیگری ثبت نشده"/>}</div>
      </Section>
    </div>
  </>
}

function MissionForm({data,onSave}:{data:AppData;onSave:(m:Mission)=>void}){const[date,setDate]=useState(todayISO());const[cityId,setCityId]=useState(data.cities[0]?.id||'');const[title,setTitle]=useState('ماموریت نصب فلومتر');const[start,setStart]=useState(nowTime());const[end,setEnd]=useState('');const[notes,setNotes]=useState('');const[status,setStatus]=useState<Mission['status']>('in_progress');const[selected,setSelected]=useState<string[]>([]);return <div className="form"><div className="form-grid"><label>تاریخ<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>شهر<select value={cityId} onChange={e=>setCityId(e.target.value)}>{data.cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="full-span">عنوان مأموریت<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label>شروع<input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><label>پایان<input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>وضعیت<select value={status} onChange={e=>setStatus(e.target.value as Mission['status'])}><option value="in_progress">در حال انجام</option><option value="planned">برنامه‌ریزی شده</option><option value="done">انجام شده</option></select></label><label className="full-span">توضیحات<textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label><div className="full-span"><strong>چاه‌های بازدیدشده</strong><div className="check-grid">{data.wells.filter(w=>w.cityId===cityId).map(w=><label className="check"><input type="checkbox" checked={selected.includes(w.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,w.id]:v.filter(x=>x!==w.id))}/><span>{w.name}</span><small>{w.code}</small></label>)}</div></div></div><div className="modal-actions"><button className="secondary">انصراف</button><button className="primary" onClick={()=>onSave({id:id(),date,cityId,title,notes,startTime:start,endTime:end,status,wellIds:selected,travel:[],otherExpenses:[],files:[],createdAt:new Date().toISOString()})}>ساخت مأموریت</button></div></div>}

function Reports({data}:{data:AppData}){const total=data.missions.reduce((sum,m)=>sum+(m.meal?.amount||0)+m.travel.reduce((a,t)=>a+t.amount,0)+m.otherExpenses.reduce((a,t)=>a+t.amount,0),0);const meal=data.missions.reduce((sum,m)=>sum+(m.meal?.amount||0),0);const travel=data.missions.reduce((sum,m)=>sum+m.travel.reduce((a,t)=>a+t.amount,0),0);return <><div className="page-head"><div><span className="eyebrow">گزارش و جمع‌بندی</span><h1>گزارش‌ها</h1><p>نمای کلی نصب‌ها و هزینه‌های مأموریت‌ها</p></div><button className="secondary" onClick={()=>alert('در نسخه بعدی خروجی CSV/PDF اضافه می‌شود.')}>خروجی گزارش</button></div><div className="stats-grid"><div className="stat"><span>کل هزینه</span><strong>{money(total)}</strong></div><div className="stat"><span>غذا</span><strong>{money(meal)}</strong></div><div className="stat"><span>رفت‌وآمد</span><strong>{money(travel)}</strong></div><div className="stat"><span>سایر</span><strong>{money(total-meal-travel)}</strong></div></div><Section title="آخرین مأموریت‌ها"><div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>عنوان</th><th>شهر</th><th>چاه‌ها</th><th>هزینه</th></tr></thead><tbody>{data.missions.map(m=><tr key={m.id}><td>{m.date}</td><td>{m.title}</td><td>{data.cities.find(c=>c.id===m.cityId)?.name}</td><td>{m.wellIds.length}</td><td>{money((m.meal?.amount||0)+m.travel.reduce((a,t)=>a+t.amount,0)+m.otherExpenses.reduce((a,t)=>a+t.amount,0))}</td></tr>)}</tbody></table></div></Section></>}
function SettingsPage({data,persist}:{data:AppData;persist:(d:AppData)=>void}){return <><div className="page-head"><div><span className="eyebrow">تنظیمات</span><h1>تنظیمات</h1><p>نسخه ساده و عملیاتی برای استفاده میدانی.</p></div></div><Section title="Threshold سیگنال"><div className="setting-grid"><label>کمتر از این مقدار = ضعیف<input type="number" defaultValue={50}/></label><label>کمتر از این مقدار = متوسط<input type="number" defaultValue={80}/></label></div></Section><Section title="ذخیره‌سازی"><div className="notice">در حال حاضر برنامه در حالت محلی مرورگر کار می‌کند. اگر متغیرهای Supabase در <code>.env</code> تنظیم شوند، زیرساخت اتصال آماده است. برای نسخه بعدی، Repository لایه‌بندی‌شده برای انتقال ذخیره‌سازی به Supabase قابل اضافه‌شدن است.</div><button className="danger-btn" onClick={()=>{localStorage.removeItem('flowmeter-app-v1');location.reload()}}><Trash2 size={17}/> پاک کردن داده‌های Demo</button></Section></>}
