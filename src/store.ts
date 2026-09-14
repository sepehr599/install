import { AppData } from './types'

const KEY = 'flowmeter-app-v2'
const id = () => crypto.randomUUID()

const emptyData: AppData = {
  theme: 'light',
  cities: [],
  wells: [],
  snapshots: [],
  missions: [],
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AppData) : emptyData
  } catch {
    return emptyData
  }
}

export function saveData(data: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Large photos can exceed mobile localStorage limits. Keep the structured
    // data locally, but remove only temporary data URLs; the cloud sync still
    // receives the original in-memory object and uploads the media.
    const stripMedia=(items:any[])=>items.map(x=>({...x,dataUrl:undefined}))
    const safe={...data,
      snapshots:data.snapshots.map(s=>({...s,photos:stripMedia(s.photos),voices:stripMedia(s.voices)})),
      missions:data.missions.map(m=>({...m,files:stripMedia(m.files),meal:m.meal?{...m.meal,files:stripMedia(m.meal.files)}:m.meal,travel:m.travel.map(t=>({...t,files:stripMedia(t.files)})),otherExpenses:m.otherExpenses.map(o=>({...o,files:stripMedia(o.files)}))}))
    }
    try { localStorage.setItem(KEY, JSON.stringify(safe)) } catch {}
  }
}

export function clearLocalData() {
  localStorage.removeItem(KEY)
}

// Durable offline outbox. IndexedDB is used instead of localStorage because
// installation photos and voice notes can be much larger than the localStorage
// quota. The latest full AppData snapshot is kept here until it is confirmed
// on Supabase.
const OUTBOX_DB = 'flowmeter-offline-db-v1'
const OUTBOX_STORE = 'pending-sync'
const OUTBOX_KEY = 'latest'

export type PendingSync = {
  version: string
  createdAt: string
  data: AppData
}

function openOutboxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB در این دستگاه در دسترس نیست'))
      return
    }
    const req = indexedDB.open(OUTBOX_DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('خطا در باز کردن حافظه آفلاین'))
  })
}

export async function savePendingSync(data: AppData, version = `${Date.now()}-${Math.random().toString(36).slice(2)}`): Promise<PendingSync> {
  const record: PendingSync = { version, createdAt: new Date().toISOString(), data }
  const db = await openOutboxDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    tx.objectStore(OUTBOX_STORE).put(record, OUTBOX_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('ثبت صف آفلاین ناموفق بود'))
    tx.onabort = () => reject(tx.error || new Error('ثبت صف آفلاین متوقف شد'))
  })
  db.close()
  try { localStorage.setItem('flowmeter-sync-pending', '1') } catch {}
  return record
}

export async function loadPendingSync(): Promise<PendingSync | null> {
  try {
    const db = await openOutboxDb()
    const result = await new Promise<PendingSync | undefined>((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, 'readonly')
      const req = tx.objectStore(OUTBOX_STORE).get(OUTBOX_KEY)
      req.onsuccess = () => resolve(req.result as PendingSync | undefined)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return result || null
  } catch {
    return null
  }
}

export async function clearPendingSync(expectedVersion?: string): Promise<void> {
  const current = await loadPendingSync()
  if (!current || (expectedVersion && current.version !== expectedVersion)) return
  try {
    const db = await openOutboxDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite')
      tx.objectStore(OUTBOX_STORE).delete(OUTBOX_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('پاک کردن صف آفلاین ناموفق بود'))
      tx.onabort = () => reject(tx.error || new Error('پاک کردن صف آفلاین متوقف شد'))
    })
    db.close()
  } finally {
    const after = await loadPendingSync()
    try {
      if (!after) localStorage.removeItem('flowmeter-sync-pending')
      else localStorage.setItem('flowmeter-sync-pending', '1')
    } catch {}
  }
}

export { id }
