'use strict';
/* ================= 工具 ================= */
const LS_KEY = 'budgetDash.v3';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'x' + Math.random().toString(36).slice(2, 9);
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);

function parseMoney(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v);
  let s = String(v).trim().replace(/[¥￥$,，\s]/g, '');
  if (!s) return null;
  let mul = 1;
  if (/[万wW]$/.test(s)) { mul = 10000; s = s.slice(0, -1); }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * mul) : null;
}
function fmtCny(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v), sign = n < 0 ? '-' : '', a = Math.abs(n);
  if (a >= 10000) { let t = (a / 10000).toFixed(2); if (t.indexOf('.') >= 0) t = t.replace(/0+$/, '').replace(/\.$/, ''); return sign + '¥' + t + '万'; }
  return sign + '¥' + a.toLocaleString('zh-CN');
}
const fmtUsd = v => (v == null || Number.isNaN(v)) ? '—' : '$' + Number(v).toLocaleString('en-US');
const fmtPct = v => (v == null || !Number.isFinite(v)) ? '—' : (v * 100).toFixed(1) + '%';
function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00');
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400000);
}
function normalizeDate(s) {
  const t = String(s || '').trim().replace(/[\/\.年月]/g, '-').replace(/日/g, '');
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  const m2 = t.match(/^(\d{4})-(\d{1,2})$/);
  if (m2) return m2[1] + '-' + m2[2].padStart(2, '0') + '-01';
  const m3 = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);   // m/d/yyyy 或 d/m/yyyy
  if (m3) { let a = +m3[1], b = +m3[2]; if (a > 12 && b <= 12) { const x = a; a = b; b = x; } return m3[3] + '-' + String(a).padStart(2, '0') + '-' + String(b).padStart(2, '0'); }
  const m4 = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})T/);
  if (m4) return m4[1] + '-' + m4[2].padStart(2, '0') + '-' + m4[3].padStart(2, '0');
  return null;
}
const MONTH_RE = /^(1[0-2]|[1-9])月(执行|预测)$/;
// 工作日推算引擎：
// ① 精确层：已发布官方放假安排的年份用 HOLIDAYS 精确表（含调休）；
// ② 推算层（任意年份自动）：固定节日(元旦/劳动/国庆) + 清明节气公式 + 春节/端午/中秋农历日期表(至2035)，
//    扣除落在周中的假日；国务院每年人为拼调休无法预知（约2~4天/年误差），预测用途可忽略。
const HOLIDAYS = {
  2026: {
    off: ['01-01','01-02','01-03','02-15','02-16','02-17','02-18','02-19','02-20','02-21','02-22','02-23','04-04','04-05','04-06','05-01','05-02','05-03','05-04','05-05','06-19','06-20','06-21','09-25','09-26','09-27','10-01','10-02','10-03','10-04','10-05','10-06','10-07'],
    work: ['01-04','02-14','02-28','05-09','09-20','10-10']
  }
};
// 春节(正月初一)/端午(五月初五)/中秋(八月十五) 公历日期表（个别农历日或有±1天，误差可忽略）
const LUNAR_FEST = {
  2026: { cny: '02-17', dw: '06-19', mq: '09-25' },
  2027: { cny: '02-06', dw: '06-09', mq: '09-15' },
  2028: { cny: '01-26', dw: '05-28', mq: '10-03' },
  2029: { cny: '02-13', dw: '06-16', mq: '09-22' },
  2030: { cny: '02-03', dw: '06-05', mq: '09-12' },
  2031: { cny: '01-23', dw: '06-25', mq: '10-01' },
  2032: { cny: '02-11', dw: '06-12', mq: '09-19' },
  2033: { cny: '01-31', dw: '06-02', mq: '09-08' },
  2034: { cny: '02-19', dw: '06-22', mq: '09-27' },
  2035: { cny: '02-08', dw: '06-11', mq: '09-16' }
};
function qingmingOf(Y) {  // 清明节气公式（2000-2099 有效）
  const c = Y % 100;
  return '04-' + String(Math.floor(c * 0.2422 + 4.81) - Math.floor(c / 4)).padStart(2, '0');
}
function estHolidaySet(Y) {
  const off = new Set(['01-01', '05-01', '05-02', '10-01', '10-02', '10-03', qingmingOf(Y)]);
  const f = LUNAR_FEST[Y];
  if (f) {
    off.add(f.dw); off.add(f.mq);
    const cny = new Date(Y + '-' + f.cny + 'T00:00:00');
    for (let i = -1; i <= 5; i++) {   // 春节窗口：除夕 ~ 初五
      const d = new Date(cny.getTime() + i * 86400000);
      off.add(String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    }
  }
  return off;
}
function parseMonthHeader(h) {
  const s = String(h || '').replace(/\s/g, '');
  const m = s.match(/^(?:\d{4}年)?(1[0-2]|[1-9])月/);   // 必须以（年份+）N月 开头，避免误匹配"截至11月累计执行"
  if (!m) return null;
  if (s.indexOf('预测') >= 0) return { month: +m[1], fc: true };
  if (s.indexOf('执行') >= 0) return { month: +m[1], fc: false };
  return null;
}

/* ================= 状态 ================= */
let state = null;
let charts = {};
let SHARE_MODE = false, SHARE_PKG = null;   // 分享只读模式（服务目录存在 data.json 时启用）
let fileHandle = null;                       // 数据文件句柄（File System Access，会话内记忆）
let recentHandle = null;                     // 上次用过的数据文件句柄（IndexedDB 持久记忆）
let dirHandle = null;                        // 数据集文件夹句柄（平台导出文件都放这里）

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('budgetDash', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(k, v) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbGet(k) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readonly'); const rq = tx.objectStore('kv').get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }

async function loadFromHandle(h, silent) {
  const f = await h.getFile();
  const obj = JSON.parse(await f.text());
  let data = obj;
  if (data && data.type === 'budget-dash-config') throw new Error('这是配置包，请用「恢复」导入');
  if (data && data.type === 'budget-dash-data') throw new Error('这是数据包，请用「恢复」导入');
  if (data && data.schemaVersion === 2) data = migrate(data);
  if (!data || data.schemaVersion !== 3 || !Array.isArray(data.plans)) throw new Error('不是看板数据文件');
  fileHandle = h; recentHandle = h;
  try { await idbSet('fh', h); } catch (e) { }
  state = data; saveSilent(); renderAll();
  if (!silent) alert('已载入 ' + (f.name || 'budget.json') + '（更新于 ' + new Date(f.lastModified).toLocaleString() + '）');
  const b = $('#quickLoadBtn'); if (b) b.style.display = 'none';
}
async function walkDir(dir, out, depth) {
  depth = depth || 0;
  if (depth > 3) return;
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'file') { if (/\.(xlsx|xls|csv)$/i.test(name)) out.push(await h.getFile()); }
    else if (h.kind === 'directory') await walkDir(h, out, depth + 1);
  }
}
function fileSnapDate(f) {
  try { const d = new Date(f.lastModified || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); } catch (e) { return todayStr(); }
}
async function setDatasetDir() {
  if (!window.showDirectoryPicker) { alert('当前浏览器不支持选择文件夹（请用 Chrome/Edge）'); return; }
  try { dirHandle = await window.showDirectoryPicker({ mode: 'read' }); }
  catch (e) { return; }
  try { await idbSet('dir', dirHandle); } catch (e) { }
  await scanDataset(true);
}
async function scanDataset(manual) {
  if (!dirHandle) { if (manual) alert('请先设置数据集文件夹'); return false; }
  let perm = 'granted';
  try { perm = await dirHandle.queryPermission({ mode: 'read' }); } catch (e) { }
  if (perm !== 'granted') {
    try { perm = await dirHandle.requestPermission({ mode: 'read' }); } catch (e) { }
    if (perm !== 'granted') { if (manual) alert('未授权读取该文件夹'); return false; }
  }
  const files = [];
  try { await walkDir(dirHandle, files); } catch (e) { if (manual) alert('读取文件夹失败：' + e.message); return false; }
  let known = {};
  try { known = JSON.parse(localStorage.getItem('budgetDash.dataset') || '{}'); } catch (e) { }
  const fresh = files.filter(f => { const sig = f.name + '|' + f.size + '|' + f.lastModified; return !known[sig]; });
  if (!fresh.length) { if (manual) alert('数据集文件夹里没有新文件（识别到的 ' + files.length + ' 个文件都已导入过）'); return false; }
  files.forEach(f => { known[f.name + '|' + f.size + '|' + f.lastModified] = 1; });
  localStorage.setItem('budgetDash.dataset', JSON.stringify(known));
  const summary = await importFilesAuto(fresh);
  alert('📁 数据集自动导入完成：\n\n' + summary + '\n\n快照日期按文件导出时间记录。');
  return true;
}
async function importFilesAuto(files) {
  const parts = [];
  const poAll = []; let asOf = 0;
  const execByDate = {};
  for (const f of files) {
    let rows;
    try { rows = await parseWorkbookFile(f); } catch (err) { parts.push('❌ ' + f.name + '：解析失败 ' + err.message); continue; }
    const kind = detectKind(rows);
    if (kind === 'po') {
      const r = parsePoRows(rows);
      asOf = Math.max(asOf, r.asOf);
      poAll.push(...r.rows);
      parts.push('📄 ' + f.name + '（PO明细）：' + r.rows.length + ' 行');
    } else if (kind === 'exec') {
      const d = fileSnapDate(f);
      mergeExecRows(execByDate[d] = execByDate[d] || {}, parseExecRows(rows));
      parts.push('📄 ' + f.name + '（执行表）→ 快照 ' + d);
    } else if (kind === 'team') {
      const sheets = await parseAllSheets(f);
      let persons = parseTeamSheets(sheets).groups;
      if (!persons.length) persons = parseTeamTable(rows);
      if (!persons.length) throw new Error('未识别到人员（需要 PO/OD 页签+姓名/单价列，或 类型/人数/单价 列）');
      state.team = persons.map(g => ({ id: uid(), ...g }));
      touch('team');
      const pN = sum(persons, g => g.headcount || 0);
      parts.push('👥 ' + f.name + '（团队配置）：' + pN + ' 人 / ' + persons.length + ' 组已更新（以数据集为准）');
    } else parts.push('⚠️ ' + f.name + '：未能识别类型，已跳过');
  }
  if (poAll.length) { state.poDataByYear = state.poDataByYear || {}; state.poDataByYear[curYear()] = { updatedAt: todayStr(), asOf, rows: poAll }; touch('po'); }
  Object.entries(execByDate).forEach(([date, rows]) => {
    const ex = state.execSnaps.find(s => s.date === date);
    if (ex) ex.rows = rows; else state.execSnaps.push({ date, rows });
  });
  if (Object.keys(execByDate).length) { state.execSnaps.sort((a, b) => a.date < b.date ? -1 : 1); touch('exec'); }
  save();
  return parts.join('\n');
}
async function openDataFile() {
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker({ types: [{ description: '预算看板数据（JSON）', accept: { 'application/json': ['.json'] } }] });
      try { await loadFromHandle(h); } catch (e) { alert('载入失败：' + e.message); }
      return;
    } catch (e) { if (e && e.name === 'AbortError') return; /* 回退到 input */ }
  }
  const inp = $('#importFile'); if (inp) inp.click();
}

function defaultYearParams() {
  return { fxRate: 7.03, execRateTarget: 0.95, bonusMonths: 3.5, attendFactor: 1, workdays: {}, lastHcCheck: '', excluded: [] };
}
function defaultState() {
  const y = new Date().getFullYear();
  return {
    schemaVersion: 3,
    meta: { year: y, updateFreqDays: 14 },
    years: { [y]: defaultYearParams() },
    plans: [],          // {id, year, code, name, amountUsd, note}  code 可空，平台授予后关联
    grantLogs: [],      // {date, code, amountCny, note}      授予流水（辅助，按日期自然分年）
    team: [],           // {id, kind:'po'|'od', name, headcount, rate, project}  团队配置（跨年沿用）
    execSnaps: [],      // {date, rows: ...}                   执行表快照（按日期自然分年）
    poDataByYear: {},   // {2026: {updatedAt, asOf, rows:[...]}}
    updatedAt: {}
  };
}
function migrate(old) {
  // v2 → v3：单卷拆按年分卷；迁移前自动留备份键，杜绝升级丢数据
  if (old && old.schemaVersion === 2) {
    try { localStorage.setItem('budgetDash.backup.v2', JSON.stringify(old)); } catch (e) { }
    const y = (old.meta && old.meta.year) || new Date().getFullYear();
    return {
      schemaVersion: 3,
      meta: { year: y, updateFreqDays: (old.meta && old.meta.updateFreqDays) || 14 },
      years: { [y]: { fxRate: (old.meta && old.meta.fxRate) || 7.03, execRateTarget: (old.meta && old.meta.execRateTarget) || 0.95, bonusMonths: (old.meta && old.meta.bonusMonths) || 3.5, attendFactor: (old.meta && old.meta.attendFactor) != null ? old.meta.attendFactor : 1, workdays: (old.meta && old.meta.workdays) || {}, lastHcCheck: (old.meta && old.meta.lastHcCheck) || '' } },
      plans: (old.plans || []).map(p => ({ ...p, year: y })),
      grantLogs: old.grantLogs || [],
      team: old.team || [],
      execSnaps: old.execSnaps || [],
      poDataByYear: old.poData ? { [y]: old.poData } : {},
      updatedAt: old.updatedAt || {}
    };
  }
  return null;
}
function load() {
  const autobak = obj => {   // 迁移/归一化前自动备份原始数据（防升级毁数据，可手动恢复）
    try { localStorage.setItem('budgetDash.autobak', JSON.stringify({ t: todayStr() + ' ' + new Date().toTimeString().slice(0, 5), data: obj })); } catch (e) { }
  };
  const normalizePlans = st => {
    const needs = (st.plans || []).some(p => p.amountW == null && p.amountUsd != null);
    if (needs) autobak(st);
    (st.plans || []).forEach(p => { if (p.amountW == null) { p.amountW = wusdOf(p); delete p.amountUsd; } });
    if (needs) saveSilent();
  };
  // 存量团队数据归组：同类型+同单价的多行（历史按人存的）合并为一组
  const normalizeTeam = st => {
    const t = st.team || [];
    const key = g => g.kind + '|' + g.rate;
    const map = new Map();
    t.forEach(g => {
      const k = key(g);
      if (!map.has(k)) map.set(k, { kind: g.kind, rate: g.rate, headcount: 0, names: [] });
      const m = map.get(k);
      m.headcount += g.headcount || 1;
      m.names.push(g.name || '');
    });
    const merged = Array.from(map.values());
    if (merged.length < t.length) {   // 有可合并的：备份后重写并落盘
      autobak(st);
      st.team = merged.map(m => ({ id: uid(), kind: m.kind, rate: m.rate, headcount: m.headcount, project: '', name: teamGroupName(m.kind, m.rate) }));   // 按人存的旧数据：统一按单价命名
      saveSilent();
    }
  };
  if (SHARE_MODE) {           // 分享模式：只读快照，不读写本机存储
    state = SHARE_PKG.state;
    if (state && state.schemaVersion === 2) { const m = migrate(state); if (m) state = m; }
    if (!state || state.schemaVersion !== 3) state = defaultState();
    normalizePlans(state);
    normalizeTeam(state);
    return;
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      let obj = JSON.parse(raw);
      while (obj && obj.schemaVersion < 3) { const m = migrate(obj); if (!m) { obj = null; break; } obj = m; }
      state = obj && obj.schemaVersion === 3 ? obj : defaultState();
      if (state && state.plans) normalizePlans(state);
      if (state && state.team) normalizeTeam(state);
    } else {
      // v2 旧键自动升级接管
      const old2 = localStorage.getItem('budgetDash.v2');
      if (old2) { let obj = JSON.parse(old2); const m = migrate(obj); state = m || defaultState(); if (m) saveSilent(); }
      else state = defaultState();
    }
  } catch (e) { state = defaultState(); }
}
function saveSilent() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function save() { if (SHARE_MODE) { renderAll(); return; } localStorage.setItem(LS_KEY, JSON.stringify(state)); try { localStorage.setItem('budgetDash.savedAt', String(Date.now())); } catch (e) { } renderAll(); }
function touch(key) { (state.updatedAt = state.updatedAt || {})[key] = todayStr(); }

