const OPT_KEYS = ['opt_percent','opt_ampersand','opt_bracket','opt_colon','opt_comma','opt_quote','opt_mark','opt_dash','opt_hyphen','opt_slash','opt_equal', 'opt_mark_space'];
let lastSynced = {}; 
let masterWhitelist = []; 
let masterCompanyList = []; 
let loadedPresetsData = {}; // Full JSON object in memory (Rules + Options + Meta)
let currentSuggestions = [];

window.onload = function() {
    document.getElementById('githubToken').value = localStorage.getItem('gh_token') || '';
    if(localStorage.getItem('gh_user')) document.getElementById('githubUser').value = localStorage.getItem('gh_user');
    if(localStorage.getItem('gh_repo')) document.getElementById('githubRepo').value = localStorage.getItem('gh_repo');
    
    // Restore local option settings first
    OPT_KEYS.forEach(id => {
        const val = localStorage.getItem(id); 
        if(val) document.getElementById(id).value = val;
        document.getElementById(id).addEventListener('change', () => {
            saveSettings();
        });
    });
    
    if(localStorage.getItem('theme') === 'dark') toggleDarkMode();
    
    // Initial UI Setup
    updateStyleSelect();
};

function saveSettings() {
    localStorage.setItem('gh_token', document.getElementById('githubToken').value);
    localStorage.setItem('gh_user', document.getElementById('githubUser').value);
    localStorage.setItem('gh_repo', document.getElementById('githubRepo').value);
    OPT_KEYS.forEach(id => localStorage.setItem(id, document.getElementById(id).value));
}

function toggleDarkMode() {
    const body = document.body; body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('modeBtn').innerText = isDark ? '☀️ ライトモード' : '🌙 ダークモード';
}

function copyToClipboard() { const text = document.getElementById('output').innerText; if (!text) return; navigator.clipboard.writeText(text).then(() => alert("コピー完了！")); }

function checkUnsaved(id) {
    const current = document.getElementById(id).value.trim(); const last = (lastSynced[id] || "").trim();
    const status = document.getElementById('status_' + id);
    if (last === "") { status.innerText = "☁️ 未読込"; status.className = "list-status status-init"; }
    else if (current !== last) { status.innerText = "⚠️ 未共有"; status.className = "list-status status-unsaved"; }
    else { status.innerText = "✅ 最新"; status.className = "list-status status-sync"; }
}

function onListInput(id) { 
    checkUnsaved(id); 
    if(id === 'whitelist') masterWhitelist = document.getElementById('whitelist').value.split('\n');
    if(id === 'companyList') masterCompanyList = document.getElementById('companyList').value.split('\n');
    checkConflicts();
}

function checkConflicts() {
    const wLines = document.getElementById('whitelist').value.split('\n').map(s=>s.trim()).filter(s=>s);
    const cLines = document.getElementById('companyList').value.split('\n').map(s=>s.trim()).filter(s=>s);
    const rLines = document.getElementById('replaceList').value.split('\n').map(s=>s.trim()).filter(s=>s);
    
    const protectedSet = new Set(wLines);
    
    // v30.5: Robust Conflict Detection for "Source > Target"
    cLines.forEach(line => {
        if (line.includes('>')) {
            const parts = line.split('>');
            // Register both Source and Target as "Used/Protected"
            parts[1].split('|').forEach(t => protectedSet.add(t.trim())); // Target
            parts[0].split(',').forEach(s => protectedSet.add(s.trim())); // Sources
        } else {
            protectedSet.add(line);
        }
    });

    let conflict = false;
    rLines.forEach(line => {
        const key = line.split('>')[0].split(',')[0].trim();
        if (protectedSet.has(key)) conflict = true;
    });

    const alertBox = document.getElementById('conflictAlert');
    alertBox.style.display = conflict ? 'block' : 'none';
}

function filterList() {
    const query = document.getElementById('search_whitelist').value.toLowerCase();
    const textArea = document.getElementById('whitelist');
    if (query === "") { textArea.value = masterWhitelist.join('\n'); textArea.readOnly = false; textArea.style.opacity = "1"; }
    else { textArea.value = masterWhitelist.filter(line => line.toLowerCase().includes(query)).join('\n'); textArea.readOnly = true; textArea.style.opacity = "0.7"; }
}

// --- JSON & Style Management ---

