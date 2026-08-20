(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const input = $('inputText');
const resultBox = $('resultBox');
const detailsList = $('detailsList');
const totalVolume = $('totalVolume');
const totalPieces = $('totalPieces');
const calcStatus = $('calcStatus');
const adaptInfo = $('adaptInfo');

let lastReport = null;
let suppressAuto = false;

const UNIT_FACTORS = { 'м': 1, 'см': 0.01, 'мм': 0.001 };

function normalizeText(text) {
  return String(text || '')
    .replace(/[×✕хХ]/g, 'x')
    .replace(/,/g, '.')
    .replace(/\u00A0/g, ' ')
    .replace(/[–—−]/g, '-');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
}

function parseNumber(s) {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function dimensionCandidates(line) {
  const text = normalizeText(line);

  // Размерная группа: три числовых значения, разделённых x.
  // Важно: это выражение не захватывает количество как 4x1200x800x600.
  const re = /(?<![\d.])(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?![\d.])/gi;
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 70), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 70);
    found.push({
      index: m.index,
      raw: m[0],
      values: [parseNumber(m[1]), parseNumber(m[2]), parseNumber(m[3])],
      before, after,
      context: text
    });
  }
  return found;
}

function explicitUnit(candidate) {
  const around = `${candidate.before} ${candidate.after}`;
  // Ищем единицу непосредственно после размеров или рядом перед ними.
  const afterMatch = candidate.after.match(/^\s*(м{1,2}|см|мм)\b/i);
  if (afterMatch) return afterMatch[1].toLowerCase();
  const beforeMatch = candidate.before.match(/(?:^|[\s:,(])(?:в\s*)?(м{1,2}|см|мм)\s*$/i);
  if (beforeMatch) return beforeMatch[1].toLowerCase();
  return null;
}

function explicitQuantity(candidate) {
  const text = candidate.context;
  const start = candidate.index;
  const end = candidate.index + candidate.raw.length;

  // Количество после размеров: × 4, x 4 (только когда это именно множитель),
  // "4 шт.", "количество 4 шт.".
  const after = text.slice(end, end + 100);
  const before = text.slice(Math.max(0, start - 100), start);

  let m = after.match(/^\s*(?:[x*]\s*)?(\d+(?:[.,]\d+)?)\s*(?:шт(?:\.|ук)?|мест(?:а|о)?\b)/i);
  if (m) return Math.max(1, Math.round(Number(m[1].replace(',', '.'))));

  m = after.match(/^\s*[x*]\s*(\d+(?:[.,]\d+)?)(?=\s*(?:шт\b|$|[,;]))/i);
  if (m) return Math.max(1, Math.round(Number(m[1].replace(',', '.'))));

  m = after.match(/^\s*,?\s*(?:кол-?во|количество|qty)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*шт?/i);
  if (m) return Math.max(1, Math.round(Number(m[1].replace(',', '.'))));

  m = before.match(/(?:^|[\s,;])(\d+(?:[.,]\d+)?)\s*шт(?:\.|ук)?\s*$/i);
  if (m) return Math.max(1, Math.round(Number(m[1].replace(',', '.'))));

  m = before.match(/(?:кол-?во|количество|qty)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*шт?\s*$/i);
  if (m) return Math.max(1, Math.round(Number(m[1].replace(',', '.'))));

  return 1;
}

function dimensionVolume(values, unit) {
  const f = UNIT_FACTORS[unit];
  return values[0] * f * values[1] * f * values[2] * f;
}

function cargoPlausibility(values, unit, qty) {
  const v = dimensionVolume(values, unit);
  const maxDimM = Math.max(...values.map(x => x * UNIT_FACTORS[unit]));
  const minDimM = Math.min(...values.map(x => x * UNIT_FACTORS[unit]));
  const total = v * qty;

  let score = 0;

  // Грузовой контекст: слишком маленький единичный объект и помещение-подобные
  // объёмы получают штраф, но явная единица всегда имеет приоритет.
  if (maxDimM >= 0.05 && maxDimM <= 3.5) score += 4;
  if (minDimM >= 0.02) score += 2;
  if (v >= 0.00005 && v <= 12) score += 3;
  if (total >= 0.0001 && total <= 100) score += 2;

  // Количество мест: при нескольких местах крайне большие/микроскопические
  // суммарные объёмы менее реалистичны.
  if (qty > 1 && total >= 0.01 && total <= 60) score += 2;
  if (qty >= 10 && total >= 0.1 && total <= 40) score += 1;

  // Штрафы.
  if (maxDimM > 20) score -= 8;
  if (v > 100) score -= 8;
  if (v < 0.000001) score -= 3;

  return { score, volume: v, totalVolume: total };
}

function chooseUnit(candidate, qty) {
  const explicit = explicitUnit(candidate);
  if (explicit) {
    return {
      unit: explicit,
      confidence: 'explicit',
      warning: null,
      alternatives: []
    };
  }

  const values = candidate.values;
  const options = ['мм', 'см', 'м'].map(unit => {
    const p = cargoPlausibility(values, unit, qty);
    return { unit, ...p };
  }).sort((a,b) => b.score - a.score);

  const best = options[0];
  const second = options[1];

  // Для неуказанной единицы выбираем наиболее реалистичную для груза.
  // Для 6x5x4 и 12x8x6 это см; при этом явно предупреждаем о неоднозначности.
  let warning = `Единица не указана. Автовыбор: ${best.unit}. Проверьте, не указаны ли размеры в другой величине.`;
  if (best.unit === 'см' && (values[0] <= 20 && values[1] <= 20 && values[2] <= 20)) {
    warning = `Единица не указана. Для габаритов груза выбран вариант ${best.unit}. Проверьте, не имелись ли в виду метры.`;
  }
  if (second && Math.abs(best.score - second.score) <= 1) {
    warning = `Единица не указана. Выбран наиболее вероятный вариант: ${best.unit}. Возможна другая трактовка — проверьте величину.`;
  }

  return {
    unit: best.unit,
    confidence: 'inferred',
    warning,
    alternatives: options
  };
}

function extractLines(text) {
  const normalized = normalizeText(text);
  const lines = normalized.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  // Если весь текст одной строкой, всё равно извлекаем все размерные группы.
  const sourceLines = lines.length ? lines : [normalized];
  const result = [];

  for (const line of sourceLines) {
    const candidates = dimensionCandidates(line);
    for (const candidate of candidates) {
      const qty = explicitQuantity(candidate);
      const choice = chooseUnit(candidate, qty);
      result.push({
        source: line,
        rawDimensions: candidate.raw,
        values: candidate.values,
        qty,
        unit: choice.unit,
        confidence: choice.confidence,
        warning: choice.warning,
        alternatives: choice.alternatives
      });
    }
  }
  return result;
}

function setCalcStatus(items) {
  const warnings = items.filter(x => x.warning);
  calcStatus.className = `calc-status ${warnings.length ? 'warning' : 'ok'}`;
  calcStatus.innerHTML = `
    <span class="status-dot"></span>
    <div>
      <strong>${warnings.length ? 'Есть моменты для проверки' : 'Расчёт подтверждён'}</strong>
      <small>${warnings.length
        ? `${warnings.length} строк требуют внимания к единице измерения.`
        : 'Единицы определены уверенно по тексту и контексту.'}</small>
    </div>`;
}

function render(items) {
  if (!items.length) {
    resultBox.hidden = false;
    calcStatus.className = 'calc-status warning';
    calcStatus.innerHTML = `<span class="status-dot"></span><div><strong>Не найдено габаритов</strong><small>Нужна группа L × W × H, например 1200x800x600.</small></div>`;
    detailsList.innerHTML = '';
    totalVolume.textContent = '0.0000 м³';
    totalPieces.textContent = '0 шт.';
    return;
  }

  let sum = 0, pieces = 0;
  detailsList.innerHTML = '';

  items.forEach((item, index) => {
    const volume = dimensionVolume(item.values, item.unit) * item.qty;
    sum += volume;
    pieces += item.qty;

    const buttons = ['м','см','мм'].map(u =>
      `<button class="btn-badge unit-btn ${u === item.unit ? 'active' : ''}" data-index="${index}" data-unit="${u}" type="button">${u}</button>`
    ).join('');

    const warning = item.warning
      ? `<div class="warning-text">⚠️ ${escapeHtml(item.warning)}</div>`
      : '';

    const el = document.createElement('div');
    el.className = `detail-line${item.warning ? ' warning-line' : ''}`;
    el.innerHTML = `
      <div class="detail-main">
        <span>Позиция ${index + 1}: ${escapeHtml(item.rawDimensions)}</span>
        <span class="detail-unit-buttons">${buttons}</span>
        <span>× ${item.qty} шт. = <strong>${volume.toFixed(4)} м³</strong></span>
      </div>
      ${warning}`;
    detailsList.appendChild(el);
  });

  totalVolume.textContent = `${sum.toFixed(4)} м³`;
  totalPieces.textContent = `${pieces} шт.`;
  resultBox.hidden = false;
  setCalcStatus(items);

  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.index);
      const u = btn.dataset.unit;
      items[i].unit = u;
      items[i].confidence = 'manual';
      items[i].warning = null;
      render(items);
    });
  });

  lastReport = { items: structuredClone(items), sum, pieces };
}

