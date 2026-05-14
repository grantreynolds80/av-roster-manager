import { format, parseISO, differenceInDays } from 'date-fns'
import type { Meeting, Person, AvRole, AnyRole } from '../types'
import { AV_ROLES, NON_AV_ROLES } from '../types'

export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMM yyyy')
  } catch {
    return dateStr
  }
}

export function formatDateShort(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMM')
  } catch {
    return dateStr
  }
}

export function getPersonName(people: Person[], id?: string): string {
  if (!id) return ''
  const person = people.find(p => p.id === id)
  if (!person) return '[Removed]'
  return person.name
}

export function getPeopleForRole(people: Person[], role: AvRole): Person[] {
  return people.filter(p => p[role] && p.availability_status === 'Available')
}

// Returns all role assignments (AV + non-AV) for a meeting as flat id set
export function getAllAssignedIds(meeting: Meeting): Set<string> {
  const ids = new Set<string>()
  const addId = (id?: string) => { if (id) ids.add(id) }

  const p = meeting.planned
  addId(p.platform); addId(p.mic1); addId(p.mic2); addId(p.audio)
  addId(p.video); addId(p.backup); addId(p.vc); addId(p.reader)
  addId(p.entranceAttendant); addId(p.auditoriumAttendant)
  return ids
}

// Find what role a person currently holds in a meeting
export function getPersonRoleInMeeting(meeting: Meeting, personId: string): AnyRole | null {
  const p = meeting.planned
  if (p.platform === personId) return 'platform'
  if (p.mic1 === personId) return 'mic1'
  if (p.mic2 === personId) return 'mic2'
  if (p.audio === personId) return 'audio'
  if (p.video === personId) return 'video'
  if (p.backup === personId) return 'backup'
  if (p.vc === personId) return 'vc'
  if (p.reader === personId) return 'reader'
  if (p.entranceAttendant === personId) return 'entranceAttendant'
  if (p.auditoriumAttendant === personId) return 'auditoriumAttendant'
  return null
}

// Derive meeting status from completions. Preserves 'Cancelled'.
export function deriveStatus(meeting: Meeting): Meeting['status'] {
  if (meeting.status === 'Cancelled') return 'Cancelled'
  const required = AV_ROLES.filter(r => r !== 'backup' || meeting.backupRequired)
  const allDone = required.every(r => {
    const c = meeting.completions[r]
    return c !== undefined && c.actual !== null
  })
  return allDone ? 'Completed' : 'Planned'
}

export function countUnfilledRoles(meeting: Meeting): number {
  if (meeting.status !== 'Planned') return 0
  const roles = meeting.backupRequired ? AV_ROLES : AV_ROLES.filter(r => r !== 'backup')
  return roles.filter(r => !meeting.planned[r]).length
}

// Cooldown check — based on actual completions only (no-shows don't count)
export interface CooldownResult {
  level: 'red' | 'amber' | null
  reason?: string
}

export function checkCooldown(
  meetings: Meeting[],
  meeting: Meeting,
  personId: string,
  role: AvRole,
  cooldownDays: number
): CooldownResult {
  const meetingDate = parseISO(meeting.date)

  for (const m of meetings) {
    if (m.id === meeting.id) continue
    if (m.status !== 'Completed') continue

    const mDate = parseISO(m.date)
    const daysDiff = Math.abs(differenceInDays(meetingDate, mDate))

    // Red: same role within 7 days (actual only — no-shows don't count)
    if (daysDiff <= 7) {
      const c = m.completions[role]
      if (c && c.actual === personId) {
        return { level: 'red', reason: 'Same role within 7 days' }
      }
    }

    // Amber: any AV role within cooldown days (actual only)
    if (daysDiff <= cooldownDays) {
      const inAv = AV_ROLES.some(r => {
        const c = m.completions[r]
        return c && c.actual === personId
      })
      if (inAv) {
        return { level: 'amber', reason: `Assigned within ${cooldownDays} days` }
      }
    }
  }

  return { level: null }
}

// Get meeting stats per person for rolling 6 months
export interface PersonStats {
  personId: string
  platform: number
  mic1: number
  mic2: number
  audio: number
  video: number
  backup: number
  vc: number
  reader: number
  entranceAttendant: number
  auditoriumAttendant: number
  total: number
  [key: string]: number | string
}

