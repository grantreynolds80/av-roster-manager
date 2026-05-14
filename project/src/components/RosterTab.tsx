import { useState } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { parseDeckhandPDF } from '../lib/pdf-import'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { CirclePlus as PlusCircle, Upload, CircleCheck as CheckCircle2, Circle as XCircle, Trash2, Lightbulb, ChevronDown, ChevronUp, X } from 'lucide-react'
import type { Meeting, Person, AvRole, NonAvRole, AnyRole, RoleCompletion, PlannedAssignments } from '../types'
import { AV_ROLES, NON_AV_ROLES, ROLE_LABELS } from '../types'
import {
  formatDate, getPersonName, getPeopleForRole,
  getAllAssignedIds, getPersonRoleInMeeting, checkCooldown,
  exportCSV, triggerDownload, deriveStatus
} from '../lib/utils-roster'
import { ConflictModal } from './ConflictModal'
import { MarkCompleteModal } from './MarkCompleteModal'
import { SuggestionsDrawer } from './SuggestionsDrawer'

interface RosterTabProps {
  meetings: Meeting[]
  people: Person[]
  cooldownDays: number
  onUpdateMeetings: (meetings: Meeting[]) => void
}

interface PendingAssign {
  meetingId: string
  role: AvRole
  personId: string
  existingRole: AnyRole
}

interface DeleteConfirm {
  meetingId: string
  date: string
}

