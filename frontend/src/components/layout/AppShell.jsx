import React, { useState } from 'react';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import { SettingsModal } from '../common/SettingsModal';
import { FloatingChatbot } from '../chat/FloatingChatbot';

export function AppShell({ children, isOffline, lastUpdated, onRefresh, loading, freshnessState, freshnessLabel }) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="shell-container font-sans">
      <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />

      <div className="shell-right-column">
        <TopBar
          isOffline={isOffline}
          lastUpdated={lastUpdated}
          onRefresh={onRefresh}
          loading={loading}
          freshnessState={freshnessState}
          freshnessLabel={freshnessLabel}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        <main className="shell-main">
          <div className="shell-content">
            {children}
          </div>
        </main>
      </div>

      <FloatingChatbot />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      <style>{`
        .shell-container {
          height: 100vh;
          width: 100vw;
          display: flex;
          flex-direction: row;
          overflow: hidden;
          background-color: var(--bg-canvas);
        }

        .shell-right-column {
          display: flex;
          flex-direction: column;
          flex: 1;
          height: 100vh;
          overflow: hidden;
          position: relative;
        }

        .shell-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          overflow-x: hidden;
          background-color: var(--bg-canvas);
        }

        .shell-content {
          flex: 1;
          padding: 32px 40px;
          max-width: 1280px;
          width: 100%;
          margin: 0 auto;
        }

        @media (max-width: 1024px) {
          .shell-content {
            padding: 24px 20px;
          }
        }
      `}</style>
    </div>
  );
}

export default AppShell;
