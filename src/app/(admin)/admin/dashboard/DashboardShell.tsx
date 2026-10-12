'use client';

import { useState } from 'react';
import type { SiteSettings, StoredProject } from '@/lib/content/types';
import { logout } from '../actions';
import { Toaster } from '../ui/Toaster';
import { Button } from '../ui/primitives';
import { ProjectRows } from './ProjectRows';
import { SettingsForm } from './SettingsForm';
import { PasswordForm } from './PasswordForm';

type Tab = 'projects' | 'settings';

/**
 * Direction B's chrome: no rail, two quiet text tabs, one centred column.
 *
 * Section switching is local state rather than a route, because both sections
 * are already loaded and a navigation would throw away an open editor's draft.
 */
export function DashboardShell({
  projects,
  projectVersions,
  settings,
  settingsVersion,
}: {
  projects: StoredProject[];
  /** Per project id; see `versionOf`. */
  projectVersions: Record<string, string>;
  settings: SiteSettings;
  settingsVersion: string;
}) {
  const [tab, setTab] = useState<Tab>('projects');

  return (
    <Toaster>
      <div className="mx-auto w-full max-w-[68rem] px-5 py-10 sm:px-8">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <nav aria-label="Sections" className="flex items-center gap-1">
            {(
              [
                ['projects', 'Projects'],
                ['settings', 'Settings'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => {
                  setTab(id);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                  tab === id ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <Button variant="ghost" onClick={() => void logout()}>
            Sign out
          </Button>
        </header>

        {/*
          No read-only banner. It once warned that reads were falling back to
          the bundled catalogue while writes would fail. There is no fallback
          any more: reaching this component means the store answered.
        */}
        {tab === 'projects' ? (
          <ProjectRows projects={projects} versions={projectVersions} />
        ) : (
          <>
            <SettingsForm settings={settings} version={settingsVersion} />
            <PasswordForm />
          </>
        )}
      </div>
    </Toaster>
  );
}
