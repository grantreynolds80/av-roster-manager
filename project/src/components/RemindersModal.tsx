import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'
import type { Meeting, Person, AvRole } from '../types'
import { AV_ROLES } from '../types'
import { formatDate } from '../lib/utils-roster'

const ROLE_PHRASE: Record<AvRole, string> = {
  platform: 'on the Platform',
  mic1: 'Mic 1 operator',
  mic2: 'Mic 2 operator',
  audio: 'Audio operator',
  video: 'Video operator',
  backup: 'Backup operator',
  vc: 'Videoconference operator',
}

interface ReminderMessage {
  role: AvRole
  personName: string
  text: string
}

function buildMessages(meeting: Meeting, people: Person[]): ReminderMessage[] {
  const messages: ReminderMessage[] = []
  for (const role of AV_ROLES) {
    if (role === 'backup' && !meeting.backupRequired) continue
    const personId = meeting.planned[role]
    if (!personId) continue
    const person = people.find(p => p.id === personId)
    if (!person) continue
    const firstName = person.name.split(' ')[0]
    const text = `Hi ${firstName}\nJust a reminder that you are ${ROLE_PHRASE[role]} at tomorrow's meeting.\nThank you`
    messages.push({ role, personName: person.name, text })
  }
  return messages
}

interface RemindersModalProps {
  open: boolean
  meeting: Meeting | null
  people: Person[]
  onClose: () => void
}

export function RemindersModal({ open, meeting, people, onClose }: RemindersModalProps) {
  const [copied, setCopied] = useState<AvRole | 'all' | null>(null)

  if (!meeting) return null

  const messages = buildMessages(meeting, people)
  const allText = messages.map(m => m.text).join('\n\n')

  const copy = (text: string, key: AvRole | 'all') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm sm:max-w-md flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Reminders</DialogTitle>
          <p className="text-sm text-muted-foreground">{formatDate(meeting.date)} · {meeting.type}</p>
        </DialogHeader>

        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No people assigned yet.</p>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
            <div className="sticky top-0 bg-background flex justify-end pb-2 pt-1 z-10">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => copy(allText, 'all')}
              >
                {copied === 'all'
                  ? <Check className="h-3.5 w-3.5 text-green-600" />
                  : <Copy className="h-3.5 w-3.5" />}
                {copied === 'all' ? 'Copied!' : 'Copy all'}
              </Button>
            </div>

            <div className="space-y-3 pb-2">
              {messages.map(({ role, personName, text }) => (
                <div key={role} className="rounded-md border border-border bg-muted/30 p-3 flex gap-3 items-start">
                  <pre className="flex-1 text-sm whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 mt-0.5"
                    title={`Copy message for ${personName}`}
                    onClick={() => copy(text, role)}
                  >
                    {copied === role
                      ? <Check className="h-3.5 w-3.5 text-green-600" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
