import { useMemo, useState } from 'react'
import { AppContext } from './appContextCore'

const initialSession = {
  user: null,
  role: 'artist',
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(initialSession)

  const value = useMemo(
    () => ({
      session,
      setSession,
      isAuthenticated: Boolean(session.user),
    }),
    [session],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
