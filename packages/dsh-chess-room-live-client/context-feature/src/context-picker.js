import { createContextSelectionController } from './context-selection.js';
export const contextZh = {
  contextTitle: '对话上下文', contextWorkspace: '工作区', contextConversation: '对话',
  contextChooseWorkspace: '请选择工作区', contextChooseConversation: '请选择对话',
  contextUntitledWorkspace: '未命名工作区', contextUntitledConversation: '未命名对话',
  contextCurrent: '当前绑定', contextNone: '未绑定对话', contextRefresh: '刷新目录', contextClear: '清除绑定',
  contextMore: '加载更多对话', contextConversations: '个对话', contextLoading: '正在读取目录…',
  contextSaving: '正在保存绑定…', contextSaved: '绑定已保存', contextCleared: '已清除绑定',
  contextDraft: '选择对话后保存绑定；当前绑定暂不改变。', contextEmpty: '此工作区暂无可选对话。',
  contextCatalogError: '目录暂不可用，请刷新重试；现有绑定不变。', contextBindError: '绑定未保存，请重试。',
  contextStale: '棋室或绑定已更新，请确认选择后重试。',
  contextReadOnly: '只读最近对话，延续称呼和风格，不会启动原对话任务。',
  'contextState-unbound': '未绑定对话', 'contextState-ready': '最近对话上下文可用',
  'contextState-missing-workspace': '绑定的工作区已不存在', 'contextState-missing-session': '绑定的对话已不存在',
  'contextState-archived': '绑定的对话已归档', 'contextState-membership-mismatch': '对话已不属于此工作区',
  'contextState-unavailable': '最近对话上下文暂不可用'
};
export const contextEn = {
  contextTitle: 'Conversation context', contextWorkspace: 'Workspace', contextConversation: 'Conversation',
  contextChooseWorkspace: 'Choose a workspace', contextChooseConversation: 'Choose a conversation',
  contextUntitledWorkspace: 'Untitled workspace', contextUntitledConversation: 'Untitled conversation',
  contextCurrent: 'Current binding', contextNone: 'No conversation bound', contextRefresh: 'Refresh catalog', contextClear: 'Clear binding',
  contextMore: 'Load more conversations', contextConversations: 'conversations', contextLoading: 'Loading catalog…',
  contextSaving: 'Saving binding…', contextSaved: 'Binding saved', contextCleared: 'Binding cleared',
  contextDraft: 'Choose a conversation to save. The current binding is unchanged.', contextEmpty: 'No available conversations in this workspace.',
  contextCatalogError: 'Catalog unavailable. Refresh to retry; the existing binding is unchanged.', contextBindError: 'Binding was not saved. Please retry.',
  contextStale: 'The room or binding changed. Check your selection and try again.',
  contextReadOnly: 'Read-only recent context preserves names and style; it never starts tasks in the original conversation.',
  'contextState-unbound': 'No conversation bound', 'contextState-ready': 'Recent conversation context available',
  'contextState-missing-workspace': 'The bound workspace no longer exists', 'contextState-missing-session': 'The bound conversation no longer exists',
  'contextState-archived': 'The bound conversation is archived', 'contextState-membership-mismatch': 'The conversation no longer belongs to this workspace',
  'contextState-unavailable': 'Recent conversation context unavailable'
};
export const contextCss = `
.dcr-context-picker h3{margin-bottom:10px}.dcr-context-picker label{display:flex;flex-direction:column;gap:5px;margin:9px 0;font-size:12px}.dcr-context-picker select{width:100%;max-width:100%;text-overflow:ellipsis}.dcr-context-current{font-size:11px;color:var(--dcr-muted);overflow-wrap:anywhere;margin:9px 0!important}.dcr-context-current strong{font-weight:600;color:var(--dcr-text)}.dcr-context-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.dcr .dcr-context-actions button{font-size:11px;padding:5px 8px;min-height:32px}.dcr-context-status,.dcr-context-hint{font-size:11px;color:var(--dcr-muted);overflow-wrap:anywhere;line-height:1.5;margin-top:8px!important}.dcr-context-status.error{color:var(--dcr-accent)}.dcr .dcr-context-more{width:100%;font-size:11px;margin-top:5px}.dcr-context-count{font-size:10px;color:var(--dcr-muted)}
@container chessroom (max-width:440px){.dcr-context-picker{grid-column:1/-1}.dcr-context-picker label{font-size:12px}.dcr-context-picker select{font-size:13px}}
`;
export function createContextPicker(React) {
  const h = React.createElement;
  return function ContextPicker({ snapshot, catalog, bind, t, busy = false, online = true }) {
    const adapters = React.useRef({ catalog, bind });
    adapters.current = { catalog, bind };
    const [view, setView] = React.useState(null);
    const controllerRef = React.useRef(null);
    React.useEffect(() => {
      const controller = createContextSelectionController({
        catalog: payload => adapters.current.catalog(payload), bind: payload => adapters.current.bind(payload)
      }, setView);
      controllerRef.current = controller;
      controller.snapshot(snapshot?.contextBinding, snapshot?.runtimeId || '');
      controller.start();
      return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
    }, []);
    React.useEffect(() => {
      controllerRef.current?.snapshot(snapshot?.contextBinding, snapshot?.runtimeId || '');
    }, [snapshot?.contextBinding, snapshot?.runtimeId]);
    const state = view || { binding: snapshot?.contextBinding || { status: 'unbound' }, workspaceId: snapshot?.contextBinding?.workspaceId || '',
      sessionId: snapshot?.contextBinding?.sessionId || '', workspaces: [], conversations: [], total: 0, nextOffset: null, loading: true };
    const binding = state.binding;
    const blocked = busy || state.mutating || !online;
    const workspaceName = binding.workspaceTitle || state.workspaces.find(row => row.workspaceId === binding.workspaceId)?.title || binding.workspaceId || t('contextUntitledWorkspace');
    const sessionName = binding.sessionTitle || state.conversations.find(row => row.sessionId === binding.sessionId)?.title || binding.sessionId || t('contextUntitledConversation');
    const boundWorkspaceMissing = state.workspaceId && !state.workspaces.some(row => row.workspaceId === state.workspaceId);
    const boundConversationMissing = state.sessionId && !state.conversations.some(row => row.sessionId === state.sessionId);
    const error = state.error || state.catalogError;
    const status = state.mutating ? t('contextSaving') : state.error ? t(state.error === 'stale' ? 'contextStale' : 'contextBindError') :
      state.catalogError ? t('contextCatalogError') : !online ? t('offline') : state.loading ? t('contextLoading') :
      !['ready', 'unbound'].includes(binding.status) ? t('contextState-' + binding.status) : state.notice === 'saved' ? t('contextSaved') : state.notice === 'cleared' ? t('contextCleared') :
      state.workspaceId !== (binding.workspaceId || '') || state.sessionId !== (binding.sessionId || '') ? t('contextDraft') : t('contextState-' + binding.status);
    return h('section', { className: 'dcr-card dcr-context-picker', 'aria-label': t('contextTitle'), 'aria-busy': !!(state.loading || state.mutating) },
      h('h3', null, t('contextTitle')),
      h('label', null, h('span', null, t('contextWorkspace')),
        h('select', { value: state.workspaceId, disabled: blocked || !state.workspaces.length, 'aria-label': t('contextWorkspace'),
          onChange: event => controllerRef.current?.selectWorkspace(event.target.value) },
          h('option', { value: '' }, t('contextChooseWorkspace')),
          boundWorkspaceMissing ? h('option', { value: state.workspaceId, disabled: true }, workspaceName) : null,
          state.workspaces.map(row => h('option', { key: row.workspaceId, value: row.workspaceId }, row.title || t('contextUntitledWorkspace'))))),
      h('label', null, h('span', null, t('contextConversation')),
        h('select', { value: state.sessionId, disabled: blocked || state.loading || !state.workspaceId || !state.conversations.length, 'aria-label': t('contextConversation'),
          onChange: event => { if (event.target.value) void controllerRef.current?.selectConversation(event.target.value); } },
          h('option', { value: '' }, t('contextChooseConversation')),
          boundConversationMissing ? h('option', { value: state.sessionId, disabled: binding.status !== 'ready' }, sessionName) : null,
          state.conversations.map(row => h('option', { key: row.sessionId, value: row.sessionId }, row.title || t('contextUntitledConversation'))))),
      state.workspaceId && !state.loading && !state.conversations.length && !state.catalogError ? h('p', { className: 'muted' }, t('contextEmpty')) : null,
      state.workspaceId && state.total > 0 ? h('span', { className: 'dcr-context-count' }, `${state.conversations.length} / ${state.total} ${t('contextConversations')}`) : null,
      state.nextOffset !== null ? h('button', { type: 'button', className: 'dcr-context-more', disabled: blocked || state.loading,
        onClick: () => void controllerRef.current?.loadMore() }, t('contextMore')) : null,
      h('p', { className: 'dcr-context-current' }, t('contextCurrent'), ': ',
        h('strong', null, binding.workspaceId && binding.sessionId ? `${workspaceName} / ${sessionName}` : t('contextNone'))),
      h('div', { className: 'dcr-context-actions' },
        h('button', { type: 'button', disabled: blocked || state.loading, onClick: () => void controllerRef.current?.refresh() }, t('contextRefresh')),
        h('button', { type: 'button', disabled: blocked || !binding.workspaceId && !state.workspaceId, onClick: () => void controllerRef.current?.unbind() }, t('contextClear'))),
      h('p', { className: 'dcr-context-status' + (error ? ' error' : ''), role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, status),
      h('p', { className: 'dcr-context-hint' }, t('contextReadOnly')));
  };
}
