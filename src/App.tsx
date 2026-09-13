import { useState } from 'react';
import { useAppData } from './lib/AppDataContext';
import LogTab from './components/LogTab';
import HistoryTab from './components/HistoryTab';
import StatsTab from './components/StatsTab';
import SettingsTab from './components/SettingsTab';
import FirstRunPrompt from './components/FirstRunPrompt';
import TabBar, { type TabId } from './components/TabBar';

export default function App() {
  const { loading, settings, online, pendingSync, codes, rules, rvuSourceStale, saveSettings } = useAppData();
  const [tab, setTab] = useState<TabId>('log');

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  const needsFirstRun = settings.pftBillingModel === '';
  const noCodesLoaded = codes.length === 0;
  const anyUnverifiedRules = rules.some((r) => !r.verified && r.type !== 'not_exclusive_note');

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">wRVU Tracker</span>
        <span className={`status-dot ${online ? 'online' : 'offline'}`} title={online ? 'Online' : 'Offline'} />
        {pendingSync > 0 && <span className="pending-badge">{pendingSync} syncing…</span>}
      </header>

      {noCodesLoaded && (
        <div className="banner banner-warn">
          No RVU data loaded yet. Run the CMS PPRRVU import (see README) to begin logging.
        </div>
      )}

      {!noCodesLoaded && rvuSourceStale && (
        <div className="banner banner-info">
          Loaded RVU data ({settings.rvuSourceLabel || 'unknown release'}) is more than a quarter old. Consider
          re-running the CMS import.
        </div>
      )}

      {!noCodesLoaded && anyUnverifiedRules && (
        <div className="banner banner-info">
          Bundling rules are unverified against your current NCCI edits — review in Settings.
        </div>
      )}

      {needsFirstRun && !noCodesLoaded && (
        <FirstRunPrompt
          onAnswer={(model) => saveSettings({ pftBillingModel: model, defaultComponentPFT: model === 'global' ? '' : '26' })}
        />
      )}

      <main className="app-main">
        {tab === 'log' && <LogTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'stats' && <StatsTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
