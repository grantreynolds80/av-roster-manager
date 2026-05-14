import * as XLSX from 'xlsx'
import { parseDeckhandPDF } from './pdf-import'
import type { Meeting, Person } from '../types'

export type ImportedAssignments = {
  reader?: string
  entranceAttendant?: string
  auditoriumAttendant?: string
  platform?: string
  mic1?: string
  mic2?: string
  audio?: string
  video?: string
  backup?: string
  vc?: string
  backupRequired?: boolean
}

const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december']
const DOW_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i
const SKIP_VALUES = new Set(['regional convention', 'unassigned', ''])

const LABEL_MAP: Record<string, string> = {
  'reader':                    'reader',
  'entrance attendant':        'entranceAttendant',
  'auditorium attendant':      'auditoriumAttendant',
  'platform':                  'platform',
  'microphones':               'mic1',
  'videoconference attendant': 'vc',
  'audio operator':            'audio',
  'video operator':            'video',
  'audio/video operator':      'backup',
}

function parseDeckhandDate(raw: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const lineParts = raw.split(/[\n\r]/)
  let datePart: string
  if (lineParts.length > 1 && lineParts[1].trim()) {
    datePart = lineParts[1].trim()
  } else {
    datePart = lineParts[0].replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*/i, '').trim()
  }
  if (!datePart) return undefined
  const m = datePart.match(/^([A-Za-z]+)\s+(\d{1,2})$/)
  if (!m) return undefined
  const monthIdx = MONTH_NAMES.indexOf(m[1].toLowerCase())
  const day = parseInt(m[2], 10)
  if (monthIdx < 0 || isNaN(day)) return undefined
  const now = new Date()
  const month = String(monthIdx + 1).padStart(2, '0')
  const dayStr = String(day).padStart(2, '0')
  const year = (monthIdx + 1 < now.getMonth() + 1) ? now.getFullYear() + 1 : now.getFullYear()
  return `${year}-${month}-${dayStr}`
}

function findPersonId(name: string, people: Person[]): string | undefined {
  if (!name) return undefined
  const n = name.toLowerCase()
  if (SKIP_VALUES.has(n)) return undefined
  return people.find(p => p.name.toLowerCase() === n)?.id
}

function findNonAvName(name: string, people: Person[]): string | undefined {
  if (!name) return undefined
  const n = name.toLowerCase()
  if (SKIP_VALUES.has(n)) return undefined
  return people.find(p => p.name.toLowerCase() === n)?.id ?? name
}

export function processXLSXRows(rows: unknown[][], people: Person[]): Map<string, ImportedAssignments> {
  const getCell = (row: unknown[] | undefined, col: number): string => {
    const v = row?.[col]
    if (typeof v === 'string') return v.replace(/\n.*/s, '').trim()
    if (typeof v === 'number') return String(v)
    return ''
  }

  const headerRowIndices: number[] = []
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] as unknown[]
    let isHeader = false
    for (let c = 1; c < row.length; c++) {
      const cell = row[c]
      if (typeof cell === 'string' && DOW_RE.test(cell)) { isHeader = true; break }
      if (cell instanceof Date && !isNaN(cell.getTime())) { isHeader = true; break }
      if (typeof cell === 'number' && !!XLSX.SSF.parse_date_code(cell)) { isHeader = true; break }
    }
    if (isHeader) headerRowIndices.push(r)
  }

  const importedMap = new Map<string, ImportedAssignments>()
  if (headerRowIndices.length === 0) return importedMap

  for (let bi = 0; bi < headerRowIndices.length; bi++) {
    const headerRowIdx = headerRowIndices[bi]
    const nextHeaderRowIdx = bi + 1 < headerRowIndices.length ? headerRowIndices[bi + 1] : rows.length
    const headerRow = rows[headerRowIdx] as unknown[]

    const colDates: Array<{ colIdx: number; date: string }> = []
    for (let c = 1; c < headerRow.length; c++) {
      const cellVal = headerRow[c]
      let dateStr: string | undefined
      if (cellVal instanceof Date) {
        dateStr = cellVal.toISOString().split('T')[0]
      } else if (typeof cellVal === 'number') {
        const parsed = XLSX.SSF.parse_date_code(cellVal)
        if (parsed) dateStr = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
      } else if (typeof cellVal === 'string' && cellVal.trim()) {
        if (/regional convention/i.test(cellVal)) continue
        dateStr = parseDeckhandDate(cellVal)
      }
      if (dateStr) colDates.push({ colIdx: c, date: dateStr })
    }
    if (colDates.length === 0) continue

    for (const { date } of colDates) {
      if (!importedMap.has(date)) importedMap.set(date, {})
    }

    const roleRowMap: Array<{ field: string; rowIdx: number }> = []
    let lastWasMic1 = false

    for (let r = headerRowIdx + 1; r < nextHeaderRowIdx; r++) {
      const row = rows[r] as unknown[]
      const labelRaw = typeof row[0] === 'string' ? row[0].trim() : ''
      const label = labelRaw.toLowerCase()

      if (lastWasMic1 && labelRaw === '') {
        roleRowMap.push({ field: 'mic2', rowIdx: r })
        lastWasMic1 = false
        continue
      }
      lastWasMic1 = false

      if (label in LABEL_MAP) {
        roleRowMap.push({ field: LABEL_MAP[label], rowIdx: r })
        if (LABEL_MAP[label] === 'mic1') lastWasMic1 = true
      }
    }

    for (const { colIdx, date } of colDates) {
      const entry = importedMap.get(date)!
      for (const { field, rowIdx } of roleRowMap) {
        const raw = getCell(rows[rowIdx] as unknown[], colIdx)
        if (field === 'backup') {
          entry.backupRequired = raw !== ''
          const pid = findPersonId(raw, people)
          if (pid !== undefined) entry.backup = pid
        } else if (field === 'reader' || field === 'entranceAttendant' || field === 'auditoriumAttendant') {
          const val = findNonAvName(raw, people)
          if (val !== undefined) (entry as Record<string, string | undefined>)[field] = val
        } else {
          const val = findPersonId(raw, people)
          if (val !== undefined) (entry as Record<string, string | undefined>)[field] = val
        }
      }
    }
  }

  return importedMap
}

