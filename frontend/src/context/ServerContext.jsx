import React, { createContext, useContext, useState } from 'react';

export const MONITORED_SERVERS = [
  {
    id: 'ubuntu',
    host: 'ubuntu',
    name: 'Ubuntu Server',
    ip: '100.108.160.2',
    os: 'Ubuntu 24.04 LTS (x86_64)',
    role: 'Production Compute & Microservices Node',
    provenance: 'live_agent',
    environment: 'Live Infrastructure',
    isLive: true,
  },
  {
    id: 'windows',
    host: 'windows',
    name: 'Windows Server',
    ip: '10.0.12.44',
    os: 'Windows Server 2022 Datacenter (x64)',
    role: 'Active Directory & Enterprise IIS Host',
    provenance: 'simulated_profile',
    environment: 'Simulated Infrastructure',
    isLive: false,
  },
  {
    id: 'kali',
    host: 'kali',
    name: 'Kali Linux Server',
    ip: '10.0.14.88',
    os: 'Kali Linux Rolling (2026.1)',
    role: 'Security Assessment & Vulnerability Scanner',
    provenance: 'simulated_profile',
    environment: 'Simulated Infrastructure',
    isLive: false,
  },
];

const ServerContext = createContext(null);

export function ServerProvider({ children }) {
  const [selectedHost, setSelectedHost] = useState(() => {
    const saved = localStorage.getItem('netra_selected_host');
    if (saved && MONITORED_SERVERS.some((s) => s.host === saved.toLowerCase())) {
      return saved.toLowerCase();
    }
    return 'ubuntu';
  });

  const activeServer =
    MONITORED_SERVERS.find((s) => s.host === selectedHost.toLowerCase()) || MONITORED_SERVERS[0];

  const selectServer = (hostId) => {
    if (!hostId) return;
    const target = hostId.toLowerCase();
    const found = MONITORED_SERVERS.find(
      (s) => s.host.toLowerCase() === target || s.id.toLowerCase() === target
    );
    if (found) {
      setSelectedHost(found.host);
      localStorage.setItem('netra_selected_host', found.host);
    }
  };

  return (
    <ServerContext.Provider
      value={{
        servers: MONITORED_SERVERS,
        selectedHost,
        activeServer,
        selectServer,
        setSelectedHost,
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error('useServer must be used within a ServerProvider');
  }
  return context;
}

export default ServerContext;
