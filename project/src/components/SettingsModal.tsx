import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import type { AppSettings } from '../types'

interface SettingsModalProps {
  open: boolean
  settings: AppSettings
  onSave: (settings: AppSettings) => void
  onClose: () => void
}

export function SettingsModal({ open, settings, onSave, onClose }: SettingsModalProps) {
  const [cooldown, setCooldown] = useState(settings.cooldownDays)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Cooldown Period</Label>
              <span className="text-sm font-semibold tabular-nums">{cooldown} days</span>
            </div>
            <Slider
              min={1}
              max={90}
              step={1}
              value={[cooldown]}
              onValueChange={([v]) => setCooldown(v)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Amber highlight when a person is assigned to any AV role within this many days.
              Red highlight when assigned to the same role within 7 days (fixed).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave({ cooldownDays: cooldown }); onClose() }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
