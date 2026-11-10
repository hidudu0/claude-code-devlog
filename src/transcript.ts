/**
 * Claude Code는 세션마다 ~/.claude/projects/<프로젝트>/<세션 id>.jsonl 에 한 줄씩 기록을 남긴다.
 * 형식은 공개 스펙이 아니라 버전마다 필드가 늘거나 빠진다. 그래서 이 도구가 읽는 필드만
 * 좁은 타입으로 옮기고, 나머지는 `unknown`으로 받아 검사한 뒤에만 쓴다.
 */

export type Block =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image' }
  | { readonly type: 'tool_use'; readonly name: string; readonly input: Readonly<Record<string, unknown>> }
  | { readonly type: 'other' };

export interface Entry {
  readonly kind: 'user' | 'assistant' | 'other';
  readonly at: Date | null;
  readonly cwd: string | null;
  readonly aiTitle: string | null;
  /** 서브에이전트·메타·압축 요약 줄. 사람이 나눈 대화가 아니라서 로그에 넣지 않는다. */
  readonly skip: boolean;
  readonly content: string | readonly Block[];
}

const OTHER: Block = { type: 'other' };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 비어 있지 않은 문자열이면 그대로, 아니면 null. */
export function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function toBlock(value: unknown): Block {
  if (!isRecord(value)) return OTHER;
  switch (value['type']) {
    case 'text':
      return typeof value['text'] === 'string' ? { type: 'text', text: value['text'] } : OTHER;
    case 'image':
      return { type: 'image' };
    case 'tool_use': {
      const input = value['input'];
      return typeof value['name'] === 'string'
        ? { type: 'tool_use', name: value['name'], input: isRecord(input) ? input : {} }
        : OTHER;
    }
    default:
      return OTHER;
  }
}

/** JSONL 한 줄을 읽는다. JSON이 아니면(기록 중이라 잘린 마지막 줄 등) null. */
export function parseLine(line: string): Entry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;

  const type = raw['type'];
  const stamp = text(raw['timestamp']);
  const at = stamp === null ? null : new Date(stamp);
  const message = raw['message'];
  const content = isRecord(message) ? message['content'] : undefined;

  return {
    kind: type === 'user' || type === 'assistant' ? type : 'other',
    at: at !== null && !Number.isNaN(at.getTime()) ? at : null,
    cwd: text(raw['cwd']),
    aiTitle: text(raw['aiTitle']),
    skip: raw['isSidechain'] === true || raw['isMeta'] === true || raw['isCompactSummary'] === true,
    content: typeof content === 'string' ? content : Array.isArray(content) ? content.map(toBlock) : [],
  };
}
