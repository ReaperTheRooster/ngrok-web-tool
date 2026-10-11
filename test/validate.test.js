'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAddr, validateTunnelInput, validateTunnelName, parseLimit, validateId } = require('../lib/validate');

test('normalizeAddr accepts ports and host:port', () => {
  assert.equal(normalizeAddr('8080'), '8080');
  assert.equal(normalizeAddr(' localhost:3000 '), 'localhost:3000');
});

test('normalizeAddr rejects bad input', () => {
  for (const bad of ['', '0', '70000', 'host', 'a b:80', 'host:99999', 'http://x:80']) {
    assert.throws(() => normalizeAddr(bad), { name: 'ValidationError' }, bad);
  }
});

test('validateTunnelName rejects unsafe names', () => {
  assert.equal(validateTunnelName('my-app_1.0'), 'my-app_1.0');
  for (const bad of ['', '../x', '-lead', 'a/b', 'x'.repeat(65)]) {
    assert.throws(() => validateTunnelName(bad), { name: 'ValidationError' }, bad);
  }
});

test('validateTunnelInput whitelists fields and defaults proto', () => {
  const out = validateTunnelInput({ name: 'a', addr: '80', evil: 'x' });
  assert.deepEqual(out, { name: 'a', proto: 'http', addr: '80' });
  assert.throws(() => validateTunnelInput({ name: 'a', addr: '80', proto: 'udp' }));
  assert.throws(() => validateTunnelInput(null));
});

test('parseLimit clamps and validates', () => {
  assert.equal(parseLimit(undefined), 50);
  assert.equal(parseLimit('10'), 10);
  assert.equal(parseLimit('9999'), 200);
  assert.throws(() => parseLimit('0'));
  assert.throws(() => parseLimit('abc'));
});

test('validateId rejects path-like ids', () => {
  assert.equal(validateId('abc_DEF-1'), 'abc_DEF-1');
  assert.throws(() => validateId('../etc'));
});
