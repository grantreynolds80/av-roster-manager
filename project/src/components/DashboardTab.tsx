import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { Meeting, Person } from '../types'
import { computeStats } from '../lib/utils-roster'
import { AssignmentHistoryModal } from './AssignmentHistoryModal'

type SortKey = 'name' | 'platform' | 'mic' | 'audio' | 'video' | 'backup' | 'vc' | 'total' | 'rate'

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
    const rate = (s: typeof a) => s.assignedCompletedTotal === 0 ? -1 : s.fulfilledTotal / s.assignedCompletedTotal
    if (sortKey === 'rate') return sortAsc ? rate(a) - rate(b) : rate(b) - rate(a)
    const va = sortKey === 'mic' ? a.mic1 + a.mic2 : (a[sortKey] as number) ?? 0
    const vb = sortKey === 'mic' ? b.mic1 + b.mic2 : (b[sortKey] as number) ?? 0
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
    { key: 'mic', label: 'Mic' },
    { key: 'audio', label: 'Audio' },
    { key: 'video', label: 'Video' },
    { key: 'backup', label: 'Bkup' },
    { key: 'vc', label: 'VC' },
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
                <th className="text-left p-2 sticky left-0 z-10 bg-background">
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
                <th className="text-center p-2">
                  <button className="group flex items-center justify-center gap-1 font-medium hover:text-foreground w-full" onClick={() => handleSort('rate')}>
                    Rate <SortIcon k="rate" />
                  </button>
                </th>
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
                    <td className="p-2 font-medium sticky left-0 z-10 bg-background">{person.name}</td>
                    {STAT_COLS.map(col => {
                      const val = col.key === 'mic' ? stat.mic1 + stat.mic2 : (stat[col.key] as number)
                      return (
                        <td key={col.key} className="p-2 text-center text-muted-foreground">
                          {val || '—'}
                        </td>
                      )
                    })}
                    <td className="p-2 text-center text-muted-foreground">
                      {stat.assignedCompletedTotal === 0 ? '—' : `${Math.round((stat.fulfilledTotal / stat.assignedCompletedTotal) * 100)}%`}
                    </td>
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
