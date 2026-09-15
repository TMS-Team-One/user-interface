import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export interface OpenModalOptions {
  title?: string
  description?: string
  content: React.ReactNode
  footer?: React.ReactNode
  showCloseButton?: boolean
}

interface ModalContextValue {
  openModal: (options: OpenModalOptions) => void
  closeModal: () => void
}

const ModalContext = React.createContext<ModalContextValue | null>(null)

export function ModalProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [modal, setModal] = React.useState<OpenModalOptions | null>(null)

  const openModal = React.useCallback((options: OpenModalOptions) => {
    setModal(options)
  }, [])

  const closeModal = React.useCallback(() => {
    setModal(null)
  }, [])

  const value = React.useMemo(() => ({ openModal, closeModal }), [openModal, closeModal])

  return (
    <ModalContext.Provider value={value}>
      {children}
      <Dialog open={modal !== null} onOpenChange={(open) => !open && closeModal()}>
        {modal && (
          <DialogContent showCloseButton={modal.showCloseButton}>
            {(modal.title || modal.description) && (
              <DialogHeader>
                {modal.title && <DialogTitle>{modal.title}</DialogTitle>}
                {modal.description && <DialogDescription>{modal.description}</DialogDescription>}
              </DialogHeader>
            )}
            {modal.content}
            {modal.footer && <DialogFooter>{modal.footer}</DialogFooter>}
          </DialogContent>
        )}
      </Dialog>
    </ModalContext.Provider>
  )
}

export function useModal(): ModalContextValue {
  const context = React.useContext(ModalContext)
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider')
  }
  return context
}
