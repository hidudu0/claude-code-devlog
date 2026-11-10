import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const FIXTURE = fileURLToPath(new URL('fixtures/session.jsonl', import.meta.url));

function cli(args: string[], input = '') {
  const r = spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** 기록 파일을 cwd만 바꿔 임시 폴더에 복사한다. */
function transcriptFor(cwd: string, dir: string, name = 'abcdef12-0000.jsonl'): string {
  const path = join(dir, name);
  writeFileSync(path, readFileSync(FIXTURE, 'utf8').replaceAll('/work/app', cwd));
  return path;
}

test('--help 와 --version', () => {
  const help = cli(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.out, /cc-devlog install/);
  assert.match(cli(['-v']).out, /^\d+\.\d+\.\d+\n$/);
  assert.equal(cli([]).code, 0, '인자 없이 실행하면 도움말');
});

test('잘못된 사용법은 2로 끝나고 도움말 위치를 알린다', () => {
  for (const args of [['nope'], ['render'], ['render', FIXTURE, '--tz', 'Mars/Base'], ['--unknown']]) {
    const r = cli(args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, /cc-devlog --help/);
  }
});

test('render 는 마크다운을 표준 출력에 쓴다', () => {
  const r = cli(['render', FIXTURE, '--tz', 'Asia/Seoul']);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.startsWith('# 로그인 버그 수정\n'));
});

test('hook 은 git 저장소 최상위의 dev-log/ 에 쓰고 폴더를 git에서 뺀다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cc-devlog-'));
  const repo = join(tmp, 'repo');
  mkdirSync(join(repo, 'sub'), { recursive: true });
  spawnSync('git', ['init', '-q', repo]);
  const transcript = transcriptFor(join(repo, 'sub'), tmp);

  const input = JSON.stringify({ transcript_path: transcript, last_assistant_message: '마지막 답' });
  const r = cli(['hook', '--tz', 'Asia/Seoul'], input);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, '', 'Stop 훅은 표준 출력에 아무것도 쓰지 않는다');

  const logDir = join(repo, 'dev-log');
  assert.equal(readFileSync(join(logDir, '.gitignore'), 'utf8'), '*\n');
  assert.deepEqual(readdirSync(logDir).sort(), ['.gitignore', '2026-11-06_2104_abcdef12.md']);
  assert.match(readFileSync(join(logDir, '2026-11-06_2104_abcdef12.md'), 'utf8'), /마지막 답/);
});

test('hook 실패는 1로 끝난다 (2는 Claude Code의 Stop을 막는다)', () => {
  for (const [args, input] of [
    [['hook'], 'JSON 아님'],
    [['hook'], '{}'],
    [['hook', '--tz', 'Mars/Base'], '{}'],
    [['hook'], JSON.stringify({ transcript_path: '/없는/파일.jsonl' })],
  ] as const) {
    const r = cli([...args], input);
    assert.equal(r.code, 1, `${args.join(' ')} <- ${input}`);
    assert.ok(r.err.length > 0);
  }
});

test('디스크 최상위에서 연 세션은 로그를 쓰지 않는다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cc-devlog-'));
  const transcript = transcriptFor('/', tmp);
  const r = cli(['hook'], JSON.stringify({ transcript_path: transcript }));
  assert.equal(r.code, 0, r.err);
  assert.equal(existsSync('/dev-log'), false);
});

test('install 은 한 번만 등록하고, 원본을 .bak 으로 남긴다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cc-devlog-'));
  const settings = join(tmp, 'settings.json');
  writeFileSync(settings, JSON.stringify({ model: 'opus' }));
  const args = ['install', '--settings', settings, '--command', 'cc-devlog hook'];

  const dry = cli([...args, '--dry-run']);
  assert.equal(dry.code, 0, dry.err);
  assert.deepEqual(JSON.parse(readFileSync(settings, 'utf8')), { model: 'opus' }, '--dry-run 은 파일을 바꾸지 않는다');

  assert.equal(cli(args).code, 0);
  const written: unknown = JSON.parse(readFileSync(settings, 'utf8'));
  assert.deepEqual(written, {
    model: 'opus',
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'cc-devlog hook', timeout: 30 }] }] },
  });
  assert.deepEqual(JSON.parse(readFileSync(`${settings}.bak`, 'utf8')), { model: 'opus' });

  const again = cli([...args, '--json']);
  const summary: unknown = JSON.parse(again.out);
  assert.equal(again.code, 0);
  assert.partialDeepStrictEqual(summary, { changed: false, backup: null });
});

test('install 은 깨진 settings.json 을 덮어쓰지 않는다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cc-devlog-'));
  const settings = join(tmp, 'settings.json');
  writeFileSync(settings, '{ 깨진');
  const r = cli(['install', '--settings', settings]);
  assert.equal(r.code, 1);
  assert.match(r.err, /올바른 JSON이 아닙니다/);
  assert.equal(readFileSync(settings, 'utf8'), '{ 깨진');
});

test('backfill --dry-run 은 쓸 경로만 알려 준다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cc-devlog-'));
  const project = join(tmp, 'project');
  const projects = join(tmp, 'projects', '-project');
  mkdirSync(project);
  mkdirSync(projects, { recursive: true });
  transcriptFor(project, projects);
  writeFileSync(join(projects, 'empty.jsonl'), '');

  const r = cli(['backfill', '--projects', join(tmp, 'projects'), '--tz', 'UTC', '--dry-run', '--json']);
  assert.equal(r.code, 0, r.err);
  const results: unknown = JSON.parse(r.out);
  assert.partialDeepStrictEqual(results, [
    { result: { status: 'planned', path: join(project, 'dev-log', '2026-11-06_1204_abcdef12.md'), turns: 2 } },
    { result: { status: 'skipped', reason: 'no-conversation' } },
  ]);
  assert.equal(existsSync(join(project, 'dev-log')), false);
});
