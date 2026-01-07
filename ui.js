// ui.js
import { OPT_KEYS, DEFAULT_USER, DEFAULT_REPO } from './config.js';
import * as Storage from './storage.js';
import * as Logic from './logic.js';

// Global State
let lastSynced = {}; 
let masterWhitelist = []; 
let masterCompanyList = []; 
let loadedPresetsData = {}; 
let currentSuggestions = [];
let currentEditId = null; 

// Initializer
window.onload = function() {
    const settings = Storage.loadSettingsFromLocal();
    document.getElementById('githubToken').value = settings.token;
    
    const userEl = document.getElementById('githubUser');
    const repoEl = document.getElementById('githubRepo');
    if (userEl) { userEl.value = DEFAULT_USER; userEl.readOnly = true; }
    if (repoEl) { repoEl.value = DEFAULT_REPO; repoEl.readOnly = true; }

    Storage.loadOptionsFromLocal();
    OPT_KEYS.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', saveSettings);
    });
    
    // Auto-save and Auto-check Repo Status
    document.getElementById('githubToken').addEventListener('input', () => {
        saveSettings();
        checkRepoStatus();
    });
    
    document.getElementById('modeBtn').addEventListener('click', toggleDarkMode);
    if(settings.theme === 'dark') toggleDarkMode();

        document.getElementById('clearBtn').addEventListener('click', () => {
        if (confirm("消去しますか？")) {
            document.getElementById('input').value = "";
            document.getElementById('output').innerText = "";
            document.getElementById('charCount').innerText = "文字数: 0";
        }
    });
    
    document.getElementById('presetsJson').addEventListener('input', refreshPresetsFromUI);
    document.getElementById('input').addEventListener('input', () => {}); 
    
    bindGlobals();

    updateStyleSelect();
    applyStyle(document.getElementById('activeStyle').value);
    
    // Initial check for repo status
    checkRepoStatus();
};

function saveSettings() {
    Storage.saveSettingsToLocal(
        document.getElementById('githubToken').value,
        document.getElementById('githubUser').value,
        document.getElementById('githubRepo').value
    );
}

// --- New Function: Repo Safety Check ---
async function checkRepoStatus() {
    const statusEl = document.getElementById('repoStatus');
    const token = document.getElementById('githubToken').value;
    const user = document.getElementById('githubUser').value;
    const repo = document.getElementById('githubRepo').value;

    if (!token) {
        statusEl.style.display = 'none';
        return;
    }

    try {
        // Fetch Repo Info
        const res = await fetch(`https://api.github.com/repos/${user}/${repo}`, {
            headers: { "Authorization": `token ${token}` },
            cache: "no-store"
        });

        if (res.ok) {
            const data = await res.json();
            statusEl.style.display = 'block';

            if (data.private) {
                // Private (Safe)
                statusEl.style.backgroundColor = '#d4edda';
                statusEl.style.color = '#155724';
                statusEl.style.border = '1px solid #c3e6cb';
                statusEl.innerHTML = `<strong>🔒 接続済み（非公開・安全）：</strong><br>このリポジトリは Private 設定です。外部からは閲覧できません。`;
            } else {
                // Public (Warning)
                statusEl.style.backgroundColor = '#fff3cd';
                statusEl.style.color = '#856404';
                statusEl.style.border = '1px solid #ffeeba';
                statusEl.innerHTML = `
                    <strong>⚠️ 注意：</strong><br>
                    現在、保存先のリポジトリは<strong>「公開（Public）」</strong>設定です。<br>
                    同期した<strong>各種リスト（辞書・スタイルなど）</strong>は、インターネット上で誰でも閲覧可能になります。<br>
                    社外秘の情報（未発表の製品名など）は登録しないようご注意ください。
                `;
            }
        } else {
            // Error (e.g. 401 Unauthorized or Network Error)
            statusEl.style.display = 'none';
        }
    } catch (e) {
        console.error(e);
        statusEl.style.display = 'none';
    }
}

function toggleDarkMode() {
    const body = document.body; body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('modeBtn').innerText = isDark ? '☀️ ライトモード' : '🌙 ダークモード';
}
    
// --- Exposed Functions for HTML onclick ---

window.copyToClipboard = function() {
    const text = document.getElementById('output').innerText;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => alert("コピー完了！"));
}

window.downloadTxt = function() {
    const text = document.getElementById('output').innerText; 
    if (!text) return; 
    const blob = new Blob([text], { type: 'text/plain' }); 
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = 'cleaned_text.txt'; 
    a.click();
}

