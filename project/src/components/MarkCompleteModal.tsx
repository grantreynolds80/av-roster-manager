import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Meeting, Person, AvRole, ActualAssignments } from '../types'
import { AV_ROLES, ROLE_LABELS } from '../types'
import { getPersonName } from '../lib/utils-roster'

interface RowState {
  showed: boolean
  fillInId: string
}

interface MarkCompleteModalProps {
  open: boolean
  meeting: Meeting
  people: Person[]
  onSave: (actual: ActualAssignments) => void
  onClose: () => void
}

export function MarkCompleteModal({ open, meeting, people, onSave, onClose }: MarkCompleteModalProps) {
  const [rows, setRows] = useState<Record<AvRole, RowState>>(() => {
    const init = {} as Record<AvRole, RowState>
    for (const role of AV_ROLES) {
      init[role] = { showed: true, fillInId: '' }
    }
    return init
  })

  const handleSave = () => {
    const actual: ActualAssignments = {}
    for (const role of AV_ROLES) {
      const row = rows[role]
      const planned = meeting.planned[role]
      if (row.showed && planned) {
        actual[role] = planned
      } else if (!row.showed && row.fillInId) {
        actual[role] = row.fillInId
      } else if (planned) {
        actual[role] = planned
      }
    }
    onSave(actual)
  }

  const toggleShowed = (role: AvRole) => {
    setRows(prev => ({ ...prev, [role]: { ...prev[role], showed: !prev[role].showed } }))
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark Meeting Complete</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-2 px-1 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>Role</span>
            <span>Planned</span>
            <span>Fill-in</span>
          </div>
          {AV_ROLES.map(role => {
            const planned = meeting.planned[role]
            const plannedName = getPersonName(people, planned)
            const row = rows[role]
            const eligible = people.filter(p => p[role] && p.availability_status === 'Available')

            return (
              <div key={role} className="grid grid-cols-3 gap-2 items-center py-1.5 border-b border-border last:border-0">
                <span className="text-sm font-medium">{ROLE_LABELS[role]}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground truncate">{plannedName || '—'}</span>
                  {planned && (
                    <button
                      onClick={() => toggleShowed(role)}
                      className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium transition-colors ${
                        row.showed
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {row.showed ? 'Showed' : 'No-show'}
                    </button>
                  )}
                </div>
                <div>
                  {(!row.showed || !planned) && (
                    <Select value={row.fillInId} onValueChange={v => setRows(prev => ({ ...prev, [role]: { ...prev[role], fillInId: v } }))}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Fill-in..." />
                      </SelectTrigger>
                      <SelectContent>
                        {eligible.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
