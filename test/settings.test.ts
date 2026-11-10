import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addStopHook } from '../src/index.ts';

const CMD = 'cc-devlog hook';

test('빈 설정에 Stop 훅을 만든다', () => {
  const r = addStopHook(undefined, CMD);
  assert.equal(r.changed, true);
  assert.deepEqual(r.settings, { hooks: { Stop: [{ hooks: [{ type: 'command', command: CMD, timeout: 30 }] }] } });
});

test('다른 설정과 다른 훅은 그대로 두고 뒤에 더한다', () => {
  const before = {
    model: 'opus',
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'notify' }] }],
    },
  };
  const snapshot = structuredClone(before);
  const r = addStopHook(before, CMD);
  assert.deepEqual(before, snapshot, '입력을 바꾸면 안 된다');
  assert.deepEqual(r.otherStopHooks, ['notify']);
  assert.deepEqual(r.settings, {
    model: 'opus',
    hooks: {
      PreToolUse: before.hooks.PreToolUse,
      Stop: [...before.hooks.Stop, { hooks: [{ type: 'command', command: CMD, timeout: 30 }] }],
    },
  });
});

test('여러 번 실행해도 한 번만 들어간다', () => {
  const once = addStopHook({}, CMD).settings;
  const twice = addStopHook(once, CMD);
  assert.equal(twice.changed, false);
  assert.equal(twice.settings, once);
});

test('모양이 다른 설정은 고치지 않고 이유를 알린다', () => {
  assert.throws(() => addStopHook([], CMD), /최상위/);
  assert.throws(() => addStopHook({ hooks: 'x' }, CMD), /"hooks"/);
  assert.throws(() => addStopHook({ hooks: { Stop: {} } }, CMD), /hooks\.Stop/);
});

test('형식이 낯선 Stop 항목은 건너뛰고 읽는다', () => {
  const r = addStopHook({ hooks: { Stop: [null, { hooks: 'x' }, { hooks: [{ command: 1 }] }] } }, CMD);
  assert.equal(r.changed, true);
  assert.deepEqual(r.otherStopHooks, []);
});
