import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Meeting, Person, AvRole, RoleCompletion } from '../types'
import { AV_ROLES, ROLE_LABELS } from '../types'
import { getPersonName } from '../lib/utils-roster'

interface RowState {
  noshow: boolean
  fillInId: string  // person id when noshow=true, otherwise unused
}

interface MarkCompleteModalProps {
  open: boolean
  meeting: Meeting
  people: Person[]
  onSave: (completions: Partial<Record<AvRole, RoleCompletion>>) => void
  onClose: () => void
}

function initRows(meeting: Meeting): Record<AvRole, RowState> {
  const rows = {} as Record<AvRole, RowState>
  for (const role of AV_ROLES) {
    const existing = meeting.completions[role]
    if (existing && existing.actual !== null) {
      rows[role] = {
        noshow: existing.noshow,
        fillInId: existing.noshow ? (existing.actual || '') : '',
      }
    } else {
      rows[role] = { noshow: false, fillInId: '' }
    }
  }
  return rows
}

export function MarkCompleteModal({ open, meeting, people, onSave, onClose }: MarkCompleteModalProps) {
  const [rows, setRows] = useState<Record<AvRole, RowState>>(() => initRows(meeting))

  useEffect(() => {
    setRows(initRows(meeting))
  }, [meeting])

  const activeRoles = meeting.backupRequired ? AV_ROLES : AV_ROLES.filter(r => r !== 'backup')

  const toggleNoshow = (role: AvRole) => {
    setRows(prev => ({
      ...prev,
      [role]: { noshow: !prev[role].noshow, fillInId: '' },
    }))
  }

  const handleSave = () => {
    const completions: Partial<Record<AvRole, RoleCompletion>> = {}
    for (const role of activeRoles) {
      const row = rows[role]
      const plannedId = meeting.planned[role]
      if (row.noshow) {
        completions[role] = { actual: row.fillInId || '', noshow: true }
      } else {
        completions[role] = { actual: plannedId || '', noshow: false }
      }
    }
    onSave(completions)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark Meeting Complete</DialogTitle>
        </DialogHeader>

        <div className="space-y-0">
          {/* Column headers */}
          <div className="grid grid-cols-[100px_1fr_80px_1fr] gap-x-3 px-1 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
            <span>Role</span>
            <span>Planned</span>
            <span className="text-center">Showed?</span>
            <span>Actual</span>
          </div>

          {activeRoles.map(role => {
            const plannedId = meeting.planned[role]
            const plannedName = getPersonName(people, plannedId)
            const row = rows[role]
            // All people qualified for this role (including unavailable — fill-ins may come from anywhere)
            const qualified = people.filter(p => p[role])

            return (
              <div
                key={role}
                className="grid grid-cols-[100px_1fr_80px_1fr] gap-x-3 items-center py-2 border-b border-border last:border-0"
              >
                {/* Role */}
                <span className="text-sm font-medium">{ROLE_LABELS[role]}</span>

                {/* Planned */}
                <span className={`text-sm truncate ${row.noshow ? 'line-through text-muted-foreground/50' : 'text-muted-foreground'}`}>
                  {plannedName || '—'}
                </span>

                {/* Showed? toggle */}
                <div className="flex justify-center">
                  {plannedId ? (
                    <button
                      onClick={() => toggleNoshow(role)}
                      className={`text-xs px-1.5 py-0.5 rounded font-medium transition-colors ${
                        row.noshow
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      }`}
                    >
                      {row.noshow ? 'No-show' : 'Showed'}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                </div>

                {/* Actual */}
                <div>
                  {row.noshow || !plannedId ? (
                    <Select
                      value={row.fillInId || '__none__'}
                      onValueChange={v => setRows(prev => ({
                        ...prev,
                        [role]: { ...prev[role], fillInId: v === '__none__' ? '' : v },
                      }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Fill-in…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Nobody —</SelectItem>
                        {qualified.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm text-muted-foreground px-1 truncate block">
                      {plannedName || '—'}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save & Complete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
