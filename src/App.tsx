import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ChevronLeft, ClipboardList, CloudOff, Coffee, FileImage, Gauge, Home, Image as ImageIcon, MapPin, Menu, Mic, Moon, Plus, Search, Settings, Sun, Trash2, Upload, Waves, X, CheckCircle2, RotateCcw } from 'lucide-react'
import { AppData, City, InstallSnapshot, Mission, MediaItem, Well, WellStatus, Meal, TravelSegment, OtherExpense } from './types'
import { id, loadData, saveData } from './store'
import { loadCloudData, syncCloudData, deleteMissionCloud } from './cloudStore'
import { supabase } from './supabase'
import { Empty, Modal, RowLink, Section } from './components'
import MapPicker from './MapPicker'
import * as XLSX from 'xlsx'

const statusLabels: Record<WellStatus, string> = { not_installed: 'نصب نشده', installed: 'نصب شده', needs_followup: 'نیازمند مراجعه مجدد', completed: 'تکمیل شده', inactive: 'غیرفعال' }
const signalTone = (n?: number) => n == null ? 'muted' : n < 50 ? 'danger' : n < 80 ? 'warn' : 'good'
const faDigits = (s: string | number) => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
const toEnglishDigits = (s: string) => s.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
function money(n: number) { return new Intl.NumberFormat('fa-IR').format(n) + ' تومان' }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function nowTime() { return new Date().toTimeString().slice(0,5) }
function jalaliParts(iso: string) { const d = new Date(`${iso}T12:00:00`); const parts = new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric'}).formatToParts(d); return { y:Number(parts.find(x=>x.type==='year')?.value), m:Number(parts.find(x=>x.type==='month')?.value), d:Number(parts.find(x=>x.type==='day')?.value) } }
function jalaliLabel(iso?: string) { if(!iso) return '-'; const p=jalaliParts(iso); return `${faDigits(p.y)}/${faDigits(String(p.m).padStart(2,'0'))}/${faDigits(String(p.d).padStart(2,'0'))}` }
function shiftISO(iso:string, days:number) { const d=new Date(`${iso}T12:00:00`); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function findJalaliMonthStart(iso:string) { const p=jalaliParts(iso); let cur=shiftISO(iso,-40); for(let i=0;i<90;i++){const x=jalaliParts(cur);if(x.y===p.y&&x.m===p.m&&x.d===1)return cur;cur=shiftISO(cur,1)} return iso }

function JalaliDatePicker({ value, onChange }: { value:string; onChange:(iso:string)=>void }) {
  const current = jalaliParts(value || todayISO())
  const [open,setOpen]=useState(false); const [monthIso,setMonthIso]=useState(value||todayISO())
  useEffect(()=>{ if(value) setMonthIso(value) },[value])
  const start=findJalaliMonthStart(monthIso); const month=jalaliParts(start)
  const monthName=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{month:'long'}).format(new Date(`${start}T12:00:00`))
  const days:string[]=[]; for(let i=0;i<31;i++){const iso=shiftISO(start,i);const p=jalaliParts(iso);if(p.y!==month.y||p.m!==month.m)break;days.push(iso)}
  const weekIndex=(new Date(`${start}T12:00:00`).getDay()+1)%7 // Saturday=0
  const prev=shiftISO(start,-1), next=shiftISO(start,days.length)
  const prevMonthStart=findJalaliMonthStart(prev), nextMonthStart=findJalaliMonthStart(next)
  return <div className="jalali-picker-wrap"><button type="button" className="date-display" onClick={()=>setOpen(v=>!v)}><span>{jalaliLabel(value||todayISO())}</span><span>▾</span></button>{open&&<div className="jalali-popover"><div className="jalali-head"><button type="button" className="icon-btn" onClick={()=>setMonthIso(prevMonthStart)}>‹</button><strong>{faDigits(month.y)} • {monthName}</strong><button type="button" className="icon-btn" onClick={()=>setMonthIso(nextMonthStart)}>›</button></div><div className="jalali-weekdays">{['ش','ی','د','س','چ','پ','ج'].map(x=><span key={x}>{x}</span>)}</div><div className="jalali-grid">{Array.from({length:weekIndex}).map((_,i)=><span key={'e'+i}/>) }{days.map(iso=>{const p=jalaliParts(iso);const selected=iso===value;return <button type="button" key={iso} className={selected?'selected':''} onClick={()=>{onChange(iso);setOpen(false)}}>{faDigits(p.d)}</button>})}</div></div>}</div>
}

function confirmDelete(message:string){return window.confirm(message)}

export default function App() {
  const [data,setData]=useState<AppData>(()=>loadData())
  const [cloudLoading,setCloudLoading]=useState(true)
  const [cloudError,setCloudError]=useState('')
  const [page,setPage]=useState<'dashboard'|'cities'|'wells'|'missions'|'reports'|'settings'>('dashboard')
  const [selectedCity,setSelectedCity]=useState<string|null>(null)
  const [selectedWell,setSelectedWell]=useState<string|null>(null)
  const [selectedMission,setSelectedMission]=useState<string|null>(null)
  const [mobileMenu,setMobileMenu]=useState(false)
  const [search,setSearch]=useState('')
  const historyReady=useRef(false)
  const skipHistoryPush=useRef(false)
  const syncQueue=useRef(Promise.resolve())

  // Supabase is the source of truth. LocalStorage is only a cache; deleted
  // records are never merged back from an old local copy.
  useEffect(()=>{
    let alive=true
    const local=loadData()
    loadCloudData(local.theme)
      .then(async cloud=>{
        if(!alive)return
        const cloudHasData=Boolean(cloud.cities.length||cloud.wells.length||cloud.snapshots.length||cloud.missions.length)
        if(!cloudHasData && (local.cities.length||local.wells.length||local.snapshots.length||local.missions.length)){
          await syncCloudData(local)
          const fresh=await loadCloudData(local.theme)
          if(alive){setData(fresh);saveData(fresh)}
        }else{
          setData(cloud);saveData(cloud)
        }
        setCloudError('')
      })
      .catch(e=>{if(alive){setCloudError(e?.message||'خطا در اتصال به Supabase');setData(local);saveData(local)}})
      .finally(()=>{if(alive)setCloudLoading(false)})
    return()=>{alive=false}
  },[])

  const persist=(next:AppData)=>{
    setData(next)
    saveData(next)
    setCloudError('در حال ذخیره…')
    // Serialize saves so a fast sequence of edits cannot race each other.
    syncQueue.current=syncQueue.current
      .then(()=>syncCloudData(next))
      .then(()=>loadCloudData(next.theme))
      .then(cloud=>{setData(cloud);saveData(cloud);setCloudError('')})
      .catch(e=>setCloudError(e?.message||'ذخیره در Supabase ناموفق بود'))
  }

  const routeState=()=>({flowmeter:true,page,selectedCity,selectedWell,selectedMission})
  useEffect(()=>{
    history.replaceState(routeState(),'',window.location.href)
    skipHistoryPush.current=true
    historyReady.current=true
    const onPop=()=>{
      const s=history.state
      if(!s?.flowmeter)return
      skipHistoryPush.current=true
      setPage(s.page||'dashboard')
      setSelectedCity(s.selectedCity||null)
      setSelectedWell(s.selectedWell||null)
      setSelectedMission(s.selectedMission||null)
      setMobileMenu(false)
    }
    window.addEventListener('popstate',onPop)
    return()=>window.removeEventListener('popstate',onPop)
  },[])

  useEffect(()=>{
    if(!historyReady.current)return
    if(skipHistoryPush.current){skipHistoryPush.current=false;return}
    history.pushState(routeState(),'','')
  },[page,selectedCity,selectedWell,selectedMission])

  const setPageAndClose=(key:'dashboard'|'cities'|'wells'|'missions'|'reports'|'settings')=>{
    setPage(key)
    setMobileMenu(false)
    if(key==='wells'){setSelectedWell(null);setSelectedMission(null)}
    if(key==='missions'){setSelectedMission(null);setSelectedWell(null)}
    if(key!=='wells')setSelectedWell(null)
    if(key!=='missions')setSelectedMission(null)
  }

  const setTheme=()=>persist({...data,theme:data.theme==='light'?'dark':'light'})
  const nav=[['dashboard','داشبورد',Home],['cities','شهرها',MapPin],['wells','چاه‌ها',Waves],['missions','مأموریت‌ها',ClipboardList],['reports','گزارش‌ها',Gauge],['settings','تنظیمات',Settings]] as const
  const counts=useMemo(()=>({cities:data.cities.length,wells:data.wells.length,installs:data.snapshots.filter(x=>x.type==='installation').length,visits:data.snapshots.filter(x=>x.type==='visit').length,missions:data.missions.length,followups:data.wells.filter(w=>w.status==='needs_followup').length}),[data])
  const totalCosts=useMemo(()=>data.missions.reduce((s,m)=>s+(m.meal?.amount||0)+m.travel.reduce((a,t)=>a+t.amount,0)+m.otherExpenses.reduce((a,t)=>a+t.amount,0),0),[data])
  const goWell=(wellId:string)=>{setSelectedWell(wellId);setSelectedCity(data.wells.find(w=>w.id===wellId)?.cityId??null);setSelectedMission(null);setPage('wells')}
  const goMission=(id:string)=>{setSelectedMission(id);setSelectedWell(null);setPage('missions')}
  const currentCity=selectedCity?data.cities.find(c=>c.id===selectedCity):undefined
  const currentWell=selectedWell?data.wells.find(w=>w.id===selectedWell):undefined
  const currentMission=selectedMission?data.missions.find(m=>m.id===selectedMission):undefined
  return <div className={`app ${data.theme}`}>
    {mobileMenu&&<button type="button" aria-label="بستن منوی کناری" className="mobile-backdrop" onClick={()=>setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu?'open':''}`}><div className="brand"><div className="brand-mark"><Waves size={22}/></div><div><strong>FlowMeter</strong><small>Mission Manager</small></div></div><nav>{nav.map(([key,label,Icon])=><button key={key} className={page===key?'active':''} onClick={()=>setPageAndClose(key)}><Icon size={19}/><span>{label}</span></button>)}</nav><div className="sidebar-foot"><div className="storage"><span className="dot"/><span>{cloudLoading?'در حال اتصال به Supabase...':cloudError?'خطا در Supabase':'اتصال Supabase فعال'}</span><CloudOff size={15}/></div><small>نسخه 3.2</small></div></aside>
    <main className="main"><header className="topbar"><button className="icon-btn mobile-only" onClick={()=>setMobileMenu(!mobileMenu)}><Menu size={22}/></button><div className="top-search"><Search size={18}/><input placeholder="جستجوی شهر، چاه، سریال..." value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="top-actions"><button className="icon-btn" onClick={setTheme}>{data.theme==='light'?<Moon size={19}/>:<Sun size={19}/>}</button></div></header><div className="content">
      {page==='dashboard'&&<Dashboard data={data} counts={counts} totalCosts={totalCosts} goWell={goWell} goMission={goMission} setPage={setPageAndClose}/>} {page==='cities'&&<Cities data={data} persist={persist} selectedCity={selectedCity} setSelectedCity={setSelectedCity} setPage={setPageAndClose}/>} {page==='wells'&&<Wells data={data} persist={persist} city={currentCity} well={currentWell} selectedCity={selectedCity} selectedWell={selectedWell} setSelectedCity={setSelectedCity} setSelectedWell={setSelectedWell} search={search} goWell={goWell}/>} {page==='missions'&&<Missions data={data} persist={persist} mission={currentMission} selectedMission={selectedMission} setSelectedMission={setSelectedMission} goMission={goMission} goWell={goWell} syncQueue={syncQueue}/>} {page==='reports'&&<Reports data={data}/>} {page==='settings'&&<SettingsPage data={data} persist={persist}/>}
    </div></main></div>
}

function Dashboard({data,counts,totalCosts,goWell,goMission,setPage}:{data:AppData;counts:any;totalCosts:number;goWell:(id:string)=>void;goMission:(id:string)=>void;setPage:(p:any)=>void}){
 const followups=data.wells.filter(w=>w.status==='needs_followup'); const recent=[...data.snapshots].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5)
 const cards:[[any,string,number,string]]|any=[[MapPin,'شهرها',counts.cities,'cities'],[Waves,'چاه‌ها',counts.wells,'wells'],[Gauge,'نصب‌ها',counts.installs,'wells'],[ClipboardList,'بازدیدهای مجدد',counts.visits,'wells'],[Coffee,'مأموریت‌ها',counts.missions,'missions'],[RotateCcw,'نیازمند پیگیری',counts.followups,'wells']]
 return <><div className="page-head"><div><span className="eyebrow">مدیریت عملیات میدانی</span><h1>داشبورد</h1><p>وضعیت سریع نصب‌ها، بازدیدها و مأموریت‌ها</p></div><button className="primary" onClick={()=>setPage('missions')}><Plus size={18}/> مأموریت جدید</button></div><div className="stats-grid">{cards.map(([Icon,label,val,target]:any)=>{const I=Icon;return <button key={label} className="stat stat-button" onClick={()=>setPage(target)}><div className="stat-icon"><I size={20}/></div><span>{label}</span><strong>{val}</strong></button>})}</div>
 <div className="dashboard-grid"><Section title="چاه‌های نیازمند مراجعه مجدد" subtitle="آخرین وضعیت ثبت‌شده"><div className="card-list">{followups.length?followups.map(w=><RowLink key={w.id} title={w.name} meta={`${w.code} • ${data.cities.find(c=>c.id===w.cityId)?.name||''}`} onClick={()=>goWell(w.id)}/>):<Empty title="موردی برای پیگیری نیست" text="همه چاه‌ها وضعیت عادی دارند."/>}</div></Section><Section title="آخرین فعالیت‌ها" subtitle="نصب و مراجعه‌ها"><div className="card-list">{recent.map(s=>{const w=data.wells.find(x=>x.id===s.wellId);return <RowLink key={s.id} title={`${s.type==='installation'?'نصب اولیه':'مراجعه مجدد'} • ${w?.name||''}`} meta={`${jalaliLabel(s.date)} • Signal ${s.signalQuality??'-'}% • Flow ${s.flow??'-'} L/s`} onClick={()=>goWell(s.wellId)}/>})}</div></Section></div>
 <Section title="نمای کلی هزینه مأموریت‌ها" subtitle="جمع کل ثبت‌شده"><div className="cost-hero"><div><span>کل هزینه‌ها</span><strong>{money(totalCosts)}</strong></div><button className="secondary" onClick={()=>setPage('reports')}>مشاهده گزارش‌ها</button></div></Section>
 <Section title="مأموریت‌های اخیر" subtitle="برای مشاهده جزئیات انتخاب کنید"><div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>عنوان</th><th>شهر</th><th>چاه‌ها</th><th>هزینه</th></tr></thead><tbody>{data.missions.slice(-5).reverse().map(m=><tr key={m.id} onClick={()=>goMission(m.id)}><td>{jalaliLabel(m.date)}</td><td>{m.title}</td><td>{data.cities.find(c=>c.id===m.cityId)?.name}</td><td>{m.wellIds.length}</td><td>{money((m.meal?.amount||0)+m.travel.reduce((a,t)=>a+t.amount,0)+m.otherExpenses.reduce((a,t)=>a+t.amount,0))}</td></tr>)}</tbody></table>{!data.missions.length&&<Empty title="هنوز مأموریتی ثبت نشده" text="از دکمه مأموریت جدید شروع کنید."/>}</div></Section></>
}

function Cities({data,persist,selectedCity,setSelectedCity,setPage}:any){const[add,setAdd]=useState(false);const[edit,setEdit]=useState<City|null>(null);const[q,setQ]=useState('');const list=data.cities.filter((c:City)=>c.name.includes(q));const save=(name:string,description:string,city?:City)=>{const next=[...data.cities];if(city){const i=next.findIndex(x=>x.id===city.id);next[i]={...city,name,description}}else next.push({id:id(),name,description,createdAt:new Date().toISOString()});persist({...data,cities:next});setAdd(false);setEdit(null)}
 const removeCity=(c:City)=>{const wellCount=data.wells.filter((w:Well)=>w.cityId===c.id).length;const missionCount=data.missions.filter((m:Mission)=>m.cityId===c.id).length;if(wellCount>0){alert(`این شهر ${faDigits(wellCount)} چاه دارد؛ ابتدا چاه‌های آن را حذف یا جابه‌جا کنید.`);return}if(!confirmDelete(`شهر «${c.name}» حذف شود؟${missionCount?' مأموریت‌های این شهر بدون شهر باقی می‌مانند.':''}`))return;const missions=data.missions.map((m:Mission)=>m.cityId===c.id?{...m,cityId:''}:m);persist({...data,cities:data.cities.filter((x:City)=>x.id!==c.id),missions})}
 return <><div className="page-head"><div><span className="eyebrow">موقعیت‌های پروژه</span><h1>شهرها</h1><p>هر شهر مجموعه‌ای از چاه‌ها و مأموریت‌ها را در خود دارد.</p></div><button className="primary" onClick={()=>setAdd(true)}><Plus size={18}/> افزودن شهر</button></div><div className="toolbar"><div className="top-search compact"><Search size={17}/><input placeholder="جستجوی شهر..." value={q} onChange={e=>setQ(e.target.value)}/></div></div><div className="city-grid">{list.map((c:City)=><div className="city-card" key={c.id}><div className="city-head"><div className="city-icon"><MapPin size={20}/></div><div className="card-actions"><button className="icon-btn" onClick={()=>setEdit(c)}>✎</button><button className="icon-btn danger" onClick={()=>removeCity(c)}><Trash2 size={15}/></button></div></div><h3>{c.name}</h3><p>{c.description||'بدون توضیحات'}</p><div className="city-meta"><span>{data.wells.filter((w:Well)=>w.cityId===c.id).length} چاه</span><span>{data.missions.filter((m:Mission)=>m.cityId===c.id).length} مأموریت</span></div><button className="secondary full" onClick={()=>{setSelectedCity(c.id);setPage('wells')}}>ورود به چاه‌ها <ChevronLeft size={17}/></button></div>)}{!list.length&&<Empty title="شهری پیدا نشد"/>}</div>{(add||edit)&&<Modal title={edit?'ویرایش شهر':'افزودن شهر'} onClose={()=>{setAdd(false);setEdit(null)}}><CityForm initial={edit} onSave={(n,d)=>save(n,d,edit||undefined)}/></Modal>}</>}
function CityForm({initial,onSave}:{initial?:City|null;onSave:(n:string,d:string)=>void}){const[n,setN]=useState(initial?.name||'');const[d,setD]=useState(initial?.description||'');return <div className="form"><label>نام شهر<input value={n} onChange={e=>setN(e.target.value)} autoFocus/></label><label>توضیحات<textarea value={d} onChange={e=>setD(e.target.value)} rows={4}/></label><div className="modal-actions"><button className="primary" disabled={!n.trim()} onClick={()=>onSave(n.trim(),d.trim())}>ذخیره</button></div></div>}

function Wells({data,persist,city,well,selectedCity,selectedWell,setSelectedCity,setSelectedWell,search,goWell}:any){
 const[addWell,setAddWell]=useState(false);const[editWell,setEditWell]=useState(false);const[showInstall,setShowInstall]=useState(false);const[showVisit,setShowVisit]=useState(false);const[detail,setDetail]=useState<InstallSnapshot|null>(null)
 const cityWells=data.wells.filter((w:Well)=>(!selectedCity||w.cityId===selectedCity)&&(!search||w.name.includes(search)||w.code.toLowerCase().includes(search.toLowerCase())));const snapshots=data.snapshots.filter((s:InstallSnapshot)=>s.wellId===selectedWell).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));const selectCity=(v:string)=>{setSelectedCity(v);setSelectedWell(null)}
 const add=(name:string,code:string)=>{persist({...data,wells:[...data.wells,{id:id(),cityId:selectedCity||data.cities[0]?.id||'',name,code,status:'not_installed',createdAt:new Date().toISOString()}]});setAddWell(false)}
 const saveSnapshot=(s:Omit<InstallSnapshot,'id'|'createdAt'|'wellId'>)=>{const existingInstallation=data.snapshots.find(x=>x.wellId===selectedWell&&x.type==='installation');const existing= s.type==='installation'?existingInstallation:undefined;const snap:InstallSnapshot={...s,id:existing?.id||id(),createdAt:existing?.createdAt||new Date().toISOString(),wellId:selectedWell};const nextSnaps=existing?data.snapshots.map(x=>x.id===existing.id?snap:x):[...data.snapshots,snap];const nextWells=data.wells.map((w:Well)=>w.id===selectedWell?{...w,status:s.followUp?'needs_followup':'installed',location:s.latitude!=null&&s.longitude!=null?{latitude:s.latitude,longitude:s.longitude,accuracy:s.accuracy}:w.location}:w);persist({...data,snapshots:nextSnaps,wells:nextWells});setShowInstall(false);setShowVisit(false)}
 const updateWell=(name:string,code:string,cityId:string)=>{persist({...data,wells:data.wells.map((w:Well)=>w.id===selectedWell?{...w,name,code,cityId}:w)});setEditWell(false);setSelectedCity(cityId)}
 const removeWell=(w:Well)=>{const missionCount=data.missions.filter((m:Mission)=>m.wellIds.includes(w.id)).length;if(!confirmDelete(`چاه «${w.name}» و تمام نصب/بازدیدهای آن حذف شود؟${missionCount?` این چاه از ${faDigits(missionCount)} مأموریت نیز حذف می‌شود.`:''}`))return;persist({...data,wells:data.wells.filter((x:Well)=>x.id!==w.id),snapshots:data.snapshots.filter((s:InstallSnapshot)=>s.wellId!==w.id),missions:data.missions.map((m:Mission)=>m.wellIds.includes(w.id)?{...m,wellIds:m.wellIds.filter((wid:string)=>wid!==w.id)}:m)});setSelectedWell(null)}
 if(!selectedWell)return <><div className="page-head"><div><span className="eyebrow">ساختار پروژه</span><h1>چاه‌ها</h1><p>یک شهر را انتخاب کنید تا چاه‌های آن نمایش داده شوند.</p></div></div><div className="city-tabs">{data.cities.map((c:City)=><button key={c.id} className={selectedCity===c.id?'active':''} onClick={()=>selectCity(c.id)}>{c.name}<span>{data.wells.filter((w:Well)=>w.cityId===c.id).length}</span></button>)}</div><div className="well-grid">{cityWells.map((w:Well)=><WellCard key={w.id} well={w} city={data.cities.find((c:City)=>c.id===w.cityId)} onClick={()=>goWell(w.id)} onDelete={()=>removeWell(w)}/>)}</div><button className="floating-add" onClick={()=>setAddWell(true)}><Plus size={22}/></button>{addWell&&<Modal title="افزودن چاه" onClose={()=>setAddWell(false)}><WellForm cities={data.cities} initialCityId={selectedCity||undefined} onSave={add}/></Modal>}</>
 return <><div className="breadcrumb"><button type="button" onClick={()=>{setSelectedWell(null);setSelectedCity(null)}}>چاه‌ها</button><ChevronLeft size={16}/><button type="button" onClick={()=>{setSelectedWell(null);setSelectedCity(city?.id||null)}}>{city?.name||'-'}</button><ChevronLeft size={16}/><strong>{well.name}</strong></div><div className="page-head"><div><div className="eyebrow">{well.code}</div><h1>{well.name}</h1><p>{city?.name} • وضعیت: <span className={`status ${well.status}`}>{statusLabels[well.status]}</span></p></div><div className="head-actions"><button className="secondary" onClick={()=>setEditWell(true)}>✎ ویرایش چاه / شهر</button><button className="secondary" onClick={()=>setShowVisit(true)}><Plus size={18}/> مراجعه مجدد</button><button className="primary" onClick={()=>setShowInstall(true)}>{snapshots.some(s=>s.type==='installation')?'ویرایش نصب اولیه':'ثبت نصب اولیه'}</button><button className="icon-btn danger" onClick={()=>removeWell(well)}><Trash2 size={17}/></button></div></div>
 <div className="well-detail-grid"><section className="detail-card"><div className="detail-title"><MapPin size={19}/> موقعیت ثبت‌شده</div>{well.location?<><div className="coords"><span>Latitude<strong>{well.location.latitude.toFixed(6)}</strong></span><span>Longitude<strong>{well.location.longitude.toFixed(6)}</strong></span><span>Accuracy<strong>{well.location.accuracy?`${well.location.accuracy.toFixed(1)} m`:'-'}</strong></span></div><MapPicker lat={well.location.latitude} lng={well.location.longitude} editable={false} onChange={()=>{}}/></>:<Empty icon={<MapPin/>} title="موقعیت ثبت نشده" text="در اولین نصب، GPS را دریافت و تأیید کنید."/>}</section><section className="detail-card"><div className="detail-title"><Waves size={19}/> آخرین وضعیت فنی</div>{snapshots.length?<SnapshotSummary snapshot={snapshots[0]}/>:<Empty icon={<Gauge/>} title="هنوز نصب یا بازدید ثبت نشده"/>}</section></div>
 <Section title="تاریخچه نصب و بازدید" subtitle="برای مشاهده توضیحات، عکس‌ها و ویس‌ها روی «مشاهده جزئیات» بزنید"><div className="timeline">{snapshots.map((s,i)=><div className="timeline-item" key={s.id}><div className="timeline-dot"/><div className="timeline-card"><div className="timeline-head"><strong>{s.type==='installation'?'نصب اولیه':'مراجعه مجدد'}</strong><span>{jalaliLabel(s.date)}</span></div><div className="chips"><span className={`chip ${signalTone(s.signalQuality)}`}>کیفیت {s.signalQuality??'-'}%</span><span className={`chip ${signalTone(s.signalPower)}`}>قدرت {s.signalPower??'-'}%</span><span className="chip">Path {s.soundPath||'-'}</span><span className="chip">Flow {s.flow??'-'} L/s</span></div><p>{s.notes||'بدون توضیحات'}</p>{s.voices.length>0&&<div className="voice-list inline-voices">{s.voices.map(v=><div className="voice-row" key={v.id}><Mic size={15}/><span>{v.name}</span><AudioPlayer file={v}/></div>)}</div>}<button className="text-btn" onClick={()=>setDetail(s)}>مشاهده جزئیات</button>{i===1&&snapshots[0]&&<Comparison current={snapshots[0]} previous={s}/>}</div></div>)}</div></Section>
 {(showInstall||showVisit)&&<Modal title={showVisit?'ثبت مراجعه مجدد':'ثبت نصب اولیه'} onClose={()=>{setShowInstall(false);setShowVisit(false)}} wide><SnapshotForm previous={showVisit?snapshots[0]:snapshots.find(s=>s.type==='installation')} defaultType={showVisit?'visit':'installation'} well={well} onSave={saveSnapshot}/></Modal>}{detail&&<Modal title={`${detail.type==='installation'?'جزئیات نصب اولیه':'جزئیات مراجعه مجدد'} • ${jalaliLabel(detail.date)}`} onClose={()=>setDetail(null)} wide><SnapshotDetail snapshot={detail}/></Modal>}{editWell&&<Modal title="ویرایش چاه" onClose={()=>setEditWell(false)}><WellForm cities={data.cities} initial={well} onSave={updateWell}/></Modal>}</>}
function WellCard({well,city,onClick,onDelete}:{well:Well;city?:City;onClick:()=>void;onDelete?:()=>void}){return <div className="well-card"><button className="well-card-hit" onClick={onClick}><div className="well-card-top"><div className="well-icon"><Waves size={20}/></div><span className={`status ${well.status}`}>{statusLabels[well.status]}</span></div><h3>{well.name}</h3><p>{well.code} • {city?.name}</p><div className="well-card-bottom"><span>{well.location?'📍 موقعیت ثبت شده':'📍 بدون موقعیت'}</span><ChevronLeft size={18}/></div></button>{onDelete&&<button className="icon-btn danger well-card-delete" onClick={e=>{e.stopPropagation();onDelete()}}><Trash2 size={15}/></button>}</div>}
function WellForm({onSave,cities,initial,initialCityId}:{onSave:(n:string,c:string,cityId:string)=>void;cities:City[];initial?:Well;initialCityId?:string}){const[n,setN]=useState(initial?.name||'');const[c,setC]=useState(initial?.code||'');const[cityId,setCityId]=useState(initial?.cityId||initialCityId||cities[0]?.id||'');return <div className="form"><label>نام چاه<input value={n} onChange={e=>setN(e.target.value)}/></label><label>کد چاه<input value={c} onChange={e=>setC(e.target.value)}/></label><label>شهر چاه<select value={cityId} onChange={e=>setCityId(e.target.value)}>{cities.map(city=><option key={city.id} value={city.id}>{city.name}</option>)}</select></label><div className="modal-actions"><button className="primary" disabled={!n.trim()||!cityId} onClick={()=>onSave(n.trim(),c.trim(),cityId)}>{initial?'ذخیره تغییرات':'افزودن چاه'}</button></div></div>}
function SnapshotSummary({snapshot:s}:{snapshot:InstallSnapshot}){return <><div className="metric-grid"><Metric label="Signal Quality" value={s.signalQuality!=null?`${s.signalQuality}%`:'-'} tone={signalTone(s.signalQuality)}/><Metric label="Signal Power" value={s.signalPower!=null?`${s.signalPower}%`:'-'} tone={signalTone(s.signalPower)}/><Metric label="Sound Path" value={s.soundPath||'-'}/><Metric label="Flow" value={s.flow!=null?`${s.flow} L/s`:'-'}/></div><div className="spec-grid"><span>جنس لوله<strong>{s.pipeMaterial||'-'}</strong></span><span>قطر<strong>{s.pipeDiameter??'-'} mm</strong></span><span>ضخامت<strong>{s.pipeThickness??'-'} mm</strong></span><span>Lining<strong>{s.liningThickness??'-'} mm</strong></span><span>Transmitter<strong>{s.transmitterSerial||'-'}</strong></span><span>Sensor<strong>{s.sensorSerial||'-'}</strong></span></div></>}
function Metric({label,value,tone}:{label:string;value:string;tone?:string}){return <div className={`metric ${tone||''}`}><span>{label}</span><strong>{value}</strong></div>}
function Comparison({current,previous}:{current:InstallSnapshot;previous:InstallSnapshot}){const rows:any[]=[['Signal Quality',previous.signalQuality,current.signalQuality],['Signal Power',previous.signalPower,current.signalPower],['Flow',previous.flow,current.flow],['Sound Path',previous.soundPath,current.soundPath],['Transmitter',previous.transmitterSerial,current.transmitterSerial],['Sensor',previous.sensorSerial,current.sensorSerial]];return <div className="comparison"><div className="comparison-title">مقایسه با بازدید قبلی</div>{rows.map(r=><div className="comparison-row" key={r[0]}><span>{r[0]}</span><span>{r[1]??'-'}</span><strong>{r[2]??'-'} {r[1]===r[2]?'':typeof r[1]==='number'&&typeof r[2]==='number'?`(${(r[2]-r[1]>=0?'+':'')+(r[2]-r[1])})`:'• تغییر'}</strong></div>)}</div>}

function SnapshotDetail({snapshot:s}:{snapshot:InstallSnapshot}){return <div className="detail-modal-grid"><Section title="توضیحات"><div className="detail-text">{s.notes||'توضیحی ثبت نشده است.'}</div></Section><Section title="اطلاعات فنی"><SnapshotSummary snapshot={s}/></Section><Section title={`عکس‌ها (${s.photos.length})`}><MediaGallery items={s.photos}/></Section><Section title={`ویس‌ها (${s.voices.length})`}><MediaGallery items={s.voices} audio/></Section></div>}
async function downloadMedia(f:MediaItem){
  if(f.dataUrl){const a=document.createElement('a');a.href=f.dataUrl;a.download=f.name;a.click();return}
  if(f.storagePath){
    const {data,error}=await supabase.storage.from('flowmeter-files').download(f.storagePath)
    if(!error&&data){
      const u=URL.createObjectURL(data);const a=document.createElement('a');a.href=u;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return
    }
  }
  if(f.url){try{const response=await fetch(f.url);if(!response.ok)throw new Error();const blob=await response.blob();const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return}catch{}}
  alert('دانلود فایل ممکن نشد.')
}
function AudioPlayer({file}:{file:MediaItem}){
 const [src,setSrc]=useState(file.url||file.dataUrl||'')
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState(false)
 const objectUrlRef=useRef<string|null>(null)
 useEffect(()=>()=>{if(objectUrlRef.current)URL.revokeObjectURL(objectUrlRef.current)},[])
 const recover=async()=>{
   if(!file.storagePath||loading)return
   setLoading(true);setError(false)
   try{
     const {data,error}=await supabase.storage.from('flowmeter-files').download(file.storagePath)
     if(error)throw error
     const u=URL.createObjectURL(data)
     if(objectUrlRef.current)URL.revokeObjectURL(objectUrlRef.current)
     objectUrlRef.current=u;setSrc(u)
   }catch{setError(true)}finally{setLoading(false)}
 }
 return <div className="audio-player"><audio controls preload="metadata" src={src} onError={recover}/>{loading&&<small className="muted-text">در حال آماده‌سازی ویس…</small>}{error&&<small className="muted-text">پخش ویس ممکن نشد؛ دانلود را امتحان کنید.</small>}</div>
}
function MediaGallery({items,audio=false}:{items:MediaItem[];audio?:boolean}){if(!items.length)return <Empty icon={audio?<Mic/>:<ImageIcon/>} title={audio?'ویسی ثبت نشده':'عکسی ثبت نشده'}/>;return <div className={audio?'voice-list':'media-gallery'}>{items.map(f=>audio?<div className="voice-row" key={f.id}><Mic size={17}/><span>{f.name}</span><AudioPlayer file={f}/><button className="secondary" type="button" onClick={()=>downloadMedia(f)}>دانلود</button></div>:<div className="gallery-card" key={f.id}><a className="gallery-item" href={f.url||f.dataUrl} target="_blank" rel="noreferrer"><img src={f.url||f.dataUrl} alt={f.name}/></a><button className="secondary media-download" type="button" onClick={()=>downloadMedia(f)}>دانلود</button></div>)}</div>}

function SnapshotForm({previous,defaultType,well,onSave}:{previous?:InstallSnapshot;defaultType:'installation'|'visit';well:Well;onSave:(s:Omit<InstallSnapshot,'id'|'createdAt'|'wellId'>)=>void}){
 const[date,setDate]=useState(previous?.date||todayISO());const[lat,setLat]=useState<number|undefined>(previous?.latitude??well.location?.latitude);const[lng,setLng]=useState<number|undefined>(previous?.longitude??well.location?.longitude);const[acc,setAcc]=useState<number|undefined>(previous?.accuracy??well.location?.accuracy);const[material,setMaterial]=useState(previous?.pipeMaterial||'Steel');const[diameter,setDiameter]=useState(previous?.pipeDiameter?.toString()||'');const[thickness,setThickness]=useState(previous?.pipeThickness?.toString()||'');const[lining,setLining]=useState(previous?.liningThickness?.toString()||'');const[quality,setQuality]=useState(previous?.signalQuality?.toString()||'');const[power,setPower]=useState(previous?.signalPower?.toString()||'');const[path,setPath]=useState<'Z'|'V'>(previous?.soundPath||'V');const[tx,setTx]=useState(previous?.transmitterSerial||'');const[sensor,setSensor]=useState(previous?.sensorSerial||'');const[flow,setFlow]=useState(previous?.flow?.toString()||'');const[notes,setNotes]=useState(previous?.notes||'');const[photos,setPhotos]=useState<MediaItem[]>(previous?.photos||[]);const[voices,setVoices]=useState<MediaItem[]>(previous?.voices||[]);const[followUp,setFollowUp]=useState(well.status==='needs_followup');const[recording,setRecording]=useState(false);const[mediaRecorder,setMediaRecorder]=useState<MediaRecorder|null>(null)
 const gps=()=>navigator.geolocation?.getCurrentPosition(p=>{setLat(p.coords.latitude);setLng(p.coords.longitude);setAcc(p.coords.accuracy)},()=>alert('دسترسی به موقعیت مکانی ممکن نشد.'))
 const addPhoto=(files:FileList|null)=>{Array.from(files||[]).forEach(file=>{const r=new FileReader();r.onload=()=>setPhotos(v=>[...v,{id:id(),name:file.name,type:'photo',dataUrl:String(r.result),createdAt:new Date().toISOString()}]);r.readAsDataURL(file)})}
 const startRec=async()=>{try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true})
  const preferred=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'].find(t=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported?.(t))
  const rec=preferred?new MediaRecorder(stream,{mimeType:preferred}):new MediaRecorder(stream)
  const chunks:BlobPart[]=[]
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
  rec.onstop=()=>{
    const mime=rec.mimeType||'audio/webm'
    const blob=new Blob(chunks,{type:mime})
    const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm'
    const r=new FileReader()
    r.onload=()=>setVoices(v=>[...v,{id:id(),name:`ویس ${new Date().toLocaleTimeString('fa-IR')}.${ext}`,type:'audio',dataUrl:String(r.result),mimeType:mime,createdAt:new Date().toISOString()}])
    r.readAsDataURL(blob)
    stream.getTracks().forEach(t=>t.stop())
  }
  rec.start();setMediaRecorder(rec);setRecording(true)
}catch{alert('دسترسی به میکروفون ممکن نشد.')}}
 const stopRec=()=>{mediaRecorder?.stop();setMediaRecorder(null);setRecording(false)}
 const save=()=>onSave({type:defaultType,date,latitude:lat,longitude:lng,accuracy:acc,pipeMaterial:material,pipeDiameter:Number(diameter)||undefined,pipeThickness:Number(thickness)||undefined,liningThickness:Number(lining)||undefined,signalQuality:Number(quality)||undefined,signalPower:Number(power)||undefined,soundPath:path,transmitterSerial:tx,sensorSerial:sensor,flow:Number(flow)||undefined,notes,photos,voices,followUp})
 return <div className="wizard"><div className="notice">{defaultType==='installation'&&previous?'نصب اولیه قبلاً ثبت شده؛ با ثبت نهایی همین رکورد به‌روزرسانی می‌شود و نصب اولیه جدید ساخته نمی‌شود.':'برای Visit، اطلاعات قبلی فقط به عنوان مقدار اولیه نمایش داده می‌شوند.'}</div><div className="form-grid"><label>تاریخ ثبت<JalaliDatePicker value={date} onChange={setDate}/></label><div className="full-span"><div className="inline-head"><span>موقعیت GPS</span><button type="button" className="secondary" onClick={gps}><MapPin size={17}/> دریافت موقعیت فعلی</button></div><MapPicker lat={lat} lng={lng} editable onChange={(a,b)=>{setLat(a);setLng(b)}}/><div className="coords small"><span>Latitude<strong>{lat?.toFixed(6)||'-'}</strong></span><span>Longitude<strong>{lng?.toFixed(6)||'-'}</strong></span><span>Accuracy<strong>{acc?`${acc.toFixed(1)} m`:'-'}</strong></span></div><div className="notice success"><CheckCircle2 size={15}/> موقعیت با ثبت نهایی ذخیره می‌شود.</div></div><label>جنس لوله<select value={material} onChange={e=>setMaterial(e.target.value)}><option>Steel</option><option>Cast Iron</option><option>Ductile Iron</option><option>PVC</option><option>HDPE</option><option>Concrete</option><option>Other</option></select></label><label>قطر لوله (mm)<input inputMode="decimal" value={diameter} onChange={e=>setDiameter(e.target.value)}/></label><label>ضخامت لوله (mm)<input inputMode="decimal" value={thickness} onChange={e=>setThickness(e.target.value)}/></label><label>ضخامت Lining (mm)<input inputMode="decimal" value={lining} onChange={e=>setLining(e.target.value)}/></label><label>کیفیت سیگنال (%)<input min="0" max="100" inputMode="numeric" value={quality} onChange={e=>setQuality(e.target.value)}/></label><label>قدرت سیگنال (%)<input min="0" max="100" inputMode="numeric" value={power} onChange={e=>setPower(e.target.value)}/></label><label>Sound Path<select value={path} onChange={e=>setPath(e.target.value as 'Z'|'V')}><option>V</option><option>Z</option></select></label><label>Serial ترنسمیتر<input type="number" inputMode="numeric" value={tx} onChange={e=>setTx(e.target.value)}/></label><label>Serial سنسور<input type="number" inputMode="numeric" value={sensor} onChange={e=>setSensor(e.target.value)}/></label><label>Flow (L/s)<input inputMode="decimal" value={flow} onChange={e=>setFlow(e.target.value)}/></label><label className="full-span">توضیحات<textarea rows={5} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="توضیحات فنی، مشکل، اقدام انجام‌شده و نتیجه..."/></label><div className="full-span followup-box"><label className="check"><input type="checkbox" checked={followUp} onChange={e=>setFollowUp(e.target.checked)}/><span><strong>این چاه نیازمند پیگیری و مراجعه مجدد است</strong><small>با فعال‌کردن، چاه در بخش «نیازمند پیگیری» داشبورد نمایش داده می‌شود.</small></span></label></div><div className="full-span upload-box"><div className="inline-head"><span>عکس‌های نصب</span><div className="head-actions"><label className="secondary file-btn"><ImageIcon size={17}/> انتخاب از گالری<input type="file" accept="image/*" multiple hidden onChange={e=>addPhoto(e.target.files)}/></label><label className="secondary file-btn"><Camera size={17}/> دوربین<input type="file" accept="image/*" capture="environment" multiple hidden onChange={e=>addPhoto(e.target.files)}/></label></div></div><div className="thumbs">{photos.map(p=><div className="thumb" key={p.id}><img src={p.url||p.dataUrl} alt={p.name}/><button type="button" onClick={()=>setPhotos(v=>v.filter(x=>x.id!==p.id))}>×</button></div>)}</div></div><div className="full-span upload-box"><div className="inline-head"><span>Voice Notes</span><button type="button" className={`secondary ${recording?'recording':''}`} onClick={recording?stopRec:startRec}>{recording?<><X size={17}/> توقف ضبط</>:<><Mic size={17}/> ضبط ویس</>}</button></div><div className="voice-list">{voices.map(v=><div className="voice-row" key={v.id}><Mic size={17}/><span>{v.name}</span><audio controls src={v.url||v.dataUrl}/><button type="button" className="icon-btn" onClick={()=>setVoices(vs=>vs.filter(x=>x.id!==v.id))}>×</button></div>)}</div></div></div><div className="modal-actions"><button type="button" className="primary" onClick={save}>ثبت نهایی</button></div></div>
}

function Missions({data,persist,mission,selectedMission,setSelectedMission,goMission,goWell,syncQueue}:any){const[add,setAdd]=useState(false);const saveMission=(m:Mission)=>{persist({...data,missions:[...data.missions,m]});setAdd(false);setSelectedMission(m.id)}
 const removeMission=async(m:Mission,ev?:any)=>{
   ev?.stopPropagation()
   if(!confirmDelete(`مأموریت «${m.title}» حذف شود؟ تمام هزینه‌ها و عکس‌ها/صوت‌های آن از سرور نیز حذف می‌شوند.`))return false
   try{
     await syncQueue.current
     await deleteMissionCloud(m.id)
     const next={...data,missions:data.missions.filter((x:Mission)=>x.id!==m.id)}
     persist(next)
     return true
   }catch(e:any){alert(`حذف مأموریت از سرور ناموفق بود: ${e?.message||'خطای نامشخص'}`);return false}
 }
 if(!selectedMission)return <><div className="page-head"><div><span className="eyebrow">سفرهای کاری</span><h1>مأموریت‌ها</h1><p>غذا و رفت‌وآمد در سطح مأموریت ثبت می‌شوند، نه در سطح چاه.</p></div><button className="primary" onClick={()=>setAdd(true)}><Plus size={18}/> مأموریت جدید</button></div><div className="mission-grid">{data.missions.map((m:Mission)=><div className="mission-card" key={m.id}><button className="mission-card-hit" onClick={()=>goMission(m.id)}><div className="mission-head"><span>{jalaliLabel(m.date)}</span><span className="mission-status">{m.status==='done'?'انجام شده':m.status==='in_progress'?'در حال انجام':m.status==='planned'?'برنامه‌ریزی شده':'لغو شده'}</span></div><h3>{m.title}</h3><p>{data.cities.find((c:City)=>c.id===m.cityId)?.name} • {m.wellIds.length} چاه</p><strong>{money((m.meal?.amount||0)+m.travel.reduce((a,t)=>a+t.amount,0)+m.otherExpenses.reduce((a,t)=>a+t.amount,0))}</strong></button><button className="icon-btn danger mission-card-delete" onClick={e=>{void removeMission(m,e)}}><Trash2 size={15}/></button></div>)}{!data.missions.length&&<Empty icon={<ClipboardList/>} title="هنوز مأموریتی ثبت نشده" text="مأموریت روزانه خود را ثبت کنید."/>}</div>{add&&<Modal title="مأموریت جدید" onClose={()=>setAdd(false)} wide><MissionForm data={data} onSave={saveMission}/></Modal>}</>
 const city=data.cities.find((c:City)=>c.id===mission.cityId);const wells=data.wells.filter((w:Well)=>mission.wellIds.includes(w.id));const total=(mission.meal?.amount||0)+mission.travel.reduce((a:number,t:any)=>a+t.amount,0)+mission.otherExpenses.reduce((a:number,t:any)=>a+t.amount,0);const update=(next:Mission)=>persist({...data,missions:data.missions.map((m:Mission)=>m.id===next.id?next:m)})
 return <MissionDetail data={data} mission={mission} city={city} wells={wells} total={total} update={update} back={()=>setSelectedMission(null)} goWell={goWell} onDelete={async()=>{if(await removeMission(mission))setSelectedMission(null)}}/>
}

function MissionDetail({data,mission,city,wells,total,update,back,goWell,onDelete}:{data:AppData;mission:Mission;city?:City;wells:Well[];total:number;update:(m:Mission)=>void;back:()=>void;goWell:(id:string)=>void;onDelete:()=>void}){
 const[openPanel,setOpenPanel]=useState<'meal'|'travel'|'other'|'wells'|null>(null)
 const updateWells=(wellIds:string[])=>update({...mission,wellIds})
 const saveMeal=(meal:Meal)=>update({...mission,meal})
 const saveTravel=(travel:TravelSegment[])=>update({...mission,travel})
 const saveOther=(otherExpenses:OtherExpense[])=>update({...mission,otherExpenses})
 return <><div className="breadcrumb"><button onClick={back}>مأموریت‌ها</button><ChevronLeft size={16}/><strong>{mission.title}</strong></div><div className="page-head"><div><div className="eyebrow">{jalaliLabel(mission.date)}</div><h1>{mission.title}</h1><p>{city?.name} • {mission.startTime} تا {mission.endTime}</p></div><div className="head-actions"><div className="cost-pill">{money(total)}</div><button className="icon-btn danger" onClick={onDelete}><Trash2 size={17}/></button></div></div>
 <div className="mission-summary-grid">
  <button type="button" className="summary-box" onClick={()=>setOpenPanel('wells')}><Waves size={20}/><span>چاه‌ها</span><strong>{faDigits(wells.length)}</strong></button>
  <button type="button" className="summary-box" onClick={()=>setOpenPanel('meal')}><Coffee size={20}/><span>غذا</span><strong>{money(mission.meal?.amount||0)}</strong></button>
  <button type="button" className="summary-box" onClick={()=>setOpenPanel('travel')}><MapPin size={20}/><span>رفت‌وآمد</span><strong>{money(mission.travel.reduce((a,t)=>a+t.amount,0))}</strong></button>
  <button type="button" className="summary-box" onClick={()=>setOpenPanel('other')}><FileImage size={20}/><span>سایر هزینه‌ها</span><strong>{money(mission.otherExpenses.reduce((a,t)=>a+t.amount,0))}</strong></button>
 </div>
 {openPanel==='wells'&&<Modal title="چاه‌های این مأموریت" onClose={()=>setOpenPanel(null)}><MissionWellsPanel data={data} mission={mission} onSave={ids=>{updateWells(ids);setOpenPanel(null)}} goWell={goWell}/></Modal>}
 {openPanel==='meal'&&<Modal title="غذا" onClose={()=>setOpenPanel(null)}><MealPanel mission={mission} onSave={m=>{saveMeal(m);setOpenPanel(null)}}/></Modal>}
 {openPanel==='travel'&&<Modal title="رفت‌وآمد" onClose={()=>setOpenPanel(null)} wide><TravelPanel mission={mission} onSave={t=>{saveTravel(t);setOpenPanel(null)}}/></Modal>}
 {openPanel==='other'&&<Modal title="سایر هزینه‌ها" onClose={()=>setOpenPanel(null)} wide><OtherPanel mission={mission} onSave={o=>{saveOther(o);setOpenPanel(null)}}/></Modal>}
 </>
}

function MissionWellsPanel({data,mission,onSave,goWell}:{data:AppData;mission:Mission;onSave:(ids:string[])=>void;goWell:(id:string)=>void}){
 const[cityId,setCityId]=useState(mission.cityId||data.cities[0]?.id||'');const[selected,setSelected]=useState<string[]>(mission.wellIds)
 const cityWells=data.wells.filter(w=>w.cityId===cityId)
 return <div className="form"><label>شهر<select value={cityId} onChange={e=>setCityId(e.target.value)}>{data.cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="check-grid">{cityWells.map(w=><label className="check" key={w.id}><input type="checkbox" checked={selected.includes(w.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,w.id]:v.filter(x=>x!==w.id))}/><span>{w.name}</span><small>{w.code}</small></label>)}{!cityWells.length&&<Empty title="چاهی در این شهر ثبت نشده"/>}</div>{selected.length>0&&<div className="selected-wells"><strong className="muted-text">چاه‌های انتخاب‌شده</strong>{data.wells.filter(w=>selected.includes(w.id)).map(w=><button type="button" className="selected-well clickable" key={w.id} onClick={()=>goWell(w.id)}><Waves size={17}/><span>{w.name}</span><small>{w.code}</small><ChevronLeft size={15}/></button>)}</div>}<div className="modal-actions"><button className="primary" onClick={()=>onSave(selected)}>ذخیره چاه‌ها</button></div></div>
}

function MealPanel({mission,onSave}:{mission:Mission;onSave:(m:Meal)=>void}){
 const[meal,setMeal]=useState<Meal>(mission.meal||{id:id(),missionId:mission.id,title:'غذا',amount:0,vendor:'',notes:'',files:[]})
 const addFiles=(files:FileList|null)=>Array.from(files||[]).forEach(file=>{const r=new FileReader();r.onload=()=>setMeal(v=>({...v,files:[...v.files,{id:id(),name:file.name,type:'receipt',dataUrl:String(r.result),createdAt:new Date().toISOString()}]}));r.readAsDataURL(file)})
 return <div className="expense-editor"><label>مبلغ غذا (تومان)<input inputMode="numeric" value={meal.amount||''} onChange={e=>setMeal({...meal,amount:Number(toEnglishDigits(e.target.value))||0})}/></label><MediaUpload title="عکس رسید و فاکتور غذا" items={meal.files} onAdd={addFiles} onRemove={idv=>setMeal(v=>({...v,files:v.files.filter(x=>x.id!==idv)}))}/><div className="modal-actions"><button className="primary" onClick={()=>onSave(meal)}>ذخیره غذا</button></div></div>
}

function TravelPanel({mission,onSave}:{mission:Mission;onSave:(t:TravelSegment[])=>void}){
 const[travel,setTravel]=useState<TravelSegment[]>(mission.travel)
 const addTravel=()=>setTravel(v=>[...v,{id:id(),missionId:mission.id,origin:'',destination:'',vehicle:'Snapp / Taxi',amount:0,dateTime:new Date().toISOString(),notes:'',files:[]}])
 const addFiles=(tid:string,files:FileList|null)=>Array.from(files||[]).forEach(file=>{const r=new FileReader();r.onload=()=>setTravel(v=>v.map(t=>t.id===tid?{...t,files:[...t.files,{id:id(),name:file.name,type:'screenshot',dataUrl:String(r.result),createdAt:new Date().toISOString()}]}:t));r.readAsDataURL(file)})
 return <div className="expense-list"><div className="inline-head"><span/><button className="secondary" onClick={addTravel}><Plus size={16}/> مسیر جدید</button></div>{travel.map((t,i)=><div className="expense-editor" key={t.id}><div className="expense-editor-head"><strong>مسیر {faDigits(i+1)}</strong><button className="icon-btn" onClick={()=>setTravel(v=>v.filter(x=>x.id!==t.id))}>×</button></div><div className="form-grid"><label>مبدأ<input value={t.origin} onChange={e=>setTravel(v=>v.map(x=>x.id===t.id?{...x,origin:e.target.value}:x))}/></label><label>مقصد<input value={t.destination} onChange={e=>setTravel(v=>v.map(x=>x.id===t.id?{...x,destination:e.target.value}:x))}/></label><label>مبلغ (تومان)<input inputMode="numeric" value={t.amount||''} onChange={e=>setTravel(v=>v.map(x=>x.id===t.id?{...x,amount:Number(toEnglishDigits(e.target.value))||0}:x))}/></label></div><MediaUpload title="عکس‌های این مسیر / اسنپ" items={t.files} onAdd={f=>addFiles(t.id,f)} onRemove={idv=>setTravel(v=>v.map(x=>x.id===t.id?{...x,files:x.files.filter(f=>f.id!==idv)}:x))}/></div>)}{!travel.length&&<Empty icon={<MapPin/>} title="هنوز مسیری ثبت نشده"/>}<div className="modal-actions"><button className="primary" onClick={()=>onSave(travel)}>ذخیره رفت‌وآمد</button></div></div>
}

function OtherPanel({mission,onSave}:{mission:Mission;onSave:(o:OtherExpense[])=>void}){
 const[other,setOther]=useState<OtherExpense[]>(mission.otherExpenses)
 const addOther=()=>setOther(v=>[...v,{id:id(),missionId:mission.id,title:'',amount:0,notes:'',files:[]}])
 const addFiles=(oid:string,files:FileList|null)=>Array.from(files||[]).forEach(file=>{const r=new FileReader();r.onload=()=>setOther(v=>v.map(o=>o.id===oid?{...o,files:[...o.files,{id:id(),name:file.name,type:'photo',dataUrl:String(r.result),createdAt:new Date().toISOString()}]}:o));r.readAsDataURL(file)})
 return <div className="expense-list"><div className="inline-head"><span/><button className="secondary" onClick={addOther}><Plus size={16}/> هزینه جدید</button></div>{other.map((o,i)=><div className="expense-editor" key={o.id}><div className="expense-editor-head"><strong>هزینه {faDigits(i+1)}</strong><button className="icon-btn" onClick={()=>setOther(v=>v.filter(x=>x.id!==o.id))}>×</button></div><div className="form-grid"><label>عنوان هزینه<input placeholder="مثلاً خرید ابزار" value={o.title} onChange={e=>setOther(v=>v.map(x=>x.id===o.id?{...x,title:e.target.value}:x))}/></label><label>مبلغ (تومان)<input inputMode="numeric" value={o.amount||''} onChange={e=>setOther(v=>v.map(x=>x.id===o.id?{...x,amount:Number(toEnglishDigits(e.target.value))||0}:x))}/></label></div><MediaUpload title="عکس‌های این هزینه" items={o.files} onAdd={f=>addFiles(o.id,f)} onRemove={idv=>setOther(v=>v.map(x=>x.id===o.id?{...x,files:x.files.filter(f=>f.id!==idv)}:x))}/></div>)}{!other.length&&<Empty title="هزینه دیگری ثبت نشده"/>}<div className="modal-actions"><button className="primary" onClick={()=>onSave(other)}>ذخیره سایر هزینه‌ها</button></div></div>
}

function isImageFile(f:MediaItem){if(f.type==='audio')return false;if(f.dataUrl?.startsWith('data:image'))return true;return Boolean((f.url||f.dataUrl||'').match(/\.(png|jpe?g|gif|webp|bmp)(\?|$)/i))}
function MediaUpload({title,items,onAdd,onRemove}:{title:string;items:MediaItem[];onAdd:(f:FileList|null)=>void;onRemove:(id:string)=>void}){
 const[preview,setPreview]=useState<MediaItem|null>(null)
 return <div className="upload-box mission-upload"><div className="inline-head"><span>{title}</span><label className="secondary file-btn"><Upload size={16}/> انتخاب فایل<input type="file" accept="image/*,application/pdf" multiple hidden onChange={e=>onAdd(e.target.files)}/></label></div><div className="mission-files-grid">{items.map(f=>{const src=f.url||f.dataUrl;const image=isImageFile(f);return <div className="mission-file-card" key={f.id}><button type="button" className="mission-file-preview" onClick={()=>image&&src&&setPreview(f)}>{image&&src?<img src={src} alt={f.name}/>:<FileImage size={26}/>}</button><span className="mission-file-name">{f.name}</span><div className="mission-file-actions"><button type="button" className="icon-btn" title="دانلود" onClick={()=>downloadMedia(f)}><Upload size={14} style={{transform:'rotate(180deg)'}}/></button><button type="button" className="icon-btn danger" title="حذف" onClick={()=>onRemove(f.id)}>×</button></div></div>})}</div>{!items.length&&<div className="muted-text">فایلی اضافه نشده</div>}{preview&&<Modal title={preview.name} onClose={()=>setPreview(null)}><img className="preview-full" src={preview.url||preview.dataUrl} alt={preview.name}/><div className="modal-actions"><button className="primary" onClick={()=>downloadMedia(preview)}>دانلود</button></div></Modal>}</div>
}

function MissionForm({data,onSave}:{data:AppData;onSave:(m:Mission)=>void}){const[date,setDate]=useState(todayISO());const[cityId,setCityId]=useState(data.cities[0]?.id||'');const[title,setTitle]=useState('ماموریت نصب فلومتر');const[start,setStart]=useState(nowTime());const[end,setEnd]=useState('');const[notes,setNotes]=useState('');const[status,setStatus]=useState<Mission['status']>('in_progress');const[selected,setSelected]=useState<string[]>([]);return <div className="form"><div className="form-grid"><label>تاریخ<JalaliDatePicker value={date} onChange={setDate}/></label><label>شهر<select value={cityId} onChange={e=>setCityId(e.target.value)}>{data.cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="full-span">عنوان مأموریت<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label>شروع<input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><label>پایان<input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>وضعیت<select value={status} onChange={e=>setStatus(e.target.value as Mission['status'])}><option value="in_progress">در حال انجام</option><option value="planned">برنامه‌ریزی شده</option><option value="done">انجام شده</option></select></label><label className="full-span">توضیحات<textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label><div className="full-span"><strong>چاه‌های بازدیدشده</strong><div className="check-grid">{data.wells.filter(w=>w.cityId===cityId).map(w=><label className="check" key={w.id}><input type="checkbox" checked={selected.includes(w.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,w.id]:v.filter(x=>x!==w.id))}/><span>{w.name}</span><small>{w.code}</small></label>)}</div></div></div><div className="modal-actions"><button className="primary" onClick={()=>onSave({id:id(),date,cityId,title,notes,startTime:start,endTime:end,status,wellIds:selected,travel:[],otherExpenses:[],files:[],createdAt:new Date().toISOString()})}>ساخت مأموریت</button></div></div>}

function Reports({data}:{data:AppData}) {
  const total=data.missions.reduce((s,m)=>s+(m.meal?.amount||0)+m.travel.reduce((a,t)=>a+t.amount,0)+m.otherExpenses.reduce((a,t)=>a+t.amount,0),0)
  const meal=data.missions.reduce((s,m)=>s+(m.meal?.amount||0),0)
  const travel=data.missions.reduce((s,m)=>s+m.travel.reduce((a,t)=>a+t.amount,0),0)
  const other=total-meal-travel
  const cityName=(id:string)=>data.cities.find(c=>c.id===id)?.name||''
  const snapshotRows=data.snapshots.map(s=>{
    const w=data.wells.find(x=>x.id===s.wellId)
    return {
      'شهر':w?cityName(w.cityId):'','چاه':w?.name||'','کد چاه':w?.code||'',
      'نوع رکورد':s.type==='installation'?'نصب اولیه':'مراجعه مجدد','تاریخ شمسی':jalaliLabel(s.date),'تاریخ میلادی':s.date,
      'Latitude':s.latitude??'','Longitude':s.longitude??'','دقت GPS':s.accuracy??'',
      'جنس لوله':s.pipeMaterial,'قطر لوله':s.pipeDiameter??'','ضخامت لوله':s.pipeThickness??'','ضخامت لاینینگ':s.liningThickness??'',
      'کیفیت سیگنال %':s.signalQuality??'','قدرت سیگنال %':s.signalPower??'','مسیر صدا':s.soundPath||'',
      'سریال ترانسمیتر':s.transmitterSerial,'سریال سنسور':s.sensorSerial,'دبی L/s':s.flow??'','پیگیری مجدد':s.followUp?'بله':'خیر',
      'تعداد عکس':s.photos.length,'تعداد فایل صوتی':s.voices.length,'یادداشت':s.notes
    }
  })
  const wellRows=data.wells.map(w=>{
    const snaps=[...data.snapshots.filter(s=>s.wellId===w.id)].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt))
    const last=snaps[0], install=snaps.find(s=>s.type==='installation')
    return {'شهر':cityName(w.cityId),'نام چاه':w.name,'کد':w.code,'وضعیت':statusLabels[w.status],
      'Latitude':w.location?.latitude??'','Longitude':w.location?.longitude??'','تعداد نصب/بازدید':snaps.length,
      'تاریخ نصب اولیه':install?jalaliLabel(install.date):'','آخرین تاریخ':last?jalaliLabel(last.date):'',
      'کیفیت آخرین سیگنال %':last?.signalQuality??'','قدرت آخرین سیگنال %':last?.signalPower??'','مسیر صدا':last?.soundPath||'',
      'جنس لوله':last?.pipeMaterial||'','قطر لوله':last?.pipeDiameter??'','ضخامت لوله':last?.pipeThickness??'','ضخامت لاینینگ':last?.liningThickness??'',
      'سریال ترانسمیتر':last?.transmitterSerial||'','سریال سنسور':last?.sensorSerial||'','دبی آخرین L/s':last?.flow??'',
      'نیاز به پیگیری':last?.followUp?'بله':'خیر','یادداشت آخرین رکورد':last?.notes||''
    }
  })
  const missionRows=data.missions.map(m=>{
    const a=m.meal?.amount||0,b=m.travel.reduce((s,t)=>s+t.amount,0),c=m.otherExpenses.reduce((s,t)=>s+t.amount,0)
    return {'تاریخ شمسی':jalaliLabel(m.date),'تاریخ میلادی':m.date,'عنوان مأموریت':m.title,'شهر':cityName(m.cityId),'شروع':m.startTime,'پایان':m.endTime,'وضعیت':m.status,
      'تعداد چاه':m.wellIds.length,'چاه‌ها':m.wellIds.map(id=>data.wells.find(w=>w.id===id)?.name||id).join('، '),'غذا':a,'رفت‌وآمد':b,'سایر':c,'مجموع':a+b+c,
      'تعداد فایل مأموریت':m.files.length,'یادداشت':m.notes}
  })
  const travelRows=data.missions.flatMap(m=>m.travel.map((t,i)=>({'تاریخ مأموریت':jalaliLabel(m.date),'مأموریت':m.title,'شهر':cityName(m.cityId),'شماره مسیر':i+1,'مبدأ':t.origin,'مقصد':t.destination,'وسیله':t.vehicle,'مبلغ':t.amount,'زمان':t.dateTime,'تعداد فایل':t.files.length,'یادداشت':t.notes})))
  const mealRows=data.missions.filter(m=>m.meal).map(m=>{const x=m.meal!;return {'تاریخ مأموریت':jalaliLabel(m.date),'مأموریت':m.title,'شهر':cityName(m.cityId),'عنوان':x.title,'فروشنده':x.vendor,'مبلغ':x.amount,'تعداد رسید/فاکتور':x.files.length,'یادداشت':x.notes}})
  const otherRows=data.missions.flatMap(m=>m.otherExpenses.map((x,i)=>({'تاریخ مأموریت':jalaliLabel(m.date),'مأموریت':m.title,'شهر':cityName(m.cityId),'شماره':i+1,'عنوان هزینه':x.title,'مبلغ':x.amount,'تعداد فایل':x.files.length,'یادداشت':x.notes})))
  const mediaRows=[
    ...data.snapshots.flatMap(s=>[...s.photos,...s.voices].map(f=>{const w=data.wells.find(x=>x.id===s.wellId);return {'دسته':s.type==='installation'?'نصب اولیه چاه':'مراجعه مجدد چاه','شهر':w?cityName(w.cityId):'','چاه':w?.name||'','تاریخ':jalaliLabel(s.date),'نوع فایل':f.type==='audio'?'صوت':'عکس','نام فایل':f.name,'آدرس فایل':f.url||f.storagePath||''}})),
    ...data.missions.flatMap(m=>[
      ...m.files.map(f=>({'دسته':'فایل مأموریت','شهر':cityName(m.cityId),'چاه':'','تاریخ':jalaliLabel(m.date),'نوع فایل':f.type,'نام فایل':f.name,'آدرس فایل':f.url||f.storagePath||''})),
      ...(m.meal?.files||[]).map(f=>({'دسته':'رسید غذا','شهر':cityName(m.cityId),'چاه':'','تاریخ':jalaliLabel(m.date),'نوع فایل':f.type,'نام فایل':f.name,'آدرس فایل':f.url||f.storagePath||''})),
      ...m.travel.flatMap(t=>t.files.map(f=>({'دسته':'فایل رفت‌وآمد','شهر':cityName(m.cityId),'چاه':'','تاریخ':jalaliLabel(m.date),'نوع فایل':f.type,'نام فایل':f.name,'آدرس فایل':f.url||f.storagePath||''}))),
      ...m.otherExpenses.flatMap(o=>o.files.map(f=>({'دسته':'فایل سایر هزینه','شهر':cityName(m.cityId),'چاه':'','تاریخ':jalaliLabel(m.date),'نوع فایل':f.type,'نام فایل':f.name,'آدرس فایل':f.url||f.storagePath||''})))
    ])
  ]
  const summaryRows=[['شاخص','مقدار'],['تعداد شهر',data.cities.length],['تعداد چاه',data.wells.length],['تعداد نصب اولیه',data.snapshots.filter(s=>s.type==='installation').length],['تعداد مراجعه مجدد',data.snapshots.filter(s=>s.type==='visit').length],['تعداد مأموریت',data.missions.length],['کل هزینه',total],['هزینه غذا',meal],['هزینه رفت‌وآمد',travel],['سایر هزینه‌ها',other]]
  const sheet=(rows:any[])=>{
    const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{'اطلاعات':'رکوردی وجود ندارد'}])
    ws['!cols']=Object.keys(rows[0]||{'اطلاعات':''}).map(k=>({wch:Math.min(45,Math.max(12,k.length+4))}))
    ws['!views']=[{RTL:true}]
    ws['!autofilter']={ref:ws['!ref']||'A1:A1'}
    return ws
  }
  const exportExcel=()=>{
    const wb=XLSX.utils.book_new()
    const summary=XLSX.utils.aoa_to_sheet(summaryRows);summary['!cols']=[{wch:28},{wch:22}];summary['!views']=[{RTL:true}]
    XLSX.utils.book_append_sheet(wb,summary,'خلاصه')
    ;[['چاه‌ها',wellRows],['نصب‌ها و بازدیدها',snapshotRows],['مأموریت‌ها',missionRows],['رفت‌وآمد',travelRows],['غذا',mealRows],['سایر هزینه‌ها',otherRows],['فایل‌ها',mediaRows]].forEach(([name,rows])=>XLSX.utils.book_append_sheet(wb,sheet(rows as any[]),name as string))
    XLSX.writeFile(wb,`گزارش-فلومتر-${todayISO()}.xlsx`)
  }
  return <>
    <div className="page-head"><div><span className="eyebrow">گزارش و جمع‌بندی</span><h1>گزارش‌ها</h1><p>گزارش Excel چندبرگه و جزئیات کامل نصب‌ها و هزینه‌ها</p></div><div className="head-actions"><button className="primary" onClick={exportExcel}>خروجی کامل Excel (.xlsx)</button></div></div>
    <div className="stats-grid"><div className="stat"><span>کل هزینه</span><strong>{money(total)}</strong></div><div className="stat"><span>غذا</span><strong>{money(meal)}</strong></div><div className="stat"><span>رفت‌وآمد</span><strong>{money(travel)}</strong></div><div className="stat"><span>سایر</span><strong>{money(other)}</strong></div></div>
    <Section title="آخرین مأموریت‌ها"><div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>عنوان</th><th>شهر</th><th>چاه‌ها</th><th>هزینه</th></tr></thead><tbody>{data.missions.map(m=><tr key={m.id}><td>{jalaliLabel(m.date)}</td><td>{m.title}</td><td>{cityName(m.cityId)}</td><td>{m.wellIds.length}</td><td>{money((m.meal?.amount||0)+m.travel.reduce((a,t)=>a+t.amount,0)+m.otherExpenses.reduce((a,t)=>a+t.amount,0))}</td></tr>)}</tbody></table></div></Section>
  </>
}

function SettingsPage({data,persist}:{data:AppData;persist:(d:AppData)=>void}){
  const[saving,setSaving]=useState(false)
  const[message,setMessage]=useState('')
  const saveLocalToServer=async()=>{
    if(saving)return
    setSaving(true);setMessage('')
    try{
      const local=loadData()
      await syncCloudData(local)
      const fresh=await loadCloudData(local.theme)
      saveData(fresh)
      persist(fresh)
      setMessage(`✓ ذخیره و تأیید شد: ${faDigits(fresh.cities.length)} شهر، ${faDigits(fresh.wells.length)} چاه، ${faDigits(fresh.snapshots.length)} نصب/بازدید و ${faDigits(fresh.missions.length)} مأموریت در سرور ثبت است.`)
    }catch(e:any){
      setMessage(`✕ ذخیره‌سازی ناموفق بود: ${e?.message||'خطای نامشخص'}`)
    }finally{setSaving(false)}
  }
  return <><div className="page-head"><div><span className="eyebrow">تنظیمات</span><h1>تنظیمات</h1><p>نسخه عملیاتی برای استفاده میدانی.</p></div></div>
    <Section title="ذخیره‌سازی داده‌ها">
      <div className="notice">اطلاعات در Supabase ذخیره می‌شوند و فایل‌ها در Storage قرار می‌گیرند. Login و RLS مطابق طراحی فعلی استفاده نمی‌شوند.</div>
      <div className="settings-sync-card">
        <div><strong>ذخیره‌سازی و تأیید روی سرور</strong><p>داده‌های ذخیره‌شده روی این گوشی را به Supabase می‌فرستد، سپس دوباره از سرور می‌خواند و نتیجه را تأیید می‌کند.</p></div>
        <button className="primary" disabled={saving} onClick={saveLocalToServer}><CheckCircle2 size={17}/>{saving?'در حال ذخیره‌سازی…':'ذخیره‌سازی داده‌های محلی'}</button>
      </div>
      {message&&<div className={`sync-result ${message.startsWith('✓')?'success':'error'}`}>{message}</div>}
      <button className="danger-btn" onClick={()=>{localStorage.removeItem('flowmeter-app-v2');location.reload()}}><Trash2 size={17}/> پاک کردن داده‌های محلی این دستگاه</button>
    </Section></>
}
