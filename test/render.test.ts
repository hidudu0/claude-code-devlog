import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cleanPrompt, logFileName, parseSession, toMarkdown, type Session } from '../src/index.ts';

const fixture = readFileSync(new URL('fixtures/session.jsonl', import.meta.url), 'utf8').split('\n');
const seoul = { timeZone: 'Asia/Seoul' };

function load(lines: readonly string[] = fixture, tail?: string): Session {
  const session = parseSession(lines, { tail, now: new Date('2026-11-06T12:30:00Z') });
  assert.ok(session, '요청이 있는 기록은 세션이 되어야 한다');
  return session;
}

const lines = (...rows: unknown[]): string[] => rows.map((r) => JSON.stringify(r));
const user = (content: unknown, extra: object = {}) => ({
  type: 'user',
  timestamp: '2026-11-06T12:00:00Z',
  message: { content },
  ...extra,
});
const assistant = (content: unknown, extra: object = {}) => ({
  type: 'assistant',
  timestamp: '2026-11-06T12:00:05Z',
  message: { content },
  ...extra,
});

test('기록 파일을 정해진 마크다운 형식으로 바꾼다', () => {
  assert.equal(
    toMarkdown(load(), seoul),
    `# 로그인 버그 수정

- 프로젝트: \`/work/app\`
- 시작: 2026-11-06 21:04:34
- 요청 2건

---

## 11-06 21:04:34 · 나

로그인 버그 고쳐줘. 키는 [가림] 이고 token=[가림] 야

[이미지]

**Claude** · 21:04:40

원인 찾는 중.

고쳤습니다.

> 변경 파일: \`src/login.ts\`

작업:
- 테스트 실행

---

## 11-06 21:10:00 · 나

/review src
`,
  );
});

test('사람이 쓰지 않은 내용은 남기지 않는다', () => {
  const md = toMarkdown(load(), seoul);
  for (const leaked of ['열린 파일 안내', '속생각', '도구 결과', '서브에이전트 답', '메타 메시지', 'npm test']) {
    assert.ok(!md.includes(leaked), `${leaked} 가 로그에 남았다`);
  }
});

test('제목은 마지막 aiTitle, 프로젝트는 처음 나온 cwd를 쓴다', () => {
  const s = load();
  assert.equal(s.title, '로그인 버그 수정');
  assert.equal(s.cwd, '/work/app');
});

test('제목이 없으면 시작 날짜로 짓는다', () => {
  const s = load(lines({ cwd: '/p' }, user('안녕')));
  assert.ok(toMarkdown(s, seoul).startsWith('# 2026-11-06 세션\n'));
});

test('같은 파일을 여러 번 고쳐도 변경 파일에는 한 번만 적는다', () => {
  assert.deepEqual(load().turns[0]?.files, ['src/login.ts']);
});

test('cwd를 모르면 경로를 그대로 둔다', () => {
  const s = load(lines(user('고쳐'), assistant([{ type: 'tool_use', name: 'Edit', input: { file_path: '/a/b.ts' } }])));
  assert.deepEqual(s.turns[0]?.files, ['/a/b.ts']);
});

test('Stop 훅의 마지막 답변(tail)을 덧붙이되, 이미 있으면 겹치지 않는다', () => {
  const added = load(fixture, '새 답변');
  assert.deepEqual(added.turns.at(-1)?.replies, ['새 답변']);
  assert.equal(added.turns.at(-1)?.replyAt?.toISOString(), '2026-11-06T12:30:00.000Z');

  const dup = load(fixture, '  고쳤습니다.  ');
  assert.equal(dup.turns.at(-1)?.replies.length, 1, '마지막 요청에 이미 답이 없으므로 하나만 붙는다');
  const again = load(lines(user('질문'), assistant([{ type: 'text', text: '답' }])), '답');
  assert.deepEqual(again.turns[0]?.replies, ['답']);
});

test('사람이 보낸 요청이 없으면 null', () => {
  assert.equal(parseSession([]), null);
  assert.equal(parseSession(['', '{', '[]', '"문자열"']), null);
  assert.equal(parseSession(lines(user([{ type: 'tool_result', content: 'x' }]))), null);
  assert.equal(parseSession(lines(user('시각 없음', { timestamp: undefined }))), null);
  assert.equal(parseSession(lines(user('잘못된 시각', { timestamp: 'not-a-date' }))), null);
});

test('요청보다 먼저 온 답변은 버린다', () => {
  const s = load(lines(assistant([{ type: 'text', text: '앞선 답' }]), user('질문')));
  assert.deepEqual(s.turns[0]?.replies, []);
});

test('슬래시 명령은 이름과 인자로 줄인다', () => {
  assert.equal(cleanPrompt('<command-name>/foo</command-name><command-args>bar baz</command-args>'), '/foo bar baz');
  assert.equal(cleanPrompt('<command-name>/clear</command-name>'), '/clear');
  assert.equal(cleanPrompt('<system-reminder>\n안내\n</system-reminder>\n  본문  '), '본문');
});

test('시간대를 바꾸면 시각과 파일 이름이 함께 바뀐다', () => {
  const s = load();
  assert.equal(logFileName(s, '/x/abcdef12-3456-7890.jsonl', seoul), '2026-11-06_2104_abcdef12.md');
  assert.equal(logFileName(s, '/x/abcdef12-3456-7890.jsonl', { timeZone: 'UTC' }), '2026-11-06_1204_abcdef12.md');
  assert.ok(toMarkdown(s, { timeZone: 'UTC' }).includes('- 시작: 2026-11-06 12:04:34'));
});
