# 레퍼런스

- [명령](#명령)
- [종료 코드](#종료-코드)
- [출력 형식](#출력-형식)
- [라이브러리 API](#라이브러리-api)
- [환경 변수](#환경-변수)

## 명령

```
cc-devlog <명령> [옵션]
```

### `install`

Claude Code 설정 파일에 Stop 훅을 등록한다.

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--settings <경로>` | `$CLAUDE_CONFIG_DIR/settings.json` | 고칠 설정 파일 |
| `--command <명령>` | `"<node 경로>" "<cli.js 경로>" hook` | 훅으로 등록할 명령 |
| `--dry-run` | | 바뀔 설정을 출력만 하고 파일은 그대로 둔다 |
| `--json` | | 결과를 JSON으로 출력한다 |

- 같은 명령이 이미 `hooks.Stop` 에 있으면 아무것도 바꾸지 않는다.
- 다른 설정과 다른 훅은 그대로 둔다. 새 항목은 `hooks.Stop` 배열 끝에 붙는다.
- 파일을 바꾸기 전에 원본을 `<설정 파일>.bak` 으로 복사한다.
- 설정 파일이 올바른 JSON이 아니거나 `hooks`, `hooks.Stop` 의 모양이 다르면 고치지 않고 종료 코드 1로 끝낸다.
- 이미 있던 다른 Stop 훅은 `참고:` 줄로 알린다. 같은 일을 하는 훅이 겹치는지 확인할 때 쓴다.

`--json` 출력:

```json
{
  "changed": true,
  "otherStopHooks": [],
  "path": "/Users/me/.claude/settings.json",
  "backup": "/Users/me/.claude/settings.json.bak",
  "command": "\"/usr/local/bin/node\" \"/Users/me/claude-code-devlog/dist/cli.js\" hook",
  "dryRun": false
}
```

### `hook`

Claude Code가 Stop 이벤트마다 실행한다. 표준 입력으로 받은 훅 JSON에서 두 필드를 읽는다.

| 필드 | 쓰임 |
| --- | --- |
| `transcript_path` | 읽을 기록 파일 (필수) |
| `last_assistant_message` | 기록 파일에 아직 쓰이지 않은 마지막 답변. 있으면 마지막 요청의 답변 끝에 붙인다 |

표준 출력에는 아무것도 쓰지 않는다. 옵션은 `--tz` 하나다.

### `render <기록.jsonl>`

기록 파일 하나를 [출력 형식](#출력-형식)대로 바꿔 표준 출력에 쓴다. 파일은 만들지 않는다. 사람이 보낸 요청이 하나도 없으면 종료 코드 1.

### `backfill`

`--projects` 폴더 바로 아래 각 프로젝트 폴더의 `*.jsonl` 을 모두 로그로 만든다. 하위 폴더(서브에이전트 기록)는 읽지 않는다.

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--projects <폴더>` | `$CLAUDE_CONFIG_DIR/projects` | 기록이 있는 폴더 |
| `--dry-run` | | 쓸 경로만 출력한다 |
| `--json` | | 결과를 JSON 배열로 출력한다 |
| `--tz <시간대>` | 이 컴퓨터의 시간대 | |

`--json` 출력의 각 항목은 `{ "transcript": <경로>, "result": WriteResult }` 이다. `WriteResult` 는 [라이브러리 API](#라이브러리-api)를 본다.

## 종료 코드

| 코드 | 뜻 |
| --- | --- |
| 0 | 성공. 로그를 쓸 곳이 없어 건너뛴 경우도 포함 |
| 1 | 실행 중 오류 (파일 없음, 깨진 JSON 등). `hook` 명령의 모든 오류 |
| 2 | 잘못된 사용법 (알 수 없는 명령·옵션·시간대, 빠진 인자). `hook` 에서는 쓰지 않는다 |

Claude Code는 Stop 훅이 2로 끝나면 멈추지 않고 stderr를 Claude에게 넘겨 작업을 이어 간다. 로그 도구가 세션을 붙잡으면 안 되므로 `hook` 은 2를 쓰지 않는다.

## 출력 형식

### 위치

```
<로그 폴더>/dev-log/<YYYY-MM-DD>_<HHMM>_<세션 id 앞 8자>.md
<로그 폴더>/dev-log/.gitignore   # 내용: "*"
```

- 로그 폴더: 세션 cwd가 git 저장소 안이면 저장소 최상위, 아니면 cwd.
- 다음 경우에는 쓰지 않는다: cwd를 모름, cwd가 홈 폴더나 디스크 최상위, cwd 폴더가 없음, 사람이 보낸 요청이 없음.
- 시각은 첫 요청 시각이다. 같은 세션은 늘 같은 파일 이름이라 다시 만들면 덮어쓴다.

### 문서

```
# <제목>

- 프로젝트: `<cwd>`
- 시작: <YYYY-MM-DD HH:MM:SS>
- 요청 <N>건

---

## <MM-DD HH:MM:SS> · 나

<요청>

**Claude** · <HH:MM:SS>

<답변 1>

<답변 2>

> 변경 파일: `<경로>`, `<경로>`

작업:
- <Bash description>
```

- **제목**: 기록에 나온 마지막 `aiTitle`. 없으면 `<YYYY-MM-DD> 세션`.
- **요청 블록**: 사람이 보낸 메시지마다 하나. 답변·변경 파일·작업 줄은 내용이 있을 때만 쓴다.
- **요청**: 텍스트 블록을 빈 줄로 잇는다. 이미지는 `[이미지]`. 슬래시 명령은 `/이름 인자`.
- **답변 시각**: 그 요청에 대한 첫 답변의 시각.
- **변경 파일**: Edit·Write·NotebookEdit의 경로. cwd 기준 상대 경로, 처음 나온 순서, 중복 없음.
- **작업**: Bash 도구 호출의 `description`. 명령 원문은 쓰지 않는다.
- 문서 전체에 [비밀값 가리기](#비밀값-가리기)를 적용한다.

### 넣지 않는 기록

- `isSidechain`(서브에이전트), `isMeta`, `isCompactSummary` 가 참인 줄
- `timestamp` 가 없거나 잘못된 줄, JSON이 아닌 줄
- 텍스트가 없는 사용자 줄(도구 실행 결과)
- 첫 요청보다 먼저 나온 답변
- 사용자 글 안의 태그: `browser_instruction`, `system-reminder`, `ide_selection`, `ide_opened_file`, `local-command-caveat`, `local-command-stdout`, `local-command-stderr`, `task-notification`

### 비밀값 가리기

다음은 `[가림]` 으로 바꾼다.

- 토큰 형식: `sk-…`(16자 이상), `ghp_`·`gho_`·`ghu_`·`ghs_`·`ghr_…`, `github_pat_…`, `AKIA…`, `AIza…`, `xoxa-`·`xoxb-`·`xoxp-`·`xoxr-…`, JWT(`eyJ….….…`)
- 키-값: `api_key`, `apikey`, `token`, `secret`, `password`, `passwd`, `bearer` 뒤의 12자 이상 값. 키 이름은 남긴다.

## 라이브러리 API

```ts
import { parseSession, toMarkdown, writeLog } from 'claude-code-devlog';
```

| 함수 | 설명 |
| --- | --- |
| `parseSession(lines, { tail?, now? }): Session \| null` | JSONL 줄들을 요청 단위로 묶는다. 요청이 없으면 `null` |
| `toMarkdown(session, { timeZone? }): string` | [출력 형식](#문서)의 문서를 만든다 |
| `logFileName(session, transcriptPath, { timeZone? }): string` | 로그 파일 이름 |
| `writeLog(transcriptPath, options): Promise<WriteResult>` | 읽고, 위치를 정하고, 쓴다. `dryRun` 이면 쓰지 않는다 |
| `projectRoot(cwd): string \| null` | 로그 폴더를 둘 곳 |
| `addStopHook(settings, command, timeout?)` | 설정 객체에 훅을 더한 새 객체. 입력은 바꾸지 않는다 |
| `installHook(path, command, { dryRun? })` | 설정 파일을 읽고 고쳐 쓴다 |
| `mask(text): string` | 비밀값 가리기 |

```ts
type WriteResult =
  | { status: 'written' | 'planned'; path: string; turns: number }
  | { status: 'skipped'; reason: 'no-conversation' | 'no-project' };
```

## 환경 변수

| 변수 | 쓰임 |
| --- | --- |
| `CLAUDE_CONFIG_DIR` | Claude Code 설정 폴더. 없으면 `~/.claude` |
