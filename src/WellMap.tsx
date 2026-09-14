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
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://static.neshan.org/sdk/leaflet/1.4.0/leaflet.css'
    document.head.appendChild(css)

    const script = document.createElement('script')
    script.src = 'https://static.neshan.org/sdk/leaflet/1.4.0/leaflet.js'
    script.async = true
    script.onload = () => {
      const nL = (window as any).L
      if (!nL) reject(new Error('Neshan SDK loaded but Leaflet is unavailable'))
      else {
        nL.__neshanReady = true
        resolve(nL)
      }
    }
    script.onerror = () => reject(new Error('بارگذاری نقشه نشان ناموفق بود'))
    document.head.appendChild(script)
  })
  return neshanPromise
}

type Point = { well: Well; city?: City; lat: number; lng: number }
type Cluster = { lat: number; lng: number; items: Point[] }

function validPoint(w: Well): w is Well & { location: { latitude: number; longitude: number } } {
  const lat = w.location?.latitude
  const lng = w.location?.longitude
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

/**
 * Clusters by actual screen distance, not by latitude/longitude distance.
 * This makes clustering behave correctly at every zoom level and latitude.
 */
function clusterByPixels(map: any, points: Point[], radiusPx = 70): Cluster[] {
  const clusters: Cluster[] = []

  for (const point of points) {
    const projected = map.latLngToLayerPoint([point.lat, point.lng])
    let found: Cluster | undefined

    for (const cluster of clusters) {
      const center = map.latLngToLayerPoint([cluster.lat, cluster.lng])
      if (projected.distanceTo(center) <= radiusPx) {
        found = cluster
        break
      }
    }

    if (found) {
      found.items.push(point)
      found.lat = found.items.reduce((sum, p) => sum + p.lat, 0) / found.items.length
      found.lng = found.items.reduce((sum, p) => sum + p.lng, 0) / found.items.length
    } else {
      clusters.push({ lat: point.lat, lng: point.lng, items: [point] })
    }
  }

  return clusters
}

function wellIcon(Lib: any, name: string) {
  return Lib.divIcon({
    className: 'well-name-marker',
    html: `<span class="well-name-marker-label">${escapeHtml(name)}</span><span class="well-name-marker-pin"></span>`,
    iconSize: [190, 48],
    iconAnchor: [95, 44],
  })
}

function clusterIcon(Lib: any, count: number) {
  return Lib.divIcon({
    className: 'well-cluster-marker',
    html: `<span class="well-cluster-count">${count}</span><span class="well-cluster-pin"></span>`,
    iconSize: [74, 66],
    iconAnchor: [37, 60],
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char] || char))
}

function addClusterLayer(Lib: any, map: any, points: Point[], layerRef: { current: any }) {
  if (layerRef.current) {
    try { map.removeLayer(layerRef.current) } catch {}
    layerRef.current = null
  }

  const layer = Lib.layerGroup()
  const clusters = clusterByPixels(map, points, 70)

  for (const cluster of clusters) {
    if (cluster.items.length === 1) {
      const p = cluster.items[0]
      Lib.marker([p.lat, p.lng], { icon: wellIcon(Lib, p.well.name), keyboard: false })
        .bindTooltip(p.well.name, { direction: 'top', offset: [0, -38], opacity: 0.95 })
        .addTo(layer)
    } else {
      Lib.marker([cluster.lat, cluster.lng], { icon: clusterIcon(Lib, cluster.items.length), keyboard: false })
        .bindTooltip(`${cluster.items.length} چاه`, { direction: 'top', offset: [0, -48], opacity: 0.95 })
        .addTo(layer)
    }
  }

  layer.addTo(map)
  layerRef.current = layer
}

export default function WellMap({ wells, cities }: { wells: Well[]; cities: City[] }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const points = useMemo<Point[]>(() => wells
    .filter(validPoint)
    .map(w => ({
      well: w,
      city: cities.find(c => c.id === w.cityId),
      lat: w.location.latitude,
      lng: w.location.longitude,
    })), [wells, cities])

  useEffect(() => {
    let disposed = false
    if (!ref.current || !points.length) return

    const cleanup = () => {
      try { mapRef.current?.remove?.() } catch {}
      mapRef.current = null
      layerRef.current = null
    }

    const setup = (Lib: any, useNeshan: boolean) => {
      if (disposed || !ref.current) return

      const center: [number, number] = [points[0].lat, points[0].lng]
      const map = useNeshan
        ? new Lib.Map(ref.current, { key: NESHAN_KEY, maptype: 'dreamy', poi: true, traffic: false, center, zoom: 13 })
        : Lib.map(ref.current, { zoomControl: true, attributionControl: true }).setView(center, 13)

      if (!useNeshan) {
        Lib.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors', maxZoom: 19
        }).addTo(map)
      }

      mapRef.current = map

      const render = () => {
        if (disposed) return
        addClusterLayer(Lib, map, points, layerRef)
      }

      render()
      map.on('zoomend', render)
      map.on('moveend', render)

      if (points.length > 1) {
        const bounds = Lib.latLngBounds(points.map(p => [p.lat, p.lng]))
        map.fitBounds(bounds.pad(0.12), { maxZoom: 15 })
      }

      window.setTimeout(() => map.invalidateSize?.(), 120)
      return () => {
        map.off('zoomend', render)
        map.off('moveend', render)
      }
    }

    if (!NESHAN_KEY) {
      const off = setup(L, false)
      return () => { disposed = true; off?.(); cleanup() }
    }

    let off: (() => void) | undefined
    loadNeshan().then((NL: any) => {
      if (disposed) return
      off = setup(NL, true)
    }).catch(() => {
      if (disposed) return
      off = setup(L, false)
    })

    return () => {
      disposed = true
      off?.()
      cleanup()
    }
  }, [points])

  if (!points.length) return <div className="map-empty">هیچ چاهی با موقعیت جغرافیایی معتبر ثبت نشده است.</div>
  return <div ref={ref} className="map wells-map" />
}