function calculate() {
  const text = input.value.trim();
  if (!text) {
    resultBox.hidden = true;
    lastReport = null;
    return;
  }
  const items = extractLines(text);
  render(items);
}

function adaptText() {
  const text = input.value.trim();
  if (!text) return;

  const items = extractLines(text);
  if (!items.length) {
    adaptInfo.hidden = false;
    adaptInfo.textContent = 'Не удалось найти надёжные группы габаритов для адаптации.';
    return;
  }

  const adapted = items.map(item => {
    const dims = item.values.map(v => String(v).replace('.', ',')).join('x');
    return `${dims} ${item.unit} × ${item.qty}`;
  }).join('\n');

  suppressAuto = true;
  input.value = adapted;
  suppressAuto = false;

  adaptInfo.hidden = false;
  adaptInfo.textContent = `Найдено и выделено ${items.length} групп габаритов.`;
  calculate();
}

function reportText() {
  if (!lastReport) return '';
  const lines = ['📊 ОТЧЕТ ПО РАСЧЕТУ ОБЪЕМА:', ''];
  lastReport.items.forEach((item, i) => {
    const v = dimensionVolume(item.values, item.unit) * item.qty;
    lines.push(`• Позиция ${i + 1}: ${item.rawDimensions} ${item.unit} × ${item.qty} шт. = ${v.toFixed(4)} м³`);
  });
  lines.push('', `🚚 ОБЩИЙ ОБЪЕМ: ${lastReport.sum.toFixed(4)} м³`, `🔢 ВСЕГО МЕСТ: ${lastReport.pieces} шт.`);
  return lines.join('\n');
}

