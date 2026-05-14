import type { Meeting, Person, AppSettings } from '../types'

export interface ScheduleData {
  meetings: Meeting[]
  people: Person[]
  settings: AppSettings
}

export async function loadFromCloud(): Promise<ScheduleData | null> {
  try {
    const res = await fetch('/api/schedule')
    if (!res.ok) return null
    return await res.json() as ScheduleData | null
  } catch {
    return null
  }
}

export async function saveToCloud(data: ScheduleData): Promise<boolean> {
  try {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.ok
  } catch {
    return false
  }
}
