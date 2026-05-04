import React, { createContext, useContext } from 'react';
import { useAudioEngine } from '../hooks/useAudioEngine';

const AudioEngineContext = createContext(null);

export function AudioEngineProvider({ children }) {
  const engine = useAudioEngine();
  return (
    <AudioEngineContext.Provider value={engine}>
      {children}
    </AudioEngineContext.Provider>
  );
}

export function useEngine() {
  const ctx = useContext(AudioEngineContext);
  if (!ctx) throw new Error('useEngine must be used inside AudioEngineProvider');
  return ctx;
}
