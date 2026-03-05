import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom'
import type { ResolvedGraph, NodeData, LinkData } from './types'
import { loadGraph, parseGraph } from './stack/parser'
import { loadStack, resolvedGraphToLoadedStack, buildTagCards } from './stack/load'
import { serializeStack } from './stack/serialize'
import { LoadError, ParseError } from './stack/errors'
import {
  BUILTIN_STACKS,
  loadRemoteStacks,
  saveRemoteStacks,
  type StackDef,
  type StackLoadState,
} from './stacks'
import { useDb } from './contexts/DbContext'
import {
  importStack,
  getStack,
  getStackByName,
  findStackByChecksum,
  computeChecksum,
  deleteStack,
  listModifiedStacks,
  type ImportProgressCallback,
} from './db/queries/stacks'
import { listNodes } from './db/queries/nodes'
import { listLinks } from './db/queries/links'
import { getSelectedStackId, setSelectedStack } from './db/queries/appState'
import {
  getSavedDirectoryHandle,
  getLastBackupTime,
  canAutoBackup,
  requestBackupPermission,
  pickDirectoryHandle,
  backupModifiedStacks,
  clearSavedDirectoryHandle,
} from './backup'
import { CardControls } from './components/CardControls'
import { CardView } from './components/CardView'
import { NavBar } from './components/NavBar'
import { CardRenderContext } from './contexts/CardRenderContext'
import { updateNodeField } from './db/queries/nodes'
import { TagIndex } from './components/TagIndex'
import { TagView } from './components/TagView'
import { LoadingSpinner } from './components/LoadingSpinner'
import { ErrorMessage } from './components/ErrorMessage'
import { StacksPage } from './pages/StacksPage'
import type { Db } from './db/index'

// ---------------------------------------------------------------------------
// Graph state machine
// ---------------------------------------------------------------------------

type GraphState =
  | { status: 'loading' }
  | { status: 'error'; message: string; detail?: string }
  | { status: 'loaded'; graph: ResolvedGraph; dbStackId: string | null }

// Collision: a file being loaded matches an existing modified stack's checksum
type CollisionState = {
  label: string
  resolve: (result: 'cancel' | 'replace' | 'backup-replace') => void
}

// ---------------------------------------------------------------------------
// Build a ResolvedGraph from DB records
// ---------------------------------------------------------------------------

async function buildGraphFromDb(db: Db, dbStackId: string): Promise<ResolvedGraph> {
  const [nodes, links, stackRecord] = await Promise.all([
    listNodes(db, dbStackId),
    listLinks(db, dbStackId),
    getStack(db, dbStackId),
  ])

  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  const nodeIndex = new Map<string, NodeData>()
  const orderedHandles: string[] = []

  for (const node of nodes) {
    const data: NodeData = {
      handle: node.handle,
      aliases: node.aliases,
      fields: node.fields,
      tags: node.tags,
    }
    nodeIndex.set(node.handle, data)
    for (const alias of node.aliases) {
      nodeIndex.set(alias, data)
    }
    orderedHandles.push(node.handle)
  }

  const outgoingLinks = new Map<string, LinkData[]>()
  for (const handle of orderedHandles) {
    outgoingLinks.set(handle, [])
  }

  for (const link of links) {
    const sourceNode = nodeById.get(link.sourceId)
    const targetNode = nodeById.get(link.targetId)
    if (!sourceNode || !targetNode) continue
    const list = outgoingLinks.get(sourceNode.handle) ?? []
    list.push({ rel: link.rel, targetHandle: targetNode.handle })
    outgoingLinks.set(sourceNode.handle, list)
  }

  const nodeList = orderedHandles.map((h) => nodeIndex.get(h)!)
  const stackFields = stackRecord?.stackFields ?? {}
  const tagCards = buildTagCards(nodeList)
  const defaultHandle = orderedHandles[0] ?? ''
  return { nodeIndex, outgoingLinks, defaultHandle, orderedHandles, stackFields, tagCards }
}

// ---------------------------------------------------------------------------
// Import a StackDef into the DB, return its DB stack ID
// ---------------------------------------------------------------------------