export async function processPDFBuffer(arrayBuffer: ArrayBuffer, people: Person[]): Promise<Map<string, ImportedAssignments>> {
  const pdfMap = await parseDeckhandPDF(arrayBuffer)

  const findId = (name: string | undefined): string | undefined => {
    if (!name) return undefined
    const n = name.toLowerCase()
    if (SKIP_VALUES.has(n)) return undefined
    return people.find(p => p.name.toLowerCase() === n)?.id
  }
  const findNonAvId = (name: string | undefined): string | undefined => {
    if (!name) return undefined
    const n = name.toLowerCase()
    if (SKIP_VALUES.has(n)) return undefined
    return people.find(p => p.name.toLowerCase() === n)?.id ?? name
  }

  const resolvedMap = new Map<string, ImportedAssignments>()
  for (const [date, raw] of pdfMap) {
    const dow = new Date(date).getDay()
    resolvedMap.set(date, {
      reader:              findNonAvId(raw.reader),
      entranceAttendant:   findNonAvId(raw.entranceAttendant),
      auditoriumAttendant: findNonAvId(raw.auditoriumAttendant),
      platform:            findId(raw.platform),
      mic1:                findId(raw.mic1),
      mic2:                findId(raw.mic2),
      audio:               findId(raw.audio),
      video:               findId(raw.video),
      backup:              findId(raw.backup),
      vc:                  findId(raw.vc),
      backupRequired:      dow === 6 || raw.backup !== undefined,
    })
  }

  return resolvedMap
}

export interface ApplyResult {
  meetings: Meeting[]
  updatedCount: number
  createdCount: number
}

export function applyImportedMap(importedMap: Map<string, ImportedAssignments>, meetings: Meeting[]): ApplyResult {
  let updatedCount = 0
  let createdCount = 0

  const updatedMeetings = meetings.map(meeting => {
    const imp = importedMap.get(meeting.date)
    if (!imp) return meeting

    const newPlanned = { ...meeting.planned }
    let changed = false

    const setAlways = (field: keyof typeof newPlanned, val?: string) => {
      if (val && newPlanned[field] !== val) { newPlanned[field] = val; changed = true }
    }

    setAlways('reader', imp.reader)
    setAlways('entranceAttendant', imp.entranceAttendant)
    setAlways('auditoriumAttendant', imp.auditoriumAttendant)
    setAlways('platform', imp.platform)
    setAlways('mic1', imp.mic1)
    setAlways('mic2', imp.mic2)
    setAlways('audio', imp.audio)
    setAlways('video', imp.video)
    setAlways('backup', imp.backup)
    setAlways('vc', imp.vc)

    const newBackupRequired = imp.backupRequired ?? meeting.backupRequired
    if (newBackupRequired !== meeting.backupRequired) {
      changed = true
      if (!newBackupRequired) newPlanned.backup = undefined
    }

    if (changed) updatedCount++
    return changed
      ? { ...meeting, planned: newPlanned, backupRequired: newBackupRequired }
      : meeting
  })

  const existingDates = new Set(meetings.map(m => m.date))
  const newMeetings: Meeting[] = []

  for (const [date, imp] of importedMap) {
    if (existingDates.has(date)) continue
    const dow = new Date(date).getDay()
    const type: Meeting['type'] = dow === 6 ? 'Weekend' : 'Midweek'
    newMeetings.push({
      id: crypto.randomUUID(),
      date,
      type,
      status: 'Planned',
      backupRequired: imp.backupRequired ?? (type === 'Weekend'),
      planned: {
        reader: imp.reader,
        entranceAttendant: imp.entranceAttendant,
        auditoriumAttendant: imp.auditoriumAttendant,
        platform: imp.platform,
        mic1: imp.mic1,
        mic2: imp.mic2,
        audio: imp.audio,
        video: imp.video,
        backup: imp.backup,
        vc: imp.vc,
      },
      completions: {},
    })
    createdCount++
  }

  return {
    meetings: [...updatedMeetings, ...newMeetings].sort((a, b) => a.date.localeCompare(b.date)),
    updatedCount,
    createdCount,
  }
}
