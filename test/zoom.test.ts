import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchoredScroll, clampZoom, MAX_ZOOM, MIN_ZOOM, wheelDeltaPx, zoomFromWheel, zoomStep } from '../src/zoom.ts';

const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const apply = (z: number, deltas: number[]) => deltas.reduce(zoomFromWheel, z);

test('deltaMode é normalizado para pixels', () => {
  assert.equal(wheelDeltaPx({ deltaY: 3, deltaMode: 1 }), 48);
  assert.equal(wheelDeltaPx({ deltaY: -2, deltaMode: 0 }), -2);
  assert.equal(wheelDeltaPx({ deltaY: 1, deltaMode: 2 }), 800);
});

test('pinça: deltas pequenos (formato do Firefox no Linux) acompanham a escala dos dedos', () => {
  // dedos abrem de 1.0 para 1.2 em passos de 0.01 -> 20 eventos de deltaY = -1
  const z = apply(1, Array(20).fill(-1));
  close(z, Math.exp(0.2)); // 1.2214: perto do 1.2 dos dedos
  // e fechar de volta desfaz exatamente
  close(apply(z, Array(20).fill(1)), 1);
});

test('roda do mouse: cada passo vale ~10%, não importa o tamanho do delta', () => {
  const notch = zoomFromWheel(1, -48);
  close(notch, Math.exp(0.1));
  assert.equal(zoomFromWheel(1, -1000), notch);
  close(zoomFromWheel(notch, 48), 1);
});

test('zoom fica entre os limites', () => {
  assert.equal(apply(1, Array(100).fill(-10)), MAX_ZOOM);
  assert.equal(apply(1, Array(100).fill(10)), MIN_ZOOM);
  assert.equal(clampZoom(0), MIN_ZOOM);
  assert.equal(zoomStep(MAX_ZOOM, 1), MAX_ZOOM);
  close(zoomStep(zoomStep(1, 1), -1), 1);
});

test('scroll ancorado mantém o ponto sob o cursor', () => {
  // ponto do conteúdo sob o cursor: scroll + cursor = 300; após 2x vira 600
  assert.equal(anchoredScroll(200, 100, 2), 500); // 500 + 100 = 600
  assert.equal(anchoredScroll(0, 0, 3), 0);
  assert.equal(anchoredScroll(0, 100, 0.5), 0); // não fica negativo
});
