import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { logFileName, toMarkdown, type FormatOptions } from './markdown.ts';
import { parseSession, type ParseOptions } from './session.ts';

export const LOG_DIR = 'dev-log';

/**
 * 로그를 둘 폴더. git 저장소 안이면 저장소 최상위, 아니면 세션을 연 폴더.
 * 홈 폴더나 디스크 최상위에서 연 세션은 null: 거기에 dev-log/ 를 만들면 엉뚱한 곳이 어지러워진다.
 */
export function projectRoot(cwd: string): string | null {
  if (!cwd) return null;
  const git = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  const top = git.status === 0 ? git.stdout.trim() : ''; // git이 없거나 저장소가 아니면 빈 값
  const root = resolve(top || cwd);
  if (root === resolve(homedir()) || root === parse(root).root) return null;
  try {
    return statSync(root).isDirectory() ? root : null;
  } catch {
    return null; // 세션을 연 폴더가 그 뒤에 지워진 경우
  }
}

export interface WriteOptions extends ParseOptions, FormatOptions {
  /** true면 경로만 계산하고 파일은 쓰지 않는다. */
  readonly dryRun?: boolean | undefined;
}

export type WriteResult =
  | { readonly status: 'written' | 'planned'; readonly path: string; readonly turns: number }
  | { readonly status: 'skipped'; readonly reason: 'no-conversation' | 'no-project' };

/** 기록 파일 하나를 읽어 `<프로젝트>/dev-log/<시작시각>_<세션 id>.md` 로 쓴다. 파일은 통째로 다시 만든다. */
export async function writeLog(transcriptPath: string, options: WriteOptions = {}): Promise<WriteResult> {
  const source = await readFile(transcriptPath, 'utf8');
  const session = parseSession(source.split('\n'), options);
  if (session === null) return { status: 'skipped', reason: 'no-conversation' };
  const root = projectRoot(session.cwd);
  if (root === null) return { status: 'skipped', reason: 'no-project' };

  const dir = join(root, LOG_DIR);
  const path = join(dir, logFileName(session, transcriptPath, options));
  const turns = session.turns.length;
  if (options.dryRun === true) return { status: 'planned', path, turns };

  await mkdir(dir, { recursive: true });
  // 대화 원문이 커밋에 섞이지 않도록 폴더 전체를 git에서 뺀다.
  await writeFile(join(dir, '.gitignore'), '*\n');
  await writeFile(path, toMarkdown(session, options));
  return { status: 'written', path, turns };
}