export function RosterTab({ meetings, people, cooldownDays, onUpdateMeetings }: RosterTabProps) {
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null)
  const [conflictPending, setConflictPending] = useState<PendingAssign | null>(null)
  const [markCompleteMeeting, setMarkCompleteMeeting] = useState<Meeting | null>(null)
  const [suggestionsMeeting, setSuggestionsMeeting] = useState<Meeting | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const sortedMeetings = [...meetings]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(m => showCompleted || m.status !== 'Completed')

  const handleRoleAssign = (meetingId: string, role: AvRole, personId: string) => {
    const meeting = meetings.find(m => m.id === meetingId)
    if (!meeting) return

    if (!personId) {
      updateMeetingPlanned(meetingId, { [role]: undefined })
      return
    }

    const existingRole = getPersonRoleInMeeting(meeting, personId)
    if (existingRole && existingRole !== role) {
      setConflictPending({ meetingId, role, personId, existingRole })
      return
    }

    updateMeetingPlanned(meetingId, { [role]: personId })
  }

  const updateMeetingPlanned = (meetingId: string, patch: Partial<PlannedAssignments>) => {
    onUpdateMeetings(meetings.map(m =>
      m.id === meetingId ? { ...m, planned: { ...m.planned, ...patch } } : m
    ))
  }

  const handleConflictReplace = () => {
    if (!conflictPending) return
    const { meetingId, role, personId, existingRole } = conflictPending
    const patch: Partial<PlannedAssignments> = {
      [role]: personId,
      [existingRole]: undefined,
    }
    updateMeetingPlanned(meetingId, patch)
    setConflictPending(null)
  }

  const handleConflictBump = () => {
    if (!conflictPending) return
    const { meetingId, role, personId } = conflictPending

    const meetingIndex = sortedMeetings.findIndex(m => m.id === meetingId)
    const nextMeeting = sortedMeetings.slice(meetingIndex + 1).find(m => m.status !== 'Completed')

    if (nextMeeting) {
      const nextAssigned = getAllAssignedIds(nextMeeting)
      if (!nextAssigned.has(personId)) {
        onUpdateMeetings(meetings.map(m =>
          m.id === nextMeeting.id ? { ...m, planned: { ...m.planned, [role]: personId } } : m
        ))
      }
    }

    setConflictPending(null)
  }

  const handleMarkComplete = (completions: Partial<Record<AvRole, RoleCompletion>>) => {
    if (!markCompleteMeeting) return
    const updated = { ...markCompleteMeeting, completions }
    onUpdateMeetings(meetings.map(m =>
      m.id === markCompleteMeeting.id ? { ...updated, status: deriveStatus(updated) } : m
    ))
    setMarkCompleteMeeting(null)
  }

  const handleAddMeeting = () => {
    const lastMeeting = sortedMeetings[sortedMeetings.length - 1]
    const lastDate = lastMeeting ? new Date(lastMeeting.date) : new Date()
    const newDate = new Date(lastDate)
    newDate.setDate(newDate.getDate() + 7)
    const dateStr = newDate.toISOString().split('T')[0]
    const lastType = lastMeeting?.type ?? 'Midweek'
    const newType = lastType === 'Weekend' ? 'Midweek' : 'Weekend'

    const newMeeting: Meeting = {
      id: `m${Date.now()}`,
      date: dateStr,
      type: newType,
      status: 'Planned',
      backupRequired: newType === 'Weekend',
      planned: {},
      completions: {},
    }
    onUpdateMeetings([...meetings, newMeeting])
  }

  const handleDeleteMeeting = () => {
    if (!deleteConfirm) return
    onUpdateMeetings(meetings.filter(m => m.id !== deleteConfirm.meetingId))
    setDeleteConfirm(null)
  }

  const handleCancelMeeting = () => {
    if (!cancelConfirm) return
    onUpdateMeetings(meetings.map(m =>
      m.id === cancelConfirm ? { ...m, status: m.status === 'Cancelled' ? 'Planned' : 'Cancelled' } : m
    ))
    setCancelConfirm(null)
  }

  const handleSuggestionsAssign = (role: string, personId: string) => {
    if (!suggestionsMeeting) return
    handleRoleAssign(suggestionsMeeting.id, role as AvRole, personId)
    setSuggestionsMeeting(meetings.find(m => m.id === suggestionsMeeting.id)!)
  }

  const handleToggleBackupRequired = (meetingId: string, required: boolean) => {
    onUpdateMeetings(meetings.map(m =>
      m.id === meetingId
        ? { ...m, backupRequired: required, planned: required ? m.planned : { ...m.planned, backup: undefined } }
        : m
    ))
  }

  const handleNonAvRoleEdit = (meetingId: string, role: NonAvRole, value: string) => {
    onUpdateMeetings(meetings.map(m =>
      m.id === meetingId
        ? { ...m, planned: { ...m.planned, [role]: value || undefined } }
        : m
    ))
  }

  const importFile = (file: File) => {
    const isPdf = file.name.toLowerCase().endsWith('.pdf')

    type ImportedAssignments = {
      reader?: string; entranceAttendant?: string; auditoriumAttendant?: string
      platform?: string; mic1?: string; mic2?: string
      audio?: string; video?: string; backup?: string; vc?: string
      backupRequired?: boolean
    }

    const applyImportedMap = (importedMap: Map<string, ImportedAssignments>) => {
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
          id: `m-${date}-${Math.random().toString(36).slice(2, 7)}`,
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

      const finalMeetings = [...updatedMeetings, ...newMeetings]
        .sort((a, b) => a.date.localeCompare(b.date))

      onUpdateMeetings(finalMeetings)

      const total = updatedCount + createdCount
      if (total === 0) {
        toast.info('Import complete — no changes were needed.')
      } else {
        const details: string[] = []
        if (updatedCount > 0) details.push(`${updatedCount} updated`)
        if (createdCount > 0) details.push(`${createdCount} new`)
        toast.success(`Imported ${total} meeting${total !== 1 ? 's' : ''} (${details.join(', ')}).`)
      }
    }

    const processRows = (rows: unknown[][]) => {
      try {
        const SKIP_VALUES = new Set(['regional convention', 'unassigned', ''])

        const getCell = (row: unknown[] | undefined, col: number): string => {
          const v = row?.[col]
          if (typeof v === 'string') return v.replace(/\n.*/s, '').trim()
          if (typeof v === 'number') return String(v)
          return ''
        }

        // AV roles: return person ID, or undefined if not found (treated as unassigned)
        const findPersonId = (name: string): string | undefined => {
          if (!name) return undefined
          const normalized = name.toLowerCase()
          if (SKIP_VALUES.has(normalized)) return undefined
          return people.find(p => p.name.toLowerCase() === normalized)?.id
        }
        // Non-AV roles: return person ID if found, else raw name string (may not be in AV roster)
        const findNonAvName = (name: string): string | undefined => {
          if (!name) return undefined
          const normalized = name.toLowerCase()
          if (SKIP_VALUES.has(normalized)) return undefined
          return people.find(p => p.name.toLowerCase() === normalized)?.id ?? name
        }

        const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december']

        const parseDeckhandDate = (raw: string): string | undefined => {
          if (!raw || typeof raw !== 'string') return undefined
          // Deckhand format: "Wednesday June 10Wednesday\nJune 10" — use second part after \n
          const lineParts = raw.split(/[\n\r]/)
          let datePart: string
          if (lineParts.length > 1 && lineParts[1].trim()) {
            datePart = lineParts[1].trim()
          } else {
            datePart = lineParts[0].replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*/i, '').trim()
          }
          if (!datePart) return undefined
          // Parse "Month Day" directly to avoid timezone shifting from new Date()
          const m = datePart.match(/^([A-Za-z]+)\s+(\d{1,2})$/)
          if (!m) return undefined
          const monthIdx = MONTH_NAMES.indexOf(m[1].toLowerCase())
          const day = parseInt(m[2], 10)
          if (monthIdx < 0 || isNaN(day)) return undefined
          const now = new Date()
          const month = String(monthIdx + 1).padStart(2, '0')
          const dayStr = String(day).padStart(2, '0')
          // Use current year; fall back to next year if the month has already passed
          const year = (monthIdx + 1 < now.getMonth() + 1) ? now.getFullYear() + 1 : now.getFullYear()
          return `${year}-${month}-${dayStr}`
        }

        const DOW_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i

        // Col A label → ImportedAssignments field (compared lowercase, robust to row reordering)
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

        // Find all date header row indices.
        // A header row has at least one parseable date in any column (not just col 1),
        // since some blocks have "Regional Convention" in col A/B with real dates further right.
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

        if (headerRowIndices.length === 0) {
          toast.error('No dates found in the imported file. Check the file format.')
          return
        }

        const importedMap = new Map<string, ImportedAssignments>()

        for (let bi = 0; bi < headerRowIndices.length; bi++) {
          const headerRowIdx = headerRowIndices[bi]
          const nextHeaderRowIdx = bi + 1 < headerRowIndices.length
            ? headerRowIndices[bi + 1] : rows.length
          const headerRow = rows[headerRowIdx] as unknown[]

          // Parse date columns from the header row
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

          // Dynamically scan rows below this header for role labels in col A.
          // Mic 2 has no label — it's the first blank-label row immediately after Microphones.
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

          // For each date column, read values from the dynamically located role rows
          for (const { colIdx, date } of colDates) {
            const entry = importedMap.get(date)!

            for (const { field, rowIdx } of roleRowMap) {
              const raw = getCell(rows[rowIdx] as unknown[], colIdx)

              if (field === 'backup') {
                // Any cell value (even "unassigned") means the slot exists; blank means no slot
                entry.backupRequired = raw !== ''
                const pid = findPersonId(raw)
                if (pid !== undefined) entry.backup = pid
              } else if (field === 'reader' || field === 'entranceAttendant' || field === 'auditoriumAttendant') {
                const val = findNonAvName(raw)
                if (val !== undefined) entry[field] = val
              } else {
                const val = findPersonId(raw)
                if (val !== undefined) (entry as Record<string, string | undefined>)[field] = val
              }
            }
          }
        }

        if (importedMap.size === 0) {
          toast.error('No dates found in the imported file. Check the file format.')
          return
        }

        applyImportedMap(importedMap)
      } catch (err) {
        console.error('Import failed:', err)
        toast.error('Import failed. Check the file format and try again.')
      }
    }

    const reader = new FileReader()

    if (isPdf) {
      reader.onload = async (ev) => {
        try {
          const arrayBuffer = ev.target!.result as ArrayBuffer
          const pdfMap = await parseDeckhandPDF(arrayBuffer)

          if (pdfMap.size === 0) {
            toast.error('No dates found in the PDF. Check the file format.')
            return
          }

          const SKIP = new Set(['regional convention', 'unassigned', ''])
          const findId = (name: string | undefined): string | undefined => {
            if (!name) return undefined
            const n = name.toLowerCase()
            if (SKIP.has(n)) return undefined
            return people.find(p => p.name.toLowerCase() === n)?.id
          }
          // Non-AV roles: fall back to raw name string if person isn't in roster
          const findNonAvId = (name: string | undefined): string | undefined => {
            if (!name) return undefined
            const n = name.toLowerCase()
            if (SKIP.has(n)) return undefined
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

          applyImportedMap(resolvedMap)
        } catch (err) {
          console.error('PDF import failed:', err)
          toast.error('PDF import failed. Check the file format and try again.')
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
        processRows(rows)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  const handleExport = () => {
    const csv = exportCSV(meetings, people)
    triggerDownload(csv, 'av-roster.csv', 'text/csv')
  }

  const statusBadgeVariant = (status: string) => {
    if (status === 'Completed') return 'secondary'
    if (status === 'Cancelled') return 'destructive'
    return 'default'
  }

  const getCooldownClass = (meeting: Meeting, role: AvRole, personId?: string) => {
    if (!personId) return ''
    const result = checkCooldown(meetings, meeting, personId, role, cooldownDays)
    if (result.level === 'red') return 'bg-red-100 dark:bg-red-900/30'
    if (result.level === 'amber') return 'bg-amber-100 dark:bg-amber-900/30'
    return ''
  }

  const conflictMeeting = conflictPending ? meetings.find(m => m.id === conflictPending.meetingId) : null
  const conflictPerson = conflictPending ? people.find(p => p.id === conflictPending.personId) : null

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={handleAddMeeting}>
            <PlusCircle className="h-4 w-4 mr-1" />
            Add Meeting
          </Button>
          <button
            type="button"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            onClick={async () => {
              try {
                const [handle] = await window.showOpenFilePicker({
                  types: [{ description: 'Deckhand Schedules', accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
                  multiple: false,
                })
                importFile(await handle.getFile())
              } catch (err) {
                if (err instanceof Error && err.name !== 'AbortError') toast.error('Could not open file.')
              }
            }}
          >
            <Upload className="h-4 w-4 mr-1" />
            Import Schedule
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="show-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
            <Label htmlFor="show-completed" className="text-sm text-muted-foreground cursor-pointer">Show completed</Label>
          </div>
          <Button size="sm" variant="ghost" onClick={handleExport} className="text-muted-foreground">
            Export CSV
          </Button>
        </div>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden space-y-3">
        {sortedMeetings.map(meeting => {
          const isExpanded = expandedMobile === meeting.id

          return (
            <div key={meeting.id} className="border border-border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedMobile(isExpanded ? null : meeting.id)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{formatDate(meeting.date)}</span>
                  <Badge variant="outline" className="text-xs">{meeting.type}</Badge>
                  <Badge variant={statusBadgeVariant(meeting.status)} className="text-xs">{meeting.status}</Badge>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>

              {isExpanded && (
                <div className="border-t border-border p-3 space-y-2">
                  {/* AV roles */}
                  {AV_ROLES.map(role => {
                    const currentId = meeting.planned[role]
                    const cooldownClass = getCooldownClass(meeting, role, currentId)
                    const eligible = getPeopleForRole(people, role)

                    if (role === 'backup' && !meeting.backupRequired && meeting.status !== 'Completed') {
                      return (
                        <div key={role} className="grid grid-cols-2 gap-2 items-center rounded p-1">
                          <span className="text-xs font-medium text-muted-foreground">{ROLE_LABELS[role]}</span>
                          <button
                            className="h-8 px-3 text-xs text-left text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors border border-dashed border-muted-foreground/20 rounded-md"
                            onClick={() => handleToggleBackupRequired(meeting.id, true)}
                            disabled={meeting.status === 'Cancelled'}
                          >
                            Tap to add slot
                          </button>
                        </div>
                      )
                    }

                    return (
                      <div key={role} className={`grid grid-cols-2 gap-2 items-center rounded p-1 ${cooldownClass}`}>
                        <span className="text-xs font-medium text-muted-foreground">{ROLE_LABELS[role]}</span>
                        {meeting.status === 'Completed' ? (
                          <span className="text-sm">{getPersonName(people, meeting.completions[role]?.actual || meeting.planned[role]) || '—'}</span>
                        ) : (
                          <div className={role === 'backup' ? 'flex items-center gap-1' : undefined}>
                            <Select
                              value={currentId ?? '__none__'}
                              onValueChange={v => handleRoleAssign(meeting.id, role, v === '__none__' ? '' : v)}
                              disabled={meeting.status === 'Cancelled'}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue placeholder="Assign..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Unassigned —</SelectItem>
                                {eligible.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {role === 'backup' && !currentId && meeting.status === 'Planned' && (
                              <button
                                onClick={() => handleToggleBackupRequired(meeting.id, false)}
                                className="shrink-0 p-1 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
                                title="Remove backup slot"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <Separator className="my-2" />

                  {/* Non-AV roles — editable text for Planned meetings */}
                  {NON_AV_ROLES.map(role => (
                    <div key={role} className="grid grid-cols-2 gap-2 items-center">
                      <span className="text-xs font-medium text-muted-foreground">{ROLE_LABELS[role]}</span>
                      {meeting.status !== 'Planned' ? (
                        <span className="text-sm text-muted-foreground opacity-60">
                          {getPersonName(people, meeting.planned[role]) || meeting.planned[role] || '—'}
                        </span>
                      ) : (
                        <input
                          key={meeting.planned[role] ?? ''}
                          className="text-sm bg-transparent border-b border-dashed border-muted-foreground/30 focus:outline-none focus:border-primary px-0 py-0.5 text-muted-foreground w-full"
                          placeholder="—"
                          defaultValue={getPersonName(people, meeting.planned[role]) || meeting.planned[role] || ''}
                          onBlur={e => handleNonAvRoleEdit(meeting.id, role as NonAvRole, e.target.value.trim())}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        />
                      )}
                    </div>
                  ))}

                  <Separator className="my-2" />

                  {/* Meeting actions */}
                  <div className="flex flex-wrap gap-2">
                    {meeting.status === 'Planned' && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMarkCompleteMeeting(meeting)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Complete
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSuggestionsMeeting(meeting)}>
                          <Lightbulb className="h-3 w-3 mr-1" />
                          Suggest
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-muted-foreground" onClick={() => setCancelConfirm(meeting.id)}>
                          <XCircle className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      </>
                    )}
                    {meeting.status === 'Cancelled' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCancelConfirm(meeting.id)}>
                        Restore
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteConfirm({ meetingId: meeting.id, date: formatDate(meeting.date) })}>
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Desktop table layout */}
      <div className="hidden md:block">
        <table className="w-full min-w-[1200px] text-sm border-collapse">
          <thead className="sticky top-[104px] z-10 bg-background border-b border-border">
            <tr>
              <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap w-28">Date</th>
              <th className="text-left p-2 font-medium text-muted-foreground w-24">Type</th>
              <th className="text-left p-2 font-medium text-muted-foreground w-24">Status</th>
              {AV_ROLES.map(role => (
                <th key={role} className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap min-w-[120px]">
                  {ROLE_LABELS[role]}
                </th>
              ))}
              {NON_AV_ROLES.map(role => (
                <th key={role} className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap min-w-[120px] opacity-60">
                  {ROLE_LABELS[role]}
                </th>
              ))}
              <th className="text-left p-2 font-medium text-muted-foreground w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedMeetings.map((meeting, idx) => (
              <tr key={meeting.id} className={`border-b border-border hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                <td className="p-2 whitespace-nowrap font-medium">{formatDate(meeting.date)}</td>
                <td className="p-2">
                  <Badge variant="outline" className="text-xs">{meeting.type}</Badge>
                </td>
                <td className="p-2">
                  <Badge variant={statusBadgeVariant(meeting.status)} className="text-xs">{meeting.status}</Badge>
                </td>
                {AV_ROLES.map(role => {
                  const currentId = meeting.planned[role]
                  const cooldownClass = getCooldownClass(meeting, role, currentId)
                  const eligible = getPeopleForRole(people, role)

                  if (role === 'backup' && !meeting.backupRequired && meeting.status !== 'Completed') {
                    return (
                      <td key={role} className="p-1">
                        <button
                          className="h-7 w-full px-2 text-xs text-left text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
                          onClick={() => handleToggleBackupRequired(meeting.id, true)}
                          disabled={meeting.status === 'Cancelled'}
                          title="Click to add backup slot"
                        >—</button>
                      </td>
                    )
                  }

                  return (
                    <td key={role} className={`p-1 ${cooldownClass}`}>
                      {meeting.status === 'Completed' ? (
                        <span className="text-sm px-1">{getPersonName(people, meeting.completions[role]?.actual || meeting.planned[role]) || '—'}</span>
                      ) : (
                        <div className={role === 'backup' ? 'flex items-center' : undefined}>
                          <Select
                            value={currentId ?? '__none__'}
                            onValueChange={v => handleRoleAssign(meeting.id, role, v === '__none__' ? '' : v)}
                            disabled={meeting.status === 'Cancelled'}
                          >
                            <SelectTrigger className="h-7 text-xs border-0 shadow-none focus:ring-0 bg-transparent flex-1 min-w-0">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Unassigned —</SelectItem>
                              {eligible.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {role === 'backup' && !currentId && meeting.status === 'Planned' && (
                            <button
                              onClick={() => handleToggleBackupRequired(meeting.id, false)}
                              className="shrink-0 p-0.5 text-muted-foreground/20 hover:text-muted-foreground/60 transition-colors"
                              title="Remove backup slot"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )
                })}
                {NON_AV_ROLES.map(role => (
                  <td key={role} className="p-1">
                    {meeting.status !== 'Planned' ? (
                      <span className="text-sm px-2 opacity-60 text-muted-foreground">
                        {getPersonName(people, meeting.planned[role]) || meeting.planned[role] || '—'}
                      </span>
                    ) : (
                      <input
                        key={meeting.planned[role] ?? ''}
                        className="h-7 w-full px-2 text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-ring rounded text-muted-foreground placeholder:text-muted-foreground/40"
                        placeholder="—"
                        defaultValue={getPersonName(people, meeting.planned[role]) || meeting.planned[role] || ''}
                        onBlur={e => handleNonAvRoleEdit(meeting.id, role as NonAvRole, e.target.value.trim())}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      />
                    )}
                  </td>
                ))}
                <td className="p-1">
                  <div className="flex gap-1 items-center">
                    {meeting.status === 'Planned' && (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Mark Complete" onClick={() => setMarkCompleteMeeting(meeting)}>
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Suggestions" onClick={() => setSuggestionsMeeting(meeting)}>
                          <Lightbulb className="h-4 w-4 text-amber-500" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Cancel Meeting" onClick={() => setCancelConfirm(meeting.id)}>
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </>
                    )}
                    {meeting.status === 'Cancelled' && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCancelConfirm(meeting.id)}>Restore</Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Delete" onClick={() => setDeleteConfirm({ meetingId: meeting.id, date: formatDate(meeting.date) })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <ConflictModal
        open={!!conflictPending}
        personName={conflictPerson?.name ?? ''}
        existingRole={conflictPending?.existingRole ?? 'platform'}
        meetingDate={conflictMeeting ? formatDate(conflictMeeting.date) : ''}
        onReplace={handleConflictReplace}
        onBump={handleConflictBump}
        onCancel={() => setConflictPending(null)}
      />

      {markCompleteMeeting && (
        <MarkCompleteModal
          open={!!markCompleteMeeting}
          meeting={markCompleteMeeting}
          people={people}
          onSave={handleMarkComplete}
          onClose={() => setMarkCompleteMeeting(null)}
        />
      )}

      <SuggestionsDrawer
        open={!!suggestionsMeeting}
        meeting={suggestionsMeeting}
        meetings={meetings}
        people={people}
        onClose={() => setSuggestionsMeeting(null)}
        onAssign={handleSuggestionsAssign}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={v => { if (!v) setDeleteConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the {deleteConfirm?.date} meeting? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMeeting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel meeting confirmation */}
      <AlertDialog open={!!cancelConfirm} onOpenChange={v => { if (!v) setCancelConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {meetings.find(m => m.id === cancelConfirm)?.status === 'Cancelled' ? 'Restore Meeting' : 'Cancel Meeting'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {meetings.find(m => m.id === cancelConfirm)?.status === 'Cancelled'
                ? 'This will restore the meeting to Planned status.'
                : 'This will mark the meeting as Cancelled.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelMeeting}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
