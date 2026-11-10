import { basename, extname } from 'node:path';
import { mask } from './mask.ts';
import type { Session } from './session.ts';

export interface FormatOptions {
  /** IANA 시간대(예: `Asia/Seoul`). 기본값은 이 컴퓨터의 시간대. */
  readonly timeZone?: string | undefined;
}

interface Clock {
  readonly date: string; // 2026-11-06
  readonly monthDay: string; // 11-06
  readonly time: string; // 21:04:34
  readonly compact: string; // 2026-11-06_2104
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function clock(at: Date, timeZone: string | undefined): Clock {
  const key = timeZone ?? '';
  let format = formatters.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-US', {
      ...(timeZone === undefined ? {} : { timeZone }),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(key, format);
  }
  const parts = format.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  const [y, m, d, hh, mm, ss] = [part('year'), part('month'), part('day'), part('hour'), part('minute'), part('second')];
  return {
    date: `${y}-${m}-${d}`,
    monthDay: `${m}-${d}`,
    time: `${hh}:${mm}:${ss}`,
    compact: `${y}-${m}-${d}_${hh}${mm}`,
  };
}

/** 세션 하나를 마크다운 문서로 만든다. 형식은 docs/reference.md 의 "출력 형식"에 정의되어 있다. */
export function toMarkdown(session: Session, options: FormatOptions = {}): string {
  const at = (d: Date): Clock => clock(d, options.timeZone);
  const start = at(session.start);
  const out = [
    `# ${session.title ?? `${start.date} 세션`}\n`,
    `- 프로젝트: \`${session.cwd}\``,
    `- 시작: ${start.date} ${start.time}`,
    `- 요청 ${String(session.turns.length)}건\n`,
  ];
  for (const turn of session.turns) {
    const asked = at(turn.at);
    out.push(`---\n\n## ${asked.monthDay} ${asked.time} · 나\n\n${turn.prompt}\n`);
    if (turn.replies.length > 0) {
      out.push(`**Claude** · ${at(turn.replyAt ?? turn.at).time}\n\n${turn.replies.join('\n\n')}\n`);
    }
    if (turn.files.length > 0) {
      out.push(`> 변경 파일: ${turn.files.map((f) => `\`${f}\``).join(', ')}\n`);
    }
    if (turn.steps.length > 0) {
      out.push(`작업:\n${turn.steps.map((s) => `- ${s}`).join('\n')}\n`);
    }
  }
  return mask(out.join('\n'));
}

/** `2026-11-06_2104_ab12cd34.md` 꼴. 같은 세션은 늘 같은 이름이라 다시 만들면 덮어쓴다. */
export function logFileName(session: Session, transcriptPath: string, options: FormatOptions = {}): string {
  const id = basename(transcriptPath, extname(transcriptPath)).slice(0, 8);
  return `${clock(session.start, options.timeZone).compact}_${id}.md`;
}
