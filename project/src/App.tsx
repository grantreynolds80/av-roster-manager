import { useState, useEffect, useRef, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/mode-toggle'
import { Toaster } from '@/components/ui/sonner'
import { Settings } from 'lucide-react'
import type { Meeting, Person, AppSettings, AvRole } from './types'
import { AV_ROLES } from './types'
import { loadPeople, savePeople, loadMeetings, saveMeetings, loadSettings, saveSettings, isInitialized, markInitialized } from './lib/storage'
import { SEED_PEOPLE, SEED_MEETINGS } from './lib/seed'
import { loadFromCloud, saveToCloud } from './lib/sync'
import type { ScheduleData } from './lib/sync'
import { RosterTab } from './components/RosterTab'
import { DashboardTab } from './components/DashboardTab'
import { SettingsModal } from './components/SettingsModal'

const DEFAULT_SETTINGS: AppSettings = { cooldownDays: 14 }

function migrateRawMeeting(m: any): Meeting {
  const backupRequired = m.backupRequired !== undefined
    ? m.backupRequired
    : (m.type === 'Weekend' || !!m.planned?.backup || !!m.actual?.backup)

  let completions: Partial<Record<AvRole, { actual: string | null; noshow: boolean }>> = m.completions ?? {}
  if (!m.completions && m.status === 'Completed' && m.actual) {
    for (const role of AV_ROLES) {
      if (role === 'backup' && !backupRequired) continue
      const actualId: string | undefined = m.actual[role]
      const plannedId: string | undefined = m.planned?.[role]
      completions[role] = { actual: actualId ?? plannedId ?? '', noshow: false }
    }
  }

  return { ...m, backupRequired, completions }
}

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

export function App() {
  const [people, setPeople] = useState<Person[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isLoadingCloud, setIsLoadingCloud] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')

  const meetingsRef = useRef<Meeting[]>([])
  const peopleRef = useRef<Person[]>([])
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  meetingsRef.current = meetings
  peopleRef.current = people
  settingsRef.current = settings

  useEffect(() => {
    const init = async () => {
      const cloudData = await loadFromCloud()

      if (cloudData) {
        const migratedMeetings = cloudData.meetings.map(migrateRawMeeting)
        setPeople(cloudData.people)
        setMeetings(migratedMeetings)
        setSettings(cloudData.settings ?? DEFAULT_SETTINGS)
        savePeople(cloudData.people)
        saveMeetings(cloudData.meetings)
        saveSettings(cloudData.settings ?? DEFAULT_SETTINGS)
        markInitialized()
        setSyncStatus('synced')
      } else {
        if (!isInitialized()) {
          savePeople(SEED_PEOPLE)
          saveMeetings(SEED_MEETINGS)
          saveSettings(DEFAULT_SETTINGS)
          markInitialized()
          setPeople(SEED_PEOPLE)
          setMeetings(SEED_MEETINGS)
          setSettings(DEFAULT_SETTINGS)
        } else {
          setPeople(loadPeople() ?? SEED_PEOPLE)
          const rawMeetings = (loadMeetings() ?? SEED_MEETINGS) as any[]
          setMeetings(rawMeetings.map(migrateRawMeeting))
          setSettings(loadSettings() ?? DEFAULT_SETTINGS)
        }
        setSyncStatus('error')
      }

      setIsLoadingCloud(false)
    }

    init()
  }, [])

  const scheduleCloudSave = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    setSyncStatus('idle')
    syncTimerRef.current = setTimeout(async () => {
      setSyncStatus('syncing')
      const payload: ScheduleData = {
        meetings: meetingsRef.current,
        people: peopleRef.current,
        settings: settingsRef.current,
      }
      const ok = await saveToCloud(payload)
      setSyncStatus(ok ? 'synced' : 'error')
    }, 2000)
  }, [])

  const handleUpdateMeetings = (updated: Meeting[]) => {
    setMeetings(updated)
    saveMeetings(updated)
    scheduleCloudSave()
  }

  const handleUpdatePeople = (updated: Person[]) => {
    setPeople(updated)
    savePeople(updated)
    scheduleCloudSave()
  }

  const handleSaveSettings = (updated: AppSettings) => {
    setSettings(updated)
    saveSettings(updated)
    scheduleCloudSave()
  }

  if (isLoadingCloud) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm">Loading schedule…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="mx-auto max-w-screen-2xl px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">AV</span>
            </div>
            <h1 className="text-base font-semibold tracking-tight hidden sm:block">AV Roster Manager</h1>
            <h1 className="text-base font-semibold tracking-tight sm:hidden">AV Roster</h1>
          </div>
          <div className="flex items-center gap-3">
            <SyncIndicator status={syncStatus} />
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 pt-0 pb-6">
        <Tabs defaultValue="roster" className="space-y-6">
          <div className="sticky top-14 z-10 bg-background -mx-4 px-4 border-b border-border flex items-center h-12">
            <TabsList className="h-9">
              <TabsTrigger value="roster" className="text-sm">Roster</TabsTrigger>
              <TabsTrigger value="dashboard" className="text-sm">Dashboard</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="roster">
            <RosterTab
              meetings={meetings}
              people={people}
              cooldownDays={settings.cooldownDays}
              onUpdateMeetings={handleUpdateMeetings}
            />
          </TabsContent>

          <TabsContent value="dashboard">
            <DashboardTab
              meetings={meetings}
              people={people}
              onUpdatePeople={handleUpdatePeople}
              onUpdateMeetings={handleUpdateMeetings}
            />
          </TabsContent>
        </Tabs>
      </main>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setSettingsOpen(false)}
      />
      <Toaster richColors position="bottom-right" />
    </div>
  )
}

function SyncIndicator({ status }: { status: SyncStatus }) {
  if (status === 'idle') return null

  const dot =
    status === 'syncing'
      ? 'bg-amber-400 animate-pulse'
      : status === 'synced'
      ? 'bg-green-400'
      : 'bg-red-400'

  const label =
    status === 'syncing' ? 'Syncing…' : status === 'synced' ? 'Synced' : 'Sync failed'

  return (
    <div className="flex items-center gap-1.5" title={label}>
      <div className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="text-xs text-muted-foreground hidden sm:inline">{label}</span>
    </div>
  )
}

export default App
