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
    transmitterSerial: r.transmitter_serial || '', sensorSerial: r.sensor_serial || '', flow: toNum(r.flow_lps), notes: r.notes || '', followUp: Boolean(r.follow_up),
    photos: snapshotMedia(r.id, 'photo'), voices: snapshotMedia(r.id, 'audio'),
  }))

  const mm = (missionMediaQ.data || []) as any[]
  // ownerId ties a photo to the exact record it belongs to: the mission id for
  // mission-level photos, the meal id for meal receipts, and each travel
  // segment's / other-expense's own id for their photos. This is what makes
  // per-item galleries possible instead of dumping every travel photo together.
  const missionMediaByOwner = (ownerId: string, category: string, type?: MediaItem['type']): MediaItem[] => mm
    .filter(x => x.owner_id === ownerId && x.category === category && (!type || x.media_type === type))
    .map(x => ({ id: x.id, name: x.original_name || x.storage_path.split('/').pop() || 'file', type: x.media_type, url: mediaUrl(x.storage_path), createdAt: x.created_at, storagePath: x.storage_path, ownerId: x.owner_id }))

  const missionWells = missionWellsQ.data || []
  const missions: Mission[] = (missionsQ.data || []).map((r: any) => {
    const mealRow: any = (mealsQ.data || []).find((x: any) => x.mission_id === r.id)
    const meal = mealRow ? { id: mealRow.id, missionId: r.id, title: mealRow.title || 'غذا', amount: Number(mealRow.amount || 0), vendor: mealRow.vendor || '', notes: mealRow.notes || '', files: missionMediaByOwner(mealRow.id, 'meal') } : undefined
    const travel: TravelSegment[] = (travelQ.data || []).filter((x: any) => x.mission_id === r.id).map((x: any) => ({
      id: x.id, missionId: r.id, origin: x.origin, destination: x.destination, vehicle: x.vehicle || '', amount: Number(x.amount || 0), dateTime: x.date_time || '', notes: x.notes || '', files: missionMediaByOwner(x.id, 'travel'),
    }))
    const otherExpenses: OtherExpense[] = (otherQ.data || []).filter((x: any) => x.mission_id === r.id).map((x: any) => ({ id: x.id, missionId: r.id, title: x.title, amount: Number(x.amount || 0), notes: x.notes || '', files: missionMediaByOwner(x.id, 'other') }))
    return {
      id: r.id, date: r.date, cityId: r.city_id, title: r.title, notes: r.notes || '', startTime: r.start_time || '', endTime: r.end_time || '', status: r.status,
      wellIds: missionWells.filter((x: any) => x.mission_id === r.id).map((x: any) => x.well_id), meal, travel, otherExpenses,
      files: missionMediaByOwner(r.id, 'mission'), createdAt: r.created_at,
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
  const blob = dataUrlToBlob(item.dataUrl)
  const fallbackExt = item.type === 'audio' ? 'webm' : 'jpg'
  const originalExt = item.name.includes('.') ? item.name.split('.').pop() : fallbackExt
  const ext = originalExt || fallbackExt
  const path = `${folder}/${item.id}.${ext}`
  const contentType = blob.type || (item.type === 'audio' ? 'audio/webm' : 'image/jpeg')
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
    upsert: true,
    contentType,
    cacheControl: '3600'
  })
  if (error) throw error
  return { ...item, dataUrl: undefined, url: mediaUrl(path), storagePath: path, mimeType: contentType }
}


async function removeStoragePaths(paths: string[]) {
  const clean = paths.filter(Boolean)
  if (!clean.length) return
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(clean)
  // A stale storage object should not prevent the database record from being
  // deleted. Database consistency is more important than orphan cleanup.
  if (error) console.warn('Storage cleanup warning:', error.message)
}

