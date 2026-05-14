import { useMemo } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Meeting, Person } from '../types'
import { ROLE_LABELS } from '../types'
import { getSuggestions, formatDate } from '../lib/utils-roster'

interface SuggestionsDrawerProps {
  open: boolean
  meeting: Meeting | null
  meetings: Meeting[]
  people: Person[]
  onClose: () => void
  onAssign: (role: string, personId: string) => void
}

export function SuggestionsDrawer({ open, meeting, meetings, people, onClose, onAssign }: SuggestionsDrawerProps) {
  const suggestions = useMemo(
    () => meeting ? getSuggestions(meetings, people, meeting) : [],
    [meetings, people, meeting]
  )

  if (!meeting) return null

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Suggestions</SheetTitle>
          <p className="text-sm text-muted-foreground">{formatDate(meeting.date)} · {meeting.type}</p>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {suggestions.map(({ role, suggestions: people }) => (
            <div key={role}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {ROLE_LABELS[role]}
              </h3>
              {people.length === 0 ? (
                <p className="text-sm text-muted-foreground">No eligible people</p>
              ) : (
                <div className="space-y-1.5">
                  {people.map(({ person, daysSinceLast }, i) => (
                    <button
                      key={person.id}
                      onClick={() => onAssign(role, person.id)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground w-4">{i + 1}.</span>
                        <span className="text-sm font-medium">{person.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {daysSinceLast === Infinity ? 'Never assigned' : `${daysSinceLast}d ago`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
