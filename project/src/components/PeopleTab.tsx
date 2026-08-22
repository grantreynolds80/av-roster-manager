import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CirclePlus as PlusCircle, Trash2, Search } from 'lucide-react'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction
} from '@/components/ui/alert-dialog'
import type { Meeting, Person } from '../types'
import { AV_ROLES, ROLE_LABELS } from '../types'
import { formatDateShort, getUnavailabilityState } from '../lib/utils-roster'
import { PersonEditModal } from './PersonEditModal'
import { AssignmentHistoryModal } from './AssignmentHistoryModal'

interface PeopleTabProps {
  people: Person[]
  meetings: Meeting[]
  onUpdatePeople: (people: Person[]) => void
  onUpdateMeetings: (meetings: Meeting[]) => void
}

const AVAILABILITY_COLORS: Record<string, string> = {
  Available: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Holiday: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Unavailable: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Medical: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

export function PeopleTab({ people, meetings, onUpdatePeople, onUpdateMeetings }: PeopleTabProps) {
  const [search, setSearch] = useState('')
  const [editPerson, setEditPerson] = useState<Person | null | 'new'>(null)
  const [historyPerson, setHistoryPerson] = useState<Person | null>(null)
  const [deletePersonId, setDeletePersonId] = useState<string | null>(null)

  const filtered = [...people]
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  const handleSavePerson = (person: Person) => {
    if (editPerson === 'new') {
      onUpdatePeople([...people, person])
    } else {
      onUpdatePeople(people.map(p => p.id === person.id ? person : p))
    }
    setEditPerson(null)
  }

  const handleDeletePerson = () => {
    if (!deletePersonId) return
    onUpdatePeople(people.filter(p => p.id !== deletePersonId))
    onUpdateMeetings(meetings.map(m => {
      const planned = { ...m.planned }
      let changed = false
      for (const key of Object.keys(planned) as Array<keyof typeof planned>) {
        if (planned[key] === deletePersonId) {
          planned[key] = undefined
          changed = true
        }
      }
      return changed ? { ...m, planned } : m
    }))
    setDeletePersonId(null)
  }

  const deletePerson = people.find(p => p.id === deletePersonId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search people…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Button size="sm" onClick={() => setEditPerson('new')}>
          <PlusCircle className="h-4 w-4 mr-1" />
          Add Person
        </Button>
      </div>

      <div className="space-y-1">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {search ? 'No people match your search.' : 'No people added yet.'}
          </p>
        )}
        {filtered.map(person => {
          const unavailState = getUnavailabilityState(person)
          const roleLabels = AV_ROLES.filter(r => person[r]).map(r => ROLE_LABELS[r])

          return (
            <div
              key={person.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors group ${person.suspended ? 'opacity-50' : ''}`}
            >
              <button
                className="flex-1 min-w-0 text-left flex items-center gap-3 flex-wrap"
                onClick={() => setHistoryPerson(person)}
              >
                <span className="font-medium text-sm">{person.name}</span>
                {person.suspended && (
                  <span className="shrink-0 text-xs px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground border border-border">
                    Suspended
                  </span>
                )}

                {(unavailState === 'active' || unavailState === 'upcoming') && (
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${AVAILABILITY_COLORS[person.availability_status]}`}>
                    {unavailState === 'active' ? person.availability_status : `${person.availability_status} (upcoming)`}
                  </span>
                )}

                {person.unavailable_until && unavailState === 'active' && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    until {formatDateShort(person.unavailable_until)}
                  </span>
                )}

                <div className="hidden sm:flex flex-wrap gap-1">
                  {roleLabels.map(label => (
                    <span key={label} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {label}
                    </span>
                  ))}
                  {roleLabels.length === 0 && (
                    <span className="text-xs text-muted-foreground/40 italic">No roles</span>
                  )}
                </div>
              </button>

              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditPerson(person)}>
                  Edit
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeletePersonId(person.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <PersonEditModal
        open={editPerson !== null}
        person={editPerson === 'new' ? null : editPerson}
        onSave={handleSavePerson}
        onClose={() => setEditPerson(null)}
      />

      <AssignmentHistoryModal
        open={!!historyPerson}
        person={historyPerson}
        meetings={meetings}
        onClose={() => setHistoryPerson(null)}
      />

      <AlertDialog open={!!deletePersonId} onOpenChange={v => { if (!v) setDeletePersonId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Person</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {deletePerson?.name}? They will be unassigned from all planned meetings. Completed meeting records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePerson}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
