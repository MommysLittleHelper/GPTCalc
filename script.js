
(function(){
function updateConnectionStatus(){var b=document.getElementById('connectionStatus'),t=document.getElementById('statusTitle'),s=document.getElementById('statusText');if(!b||!t||!s)return;var on=navigator.onLine;b.classList.toggle('online',on);b.classList.toggle('offline',!on);t.textContent=on?'Соединение активно':'Офлайн-режим';s.textContent=on?'Приложение готово к работе онлайн и офлайн':'Соединение отсутствует — калькулятор продолжает работать локально';}
function clearAll(){var b=document.getElementById('clearBtn');if(b)b.click();}
async function pasteText(){var i=document.getElementById('inputText');if(!i)return;try{if(navigator.clipboard&&navigator.clipboard.readText){var t=await navigator.clipboard.readText();if(t){i.value=t;i.dispatchEvent(new Event('input',{bubbles:true}));i.focus();return;}}}catch(e){}i.focus();}
document.addEventListener('DOMContentLoaded',function(){var p=document.getElementById('pasteBtn'),c=document.getElementById('quickClearBtn'),r=document.getElementById('quickCopyBtn');if(p)p.onclick=pasteText;if(c)c.onclick=clearAll;if(r)r.onclick=function(){var b=document.getElementById('copyBtn');if(b)b.click();};updateConnectionStatus();window.addEventListener('online',updateConnectionStatus);window.addEventListener('offline',updateConnectionStatus);});
})();
// =========================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ХРАНЕНИЯ ДАННЫХ
// =========================================================================
var parsedItems = [];
var textReportGlobal = '';

// =========================================================================
// 1. УПРАВЛЕНИЕ ТЕМАМИ ОФОРМЛЕНИЯ
// =========================================================================
function setTheme(theme) {
    var buttons = document.querySelectorAll('.theme-switch button');
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove('active');
    }
    
    var activeBtn = document.getElementById('theme-' + theme);
    if (activeBtn) activeBtn.classList.add('active');
    localStorage.setItem('user-theme', theme);
    
    var isDark = false;
    if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
        isDark = (theme === 'dark');
    }
    
    document.documentElement.className = isDark ? 'dark' : 'light';
}

function handleSystemThemeChange() {
    if (localStorage.getItem('user-theme') === 'system') setTheme('system');
}
(function () {
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (!media) return;
    if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', handleSystemThemeChange);
    } else if (typeof media.addListener === 'function') {
        media.addListener(handleSystemThemeChange);
    }
}());

// ФУНКЦИЯ ПОЛНОЙ ОЧИСТКИ ИНТЕРФЕЙСА
function clearAll() {
    var inputText = document.getElementById('inputText');
    var resultBox = document.getElementById('resultBox');
    if (inputText) inputText.value = '';
    if (resultBox) resultBox.style.display = 'none';
    parsedItems = [];
    textReportGlobal = '';
    if (inputText) inputText.focus();
}

