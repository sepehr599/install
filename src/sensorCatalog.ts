export interface SensorCatalogItem {
  serial: string
  dtNs: number
  lengthM: number
  /** Duplicate rows in the supplied source table had conflicting dt values. */
  dtNsAlternatives?: number[]
}

export const SENSOR_CATALOG: SensorCatalogItem[] = [
  { serial: 'TM00016088', dtNs: 0.7, lengthM: 5 },
  { serial: 'TM00016089', dtNs: 1.4, lengthM: 5 },
  { serial: 'TM00016092', dtNs: 3.7, lengthM: 5 },
  { serial: 'TM00016093', dtNs: 0, lengthM: 5 },
  { serial: 'TM00016097', dtNs: 1.6, lengthM: 5 },
  { serial: 'TM00016099', dtNs: 0.4, lengthM: 5 },
  { serial: 'TM00016101', dtNs: 2.6, lengthM: 5 },
  { serial: 'TM00016103', dtNs: -1.9, lengthM: 5 },
  { serial: 'TM00016113', dtNs: 1, lengthM: 5 },
  { serial: 'TM00016114', dtNs: 0, lengthM: 5 },
  { serial: 'TM00016116', dtNs: 1.1, lengthM: 5 },
  { serial: 'TM00040514', dtNs: -1, lengthM: 5 },
  { serial: 'TM00040781', dtNs: 1.6, lengthM: 5 },
  { serial: 'TM00040833', dtNs: 3.3, lengthM: 5 },
  { serial: 'TM00040903', dtNs: 0.6, lengthM: 5 },
  { serial: 'TM00040919', dtNs: -1.9, lengthM: 5 },
  { serial: 'TM00040942', dtNs: -1.4, lengthM: 5 },
  { serial: 'TM00041190', dtNs: -1, lengthM: 5 },
  { serial: 'TM00041212', dtNs: -1, lengthM: 5 },
  { serial: 'TM00041216', dtNs: -1.5, lengthM: 5 },
  { serial: 'TM24026342', dtNs: -0.4, lengthM: 5 },

  { serial: 'TM00016115', dtNs: -1.3, lengthM: 5 },
  { serial: 'TM00040836', dtNs: 0.8, lengthM: 5 },
  { serial: 'TM24025680', dtNs: -0.2, lengthM: 5 },
  { serial: 'TM00040921', dtNs: 0, lengthM: 5 },
  { serial: 'TM00041194', dtNs: -0.9, lengthM: 5 },
  { serial: 'TM00041214', dtNs: 0.2, lengthM: 5, dtNsAlternatives: [1.5] },

  { serial: 'TM00040793', dtNs: 0.5, lengthM: 5 },
  { serial: 'TM00016102', dtNs: -0.4, lengthM: 5 },
  { serial: 'TM00041218', dtNs: 0.4, lengthM: 5 },
  { serial: 'TM00016096', dtNs: 0.4, lengthM: 5 },
  { serial: 'TM00016095', dtNs: -0.1, lengthM: 5 },
  { serial: 'TM00040783', dtNs: 0.5, lengthM: 5 },
  { serial: 'TM00040802', dtNs: 2.6, lengthM: 5 },
  { serial: 'TM00041189', dtNs: 0.4, lengthM: 5 },
  { serial: 'TM00016112', dtNs: -2.4, lengthM: 5 },

  { serial: 'TM00040927', dtNs: -3.2, lengthM: 10 },
  { serial: 'TM00016090', dtNs: 0.6, lengthM: 10 },
  { serial: 'TM00040782', dtNs: 0.3, lengthM: 10 },
  { serial: 'TM00016105', dtNs: -1.8, lengthM: 10 },
  { serial: 'TM00040988', dtNs: 0.6, lengthM: 10 },
  { serial: 'TM00040785', dtNs: -2.1, lengthM: 10 },
  { serial: 'TM00016104', dtNs: -0.6, lengthM: 10 },
  { serial: 'TM24025650', dtNs: 0.2, lengthM: 10 },
  { serial: 'TM00040724', dtNs: -1, lengthM: 10 },
  { serial: 'TM00016091', dtNs: 0, lengthM: 10 },

  { serial: 'TM00040978', dtNs: 1.3, lengthM: 5 },
  { serial: 'TM00016108', dtNs: -1.4, lengthM: 5 },
  { serial: 'TM00041191', dtNs: -1.3, lengthM: 5 },
  { serial: 'TM00041217', dtNs: -1.4, lengthM: 10 },
  { serial: 'TM00016100', dtNs: 1.1, lengthM: 10 },
  { serial: 'TM00041204', dtNs: 0.3, lengthM: 10 },
  { serial: 'TM00041206', dtNs: 1.4, lengthM: 5 },
  { serial: 'TM00041196', dtNs: -0.5, lengthM: 5 },
  { serial: 'TM00016094', dtNs: -0.2, lengthM: 10 },
]

export function normalizeSensorSerial(value: string): string {
  const cleaned = String(value || '').trim().toUpperCase().replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const digits = cleaned.replace(/^TM/, '').replace(/[^0-9]/g, '')
  return digits ? `TM${digits}` : ''
}

export function findSensorBySerial(value: string): SensorCatalogItem | undefined {
  const serial = normalizeSensorSerial(value)
  return SENSOR_CATALOG.find(item => item.serial === serial)
}
