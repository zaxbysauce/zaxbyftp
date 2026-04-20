/**
 * AppContext — global application state.
 *
 * Wires the WebView2 message router to React state so that progress events,
 * host-key prompts and error messages surface in the UI automatically.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import * as bridge from '../api/bridge';
import type {
  FileItem,
  HostKeyPrompt,
  InboundMessage,
  LogEntry,
  LogLevel,
  Protocol,
  Site,
  TransferItem,
} from '../types';

// ── State ────────────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

interface AppState {
  // Connection
  sessionId: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // Local pane
  localPath: string;
  localItems: FileItem[];
  localLoading: boolean;
  localError: string | null;

  // Remote pane
  remotePath: string;
  remoteItems: FileItem[];
  remoteLoading: boolean;
  remoteError: string | null;

  // Sites
  sites: Site[];

  // Bottom panel
  transfers: TransferItem[];
  logs: LogEntry[];
  hostKeyPrompt: HostKeyPrompt | null;
  activeBottomTab: 'transfers' | 'log' | 'messages';
}

const initialState: AppState = {
  sessionId: null,
  connectionStatus: 'disconnected',
  connectionError: null,
  localPath: 'C:\\',
  localItems: [],
  localLoading: false,
  localError: null,
  remotePath: '/',
  remoteItems: [],
  remoteLoading: false,
  remoteError: null,
  sites: [],
  transfers: [],
  logs: [],
  hostKeyPrompt: null,
  activeBottomTab: 'transfers',
};

// ── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_CONNECTING' }
  | { type: 'CONNECTED'; sessionId: string }
  | { type: 'CONNECT_ERROR'; error: string }
  | { type: 'DISCONNECTED' }
  | { type: 'SET_LOCAL_LOADING' }
  | { type: 'SET_LOCAL_ITEMS'; path: string; items: FileItem[] }
  | { type: 'SET_LOCAL_ERROR'; error: string }
  | { type: 'SET_REMOTE_LOADING' }
  | { type: 'SET_REMOTE_ITEMS'; path: string; items: FileItem[] }
  | { type: 'SET_REMOTE_ERROR'; error: string }
  | { type: 'SET_SITES'; sites: Site[] }
  | { type: 'ADD_TRANSFER'; transfer: TransferItem }
  | { type: 'UPDATE_TRANSFER'; partial: Partial<TransferItem> & { transferId: string } }
  | { type: 'ADD_LOG'; entry: LogEntry }
  | { type: 'SET_HOST_KEY_PROMPT'; prompt: HostKeyPrompt | null }
  | { type: 'SET_BOTTOM_TAB'; tab: AppState['activeBottomTab'] };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CONNECTING':
      return {
        ...state,
        connectionStatus: 'connecting',
        connectionError: null,
      };
    case 'CONNECTED':
      return {
        ...state,
        connectionStatus: 'connected',
        sessionId: action.sessionId,
        connectionError: null,
        remoteItems: [],
        remoteError: null,
      };
    case 'CONNECT_ERROR':
      return {
        ...state,
        connectionStatus: 'error',
        connectionError: action.error,
      };
    case 'DISCONNECTED':
      return {
        ...state,
        connectionStatus: 'disconnected',
        sessionId: null,
        remoteItems: [],
        remotePath: '/',
        remoteError: null,
      };
    case 'SET_LOCAL_LOADING':
      return { ...state, localLoading: true, localError: null };
    case 'SET_LOCAL_ITEMS':
      return {
        ...state,
        localLoading: false,
        localPath: action.path,
        localItems: action.items,
        localError: null,
      };
    case 'SET_LOCAL_ERROR':
      return { ...state, localLoading: false, localError: action.error };
    case 'SET_REMOTE_LOADING':
      return { ...state, remoteLoading: true, remoteError: null };
    case 'SET_REMOTE_ITEMS':
      return {
        ...state,
        remoteLoading: false,
        remotePath: action.path,
        remoteItems: action.items,
        remoteError: null,
      };
    case 'SET_REMOTE_ERROR':
      return { ...state, remoteLoading: false, remoteError: action.error };
    case 'SET_SITES':
      return { ...state, sites: action.sites };
    case 'ADD_TRANSFER':
      return { ...state, transfers: [action.transfer, ...state.transfers] };
    case 'UPDATE_TRANSFER':
      return {
        ...state,
        transfers: state.transfers.map(t =>
          t.transferId === action.partial.transferId
            ? { ...t, ...action.partial }
            : t,
        ),
      };
    case 'ADD_LOG':
      return {
        ...state,
        logs: [...state.logs, action.entry].slice(-500), // cap at 500 entries
      };
    case 'SET_HOST_KEY_PROMPT':
      return { ...state, hostKeyPrompt: action.prompt };
    case 'SET_BOTTOM_TAB':
      return { ...state, activeBottomTab: action.tab };
    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  connect: (
    host: string,
    port: number,
    user: string,
    pass: string,
    protocol: Protocol,
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  navigateLocal: (path: string) => Promise<void>;
  navigateRemote: (path: string) => Promise<void>;
  refreshLocal: () => Promise<void>;
  refreshRemote: () => Promise<void>;
  startUpload: (localPath: string, remotePath: string) => void;
  startDownload: (remotePath: string, localPath: string) => void;
  mkdirRemote: (parentPath: string, name: string) => Promise<void>;
  renameRemote: (oldPath: string, newPath: string) => Promise<void>;
  deleteRemote: (path: string) => Promise<void>;
  trustHost: () => void;
  rejectHost: () => void;
  loadSites: () => Promise<void>;
  saveSite: (site: Site) => Promise<void>;
  deleteSite: (name: string) => Promise<void>;
  setBottomTab: (tab: AppState['activeBottomTab']) => void;
  addLog: (message: string, level?: LogLevel) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Stable refs for async operations ─────────────────────────────────────
  // useCallback closures capture deps at creation time.  Long-running async
  // operations (mkdir / rename / delete) need the CURRENT session ID and path
  // when the await resolves, not the stale value at call time.  Using refs
  // avoids a race where a completed operation re-lists the wrong directory
  // (i.e. the directory the user navigated away from while the op was pending).
  const sessionIdRef  = useRef<string | null>(null);
  const remotePathRef = useRef<string>('/');
  useEffect(() => { sessionIdRef.current  = state.sessionId;  }, [state.sessionId]);
  useEffect(() => { remotePathRef.current = state.remotePath; }, [state.remotePath]);

  // ── Logging helper ──────────────────────────────────────────────────────
  const addLog = useCallback((message: string, level: LogLevel = 'info') => {
    dispatch({
      type: 'ADD_LOG',
      entry: {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        message,
        level,
      },
    });
  }, []);

  // ── Global WebView2 message listener ──────────────────────────────────
  useEffect(() => {
    const remove = bridge.addGlobalListener((msg: InboundMessage) => {
      if (msg.type === 'progress') {
        // AppBridge sends 0s for byte/speed fields on 'complete' and 'error'
        // events (PostTransferEvent omits them).  Preserve existing byte values
        // by only updating the fields that carry meaningful data in each event.
        const isTerminal = msg.status === 'complete' || msg.status === 'error';
        if (isTerminal) {
          dispatch({
            type: 'UPDATE_TRANSFER',
            partial: {
              transferId: msg.transferId,
              status: msg.status === 'complete' ? 'complete' : 'error',
              percentComplete: msg.status === 'complete' ? 100 : -1,
              error: msg.message,
            },
          });
        } else {
          dispatch({
            type: 'UPDATE_TRANSFER',
            partial: {
              transferId: msg.transferId,
              bytesTransferred: msg.bytesTransferred ?? 0,
              totalBytes: msg.totalBytes ?? 0,
              speedBytesPerSecond: msg.speedBytesPerSecond ?? 0,
              percentComplete: msg.percentComplete ?? 0,
              status: 'active',
            },
          });
        }
      } else if (msg.type === 'hostKeyPrompt') {
        dispatch({
          type: 'SET_HOST_KEY_PROMPT',
          prompt: { host: msg.host, fingerprint: msg.fingerprint },
        });
        dispatch({ type: 'SET_BOTTOM_TAB', tab: 'messages' });
      }
    });
    return remove;
  }, []);

  // ── Connect ─────────────────────────────────────────────────────────────
  const connect = useCallback(
    async (
      host: string,
      port: number,
      user: string,
      pass: string,
      protocol: Protocol,
    ) => {
      dispatch({ type: 'SET_CONNECTING' });
      addLog(`Connecting to ${host}:${port} via ${protocol}…`);
      try {
        const sessionId = await bridge.connect(host, port, user, pass, protocol);
        dispatch({ type: 'CONNECTED', sessionId });
        addLog(`Connected. Session: ${sessionId}`);
        // Auto-list the root remote directory.
        try {
          dispatch({ type: 'SET_REMOTE_LOADING' });
          const items = await bridge.listDirectory(sessionId, '/');
          dispatch({ type: 'SET_REMOTE_ITEMS', path: '/', items });
        } catch (e) {
          dispatch({ type: 'SET_REMOTE_ERROR', error: String(e) });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        dispatch({ type: 'CONNECT_ERROR', error: msg });
        addLog(`Connect failed: ${msg}`, 'error');
      }
    },
    [addLog],
  );

  // ── Disconnect ──────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    if (!state.sessionId) return;
    try {
      await bridge.disconnect(state.sessionId);
    } catch { /* best-effort */ }
    dispatch({ type: 'DISCONNECTED' });
    addLog('Disconnected.');
  }, [state.sessionId, addLog]);

  // ── Local navigation ─────────────────────────────────────────────────────
  const navigateLocal = useCallback(async (path: string) => {
    dispatch({ type: 'SET_LOCAL_LOADING' });
    addLog(`Local: listing ${path}`);
    try {
      const items = await bridge.listLocalDirectory(path);
      dispatch({ type: 'SET_LOCAL_ITEMS', path, items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dispatch({ type: 'SET_LOCAL_ERROR', error: msg });
      addLog(`Local listing failed: ${msg}`, 'error');
    }
  }, [addLog]);

  const refreshLocal = useCallback(
    () => navigateLocal(state.localPath),
    [navigateLocal, state.localPath],
  );

  // ── Remote navigation ────────────────────────────────────────────────────
  const navigateRemote = useCallback(
    async (path: string) => {
      if (!state.sessionId) return;
      dispatch({ type: 'SET_REMOTE_LOADING' });
      addLog(`Remote: listing ${path}`);
      try {
        const items = await bridge.listDirectory(state.sessionId, path);
        dispatch({ type: 'SET_REMOTE_ITEMS', path, items });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        dispatch({ type: 'SET_REMOTE_ERROR', error: msg });
        addLog(`Remote listing failed: ${msg}`, 'error');
      }
    },
    [state.sessionId, addLog],
  );

  const refreshRemote = useCallback(
    () => navigateRemote(state.remotePath),
    [navigateRemote, state.remotePath],
  );

  // ── Transfers ─────────────────────────────────────────────────────────────
  const startUpload = useCallback(
    (localPath: string, remotePath: string) => {
      if (!state.sessionId) return;
      const transferId = crypto.randomUUID();
      const filename = localPath.split(/[\\/]/).pop() ?? localPath;
      dispatch({
        type: 'ADD_TRANSFER',
        transfer: bridge.makePendingTransfer(transferId, filename, 'upload'),
      });
      addLog(`Upload: ${localPath} → ${remotePath}`);
      bridge.startUpload(state.sessionId, localPath, remotePath, transferId);
      dispatch({ type: 'SET_BOTTOM_TAB', tab: 'transfers' });
    },
    [state.sessionId, addLog],
  );

  const startDownload = useCallback(
    (remotePath: string, localPath: string) => {
      if (!state.sessionId) return;
      const transferId = crypto.randomUUID();
      const filename = remotePath.split('/').pop() ?? remotePath;
      dispatch({
        type: 'ADD_TRANSFER',
        transfer: bridge.makePendingTransfer(transferId, filename, 'download'),
      });
      addLog(`Download: ${remotePath} → ${localPath}`);
      bridge.startDownload(state.sessionId, remotePath, localPath, transferId);
      dispatch({ type: 'SET_BOTTOM_TAB', tab: 'transfers' });
    },
    [state.sessionId, addLog],
  );

  // ── Remote file operations ────────────────────────────────────────────────
  // All three helpers use sessionIdRef / remotePathRef rather than closed-over
  // state values so they refresh the directory that is CURRENT when the await
  // resolves — not the one that was current when the callback was created.
  //
  // Race guard: if the user navigated to a different directory while the op was
  // pending, we still list and dispatch the path they were on when they invoked
  // the operation (not a new path).  The resulting SET_REMOTE_ITEMS will simply
  // re-populate that old path's items without changing remotePath, because the
  // SET_REMOTE_ITEMS reducer sets remotePath to path only if they match current.
  // (Actually — we just avoid overwriting the CURRENT navigation by checking
  //  the path hasn't changed before dispatching.)

  const mkdirRemote = useCallback(
    async (parentPath: string, name: string) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      // Capture the path BEFORE the async operation starts.
      const opPath = remotePathRef.current;
      const fullPath = parentPath.replace(/\/+$/, '') + '/' + name;
      addLog(`mkdir ${fullPath}`);
      try {
        await bridge.mkdir(sessionId, fullPath);
        // Only refresh if the user is still on the same directory.
        if (remotePathRef.current === opPath && sessionIdRef.current) {
          dispatch({ type: 'SET_REMOTE_LOADING' });
          const items = await bridge.listDirectory(sessionIdRef.current, opPath);
          dispatch({ type: 'SET_REMOTE_ITEMS', path: opPath, items });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        dispatch({ type: 'SET_REMOTE_ERROR', error: msg });
        addLog(`mkdir failed: ${msg}`, 'error');
        throw e;
      }
    },
    [addLog],  // stable: sessionIdRef / remotePathRef are refs, not state
  );

  const renameRemote = useCallback(
    async (oldPath: string, newPath: string) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const opPath = remotePathRef.current;
      addLog(`rename ${oldPath} → ${newPath}`);
      try {
        await bridge.rename(sessionId, oldPath, newPath);
        if (remotePathRef.current === opPath && sessionIdRef.current) {
          dispatch({ type: 'SET_REMOTE_LOADING' });
          const items = await bridge.listDirectory(sessionIdRef.current, opPath);
          dispatch({ type: 'SET_REMOTE_ITEMS', path: opPath, items });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        dispatch({ type: 'SET_REMOTE_ERROR', error: msg });
        addLog(`rename failed: ${msg}`, 'error');
        throw e;
      }
    },
    [addLog],
  );

  const deleteRemote = useCallback(
    async (path: string) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const opPath = remotePathRef.current;
      addLog(`delete ${path}`);
      try {
        await bridge.deleteItem(sessionId, path);
        if (remotePathRef.current === opPath && sessionIdRef.current) {
          dispatch({ type: 'SET_REMOTE_LOADING' });
          const items = await bridge.listDirectory(sessionIdRef.current, opPath);
          dispatch({ type: 'SET_REMOTE_ITEMS', path: opPath, items });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        dispatch({ type: 'SET_REMOTE_ERROR', error: msg });
        addLog(`delete failed: ${msg}`, 'error');
        throw e;
      }
    },
    [addLog],
  );

  // ── Host-key ─────────────────────────────────────────────────────────────
  const trustHost = useCallback(() => {
    if (!state.hostKeyPrompt) return;
    bridge.trustHost(state.hostKeyPrompt.fingerprint);
    addLog(`Trusted host key for ${state.hostKeyPrompt.host}`);
    dispatch({ type: 'SET_HOST_KEY_PROMPT', prompt: null });
  }, [state.hostKeyPrompt, addLog]);

  const rejectHost = useCallback(() => {
    if (!state.hostKeyPrompt) return;
    bridge.rejectHost(state.hostKeyPrompt.fingerprint);
    addLog(`Rejected host key for ${state.hostKeyPrompt.host}`, 'warn');
    dispatch({ type: 'SET_HOST_KEY_PROMPT', prompt: null });
    dispatch({ type: 'DISCONNECTED' });
  }, [state.hostKeyPrompt, addLog]);

  // ── Site manager ──────────────────────────────────────────────────────────
  const loadSites = useCallback(async () => {
    try {
      const sites = await bridge.getSavedSites();
      dispatch({ type: 'SET_SITES', sites });
    } catch (e) {
      addLog(`Failed to load sites: ${String(e)}`, 'error');
    }
  }, [addLog]);

  const saveSite = useCallback(
    async (site: Site) => {
      await bridge.saveSite(site);
      await loadSites();
    },
    [loadSites],
  );

  const deleteSite = useCallback(
    async (name: string) => {
      await bridge.deleteSite(name);
      await loadSites();
    },
    [loadSites],
  );

  const setBottomTab = useCallback(
    (tab: AppState['activeBottomTab']) =>
      dispatch({ type: 'SET_BOTTOM_TAB', tab }),
    [],
  );

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    void loadSites();
    void navigateLocal('C:\\');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value: AppContextValue = {
    state,
    connect,
    disconnect,
    navigateLocal,
    navigateRemote,
    refreshLocal,
    refreshRemote,
    startUpload,
    startDownload,
    mkdirRemote,
    renameRemote,
    deleteRemote,
    trustHost,
    rejectHost,
    loadSites,
    saveSite,
    deleteSite,
    setBottomTab,
    addLog,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
