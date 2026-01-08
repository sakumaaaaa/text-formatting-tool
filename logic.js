// logic.js
import { OPT_KEYS } from './config.js';

export function formatListContent(text) {
    if (!text) return "";
    const lines = text.split('\n').map(s => s.trim()).filter(s => s !== "");
    const unique = Array.from(new Set(lines));
    unique.sort((a, b) => a.localeCompare(b, 'ja'));
    return unique.join('\n');
}

export function jsonToText(jsonStr, loadedPresetsData) {
    try {
        const obj = JSON.parse(jsonStr);
        let text = "";
        for (let style in obj) {
            text += `[${style}]\n`;
            const rules = obj[style].rules ? obj[style].rules : obj[style];
            if (typeof rules === 'object') {
                for (let from in rules) text += `${from} > ${rules[from]}\n`;
            }
            text += "\n";
        }
        return { text: text.trim(), data: obj };
    } catch(e) { console.error(e); return { text: jsonStr, data: null }; }
}

export function textToJson(text, currentData) {
    const lines = text.split('\n');
    const newRulesMap = {};
    let curStyle = null;
    lines.forEach(l => {
        l = l.trim(); if (!l) return;
        if (l.startsWith('[') && l.endsWith(']')) { curStyle = l.slice(1, -1); newRulesMap[curStyle] = {}; } 
        else if (curStyle && l.includes('>')) { const p = l.split('>').map(s => s.trim()); if (p.length === 2) newRulesMap[curStyle][p[0]] = p[1]; }
    });
    
    let finalObj = JSON.parse(JSON.stringify(currentData || {})); 
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

export function getFuzzyRegExp(cleanKey) {
    if (!cleanKey) return null;
    const chars = cleanKey.split('').map(c => c.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const pattern = chars.join('[\\s\\n]*');
    return new RegExp(pattern, 'gi');
}

export function generateSuggestions(outputText) {
    if(!outputText) return [];
    const matches = outputText.match(/[ァ-ヶー]{3,}/g) || [];
    const rules = []; const seen = new Set();
    Array.from(new Set(matches)).sort().forEach(word => {
        if (word.endsWith('ー')) {
            const base = word.slice(0, -1); if (base.length < 3) return;
            const rule = `${word}, ${base} > ${base}`; if (!seen.has(rule)) { rules.push(rule); seen.add(rule); }
        }
    });
    return rules;
}

// The Core Engine (Guardian Script Logic)
export function runProcessText(inputText, isCompare, activeStyle, config, lists, presetsData) {
    let text = inputText;
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

    // --- Phase 1: Ghost Buster (Strengthened) ---
    let prevText;
    do {
        prevText = text;
        // 英数字間のスペース除去
        text = text.replace(/([a-zA-Z0-9])[\s\n]+([a-zA-Z0-9])/g, '$1$2'); 
        // [修正] 数値・記号・全角数字間のスペース除去
        text = text.replace(/([0-9\.\%０-９．％])[\s\n]+([0-9\.\%０-９．％])/g, '$1$2');
        
        text = text.replace(/([^\x00-\x7F])[\s\n]+([a-zA-Z0-9])/g, '$1$2'); 
        text = text.replace(/([a-zA-Z0-9])[\s\n]+([^\x00-\x7F])/g, '$1$2'); 
    } while (text !== prevText);
    
    let virtualOriginalText = text;

    // --- Phase 2: Box 1 (Cleansing) ---
    if (activeStyle !== 'none' && lists.companyList) {
        const companyList = lists.companyList.split('\n').map(s=>s.trim()).filter(s=>s);
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
                    if (isCompare && match !== replacement) {
                        return `${match}【>${replacement}】`;
                    }
                    return replacement;
                });
            });
        });
    }

    // --- Phase 3: Box 2 (Absolute Protection) ---
    if (lists.whitelist) {
        const whitelist = lists.whitelist.split('\n').map(s=>s.trim()).filter(s=>s);
        whitelist.sort((a, b) => b.length - a.length);
        
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
    }

    text = text.replace(/\n/g, ''); 

    // --- Phase 4: Box 3 & 4 (Replacement) ---
    if (activeStyle !== 'none') {
        let allRules = [];
        if (lists.replaceList) {
            lists.replaceList.split('\n').forEach(line => {
                const parts = line.split('>'); if (parts.length === 2) parts[0].split(',').forEach(c => allRules.push({ from: c.trim(), to: parts[1].trim() }));
            });
        }
        
        if (presetsData && presetsData[activeStyle]) {
            try {
                const styleObj = presetsData[activeStyle];
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
                
                const val = isCompare ? `${match}【>${targetTo}】` : targetTo;
                const p = `___P_RV_${protectedItems.length}___`;
                protectedItems.push({p, val: val, isDiff: true});
                return p;
            });
        });
    } // End of Phase 4 (if activeStyle !== 'none')

    // --- Phase 5: Symbols & Formatting ---
    // [修正] スタイル「なし」の時は実行しない
    if (activeStyle !== 'none') {
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
    } // End of Phase 5

    // --- Restoration ---
    let finalOutputWithTags = text;
    finalOutputWithTags = finalOutputWithTags.split('___P_ZPARA___').join('\n\n　').split('___P_DPARA___').join('\n\n');
    for (let i = protectedItems.length - 1; i >= 0; i--) { 
        finalOutputWithTags = finalOutputWithTags.split(protectedItems[i].p).join(protectedItems[i].val); 
    }

    if (isCompare) {
        let prevOut;
        do {
            prevOut = finalOutputWithTags;
            finalOutputWithTags = finalOutputWithTags.replace(/([^【]+?)【>[^【]+?【>(.+?)】】/g, '$1【>$2】');
        } while (finalOutputWithTags !== prevOut);
    }

    // Virtual Original
    virtualOriginalText = virtualOriginalText.split('___P_ZPARA___').join('\n\n　').split('___P_DPARA___').join('\n\n');
    for (let i = protectedItems.length - 1; i >= 0; i--) { 
        if (virtualOriginalText.includes(protectedItems[i].p)) {
             virtualOriginalText = virtualOriginalText.split(protectedItems[i].p).join(protectedItems[i].val);
        }
    }
    
    let finalCleanText = finalOutputWithTags.replace(/.*?【>(.*?)】/g, "$1");

    // Formatting Clean up
    virtualOriginalText = virtualOriginalText.replace(/\n{3,}/g, '\n\n').trim();
    if (hasStartSpace) virtualOriginalText = '　' + virtualOriginalText.replace(/^___S_Z_SP___/, '');

    finalCleanText = finalCleanText.replace(/\n{3,}/g, '\n\n').trim();
    if (hasStartSpace) finalCleanText = '　' + finalCleanText.replace(/^___S_Z_SP___/, '');
    
    finalOutputWithTags = finalOutputWithTags.replace(/\n{3,}/g, '\n\n').trim();
    if (hasStartSpace) finalOutputWithTags = '　' + finalOutputWithTags.replace(/^___S_Z_SP___/, '');

    // Char Count
    let zenCount = 0; 
    for (let i = 0; i < finalCleanText.length; i++) {
        const c = finalCleanText.charCodeAt(i); 
        if ((c >= 0x0 && c < 0x81) || (c === 0xf8f0) || (c >= 0xff61 && c <= 0xff9f)) zenCount += 0.5; else zenCount += 1;
    }

    return {
        outputText: finalOutputWithTags,
        cleanText: finalCleanText,
        originalText: virtualOriginalText,
        charCount: finalCleanText.length,
        zenCount: Math.ceil(zenCount)
    };
}