// =========================================================================
// 2. ПОСТРОЧНЫЙ УМНЫЙ ПОИСК ВЕЛИЧИН (КОНВЕЙЕРНАЯ ВСЕЯДНОСТЬ)
// =========================================================================
function calculate() {
    var rawText = document.getElementById('inputText').value;
    if (!rawText.trim()) return alert("Введите текст");
    
    // Мягкая нормализация: превращаем запятые в дробных числах в точки
    var normalizedText = rawText.replace(/(\d+),(\d+)/g, '$1.$2');
    var lines = normalizedText.split('\n');
    parsedItems = [];
    
    var itemIndex = 1;
    var startPosAccumulator = 0;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmedLine = line.trim();
        var lineLength = line.length + 1; // +1 для учета \n
        
        if (!trimmedLine) {
            startPosAccumulator += lineLength;
            continue;
        }

        var lowerLine = trimmedLine.toLowerCase();
        
        // БЕЗОПАСНАЯ ОЧИСТКА ШУМА: стираем даты и артикулы, чтобы они не попадали в конвейер чисел
        lowerLine = lowerLine.replace(/\d{2}\.\d{2}\.\d{4}/g, ' '); // Даты (10.08.2026)
        lowerLine = lowerLine.replace(/\d+-[a-z][a-z0-9]*/g, ' ');   // Артикулы (445-x)
        lowerLine = lowerLine.replace(/\d+\/[a-z][a-z0-9]*/g, ' ');   // Артикулы через дробь (551/a)

        // Извлекаем абсолютно все числа из текущей строки подряд
        var numbers = lowerLine.match(/\d+(\.\d+)?/g);

        
        if (numbers && numbers.length >= 3) {
            // Крутим цикл, пока в строке остаются тройки чисел для габаритов
            while (numbers.length >= 3) {
                // Извлекаем первые три числа как длину, ширину и высоту
                var l = parseFloat(numbers.shift());
                var w = parseFloat(numbers.shift());
                var h = parseFloat(numbers.shift());
                
                var quantity = 1;
                
                // Если следом идет еще одно число — проверяем, не штуки ли это
                if (numbers.length > 0) {
                    // Если число небольшое (меньше 500) — это явно количество мест, а не длина следующего паллета
                    if (parseFloat(numbers[0]) < 500) {
                        quantity = parseFloat(numbers.shift());
                    }
                }

                // Ваша оригинальная эвристика автоматического определения единиц
                var unit = 'см';
                var isDoubtful = false;
                var msg = '';
                var sum = l + w + h;
                var max = Math.max(l, w, h);
                var min = Math.min(l, w, h);
                
                if (/(?:^|[^а-яa-z])(мм|mm)(?:[^а-яa-z]|$)/.test(lowerLine)) {
                    unit = 'мм';
                } else if (/(?:^|[^а-яa-z])(см|cm)(?:[^а-яa-z]|$)/.test(lowerLine)) {
                    unit = 'см';
                } else if (/(?:^|[^а-яa-z])(м|m|метр|метров|метра|meter)(?:[^а-яa-z]|$)/.test(lowerLine)) {
                    unit = 'м';
                } else {
                    if (sum <= 30) { 
                        if (max > 5) { 
                            unit = 'см'; 
                            isDoubtful = true; 
                            msg = '⚠️ Расчет в см, но проверьте — возможно это метры?'; 
                        } else {
                            unit = 'м'; 
                        }
                    } else if (sum <= 300) { 
                        unit = 'см'; 
                        isDoubtful = true; 
                        msg = '⚠️ Расчет в см, но проверьте — возможно это мм?'; 
                    } else if (sum <= 3000) {
                        if (max >= 1000 && min >= 100) {
                            unit = 'мм';
                        } else if (min <= 25 || (l > 100 && w > 100 && h > 100)) { 
                            unit = 'см'; 
                            if (min > 25) { 
                                isDoubtful = true; 
                                msg = '⚠️ Расчет в см, но проверьте — возможно это мм?'; 
                            } 
                        } else { 
                            unit = 'мм'; 
                            isDoubtful = true; 
                            msg = '⚠️ Расчет в мм, но проверьте — возможно это см?'; 
                        }
                    } else {
                        unit = 'мм';
                    }
                }

                parsedItems.push({
                    id: itemIndex++,
                    start: startPosAccumulator,
                    end: startPosAccumulator + line.length,
                    isValid: true,
                    l: l, 
                    w: w, 
                    h: h,
                    quantity: quantity,
                    unit: unit,
                    isDoubtful: isDoubtful,
                    msg: msg
                });
            }
        }
        startPosAccumulator += lineLength;
    }

    if (parsedItems.length === 0) {
        parsedItems.push({ id: 1, isValid: false, start: 0, end: rawText.length });
    }

    var bulkBox = document.getElementById('bulkActions');
    if (bulkBox) {
        var validCount = parsedItems.filter(function(x) { return x.isValid; }).length;
        bulkBox.style.display = validCount > 1 ? 'flex' : 'none';
    }
    
    renderResults();
}
// =========================================================================
// 3. ОТРИСОВКА РЕЗУЛЬТАТОВ НА ЭКРАН И ГЕНЕРАЦИЯ ОТЧЕТА
// =========================================================================
function renderResults() {
    var totalVolume = 0, totalPieces = 0, detailsHtml = '', textReport = '📊 ОТЧЕТ ПО РАСЧЕТУ ОБЪЕМА:\n\n';
    
    for (var i = 0; i < parsedItems.length; i++) {
        var item = parsedItems[i];
        if (item.isValid) {
            var div = item.unit === 'мм' ? 1000000000 : (item.unit === 'м' ? 1 : 1000000);
            var vol = (item.l * item.w * item.h * item.quantity) / div;
            totalVolume += vol; 
            totalPieces += item.quantity;
            
            var warnClass = item.isDoubtful ? 'warning-line' : '';
            var mAct = item.unit === 'м' ? 'active' : '';
            var cmAct = item.unit === 'см' ? 'active' : '';
            var mmAct = item.unit === 'мм' ? 'active' : '';
            
            detailsHtml += '<div class="detail-line ' + warnClass + '" data-start="' + item.start + '" data-end="' + item.end + '">' +
                'Позиция ' + item.id + ': ' + item.l + 'x' + item.w + 'x' + item.h + ' ' +
                '<div class="badge-group">' +
                    '<button class="btn-badge ' + mAct + '" data-i="' + i + '" data-unit="м">м</button>' +
                    '<button class="btn-badge ' + cmAct + '" data-i="' + i + '" data-unit="см">см</button>' +
                    '<button class="btn-badge ' + mmAct + '" data-i="' + i + '" data-unit="мм">мм</button>' +
                '</div> × ' + item.quantity + ' шт. = <strong>' + vol.toFixed(4) + '</strong> м³' +
                (item.isDoubtful ? '<div class="warning-text">' + item.msg + '</div>' : '') +
            '</div>';
            
            textReport += '• Позиция ' + item.id + ': ' + item.l + 'x' + item.w + 'x' + item.h + ' ' + item.unit + ' × ' + item.quantity + ' шт. = ' + vol.toFixed(4) + ' м³\n' + (item.isDoubtful ? '  ' + item.msg + '\n' : '');
        } else {
            detailsHtml += '<div class="detail-line" style="color:#ef4444; border-left:4px solid #ef4444;">❌ В тексте не найдено подходящих групп из 3 или 4 чисел.</div>';
        }
    }
    
    document.getElementById('totalVolume').innerHTML = '<strong>' + totalVolume.toFixed(4) + '</strong> м³';
    document.getElementById('totalPieces').innerText = totalPieces + ' шт.';
    document.getElementById('detailsList').innerHTML = detailsHtml;
    document.getElementById('resultBox').style.display = 'block';
    
    var copyBtn = document.getElementById('copyBtn');
    if (copyBtn) copyBtn.innerText = '📋 Скопировать отчет';
    
    textReportGlobal = textReport + '\n\n🚚 ОБЩИЙ ОБЪЕМ: ' + totalVolume.toFixed(4) + ' м³\n🔢 ВСЕГО МЕСТ: ' + totalPieces + ' шт.';
}

