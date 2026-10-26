import { useEffect } from 'react';
import { useStore } from './store';
import { useSync } from './sources/sync';
import { useReminders } from './features/reminders';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import DayView from './components/views/DayView';
import WeekView from './components/views/WeekView';
import MonthView from './components/views/MonthView';
import AgendaView from './components/views/AgendaView';
import EventPopover from './components/EventPopover';
import SettingsDialog from './components/SettingsDialog';
import Onboarding from './components/Onboarding';

function useApplyTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

export default function App() {
  const view = useStore((s) => s.view);
  const onboarded = useStore((s) => s.onboarded);
  useApplyTheme();
  useSync();
  useReminders();

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          {view === 'day' && <DayView />}
          {view === 'week' && <WeekView />}
          {view === 'month' && <MonthView />}
          {view === 'agenda' && <AgendaView />}
        </main>
      </div>
      <EventPopover />
      <SettingsDialog />
      {!onboarded && <Onboarding />}
    </div>
  );
}
