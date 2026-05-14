import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ChevronUp, ChevronDown, CirclePlus as PlusCircle, Trash2, UserX } from 'lucide-react'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction
} from '@/components/ui/alert-dialog'
import type { Meeting, Person } from '../types'
import { AV_ROLES, ROLE_LABELS } from '../types'
import { computeStats } from '../lib/utils-roster'
import { PersonEditModal } from './PersonEditModal'
import { AssignmentHistoryModal } from './AssignmentHistoryModal'

type SortKey = 'name' | 'platform' | 'mic1' | 'mic2' | 'audio' | 'video' | 'backup' | 'vc' | 'reader' | 'entranceAttendant' | 'auditoriumAttendant' | 'total'

interface DashboardTabProps {
  meetings: Meeting[]
  people: Person[]
  onUpdatePeople: (people: Person[]) => void
  onUpdateMeetings: (meetings: Meeting[]) => void
}

const AVAILABILITY_COLORS: Record<string, string> = {
  Available: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Holiday: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Unavailable: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Medical: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

export function DashboardTab({ meetings, people, onUpdatePeople, onUpdateMeetings }: DashboardTabProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [editPerson, setEditPerson] = useState<Person | null | 'new'>(null)
  const [historyPerson, setHistoryPerson] = useState<Person | null>(null)
  const [deletePersonId, setDeletePersonId] = useState<string | null>(null)

  const stats = useMemo(() => computeStats(meetings, people), [meetings, people])

  const sortedStats = [...stats].sort((a, b) => {
    if (sortKey === 'name') {
      const nameA = people.find(p => p.id === a.personId)?.name ?? ''
      const nameB = people.find(p => p.id === b.personId)?.name ?? ''
      return sortAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
    }
    const va = (a[sortKey] as number) ?? 0
    const vb = (b[sortKey] as number) ?? 0
    return sortAsc ? va - vb : vb - va
  })

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronUp className="h-3 w-3 opacity-0 group-hover:opacity-40" />
    return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

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

  const unavailablePeople = people.filter(p => p.availability_status !== 'Available')
  const availablePeople = people.filter(p => p.availability_status === 'Available')

  const STAT_COLS: Array<{ key: SortKey; label: string }> = [
    { key: 'platform', label: 'Plat' },
    { key: 'mic1', label: 'Mic 1' },
    { key: 'mic2', label: 'Mic 2' },
    { key: 'audio', label: 'Audio' },
    { key: 'video', label: 'Video' },
    { key: 'backup', label: 'Bkup' },
    { key: 'vc', label: 'VC' },
    { key: 'reader', label: 'Read' },
    { key: 'entranceAttendant', label: 'Entr' },
    { key: 'auditoriumAttendant', label: 'Aud' },
    { key: 'total', label: 'Total' },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Section */}
      <div>
        <h2 className="text-base font-semibold mb-3">Rolling 6-Month Stats</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2">
                  <button className="group flex items-center gap-1 font-medium hover:text-foreground" onClick={() => handleSort('name')}>
                    Name <SortIcon k="name" />
                  </button>
                </th>
                {STAT_COLS.map(col => (
                  <th key={col.key} className="text-center p-2">
                    <button className="group flex items-center justify-center gap-1 font-medium hover:text-foreground w-full" onClick={() => handleSort(col.key)}>
                      {col.label} <SortIcon k={col.key} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedStats.map(stat => {
                const person = people.find(p => p.id === stat.personId)
                if (!person) return null
                return (
                  <tr
                    key={stat.personId}
                    className="border-b border-border hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => setHistoryPerson(person)}
                  >
                    <td className="p-2 font-medium">{person.name}</td>
                    {STAT_COLS.map(col => (
                      <td key={col.key} className="p-2 text-center text-muted-foreground">
                        {(stat[col.key] as number) || '—'}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Separator />

      {/* People Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">People</h2>
          <Button size="sm" onClick={() => setEditPerson('new')}>
            <PlusCircle className="h-4 w-4 mr-1" />
            Add Person
          </Button>
        </div>

        {/* Unavailable section */}
        {unavailablePeople.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
              <UserX className="h-3.5 w-3.5" />
              Currently Unavailable
            </h3>
            <div className="space-y-1">
              {unavailablePeople.map(person => (
                <PersonRow
                  key={person.id}
                  person={person}
                  onEdit={() => setEditPerson(person)}
                  onDelete={() => setDeletePersonId(person.id)}
                  onHistory={() => setHistoryPerson(person)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Available people */}
        <div className="space-y-1">
          {availablePeople.map(person => (
            <PersonRow
              key={person.id}
              person={person}
              onEdit={() => setEditPerson(person)}
              onDelete={() => setDeletePersonId(person.id)}
              onHistory={() => setHistoryPerson(person)}
            />
          ))}
        </div>
      </div>

      {/* Person edit modal */}
      <PersonEditModal
        open={editPerson !== null}
        person={editPerson === 'new' ? null : editPerson}
        onSave={handleSavePerson}
        onClose={() => setEditPerson(null)}
      />

      {/* History modal */}
      <AssignmentHistoryModal
        open={!!historyPerson}
        person={historyPerson}
        meetings={meetings}
        onClose={() => setHistoryPerson(null)}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletePersonId} onOpenChange={v => { if (!v) setDeletePersonId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Person</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {people.find(p => p.id === deletePersonId)?.name}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePerson} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface PersonRowProps {
  person: Person
  onEdit: () => void
  onDelete: () => void
  onHistory: () => void
}

function PersonRow({ person, onEdit, onDelete, onHistory }: PersonRowProps) {
  const roleIcons: string[] = []
  for (const role of AV_ROLES) {
    if (person[role]) roleIcons.push(ROLE_LABELS[role])
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors group">
      <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={onHistory}>
        <span className="font-medium text-sm truncate">{person.name}</span>
        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${AVAILABILITY_COLORS[person.availability_status]}`}>
          {person.availability_status}
        </span>
      </button>

      <div className="hidden sm:flex flex-wrap gap-1 max-w-xs">
        {roleIcons.map(label => (
          <span key={label} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {label}
          </span>
        ))}
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEdit}>Edit</Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  )
}
