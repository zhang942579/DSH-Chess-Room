/**
 * Privacy-filtered account projection. No contact, email, credentials, Platform
 * sessions, or login-attempt fields are retained or sent to the controller.
 * Uses only inspected deepseekAccount.getState/getProfile/watch APIs.
 */
const DISPOSE_WAIT_MS = 250;

function safeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeAvatar(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:')
      || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function metadataOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('account metadata must be an object');
  }
  if (typeof value.version !== 'string' || !value.version.trim()
    || typeof value.locale !== 'string' || !value.locale.trim()
    || !Number.isInteger(value.timezoneOffsetSeconds)) {
    throw new TypeError('account metadata requires version, locale, and integer timezoneOffsetSeconds');
  }
  return { version: value.version, locale: value.locale,
    timezoneOffsetSeconds: value.timezoneOffsetSeconds };
}

/**
 * createAccount(ctx,onChange,{version='0.2.1-rc.3',locale='zh',
 *   timezoneOffsetSeconds=0}={}) -> AccountProjection.
 *
 * AccountProjection:
 *   snapshot: getter returning a detached, complete SafeSnapshot;
 *   refresh(): Promise<SafeSnapshot> (await this for initialization);
 *   setMetadata(partialMetadata): Promise<SafeSnapshot>;
 *   dispose(): Promise<void> (idempotent; abort + at most 250ms task wait).
 *
 * SafeSnapshot = {identityRevision:number,name:string|null,
 *   avatarUrl:string|null,signedIn:boolean,id:string|null}.
 * Revision increases only when one of the four projected values changes.
 * Errors fail closed: state failure clears all identity; failed profile keeps
 * signedIn=true only if stored-account presence was confirmed, but clears the
 * profile. Watch refreshes never block subsequent logout/identity events.
 * The provider emits profile-derived identity notifications only when stable
 * IDs change; repeated IDs are silent. Our onChange is also changed-only and
 * never writes to the account service, so it cannot create a notification loop.
 * The caller owns this projection and must await dispose on plugin teardown.
 */
export function createAccount(ctx, onChange, {
  version = '0.2.1-rc.3', locale = 'zh', timezoneOffsetSeconds = 0,
} = {}) {
  if (typeof onChange !== 'function') throw new TypeError('onChange must be a function');
  const service = ctx.deepseekAccount;
  let metadata = metadataOf({ version, locale, timezoneOffsetSeconds });
  let generation = 0;
  let disposed = false;
  let disposal = null;
  let current = Object.freeze({ identityRevision: 0, name: null,
    avatarUrl: null, signedIn: false, id: null });
  const abort = new AbortController();
  const tasks = new Set();

  const snapshot = () => ({ ...current });
  const isCurrent = token => !disposed && token === generation;

  function track(task) {
    tasks.add(task);
    task.then(() => tasks.delete(task), () => tasks.delete(task));
    return task;
  }

  function publish(value) {
    if (disposed || ['name', 'avatarUrl', 'signedIn', 'id']
      .every(key => current[key] === value[key])) return;
    current = Object.freeze({ identityRevision: current.identityRevision + 1,
      name: value.name, avatarUrl: value.avatarUrl,
      signedIn: value.signedIn, id: value.id });
    // Consumer callback failure must not reject a detached watcher task.
    try { track(Promise.resolve(onChange(snapshot())).catch(() => {})); } catch { /* isolated consumer */ }
  }

  function clear(signedIn = false) {
    publish({ name: null, avatarUrl: null, signedIn, id: null });
  }

  function startRefresh(watchedState = undefined) {
    if (disposed) return Promise.resolve(snapshot());
    // Increment synchronously before any await: a newly delivered logout or
    // identity notification immediately invalidates all older profile requests.
    const token = ++generation;
    const client = { ...metadata };
    return track((async () => {
      let state;
      try { state = watchedState ?? await service.getState(); }
      catch { if (isCurrent(token)) clear(); return snapshot(); }
      if (!isCurrent(token)) return snapshot();
      if (state?.status !== 'credential-stored') {
        clear();
        return snapshot();
      }
      // A watcher event can represent a replaced credential even though the
      // public state still says credential-stored. Drop the previous profile
      // immediately rather than showing the old account during the new query.
      // Explicit metadata/refresh reads of the same account preserve it.
      if (watchedState !== undefined || !current.signedIn) clear(true);
      let result;
      try { result = await service.getProfile(client); }
      catch { result = null; }
      if (!isCurrent(token)) return snapshot();
      if (result?.status !== 'ready' || !result.value || typeof result.value !== 'object') {
        clear(true);
      } else {
        publish({ signedIn: true, id: safeText(result.value.id),
          name: safeText(result.value.name), avatarUrl: safeAvatar(result.value.avatarUrl) });
      }
      return snapshot();
    })());
  }

  const watchTask = track((async () => {
    try {
      for await (const state of service.watch(abort.signal, true)) {
        if (disposed) break;
        // Do not await profile network work here: this loop must consume logout
        // promptly even if an earlier getProfile has not settled.
        startRefresh(state).catch(() => {});
      }
    } catch {
      if (!disposed) { generation += 1; clear(); }
    }
  })());
  // Every owned promise is observed; also keep watchTask as an explicit owner.
  watchTask.catch(() => {});

  return {
    get snapshot() { return snapshot(); },
    refresh: () => startRefresh(),
    setMetadata(partial) {
      if (disposed) return Promise.resolve(snapshot());
      if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
        throw new TypeError('partial metadata must be an object');
      }
      const next = metadataOf({ ...metadata, ...partial });
      if (Object.keys(metadata).every(key => metadata[key] === next[key])) {
        return Promise.resolve(snapshot());
      }
      metadata = next;
      return startRefresh();
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      generation += 1;
      abort.abort();
      const pending = [...tasks];
      disposal = (async () => {
        let timer;
        const deadline = new Promise(resolve => { timer = setTimeout(resolve, DISPOSE_WAIT_MS); });
        try { await Promise.race([Promise.allSettled(pending), deadline]); }
        finally { clearTimeout(timer); }
      })();
      return disposal;
    },
  };
}
