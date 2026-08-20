// Флагман v1.0.6 — интерфейс восстановлен; ядро выбора единиц и количества сохранено.
let parsedItems = [];
let textReportGlobal = '';

const $ = (id) => document.getElementById(id);

function setTheme(theme) {
    document.querySelectorAll('.theme-switch button').forEach((button) => button.classList.remove('active'));
    const active = $('theme-' + theme);
    if (active) active.classList.add('active');

    localStorage.setItem('user-theme', theme);
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.className = isDark ? 'dark' : 'light';
}

function clearAll() {
    $('inputText').value = '';
    $('resultBox').hidden = true;
    parsedItems = [];
    textReportGlobal = '';
    $('inputText').focus();
}

function unitWord(value) {
    const s = (value || '').toLowerCase();
    if (/^(мм|mm|миллиметр\w*)$/.test(s)) return 'мм';
    if (/^(см|cm|сантиметр\w*)$/.test(s)) return 'см';
    if (/^(м|m|метр\w*|meter\w*)$/.test(s)) return 'м';
    return null;
}

function explicitUnit(line, a, b) {
    let s = line.slice(b, b + 30);
    let match = s.match(/\b(мм|mm|миллиметр\w*|см|cm|сантиметр\w*|м|m|метр\w*|meter\w*)\b/i);
    if (match) return unitWord(match[1]);

    s = line.slice(Math.max(0, a - 35), a);
    match = s.match(/\b(мм|mm|миллиметр\w*|см|cm|сантиметр\w*|м|m|метр\w*|meter\w*)\s*$/i);
    if (match) return unitWord(match[1]);

    match = line.match(/(?:размер\w*|габарит\w*|величин\w*)[^\n]{0,35}\b(мм|mm|миллиметр\w*|см|cm|сантиметр\w*|м|m|метр\w*|meter\w*)\b/i);
    return match ? unitWord(match[1]) : null;
}