/* ================= 文件解析 ================= */
function csvToRows(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [[]]; let cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { rows[rows.length - 1].push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; rows[rows.length - 1].push(cur); cur = ''; rows.push([]); }
    else cur += ch;
  }
  rows[rows.length - 1].push(cur);
  return rows.filter(r => r.some(c => c.trim() !== '')).map(r => r.map(c => c.trim()));
}
async function parseWorkbookFile(file) {
  let rows;
  if (/\.csv$/i.test(file.name)) rows = csvToRows(await file.text());
  else {
    if (typeof XLSX === 'undefined') throw new Error('解析库未加载');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('无工作表');
    // 修复 dimension 声明不完整（Excel 容忍但解析库按声明范围截断）：按实际单元格扩展范围
    try {
      const rg = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      let maxR = 0, maxC = 0;
      Object.keys(ws).forEach(k => {
        if (k[0] === '!') return;
        const a = XLSX.utils.decode_cell(k);
        if (a.r > maxR) maxR = a.r;
        if (a.c > maxC) maxC = a.c;
      });
      if (maxR > rg.e.r || maxC > rg.e.c) {
        rg.e.r = Math.max(rg.e.r, maxR);
        rg.e.c = Math.max(rg.e.c, maxC);
        ws['!ref'] = XLSX.utils.encode_range(rg);
      }
    } catch (e) { }
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).map(r => r.map(c => String(c == null ? '' : c).trim()));
  }
  return rows.filter(r => r.some(c => c !== ''));
}
function detectKind(rows) {
  const h = (rows[0] || []).join(' ');
  if (/预算来源编码/.test(h)) return 'exec';
  if (/PO编码|资源申请编号/.test(h)) return 'po';
  if ((/姓名|名字|人员/.test(h) && /单价|价格|费用/.test(h)) || (/人数|数量/.test(h) && /单价|价格|费用/.test(h))) return 'team';
  return '';
}
async function parseAllSheets(file) {
  if (/\.csv$/i.test(file.name)) return [{ name: '', rows: csvToRows(await file.text()) }];
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const out = [];
  wb.SheetNames.forEach(sn => {
    const ws = wb.Sheets[sn];
    if (!ws) return;
    try {   // dimension 声明不完整修复（同 parseWorkbookFile）
      const rg = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      let maxR = 0, maxC = 0;
      Object.keys(ws).forEach(k => { if (k[0] !== '!') { const a = XLSX.utils.decode_cell(k); if (a.r > maxR) maxR = a.r; if (a.c > maxC) maxC = a.c; } });
      if (maxR > rg.e.r || maxC > rg.e.c) { rg.e.r = Math.max(rg.e.r, maxR); rg.e.c = Math.max(rg.e.c, maxC); ws['!ref'] = XLSX.utils.encode_range(rg); }
    } catch (e) { }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).map(r => r.map(c => String(c == null ? '' : c).trim())).filter(r => r.some(c => c !== ''));
    out.push({ name: sn, rows });
  });
  return out;
}
function teamGroupName(kind, rate) { return (kind === 'po' ? '日单价' : '月单价') + fmtCny(rate); }
// 页签式团队表：页签名含 PO/OD 区分渠道，每行一人，只取 姓名+单价(+可选职级) 列，其余列忽略
// 展示时同单价自动归组（有职级列用职级做组名，否则按单价命名），明细留在用户 Excel 里
function parseTeamSheets(sheets) {
  const persons = [], notes = [];
  sheets.forEach(sh => {
    const sn = String(sh.name || '');
    let kind = /od/i.test(sn) ? 'od' : (/po/i.test(sn) ? 'po' : null);
    const header = sh.rows[0] || [];
    const nameCol = header.findIndex(h => /姓名|名字|人员|名称|角色/.test(h));
    const priceCol = header.findIndex(h => /单价|价格|日费|月费|费用|成本/.test(h));
    const levelCol = header.findIndex(h => /职级|级别|等级/.test(h));
    if (nameCol < 0 || priceCol < 0) { if (sn) notes.push('页签「' + sn + '」未找到姓名/单价列，跳过'); return; }
    if (!kind) { const ph = String(header[priceCol] || ''); kind = /月/.test(ph) ? 'od' : /日/.test(ph) ? 'po' : null; }
    if (!kind) { notes.push('页签「' + sn + '」无法判断 PO/OD（页签名或单价列名需含 PO/OD/日/月）'); return; }
    sh.rows.slice(1).forEach(r => {
      const nm = String(r[nameCol] || '').trim();
      const price = parseMoney(r[priceCol]);
      if (nm && price != null && price > 0) persons.push({ kind, rate: price, level: levelCol >= 0 ? String(r[levelCol] || '').trim() : '' });
    });
  });
  const map = new Map();
  persons.forEach(pr => {
    const key = pr.kind + '|' + pr.rate + '|' + pr.level;
    if (!map.has(key)) map.set(key, { kind: pr.kind, rate: pr.rate, level: pr.level, headcount: 0 });
    map.get(key).headcount++;
  });
  const groups = Array.from(map.values()).map(g => ({
    kind: g.kind, headcount: g.headcount, rate: g.rate, project: '',
    name: g.level || teamGroupName(g.kind, g.rate)
  }));
  return { persons, groups, notes };
}

/* ---- PO 明细解析（固定表头 + 动态月列） ---- */
function parsePoRows(rows) {
  const header = rows[0];
  const col = {};
  header.forEach((h, i) => {
    if (/资源申请编号/.test(h)) col.resNo = i;
    else if (/资源申请名称/.test(h)) col.resName = i;
    else if (/^PO编码$|PO编号/.test(h)) col.poNo = i;
    else if (/PO状态/.test(h)) col.status = i;
    else if (/费用起始/.test(h)) col.startDate = i;
    else if (/费用结束/.test(h)) col.endDate = i;
    else if (/^PO金额/.test(h)) col.amount = i;
    else if (/IT项目名称/.test(h)) col.itProject = i;
    else if (/^项目编码$/.test(h)) col.budgetCode = i;
    else if (/^项目名称$/.test(h)) col.budgetName = i;
    else {
      const mh = parseMonthHeader(h);
      if (mh) { (col.months = col.months || {})[mh.month] = i; if (mh.fc) (col.fcMonths = col.fcMonths || []).push(mh.month); }
    }
  });
  if (col.poNo == null && col.resNo == null) throw new Error('未找到 PO 编号列');
  const asOf = col.fcMonths && col.fcMonths.length ? Math.min(...col.fcMonths) : 13;
  const out = [];
  // 平台导出的 PO 级列（编号/名称/状态/起止/金额/项目）常为纵向合并单元格：
  // 仅首行有值、后续行为空 → 向下填充；金额被填充的行打标记（按 PO 计金额而非按行累加）
  const FILL = ['resNo', 'resName', 'poNo', 'status', 'startDate', 'endDate', 'amount', 'itProject'];
  const last = {};
  rows.slice(1).forEach(r => {
    let amtFilled = false;
    FILL.forEach(k => {
      if (col[k] == null) return;
      const v = String(r[col[k]] == null ? '' : r[col[k]]).trim();
      if (v !== '') last[k] = v;
      else if (last[k] != null) { r[col[k]] = last[k]; if (k === 'amount') amtFilled = true; }
    });
    const poNo = (col.poNo != null ? r[col.poNo] : '') || (col.resNo != null ? r[col.resNo] : '');
    if (!poNo) return;
    const months = {};
    if (col.months) Object.entries(col.months).forEach(([m, i]) => { const v = parseMoney(r[i]); if (v != null) months[+m] = (months[+m] || 0) + v; });
    out.push({
      poNo, resName: col.resName != null ? String(r[col.resName] == null ? '' : r[col.resName]).trim() : '',
      status: /CLOSED|close|验收|结/.test(String(col.status != null ? r[col.status] : '')) ? 'CLOSED' : 'OPEN',
      startDate: normalizeDate(col.startDate != null ? r[col.startDate] : '') || '',
      amount: parseMoney(col.amount != null ? r[col.amount] : '') || 0,
      amtFilled,
      itProject: col.itProject != null ? String(r[col.itProject] == null ? '' : r[col.itProject]).trim() : '',
      budgetCode: col.budgetCode != null ? String(r[col.budgetCode]).trim() : '',
      months
    });
  });
  return { asOf, rows: out };
}

/* ---- 执行表解析（两级表头） ---- */
const SUB_MAP = [['以前年度', 'prior'], ['本年度', 'granted'], ['本店度', 'granted'], ['可用', 'avail'], ['执行', 'exec'], ['预测', 'fc'], ['剩余', 'remain']];
function parseExecRows(rows) {
  if (rows.length < 3) throw new Error('行数不足');
  const r1 = rows[0], r2 = rows[1];
  let codeCol = -1, nameCol = -1;
  r1.forEach((h, i) => { if (/预算来源编码/.test(h)) codeCol = i; else if (/预算来源名称/.test(h)) nameCol = i; });
  if (codeCol < 0) throw new Error('未找到「预算来源编码」列');
  const catMap = {};  // colIdx -> 'itw' | 'od'
  let curCat = null;
  r1.forEach((h, i) => {
    if (i === codeCol || i === nameCol) return;
    if (/自有人力/.test(h)) { curCat = 'skip'; return; }
    if (/IT外包/.test(h)) { curCat = 'itw'; return; }
    if (/OD/.test(h)) { curCat = 'od'; return; }
    if (curCat) catMap[i] = curCat;
  });
  // 处理一级表头为空的列（合并单元格延续上一类别）
  let lastCat = null;
  r1.forEach((h, i) => {
    if (i === codeCol || i === nameCol) return;
    if (h) { lastCat = /自有人力/.test(h) ? 'skip' : /IT外包/.test(h) ? 'itw' : /OD/.test(h) ? 'od' : lastCat; }
    if (catMap[i] === undefined) catMap[i] = lastCat;
  });
  const subMap = {};  // colIdx -> sub key
  r2.forEach((h, i) => {
    if (catMap[i] !== 'itw' && catMap[i] !== 'od') return;
    for (const [kw, key] of SUB_MAP) if (h && h.indexOf(kw) >= 0) { subMap[i] = key; break; }
  });
  const out = {};
  rows.slice(2).forEach(r => {
    const code = String(r[codeCol] || '').trim();
    if (!code || code === '-' || /合计/.test(String(nameCol >= 0 ? r[nameCol] : ''))) return;
    const name = nameCol >= 0 ? String(r[nameCol] || '') : '';
    const o = out[code] = out[code] || { name, itw: {}, od: {} };
    if (name && !o.name) o.name = name;
    Object.entries(subMap).forEach(([i, key]) => {
      const cat = catMap[i];
      const v = parseMoney(r[i]);
      if (v != null) o[cat][key] = (o[cat][key] || 0) + v;
    });
  });
  // 容错：avail/remain 缺失时补算
  Object.values(out).forEach(o => {
    ['itw', 'od'].forEach(cat => {
      const c = o[cat];
      if (c.avail == null && (c.prior != null || c.granted != null)) c.avail = (c.prior || 0) + (c.granted || 0);
      if (c.remain == null && c.avail != null) c.remain = c.avail - (c.exec || 0) - (cat === 'itw' ? (c.fc || 0) : 0);
    });
  });
  return out;
}
function mergeExecRows(target, add) {
  Object.entries(add).forEach(([code, o]) => {
    const t = target[code] = target[code] || { name: o.name, itw: {}, od: {} };
    if (o.name) t.name = o.name;
    ['itw', 'od'].forEach(cat => Object.entries(o[cat]).forEach(([k, v]) => { t[cat][k] = (t[cat][k] || 0) + v; }));
  });
}

