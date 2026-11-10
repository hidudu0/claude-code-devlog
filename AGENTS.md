# 작업 안내 (사람과 코딩 에이전트 공용)

## 확인 명령

```sh
npm run check   # 아래 넷을 차례로. 커밋 전에 반드시 통과시킨다
npm run typecheck
npm run lint
npm test        # node --test, 빌드 없이 .ts 를 바로 실행
npm run build   # dist/ 생성
```

## 구조

| 파일 | 맡은 일 | 바깥과 닿는 곳 |
| --- | --- | --- |
| `src/transcript.ts` | JSONL 한 줄 → `Entry`. 기록 형식에 대한 지식은 여기만 둔다 | 없음 |
| `src/session.ts` | `Entry` 들 → 요청 단위 `Session`. 무엇을 남기고 버릴지 정한다 | 없음 |
| `src/markdown.ts` | `Session` → 마크다운 문서, 파일 이름 | 없음 |
| `src/mask.ts` | 비밀값 가리기 | 없음 |
| `src/write.ts` | 로그 위치를 정하고 파일을 쓴다 | 파일, `git` |
| `src/settings.ts` | settings.json 에 훅 등록 | 파일 |
| `src/cli.ts` | 인자 해석, 종료 코드 | 표준 입출력 |
| `src/index.ts` | 공개 API. 여기서 내보내지 않으면 내부 함수다 | |

위쪽 네 파일은 순수 함수다. 파일과 프로세스는 `write.ts`, `settings.ts`, `cli.ts` 에서만 다룬다.

## 규칙

- 출력 형식이나 종료 코드를 바꾸면 `docs/reference.md` 와 `test/render.test.ts` 의 고정 출력을 함께 고친다.
- `any`, `as` 로 기록 형식을 단정하지 않는다. `unknown` 으로 받고 `isRecord` 로 확인한다.
- 런타임 의존성을 더하지 않는다. Node 표준 라이브러리로 해결한다.
- enum, namespace, 생성자 매개변수 속성은 쓰지 않는다. 테스트가 Node 타입 제거로 돌기 때문이다(`erasableSyntaxOnly`).
- 상대 import 는 `.ts` 확장자까지 쓴다. 빌드 때 `.js` 로 바뀐다.
- `hook` 명령은 종료 코드 2를 내면 안 된다. Claude Code의 Stop을 막는다.
- 테스트 이름은 동작을 한국어 문장으로 쓴다.