function jsonToText(jsonStr) {
    try {
        const obj = JSON.parse(jsonStr);
        loadedPresetsData = obj; 
        
        let text = "";
        for (let style in obj) {
            text += `[${style}]\n`;
            const rules = obj[style].rules ? obj[style].rules : obj[style];
            if (typeof rules === 'object') {
                for (let from in rules) {
                    text += `${from} > ${rules[from]}\n`;
                }
            }
            text += "\n";
        }
        updateStyleSelect(obj);
        return text.trim();
    } catch(e) { console.error(e); return jsonStr; }
}

function textToJson(text) {
    const lines = text.split('\n');
    const newRulesMap = {};
    let curStyle = null;
    
    lines.forEach(l => {
        l = l.trim(); if (!l) return;
        if (l.startsWith('[') && l.endsWith(']')) { 
            curStyle = l.slice(1, -1); 
            newRulesMap[curStyle] = {}; 
        } else if (curStyle && l.includes('>')) { 
            const p = l.split('>').map(s => s.trim()); 
            if (p.length === 2) newRulesMap[curStyle][p[0]] = p[1]; 
        }
    });

    let finalObj = JSON.parse(JSON.stringify(loadedPresetsData)); 
    
    for (let styleName in newRulesMap) {
        if (!finalObj[styleName]) {
            finalObj[styleName] = { 
                rules: newRulesMap[styleName], 
                options: {}, 
                _meta: { created: new Date().toISOString() } 
            };
        } else {
            if (finalObj[styleName].rules) {
                finalObj[styleName].rules = newRulesMap[styleName];
            } else {
                const savedOptions = finalObj[styleName].options || {}; 
                const savedMeta = finalObj[styleName]._meta || {};
                finalObj[styleName] = {
                    rules: newRulesMap[styleName],
                    options: savedOptions,
                    _meta: savedMeta
                };
            }
        }
    }
    
    for (let key in finalObj) {
        if (!newRulesMap[key]) {
            delete finalObj[key];
        }
    }

    return JSON.stringify(finalObj, null, 2);
}

function updateStyleSelect(dataObj) {
    const select = document.getElementById('activeStyle');
    const currentVal = select.value;
    const data = dataObj || loadedPresetsData;
    
    select.innerHTML = '<option value="none">なし (整形のみ)</option>';
    
    if (!data) return;
    
    Object.keys(data).forEach(style => {
        const opt = document.createElement('option');
        opt.value = style;
        opt.innerText = style;
        select.appendChild(opt);
    });
    
    if (Object.keys(data).includes(currentVal)) {
        select.value = currentVal;
    }
}

function applyStyle(styleName) {
    const infoSpan = document.getElementById('styleInfo');
    if (styleName === 'none' || !loadedPresetsData[styleName]) {
        infoSpan.innerText = "";
        return;
    }

    const styleData = loadedPresetsData[styleName];
    if (styleData.options && Object.keys(styleData.options).length > 0) {
        let appliedCount = 0;
        for (let key in styleData.options) {
            const el = document.getElementById(key);
            if (el) {
                el.value = styleData.options[key];
                el.dispatchEvent(new Event('change'));
                appliedCount++;
            }
        }
        infoSpan.innerText = `✅ ${appliedCount}個のオプションを適用`;
    } else {
        infoSpan.innerText = "ℹ️ オプション設定なし (辞書のみ)";
    }
}

function saveCurrentStyleAsNew() {
    const name = document.getElementById('newStyleName').value.trim();
    if (!name) { alert("スタイル名を入力してください"); return; }
    if (loadedPresetsData[name] && !confirm(`スタイル "${name}" は既に存在します。上書きしますか？`)) return;

    const currentOptions = {};
    OPT_KEYS.forEach(k => {
        currentOptions[k] = document.getElementById(k).value;
    });

    if (!loadedPresetsData[name]) {
        loadedPresetsData[name] = { rules: {}, options: {}, _meta: { created: new Date().toISOString() } };
    }
    
    loadedPresetsData[name].options = currentOptions;
    
    const textArea = document.getElementById('presetsJson');
    if (!textArea.value.includes(`[${name}]`)) {
        textArea.value += `\n[${name}]\n`;
    }

    document.getElementById('presetsJson').value = jsonToText(JSON.stringify(loadedPresetsData));
    checkUnsaved('presetsJson');
    updateStyleSelect();
    document.getElementById('activeStyle').value = name;
    alert(`スタイル "${name}" を保存しました。\n[3. スタイル定義] の同期ボタンでクラウドに保存してください。`);
}

// --- Sync & Suggest Logic ---