/* ================= 导入会话 ================= */
let importCtx = null;
function importModal() {
  openModal('<h3>导入平台数据（4 个文件）</h3>' +
    '<div class="muted">把本月导出的 <b>PO明细 ×2 + 预算执行 ×2</b>（每个花钱项目各一份，.xlsx/.csv）<b>一次全选拖入</b>——也可以把 4 个文件放一个文件夹里<b>直接拖文件夹</b>。自动识别类型：执行表按快照日期合并成一个时间点；PO明细覆盖式刷新。按年全量导出，可放心重复导入。</div>' +
    '<div class="dropzone" id="dropZone">拖拽文件到此处，或 <button class="btn small" data-action="import:pick">选择文件</button>' +
    '<input type="file" id="fileInput" multiple accept=".xlsx,.xls,.csv" style="display:none"></div>' +
    '<div id="fileList"></div>' +
    '<div class="modal-actions"><button class="btn" data-action="modal:close">取消</button><button class="btn primary" data-action="import:all">导入全部</button></div>');
  importCtx = { files: [], snapDate: todayStr() };
  const dz = $('#dropZone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', async e => { e.preventDefault(); dz.classList.remove('over'); await handleDrop(e.dataTransfer); });
  $('#fileInput').addEventListener('change', async e => { await handleFiles(e.target.files); e.target.value = ''; });
  renderImportList();
}
function walkEntry(entry, out) {
  return new Promise(res => {
    if (!entry) return res();
    if (entry.isFile) entry.file(f => { if (/\.(xlsx|xls|csv)$/i.test(f.name)) out.push(f); res(); }, () => res());
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => reader.readEntries(async es => {
        if (!es.length) return res();
        await Promise.all(es.map(x2 => walkEntry(x2, out)));
        readBatch();
      }, () => res());
      readBatch();
    } else res();
  });
}
async function handleDrop(dt) {
  const files = [];
  const items = dt && dt.items ? Array.from(dt.items) : [];
  const entries = items.map(i => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (entries.length) { await Promise.all(entries.map(en => walkEntry(en, files))); }
  else if (dt && dt.files) { for (const f of dt.files) if (/\.(xlsx|xls|csv)$/i.test(f.name)) files.push(f); }
  if (files.length) await handleFiles(files);
}
async function handleFiles(list) {
  list = Array.from(list).filter(f => /\.(xlsx|xls|csv)$/i.test(f.name));
  for (const f of list) {
    try {
      const rows = await parseWorkbookFile(f);
      if (!rows.length) { importCtx.files.push({ name: f.name, error: '空文件' }); continue; }
      const rec = { name: f.name, kind: detectKind(rows), rows, file: f };
      if (rec.kind === 'team') { try { rec.sheets = await parseAllSheets(f); } catch (e) { } }
      importCtx.files.push(rec);
    } catch (err) {
      importCtx.files.push({ name: f.name, error: '解析失败：' + err.message + (/\.xls$/i.test(f.name) ? '（.xls 请先另存为 .xlsx）' : '') });
    }
  }
  renderImportList();
}
function renderImportList() {
  const el = $('#fileList');
  if (!importCtx || !importCtx.files.length) { el.innerHTML = '<div class="muted" style="text-align:center;padding:6px 0">尚未添加文件</div>'; return; }
  const hasExec = importCtx.files.some(f => f.kind === 'exec');
  el.innerHTML =
    (hasExec ? '<div class="file-head"><span class="muted">执行表快照日期：</span><input type="date" id="snapDate" value="' + esc(importCtx.snapDate) + '"></div>' : '') +
    importCtx.files.map((f, fi) =>
      '<div class="file-card"><div class="file-head"><b>' + esc(f.name) + '</b>' +
      (f.error ? '<span style="color:var(--red);font-size:12px">' + esc(f.error) + '</span>'
        : '<select data-fkind="' + fi + '">' +
        [['', '— 请选择类型 —'], ['po', 'PO 明细'], ['exec', '预算执行表'], ['team', '团队配置']].map(([v, l]) => '<option value="' + v + '"' + (f.kind === v ? ' selected' : '') + '>' + l + '</option>').join('') +
        '</select><span class="muted">' + (f.rows ? f.rows.length + ' 行（含表头）' : '') + '</span>') +
      '</div>' +
      (f.error ? '' : f.kind === 'po' ? poDiagnose(f) : f.kind === 'exec' ? execDiagnose(f) : f.kind === 'team' ? teamDiagnose(f) : '') +
      '</div>').join('');
}
function poDiagnose(f) {
  try {
    const { asOf, rows } = parsePoRows(f.rows);
    const rs = rows.slice(0, 5).map(r => {
      const mSum = sum(Object.entries(r.months), ([, v]) => v);
      const mTxt = Object.entries(r.months).map(([m, v]) => m + '月' + (v >= 10000 ? (v / 10000).toFixed(1) + 'w' : v)).join(' ');
      return '<tr><td>' + esc(r.poNo) + '</td><td>' + esc(r.budgetCode) + '</td><td>' + esc(r.startDate || '—') + '</td><td class="num">' + fmtCny(r.amount) + '</td><td>' + r.status + '</td><td class="num">' + fmtCny(mSum) + '</td><td class="muted">' + esc(mTxt || '无月度值') + '</td></tr>';
    }).join('');
    const dataRows = f.rows.length - 1;
    const skipped = dataRows - rows.length;
    return '<div class="muted" style="margin:6px 0 3px">🔍 解析诊断：识别为 <b>PO明细</b>，文件读取 <b>' + f.rows.length + '</b> 行（含表头）→ 有效解析 <b>' + rows.length + '</b> 行' + (skipped > 0 ? '，<span style="color:var(--amber)">跳过 ' + skipped + ' 行（PO编号列为空）</span>' : '') + '；执行/预测分界月 asOf=<b>' + asOf + '</b>（<' + asOf + '月=实际，≥' + asOf + '月=平台预测）</div>' +
      '<div class="paste-preview"><table><tr><th>PO编码</th><th>预算来源</th><th>费用起始</th><th>金额</th><th>状态</th><th>月度合计</th><th>各月读到的值</th></tr>' + rs + '</table></div>' +
      '<div class="muted">若与 Excel 对不上，截图此面板发给维护人。</div>';
  } catch (e) { return '<div class="cons-diff warn">🔍 解析失败：' + esc(e.message) + '</div>'; }
}
function teamDiagnose(f) {
  try {
    if (f.sheets && f.sheets.length) {
      const r2 = parseTeamSheets(f.sheets);
      const poN = sum(r2.groups.filter(x => x.kind === 'po'), g => g.headcount), odN = sum(r2.groups.filter(x => x.kind === 'od'), g => g.headcount);
      const rs = r2.groups.map(g => '<tr><td>' + esc(g.name) + '</td><td>' + (g.kind === 'po' ? 'PO·日单价' : 'OD·月单价') + '</td><td>' + g.headcount + '</td><td class="num">' + fmtCny(g.rate) + '</td></tr>').join('');
      return '<div class="muted" style="margin:6px 0 3px">🔍 解析诊断：识别为 <b>团队配置（页签式）</b>，PO ' + poN + ' 人 / OD ' + odN + ' 人，同单价自动归组为 ' + r2.groups.length + ' 组' + (r2.notes.length ? '；' + esc(r2.notes.join('；')) : '') + '（明细姓名不存看板，留在你的 Excel）</div>' +
        '<div class="paste-preview"><table><tr><th>组名</th><th>类型</th><th>人数</th><th>单价</th></tr>' + rs + '</table></div>';
    }
    const groups = parseTeamTable(f.rows);
    const rs = groups.slice(0, 6).map(g => '<tr><td>' + esc(g.name) + '</td><td>' + (g.kind === 'po' ? 'PO·日单价' : 'OD·月单价') + '</td><td>' + g.headcount + '</td><td class="num">' + fmtCny(g.rate) + '</td><td>' + esc(g.project || '—') + '</td></tr>').join('');
    return '<div class="muted" style="margin:6px 0 3px">🔍 解析诊断：识别为 <b>团队配置</b>，共 ' + groups.length + ' 组（导入后以数据集为准替换现有团队配置）</div>' +
      '<div class="paste-preview"><table><tr><th>名称</th><th>类型</th><th>人数</th><th>单价</th><th>项目</th></tr>' + rs + '</table></div>';
  } catch (e) { return '<div class="cons-diff warn">🔍 解析失败：' + esc(e.message) + '</div>'; }
}
function execDiagnose(f) {
  try {
    const rows = parseExecRows(f.rows);
    const rs = Object.entries(rows).slice(0, 6).map(([code, o]) =>
      '<tr><td>' + esc(code) + '</td><td>' + esc(o.name) + '</td><td class="num">' + fmtCny(o.itw.avail) + '</td><td class="num">' + fmtCny(o.itw.exec) + (o.itw.fc ? ' /预测' + fmtCny(o.itw.fc) : '') + '</td><td class="num">' + fmtCny(o.od.avail) + '</td><td class="num">' + fmtCny(o.od.exec) + '</td></tr>').join('');
    return '<div class="muted" style="margin:6px 0 3px">🔍 解析诊断：识别为 <b>预算执行表</b>，共 ' + Object.keys(rows).length + ' 个预算来源（自有人力列已忽略）</div>' +
      '<div class="paste-preview"><table><tr><th>编码</th><th>名称</th><th>IT外包可用</th><th>IT外包执行</th><th>OD可用</th><th>OD执行</th></tr>' + rs + '</table></div>';
  } catch (e) { return '<div class="cons-diff warn">🔍 解析失败：' + esc(e.message) + '</div>'; }
}
async function importAll() {
  if (!importCtx || !importCtx.files.length) { alert('请先添加文件'); return; }
  const parts = [];
  const poAll = []; let asOf = 0;
  const execMerged = {}; let execCnt = 0;
  const snapDate = ($('#snapDate') && $('#snapDate').value) || importCtx.snapDate || todayStr();
  let teamGroups = null;
  for (const f of importCtx.files) {
    if (f.error || !f.kind) return;
    if (f.kind === 'po') {
      const { asOf: a, rows } = parsePoRows(f.rows);
      asOf = Math.max(asOf, a);
      poAll.push(...rows);
      parts.push('📄 ' + f.name + '（PO明细）：' + rows.length + ' 行');
    } else if (f.kind === 'exec') {
      mergeExecRows(execMerged, parseExecRows(f.rows));
      execCnt++;
      parts.push('📄 ' + f.name + '（执行表）：已合并');
    } else if (f.kind === 'team') {
      let persons = null;
      if (f.sheets) { const r2 = parseTeamSheets(f.sheets); if (r2.groups.length) persons = r2.groups; }
      if (!persons) persons = parseTeamTable(f.rows);
      teamGroups = persons;
      const pN = sum(persons, g => g.headcount || 0);
      parts.push('👥 ' + f.name + '（团队配置）：' + pN + ' 人 / ' + persons.length + ' 组');
    }
  }
  if (teamGroups && teamGroups.length) { state.team = teamGroups.map(g => ({ id: uid(), ...g })); touch('team'); }
  if (poAll.length) {
    state.poDataByYear = state.poDataByYear || {};
    state.poDataByYear[curYear()] = { updatedAt: todayStr(), asOf, rows: poAll };
    touch('po');
  }
  if (execCnt) {
    const exist = state.execSnaps.find(s => s.date === snapDate);
    if (exist) exist.rows = execMerged; else state.execSnaps.push({ date: snapDate, rows: execMerged });
    state.execSnaps.sort((a, b) => a.date < b.date ? -1 : 1);
    touch('exec');
  }
  save(); closeModal();
  alert('导入完成：\n\n' + parts.join('\n') + (poAll.length || execCnt ? '\n\n所有指标已自动重算。' : ''));
}

/* ================= 计算引擎 ================= */
const curYear = () => state.meta.year;
// 规划金额单位 WUSD（万美金，保留小数）：amountW 为准；旧数据 amountUsd（美元整数）自动换算
const wusdOf = p => (p && p.amountW != null ? +p.amountW : ((p && p.amountUsd) || 0) / 10000);
function fmtWusd(v) { const n = +v; if (!Number.isFinite(n)) return '—'; let t = n.toFixed(2); if (t.indexOf('.') >= 0) t = t.replace(/0+$/, '').replace(/\.$/, ''); return t; }
function parseWusd(s) {  // 万美金，保留小数；'55000'等≥1000 视为美元自动÷1万（不走 parseMoney 的取整）
  if (s == null || s === '') return null;
  let t = String(s).trim().replace(/[¥$，,\s]/g, '');
  if (!t) return null;
  t = t.replace(/[万wW]$/, '');
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n >= 1000 ? n / 10000 : n;
}
const yearParams = y => Object.assign({}, defaultYearParams(), (state.years || {})[y] || {});
const plansOf = y => (state.plans || []).filter(p => p.year === y);
const poOf = y => (state.poDataByYear || {})[y] || null;
const inYear = (d, y) => String(d || '').startsWith(String(y));

function calc() {
  const Y = curYear();
  const m = yearParams(Y), fx = m.fxRate;
  const plansY = plansOf(Y);
  const snaps = [...(state.execSnaps || [])].filter(s => inYear(s.date, Y)).sort((a, b) => a.date < b.date ? -1 : 1);
  const snap = snaps[snaps.length - 1] || null;
  const po = poOf(Y);

  // 规划关联
  const planByCode = {};
  plansY.forEach(p => { if (p.code) planByCode[p.code] = p; });
  const excl = m.excluded || [];
  const codes = snap ? Object.keys(snap.rows).filter(c => excl.indexOf(c) < 0) : [];
  const unmatched = codes.filter(c => !planByCode[c]);

  // 汇总
  const planCnyTotal = sum(plansY, p => wusdOf(p) * 10000 * fx);
  let itwExec = 0, odExec = 0, availTotal = 0, itwFc = 0, remainTotal = 0;
  const per = {};
  codes.forEach(c => {
    const r = snap.rows[c];
    const p = planByCode[c] || null;
    const planCny = p ? wusdOf(p) * 10000 * fx : null;
    const ie = r.itw.exec || 0, oe = r.od.exec || 0;
    const av = (r.itw.avail || 0) + (r.od.avail || 0);
    const rm = (r.itw.remain || 0) + (r.od.remain || 0);
    itwExec += ie; odExec += oe; availTotal += av; itwFc += (r.itw.fc || 0); remainTotal += rm;
    const tgt = (p && p.target != null) ? p.target : m.execRateTarget;
    per[c] = { code: c, name: r.name, plan: p, planCny, itwExec: ie, odExec: oe, exec: ie + oe, avail: av, remain: rm, itwFc: r.itw.fc || 0, itwRemain: r.itw.remain || 0, odAvail: r.od.avail || 0, execRate: planCny ? (ie + oe) / planCny : null, target: tgt, targetInherit: !(p && p.target != null) };
  });
  const execTotal = itwExec + odExec;
  const execRate = planCnyTotal > 0 ? execTotal / planCnyTotal : null;

  // 时间进度
  const now = new Date(), y0 = new Date(Y, 0, 1), y1 = new Date(Y + 1, 0, 1);
  let timeProg = 1;
  if (now < y0) timeProg = 0; else if (now < y1) timeProg = (now - y0) / (y1 - y0);
  const curM = now.getFullYear() === Y ? now.getMonth() + 1 : (now.getFullYear() > Y ? 13 : 0);

  // PO 月度（实际：m < asOf；预测：m >= asOf）
  const poMonthlyAct = {}, poMonthlyFc = {}, poActByCode = {};
  let poFrozen = 0, poReturn = 0, openCnt = 0;
  const poList = po ? po.rows.filter(r => excl.indexOf(r.budgetCode) < 0) : [];   // 剔除项的 PO 一并不计
  const poAgg = {};   // 同一 PO 可能拆成多行（多个预算来源）：金额是 PO 级合并值，只算一次
  poList.forEach(r => {
    const act = sum(Object.entries(r.months), ([mm, v]) => +mm < (po ? po.asOf : 13) ? v : 0);
    const fc = sum(Object.entries(r.months), ([mm, v]) => +mm >= (po ? po.asOf : 13) ? v : 0);
    // 预计返还 = 超出所属月（费用起始月）的预测：所属月内的预测即将执行掉，不算返还
    const startM = r.startDate ? +String(r.startDate).slice(5, 7) : 0;
    const refund = sum(Object.entries(r.months), ([mm, v]) => (+mm >= (po ? po.asOf : 13) && +mm > startM) ? v : 0);
    Object.entries(r.months).forEach(([mm, v]) => {
      const mi = +mm;
      if (mi < po.asOf) { poMonthlyAct[mi] = (poMonthlyAct[mi] || 0) + v; poActByCode[r.budgetCode] = (poActByCode[r.budgetCode] || 0) + v; }
      else poMonthlyFc[mi] = (poMonthlyFc[mi] || 0) + v;
    });
    const key = r.poNo + '|' + (r.itProject || '');
    const g = poAgg[key] = poAgg[key] || { amount: 0, amountSum: 0, act: 0, fc: 0, refund: 0, status: r.status, amtFilled: false };
    g.amountSum += r.amount || 0;
    g.amtFilled = g.amtFilled || !!r.amtFilled;
    g.amount = g.amtFilled ? Math.max(g.amount, r.amount || 0) : g.amountSum;
    g.act += act; g.fc += fc; g.refund += refund; g.status = r.status;
  });
  Object.values(poAgg).forEach(g => {
    if (g.status === 'OPEN') { openCnt++; poFrozen += Math.max(g.amount - g.act, 0); poReturn += g.refund; }
  });

  // OD 月度历史（执行表快照差值）
  const odMonthly = {};
  let prevOd = 0, firstSnap = true;
  snaps.forEach(s => {
    const t = sum(Object.entries(s.rows), ([c, r]) => excl.indexOf(c) < 0 ? (r.od.exec || 0) : 0);
    if (!firstSnap) {
      // 执行表口径是「1-上月执行」：M 月导入的快照，其相对上一份的增量实为 (M-1) 月执行
      let mo = +s.date.slice(5, 7) - 1;
      if (mo === 0) mo = 12;
      odMonthly[mo] = (odMonthly[mo] || 0) + (t - prevOd);
    }
    firstSnap = false; prevOd = t;
  });
  const normalDeltas = Object.entries(odMonthly).filter(([mo]) => +mo !== 6 && +mo !== 12).map(([, v]) => v).slice(-3);
  // 无差值历史（仅一次导入）时：OD 累计执行 ÷ 已过月数（快照月-1，执行表口径为 1-上月）估算月均
  const odMonths = snaps.length ? Math.max(+(snaps[snaps.length - 1].date.slice(5, 7)) - 1, 1) : 1;
  const odAvg = normalDeltas.length ? sum(normalDeltas) / normalDeltas.length : (odExec > 0 ? odExec / odMonths : 0);

  // 工作日（默认周末法，可逐月覆盖）
  const wdDefault = mo => {
    const p2 = v => String(v).padStart(2, '0');
    const exact = HOLIDAYS[Y];
    const d = new Date(Y, mo - 1, 1); let n = 0;
    if (exact) {   // 官方精确安排（含调休上班）
      const off = new Set(exact.off.filter(x => +x.slice(0, 2) === mo));
      const work = new Set(exact.work.filter(x => +x.slice(0, 2) === mo));
      while (d.getMonth() === mo - 1) {
        const w = d.getDay(), key = p2(mo) + '-' + p2(d.getDate());
        if (w >= 1 && w <= 5) { if (!off.has(key)) n++; }
        else if (work.has(key)) n++;
        d.setDate(d.getDate() + 1);
      }
    } else {      // 推算：周中 − 节假日（不预知调休上班，年误差约2~4天）
      const off = estHolidaySet(Y);
      while (d.getMonth() === mo - 1) {
        const w = d.getDay(), key = p2(mo) + '-' + p2(d.getDate());
        if (w >= 1 && w <= 5 && !off.has(key)) n++;
        d.setDate(d.getDate() + 1);
      }
    }
    return n;
  };
  const workdays = mo => { const v = m.workdays && m.workdays[mo]; return (v != null && v !== '' && !Number.isNaN(+v)) ? +v : wdDefault(mo); };

  // 团队配置理论值
  const team = state.team || [];
  const poGroups = team.filter(g => g.kind === 'po' && (g.headcount || 0) > 0);
  const odGroups = team.filter(g => g.kind === 'od' && (g.headcount || 0) > 0);
  const attend = m.attendFactor != null ? m.attendFactor : 1;
  const poDaily = sum(poGroups, g => g.headcount * (g.rate || 0));
  const theoryOd = sum(odGroups, g => g.headcount * (g.rate || 0));
  const theoryPo = mo => poDaily * workdays(mo) * attend;

  // PO 历史月均（近 3 个非零实际月，供兜底与校准）
  const poHist = Object.entries(poMonthlyAct).filter(([mo, v]) => v > 0 && +mo < (po ? po.asOf : 13)).sort((a, b) => +a[0] - +b[0]);
  const poLast3 = poHist.slice(-3);
  const poAvg = poLast3.length ? sum(poLast3, ([, v]) => v) / poLast3.length : 0;
  const poAvgWd = poLast3.length ? sum(poLast3, ([mo]) => workdays(+mo)) / poLast3.length : workdays(Math.max(curM, 1));

  // OD 未来估算：团队理论或历史月均；6月×2（上半年清算）、12月×bonusMonths（全年+年终奖）
  // 年度未开始（查看未来年）时不做任何预测
  const started = curM >= 1;
  const odBase = odGroups.length ? theoryOd : odAvg;
  const odEst = {};
  const poEst = {};
  if (started) {
    for (let mo = curM; mo <= 12; mo++) odEst[mo] = mo === 6 ? odBase * 2 : mo === 12 ? odBase * (m.bonusMonths || 3.5) : odBase;
    for (let mo = curM; mo <= 12; mo++) {
      const fc = poMonthlyFc[mo] || 0;
      const th = poGroups.length ? theoryPo(mo) : 0;
      const hist = poAvg > 0 && poAvgWd > 0 ? poAvg * workdays(mo) / poAvgWd : 0;
      poEst[mo] = Math.max(fc, th, hist);
    }
  }
  const odFuture = sum(Object.entries(odEst), ([, v]) => v);
  const poFuture = sum(Object.values(poEst));

  // 预测执行率
  const forecastEnd = execTotal + poFuture + odFuture;
  const forecastRate = planCnyTotal > 0 ? forecastEnd / planCnyTotal : null;

  // 校准：团队理论 vs 历史实际
  const calibPo = (poGroups.length && poAvg > 0) ? (theoryPo(Math.max(curM, 1)) - poAvg) / poAvg : null;
  const calibOd = (odGroups.length && odAvg > 0) ? (theoryOd - odAvg) / odAvg : null;

  // 下月 PO 建议（决策点：本月18-19日，20日左右下下月PO）
  const nextM = curM >= 12 ? null : curM + 1;
  let poAdvice = null;
  if (nextM != null && started && planCnyTotal > 0) {
    const fcNext = poMonthlyFc[nextM] || 0;
    const thNext = poGroups.length ? theoryPo(nextM) : 0;
    const histNext = (poAvg > 0 && poAvgWd > 0) ? poAvg * workdays(nextM) / poAvgWd : 0;
    const natural = Math.max(thNext, histNext);   // 团队自然需求（不含已下 PO）
    const gap = m.execRateTarget * planCnyTotal - forecastEnd;
    const monthsLeft = 13 - nextM;
    const extra = gap > 0 ? gap / monthsLeft : 0;
    const newIssue = Math.max(natural + extra - fcNext, 0);
    poAdvice = { nextM, fcNext, thNext, histNext, natural, odEstNext: odEst[nextM] || 0, gap, extra, newIssue, suggest: fcNext + newIssue, late: curM >= 11, wd: workdays(nextM) };
  }

  // OD 调拨建议
  let odAdvice = null;
  if (nextM != null && started) {
    const need = odEst[nextM] || 0;
    const have = sum(codes, c => snap.rows[c].od.avail || 0);
    odAdvice = { nextM, need, have, transfer: Math.max(need - have, 0), alloc: [] };
    const pool = sum(codes, c => per[c].itwRemain > 0 ? per[c].itwRemain : 0);
    if (odAdvice.transfer > 0 && pool > 0) codes.forEach(c => {
      if (per[c].itwRemain > 0) odAdvice.alloc.push({ code: c, name: snap.rows[c].name, amt: odAdvice.transfer * per[c].itwRemain / pool });
    });
  }

  // 授予进度（催 BA）
  const grantProg = planCnyTotal > 0 ? availTotal / planCnyTotal : null;
  const grantWarn = [];
  plansY.forEach(p => {
    if (!p.code || !per[p.code]) {
      if (wusdOf(p) > 0 && curM >= 3 && (!p.code || !snap || !snap.rows[p.code])) grantWarn.push({ name: p.name, msg: curM >= 3 ? '平台未见授予' : '' });
      return;
    }
    const s = per[p.code], pc = wusdOf(p) * 10000 * fx;
    if (pc > 0 && s.avail / pc < timeProg - 0.1) grantWarn.push({ name: p.name, msg: '授予 ' + fmtPct(s.avail / pc) + '（时间进度 ' + fmtPct(timeProg) + '）' });
  });

  // 交叉校验
  const checks = [];
  if (snap && po) codes.forEach(c => {
    const a = poActByCode[c] || 0, b = per[c].itwExec;
    const d = a - b;
    if (Math.abs(d) > Math.max(1000, b * 0.02)) checks.push({ code: c, name: snap.rows[c].name, poSum: a, execSum: b, diff: d });
  });
  const grantChecks = [];
  if (snap) {
    const logs = {};
    state.grantLogs.filter(g => inYear(g.date, Y)).forEach(g => { if (g.code) logs[g.code] = (logs[g.code] || 0) + (g.amountCny || 0); });
    codes.forEach(c => {
      const b = snap.rows[c].itw.granted || 0;
      if (logs[c] != null && Math.abs(logs[c] - b) > Math.max(1000, b * 0.02)) grantChecks.push({ code: c, name: snap.rows[c].name, logSum: logs[c], granted: b });
    });
  }

  return {
    Y, fx, snaps, snap, po, poList, excluded: excl, codes, per, plansY, unmatched, planCnyTotal, itwExec, odExec, execTotal, execRate,
    timeProg, curM, poMonthlyAct, poMonthlyFc, poActByCode, poFrozen, poReturn, openCnt,
    odMonthly, odAvg, odEst, odFuture, poFuture, poEst, forecastEnd, forecastRate,
    poAdvice, odAdvice, grantProg, grantWarn, checks, grantChecks, availTotal, remainTotal, itwFc,
    workdays, team: { poGroups, odGroups, poDaily, theoryOd, theoryPo, calibPo, calibOd, attend },
    poAvg, poAvgWd,
    odAsOfText: snap ? 'OD 执行截至 ' + (+snap.date.slice(5, 7)) + ' 月（平台口径，滞后约 1 个月）' : ''
  };
}

/* ================= 渲染：通用 ================= */
function projectSelect() { }
function rateColor(rate, timeProg, target) {
  if (rate == null || !target) return '';
  if (rate >= target) return 'f-green';
  if (rate >= timeProg - 0.05) return '';
  return 'f-red';
}
function execRowHtml(name, rate, target, timeProg, forecast) {
  const w = rate == null ? 0 : Math.min(rate * 100, 100);
  const marks = (!target ? '' :
    '<div class="mark" style="left:' + Math.min(target * 100, 100) + '%" title="目标线 ' + fmtPct(target) + '"></div>') +
    (timeProg > 0 && timeProg < 1 ? '<div class="mark mark-time" style="left:' + (timeProg * 100).toFixed(1) + '%" title="时间进度 ' + fmtPct(timeProg) + '"></div>' : '');
  const fore = typeof forecast === 'string' ? forecast : (forecast != null ? '预计年底 ' + fmtPct(forecast) : '');
  return '<div class="exec-row">' +
    '<div class="exec-name" title="' + esc(name) + '">' + esc(name) + '</div>' +
    '<div class="pbar"><div class="pbar-fill ' + rateColor(rate, timeProg, target) + '" style="width:' + w.toFixed(1) + '%"></div>' + marks + '</div>' +
    '<div class="exec-val">' + fmtPct(rate) + '</div>' +
    '<div class="exec-fore">' + fore + '</div></div>';
}
function renderBanner() {
  const el = $('#freshnessBanner');
  if (SHARE_MODE) { el.className = 'banner ok'; el.innerHTML = '🔗 分享只读模式 · 数据截至 <b>' + esc(SHARE_PKG.exportedAt) + '</b> · 如需更新请联系维护人重新发布'; return; }
  const freq = state.meta.updateFreqDays || 14, t = todayStr();
  const defs = [['po', 'PO明细'], ['exec', '执行表'], ['team', '团队配置'], ['plan', '规划'], ['grants', '授予流水']];
  const chips = [];
  defs.forEach(([k, label]) => {
    const d = (state.updatedAt || {})[k];
    if (k === 'po' && !poOf(curYear())) { chips.push(label + '：从未导入'); return; }
    if (k === 'exec' && !state.execSnaps.some(s => inYear(s.date, curYear()))) { chips.push(label + '：从未导入'); return; }
    if (!d && (k === 'po' || k === 'exec')) return;
    if (!d) { if (k === 'plan' && state.plans.length) chips.push(label + '：未记录'); if (k === 'grants' && state.grantLogs.length) chips.push(label + '：未记录'); return; }
    const days = daysBetween(d, t);
    if (days != null && days > freq) chips.push(label + '：' + days + ' 天前');
  });
  const hasData = state.execSnaps.length || state.poData;
  if (!hasData && !state.plans.length) { el.className = 'banner warn'; el.innerHTML = '⚠️ 尚未录入任何数据：先在「数据管理」录规划，再导入平台 4 文件'; return; }
  if (chips.length) { el.className = 'banner warn'; el.innerHTML = '⚠️ 数据待更新：' + chips.map(c => '<span class="chip">' + esc(c) + '</span>').join(''); }
  else { el.className = 'banner ok'; el.innerHTML = '✓ 各数据源 ' + freq + ' 天内均已更新'; }
  $('#yearBadge').textContent = state.meta.year + ' 年度';
}

/* ================= 渲染：现在与行动（首页） ================= */
function actHash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return 'a' + h; }
function actsStore() { try { return JSON.parse(localStorage.getItem('budgetDash.acts') || '{}'); } catch (e) { return {}; } }
function actDone(h) { const d = actsStore()[h]; return d != null && d.slice(0, 7) === todayStr().slice(0, 7); }

