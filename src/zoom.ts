// Matemática do zoom (pura, testada em test/zoom.test.ts).
//
// Ctrl+scroll e pinça no touchpad chegam como WheelEvent com ctrlKey. No Linux o
// Firefox manda a pinça como deltaY = -100 · (variação da escala) por evento
// (widget/InputData.cpp, PinchGestureInput::ComputeDeltaY), em vários eventos
// pequenos: exp(-deltaY/100) faz o zoom acompanhar os dedos (um pouco mais rápido
// em pinças longas). Um passo de roda do mouse vem como delta grande (~48px),
// então cada evento é limitado a 10px (~10% de zoom) para a roda não pular.

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
const SENSITIVITY = 0.01;
const MAX_EVENT_DELTA = 10;
const STEP = 1.2; // Ctrl + / Ctrl -

const LINE_PX = 16;
const PAGE_PX = 800;

export function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** deltaY em pixels, qualquer que seja o deltaMode (0 px, 1 linha, 2 página). */
export function wheelDeltaPx(e: { deltaY: number; deltaMode: number }) {
  return e.deltaY * (e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1);
}

/** Roda para cima (deltaY negativo) aproxima. */
export function zoomFromWheel(current: number, deltaPx: number) {
  const d = Math.max(-MAX_EVENT_DELTA, Math.min(MAX_EVENT_DELTA, deltaPx));
  return clampZoom(current * Math.exp(-d * SENSITIVITY));
}

export function zoomStep(current: number, dir: 1 | -1) {
  return clampZoom(dir > 0 ? current * STEP : current / STEP);
}

/**
 * Nova posição de scroll para o ponto sob o cursor continuar no mesmo lugar
 * depois que o conteúdo escalou por `ratio`. `cursor` é relativo à área visível.
 */
export function anchoredScroll(scroll: number, cursor: number, ratio: number) {
  return Math.max(0, (scroll + cursor) * ratio - cursor);
}
