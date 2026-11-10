import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isRecord } from './transcript.ts';

export interface AddHookResult {
  readonly settings: Record<string, unknown>;
  readonly changed: boolean;
  /** 이미 있던 다른 Stop 훅 명령. 같은 일을 하는 훅이 겹치지 않는지 사람이 확인할 수 있게 돌려준다. */
  readonly otherStopHooks: readonly string[];
}

/**
 * settings.json 내용에 Stop 훅을 더한 새 객체를 돌려준다. 입력은 바꾸지 않는다.
 * 같은 명령이 이미 있으면 그대로 둔다(여러 번 실행해도 결과가 같다).
 */
export function addStopHook(settings: unknown, command: string, timeout = 30): AddHookResult {
  const base = settings ?? {};
  if (!isRecord(base)) throw new TypeError('settings.json 최상위 값이 객체가 아닙니다.');
  const hooks = base['hooks'] ?? {};
  if (!isRecord(hooks)) throw new TypeError('settings.json 의 "hooks" 가 객체가 아닙니다.');
  const rawStop = hooks['Stop'] ?? [];
  if (!Array.isArray(rawStop)) throw new TypeError('settings.json 의 "hooks.Stop" 이 배열이 아닙니다.');
  const stop: readonly unknown[] = rawStop;

  const commands: string[] = [];
  for (const group of stop) {
    const inner = isRecord(group) ? group['hooks'] : undefined;
    if (!Array.isArray(inner)) continue;
    for (const hook of inner) {
      if (isRecord(hook) && typeof hook['command'] === 'string') commands.push(hook['command']);
    }
  }
  const otherStopHooks = commands.filter((c) => c !== command);
  if (commands.includes(command)) return { settings: base, changed: false, otherStopHooks };

  const entry = { hooks: [{ type: 'command', command, timeout }] };
  return {
    settings: { ...base, hooks: { ...hooks, Stop: [...stop, entry] } },
    changed: true,
    otherStopHooks,
  };
}

export interface InstallResult extends AddHookResult {
  readonly path: string;
  /** 바꾸기 전 파일을 복사해 둔 곳. 새로 만들었거나 바꾸지 않았으면 null. */
  readonly backup: string | null;
}

/** settings.json 파일을 읽고, 필요하면 Stop 훅을 더해 다시 쓴다. 쓰기 전 원본을 `.bak` 으로 남긴다. */
export async function installHook(
  path: string,
  command: string,
  options: { readonly dryRun?: boolean | undefined } = {},
): Promise<InstallResult> {
  let current: unknown = {};
  let exists = true;
  try {
    const raw = await readFile(path, 'utf8');
    try {
      current = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${path} 가 올바른 JSON이 아닙니다: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  } catch (error) {
    if (!(isRecord(error) && error['code'] === 'ENOENT')) throw error;
    exists = false;
  }

  const result = addStopHook(current, command);
  if (!result.changed || options.dryRun === true) return { ...result, path, backup: null };

  await mkdir(dirname(path), { recursive: true });
  const backup = exists ? `${path}.bak` : null;
  if (backup !== null) await copyFile(path, backup);
  await writeFile(path, `${JSON.stringify(result.settings, null, 2)}\n`);
  return { ...result, path, backup };
}