function highlightTextRange(start, end) {
    setTimeout(function() {
        var textarea = document.getElementById('inputText');
        if (!textarea) return;
        textarea.setSelectionRange(start, end);
    }, 0);
}

// =========================================================================
// 4. ПРИВЯЗКА СОБЫТИЙ СТРАНИЦЫ (DOM)
// =========================================================================
document.addEventListener('DOMContentLoaded', function() {
    var mainTextarea = document.getElementById('inputText');
    if (mainTextarea) mainTextarea.focus();

    setTheme(localStorage.getItem('user-theme') || 'system');
    
    document.getElementById('theme-light').addEventListener('click', function() { setTheme('light'); });
    document.getElementById('theme-dark').addEventListener('click', function() { setTheme('dark'); });
    document.getElementById('theme-system').addEventListener('click', function() { setTheme('system'); });
    document.getElementById('calcBtn').addEventListener('click', calculate);
    
    document.getElementById('copyBtn').addEventListener('click', function() {
        navigator.clipboard.writeText(textReportGlobal).then(function() {
            var copyBtn = document.getElementById('copyBtn');
            copyBtn.innerText = '✅ Отчет скопирован!';
            setTimeout(function() { copyBtn.innerText = '📋 Скопировать отчет'; }, 2000);
        });
    });
    
    var clearButton = document.getElementById('clearBtn');
    if (clearButton) {
        clearButton.addEventListener('click', clearAll);
    }

    var bulkBox = document.getElementById('bulkActions');
    if (bulkBox) {
        bulkBox.addEventListener('click', function(e) {
            var btn = e.target.closest('.bulk-unit-btn');
            if (!btn) return;
            var targetUnit = btn.getAttribute('data-unit');
            for (var k = 0; k < parsedItems.length; k++) {
                if (parsedItems[k].isValid) {
                    parsedItems[k].unit = targetUnit;
                    parsedItems[k].isDoubtful = false;
                }
            }
            renderResults();
        });
    }

    document.getElementById('detailsList').addEventListener('click', function(e) {
        var line = e.target.closest('.detail-line');
        if (!line || e.target.closest('.btn-badge')) return; 
        
        var start = parseInt(line.getAttribute('data-start'));
        var end = parseInt(line.getAttribute('data-end'));
        if (!isNaN(start) && !isNaN(end)) {
            var textarea = document.getElementById('inputText');
            if (textarea) textarea.focus();
            highlightTextRange(start, end);
        }
    });

    document.getElementById('detailsList').addEventListener('click', function(e) {
        var btn = e.target.closest('.btn-badge');
        if (!btn) return;
        var i = parseInt(btn.getAttribute('data-i'));
        var u = btn.getAttribute('data-unit'); 
        if (parsedItems[i]) {
            parsedItems[i].unit = u;
            parsedItems[i].isDoubtful = false;
            renderResults();
        }
    });

    if (mainTextarea) {
        mainTextarea.addEventListener('paste', function() {
            setTimeout(calculate, 50);
        });
        mainTextarea.addEventListener('input', function() {
            try { localStorage.setItem('volume-calculator-draft', mainTextarea.value); } catch (e) {}
        });

        try {
            var draft = localStorage.getItem('volume-calculator-draft');
            if (draft) {
                mainTextarea.value = draft;
                calculate();
            }
        } catch (e) {}
    }
});