window.onListInput = function(id) { 
    checkUnsaved(id); 
    if(id === 'whitelist') masterWhitelist = document.getElementById('whitelist').value.split('\n');
    if(id === 'companyList') masterCompanyList = document.getElementById('companyList').value.split('\n');
    checkConflicts();
}

window.openModal = function(id, title) {
    currentEditId = id;
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalTextarea').value = document.getElementById(id).value;
    document.getElementById('editorModal').style.display = 'block';
}

window.closeModal = function() {
    document.getElementById('editorModal').style.display = 'none';
    currentEditId = null;
}

window.saveModal = function() {
    if(currentEditId) {
        let val = document.getElementById('modalTextarea').value;
        if (currentEditId !== 'presetsJson') { val = Logic.formatListContent(val); }
        document.getElementById(currentEditId).value = val;
        window.onListInput(currentEditId);
        if(currentEditId === 'presetsJson') refreshPresetsFromUI();
    }
    window.closeModal();
}

window.updateCurrentStyle = function() {
    const name = document.getElementById('activeStyle').value;
    if (name === 'none' || !loadedPresetsData[name]) return;
    loadedPresetsData[name].options = {};
    OPT_KEYS.forEach(k => { const el = document.getElementById(k); if(el) loadedPresetsData[name].options[k] = el.value; });
    loadedPresetsData[name]._meta.updated = new Date().toISOString();
    document.getElementById('presetsJson').value = Logic.jsonToText(JSON.stringify(loadedPresetsData), null).text;
    lastSynced['presetsJson'] = null; checkUnsaved('presetsJson');
    alert(`スタイル "${name}" の設定を更新しました。`);
}

window.createNewStyle = function() {
    const name = document.getElementById('newStyleName').value.trim();
    if (!name) { alert("スタイル名を入力してください"); return; }
    if (loadedPresetsData[name]) { alert(`スタイル "${name}" は既に存在します。`); return; }
    const opts = {}; OPT_KEYS.forEach(k => { const el = document.getElementById(k); if(el) opts[k] = el.value; });
    loadedPresetsData[name] = { rules: {}, options: opts, _meta: { created: new Date().toISOString() } };
    const textArea = document.getElementById('presetsJson');
    
    // Append and refresh
    const currentJson = Logic.textToJson(textArea.value, loadedPresetsData);
    loadedPresetsData = JSON.parse(currentJson);
    // Add new one
    loadedPresetsData[name] = { rules: {}, options: opts, _meta: { created: new Date().toISOString() } };
    
    textArea.value = Logic.jsonToText(JSON.stringify(loadedPresetsData)).text;
    
    lastSynced['presetsJson'] = null; checkUnsaved('presetsJson');
    updateStyleSelect(); document.getElementById('activeStyle').value = name; applyStyle(name);
    alert(`新規スタイル "${name}" を作成しました。`);
}

// --- [修正] 重複排除機能を追加した抽出アシスト ---
window.suggestRules = function() { 
    const out = document.getElementById('output').innerText; 
    if(!out) { alert("まずは整形を実行してください。"); return; }
    
    // 既存リストから登録済みの「左辺キー」を抽出
    const currentListText = document.getElementById('replaceList').value;
    const existingKeys = new Set();
    currentListText.split('\n').forEach(line => {
        const parts = line.split('>');
        if (parts.length >= 1) {
            const keys = parts[0].split(',').map(s => s.trim());
            keys.forEach(k => { if(k) existingKeys.add(k); });
        }
    });

    const matches = out.match(/[ァ-ヶー]{3,}/g) || [];
    const rules = []; 
    const seen = new Set();

    Array.from(new Set(matches)).sort().forEach(word => {
        if (word.endsWith('ー')) {
            const base = word.slice(0, -1); 
            if (base.length < 3) return;
            const rule = `${word}, ${base} > ${base}`; 
            
            // 重複チェック: 今回の候補内で重複せず、かつ既存リストの左辺キーにも存在しない場合のみ追加
            if (!seen.has(rule) && !existingKeys.has(word)) { 
                rules.push(rule); 
                seen.add(rule); 
            }
        }
    });
    
    if (rules.length > 0) {
        currentSuggestions = rules; 
        const panel = document.getElementById('assistPanel'); 
        const listDiv = document.getElementById('assistList');
        listDiv.innerHTML = ""; 
        rules.forEach((r, i) => { 
            listDiv.innerHTML += `<div class="assist-item"><input type="checkbox" id="rule_${i}" checked> <label for="rule_${i}">${r}</label></div>`; 
        });
        panel.style.display = 'block';
    } else { 
        alert("新規の候補は見つかりませんでした。（すべて登録済み、または対象なし）"); 
    }
}

