import type { Person, Meeting, AppSettings } from '../types'

const SEED_VERSION = '3'

const KEYS = {
  people: 'av-roster-people',
  meetings: 'av-roster-meetings',
  settings: 'av-roster-settings',
  initialized: 'av-roster-initialized',
  seedVersion: 'av-roster-seed-version',
}

export function loadPeople(): Person[] | null {
  try {
    const raw = localStorage.getItem(KEYS.people)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function savePeople(people: Person[]): void {
  localStorage.setItem(KEYS.people, JSON.stringify(people))
}

export function loadMeetings(): Meeting[] | null {
  try {
    const raw = localStorage.getItem(KEYS.meetings)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveMeetings(meetings: Meeting[]): void {
  localStorage.setItem(KEYS.meetings, JSON.stringify(meetings))
}

export function loadSettings(): AppSettings | null {
  try {
    const raw = localStorage.getItem(KEYS.settings)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(settings))
}

export function isInitialized(): boolean {
  return (
    localStorage.getItem(KEYS.initialized) === 'true' &&
    localStorage.getItem(KEYS.seedVersion) === SEED_VERSION
  )
}

export function markInitialized(): void {
  localStorage.setItem(KEYS.initialized, 'true')
  localStorage.setItem(KEYS.seedVersion, SEED_VERSION)
}
