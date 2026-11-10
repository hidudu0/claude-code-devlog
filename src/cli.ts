#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { toMarkdown } from './markdown.ts';
import { parseSession } from './session.ts';
import { installHook } from './settings.ts';
import { isRecord } from './transcript.ts';
import { writeLog, type WriteResult } from './write.ts';

const HELP = `cc-devlog: Claude Code 세션 기록을 프로젝트별 마크다운 개발 로그로 바꾼다.

사용법
  cc-devlog install [--settings <경로>] [--command <명령>] [--dry-run] [--json]
      ~/.claude/settings.json 에 Stop 훅을 등록한다. 여러 번 실행해도 한 번만 들어간다.
  cc-devlog hook [--tz <시간대>]
      Stop 훅으로 실행된다. 표준 입력의 훅 JSON을 읽어 <프로젝트>/dev-log/ 에 쓴다.
  cc-devlog render <기록.jsonl> [--tz <시간대>]
      기록 파일 하나를 마크다운으로 바꿔 표준 출력에 쓴다. 파일은 만들지 않는다.
  cc-devlog backfill [--projects <폴더>] [--tz <시간대>] [--dry-run] [--json]
      지난 세션 기록 전체로 로그를 다시 만든다.

공통
  --tz <시간대>   IANA 시간대 (예: Asia/Seoul). 기본값은 이 컴퓨터의 시간대.
  -h, --help      이 도움말
  -v, --version   버전

종료 코드: 0 성공, 1 실행 중 오류, 2 잘못된 사용법
자세한 설명: https://github.com/hidudu0/claude-code-devlog/blob/main/docs/reference.md`;

class UsageError extends Error {}

const configDir = (): string => process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');

function version(): string {
  const pkg: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return isRecord(pkg) && typeof pkg['version'] === 'string' ? pkg['version'] : 'unknown';
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function validTimeZone(tz: string | undefined): string | undefined {
  if (tz === undefined) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new UsageError(`알 수 없는 시간대입니다: ${tz}`);
  }
  return tz;
}

async function hook(timeZone: string | undefined): Promise<void> {
  let input: unknown;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    throw new Error('표준 입력이 훅 JSON이 아닙니다. 이 명령은 Claude Code가 Stop 훅으로 실행합니다.');
  }
  if (!isRecord(input) || typeof input['transcript_path'] !== 'string') {
    throw new Error('훅 입력에 transcript_path 가 없습니다.');
  }
  const tail = input['last_assistant_message'];
  await writeLog(input['transcript_path'], { tail: typeof tail === 'string' ? tail : undefined, timeZone });
}

async function render(file: string | undefined, timeZone: string | undefined): Promise<string> {
  if (file === undefined) throw new UsageError('기록 파일 경로가 필요합니다: cc-devlog render <기록.jsonl>');
  const session = parseSession((await readFile(file, 'utf8')).split('\n'));
  if (session === null) throw new Error(`${file} 에 사람이 보낸 요청이 없습니다.`);
  return toMarkdown(session, { timeZone });
}

async function transcripts(projectsDir: string): Promise<string[]> {
  const found: string[] = [];
  for (const project of await readdir(projectsDir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const dir = join(projectsDir, project.name);
    for (const file of await readdir(dir, { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith('.jsonl')) found.push(join(dir, file.name));
    }
  }
  return found.sort();
}

/** 명령 하나를 실행하고 표준 출력에 쓸 줄들을 돌려준다. */
async function run(argv: readonly string[]): Promise<string[]> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      tz: { type: 'string' },
      settings: { type: 'string' },
      command: { type: 'string' },
      projects: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
  const [command, ...rest] = positionals;
  const timeZone = validTimeZone(values.tz);
  const dryRun = values['dry-run'];

  if (values.version) return [version()];
  if (values.help || command === undefined) return [HELP];

  switch (command) {
    case 'hook':
      await hook(timeZone);
      return [];

    case 'render':
      return [await render(rest[0], timeZone)];

    case 'install': {
      const path = values.settings ?? join(configDir(), 'settings.json');
      const self = fileURLToPath(import.meta.url);
      const hookCommand = values.command ?? `"${process.execPath}" "${self}" hook`;
      const { settings, ...summary } = await installHook(path, hookCommand, { dryRun });
      if (values.json) return [JSON.stringify({ ...summary, command: hookCommand, dryRun }, null, 2)];
      const head = !summary.changed
        ? `이미 등록되어 있습니다: ${path}`
        : dryRun
          ? `등록할 내용 (--dry-run, 파일은 그대로):\n${JSON.stringify(settings, null, 2)}`
          : `Stop 훅을 등록했습니다: ${path}${summary.backup === null ? '' : ` (원본: ${summary.backup})`}`;
      return [head, ...summary.otherStopHooks.map((other) => `참고: 다른 Stop 훅이 있습니다: ${other}`)];
    }

    case 'backfill': {
      const dir = values.projects ?? join(configDir(), 'projects');
      const results: { transcript: string; result: WriteResult }[] = [];
      for (const transcript of await transcripts(dir)) {
        results.push({ transcript, result: await writeLog(transcript, { timeZone, dryRun }) });
      }
      if (values.json) return [JSON.stringify(results, null, 2)];
      const verb = dryRun ? '쓸 예정' : '기록';
      const paths = results.flatMap(({ result }) => (result.status === 'skipped' ? [] : [`${verb}: ${result.path}`]));
      const skipped = results.length - paths.length;
      return [...paths, `세션 ${String(results.length)}개 중 ${String(paths.length)}개 ${verb}, ${String(skipped)}개 건너뜀`];
    }

    default:
      throw new UsageError(`알 수 없는 명령입니다: ${command}`);
  }
}

try {
  for (const line of await run(process.argv.slice(2))) process.stdout.write(`${line}\n`);
} catch (error) {
  const usage = error instanceof UsageError || (isRecord(error) && String(error['code']).startsWith('ERR_PARSE_ARGS'));
  process.stderr.write(`cc-devlog: ${error instanceof Error ? error.message : String(error)}\n`);
  if (usage) process.stderr.write('도움말: cc-devlog --help\n');
  // Stop 훅이 2로 끝나면 Claude Code는 멈추지 않고 stderr를 받아 작업을 이어 간다.
  // 그래서 hook 명령은 사용법 오류여도 1로 끝내 세션을 붙잡지 않는다.
  const isHook = process.argv.slice(2).includes('hook');
  process.exitCode = usage && !isHook ? 2 : 1;
}
