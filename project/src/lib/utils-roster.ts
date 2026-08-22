import { format, parseISO, differenceInDays, isBefore, isAfter, startOfDay, addDays, getDay } from 'date-fns'
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

export function getUnavailabilityState(person: Person): 'active' | 'upcoming' | 'past' | null {
  if (person.availability_status === 'Available') return null
  const from = person.unavailable_from ? startOfDay(parseISO(person.unavailable_from)) : null
  const until = person.unavailable_until ? startOfDay(parseISO(person.unavailable_until)) : null
  if (!from && !until) return null
  const today = startOfDay(new Date())
  if (until && isBefore(until, today)) return 'past'
  if (from && isAfter(from, today)) return 'upcoming'
  return 'active'
}

export function isPersonCurrentlyUnavailable(person: Person, onDate?: string): boolean {
  if (person.suspended) return true
  if (person.availability_status === 'Available') return false
  const from = person.unavailable_from ? startOfDay(parseISO(person.unavailable_from)) : null
  const until = person.unavailable_until ? startOfDay(parseISO(person.unavailable_until)) : null
  if (!from && !until) return false
  const checkDate = onDate ? startOfDay(parseISO(onDate)) : startOfDay(new Date())
  if (from && isBefore(checkDate, from)) return false
  if (until && isAfter(checkDate, until)) return false
  return true
}

export function getPeopleForRole(people: Person[], role: AvRole, onDate?: string): Person[] {
  return people.filter(p => p[role] && !isPersonCurrentlyUnavailable(p, onDate))
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

export interface CooldownResult {
  level: 'red' | 'amber' | null
  reason?: string
}

export function checkCooldown(
  meetings: Meeting[],
  meeting: Meeting,
  personId: string,
  _role: AvRole,
  cooldownDays: number
): CooldownResult {
  const meetingDate = parseISO(meeting.date)

  // Returns true if personId appears in any AV role for meeting m.
  // Planned meetings: check planned fields.
  // Completed meetings: check actual completions — fill-ins count (actual = their ID),
  //   no-shows don't (actual ≠ the person who bailed).
  // Backup only counts when backupRequired is true.
  const isPersonInMeeting = (m: Meeting): boolean => {
    if (m.status === 'Completed') {
      return AV_ROLES.some(r => {
        if (r === 'backup' && !m.backupRequired) return false
        const c = m.completions[r]
        return c !== undefined && c.actual !== null && c.actual !== '' && c.actual === personId
      })
    }
    return AV_ROLES.some(r => {
      if (r === 'backup' && !m.backupRequired) return false
      return m.planned[r] === personId
    })
  }

  let hasRed = false
  let hasAmber = false

  for (const m of meetings) {
    if (m.id === meeting.id) continue
    if (m.status === 'Cancelled') continue
    if (!isPersonInMeeting(m)) continue

    const daysDiff = Math.abs(differenceInDays(meetingDate, parseISO(m.date)))

    if (daysDiff <= 7) {
      hasRed = true
    } else if (daysDiff <= cooldownDays) {
      hasAmber = true
    }
  }

  if (hasRed) return { level: 'red', reason: 'Assigned within 7 days' }
  if (hasAmber) return { level: 'amber', reason: `Assigned within ${cooldownDays} days` }
  return { level: null }
}

// Get meeting stats per person for rolling 6 months
export interface PersonStats {
  personId: string
  // Assigned counts: times planned in each role across all non-cancelled meetings
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
  total: number               // total assigned (all roles, all non-cancelled meetings)
  assignedCompletedTotal: number  // assigned in completed meetings only (rate denominator)
  fulfilledTotal: number      // times person actually appeared in a completed meeting's actuals
  noShows: number             // times rostered for completed meeting but didn't appear
  recentAssignedCompleted: number  // assignedCompletedTotal for last 8 weeks
  recentFulfilled: number          // fulfilledTotal for last 8 weeks
  reliabilityScore: number  // blended rate minus no-show penalty; -999 = no data
  [key: string]: number | string
}

export function computeStats(meetings: Meeting[], people: Person[]): PersonStats[] {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 6)
  const recentCutoff = addDays(startOfDay(new Date()), -56)

  const statsMap = new Map<string, PersonStats>()

  for (const person of people) {
    statsMap.set(person.id, {
      personId: person.id,
      platform: 0, mic1: 0, mic2: 0, audio: 0, video: 0, backup: 0, vc: 0,
      reader: 0, entranceAttendant: 0, auditoriumAttendant: 0, total: 0,
      assignedCompletedTotal: 0, fulfilledTotal: 0,
      noShows: 0, recentAssignedCompleted: 0, recentFulfilled: 0, reliabilityScore: -999,
    })
  }

  for (const meeting of meetings) {
    const mDate = parseISO(meeting.date)
    if (mDate < cutoff) continue
    if (meeting.status === 'Cancelled') continue

    // Assigned: always from planned (both Planned-status and Completed meetings)
    for (const role of AV_ROLES) {
      const id = meeting.planned[role]
      if (id && statsMap.has(id)) {
        const s = statsMap.get(id)!
        s[role] = (s[role] as number) + 1
        s.total = (s.total as number) + 1
      }
    }
    for (const role of NON_AV_ROLES) {
      const id = (meeting.planned as Record<string, string | undefined>)[role]
      if (id && statsMap.has(id)) {
        statsMap.get(id)![role] = (statsMap.get(id)![role] as number) + 1
      }
    }

    // Assigned in completed meetings + fulfilled: both only for completed meetings
    if (meeting.status === 'Completed') {
      const isRecent = !isBefore(mDate, recentCutoff)
      for (const role of AV_ROLES) {
        if (role === 'backup' && !meeting.backupRequired) continue
        const plannedId = meeting.planned[role]
        const actual = meeting.completions[role]?.actual
        if (plannedId && statsMap.has(plannedId)) {
          const s = statsMap.get(plannedId)!
          s.assignedCompletedTotal = (s.assignedCompletedTotal as number) + 1
          if (isRecent) s.recentAssignedCompleted = (s.recentAssignedCompleted as number) + 1
          if (!actual || actual !== plannedId) s.noShows = (s.noShows as number) + 1
        }
        if (actual && actual !== '') {
          const s = statsMap.get(actual)
          if (s) {
            s.fulfilledTotal = (s.fulfilledTotal as number) + 1
            if (isRecent) s.recentFulfilled = (s.recentFulfilled as number) + 1
          }
        }
      }
    }
  }

  for (const s of statsMap.values()) {
    if ((s.assignedCompletedTotal as number) === 0) continue
    const rate6mo = (s.fulfilledTotal as number) / (s.assignedCompletedTotal as number)
    const rate8wk = (s.recentAssignedCompleted as number) > 0
      ? (s.recentFulfilled as number) / (s.recentAssignedCompleted as number)
      : null
    const blended = rate8wk !== null ? (rate6mo + rate8wk) / 2 : rate6mo
    s.reliabilityScore = Math.round(blended * 100 - (s.noShows as number) * 5)
  }

  return Array.from(statsMap.values())
}

