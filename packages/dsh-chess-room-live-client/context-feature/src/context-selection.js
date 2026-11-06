// Metadata-only client state. The Host validates membership and owns persistence.
const PAGE_SIZE = 30;
const STATUSES = new Set(['unbound', 'ready', 'missing-workspace', 'missing-session', 'archived', 'membership-mismatch', 'unavailable']);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : null;
const title = value => typeof value === 'string' ? value.slice(0, 512) : null;
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
function bindingOf(value) {
  const b = value || {};
  return {
    workspaceId: id(b.workspaceId), sessionId: id(b.sessionId), revision: integer(b.revision) ?? 0,
    workspaceTitle: title(b.workspaceTitle), sessionTitle: title(b.sessionTitle),
    status: STATUSES.has(b.status) ? b.status : b.workspaceId ? 'unavailable' : 'unbound',
    history: { messageCount: integer(b.history?.messageCount) ?? 0, characterCount: integer(b.history?.characterCount) ?? 0,
      truncated: b.history?.truncated === true, observedAt: title(b.history?.observedAt) }
  };
}
function rowsOf(rows, key) {
  if (!Array.isArray(rows)) throw Object.assign(new Error('Invalid catalog'), { code: 'unavailable' });
  const seen = new Set();
  return rows.flatMap(row => {
    const value = id(row?.[key]);
    if (!value || seen.has(value)) return [];
    seen.add(value);
    return [{ [key]: value, title: title(row.title) }];
  });
}
export function createContextSelectionController(api, emit = () => {}) {
  if (typeof api?.catalog !== 'function' || typeof api?.bind !== 'function') throw new TypeError('Context catalog/bind adapters are required');
  let active = true, catalogGeneration = 0, mutationGeneration = 0, snapshotEpoch = 0, started = false, runtimeId = '';
  let state = { binding: bindingOf(null), workspaceId: '', sessionId: '', workspaces: [], conversations: [],
    total: 0, nextOffset: null, loading: false, mutating: false, error: '', catalogError: '', notice: '' };
  const publish = patch => { state = { ...state, ...patch }; if (active) emit(state); };
  const current = generation => active && generation === catalogGeneration;
  function align(binding) {
    catalogGeneration++;
    publish({ binding, workspaceId: binding.workspaceId || '', sessionId: binding.sessionId || '',
      conversations: [], total: 0, nextOffset: null, loading: false, error: '', notice: '' });
  }
  function snapshot(binding, nextRuntimeId = '') {
    if (!active) return false;
    const next = bindingOf(binding), changedRuntime = nextRuntimeId !== runtimeId;
    if (!changedRuntime && (next.revision < state.binding.revision || next.revision === state.binding.revision &&
        (next.workspaceId !== state.binding.workspaceId || next.sessionId !== state.binding.sessionId))) return false;
    const changedIdentity = changedRuntime || next.revision > state.binding.revision ||
      next.workspaceId !== state.binding.workspaceId || next.sessionId !== state.binding.sessionId;
    runtimeId = nextRuntimeId;
    snapshotEpoch++;
    if (changedRuntime) { mutationGeneration++; publish({ mutating: false }); }
    if (changedIdentity) {
      align(next);
      if (started) void load(false);
    } else publish({ binding: next });
    return true;
  }
  async function load(append = false) {
    if (!active || state.mutating || append && (state.loading || state.nextOffset === null)) return false;
    const workspaceId = state.workspaceId;
    const offset = append ? state.nextOffset : 0;
    const generation = ++catalogGeneration, originSnapshot = snapshotEpoch;
    publish({ loading: true, catalogError: '' });
    try {
      const catalog = await api.catalog({ ...(workspaceId ? { workspaceId } : {}), offset, limit: PAGE_SIZE });
      if (!current(generation)) return false;
      if (!catalog || (catalog.selectedWorkspaceId || '') !== workspaceId) throw Object.assign(new Error('Catalog selection mismatch'), { code: 'stale' });
      const workspaces = rowsOf(catalog.workspaces, 'workspaceId');
      const rows = rowsOf(catalog.conversations, 'sessionId');
      const binding = bindingOf(catalog.contextBinding);
      if (binding.revision > state.binding.revision) {
        align(binding);
        void load(false);
        return false;
      }
      const conversations = append ? rowsOf([...state.conversations, ...rows], 'sessionId') : rows;
      const next = integer(catalog.nextOffset);
      publish({ workspaces, conversations, total: integer(catalog.total) ?? conversations.length,
        nextOffset: next !== null && next > offset ? next : null, loading: false,
        binding: originSnapshot === snapshotEpoch && binding.revision === state.binding.revision && binding.workspaceId === state.binding.workspaceId && binding.sessionId === state.binding.sessionId ? binding : state.binding });
      return true;
    } catch (error) {
      if (current(generation)) publish({ loading: false, catalogError: error?.code || 'unavailable' });
      return false;
    }
  }
  function selectWorkspace(workspaceId) {
    if (!active || state.mutating) return false;
    const value = id(workspaceId) || '';
    if (value && !state.workspaces.some(row => row.workspaceId === value)) return false;
    catalogGeneration++;
    publish({ workspaceId: value, sessionId: '', conversations: [], total: 0, nextOffset: null,
      loading: false, error: '', notice: value ? 'choose-conversation' : '' });
    if (value) void load(false);
    return true;
  }
  async function mutate(workspaceId, sessionId) {
    if (!active || state.mutating) return false;
    const generation = ++mutationGeneration, originRuntime = runtimeId;
    catalogGeneration++;
    publish({ mutating: true, loading: false, error: '', notice: '' });
    try {
      const result = await api.bind({ workspaceId, sessionId });
      if (!active || generation !== mutationGeneration || runtimeId !== originRuntime) return false;
      const binding = bindingOf(result?.contextBinding);
      if (!result?.contextBinding || binding.workspaceId !== workspaceId || binding.sessionId !== sessionId) {
        throw Object.assign(new Error('Binding was not confirmed'), { code: 'unavailable' });
      }
      if (binding.revision < state.binding.revision || binding.revision === state.binding.revision &&
          (binding.workspaceId !== state.binding.workspaceId || binding.sessionId !== state.binding.sessionId)) {
        throw Object.assign(new Error('Binding changed'), { code: 'stale' });
      }
      align(binding);
      publish({ notice: binding.status === 'unbound' ? 'cleared' : 'saved' });
      return true;
    } catch (error) {
      if (active && generation === mutationGeneration) {
        publish({ workspaceId: state.binding.workspaceId || '', sessionId: state.binding.sessionId || '',
          error: error?.code || 'unavailable' });
      }
      return false;
    } finally {
      if (active && generation === mutationGeneration) {
        publish({ mutating: false });
        void load(false);
      }
    }
  }
  function selectConversation(sessionId) {
    if (!active || state.mutating || state.loading) return Promise.resolve(false);
    const value = id(sessionId);
    if (!value || !state.workspaceId || !state.conversations.some(row => row.sessionId === value)) return Promise.resolve(false);
    publish({ sessionId: value });
    return mutate(state.workspaceId, value);
  }
  return {
    getState: () => state, snapshot,
    start() { if (!active || started) return; started = true; void load(false); },
    refresh: () => load(false), loadMore: () => load(true), selectWorkspace, selectConversation,
    unbind: () => mutate(null, null),
    dispose() { active = false; catalogGeneration++; mutationGeneration++; }
  };
}
