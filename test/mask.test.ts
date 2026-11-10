import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MASK, mask } from '../src/index.ts';

test('알려진 토큰 형식을 가린다', () => {
  const tokens = [
    'sk-ant-api03-abcdefghijklmnop',
    'ghp_abcdefghijklmnopqrstuvwxyz12',
    'github_pat_11ABCDEFGHIJKLMNOPQRST',
    'AKIAABCDEFGHIJKLMNOP',
    'AIzaSyA-abcdefghijklmnopqrstuvwxyz0123',
    'xoxb-1234567890-abcdef',
    'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4fw',
  ];
  for (const token of tokens) assert.equal(mask(`값 ${token} 끝`), `값 ${MASK} 끝`, token);
});

test('key=value 꼴은 키 이름을 남기고 값만 가린다', () => {
  assert.equal(mask('API_KEY=abcdef1234567890'), `API_KEY=${MASK}`);
  assert.equal(mask('"password": "hunter2hunter2"'), `"password": "${MASK}"`);
  assert.equal(mask('Authorization: Bearer abc.def-ghi_jkl'), `Authorization: Bearer ${MASK}`);
});

test('평범한 글과 짧은 값은 그대로 둔다', () => {
  for (const plain of ['token 사용량을 줄였다', 'password=short', 'sk-short', '설명 eyJ 로 시작하는 단어']) {
    assert.equal(mask(plain), plain);
  }
});
