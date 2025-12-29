const OPT_KEYS = ['opt_percent','opt_ampersand','opt_bracket','opt_colon','opt_comma','opt_quote','opt_mark','opt_dash','opt_hyphen','opt_slash','opt_equal', 'opt_mark_space'];
let lastSynced = {}; let masterWhitelist = []; let currentSuggestions = [];

window.onload = function() {
    document.getElementById('githubToken').value = localStorage.getItem('gh_token') || '';
    if(localStorage.getItem('gh_user')) document.getElementById('githubUser').value = localStorage.getItem('gh_user');
    if(localStorage.getItem('gh_repo')) document.getElementById('githubRepo').value = localStorage.getItem('gh_repo');
    OPT_KEYS.forEach(id => {
        const val = localStorage.getItem(id); if(val) document.getElementById(id).value = val;
        document.getElementById(id).addEventListener('change', saveSettings);
    });
    if(localStorage.getItem('theme') === 'dark') toggleDarkMode();
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

function onListInput() { checkUnsaved('whitelist'); masterWhitelist = document.getElementById('whitelist').value.split('\n'); }

function filterList() {
    const query = document.getElementById('search_whitelist').value.toLowerCase();
    const textArea = document.getElementById('whitelist');
    if (query === "") { textArea.value = masterWhitelist.join('\n'); textArea.readOnly = false; textArea.style.opacity = "1"; }
    else { textArea.value = masterWhitelist.filter(line => line.toLowerCase().includes(query)).join('\n'); textArea.readOnly = true; textArea.style.opacity = "0.7"; }
}

function jsonToText(jsonStr) {
    try {
        const obj = JSON.parse(jsonStr); let text = "";
        for (let style in obj) { text += `[${style}]\n`; for (let from in obj[style]) { text += `${from} > ${obj[style][from]}\n`; } text += "\n"; }
        return text.trim();
    } catch(e) { return jsonStr; }
}

function textToJson(text) {
    const lines = text.split('\n'); const obj = {}; let cur = null;
    lines.forEach(l => {
        l = l.trim(); if (!l) return;
        if (l.startsWith('[') && l.endsWith(']')) { cur = l.slice(1, -1); obj[cur] = {}; }
        else if (cur && l.includes('>')) { const p = l.split('>').map(s => s.trim()); if (p.length === 2) obj[cur][p[0]] = p[1]; }
    });
    return JSON.stringify(obj, null, 2);
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
    const url = `https://api.github.com/repos/${user}/${repo}/contents/${fileName}`;
    try {
        const res = await fetch(url, { headers: { "Authorization": `token ${token}` }, cache: "no-store" });
        if (res.ok) {
            const data = await res.json();
            let remote = decodeURIComponent(escape(atob(data.content)));
            let displayContent = remote;
            if (elementId === 'presetsJson') displayContent = jsonToText(remote);
            if (elementId === 'whitelist' || elementId === 'replaceList') {
                const lines = (remote.includes(',') && !remote.includes('\n')) ? remote.split(',').map(s=>s.trim()) : remote.split('\n').map(s=>s.trim());
                displayContent = Array.from(new Set(lines)).filter(s=>s!=="").sort((a,b)=>a.localeCompare(b,'ja')).join('\n');
                if(elementId === 'whitelist') masterWhitelist = displayContent.split('\n');
            }
            if (textArea.value.trim() !== "" && textArea.value.trim() !== displayContent.trim()) {
                if (confirm("GitHubに保存（上書き）しますか？")) {
                    let finalToSave = textArea.value;
                    if (elementId === 'presetsJson') finalToSave = textToJson(textArea.value);
                    await fetch(url, { method: "PUT", headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ message: `Update ${fileName}`, content: btoa(unescape(encodeURIComponent(finalToSave))), sha: data.sha }) });
                    alert("保存完了"); displayContent = textArea.value;
                }
            }
            textArea.value = displayContent; lastSynced[elementId] = displayContent; checkUnsaved(elementId); alert("同期完了");
        }
    } catch (e) { alert("同期エラー"); }
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

    const whitelist = document.getElementById('whitelist').value.split('\n').map(s => s.trim()).filter(s => s !== "");
    whitelist.forEach((word, i) => {
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
    if (activeStyle !== 'none') {
        try {
            const presets = JSON.parse(textToJson(document.getElementById('presetsJson').value));
            const styleData = presets[activeStyle] || {};
            for (let key in styleData) key.split(',').forEach(c => { allRules = allRules.filter(r => r.from !== c.trim()); allRules.push({ from: c.trim(), to: styleData[key] }); });
        } catch(e) {}
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
