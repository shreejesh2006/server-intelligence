import React, { createContext, useContext, useState } from 'react';

export const MONITORED_SERVERS = [
  {
    id: 'ubuntu',
    host: 'ubuntu',
    name: 'Ubuntu Server',
    ip: '100.108.160.2',
    os: 'Ubuntu 24.04 LTS (x86_64)',
    role: 'Primary Telemetry Node & Backend Host',
    tag: 'PRIMARY NODE',
  },
  {
    id: 'Kali',
    host: 'Kali',
    name: 'Kali Linux Server',
    ip: '100.115.122.92',
    os: 'Kali Linux Rolling (x86_64)',
    role: 'Monitored Target VM',
    tag: 'SECONDARY NODE',
  },
];

const ServerContext = createContext(null);

export function ServerProvider({ children }) {
  const [selectedHost, setSelectedHost] = useState('ubuntu');

  const activeServer =
    MONITORED_SERVERS.find((s) => s.host === selectedHost) || MONITORED_SERVERS[0];

  const selectServer = (hostId) => {
    const found = MONITORED_SERVERS.find((s) => s.host === hostId || s.id === hostId);
    if (found) {
      setSelectedHost(found.host);
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