export async function syncCloudData(data: AppData) {
  // The app intentionally has no login/RLS layer. Supabase is the source of truth.
  // Sync parents first, then relations/expenses/media, and only then perform
  // deletions. This ordering avoids FK 409 conflicts.

  if (data.cities.length) {
    const { error } = await supabase.from('cities').upsert(
      data.cities.map(c => ({ id: c.id, name: c.name, description: c.description, created_at: c.createdAt }))
    )
    if (error) throw error
  }

  if (data.wells.length) {
    const { error } = await supabase.from('wells').upsert(
      data.wells.map(w => ({
        id: w.id, city_id: w.cityId, name: w.name, code: w.code, status: w.status,
        latitude: w.location?.latitude ?? null, longitude: w.location?.longitude ?? null,
        accuracy: w.location?.accuracy ?? null, created_at: w.createdAt
      }))
    )
    if (error) throw error
  }

  if (data.snapshots.length) {
    const { error } = await supabase.from('snapshots').upsert(
      data.snapshots.map(s => ({
        id: s.id, well_id: s.wellId, type: s.type, visit_date: s.date,
        latitude: s.latitude ?? null, longitude: s.longitude ?? null, accuracy: s.accuracy ?? null,
        pipe_material: s.pipeMaterial, pipe_diameter: s.pipeDiameter ?? null,
        pipe_thickness: s.pipeThickness ?? null, lining_thickness: s.liningThickness ?? null,
        signal_quality: s.signalQuality ?? null, signal_power: s.signalPower ?? null,
        sound_path: s.soundPath ?? null, transmitter_serial: s.transmitterSerial,
        sensor_serial: s.sensorSerial, flow_lps: s.flow ?? null, notes: s.notes,
        follow_up: Boolean(s.followUp), created_at: s.createdAt
      }))
    )
    if (error) throw error
  }

  if (data.missions.length) {
    const { error } = await supabase.from('missions').upsert(
      data.missions.map(m => ({
        id: m.id, date: m.date, city_id: m.cityId || null, title: m.title, notes: m.notes,
        start_time: m.startTime || null, end_time: m.endTime || null, status: m.status,
        created_at: m.createdAt
      }))
    )
    if (error) throw error
  }

  // Replace mission↔well relations for every mission that still exists locally.
  // This also removes a well from a mission before a deleted well is removed,
  // avoiding the mission_wells -> wells FK conflict.
  for (const m of data.missions) {
    const { error: delErr } = await supabase.from('mission_wells').delete().eq('mission_id', m.id)
    if (delErr) throw delErr
    if (m.wellIds.length) {
      const { error } = await supabase.from('mission_wells').insert(
        m.wellIds.map(wellId => ({ mission_id: m.id, well_id: wellId }))
      )
      if (error) throw error
    }
  }

  // Snapshots: upload/update media and remove locally deleted snapshots/media.
  for (const s of data.snapshots) {
    for (const item of [...s.photos, ...s.voices]) {
      if (!item.dataUrl) continue
      const uploaded = await uploadMedia(item, `wells/${s.wellId}/snapshots/${s.id}`)
      const { error } = await supabase.from('snapshot_media').upsert({
        id: uploaded.id,
        snapshot_id: s.id,
        media_type: uploaded.type,
        storage_path: uploaded.storagePath,
        original_name: uploaded.name,
        duration_seconds: uploaded.duration || null,
        created_at: uploaded.createdAt
      })
      if (error) throw error
    }

    const keepIds = [...s.photos, ...s.voices].map(x => x.id)
    const { data: existingRows, error: rowsErr } = await supabase
      .from('snapshot_media').select('id,storage_path').eq('snapshot_id', s.id)
    if (rowsErr) throw rowsErr
    const removed = (existingRows || []).filter(r => !keepIds.includes(r.id))
    if (removed.length) {
      const { error } = await supabase.from('snapshot_media').delete().in('id', removed.map(r => r.id))
      if (error) throw error
      await removeStoragePaths(removed.map(r => r.storage_path))
    }
  }

  // Missions: expenses + all mission-level/meal/travel/other media.
  for (const m of data.missions) {
    if (m.meal) {
      const { error } = await supabase.from('meal_expenses').upsert({
        id: m.meal.id, mission_id: m.id, title: m.meal.title, amount: m.meal.amount,
        vendor: m.meal.vendor, notes: m.meal.notes
      })
      // created_at is optional on upsert; the existing value is preserved.
      if (error) throw error
    } else {
      const { error } = await supabase.from('meal_expenses').delete().eq('mission_id', m.id)
      if (error) throw error
    }

    if (m.travel.length) {
      const { error } = await supabase.from('travel_segments').upsert(
        m.travel.map(t => ({
          id: t.id, mission_id: m.id, origin: t.origin, destination: t.destination,
          vehicle: t.vehicle, amount: t.amount, date_time: t.dateTime || null,
          notes: t.notes, created_at: new Date().toISOString()
        }))
      )
      if (error) throw error
    }
    {
      const { data: existingTravel, error: qErr } = await supabase
        .from('travel_segments').select('id').eq('mission_id', m.id)
      if (qErr) throw qErr
      const keep = new Set(m.travel.map(t => t.id))
      const removed = (existingTravel || []).map(r => r.id).filter(id => !keep.has(id))
      if (removed.length) {
        const { error } = await supabase.from('travel_segments').delete().in('id', removed)
        if (error) throw error
      }
    }

    if (m.otherExpenses.length) {
      const { error } = await supabase.from('other_expenses').upsert(
        m.otherExpenses.map(o => ({
          id: o.id, mission_id: m.id, title: o.title, amount: o.amount, notes: o.notes,
          created_at: new Date().toISOString()
        }))
      )
      if (error) throw error
    }
    {
      const { data: existingOther, error: qErr } = await supabase
        .from('other_expenses').select('id').eq('mission_id', m.id)
      if (qErr) throw qErr
      const keep = new Set(m.otherExpenses.map(o => o.id))
      const removed = (existingOther || []).map(r => r.id).filter(id => !keep.has(id))
      if (removed.length) {
        const { error } = await supabase.from('other_expenses').delete().in('id', removed)
        if (error) throw error
      }
    }

    const groups = [
      { category: 'mission', ownerId: m.id, items: m.files || [] },
      ...(m.meal ? [{ category: 'meal', ownerId: m.meal.id, items: m.meal.files || [] }] : []),
      ...m.travel.map(t => ({ category: 'travel', ownerId: t.id, items: t.files || [] })),
      ...m.otherExpenses.map(o => ({ category: 'other', ownerId: o.id, items: o.files || [] })),
    ]

    for (const group of groups) {
      for (const item of group.items) {
        if (!item.dataUrl) continue
        const uploaded = await uploadMedia(item, `missions/${m.id}/${group.category}/${group.ownerId}`)
        const { error } = await supabase.from('mission_media').upsert({
          id: uploaded.id,
          mission_id: m.id,
          owner_id: group.ownerId,
          category: group.category,
          media_type: uploaded.type,
          storage_path: uploaded.storagePath,
          original_name: uploaded.name,
          created_at: uploaded.createdAt
        })
        if (error) throw error
      }
    }

    // One final owner-independent reconciliation makes deletion reliable even
    // when a whole group (meal or mission-level files) was removed locally.
    const keepMediaIds = new Set<string>([
      ...(m.files || []).map(x => x.id),
      ...(m.meal?.files || []).map(x => x.id),
      ...m.travel.flatMap(t => (t.files || []).map(x => x.id)),
      ...m.otherExpenses.flatMap(o => (o.files || []).map(x => x.id)),
    ])
    const { data: existingMedia, error: mediaErr } = await supabase
      .from('mission_media').select('id,storage_path').eq('mission_id', m.id)
    if (mediaErr) throw mediaErr
    const removedMedia = (existingMedia || []).filter(r => !keepMediaIds.has(r.id))
    if (removedMedia.length) {
      const { error } = await supabase.from('mission_media').delete().in('id', removedMedia.map(r => r.id))
      if (error) throw error
      await removeStoragePaths(removedMedia.map(r => r.storage_path))
    }
  }

  // Reconcile deleted snapshots that still exist in the cloud.
  const { data: cloudSnapshotRows, error: snapshotIdsErr } = await supabase.from('snapshots').select('id')
  if (snapshotIdsErr) throw snapshotIdsErr
  const localSnapshotIds = new Set(data.snapshots.map(s => s.id))
  const removedSnapshots = (cloudSnapshotRows || []).map(r => r.id).filter(id => !localSnapshotIds.has(id))
  if (removedSnapshots.length) {
    const { error } = await supabase.from('snapshots').delete().in('id', removedSnapshots)
    if (error) throw error
  }

  // Delete removed missions first: this cascades their expenses, media and
  // mission_wells. Then wells, then cities. This is the correct FK order.
  const { data: cloudMissionRows, error: missionIdsErr } = await supabase.from('missions').select('id')
  if (missionIdsErr) throw missionIdsErr
  const localMissionIds = new Set(data.missions.map(m => m.id))
  const removedMissions = (cloudMissionRows || []).map(r => r.id).filter(id => !localMissionIds.has(id))
  for (const missionId of removedMissions) {
    const { data: mediaRows } = await supabase.from('mission_media').select('storage_path').eq('mission_id', missionId)
    await removeStoragePaths((mediaRows || []).map(r => r.storage_path))
  }
  if (removedMissions.length) {
    const { error } = await supabase.from('missions').delete().in('id', removedMissions)
    if (error) throw error
  }

  const { data: cloudWellRows, error: wellIdsErr } = await supabase.from('wells').select('id')
  if (wellIdsErr) throw wellIdsErr
  const localWellIds = new Set(data.wells.map(w => w.id))
  const removedWells = (cloudWellRows || []).map(r => r.id).filter(id => !localWellIds.has(id))
  for (const wellId of removedWells) {
    const { data: snapshotRows } = await supabase.from('snapshots').select('id').eq('well_id', wellId)
    const snapshotIds=(snapshotRows||[]).map(r=>r.id)
    if(snapshotIds.length){
      const { data: mediaRows } = await supabase.from('snapshot_media').select('storage_path').in('snapshot_id', snapshotIds)
      await removeStoragePaths((mediaRows||[]).map(r=>r.storage_path))
    }
  }
  if (removedWells.length) {
    const { error } = await supabase.from('wells').delete().in('id', removedWells)
    if (error) throw error
  }

  const { data: cloudCityRows, error: cityIdsErr } = await supabase.from('cities').select('id')
  if (cityIdsErr) throw cityIdsErr
  const localCityIds = new Set(data.cities.map(c => c.id))
  const removedCities = (cloudCityRows || []).map(r => r.id).filter(id => !localCityIds.has(id))
  if (removedCities.length) {
    const { error } = await supabase.from('cities').delete().in('id', removedCities)
    if (error) throw error
  }
}

export async function deleteMissionCloud(missionId: string) {
  // Delete Storage objects first because a DB cascade does not remove files
  // from Supabase Storage. The mission row deletion then cascades its
  // mission_wells, meal, travel, other-expense and mission_media rows.
  const { data: mediaRows, error: mediaErr } = await supabase
    .from('mission_media')
    .select('storage_path')
    .eq('mission_id', missionId)
  if (mediaErr) throw mediaErr
  await removeStoragePaths((mediaRows || []).map((r: any) => r.storage_path))
  const { error } = await supabase.from('missions').delete().eq('id', missionId)
  if (error) throw error
}
