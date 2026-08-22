import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { Meeting, Person } from '../types'
import { computeStats } from '../lib/utils-roster'
import { AssignmentHistoryModal } from './AssignmentHistoryModal'

type SortKey = 'name' | 'platform' | 'mic' | 'audio' | 'video' | 'backup' | 'vc' | 'total' | 'noShows' | 'rate' | 'recentRate' | 'reliabilityScore'

interface DashboardTabProps {
  meetings: Meeting[]
  people: Person[]
}

type SortEntry = { key: SortKey; asc: boolean }

export function DashboardTab({ meetings, people }: DashboardTabProps) {
  const [sortKeys, setSortKeys] = useState<SortEntry[]>([{ key: 'name', asc: true }])
  const [historyPerson, setHistoryPerson] = useState<Person | null>(null)

  const stats = useMemo(() => computeStats(meetings, people), [meetings, people])

  const compareBy = (key: SortKey, asc: boolean, a: (typeof stats)[0], b: (typeof stats)[0]): number => {
    if (key === 'name') {
      const nameA = people.find(p => p.id === a.personId)?.name ?? ''
      const nameB = people.find(p => p.id === b.personId)?.name ?? ''
      return asc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
    }
    const rate = (s: typeof a) => s.assignedCompletedTotal === 0 ? -1 : s.fulfilledTotal / s.assignedCompletedTotal
    if (key === 'rate') return asc ? rate(a) - rate(b) : rate(b) - rate(a)
    const recentRate = (s: typeof a) => s.recentAssignedCompleted === 0 ? -1 : s.recentFulfilled / s.recentAssignedCompleted
    if (key === 'recentRate') return asc ? recentRate(a) - recentRate(b) : recentRate(b) - recentRate(a)
    if (key === 'reliabilityScore') {
      const sa = a.reliabilityScore as number, sb = b.reliabilityScore as number
      if (sa === -999 && sb === -999) return 0
      if (sa === -999) return 1
      if (sb === -999) return -1
      return asc ? sa - sb : sb - sa
    }
    const va = key === 'mic' ? a.mic1 + a.mic2 : (a[key] as number) ?? 0
    const vb = key === 'mic' ? b.mic1 + b.mic2 : (b[key] as number) ?? 0
    return asc ? va - vb : vb - va
  }

  const sortedStats = [...stats].sort((a, b) => {
    for (const { key, asc } of sortKeys) {
      const result = compareBy(key, asc, a, b)
      if (result !== 0) return result
    }
    return 0
  })

  const handleSort = (key: SortKey, shift: boolean) => {
    setSortKeys(prev => {
      if (shift) {
        const existing = prev.find(s => s.key === key)
        if (existing) return prev.map(s => s.key === key ? { ...s, asc: !s.asc } : s)
        return [...prev, { key, asc: false }]
      }
      const existing = prev[0]?.key === key && prev.length === 1
      return [{ key, asc: existing ? !prev[0].asc : false }]
    })
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    const idx = sortKeys.findIndex(s => s.key === k)
    if (idx === -1) return <ChevronUp className="h-3 w-3 opacity-0 group-hover:opacity-40" />
    const { asc } = sortKeys[idx]
    return (
      <span className="inline-flex items-center gap-0.5">
        {asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {sortKeys.length > 1 && <span className="text-[9px] leading-none opacity-60">{idx + 1}</span>}
      </span>
    )
  }

  const STAT_COLS: Array<{ key: SortKey; label: string }> = [
    { key: 'platform', label: 'Plat' },
    { key: 'mic', label: 'Mic' },
    { key: 'audio', label: 'Audio' },
    { key: 'video', label: 'Video' },
    { key: 'backup', label: 'Bkup' },
    { key: 'vc', label: 'VC' },
    { key: 'total', label: 'Total' },
    { key: 'noShows', label: 'No-shows' },
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
                  <button className="group flex items-center gap-1 font-medium hover:text-foreground" onClick={e => handleSort('name', e.shiftKey)}>
                    Name <SortIcon k="name" />
                  </button>
                </th>
                {STAT_COLS.map(col => (
                  <th key={col.key} className="text-center p-2">
                    <button className="group flex items-center justify-center gap-1 font-medium hover:text-foreground w-full" onClick={e => handleSort(col.key, e.shiftKey)}>
                      {col.label} <SortIcon k={col.key} />
                    </button>
                  </th>
                ))}
                <th className="text-center p-2">
                  <button className="group flex items-center justify-center gap-1 font-medium hover:text-foreground w-full" onClick={e => handleSort('rate', e.shiftKey)}>
                    Rate <SortIcon k="rate" />
                  </button>
                </th>
                <th className="text-center p-2">
                  <button className="group flex items-center justify-center gap-1 font-medium hover:text-foreground w-full" onClick={e => handleSort('recentRate', e.shiftKey)}>
                    8wk <SortIcon k="recentRate" />
                  </button>
                </th>
                <th className="text-center p-2">
                  <button className="group flex items-center justify-center gap-1 font-medium hover:text-foreground w-full" onClick={e => handleSort('reliabilityScore', e.shiftKey)}>
                    Score <SortIcon k="reliabilityScore" />
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
                    <td className="p-2 text-center text-muted-foreground">
                      {stat.recentAssignedCompleted === 0 ? '—' : `${Math.round((stat.recentFulfilled / stat.recentAssignedCompleted) * 100)}%`}
                    </td>
                    <td className="p-2 text-center font-medium">
                      {stat.reliabilityScore === -999 ? '—' : stat.reliabilityScore}
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
