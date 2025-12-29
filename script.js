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
            // Clear style selection if manual change implies deviation
            // document.getElementById('activeStyle').value = 'none'; // Optional behavior
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
    const w = new Set(document.getElementById('whitelist').value.split('\n').map(s=>s.trim()).filter(s=>s));
    const c = new Set(document.getElementById('companyList').value.split('\n').map(s=>s.trim()).filter(s=>s));
    const rLines = document.getElementById('replaceList').value.split('\n').map(s=>s.trim()).filter(s=>s);
    
    let conflict = false;
    rLines.forEach(line => {
        const key = line.split('>')[0].split(',')[0].trim();
        if (w.has(key) || c.has(key)) conflict = true;
    });
    // Check W vs C
    // (Intersection check can be added here)

    const alertBox = document.getElementById('conflictAlert');
    alertBox.style.display = conflict ? 'block' : 'none';
}

function filterList() {
    const query = document.getElementById('search_whitelist').value.toLowerCase();
    const textArea = document.getElementById('whitelist');
    if (query === "") { textArea.value = masterWhitelist.join('\n'); textArea.readOnly = false; textArea.style.opacity = "1"; }
    else { textArea.value = masterWhitelist.filter(line => line.toLowerCase().includes(query)).join('\n'); textArea.readOnly = true; textArea.style.opacity = "0.7"; }
}

// --- Critical: Non-Destructive JSON Handling ---

function jsonToText(jsonStr) {
    try {
        const obj = JSON.parse(jsonStr);
        loadedPresetsData = obj; // Keep full object in memory
        
        let text = "";
        for (let style in obj) {
            text += `[${style}]\n`;
            // Support both v1 (simple dict) and v2 (object with rules)
            const rules = obj[style].rules ? obj[style].rules : obj[style];
            // If it's v2 but has no rules key (e.g. only options), handle gracefully
            if (typeof rules === 'object') {
                for (let from in rules) {
                    text += `${from} > ${rules[from]}\n`;
                }
            }
            text += "\n";
        }
        updateStyleSelect(obj); // Update dropdown UI
        return text.trim();
    } catch(e) { console.error(e); return jsonStr; }
}

