import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/mode-toggle'
import { Toaster } from '@/components/ui/sonner'
import { Settings } from 'lucide-react'
import type { Meeting, Person, AppSettings } from './types'
import { loadPeople, savePeople, loadMeetings, saveMeetings, loadSettings, saveSettings, isInitialized, markInitialized } from './lib/storage'
import { SEED_PEOPLE, SEED_MEETINGS } from './lib/seed'
import { RosterTab } from './components/RosterTab'
import { DashboardTab } from './components/DashboardTab'
import { SettingsModal } from './components/SettingsModal'

const DEFAULT_SETTINGS: AppSettings = { cooldownDays: 14 }

export function App() {
  const [people, setPeople] = useState<Person[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Initialize data on mount
  useEffect(() => {
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
      setMeetings(loadMeetings() ?? SEED_MEETINGS)
      setSettings(loadSettings() ?? DEFAULT_SETTINGS)
    }
  }, [])

  const handleUpdateMeetings = (updated: Meeting[]) => {
    setMeetings(updated)
    saveMeetings(updated)
  }

  const handleUpdatePeople = (updated: Person[]) => {
    setPeople(updated)
    savePeople(updated)
  }

  const handleSaveSettings = (updated: AppSettings) => {
    setSettings(updated)
    saveSettings(updated)
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-screen-2xl px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">AV</span>
            </div>
            <h1 className="text-base font-semibold tracking-tight hidden sm:block">AV Roster Manager</h1>
            <h1 className="text-base font-semibold tracking-tight sm:hidden">AV Roster</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-6">
        <Tabs defaultValue="roster" className="space-y-6">
          <TabsList className="h-9">
            <TabsTrigger value="roster" className="text-sm">Roster</TabsTrigger>
            <TabsTrigger value="dashboard" className="text-sm">Dashboard</TabsTrigger>
          </TabsList>

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

export default App