async function importStackDef(
  db: Db,
  stackDef: StackDef,
  baseUrl: string,
  fileBytes?: Uint8Array,
  onProgress?: ImportProgressCallback,
  fileChecksum?: string,
): Promise<{ id: string; stackCode?: string }> {
  let loaded

  if (fileBytes) {
    loaded = await loadStack(fileBytes)
  } else if (stackDef.source.type === 'local') {
    const graph = parseGraph(stackDef.source.content)
    loaded = resolvedGraphToLoadedStack(graph, stackDef.label)
  } else {
    const graph = await loadGraph(baseUrl, stackDef)
    loaded = resolvedGraphToLoadedStack(graph, stackDef.label)
  }

  const record = await importStack(
    db,
    loaded,
    stackDef.source.type === 'remote'
      ? (stackDef.source as { type: 'remote'; url: string }).url
      : undefined,
    onProgress,
    fileChecksum,
  )
  return { id: record.id, stackCode: loaded.stackCode }
}

// ---------------------------------------------------------------------------
// Query-param stack (?stack=<url>)
// ---------------------------------------------------------------------------

function getQueryParamStack(): StackDef | null {
  const url = new URLSearchParams(window.location.search).get('stack')
  if (!url) return null
  const label =
    url
      .split('/')
      .pop()
      ?.replace(/\.(yml|stack)$/, '') ?? 'Remote Stack'
  return { id: `param-${url}`, label, source: { type: 'remote', url } }
}

const QUERY_PARAM_STACK: StackDef | null = getQueryParamStack()

// ---------------------------------------------------------------------------
// Initial state helpers
// ---------------------------------------------------------------------------

function buildInitialStacks(): StackDef[] {
  const base = [...BUILTIN_STACKS, ...loadRemoteStacks()]
  return QUERY_PARAM_STACK ? [...base, QUERY_PARAM_STACK] : base
}

// ---------------------------------------------------------------------------
// Inner layout
// ---------------------------------------------------------------------------