function suggestRules() {
    const out = document.getElementById('output').innerText; if(!out) { alert("まずは整形を実行してください。"); return; }
    const matches = out.match(/[ァ-ヶー]{3,}/g) || [];
    const rules = []; const seen = new Set();
    Array.from(new Set(matches)).sort().forEach(word => {
        if (word.endsWith('ー')) {
            const base = word.slice(0, -1); if (base.length < 3) return;
            const rule = `${word}, ${base} > ${base}`; if (!seen.has(rule)) { rules.push(rule); seen.add(rule); }
        }
    });
    if (rules.length > 0) {
        currentSuggestions = rules; const panel = document.getElementById('assistPanel'); const listDiv = document.getElementById('assistList');
        listDiv.innerHTML = ""; rules.forEach((r, i) => { listDiv.innerHTML += `<div class="assist-item"><input type="checkbox" id="rule_${i}" checked> <label for="rule_${i}">${r}</label></div>`; });
        panel.style.display = 'block';
    } else { alert("候補は見つかりませんでした。"); }
}

function applySuggestions() {
    const area = document.getElementById('replaceList');
    currentSuggestions.forEach((rule, i) => { if (document.getElementById(`rule_${i}`).checked) area.value += (area.value ? '\n' : '') + rule; });
    document.getElementById('assistPanel').style.display = 'none'; checkUnsaved('replaceList');
}

async function syncList(fileName, elementId) {
    const token = document.getElementById('githubToken').value;
    const user = document.getElementById('githubUser').value;
    const repo = document.getElementById('githubRepo').value;
    const textArea = document.getElementById(elementId);
    if(!token || !user || !repo) { alert("同期設定が必要です"); return; }
    const url = `https://api.github.com/repos/${user}/${repo}/contents/${fileName}`;
    try {
        const res = await fetch(url, { headers: { "Authorization": `token ${token}` }, cache: "no-store" });
        if (res.ok) {
            const data = await res.json();
            let remote = decodeURIComponent(escape(atob(data.content)));
            let displayContent = remote;
            
            if (elementId === 'presetsJson') {
                displayContent = jsonToText(remote);
            } else {
                const lines = (remote.includes(',') && !remote.includes('\n')) ? remote.split(',').map(s=>s.trim()) : remote.split('\n').map(s=>s.trim());
                displayContent = Array.from(new Set(lines)).filter(s=>s!=="").join('\n');
                
                if(elementId === 'whitelist') masterWhitelist = displayContent.split('\n');
                if(elementId === 'companyList') masterCompanyList = displayContent.split('\n');
            }

            if (textArea.value.trim() !== "" && textArea.value.trim() !== displayContent.trim()) {
                if (confirm("GitHubに保存（上書き）しますか？")) {
                    let finalToSave = textArea.value;
                    if (elementId === 'presetsJson') finalToSave = textToJson(textArea.value);
                    
                    await fetch(url, { method: "PUT", headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ message: `Update ${fileName}`, content: btoa(unescape(encodeURIComponent(finalToSave))), sha: data.sha }) });
                    alert("保存完了"); displayContent = textArea.value; 
                    if (elementId === 'presetsJson') jsonToText(finalToSave);
                }
            }
            textArea.value = displayContent; lastSynced[elementId] = displayContent; checkUnsaved(elementId); alert("同期完了");
            if(elementId !== 'presetsJson') checkConflicts();
        } else if(res.status === 404) {
             if(confirm(`ファイル ${fileName} が見つかりません。新規作成しますか？`)) {
                 let content = textArea.value;
                 if (elementId === 'presetsJson') content = "{}";
                 await fetch(url, { method: "PUT", headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ message: `Create ${fileName}`, content: btoa(unescape(encodeURIComponent(content))) }) });
                 alert("ファイルを作成しました。"); lastSynced[elementId] = textArea.value; checkUnsaved(elementId);
             }
        }
    } catch (e) { console.error(e); alert("同期エラー: " + e.message); }
}

// --- Core Logic (v30.5 Logic Branching) ---

