// v31.1 Guardian Script
// Implementation: Ghost Buster, Transparent Tagging, Tag Flattener, Digit Safe, Box 2 Priority

const OPT_KEYS = ['opt_percent','opt_ampersand','opt_bracket','opt_colon','opt_punctuation','opt_quote','opt_wave','opt_mark','opt_dash','opt_hyphen','opt_slash','opt_equal', 'opt_mark_space'];
let lastSynced = {}; 
let masterWhitelist = []; 
let masterCompanyList = []; 
let loadedPresetsData = {}; 
let currentSuggestions = [];
let currentEditId = null; 

window.onload = function() {
    document.getElementById('githubToken').value = localStorage.getItem('gh_token') || '';
    if(localStorage.getItem('gh_user')) document.getElementById('githubUser').value = localStorage.getItem('gh_user');
    if(localStorage.getItem('gh_repo')) document.getElementById('githubRepo').value = localStorage.getItem('gh_repo');
    
    OPT_KEYS.forEach(id => {
        const val = localStorage.getItem(id); 
        if(val) document.getElementById(id).value = val;
        document.getElementById(id).addEventListener('change', () => saveSettings());
    });
    
    document.getElementById('modeBtn').addEventListener('click', toggleDarkMode);
    if(localStorage.getItem('theme') === 'dark') toggleDarkMode();
    
    document.getElementById('presetsJson').addEventListener('input', () => refreshPresetsFromUI());
    updateStyleSelect();
    applyStyle(document.getElementById('activeStyle').value);
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

// --- List & Modal Logic ---

function formatListContent(text) {
    if (!text) return "";
    const lines = text.split('\n').map(s => s.trim()).filter(s => s !== "");
    const unique = Array.from(new Set(lines));
    unique.sort((a, b) => a.localeCompare(b, 'ja'));
    return unique.join('\n');
}

function checkUnsaved(id) {
    const status = document.getElementById('status_' + id);
    if (lastSynced[id] === null) { status.innerText = "⚠️ 未共有"; status.className = "list-status status-unsaved"; return; }
    const current = document.getElementById(id).value.trim(); 
    const last = (lastSynced[id] || "").trim();
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

function openModal(id, title) {
    currentEditId = id;
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalTextarea').value = document.getElementById(id).value;
    document.getElementById('editorModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('editorModal').style.display = 'none';
    currentEditId = null;
}

function saveModal() {
    if(currentEditId) {
        let val = document.getElementById('modalTextarea').value;
        if (currentEditId !== 'presetsJson') { val = formatListContent(val); }
        document.getElementById(currentEditId).value = val;
        onListInput(currentEditId);
        if(currentEditId === 'presetsJson') refreshPresetsFromUI();
    }
    closeModal();
}

// --- JSON & Style Management ---
function jsonToText(jsonStr, updateGlobal = true) {
    try {
        const obj = JSON.parse(jsonStr);
        if (updateGlobal) loadedPresetsData = obj; 
        let text = "";
        for (let style in obj) {
            text += `[${style}]\n`;
            const rules = obj[style].rules ? obj[style].rules : obj[style];
            if (typeof rules === 'object') {
                for (let from in rules) text += `${from} > ${rules[from]}\n`;
            }
            text += "\n";
        }
        if (updateGlobal) updateStyleSelect(obj);
        return text.trim();
    } catch(e) { console.error(e); return jsonStr; }
}

function textToJson(text) {
    const lines = text.split('\n');
    const newRulesMap = {};
    let curStyle = null;
    lines.forEach(l => {
        l = l.trim(); if (!l) return;
        if (l.startsWith('[') && l.endsWith(']')) { curStyle = l.slice(1, -1); newRulesMap[curStyle] = {}; } 
        else if (curStyle && l.includes('>')) { const p = l.split('>').map(s => s.trim()); if (p.length === 2) newRulesMap[curStyle][p[0]] = p[1]; }
    });
    let finalObj = JSON.parse(JSON.stringify(loadedPresetsData)); 
    for (let styleName in newRulesMap) {
        if (!finalObj[styleName]) { finalObj[styleName] = { rules: newRulesMap[styleName], options: {}, _meta: { created: new Date().toISOString() } }; } 
        else {
            if (finalObj[styleName].rules) finalObj[styleName].rules = newRulesMap[styleName];
            else { const saved = finalObj[styleName]; finalObj[styleName] = { rules: newRulesMap[styleName], options: saved.options||{}, _meta: saved._meta||{} }; }
        }
    }
    for (let key in finalObj) { if (!newRulesMap[key]) delete finalObj[key]; }
    return JSON.stringify(finalObj, null, 2);
}

function refreshPresetsFromUI() {
    try { const jsonStr = textToJson(document.getElementById('presetsJson').value); loadedPresetsData = JSON.parse(jsonStr); updateStyleSelect(); } 
    catch(e) { console.error("Hot-reload error:", e); }
}

function updateStyleSelect(dataObj) {
    const select = document.getElementById('activeStyle');
    const btnUpdate = document.getElementById('btnUpdateStyle');
    const currentVal = select.value;
    const data = dataObj || loadedPresetsData;
    select.innerHTML = '<option value="none">なし (単純整形のみ)</option>';
    if (!data) return;
    Object.keys(data).forEach(style => { const opt = document.createElement('option'); opt.value = style; opt.innerText = style; select.appendChild(opt); });
    if (Object.keys(data).includes(currentVal)) select.value = currentVal;
    
    if (select.value === 'none') { if(btnUpdate) { btnUpdate.disabled = true; btnUpdate.innerText = "🔄 選択されていません"; } } 
    else { if(btnUpdate) { btnUpdate.disabled = false; btnUpdate.innerText = `🔄 [${select.value}] を更新`; } }
}

function applyStyle(styleName) {
    const infoSpan = document.getElementById('styleInfo');
    const btnUpdate = document.getElementById('btnUpdateStyle');
    const isNone = styleName === 'none';
    
    OPT_KEYS.forEach(id => { const el = document.getElementById(id); if(el) { el.disabled = isNone; el.style.opacity = isNone ? "0.5" : "1"; } });
    if (isNone) { if(btnUpdate) { btnUpdate.disabled = true; btnUpdate.innerText = "🔄 選択されていません"; } } 
    else { if(btnUpdate) { btnUpdate.disabled = false; btnUpdate.innerText = `🔄 [${styleName}] を更新`; } }

    if (isNone || !loadedPresetsData[styleName]) { infoSpan.innerText = ""; return; }
    const styleData = loadedPresetsData[styleName];
    if (styleData.options && Object.keys(styleData.options).length > 0) {
        let appliedCount = 0;
        for (let key in styleData.options) { const el = document.getElementById(key); if (el) { el.value = styleData.options[key]; el.dispatchEvent(new Event('change')); appliedCount++; } }
        infoSpan.innerText = `✅ ${appliedCount}個のオプションを適用`;
    } else { infoSpan.innerText = "ℹ️ オプション設定なし (辞書のみ)"; }
}

function updateCurrentStyle() {
    const name = document.getElementById('activeStyle').value;
    if (name === 'none' || !loadedPresetsData[name]) return;
    loadedPresetsData[name].options = {};
    OPT_KEYS.forEach(k => { const el = document.getElementById(k); if(el) loadedPresetsData[name].options[k] = el.value; });
    loadedPresetsData[name]._meta.updated = new Date().toISOString();
    document.getElementById('presetsJson').value = jsonToText(JSON.stringify(loadedPresetsData));
    lastSynced['presetsJson'] = null; checkUnsaved('presetsJson');
    alert(`スタイル "${name}" の設定を更新しました。`);
}

function createNewStyle() {
    const name = document.getElementById('newStyleName').value.trim();
    if (!name) { alert("スタイル名を入力してください"); return; }
    if (loadedPresetsData[name]) { alert(`スタイル "${name}" は既に存在します。`); return; }
    const opts = {}; OPT_KEYS.forEach(k => { const el = document.getElementById(k); if(el) opts[k] = el.value; });
    loadedPresetsData[name] = { rules: {}, options: opts, _meta: { created: new Date().toISOString() } };
    const textArea = document.getElementById('presetsJson');
    textArea.value += `\n[${name}]\n`; textArea.value = jsonToText(JSON.stringify(loadedPresetsData));
    lastSynced['presetsJson'] = null; checkUnsaved('presetsJson');
    updateStyleSelect(); document.getElementById('activeStyle').value = name; applyStyle(name);
    alert(`新規スタイル "${name}" を作成しました。`);
}

function checkConflicts() { const alertBox = document.getElementById('conflictAlert'); if(alertBox) alertBox.style.display = 'none'; }
function filterList() {
    const query = document.getElementById('search_whitelist').value.toLowerCase();
    const textArea = document.getElementById('whitelist');
    if (query === "") { textArea.value = masterWhitelist.join('\n'); textArea.readOnly = false; textArea.style.opacity = "1"; }
    else { textArea.value = masterWhitelist.filter(line => line.toLowerCase().includes(query)).join('\n'); textArea.readOnly = true; textArea.style.opacity = "0.7"; }
}
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
    
    if (elementId !== 'presetsJson') { textArea.value = formatListContent(textArea.value); }
    
    const url = `https://api.github.com/repos/${user}/${repo}/contents/${fileName}`;
    try {
        const res = await fetch(url, { headers: { "Authorization": `token ${token}` }, cache: "no-store" });
        if (res.ok) {
            const data = await res.json();
            let remoteJsonRaw = decodeURIComponent(escape(atob(data.content)));
            let displayContent = remoteJsonRaw;
            if (elementId === 'presetsJson') displayContent = jsonToText(remoteJsonRaw, false);
            else {
                displayContent = formatListContent(remoteJsonRaw);
                if(elementId === 'whitelist') masterWhitelist = displayContent.split('\n');
                if(elementId === 'companyList') masterCompanyList = displayContent.split('\n');
            }
            if (textArea.value.trim() !== "" && (textArea.value.trim() !== displayContent.trim() || lastSynced[elementId] === null)) {
                if (confirm("GitHubに保存（上書き）しますか？")) {
                    let finalToSave = textArea.value; 
                    if (elementId === 'presetsJson') finalToSave = textToJson(textArea.value);
                    await fetch(url, { method: "PUT", headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ message: `Update ${fileName}`, content: btoa(unescape(encodeURIComponent(finalToSave))), sha: data.sha }) });
                    alert("保存完了"); displayContent = textArea.value; 
                    if (elementId === 'presetsJson') remoteJsonRaw = finalToSave;
                }
            }
            textArea.value = displayContent; lastSynced[elementId] = displayContent; 
            if(elementId === 'presetsJson') jsonToText(remoteJsonRaw, true);
            checkUnsaved(elementId); alert("同期完了"); if(elementId !== 'presetsJson') checkConflicts();
        } else if(res.status === 404) {
             if(confirm(`ファイル ${fileName} が見つかりません。新規作成しますか？`)) {
                 let content = textArea.value; if (elementId === 'presetsJson') content = "{}";
                 await fetch(url, { method: "PUT", headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ message: `Create ${fileName}`, content: btoa(unescape(encodeURIComponent(content))) }) });
                 alert("ファイルを作成しました。"); lastSynced[elementId] = textArea.value; checkUnsaved(elementId);
             }
        }
    } catch (e) { console.error(e); alert("同期エラー: " + e.message); }
}

