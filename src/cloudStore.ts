import { supabase, STORAGE_BUCKET } from './supabase'
import { AppData, City, InstallSnapshot, MediaItem, Mission, OtherExpense, TravelSegment, Well } from './types'

const toNum = (v: any) => v === null || v === undefined || v === '' ? undefined : Number(v)

function mediaUrl(path: string) {
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function loadCloudData(theme: AppData['theme'] = 'light'): Promise<AppData> {
  const [citiesQ, wellsQ, snapshotsQ, snapshotMediaQ, missionsQ, missionWellsQ, mealsQ, travelQ, otherQ, missionMediaQ] = await Promise.all([
    supabase.from('cities').select('*').order('created_at'),
    supabase.from('wells').select('*').order('created_at'),
    supabase.from('snapshots').select('*').order('visit_date', { ascending: false }),
    supabase.from('snapshot_media').select('*').order('created_at'),
    supabase.from('missions').select('*').order('date', { ascending: false }),
    supabase.from('mission_wells').select('*'),
    supabase.from('meal_expenses').select('*'),
    supabase.from('travel_segments').select('*').order('date_time'),
    supabase.from('other_expenses').select('*').order('created_at'),
    supabase.from('mission_media').select('*').order('created_at'),
  ])

  for (const q of [citiesQ, wellsQ, snapshotsQ, snapshotMediaQ, missionsQ, missionWellsQ, mealsQ, travelQ, otherQ, missionMediaQ]) {
    if (q.error) throw q.error
  }

  const cities: City[] = (citiesQ.data || []).map((r: any) => ({ id: r.id, name: r.name, description: r.description || '', createdAt: r.created_at }))
  const wells: Well[] = (wellsQ.data || []).map((r: any) => ({
    id: r.id, cityId: r.city_id, name: r.name, code: r.code || '', status: r.status,
    createdAt: r.created_at,
    location: r.latitude != null && r.longitude != null ? { latitude: Number(r.latitude), longitude: Number(r.longitude), accuracy: toNum(r.accuracy) } : undefined,
  }))

  const sm = (snapshotMediaQ.data || []) as any[]
  const snapshotMedia = (snapshotId: string, type: 'photo' | 'audio'): MediaItem[] => sm.filter(x => x.snapshot_id === snapshotId && x.media_type === type).map(x => ({
    id: x.id, name: x.original_name || x.storage_path.split('/').pop() || 'file', type, url: mediaUrl(x.storage_path), createdAt: x.created_at, duration: x.duration_seconds || undefined, storagePath: x.storage_path,
  }))

  const snapshots: InstallSnapshot[] = (snapshotsQ.data || []).map((r: any) => ({
    id: r.id, type: r.type, wellId: r.well_id, date: r.visit_date, createdAt: r.created_at,
    latitude: toNum(r.latitude), longitude: toNum(r.longitude), accuracy: toNum(r.accuracy),
    pipeMaterial: r.pipe_material || '', pipeDiameter: toNum(r.pipe_diameter), pipeThickness: toNum(r.pipe_thickness), liningThickness: toNum(r.lining_thickness),
    signalQuality: toNum(r.signal_quality), signalPower: toNum(r.signal_power), soundPath: r.sound_path || undefined,
    transmitterSerial: r.transmitter_serial || '', sensorSerial: r.sensor_serial || '', flow: toNum(r.flow_lps), notes: r.notes || '',
    photos: snapshotMedia(r.id, 'photo'), voices: snapshotMedia(r.id, 'audio'),
  }))

  const missionMedia = (missionId: string, category: string, type: MediaItem['type']): MediaItem[] => (missionMediaQ.data || []).filter((x: any) => x.mission_id === missionId && x.category === category && x.media_type === type).map((x: any) => ({
    id: x.id, name: x.original_name || x.storage_path.split('/').pop() || 'file', type, url: mediaUrl(x.storage_path), createdAt: x.created_at, storagePath: x.storage_path,
  }))

  const missionWells = missionWellsQ.data || []
  const missions: Mission[] = (missionsQ.data || []).map((r: any) => {
    const mealRow: any = (mealsQ.data || []).find((x: any) => x.mission_id === r.id)
    const meal = mealRow ? { id: mealRow.id, missionId: r.id, title: mealRow.title || 'غذا', amount: Number(mealRow.amount || 0), vendor: mealRow.vendor || '', notes: mealRow.notes || '', files: [
      ...missionMedia(r.id, 'meal', 'photo'), ...missionMedia(r.id, 'meal', 'receipt'), ...missionMedia(r.id, 'meal', 'invoice'), ...missionMedia(r.id, 'meal', 'screenshot'),
    ] } : undefined
    const travel: TravelSegment[] = (travelQ.data || []).filter((x: any) => x.mission_id === r.id).map((x: any) => ({
      id: x.id, missionId: r.id, origin: x.origin, destination: x.destination, vehicle: x.vehicle || '', amount: Number(x.amount || 0), dateTime: x.date_time || '', notes: x.notes || '', files: [
        ...missionMedia(r.id, 'travel', 'photo'), ...missionMedia(r.id, 'travel', 'receipt'), ...missionMedia(r.id, 'travel', 'screenshot'),
      ],
    }))
    const otherExpenses: OtherExpense[] = (otherQ.data || []).filter((x: any) => x.mission_id === r.id).map((x: any) => ({ id: x.id, missionId: r.id, title: x.title, amount: Number(x.amount || 0), notes: x.notes || '', files: [] }))
    return {
      id: r.id, date: r.date, cityId: r.city_id, title: r.title, notes: r.notes || '', startTime: r.start_time || '', endTime: r.end_time || '', status: r.status,
      wellIds: missionWells.filter((x: any) => x.mission_id === r.id).map((x: any) => x.well_id), meal, travel, otherExpenses,
      files: missionMedia(r.id, 'mission', 'photo'), createdAt: r.created_at,
    }
  })

  return { cities, wells, snapshots, missions, theme }
}

function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream'
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}