// Suggest best people for each AV role
export type AvailabilityBadge = 'green' | 'amber' | 'red' | null

export interface RoleSuggestion {
  role: AvRole
  suggestions: Array<{ person: Person; daysSinceLast: number; cooldown: AvailabilityBadge }>
}

export function getSuggestions(
  meetings: Meeting[],
  people: Person[],
  targetMeeting: Meeting,
  cooldownDays: number
): RoleSuggestion[] {
  const assignedInMeeting = getAllAssignedIds(targetMeeting)
  const meetingDate = parseISO(targetMeeting.date)

  const roles = targetMeeting.backupRequired ? AV_ROLES : AV_ROLES.filter(r => r !== 'backup')

  return roles.map(role => {
    const eligible = people.filter(p =>
      p[role] &&
      !isPersonCurrentlyUnavailable(p, targetMeeting.date) &&
      !assignedInMeeting.has(p.id)
    )

    const candidates = eligible.map(person => {
      const cooldownLevel = checkCooldown(meetings, targetMeeting, person.id, role, cooldownDays).level

      // daysSinceLast: most recent past appearance in this specific role.
      // Counts planned assignments in non-cancelled past meetings, and completed
      // actuals where noshow === false (person physically performed the role).
      let daysSinceLast = Infinity
      for (const m of meetings) {
        const mDate = parseISO(m.date)
        if (mDate >= meetingDate) continue  // future or same-date — skip
        if (m.status === 'Cancelled') continue

        let appeared = false
        if (m.status === 'Completed') {
          const c = m.completions[role]
          appeared = !!(c && c.actual === person.id && c.noshow === false)
        } else {
          appeared = m.planned[role] === person.id
        }

        if (appeared) {
          const d = differenceInDays(meetingDate, mDate)
          if (d < daysSinceLast) daysSinceLast = d
        }
      }

      return { person, daysSinceLast, cooldown: cooldownLevel }
    })

    // Sort: no-cooldown first, then amber, then red — within each tier by most overdue (Infinity = never, goes first)
    const cooldownRank = (c: AvailabilityBadge) => c === null ? 0 : c === 'amber' ? 1 : 2
    candidates.sort((a, b) => {
      const rankDiff = cooldownRank(a.cooldown) - cooldownRank(b.cooldown)
      if (rankDiff !== 0) return rankDiff
      if (a.daysSinceLast === Infinity && b.daysSinceLast === Infinity) return 0
      if (a.daysSinceLast === Infinity) return -1
      if (b.daysSinceLast === Infinity) return 1
      return b.daysSinceLast - a.daysSinceLast
    })

    return { role, suggestions: candidates.slice(0, 3) }
  })
}

