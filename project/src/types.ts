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

export interface ActualAssignments {
  platform?: string
  mic1?: string
  mic2?: string
  audio?: string
  video?: string
  backup?: string
  vc?: string
}

export interface Meeting {
  id: string
  date: string // ISO date string (YYYY-MM-DD)
  type: MeetingType
  status: MeetingStatus
  planned: PlannedAssignments
  actual: ActualAssignments
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
