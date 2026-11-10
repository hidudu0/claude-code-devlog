import { parseLine, text, type Block, type Entry } from './transcript.ts';

/** 사람이 보낸 요청 하나와, 그 요청에 Claude가 답하며 한 일. */
export interface Turn {
  readonly at: Date;
  readonly prompt: string;
  /** 첫 답변 시각. 답변이 없으면 null. */
  readonly replyAt: Date | null;
  readonly replies: readonly string[];
  /** Edit·Write·NotebookEdit로 바꾼 파일. 프로젝트 기준 상대 경로, 중복 없음. */
  readonly files: readonly string[];
  /** Bash 명령의 description. 명령 원문은 남기지 않는다. */
  readonly steps: readonly string[];
}

export interface Session {
  readonly title: string | null;
  readonly cwd: string;
  readonly start: Date;
  readonly turns: readonly Turn[];
}

export interface ParseOptions {
  /**
   * Stop 훅 입력의 `last_assistant_message`.
   * 훅이 도는 시점에는 마지막 답변이 아직 기록 파일에 쓰이지 않았다.
   */
  readonly tail?: string | undefined;
  /** tail 답변의 시각. 기본값은 지금. */
  readonly now?: Date | undefined;
}

type MutableTurn = { -readonly [K in keyof Turn]: Turn[K] extends readonly (infer T)[] ? T[] : Turn[K] };

// 사용자 메시지에 Claude Code가 끼워 넣는 태그. 사람이 쓴 글이 아니다.
const NOISE =
  /<(browser_instruction|system-reminder|ide_selection|ide_opened_file|local-command-caveat|local-command-stdout|local-command-stderr|task-notification)\b[\s\S]*?<\/\1>\s*/g;
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

/** 슬래시 명령은 `/이름 인자`로 줄이고, 그 밖의 글에서는 끼워 넣은 태그를 지운다. */
export function cleanPrompt(input: string): string {
  const name = /<command-name>(.*?)<\/command-name>/.exec(input);
  if (name) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(input);
    return `${name[1] ?? ''} ${args?.[1] ?? ''}`.trim();
  }
  return input.replace(NOISE, '').trim();
}

function promptOf(content: Entry['content']): string {
  const blocks: readonly Block[] = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'image') parts.push('[이미지]');
    else if (block.type === 'text') parts.push(cleanPrompt(block.text));
  }
  return parts.filter(Boolean).join('\n\n');
}

function collect(turn: MutableTurn, block: Block, at: Date, cwd: string): void {
  if (block.type === 'text') {
    const reply = block.text.trim();
    if (reply) {
      turn.replyAt ??= at;
      turn.replies.push(reply);
    }
  } else if (block.type === 'tool_use' && WRITE_TOOLS.has(block.name)) {
    const raw = text(block.input['file_path']) ?? text(block.input['notebook_path']) ?? '';
    const path = cwd ? raw.replaceAll(`${cwd}/`, '') : raw;
    if (path && !turn.files.includes(path)) turn.files.push(path);
  } else if (block.type === 'tool_use' && block.name === 'Bash') {
    // Bash로 고친 파일은 기록에 경로가 안 남는다. 대신 무슨 작업이었는지 description을 남긴다.
    const step = text(block.input['description']);
    if (step) turn.steps.push(step);
  }
}

/** 기록 파일의 줄들을 요청 단위로 묶는다. 사람이 보낸 요청이 하나도 없으면 null. */
export function parseSession(lines: Iterable<string>, options: ParseOptions = {}): Session | null {
  let title: string | null = null;
  let cwd = '';
  const turns: MutableTurn[] = [];

  for (const line of lines) {
    const entry = parseLine(line);
    if (entry === null) continue;
    title = entry.aiTitle ?? title; // 제목은 세션 중에 다시 지어지므로 마지막 것을 쓴다
    cwd ||= entry.cwd ?? '';
    if (entry.kind === 'other' || entry.skip || entry.at === null) continue;

    if (entry.kind === 'user') {
      // 도구 실행 결과도 user 줄로 오지만 text 블록이 없어서 여기서 걸러진다.
      const prompt = promptOf(entry.content);
      if (prompt) turns.push({ at: entry.at, prompt, replyAt: null, replies: [], files: [], steps: [] });
      continue;
    }
    const turn = turns.at(-1);
    if (turn === undefined || typeof entry.content === 'string') continue;
    for (const block of entry.content) collect(turn, block, entry.at, cwd);
  }

  const first = turns[0];
  const last = turns.at(-1);
  if (first === undefined || last === undefined) return null;

  const tail = options.tail?.trim() ?? '';
  if (tail && !last.replies.includes(tail)) {
    last.replyAt ??= options.now ?? new Date();
    last.replies.push(tail);
  }
  return { title, cwd, start: first.at, turns };
}