export function computeStats(meetings: Meeting[], people: Person[]): PersonStats[] {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 6)

  const statsMap = new Map<string, PersonStats>()

  for (const person of people) {
    statsMap.set(person.id, {
      personId: person.id,
      platform: 0, mic1: 0, mic2: 0, audio: 0, video: 0, backup: 0, vc: 0,
      reader: 0, entranceAttendant: 0, auditoriumAttendant: 0, total: 0,
    })
  }

  for (const meeting of meetings) {
    const mDate = parseISO(meeting.date)
    if (mDate < cutoff) continue

    if (meeting.status === 'Completed') {
      // AV roles: count the actual person (fill-ins count, no-shows don't)
      for (const role of AV_ROLES) {
        const c = meeting.completions[role]
        if (c && c.actual) {
          const s = statsMap.get(c.actual)
          if (s) { s[role] = (s[role] as number) + 1; s.total = (s.total as number) + 1 }
        }
      }
    } else {
      // Planned meetings: count planned assignments
      for (const role of AV_ROLES) {
        const id = meeting.planned[role]
        if (id && statsMap.has(id)) {
          const s = statsMap.get(id)!
          s[role] = (s[role] as number) + 1
          s.total = (s.total as number) + 1
        }
      }
    }

    // Non-AV roles always from planned
    for (const role of NON_AV_ROLES) {
      const id = (meeting.planned as Record<string, string | undefined>)[role]
      if (id && statsMap.has(id)) {
        const s = statsMap.get(id)!
        s[role] = (s[role] as number) + 1
        s.total = (s.total as number) + 1
      }
    }
  }

  return Array.from(statsMap.values())
}

// Suggest best people for each AV role
export interface RoleSuggestion {
  role: AvRole
  suggestions: Array<{ person: Person; daysSinceLast: number }>
}

export function getSuggestions(
  meetings: Meeting[],
  people: Person[],
  targetMeeting: Meeting
): RoleSuggestion[] {
  const assignedInMeeting = getAllAssignedIds(targetMeeting)
  const meetingDate = parseISO(targetMeeting.date)

  const roles = targetMeeting.backupRequired ? AV_ROLES : AV_ROLES.filter(r => r !== 'backup')

  return roles.map(role => {
    const eligible = people.filter(p =>
      p[role] &&
      p.availability_status === 'Available' &&
      !assignedInMeeting.has(p.id)
    )

    const ranked = eligible.map(person => {
      // Find last actual assignment in this role
      let daysSinceLast = Infinity
      for (const m of meetings) {
        if (m.status !== 'Completed') continue
        const mDate = parseISO(m.date)
        if (mDate >= meetingDate) continue
        const c = m.completions[role]
        if (c && c.actual === person.id) {
          const d = differenceInDays(meetingDate, mDate)
          if (d < daysSinceLast) daysSinceLast = d
        }
      }
      return { person, daysSinceLast }
    })

    ranked.sort((a, b) => {
      if (a.daysSinceLast === Infinity && b.daysSinceLast === Infinity) return 0
      if (a.daysSinceLast === Infinity) return -1
      if (b.daysSinceLast === Infinity) return 1
      return b.daysSinceLast - a.daysSinceLast
    })

    return { role, suggestions: ranked.slice(0, 3) }
  })
}

// Export data as CSV
export function exportCSV(meetings: Meeting[], people: Person[]): string {
  const headers = [
    'Date', 'Type', 'Status',
    'Platform', 'Mic 1', 'Mic 2', 'Audio', 'Video', 'Backup', 'VC',
    'Reader', 'Entrance Attendant', 'Auditorium Attendant',
    'Actual Platform', 'Actual Mic 1', 'Actual Mic 2', 'Actual Audio', 'Actual Video', 'Actual Backup', 'Actual VC',
  ]

  const rows = meetings.map(m => {
    const pn = (id?: string) => getPersonName(people, id)
    const actualName = (role: AvRole) => {
      const c = m.completions[role]
      if (!c || c.actual === null) return ''
      return getPersonName(people, c.actual || undefined)
    }
    return [
      formatDate(m.date), m.type, m.status,
      pn(m.planned.platform), pn(m.planned.mic1), pn(m.planned.mic2), pn(m.planned.audio),
      pn(m.planned.video), pn(m.planned.backup), pn(m.planned.vc),
      pn(m.planned.reader), pn(m.planned.entranceAttendant), pn(m.planned.auditoriumAttendant),
      actualName('platform'), actualName('mic1'), actualName('mic2'), actualName('audio'),
      actualName('video'), actualName('backup'), actualName('vc'),
    ].map(v => `"${v}"`).join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

export function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
