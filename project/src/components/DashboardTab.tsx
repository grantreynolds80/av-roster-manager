import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { Meeting, Person } from '../types'
import { computeStats } from '../lib/utils-roster'
import { AssignmentHistoryModal } from './AssignmentHistoryModal'

type SortKey = 'name' | 'platform' | 'mic1' | 'mic2' | 'audio' | 'video' | 'backup' | 'vc' | 'reader' | 'entranceAttendant' | 'auditoriumAttendant' | 'total'

interface DashboardTabProps {
  meetings: Meeting[]
  people: Person[]
}

export function DashboardTab({ meetings, people }: DashboardTabProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [historyPerson, setHistoryPerson] = useState<Person | null>(null)

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

      <AssignmentHistoryModal
        open={!!historyPerson}
        person={historyPerson}
        meetings={meetings}
        onClose={() => setHistoryPerson(null)}
      />
    </div>
  )
}
