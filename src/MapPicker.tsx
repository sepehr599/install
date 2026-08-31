import { useEffect, useRef } from 'react'
import L from 'leaflet'

interface Props { lat?: number; lng?: number; onChange: (lat: number, lng: number) => void }

export default function MapPicker({ lat, lng, onChange }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const initial: L.LatLngExpression = [lat ?? 32.65, lng ?? 51.67]
    const map = L.map(ref.current).setView(initial, lat && lng ? 15 : 5)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
    const marker = L.marker(initial, { draggable: true }).addTo(map)
    marker.on('dragend', () => { const p = marker.getLatLng(); onChange(p.lat, p.lng) })
    map.on('click', (e) => { marker.setLatLng(e.latlng); onChange(e.latlng.lat, e.latlng.lng) })
    mapRef.current = map
    markerRef.current = marker
    return () => { map.remove(); mapRef.current = null; markerRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current || lat == null || lng == null) return
    mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 15))
    markerRef.current?.setLatLng([lat, lng])
  }, [lat, lng])

  return <div ref={ref} className="map" />
}