// --- v31.1 Core Logic ---

function getFuzzyRegExp(cleanKey) {
    if (!cleanKey) return null;
    const chars = cleanKey.split('').map(c => c.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const pattern = chars.join('[\\s\\n]*');
    return new RegExp(pattern, 'gi');
}

function processText() {
    let text = document.getElementById('input').value;
    const isCompare = document.getElementById('compareMode').checked;
    const activeStyle = document.getElementById('activeStyle').value;
    const config = {}; OPT_KEYS.forEach(id => config[id] = document.getElementById(id).value);

    // --- Phase 0: Pre-processing & Protection ---
    text = text.replace(/\r\n/g, '\n').replace(/[\t\u00A0]/g, ' ').replace(/[ 　]+\n/g, '\n');
    let hasStartSpace = text.startsWith('　');
    if (hasStartSpace) text = '___S_Z_SP___' + text.slice(1);

    const protectedItems = [];
    const protect = (val, type) => {
        const p = `___P_${type}_${protectedItems.length}___`;
        protectedItems.push({p, val, isDiff: false});
        return p;
    };
    
    text = text.replace(/https?:\/\/[\w!\?\/+\-_~=;\.,\*&@#\$%\(\)'\[\]]+/g, (m) => protect(m, 'URL'));
    text = text.replace(/\d{1,2}:\d{2}/g, (m) => protect(m, 'TIME'));
    text = text.replace(/(^|\n)\s*　/g, (m, p1) => p1 + '___P_ZPARA___');
    text = text.replace(/\n\n+/g, '___P_DPARA___');

    // --- Phase 1: Ghost Buster (Full Spectrum) ---
    let prevText;
    do {
        prevText = text;
        text = text.replace(/([a-zA-Z0-9])[\s\n]+([a-zA-Z0-9])/g, '$1$2'); 
        text = text.replace(/([^\x00-\x7F])[\s\n]+([a-zA-Z0-9])/g, '$1$2'); 
        text = text.replace(/([a-zA-Z0-9])[\s\n]+([^\x00-\x7F])/g, '$1$2'); 
    } while (text !== prevText);
    
    // Capture Virtual Original State (cleaned)
    let virtualOriginalText = text;

    // --- Phase 2: Box 1 (Cleansing) ---
    // [v31.1 Change] Transparent Tagging for activeStyle
    if (activeStyle !== 'none') {
        const companyList = document.getElementById('companyList').value.split('\n').map(s=>s.trim()).filter(s=>s);
        companyList.sort((a, b) => b.length - a.length);
        
        companyList.forEach(line => {
            let targets = [];
            let replacement = "";
            if (line.includes('>')) {
                const parts = line.split('>');
                replacement = parts[1].trim();
                targets = parts[0].split(',').map(s => s.trim()).filter(s => s);
            } else { replacement = line; targets = [line]; }
            
            targets.forEach(src => {
                const cleanKey = src.replace(/\s+/g, '');
                const regex = getFuzzyRegExp(cleanKey);
                if (!regex) return;
                text = text.replace(regex, (match) => {
                    if (match.includes('___P_')) return match;
                    // PASS-THROUGH: Do not protect if style is active
                    // But show diff tag if comparison is on
                    if (isCompare && match !== replacement) {
                        return `${match}【>${replacement}】`;
                    }
                    return replacement;
                });
            });
        });
    }

    // --- Phase 3: Box 2 (Absolute Protection) ---
    // [v31.1 Change] Priority Sort & Hardening
    const whitelist = document.getElementById('whitelist').value.split('\n').map(s=>s.trim()).filter(s=>s);
    whitelist.sort((a, b) => b.length - a.length); // Sort by length DESC
    
    whitelist.forEach((word) => {
        const cleanKey = word.replace(/\s+/g, '');
        const regex = getFuzzyRegExp(cleanKey);
        if (!regex) return;
        text = text.replace(regex, (match) => {
            if (match.includes('___P_')) return match;
            let finalVal = word;
            if (isCompare && activeStyle !== 'none') {
                 if (match !== word) finalVal = `${match}【>${word}】`;
            }
            const p = `___P_WL_${protectedItems.length}___`;
            protectedItems.push({p, val: finalVal, isDiff: false}); 
            return p;
        });
    });

    text = text.replace(/\n/g, ''); 

    // --- Phase 4: Box 3 & 4 (Replacement) ---
    if (activeStyle !== 'none') {
        let allRules = [];
        document.getElementById('replaceList').value.split('\n').forEach(line => {
            const parts = line.split('>'); if (parts.length === 2) parts[0].split(',').forEach(c => allRules.push({ from: c.trim(), to: parts[1].trim() }));
        });
        
        if (loadedPresetsData[activeStyle]) {
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
        let prefixPattern = "[台豪米独仏日英韓中]*";
        
        allRules.forEach((rule) => {
            if (!rule.from) return;
            const fuzzyKey = rule.from.split('').map(c => c.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('[\\s\\n]*');
            const regex = new RegExp(`${prefixPattern}${fuzzyKey}`, 'gi');
            text = text.replace(regex, (match) => {
                if (match.includes('___P_')) return match;
                const count = (occurrenceMap.get(rule.from) || 0) + 1; occurrenceMap.set(rule.from, count);
                let targetTo = rule.to.includes('|') ? (count === 1 ? rule.to.split('|')[0].trim() : rule.to.split('|')[1].trim()) : rule.to;
                if (match === targetTo) return match;
                
                // Diff Logic inside Box 4
                const val = isCompare ? `${match}【>${targetTo}】` : targetTo;
                // Box 4 result must be protected to prevent symbol changes on the replaced text?
                // Actually usually Box 4 is final construction. Symbols come next.
                // We protect it so symbols don't break "米Intel" etc.
                const p = `___P_RV_${protectedItems.length}___`;
                protectedItems.push({p, val: val, isDiff: true});
                return p;
            });
        });

        // --- Phase 5: Symbols & Formatting ---
        text = text.replace(/([^\x00-\x7F]) +/g, '$1').replace(/ +([^\x00-\x7F])/g, '$1').replace(/([、。，]) +/g, '$1');

        const replaceSym = (regex, target) => { 
            text = text.replace(regex, (m) => (m.includes('___P_') || m.trim() === target) ? m : (isCompare ? `${m}【>${target}】` : target)); 
        };
        
        if (config.opt_percent) replaceSym(/[％%]/g, config.opt_percent === 'zen' ? '％' : '%');
        if (config.opt_ampersand) replaceSym(/[＆&]/g, config.opt_ampersand === 'zen' ? '＆' : '&');
        if (config.opt_mark) { replaceSym(/[！!]/g, config.opt_mark === 'zen' ? '！' : '!'); replaceSym(/[？?]/g, config.opt_mark === 'zen' ? '？' : '?'); }
        if (config.opt_colon) replaceSym(/[：:]/g, config.opt_colon === 'zen' ? '：' : ':');
        
        const tOpen = config.opt_bracket === 'zen' ? '（' : '('; const tClose = config.opt_bracket === 'zen' ? '）' : ')';
        text = text.replace(/[\(\)（）]/g, (m) => {
            if (m.includes('___P_')) return m;
            const t = (m === '(' || m === '（') ? tOpen : tClose; return (m === t) ? m : (isCompare ? `${m}【>${t}】` : t);
        });

        // [v31.1 Change] Digit Safe Punctuation
        if (config.opt_punctuation === 'ten_maru') { replaceSym(/[，,]/g, '、'); replaceSym(/(?<!\d)[．\.](?!\d)/g, '。'); } 
        else if (config.opt_punctuation === 'comma_maru') { replaceSym(/、/g, '，'); replaceSym(/(?<!\d)[．\.](?!\d)/g, '。'); } 
        else if (config.opt_punctuation === 'comma_period') { replaceSym(/、/g, '，'); replaceSym(/[。]/g, '．'); replaceSym(/(?<!\d)\.(?!\d)/g, '．'); }

        const waveChar = config.opt_wave === 'tilde' ? '～' : '〜';
        replaceSym(/[〜～]/g, waveChar);
        
        if (config.opt_mark_space !== 'keep') {
            const markSpaceChar = config.opt_mark_space === 'force' ? '　' : '';
            text = text.replace(/([！？])([ 　]*)([^_\n）〉」』】］\}])/g, (match, m1, space, nextChar) => {
                if (match.includes('___P_') || space === markSpaceChar) return match;
                const target = m1 + markSpaceChar + nextChar; return isCompare ? `${match}【>${target}】` : target;
            });
        }
        text = text.replace(/\uFF5E/g, isCompare ? '\uFF5E【>\u301C】' : '\u301C');
        text = text.replace(/[０-９ａ-ｚＡ-Ｚ]/g, (s) => (s.includes('___P_')) ? s : (isCompare ? `${s}【>${String.fromCharCode(s.charCodeAt(0)-0xFEE0)}】` : String.fromCharCode(s.charCodeAt(0)-0xFEE0)));
    }

    // --- Restoration & Tag Flattening ---
    
    // 1. Restore tokens
    let finalOutputWithTags = text;
    finalOutputWithTags = finalOutputWithTags.split('___P_ZPARA___').join('\n\n　').split('___P_DPARA___').join('\n\n');
    for (let i = protectedItems.length - 1; i >= 0; i--) { 
        finalOutputWithTags = finalOutputWithTags.split(protectedItems[i].p).join(protectedItems[i].val); 
    }

    // 2. [v31.1 New] Tag Flattener: Resolve Nested Tags
    // Pattern: A【>B【>C】】 -> A【>C】
    // Note: We use a loop to handle potential multiple nestings, though usually it's just one level.
    // Regex: Match "Content + 【> + Content + 【> + Content + 】 + 】"
    // Using greedy match might fail on "A【>B【>C】】 ... X【>Y【>Z】】".
    // We use a safe regex that assumes brackets don't appear in content (except as diff tags).
    // Logic: Look for the inner-most nest? No, usually it's "Original【>Intermed【>Final】】"
    if (isCompare) {
        let prevOut;
        do {
            prevOut = finalOutputWithTags;
            // Match: (Non-bracket)【> (Non-bracket) 【> (Non-bracket) 】 】
            // We strip the middle part.
            // $1 = Original, $2 = Final
            finalOutputWithTags = finalOutputWithTags.replace(/([^【]+?)【>[^【]+?【>(.+?)】】/g, '$1【>$2】');
        } while (finalOutputWithTags !== prevOut);
    }

    // 3. Create Virtual Original for Check
    virtualOriginalText = virtualOriginalText.split('___P_ZPARA___').join('\n\n　').split('___P_DPARA___').join('\n\n');
    for (let i = protectedItems.length - 1; i >= 0; i--) { 
        if (virtualOriginalText.includes(protectedItems[i].p)) {
             // Only restore Pre-proc tokens (URL/Time), which don't have diffs in them.
             virtualOriginalText = virtualOriginalText.split(protectedItems[i].p).join(protectedItems[i].val);
        }
    }

    // 4. Create Final Clean Text (Strip tags)
    let finalCleanText = finalOutputWithTags.replace(/.*?【>(.*?)】/g, "$1");

    // Clean up
    virtualOriginalText = virtualOriginalText.replace(/\n{3,}/g, '\n\n').trim();
    if (hasStartSpace) virtualOriginalText = '　' + virtualOriginalText.replace(/^___S_Z_SP___/, '');

    finalCleanText = finalCleanText.replace(/\n{3,}/g, '\n\n').trim();
    if (hasStartSpace) finalCleanText = '　' + finalCleanText.replace(/^___S_Z_SP___/, '');
    
    finalOutputWithTags = finalOutputWithTags.replace(/\n{3,}/g, '\n\n').trim();
    if (hasStartSpace) finalOutputWithTags = '　' + finalOutputWithTags.replace(/^___S_Z_SP___/, '');

    // ROUND TRIP CHECK
    if (isCompare && virtualOriginalText === finalCleanText) {
        document.getElementById('output').innerText = finalCleanText; 
    } else {
        if (isCompare) document.getElementById('output').innerHTML = finalOutputWithTags.replace(/【>(.*?)】/g, '<span class="diff-tag">【&gt;$1】</span>');
        else document.getElementById('output').innerText = finalCleanText;
    }

    let zenCount = 0; for (let i = 0; i < finalCleanText.length; i++) {
        const c = finalCleanText.charCodeAt(i); if ((c >= 0x0 && c < 0x81) || (c === 0xf8f0) || (c >= 0xff61 && c <= 0xff9f)) zenCount += 0.5; else zenCount += 1;
    }
    document.getElementById('charCount').innerText = `文字数: ${finalCleanText.length} | 全角換算: ${Math.ceil(zenCount)}`;
}

function downloadTxt() { const text = document.getElementById('output').innerText; if (!text) return; const blob = new Blob([text], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cleaned_text.txt'; a.click(); }
