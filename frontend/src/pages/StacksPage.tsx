import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { StackDef, StackLoadState } from '../stacks'

interface StacksPageProps {
  stacks: StackDef[]
  activeStackId: string
  stackLoadStates: Map<string, StackLoadState>
  onSelectStack: (id: string) => void
  onAddLocalFile: (label: string, fileBytes: Uint8Array) => void
  onAddLocalYaml: (label: string, content: string) => void
  onAddRemote: (label: string, url: string) => void
  onRemoveStack: (id: string) => void
  onExportStack: () => void
  modifiedStackNames: Set<string>
  backupFolderName: string | null
  lastBackupTime: number
  onChooseBackupFolder: () => void
  onClearBackupFolder: () => void
}

export function StacksPage({
  stacks,
  activeStackId,
  stackLoadStates,
  onSelectStack,
  onAddLocalFile,
  onAddLocalYaml,
  onAddRemote,
  onRemoveStack,
  onExportStack,
  modifiedStackNames,
  backupFolderName,
  lastBackupTime,
  onChooseBackupFolder,
  onClearBackupFolder,
}: StacksPageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [addingRemote, setAddingRemote] = useState(false)
  const [remoteLabel, setRemoteLabel] = useState('')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState('')
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const confirmed = confirmText === 'delete this'

  const openRemoveModal = (id: string) => {
    setPendingRemoveId(id)
    setConfirmText('')
  }
  const closeRemoveModal = () => {
    setPendingRemoveId(null)
    setConfirmText('')
  }
  const openResetModal = () => {
    setResetModalOpen(true)
    setConfirmText('')
  }
  const closeResetModal = () => {
    setResetModalOpen(false)
    setConfirmText('')
  }

  const getState = (stack: StackDef): StackLoadState =>
    stack.id === activeStackId ? 'loaded' : (stackLoadStates.get(stack.id) ?? 'unloaded')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const label = file.name.replace(/\.(ya?ml|stack)$/i, '')
    const isStack = file.name.toLowerCase().endsWith('.stack')

    if (isStack) {
      const buffer = await file.arrayBuffer()
      onAddLocalFile(label, new Uint8Array(buffer))
    } else {
      const content = await file.text()
      onAddLocalYaml(label, content)
    }
    e.target.value = ''
    navigate(-1)
  }

  const handleFetchRemote = async () => {
    const url = remoteUrl.trim()
    if (!url) return
    setRemoteLoading(true)
    setRemoteError('')
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

      const contentType = res.headers.get('content-type') ?? ''
      const isStack =
        contentType.includes('application/stack') ||
        contentType.includes('application/zip') ||
        url.toLowerCase().endsWith('.stack')

      const label = remoteLabel.trim() || new URL(url).hostname

      if (isStack) {
        const buffer = await res.arrayBuffer()
        onAddLocalFile(label, new Uint8Array(buffer))
      } else {
        onAddRemote(label, url)
      }

      setRemoteUrl('')
      setRemoteLabel('')
      setAddingRemote(false)
      navigate(-1)
    } catch (err) {
      setRemoteError(err instanceof Error ? err.message : 'Failed to load stack')
    } finally {
      setRemoteLoading(false)
    }
  }

  const sourceLabel = (s: StackDef) => {
    if (s.source.type === 'remote') return 'remote'
    if (s.source.type === 'local') return 'local'
    return null
  }

  const stateLabel = (state: StackLoadState, isActive: boolean) => {
    if (isActive) return 'Active'
    switch (state) {
      case 'loaded':
        return 'Loaded'
      case 'loading':
        return 'Loading…'
      case 'error':
        return 'Error'
      default:
        return 'Not loaded'
    }
  }

  const pendingStack = pendingRemoveId ? stacks.find((s) => s.id === pendingRemoveId) : null

  return (
    <div className="stacks-page">
      <div className="stacks-page__header">
        <Link to="/" className="stacks-page__back">
          <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          Back
        </Link>
        <h1 className="stacks-page__title">Manage Stacks</h1>
      </div>

      <div className="stacks-page__actions">
        <input
          type="file"
          ref={fileInputRef}
          accept=".yml,.yaml,.stack"
          style={{ display: 'none' }}
          onChange={(e) => void handleFileChange(e)}
        />
        <button className="stacks-page__action-btn" onClick={() => fileInputRef.current?.click()}>
          <i className="fa-solid fa-file-invoice" aria-hidden="true" />
          Open local file
        </button>
        <button
          className="stacks-page__action-btn"
          onClick={() => {
            setAddingRemote((v) => !v)
            setRemoteError('')
          }}
        >
          <i className="fa-solid fa-globe" aria-hidden="true" />
          Open URL
        </button>
        <button
          className="stacks-page__action-btn stacks-page__action-btn--danger"
          onClick={openResetModal}
        >
          <i className="fa-solid fa-rotate-left" aria-hidden="true" />
          Reset all
        </button>
      </div>

      {addingRemote && (
        <div className="stacks-page__remote-form">
          <input
            type="text"
            className="stacks-page__remote-input"
            placeholder="Label (optional)"
            value={remoteLabel}
            onChange={(e) => setRemoteLabel(e.target.value)}
          />
          <input
            type="url"
            className="stacks-page__remote-input"
            placeholder="https://example.com/stack.yml"
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleFetchRemote()}
          />
          <button
            className="stacks-page__action-btn"
            onClick={() => void handleFetchRemote()}
            disabled={remoteLoading || !remoteUrl.trim()}
          >
            {remoteLoading ? 'Fetching…' : 'Fetch & open'}
          </button>
          {remoteError && <p className="stacks-page__error">{remoteError}</p>}
        </div>
      )}

      <div className="stacks-page__backup-setting">
        <span className="stacks-page__backup-label">
          <i className="fa-solid fa-folder-arrow-up" aria-hidden="true" />
          Backup folder
        </span>
        <span className="stacks-page__backup-value">
          {backupFolderName ? (
            <>
              <strong title={backupFolderName}>{backupFolderName}</strong>
              {lastBackupTime > 0 && (
                <span className="stacks-page__backup-time">
                  {' · backed up '}
                  {new Date(lastBackupTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </>
          ) : (
            <span className="stacks-page__backup-none">no backups</span>
          )}
        </span>
        <div className="stacks-page__backup-actions">
          <button
            className="stacks-page__backup-btn"
            onClick={onChooseBackupFolder}
            title="Choose backup folder"
          >
            {backupFolderName ? 'Change' : 'Choose'}
          </button>
          {backupFolderName && (
            <button
              className="stacks-page__backup-btn stacks-page__backup-btn--clear"
              onClick={onClearBackupFolder}
              aria-label="Remove backup folder"
              title="Remove backup folder"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <ul className="stacks-page__list">
        {stacks.map((stack) => {
          const isActive = stack.id === activeStackId
          const state = getState(stack)
          const stateLbl = stateLabel(state, isActive)
          const canExport = state === 'loaded'
          return (
            <li
              key={stack.id}
              className={`stacks-page__item${isActive ? ' stacks-page__item--active' : ''}`}
            >
              <button
                className="stacks-page__item-main"
                onClick={() => {
                  if (!isActive) {
                    onSelectStack(stack.id)
                    navigate('/')
                  }
                }}
                disabled={isActive}
              >
                <span className="stacks-page__item-name">{stack.label}</span>
                <div className="stacks-page__item-badges">
                  {sourceLabel(stack) && (
                    <span className="stacks-page__badge stacks-page__badge--source">
                      {sourceLabel(stack)}
                    </span>
                  )}
                  <span
                    className={`stacks-page__badge stacks-page__badge--${isActive ? 'loaded' : state}`}
                  >
                    {stateLbl}
                  </span>
                  {modifiedStackNames.has(stack.label) && (
                    <span className="stacks-page__badge stacks-page__badge--modified">
                      modified
                    </span>
                  )}
                </div>
              </button>
              {canExport && (
                <button
                  className="stacks-page__item-export"
                  onClick={onExportStack}
                  aria-label="Export stack to local disk"
                  title="Export stack to local disk"
                >
                  <i className="fa-solid fa-download" aria-hidden="true" />
                </button>
              )}
              {stack.source.type !== 'bundled' && (
                <button
                  className="stacks-page__item-remove"
                  onClick={() => openRemoveModal(stack.id)}
                  aria-label={`Remove ${stack.label}`}
                  title="Remove"
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {pendingStack && (
        <div className="stacks-page__modal-backdrop" onClick={closeRemoveModal}>
          <div
            className="stacks-page__modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="stacks-page__modal-title" id="remove-modal-title">
              Are you sure?
            </h2>
            <p className="stacks-page__modal-body">
              This will permanently delete <strong>{pendingStack.label}</strong>.
            </p>
            <input
              className="stacks-page__modal-confirm-input"
              type="text"
              placeholder='Type "delete this" to confirm'
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
            />
            <div className="stacks-page__modal-btns">
              <button
                className="stacks-page__modal-btn stacks-page__modal-btn--cancel"
                onClick={closeRemoveModal}
              >
                Cancel
              </button>
              <button
                className="stacks-page__modal-btn stacks-page__modal-btn--confirm"
                disabled={!confirmed}
                onClick={() => {
                  onRemoveStack(pendingStack.id)
                  closeRemoveModal()
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {resetModalOpen && (
        <div className="stacks-page__modal-backdrop" onClick={closeResetModal}>
          <div
            className="stacks-page__modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="stacks-page__modal-title" id="reset-modal-title">
              Are you sure?
            </h2>
            <p className="stacks-page__modal-body">
              All locally stored stack data will be reset to defaults. Any stacks you added or
              changes you made will be lost.
            </p>
            <input
              className="stacks-page__modal-confirm-input"
              type="text"
              placeholder='Type "delete this" to confirm'
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
            />
            <div className="stacks-page__modal-btns">
              <button
                className="stacks-page__modal-btn stacks-page__modal-btn--cancel"
                onClick={closeResetModal}
              >
                Cancel
              </button>
              <button
                className="stacks-page__modal-btn stacks-page__modal-btn--confirm"
                disabled={!confirmed}
                onClick={() => {
                  closeResetModal()
                  ;(window as Window & { __cardbResetDb?: () => void }).__cardbResetDb?.()
                }}
              >
                Reset all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