function renderNow() {
  const c = calc(), Y = curYear(), m = yearParams(Y);
  $('#yearBadge').textContent = Y + ' 年度';
  const ob = $('#onboard');
  if (!c.plansY.length && !c.po && !c.snaps.length) {
    const hasOtherYear = state.plans.length || state.execSnaps.length;
    ob.innerHTML = '<div class="onboard"><h2>' + Y + ' 年度还没有数据</h2>' +
      (hasOtherYear
        ? '<div class="muted" style="margin-bottom:12px">开启新年：复制上年规划与参数（编码关联沿用，金额可再调），然后正常导入新年平台数据。</div>' +
          '<div class="btn-row" style="justify-content:center"><button class="btn primary" data-action="year:start">🚀 开启 ' + Y + ' 年度（复制上年）</button>' +
          '<button class="btn" data-action="data:demo">加载示例数据</button></div>'
        : '<div class="muted" style="margin-bottom:12px">四步开始：① 数据管理 → 录入年初规划（名称+美金）② 录团队配置（预测更准）③ 顶部「导入平台数据」拖入 4 个文件 ④ 回到本页看进展、风险与行动。</div>' +
          '<div class="btn-row" style="justify-content:center"><button class="btn primary" data-action="data:demo">加载示例数据</button>' +
          '<button class="btn" data-action="goto:data">去录规划</button></div>') + '</div>';
    $('#summaryBar').innerHTML = hasOtherYear ? '<b>' + Y + ' 年度待开启</b>：历史年度数据已封卷保存，随时可切换回看。' : '<b>开始前</b>：先用示例数据体验，或直接录入你的规划与团队配置。';
  } else ob.innerHTML = '';

  /* ---- ⓪ 摘要条 ---- */
  const gapTxt = (c.forecastRate != null && c.forecastRate < m.execRateTarget)
    ? '距目标缺口 <b>' + fmtCny(m.execRateTarget * c.planCnyTotal - c.forecastEnd) + '</b>'
    : '可达目标 ✓';
  let actTxt = [];
  if (c.poAdvice && c.poAdvice.newIssue > 0) actTxt.push('下月 PO 新下 <b>' + fmtCny(c.poAdvice.newIssue) + '</b>');
  if (c.odAdvice && c.odAdvice.transfer > 0) actTxt.push('OD 调拨 <b>' + fmtCny(c.odAdvice.transfer) + '</b>');
  if (c.unmatched.length) actTxt.push('关联 ' + c.unmatched.length + ' 个编码');
  if (c.grantWarn.filter(w => w.msg).length) actTxt.push('催 BA ' + c.grantWarn.filter(w => w.msg).length + ' 项');
  $('#summaryBar').innerHTML =
    '执行率 <b>' + fmtPct(c.execRate) + '</b> → 预计年底 <b>' + fmtPct(c.forecastRate) + '</b>（目标 ' + fmtPct(m.execRateTarget) + '，' + gapTxt + '）' +
    (actTxt.length ? '<br>本周期：' + actTxt.join(' · ') : '<br>本周期无必做动作，保持节奏月底再导一次数据。') +
    (c.snap ? '<span style="opacity:.8;font-size:12px">　数据截至 ' + c.snap.date + '</span>' : '');

  /* ---- ① 进展 ---- */
  const kpi = (label, value, sub, cls) => '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value ' + (cls || '') + '">' + value + '</div><div class="kpi-sub">' + (sub || '') + '</div></div>';
  const rateCls = c.execRate == null ? '' : (c.execRate >= m.execRateTarget ? 'c-green' : (c.execRate >= c.timeProg - 0.05 ? 'c-blue' : 'c-red'));
  const foreCls = c.forecastRate == null ? '' : (c.forecastRate >= m.execRateTarget ? 'c-green' : 'c-red');
  $('#nowProgress').innerHTML =
    '<div class="kpi-grid">' +
    kpi('执行率', fmtPct(c.execRate), '目标 ' + fmtPct(m.execRateTarget) + ' · 时间 ' + fmtPct(c.timeProg), rateCls) +
    kpi('预计年底', fmtPct(c.forecastRate), 'PO预测 ' + fmtCny(c.poFuture) + ' + OD ' + fmtCny(c.odFuture), foreCls) +
    kpi('可用（授予）', fmtCny(c.availTotal), '授予进度 ' + fmtPct(c.grantProg)) +
    kpi('剩余可支配', fmtCny(c.remainTotal), '在途冻结 ' + fmtCny(c.poFrozen) + ' · 已执行 ' + fmtCny(c.execTotal)) +
    '</div>' +
    '<div style="margin-top:10px">' + execRowHtml('总体', c.execRate, m.execRateTarget, c.timeProg, c.forecastRate) +
    c.codes.slice(0, 6).map(code => {
      const s = c.per[code];
      return execRowHtml(s.plan ? s.plan.name : s.name + '⚠️', s.execRate, s.target, c.timeProg, s.target === 0 ? '不考核' : null);
    }).join('') +
    (c.codes.length > 6 ? '<div class="muted" style="padding:4px 0">…共 ' + c.codes.length + ' 个预算来源，完整列表见下方「执行率明细」</div>' : '') + '</div>' +
    '<div class="muted" style="margin-top:4px">ℹ️ ' + esc(c.odAsOfText || '') + '</div>';

  /* ---- ② 风险 ---- */
  const risks = [];
  if (c.forecastRate != null && c.forecastRate < m.execRateTarget)
    risks.push(['red', '达标风险', '预测年底 ' + fmtPct(c.forecastRate) + ' &lt; 目标 ' + fmtPct(m.execRateTarget) + '，缺口 ' + fmtCny(m.execRateTarget * c.planCnyTotal - c.forecastEnd) + '（PO 预测 ' + fmtCny(c.poFuture) + ' + OD 估算 ' + fmtCny(c.odFuture) + ' 之后的差）']);
  if (c.checks.length)
    risks.push(['red', '两表不符', 'PO明细汇总与执行表有 ' + c.checks.length + ' 项对不上（最大差额 ' + fmtCny(Math.max(...c.checks.map(k => Math.abs(k.diff)))) + '），见底部校验卡']);
  if (c.unmatched.length)
    risks.push(['red', '编码未关联', c.unmatched.length + ' 个预算来源（' + c.unmatched.map(u => esc(c.snap.rows[u].name)).join('、') + '）未关联规划，执行率分母不准']);
  if (c.grantProg != null && c.grantProg < c.timeProg - 0.1)
    risks.push(['amber', '授予落后', '授予进度 ' + fmtPct(c.grantProg) + ' 落后时间进度 ' + fmtPct(c.timeProg) + '，差 ' + fmtCny(c.planCnyTotal * c.timeProg - c.availTotal) + '——催 BA']);
  c.grantWarn.filter(w => w.msg).forEach(w => risks.push(['amber', '授予明细', esc(w.name) + '：' + esc(w.msg)]));
  if (c.curM === 5 || c.curM === 11)
    risks.push(['amber', '清算月', (c.curM === 5 ? '6' : '12') + ' 月底 OD 大额清算' + (c.curM === 11 ? '（含年终奖约 ' + (m.bonusMonths || 3.5) + ' 个月月均）' : '') + '，确认 OD 额度是否够']);
  if (c.team.poGroups.length && Math.abs(c.team.calibPo || 0) > 0.1)
    risks.push(['amber', '团队校准', 'PO 理论月度与历史实际偏差 ' + fmtPct(c.team.calibPo) + '（理论 ' + fmtCny(c.team.theoryPo(Math.max(c.curM, 1))) + ' vs 近3月实际 ' + fmtCny(c.poAvg) + '），检查人数/单价/出勤系数']);
  if (c.team.odGroups.length && Math.abs(c.team.calibOd || 0) > 0.1)
    risks.push(['amber', '团队校准', 'OD 理论月度与历史实际偏差 ' + fmtPct(c.team.calibOd) + '（理论 ' + fmtCny(c.team.theoryOd) + ' vs 近3月实际 ' + fmtCny(c.odAvg) + '）']);
  if (state.team.length) {
    const days = state.meta.lastHcCheck ? daysBetween(state.meta.lastHcCheck, todayStr()) : null;
    if (days == null || days > 35) risks.push(['amber', '人数待确认', '团队人数经常变化，距上次确认' + (days == null ? '从未' : '已 ' + days + ' 天') + '，请核对团队配置']);
  }
  if (c.curM <= 3 && c.po) {
    const crossPO = c.po.rows.filter(r => r.startDate && +String(r.startDate).slice(0, 4) === Y - 1 && +String(r.startDate).slice(5, 7) === 12);
    const crossAmt = sum(crossPO, r => sum(Object.entries(r.months), ([mm, v]) => +mm < c.po.asOf ? v : 0));
    if (crossAmt > 0) risks.push(['info', '跨年PO', '本年执行含 <b>' + fmtCny(crossAmt) + '</b> 跨年 PO（上年 12 月服务、今年 1 月下单）——平台口径如此，属正常，勿当本年新增消耗追账']);
  }
  if (c.curM >= 11) risks.push(['info', '落账节奏', '12 月服务的 PO 要到下年 1 月下单、计入<b>下年</b>执行——冲今年执行率只能靠年内可执行完的 PO 和 OD 年终清算']);
  const freq = state.meta.updateFreqDays || 14;
  ['po', 'exec'].forEach(k => {
    const d = (state.updatedAt || {})[k];
    const days = d ? daysBetween(d, todayStr()) : null;
    if (days == null || days > freq) risks.push(['amber', '数据过期', (k === 'po' ? 'PO明细' : '执行表') + (days == null ? '未导入' : '已 ' + days + ' 天未更新')]);
  });
  $('#nowRisk').innerHTML = risks.length
    ? risks.map(([lv, tag, txt]) => '<div class="risk-item"><span class="risk-lv ' + lv + '">' + (lv === 'red' ? '!' : lv === 'amber' ? '·' : lv === 'info' ? 'i' : '✓') + '</span><div><b>' + tag + '</b>　' + txt + '</div></div>').join('')
    : '<div class="risk-item"><span class="risk-lv green">✓</span><div><b>暂无风险</b>　执行进度、数据一致性、授予进度均正常</div></div>';

  /* ---- ③ 行动清单 ---- */
  const acts = [];
  if (c.unmatched.length) acts.push({ t: '关联 ' + c.unmatched.length + ' 个新预算来源编码（' + c.unmatched.map(u => esc(c.snap.rows[u].name)).join('、') + '），否则执行率分母不准', btn: 'link:manage', btnTxt: '去关联' });
  if (c.odAdvice && c.odAdvice.transfer > 0) {
    const alloc = c.odAdvice.alloc.slice(0, 3).map(x => x.name + ' +' + fmtCny(x.amt)).join(' / ');
    acts.push({ t: '<b>OD 调拨 ' + fmtCny(c.odAdvice.transfer) + '</b>（IT外包→OD，赶在月底扣减前）' + (alloc ? '，参考分配：' + alloc : '') });
  }
  if (c.poAdvice && c.poAdvice.newIssue > 0) {
    const a = c.poAdvice;
    acts.push({ t: '<b>20 号前下 ' + a.nextM + ' 月 PO：新下 ' + fmtCny(a.newIssue) + '</b>（已下 ' + fmtCny(a.fcNext) + '，团队需求 ' + fmtCny(a.natural) + (a.extra > 0 ? '，达标追加 ' + fmtCny(a.extra) : '') + '，' + a.wd + ' 个工作日）' + (a.late ? '——已近年底，追加部分评估跨年' : '') });
  } else if (c.poAdvice) acts.push({ t: '下月 PO：已下 ' + fmtCny(c.poAdvice.fcNext) + ' 已覆盖团队需求 ' + fmtCny(c.poAdvice.natural) + '，无需追加' });
  c.grantWarn.filter(w => w.msg).slice(0, 2).forEach(w => acts.push({ t: '催 BA：<b>' + esc(w.name) + '</b> ' + esc(w.msg) }));
  if (c.openCnt > 0) acts.push({ t: '催验收：' + c.openCnt + ' 个 OPEN PO 在途冻结 ' + fmtCny(c.poFrozen) + '，预计返还 ' + fmtCny(c.poReturn) + '（验收周期约 1 个月）' });
  if (state.team.length) {
    const days = state.meta.lastHcCheck ? daysBetween(state.meta.lastHcCheck, todayStr()) : null;
    if (days == null || days > 35) acts.push({ t: '确认团队人数是否有变化（上次确认：' + (state.meta.lastHcCheck || '从未') + '），有变化请更新团队 Excel 放入数据集文件夹', btn: 'hc:confirm', btnTxt: '人数没变，确认' });
  }
  if (c.curM === 5 || c.curM === 11) acts.push({ t: '为 ' + (c.curM === 5 ? '6 月上半年清算' : '12 月全年清算+年终奖') + '做准备：确认 OD 额度充足，' + (c.curM === 5 ? '必要时调拨' : '并校准参数里的年终奖月数（当前 ' + (m.bonusMonths || 3.5) + '）') });
  const stale = ['po', 'exec'].some(k => { const d = (state.updatedAt || {})[k]; const days = d ? daysBetween(d, todayStr()) : null; return days == null || days > freq; });
  if (stale) acts.push({ t: '导入最新平台数据（4 个文件，按年全量），月底/月初各一次', btn: 'import:open', btnTxt: '导入' });
  $('#nowActions').innerHTML = acts.length
    ? acts.map((a, i) => {
      const h = actHash(a.t);
      const done = actDone(h);
      return '<div class="act-item' + (done ? ' done' : '') + '"><span class="act-no">' + (i + 1) + '</span>' +
        '<div class="act-body">' + a.t + '</div>' +
        '<span class="act-done-btn">' + (a.btn ? '<button class="btn small" data-action="' + a.btn + '">' + (a.btnTxt || '去处理') + '</button> ' : '') +
        '<button class="btn small" data-action="act:toggle" data-h="' + h + '">' + (done ? '撤销' : '✓ 完成') + '</button></span></div>';
    }).join('')
    : '<div class="empty">本周期无待办——数据最新、无风险项。月底记得再导一次数据存档。</div>';

  /* ---- ④ 次要：图表 / 执行率明细 / 授予 / 校验 ---- */
  let ex = execRowHtml('总体', c.execRate, m.execRateTarget, c.timeProg, c.forecastRate);
  c.codes.forEach(code => {
    const s = c.per[code];
    ex += execRowHtml(s.plan ? s.plan.name + '（' + s.name + '）' : s.name + ' [' + code + '] ⚠️未关联', s.execRate, s.target, c.timeProg, s.target === 0 ? '不考核' : null);
  });
  $('#execRates').innerHTML = ex +
    '<div class="exec-legend"><span class="lg"><i style="background:var(--green)"></i>目标 ' + fmtPct(m.execRateTarget) + '</span>' +
    '<span class="lg"><i style="border-left:2px dashed var(--amber);width:0;background:none"></i>时间进度</span>' +
    '<span class="lg"><i style="background:var(--blue)"></i>实际</span></div>';
  drawChart(c);
  $('#chartHint').innerHTML = (c.snap && c.snaps.length < 2)
    ? 'ℹ️ OD 月度柱需要<b>至少两次导入</b>才有（相邻执行表快照的差值）；当前仅 1 次导入，OD 月均按「累计执行 ÷ 已过月数」估算（' + fmtCny(c.odAvg) + '/月），下次导入后自动校准。'
    : ''; 

  let gHtml = '';
  if (!c.snap) gHtml = '<div class="empty">尚未导入执行表。</div>';
  else {
    const ok = c.grantProg != null && c.grantProg >= c.timeProg - 0.1;
    gHtml = '<table class="cons-table">' +
      '<tr><td>年初规划（USD×' + c.fx + '）</td><td>' + fmtCny(c.planCnyTotal) + '</td></tr>' +
      '<tr><td>累计可用（授予+结转）</td><td>' + fmtCny(c.availTotal) + '</td></tr>' +
      '<tr><td>授予进度</td><td><b>' + fmtPct(c.grantProg) + '</b> vs 时间 ' + fmtPct(c.timeProg) + '</td></tr>' +
      '</table>' +
      (ok ? '<div class="cons-diff ok">✓ 授予进度正常</div>' : '<div class="cons-diff warn">⚠️ 授予进度落后时间进度——这是催 BA 的量化依据</div>') +
      (c.grantWarn.filter(w => w.msg).length ? '<div style="margin-top:6px">' + c.grantWarn.filter(w => w.msg).map(w => '<div class="adv-item"><span class="adv-label">' + esc(w.name) + '</span><div>' + esc(w.msg) + '</div></div>').join('') + '</div>' : '');
  }
  $('#grantPanel').innerHTML = gHtml;

  let cons = '';
  if (!c.snap || !c.po) cons = '<div class="empty">导入 PO明细 + 执行表后自动交叉校验。</div>';
  else {
    const ck = c.checks.length === 0;
    cons = '<table class="cons-table"><tr><td>PO明细已执行合计（≤' + (c.po.asOf - 1) + '月）</td><td>vs 执行表 IT外包 1-上月执行</td></tr></table>' +
      (ck ? '<div class="cons-diff ok">✓ 两表一致</div>'
        : '<div class="cons-diff warn">⚠️ ' + c.checks.length + ' 个预算来源两表不符：</div>' +
        '<table class="tbl"><thead><tr><th>预算来源</th><th class="num">PO明细汇总</th><th class="num">执行表</th><th class="num">差额</th></tr></thead><tbody>' +
        c.checks.map(k => '<tr><td>' + esc(k.name) + ' [' + esc(k.code) + ']</td><td class="num">' + fmtCny(k.poSum) + '</td><td class="num">' + fmtCny(k.execSum) + '</td><td class="num">' + fmtCny(k.diff) + '</td></tr>').join('') + '</tbody></table>');
    if (c.grantChecks.length) cons += '<div class="cons-diff info">ℹ️ 授予流水与执行表「本年度授予」不符：' + c.grantChecks.map(k => esc(k.name) + '（流水 ' + fmtCny(k.logSum) + ' vs 表 ' + fmtCny(k.granted) + '）').join('、') + '</div>';
  }
  $('#consistency').innerHTML = cons;
}

