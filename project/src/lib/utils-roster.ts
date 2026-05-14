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
  return people.find(p => p.id === id)?.name ?? ''
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

// Cooldown check for AV roles
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

    // Check actual assignments for completed meetings
    const actual = m.actual as Record<string, string | undefined>
    const planned = m.planned as Record<string, string | undefined>

    // Red: same role within 7 days
    if (daysDiff <= 7) {
      const assignedRole = AV_ROLES.find(r => actual[r] === personId || planned[r] === personId)
      if (assignedRole === role) {
        return { level: 'red', reason: `Same role within 7 days` }
      }
    }

    // Amber: any AV role within cooldown days
    if (daysDiff <= cooldownDays) {
      const inAv = AV_ROLES.some(r => actual[r] === personId)
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

    // Use actual for completed, planned for others
    const assignments = meeting.status === 'Completed' ? meeting.actual : meeting.planned

    for (const role of AV_ROLES) {
      const id = (assignments as Record<string, string | undefined>)[role]
      if (id && statsMap.has(id)) {
        const s = statsMap.get(id)!
        s[role] = (s[role] as number) + 1
        s.total = (s.total as number) + 1
      }
    }

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

  return AV_ROLES.map(role => {
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
        const actual = m.actual as Record<string, string | undefined>
        if (actual[role] === person.id) {
          const d = differenceInDays(meetingDate, mDate)
          if (d < daysSinceLast) daysSinceLast = d
        }
      }
      return { person, daysSinceLast }
    })

    ranked.sort((a, b) => {
      // Higher daysSinceLast = more overdue = ranked first; Infinity means never assigned
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
    return [
      formatDate(m.date), m.type, m.status,
      pn(m.planned.platform), pn(m.planned.mic1), pn(m.planned.mic2), pn(m.planned.audio),
      pn(m.planned.video), pn(m.planned.backup), pn(m.planned.vc),
      pn(m.planned.reader), pn(m.planned.entranceAttendant), pn(m.planned.auditoriumAttendant),
      pn(m.actual.platform), pn(m.actual.mic1), pn(m.actual.mic2), pn(m.actual.audio),
      pn(m.actual.video), pn(m.actual.backup), pn(m.actual.vc),
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
