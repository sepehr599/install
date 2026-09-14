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
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function clearLocalData() {
  localStorage.removeItem(KEY)
}

export { id }