function drawChart(c) {
  const canvas = $('#monthlyChart');
  if (!canvas) return;
  if (charts.m) { charts.m.destroy(); charts.m = null; }
  if (typeof Chart === 'undefined') return;
  const labels = [], poA = [], poF = [], odA = [], odF = [];
  for (let mo = 1; mo <= 12; mo++) {
    labels.push(mo + '月');
    poA.push(c.poMonthlyAct[mo] || 0);
    poF.push(mo >= c.curM ? (c.poEst[mo] || 0) : (c.poMonthlyFc[mo] || 0));
    odA.push(c.odMonthly[mo] || 0);
    odF.push(mo >= c.curM ? (c.odEst[mo] || 0) : 0);
  }
  const pace = c.planCnyTotal / 12;
  charts.m = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'PO 实际', data: poA, backgroundColor: '#3b6ef5', stack: 'a', borderRadius: 3 },
        { label: 'OD 实际', data: odA, backgroundColor: '#0d9488', stack: 'a', borderRadius: 3 },
        { label: 'PO 预测', data: poF, backgroundColor: '#a8bff9', stack: 'b', borderRadius: 3 },
        { label: 'OD 估算', data: odF, backgroundColor: '#8fd6cf', stack: 'b', borderRadius: 3 },
        { label: '平均节奏', data: labels.map(() => pace), type: 'line', borderColor: '#98a1b3', borderDash: [6, 4], pointRadius: 0, borderWidth: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: { x: { stacked: false, grid: { display: false } }, y: { stacked: false, ticks: { callback: v => v >= 10000 ? (v / 10000) + '万' : v } } },
      plugins: { legend: { labels: { boxWidth: 12, font: { size: 12 } } }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + '：' + fmtCny(ctx.parsed.y) } } }
    }
  });
}

/* ================= 渲染：预算来源 ================= */
function renderBudget() {
  const c = calc();
  const wrap = $('#budgetTableWrap');
  if (!c.snap && !c.plansY.length) { wrap.innerHTML = '<div class="empty">先录入规划、导入执行表。</div>'; return; }
  const rows = [];
  const seen = new Set();
  if (c.snap) c.codes.forEach(code => {
    const s = c.per[code];
    seen.add(code);
    const tgtTxt = s.target === 0 ? '<span class="muted">不考核</span>' : (s.targetInherit ? '<span title="继承年度默认">' + fmtPct(s.target) + '<span class="muted">·默认</span></span>' : '<b>' + fmtPct(s.target) + '</b>');
    rows.push('<tr>' +
      '<td><b>' + esc(s.name) + '</b> <span class="muted">[' + esc(code) + ']</span></td>' +
      '<td>' + (s.plan ? esc(s.plan.name) : '<span class="btn-row"><button class="btn small" data-action="link:manage">🔗 关联规划</button> <button class="btn small danger" data-action="excl:add" data-id="' + esc(code) + '" title="不在本年规划/挂靠项：剔除后其执行与 PO 均不参与计算">🚫 剔除</button></span>') + '</td>' +
      '<td class="num">' + (s.plan ? fmtWusd(wusdOf(s.plan)) : '—') + '</td>' +
      '<td class="num">' + fmtCny(s.planCny) + '</td>' +
      '<td class="num">' + fmtCny(s.avail) + '</td>' +
      '<td class="num">' + fmtCny(s.itwExec) + '</td>' +
      '<td class="num">' + fmtCny(s.odExec) + '</td>' +
      '<td class="num">' + fmtCny(s.remain) + '</td>' +
      '<td class="num">' + tgtTxt + '</td>' +
      '<td><div style="display:flex;align-items:center;gap:8px"><div class="pbar" style="flex:1">' + (s.target === 0 ? '' : '<div class="mark" style="left:' + Math.min(s.target * 100, 100) + '%"></div>') + '<div class="pbar-fill ' + rateColor(s.execRate, c.timeProg, s.target) + '" style="width:' + (s.execRate == null ? 0 : Math.min(s.execRate * 100, 100)).toFixed(1) + '%"></div><div class="mark mark-time" style="left:' + (c.timeProg * 100).toFixed(1) + '%"></div></div><span class="muted">' + fmtPct(s.execRate) + '</span></div></td></tr>');
  });
  c.plansY.forEach(p => {
    if (p.code && seen.has(p.code)) return;
    rows.push('<tr style="opacity:.75"><td><span class="muted">平台未出现</span></td>' +
      '<td><b>' + esc(p.name) + '</b>' + (p.code ? ' <span class="muted">[' + esc(p.code) + ']</span>' : ' <span class="st st-open">待授予</span>') + '</td>' +
      '<td class="num">' + fmtWusd(wusdOf(p)) + '</td><td class="num">' + fmtCny(wusdOf(p) * 10000 * c.fx) + '</td>' +
      '<td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>' +
      '<td class="num">' + (p.target == null ? '<span class="muted">默认</span>' : p.target === 0 ? '<span class="muted">不考核</span>' : fmtPct(p.target)) + '</td><td>—</td></tr>');
  });
  const exclHint = c.excluded && c.excluded.length
    ? '<div class="cons-diff info" style="margin-top:8px">🚫 已剔除 ' + c.excluded.length + ' 项（其执行与 PO 均不参与计算）：' + c.excluded.map(x => esc(x) + (c.snap && c.snap.rows[x] ? ' ' + esc(c.snap.rows[x].name) : '')).join('、') + '　<button class="btn small" data-action="excl:manage">恢复</button></div>'
    : '';
  wrap.innerHTML = '<table class="tbl"><thead><tr>' +
    '<th>平台名称</th><th>规划名称</th><th class="num">规划(WUSD)</th><th class="num">规划¥</th><th class="num">可用</th><th class="num">IT外包执行</th><th class="num">OD执行</th><th class="num">剩余</th><th class="num">目标</th><th style="min-width:170px">执行率</th>' +
    '</tr></thead><tbody>' + rows.join('') + '</tbody>' +
    '<tfoot><tr><td>合计</td><td></td><td class="num">' + fmtWusd(sum(c.plansY, wusdOf)) + '</td><td class="num">' + fmtCny(c.planCnyTotal) + '</td><td class="num">' + fmtCny(c.availTotal) + '</td><td class="num">' + fmtCny(c.itwExec) + '</td><td class="num">' + fmtCny(c.odExec) + '</td><td class="num">' + fmtCny(c.remainTotal) + '</td><td class="num">' + fmtPct(yearParams(curYear()).execRateTarget) + '</td><td>' + fmtPct(c.execRate) + '</td></tr></tfoot></table>' + exclHint;
}

/* ================= 渲染：PO ================= */
function renderPO() {
  const c = calc();
  const exclCnt = c.po ? c.po.rows.length - c.poList.length : 0;
  $('#poSub').textContent = c.po ? ('快照 ' + c.po.updatedAt + ' · ' + c.poList.length + ' 行' + (exclCnt ? '（已剔除 ' + exclCnt + ' 行）' : '') + ' · 当月起为平台预测（asOf=' + c.po.asOf + '月）') : '';
  const wrap = $('#poTableWrap');
  if (!c.po) { wrap.innerHTML = '<div class="empty">尚未导入 PO 明细。</div>'; $('#poFrozenWrap').innerHTML = ''; return; }
  const rows = [...c.poList].sort((a, b) => (a.startDate || '') < (b.startDate || '') ? -1 : 1).map(r => {
    const act = sum(Object.entries(r.months), ([mm, v]) => +mm < c.po.asOf ? v : 0);
    const fc = sum(Object.entries(r.months), ([mm, v]) => +mm >= c.po.asOf ? v : 0);
    const startM = r.startDate ? +String(r.startDate).slice(5, 7) : 0;
    const refund = sum(Object.entries(r.months), ([mm, v]) => (+mm >= c.po.asOf && +mm > startM) ? v : 0);
    return '<tr><td><b>' + esc(r.poNo) + '</b>' + (r.resName ? '<div class="muted">' + esc(r.resName) + '</div>' : '') + '</td>' +
      '<td>' + esc(r.itProject || '—') + '</td>' +
      '<td>' + esc(r.budgetCode || '—') + (c.per[r.budgetCode] && c.per[r.budgetCode].name ? ' <span class="muted">' + esc(c.per[r.budgetCode].name) + '</span>' : '') + '</td>' +
      '<td>' + esc(r.startDate || '—') + '</td>' +
      '<td class="num">' + fmtCny(r.amount) + '</td>' +
      '<td class="num">' + fmtCny(act) + (fc ? ' <span class="muted">+' + fmtCny(fc) + '预测</span>' : '') + '</td>' +
      '<td><span class="st st-' + (r.status === 'CLOSED' ? 'accepted' : 'open') + '">' + r.status + '</span></td>' +
      '<td class="num">' + (r.status === 'OPEN' ? fmtCny(Math.max(r.amount - act, 0)) : '—') + '</td>' +
      '<td class="num">' + (r.status === 'OPEN' && refund ? fmtCny(refund) : '—') + '</td></tr>';
  }).join('');
  wrap.innerHTML = '<table class="tbl"><thead><tr><th>PO</th><th>花钱项目</th><th>预算来源</th><th>费用起始</th><th class="num">PO金额</th><th class="num">已执行/预测</th><th>状态</th><th class="num">在途冻结</th><th class="num">预计返还</th></tr></thead><tbody>' + rows + '</tbody></table>';
  $('#poFrozenWrap').innerHTML =
    '<table class="cons-table">' +
    '<tr><td>OPEN PO 数</td><td>' + c.openCnt + '</td></tr>' +
    '<tr><td>在途冻结（PO金额 − 已执行）</td><td>' + fmtCny(c.poFrozen) + '</td></tr>' +
    '<tr><td>预计返还（OPEN PO 超出所属月的预测）</td><td>' + fmtCny(c.poReturn) + '</td></tr>' +
    '</table><div class="muted" style="margin-top:6px">PO 按自然月下达：<b>所属月（费用起始月）内的预测</b>=即将执行，不算返还；<b>超出所属月</b>的预测=没花掉，验收（约 1 个月）后返还——记得催验收。</div>';

  // 下月 PO 与 OD 建议（原行动建议页内容并入此处）
  $('#poAdviceSub').textContent = c.poAdvice ? ('决策点 ' + c.curM + '月18-19日 → 20日下 ' + c.poAdvice.nextM + '月 PO · ' + c.poAdvice.wd + ' 个工作日') : '';
  let adv = '<div class="empty">—</div>';
  if (c.poAdvice) {
    const a = c.poAdvice;
    adv = '<table class="cons-table">' +
      '<tr><td>已下 PO 在 ' + a.nextM + '月的平台预测</td><td>' + fmtCny(a.fcNext) + '</td></tr>' +
      '<tr><td>团队自然需求（理论 ' + fmtCny(a.thNext) + ' / 历史修正 ' + fmtCny(a.histNext) + '，取大）</td><td>' + fmtCny(a.natural) + '</td></tr>' +
      (a.extra > 0 ? '<tr><td>达标追加（缺口 ' + fmtCny(a.gap) + ' ÷ 剩余月）</td><td>' + fmtCny(a.extra) + '</td></tr>' : '') +
      '<tr><td><b>建议新下 PO</b></td><td><b>' + fmtCny(a.newIssue) + '</b></td></tr>' +
      '<tr><td>同期 OD 预计扣减</td><td>' + fmtCny(a.odEstNext) + '</td></tr>' +
      '</table>' + (a.late ? '<div class="cons-diff info">ℹ️ 已近年底，追加部分请评估能否年内执行完，否则跨年安排。</div>' : '');
  }
  $('#poAdviceWrap').innerHTML = adv;
}

