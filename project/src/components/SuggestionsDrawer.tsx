import { useMemo, useRef, useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ChevronRight } from 'lucide-react'
import type { Meeting, Person, AvRole } from '../types'
import { ROLE_LABELS } from '../types'
import { getSuggestions, formatDate } from '../lib/utils-roster'

interface SuggestionsDrawerProps {
  open: boolean
  meeting: Meeting | null
  meetings: Meeting[]
  people: Person[]
  cooldownDays: number
  highlightRole?: AvRole | null
  onClose: () => void
  onAssign: (role: string, personId: string) => void
}

export function SuggestionsDrawer({ open, meeting, meetings, people, cooldownDays, highlightRole, onClose, onAssign }: SuggestionsDrawerProps) {
  const [assignedRoles, setAssignedRoles] = useState<Set<string>>(new Set())
  const roleRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const suggestions = useMemo(
    () => meeting ? getSuggestions(meetings, people, meeting, cooldownDays) : [],
    [meetings, people, meeting, cooldownDays]
  )

  useEffect(() => {
    setAssignedRoles(new Set())
  }, [meeting?.id])

  useEffect(() => {
    if (!open || !highlightRole) return
    const t = setTimeout(() => {
      roleRefs.current[highlightRole]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 180)
    return () => clearTimeout(t)
  }, [open, highlightRole])

  if (!meeting) return null

  const handleAssign = (role: string, personId: string) => {
    onAssign(role, personId)
    setAssignedRoles(prev => new Set([...prev, role]))
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Suggestions</SheetTitle>
          <p className="text-sm text-muted-foreground">{formatDate(meeting.date)} · {meeting.type}</p>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {suggestions.map(({ role, suggestions: candidates }) => {
            const isHighlighted = role === highlightRole
            const isAssigned = assignedRoles.has(role)

            return (
              <div
                key={role}
                ref={el => { roleRefs.current[role] = el }}
                className={`rounded-md scroll-mt-4 transition-colors ${isHighlighted ? 'bg-primary/5 border-l-2 border-primary pl-3 pr-2 py-2 -mx-2' : 'px-0 py-1'}`}
              >
                <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isHighlighted ? 'text-primary' : 'text-muted-foreground'}`}>
                  {ROLE_LABELS[role]}
                </h3>

                {isAssigned ? (
                  <p className="text-xs text-muted-foreground/60 pl-1">Assigned</p>
                ) : candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-1">No eligible people</p>
                ) : (
                  <div className="space-y-1">
                    {candidates.map(({ person, daysSinceLast, cooldown }, i) => (
                      <button
                        key={person.id}
                        onClick={() => handleAssign(role, person.id)}
                        className="w-full flex items-center justify-between px-3 py-1.5 rounded-md bg-muted/50 hover:bg-accent transition-colors text-left group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                          <span className="text-sm font-medium truncate">{person.name}</span>
                          {cooldown === 'amber' && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded px-1 leading-4 shrink-0">cooldown</span>
                          )}
                          {cooldown === 'red' && (
                            <span className="text-[10px] text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded px-1 leading-4 shrink-0">too soon</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {daysSinceLast === Infinity ? 'Never' : `${daysSinceLast}d`}
                          </span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
