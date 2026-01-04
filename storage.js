import { OPT_KEYS } from './config.js';

export function saveSettingsToLocal(token, user, repo) {
    localStorage.setItem('gh_token', token);
    localStorage.setItem('gh_user', user);
    localStorage.setItem('gh_repo', repo);
    OPT_KEYS.forEach(id => {
        const el = document.getElementById(id);
        if(el) localStorage.setItem(id, el.value);
    });
}

export function loadSettingsFromLocal() {
    return {
        token: localStorage.getItem('gh_token') || '',
        theme: localStorage.getItem('theme') || 'light'
    };
}

export function loadOptionsFromLocal() {
    OPT_KEYS.forEach(id => {
        const val = localStorage.getItem(id); 
        if(val) {
            const el = document.getElementById(id);
            if(el) el.value = val;
        }
    });
}

// ▼▼▼ 修正箇所はこの関数です ▼▼▼
export async function fetchFromGitHub(user, repo, fileName, token) {
    const url = `https://api.github.com/repos/${user}/${repo}/contents/${fileName}`;
    
    // 修正前（エラー原因）: const headers = { "Authorization": `token ${token}`, "Cache-Control": "no-store" };
    // 修正後: ヘッダーにはトークンだけを入れる
    const headers = { "Authorization": `token ${token}` };
    
    // cache: "no-store" はヘッダーではなく、fetchのオプションとして渡すのが正解
    const res = await fetch(url, { headers, cache: "no-store" });
    return res;
}
// ▲▲▲ 修正ここまで ▲▲▲

export async function saveToGitHub(user, repo, fileName, token, content, sha = null) {
    const url = `https://api.github.com/repos/${user}/${repo}/contents/${fileName}`;
    const method = "PUT";
    const headers = { "Authorization": `token ${token}`, "Content-Type": "application/json" };
    
    // content must be base64 encoded
    const body = JSON.stringify({
        message: sha ? `Update ${fileName}` : `Create ${fileName}`,
        content: btoa(unescape(encodeURIComponent(content))),
        sha: sha
    });
    
    const res = await fetch(url, { method, headers, body });
    return res;
}
