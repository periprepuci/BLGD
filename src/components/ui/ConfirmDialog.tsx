import { useState } from 'react'

import { Button } from './Button'
import { Input } from './Field'
import { Modal } from './Modal'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /**
   * When set, the confirm button stays disabled until this exact text is typed.
   * Reserved for actions that cannot be undone, like deleting an account.
   */
  confirmPhrase?: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  confirmPhrase,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')

  const locked = Boolean(confirmPhrase) && typed.trim() !== confirmPhrase

  return (
    <Modal
      open={open}
      onClose={() => {
        setTyped('')
        onCancel()
      }}
      title={title}
      size="sm"
      dismissible={!pending}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={pending}
            disabled={locked}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-300">{message}</p>

      {confirmPhrase && (
        <Input
          className="mt-4"
          label={`Type “${confirmPhrase}” to confirm`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      )}
    </Modal>
  )
}
