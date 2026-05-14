import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { processXLSXRows, processPDFBuffer, applyImportedMap } from '../lib/import'
import { Button } from '@/components/ui/button'
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
  formatDate, formatDateShort, getPersonName, getPeopleForRole,
  getAllAssignedIds, getPersonRoleInMeeting, checkCooldown,
  exportCSV, triggerDownload, deriveStatus, countUnfilledRoles,
  isPersonCurrentlyUnavailable,
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
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      id: crypto.randomUUID(),
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
    const reader = new FileReader()

    const handleResult = (importedMap: Map<string, import('../lib/import').ImportedAssignments>) => {
      if (importedMap.size === 0) {
        toast.error('No dates found in the imported file. Check the file format.')
        return
      }
      const { meetings: finalMeetings, updatedCount, createdCount } = applyImportedMap(importedMap, meetings)
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

    if (isPdf) {
      reader.onload = async (ev) => {
        try {
          const importedMap = await processPDFBuffer(ev.target!.result as ArrayBuffer, people)
          handleResult(importedMap)
        } catch (err) {
          console.error('PDF import failed:', err)
          toast.error('PDF import failed. Check the file format and try again.')
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      reader.onload = async (ev) => {
        try {
          const { read, utils } = await import('xlsx')
          const data = new Uint8Array(ev.target!.result as ArrayBuffer)
          const workbook = read(data, { type: 'array', cellDates: true })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const rows = utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
          const importedMap = processXLSXRows(rows, people)
          if (importedMap.size === 0) {
            toast.error('No dates found in the imported file. Check the file format.')
            return
          }
          handleResult(importedMap)
        } catch (err) {
          console.error('Import failed:', err)
          toast.error('Import failed. Check the file format and try again.')
        }
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

  const getCooldownLevel = (meeting: Meeting, role: AvRole, personId?: string): 'red' | 'amber' | null => {
    if (!personId || meeting.status !== 'Planned') return null
    return checkCooldown(meetings, meeting, personId, role, cooldownDays).level
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) importFile(file)
              e.target.value = ''
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />
            Import Schedule
          </Button>
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
                  {meeting.status === 'Planned' && countUnfilledRoles(meeting) > 0 && (
                    <span className="text-xs text-muted-foreground/60">{countUnfilledRoles(meeting)} unfilled</span>
                  )}
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>

              {isExpanded && (
                <div className="border-t border-border p-3 space-y-2">
                  {/* AV roles */}
                  {AV_ROLES.map(role => {
                    const currentId = meeting.planned[role]
                    const cdLevel = getCooldownLevel(meeting, role, currentId)
                    const cellBg = cdLevel === 'red' ? 'bg-red-50 dark:bg-red-950/30' : cdLevel === 'amber' ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                    const triggerBg = cdLevel === 'red' ? 'bg-red-100/60 dark:bg-red-900/30' : cdLevel === 'amber' ? 'bg-amber-100/60 dark:bg-amber-900/20' : ''
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

                    const assignedPersonMobile = currentId ? people.find(p => p.id === currentId) : null
                    const unavailableMobile = assignedPersonMobile && isPersonCurrentlyUnavailable(assignedPersonMobile)

                    return (
                      <div key={role} className={`grid grid-cols-2 gap-2 items-start rounded p-1 ${cellBg}`}>
                        <span className="text-xs font-medium text-muted-foreground pt-2">{ROLE_LABELS[role]}</span>
                        {meeting.status === 'Completed' ? (
                          <span className="text-sm pt-1">{getPersonName(people, meeting.completions[role]?.actual || meeting.planned[role]) || '—'}</span>
                        ) : (
                          <div className={role === 'backup' ? 'flex items-start gap-1' : undefined}>
                            <div className="flex-1 min-w-0">
                              <Select
                                value={currentId ?? '__none__'}
                                onValueChange={v => handleRoleAssign(meeting.id, role, v === '__none__' ? '' : v)}
                                disabled={meeting.status === 'Cancelled'}
                              >
                                <SelectTrigger className={`h-8 text-xs w-full ${triggerBg}`}>
                                  <SelectValue placeholder="Assign..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— Unassigned —</SelectItem>
                                  {eligible.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {unavailableMobile && (
                                <span className="block text-[10px] text-orange-500 dark:text-orange-400 leading-tight mt-0.5">
                                  {assignedPersonMobile!.availability_status}
                                </span>
                              )}
                            </div>
                            {role === 'backup' && !currentId && meeting.status === 'Planned' && (
                              <button
                                onClick={() => handleToggleBackupRequired(meeting.id, false)}
                                className="shrink-0 p-1 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors mt-1"
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
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm border-separate border-spacing-0">
          <thead className="z-[2] bg-muted">
            <tr>
              <th className="sticky left-0 z-[3] bg-muted border-b border-border text-left px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap w-32 min-w-[128px]">Date</th>
              <th className="sticky left-32 z-[3] bg-muted border-b border-border text-left px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap w-20 min-w-[80px]">Type</th>
              <th className="sticky left-52 z-[3] bg-muted border-b border-border border-r border-border text-left px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24 min-w-[96px]">Status</th>
              {AV_ROLES.map(role => (
                <th key={role} className="border-b border-border text-left px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap min-w-[120px]">
                  {ROLE_LABELS[role]}
                </th>
              ))}
              {NON_AV_ROLES.map(role => (
                <th key={role} className="border-b border-border text-left px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap min-w-[120px] opacity-50">
                  {ROLE_LABELS[role]}
                </th>
              ))}
              <th className="border-b border-border text-left px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedMeetings.map((meeting, idx) => (
              <tr key={meeting.id} className={`group hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/5'}`}>
                <td className="sticky left-0 z-[1] bg-background group-hover:bg-muted transition-colors border-b border-border px-2 py-1 whitespace-nowrap">
                  <span className="font-medium text-sm">{formatDateShort(meeting.date)}</span>
                  {meeting.status === 'Planned' && countUnfilledRoles(meeting) > 0 && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground/50">{countUnfilledRoles(meeting)} gaps</span>
                  )}
                </td>
                <td className="sticky left-32 z-[1] bg-background group-hover:bg-muted transition-colors border-b border-border px-2 py-1 whitespace-nowrap">
                  <span className="text-xs text-muted-foreground/60">{meeting.type}</span>
                </td>
                <td className="sticky left-52 z-[1] bg-background group-hover:bg-muted transition-colors border-b border-border border-r border-border px-2 py-1">
                  {meeting.status === 'Completed' ? (
                    <Badge className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">Completed</Badge>
                  ) : meeting.status === 'Cancelled' ? (
                    <Badge variant="destructive" className="text-xs">Cancelled</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground/50 border-muted-foreground/25">Planned</Badge>
                  )}
                </td>
                {AV_ROLES.map(role => {
                  const currentId = meeting.planned[role]
                  const cdLevel = getCooldownLevel(meeting, role, currentId)
                  const cellBg = cdLevel === 'red' ? 'bg-red-50 dark:bg-red-950/30' : cdLevel === 'amber' ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                  const triggerBg = cdLevel === 'red' ? 'bg-red-100/60 dark:bg-red-900/30' : cdLevel === 'amber' ? 'bg-amber-100/60 dark:bg-amber-900/20' : 'bg-transparent'
                  const eligible = getPeopleForRole(people, role)

                  if (role === 'backup' && !meeting.backupRequired && meeting.status !== 'Completed') {
                    return (
                      <td key={role} className="p-1 border-b border-border">
                        <button
                          className="h-7 w-full px-2 text-xs text-left text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
                          onClick={() => handleToggleBackupRequired(meeting.id, true)}
                          disabled={meeting.status === 'Cancelled'}
                          title="Click to add backup slot"
                        >—</button>
                      </td>
                    )
                  }

                  const assignedPerson = currentId ? people.find(p => p.id === currentId) : null
                  const unavailable = assignedPerson && isPersonCurrentlyUnavailable(assignedPerson)

                  return (
                    <td key={role} className={`p-1 border-b border-border ${cellBg}`}>
                      {meeting.status === 'Completed' ? (
                        <span className={`text-sm px-1 ${getPersonName(people, meeting.completions[role]?.actual || meeting.planned[role]) ? 'font-medium' : 'text-muted-foreground/40'}`}>
                          {getPersonName(people, meeting.completions[role]?.actual || meeting.planned[role]) || '—'}
                        </span>
                      ) : (
                        <div className={role === 'backup' ? 'flex items-center' : undefined}>
                          <div className="flex-1 min-w-0">
                            <Select
                              value={currentId ?? '__none__'}
                              onValueChange={v => handleRoleAssign(meeting.id, role, v === '__none__' ? '' : v)}
                              disabled={meeting.status === 'Cancelled'}
                            >
                              <SelectTrigger className={`h-7 text-xs border-0 shadow-none focus:ring-0 ${triggerBg} w-full ${currentId ? 'font-medium' : 'text-muted-foreground/40'}`}>
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Unassigned —</SelectItem>
                                {eligible.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {unavailable && (
                              <span className="block px-1 text-[10px] text-orange-500 dark:text-orange-400 leading-tight">
                                {assignedPerson!.availability_status}
                              </span>
                            )}
                          </div>
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
                  <td key={role} className="p-1 border-b border-border">
                    {meeting.status !== 'Planned' ? (
                      <span className="text-sm px-2 text-muted-foreground/50">
                        {getPersonName(people, meeting.planned[role]) || meeting.planned[role] || '—'}
                      </span>
                    ) : (
                      <input
                        key={meeting.planned[role] ?? ''}
                        className={`h-7 w-full px-2 text-sm bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-ring rounded placeholder:text-muted-foreground/40 ${meeting.planned[role] ? 'font-medium' : 'text-muted-foreground/40'}`}
                        placeholder="—"
                        defaultValue={getPersonName(people, meeting.planned[role]) || meeting.planned[role] || ''}
                        onBlur={e => handleNonAvRoleEdit(meeting.id, role as NonAvRole, e.target.value.trim())}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      />
                    )}
                  </td>
                ))}
                <td className="p-1 border-b border-border">
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
