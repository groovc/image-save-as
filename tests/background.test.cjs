const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// inFlight: the download event starts before registration and is still reading
// storage (and will see no record) when the post-registration check runs.
function harness(terminal, finishEarly = false, inFlight = false) {
  const listeners = {};
  const stored = {};
  const revoked = [];
  const badges = [];
  const timers = new Map();
  let nextTimer = 0;
  let gateUsed = false;
  let releaseGate;
  const event = name => ({ addListener(fn) { listeners[name] = fn; } });
  const chrome = {
    runtime: {
      onInstalled: event('install'), onStartup: event('startup'),
      getContexts: async () => [{}], getURL: value => value,
      sendMessage: async message => {
        if (message.type === 'revoke') revoked.push(message.url);
        else return { url: 'blob:test', filename: 'image.png' };
      },
    },
    contextMenus: { onClicked: event('click'), update(_id, _options, callback) { callback(); } },
    storage: {
      onChanged: event('storage'), local: { get: async defaults => defaults },
      session: {
        get: async key => {
          const snapshot = { [key]: stored[key] };
          if (inFlight && key === 'download:7' && !gateUsed) {
            gateUsed = true;
            await new Promise(resolve => { releaseGate = resolve; });
          }
          return snapshot;
        },
        set: async values => Object.assign(stored, values),
        remove: async key => { delete stored[key]; },
      },
    },
    downloads: {
      onChanged: event('download'),
      download: async () => {
        const delta = { id: 7, state: { current: terminal.state }, error: { current: terminal.error } };
        if (finishEarly) await listeners.download(delta);
        if (inFlight) listeners.download(delta);
        return 7;
      },
      search: async () => {
        if (inFlight) setTimeout(() => releaseGate(), 10);
        return [{ id: 7, ...(finishEarly || inFlight ? terminal : { state: 'in_progress' }) }];
      },
    },
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async ({ text }) => { badges.push(text); },
      setTitle: async () => {},
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8'), {
    chrome, console: { error() {} },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    stored, revoked, badges, timers,
    save: () => listeners.click({ menuItemId: 'save-as-format:png', srcUrl: 'https://example.com/a.png' }),
    finish: () => listeners.download({
      id: 7, state: { current: terminal.state }, error: { current: terminal.error },
    }),
    unrelated: () => listeners.download({ id: 99, state: { current: 'interrupted' }, error: { current: 'FILE_FAILED' } }),
  };
}

test('completion before registration releases the blob and session record', async () => {
  const h = harness({ state: 'complete' }, true);
  await h.save();
  assert.deepEqual(h.revoked, ['blob:test']);
  assert.equal(h.stored['download:7'], undefined);
});

test('an in-flight handler that saw no record does not swallow cleanup', async () => {
  const h = harness({ state: 'complete' }, false, true);
  await h.save();
  assert.deepEqual(h.revoked, ['blob:test']);
  assert.equal(h.stored['download:7'], undefined);
});

for (const early of [false, true]) {
  test(`interruption ${early ? 'before' : 'after'} registration reports the failure`, async () => {
    const h = harness({ state: 'interrupted', error: 'FILE_NO_SPACE' }, early);
    await h.save();
    if (!early) await Promise.all([h.finish(), h.finish()]);
    assert.match(h.stored.lastError.message, /Not enough disk space/);
    assert.deepEqual(h.badges, ['', '!']);
    assert.deepEqual(h.revoked, ['blob:test']);
    assert.equal(h.stored['download:7'], undefined);
  });
}

test('user cancellation cleans up without reporting an error', async () => {
  const h = harness({ state: 'interrupted', error: 'USER_CANCELED' });
  await h.save();
  await h.finish();
  assert.deepEqual(h.revoked, ['blob:test']);
  assert.equal(h.stored.lastError, undefined);
});

test('unrelated downloads do not report errors or release tracked blobs', async () => {
  const h = harness({ state: 'complete' });
  await h.save();
  await h.unrelated();
  assert.equal(h.stored['download:7'], 'blob:test');
  assert.deepEqual(h.revoked, []);
  assert.equal(h.stored.lastError, undefined);
  await h.finish();
  assert.deepEqual(h.revoked, ['blob:test']);
});

test('a new save clears the error badge and cancels its reset timer', async () => {
  const h = harness({ state: 'interrupted', error: 'FILE_FAILED' });
  await h.save();
  await h.finish();
  assert.match(h.stored.lastError.message, /FILE_FAILED/);
  assert.equal(h.timers.size, 1);
  await h.save();
  assert.equal(h.stored.lastError, undefined);
  assert.equal(h.badges.at(-1), '');
  assert.equal(h.timers.size, 0);
});

test('a newer failure replaces the previous badge timer', async () => {
  const h = harness({ state: 'interrupted', error: 'FILE_ACCESS_DENIED' });
  await h.save();
  await h.finish();
  const [oldTimer] = h.timers.keys();
  h.stored['download:7'] = 'blob:test';
  await h.finish();
  assert.match(h.stored.lastError.message, /No permission to save there/);
  assert.equal(h.timers.size, 1);
  assert.equal(h.timers.has(oldTimer), false);
});
