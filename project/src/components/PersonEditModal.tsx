import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Person, AvailabilityStatus } from '../types'
import { AV_ROLES, ROLE_LABELS } from '../types'

interface PersonEditModalProps {
  open: boolean
  person: Person | null
  onSave: (person: Person) => void
  onClose: () => void
}

export function PersonEditModal({ open, person, onSave, onClose }: PersonEditModalProps) {
  const [form, setForm] = useState<Person>(() =>
    person ?? {
      id: crypto.randomUUID(),
      name: '',
      platform: false, mic1: false, mic2: false, audio: false, video: false, backup: false, vc: false,
      availability_status: 'Available',
      unavailable_until: '',
      unavailable_note: '',
    }
  )

  // Reset when person changes
  const [lastPerson, setLastPerson] = useState(person)
  if (person !== lastPerson) {
    setLastPerson(person)
    setForm(person ?? {
      id: crypto.randomUUID(),
      name: '',
      platform: false, mic1: false, mic2: false, audio: false, video: false, backup: false, vc: false,
      availability_status: 'Available',
      unavailable_until: '',
      unavailable_note: '',
    })
  }

  const handleSave = () => {
    if (!form.name.trim()) return
    onSave(form)
  }

  const showUnavailableFields = form.availability_status !== 'Available'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{person ? 'Edit Person' : 'Add Person'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Full name"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">AV Role Permissions</Label>
            <div className="grid grid-cols-2 gap-2">
              {AV_ROLES.map(role => (
                <div key={role} className="flex items-center justify-between gap-2 py-1">
                  <Label htmlFor={`role-${role}`} className="text-sm font-normal cursor-pointer">
                    {ROLE_LABELS[role]}
                  </Label>
                  <Switch
                    id={`role-${role}`}
                    checked={form[role]}
                    onCheckedChange={v => setForm(f => ({ ...f, [role]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="status">Availability</Label>
            <Select
              value={form.availability_status}
              onValueChange={v => setForm(f => ({ ...f, availability_status: v as AvailabilityStatus }))}
            >
              <SelectTrigger id="status" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Available">Available</SelectItem>
                <SelectItem value="Holiday">Holiday</SelectItem>
                <SelectItem value="Unavailable">Unavailable</SelectItem>
                <SelectItem value="Medical">Medical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showUnavailableFields && (
            <>
              <div>
                <Label htmlFor="until">Unavailable Until</Label>
                <Input
                  id="until"
                  type="date"
                  value={form.unavailable_until ?? ''}
                  onChange={e => setForm(f => ({ ...f, unavailable_until: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  value={form.unavailable_note ?? ''}
                  onChange={e => setForm(f => ({ ...f, unavailable_note: e.target.value }))}
                  placeholder="Optional note..."
                  className="mt-1 h-20"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.name.trim()}>
            {person ? 'Save Changes' : 'Add Person'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
