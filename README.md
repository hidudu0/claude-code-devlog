# claude-code-devlog

[![ci](https://github.com/hidudu0/claude-code-devlog/actions/workflows/ci.yml/badge.svg)](https://github.com/hidudu0/claude-code-devlog/actions/workflows/ci.yml)

Claude Code와 나눈 대화를 프로젝트 폴더 안의 마크다운 개발 로그로 남기는 Stop 훅과 CLI.

*Turns Claude Code session transcripts into per-project Markdown dev logs, via a Stop hook.*

```
내-프로젝트/
└── dev-log/
    ├── .gitignore                      # 폴더 전체를 git에서 뺀다
    ├── 2026-11-06_2104_abcdef12.md     # 세션 하나 = 파일 하나
    └── 2026-11-07_1012_9f3e21aa.md
```

```markdown
# 로그인 버그 수정

- 프로젝트: `/work/app`
- 시작: 2026-11-06 21:04:34
- 요청 2건

---

## 11-06 21:04:34 · 나

로그인 버그 고쳐줘. 키는 [가림] 이고 token=[가림] 야

**Claude** · 21:04:40

원인 찾는 중.

고쳤습니다.

> 변경 파일: `src/login.ts`

작업:
- 테스트 실행
```

## 왜 만들었나

Claude Code로 일하면 "그때 왜 이렇게 고쳤지?"의 답이 대화에 남는다. 그런데 그 대화는 `~/.claude/projects/` 아래 JSONL 파일에 있고, 한 줄이 수 KB인 데다 도구 결과·시스템 안내·서브에이전트 기록이 섞여 있어서 사람이 다시 읽기 어렵다. 프로젝트 폴더와도 떨어져 있다.

이 도구는 세션이 멈출 때마다 그 기록에서 **사람이 한 요청, Claude의 답, 바꾼 파일, 실행한 작업 설명**만 골라 프로젝트 안 `dev-log/` 에 쓴다. 다음 세션에서 Claude에게 "dev-log 읽고 이어서 해 줘"라고 하면 지난 맥락을 그대로 넘길 수 있다.

처음에는 Python 스크립트 하나로 만들어 2026년 11월 6일부터 매일 썼다. 13개 프로젝트에 로그가 쌓이는 동안 고칠 점이 보였고, 설치·되살리기 명령과 테스트를 갖춘 TypeScript CLI로 다시 만들었다.

## 설치

Node.js 22.18 이상이 필요하다. 런타임 의존성은 없다.

```sh
npm install -g github:hidudu0/claude-code-devlog
cc-devlog install            # ~/.claude/settings.json 에 Stop 훅 등록
```

`install` 은 기존 설정과 다른 훅을 그대로 두고 Stop 훅 하나만 더한다. 바꾸기 전 파일은 `settings.json.bak` 으로 남는다. 여러 번 실행해도 한 번만 들어간다. 무엇이 바뀌는지 먼저 보려면 `--dry-run` 을 붙인다.

## 사용

설치 후에는 할 일이 없다. Claude Code가 답을 마칠 때마다 로그가 갱신된다.

| 명령 | 하는 일 |
| --- | --- |
| `cc-devlog install` | Stop 훅 등록 (`--dry-run`, `--json`, `--settings <경로>`, `--command <명령>`) |
| `cc-devlog render <기록.jsonl>` | 기록 하나를 마크다운으로 표준 출력에 쓴다. 파일은 만들지 않는다 |
| `cc-devlog backfill` | 설치 전 세션까지 전부 로그로 만든다 (`--dry-run`, `--json`) |
| `cc-devlog hook` | Claude Code가 부르는 명령. 직접 쓸 일은 없다 |

모든 명령은 `--tz Asia/Seoul` 처럼 시간대를 받는다. 기본값은 이 컴퓨터의 시간대다.
옵션, 종료 코드, 출력 형식, 라이브러리 API는 [docs/reference.md](docs/reference.md)에 있다.

## 무엇을 남기고 무엇을 버리나

| 남긴다 | 버린다 |
| --- | --- |
| 사람이 쓴 요청 (이미지는 `[이미지]`) | `<system-reminder>`, IDE 선택 영역 같은 자동 삽입 태그 |
| Claude의 답변 글 | thinking, 도구 실행 결과 |
| Edit·Write·NotebookEdit로 바꾼 파일 경로 | 서브에이전트 대화, 메타 메시지, 압축 요약 |
| Bash 명령의 `description` | Bash 명령 원문 |
| 슬래시 명령 (`/review src`) | 기록 중이라 잘린 마지막 줄 |

알려진 토큰 형식(`sk-`, `ghp_`, `AKIA` 등)과 `token=...` 같은 키-값은 `[가림]` 으로 바꾼다. 모든 비밀값을 잡지는 못한다. 그래서 `dev-log/` 는 처음부터 git에서 빠진다.

## 설계 결정

- **Stop 훅을 막지 않는다.** Claude Code는 Stop 훅이 종료 코드 2로 끝나면 멈추지 않고 작업을 이어 간다. 로그 쓰기가 실패해도 세션을 붙잡지 않도록 `hook` 명령은 어떤 오류든 1로 끝낸다. 다른 명령의 사용법 오류만 2를 쓴다.
- **상태를 저장하지 않는다.** 훅이 돌 때마다 세션 파일을 통째로 다시 만든다. 같은 세션은 늘 같은 파일 이름이라 몇 번을 돌려도 결과가 같고, `backfill` 도 같은 코드를 쓴다.
- **기록 형식을 믿지 않는다.** Claude Code의 JSONL은 공개 스펙이 아니라 버전마다 바뀐다. 읽는 필드만 좁은 타입으로 옮기고 나머지는 `unknown` 으로 받아 검사한다([src/transcript.ts](src/transcript.ts)). 코드에 `any` 가 없다.
- **엉뚱한 곳에 쓰지 않는다.** 로그는 git 저장소 최상위에 둔다. 홈 폴더나 디스크 최상위에서 연 세션, cwd를 모르는 세션은 건너뛴다.
- **빌드 없이 테스트한다.** Node의 타입 제거 기능으로 `.ts` 를 바로 실행한다. 그래서 `erasableSyntaxOnly` 로 enum 같은 문법을 막았다.

## 검증

- 테스트 28개: 출력 형식 고정 테스트, 비밀값 가리기, 설정 병합, 실제 프로세스를 띄우는 CLI 테스트(종료 코드, 임시 git 저장소에 쓰기, 깨진 설정 보호).
- CI: Node 22·24에서 타입 검사 → ESLint(`strictTypeChecked`) → 테스트 → 빌드 → 빌드 결과물 실행 → 패키지 내용 확인.
- 이전 Python 훅과 비교: 2026-11-11에 내 컴퓨터의 세션 기록 183개(대화가 있는 179개)를 두 구현으로 바꿔 출력이 모두 같음을 확인했다. 옮기면서 Python 버전의 두 문제를 고쳤다. cwd가 비어 있으면 파일 경로의 `/` 를 모두 지웠고, 훅을 실행한 폴더에 로그를 썼다. 실제 기록에는 이런 경우가 없어서 출력이 같았다.

## 개발

```sh
npm ci
npm run check    # typecheck + lint + test + build
```

구조와 작업 규칙은 [AGENTS.md](AGENTS.md)에 있다. 사람과 코딩 에이전트가 같은 문서를 읽는다.

## 라이선스

MIT
