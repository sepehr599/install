import { useEffect, useRef } from 'react'
import L from 'leaflet'

interface Props { lat?: number; lng?: number; onChange: (lat:number,lng:number)=>void; editable?: boolean }

export default function MapPicker({lat,lng,onChange,editable=true}:Props){
 const ref=useRef<HTMLDivElement|null>(null); const mapRef=useRef<L.Map|null>(null); const markerRef=useRef<L.Marker|null>(null); const onChangeRef=useRef(onChange); const editableRef=useRef(editable); onChangeRef.current=onChange; editableRef.current=editable
 useEffect(()=>{if(!ref.current||mapRef.current)return; const has=lat!=null&&lng!=null; const initial:L.LatLngExpression=[lat??32.65,lng??51.67]; const map=L.map(ref.current,{zoomControl:true}).setView(initial,has?16:5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map); let marker:L.Marker|null=null; if(has){marker=L.marker(initial,{draggable:editable}).addTo(map);marker.on('dragend',()=>{if(!editableRef.current||!marker)return;const p=marker.getLatLng();onChangeRef.current(p.lat,p.lng)})} markerRef.current=marker; const click=(e:L.LeafletMouseEvent)=>{if(!editableRef.current)return;if(!marker){marker=L.marker(e.latlng,{draggable:true}).addTo(map);marker.on('dragend',()=>{if(!editableRef.current||!marker)return;const p=marker.getLatLng();onChangeRef.current(p.lat,p.lng)}) ;markerRef.current=marker}else marker.setLatLng(e.latlng);onChangeRef.current(e.latlng.lat,e.latlng.lng)}; map.on('click',click); mapRef.current=map; setTimeout(()=>map.invalidateSize(),50); return()=>{map.off('click',click);map.remove();mapRef.current=null;markerRef.current=null}},[])
 useEffect(()=>{const map=mapRef.current;if(!map||lat==null||lng==null)return;const p:[number,number]=[lat,lng];if(markerRef.current)markerRef.current.setLatLng(p);else if(editableRef.current){markerRef.current=L.marker(p,{draggable:true}).addTo(map);markerRef.current.on('dragend',()=>{const x=markerRef.current?.getLatLng();if(x&&editableRef.current)onChangeRef.current(x.lat,x.lng)})}map.setView(p,Math.max(map.getZoom(),16));setTimeout(()=>map.invalidateSize(),30)},[lat,lng])
 return <div ref={ref} className="map" />
}
