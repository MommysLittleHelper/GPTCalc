var parsedItems = [];
var textReportGlobal = '';

function setTheme(theme) {
    var buttons = document.querySelectorAll('.theme-switch button');
    for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('active');
    var activeBtn = document.getElementById('theme-' + theme);
    if (activeBtn) activeBtn.classList.add('active');
    try { localStorage.setItem('user-theme', theme); } catch (e) {}

    var isDark = theme === 'dark';
    if (theme === 'system') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.className = isDark ? 'dark' : 'light';
}
function handleSystemThemeChange() {
    try { if (localStorage.getItem('user-theme') === 'system') setTheme('system'); } catch (e) {}
}
var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handleSystemThemeChange);
else if (mediaQuery.addListener) mediaQuery.addListener(handleSystemThemeChange);

function clearAll() {
    var input = document.getElementById('inputText');
    var result = document.getElementById('resultBox');
    if (input) input.value = '';
    if (result) result.style.display = 'none';
    parsedItems = [];
    textReportGlobal = '';
    if (input) input.focus();
    try { localStorage.removeItem('calc-draft'); } catch (e) {}
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeNumber(s) {
    return parseFloat(String(s).replace(',', '.'));
}

function hasUnitBefore(text, start) {
    var part = text.slice(Math.max(0, start - 18), start).toLowerCase();
    return /(?:^|[^а-яa-z])(мм|mm)(?:[^а-яa-z]|$)/.test(part) ? 'мм' :
           /(?:^|[^а-яa-z])(см|cm)(?:[^а-яa-z]|$)/.test(part) ? 'см' :
           /(?:^|[^а-яa-z])(м|m|метр|метров|метра|метре|метры|meter)(?:[^а-яa-z]|$)/.test(part) ? 'м' : null;
}

function hasUnitAfter(text, end) {
    var part = text.slice(end, Math.min(text.length, end + 18)).toLowerCase();
    return /(?:^|[\s,;:()\-])(мм|mm)(?=$|[\s,;:()\-])/i.test(part) ? 'мм' :
           /(?:^|[\s,;:()\-])(см|cm)(?=$|[\s,;:()\-])/i.test(part) ? 'см' :
           /(?:^|[\s,;:()\-])(м|m|метр|метров|метра|метре|метры|meter)(?=$|[\s,;:()\-])/i.test(part) ? 'м' : null;
}

function inferUnit(l, w, h) {
    var sum = l + w + h;
    var max = Math.max(l, w, h);
    var min = Math.min(l, w, h);
    var result = { unit: 'см', doubtful: false, msg: '' };

    if (sum <= 30) {
        if (max <= 5) result.unit = 'м';
        else { result.unit = 'см'; result.doubtful = true; result.msg = '⚠️ Автовыбор: см. Проверьте, не указаны ли размеры в метрах.'; }
    } else if (sum <= 300) {
        result.unit = 'см';
        result.doubtful = true;
        result.msg = '⚠️ Автовыбор: см. Проверьте, не указаны ли размеры в мм.'; 
    } else if (sum <= 3000) {
        if (max >= 1000 && min >= 100) result.unit = 'мм';
        else if (min <= 25 || (l > 100 && w > 100 && h > 100)) result.unit = 'см';
        else {
            result.unit = 'мм';
            result.doubtful = true;
            result.msg = '⚠️ Автовыбор: мм. Проверьте, не указаны ли размеры в см.';
        }
    } else {
        result.unit = 'мм';
    }
    return result;
}

function cleanNoise(line) {
    return line
        .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, ' ')
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
        .replace(/\b(?:арт(?:икул)?\.?|article|sku|код|id)\s*[:#№-]?\s*[a-zа-я0-9._/-]+\b/gi, ' ')
        .replace(/\b\d+[/-][a-zа-я][a-zа-я0-9_-]*\b/gi, ' ')
        .replace(/\b[a-zа-я]+[/-]\d+[a-zа-я0-9_-]*\b/gi, ' ');
}

function findQuantityAfter(text, end) {
    var tail = text.slice(end, Math.min(text.length, end + 50));
    var explicit = tail.match(/^\s*(?:(?:мм|см|м|mm|cm|meter|метр(?:а|ов|е|ы)?)\s*)?[\s,;:()\-]*(?:[xх×*]\s*)?(?:кол(?:ичество)?|кол-во|qty|quantity)\s*[:№#-]?\s*(\d+(?:[.,]\d+)?)\s*(?:шт\.?|штук|мест(?:а|о)?\b)?/i);
    if (explicit) return { quantity: normalizeNumber(explicit[1]), length: explicit[0].length };

    var marked = tail.match(/^\s*(?:(?:мм|см|м|mm|cm|meter|метр(?:а|ов|е|ы)?)\s*)?[\s,;:()\-]*(?:[xх×*]\s*)?(\d+(?:[.,]\d+)?)\s*(шт\.?|штук|мест(?:а|о)?\b)/i);
    if (marked) return { quantity: normalizeNumber(marked[1]), length: marked[0].length };

    var bare = tail.match(/^\s*(?:[xх×*]\s*)?(\d+(?:[.,]\d+)?)(?=\s|$)/i);
    if (bare) {
        var q = normalizeNumber(bare[1]);
        if (q >= 1 && q <= 10000 && !/^(?:19|20)\d{2}$/.test(bare[1])) {
            return { quantity: q, length: bare[0].length };
        }
    }
    return { quantity: 1, length: 0 };
}

function findQuantityNearBefore(text, start) {
    var head = text.slice(Math.max(0, start - 35), start);
    var marked = head.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(шт\.?|штук|мест(?:а|о)?\b)\s*$/i);
    if (marked) {
        var q = normalizeNumber(marked[1]);
        if (q >= 1 && q <= 10000) return q;
    }
    return 1;
}

function makeItem(l, w, h, quantity, unit, doubtful, msg, start, end, source) {
    return {
        id: 0, start: start, end: end, isValid: true,
        l: l, w: w, h: h, quantity: quantity || 1,
        unit: unit, isDoubtful: !!doubtful, msg: msg || '', source: source || ''
    };
}

function parseLine(line, globalStart) {
    var work = cleanNoise(line);
    var items = [];
    var used = [];
    var num = '(\\d+(?:[.,]\\d+)?)';

    // 1) Наиболее надёжный вариант: размеры разделены x, х, × или *.
    var sepRe = new RegExp(num + '\\s*[xх×*]\\s*' + num + '\\s*[xх×*]\\s*' + num, 'gi');
    var m;
    while ((m = sepRe.exec(work)) !== null) {
        var l = normalizeNumber(m[1]), w = normalizeNumber(m[2]), h = normalizeNumber(m[3]);
        if (![l,w,h].every(function(v){ return isFinite(v) && v > 0; })) continue;

        var end = m.index + m[0].length;
        var qInfo = findQuantityAfter(work, end);
        var quantity = qInfo.quantity, qLen = qInfo.length;
        if (quantity === 1) quantity = findQuantityNearBefore(work, m.index);

        var explicitUnit = hasUnitBefore(work, m.index) || hasUnitAfter(work, end);
        var inf = inferUnit(l,w,h);
        var unit = explicitUnit || inf.unit;
        var doubtful = explicitUnit ? false : inf.doubtful;
        var msg = explicitUnit ? '' : inf.msg;

        items.push(makeItem(l,w,h,quantity,unit,doubtful,msg,
            globalStart + m.index, globalStart + end + qLen, m[0]));
        used.push([m.index, end + qLen]);
    }

    // 2) Консервативный вариант для "1500 500 1000": только последовательности
    // трёх чисел, разделённых пробелами/запятыми/точками с запятой.
    var wsRe = new RegExp('(^|[^\\d.,])' + num + '\\s*[,; ]\\s*' + num + '\\s*[,; ]\\s*' + num + '(?=$|[^\\d.,])', 'gi');
    while ((m = wsRe.exec(work)) !== null) {
        var start = m.index + m[1].length;
        var end2 = m.index + m[0].length;
        var overlap = used.some(function(r){ return start < r[1] && end2 > r[0]; });
        if (overlap) continue;

        var l2 = normalizeNumber(m[2]), w2 = normalizeNumber(m[3]), h2 = normalizeNumber(m[4]);
        if (![l2,w2,h2].every(function(v){ return isFinite(v) && v > 0; })) continue;

        // Не принимаем очевидные одиночные номера/даты/годы за размеры.
        var rawTriple = m[0];
        if (/\b(?:19|20)\d{2}\b/.test(rawTriple) && Math.max(l2,w2,h2) <= 2100) continue;

        var endTriple = end2;
        var qInfo2 = findQuantityAfter(work, endTriple);
        var quantity2 = qInfo2.quantity;
        if (quantity2 === 1) quantity2 = findQuantityNearBefore(work, start);

        var explicitUnit2 = hasUnitBefore(work, start) || hasUnitAfter(work, endTriple);
        var inf2 = inferUnit(l2,w2,h2);
        items.push(makeItem(l2,w2,h2,quantity2,explicitUnit2 || inf2.unit,
            explicitUnit2 ? false : inf2.doubtful,
            explicitUnit2 ? '' : inf2.msg,
            globalStart + start, globalStart + endTriple, rawTriple));
        used.push([start,endTriple]);
    }
    return items;
}

function calculate() {
    var input = document.getElementById('inputText');
    var rawText = input ? input.value : '';
    if (!rawText.trim()) { alert('Введите текст'); return; }

    parsedItems = [];
    var lines = rawText.replace(/\r\n?/g, '\n').split('\n');
    var cursor = 0;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var found = parseLine(line, cursor);
        for (var j = 0; j < found.length; j++) {
            found[j].id = parsedItems.length + 1;
            parsedItems.push(found[j]);
        }
        cursor += line.length + 1;
    }

    var bulkBox = document.getElementById('bulkActions');
    if (bulkBox) bulkBox.style.display = parsedItems.length > 1 ? 'flex' : 'none';

    if (parsedItems.length === 0) {
        parsedItems.push({ id:1, isValid:false, start:0, end:rawText.length });
    }
    renderResults();
}

function renderResults() {
    var totalVolume = 0, totalPieces = 0, detailsHtml = '';
    var textReport = '📊 ОТЧЕТ ПО РАСЧЕТУ ОБЪЕМА:\n\n';

    for (var i = 0; i < parsedItems.length; i++) {
        var item = parsedItems[i];
        if (!item.isValid) {
            detailsHtml += '<div class="detail-line" style="color:#ef4444;border-left:4px solid #ef4444;">❌ Не найдено ни одной надёжной группы габаритов (L × W × H).</div>';
            continue;
        }
        var div = item.unit === 'мм' ? 1000000000 : (item.unit === 'м' ? 1 : 1000000);
        var vol = (item.l * item.w * item.h * item.quantity) / div;
        totalVolume += vol;
        totalPieces += item.quantity;

        var warnClass = item.isDoubtful ? 'warning-line' : '';
        var mAct = item.unit === 'м' ? 'active' : '';
        var cmAct = item.unit === 'см' ? 'active' : '';
        var mmAct = item.unit === 'мм' ? 'active' : '';

        detailsHtml += '<div class="detail-line ' + warnClass + '" data-start="' + item.start + '" data-end="' + item.end + '">' +
            'Позиция ' + item.id + ': ' + item.l + '×' + item.w + '×' + item.h + ' ' +
            '<div class="badge-group">' +
            '<button class="btn-badge ' + mAct + '" type="button" data-i="' + i + '" data-unit="м">м</button>' +
            '<button class="btn-badge ' + cmAct + '" type="button" data-i="' + i + '" data-unit="см">см</button>' +
            '<button class="btn-badge ' + mmAct + '" type="button" data-i="' + i + '" data-unit="мм">мм</button>' +
            '</div> × ' + item.quantity + ' шт. = <strong>' + vol.toFixed(4) + '</strong> м³' +
            (item.isDoubtful ? '<div class="warning-text">' + item.msg + '</div>' : '') +
            '</div>';

        textReport += '• Позиция ' + item.id + ': ' + item.l + 'x' + item.w + 'x' + item.h + ' ' +
            item.unit + ' × ' + item.quantity + ' шт. = ' + vol.toFixed(4) + ' м³\n';
        if (item.isDoubtful) textReport += '  ' + item.msg + '\n';
    }

    document.getElementById('totalVolume').innerHTML = '<strong>' + totalVolume.toFixed(4) + '</strong> м³';
    document.getElementById('totalPieces').innerText = totalPieces + ' шт.';
    document.getElementById('detailsList').innerHTML = detailsHtml;
    document.getElementById('resultBox').style.display = 'block';
    textReportGlobal = textReport + '\\n🚚 ОБЩИЙ ОБЪЕМ: ' + totalVolume.toFixed(4) + ' м³\\n🔢 ВСЕГО МЕСТ: ' + totalPieces + ' шт.';
}

function highlightTextRange(start, end) {
    setTimeout(function() {
        var textarea = document.getElementById('inputText');
        if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(start, end);
        }
    }, 0);
}

function updateConnectionStatus() {
    var box = document.getElementById('connectionStatus');
    var title = document.getElementById('statusTitle');
    var text = document.getElementById('statusText');
    if (!box || !title || !text) return;
    var online = navigator.onLine;
    box.classList.toggle('online', online);
    box.classList.toggle('offline', !online);
    title.textContent = online ? 'Система готова' : 'Автономный режим';
    text.textContent = online ? 'Онлайн • офлайн-режим доступен' : 'Интернет недоступен • расчёты продолжаются';
}

function copyReport() {
    var btn = document.getElementById('copyBtn');
    function ok() {
        if (!btn) return;
        btn.innerText = '✅ Отчет скопирован!';
        setTimeout(function(){ btn.innerText = '📋 Скопировать отчет'; }, 2000);
    }
    function fail() { if (btn) btn.innerText = '⚠️ Не удалось скопировать'; setTimeout(function(){ if(btn) btn.innerText='📋 Скопировать отчет'; }, 2000); }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textReportGlobal).then(ok).catch(function(){
            try {
                var ta = document.createElement('textarea');
                ta.value = textReportGlobal; document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); ta.remove(); ok();
            } catch (e) { fail(); }
        });
    } else {
        try {
            var ta2 = document.createElement('textarea');
            ta2.value = textReportGlobal; document.body.appendChild(ta2); ta2.select();
            document.execCommand('copy'); ta2.remove(); ok();
        } catch (e) { fail(); }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var mainTextarea = document.getElementById('inputText');
    if (mainTextarea) mainTextarea.focus();

    var savedTheme = 'system';
    try { savedTheme = localStorage.getItem('user-theme') || 'system'; } catch (e) {}
    setTheme(savedTheme);

    document.getElementById('theme-light').addEventListener('click', function(){ setTheme('light'); });
    document.getElementById('theme-dark').addEventListener('click', function(){ setTheme('dark'); });
    document.getElementById('theme-system').addEventListener('click', function(){ setTheme('system'); });
    document.getElementById('calcBtn').addEventListener('click', calculate);
    document.getElementById('copyBtn').addEventListener('click', copyReport);

    var clearButton = document.getElementById('clearBtn');
    if (clearButton) clearButton.addEventListener('click', clearAll);

    var bulkBox = document.getElementById('bulkActions');
    if (bulkBox) bulkBox.addEventListener('click', function(e) {
        var btn = e.target.closest('.bulk-unit-btn');
        if (!btn) return;
        var targetUnit = btn.getAttribute('data-unit');
        parsedItems.forEach(function(item){
            if (item.isValid) { item.unit = targetUnit; item.isDoubtful = false; item.msg = ''; }
        });
        renderResults();
    });

    var details = document.getElementById('detailsList');
    if (details) details.addEventListener('click', function(e) {
        var btn = e.target.closest('.btn-badge');
        if (btn) {
            var i = parseInt(btn.getAttribute('data-i'),10);
            var u = btn.getAttribute('data-unit');
            if (parsedItems[i]) { parsedItems[i].unit = u; parsedItems[i].isDoubtful = false; parsedItems[i].msg = ''; renderResults(); }
            return;
        }
        var line = e.target.closest('.detail-line');
        if (line) {
            var start = parseInt(line.getAttribute('data-start'),10);
            var end = parseInt(line.getAttribute('data-end'),10);
            if (!isNaN(start) && !isNaN(end)) highlightTextRange(start,end);
        }
    });

    if (mainTextarea) mainTextarea.addEventListener('paste', function(){ setTimeout(calculate, 50); });

    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
});