async function copyReport() {
  const text = reportText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    $('copyBtn').textContent = '✅ Отчёт скопирован';
    setTimeout(() => $('copyBtn').textContent = '📋 Скопировать отчёт', 1400);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function clearAll() {
  input.value = '';
  resultBox.hidden = true;
  adaptInfo.hidden = true;
  detailsList.innerHTML = '';
  lastReport = null;
  input.focus();
}

function setTheme(theme) {
  document.documentElement.classList.remove('light','dark');
  if (theme === 'system') {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.add(dark ? 'dark' : 'light');
  } else {
    document.documentElement.classList.add(theme);
  }
  localStorage.setItem('volumeCalcTheme', theme);
  ['light','dark','system'].forEach(t => $(`theme-${t}`).classList.toggle('active', t === theme));
}

function initTheme() {
  setTheme(localStorage.getItem('volumeCalcTheme') || 'system');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('volumeCalcTheme') || 'system') === 'system') setTheme('system');
  });
}

function initConnectionStatus() {
  const box = $('connectionStatus');
  const title = $('statusTitle');
  const text = $('statusText');

  function update() {
    const online = navigator.onLine;
    box.className = `connection-status ${online ? 'online' : 'offline'}`;
    title.textContent = online ? 'Соединение активно' : 'Офлайн-режим';
    text.textContent = online
      ? 'Приложение готово к работе онлайн и офлайн'
      : 'Расчёты продолжают работать без подключения';
  }
  update();
  addEventListener('online', update);
  addEventListener('offline', update);
}

function init() {
  initTheme();
  initConnectionStatus();

  $('calcBtn').addEventListener('click', calculate);
  $('adaptBtn').addEventListener('click', adaptText);
  $('copyBtn').addEventListener('click', copyReport);
  $('clearBtn').addEventListener('click', clearAll);

  ['light','dark','system'].forEach(t => $(`theme-${t}`).addEventListener('click', () => setTheme(t)));

  document.querySelectorAll('.bulk-unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!lastReport) return;
      lastReport.items.forEach(item => { item.unit = btn.dataset.unit; item.warning = null; });
      render(lastReport.items);
    });
  });

  // Автоматический расчёт именно при вставке. Обычный набор текста не запускает
  // расчёт на каждый символ.
  input.addEventListener('paste', () => {
    setTimeout(() => { if (!suppressAuto) calculate(); }, 0);
  });

  // Поддержка вставки через контекстное меню/скрипты, когда событие paste
  // не приходит в ожидаемой форме.
  input.addEventListener('input', () => {
    if (suppressAuto) return;
    if (input.value.trim() && input.value.includes('x')) {
      // Небольшая задержка, чтобы вставка целиком успела попасть в textarea.
      clearTimeout(input._autoTimer);
      input._autoTimer = setTimeout(() => {
        if (document.activeElement === input) calculate();
      }, 120);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();