window.applySuggestions = function() {
    const area = document.getElementById('replaceList');
    currentSuggestions.forEach((rule, i) => { if (document.getElementById(`rule_${i}`).checked) area.value += (area.value ? '\n' : '') + rule; });
    document.getElementById('assistPanel').style.display = 'none'; checkUnsaved('replaceList');
}

window.applyStyle = applyStyle; 
window.syncList = syncList;
window.processText = processText;

// --- Helper Functions ---

function bindGlobals() {
    // Globals are bound via window assignment above
}

// --- [修正] ステータス更新と警告表示の制御 ---
function checkUnsaved(id) {
    const status = document.getElementById('status_' + id);
    const textArea = document.getElementById(id);
    // 警告メッセージ用の要素ID（例: warning_companyList）
    const warningId = 'warning_' + id;
    let warningEl = document.getElementById(warningId);

    // 警告要素がなければ動的に生成して挿入
    if (!warningEl) {
        warningEl = document.createElement('div');
        warningEl.id = warningId;
        warningEl.style.color = 'var(--accent-red)';
        warningEl.style.fontSize = '0.75rem';
        warningEl.style.marginTop = '5px';
        warningEl.style.display = 'none'; // 初期は非表示
        warningEl.innerText = "※編集中の内容はブラウザの再読み込みで消えます";
        // ボタンの直前、またはテキストエリアの直後など適切な場所に挿入
        // ここでは同期ボタンの親要素の先頭、あるいはボタンの前に追加する
        // リストボックス構造: label, textarea, (assist?), button.btn-sync
        // btn-syncを探してその前に挿入するのが無難
        const btnSync = textArea.parentElement.querySelector('.btn-sync');
        if (btnSync) {
            textArea.parentElement.insertBefore(warningEl, btnSync);
        }
    }

    if (lastSynced[id] === null) { 
        status.innerText = "⚠️ 未共有"; 
        status.className = "list-status status-unsaved";
        warningEl.style.display = 'block'; // 警告表示
        return; 
    }
    
    const current = document.getElementById(id).value.trim(); 
    const last = (lastSynced[id] || "").trim();
    
    if (last === "") { 
        status.innerText = "☁️ 未読込"; 
        status.className = "list-status status-init"; 
        warningEl.style.display = 'none'; // 警告非表示
    }
    else if (current !== last) { 
        status.innerText = "⚠️ 未共有"; 
        status.className = "list-status status-unsaved"; 
        warningEl.style.display = 'block'; // 警告表示
    }
    else { 
        status.innerText = "✅ 最新"; 
        status.className = "list-status status-sync"; 
        warningEl.style.display = 'none'; // 警告非表示
    }
}

function checkConflicts() { const alertBox = document.getElementById('conflictAlert'); if(alertBox) alertBox.style.display = 'none'; }

function refreshPresetsFromUI() {
    const jsonStr = Logic.textToJson(document.getElementById('presetsJson').value, loadedPresetsData);
    loadedPresetsData = JSON.parse(jsonStr);
    updateStyleSelect();
}