/* ================= 渲染：数据管理 ================= */
function renderData() {
  const Y = curYear(), m = yearParams(Y), c = calc();
  $('#metaForm').innerHTML =
    '<div class="muted" style="margin-bottom:8px">以下参数属于 <b>' + Y + ' 年度</b>（汇率/目标/年终奖/出勤每年独立；更新频率为全局）。用顶栏 ◀▶ 切换年度。</div>' +
    '<div class="form-grid">' +
    '<label class="field"><span class="field-label">执行率目标（%）</span><input id="meta-target" type="number" min="50" max="100" step="0.5" value="' + (m.execRateTarget * 100) + '"></label>' +
    '<label class="field"><span class="field-label">汇率（规划USD→CNY）</span><input id="meta-fx" type="number" step="0.01" value="' + m.fxRate + '"></label>' +
    '<label class="field"><span class="field-label">12月年终奖扣减（月均倍数）</span><input id="meta-bonus" type="number" step="0.5" value="' + m.bonusMonths + '"></label>' +
    '<label class="field"><span class="field-label">出勤系数（PO预测用，1=满勤）</span><input id="meta-attend" type="number" step="0.05" min="0.5" max="1.5" value="' + (m.attendFactor != null ? m.attendFactor : 1) + '"></label>' +
    '<label class="field"><span class="field-label">数据更新频率（天，全局）</span><input id="meta-freq" type="number" min="1" max="60" value="' + (state.meta.updateFreqDays || 14) + '"></label>' +
    '</div><div class="btn-row" style="margin-top:10px"><button class="btn primary" data-action="meta:save">保存参数</button></div>';

  $('#dataMgmt').innerHTML =
    '<div class="btn-row">' +
    '<button class="btn primary" data-action="import:open">📥 导入平台数据（4文件）</button>' +
    '<button class="btn primary" data-action="data:saveFile">💾 保存到数据文件</button>' +
    '<button class="btn" data-action="data:openFile">📂 打开/恢复数据文件</button>' +
    '<button class="btn" data-action="dataset:scan">📁 扫描数据集</button>' +
    '<button class="btn" data-action="dataset:set">⚙️ 设置数据集文件夹</button>' +
    '<button class="btn" data-action="data:publish">📤 发布分享</button>' +
    '<button class="btn" data-action="data:export">📦 分层备份</button>' +
    '<input type="file" id="importFile" accept=".json,application/json" style="display:none">' +
    '<button class="btn" data-action="data:demo">示例数据</button>' +
    '<button class="btn danger" data-action="data:clear">清空</button></div>' +
    '<div class="muted" style="margin-top:10px"><b>📁 数据集文件夹</b>：设置一次后，平台导出文件（PO明细/执行表）和<b>团队 Excel</b> 都丢进该文件夹，打开看板<b>自动扫描导入</b>——团队 Excel 改完存盘，下次打开自动生效，无需任何操作（快照日期=文件导出时间，重复文件自动跳过）。</div>' +
    '<div class="muted" style="margin-top:10px"><b>git 同步工作流</b>：主数据建议存 <b>data/budget.json</b>（保存按钮直接写回；打开/恢复可载入）——数据随仓库走，换机器 pull 后「📂打开」即接管。日常也自动存本浏览器 localStorage（无数据库）。分层备份：全量/仅配置/仅数据，v2 旧包自动升级。当前 ' + Y + ' 年执行表快照 ' + c.snaps.length + ' 个。</div>' +
    '<div class="btn-row" style="margin-top:8px"><button class="btn" data-action="year:start">🚀 开启新年度（复制本年规划与参数）</button></div>';

  // 规划金额疑似过小（旧版按万美金录入被迁移误除以1万）→ 修复入口
  const plansAll = state.plans || [];
  const maxW = plansAll.length ? Math.max(...plansAll.map(wusdOf)) : 0;
  if (plansAll.length && maxW > 0 && maxW < 0.5) {
    $('#planTableWrap').insertAdjacentHTML('beforebegin',
      '<div class="cons-diff warn">🩹 检测到规划金额异常小（最大 ' + fmtWusd(maxW) + ' 万美金）——可能是旧版按<b>万美金</b>录入、升级时被误按美元换算。<button class="btn small primary" data-action="repair:wusd">一键修复（所有金额 ×10000）</button>　修复前已自动备份，若数字仍不对可到「分层备份→全量」核对。</div>');
  }

  // 团队配置
  const team = state.team || [];
  const tp = sum(team.filter(g => g.kind === 'po'), g => (g.headcount || 0) * (g.rate || 0));
  const to = sum(team.filter(g => g.kind === 'od'), g => (g.headcount || 0) * (g.rate || 0));
  let calib = '';
  if (team.length) {
    const poN = sum(team.filter(g => g.kind === 'po'), g => g.headcount || 0), odN = sum(team.filter(g => g.kind === 'od'), g => g.headcount || 0);
    calib = '<table class="cons-table" style="margin-top:8px">' +
      '<tr><td>PO 外包 ' + poN + ' 人 · 理论日额 / 本月理论（' + c.workdays(Math.max(c.curM, 1)) + ' 工作日 × 出勤 ' + (m.attendFactor != null ? m.attendFactor : 1) + '）</td><td>' + fmtCny(tp) + ' / ' + fmtCny(c.team.theoryPo(Math.max(c.curM, 1))) + '</td></tr>' +
      '<tr><td>OD 外包 ' + odN + ' 人 · 理论月额</td><td>' + fmtCny(to) + (c.odAvg > 0 && c.team.calibOd != null ? '（vs 近3月实际 ' + fmtCny(c.odAvg) + '，偏差 ' + fmtPct(c.team.calibOd) + '）' : '') + '</td></tr>' +
      (c.poAvg > 0 ? '<tr><td>vs 近3月 PO 实际月均</td><td>' + fmtCny(c.poAvg) + (c.team.calibPo != null ? '（偏差 ' + fmtPct(c.team.calibPo) + '）' : '') + '</td></tr>' : '') +
      '</table>' + ((Math.abs(c.team.calibPo || 0) > 0.1 || Math.abs(c.team.calibOd || 0) > 0.1) ? '<div class="cons-diff info">ℹ️ 理论与实际偏差超 10%：检查人数、单价或出勤系数。</div>' : '<div class="cons-diff ok">✓ 团队配置与历史实际吻合</div>');
  }
  $('#teamTableWrap').innerHTML = (!team.length ? '<div class="empty">还没有团队配置——不配也能用（预测退回历史外推），配上后扩编/缩编的下月预测立即准确。</div>' :
    '<table class="tbl"><thead><tr><th>组名</th><th>类型</th><th class="num">人数</th><th class="num">单价(¥)</th><th>花钱项目</th></tr></thead><tbody>' +
    team.map(g => '<tr><td><b>' + esc(g.name) + '</b></td><td><span class="st st-' + (g.kind === 'po' ? 'open' : 'accepted') + '">' + (g.kind === 'po' ? 'PO·日单价' : 'OD·月单价') + '</span></td><td class="num">' + (g.headcount || 0) + '</td><td class="num">' + fmtCny(g.rate || 0) + '</td><td>' + esc(g.project || '—') + '</td></tr>').join('') + '</tbody></table>') + calib;

  const pw = $('#planTableWrap');
  pw.innerHTML = !c.plansY.length ? '<div class="empty">' + Y + ' 年还没有规划项。</div>' :
    '<table class="tbl"><thead><tr><th>规划名称</th><th>编码</th><th class="num">金额(WUSD)</th><th class="num">折合¥</th><th class="num">目标%</th><th>备注</th><th>操作</th></tr></thead><tbody>' +
    c.plansY.map(p => '<tr><td><b>' + esc(p.name) + '</b></td>' +
      '<td><input data-pedit="' + p.id + '" data-f="code" value="' + esc(p.code || '') + '" placeholder="待关联" style="width:64px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;font-size:12px"></td>' +
      '<td class="num"><input data-pedit="' + p.id + '" data-f="amountW" value="' + (p.amountW != null ? p.amountW : '') + '" inputmode="decimal" style="width:70px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;font-size:12px;text-align:right"></td>' +
      '<td class="num" id="pcny-' + p.id + '">' + fmtCny(wusdOf(p) * 10000 * m.fxRate) + '</td>' +
      '<td class="num"><input data-pedit="' + p.id + '" data-f="target" value="' + (p.target != null ? Math.round(p.target * 100) : '') + '" inputmode="decimal" placeholder="默认" style="width:56px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;font-size:12px;text-align:right"></td>' +
      '<td>' + esc(p.note || '') + '</td>' +
      '<td style="white-space:nowrap"><button class="btn small" data-action="plan:del" data-id="' + p.id + '">删除</button></td></tr>').join('') + '</tbody></table>' +
    '<div class="muted" style="margin-top:6px">✏️ 金额/编码/目标可直接在表格里点开修改（万美金保留小数；目标留空=年度默认、0=不考核），改完点别处即自动保存。</div>';

  const gw = $('#grantTableWrap');
  const logs = [...(state.grantLogs || [])].sort((a, b) => a.date < b.date ? 1 : -1);
  gw.innerHTML = !logs.length ? '<div class="empty">还没有授予记录（可选，不录不影响主功能）。</div>' :
    '<table class="tbl"><thead><tr><th>日期</th><th>预算来源</th><th class="num">金额(CNY)</th><th>备注</th><th>操作</th></tr></thead><tbody>' +
    logs.map(g => '<tr><td>' + esc(g.date) + '</td><td>' + esc(g.code) + '</td><td class="num">' + fmtCny(g.amountCny) + '</td><td>' + esc(g.note || '') + '</td>' +
      '<td style="white-space:nowrap"><button class="btn small" data-action="grant:edit" data-id="' + esc(g.date) + '">编辑</button> <button class="btn small danger" data-action="grant:del" data-id="' + esc(g.date) + '">删除</button></td></tr>').join('') + '</tbody></table>';

  // 工作日历
  let wdHtml = '<div class="wd-grid">';
  for (let mo = 1; mo <= 12; mo++) {
    const v = (m.workdays && m.workdays[mo] != null && m.workdays[mo] !== '') ? m.workdays[mo] : '';
    wdHtml += '<label class="field"><span class="field-label">' + mo + '月 · 默认 ' + c.workdays(mo) + '</span><input type="number" min="15" max="31" data-wd="' + mo + '" value="' + v + '" placeholder="' + c.workdays(mo) + '"></label>';
  }
  const hY = HOLIDAYS[Y] ? Y + ' 年：官方放假安排（含调休）' : (LUNAR_FEST[Y] ? Y + ' 年：节假日引擎自动推算（含农历节日/清明公式；国务院调休拼假无法预知，约有2~4天/年误差）' : Y + ' 年：固定节日+周末法推算');
  $('#workdayForm').innerHTML = wdHtml + '</div><div class="btn-row" style="margin-top:10px"><button class="btn primary" data-action="wd:save">保存工作日</button><span class="muted">' + hY + '；通常无需手动调整，个别月不准可覆盖，留空用自动值。</span></div>';
}

