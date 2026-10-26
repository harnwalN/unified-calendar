import { useEffect } from 'react';
import { useStore } from './store';
import { useAutoClasses } from './store/tasks';
import { useSync } from './sources/sync';
import { useDriveSync } from './sources/driveSync';
import { useHashImport } from './sources/prairielearn';
import { useReminders } from './features/reminders';
import { useDynamicFavicon } from './features/favicon';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import TasksHome from './components/tasks/TasksHome';
import TaskDetail from './components/tasks/TaskDetail';
import TimePage from './components/time/TimePage';
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
  const onboarded = useStore((s) => s.onboarded);
  useApplyTheme();
  useDynamicFavicon();
  useSync();
  useAutoClasses();
  useDriveSync();
  useHashImport();
  useReminders();

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          {/* Tasks-first home; the day/week/month/agenda views expand inside it. */}
          <TasksHome />
        </main>
      </div>
      <TaskDetail />
      <TimePage />
      <EventPopover />
      <SettingsDialog />
      {!onboarded && <Onboarding />}
    </div>
  );
}
