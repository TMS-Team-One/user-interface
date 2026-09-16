import * as React from 'react'

interface ConnectionContextValue {
  connectionEstablished: boolean
  setConnectionEstablished: React.Dispatch<React.SetStateAction<boolean>>
  printerHomed: boolean
  setPrinterHomed: React.Dispatch<React.SetStateAction<boolean>>
}

const ConnectionContext = React.createContext<ConnectionContextValue | null>(null)

export function ConnectionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [connectionEstablished, setConnectionEstablished] = React.useState<boolean>(false)
  const [printerHomed, setPrinterHomed] = React.useState<boolean>(false)

  const value = React.useMemo(
    () => ({ connectionEstablished, setConnectionEstablished, printerHomed, setPrinterHomed }),
    [connectionEstablished, printerHomed]
  )

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export function useConnection(): ConnectionContextValue {
  const context = React.useContext(ConnectionContext)
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider')
  }
  return context
}
