import { useMemo, useState } from 'react'
import { AppContext } from './appContextCore'

const initialSession = {
  user: null,
  role: null,
}

const storageKey = 'studio-flow-session'

function getStoredSession() {
  try {
    const storedSession = localStorage.getItem(storageKey)
    return storedSession ? JSON.parse(storedSession) : initialSession
  } catch {
    return initialSession
  }
}

const mockUsers = {
  client: { id: 'client-demo', name: 'Mariana Lopez', role: 'client' },
  artist: { id: 'artist-demo', name: 'Valeria Moon', role: 'artist' },
  admin: { id: 'admin-demo', name: 'Studio Flow HQ', role: 'admin' },
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(getStoredSession)

  const login = (role) => {
    const nextSession = {
      user: mockUsers[role],
      role,
    }

    localStorage.setItem(storageKey, JSON.stringify(nextSession))
    setSession(nextSession)
  }

  const logout = () => {
    localStorage.removeItem(storageKey)
    setSession(initialSession)
  }

  const value = useMemo(
    () => ({
      session,
      setSession,
      login,
      logout,
      isAuthenticated: Boolean(session.user),
    }),
    [session],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
