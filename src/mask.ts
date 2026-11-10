/**
 * 로그는 대화를 그대로 옮기므로, 붙여 넣은 API 키가 파일로 남을 수 있다.
 * 알려진 토큰 형식과 `key=value` 꼴만 가린다. 모든 비밀값을 잡지는 못한다.
 */

export const MASK = '[가림]';

// ponytail: 알려진 접두사만 잡는다. 새 서비스 형식이 나오면 여기에 추가한다.
const TOKEN =
  /sk-[\w-]{16,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|AIza[\w-]{30,}|xox[abpr]-[\w-]{10,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g;

// 키 이름은 남기고 값만 가린다: `token=abc...` -> `token=[가림]`
const KEY_VALUE = /((?:api[_-]?key|token|secret|password|passwd|bearer)["']?\s*[:=\s]\s*["']?)[\w.~+/-]{12,}/gi;

export function mask(input: string): string {
  return input.replace(TOKEN, MASK).replace(KEY_VALUE, `$1${MASK}`);
}
