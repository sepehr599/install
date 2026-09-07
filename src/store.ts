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

export { id }
