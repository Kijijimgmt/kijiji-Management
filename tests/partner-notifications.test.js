const test = require('node:test');
const assert = require('node:assert/strict');

test('new tasks notify partners in the dashboard without email; other alerts retain email', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = global.fetch;
  const modulePath = require.resolve('../api/lib/partner-notifications');
  try {
    process.env.SUPABASE_URL = 'https://notifications.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
    process.env.RESEND_API_KEY = 'test-only';
    delete require.cache[modulePath];
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true };
    };
    const { notifyPartners } = require(modulePath);
    const input = { title: 'Review contract', status: 'Open', owner: 'Joe' };
    const identity = { email: 'max@kijijimgmt.com', fullName: 'Maxwell' };
    const args = { resource: 'action', operation: 'created', input, saved: { id: 'task-1', ...input }, identity };
    await notifyPartners(args);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /portal_notifications$/);
    assert(calls[0].body.some(row => row.recipient_email === 'joe@kijijimgmt.com'));
    assert(calls[0].body.some(row => row.recipient_email === 'erik@kijijimgmt.com'));
    assert(calls[0].body.every(row => row.operation === 'created' && row.resource_type === 'Task' && row.recipient_email !== identity.email));
    calls.length = 0;
    await notifyPartners({ ...args, operation: 'updated' });
    assert(calls.some(call => call.url === 'https://api.resend.com/emails'));
    calls.length = 0;
    await notifyPartners({ ...args, resource: 'event', input: { name: 'Appearance' }, saved: { id: 'event-1', name: 'Appearance' } });
    assert(calls.some(call => call.url === 'https://api.resend.com/emails'));
  } finally {
    global.fetch = originalFetch;
    delete require.cache[modulePath];
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