function getFuzzyRegExp(word) {
    if (!word) return null;
    const chars = word.split('').map(c => c.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const pattern = chars.join('[\\s\\n]*');
    return new RegExp(pattern, 'gi');
}

function processText() {
    let text = document.getElementById('input').value;
    const isCompare = document.getElementById('compareMode').checked;
    const activeStyle = document.getElementById('activeStyle').value;
    const config = {}; OPT_KEYS.forEach(id => config[id] = document.getElementById(id).value);

    // Step 0: Prep
    text = text.replace(/\r\n/g, '\n').replace(/[\t\u00A0]/g, ' ').replace(/[ 　]+\n/g, '\n');
    let hasStartSpace = text.startsWith('　');
    if (hasStartSpace) text = '___S_Z_SP___' + text.slice(1);

    const protectedItems = [];
    text = text.replace(/https?:\/\/[\w!\?\/+\-_~=;\.,\*&@#\$%\(\)'\[\]]+/g, (m) => { const p = `___P_URL_${protectedItems.length}___`; protectedItems.push({p, val: m}); return p; });
    text = text.replace(/\d{1,2}:\d{2}/g, (m) => { const p = `___P_TIME_${protectedItems.length}___`; protectedItems.push({p, val: m}); return p; });
    text = text.replace(/(^|\n)\s*　/g, (m, p1) => p1 + '___P_ZPARA___');
    text = text.replace(/\n\n+/g, '___P_DPARA___');

    // Step 1: Company List (Behavior varies by Style)
    // ID: companyList
    const companyList = document.getElementById('companyList').value.split('\n').map(s=>s.trim()).filter(s=>s);
    companyList.forEach(line => {
        let targets = [];
        let replacement = "";
        let shouldProtect = false; // For Case B

        if (line.includes('>')) {
            const parts = line.split('>');
            replacement = parts[1].trim();
            
            if (activeStyle === 'none') {
                // Case B: No Style. Ignore Left. Use Right as Shield.
                targets = [replacement];
                shouldProtect = true;
            } else {
                // Case A: Style Active. Use Left as Source. Cleansing only (No Protection).
                targets = parts[0].split(',').map(s => s.trim()).filter(s => s);
                // Also include self-repair for the replacement itself
                targets.push(replacement);
                shouldProtect = false;
            }
        } else {
            // TargetOnly. Always self-repair.
            replacement = line;
            targets = [line];
            // If No Style, we protect this word to keep its spaces.
            if (activeStyle === 'none') shouldProtect = true;
        }

        targets.forEach(src => {
            const regex = getFuzzyRegExp(src);
            if (!regex) return;
            text = text.replace(regex, (match) => {
                if (match.includes('___P_')) return match;
                
                // If protecting (Case B), we capsule it.
                if (shouldProtect) {
                    const p = `___P_WL_CMP_${Math.random().toString(36).slice(-2)}___`;
                    protectedItems.push({p, val: replacement});
                    return p;
                }
                
                // Else just cleansing (Case A)
                return replacement;
            });
        });
    });

    // Step 2: Absolute Defense (Whitelist)
    const whitelist = document.getElementById('whitelist').value.split('\n').map(s=>s.trim()).filter(s=>s);
    whitelist.forEach((word, i) => {
        const regex = getFuzzyRegExp(word);
        if (!regex) return;
        text = text.replace(regex, (match) => {
            if (match.includes('___P_')) return match;
            const hasNewline = match.includes('\n');
            let resultWord = word;
            if (match === word && !hasNewline) resultWord = word;
            
            const val = (isCompare && match !== word && match.replace(/[\s\n]+/g, '') === word) 
                        ? (match.includes('\n') ? word : `${match}【>${word}】`) 
                        : word;
            
            const p = `___P_WL_${i}_${Math.random().toString(36).slice(-2)}___`;
            protectedItems.push({p, val: word}); 
            return p;
        });
    });

    text = text.replace(/\n/g, ''); 
    
    // Step 3: Construction (Replace)
    let allRules = [];
    document.getElementById('replaceList').value.split('\n').forEach(line => {
        const parts = line.split('>'); if (parts.length === 2) parts[0].split(',').forEach(c => allRules.push({ from: c.trim(), to: parts[1].trim() }));
    });
    
    if (activeStyle !== 'none' && loadedPresetsData[activeStyle]) {
        try {
            const styleObj = loadedPresetsData[activeStyle];
            const rules = styleObj.rules ? styleObj.rules : styleObj;
            if (typeof rules === 'object') {
                for (let key in rules) {
                    key.split(',').forEach(c => {
                        allRules = allRules.filter(r => r.from !== c.trim());
                        allRules.push({ from: c.trim(), to: rules[key] });
                    });
                }
            }
        } catch(e) { console.error("Style apply error", e); }
    }
    allRules.sort((a, b) => b.from.length - a.from.length);

    const occurrenceMap = new Map();
    // v30.3 Policy: Strict Prefix
    let prefixPattern = "";
    if (activeStyle !== 'none') {
        prefixPattern = "[台豪米独仏日英韓中]*"; 
    }
    
    allRules.forEach((rule, idx) => {
        if (!rule.from) return;
        
        const fuzzyKey = rule.from.split('').map(c => c.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('[\\s\\n]*');
        const regex = new RegExp(`${prefixPattern}${fuzzyKey}`, 'gi');

        text = text.replace(regex, (match) => {
            if (match.includes('___P_')) return match;
            
            const count = (occurrenceMap.get(rule.from) || 0) + 1; occurrenceMap.set(rule.from, count);
            let targetTo = rule.to.includes('|') ? (count === 1 ? rule.to.split('|')[0].trim() : rule.to.split('|')[1].trim()) : rule.to;
            
            if (match === targetTo) return match;

            const result = isCompare ? `${match}【>${targetTo}】` : targetTo;
            const p = `___P_RV_${idx}_${Math.random().toString(36).slice(-2)}___`;
            protectedItems.push({p, val: result}); return p;
        });
    });

    // Step 4: Formatting & Symbols
    text = text.replace(/([^\x00-\x7F]) +/g, '$1').replace(/ +([^\x00-\x7F])/g, '$1').replace(/([、。，]) +/g, '$1');

    const replaceSymWithDiff = (regex, target) => { text = text.replace(regex, (m) => (m.includes('___P_') || m.trim() === target) ? m : (isCompare ? `${m}【>${target}】` : target)); };
    replaceSymWithDiff(/[％%]/g, config.opt_percent === 'zen' ? '％' : '%');
    replaceSymWithDiff(/[＆&]/g, config.opt_ampersand === 'zen' ? '＆' : '&');
    replaceSymWithDiff(/[！!]/g, config.opt_mark === 'zen' ? '！' : '!');
    replaceSymWithDiff(/[？?]/g, config.opt_mark === 'zen' ? '？' : '?');
    replaceSymWithDiff(/[：:]/g, config.opt_colon === 'zen' ? '：' : ':');
    const tOpen = config.opt_bracket === 'zen' ? '（' : '('; const tClose = config.opt_bracket === 'zen' ? '）' : ')';
    text = text.replace(/[\(\)（）]/g, (m) => {
        if (m.includes('___P_')) return m;
        const t = (m === '(' || m === '（') ? tOpen : tClose; return (m === t) ? m : (isCompare ? `${m}【>${t}】` : t);
    });
    if (config.opt_comma === 'comma') replaceSymWithDiff(/、/g, '，'); else replaceSymWithDiff(/，/g, '、');
    
    if (config.opt_mark_space !== 'keep') {
        const markSpaceChar = config.opt_mark_space === 'force' ? '　' : '';
        text = text.replace(/([！？])([ 　]*)([^\n）〉」』】］\}])/g, (match, m1, space, nextChar) => {
            if (match.includes('___P_') || space === markSpaceChar) return match;
            const target = m1 + markSpaceChar + nextChar; return isCompare ? `${match}【>${target}】` : target;
        });
    }
    
    text = text.replace(/．/g, isCompare ? '．【>.】' : '.').replace(/\uFF5E/g, isCompare ? '\uFF5E【>\u301C】' : '\u301C');
    text = text.replace(/[０-９ａ-ｚＡ-Ｚ]/g, (s) => (s.includes('___P_')) ? s : (isCompare ? `${s}【>${String.fromCharCode(s.charCodeAt(0)-0xFEE0)}】` : String.fromCharCode(s.charCodeAt(0)-0xFEE0)));

    text = text.split('___P_ZPARA___').join('\n\n　').split('___P_DPARA___').join('\n\n');
    for (let i = protectedItems.length - 1; i >= 0; i--) { text = text.split(protectedItems[i].p).join(protectedItems[i].val); }
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    if (hasStartSpace) text = '　' + text.replace(/^___S_Z_SP___/, '');

    if (isCompare) document.getElementById('output').innerHTML = text.replace(/【>(.*?)】/g, '<span class="diff-tag">【&gt;$1】</span>');
    else document.getElementById('output').innerText = text;
    let zenCount = 0; for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i); if ((c >= 0x0 && c < 0x81) || (c === 0xf8f0) || (c >= 0xff61 && c <= 0xff9f)) zenCount += 0.5; else zenCount += 1;
    }
    document.getElementById('charCount').innerText = `文字数: ${text.length} | 全角換算: ${Math.ceil(zenCount)}`;
}

function downloadTxt() { const text = document.getElementById('output').innerText; if (!text) return; const blob = new Blob([text], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cleaned_text.txt'; a.click(); }