const AUTO_FILL_ROLE_ORDER: AvRole[] = ['video', 'audio', 'vc', 'platform', 'backup', 'mic1', 'mic2']

export interface AutoFillChange {
  meetingId: string
  role: AvRole
}

export interface AutoFillResult {
  meetings: Meeting[]
  changes: AutoFillChange[]
  filledSlots: number
  filledMeetings: number
  unfilledSlots: number
}

export function autoFill(
  meetings: Meeting[],
  people: Person[],
  cooldownDays: number
): AutoFillResult {
  const todayStart = startOfDay(new Date())
  let current = meetings.map(m => ({ ...m, planned: { ...m.planned } }))
  const targets = current
    .filter(m => m.status === 'Planned' && !isBefore(startOfDay(parseISO(m.date)), todayStart))
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())

  const changes: AutoFillChange[] = []
  const filledMeetingIds = new Set<string>()
  let unfilledSlots = 0

  for (const target of targets) {
    for (const role of AUTO_FILL_ROLE_ORDER) {
      const live = current.find(m => m.id === target.id)!
      if (live.planned[role]) continue
      if (role === 'backup' && !live.backupRequired) continue

      const roleSuggestions = getSuggestions(current, people, live, cooldownDays).find(s => s.role === role)
      const best = roleSuggestions?.suggestions[0]

      if (best) {
        const personId = best.person.id
        current = current.map(m =>
          m.id === live.id ? { ...m, planned: { ...m.planned, [role]: personId } } : m
        )
        changes.push({ meetingId: live.id, role })
        filledMeetingIds.add(live.id)
      } else {
        unfilledSlots++
      }
    }
  }

  return {
    meetings: current,
    changes,
    filledSlots: changes.length,
    filledMeetings: filledMeetingIds.size,
    unfilledSlots,
  }
}

// Advance to the next occurrence of targetDow (0=Sun…6=Sat) strictly after `from`.
function nextWeekday(from: Date, targetDow: number): Date {
  const diff = (targetDow - getDay(from) + 7) % 7
  return addDays(from, diff === 0 ? 7 : diff)
}

// Generate `count` meetings continuing the Wed/Sat alternation after the last existing meeting.
// Cancelled meetings are excluded from the anchor and date-blocking so cancelled slots can be regenerated.
export function generateMeetings(existingMeetings: Meeting[], count: number): Meeting[] {
  const activeMeetings = existingMeetings.filter(m => m.status !== 'Cancelled')
  const existingDates = new Set(activeMeetings.map(m => m.date))

  const sorted = [...activeMeetings].sort((a, b) => (a.date < b.date ? -1 : 1))
  const last = sorted[sorted.length - 1]

  let current: Date
  let nextIsWed: boolean

  if (last) {
    current = parseISO(last.date)
    const dow = getDay(current)
    // Wed → next is Sat; Sat → next is Wed; anything else → default to Wed
    nextIsWed = dow === 6
  } else {
    // No meetings yet — start from tomorrow and pick Wed first
    current = startOfDay(new Date())
    nextIsWed = true
  }

  const newMeetings: Meeting[] = []

  while (newMeetings.length < count) {
    current = nextWeekday(current, nextIsWed ? 3 : 6)
    const dateStr = format(current, 'yyyy-MM-dd')

    if (!existingDates.has(dateStr)) {
      existingDates.add(dateStr)
      newMeetings.push({
        id: crypto.randomUUID(),
        date: dateStr,
        type: nextIsWed ? 'Midweek' : 'Weekend',
        status: 'Planned',
        backupRequired: !nextIsWed,
        planned: {},
        completions: {},
      })
    }

    nextIsWed = !nextIsWed
  }

  return newMeetings
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
