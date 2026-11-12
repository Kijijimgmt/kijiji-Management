const test = require('node:test');
const assert = require('node:assert/strict');
const { filterDashboardForIdentity, assertCanManageOwnedRecord, assertCanManageClient } = require('../api/lib/kijiji-auth');

test('partners can see clients assigned to a shared owner list without broadening edit permissions', () => {
  const dashboard = {
    clients: [
      { id: 'shared', name: 'Shared artist', owner: 'Joe, Erik, Maxwell' },
      { id: 'solo', name: 'Solo artist', owner: 'Erik' },
      { id: 'related', name: 'Related artist', owner: '' },
      { id: 'private', name: 'Other client', owner: 'Emad' },
      { id: 'substring', name: 'Different person', owner: 'Erika' },
    ],
    actions: [{ id: 'task', owner: 'Erik', clientIds: ['related'] }, { id: 'other', owner: 'Joe', clientIds: ['shared'] }],
    opportunities: [], events: [],
  };
  const erik = { owner: 'Erik', fullName: 'Erik', isAdmin: false };
  const filtered = filterDashboardForIdentity(dashboard, erik);
  assert.deepEqual(filtered.clients.map(client => client.id), ['shared', 'solo', 'related']);
  assert.deepEqual(filtered.actions.map(task => task.id), ['task']);
  assert.throws(() => assertCanManageClient(erik), { code: 'team_scope_forbidden' });
  assert.throws(() => assertCanManageOwnedRecord({ owner: 'Joe' }, erik, 'Task'), { code: 'team_scope_forbidden' });
  for (const owner of ['Joe', 'Maxwell']) {
    assert(filterDashboardForIdentity(dashboard, { owner, isAdmin: false }).clients.some(client => client.id === 'shared'));
  }
  assert.equal(filterDashboardForIdentity(dashboard, { isAdmin: true }).clients.length, 5);
});
