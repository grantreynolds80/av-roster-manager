export type AvailabilityStatus = 'Available' | 'Holiday' | 'Unavailable' | 'Medical'

export interface Person {
  id: string
  name: string
  // AV role permissions
  platform: boolean
  mic1: boolean
  mic2: boolean
  audio: boolean
  video: boolean
  backup: boolean
  vc: boolean
  // Availability
  availability_status: AvailabilityStatus
  unavailable_from?: string // ISO date string
  unavailable_until?: string // ISO date string
  unavailable_note?: string
}

export type MeetingType = 'Weekend' | 'Midweek'
export type MeetingStatus = 'Planned' | 'Completed' | 'Cancelled'

export interface PlannedAssignments {
  platform?: string   // person id
  mic1?: string
  mic2?: string
  audio?: string
  video?: string
  backup?: string
  vc?: string
  reader?: string
  entranceAttendant?: string
  auditoriumAttendant?: string
}

export interface RoleCompletion {
  // null  = role not yet marked complete
  // ""    = role was unfilled on the night
  // id    = person who actually did the role
  actual: string | null
  noshow: boolean  // planned person didn't show (fill-in may or may not have stepped in)
}

export interface Meeting {
  id: string
  date: string // ISO date string (YYYY-MM-DD)
  type: MeetingType
  status: MeetingStatus
  backupRequired: boolean
  planned: PlannedAssignments
  completions: Partial<Record<AvRole, RoleCompletion>>
  notes?: string
}

export interface AppSettings {
  cooldownDays: number // default 14
}

export type AvRole = 'platform' | 'mic1' | 'mic2' | 'audio' | 'video' | 'backup' | 'vc'
export type NonAvRole = 'reader' | 'entranceAttendant' | 'auditoriumAttendant'
export type AnyRole = AvRole | NonAvRole

export const AV_ROLES: AvRole[] = ['platform', 'mic1', 'mic2', 'audio', 'video', 'backup', 'vc']
export const NON_AV_ROLES: NonAvRole[] = ['reader', 'entranceAttendant', 'auditoriumAttendant']

export const ROLE_LABELS: Record<AnyRole, string> = {
  platform: 'Platform',
  mic1: 'Mic 1',
  mic2: 'Mic 2',
  audio: 'Audio',
  video: 'Video',
  backup: 'Backup',
  vc: 'VC',
  reader: 'Reader',
  entranceAttendant: 'Entrance Attendant',
  auditoriumAttendant: 'Auditorium Attendant',
}