function AppShell({
  graph,
  dbStackId,
  stacks,
  activeStackId,
  stackLoadStates,
  dbStatus,
  dbProgress,
  stackPaneOpen,
  onToggleStackPane,
  onSelectStack,
  onAddLocalFile,
  onAddLocalYaml,
  onAddRemote,
  onRemoveStack,
  onExportStack,
  modifiedStackNames,
  backupFolderName,
  lastBackupTime,
  onBackup,
  onChooseBackupFolder,
  onClearBackupFolder,
}: {
  graph: ResolvedGraph
  dbStackId: string | null
  stacks: StackDef[]
  activeStackId: string
  stackLoadStates: Map<string, StackLoadState>
  dbStatus: string
  dbProgress: number | null
  stackPaneOpen: boolean
  onToggleStackPane: () => void
  onSelectStack: (id: string) => void
  onAddLocalFile: (label: string, fileBytes: Uint8Array) => void
  onAddLocalYaml: (label: string, content: string) => void
  onAddRemote: (label: string, url: string) => void
  onRemoveStack: (id: string) => void
  onExportStack: () => void
  modifiedStackNames: Set<string>
  backupFolderName: string | null
  lastBackupTime: number
  onBackup: () => void
  onChooseBackupFolder: () => void
  onClearBackupFolder: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()

  const currentHandle = useMemo(() => {
    const m = location.pathname.match(/^\/node\/(.+)$/)
    return m ? decodeURIComponent(m[1]) : ''
  }, [location.pathname])

  const { db: shellDb } = useDb()
  const [showBack, setShowBack] = useState(false)
  const [isLocked, setIsLocked] = useState(true)
  const [designMode, setDesignMode] = useState(false)

  const handleFieldChange = useCallback(
    (nodeHandle: string, fieldKey: string, value: unknown) => {
      if (!shellDb || !dbStackId) return
      void updateNodeField(shellDb, dbStackId, nodeHandle, fieldKey, value)
    },
    [shellDb, dbStackId],
  )

  const handleNavigate = useCallback((handle: string) => navigate(`/node/${handle}`), [navigate])

  useEffect(() => {
    const m = location.pathname.match(/^\/node\/(.+)$/)
    if (m && !graph.nodeIndex.has(decodeURIComponent(m[1]))) {
      navigate(`/node/${graph.defaultHandle}`, { replace: true })
    }
  }, [graph.nodeIndex, graph.defaultHandle, navigate])

  const cardRenderValue = {
    db: shellDb,
    dbStackId,
    designMode,
    onFieldChange: handleFieldChange,
    onNavigate: handleNavigate,
  }

  return (
    <CardRenderContext.Provider value={cardRenderValue}>
      <div className="app">
        <header className="app-header">
          <NavBar
            graph={graph}
            stacks={stacks}
            activeStackId={activeStackId}
            stackPaneOpen={stackPaneOpen}
            onToggleStackPane={onToggleStackPane}
            onSelectStack={onSelectStack}
            modifiedStackNames={modifiedStackNames}
            onBackup={onBackup}
          />
        </header>

        {/* Non-blocking DB status indicator */}
        {(dbStatus === 'initializing' || dbProgress !== null) && (
          <div className="db-status-bar" aria-live="polite">
            {dbProgress !== null ? (
              <>
                <span className="db-status-bar__label">Data loading…</span>
                <div className="db-status-bar__track">
                  <div
                    className="db-status-bar__fill"
                    style={{ width: `${Math.round(dbProgress * 100)}%` }}
                  />
                </div>
                <span className="db-status-bar__pct">{Math.round(dbProgress * 100)}%</span>
              </>
            ) : (
              <>
                <span className="db-status-bar__dot" />
                Initializing local database…
              </>
            )}
          </div>
        )}
        {dbStatus === 'error' && (
          <div className="db-status-bar db-status-bar--error" aria-live="polite">
            Local database unavailable — changes won't be saved
          </div>
        )}

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to={`/node/${graph.defaultHandle}`} replace />} />
            <Route
              path="/node/:handle"
              element={
                <CardContent
                  graph={graph}
                  orderedHandles={graph.orderedHandles}
                  currentHandle={currentHandle}
                  showBack={showBack}
                  onToggleBack={setShowBack}
                  isLocked={isLocked}
                  onToggleLocked={setIsLocked}
                  designMode={designMode}
                  onSetDesignMode={setDesignMode}
                />
              }
            />
            <Route path="/tag" element={<TagIndex graph={graph} />} />
            <Route path="/tag/:tagname" element={<TagView graph={graph} />} />
            <Route
              path="/stacks"
              element={
                <StacksPage
                  stacks={stacks}
                  activeStackId={activeStackId}
                  stackLoadStates={stackLoadStates}
                  onSelectStack={onSelectStack}
                  onAddLocalFile={onAddLocalFile}
                  onAddLocalYaml={onAddLocalYaml}
                  onAddRemote={onAddRemote}
                  onRemoveStack={onRemoveStack}
                  onExportStack={onExportStack}
                  modifiedStackNames={modifiedStackNames}
                  backupFolderName={backupFolderName}
                  lastBackupTime={lastBackupTime}
                  onChooseBackupFolder={onChooseBackupFolder}
                  onClearBackupFolder={onClearBackupFolder}
                />
              }
            />
            <Route path="*" element={<Navigate to={`/node/${graph.defaultHandle}`} replace />} />
          </Routes>
        </main>
      </div>
    </CardRenderContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Card content
// ---------------------------------------------------------------------------

function CardContent({
  graph,
  orderedHandles,
  currentHandle,
  showBack,
  onToggleBack,
  isLocked,
  onToggleLocked,
  designMode,
  onSetDesignMode,
}: {
  graph: ResolvedGraph
  orderedHandles: string[]
  currentHandle: string
  showBack: boolean
  onToggleBack: (val: boolean) => void
  isLocked: boolean
  onToggleLocked: (val: boolean) => void
  designMode: boolean
  onSetDesignMode: (val: boolean) => void
}) {
  const { handle } = useParams<{ handle: string }>()
  const navigate = useNavigate()

  const node: NodeData | undefined = handle ? graph.nodeIndex.get(handle) : undefined

  const linksByRel = useMemo<Map<string, LinkData[]>>(() => {
    if (!node) return new Map()
    return (graph.outgoingLinks.get(node.handle) ?? []).reduce((acc, link) => {
      const list = acc.get(link.rel) ?? []
      list.push(link)
      acc.set(link.rel, list)
      return acc
    }, new Map<string, LinkData[]>())
  }, [node, graph.outgoingLinks])

  if (!node) {
    return (
      <ErrorMessage
        message={`Node "${handle}" not found in the graph.`}
        detail="The handle may have changed or does not exist in the stack file."
      />
    )
  }

  return (
    <div className="card-layout">
      <CardView
        node={node}
        linksByRel={linksByRel}
        nodeIndex={graph.nodeIndex}
        onNavigate={(h) => navigate(`/node/${h}`)}
        showBack={showBack}
        graph={graph}
        stackCode={graph.stackCode}
      />
      <CardControls
        orderedHandles={orderedHandles}
        currentHandle={currentHandle}
        showBack={showBack}
        onToggleBack={onToggleBack}
        isLocked={isLocked}
        onToggleLocked={onToggleLocked}
        designMode={designMode}
        onSetDesignMode={onSetDesignMode}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root app
// ---------------------------------------------------------------------------

export function App() {
  const { db, dbStatus, dbError } = useDb()
  const [stacks, setStacks] = useState<StackDef[]>(buildInitialStacks)
  const [activeStackId, setActiveStackId] = useState<string>(
    QUERY_PARAM_STACK?.id ?? BUILTIN_STACKS[0].id,
  )
  const [stackLoadStates, setStackLoadStates] = useState<Map<string, StackLoadState>>(new Map())
  const [stackPaneOpen, setStackPaneOpen] = useState(false)
  const [graphState, setGraphState] = useState<GraphState>({ status: 'loading' })
  // null = not importing; 0.0–1.0 = import in progress (drives the progress bar)
  const [dbProgress, setDbProgress] = useState<number | null>(null)
  const [collisionState, setCollisionState] = useState<CollisionState | null>(null)

  // Backup state
  // Track names of stacks with is_modified=TRUE (names match StackDef.label)
  const [modifiedStackNames, setModifiedStackNames] = useState<Set<string>>(new Set())
  const [lastBackupTime, setLastBackupTime] = useState(0)
  const [backupFolderName, setBackupFolderName] = useState<string | null>(null)

  // Refs so async callbacks always see current values without stale closures
  const activeStackIdRef = useRef(activeStackId)
  activeStackIdRef.current = activeStackId
  const stacksRef = useRef(stacks)
  stacksRef.current = stacks
  const graphStateRef = useRef(graphState)
  graphStateRef.current = graphState

  // Guards against React StrictMode running effects twice — syncWithDb must
  // only run once per page load (concurrent runs cause PGlite BroadcastChannel errors)
  const dbSyncedRef = useRef(false)

  // ---------------------------------------------------------------------------
  // Backup: load saved state from IDB on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    void (async () => {
      const [handle, time] = await Promise.all([getSavedDirectoryHandle(), getLastBackupTime()])
      if (handle) setBackupFolderName(handle.name)
      setLastBackupTime(time)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Step 1: Load from YAML immediately on mount — no waiting for DB
  // ---------------------------------------------------------------------------
  useEffect(() => {
    void loadYamlFast(QUERY_PARAM_STACK ?? BUILTIN_STACKS[0])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadYamlFast(stackDef: StackDef) {
    setActiveStackId(stackDef.id)
    setGraphState({ status: 'loading' })
    try {
      const graph = await loadGraph(import.meta.env.BASE_URL, stackDef)
      setGraphState({ status: 'loaded', graph, dbStackId: null })
    } catch (err: unknown) {
      setGraphState({
        status: 'error',
        message: `Failed to load "${stackDef.label}".`,
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2: When DB becomes ready (background), sync with it
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!db || dbSyncedRef.current) return
    dbSyncedRef.current = true
    void syncWithDb(db)
  }, [db]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Step 3: Once DB is ready, check backup status; then recheck every 30 s
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!db) return
    void checkAndMaybeAutoBackup(db)
    const id = setInterval(() => void checkAndMaybeAutoBackup(db), 5_000)
    return () => clearInterval(id)
  }, [db]) // eslint-disable-line react-hooks/exhaustive-deps

  async function syncWithDb(db: Db) {
    setDbProgress(0)
    const t0 = performance.now()

    // Always delete bundled stacks from DB so file updates are picked up on every load.
    // Bundled stacks are app-controlled content, not user data.
    for (const builtin of BUILTIN_STACKS) {
      const existing = await getStackByName(db, builtin.label)
      if (existing) await deleteStack(db, existing.id)
    }

    // Check for a previously-selected stack in DB (returning user)
    const savedId = await getSelectedStackId(db)

    if (savedId && !QUERY_PARAM_STACK) {
      // DB has a previously selected stack — switch to it
      try {
        const graph = await buildGraphFromDb(db, savedId)
        if (graph.orderedHandles.length === 0) {
          throw new Error('Empty graph — DB may have stale or partial data')
        }
        const elapsed = (performance.now() - t0).toFixed(0)
        console.log(`[cardb/db] Restored saved stack from DB in ${elapsed}ms`)
        setGraphState({ status: 'loaded', graph, dbStackId: savedId })
        setDbProgress(null)
        return
      } catch (err) {
        console.warn('[cardb/db] DB restore failed, re-importing from YAML:', err)
        // Fall through to import
      }
    }

    // First visit (or DB was reset): import the YAML graph we already have
    const currentGs = graphStateRef.current
    const activeStackId = activeStackIdRef.current
    const stacks = stacksRef.current

    if (currentGs.status !== 'loaded') {
      setDbProgress(null)
      return
    }

    const stackDef = stacks.find((s) => s.id === activeStackId) ?? stacks[0]
    try {
      const { id: dbStackId } = await importStackDef(
        db,
        stackDef,
        import.meta.env.BASE_URL,
        undefined,
        (pct) => setDbProgress(pct),
      )
      await setSelectedStack(db, dbStackId)
      const elapsed = (performance.now() - t0).toFixed(0)
      console.log(`[cardb/db] Imported "${stackDef.label}" to DB in ${elapsed}ms`)
      // Update dbStackId in graphState without re-rendering the graph
      setGraphState((prev) => (prev.status === 'loaded' ? { ...prev, dbStackId } : prev))
    } catch (err) {
      console.warn('[cardb/db] Background import failed:', err)
    } finally {
      setDbProgress(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Backup helpers
  // ---------------------------------------------------------------------------

  async function checkAndMaybeAutoBackup(db: Db) {
    const modified = await listModifiedStacks(db)
    setModifiedStackNames(new Set(modified.map((s) => s.name)))
    if (modified.length === 0) return

    // Try a silent auto-backup if we already have a handle with permission
    const handle = await getSavedDirectoryHandle()
    if (!handle || !(await canAutoBackup(handle))) return

    try {
      const t = await backupModifiedStacks(db, handle)
      setLastBackupTime(t.getTime())
      setModifiedStackNames(new Set())
    } catch (err) {
      console.warn('[cardb/backup] Auto-backup failed:', err)
    }
  }

  const handleTriggerBackup = useCallback(async () => {
    if (!db) return

    let handle = await getSavedDirectoryHandle()
    if (!handle) {
      try {
        handle = await pickDirectoryHandle()
        setBackupFolderName(handle.name)
      } catch {
        return // user cancelled picker
      }
    } else {
      const ok = await requestBackupPermission(handle)
      if (!ok) return
    }

    try {
      const t = await backupModifiedStacks(db, handle)
      setLastBackupTime(t.getTime())
      setModifiedStackNames(new Set())
    } catch (err) {
      console.warn('[cardb/backup] Backup failed:', err)
    }
  }, [db])

  const handleChooseBackupFolder = useCallback(async () => {
    try {
      const handle = await pickDirectoryHandle()
      setBackupFolderName(handle.name)
      if (db) {
        const ok = await requestBackupPermission(handle)
        if (ok) {
          try {
            const t = await backupModifiedStacks(db, handle)
            setLastBackupTime(t.getTime())
            setModifiedStackNames(new Set())
          } catch (err) {
            console.warn('[cardb/backup] Backup after folder select failed:', err)
          }
        }
      }
    } catch {
      // user cancelled picker
    }
  }, [db])

  const handleClearBackupFolder = useCallback(async () => {
    await clearSavedDirectoryHandle()
    setBackupFolderName(null)
    setLastBackupTime(0)
  }, [])

  // ---------------------------------------------------------------------------
  // Stack switch: use DB if ready, otherwise YAML
  // ---------------------------------------------------------------------------

  function setLoadState(stackId: string, state: StackLoadState) {
    setStackLoadStates((prev) => new Map(prev).set(stackId, state))
  }

  // Ask the user whether to overwrite a modified stack.
  function askCollisionConfirm(label: string): Promise<'cancel' | 'replace' | 'backup-replace'> {
    return new Promise((resolve) => {
      setCollisionState({ label, resolve })
    })
  }

  async function loadStackDef(stackDef: StackDef, fileBytes?: Uint8Array) {
    setLoadState(stackDef.id, 'loading')
    setActiveStackId(stackDef.id)

    try {
      if (db) {
        // --- Compute checksum for collision detection ---
        let fileChecksum: string | undefined

        // Resolve remote URL to bytes so both ZIP and plain YAML remotes work
        let resolvedBytes = fileBytes
        if (resolvedBytes) {
          fileChecksum = await computeChecksum(resolvedBytes)
        } else if (stackDef.source.type === 'remote') {
          const url = (stackDef.source as { type: 'remote'; url: string }).url
          const resp = await fetch(url)
          if (!resp.ok) throw new LoadError(new Error(`HTTP ${resp.status} ${resp.statusText}`))
          resolvedBytes = new Uint8Array(await resp.arrayBuffer())
          fileChecksum = await computeChecksum(resolvedBytes)
        } else if (stackDef.source.type === 'local' && stackDef.source.content) {
          fileChecksum = await computeChecksum(stackDef.source.content)
        }
        fileBytes = resolvedBytes

        // --- Collision check ---
        if (fileChecksum) {
          const collision = await findStackByChecksum(db, fileChecksum)
          if (collision) {
            if (!collision.isModified) {
              // Same file, no edits — silent replace
              await deleteStack(db, collision.id)
            } else {
              // Same file, stored copy has been edited — ask what to do
              const result = await askCollisionConfirm(collision.name)
              setCollisionState(null)
              if (result === 'cancel') {
                setLoadState(stackDef.id, 'loaded')
                return
              }
              if (result === 'backup-replace') {
                await handleTriggerBackup()
              }
              await deleteStack(db, collision.id)
            }
          }
        }

        // --- Check for matching name (non-file switch, no checksum) ---
        if (!fileChecksum) {
          const existing = await getStackByName(db, stackDef.label)
          if (existing) {
            // Instant switch — no import needed
            const graph = await buildGraphFromDb(db, existing.id)
            await setSelectedStack(db, existing.id)
            setGraphState({ status: 'loaded', graph, dbStackId: existing.id })
            setLoadState(stackDef.id, 'loaded')
            return
          }
        }

        // --- Import to DB ---
        setDbProgress(0)
        try {
          const { id: dbStackId, stackCode } = await importStackDef(
            db,
            stackDef,
            import.meta.env.BASE_URL,
            fileBytes,
            (pct) => setDbProgress(pct),
            fileChecksum,
          )
          await setSelectedStack(db, dbStackId)
          const graph = await buildGraphFromDb(db, dbStackId)
          setGraphState({
            status: 'loaded',
            graph: stackCode ? { ...graph, stackCode } : graph,
            dbStackId,
          })
          setLoadState(stackDef.id, 'loaded')
        } finally {
          setDbProgress(null)
        }
      } else {
        // DB not ready yet — use YAML (show spinner while fetching)
        setGraphState({ status: 'loading' })
        if (fileBytes) {
          const loaded = await loadStack(fileBytes)
          const graph: ResolvedGraph = {
            nodeIndex: new Map(
              loaded.nodes.map((n) => [
                n.handle,
                { handle: n.handle, aliases: n.aliases, fields: n.fields, tags: n.tags },
              ]),
            ),
            outgoingLinks: new Map(),
            defaultHandle: loaded.firstCardHandle ?? loaded.nodes[0]?.handle ?? '',
            orderedHandles: loaded.nodes.map((n) => n.handle),
          }
          setGraphState({ status: 'loaded', graph, dbStackId: null })
        } else {
          const graph = await loadGraph(import.meta.env.BASE_URL, stackDef)
          setGraphState({ status: 'loaded', graph, dbStackId: null })
        }
        setLoadState(stackDef.id, 'loaded')
      }
    } catch (err: unknown) {
      setDbProgress(null)
      setCollisionState(null)
      setLoadState(stackDef.id, 'error')
      const label = stackDef.label
      if (err instanceof LoadError) {
        setGraphState({
          status: 'error',
          message: `Failed to load "${label}". Check your network connection.`,
          detail: String(err.cause),
        })
      } else if (err instanceof ParseError) {
        setGraphState({
          status: 'error',
          message: `Failed to parse "${label}".`,
          detail: err.message,
        })
      } else {
        setGraphState({
          status: 'error',
          message: `Failed to load "${label}".`,
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  const handleSelectStack = useCallback(
    (id: string) => {
      const stackDef = stacksRef.current.find((s) => s.id === id)
      if (!stackDef) return
      setStackPaneOpen(false)
      void loadStackDef(stackDef)
    },
    [db], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleAddLocalFile = useCallback(
    (label: string, fileBytes: Uint8Array) => {
      const id = `local-${Date.now()}`
      const newStack: StackDef = { id, label, source: { type: 'local', content: '' } }
      setStacks((prev) => [...prev, newStack])
      setStackPaneOpen(false)
      void loadStackDef(newStack, fileBytes)
    },
    [db], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleAddLocalYaml = useCallback(
    (label: string, content: string) => {
      const id = `local-${Date.now()}`
      const newStack: StackDef = { id, label, source: { type: 'local', content } }
      setStacks((prev) => [...prev, newStack])
      setStackPaneOpen(false)
      void loadStackDef(newStack)
    },
    [db], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleAddRemote = useCallback(
    (label: string, url: string) => {
      const id = `remote-${Date.now()}`
      const newStack: StackDef = { id, label, source: { type: 'remote', url } }
      setStacks((prev) => {
        const next = [...prev, newStack]
        saveRemoteStacks(next)
        return next
      })
      setStackPaneOpen(false)
      void loadStackDef(newStack)
    },
    [db], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleRemoveStack = useCallback(
    (stackId: string) => {
      setStacks((prev) => {
        const next = prev.filter((s) => s.id !== stackId)
        saveRemoteStacks(next)
        return next
      })
      if (activeStackIdRef.current === stackId) {
        setGraphState({ status: 'loading' })
        void loadStackDef(BUILTIN_STACKS[0])
      }
    },
    [db], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleExportStack = useCallback(async () => {
    const gs = graphStateRef.current
    if (gs.status !== 'loaded' || !gs.dbStackId || !db) return
    try {
      const { exportStackToMemory } = await import('./db/queries/export')
      const loaded = await exportStackToMemory(db, gs.dbStackId)
      const blob = await serializeStack(loaded)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${loaded.title}.stack`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }, [db])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Only block on graph loading — not on DB
  if (graphState.status === 'loading') {
    return (
      <div className="app">
        <LoadingSpinner label="Loading graph…" />
      </div>
    )
  }

  if (graphState.status === 'error') {
    return (
      <div className="app">
        <ErrorMessage message={graphState.message} detail={graphState.detail} />
      </div>
    )
  }

  const { graph } = graphState

  return (
    <>
      <AppShell
        graph={graph}
        dbStackId={graphState.dbStackId}
        stacks={stacks}
        activeStackId={activeStackId}
        stackLoadStates={stackLoadStates}
        dbStatus={dbError ? 'error' : dbStatus}
        dbProgress={dbProgress}
        stackPaneOpen={stackPaneOpen}
        onToggleStackPane={() => setStackPaneOpen((v) => !v)}
        onSelectStack={handleSelectStack}
        onAddLocalFile={handleAddLocalFile}
        onAddLocalYaml={handleAddLocalYaml}
        onAddRemote={handleAddRemote}
        onRemoveStack={handleRemoveStack}
        onExportStack={handleExportStack}
        modifiedStackNames={modifiedStackNames}
        backupFolderName={backupFolderName}
        lastBackupTime={lastBackupTime}
        onBackup={() => void handleTriggerBackup()}
        onChooseBackupFolder={() => void handleChooseBackupFolder()}
        onClearBackupFolder={() => void handleClearBackupFolder()}
      />
      {collisionState && (
        <div className="stacks-page__modal-backdrop">
          <div className="stacks-page__modal" role="dialog" aria-modal="true">
            <h2 className="stacks-page__modal-title">Unsaved changes</h2>
            <p className="stacks-page__modal-body">
              <strong>{collisionState.label}</strong> has unsaved changes that will be lost if you
              replace it.
            </p>
            <div className="stacks-page__modal-btns">
              <button
                className="stacks-page__modal-btn stacks-page__modal-btn--cancel"
                onClick={() => collisionState.resolve('cancel')}
              >
                Cancel
              </button>
              <button
                className="stacks-page__modal-btn stacks-page__modal-btn--cancel"
                onClick={() => collisionState.resolve('replace')}
              >
                Replace
              </button>
              <button
                className="stacks-page__modal-btn stacks-page__modal-btn--confirm"
                onClick={() => collisionState.resolve('backup-replace')}
              >
                Back up &amp; replace
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
