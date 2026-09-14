import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props { lat?: number; lng?: number; onChange: (lat:number,lng:number)=>void; editable?: boolean }

const markerIcon = L.divIcon({
  className: 'flowmeter-map-marker',
  html: '<div class="flowmeter-marker-pin"><span></span></div>',
  iconSize: [28, 36],
  iconAnchor: [14, 36],
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
    const map=L.map(ref.current,{zoomControl:true,attributionControl:true,dragging:true}).setView(initial,has?16:5)
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
