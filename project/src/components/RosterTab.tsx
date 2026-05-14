import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { parseDeckhandPDF } from '../lib/pdf-import'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction
} from '@/components/ui/alert-dialog'
import { CirclePlus as PlusCircle, Upload, CircleCheck as CheckCircle2, Circle as XCircle, Trash2, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'
import type { Meeting, Person, AvRole, AnyRole, ActualAssignments, PlannedAssignments } from '../types'
import { AV_ROLES, NON_AV_ROLES, ROLE_LABELS } from '../types'
import {
  formatDate, getPersonName, getPeopleForRole,
  getAllAssignedIds, getPersonRoleInMeeting, checkCooldown,
  exportCSV, triggerDownload
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sortedMeetings = [...meetings].sort((a, b) => a.date.localeCompare(b.date))

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

  const handleMarkComplete = (actual: ActualAssignments) => {
    if (!markCompleteMeeting) return
    onUpdateMeetings(meetings.map(m =>
      m.id === markCompleteMeeting.id ? { ...m, actual, status: 'Completed' } : m
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
      planned: {},
      actual: {},
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

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const isPdf = file.name.toLowerCase().endsWith('.pdf')
    const isCsv = file.name.toLowerCase().endsWith('.csv')

    type ImportedAssignments = {
      reader?: string; entranceAttendant?: string; auditoriumAttendant?: string
      platform?: string; mic1?: string; mic2?: string
      audio?: string; video?: string; backup?: string; vc?: string
    }

    const applyImportedMap = (importedMap: Map<string, ImportedAssignments>) => {
      let updatedCount = 0
      let createdCount = 0

      const updatedMeetings = meetings.map(meeting => {
        const imp = importedMap.get(meeting.date)
        if (!imp) return meeting

        const newPlanned = { ...meeting.planned }
        let changed = false

        const setIfEmpty = (field: keyof typeof newPlanned, val?: string) => {
          if (val && !newPlanned[field]) { newPlanned[field] = val; changed = true }
        }
        const setAlways = (field: keyof typeof newPlanned, val?: string) => {
          if (val && newPlanned[field] !== val) { newPlanned[field] = val; changed = true }
        }

        setAlways('reader', imp.reader)
        setAlways('entranceAttendant', imp.entranceAttendant)
        setAlways('auditoriumAttendant', imp.auditoriumAttendant)
        setIfEmpty('platform', imp.platform)
        setIfEmpty('mic1', imp.mic1)
        setIfEmpty('mic2', imp.mic2)
        setIfEmpty('audio', imp.audio)
        setIfEmpty('video', imp.video)
        setIfEmpty('backup', imp.backup)
        setIfEmpty('vc', imp.vc)

        if (changed) updatedCount++
        return changed ? { ...meeting, planned: newPlanned } : meeting
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
          actual: {},
        })
        createdCount++
      }

      const finalMeetings = [...updatedMeetings, ...newMeetings]
        .sort((a, b) => a.date.localeCompare(b.date))

      onUpdateMeetings(finalMeetings)

      const parts: string[] = []
      if (createdCount > 0) parts.push(`${createdCount} meeting${createdCount !== 1 ? 's' : ''} created`)
      if (updatedCount > 0) parts.push(`${updatedCount} meeting${updatedCount !== 1 ? 's' : ''} updated`)
      if (parts.length === 0) {
        toast.info('Import complete — no changes were needed.')
      } else {
        toast.success(`Import complete: ${parts.join(', ')}.`)
      }
    }

    const processRows = (rows: unknown[][]) => {
      try {
        // Values to treat as empty
        const SKIP_VALUES = new Set(['regional convention', 'unassigned', ''])

        const getCell = (row: unknown[] | undefined, col: number): string => {
          const v = row?.[col]
          if (typeof v === 'string') return v.replace(/\n.*/s, '').trim()
          if (typeof v === 'number') return String(v)
          return ''
        }

        const findPersonByName = (name: string): string | undefined => {
          if (!name) return undefined
          const normalized = name.toLowerCase()
          if (SKIP_VALUES.has(normalized)) return undefined
          return people.find(p => p.name.toLowerCase() === normalized)?.id
        }

        // Parse a Deckhand date-header cell to YYYY-MM-DD.
        // Cells look like "Wednesday June 10Wednesday\nJune 10" (duplicated with newline).
        // Take the text before the first newline, then parse "Month Day" with a guessed year.
        const parseDeckhandDate = (raw: string): string | undefined => {
          if (!raw || typeof raw !== 'string') return undefined

          // Try native Date first (handles ISO strings, xlsx-parsed dates)
          const direct = new Date(raw)
          if (!isNaN(direct.getTime())) return direct.toISOString().split('T')[0]

          // Strip duplicate suffix after newline
          const firstLine = raw.split(/[\n\r]/)[0].trim()
          // Remove day-of-week prefix: "Wednesday June 10" → "June 10"
          const withoutDow = firstLine.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*/i, '').trim()
          if (!withoutDow) return undefined

          // Try parsing "June 10" — Date.parse needs a year; guess current year first, then +1
          const now = new Date()
          for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
            const attempt = new Date(`${withoutDow} ${year}`)
            if (!isNaN(attempt.getTime())) {
              return attempt.toISOString().split('T')[0]
            }
          }
          return undefined
        }

        // Collect all date-column entries across all blocks.
        // A "date header row" is any row where column 1 contains a day-of-week word.
        // Deckhand layout (relative to header row, 0-based offset):
        //   +0 = date headers
        //   +1 = Chairman
        //   +2 = Reader
        //   +3 = Entrance Attendant
        //   +4 = Auditorium Attendant
        //   +5 = Welcoming
        //   +6 = Welcoming line 2 (blank label)
        //   +7 = Platform
        //   +8 = Mic 1
        //   +9 = Mic 2 (blank label)
        //   +10 = Security
        //   +11 = Videoconference Attendant
        //   +12 = Audio Operator
        //   +13 = Video Operator
        //   +14 = Audio/Video Operator (Backup)
        const DOW_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i

        type DateEntry = {
          rowBase: number
          colIdx: number
          date: string
        }

        const entries: DateEntry[] = []

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r] as unknown[]
          const cell1 = typeof row[1] === 'string' ? row[1] : ''
          if (!DOW_RE.test(cell1)) continue

          // This is a date header row — scan all columns for dates
          for (let c = 1; c < row.length; c++) {
            const cellVal = row[c]
            let dateStr: string | undefined

            if (cellVal instanceof Date) {
              dateStr = cellVal.toISOString().split('T')[0]
            } else if (typeof cellVal === 'number') {
              const parsed = XLSX.SSF.parse_date_code(cellVal)
              if (parsed) dateStr = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
            } else if (typeof cellVal === 'string' && cellVal.trim()) {
              dateStr = parseDeckhandDate(cellVal)
            }

            if (dateStr) entries.push({ rowBase: r, colIdx: c, date: dateStr })
          }
        }

        if (entries.length === 0) {
          toast.error('No dates found in the imported file. Check the file format.')
          return
        }

        const importedMap = new Map<string, ImportedAssignments>()

        for (const { rowBase, colIdx, date } of entries) {
          const r = rows
          const off = (n: number) => r[rowBase + n] as unknown[] | undefined

          const assignments: ImportedAssignments = {
            reader:              findPersonByName(getCell(off(2), colIdx)),
            entranceAttendant:   findPersonByName(getCell(off(3), colIdx)),
            auditoriumAttendant: findPersonByName(getCell(off(4), colIdx)),
            platform:            findPersonByName(getCell(off(7), colIdx)),
            mic1:                findPersonByName(getCell(off(8), colIdx)),
            mic2:                findPersonByName(getCell(off(9), colIdx)),
            vc:                  findPersonByName(getCell(off(11), colIdx)),
            audio:               findPersonByName(getCell(off(12), colIdx)),
            video:               findPersonByName(getCell(off(13), colIdx)),
            backup:              findPersonByName(getCell(off(14), colIdx)),
          }
          importedMap.set(date, assignments)
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

          // Resolve raw name strings → person IDs
          const SKIP = new Set(['regional convention', 'unassigned', ''])
          const findId = (name: string | undefined): string | undefined => {
            if (!name) return undefined
            const n = name.toLowerCase()
            if (SKIP.has(n)) return undefined
            return people.find(p => p.name.toLowerCase() === n)?.id
          }

          const resolvedMap = new Map<string, ImportedAssignments>()
          for (const [date, raw] of pdfMap) {
            resolvedMap.set(date, {
              reader:              findId(raw.reader),
              entranceAttendant:   findId(raw.entranceAttendant),
              auditoriumAttendant: findId(raw.auditoriumAttendant),
              platform:            findId(raw.platform),
              mic1:                findId(raw.mic1),
              mic2:                findId(raw.mic2),
              audio:               findId(raw.audio),
              video:               findId(raw.video),
              backup:              findId(raw.backup),
              vc:                  findId(raw.vc),
            })
          }

          applyImportedMap(resolvedMap)
        } catch (err) {
          console.error('PDF import failed:', err)
          toast.error('PDF import failed. Check the file format and try again.')
        }
      }
      reader.readAsArrayBuffer(file)
    } else if (isCsv) {
      reader.onload = (ev) => {
        const text = ev.target!.result as string
        const workbook = XLSX.read(text, { type: 'string' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
        processRows(rows)
      }
      reader.readAsText(file)
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
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />
            Import Schedule
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden" onChange={handleImport} />
        </div>
        <Button size="sm" variant="ghost" onClick={handleExport} className="text-muted-foreground">
          Export CSV
        </Button>
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

                    return (
                      <div key={role} className={`grid grid-cols-2 gap-2 items-center rounded p-1 ${cooldownClass}`}>
                        <span className="text-xs font-medium text-muted-foreground">{ROLE_LABELS[role]}</span>
                        {meeting.status === 'Completed' ? (
                          <span className="text-sm">{getPersonName(people, meeting.actual[role] || meeting.planned[role])}</span>
                        ) : (
                          <Select
                            value={currentId ?? '__none__'}
                            onValueChange={v => handleRoleAssign(meeting.id, role, v === '__none__' ? '' : v)}
                            disabled={meeting.status === 'Cancelled'}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Assign..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Unassigned —</SelectItem>
                              {eligible.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )
                  })}

                  <Separator className="my-2" />

                  {/* Non-AV roles (read-only, greyed) */}
                  {NON_AV_ROLES.map(role => (
                    <div key={role} className="grid grid-cols-2 gap-2 items-center opacity-60">
                      <span className="text-xs font-medium text-muted-foreground">{ROLE_LABELS[role]}</span>
                      <span className="text-sm text-muted-foreground">{getPersonName(people, meeting.planned[role]) || '—'}</span>
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
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-background border-b border-border">
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

                  return (
                    <td key={role} className={`p-1 ${cooldownClass}`}>
                      {meeting.status === 'Completed' ? (
                        <span className="text-sm px-1">{getPersonName(people, meeting.actual[role] || meeting.planned[role]) || '—'}</span>
                      ) : (
                        <Select
                          value={currentId ?? '__none__'}
                          onValueChange={v => handleRoleAssign(meeting.id, role, v === '__none__' ? '' : v)}
                          disabled={meeting.status === 'Cancelled'}
                        >
                          <SelectTrigger className="h-7 text-xs border-0 shadow-none focus:ring-0 bg-transparent">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Unassigned —</SelectItem>
                            {eligible.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                  )
                })}
                {NON_AV_ROLES.map(role => (
                  <td key={role} className="p-2 opacity-60 text-muted-foreground">
                    {getPersonName(people, meeting.planned[role]) || '—'}
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