function quantity(line, a, b) {
    let s = line.slice(b, b + 50);
    let match = s.match(/^\s*[xх×*]\s*(\d+(?:\.\d+)?)\s*(?:шт\.?|штук|мест(?:а|о)?)?/i);
    if (match) return Number(match[1]);

    match = s.match(/^\s*(?:кол-?во|количество|мест)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
    if (match) return Number(match[1]);

    match = s.match(/^\s*(\d+(?:\.\d+)?)\s*(?:шт\.?|штук|мест(?:а|о)?)/i);
    if (match) return Number(match[1]);

    s = line.slice(Math.max(0, a - 25), a);
    match = s.match(/(\d+(?:\.\d+)?)\s*(?:шт\.?|штук|мест(?:а|о)?)\s*$/i);
    return match ? Number(match[1]) : 1;
}

function volume(l, w, h, unit, quantityValue = 1) {
    const divisor = unit === 'м' ? 1 : unit === 'см' ? 1e6 : 1e9;
    return (l * w * h * quantityValue) / divisor;
}

function score(l, w, h, unit, quantityValue, line) {
    const factor = unit === 'м' ? 1 : unit === 'см' ? 0.01 : 0.001;
    const dimensions = [l * factor, w * factor, h * factor];
    const min = Math.min(...dimensions);
    const max = Math.max(...dimensions);
    const middle = dimensions.slice().sort((a, b) => a - b)[1];
    const singleVolume = volume(l, w, h, unit, 1);
    const totalVolume = singleVolume * quantityValue;

    let scoreValue = 0;

    // Логистический контекст: размеры груза должны быть физически правдоподобными.
    if (min >= 0.02 && max <= 20) scoreValue += 18;
    if (min >= 0.05 && max <= 15) scoreValue += 12;
    if (middle >= 0.15 && middle <= 3) scoreValue += 12;

    // Объём одной единицы и общий объём.
    if (singleVolume >= 0.0005 && singleVolume <= 80) scoreValue += 18;
    if (totalVolume >= 0.001 && totalVolume <= 500) scoreValue += 15;
    if (totalVolume > 500) scoreValue -= 35;
    if (totalVolume < 0.000001) scoreValue -= 30;

    // Формат чисел сам по себе тоже даёт слабый сигнал.
    if (unit === 'мм' && Math.max(l, w, h) >= 300 && Math.max(l, w, h) <= 3000) scoreValue += 10;
    if (unit === 'см' && Math.max(l, w, h) >= 5 && Math.max(l, w, h) <= 250) scoreValue += 8;
    if (unit === 'м' && Math.max(l, w, h) >= 1 && Math.max(l, w, h) <= 15) scoreValue += 8;

    // Текст вокруг размеров должен быть похож на описание груза.
    if (/груз|короб|паллет|упаков|мест|ящик|поддон|фура|перевоз|доставк|габарит|размер/i.test(line)) {
        if (singleVolume >= 0.001 && singleVolume <= 80) scoreValue += 10;
    }

    return scoreValue;
}

function chooseUnit(l, w, h, quantityValue, line, explicit) {
    if (explicit) {
        return { unit: explicit, doubtful: false, message: '' };
    }

    const candidates = ['мм', 'см', 'м']
        .map((unit) => ({ unit, score: score(l, w, h, unit, quantityValue, line) }))
        .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    const second = candidates[1];
    const close = best.score - second.score < 12;

    return {
        unit: best.unit,
        doubtful: close,
        message: close
            ? `⚠️ Автовыбор: ${best.unit}. Возможен вариант ${second.unit}. Проверьте единицу измерения.`
            : ''
    };
}

function addItem(id, start, end, l, w, h, quantityValue, line, explicit) {
    const choice = chooseUnit(l, w, h, quantityValue, line, explicit);
    parsedItems.push({
        id,
        start,
        end,
        isValid: true,
        l,
        w,
        h,
        quantity: quantityValue,
        unit: choice.unit,
        isDoubtful: choice.doubtful,
        msg: choice.message
    });
}

function calculate() {
    const raw = $('inputText').value;
    if (!raw.trim()) {
        alert('Введите текст');
        return;
    }

    const lines = raw
        .replace(/(\d+),(\d+)/g, '$1.$2')
        .split('\n');

    parsedItems = [];
    let offset = 0;
    let id = 1;
    const dimensionRegex = /(\d+(?:\.\d+)?)\s*(?:x|х|×|\*)\s*(\d+(?:\.\d+)?)\s*(?:x|х|×|\*)\s*(\d+(?:\.\d+)?)/gi;

    lines.forEach((originalLine) => {
        let line = originalLine
            .toLowerCase()
            .replace(/\d{2}\.\d{2}\.\d{4}/g, ' ')
            .replace(/\d+-[a-zа-я][a-zа-я0-9]*/gi, ' ')
            .replace(/\d+\/[a-zа-я][a-zа-я0-9]*/gi, ' ');

        let match;
        let found = false;
        dimensionRegex.lastIndex = 0;

        while ((match = dimensionRegex.exec(line)) !== null) {
            found = true;
            const l = Number(match[1]);
            const w = Number(match[2]);
            const h = Number(match[3]);
            const q = quantity(line, match.index, dimensionRegex.lastIndex);
            const explicit = explicitUnit(line, match.index, dimensionRegex.lastIndex);
            addItem(id++, offset, offset + originalLine.length, l, w, h, q, line, explicit);
        }

        // Запасной разбор: три числа подряд, когда между ними нет x/х/×/*.
        if (!found) {
            const numbers = line.match(/\d+(?:\.\d+)?/g);
            if (numbers && numbers.length >= 3) {
                const l = Number(numbers[0]);
                const w = Number(numbers[1]);
                const h = Number(numbers[2]);
                const q = quantity(line, 0, 0);
                const explicit = explicitUnit(line, 0, line.length);
                addItem(id++, offset, offset + originalLine.length, l, w, h, q, line, explicit);
            }
        }

        offset += originalLine.length + 1;
    });

    renderResults();
}

function renderResults() {
    let total = 0;
    let pieces = 0;
    let warnings = 0;
    let html = '';
    let report = '📊 ОТЧЕТ ПО РАСЧЕТУ ОБЪЕМА:\n\n';

    parsedItems.forEach((item, index) => {
        if (!item.isValid) return;

        if (item.isDoubtful) warnings++;
        const itemVolume = volume(item.l, item.w, item.h, item.unit, item.quantity);
        total += itemVolume;
        pieces += item.quantity;

        html += `
            <div class="detail-line ${item.isDoubtful ? 'warning-line' : ''}">
                Позиция ${item.id}: ${item.l}x${item.w}x${item.h}
                <span class="badge-group">
                    <button type="button" class="btn-badge ${item.unit === 'м' ? 'active' : ''}" data-i="${index}" data-unit="м">м</button>
                    <button type="button" class="btn-badge ${item.unit === 'см' ? 'active' : ''}" data-i="${index}" data-unit="см">см</button>
                    <button type="button" class="btn-badge ${item.unit === 'мм' ? 'active' : ''}" data-i="${index}" data-unit="мм">мм</button>
                </span>
                × ${item.quantity} шт. = <strong>${itemVolume.toFixed(4)}</strong> м³
                ${item.isDoubtful ? `<div class="warning-text">${item.msg}</div>` : ''}
            </div>`;

        report += `• Позиция ${item.id}: ${item.l}x${item.w}x${item.h} ${item.unit} × ${item.quantity} шт. = ${itemVolume.toFixed(4)} м³\n`;
    });

    if (!parsedItems.length) {
        html = '<div class="detail-line warning-line"><div class="warning-text">❌ Не найдено ни одной надёжной группы габаритов (L × W × H).</div></div>';
    }

    const status = $('calcStatus');
    status.className = 'calc-status ' + (warnings ? 'warn' : 'ok');
    status.innerHTML = warnings
        ? `🟡 Расчёт требует проверки<small>${warnings} ${warnings === 1 ? 'позиция требует' : 'позиции требуют'} проверки единицы. Изменить её можно кнопками м / см / мм.</small>`
        : `🟢 Расчёт завершён<small>${parsedItems.length ? 'Все позиции распознаны без предупреждений.' : 'Габариты не обнаружены.'}</small>`;

    $('totalVolume').innerHTML = `<strong>${total.toFixed(4)}</strong> м³`;
    $('totalPieces').textContent = `${pieces} шт.`;
    $('detailsList').innerHTML = html;
    $('resultBox').hidden = false;

    textReportGlobal = report + `\n🚚 ОБЩИЙ ОБЪЕМ: ${total.toFixed(4)} м³\n🔢 ВСЕГО МЕСТ: ${pieces} шт.`;
}

async function copyReport() {
    if (!textReportGlobal) return;
    try {
        await navigator.clipboard.writeText(textReportGlobal);
        $('copyBtn').textContent = '✅ Отчёт скопирован';
        setTimeout(() => $('copyBtn').textContent = '📋 Скопировать отчет', 1400);
    } catch (error) {
        alert('Не удалось скопировать отчёт автоматически.');
    }
}

function updateConnectionStatus() {
    const title = $('connectionTitle');
    const text = $('connectionText');
    const dot = document.querySelector('.status-dot');

    if (navigator.onLine) {
        title.textContent = 'Соединение активно';
        text.textContent = 'Приложение готово к работе онлайн и офлайн';
        dot.style.background = 'var(--success)';
    } else {
        title.textContent = 'Офлайн-режим';
        text.textContent = 'Расчёты доступны без подключения к интернету';
        dot.style.background = '#f59e0b';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setTheme(localStorage.getItem('user-theme') || 'system');

    $('theme-light').addEventListener('click', () => setTheme('light'));
    $('theme-dark').addEventListener('click', () => setTheme('dark'));
    $('theme-system').addEventListener('click', () => setTheme('system'));
    $('calcBtn').addEventListener('click', calculate);
    $('clearBtn').addEventListener('click', clearAll);
    $('copyBtn').addEventListener('click', copyReport);

    $('detailsList').addEventListener('click', (event) => {
        const button = event.target.closest('.btn-badge');
        if (!button) return;
        const item = parsedItems[Number(button.dataset.i)];
        if (!item) return;
        item.unit = button.dataset.unit;
        item.isDoubtful = false;
        item.msg = '';
        renderResults();
    });

    $('inputText').addEventListener('paste', () => setTimeout(calculate, 50));
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    updateConnectionStatus();
});
