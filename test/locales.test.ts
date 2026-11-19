import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../src/_locales/', import.meta.url);
const load = (l: string) => JSON.parse(readFileSync(new URL(`${l}/messages.json`, dir), 'utf8'));

test('todos os idiomas têm as mesmas chaves e placeholders do inglês', () => {
  const en = load('en');
  for (const lang of readdirSync(dir)) {
    const m = load(lang);
    assert.deepEqual(Object.keys(m).sort(), Object.keys(en).sort(), lang);
    for (const k of Object.keys(en)) {
      assert.deepEqual(m[k].placeholders, en[k].placeholders, `${lang}.${k}`);
      assert.ok(m[k].message.trim(), `${lang}.${k} vazio`);
    }
  }
});

test('toda chave usada no código existe', () => {
  const en = load('en');
  const src = ['viewer.ts', 'background.ts', 'viewer.html', 'manifest.json']
    .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');
  const used = [
    ...src.matchAll(/\bt\('([a-zA-Z]+)'/g),
    ...src.matchAll(/data-i18n(?:-title|-aria)?="([a-zA-Z]+)"/g),
    ...src.matchAll(/__MSG_([a-zA-Z]+)__/g),
  ].map((m) => m[1]!);
  assert.ok(used.length > 10);
  for (const k of used) assert.ok(k in en, `chave inexistente: ${k}`);
});