function textToJson(text) {
    // 1. Parse text area into a map: { "StyleName": { "ruleFrom": "ruleTo", ... } }
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

    // 2. Merge into loadedPresetsData (Deep Copy approach to be safe)
    let finalObj = JSON.parse(JSON.stringify(loadedPresetsData)); 
    
    // Update existing or add new
    for (let styleName in newRulesMap) {
        if (!finalObj[styleName]) {
            // New style created via Text Area
            finalObj[styleName] = { 
                rules: newRulesMap[styleName], 
                options: {}, 
                _meta: { created: new Date().toISOString() } 
            };
        } else {
            // Existing style: Update rules ONLY, preserve options/_meta
            if (finalObj[styleName].rules) {
                finalObj[styleName].rules = newRulesMap[styleName];
            } else {
                // Migrate v1 to v2 on the fly
                const savedOptions = finalObj[styleName].options || {}; 
                const savedMeta = finalObj[styleName]._meta || {};
                // If it was v1, finalObj[styleName] was just the rules dict.
                // But we are in "textToJson", so we rely on what was loaded.
                // Simpler: Just force v2 structure
                finalObj[styleName] = {
                    rules: newRulesMap[styleName],
                    options: savedOptions, // In case it existed
                    _meta: savedMeta
                };
            }
        }
    }
    
    // Handle deletions? 
    // If a style is removed from Text Area, should we remove it from JSON?
    // YES, to keep sync.
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
    
    // Clear existing options (keep "none")
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
    // Check if it has options
    if (styleData.options && Object.keys(styleData.options).length > 0) {
        // Apply options to UI
        let appliedCount = 0;
        for (let key in styleData.options) {
            const el = document.getElementById(key);
            if (el) {
                el.value = styleData.options[key];
                // Trigger change event to save to localStorage
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

    // 1. Collect Options
    const currentOptions = {};
    OPT_KEYS.forEach(k => {
        currentOptions[k] = document.getElementById(k).value;
    });

    // 2. Collect Rules (parse from current Text Area to be sure)
    // We assume the user wants to save what they see in the text area? 
    // OR, do they want to save the rules of the CURRENTLY selected style?
    // UX: Usually "Save current settings as new style". 
    // Since the Text Area shows ALL styles, we can't easily grab "current rules" unless we filter.
    // Compromise: We add a new entry to the JSON with Empty Rules (or rules from active style?)
    // Better: Just save the Options structure. Rules must be added via the Text Area.
    // WAIT: The user expectation is "Save my Config".
    
    // Let's create the entry in loadedPresetsData
    if (!loadedPresetsData[name]) {
        loadedPresetsData[name] = { rules: {}, options: {}, _meta: { created: new Date().toISOString() } };
    }
    
    // Update options
    loadedPresetsData[name].options = currentOptions;
    
    // If text area needs update
    // We append the new style header to text area if not present
    const textArea = document.getElementById('presetsJson');
    if (!textArea.value.includes(`[${name}]`)) {
        textArea.value += `\n[${name}]\n`;
    }

    // Update global object and sync
    document.getElementById('presetsJson').value = jsonToText(JSON.stringify(loadedPresetsData));
    checkUnsaved('presetsJson');
    updateStyleSelect();
    document.getElementById('activeStyle').value = name;
    alert(`スタイル "${name}" を保存しました。\n[3. スタイル定義] の同期ボタンでクラウドに保存してください。`);
}

// --- End of JSON Logic ---

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
            
            // Special handling based on ID
            if (elementId === 'presetsJson') {
                displayContent = jsonToText(remote); // Load logic triggers here
            } else {
                // Whitelist, ReplaceList, CompanyList: sort and unique
                const lines = (remote.includes(',') && !remote.includes('\n')) ? remote.split(',').map(s=>s.trim()) : remote.split('\n').map(s=>s.trim());
                displayContent = Array.from(new Set(lines)).filter(s=>s!=="").sort((a,b)=>a.localeCompare(b,'ja')).join('\n');
                
                if(elementId === 'whitelist') masterWhitelist = displayContent.split('\n');
                if(elementId === 'companyList') masterCompanyList = displayContent.split('\n');
            }

            if (textArea.value.trim() !== "" && textArea.value.trim() !== displayContent.trim()) {
                if (confirm("GitHubに保存（上書き）しますか？")) {
                    let finalToSave = textArea.value;
                    if (elementId === 'presetsJson') finalToSave = textToJson(textArea.value); // Use safe merge
                    
                    await fetch(url, { method: "PUT", headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ message: `Update ${fileName}`, content: btoa(unescape(encodeURIComponent(finalToSave))), sha: data.sha }) });
                    alert("保存完了"); displayContent = textArea.value; 
                    // Re-load to ensure memory sync
                    if (elementId === 'presetsJson') jsonToText(finalToSave);
                }
            }
            textArea.value = displayContent; lastSynced[elementId] = displayContent; checkUnsaved(elementId); alert("同期完了");
            if(elementId !== 'presetsJson') checkConflicts();
        } else if(res.status === 404) {
             // Handle new file case (Company List might not exist yet)
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

function processText() {
    let text = document.getElementById('input').value;
    const isCompare = document.getElementById('compareMode').checked;
    const activeStyle = document.getElementById('activeStyle').value;
    const config = {}; OPT_KEYS.forEach(id => config[id] = document.getElementById(id).value);

    text = text.replace(/\r\n/g, '\n').replace(/[\t\u00A0]/g, ' ').replace(/[ 　]+\n/g, '\n');
    let hasStartSpace = text.startsWith('　');
    if (hasStartSpace) text = '___S_Z_SP___' + text.slice(1);

    const protectedItems = [];
    text = text.replace(/https?:\/\/[\w!\?\/+\-_~=;\.,\*&@#\$%\(\)'\[\]]+/g, (m) => { const p = `___P_URL_${protectedItems.length}___`; protectedItems.push({p, val: m}); return p; });
    text = text.replace(/\d{1,2}:\d{2}/g, (m) => { const p = `___P_TIME_${protectedItems.length}___`; protectedItems.push({p, val: m}); return p; });
    text = text.replace(/(^|\n)\s*　/g, (m, p1) => p1 + '___P_ZPARA___');
    text = text.replace(/\n\n+/g, '___P_DPARA___');

    // Combine Whitelist(Shield 1) and CompanyList(Shield 2)
    const whitelistRaw = document.getElementById('whitelist').value.split('\n');
    const companyRaw = document.getElementById('companyList').value.split('\n');
    const combinedShield = [...whitelistRaw, ...companyRaw].map(s => s.trim()).filter(s => s !== "");

    combinedShield.forEach((word, i) => {
        const noSpaceWord = word.replace(/\s+/g, '');
        const spacedRegex = new RegExp(noSpaceWord.split('').join('[\\s\\n]*'), 'gi');
        text = text.replace(spacedRegex, (match) => {
            if (match.includes('___P_')) return match;
            const hasNewline = match.includes('\n');
            let resultWord = (match.replace(/[\s\n]+/g, '').toLowerCase() === noSpaceWord.toLowerCase() && hasNewline) ? word : (match === word ? word : (isCompare ? `${match}【>${word}】` : word));
            const p = `___P_WL_${i}_${Math.random().toString(36).slice(-2)}___`;
            protectedItems.push({p, val: resultWord}); return p;
        });
    });

    text = text.replace(/\n/g, '');
    let prev; do { prev = text; text = text.replace(/([a-zA-Z0-9.]) +([a-zA-Z0-9.])/g, (m, p1, p2) => (p1.length === 1 || p2.length === 1) ? p1 + p2 : p1 + " " + p2); } while (prev !== text);
    text = text.replace(/([^\x00-\x7F]) +/g, '$1').replace(/ +([^\x00-\x7F])/g, '$1').replace(/([、。，]) +/g, '$1');

    let allRules = [];
    document.getElementById('replaceList').value.split('\n').forEach(line => {
        const parts = line.split('>'); if (parts.length === 2) parts[0].split(',').forEach(c => allRules.push({ from: c.trim(), to: parts[1].trim() }));
    });
    
    // Style Rules Application
    if (activeStyle !== 'none' && loadedPresetsData[activeStyle]) {
        try {
            // Support both v1 and v2 structure
            const styleObj = loadedPresetsData[activeStyle];
            const rules = styleObj.rules ? styleObj.rules : styleObj; // Fallback for pure dict
            
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
    allRules.forEach((rule, idx) => {
        if (!rule.from) return;
        const regex = new RegExp(`[台豪米独仏日英韓中]*${rule.from.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'g');
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