/* ================= 弹窗 ================= */
function openModal(inner) {
  $('#modalRoot').innerHTML = '<div class="modal-overlay" data-action="modal:close"><div class="modal">' + inner + '</div></div>';
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modalRoot').innerHTML = ''; document.body.style.overflow = ''; }
const field = (label, inner) => '<label class="field"><span class="field-label">' + label + '</span>' + inner + '</label>';

function planModal(p) {
  const isNew = !p;
  p = p || { name: '', code: '', amountW: '', note: '' };
  openModal('<h3>' + (isNew ? '新增规划项' : '编辑规划项') + '</h3><div class="form-grid">' +
    field('规划名称（年初口径）', '<input id="f-name" type="text" value="' + esc(p.name) + '">') +
    field('金额（WUSD·万美金，可带小数）', '<input id="f-amount" type="text" inputmode="decimal" value="' + (p.amountW != null && p.amountW !== '' ? p.amountW : '') + '" placeholder="如 5.5 = $55,000">') +
    field('平台编码（可留空，授予后关联）', '<input id="f-code" type="text" value="' + esc(p.code || '') + '" placeholder="如 111">') +
    field('执行率目标（%）', '<input id="f-target" type="text" inputmode="decimal" value="' + (p.target != null ? Math.round(p.target * 100) : '') + '" placeholder="留空=年度默认；0=不考核，如 100 / 92">') +
    field('备注', '<input id="f-note" type="text" value="' + esc(p.note || '') + '">') +
    '</div><div class="modal-actions"><button class="btn" data-action="modal:close">取消</button><button class="btn primary" data-action="plan:save" data-id="' + (isNew ? '' : p.id) + '">保存</button></div>');
}
function grantModal(g) {
  const isNew = !g;
  g = g || { date: todayStr(), code: '', amountCny: '', note: '' };
  const c0 = calc();
  const codeOpts = [...new Set(c0.codes.concat((state.plans || []).map(p => p.code).filter(Boolean)))];
  openModal('<h3>' + (isNew ? '记一笔授予' : '编辑授予') + '</h3><div class="form-grid">' +
    field('日期', '<input id="f-date" type="date" value="' + esc(g.date) + '">') +
    field('预算来源编码', '<input id="f-code" type="text" list="codeList" value="' + esc(g.code) + '" placeholder="选择或输入编码"><datalist id="codeList">' + codeOpts.map(x => '<option value="' + esc(x) + '">' + esc((c0.snap && c0.snap.rows[x] && c0.snap.rows[x].name) || '') + '</option>').join('') + '</datalist>') +
    field('金额（CNY）', '<input id="f-amount" type="text" inputmode="decimal" value="' + (g.amountCny || '') + '" placeholder="如 15万">') +
    field('备注', '<input id="f-note" type="text" value="' + esc(g.note || '') + '">') +
    '</div><div class="modal-actions"><button class="btn" data-action="modal:close">取消</button><button class="btn primary" data-action="grant:save" data-id="' + (isNew ? '' : esc(g.date)) + '">保存</button></div>');
}
function planPasteModal() {
  openModal('<h3>批量粘贴规划</h3>' +
    '<div class="muted" style="margin-bottom:8px">每行一个规划项，格式：<b>名称, 金额WUSD[, 编码][, 目标%]</b>（逗号/制表符分隔；金额单位<b>万美金</b>保留小数，如 5.5；≥1000 视为美元自动换算；目标留空=年度默认、0=不考核）。年初从清单粘贴新建；新年粘贴后改金额。<b>替换</b>按名称保留已有编码关联。</div>' +
    '<textarea id="pastePlans" rows="9" placeholder="盘古平台建设, 50000\n智能运维中台, 3万\n数据治理专项, 20000, 333"></textarea>' +
    '<div id="planPastePreview"></div>' +
    '<div class="modal-actions"><button class="btn" data-action="modal:close">取消</button>' +
    '<button class="btn" data-action="plan:pasteGo" data-mode="append">追加到本年</button>' +
    '<button class="btn primary" data-action="plan:pasteGo" data-mode="replace">替换本年规划</button></div>');
  $('#pastePlans').addEventListener('input', renderPlanPastePreview);
  renderPlanPastePreview();
}
function parsePlanLines(text) {
  return String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split(/[\t,，]+/).map(s => s.trim());
    let target = null;
    if (parts[3] != null && parts[3] !== '') { const tv = parseFloat(parts[3]); if (Number.isFinite(tv) && tv >= 0 && tv <= 100) target = tv / 100; }
    return { name: parts[0] || '', amountW: parseWusd(parts[1]) || 0, code: parts[2] || '', target };
  }).filter(x => x.name);
}
function renderPlanPastePreview() {
  const rows = parsePlanLines($('#pastePlans').value);
  $('#planPastePreview').innerHTML = rows.length
    ? '<div class="muted" style="margin:8px 0 4px">识别 ' + rows.length + ' 项：</div><div class="paste-preview"><table>' +
      rows.map(r => '<tr><td>' + esc(r.name) + '</td><td>' + fmtWusd(r.amountW) + '</td><td>' + esc(r.code || '—') + '</td><td>' + (r.target == null ? '默认' : r.target === 0 ? '不考核' : fmtPct(r.target)) + '</td></tr>').join('') + '</table></div>'
    : '';
}
function planPasteGo(mode) {
  const rows = parsePlanLines($('#pastePlans').value);
  if (!rows.length) { alert('未识别到任何规划项，检查格式：名称, 金额USD[, 编码]'); return; }
  const Y = curYear();
  if (mode === 'replace') {
    if (plansOf(Y).length && !confirm('替换将覆盖 ' + Y + ' 年现有 ' + plansOf(Y).length + ' 项规划（按名称保留编码关联），确认？')) return;
    const old = plansOf(Y);
    const kept = [];
    rows.forEach(r => {
      const hit = old.find(o => o.name === r.name || (r.code && o.code === r.code));
      kept.push({ id: hit ? hit.id : uid(), year: Y, code: r.code || (hit ? hit.code : ''), name: r.name, amountW: r.amountW, target: r.target, note: hit ? hit.note : '' });
    });
    state.plans = state.plans.filter(p => p.year !== Y).concat(kept);
  } else {
    rows.forEach(r => state.plans.push({ id: uid(), year: Y, code: r.code, name: r.name, amountW: r.amountW, target: r.target, note: '' }));
  }
  touch('plan'); save(); closeModal();
  alert('已' + (mode === 'replace' ? '替换' : '追加') + ' ' + rows.length + ' 项规划（' + Y + ' 年）。');
}
function parseTeamLines(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = lines[0].split(/[\t,，]+/).map(s => s.trim());
  const looksHeader = first.some(c => /名称|角色|组名|职位/.test(c)) && first.some(c => /人数|数量|人日/.test(c));
  let idx = { name: 0, kind: -1, count: 1, rate: 2, project: -1 }, rateHint = null, out = [];
  if (looksHeader) {
    first.forEach((c, i) => {
      if (/名称|角色|组名|职位/.test(c)) idx.name = i;
      else if (/类型|渠道|分类/.test(c)) idx.kind = i;
      else if (/人数|数量/.test(c)) idx.count = i;
      else if (/单价|价格|费用|日费|月费/.test(c)) { idx.rate = i; if (/月/.test(c)) rateHint = 'od'; else if (/日/.test(c)) rateHint = 'po'; }
      else if (/项目|部门|团队/.test(c)) idx.project = i;
    });
    lines.shift();
  }
  lines.forEach(l => {
    const parts = l.split(/[\t,，]+/).map(s => s.trim());
    const name = parts[idx.name] || '';
    if (!name) return;
    const count = parseInt(parts[idx.count], 10) || 0;
    const rate = parseMoney(parts[idx.rate]) || 0;
    let kind = rateHint || 'po';
    if (idx.kind >= 0 && parts[idx.kind]) kind = /od|OD/.test(parts[idx.kind]) ? 'od' : 'po';
    out.push({ kind, name, headcount: count, rate, project: idx.project >= 0 ? (parts[idx.project] || '') : '' });
  });
  return out;
}
function parseTeamTable(rows) {
  return parseTeamLines(rows.map(r => r.join('\t')).join('\n'));
}
function teamPasteModal() {
  openModal('<h3>批量导入团队配置</h3>' +
    '<div class="muted" style="margin-bottom:8px">在你的团队 Excel 里<b>全选数据区域复制</b>（可含表头：名称/类型/人数/单价/项目，自动识别列）粘贴到下面。<b>替换</b>=以粘贴内容为准重建团队配置（以后人员变更只改 Excel 重新粘贴即可）。</div>' +
    '<textarea id="pasteTeam" rows="9" placeholder="类型\t名称\t人数\t单价\t项目\npo\t高级开发\t3\t2200\t花钱项目A\nod\tOD工程师\t2\t42000\t花钱项目A\n\n（或直接粘贴 Excel 区域，首行为表头：姓名/角色/人数/日单价/月单价…）"></textarea>' +
    '<div id="teamPastePreview"></div>' +
    '<div class="modal-actions"><button class="btn" data-action="modal:close">取消</button>' +
    '<button class="btn" data-action="team:pasteGo" data-mode="append">追加</button>' +
    '<button class="btn primary" data-action="team:pasteGo" data-mode="replace">替换全部</button></div>');
  $('#pasteTeam').addEventListener('input', renderTeamPastePreview);
  renderTeamPastePreview();
}
function renderTeamPastePreview() {
  const rows = parseTeamLines($('#pasteTeam').value);
  $('#teamPastePreview').innerHTML = rows.length
    ? '<div class="muted" style="margin:8px 0 4px">识别 ' + rows.length + ' 组（月度理论：' + fmtCny(sum(rows.filter(r => r.kind === 'od'), r => r.headcount * r.rate)) + '/OD，' + fmtCny(sum(rows.filter(r => r.kind === 'po'), r => r.headcount * r.rate)) + '/PO日额）：</div>' +
      '<div class="paste-preview"><table>' + rows.map(r => '<tr><td>' + esc(r.name) + '</td><td>' + (r.kind === 'po' ? 'PO·日单价' : 'OD·月单价') + '</td><td>' + r.headcount + '</td><td>' + fmtCny(r.rate) + '</td><td>' + esc(r.project || '—') + '</td></tr>').join('') + '</table></div>'
    : '';
}
function teamPasteGo(mode) {
  const rows = parseTeamLines($('#pasteTeam').value);
  if (!rows.length) { alert('未识别到任何人员组，检查格式或表头'); return; }
  if (mode === 'replace') {
    if (state.team.length && !confirm('替换将覆盖现有 ' + state.team.length + ' 组团队配置，确认？')) return;
    state.team = rows.map(r => ({ id: uid(), ...r }));
  } else rows.forEach(r => state.team.push({ id: uid(), ...r }));
  save(); closeModal();
  alert('已' + (mode === 'replace' ? '替换' : '追加') + ' ' + rows.length + ' 组团队配置。');
}
function teamModal(g) {
  const isNew = !g;
  g = g || { kind: 'po', name: '', headcount: '', rate: '', project: '' };
  openModal('<h3>' + (isNew ? '新增人员组' : '编辑人员组') + '</h3><div class="form-grid">' +
    field('组名（如 高级开发 / 初级测试）', '<input id="f-name" type="text" value="' + esc(g.name) + '">') +
    field('类型', '<select id="f-kind"><option value="po"' + (g.kind === 'po' ? ' selected' : '') + '>PO 外包（按日单价）</option><option value="od"' + (g.kind === 'od' ? ' selected' : '') + '>OD 外包（按月单价）</option></select>') +
    field('人数', '<input id="f-headcount" type="number" min="0" step="1" value="' + (g.headcount || '') + '">') +
    field('单价（¥，PO填日单价 / OD填月单价）', '<input id="f-rate" type="text" inputmode="decimal" value="' + (g.rate || '') + '" placeholder="如 2200 或 4.2万">') +
    field('所属花钱项目（可选）', '<input id="f-project" type="text" value="' + esc(g.project || '') + '">') +
    '</div><div class="modal-actions"><button class="btn" data-action="modal:close">取消</button><button class="btn primary" data-action="team:save" data-id="' + (isNew ? '' : g.id) + '">保存</button></div>');
}
function buildSharePkg(includePo, includeTeam) {
  return {
    budgetDashShare: 1,
    exportedAt: todayStr() + ' ' + new Date().toTimeString().slice(0, 5),
    state: {
      schemaVersion: 3,
      meta: state.meta, years: state.years, plans: state.plans,
      team: includeTeam ? state.team : [],
      grantLogs: state.grantLogs, execSnaps: state.execSnaps,
      poDataByYear: includePo ? state.poDataByYear : {},
      updatedAt: state.updatedAt
    }
  };
}
function publishModal() {
  openModal('<h3>📤 发布分享快照</h3>' +
    '<div class="muted" style="margin-bottom:10px">生成 <b>data.json</b> 放到你本机服务目录（与 index.html 同目录，如 python3 -m http.server 8734 的目录）。同事打开 http://你的IP:8734 即进入<b>只读分享模式</b>（横幅标注数据截至时间，无任何编辑按钮）。再次发布覆盖 data.json 即更新，主数据仍只在你浏览器里。</div>' +
    '<label class="check"><input type="checkbox" id="pub-po" checked> 包含 PO 明细（编号/金额/执行/状态）</label>' +
    '<label class="check"><input type="checkbox" id="pub-team"> 包含团队配置（人数与单价，敏感，默认不包含）</label>' +
    '<div class="modal-actions"><button class="btn" data-action="modal:close">取消</button><button class="btn primary" data-action="publish:go">生成 data.json</button></div>');
}
function doPublish() {
  const pkg = buildSharePkg($('#pub-po').checked, $('#pub-team').checked);
  const blob = new Blob([JSON.stringify(pkg)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'data.json'; a.click(); URL.revokeObjectURL(a.href);
  closeModal();
  alert('已生成 data.json。请把它放到你的服务目录（与 index.html 同目录），同事们刷新页面即可看到本次发布的数据。');
}
async function saveToDataFile() {
  const data = JSON.stringify({ type: 'budget-dash-full', ...state }, null, 2);
  if (window.showSaveFilePicker) {
    try {
      if (!fileHandle) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: 'budget.json',
          types: [{ description: '预算看板数据（JSON）', accept: { 'application/json': ['.json'] } }]
        });
      }
      const w = await fileHandle.createWritable();
      await w.write(data);
      await w.close();
      try { await idbSet('fh', fileHandle); } catch (e) { }
      recentHandle = fileHandle;
      alert('已保存到 ' + (fileHandle.name || 'budget.json') + '。\n\n建议保存到仓库 data/budget.json，随 git 同步；本会话内再次保存无需重选位置。');
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // 用户取消
      fileHandle = null;                          // 句柄失效，走下载兜底
    }
  }
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'budget.json'; a.click(); URL.revokeObjectURL(a.href);
  alert('当前浏览器不支持直接写文件，已下载 budget.json——请手动覆盖到仓库 data/ 目录。');
}
function exportModal() {
  openModal('<h3>分层备份</h3>' +
    '<div class="muted" style="margin-bottom:10px">三类备份包，恢复时自动识别：全量（配置+数据，灾备用）；仅配置（规划+团队+参数——换电脑/换浏览器先导它）；仅数据（执行表快照+PO明细+授予流水，归档用）。文件只存在你本机。</div>' +
    '<div class="btn-row" style="justify-content:center;gap:12px">' +
    '<button class="btn primary" data-action="export:full">📦 全量备份</button>' +
    '<button class="btn" data-action="export:config">⚙️ 仅配置</button>' +
    '<button class="btn" data-action="export:data">📊 仅数据</button></div>' +
    '<div class="modal-actions"><button class="btn" data-action="modal:close">关闭</button></div>');
}
function doExport(kind) {
  let obj, name;
  if (kind === 'config') { obj = { type: 'budget-dash-config', schemaVersion: 3, meta: state.meta, years: state.years, plans: state.plans, team: state.team }; name = '预算看板-配置'; }
  else if (kind === 'data') { obj = { type: 'budget-dash-data', schemaVersion: 3, execSnaps: state.execSnaps, poDataByYear: state.poDataByYear, grantLogs: state.grantLogs }; name = '预算看板-数据'; }
  else { obj = { type: 'budget-dash-full', ...state }; name = '预算看板-全量'; }
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name + '-' + todayStr() + '.json'; a.click(); URL.revokeObjectURL(a.href);
  closeModal();
}
function exclModal() {
  const c = calc();
  const items = (c.excluded || []).map(code => '<tr><td><b>' + esc(code) + '</b></td><td>' + esc((c.snap && c.snap.rows[code] && c.snap.rows[code].name) || '—') + '</td>' +
    '<td>' + fmtCny(c.snap && c.snap.rows[code] ? ((c.snap.rows[code].itw.exec || 0) + (c.snap.rows[code].od.exec || 0)) : 0) + '</td>' +
    '<td><button class="btn small" data-action="excl:del" data-id="' + esc(code) + '">恢复参与计算</button></td></tr>').join('');
  openModal('<h3>剔除项管理（' + c.Y + ' 年度）</h3>' +
    '<div class="muted" style="margin-bottom:8px">剔除 = 不参与看板计算（执行率/可用/PO 统计），适用于：不在本年规划的预算项、别人挂靠的预算项及其 PO。数据仍保留，恢复即回。</div>' +
    (items ? '<table class="tbl" id="exclList"><thead><tr><th>编码</th><th>名称</th><th class="num">已执行(未计)</th><th>操作</th></tr></thead><tbody>' + items + '</tbody></table>' : '<div class="empty">当前没有剔除项。到「预算来源」页，未关联的行上有 🚫剔除 按钮。</div>') +
    '<div class="modal-actions"><button class="btn" data-action="modal:close">关闭</button></div>');
}
function linkModal() {
  const c = calc();
  if (!c.snap) { alert('请先导入执行表'); return; }
  const unlinked = plansOf(curYear()).filter(p => !p.code);
  const rowsHtml = c.codes.map(code => {
    const s = c.per[code];
    const cur = s.plan;
    return '<tr><td><b>' + esc(s.name) + '</b> [' + esc(code) + ']</td>' +
      '<td>' + (cur ? '✓ 已关联「' + esc(cur.name) + '」' :
        '<select data-linkcode="' + esc(code) + '"><option value="">— 选择规划项 —</option>' +
        unlinked.map(p => '<option value="' + p.id + '">' + esc(p.name) + ' ' + fmtWusd(wusdOf(p)) + 'W$</option>').join('') +
        '<option value="__new__">＋ 新建规划项</option></select>') + '</td></tr>';
  }).join('');
  openModal('<h3>编码关联</h3>' +
    '<div class="muted" style="margin-bottom:8px">把平台出现的预算来源编码关联到年初规划项；关联后自动合并计算。名称不一致没关系（两边名称都会显示）。</div>' +
    '<table class="tbl"><thead><tr><th>平台预算来源</th><th>关联</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '<div class="modal-actions"><button class="btn" data-action="modal:close">完成</button></div>');
}

/* ================= 示例数据 ================= */
function demoState() {
  const y = new Date().getFullYear(), t = todayStr();
  const S = (itw, od) => ({ itw: { prior: itw[0], granted: itw[1], avail: itw[2], exec: itw[3], fc: itw[4], remain: itw[5] }, od: { prior: od[0], granted: od[1], avail: od[2], exec: od[3], fc: od[4], remain: od[5] } });
  const snap2 = {   // 最新（11-18 导入）
    date: y + '-11-18',
    rows: {
      '111': { name: '智能平台预算A', ...S([20000, 250000, 270000, 150000, 60000, 60000], [0, 0, 12000, 10000, 0, 2000]) },
      '222': { name: '智能运维预算B', ...S([0, 200000, 200000, 100000, 70000, 30000], [0, 0, 8000, 6000, 0, 2000]) },
      '333': { name: '新出现预算C', ...S([0, 80000, 80000, 20000, 30000, 30000], [0, 0, 0, 0, 0, 0]) },
      '444': { name: '安全合规预算D', ...S([10000, 80000, 90000, 55000, 30000, 5000], [0, 0, 0, 0, 0, 0]) }
    }
  };
  const snap1 = {   // 上月（10-31 导入，OD 供差值）
    date: y + '-10-31',
    rows: {
      '111': { name: '智能平台预算A', ...S([20000, 250000, 270000, 150000, 60000, 60000], [0, 0, 12000, 6000, 0, 6000]) },
      '222': { name: '智能运维预算B', ...S([0, 200000, 200000, 100000, 70000, 30000], [0, 0, 8000, 0, 0, 8000]) },
      '333': { name: '新出现预算C', ...S([0, 80000, 80000, 20000, 30000, 30000], [0, 0, 0, 0, 0, 0]) },
      '444': { name: '安全合规预算D', ...S([10000, 80000, 90000, 55000, 30000, 5000], [0, 0, 0, 0, 0, 0]) }
    }
  };
  return {
    schemaVersion: 3,
    meta: { year: y, updateFreqDays: 14 },
    years: { [y]: { fxRate: 7.03, execRateTarget: 0.95, bonusMonths: 3.5, attendFactor: 1, workdays: {}, lastHcCheck: y + '-10-15' } },
    team: [
      { id: 'tg1', kind: 'po', name: '高级开发', headcount: 1, rate: 2000, project: '花钱项目A' },
      { id: 'tg2', kind: 'po', name: '初级开发', headcount: 1, rate: 1100, project: '花钱项目B' },
      { id: 'tg3', kind: 'od', name: 'OD工程师', headcount: 1, rate: 10500, project: '花钱项目A' }
    ],
    plans: [
      { id: 'pl1', year: y, code: '111', name: '盘古平台建设', amountW: 5, target: 1, note: '要求100%' },
      { id: 'pl2', year: y, code: '222', name: '智能运维中台', amountW: 3, note: '' },
      { id: 'pl3', year: y, code: '', name: '数据治理专项', amountW: 2.5, target: 0, note: '不考核，等授予后关联' },
      { id: 'pl4', year: y, code: '444', name: '安全合规加固', amountW: 1.5, target: 0.92, note: '目标92%' }
    ],
    grantLogs: [
      { date: y + '-03-15', code: '111', amountCny: 150000, note: '首批' },
      { date: y + '-08-20', code: '111', amountCny: 100000, note: '' },
      { date: y + '-04-10', code: '222', amountCny: 200000, note: '' },
      { date: y + '-06-05', code: '444', amountCny: 80000, note: '' }
    ],
    execSnaps: [snap1, snap2],
    poDataByYear: { [y]: {
      updatedAt: t, asOf: 11,
      rows: [
        { poNo: 'PO-001', resName: '三月人力外包', status: 'CLOSED', startDate: y + '-03-01', amount: 120000, itProject: '花钱项目A', budgetCode: '111', months: { 3: 50000, 4: 40000, 5: 30000 } },
        { poNo: 'PO-003', resName: '十月算力扩容', status: 'OPEN', startDate: y + '-10-01', amount: 90000, itProject: '花钱项目A', budgetCode: '111', months: { 10: 30000, 11: 35000, 12: 25000 } },
        { poNo: 'PO-002', resName: '五月平台开发', status: 'CLOSED', startDate: y + '-05-01', amount: 100000, itProject: '花钱项目B', budgetCode: '222', months: { 5: 60000, 6: 40000 } },
        { poNo: 'PO-004', resName: '十一月运维支持', status: 'OPEN', startDate: y + '-11-01', amount: 70000, itProject: '花钱项目B', budgetCode: '222', months: { 11: 45000, 12: 25000 } },
        { poNo: 'PO-006', resName: '十月治理咨询', status: 'OPEN', startDate: y + '-10-01', amount: 50000, itProject: '花钱项目B', budgetCode: '333', months: { 10: 20000, 11: 20000, 12: 10000 } },
        { poNo: 'PO-005', resName: '六月安全评估', status: 'CLOSED', startDate: y + '-06-01', amount: 55000, itProject: '花钱项目A', budgetCode: '444', months: { 6: 30000, 7: 25000 } },
        { poNo: 'PO-007', resName: '十一月渗透测试', status: 'OPEN', startDate: y + '-11-01', amount: 30000, itProject: '花钱项目A', budgetCode: '444', months: { 11: 18000, 12: 12000 } }
      ]
    } },
    updatedAt: { plan: t, grants: t, exec: t, po: t }
  };
}

/* ================= 事件 ================= */
async function handleAction(action, el, e) {
  const id = el.dataset.id;
  if (action === 'modal:close') { if (e.target === el) closeModal(); return; }
  if (action === 'goto:data') return switchTab('data');

  if (action === 'import:open') return importModal();
  if (action === 'import:pick') { const inp = $('#fileInput'); if (inp) inp.click(); return; }
  if (action === 'import:all') return importAll();
  if (action === 'act:toggle') {
    const st = actsStore(), h = el.dataset.h;
    if (st[h] && st[h].slice(0, 7) === todayStr().slice(0, 7)) delete st[h]; else st[h] = todayStr();
    localStorage.setItem('budgetDash.acts', JSON.stringify(st));
    renderNow();
    return;
  }
  if (action === 'hc:confirm') { state.meta.lastHcCheck = todayStr(); save(); return; }
  if (action === 'team:add') return teamModal(null);
  if (action === 'team:paste') return teamPasteModal();
  if (action === 'team:pasteGo') return teamPasteGo(el.dataset.mode);
  if (action === 'team:edit') return teamModal((state.team || []).find(g => g.id === id));
  if (action === 'team:del') {
    if (confirm('删除该人员组？')) { state.team = state.team.filter(g => g.id !== id); save(); }
    return;
  }
  if (action === 'team:save') {
    const name = $('#f-name').value.trim(), kind = $('#f-kind').value;
    const headcount = parseInt($('#f-headcount').value, 10) || 0, rate = parseMoney($('#f-rate').value);
    if (!name) { alert('请填写组名'); return; }
    if (rate == null || rate <= 0) { alert('请填写有效单价'); return; }
    const project = $('#f-project').value.trim();
    if (id) Object.assign(state.team.find(g => g.id === id), { name, kind, headcount, rate, project });
    else state.team.push({ id: uid(), name, kind, headcount, rate, project });
    save(); closeModal();
    return;
  }
  if (action === 'data:saveFile') return saveToDataFile();
  if (action === 'data:openFile') return openDataFile();
  if (action === 'dataset:set') return setDatasetDir();
  if (action === 'excl:add') {
    const c0 = calc();
    const name = (c0.snap && c0.snap.rows[id] && c0.snap.rows[id].name) || id;
    if (!confirm('剔除「' + name + ' [' + id + ']」？\n\n剔除后：该预算来源的执行/可用/剩余、以及花它的钱的 PO，全部不参与看板计算（' + c0.Y + ' 年度生效）。\n数据仍保留在快照中，可随时恢复。')) return;
    const yp = yearParams(curYear());
    yp.excluded = yp.excluded || [];
    if (yp.excluded.indexOf(id) < 0) yp.excluded.push(id);
    state.years[curYear()] = yp;
    save();
    return;
  }
  if (action === 'excl:del') {
    const yp = yearParams(curYear());
    yp.excluded = (yp.excluded || []).filter(x => x !== id);
    state.years[curYear()] = yp;
    save();
    if ($('#exclList')) exclModal();
    return;
  }
  if (action === 'excl:manage') return exclModal();
  if (action === 'dataset:scan') return scanDataset(true);
  if (action === 'data:openRecent') {
    if (!recentHandle) return;
    try {
      const perm = await recentHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') { await loadFromHandle(recentHandle); } else alert('未授权访问文件');
    } catch (e) { alert('载入失败：' + e.message); }
    return;
  }
  if (action === 'data:export') return exportModal();
  if (action === 'data:publish') return publishModal();
  if (action === 'publish:go') return doPublish();
  if (action === 'export:full') return doExport('full');
  if (action === 'export:config') return doExport('config');
  if (action === 'export:data') return doExport('data');
  if (action === 'wd:save') {
    const wd = {};
    $$('[data-wd]').forEach(inp => { const v = inp.value.trim(); if (v !== '') wd[+inp.dataset.wd] = +v; });
    const yp = yearParams(curYear());
    state.years[curYear()] = Object.assign({}, yp, { workdays: wd });
    save(); alert('工作日已保存（' + curYear() + ' 年）');
    return;
  }

  if (action === 'repair:wusd') {
    const plansAll = state.plans || [];
    if (!plansAll.length) return;
    if (!confirm('将所有规划金额 ×10000 恢复为你当时录入的万美金数字。\n\n注意：旧版录入时小数会被四舍五入（如 5.5 → 6），修复后请对照清单核对。\n修复前会自动备份当前数据。确认执行？')) return;
    try { localStorage.setItem('budgetDash.autobak', JSON.stringify({ t: todayStr() + ' ' + new Date().toTimeString().slice(0, 5), data: state })); } catch (e) { }
    plansAll.forEach(p => { p.amountW = Math.round(wusdOf(p) * 10000 * 10000) / 10000; });
    touch('plan'); save();
    alert('已修复 ' + plansAll.length + ' 项规划金额（×10000）。请到规划表核对数值，小数位如与清单不符请手动改。');
    return;
  }
  if (action === 'plan:add') return planModal(null);
  if (action === 'plan:paste') return planPasteModal();
  if (action === 'plan:pasteGo') return planPasteGo(el.dataset.mode);
  if (action === 'plan:edit') return planModal(state.plans.find(p => p.id === id));
  if (action === 'plan:del') {
    const p = state.plans.find(x => x.id === id);
    if (p && confirm('删除规划项「' + p.name + '」？')) { state.plans = state.plans.filter(x => x.id !== id); touch('plan'); save(); }
    return;
  }
  if (action === 'plan:save') {
    const name = $('#f-name').value.trim(), amountW = parseWusd($('#f-amount').value);
    if (!name) { alert('请填写规划名称'); return; }
    if (amountW == null || amountW <= 0) { alert('请填写有效的万美金金额（如 5.5）'); return; }
    const code = $('#f-code').value.trim(), note = $('#f-note').value.trim();
    const tRaw = $('#f-target').value.trim();
    let target = null;
    if (tRaw !== '') {
      const tv = parseFloat(tRaw);
      if (!Number.isFinite(tv) || tv < 0 || tv > 100) { alert('执行率目标应为 0~100 的数字，或留空跟随年度默认'); return; }
      target = tv / 100;
    }
    if (id) Object.assign(state.plans.find(p => p.id === id), { name, amountW, code, target, note });
    else state.plans.push({ id: uid(), year: curYear(), name, amountW, code, target, note });
    touch('plan'); save(); closeModal();
    return;
  }
  if (action === 'link:manage') return linkModal();

  if (action === 'grant:add') return grantModal(null);
  if (action === 'grant:edit') return grantModal(state.grantLogs.find(g => g.date === id));
  if (action === 'grant:del') {
    if (confirm('删除 ' + id + ' 的授予记录？')) { state.grantLogs = state.grantLogs.filter(g => g.date !== id); touch('grants'); save(); }
    return;
  }
  if (action === 'grant:save') {
    const date = $('#f-date').value, code = $('#f-code').value.trim(), amount = parseMoney($('#f-amount').value);
    if (!date) { alert('请选择日期'); return; }
    if (!code) { alert('请填写预算来源编码'); return; }
    if (amount == null || amount <= 0) { alert('请填写有效金额'); return; }
    const note = $('#f-note').value.trim();
    const ex = state.grantLogs.find(g => g.date === date);
    if (ex) Object.assign(ex, { date, code, amountCny: amount, note });
    else state.grantLogs.push({ date, code, amountCny: amount, note });
    state.grantLogs.sort((a, b) => a.date < b.date ? -1 : 1);
    touch('grants'); save(); closeModal();
    return;
  }

  if (action === 'meta:save') {
    const tg = parseFloat($('#meta-target').value), fx = parseFloat($('#meta-fx').value), bo = parseFloat($('#meta-bonus').value), fq = parseInt($('#meta-freq').value, 10), at = parseFloat($('#meta-attend').value);
    if (!(tg >= 50 && tg <= 100)) { alert('执行率目标应在 50~100'); return; }
    if (!(fx > 0 && fx < 20)) { alert('汇率无效'); return; }
    if (!(bo >= 0 && bo <= 12)) { alert('年终奖倍数应在 0~12'); return; }
    if (!(fq >= 1 && fq <= 60)) { alert('更新频率应在 1~60 天'); return; }
    if (!Number.isFinite(at) || at < 0.5 || at > 1.5) { alert('出勤系数应在 0.5~1.5'); return; }
    const yp = yearParams(curYear());
    state.years[curYear()] = { fxRate: fx, execRateTarget: tg / 100, bonusMonths: bo, attendFactor: at, workdays: yp.workdays || {}, lastHcCheck: yp.lastHcCheck || '' };
    state.meta.updateFreqDays = fq;
    save(); alert('参数已保存（' + curYear() + ' 年度）'); return;
  }
  if (action === 'year:prev') { switchYear(curYear() - 1); return; }
  if (action === 'year:next') { switchYear(curYear() + 1); return; }
  if (action === 'year:start') {
    const Y = curYear();
    const from = (state.plans.some(p => p.year === Y - 1) || (state.poDataByYear || {})[Y - 1] || state.execSnaps.some(s => inYear(s.date, Y - 1))) ? Y - 1 : (state.plans.length ? Math.max(...state.plans.map(p => p.year)) : null);
    if (from == null) { alert('没有可复制的上一年数据，请直接录入规划'); return; }
    if (state.plans.some(p => p.year === Y)) { alert(Y + ' 年已有规划，无需开启'); return; }
    if (!confirm('开启 ' + Y + ' 年度：复制 ' + from + ' 年的规划（编码关联沿用、金额可再调）与年度参数（团队配置共用），确认？')) return;
    plansOf(from).forEach(p => state.plans.push({ id: uid(), year: Y, code: p.code, name: p.name, amountUsd: p.amountUsd, note: '复制自' + from }));
    state.years[Y] = Object.assign({}, yearParams(from), { lastHcCheck: '' });
    touch('plan'); save();
    alert(Y + ' 年度已开启：规划 ' + plansOf(Y).length + ' 项已复制。请到「数据管理」核对金额与汇率，然后正常导入新年数据。');
    return;
  }
  if (action === 'data:export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '预算看板数据-' + todayStr() + '.json'; a.click(); URL.revokeObjectURL(a.href);
    return;
  }
  if (action === 'data:importBtn') { $('#importFile').click(); return; }
  if (action === 'data:demo') {
    if ((state.plans.length || state.execSnaps.length) && !confirm('加载示例数据将覆盖当前全部数据，确认？')) return;
    state = demoState(); save(); return;
  }
  if (action === 'data:clear') {
    if (!confirm('确认清空全部数据？建议先导出备份。')) return;
    if (!confirm('再次确认：清空后无法恢复。')) return;
    state = defaultState(); save(); return;
  }
}

function switchYear(y) {
  if (!(y >= 2000 && y <= 2100)) return;
  state.meta.year = y;
  if (!state.years[y]) state.years[y] = defaultYearParams();
  saveSilent();
  renderAll();
}
function switchTab(tab) {
  $$('#tabNav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  if (tab === 'now') renderNow();
}

document.addEventListener('click', e => {
  const navBtn = e.target.closest('#tabNav button[data-tab]');
  if (navBtn) { switchTab(navBtn.dataset.tab); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.classList.contains('modal-overlay') && !e.target.classList.contains('modal-overlay')) return;
  handleAction(el.dataset.action, el, e);
});
document.addEventListener('change', e => {
  if (e.target.id === 'snapDate' && importCtx) { importCtx.snapDate = e.target.value; return; }
  if (e.target.matches('[data-fkind]') && importCtx) { importCtx.files[+e.target.dataset.fkind].kind = e.target.value; return; }
  if (e.target.matches('[data-pedit]')) {   // 规划表内联编辑（失焦保存）
    const id2 = e.target.dataset.pedit, f = e.target.dataset.f, p = state.plans.find(x => x.id === id2);
    if (!p) return;
    const v = e.target.value.trim();
    if (f === 'amountW') {
      const w = parseWusd(v);
      if (w == null || w <= 0) { alert('金额无效（万美金，如 5.5）'); e.target.value = p.amountW != null ? p.amountW : ''; return; }
      p.amountW = w;
    } else if (f === 'code') {
      p.code = v || '';
    } else if (f === 'target') {
      if (v === '') p.target = null;
      else { const tv = parseFloat(v); if (!Number.isFinite(tv) || tv < 0 || tv > 100) { alert('目标应为 0~100 或留空'); e.target.value = p.target != null ? Math.round(p.target * 100) : ''; return; } p.target = tv / 100; }
    }
    touch('plan'); saveSilent();
    const cnyCell = $('#pcny-' + id2);
    if (cnyCell) cnyCell.textContent = fmtCny(wusdOf(p) * 10000 * yearParams(curYear()).fxRate);
    renderBanner();
    return;
  }
  if (e.target.matches('[data-linkcode]')) {
    const code = e.target.dataset.linkcode, v = e.target.value;
    if (v === '__new__') {
      const name = prompt('新规划项名称（将关联平台编码 ' + code + '）：');
      if (!name) { e.target.value = ''; return; }
      const amt = parseWusd(prompt('金额（WUSD·万美金，如 5.5）：', '0') || '0') || 0;
      state.plans.push({ id: uid(), year: curYear(), code, name, amountW: amt, note: '' });
    } else if (v) {
      const p = state.plans.find(x => x.id === v);
      if (p) p.code = code;
    } else return;
    touch('plan'); save(); linkModal();
    return;
  }
  if (e.target.id === 'importFile') {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let obj = JSON.parse(reader.result);
        if (obj && obj.schemaVersion === 2) obj = migrate(obj);   // 旧版备份自动升级
        if (!obj || obj.schemaVersion !== 3) throw new Error('格式不符');
        if (obj.type === 'budget-dash-config') {
          if (!confirm('恢复配置包：将覆盖当前的规划、团队配置和参数（不影响已导入数据），确认？')) return;
          state.meta = Object.assign({}, state.meta, obj.meta);
          state.years = obj.years || state.years;
          state.plans = obj.plans || []; state.team = obj.team || [];
          save(); alert('配置已恢复');
        } else if (obj.type === 'budget-dash-data') {
          if (!confirm('恢复数据包：将覆盖执行表快照、PO明细和授予流水（不影响配置），确认？')) return;
          state.execSnaps = obj.execSnaps || []; state.poDataByYear = obj.poDataByYear || {}; state.grantLogs = obj.grantLogs || [];
          save(); alert('数据已恢复');
        } else {
          if (!Array.isArray(obj.plans)) throw new Error('格式不符');
          if ((state.plans.length || state.execSnaps.length) && !confirm('导入全量包将覆盖当前全部数据，确认？')) return;
          state = obj; save(); alert('恢复成功');
        }
      } catch (err) { alert('导入失败：不是本看板导出的备份文件'); }
    };
    reader.readAsText(f); e.target.value = '';
  }
});