async function uploadMedia(item: MediaItem, folder: string) {
  if (!item.dataUrl) return item
  const ext = item.type === 'audio' ? 'webm' : (item.name.split('.').pop() || 'jpg')
  const path = `${folder}/${item.id}.${ext}`
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, dataUrlToBlob(item.dataUrl), { upsert: true, contentType: item.type === 'audio' ? 'audio/webm' : undefined })
  if (error) throw error
  return { ...item, dataUrl: undefined, url: mediaUrl(path), storagePath: path }
}

export async function syncCloudData(data: AppData) {
  // Base records. This app intentionally has no login/RLS layer, so the public client can write these tables.
  if (data.cities.length) {
    const { error } = await supabase.from('cities').upsert(data.cities.map(c => ({ id: c.id, name: c.name, description: c.description, created_at: c.createdAt })))
    if (error) throw error
  }
  if (data.wells.length) {
    const { error } = await supabase.from('wells').upsert(data.wells.map(w => ({ id: w.id, city_id: w.cityId, name: w.name, code: w.code, status: w.status, latitude: w.location?.latitude ?? null, longitude: w.location?.longitude ?? null, accuracy: w.location?.accuracy ?? null, created_at: w.createdAt })))
    if (error) throw error
  }
  if (data.snapshots.length) {
    const { error } = await supabase.from('snapshots').upsert(data.snapshots.map(s => ({ id: s.id, well_id: s.wellId, type: s.type, visit_date: s.date, latitude: s.latitude ?? null, longitude: s.longitude ?? null, accuracy: s.accuracy ?? null, pipe_material: s.pipeMaterial, pipe_diameter: s.pipeDiameter ?? null, pipe_thickness: s.pipeThickness ?? null, lining_thickness: s.liningThickness ?? null, signal_quality: s.signalQuality ?? null, signal_power: s.signalPower ?? null, sound_path: s.soundPath ?? null, transmitter_serial: s.transmitterSerial, sensor_serial: s.sensorSerial, flow_lps: s.flow ?? null, notes: s.notes, created_at: s.createdAt })))
    if (error) throw error
  }

  for (const s of data.snapshots) {
    for (const item of [...s.photos, ...s.voices]) {
      if (item.dataUrl) {
        const uploaded = await uploadMedia(item, `wells/${s.wellId}/snapshots/${s.id}`)
        const { error } = await supabase.from('snapshot_media').upsert({ id: uploaded.id, snapshot_id: s.id, media_type: uploaded.type, storage_path: uploaded.storagePath, original_name: uploaded.name, duration_seconds: uploaded.duration || null, created_at: uploaded.createdAt })
        if (error) throw error
      }
    }
  }

  if (data.missions.length) {
    const { error } = await supabase.from('missions').upsert(data.missions.map(m => ({ id: m.id, date: m.date, city_id: m.cityId || null, title: m.title, notes: m.notes, start_time: m.startTime || null, end_time: m.endTime || null, status: m.status, created_at: m.createdAt })))
    if (error) throw error
  }

  for (const m of data.missions) {
    if (m.wellIds.length) {
      const { error } = await supabase.from('mission_wells').upsert(m.wellIds.map(wellId => ({ mission_id: m.id, well_id: wellId })))
      if (error) throw error
    }
    if (m.meal) {
      const { error } = await supabase.from('meal_expenses').upsert({ id: m.meal.id, mission_id: m.id, title: m.meal.title, amount: m.meal.amount, vendor: m.meal.vendor, notes: m.meal.notes, created_at: new Date().toISOString() })
      if (error) throw error
    }
    for (const t of m.travel) {
      const { error } = await supabase.from('travel_segments').upsert({ id: t.id, mission_id: m.id, origin: t.origin, destination: t.destination, vehicle: t.vehicle, amount: t.amount, date_time: t.dateTime || null, notes: t.notes, created_at: new Date().toISOString() })
      if (error) throw error
    }
    for (const o of m.otherExpenses) {
      const { error } = await supabase.from('other_expenses').upsert({ id: o.id, mission_id: m.id, title: o.title, amount: o.amount, notes: o.notes, created_at: new Date().toISOString() })
      if (error) throw error
    }
  }
}
