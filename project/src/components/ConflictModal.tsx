import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS } from '../types'
import type { AnyRole } from '../types'

interface ConflictModalProps {
  open: boolean
  personName: string
  existingRole: AnyRole
  meetingDate: string
  onReplace: () => void
  onBump: () => void
  onCancel: () => void
}

export function ConflictModal({ open, personName, existingRole, meetingDate, onReplace, onBump, onCancel }: ConflictModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Assignment Conflict</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{personName}</strong> is already assigned as <strong>{ROLE_LABELS[existingRole]}</strong> on <strong>{meetingDate}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} className="sm:mr-auto">
            Cancel
          </Button>
          <Button variant="outline" onClick={onBump}>
            Bump to Next Meeting
          </Button>
          <Button variant="destructive" onClick={onReplace}>
            Replace Existing
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
