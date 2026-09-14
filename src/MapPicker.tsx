import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props { lat?: number; lng?: number; onChange: (lat:number,lng:number)=>void; editable?: boolean }

// Inline SVG avoids Leaflet's default marker.png lookup (which can show a
// broken-image icon on GitHub Pages/mobile browsers).
const markerIcon = L.divIcon({
  className: 'flowmeter-map-marker',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44" aria-hidden="true">
    <path d="M18 42S4 28.7 4 17.5C4 9.8 10.3 3.5 18 3.5s14 6.3 14 14C32 28.7 18 42 18 42Z" fill="#147968" stroke="#fff" stroke-width="2.5"/>
    <circle cx="18" cy="17.5" r="5.5" fill="#fff"/>
  </svg>`,
  iconSize: [36, 44],
  iconAnchor: [18, 44],
})

export default function MapPicker({lat,lng,onChange,editable=true}:Props){
  const ref=useRef<HTMLDivElement|null>(null)
  const mapRef=useRef<L.Map|null>(null)
  const markerRef=useRef<L.Marker|null>(null)
  const onChangeRef=useRef(onChange)
  const editableRef=useRef(editable)
  onChangeRef.current=onChange
  editableRef.current=editable

  useEffect(()=>{
    if(!ref.current || mapRef.current) return
    const has=lat!=null && lng!=null
    const initial:L.LatLngExpression=[lat??32.65,lng??51.67]
    const map=L.map(ref.current,{zoomControl:true,attributionControl:true,dragging:true,scrollWheelZoom:true}).setView(initial,has?16:5)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map)

    const makeMarker=(position:L.LatLngExpression, draggable:boolean)=>{
      const marker=L.marker(position,{draggable,icon:markerIcon}).addTo(map)
      marker.on('dragend',()=>{
        if(!editableRef.current) return
        const p=marker.getLatLng()
        onChangeRef.current(p.lat,p.lng)
      })
      markerRef.current=marker
      return marker
    }

    if(has) makeMarker(initial,editableRef.current)

    const click=(e:L.LeafletMouseEvent)=>{
      if(!editableRef.current) return
      const marker=markerRef.current || makeMarker(e.latlng,true)
      marker.setLatLng(e.latlng)
      onChangeRef.current(e.latlng.lat,e.latlng.lng)
    }
    if(editableRef.current) map.on('click',click)

    mapRef.current=map
    const timer=window.setTimeout(()=>map.invalidateSize(),80)
    return()=>{
      window.clearTimeout(timer)
      map.off('click',click)
      if(markerRef.current){markerRef.current.off();markerRef.current.remove();markerRef.current=null}
      map.eachLayer(layer=>map.removeLayer(layer))
      map.remove()
      mapRef.current=null
    }
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(!map || lat==null || lng==null) return
    const p:[number,number]=[lat,lng]
    if(markerRef.current) markerRef.current.setLatLng(p)
    else if(editableRef.current){
      const marker=L.marker(p,{draggable:true,icon:markerIcon}).addTo(map)
      marker.on('dragend',()=>{
        if(!editableRef.current) return
        const x=marker.getLatLng();onChangeRef.current(x.lat,x.lng)
      })
      markerRef.current=marker
    }
    if(map.getZoom()<14) map.setView(p,16)
    window.setTimeout(()=>map.invalidateSize(),40)
  },[lat,lng])

  return <div ref={ref} className="map" />
}
