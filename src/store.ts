import { AppData, City, InstallSnapshot, Mission, Well } from './types'

const KEY = 'flowmeter-app-v1'
const id = () => crypto.randomUUID()

const seed: AppData = {
  theme: 'light',
  cities: [
    { id: 'c1', name: 'اصفهان', description: 'نمونه داده', createdAt: new Date().toISOString() },
    { id: 'c2', name: 'تهران', description: '', createdAt: new Date().toISOString() },
  ],
  wells: [
    { id: 'w1', cityId: 'c1', name: 'چاه آب شماره ۱', code: 'ISF-001', status: 'installed', createdAt: new Date().toISOString(), location: { latitude: 32.6546, longitude: 51.6680 } },
    { id: 'w2', cityId: 'c1', name: 'چاه شماره ۲', code: 'ISF-002', status: 'needs_followup', createdAt: new Date().toISOString() },
    { id: 'w3', cityId: 'c2', name: 'چاه شرق', code: 'TEH-001', status: 'not_installed', createdAt: new Date().toISOString() },
  ],
  snapshots: [
    { id: 's1', type: 'installation', wellId: 'w1', date: '2026-08-20', createdAt: new Date().toISOString(), latitude: 32.6546, longitude: 51.6680, pipeMaterial: 'Steel', pipeDiameter: 250, pipeThickness: 8, liningThickness: 3, signalQuality: 68, signalPower: 48, soundPath: 'V', transmitterSerial: 'TR-1001', sensorSerial: 'SN-501', flow: 12.4, notes: 'نمونه نصب اولیه', photos: [], voices: [] },
    { id: 's2', type: 'visit', wellId: 'w1', date: '2026-08-28', createdAt: new Date().toISOString(), latitude: 32.6547, longitude: 51.6679, pipeMaterial: 'Steel', pipeDiameter: 250, pipeThickness: 8, liningThickness: 3, signalQuality: 91, signalPower: 72, soundPath: 'Z', transmitterSerial: 'TR-1001', sensorSerial: 'SN-501', flow: 13.7, notes: 'تنظیم مجدد سنسور و بهبود سیگنال', photos: [], voices: [] },
  ],
  missions: [],
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) { localStorage.setItem(KEY, JSON.stringify(seed)); return seed }
    return JSON.parse(raw) as AppData
  } catch { return seed }
}

export function saveData(data: AppData) { localStorage.setItem(KEY, JSON.stringify(data)) }
export { id }
export type { City, InstallSnapshot, Mission, Well }
