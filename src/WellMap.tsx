import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { City, Well } from './types'

const NESHAN_KEY = (import.meta as any).env?.VITE_NESHAN_API_KEY || ''
let neshanPromise: Promise<any> | null = null
function loadNeshan() {
  if ((window as any).L?.__neshanReady) return Promise.resolve((window as any).L)
  if (neshanPromise) return neshanPromise
  neshanPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel='stylesheet'; css.href='https://static.neshan.org/sdk/leaflet/1.4.0/leaflet.css'; document.head.appendChild(css)
    const script = document.createElement('script'); script.src='https://static.neshan.org/sdk/leaflet/1.4.0/leaflet.js'; script.async=true
    script.onload=()=>{const nL=(window as any).L; if(!nL) reject(new Error('Neshan SDK loaded but Leaflet is unavailable')); else {nL.__neshanReady=true; resolve(nL)}}
    script.onerror=()=>reject(new Error('بارگذاری نقشه نشان ناموفق بود'))
    document.head.appendChild(script)
  })
  return neshanPromise
}

function clusterPoints(points:{well:Well;city?:City}[], zoom:number) {
  const threshold=Math.max(18, 90-zoom*5)
  const out:any[]=[]
  for(const p of points){
    let target=out.find(g=>Math.hypot((g.lat-p.well.location.latitude)*100, (g.lng-p.well.location.longitude)*80)<threshold/100)
    if(target) target.items.push(p); else out.push({lat:p.well.location.latitude,lng:p.well.location.longitude,items:[p]})
  }
  return out
}

export default function WellMap({wells,cities}:{wells:Well[];cities:City[]}) {
  const ref=useRef<HTMLDivElement|null>(null); const mapRef=useRef<any>(null); const layerRef=useRef<any>(null)
  const points=useMemo(()=>wells.filter(w=>w.location).map(w=>({well:w,city:cities.find(c=>c.id===w.cityId)})),[wells,cities])
  useEffect(()=>{
    let disposed=false
    if(!ref.current || !points.length) return
    const fallback=()=>{
      if(disposed||mapRef.current)return
      const map=L.map(ref.current!).setView([points[0].well.location!.latitude,points[0].well.location!.longitude],13)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map)
      const group=L.featureGroup(points.map(p=>L.marker([p.well.location!.latitude,p.well.location!.longitude]).bindTooltip(p.well.name,{permanent:true,direction:'top',offset:[0,-8]}))).addTo(map); if(points.length>1)map.fitBounds(group.getBounds().pad(.15)); mapRef.current=map
    }
    if(!NESHAN_KEY){fallback();return()=>{disposed=true;mapRef.current?.remove();mapRef.current=null}}
    loadNeshan().then((NL:any)=>{
      if(disposed||!ref.current)return
      const map=new NL.Map(ref.current,{key:NESHAN_KEY,maptype:'dreamy',center:[points[0].well.location!.latitude,points[0].well.location!.longitude],zoom:13,traffic:false})
      const render=()=>{
        layerRef.current?.clearLayers?.(); const layer=NL.layerGroup(); const groups=clusterPoints(points,map.getZoom())
        for(const g of groups){
          if(g.items.length===1){const p=g.items[0]; NL.marker([g.lat,g.lng]).addTo(layer).bindTooltip(p.well.name,{permanent:true,direction:'top',offset:[0,-10]})}
          else NL.marker([g.lat,g.lng],{icon:NL.divIcon({className:'well-cluster-icon',html:`<span>${g.items.length}</span>`,iconSize:[40,40],iconAnchor:[20,20]})}).addTo(layer).bindTooltip(`${g.items.length} چاه`,{direction:'top'})
        }
        layer.addTo(map); layerRef.current=layer
      }
      render(); map.on('zoomend',render); map.on('moveend',render); mapRef.current=map
      if(points.length>1){const bounds=NL.latLngBounds(points.map(p=>[p.well.location!.latitude,p.well.location!.longitude]));map.fitBounds(bounds.pad(.15))}
    }).catch(fallback)
    return()=>{disposed=true; try{mapRef.current?.remove?.()}catch{} mapRef.current=null;layerRef.current=null}
  },[points])
  if(!points.length)return <div className="map-empty">هیچ چاهی با موقعیت جغرافیایی ثبت نشده است.</div>
  return <div ref={ref} className="map wells-map" />
}