/* ================= 启动 ================= */
function renderAll() {
  renderBanner();
  renderNow();
  renderBudget();
  renderPO();
  renderData();
}
(async () => {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    try {
      const r = await fetch('data.json', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d && d.budgetDashShare && d.state) { SHARE_MODE = true; SHARE_PKG = d; document.body.classList.add('share'); }
      }
    } catch (e) { }
  }
  load();
  renderAll();
  if (!SHARE_MODE) {
    try {
      const dh = await idbGet('dir');
      if (dh) {
        dirHandle = dh;
        const b2 = $('#datasetScanBtn'); if (b2) b2.style.display = '';
        let dp = 'granted';
        try { dp = await dh.queryPermission({ mode: 'read' }); } catch (e) { }
        if (dp === 'granted') { await scanDataset(false); }
      }
    } catch (e) { }
    try {
      const h = await idbGet('fh');
      if (h && h.queryPermission) {
        recentHandle = h;
        const perm = await h.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          // 浏览器里没有更新的未保存数据时，文件为准（git 同步契约）
          const f = await h.getFile();
          const savedAt = +(localStorage.getItem('budgetDash.savedAt') || 0);
          const localRaw = localStorage.getItem(LS_KEY);
          if (!localRaw || f.lastModified > savedAt) {
            try { await loadFromHandle(h, true); } catch (e) { }
          }
        } else {
          const b = $('#quickLoadBtn'); if (b) b.style.display = '';
        }
      }
    } catch (e) { }
  }
})();
