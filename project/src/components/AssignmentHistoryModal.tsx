import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { Meeting, Person } from '../types'
import { AV_ROLES, NON_AV_ROLES, ROLE_LABELS } from '../types'
import { formatDate } from '../lib/utils-roster'

interface AssignmentHistoryModalProps {
  open: boolean
  person: Person | null
  meetings: Meeting[]
  onClose: () => void
}

export function AssignmentHistoryModal({ open, person, meetings, onClose }: AssignmentHistoryModalProps) {
  if (!person) return null

  const history = meetings
    .filter(m => {
      const allAssignments = [
        ...AV_ROLES.map(r => (m.status === 'Completed' ? m.actual[r] : m.planned[r])),
        ...NON_AV_ROLES.map(r => m.planned[r]),
      ]
      return allAssignments.includes(person.id)
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  const getRolesForPerson = (meeting: Meeting) => {
    const roles: string[] = []
    const assignments = meeting.status === 'Completed' ? meeting.actual : meeting.planned
    for (const role of AV_ROLES) {
      if ((assignments as Record<string, string | undefined>)[role] === person.id) {
        roles.push(ROLE_LABELS[role])
      }
    }
    for (const role of NON_AV_ROLES) {
      if (meeting.planned[role] === person.id) {
        roles.push(ROLE_LABELS[role])
      }
    }
    return roles
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person.name} — Assignment History</DialogTitle>
        </DialogHeader>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No assignments recorded yet.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {history.map(meeting => (
              <div key={meeting.id} className="flex items-start justify-between gap-2 py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{formatDate(meeting.date)}</p>
                  <p className="text-xs text-muted-foreground">{meeting.type}</p>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {getRolesForPerson(meeting).map(role => (
                    <Badge key={role} variant="secondary" className="text-xs">{role}</Badge>
                  ))}
                  <Badge
                    variant={meeting.status === 'Completed' ? 'secondary' : meeting.status === 'Cancelled' ? 'destructive' : 'default'}
                    className="text-xs"
                  >
                    {meeting.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