function updateStyleSelect() {
    const select = document.getElementById('activeStyle');
    const btnUpdate = document.getElementById('btnUpdateStyle');
    const currentVal = select.value;
    const data = loadedPresetsData;
    
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

window.filterList = function() {
    const query = document.getElementById('search_whitelist').value.toLowerCase();
    const textArea = document.getElementById('whitelist');
    if (query === "") { textArea.value = masterWhitelist.join('\n'); textArea.readOnly = false; textArea.style.opacity = "1"; }
    else { textArea.value = masterWhitelist.filter(line => line.toLowerCase().includes(query)).join('\n'); textArea.readOnly = true; textArea.style.opacity = "0.7"; }
}

// --- Main Process & Sync ---

// --- [修正] データ消失を防ぐ安全な同期フロー ---
async function syncList(fileName, elementId) {
    const token = document.getElementById('githubToken').value;
    const user = document.getElementById('githubUser').value;
    const repo = document.getElementById('githubRepo').value;
    const textArea = document.getElementById(elementId);
    
    // リスト名の取得（ダイアログ表示用）
    let listLabel = fileName; 
    const parentBox = textArea.closest('.list-box');
    if (parentBox) {
        const labelEl = parentBox.querySelector('label span');
        if (labelEl) listLabel = `【${labelEl.innerText}】`;
    }
    
    if(!token || !user || !repo) { alert("同期設定が必要です"); return; }
    
    if (elementId !== 'presetsJson') { textArea.value = Logic.formatListContent(textArea.value); }
    
    try {
        const res = await Storage.fetchFromGitHub(user, repo, fileName, token);
        if (res.ok) {
            const data = await res.json();
            let remoteJsonRaw = decodeURIComponent(escape(atob(data.content)));
            let displayContent = remoteJsonRaw;
            
            if (elementId === 'presetsJson') {
                const parsed = Logic.jsonToText(remoteJsonRaw);
                displayContent = parsed.text;
                // ※ここではまだ loadedPresetsData を更新しない
            } else {
                displayContent = Logic.formatListContent(remoteJsonRaw);
                // ※ここではまだ masterList を更新しない
            }
            
            // 競合チェック: ローカルに入力があり、かつリモートと異なる場合
            if (textArea.value.trim() !== "" && (textArea.value.trim() !== displayContent.trim() || lastSynced[elementId] === null)) {
                
                // 問1: 保存（Push）の確認
                if (confirm(`${listLabel} の編集内容を、サーバーへ保存しますか？\n※保存内容はチーム全員に共有・適用されます。\n\n[OK] 保存する (Push)\n[キャンセル] 保存しない`)) {
                    
                    let finalToSave = textArea.value; 
                    if (elementId === 'presetsJson') finalToSave = Logic.textToJson(textArea.value, loadedPresetsData);
                    
                    await Storage.saveToGitHub(user, repo, fileName, token, finalToSave, data.sha);
                    
                    alert("GitHubへの保存が完了しました。");
                    
                    // Push成功時はローカルの内容を正とする
                    displayContent = textArea.value; 
                    if (elementId === 'presetsJson') remoteJsonRaw = finalToSave;
                    
                } else {
                    // 問2: 読込（Pull）の確認
                    if (!confirm(`では、サーバーにある最新の ${listLabel} を読み込みますか？\n※現在入力されている内容は消えてしまいます。\n\n[OK] 読み込む (Pull)\n[キャンセル] 何もしない (編集継続)`)) {
                        return; // ここで中断（ローカル維持）
                    }
                    // OKなら下へ進み displayContent（リモート値）で上書き
                }
            }
            
            // 確定値の適用
            textArea.value = displayContent; 
            lastSynced[elementId] = displayContent; 
            
            // 内部データの更新
            if(elementId === 'whitelist') masterWhitelist = displayContent.split('\n');
            if(elementId === 'companyList') masterCompanyList = displayContent.split('\n');
            if (elementId === 'presetsJson') {
                loadedPresetsData = JSON.parse(remoteJsonRaw);
                updateStyleSelect();
            }
            
            checkUnsaved(elementId); 
            if(elementId !== 'presetsJson') checkConflicts();
            
        } else if(res.status === 404) {
             if(confirm(`ファイル ${fileName} が見つかりません。新規作成しますか？`)) {
                 let content = textArea.value; if (elementId === 'presetsJson') content = "{}";
                 await Storage.saveToGitHub(user, repo, fileName, token, content, null);
                 alert("ファイルを作成しました。"); lastSynced[elementId] = textArea.value; checkUnsaved(elementId);
             }
        } else if (res.status === 401) {
            alert("認証に失敗しました（401）。\nトークンが正しいか、有効期限が切れていないか確認してください。");
        } else {
            alert(`エラーが発生しました（${res.status}）。\n設定を確認してください。`);
        }
    } catch (e) { console.error(e); alert("同期エラー: " + e.message); }
}

function processText() {
    const inputVal = document.getElementById('input').value;
    const isCompare = document.getElementById('compareMode').checked;
    const activeStyle = document.getElementById('activeStyle').value;
    
    const config = {}; 
    OPT_KEYS.forEach(id => {
        const el = document.getElementById(id);
        if(el) config[id] = el.value;
    });

    const lists = {
        companyList: document.getElementById('companyList').value,
        whitelist: document.getElementById('whitelist').value,
        replaceList: document.getElementById('replaceList').value
    };

    const result = Logic.runProcessText(inputVal, isCompare, activeStyle, config, lists, loadedPresetsData);

    const outputEl = document.getElementById('output');
    if (isCompare && result.originalText === result.cleanText) {
        outputEl.innerText = result.cleanText; 
    } else {
        if (isCompare) outputEl.innerHTML = result.outputText.replace(/【>(.*?)】/g, '<span class="diff-tag">【&gt;$1】</span>');
        else outputEl.innerText = result.cleanText;
    }

    document.getElementById('charCount').innerText = `文字数: ${result.charCount} | 全角換算: ${result.zenCount}`;
}
