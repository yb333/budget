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
  return sign + '¥' + Math.round(a).toLocaleString('zh-CN');
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
  },
  // 国办 2026-11-05 发布：春节 2/5-2/13（1/31、2/14 上班）；清明 4/3-4/5；劳动节 5/1-5/5（5/8 上班）；
  // 端午 6/9；中秋 9/15；国庆 10/1-10/7（9/26、10/9 上班）
  2027: {
    off: ['01-01','01-02','01-03','02-05','02-06','02-07','02-08','02-09','02-10','02-11','02-12','02-13','04-03','04-04','04-05','05-01','05-02','05-03','05-04','05-05','06-09','09-15','10-01','10-02','10-03','10-04','10-05','10-06','10-07'],
    work: ['01-31','02-14','05-08','09-26','10-09']
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
let foldOpen = false;                           // 决策卡里「分来源推演表」的展开状态（重渲染时保留）
let SHARE_MODE = false, SHARE_PKG = null;   // 分享只读模式（服务目录存在 data.json 时启用）
let fileHandle = null;                       // 数据文件句柄（File System Access，会话内记忆）
let fileConnected = false;                   // budget.json 写穿连接状态（断连时数据仅存浏览器缓存，重连即同步）
let fileWriteTimer = null, fileWriting = false;
async function writeThroughNow() {           // 立即把当前状态写入 budget.json（原子写：临时文件+提交）
  if (SHARE_MODE || !fileHandle) return true;
  if (fileWriting) return false;
  fileWriting = true;
  try {
    const perm = await fileHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { fileConnected = false; renderBanner(); return false; }
    const w = await fileHandle.createWritable();
    await w.write(JSON.stringify({ type: 'budget-dash-full', ...state }, null, 2));
    await w.close();
    try { localStorage.setItem('budgetDash.savedAt', String(Date.now())); } catch (e) { }
    if (!fileConnected) { fileConnected = true; renderBanner(); }
    return true;
  } catch (e) { fileConnected = false; renderBanner(); return false; }
  finally { fileWriting = false; }
}
function scheduleFileWrite() {               // 防抖 800ms 写穿；断连时静默（数据仍在 localStorage 缓存，重连后下一次写入同步）
  if (SHARE_MODE || !fileHandle) return;
  clearTimeout(fileWriteTimer);
  fileWriteTimer = setTimeout(writeThroughNow, 800);
}
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
  let data = upToV4(obj);
  if (data && data.type === 'budget-dash-config') throw new Error('这是配置包，请用「恢复」导入');
  if (data && data.type === 'budget-dash-data') throw new Error('这是数据包，请用「恢复」导入');
  if (!data || !Array.isArray(data.plans)) throw new Error('不是看板数据文件');
  fileHandle = h; recentHandle = h; fileConnected = true;
  try { await idbSet('fh', h); } catch (e) { }
  state = data; saveSilent(); renderAll();
  if (!silent) alert('已载入 ' + (f.name || 'budget.json') + '（更新于 ' + new Date(f.lastModified).toLocaleString() + '）');
  const b = $('#quickLoadBtn'); if (b) b.style.display = 'none';
}
// 数据集文件夹：一级子文件夹名 = 花钱项目标识（文件的项目归属靠它，不靠程序猜测）；根目录下的文件不属于任何项目
async function walkDir(dir, out, depth, proj) {
  depth = depth || 0;
  if (depth > 3) return;
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'file') { if (/\.(xlsx|xls|csv)$/i.test(name)) out.push({ file: await h.getFile(), project: proj || '' }); }
    else if (h.kind === 'directory') await walkDir(h, out, depth + 1, proj || name);
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
  const sigOf = it => it.project + '|' + it.file.name + '|' + it.file.size + '|' + it.file.lastModified;   // 含所在文件夹：挪动过 = 新文件
  const fresh = files.filter(it => !known[sigOf(it)]);
  if (!fresh.length) { if (manual) alert('数据集文件夹里没有新文件（识别到的 ' + files.length + ' 个文件都已导入过）'); return false; }
  files.forEach(it => { known[sigOf(it)] = 1; });
  localStorage.setItem('budgetDash.dataset', JSON.stringify(known));
  const summary = await importFilesAuto(fresh);
  save();
  alert('📁 数据集自动导入完成：\n\n' + summary + '\n\n快照日期按文件导出时间记录。');
  return true;
}
async function importFilesAuto(items) {
  const parsed = [];
  for (const it of items) {
    const f = it.file;
    try {
      const rows = await parseWorkbookFile(f);
      const kind = detectKind(rows);
      const rec = { name: f.name, project: it.project || '', kind, rows, file: f, snapDate: fileSnapDate(f) };
      if (kind === 'team') { try { rec.sheets = await parseAllSheets(f); } catch (e) { } }
      parsed.push(rec);
    } catch (err) { parsed.push({ name: f.name, project: it.project || '', kind: '', error: '解析失败 ' + err.message }); }
  }
  const r = importParsed(parsed);
  if (r.touched) recordImportLog(calc());   // 每次导入记一份决策快照（并回测上次的估计）
  return r.text;
}
// 已导入过的花钱项目（子文件夹名），供手动导入时选择
function knownProjects() {
  const s = new Set(Object.keys(state.projPrints || {}));
  (state.execSnaps || []).forEach(x => Object.keys(x.byProject || {}).forEach(p => s.add(p)));
  return Array.from(s).sort();
}
// 导入核心（数据集自动扫描与手动拖拽共用）。items = [{name, project, kind, rows, sheets?, snapDate, error?}]
// project = 花钱项目标识（文件所在的一级子文件夹名）。执行表没有项目列，必须带 project 才导入。
function importParsed(items) {
  const parts = [];
  const poAll = []; let asOf = 0;
  const execFiles = [];
  let teamGroups = null, teamPlan = null;
  items.forEach(it => {
    if (it.error) { parts.push('❌ ' + it.name + '：' + it.error); return; }
    if (!it.kind) { parts.push('⚠️ ' + it.name + '：未能识别类型，已跳过'); return; }
    const tag = it.project ? '·' + it.project : '';
    if (it.kind === 'po') {
      try {
        const r = parsePoRows(it.rows);
        asOf = Math.max(asOf, r.asOf);
        poAll.push(...r.rows);
        learnProjectAlias(r.rows, it.project);
        parts.push('📄 ' + it.name + '（PO明细' + tag + '）：' + r.rows.length + ' 行');
      } catch (err) { parts.push('❌ ' + it.name + '（PO明细）：' + err.message); }
    } else if (it.kind === 'exec') {
      if (!it.project) { parts.push('⚠️ ' + it.name + '（执行表）：不在花钱项目的子文件夹里，未导入——请放进对应项目的子文件夹'); return; }
      try { execFiles.push({ name: it.name, project: it.project, date: it.snapDate, rows: parseExecRows(it.rows) }); }
      catch (err) { parts.push('❌ ' + it.name + '（执行表）：' + err.message); }
    } else if (it.kind === 'team') {
      let persons = null, tPlan = null, tNotes = [];
      if (it.sheets) { const r2 = parseTeamSheets(it.sheets); if (r2.groups.length) persons = r2.groups; tPlan = r2.plan; tNotes = r2.notes; }
      if (!persons) persons = parseTeamTable(it.rows);
      if (!persons.length) { parts.push('⚠️ ' + it.name + '（团队配置）：未识别到人员（需要 PO/OD 页签+姓名/单价列，或 类型/人数/单价 列）'); return; }
      teamGroups = persons.map(g => Object.assign({ poGroup: '' }, g));
      teamPlan = tPlan;   // 页签式：以 Excel 的「变动计划」页签为准（没有该页签 = 清空）；平面表：保留已有的
      const ownN = sum(persons.filter(g => g.kind === 'po' && g.poGroup), g => g.headcount || 0);
      parts.push('👥 ' + it.name + '（团队配置）：' + sum(persons, g => g.headcount || 0) + ' 人 / ' + persons.length + ' 组已更新（以数据集为准）' +
        (ownN ? '；其中 ' + ownN + ' 人标了 PO 归属' : '') + (tPlan && tPlan.length ? '；变动计划 ' + tPlan.length + ' 条' : ''));
      tNotes.forEach(n => parts.push('ℹ️ ' + n));
    }
  });
  if (teamGroups && teamGroups.length) { state.team = teamGroups.map(g => ({ id: uid(), ...g })); if (teamPlan != null) state.teamPlan = teamPlan; touch('team'); }
  if (poAll.length) { state.poDataByYear = state.poDataByYear || {}; state.poDataByYear[curYear()] = { updatedAt: todayStr(), asOf, rows: poAll }; touch('po'); }
  const notes = [];
  if (execFiles.length) {
    execFiles.forEach(x => {
      const ex = state.execSnaps.find(s => s.date === x.date);
      if (ex) { ex.byProject = ex.byProject || {}; ex.byProject[x.project] = x.rows; }
      else state.execSnaps.push({ date: x.date, byProject: { [x.project]: x.rows }, rows: {} });
      parts.push('📄 ' + x.name + '（执行表·' + x.project + '）→ 快照 ' + x.date);
    });
    state.execSnaps.sort((a, b) => a.date < b.date ? -1 : 1);
    const dates = execFiles.map(x => x.date);
    notes.push(...rebuildMergedRows(dates), ...updateProjectPrints(execFiles));
    touch('exec');
  }
  // 导入提醒（放错文件夹、缺项目等）：留在风险区，下次导入时替换
  const dropped = items.filter(it => it.kind === 'exec' && !it.project);
  dropped.forEach(it => notes.push('「' + it.name + '」（执行表）没有花钱项目归属，未导入——请把它放进对应花钱项目的子文件夹'));
  state.importNotes = notes.map(text => ({ date: todayStr(), text }));
  notes.forEach(n => parts.push('⚠️ ' + n));
  return { text: parts.join('\n'), touched: !!(poAll.length || execFiles.length) };
}
// PO 明细行里的「IT项目名称/编码」→ 项目标识（子文件夹名）：从 PO 文件所在文件夹学到，取文件里出现最多的那个项目
function learnProjectAlias(rows, project) {
  if (!project || !rows.length) return;
  const cnt = {};
  rows.forEach(r => { if (r.itProject) cnt[r.itProject] = (cnt[r.itProject] || 0) + 1; });
  const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  if (!top) return;
  state.projAlias = state.projAlias || {};
  state.projAlias[top] = project;
  const code = (rows.find(r => r.itProject === top && r.itProjectCode) || {}).itProjectCode;
  if (code) state.projAlias[code] = project;
}
// 快照的合并视图 = 各花钱项目各自最新数据的合计（某次只导了一个项目，另一个沿用上一次）；旧版合并快照原样保留
// dates：本次导入涉及的快照日期——只对这些快照出提醒（历史快照重建但不重复提醒）
function rebuildMergedRows(dates) {
  const warns = [];
  const list = state.execSnaps;
  const latest = {};
  list.forEach((s, i) => {
    if (!s.byProject || !Object.keys(s.byProject).length) return;
    Object.assign(latest, s.byProject);
    const merged = {};
    Object.values(latest).forEach(rows => mergeExecRows(merged, rows));
    const prev = list[i - 1], missing = [];
    // 某个项目从未按项目导入过时，它在新快照里会整体缺失 → 先沿用上一份并提醒，避免余额凭空消失
    if (prev && prev.rows) Object.entries(prev.rows).forEach(([c, o]) => {
      if (!merged[c] && ((o.itw.avail || 0) + (o.od.avail || 0)) > 0) { merged[c] = JSON.parse(JSON.stringify(o)); missing.push(o.name || c); }
    });
    if (missing.length && dates && dates.indexOf(s.date) >= 0) warns.push('新快照（' + s.date + '）里缺少 ' + missing.join('、') + '，暂时沿用了上一份的数据——是否有一个花钱项目的执行表还没放进它的子文件夹？共享的预算项在补齐前余额会偏小');
    s.rows = merged;
  });
  return warns;
}
// 各项目的「来源清单与可用预算」指纹 + 放反检查（只提醒）：新文件明显更像另一个项目时提示
function availVec(rows) { const v = {}; Object.entries(rows).forEach(([c, o]) => { v[c] = (o.itw.avail || 0) + (o.od.avail || 0); }); return v; }
function simVec(a, b) {
  let num = 0, den = 0;
  new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => { num += Math.min(a[k] || 0, b[k] || 0); den += Math.max(a[k] || 0, b[k] || 0); });
  return den ? num / den : 0;
}
function updateProjectPrints(execFiles) {
  const warns = [];
  const P = state.projPrints = state.projPrints || {};
  execFiles.forEach(x => {
    const v = availVec(x.rows);
    let like = '', likeSim = 0;
    Object.keys(P).forEach(p => { if (p === x.project) return; const s = simVec(v, P[p].avail); if (s > likeSim) { likeSim = s; like = p; } });
    if (P[x.project] && like && likeSim - simVec(v, P[x.project].avail) >= 0.3 && likeSim >= 0.6)
      warns.push('「' + x.project + '」文件夹里的执行表（' + x.name + '）更像「' + like + '」的——疑似放反。如是，把文件挪到另一个文件夹后重新导入即可覆盖');
    else P[x.project] = { date: x.date, avail: v };   // 疑似放反时不更新指纹，提醒会一直保留到纠正
  });
  return warns;
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
    schemaVersion: 4,
    meta: { year: y, updateFreqDays: 14 },
    years: { [y]: defaultYearParams() },
    plans: [],          // {id, year, code, name, amountW, target, planProject, dead, note}  code 可空，平台授予后关联
    grantLogs: [],      // {date, code, amountCny, note}      授予流水（辅助，按日期自然分年）
    team: [],           // {id, kind:'po'|'od', name, headcount, rate, poGroup}  团队配置（跨年沿用；poGroup=归哪张 PO）
    teamPlan: [],       // {ym:'2026-11', kind, rate, count, note}  变动计划：从生效年月起同类型同单价人数的增量
    execSnaps: [],      // {date, rows, byProject}  rows=按预算来源合并的视图；byProject[项目标识]=该项目原始行（v4）
    poDataByYear: {},   // {2026: {updatedAt, asOf, rows:[...]}}
    projAlias: {},      // PO 明细的「IT项目名称/编码」→ 项目标识（数据集子文件夹名）
    projPrints: {},     // 各项目的来源清单指纹（放反检查用）
    importLogs: [],     // 每次导入时的决策快照与回测
    importNotes: [],    // 最近一次导入的提醒（放错文件夹等）
    updatedAt: {}
  };
}
function migrate(old) {
  // v2 → v3：单卷拆按年分卷；迁移前自动留备份键，杜绝升级丢数据
  if (old && old.schemaVersion === 2) {
    try { localStorage.setItem('budgetDash.backup.v2', JSON.stringify(old)); } catch (e) { }
    const y = (old.meta && old.meta.year) || new Date().getFullYear();
    old = {
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
  // v3 → v4：执行表按花钱项目分存（旧快照保留合并视图，下次导入后自动具备项目维度）；其余只是补字段
  if (old && old.schemaVersion === 3) {
    try { localStorage.setItem('budgetDash.backup.v3', JSON.stringify(old)); } catch (e) { }
    old.schemaVersion = 4;
  }
  return (old && old.schemaVersion === 4) ? old : null;
}
function ensureV4(st) {   // v4 新增字段的缺省值（旧数据、旧分享包载入时补齐）
  if (!st) return st;
  if (!st.projPrints || typeof st.projPrints !== 'object') st.projPrints = {};
  if (!st.projAlias || typeof st.projAlias !== 'object') st.projAlias = {};
  if (!Array.isArray(st.importLogs)) st.importLogs = [];
  if (!Array.isArray(st.importNotes)) st.importNotes = [];
  if (!Array.isArray(st.teamPlan)) st.teamPlan = [];   // 团队 Excel「变动计划」页签的内容
  return st;
}
// 任意旧版本 → 当前版本（v4）；不认识的格式返回 null
function upToV4(obj) {
  let o = obj;
  while (o && typeof o.schemaVersion === 'number' && o.schemaVersion < 4) { const m = migrate(o); if (!m) return null; o = m; }
  return o && o.schemaVersion === 4 ? ensureV4(o) : null;
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
    t.forEach(g => { if (g.poGroup == null) g.poGroup = ''; });   // 旧数据补字段
    const key = g => g.kind + '|' + g.rate + '|' + (g.poGroup || '');   // 同类型+同单价+同 PO 归属的合并为一组
    const map = new Map();
    t.forEach(g => {
      const k = key(g);
      if (!map.has(k)) map.set(k, { kind: g.kind, rate: g.rate, poGroup: g.poGroup || '', headcount: 0, name: '' });
      const m = map.get(k);
      m.headcount += g.headcount || 1;
      if (!m.name) m.name = g.name || '';
    });
    const merged = Array.from(map.values());
    if (merged.length < t.length) {   // 有可合并的：备份后重写并落盘
      autobak(st);
      st.team = merged.map(m => ({ id: uid(), kind: m.kind, rate: m.rate, headcount: m.headcount, project: '', poGroup: m.poGroup, name: m.name || teamGroupName(m.kind, m.rate) }));
      saveSilent();
    }
  };
  if (SHARE_MODE) {           // 分享模式：只读快照，不读写本机存储
    state = upToV4(SHARE_PKG.state) || defaultState();
    normalizePlans(state);
    normalizeTeam(state);
    return;
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      state = upToV4(JSON.parse(raw)) || defaultState();
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
function saveSilent() { localStorage.setItem(LS_KEY, JSON.stringify(state)); scheduleFileWrite(); }
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
// 「变动计划」页签：生效年月 / 类型(PO|OD) / 单价 / 人数(±，从该月起人数的增量) / 备注
//   生效年月 = 成本归属月：到岗的月份；离场填离场后的第一个月。OD 扣减的滞后由系统按扣减日历处理，这里不用管。
//   写法：2026-11 / 2026年11月 / 2026/11；只写 11 表示当年 11 月
function normYm(v) {
  const s = String(v == null ? '' : v).trim();
  let mm = s.match(/(\d{4})\D{0,2}(\d{1,2})(?!\d)/);
  if (mm) { const mo = +mm[2]; return (mo >= 1 && mo <= 12) ? mm[1] + '-' + String(mo).padStart(2, '0') : null; }
  mm = s.match(/^(\d{1,2})(?:月)?$/);
  if (mm && +mm[1] >= 1 && +mm[1] <= 12) return curYear() + '-' + String(+mm[1]).padStart(2, '0');
  return null;
}
function parseTeamPlan(rows) {
  const header = rows[0] || [], notes = [], out = [];
  const col = re => header.findIndex(h => re.test(String(h || '')));
  const ymCol = col(/年月|月份|生效/), kindCol = col(/类型|渠道|分类/), priceCol = col(/单价|价格|费用|费率/), cntCol = col(/人数|数量|增减/), noteCol = col(/备注|说明/);
  if (ymCol < 0 || priceCol < 0 || cntCol < 0) return { list: [], notes: ['需要「生效年月」「单价」「人数」三列'] };
  rows.slice(1).forEach((r, i) => {
    const ym = normYm(r[ymCol]);
    const rate = parseMoney(r[priceCol]);
    const cnt = Math.round(parseFloat(String(r[cntCol] == null ? '' : r[cntCol]).replace(/[＋+人\s]/g, '').replace(/[－—–]/g, '-')));
    if (!ym && rate == null && !cnt) return;   // 空行
    if (!ym) { notes.push('第 ' + (i + 2) + ' 行的生效年月认不出（' + r[ymCol] + '）'); return; }
    if (rate == null || rate <= 0) { notes.push('第 ' + (i + 2) + ' 行的单价无效'); return; }
    if (!cnt) { notes.push('第 ' + (i + 2) + ' 行的人数无效（填 +2 / -1）'); return; }
    let kind = kindCol >= 0 ? (/od/i.test(String(r[kindCol] || '')) ? 'od' : /po/i.test(String(r[kindCol] || '')) ? 'po' : '') : '';
    if (!kind) kind = /月/.test(String(header[priceCol] || '')) ? 'od' : (/日/.test(String(header[priceCol] || '')) ? 'po' : '');
    if (!kind) { notes.push('第 ' + (i + 2) + ' 行无法判断 PO/OD（类型列填 PO 或 OD，或单价列名含 日/月）'); return; }
    out.push({ ym, kind, rate, count: cnt, note: noteCol >= 0 ? String(r[noteCol] || '').trim() : '' });
  });
  return { list: out, notes };
}
// 页签式团队表：页签名含 PO/OD 区分渠道，每行一人，只取 姓名+单价(+可选职级、PO归属) 列，其余列忽略
// 展示时同单价自动归组（有职级列用职级做组名，否则按单价命名），明细留在用户 Excel 里
// 附加页签：①「变动计划」（页签名含 变动/计划 且有年月列）→ plan；②「归属清单」（页签名含 归属，姓名 + 归属两列，无单价列）→ 给 PO 人员标 poGroup
function parseTeamSheets(sheets) {
  const persons = [], notes = [], plan = [], ownMap = {}, ownSheets = [];
  sheets.forEach(sh => {   // 归属清单：姓名 → 归属（哪张 PO）
    if (!/归属/.test(String(sh.name || ''))) return;
    const header = sh.rows[0] || [];
    if (header.some(h => /单价|价格/.test(h))) return;   // 带单价的是人员表（比如页签叫「PO归属人员」），不是清单
    const nc = header.findIndex(h => /姓名|名字|人员/.test(h));
    let lc = header.findIndex((h, i) => i !== nc && /归属|PO|分组/.test(h));
    if (lc < 0) lc = header.findIndex((h, i) => i !== nc && h);
    if (nc < 0 || lc < 0) { notes.push('页签「' + sh.name + '」像归属清单，但没找到「姓名」和「归属」两列'); return; }
    ownSheets.push(sh);
    sh.rows.slice(1).forEach(r => { const nm = String(r[nc] || '').trim(); if (nm && String(r[lc] || '').trim()) ownMap[nm] = String(r[lc] || '').trim(); });
  });
  sheets.forEach(sh => {
    const sn = String(sh.name || '');
    const header = sh.rows[0] || [];
    if (ownSheets.indexOf(sh) >= 0) return;   // 归属清单已在上面处理，不再当人员表解析
    if (/变动|计划/.test(sn) && header.some(h => /年月|月份|生效/.test(h))) {   // 变动计划页签
      const r2 = parseTeamPlan(sh.rows);
      plan.push(...r2.list);
      r2.notes.forEach(n => notes.push('页签「' + sn + '」' + n));
      return;
    }
    const nameCol = header.findIndex(h => /姓名|名字|人员|名称|角色/.test(h));
    const priceCol = header.findIndex(h => /单价|价格|日费|月费|费用|成本/.test(h));
    const levelCol = header.findIndex(h => /职级|级别|等级/.test(h));
    const ownCol = header.findIndex(h => /归属/.test(h));
    let kind = /od/i.test(sn) ? 'od' : (/po/i.test(sn) ? 'po' : null);
    if (nameCol < 0 || priceCol < 0) { if (sn) notes.push('页签「' + sn + '」未找到姓名/单价列，跳过'); return; }
    if (!kind) { const ph = String(header[priceCol] || ''); kind = /月/.test(ph) ? 'od' : /日/.test(ph) ? 'po' : null; }
    if (!kind) { notes.push('页签「' + sn + '」无法判断 PO/OD（页签名或单价列名需含 PO/OD/日/月）'); return; }
    sh.rows.slice(1).forEach(r => {
      const nm = String(r[nameCol] || '').trim();
      const price = parseMoney(r[priceCol]);
      if (nm && price != null && price > 0) persons.push({ kind, rate: price, level: levelCol >= 0 ? String(r[levelCol] || '').trim() : '', poGroup: (ownCol >= 0 ? String(r[ownCol] || '').trim() : '') || ownMap[nm] || '' });
    });
  });
  const map = new Map();
  persons.forEach(pr => {
    const key = pr.kind + '|' + pr.rate + '|' + pr.level + '|' + pr.poGroup;
    if (!map.has(key)) map.set(key, { kind: pr.kind, rate: pr.rate, level: pr.level, poGroup: pr.poGroup, headcount: 0 });
    map.get(key).headcount++;
  });
  const groups = Array.from(map.values()).map(g => ({
    kind: g.kind, headcount: g.headcount, rate: g.rate, project: '', poGroup: g.poGroup,
    name: (g.level || teamGroupName(g.kind, g.rate)) + (g.poGroup ? '·' + g.poGroup : '')
  }));
  return { persons, groups, plan, notes };
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
    else if (/IT项目编码/.test(h)) col.itProjectCode = i;
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
  const FILL = ['resNo', 'resName', 'poNo', 'status', 'startDate', 'endDate', 'amount', 'itProject', 'itProjectCode'];
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
      itProjectCode: col.itProjectCode != null ? String(r[col.itProjectCode] == null ? '' : r[col.itProjectCode]).trim() : '',
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
  openModal('<h3>导入平台数据</h3>' +
    '<div class="muted">日常用「数据集文件夹」自动导入即可（<b>每个花钱项目一个子文件夹</b>，文件丢进去打开看板就导）。这里手动拖入时：<b>拖整个文件夹</b>按子文件夹名识别花钱项目；拖散文件时，执行表要在下面指定属于哪个花钱项目（PO 明细和团队表不用）。自动识别类型，按年全量导出，可放心重复导入。</div>' +
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
// 拖拽：拖文件夹时一级子文件夹名 = 花钱项目；直接拖某个项目的文件夹时，该文件夹名就是项目
function walkEntry(entry, out, proj, top) {
  return new Promise(res => {
    if (!entry) return res();
    if (entry.isFile) entry.file(f => { if (/\.(xlsx|xls|csv)$/i.test(f.name)) out.push({ file: f, project: proj || '' }); res(); }, () => res());
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => reader.readEntries(async es => {
        if (!es.length) return res();
        await Promise.all(es.map(x2 => walkEntry(x2, out, top ? '' : (proj || x2.name), false)));
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
  for (const en of entries) {
    const sub = [];
    await walkEntry(en, sub, '', true);
    // 直接拖进来的是一个项目文件夹（文件都在它的根下）→ 文件夹名就是项目
    if (en.isDirectory && sub.length && sub.every(x => !x.project)) sub.forEach(x => { x.project = en.name; });
    files.push(...sub);
  }
  if (!entries.length && dt && dt.files) { for (const f of dt.files) if (/\.(xlsx|xls|csv)$/i.test(f.name)) files.push({ file: f, project: '' }); }
  if (files.length) await handleFiles(files);
}
async function handleFiles(list) {
  list = Array.from(list).filter(x => /\.(xlsx|xls|csv)$/i.test(x && x.file ? x.file.name : (x && x.name) || ''));
  for (const x of list) {
    const f = x && x.file ? x.file : x, project = (x && x.project) || '';
    try {
      const rows = await parseWorkbookFile(f);
      if (!rows.length) { importCtx.files.push({ name: f.name, project, error: '空文件' }); continue; }
      const rec = { name: f.name, project, kind: detectKind(rows), rows, file: f };
      if (rec.kind === 'team') { try { rec.sheets = await parseAllSheets(f); } catch (e) { } }
      importCtx.files.push(rec);
    } catch (err) {
      importCtx.files.push({ name: f.name, project, error: '解析失败：' + err.message + (/\.xls$/i.test(f.name) ? '（.xls 请先另存为 .xlsx）' : '') });
    }
  }
  renderImportList();
}
function renderImportList() {
  const el = $('#fileList');
  if (!importCtx || !importCtx.files.length) { el.innerHTML = '<div class="muted" style="text-align:center;padding:6px 0">尚未添加文件</div>'; return; }
  const hasExec = importCtx.files.some(f => f.kind === 'exec');
  const projOpts = knownProjects();
  const projCell = (f, fi) => !f.project
    ? '<span class="muted">花钱项目：</span><input list="projList" data-fproj="' + fi + '" value="" placeholder="填子文件夹名/项目名" style="font-size:12px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;width:130px">'
    : '<span class="chip">' + esc(f.project) + '</span>';
  el.innerHTML =
    (hasExec ? '<div class="file-head"><span class="muted">执行表快照日期：</span><input type="date" id="snapDate" value="' + esc(importCtx.snapDate) + '"></div><datalist id="projList">' + projOpts.map(p => '<option value="' + esc(p) + '">').join('') + '</datalist>' : '') +
    importCtx.files.map((f, fi) =>
      '<div class="file-card"><div class="file-head"><b>' + esc(f.name) + '</b>' +
      (f.error ? '<span style="color:var(--red);font-size:12px">' + esc(f.error) + '</span>'
        : '<select data-fkind="' + fi + '">' +
        [['', '— 请选择类型 —'], ['po', 'PO 明细'], ['exec', '预算执行表'], ['team', '团队配置']].map(([v, l]) => '<option value="' + v + '"' + (f.kind === v ? ' selected' : '') + '>' + l + '</option>').join('') +
        '</select>' + ((f.kind === 'exec' || f.kind === 'po') ? projCell(f, fi) : '') + '<span class="muted">' + (f.rows ? f.rows.length + ' 行（含表头）' : '') + '</span>') +
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
  const bad = importCtx.files.find(f => f.error || !f.kind);
  if (bad) { alert('有文件未能识别，请先处理：\n' + (bad.error || bad.name + ' 未选择类型')); return; }
  const noProj = importCtx.files.find(f => f.kind === 'exec' && !(f.project || '').trim());
  if (noProj) { alert('执行表「' + noProj.name + '」还没有指定花钱项目——执行表没有项目列，请在文件旁填写它属于哪个花钱项目（子文件夹名）。'); return; }
  const snapDate = ($('#snapDate') && $('#snapDate').value) || importCtx.snapDate || todayStr();
  const items = importCtx.files.map(f => ({ name: f.name, kind: f.kind, rows: f.rows, sheets: f.sheets, project: (f.project || '').trim(), snapDate }));
  const r = importParsed(items);
  if (r.touched) recordImportLog(calc());
  save(); closeModal();
  alert('导入完成：\n\n' + r.text + (r.touched ? '\n\n所有指标已自动重算。' : ''));
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
  const byDate = (a, b) => a.date < b.date ? -1 : 1;
  const snaps = [...(state.execSnaps || [])].filter(s => inYear(s.date, Y)).sort(byDate);
  const snap = snaps[snaps.length - 1] || null;
  const po = poOf(Y);
  const excl = m.excluded || [];
  // 挂靠剔除按 PO 编号整张生效（一张 PO 可跨项目）；兼容旧数据的「编号|项目」写法
  const exclPosSet = new Set((m.excludedPos || []).map(k => String(k).split('|')[0]));

  /* ---- 花钱项目与钱包：项目标识 = 数据集子文件夹名；执行表按项目各取最新一份 ---- */
  const projLatest = {};
  snaps.forEach(s => Object.entries(s.byProject || {}).forEach(([p, rows]) => { projLatest[p] = { date: s.date, rows }; }));
  const projects = Object.keys(projLatest).sort();
  const hasProj = projects.length > 0;
  const alias = state.projAlias || {};   // PO 明细的「IT项目名称/编码」→ 项目标识（导入时从 PO 文件所在文件夹学到）
  const projOfRow = r => {
    const n = r.itProject || '', cd = r.itProjectCode || '';
    const hit = alias[n] || alias[cd] || (projLatest[n] ? n : '') || (projLatest[cd] ? cd : '');
    return hit || (projects.length === 1 ? projects[0] : '');
  };

  /* ---- 规划关联与汇总（预算来源视角：跨项目合并） ---- */
  const planByCode = {};
  plansY.forEach(p => { if (p.code) planByCode[p.code] = p; });
  const codes = snap ? Object.keys(snap.rows).filter(c => excl.indexOf(c) < 0) : [];
  const unmatched = codes.filter(c => !planByCode[c]);
  const planCnyTotal = sum(plansY.filter(p => !p.dead), p => wusdOf(p) * 10000 * fx);
  let itwExec = 0, odExec = 0, availTotal = 0, itwFc = 0, remainTotal = 0, odRemainTotal = 0;
  const per = {};
  codes.forEach(c => {
    const r = snap.rows[c];
    const p = planByCode[c] || null;
    const planCny = (p && !p.dead) ? wusdOf(p) * 10000 * fx : null;
    const ie = r.itw.exec || 0, oe = r.od.exec || 0;
    const av = (r.itw.avail || 0) + (r.od.avail || 0);
    const rm = (r.itw.remain || 0) + (r.od.remain || 0);
    itwExec += ie; odExec += oe; availTotal += av; itwFc += (r.itw.fc || 0); remainTotal += rm; odRemainTotal += (r.od.remain || 0);
    const tgt = (p && p.target != null) ? p.target : m.execRateTarget;
    // 钱包 = 预算来源 × 花钱项目。旧的合并快照没有项目维度时，余额归入「未区分项目」这一个钱包
    const byProj = {};
    projects.forEach(pk => {
      const o = projLatest[pk].rows[c];
      if (o) byProj[pk] = { itwRemain: o.itw.remain || 0, odRemain: o.od.remain || 0, itwAvail: o.itw.avail || 0, odAvail: o.od.avail || 0 };
    });
    if (!hasProj) byProj[''] = { itwRemain: r.itw.remain || 0, odRemain: r.od.remain || 0, itwAvail: r.itw.avail || 0, odAvail: r.od.avail || 0 };
    per[c] = { code: c, name: r.name, plan: p, planCny, itwExec: ie, odExec: oe, exec: ie + oe, avail: av, remain: rm, itwFc: r.itw.fc || 0, itwRemain: r.itw.remain || 0, odRemain: r.od.remain || 0, odAvail: r.od.avail || 0, byProj, execRate: planCny ? (ie + oe) / planCny : null, target: tgt, targetInherit: !(p && p.target != null) };
  });
  const execTotal = itwExec + odExec;
  const execRate = planCnyTotal > 0 ? execTotal / planCnyTotal : null;
  // 总体目标 = 各来源目标的加权值（不考核的按 0 计）
  const tgtOf = p => (p && p.target != null) ? p.target : m.execRateTarget;
  let weightedTarget = null;
  {
    const tp = plansY.filter(p => !p.dead && wusdOf(p) > 0);
    const tot = sum(tp, p => wusdOf(p) * 10000 * fx);
    if (tot > 0) weightedTarget = sum(tp, p => wusdOf(p) * 10000 * fx * tgtOf(p)) / tot;
  }

  /* ---- 时间进度 ---- */
  const now = new Date(), y0 = new Date(Y, 0, 1), y1 = new Date(Y + 1, 0, 1);
  let timeProg = 1;
  if (now < y0) timeProg = 0; else if (now < y1) timeProg = (now - y0) / (y1 - y0);
  const curM = now.getFullYear() === Y ? now.getMonth() + 1 : (now.getFullYear() > Y ? 13 : 0);

  /* ---- 工作日（官方精确表 → 推算引擎；可逐月覆盖） ---- */
  const wdDefaultY = (yy, mo) => {
    const p2 = v => String(v).padStart(2, '0');
    const exact = HOLIDAYS[yy];
    const d = new Date(yy, mo - 1, 1); let n = 0;
    if (exact) {   // 官方精确安排（含调休上班）
      const off = new Set(exact.off.filter(x => +x.slice(0, 2) === mo));
      const work = new Set(exact.work.filter(x => +x.slice(0, 2) === mo));
      while (d.getMonth() === mo - 1) {
        const w = d.getDay(), key = p2(mo) + '-' + p2(d.getDate());
        if (w >= 1 && w <= 5) { if (!off.has(key)) n++; }
        else if (work.has(key)) n++;
        d.setDate(d.getDate() + 1);
      }
    } else {      // 推算：周中 − 节假日（不预知调休上班）
      const off = estHolidaySet(yy);
      while (d.getMonth() === mo - 1) {
        const w = d.getDay(), key = p2(mo) + '-' + p2(d.getDate());
        if (w >= 1 && w <= 5 && !off.has(key)) n++;
        d.setDate(d.getDate() + 1);
      }
    }
    return n;
  };
  const workdays = mo => { const v = m.workdays && m.workdays[mo]; return (v != null && v !== '' && !Number.isNaN(+v)) ? +v : wdDefaultY(Y, mo); };
  const janWd = wdDefaultY(Y + 1, 1);   // 1 月 PO 属于明年，用明年的日历

  /* ---- 团队理论值（含「变动计划」）----
     团队配置 = 现在在岗的人；变动计划 = 从某个生效年月起，同类型同单价人数的增量（+/−）。
     某年月的有效人数 = 现有人数 + 生效年月 ≤ 该年月的变动之和。
     生效年月填的是"成本归属月"（到岗的月份 / 离场后的第一个月）；OD 扣减的滞后不在这里处理，由扣减日历决定用哪个月的人数。 */
  const team = state.team || [];
  const plan = Array.isArray(state.teamPlan) ? state.teamPlan : [];
  const poGroups = team.filter(g => g.kind === 'po');
  const odGroups = team.filter(g => g.kind === 'od');
  const hasPoCfg = poGroups.some(g => (g.headcount || 0) > 0) || plan.some(p => p.kind === 'po');
  const hasOdCfg = odGroups.some(g => (g.headcount || 0) > 0) || plan.some(p => p.kind === 'od');
  const attend = m.attendFactor != null ? m.attendFactor : 1;
  const ymOf = (yy, mo) => yy + '-' + String(mo).padStart(2, '0');
  const nowYm = todayStr().slice(0, 7);   // 团队配置反映的是"现在"的人数
  const ownerOf = p => team.find(g => g.kind === p.kind && g.rate === p.rate);   // 一条变动只落到同类型同单价的第一个组（两个组单价相同时不能重复计入）
  // 某年月的有效人数：往将来看，加上"现在之后、该月及以前"生效的变动；往过去看，减去"该月之后、现在及以前"生效的变动
  //   例：现在 11 月、OD 在岗 2 人，计划里记了 11 月 +1 → 10 月人数 = 2 − 1 = 1，11 月底扣的 10 月费用按 1 人算
  const deltaAt = (p, ym) => (p.ym <= ym && p.ym > nowYm) ? p.count : (p.ym > ym && p.ym <= nowYm) ? -p.count : 0;
  const hcAt = (g, yy, mo) => Math.max(0, (g.headcount || 0) + sum(plan.filter(p => ownerOf(p) === g), p => deltaAt(p, ymOf(yy, mo))));
  // 变动计划里出现了、团队配置里却没有同单价组的：按净人数算一个虚拟组
  const virtualAt = (kind, yy, mo) => {
    const acc = {}, ym = ymOf(yy, mo);
    plan.filter(p => p.kind === kind && !ownerOf(p)).forEach(p => { acc[p.rate] = (acc[p.rate] || 0) + deltaAt(p, ym); });
    return Object.entries(acc).filter(([, c]) => c > 0).map(([rate, c]) => ({ rate: +rate, headcount: c }));
  };
  const poDailyAt = (yy, mo) => sum(poGroups, g => hcAt(g, yy, mo) * (g.rate || 0)) + sum(virtualAt('po', yy, mo), v => v.headcount * v.rate);
  const odCostAt = (yy, mo) => sum(odGroups, g => hcAt(g, yy, mo) * (g.rate || 0)) + sum(virtualAt('od', yy, mo), v => v.headcount * v.rate);
  const curMo = Math.max(Math.min(curM, 12), 1);
  const poDaily = hasPoCfg ? poDailyAt(Y, curMo) : 0;      // 现在的 PO 日额（含已生效的计划）
  const theoryOd = hasOdCfg ? odCostAt(Y, curMo) : 0;      // 现在的 OD 月额
  const theoryPo = mo => poDailyAt(Y, mo) * workdays(mo) * attend;
  // 按「PO归属」拆分某年月的 PO 日额（来自团队 Excel 的归属列 / 归属清单）；没标归属的并成一组
  const poSplit = (yy, mo) => {
    const acc = {};
    poGroups.forEach(g => { const h = hcAt(g, yy, mo); if (h > 0) { const k = g.poGroup || ''; acc[k] = acc[k] || { daily: 0, hc: 0 }; acc[k].daily += h * (g.rate || 0); acc[k].hc += h; } });
    virtualAt('po', yy, mo).forEach(v => { acc[''] = acc[''] || { daily: 0, hc: 0 }; acc[''].daily += v.headcount * v.rate; acc[''].hc += v.headcount; });
    return Object.entries(acc).map(([label, x]) => ({ label, daily: x.daily, hc: x.hc })).sort((a, b) => b.daily - a.daily);
  };

  /* ---- PO：PO 级字段按 PO 编号只取一次；行级（月度执行/预测）相加 ----
     info: s=所属月（费用起始月）, E=已执行, C=所属月内的预测, B=超出所属月的预测 */
  const asOf = po ? po.asOf : 13;
  const poList = po ? po.rows.filter(r => excl.indexOf(r.budgetCode) < 0 && !exclPosSet.has(r.poNo)) : [];
  const poExcludedRows = po ? po.rows.filter(r => excl.indexOf(r.budgetCode) < 0 && exclPosSet.has(r.poNo)) : [];
  const poExclActByCode = {};
  let poExclAct = 0;
  poExcludedRows.forEach(r => {
    const a = sum(Object.entries(r.months), ([mm, v]) => +mm < asOf ? v : 0);
    poExclActByCode[r.budgetCode] = (poExclActByCode[r.budgetCode] || 0) + a;
    poExclAct += a;
  });
  const poMonthlyAct = {}, poMonthlyFc = {}, poActByCode = {};
  const byPo = {};         // PO 编号 → PO 级汇总
  const info = new Map();  // PO 行 → 拆分结果
  poList.forEach(r => {
    const s = r.startDate ? +r.startDate.slice(5, 7) : asOf;   // 费用起始缺失：按当月在执行处理
    const inf = { s, noStart: !r.startDate, E: 0, C: 0, B: 0, w: 0, frozen: 0, refund: 0, willExec: 0 };
    Object.entries(r.months).forEach(([mm, v]) => {
      const mi = +mm;
      if (mi < asOf) { poMonthlyAct[mi] = (poMonthlyAct[mi] || 0) + v; poActByCode[r.budgetCode] = (poActByCode[r.budgetCode] || 0) + v; inf.E += v; }
      else { poMonthlyFc[mi] = (poMonthlyFc[mi] || 0) + v; if (mi === s) inf.C += v; else inf.B += v; }
    });
    info.set(r, inf);
    const g = byPo[r.poNo] = byPo[r.poNo] || { poNo: r.poNo, resName: r.resName, status: r.status, startDate: r.startDate, amount: 0, E: 0, rows: [] };
    g.amount = Math.max(g.amount, r.amount || 0);   // PO 金额是 PO 口径（每行重复同一个数）→ 只取一次，不能相加
    g.E += inf.E; g.status = r.status;
    if (!g.startDate) g.startDate = r.startDate;
    if (!g.resName) g.resName = r.resName;
    g.rows.push(r);
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

  /* ---- 团队需求：PO 理论 × 校准系数（B主A兜底：没有团队配置时用历史月均 × 工作日修正） ---- */
  const poHist = Object.entries(poMonthlyAct).filter(([mo, v]) => v > 0 && +mo < asOf).sort((a, b) => +a[0] - +b[0]);
  const poLast3 = poHist.slice(-3);
  const poAvg = poLast3.length ? sum(poLast3, ([, v]) => v) / poLast3.length : 0;
  const poAvgWd = poLast3.length ? sum(poLast3, ([mo]) => workdays(+mo)) / poLast3.length : workdays(Math.max(Math.min(curM, 12), 1));
  let calibR = 1;
  if (hasPoCfg && poLast3.length >= 3) {
    const a = sum(poLast3, ([, v]) => v), th = sum(poLast3, ([mo]) => theoryPo(+mo));
    if (th > 0) calibR = Math.min(1.1, Math.max(0.9, a / th));
  }
  const needPo = mo => hasPoCfg ? theoryPo(mo) * calibR : (poAvg > 0 && poAvgWd > 0 ? poAvg * workdays(mo) / poAvgWd : 0);
  const poDailyJan = hasPoCfg ? poDailyAt(Y + 1, 1) : 0;   // 明年 1 月的日额（含明年生效的计划）
  const needJan = hasPoCfg ? poDailyJan * janWd * attend * calibR : (poAvg > 0 && poAvgWd > 0 ? poAvg * janWd / poAvgWd : 0);

  /* ---- 在途 PO 三类：当月在执行（按团队需求拆成将执行/多下）、往月剩余（全部返还）、已提前下的 ---- */
  const started = curM >= 1 && curM <= 12;
  const teamNeedAsOf = needPo(asOf);
  const curFc = sum(poList, r => { const i = info.get(r); return i.s === asOf ? i.C : 0; });
  const kNeed = (curFc > 0 && teamNeedAsOf > 0) ? Math.min(1, teamNeedAsOf / curFc) : 1;
  Object.values(byPo).forEach(g => {
    g.willExec = sum(g.rows, r => { const i = info.get(r); return i.s === asOf ? i.C * kNeed : (i.s > asOf ? i.C : 0); });
    if (g.status !== 'OPEN') { g.frozen = 0; g.refund = 0; }
    else if (g.amount > 0) { g.frozen = Math.max(g.amount - g.E, 0); g.refund = Math.max(g.frozen - g.willExec, 0); }
    else { g.frozen = g.rows.reduce((a, r) => a + info.get(r).C + info.get(r).B, 0); g.refund = g.frozen - g.willExec; }   // 没有 PO 金额列时退回按预测估
    // 冻结/返还分到各行（= 各钱包）：往月 PO 以「超出所属月的预测」为权重，当月/提前下的以所属月内预测为权重；整张 PO 都没有预测时才用已执行额
    let W = sum(g.rows, r => { const i = info.get(r); i.w = i.s < asOf ? i.B : i.C; return i.w; });
    if (W <= 0) W = sum(g.rows, r => { const i = info.get(r); i.w = i.E; return i.w; });
    g.rows.forEach(r => { const i = info.get(r); const sh = W > 0 ? i.w / W : 1 / g.rows.length; i.frozen = g.frozen * sh; i.refund = g.refund * sh; i.willExec = i.frozen - i.refund; });
    g.detail = g.rows.map(r => { const i = info.get(r); return { code: r.budgetCode, name: per[r.budgetCode] ? per[r.budgetCode].name : (r.budgetCode || '—'), proj: projOfRow(r), E: i.E, frozen: i.frozen, willExec: i.willExec, refund: i.refund }; });
  });
  let poFrozen = 0, poReturn = 0, openCnt = 0;
  Object.values(byPo).forEach(g => { if (g.status === 'OPEN') { openCnt++; poFrozen += g.frozen; poReturn += g.refund; } });
  const willExecByCode = {}, refundByCode = {}, issuedByMonth = {}, wallets = {}, refundPastByCode = {}, refundPastW = {};
  poList.forEach(r => {
    const i = info.get(r), c = r.budgetCode, p = projOfRow(r), g = byPo[r.poNo];
    willExecByCode[c] = (willExecByCode[c] || 0) + i.willExec;
    refundByCode[c] = (refundByCode[c] || 0) + i.refund;
    if (i.s > asOf) issuedByMonth[i.s] = (issuedByMonth[i.s] || 0) + i.C;
    const key = c + '|' + p;
    if (g.status === 'OPEN' && i.s < asOf) { refundPastByCode[c] = (refundPastByCode[c] || 0) + i.refund; refundPastW[key] = (refundPastW[key] || 0) + i.refund; }   // 往月 PO 的返还额（按来源 / 钱包）
    const w = wallets[key] = wallets[key] || { key, code: c, proj: p, name: per[c] ? per[c].name : c, E: 0, frozen: 0, willExec: 0, refund: 0, pos: [] };
    w.E += i.E; w.frozen += i.frozen; w.willExec += i.willExec; w.refund += i.refund;
    if (g.status === 'OPEN' && i.frozen > 0) w.pos.push(g.poNo);
  });
  const curWillExec = sum(poList, r => { const i = info.get(r); return i.s === asOf ? i.willExec : 0; });
  const curOver = Math.max(0, curFc - curWillExec);

  /* ---- OD 扣减估算：扣减日历 1月0 / 2–5月各扣上月 / 6月2（上半年清算）/ 7–11月各扣上月 / 12月≈bonusMonths（年终清算） ----
     有团队配置（或变动计划）时，每笔扣减按"费用所属月"的人数算，滞后自动体现：11 月底扣的是 10 月的人数×单价 */
  const odBase = hasOdCfg ? theoryOd : odAvg;
  const odMult = mo => mo === 1 ? 0 : mo === 6 ? 2 : mo === 12 ? (m.bonusMonths || 3.5) : 1;
  const odDeduct = mo => mo === 1 ? 0 : mo === 6 ? odCostAt(Y, 5) + odCostAt(Y, 6) : mo === 12 ? odCostAt(Y, 11) + odCostAt(Y, 12) + Math.max(0, (m.bonusMonths || 3.5) - 2) * odCostAt(Y, 12) : odCostAt(Y, mo - 1);
  const odEst = {}, poEst = {};
  if (started) for (let mo = curM; mo <= 12; mo++) { odEst[mo] = hasOdCfg ? odDeduct(mo) : odBase * odMult(mo); poEst[mo] = mo === asOf ? curWillExec : (mo > asOf ? needPo(mo) : 0); }
  const odFuture = sum(Object.entries(odEst), ([mo, v]) => +mo >= curM ? v : 0);
  const poFuture = sum(Object.values(poEst));

  /* ================= 年底推演：每个来源从现在推到 12/31，本月的指令是推演的第一步 =================
     钱的使用顺序：① 团队 PO（硬性）→ ② 常规 OD（硬性）→ ③ 临时 OD 补缺口（年底）→ ④ 1 月 PO（年底）→ ⑤ 花不掉
     （另有"改返还去向"这一可选项：往月未关闭 PO 的分配比例验收前可调，只影响没花完的钱退回到哪个钱包） */
  const srcRows = [];
  const blank = () => ({ used: 0, usedItw: {}, usedOd: {}, po: 0, poNext: 0, odExec: 0, odXfer: 0, temp: 0, jan: 0 });
  codes.forEach(c => {
    const s = per[c], p = s.plan;
    const assessed = !!(p && !p.dead && s.planCny > 0 && s.target > 0);
    const willExec = willExecByCode[c] || 0;
    const row = Object.assign({ code: c, name: p ? p.name : s.name, platName: s.name, plan: p, planCny: p && !p.dead ? s.planCny : null, target: p ? s.target : null, assessed, unmatched: !p, exec: s.exec, willExec, refund: refundByCode[c] || 0, refundUsable: refundByCode[c] || 0,
      wallets: Object.keys(s.byProj).map(pk => ({ proj: pk, itw: s.byProj[pk].itwRemain, od: s.byProj[pk].odRemain })) }, blank());
    row.gap = assessed ? Math.max(0, s.planCny * s.target - s.exec - willExec) : 0;
    row.gapLeft = row.gap;
    row.funds = sum(row.wallets, w => w.itw + w.od);
    srcRows.push(row);
  });
  plansY.forEach(p => {   // 规划了但平台未到账（或编码未关联）的来源：缺口全额，没有钱
    if (p.dead || wusdOf(p) <= 0) return;
    if (p.code && per[p.code]) return;
    const pc = wusdOf(p) * 10000 * fx;
    const row = Object.assign({ code: p.code || '', name: p.name, platName: '', plan: p, planCny: pc, target: tgtOf(p), assessed: tgtOf(p) > 0, notGranted: true, exec: 0, willExec: 0, refund: 0, wallets: [] }, blank());
    row.gap = pc * tgtOf(p); row.gapLeft = row.gap; row.funds = 0;
    srcRows.push(row);
  });
  /* ---- ⓪ 改返还去向：往月未关闭的 PO，没花完的钱验收后要返还；退回到哪个预算项，取决于 PO 的预算项分配比例（验收前可调）----
     平台口径：已执行的金额是事实、不能调；能调的只是当初的分配比例（例如下的时候 A/B = 3.5/1.5），
     也就是"没花完的钱退回到哪个钱包"。默认按平台当前显示的归属；只有当某个预算项缺钱、而同一个 PO（同一花钱项目）
     里另一行的返还用不上时，才提示把返还改过去。执行中尽量避免这种调整，所以只提示、不当作必做项。 */
  const redirectList = [];
  if (started) {
    const rowOf = {}; srcRows.forEach(r => { if (r.code) rowOf[r.code] = r; });
    const need = {}, slack = {};
    srcRows.forEach(r => {   // need = 去掉可支配和"今年能用上的返还"后还缺的钱；slack = 自己用不上的返还额
      r.refundUsable = curM >= 11 ? (refundPastByCode[r.code] || 0) : (refundByCode[r.code] || 0);   // 年底：当月 PO 的返还要到明年才回来，不算
      need[r.code] = r.assessed ? Math.max(0, r.gap - r.funds - r.refundUsable) : 0;
      slack[r.code] = (r.unmatched || r.notGranted) ? 0 : r.refundUsable - (r.assessed ? Math.max(0, r.gap - r.funds) : 0);   // 只按"今年用得上的返还"算富余
    });
    Object.values(byPo).forEach(g => {
      if (g.status !== 'OPEN' || g.refund <= 0.5 || !g.startDate || +g.startDate.slice(5, 7) >= asOf) return;   // 只看往月未关闭、有返还的 PO
      g.detail.filter(x => x.refund > 0.5 && rowOf[x.code] && slack[x.code] > 0.5).forEach(d => {
        const D = rowOf[d.code];
        for (let n = 0; n < 10 && slack[d.code] > 0.5 && d.refund > 0.5; n++) {
          const rcv = g.detail.filter(x => x.proj === d.proj && x.code !== d.code && rowOf[x.code] && need[x.code] > 0.5).sort((a, b) => need[b.code] - need[a.code])[0];
          if (!rcv) break;
          const R = rowOf[rcv.code];
          const x = Math.min(slack[d.code], need[rcv.code], d.refund);
          slack[d.code] -= x; need[rcv.code] -= x; d.refund -= x; rcv.refund += x;
          d.redirectOut = (d.redirectOut || 0) + x; rcv.redirectIn = (rcv.redirectIn || 0) + x;
          D.refund -= x; R.refund += x;
          refundByCode[d.code] -= x; refundByCode[rcv.code] += x;
          refundPastByCode[d.code] -= x; refundPastByCode[rcv.code] = (refundPastByCode[rcv.code] || 0) + x;
          D.refundUsable -= x; R.refundUsable += x;   // 改的是往月 PO 的返还，今年用得上
          if (!(R.unmatched || R.notGranted)) slack[rcv.code] += x;   // 收进来的返还，自己用不上时还可以再让出去
          const kd = d.code + '|' + d.proj, kr = rcv.code + '|' + rcv.proj;
          if (wallets[kd]) wallets[kd].refund -= x;
          if (wallets[kr]) wallets[kr].refund += x; else wallets[kr] = { key: kr, code: rcv.code, proj: rcv.proj, name: rcv.name, E: 0, frozen: 0, willExec: 0, refund: x, pos: [g.poNo] };
          refundPastW[kd] -= x; refundPastW[kr] = (refundPastW[kr] || 0) + x;
          redirectList.push({ poNo: g.poNo, from: d.code, fromName: d.name, to: rcv.code, toName: rcv.name, proj: d.proj, amt: x });
        }
      });
    });
  }
  // 从某来源取钱：优先一个钱包取够；IT外包剩余先用，不够再用 OD 剩余（需先调回）
  const avail = (r, w) => (w.itw - (r.usedItw[w.proj] || 0)) + (w.od - (r.usedOd[w.proj] || 0));
  const take = (r, amt, detail) => {
    let left = amt;
    const ups = detail ? detail.projs : null;
    r.wallets.slice().sort((a, b) => ((avail(r, b) >= amt) - (avail(r, a) >= amt)) || ((ups && ups.has(b.proj) ? 1 : 0) - (ups && ups.has(a.proj) ? 1 : 0)) || (avail(r, b) - avail(r, a))).forEach(w => {
      if (left <= 0 || avail(r, w) <= 0) return;
      const g = Math.min(avail(r, w), left);
      const gi = Math.min(Math.max(w.itw - (r.usedItw[w.proj] || 0), 0), g), go = g - gi;
      r.usedItw[w.proj] = (r.usedItw[w.proj] || 0) + gi; r.usedOd[w.proj] = (r.usedOd[w.proj] || 0) + go; r.used += g; left -= g;
      if (detail) { ups.add(w.proj); detail.items.push({ code: r.code, name: r.name, proj: w.proj, amt: g, odBack: go }); }
    });
    return amt - left;
  };
  const poMonths = [];
  const nextDetail = { projs: new Set(), items: [] };
  // OD 扣减落到钱包：先用已有 OD 额度，再按给定的项目顺序从 IT外包 调拨（仍先补缺口）；不够才动下一个项目
  const itwFree = (r, pk) => { const w = r.wallets.find(x => x.proj === pk); return w ? Math.max(0, w.itw - (r.usedItw[pk] || 0)) : 0; };
  const odPlan = (amount, order) => {
    let left = amount;
    const res = { amount, used: [], xfer: [], proj: order[0], otherProj: false, left: 0 };
    const gl = {}; srcRows.forEach(r => { gl[r.code] = r.gapLeft; });   // 计划内的剩余缺口（已有额度用掉的部分也算补了缺口）
    srcRows.forEach(r => r.wallets.forEach(w => {
      const q0 = Math.max(0, w.od - (r.usedOd[w.proj] || 0));
      if (left <= 0 || q0 <= 0) return;
      const q = Math.min(q0, left); left -= q; gl[r.code] = Math.max(0, gl[r.code] - q); res.used.push({ code: r.code, name: r.name, proj: w.proj, amt: q });
    }));
    const pass = (pk, gapOnly) => {
      srcRows.filter(r => itwFree(r, pk) > 0 && (!gapOnly || gl[r.code] > 0)).sort((a, b) => gapOnly ? gl[b.code] - gl[a.code] : itwFree(b, pk) - itwFree(a, pk)).forEach(r => {
        if (left <= 0) return;
        const g = Math.min(gapOnly ? gl[r.code] : Infinity, itwFree(r, pk), left);
        left -= g; gl[r.code] = Math.max(0, gl[r.code] - g); res.xfer.push({ code: r.code, name: r.name, proj: pk, amt: g });
      });
    };
    order.forEach((pk, i) => { if (left <= 0) return; if (i > 0) res.otherProj = true; pass(pk, true); if (left > 0) pass(pk, false); });
    res.left = left;
    return res;
  };
  // 本窗口 OD 出账项目的优先顺序：缺口内能承接的多的优先 → 有钱的来源多的优先 → 已有 OD 额度多的优先（沿用上次）
  const pickOdOrder = () => {
    const projs = projects.length ? projects.slice() : [''];
    const capIn = pk => sum(srcRows, r => Math.min(r.gapLeft, itwFree(r, pk)));
    const odHas = pk => sum(srcRows, r => { const w = r.wallets.find(x => x.proj === pk); return w ? Math.max(0, w.od - (r.usedOd[pk] || 0)) : 0; });
    return projs.sort((a, b) => (capIn(b) - capIn(a)) || (srcRows.filter(r => itwFree(r, b) > 0).length - srcRows.filter(r => itwFree(r, a) > 0).length) || (odHas(b) - odHas(a)));
  };
  const applyOd = plan => {
    plan.used.forEach(u => { const r = srcRows.find(x => x.code === u.code); r.odExec += u.amt; r.gapLeft = Math.max(0, r.gapLeft - u.amt); r.used += u.amt; r.usedOd[u.proj] = (r.usedOd[u.proj] || 0) + u.amt; });
    plan.xfer.forEach(x => { const r = srcRows.find(x2 => x2.code === x.code); r.odExec += x.amt; r.gapLeft = Math.max(0, r.gapLeft - x.amt); r.odXfer += x.amt; r.used += x.amt; r.usedItw[x.proj] = (r.usedItw[x.proj] || 0) + x.amt; });
  };
  // 当月团队 PO：先补缺口（缺口大的来源优先、集中分），缺口填满后的余量走自由资金
  const allocPoMonth = (mo, det) => {
    const pm = { mo, theory: needPo(mo), issued: issuedByMonth[mo] || 0, need: Math.max(0, needPo(mo) - (issuedByMonth[mo] || 0)), funded: 0 };
    poMonths.push(pm);
    let left = pm.need;
    srcRows.filter(r => r.gapLeft > 0 && r.funds - r.used > 0).sort((a, b) => b.gapLeft - a.gapLeft).forEach(r => {
      if (left <= 0) return;
      const got = take(r, Math.min(r.gapLeft, r.funds - r.used, left), det);
      r.po += got; r.gapLeft -= got; left -= got; if (det) r.poNext += got;
    });
    if (left > 0) srcRows.filter(r => r.funds - r.used > 0).sort((a, b) => (b.funds - b.used) - (a.funds - a.used)).forEach(r => {
      if (left <= 0) return;
      const got = take(r, Math.min(r.funds - r.used, left), det);
      r.po += got; left -= got; if (det) r.poNext += got;
    });
    pm.funded = pm.need - left;
  };
  // 调拨窗口（按扣减所在月）：1–4 月的扣减 → 5 月底；5–6 月 → 6 月底；7–10 月 → 10 月底；11–12 月 → 年底
  const winEndOf = mo => mo <= 4 ? 5 : mo <= 6 ? 6 : mo <= 10 ? 10 : 12;
  // 钱严格按月排：每个月先排「下月的团队 PO」（20 号前后下单），再排「当月月底的 OD 扣减」——近处的硬性支出先拿到钱
  const odLog = [];        // {mo, kind: used|xfer, code, name, proj, amt}
  let odProjOrder = null, odWinCur = -1, odUnfunded = 0, odUnfundedWin = 0, odOtherWin = false;
  const allocOdMonth = mo => {
    if (!odEst[mo]) return;
    const end = winEndOf(mo);
    if (end !== odWinCur) { odWinCur = end; odProjOrder = pickOdOrder(); }   // 一个窗口只选一次出账项目
    const plan = odPlan(odEst[mo], odProjOrder);
    applyOd(plan);
    plan.used.forEach(u => odLog.push(Object.assign({ mo, kind: 'used' }, u)));
    plan.xfer.forEach(x => odLog.push(Object.assign({ mo, kind: 'xfer' }, x)));
    odUnfunded += plan.left;
    if (end === winEndOf(curM)) { odUnfundedWin += plan.left; if (plan.otherProj) odOtherWin = true; }   // 只记当前窗口内的（出指令用）
  };
  if (started) for (let mo = curM; mo <= 12; mo++) { if (mo < 12) allocPoMonth(mo + 1, mo === curM ? nextDetail : null); allocOdMonth(mo); }
  const odWinEnd = winEndOf(Math.max(curM, 1));   // 当前决策点所在窗口
  const odWinNeed = started ? sum(Object.entries(odEst), ([mo, v]) => +mo <= odWinEnd ? v : 0) : 0;
  // 本窗口的调拨指令：按钱包汇总窗口内各月用掉的已有额度和需要调拨的金额
  const aggOd = kind => {
    const mp = {};
    odLog.filter(x => x.kind === kind && x.mo <= odWinEnd).forEach(x => { const k = x.code + '|' + x.proj; const o = mp[k] = mp[k] || { code: x.code, name: x.name, proj: x.proj, amt: 0 }; o.amt += x.amt; });
    return Object.values(mp);
  };
  const odInstr = started ? { used: aggOd('used'), xfer: aggOd('xfer'), proj: odProjOrder ? odProjOrder[0] : '', otherProj: odOtherWin, left: odUnfundedWin } : null;
  // 年底专用：往月未关闭 PO 的返还额（12 月 15 日前验收后才回到钱包）——只能用于年底的临时 OD 和 1 月 PO，不用于本月的 PO
  const refundPastC = r => refundPastByCode[r.code] || 0;
  const tempList = [];
  let tempFromRefund = 0;
  if (curM >= 11) srcRows.filter(r => r.gapLeft > 0 && r.funds - r.used + refundPastC(r) > 0).sort((a, b) => b.gapLeft - a.gapLeft).forEach(r => {   // ③ 临时 OD 补缺口
    const want = Math.min(r.gapLeft, r.funds - r.used + refundPastC(r));
    const got = take(r, Math.min(want, Math.max(0, r.funds - r.used)), null);     // 先用现在就能花的钱
    const fromRef = Math.min(want - got, refundPastC(r));                        // 不够的部分靠验收返还
    r.temp += got + fromRef; r.gapLeft -= got + fromRef; tempFromRefund += fromRef;
    tempList.push({ code: r.code, name: r.name, amt: got + fromRef, fromRef });
  });
  const janItems = [];
  let janReserve = 0, janFromRefund = 0;
  if (curM >= 11) {   // ④ 1 月 PO：用达标后的结余（只认 IT外包剩余，OD 额度要先调回）；不够再用往月 PO 的验收返还
    let left = needJan;
    srcRows.slice().sort((a, b) => sum(b.wallets, w => Math.max(0, w.itw - (b.usedItw[w.proj] || 0))) - sum(a.wallets, w => Math.max(0, w.itw - (a.usedItw[w.proj] || 0)))).forEach(r => r.wallets.forEach(w => {
      if (left <= 0) return;
      const g = Math.min(Math.max(0, w.itw - (r.usedItw[w.proj] || 0)), left);
      if (g <= 0) return;
      r.usedItw[w.proj] = (r.usedItw[w.proj] || 0) + g; r.used += g; r.jan += g; left -= g;
      janItems.push({ code: r.code, name: r.name, proj: w.proj, amt: g });
    }));
    srcRows.forEach(r => r.wallets.forEach(w => {   // 仍然不够：用往月 PO 验收后返还的钱
      if (left <= 0) return;
      const g = Math.min(left, refundPastW[r.code + '|' + w.proj] || 0);
      if (g <= 0) return;
      left -= g; janFromRefund += g; r.jan += g;
      janItems.push({ code: r.code, name: r.name, proj: w.proj, amt: g, fromRef: true });
    }));
    janReserve = needJan - left;
  }
  srcRows.forEach(r => {
    r.endExec = r.exec + r.willExec + r.po + r.odExec;            // 年底预计执行（不含临时 OD）
    r.rate = r.planCny ? r.endExec / r.planCny : null;
    r.rateWithTemp = r.planCny ? (r.endExec + r.temp) / r.planCny : null;
    r.hit = r.assessed ? r.endExec >= r.planCny * r.target - 0.5 : true;
    r.left = r.funds - r.used;
  });
  const forecastEnd = sum(srcRows, r => r.endExec);
  const forecastRate = planCnyTotal > 0 ? forecastEnd / planCnyTotal : null;
  const assessedN = srcRows.filter(r => r.assessed).length;
  const hitN = srcRows.filter(r => r.assessed && r.hit).length;
  const tempTotal = sum(tempList, x => x.amt);
  const unspent = Math.max(0, sum(srcRows, r => r.left));
  const odAvgRate = hasOdCfg ? theoryOd / Math.max(sum(odGroups, g => hcAt(g, Y, curMo)) + sum(virtualAt('od', Y, curMo), v => v.headcount), 1) : (odAvg || 0);
  // 团队资金是否够：可支配 vs 剩余团队 PO + 常规 OD 扣减；不够时算出哪个月耗尽
  const S = sum(srcRows, r => r.funds), P = sum(poMonths, p => p.need), D = odFuture;
  const fundShort = started ? Math.max(0, P + D - S) : 0;
  let fundMonth = '';
  if (fundShort > 0) {
    let cum = 0;
    for (let mo = curM; mo <= 12; mo++) { cum += (odEst[mo] || 0) + ((poMonths.find(p => p.mo === mo) || {}).need || 0); if (cum > S) { fundMonth = mo + ' 月'; break; } }
  }
  // 催 BA：缺口 > 可支配 + 预计返还
  const baList = srcRows.filter(r => r.assessed && r.gap > r.funds + (r.refundUsable || 0) + 0.5).map(r => {
    const short = r.gap - r.funds - (r.refundUsable || 0);
    const perMonth = Math.max(needPo(Math.min(Math.max(curM, 1), 12)), 1);
    return { code: r.code, name: r.name, gap: r.gap, short, kind: r.notGranted ? '未授予' : '授予不足', latest: Math.max(Math.min(curM, 11) + 1, 12 - Math.ceil(short / perMonth)) };
  });
  const excessOd = Math.max(0, odRemainTotal - D);   // 多余 OD 额度：年底花不掉，需调回

  /* ---- 本月指令 ---- */
  const nextM = curM >= 12 ? null : curM + 1;
  const ceilK = v => Math.ceil(v / 1000) * 1000;
  let poDecision = null;
  if (started && snap) {
    const yearEnd = curM >= 11;
    const odXferNow = odInstr ? Math.max(0, sum(odInstr.xfer, x => x.amt)) : 0;
    // 按「PO归属」把这次要下的 PO 拆成几张（各张金额 = 归属人员的 日额×工作日×出勤×校准），钱包分配按顺序依次分给各张
    const splitParts = (yy, mo, needTotal, items, issued) => {
      const sp = poSplit(yy, mo), tot = sum(sp, x => x.daily);
      if (!tot) return [];
      const parts = sp.map(x => ({ label: x.label, hc: x.hc, daily: x.daily, need: needTotal * x.daily / tot, alloc: [] }));
      // 各张的取整金额加起来必须等于合计：先各自向下取整到千，余下的千元按小数部分从大到小补
      const raw = parts.map(p => Math.max(0, p.need - issued * p.daily / tot));
      const floors = raw.map(v => Math.floor(v / 1000) * 1000);
      const rest = Math.round((Math.ceil(Math.max(0, needTotal - issued) / 1000) * 1000 - sum(floors)) / 1000);
      const byFrac = raw.map((v, i) => [v - floors[i], i]).sort((a, b) => b[0] - a[0]);
      parts.forEach((p, i) => { p.toIssue = floors[i] + (byFrac.findIndex(o => o[1] === i) < rest ? 1000 : 0); });
      const queue = items.map(x => Object.assign({}, x));
      parts.forEach(p => {
        let left = p.need;
        while (left > 0.5 && queue.length) { const it = queue[0]; const g = Math.min(it.amt, left); p.alloc.push(Object.assign({}, it, { amt: g })); it.amt -= g; left -= g; if (it.amt <= 0.5) queue.shift(); }
      });
      return parts;
    };
    const dailyNext = (hasPoCfg && nextM) ? poDailyAt(Y, nextM) : 0;
    const planAhead = plan.filter(p => p.ym >= ymOf(Y, Math.max(curMo, 1))).sort((a, b) => a.ym < b.ym ? -1 : 1);   // 本月及以后生效的变动计划
    poDecision = {
      yearEnd, isDec: curM === 12, nextM, asOf,
      // ① PO（1–11 月：下月的 PO；12 月：下旬下明年 1 月的 PO）
      po: nextM ? {
        nextM, wd: workdays(nextM), theory: theoryPo(nextM), need: needPo(nextM), issued: issuedByMonth[nextM] || 0,
        toIssue: ceilK(Math.max(0, needPo(nextM) - (issuedByMonth[nextM] || 0))),
        low: Math.max(0, needPo(nextM) - dailyNext * 0.5), high: yearEnd ? needPo(nextM) : needPo(nextM) + dailyNext,
        alloc: nextDetail.items, projs: Array.from(nextDetail.projs), funded: poMonths.length ? poMonths[0].funded : 0,
        histNext: (poAvg > 0 && poAvgWd > 0) ? poAvg * workdays(nextM) / poAvgWd : 0,
        daily: dailyNext,
        parts: splitParts(Y, nextM, needPo(nextM), nextDetail.items, issuedByMonth[nextM] || 0)
      } : null,
      // ④ 1 月 PO（11 月预演；12 月就是本月的 PO 指令）
      jan: { need: needJan, toIssue: ceilK(needJan), wd: janWd, reserve: janReserve, short: Math.max(0, needJan - janReserve), fromRefund: janFromRefund, alloc: janItems, hist: (poAvg > 0 && poAvgWd > 0) ? poAvg * janWd / poAvgWd : 0, daily: poDailyJan, parts: splitParts(Y + 1, 1, needJan, janItems, 0) },
      planAhead,
      // ② OD 调拨（一个窗口只动一个花钱项目）
      od: { winEnd: odWinEnd, winNeed: odWinNeed, have: Math.min(odRemainTotal, odWinNeed), transfer: odXferNow, shortWin: odInstr.left, proj: odInstr.proj, wallets: odInstr.xfer, used: odInstr.used, otherProj: odInstr.otherProj, excessOd, unfundedYear: odUnfunded },
      // ③ 临时 OD 补缺口
      redirect: redirectList,   // 可选：改返还去向
      temp: { total: tempTotal, fromRefund: tempFromRefund, people: odAvgRate > 0 ? Math.ceil(tempTotal / odAvgRate) : 0, list: tempList, rate: odAvgRate },
      refundPast: sum(Object.values(refundPastByCode)),   // 往月 PO 的验收返还额（年底可用，前提是 12 月 15 日前验收）
      baList, calibR,
      // 在途识别结果（本月）
      inflight: { fc: curFc, willExec: curWillExec, over: curOver, k: kNeed, need: teamNeedAsOf, bySrc: Object.keys(willExecByCode).map(c => ({ code: c, name: per[c] ? per[c].name : c, fc: sum(poList.filter(r => r.budgetCode === c && info.get(r).s === asOf), r => info.get(r).C) })).filter(x => x.fc > 0) },
      // 推演汇总
      rows: srcRows, hit: hitN, assessed: assessedN, weightedTarget, forecastEnd, withTemp: forecastEnd + tempTotal, unspent,
      fund: { total: S, poNeed: P, odNeed: D, short: fundShort, month: fundMonth }
    };
  }
  const odOverList = codes.filter(c => (per[c].odExec || 0) > (per[c].odAvail || 0) && (per[c].odExec || 0) > 0);

  // 校准：团队理论 vs 历史实际
  const calibPo = (hasPoCfg && poAvg > 0) ? (theoryPo(curMo) - poAvg) / poAvg : null;
  const calibOd = (hasOdCfg && odAvg > 0) ? (theoryOd - odAvg) / odAvg : null;

  // 授予进度（催 BA）
  const grantProg = planCnyTotal > 0 ? availTotal / planCnyTotal : null;
  const grantWarn = [];
  odOverList.forEach(code => {
    const s = per[code];
    grantWarn.push({ name: (s.plan ? s.plan.name : s.name) + ' OD', msg: 'OD 已执行 ' + fmtCny(s.odExec) + ' > 可用 ' + fmtCny(s.odAvail) + '——调拨不足，请增加 OD 额度' });
  });
  plansY.forEach(p => {
    if (p.dead) return;   // 失效（预算下不来）：不再催BA
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
    const a = (poActByCode[c] || 0) + (poExclActByCode[c] || 0), b = per[c].itwExec;   // 加回挂靠PO执行额再比对
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
    Y, fx, snaps, snap, po, poList, excluded: excl, codes, per, plansY, unmatched, planCnyTotal, poDecision, itwExec, odExec, execTotal, execRate, weightedTarget,
    timeProg, curM, poMonthlyAct, poMonthlyFc, poActByCode, poFrozen, poReturn, openCnt,
    odMonthly, odAvg, odEst, odFuture, poFuture, poEst, forecastEnd, forecastRate,
    grantProg, grantWarn, checks, grantChecks, availTotal, remainTotal, itwFc,
    poExcludedRows, poExclAct, poExclActByCode,
    workdays, team: { poGroups, odGroups, poDaily, theoryOd, theoryPo, calibPo, calibOd, attend, hasPoCfg, hasOdCfg, plan, odCostAt, hcAt,
      hcSummary: (yy, mo) => ({ po: sum(poGroups, g => hcAt(g, yy, mo)) + sum(virtualAt('po', yy, mo), v => v.headcount), od: sum(odGroups, g => hcAt(g, yy, mo)) + sum(virtualAt('od', yy, mo), v => v.headcount) }) },
    poAvg, poAvgWd,
    projects, hasProj, byPo, wallets, odRemainTotal, odOverList,
    importNotes: state.importNotes || [],
    odAsOfText: snap ? 'OD 执行截至 ' + (+snap.date.slice(5, 7)) + ' 月（平台口径，滞后约 1 个月）' : ''
  };
}
/* ================= 渲染：通用 ================= */
function projectSelect() { }
function rateColor(rate, timeProg, target, forecast) {
  if (rate == null || !target) return '';
  // 有推演结果时按结果着色：会达标=绿（已达）/蓝（在途），会差=红；没有推演时按时间进度
  if (typeof forecast === 'number') return forecast >= target ? (rate >= target ? 'f-green' : '') : 'f-red';
  if (rate >= target) return 'f-green';
  if (rate >= timeProg - 0.05) return '';
  return 'f-red';
}
function execRowHtml(name, rate, target, timeProg, forecast, fcNum) {
  const w = rate == null ? 0 : Math.min(rate * 100, 100);
  const marks = (!target ? '' :
    '<div class="mark" style="left:' + Math.min(target * 100, 100) + '%" title="目标线 ' + fmtPct(target) + '"></div>') +
    (timeProg > 0 && timeProg < 1 ? '<div class="mark mark-time" style="left:' + (timeProg * 100).toFixed(1) + '%" title="时间进度 ' + fmtPct(timeProg) + '"></div>' : '');
  const fore = typeof forecast === 'string' ? forecast : (forecast != null ? '预计年底 ' + fmtPct(forecast) : '');
  return '<div class="exec-row">' +
    '<div class="exec-name" title="' + esc(name) + '">' + esc(name) + '</div>' +
    '<div class="pbar"><div class="pbar-fill ' + rateColor(rate, timeProg, target, typeof forecast === 'number' ? forecast : fcNum) + '" style="width:' + w.toFixed(1) + '%"></div>' + marks + '</div>' +
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
  let fileChip = '';
  if (fileHandle && !fileConnected) fileChip = '<span class="chip" style="border-color:var(--red);color:var(--red)">💾 数据文件未连接</span>';
  else if (fileHandle && fileConnected) fileChip = '<span class="chip">💾 budget.json 已连接</span>';
  if (fileHandle && !fileConnected) {
    el.className = 'banner warn';
    el.innerHTML = '⚠️ <b>数据文件未连接</b>：数据暂存浏览器缓存（不丢），点上方「📂 载入数据文件」重连一次即恢复自动同步。' + (chips.length ? '<br>数据待更新：' + chips.map(c => '<span class="chip">' + esc(c) + '</span>').join('') : '');
    return;
  }
  if (chips.length) { el.className = 'banner warn'; el.innerHTML = '⚠️ 数据待更新：' + chips.map(c => '<span class="chip">' + esc(c) + '</span>').join('') + fileChip; }
  else { el.className = 'banner ok'; el.innerHTML = '✓ 各数据源 ' + freq + ' 天内均已更新' + fileChip; }
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
        : '<div class="muted" style="margin-bottom:12px">四步开始：① 数据管理 → 录入年初规划（名称+美金）② 录团队配置（预测更准）③ 平台导出文件放进数据集文件夹（每个花钱项目一个子文件夹）④ 回到本页看进展、风险与行动。</div>' +
          '<div class="btn-row" style="justify-content:center"><button class="btn primary" data-action="data:demo">加载示例数据</button>' +
          '<button class="btn" data-action="goto:data">去录规划</button></div>') + '</div>';
    $('#summaryBar').innerHTML = hasOtherYear ? '<b>' + Y + ' 年度待开启</b>：历史年度数据已封卷保存，随时可切换回看。' : '<b>开始前</b>：先用示例数据体验，或直接录入你的规划与团队配置。';
  } else ob.innerHTML = '';

  const d = c.poDecision, P = d && d.po, J = d && d.jan, O = d && d.od;
  const wl = x => (x.proj && c.hasProj ? '<b>' + esc(x.proj) + '</b> / ' : '') + esc(x.name || x.code);   // 钱包：花钱项目 / 预算来源
  const odLabel = O ? (O.winEnd === 5 ? '5 月底' : O.winEnd === 6 ? '6 月底（含上半年清算）' : O.winEnd === 10 ? '10 月底' : '12 月底（含年终清算）') : '';
  const rowBy = {};
  if (d) d.rows.forEach(r => { if (r.code) rowBy[r.code] = r; });

  /* ---- ⓪ 摘要条 ---- */
  const gapTxt = (d && d.assessed > 0 && d.hit < d.assessed)
    ? '<b>' + (d.assessed - d.hit) + ' 个考核来源不达标</b>'
    : (c.forecastRate != null && c.weightedTarget != null && c.forecastRate < c.weightedTarget)
      ? '距加权目标还差 <b>' + fmtCny(c.weightedTarget * c.planCnyTotal - c.forecastEnd) + '</b>'
      : (d ? '各来源均可达标 ✓' : '');
  const actTxt = [];
  if (d) {
    if (d.isDec) actTxt.push('下旬下 1 月 PO <b>' + fmtCny(J.toIssue) + '</b>' + (J.short > 0 ? ' ⚠缺 ' + fmtCny(J.short) : ''));
    else if (P) { if (P.toIssue > 0) actTxt.push(P.nextM + ' 月 PO <b>' + fmtCny(P.toIssue) + '</b>'); else if (P.issued > 0) actTxt.push(P.nextM + ' 月 PO 已下齐 ✓'); }
    if (O.transfer > 0) actTxt.push('OD 调拨 <b>' + fmtCny(O.transfer) + '</b>');
    else if (O.shortWin > 0.5) actTxt.push('OD 额度缺 <b>' + fmtCny(O.shortWin) + '</b> 且无钱可调 ⚠');
    if (d.baList.length) actTxt.push('催 BA ' + d.baList.length + ' 项');
  }
  if (c.unmatched.length) actTxt.push('关联 ' + c.unmatched.length + ' 个编码');
  $('#summaryBar').innerHTML =
    '执行率 <b>' + fmtPct(c.execRate) + '</b>' + (d ? ' → 预计年底 <b>' + fmtPct(c.forecastRate) + '</b>（达标来源 ' + d.hit + '/' + d.assessed + '，' + gapTxt + '）' : (c.curM > 12 ? '（本年度已结束）' : '')) +
    (actTxt.length ? '<br>本周期：' + actTxt.join(' · ') : '<br>本周期无必做动作，保持节奏月底再导一次数据。') +
    (c.snap ? '<span style="opacity:.8;font-size:12px">　数据截至 ' + c.snap.date + '</span>' : '');

  /* ---- ① 进展 ---- */
  const kpi = (label, value, sub, cls) => '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value ' + (cls || '') + '">' + value + '</div><div class="kpi-sub">' + (sub || '') + '</div></div>';
  const tgtAll = c.weightedTarget != null ? c.weightedTarget : m.execRateTarget;
  const rateCls = c.execRate == null ? '' : (c.execRate >= tgtAll ? 'c-green' : (c.execRate >= c.timeProg * tgtAll - 0.05 ? 'c-blue' : 'c-red'));
  const foreCls = c.forecastRate == null ? '' : (c && d && d.assessed > 0 && d.hit >= d.assessed ? 'c-green' : (c.forecastRate >= tgtAll ? 'c-green' : 'c-red'));
  const grantCls = c.grantProg == null ? '' : (c.grantProg >= c.timeProg - 0.1 ? 'c-green' : 'c-red');
  const itwRemain = sum(c.codes, x => c.per[x].itwRemain), odRemain = c.remainTotal - itwRemain;
  $('#nowProgress').innerHTML =
    '<div class="kpi-grid">' +
    kpi('执行率', fmtPct(c.execRate), '已执行 ' + fmtCny(c.execTotal) + ' · 时间进度 ' + fmtPct(c.timeProg), rateCls) +
    kpi('预计年底', fmtPct(c.forecastRate), d ? 'PO ' + fmtCny(c.poFuture) + ' + OD ' + fmtCny(c.odFuture) + (d.temp.total > 0 ? ' · 补临时OD后 ' + fmtPct(c.planCnyTotal > 0 ? d.withTemp / c.planCnyTotal : null) : '') : '团队照常干、不额外加人', foreCls) +
    kpi('加权目标', fmtPct(c.weightedTarget), '各来源目标按规划加权' + (c.plansY.some(x => !x.dead && x.target === 0) ? ' · 含不考核来源' : '')) +
    kpi('授予进度', fmtPct(c.grantProg), fmtCny(c.availTotal) + ' / ' + fmtCny(c.planCnyTotal) + ' · 时间 ' + fmtPct(c.timeProg), grantCls) +
    kpi('当前可支配', fmtCny(c.remainTotal), 'IT外包 ' + fmtCny(itwRemain) + ' · OD ' + fmtCny(odRemain) + (d && d.od.excessOd > 10000 ? ' · 多余OD额度 ' + fmtCny(d.od.excessOd) : ''), d && d.fund.short > 0 ? 'c-red' : '') +
    kpi('在途冻结', fmtCny(c.poFrozen), c.openCnt + ' 张未关闭 PO · 验收后返还 ' + fmtCny(c.poReturn), c.poReturn > 0 ? 'c-amber' : '') +
    '</div>' +
    '<div style="margin-top:10px">' + execRowHtml('总体', c.execRate, tgtAll, c.timeProg, d ? c.forecastRate : null) +
    (d ? d.rows.slice(0, 8) : []).map(r => {
      const nm = r.notGranted ? r.name + '（未到账）' : (r.unmatched ? r.name + ' ⚠️未关联' : r.name);
      const fore = !r.assessed ? (r.unmatched ? '未关联规划' : '不考核') : (r.notGranted ? '平台未到账' : '预计年底 ' + fmtPct(r.rate) + (r.temp > 0 ? ' → 补OD后 ' + fmtPct(r.rateWithTemp) : ''));
      return execRowHtml(nm, r.planCny ? r.exec / r.planCny : null, r.assessed || r.notGranted ? r.target : null, c.timeProg, fore, r.assessed ? r.rate : null);
    }).join('') +
    (d && d.rows.length > 8 ? '<div class="muted" style="padding:4px 0">…共 ' + d.rows.length + ' 个来源，完整推演见下方决策卡</div>' : '') + '</div>' +
    '<div class="muted" style="margin-top:4px">ℹ️ ' + esc(c.odAsOfText || '') + (d ? '　执行率的考核线是各来源自己的目标；总体目标 = 各来源目标按规划金额加权。' : '') + '</div>';

  /* ---- ② 风险 ---- */
  const risks = [];
  if (d && d.fund.short > 0) risks.push(['red', '团队资金不足', '剩余团队 PO ' + fmtCny(d.fund.poNeed) + ' + 常规 OD 扣减 ' + fmtCny(d.fund.odNeed) + ' > 可支配 ' + fmtCny(d.fund.total) + '，缺 <b>' + fmtCny(d.fund.short) + '</b>' + (d.fund.month ? '，钱在 <b>' + d.fund.month + '</b>耗尽' : '') + '——催 BA 尽快到账']);
  if (c.odOverList.length) risks.push(['red', 'OD 额度已不足', c.odOverList.map(code => esc((c.per[code].plan ? c.per[code].plan.name : c.per[code].name)) + ' OD 已执行 ' + fmtCny(c.per[code].odExec) + ' > 可用 ' + fmtCny(c.per[code].odAvail)).join('；') + '——立即调拨，否则会落到「费用先结算至PO受益部门」']);
  if (d && d.assessed > 0 && (d.hit < d.assessed || (c.forecastRate != null && c.weightedTarget != null && c.forecastRate < c.weightedTarget)))
    risks.push(['red', '达标风险', '按当前推演 <b>' + (d.assessed - d.hit) + '</b> 个考核来源不达标' + (c.weightedTarget != null ? '（预计总体 ' + fmtPct(c.forecastRate) + ' vs 加权目标 ' + fmtPct(c.weightedTarget) + '）' : '') + (d.temp.total > 0 ? '；其中 <b>' + fmtCny(d.temp.total) + '</b> 可用年底临时 OD 补上' : '') + '，见决策卡']);
  if (c.checks.length)
    risks.push(['red', '两表不符', 'PO明细汇总与执行表有 ' + c.checks.length + ' 项对不上（最大差额 ' + fmtCny(Math.max(...c.checks.map(k => Math.abs(k.diff)))) + '），见底部校验卡']);
  if (c.unmatched.length)
    risks.push(['red', '编码未关联', c.unmatched.length + ' 个预算来源（' + c.unmatched.map(u => esc(c.snap.rows[u].name)).join('、') + '）未关联规划，执行率分母不准']);
  if (c.grantProg != null && c.grantProg < c.timeProg - 0.1)
    risks.push(['amber', '授予落后', '授予进度 ' + fmtPct(c.grantProg) + ' 落后时间进度 ' + fmtPct(c.timeProg) + '，差 ' + fmtCny(c.planCnyTotal * c.timeProg - c.availTotal) + '——催 BA']);
  c.importNotes.filter(n => n && n.text).forEach(n => risks.push(['amber', '导入提醒', esc(n.text)]));
  if (d) d.baList.forEach(b => risks.push(['amber', '来源缺钱', esc(b.name) + '：缺口 ' + fmtCny(b.short) + '（' + b.kind + '），只靠 PO 消化最晚 <b>' + b.latest + ' 月</b>到账——催 BA']));
  if (c.curM === 5 || c.curM === 11)
    risks.push(['amber', '清算月', (c.curM === 5 ? '6' : '12') + ' 月底 OD 大额清算' + (c.curM === 11 ? '（含年终奖约 ' + (m.bonusMonths || 3.5) + ' 个月月均）' : '') + '，确认 OD 额度是否够']);
  if (d && d.od.transfer > 0) risks.push(['amber', 'OD 额度不足', '到 ' + odLabel + ' 还需扣 ' + fmtCny(d.od.winNeed) + '，现有额度 ' + fmtCny(d.od.have) + '，<b>本次调拨 ' + fmtCny(d.od.transfer) + '</b>' + (c.hasProj ? '（花钱项目 ' + esc(d.od.proj) + ' 内）' : '')]);
  else if (d && d.od.shortWin > 0.5) risks.push(['red', 'OD 额度不足且无钱可调', '到 ' + odLabel + ' 需扣 ' + fmtCny(d.od.winNeed) + '，现有额度 ' + fmtCny(d.od.have) + '，IT外包 剩余里没有钱可调，缺 <b>' + fmtCny(d.od.shortWin) + '</b>——月底扣减会落到「费用先结算至PO受益部门」，先催 BA 到账或催验收返还']);
  if (d && d.inflight.fc > 0 && d.inflight.fc < d.inflight.need * 0.95) risks.push(['amber', '当月 PO 不够', '当月在执行的 PO 预测 ' + fmtCny(d.inflight.fc) + ' < 团队当月需求 ' + fmtCny(d.inflight.need) + '，差 ' + fmtCny(d.inflight.need - d.inflight.fc) + '——需要补一张 PO']);
  if (d && d.inflight.over > 0) risks.push(['amber', '当月多下', '当月在执行的 PO 预测 ' + fmtCny(d.inflight.fc) + '，团队当月需求约 ' + fmtCny(d.inflight.need) + '，预计多下 <b>' + fmtCny(d.inflight.over) + '</b>（' + fmtPct(d.inflight.over / d.inflight.fc) + '），验收后才能回来']);
  if (d && d.yearEnd && J.short > 0) risks.push(['amber', '1 月 PO 缺口', '达标后的结余只够 1 月 PO ' + fmtCny(J.reserve) + '，需求 ' + fmtCny(J.need) + '，缺 <b>' + fmtCny(J.short) + '</b>——调低某来源目标 ' + fmtCny(J.short) + ' 即可补足（目标由你权衡）']);
  if (d && d.yearEnd && d.unspent > 10000 && J.short <= 0) risks.push(['amber', '花不掉的余量', '达标并留足 1 月 PO 后仍有 <b>' + fmtCny(d.unspent) + '</b> 花不掉——年底临时加 OD / 找别人花 / 调低目标']);
  if (d && d.yearEnd && d.od.excessOd > 10000) risks.push(['amber', '多余 OD 额度', 'OD 额度 ' + fmtCny(c.odRemainTotal) + ' 多于到年底的扣减 ' + fmtCny(c.odFuture) + '，多出 <b>' + fmtCny(d.od.excessOd) + '</b> 年底前调回 IT外包，否则花不掉']);
  if (c.poReturn > 0) risks.push(['amber', '在途冻结', c.openCnt + ' 张 PO 冻结 ' + fmtCny(c.poFrozen) + '，验收后返还 <b>' + fmtCny(c.poReturn) + '</b>（明细见 PO 台账「在途与返还」）' + (d && d.yearEnd ? '——12 月 15 日前完成验收，返还的钱才能用于 1 月 PO' : '——验收周期约 1 个月')]);
  if (c.team.hasPoCfg && Math.abs(c.team.calibPo || 0) > 0.1)
    risks.push(['amber', '团队校准', 'PO 理论月度与历史实际偏差 ' + fmtPct(c.team.calibPo) + '（理论 ' + fmtCny(c.team.theoryPo(Math.max(Math.min(c.curM, 12), 1))) + ' vs 近3月实际 ' + fmtCny(c.poAvg) + '），检查人数/单价/出勤系数']);
  if (c.team.hasOdCfg && Math.abs(c.team.calibOd || 0) > 0.1)
    risks.push(['amber', '团队校准', 'OD 理论月度与历史实际偏差 ' + fmtPct(c.team.calibOd) + '（理论 ' + fmtCny(c.team.theoryOd) + ' vs 近3月实际 ' + fmtCny(c.odAvg) + '）']);
  if (state.team.length) {
    const days = state.meta.lastHcCheck ? daysBetween(state.meta.lastHcCheck, todayStr()) : null;
    if (days == null || days > 35) risks.push(['amber', '人数待确认', '团队人数经常变化，距上次确认' + (days == null ? '从未' : '已 ' + days + ' 天') + '，请核对团队配置']);
  }
  if (c.curM <= 3 && c.po) {
    const crossPO = c.po.rows.filter(r => r.startDate && +String(r.startDate).slice(0, 4) === Y && +String(r.startDate).slice(5, 7) === 1);
    const crossAmt = sum(crossPO, r => sum(Object.entries(r.months), ([mm, v]) => +mm < c.po.asOf ? v : 0));
    if (crossAmt > 0) risks.push(['info', '1 月 PO', '本年执行含 <b>' + fmtCny(crossAmt) + '</b> 的 1 月 PO（去年 12 月下旬下单、用去年结余）——按费用起始时间计入今年，属正常']);
  }
  if (c.curM >= 11 && d) risks.push(['info', '落账节奏', '冲今年执行率只能靠年内能执行完的 PO 和 12 月 31 日的 OD 清算；12 月下旬下的 1 月 PO 用今年的结余、计入明年']);
  const freq = state.meta.updateFreqDays || 14;
  ['po', 'exec'].forEach(k => {
    const dd = (state.updatedAt || {})[k];
    const days = dd ? daysBetween(dd, todayStr()) : null;
    if (days == null || days > freq) risks.push(['amber', '数据过期', (k === 'po' ? 'PO明细' : '执行表') + (days == null ? '未导入' : '已 ' + days + ' 天未更新')]);
  });
  $('#nowRisk').innerHTML = risks.length
    ? risks.map(([lv, tag, txt]) => '<div class="risk-item"><span class="risk-lv ' + lv + '">' + (lv === 'red' ? '!' : lv === 'amber' ? '·' : lv === 'info' ? 'i' : '✓') + '</span><div><b>' + tag + '</b>　' + txt + '</div></div>').join('')
    : '<div class="risk-item"><span class="risk-lv green">✓</span><div><b>暂无风险</b>　执行进度、数据一致性、授予进度均正常</div></div>';

  /* ---- Ⓣ 本周期操作与决策 ---- */
  const box = $('#poDecisionBox'), sub = $('#poDecisionSub');
  if (!d) {
    sub.textContent = '';
    box.innerHTML = '<div class="empty">' + (c.curM > 12 ? '本年度已结束，无待下 PO。' : '导入执行表和 PO 明细后展示本周期操作') + '</div>';
  } else {
    sub.textContent = (d.isDec ? '12 月下旬下 1 月 PO' : P ? '为 ' + P.nextM + ' 月 PO（' + P.wd + ' 个工作日）· 决策点 ' + c.curM + '月18-19日' : '') + (c.snap ? ' · 数据截至 ' + c.snap.date : '');
    const tile = (label, val, note, cls, style) =>
      '<div class="kpi" style="' + (style || '') + '"><div class="kpi-label">' + label + '</div><div class="kpi-value ' + (cls || '') + '">' + val + '</div><div class="kpi-sub">' + note + '</div></div>';
    const odBackNote = items => items.some(x => x.odBack > 0) ? ' <span class="muted">（其中 ' + fmtCny(sum(items, x => x.odBack)) + ' 需先把 OD 额度调回 IT外包）</span>' : '';
    let html = '';
    // 按「PO归属」分张下时的明细；只有一张（没标归属）时照旧只列钱包
    const partsHtml = (parts, items, refNote) => {
      if (!parts || parts.length <= 1) return items.length ? '<div class="ins-sub">从这些钱包出：' + items.map(x => wl(x) + ' ' + fmtCny(x.amt) + (refNote && x.fromRef ? '<span class="muted">（验收返还后）</span>' : '')).join('、') + '</div>' : '';
      return '<div class="ins-sub">按人员归属分 <b>' + parts.length + '</b> 张下（钱包已按顺序分给各张）：</div>' +
        parts.map(p => '<div class="ins-sub">　<b>' + esc(p.label || '未标归属') + '</b>：' + fmtCny(p.toIssue) + '<span class="muted">（' + p.hc + ' 人，日额 ' + fmtCny(p.daily) + '）</span>' +
          (p.alloc.length ? '　← ' + p.alloc.map(x => wl(x) + ' ' + fmtCny(x.amt)).join('、') : '<span style="color:var(--red)">　没有可用的钱包</span>') + '</div>').join('');
    };
    const planHtml = () => d.planAhead.length
      ? '<div class="ins-sub" style="color:var(--purple)">已计入变动计划：' + d.planAhead.map(p => esc(p.ym.slice(2).replace('-', '年')) + '月 ' + p.kind.toUpperCase() + ' ' + (p.count > 0 ? '+' : '') + p.count + ' 人（' + (p.kind === 'po' ? '日' : '月') + '单价 ' + fmtCny(p.rate) + '）' + (p.note ? '·' + esc(p.note) : '')).join('；') + '</div>'
      : '';
    /* ① PO */
    if (d.isDec) {
      html += '<div class="ins"><div class="ins-head">① 下旬下 <b>1 月 PO</b>：' + fmtCny(J.toIssue) + '</div>' +
        '<div class="ins-sub">日额 ' + fmtCny(J.daily) + ' × 明年 1 月 ' + J.wd + ' 个工作日 × 出勤 ' + c.team.attend + (d.calibR !== 1 ? ' × 校准 ' + d.calibR.toFixed(3) : '') + '　｜　按当前单价估算，新一年单价调整后重算</div>' +
        partsHtml(J.parts, J.alloc, true) +
        (!J.alloc.length && J.toIssue > 0 ? '<div class="ins-sub" style="color:var(--red)">没有可用的钱——达标后的结余不够</div>' : '') + planHtml() +
        '<div class="ins-sub">' + (J.short > 0 ? '<span style="color:var(--red)">1 月 PO 缺 ' + fmtCny(J.short) + '：调低任一考核来源的目标 ' + fmtCny(J.short) + ' 即可补足（目标由你权衡）</span>' : '✓ 今年的结余够 1 月整月，团队不断档' + (J.fromRefund > 0 ? '（其中 ' + fmtCny(J.fromRefund) + ' 要等往月 PO 在 12 月 15 日前验收返还后才有）' : '')) + '　｜　参考区间 ' + fmtCny(Math.max(0, J.need - J.daily * 0.5)) + ' ~ ' + fmtCny(J.need) + '（年底不多下）</div></div>';
    } else if (P) {
      const multi = P.parts && P.parts.length > 1;
      const basis = '日额 ' + fmtCny(P.daily) + ' × ' + P.wd + ' 个工作日 × 出勤 ' + c.team.attend + (d.calibR !== 1 ? ' × 校准 ' + d.calibR.toFixed(3) : '') + ' = ' + fmtCny(P.need) + (P.histNext > 0 ? '　｜　近 3 月实际折算 ' + fmtCny(P.histNext) : '') + '　｜　参考区间 ' + fmtCny(P.low) + ' ~ ' + fmtCny(P.high) + (d.yearEnd ? '（年底按需求下满，不多下）' : '');
      if (P.toIssue <= 0) html += '<div class="ins ok"><div class="ins-head">✓ ' + P.nextM + ' 月 PO 已下齐（已下 ' + fmtCny(P.issued) + '）</div><div class="ins-sub">团队需求 ' + fmtCny(P.need) + '</div>' + planHtml() + '</div>';
      else html += '<div class="ins">' +
        '<div class="ins-head">① 20 号前下 <b>' + P.nextM + ' 月 PO</b>：' + fmtCny(P.toIssue) + (P.issued > 0 ? '<span class="muted">（需求 ' + fmtCny(P.need) + '，已下 ' + fmtCny(P.issued) + '）</span>' : '') + '</div>' +
        '<div class="ins-sub">' + basis + '</div>' +
        (multi ? partsHtml(P.parts, P.alloc, false)
          : (P.alloc.length ? '<div class="ins-sub">从这些钱包出：' + P.alloc.map(x => wl(x) + ' ' + fmtCny(x.amt)).join('、') + odBackNote(P.alloc) + '　｜　' + (c.hasProj ? '涉及 ' + P.projs.length + ' 个花钱项目、' : '') + new Set(P.alloc.map(x => x.code)).size + ' 个来源' + (c.hasProj ? '' : '（执行表放进项目子文件夹重新导入后，可区分花钱项目）') + '</div>'
            : '<div class="ins-sub" style="color:var(--red)">可支配的钱不够，这张 PO 没有钱包可出——先催 BA / 催验收</div>')) +
        (d.fund.short > 0 && P.funded < P.toIssue ? '<div class="ins-sub" style="color:var(--red)">其中 ' + fmtCny(P.toIssue - P.funded) + ' 没有钱可出</div>' : '') + planHtml() +
        (multi ? '' : '<div class="ins-sub muted">钱包怎么分到你当月的几张 PO 上由你定；在团队 Excel 里给每个人标上「PO归属」后，这里会直接给出每张的金额。</div>') + '</div>';
    }
    /* ② OD */
    if (O.shortWin > 0.5) html += '<div class="ins" style="border-left-color:var(--red)"><div class="ins-head">② <b style="color:var(--red)">OD 额度不够，且没有钱可调：缺 ' + fmtCny(O.shortWin) + '</b></div>' +
      '<div class="ins-sub">到 ' + odLabel + ' 需扣 ' + fmtCny(O.winNeed) + '，现有 OD 额度 ' + fmtCny(O.have) + '；各钱包的 IT外包 剩余已被 PO 占用，没有钱可调——月底扣减会落到「费用先结算至PO受益部门」</div>' +
      '<div class="ins-sub">先催 BA 到账或催验收返还；也可以少下一点 PO（参考区间下限 ' + fmtCny(P ? P.low : 0) + '）把额度让给 OD</div></div>';
    else if (O.transfer > 0) html += '<div class="ins"><div class="ins-head">② <b>OD 调拨 ' + fmtCny(O.transfer) + '</b>（IT外包 → OD）</div>' +
      (O.wallets.length ? '<div class="ins-sub">' + (c.hasProj ? '在花钱项目 <b>' + esc(O.proj) + '</b> 内：' : '') + O.wallets.map(x => wl(x) + ' ' + fmtCny(x.amt)).join('、') + '</div>' : '') +
      '<div class="ins-sub">到 ' + odLabel + ' 需扣 ' + fmtCny(O.winNeed) + '，现有 OD 额度 ' + fmtCny(O.have) + (O.otherProj ? '　<span style="color:var(--amber)">该项目不够，需动用另一个花钱项目</span>' : '') + '　｜　调后本窗口不用再调</div></div>';
    else html += '<div class="ins ok"><div class="ins-head">✓ OD 额度够用，本月不用调</div><div class="ins-sub">到 ' + odLabel + ' 需扣 ' + fmtCny(O.winNeed) + '，现有 ' + fmtCny(c.odRemainTotal) + (O.excessOd > 10000 ? '　｜　<span style="color:var(--amber)">多出 ' + fmtCny(O.excessOd) + ' 年底前调回 IT外包，否则花不掉</span>' : '') + '</div></div>';
    /* ③ 催 BA */
    if (d.baList.length) html += '<div class="ins"><div class="ins-head">③ 催 BA：' + d.baList.length + ' 个来源缺钱</div>' +
      d.baList.map(b => '<div class="ins-sub">' + esc(b.name) + ' 缺 <b>' + fmtCny(b.short) + '</b>（' + b.kind + '）' + (b.latest ? '，只靠 PO 消化最晚 <b>' + b.latest + ' 月</b>到账' : '') + '</div>').join('') + '</div>';
    /* 可选：改返还去向（往月未关闭 PO 的预算项分配比例，验收前可调） */
    if (d.redirect.length) html += '<div class="ins" style="border-left-color:var(--purple)"><div class="ins-head">可选：改返还去向 <span class="muted">（不是必做项）</span></div>' +
      d.redirect.map(x => '<div class="ins-sub">' + esc(x.poNo) + '：验收后的返还里有 <b>' + fmtCny(x.amt) + '</b> 默认回到「' + esc(x.fromName) + '」，可以改到「' + esc(x.toName) + '」' + (c.hasProj ? '（花钱项目 ' + esc(x.proj) + ' 内）' : '') + '——后者缺这笔钱，回去后能补上缺口</div>').join('') +
      '<div class="ins-sub">平台口径：已执行的金额是事实、不能调；能调的只是 PO 的预算项分配比例（下的时候比如 A/B = 3.5/1.5），也就是没花完的钱退回到哪个钱包，验收前改。执行中尽量避免这种调整，所以系统只在能补上"来源缺钱"时提示。</div></div>';
    /* 本月识别：在途 */
    const I = d.inflight;
    if (I.fc > 0) html += '<div class="ins-sub" style="margin-top:8px">本月识别：在执行 PO 的预测合计 ' + fmtCny(I.fc) + '（' + I.bySrc.map(x => esc(shortName(x.name)) + ' ' + fmtCny(x.fc)).join('、') + '）→ 预计执行 <b>' + fmtCny(I.willExec) + '</b>' + (I.over > 0 ? '，多下 <b style="color:' + (I.over / I.fc > 0.05 ? 'var(--red)' : 'var(--amber)') + '">' + fmtCny(I.over) + '</b>（冻结，下月验收后返还）' : '') + (I.fc < I.need * 0.95 ? '，<b style="color:var(--red)">比团队需求少 ' + fmtCny(I.need - I.fc) + '</b>' : '') + '</div>';
    /* 年底推演 */
    if (d.yearEnd) {
      const miss = d.rows.filter(r => r.assessed && !r.hit);
      html += '<div class="ye"><div class="ye-title">年底推演<span class="muted">（不是本月动作，提前看结果；按上面的指令执行后）</span></div>' +
        '<div class="kpi-grid" style="margin-top:6px">' +
        tile('达标来源', d.hit + ' / ' + d.assessed, miss.length ? '未达标：' + miss.slice(0, 3).map(r => esc(r.name) + ' 差 ' + fmtCny(r.gapLeft)).join('、') + (miss.length > 3 ? '…' : '') : '全部达标 ✓', miss.length ? 'c-amber' : 'c-green') +
        tile('预计总体执行率', fmtPct(c.forecastRate), '加权目标 ' + fmtPct(d.weightedTarget) + (d.temp.total > 0 ? ' · 补临时OD后 ' + fmtPct(c.planCnyTotal > 0 ? d.withTemp / c.planCnyTotal : null) : ''), d.hit >= d.assessed ? 'c-green' : 'c-red') +
        tile('1 月 PO', fmtCny(J.reserve), '需求 ' + fmtCny(J.need) + (J.short > 0 ? '，<b style="color:var(--red)">缺 ' + fmtCny(J.short) + '</b>' : ' ✓ 够') + (J.fromRefund > 0 ? '，含验收返还 ' + fmtCny(J.fromRefund) : ''), J.short > 0 ? 'c-red' : 'c-green') +
        tile('验收后返还', fmtCny(c.poReturn), '冻结 ' + fmtCny(c.poFrozen) + (d.refundPast > 0 ? ' · 往月 PO 的 ' + fmtCny(d.refundPast) + ' 在 12 月 15 日前验收后可用于临时 OD / 1 月 PO' : ' · 12 月 15 日前完成验收'), c.poReturn > 0 ? 'c-amber' : '') +
        '</div>' +
        (d.temp.total > 0 ? '<div class="ins-sub">临时 OD 补缺口：<b>' + fmtCny(d.temp.total) + '</b>' + (d.temp.fromRefund > 0 ? '<span style="color:var(--amber)">（其中 ' + fmtCny(d.temp.fromRefund) + ' 需往月 PO 验收返还后才有）</span>' : '') + (d.temp.people ? '（约合 ' + d.temp.people + ' 人，12 月清算前到岗）' : '') + ' ← ' + d.temp.list.map(x => esc(x.name) + ' ' + fmtCny(x.amt)).join('、') + '</div>' : (miss.length ? '<div class="ins-sub">未达标的来源没有可用的钱补临时 OD——只能催 BA 或调低目标</div>' : '')) +
        (d.unspent > 10000 && J.short <= 0 ? '<div class="ins-sub">达标并留足 1 月 PO 后仍有 <b>' + fmtCny(d.unspent) + '</b> 花不掉：年底临时加 OD / 找别人花 / 调低目标</div>' : '') +
        '</div>';
    }
    /* 分来源推演表（折叠） */
    const yes = v => v > 0 ? fmtCny(v) : '<span class="muted">—</span>';
    html += '<details class="fold"' + (foldOpen ? ' open' : '') + '><summary>分来源推演表（' + d.rows.length + ' 个来源，从现在推到 12 月 31 日）</summary><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>预算来源</th><th class="num">规划</th><th class="num">目标</th><th class="num">已执行</th><th class="num">在途将执行</th><th class="num">缺口</th><th class="num">可支配</th>' +
      '<th class="num">后续PO<br><span class="muted">含本月</span></th><th class="num">常规OD</th><th class="num">临时OD</th><th class="num">1月PO</th><th class="num">年底预计</th><th>达标</th><th class="num">余量去向</th></tr></thead><tbody>';
    d.rows.forEach(r => {
      const st = !r.assessed ? '<span class="muted">' + (r.unmatched ? '未关联' : '不考核') + '</span>' : r.notGranted ? '<span style="color:var(--red)">未到账</span>' : (r.hit ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--red)">✗ 差' + fmtCny(Math.max(0, r.planCny * r.target - r.endExec - r.temp)) + '</span>');
      const leftTxt = r.jan > 0 ? '留1月 ' + fmtCny(r.jan) : (r.left > 1000 ? '花不掉 ' + fmtCny(r.left) : '<span class="muted">—</span>');
      html += '<tr' + (r.notGranted ? ' style="opacity:.7"' : '') + '><td><b>' + esc(r.name) + '</b>' + (c.hasProj && r.wallets.length > 1 ? '<div class="muted">' + r.wallets.map(w => esc(w.proj) + ' ' + fmtCny(w.itw + w.od)).join(' / ') + '</div>' : '') + '</td>' +
        '<td class="num">' + (r.planCny ? fmtCny(r.planCny) : '—') + '</td><td class="num">' + (r.target != null && r.assessed ? fmtPct(r.target) : '—') + '</td>' +
        '<td class="num">' + fmtCny(r.exec) + '</td><td class="num">' + yes(r.willExec) + '</td><td class="num">' + yes(r.gap) + '</td><td class="num">' + fmtCny(r.funds) + '</td>' +
        '<td class="num">' + yes(r.po) + (r.poNext > 0 ? '<div class="muted">本月 ' + fmtCny(r.poNext) + '</div>' : '') + '</td><td class="num">' + yes(r.odExec) + (r.odXfer > 0 ? '<div class="muted">需调 ' + fmtCny(r.odXfer) + '</div>' : '') + '</td><td class="num">' + yes(r.temp) + '</td><td class="num">' + yes(r.jan) + '</td>' +
        '<td class="num">' + (r.planCny ? fmtPct(r.rate) : '—') + '</td><td>' + st + '</td><td class="num">' + leftTxt + '</td></tr>';
    });
    html += '</tbody></table></div><div class="muted" style="margin-top:6px">缺口 = 规划×目标 − 已执行 − 在途将执行。后续 PO/常规 OD 先补缺口大的来源；临时 OD 只在年底排；1 月 PO 只用达标后的 IT外包 结余。</div></details>';
    box.innerHTML = html;
  }

  /* ---- ③ 行动清单 ---- */
  const acts = [];
  if (d) {
    if (d.isDec) { if (J.toIssue > 0) acts.push({ t: '<b>下旬下 1 月 PO ' + fmtCny(J.toIssue) + '</b>' + (J.short > 0 ? '（缺 ' + fmtCny(J.short) + '，见决策卡）' : '') }); }
    else if (P && P.toIssue > 0) acts.push({ t: '<b>20 号前下 ' + P.nextM + ' 月 PO ' + fmtCny(P.toIssue) + '</b>' + (P.issued > 0 ? '（已下 ' + fmtCny(P.issued) + '）' : '') + (P.alloc.length ? '，从 ' + P.alloc.length + ' 个钱包出，见决策卡' : '（可支配不足，先催 BA/验收）') });
    if (O.transfer > 0) acts.push({ t: '<b>OD 调拨 ' + fmtCny(O.transfer) + '</b>（' + (c.hasProj ? '花钱项目 ' + esc(O.proj) + ' 内，' : '') + 'IT外包→OD，调后可用到 ' + esc(odLabel) + '）' });
    else if (O.shortWin > 0.5) acts.push({ t: '<b>OD 额度缺 ' + fmtCny(O.shortWin) + ' 且无钱可调</b>：先催 BA 到账 / 催验收返还，否则月底扣减会落到「费用先结算至PO受益部门」' });
    d.baList.slice(0, 3).forEach(b => acts.push({ t: '催 BA：<b>' + esc(b.name) + '</b> 缺 ' + fmtCny(b.short) + '（' + b.kind + '），只靠 PO 消化最晚 ' + b.latest + ' 月到账' }));
    d.redirect.forEach(x => acts.push({ t: '可选：把 <b>' + esc(x.poNo) + '</b> 的返还 <b>' + fmtCny(x.amt) + '</b> 改到「' + esc(x.toName) + '」（验收前调整这张 PO 的预算项分配比例；执行额不变，只改没花完的钱退回到哪）', btn: 'goto:po', btnTxt: '看 PO' }));
    if (d.yearEnd && d.temp.total > 0) acts.push({ t: '安排<b>临时 OD ' + fmtCny(d.temp.total) + '</b>' + (d.temp.people ? '（约合 ' + d.temp.people + ' 人）' : '') + '，12 月清算前到岗：' + d.temp.list.map(x => esc(x.name) + ' ' + fmtCny(x.amt)).join('、') });
    if (d.yearEnd && J.short > 0) acts.push({ t: '1 月 PO 缺 ' + fmtCny(J.short) + '：到「数据管理 → 年初规划」调低某来源目标（每调低 ' + fmtCny(1000) + '，可留就多 ' + fmtCny(1000) + '）', btn: 'goto:data', btnTxt: '去调目标' });
  }
  if (c.unmatched.length) acts.push({ t: '关联 ' + c.unmatched.length + ' 个新预算来源编码（' + c.unmatched.map(u => esc(c.snap.rows[u].name)).join('、') + '），否则执行率分母不准', btn: 'link:manage', btnTxt: '去关联' });
  if (c.poReturn > 0) acts.push({ t: '催验收：' + c.openCnt + ' 张 PO 在途冻结 ' + fmtCny(c.poFrozen) + '，验收后返还 ' + fmtCny(c.poReturn) + '（明细见 PO 台账「在途与返还」' + (d && d.yearEnd ? '；12 月 15 日前完成，返还的钱才能用于 1 月 PO' : '；验收周期约 1 个月') + '）', btn: 'goto:po', btnTxt: '看明细' });
  if (state.team.length) {
    const days = state.meta.lastHcCheck ? daysBetween(state.meta.lastHcCheck, todayStr()) : null;
    if (days == null || days > 35) acts.push({ t: '确认团队人数是否有变化（上次确认：' + (state.meta.lastHcCheck || '从未') + '），有变化请更新团队 Excel 放入数据集文件夹', btn: 'hc:confirm', btnTxt: '人数没变，确认' });
  }
  if (c.curM === 5 || c.curM === 11) acts.push({ t: '为 ' + (c.curM === 5 ? '6 月上半年清算' : '12 月全年清算+年终奖') + '做准备：确认 OD 额度充足' + (c.curM === 5 ? '，必要时调拨' : '，并校准参数里的年终奖月数（当前 ' + (m.bonusMonths || 3.5) + '）') });
  const stale = ['po', 'exec'].some(k => { const dd = (state.updatedAt || {})[k]; const days = dd ? daysBetween(dd, todayStr()) : null; return days == null || days > freq; });
  if (stale) acts.push({ t: '导入最新平台数据（每个花钱项目的总览 + PO 明细，放进数据集对应子文件夹），月底/月初各一次', btn: 'import:open', btnTxt: '导入' });
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
  let ex = execRowHtml('总体', c.execRate, tgtAll, c.timeProg, d ? c.forecastRate : null);
  c.codes.forEach(code => {
    const s = c.per[code];
    const r = rowBy[code];
    ex += execRowHtml(s.plan ? s.plan.name + '（' + s.name + '）' : s.name + ' [' + code + '] ⚠️未关联', s.execRate, s.target, c.timeProg, r ? (s.target === 0 ? '不考核' : '预计年底 ' + fmtPct(r.rate)) : (s.target === 0 ? '不考核' : null), r && s.target !== 0 ? r.rate : null);
  });
  $('#execRates').innerHTML = ex +
    '<div class="exec-legend"><span class="lg"><i style="background:var(--green)"></i>目标线（各来源自己的目标）</span>' +
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
      ((d && d.baList.length) ? '<div style="margin-top:6px">' + d.baList.map(b => '<div class="adv-item"><span class="adv-label">' + esc(b.name) + '</span><div>缺口 ' + fmtCny(b.gap) + '，去掉可支配和预计返还后还缺 <b>' + fmtCny(b.short) + '</b>（' + b.kind + '）' + (b.latest ? '，只靠 PO 消化最晚 ' + b.latest + ' 月到账' : '') + '</div></div>').join('') + '</div>' : '') +
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

  /* ---- ⑤ 回测：上次导入时的建议/估计 vs 这次导入看到的实际 ---- */
  $('#backtestBox').innerHTML = backtestHtml(c);
}
// 回测面板：每次导入记一份快照，下次导入用实际数回测（当月将执行/多下、下月 PO 建议金额）
function backtestHtml(c) {
  const logs = (state.importLogs || []).filter(L => L.year === c.Y).slice(-6).reverse();
  if (!logs.length) return '<div class="empty">还没有导入记录——每次导入自动记一份建议，下次导入后在这里对比"建议 vs 实际"。</div>';
  const dev = (a, b) => (b > 0 ? ((a - b) / b) : 0);
  return '<table class="tbl"><thead><tr><th>导入日</th><th>项目</th><th class="num">当时的估计</th><th class="num">实际</th><th class="num">偏差</th></tr></thead><tbody>' +
    logs.map(L => {
      const est = L.estimates || {}, act = L.actual || {};
      const rows = [
        ['当月将执行', est.curExec, act.exec],
        ['当月多下', est.curOver, act.over],
        [L.month + ' 月后的 PO 建议', L.advice && L.advice.poNeed, act.issuedNext]
      ];
      return rows.map(([nm, e, a], i) => {
        const pending = a == null;
        return '<tr' + (i > 0 ? ' style="opacity:.85"' : '') + '><td>' + (i === 0 ? esc(L.date) : '') + '</td><td>' + nm + '</td><td class="num">' + fmtCny(e) + '</td>' +
          '<td class="num">' + (pending ? '<span class="muted">待下次导入</span>' : fmtCny(a)) + '</td><td class="num">' + (pending || !e ? '<span class="muted">—</span>' : '<span style="color:' + (Math.abs(dev(a, e)) > 0.1 ? 'var(--red)' : 'var(--green)') + '">' + (dev(a, e) * 100).toFixed(1) + '%</span>') + '</td></tr>';
      }).join('');
    }).join('') + '</tbody></table><div class="muted" style="margin-top:6px">当月多下 = 那个月 PO 的总额 − 实际执行（含已验收返还的）。连续偏大说明习惯性多下，校准系数会自动收紧建议金额。</div>';
}
function shortName(s) { const t = String(s || ''); return t.length > 14 ? t.slice(0, 13) + '…' : t; }

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
  const rmap = {};
  if (c.poDecision) c.poDecision.rows.forEach(r => { if (r.code) rmap[r.code] = r; });
  if (c.snap) c.codes.forEach(code => {
    const s = c.per[code];
    seen.add(code);
    const tgtTxt = !s.plan ? '<span class="muted">未关联</span>' : s.target === 0 ? '<span class="muted">不考核</span>' : (s.targetInherit ? '<span title="继承年度默认">' + fmtPct(s.target) + '<span class="muted">·默认</span></span>' : '<b>' + fmtPct(s.target) + '</b>');
    rows.push('<tr>' +
      '<td><b>' + esc(s.name) + '</b> <span class="muted">[' + esc(code) + ']</span></td>' +
      '<td>' + (s.plan ? esc(s.plan.name) + (s.plan.planProject ? ' <span class="muted">[' + esc(s.plan.planProject) + ']</span>' : '') : '<span class="btn-row"><button class="btn small" data-action="link:manage">🔗 关联规划</button> <button class="btn small danger" data-action="excl:add" data-id="' + esc(code) + '" title="不在本年规划/挂靠项：剔除后其执行与 PO 均不参与计算">🚫 剔除</button></span>') + '</td>' +
      '<td class="num">' + (s.plan ? fmtWusd(wusdOf(s.plan)) : '—') + '</td>' +
      '<td class="num">' + fmtCny(s.planCny) + '</td>' +
      '<td class="num">' + fmtCny(s.avail) + '</td>' +
      '<td class="num">' + fmtCny(s.itwExec) + '</td>' +
      '<td class="num">' + fmtCny(s.odExec) + '</td>' +
      '<td class="num">' + fmtCny(s.remain) + '</td>' +
      '<td>' + Object.keys(s.byProj).map(pk => '<div class="wl-line">' + (c.hasProj ? '<b>' + esc(pk) + '</b>：' : '') + 'IT外包 ' + fmtCny(s.byProj[pk].itwRemain) + (s.byProj[pk].odRemain ? ' · OD ' + fmtCny(s.byProj[pk].odRemain) : '') + '</div>').join('') + '</td>' +
      '<td class="num">' + tgtTxt + '</td>' +
      '<td><div style="display:flex;align-items:center;gap:8px"><div class="pbar" style="flex:1">' + (s.target === 0 ? '' : '<div class="mark" style="left:' + Math.min(s.target * 100, 100) + '%"></div>') + '<div class="pbar-fill ' + rateColor(s.execRate, c.timeProg, s.target, rmap[code] && rmap[code].assessed ? rmap[code].rate : null) + '" style="width:' + (s.execRate == null ? 0 : Math.min(s.execRate * 100, 100)).toFixed(1) + '%"></div><div class="mark mark-time" style="left:' + (c.timeProg * 100).toFixed(1) + '%"></div></div><span class="muted">' + fmtPct(s.execRate) + (rmap[code] && rmap[code].assessed ? ' → 年底 ' + fmtPct(rmap[code].rate) : '') + '</span></div></td></tr>');
  });
  c.plansY.forEach(p => {
    if (p.code && seen.has(p.code)) return;
    rows.push('<tr style="opacity:.75"><td><span class="muted">平台未出现</span></td>' +
      '<td><b>' + esc(p.name) + '</b>' + (p.code ? ' <span class="muted">[' + esc(p.code) + ']</span>' : ' <span class="st st-open">待授予</span>') + '</td>' +
      '<td class="num">' + fmtWusd(wusdOf(p)) + '</td><td class="num">' + fmtCny(wusdOf(p) * 10000 * c.fx) + '</td>' +
      '<td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="muted">未到账</td>' +
      '<td class="num">' + (p.target == null ? '<span class="muted">默认</span>' : p.target === 0 ? '<span class="muted">不考核</span>' : fmtPct(p.target)) + '</td><td>—</td></tr>');
  });
  const exclHint = c.excluded && c.excluded.length
    ? '<div class="cons-diff info" style="margin-top:8px">🚫 已剔除 ' + c.excluded.length + ' 项（其执行与 PO 均不参与计算）：' + c.excluded.map(x => esc(x) + (c.snap && c.snap.rows[x] ? ' ' + esc(c.snap.rows[x].name) : '')).join('、') + '　<button class="btn small" data-action="excl:manage">恢复</button></div>'
    : '';
  wrap.innerHTML = '<table class="tbl"><thead><tr>' +
    '<th>平台名称</th><th>规划名称</th><th class="num">规划(WUSD)</th><th class="num">规划¥</th><th class="num">可用</th><th class="num">IT外包执行</th><th class="num">OD执行</th><th class="num">剩余</th><th>各花钱项目的剩余（钱包）</th><th class="num">目标</th><th style="min-width:170px">执行率</th>' +
    '</tr></thead><tbody>' + rows.join('') + '</tbody>' +
    '<tfoot><tr><td>合计</td><td></td><td class="num">' + fmtWusd(sum(c.plansY, wusdOf)) + '</td><td class="num">' + fmtCny(c.planCnyTotal) + '</td><td class="num">' + fmtCny(c.availTotal) + '</td><td class="num">' + fmtCny(c.itwExec) + '</td><td class="num">' + fmtCny(c.odExec) + '</td><td class="num">' + fmtCny(c.remainTotal) + '</td><td></td><td class="num" title="各来源目标按规划金额加权">加权 ' + fmtPct(c.weightedTarget) + '</td><td>' + fmtPct(c.execRate) + '</td></tr></tfoot></table>' + exclHint;
}

/* ================= 渲染：PO ================= */
function renderPO() {
  const c = calc();
  const wrap = $('#poTableWrap'), frozenWrap = $('#poFrozenWrap'), advWrap = $('#poAdviceWrap');
  if (!c.po) {
    $('#poSub').textContent = ''; $('#poAdviceSub').textContent = '';
    wrap.innerHTML = '<div class="empty">尚未导入 PO 明细。</div>'; frozenWrap.innerHTML = ''; advWrap.innerHTML = '';
    return;
  }
  const d = c.poDecision;
  const wl = x => (x.proj && c.hasProj ? '<b>' + esc(x.proj) + '</b> / ' : (c.hasProj ? '<span class="muted">未区分项目</span> / ' : '')) + esc(x.name || x.code || '—');
  const startM = g => g.startDate ? +g.startDate.slice(5, 7) : 0;
  const byStart = (a, b) => (b.startDate || '').localeCompare(a.startDate || '');
  const all = Object.values(c.byPo);
  const openPos = all.filter(g => g.status === 'OPEN').sort(byStart);
  const closedPos = all.filter(g => g.status !== 'OPEN').sort(byStart);
  $('#poSub').textContent = '快照 ' + c.po.updatedAt + ' · 未关闭 ' + openPos.length + ' 张（已关闭 ' + closedPos.length + ' 张折叠在下方）' + (c.poExcludedRows.length ? ' · 挂靠剔除 ' + new Set(c.poExcludedRows.map(r => r.poNo)).size + ' 张' : '') + '　｜　PO 金额按 PO 只算一次，月度执行/预测按行相加';

  /* ---- PO 台账：一张 PO 一行（可跨多个花钱项目/预算来源），下面列出它涉及的每个钱包 ---- */
  const posHtml = g =>
    '<tr><td><b>' + esc(g.poNo) + '</b>' + (g.resName ? '<div class="muted">' + esc(g.resName) + '</div>' : '') + '</td>' +
    '<td>' + (g.startDate ? esc(g.startDate) : '<span class="muted" title="费用起始时间缺失，按当月处理">未识别</span>') + '<div class="muted">' + (startM(g) < c.po.asOf ? '往月未关闭' + (g.refund > 0 ? ' · 返还可改去向' : '') : startM(g) === c.po.asOf ? '当月在执行' : '已提前下') + '</div></td>' +
    '<td class="num">' + (g.amount > 0 ? fmtCny(g.amount) : '<span class="muted">—</span>') + '</td>' +
    '<td class="num">' + fmtCny(g.E) + '</td>' +
    '<td class="num"><b>' + fmtCny(g.frozen) + '</b></td>' +
    '<td class="num">' + fmtCny(g.willExec) + '</td>' +
    '<td class="num" style="color:' + (g.refund > 0 ? 'var(--amber)' : 'inherit') + '"><b>' + fmtCny(g.refund) + '</b></td>' +
    '<td>' + g.detail.map(x => '<div class="wl-line">' + wl(x) + '：冻结 ' + fmtCny(x.frozen) + (x.refund > 0 || x.redirectOut ? ' → 验收后返还 <b>' + fmtCny(x.refund) + '</b>' + (x.redirectIn ? '<span style="color:var(--purple)">（其中 ' + fmtCny(x.redirectIn) + ' 建议从别的预算项改过来）</span>' : '') + (x.redirectOut ? '<span style="color:var(--purple)">（另有 ' + fmtCny(x.redirectOut) + ' 建议改到缺钱的预算项）</span>' : '') : (x.frozen > 0 ? '（会执行掉）' : '')) + '</div>').join('') + '</td>' +
    '<td><button class="btn small" data-action="po:exclAdd" data-key="' + esc(g.poNo) + '" title="挂靠/非我下的 PO：整张剔除（已执行额仍计入执行率）">挂靠剔除</button></td></tr>';
  wrap.innerHTML =
    '<table class="tbl"><thead><tr><th>PO</th><th>费用起始</th><th class="num">PO 总额</th><th class="num">已执行</th><th class="num">在途冻结</th><th class="num">其中将执行</th><th class="num">验收后返还</th><th>涉及的钱包（冻结 → 返还到哪）</th><th>操作</th></tr></thead><tbody>' +
    (openPos.length ? openPos.map(posHtml).join('') : '<tr><td colspan="9" class="empty">没有未关闭的 PO，没有在途冻结 ✓</td></tr>') + '</tbody></table>' +
    (closedPos.length ? '<details class="fold"><summary>已关闭的 PO（' + closedPos.length + ' 张，不占资金）</summary><table class="tbl"><thead><tr><th>PO</th><th>费用起始</th><th class="num">PO 总额</th><th class="num">已执行</th><th>涉及的钱包（已执行）</th></tr></thead><tbody>' +
      closedPos.map(g => '<tr style="opacity:.75"><td><b>' + esc(g.poNo) + '</b><div class="muted">' + esc(g.resName || '') + '</div></td><td>' + esc(g.startDate || '—') + '</td><td class="num">' + fmtCny(g.amount) + '</td><td class="num">' + fmtCny(g.E) + '</td><td>' + g.detail.map(x => '<div class="wl-line">' + wl(x) + '：' + fmtCny(x.E) + '</div>').join('') + '</td></tr>').join('') + '</tbody></table></details>' : '');

  // 挂靠剔除区（PO 级：按 PO 编号整张剔除，执行率仍按平台口径）
  let exclHtml = '';
  if (c.poExcludedRows.length) {
    const exAgg = {};
    c.poExcludedRows.forEach(r => {
      const g = exAgg[r.poNo] = exAgg[r.poNo] || { poNo: r.poNo, resName: r.resName, amount: 0, act: 0, srcs: {} };
      g.amount = Math.max(g.amount, r.amount || 0);
      g.act += sum(Object.entries(r.months), ([mm, v]) => +mm < c.po.asOf ? v : 0);
      g.srcs[r.budgetCode] = 1;
    });
    exclHtml = '<div class="cons-diff info" style="margin-top:10px">🚫 挂靠剔除 PO ' + Object.keys(exAgg).length + ' 张（累计已执行 ' + fmtCny(c.poExclAct) + ' <b>仍计入执行率</b>；已从台账/在途冻结/预计返还/月度图/PO 建议中整张剔除）</div>' +
      '<table class="tbl"><thead><tr><th>PO</th><th>内容</th><th>预算来源</th><th class="num">PO 总额</th><th class="num">已执行</th><th>操作</th></tr></thead><tbody>' +
      Object.values(exAgg).map(g => '<tr><td><b>' + esc(g.poNo) + '</b></td><td>' + esc(g.resName || '') + '</td><td class="muted">' + Object.keys(g.srcs).map(esc).join('、') + '</td><td class="num">' + fmtCny(g.amount) + '</td><td class="num">' + fmtCny(g.act) + '</td><td><button class="btn small" data-action="po:exclDel" data-key="' + esc(g.poNo) + '">恢复</button></td></tr>').join('') + '</tbody></table>';
  }
  wrap.insertAdjacentHTML('beforeend', exclHtml);

  /* ---- 在途与返还：按钱包看（验收后多少钱回到哪个钱包）+ 多下率 ---- */
  const ws = Object.values(c.wallets).filter(w => w.frozen > 0.5).sort((a, b) => b.frozen - a.frozen);
  const willExecTotal = sum(openPos, g => g.willExec);
  const pastRefund = sum(openPos.filter(g => startM(g) < c.po.asOf), g => g.refund);
  const curOver = sum(openPos.filter(g => startM(g) >= c.po.asOf), g => g.refund);
  // 多下率：往月「下了多少（PO 总额）vs 实际执行」，用来看习惯性多下
  const issuedM = {};
  all.forEach(g => { const mo = startM(g); if (mo && g.amount > 0) issuedM[mo] = (issuedM[mo] || 0) + g.amount; });
  const mos = Object.keys(issuedM).map(Number).filter(mo => mo < c.po.asOf).sort((a, b) => b - a).slice(0, 6);
  const overRows = mos.map(mo => { const iss = issuedM[mo], ex = c.poMonthlyAct[mo] || 0; return { mo, iss, ex, over: iss - ex, rate: iss > 0 ? (iss - ex) / iss : 0 }; });
  if (d && d.inflight.fc > 0) overRows.unshift({ mo: c.po.asOf, iss: d.inflight.fc, ex: d.inflight.willExec, over: d.inflight.over, rate: d.inflight.over / d.inflight.fc, cur: true });
  frozenWrap.innerHTML =
    '<table class="cons-table">' +
    '<tr><td>未关闭 PO</td><td>' + c.openCnt + ' 张</td></tr>' +
    '<tr><td>在途冻结（PO 总额 − 已执行）</td><td><b>' + fmtCny(c.poFrozen) + '</b></td></tr>' +
    '<tr><td>其中会执行掉</td><td>' + fmtCny(willExecTotal) + '</td></tr>' +
    '<tr><td>验收后返还</td><td><b style="color:var(--amber)">' + fmtCny(c.poReturn) + '</b></td></tr>' +
    '</table>' +
    '<div class="muted" style="margin:6px 0">往月 PO 剩余的钱验收后全部返还（' + fmtCny(pastRefund) + '）；当月在执行的按团队当月需求估，多下约 ' + fmtCny(curOver) + ' 会返还。执行表的「剩余」已扣掉全部在途预测，所以这笔钱现在不能用。</div>' +
    (ws.length
      ? '<table class="tbl"><thead><tr><th>钱包（钱回到这里）</th><th class="num">冻结</th><th class="num">将执行</th><th class="num">验收后返还</th><th>PO</th></tr></thead><tbody>' +
        ws.map(w => '<tr><td>' + wl(w) + '</td><td class="num"><b>' + fmtCny(w.frozen) + '</b></td><td class="num">' + fmtCny(w.willExec) + '</td><td class="num" style="color:var(--amber)"><b>' + fmtCny(w.refund) + '</b></td><td class="muted">' + Array.from(new Set(w.pos)).map(esc).join('、') + '</td></tr>').join('') +
        '</tbody><tfoot><tr><td>合计</td><td class="num">' + fmtCny(sum(ws, w => w.frozen)) + '</td><td class="num">' + fmtCny(sum(ws, w => w.willExec)) + '</td><td class="num">' + fmtCny(sum(ws, w => w.refund)) + '</td><td></td></tr></tfoot></table>'
      : '<div class="empty">没有在途冻结 ✓</div>') +
    (overRows.length
      ? '<div style="margin-top:12px"><b style="font-size:13px">多下率</b> <span class="muted">下了多少 vs 实际执行，连续偏大说明习惯性多下</span></div>' +
        '<table class="tbl"><thead><tr><th>月</th><th class="num">PO 总额</th><th class="num">实际执行</th><th class="num">多下</th><th class="num">多下率</th></tr></thead><tbody>' +
        overRows.map(x => '<tr' + (x.cur ? ' style="background:var(--blue-bg)"' : '') + '><td>' + x.mo + ' 月' + (x.cur ? ' <span class="muted">（预估）</span>' : '') + '</td><td class="num">' + fmtCny(x.iss) + '</td><td class="num">' + fmtCny(x.ex) + '</td><td class="num">' + fmtCny(x.over) + '</td><td class="num" style="color:' + (x.rate > 0.05 ? 'var(--red)' : x.rate > 0.02 ? 'var(--amber)' : 'var(--green)') + '">' + fmtPct(x.rate) + '</td></tr>').join('') + '</tbody></table>'
      : '');

  /* ---- 下月 PO 与 OD 建议（首页决策卡的摘要） ---- */
  $('#poAdviceSub').textContent = d ? (d.isDec ? '12 月下旬下 1 月 PO' : '为 ' + d.po.nextM + ' 月 PO') : '';
  advWrap.innerHTML = d
    ? '<table class="cons-table">' +
      '<tr><td>' + (d.isDec ? '下旬下 1 月 PO' : '20 号前下 ' + d.po.nextM + ' 月 PO') + '</td><td><b>' + fmtCny(d.isDec ? d.jan.toIssue : d.po.toIssue) + '</b></td></tr>' +
      (d.isDec ? '' : '<tr><td>团队需求（理论 × 校准）</td><td>' + fmtCny(d.po.need) + (d.po.issued > 0 ? '，已下 ' + fmtCny(d.po.issued) : '') + '</td></tr>') +
      '<tr><td>OD 调拨</td><td><b>' + fmtCny(d.od.transfer) + '</b>' + (d.od.transfer > 0 && c.hasProj ? ' <span class="muted">（' + esc(d.od.proj) + ' 内）</span>' : '') + '</td></tr>' +
      (d.yearEnd ? '<tr><td>1 月 PO 可留 / 需求</td><td>' + fmtCny(d.jan.reserve) + ' / ' + fmtCny(d.jan.need) + (d.jan.short > 0 ? ' <b style="color:var(--red)">缺 ' + fmtCny(d.jan.short) + '</b>' : '') + '</td></tr>' : '') +
      '<tr><td>验收后返还' + (d.yearEnd ? '（12 月 15 日前完成）' : '') + '</td><td>' + fmtCny(c.poReturn) + '</td></tr>' +
      '</table><div class="cons-diff info">完整的操作指令（从哪些钱包出、催谁）在首页「Ⓣ 本周期操作与决策」。</div>'
    : '<div class="empty">—</div>';
}

// 每次导入记一份决策快照；并用这次导入看到的实际数回测之前的记录
function recordImportLog(c) {
  const logs = state.importLogs = state.importLogs || [];
  if (c.po) logs.forEach(L => {
    if (L.checked || L.year !== c.Y) return;
    if (c.po.asOf > L.month) {   // 记录的那个月已经变成执行列，可以回测
      let over = 0, issuedNext = 0;
      Object.values(c.byPo).forEach(g => {
        const mo = g.startDate ? +g.startDate.slice(5, 7) : 0;
        if (mo === L.month && g.amount > 0) over += Math.max(0, g.amount - g.E);
        if (mo === L.month + 1) issuedNext += g.amount;
      });
      L.actual = { exec: c.poMonthlyAct[L.month] || 0, over, issuedNext };
      L.checked = c.snap ? c.snap.date : todayStr();
    }
  });
  const d = c.poDecision;
  if (!d) return;
  logs.push({
    date: c.snap ? c.snap.date : todayStr(), year: c.Y, month: c.curM,
    advice: { poNeed: d.isDec ? d.jan.toIssue : (d.po ? d.po.toIssue : 0) },
    estimates: { curExec: d.inflight.willExec, curOver: d.inflight.over },
    rollup: { hit: d.hit, assessed: d.assessed, forecastRate: c.forecastRate, weightedTarget: c.weightedTarget }
  });
  if (logs.length > 80) logs.splice(0, logs.length - 80);
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
    '<button class="btn primary" data-action="import:open">📥 导入平台数据</button>' +
    '<button class="btn primary" data-action="data:saveFile">💾 保存到数据文件</button>' +
    '<button class="btn" data-action="data:openFile">📂 打开/恢复数据文件</button>' +
    '<button class="btn" data-action="dataset:scan">📁 扫描数据集</button>' +
    '<button class="btn" data-action="dataset:set">⚙️ 设置数据集文件夹</button>' +
    '<button class="btn" data-action="data:publish">📤 发布分享</button>' +
    '<button class="btn" data-action="data:export">📦 分层备份</button>' +
    '<input type="file" id="importFile" accept=".json,application/json" style="display:none">' +
    '<button class="btn" data-action="data:demo">示例数据</button>' +
    '<button class="btn danger" data-action="data:clear">清空</button></div>' +
    '<div class="muted" style="margin-top:10px"><b>📁 数据集文件夹</b>：设置一次后，<b>每个花钱项目建一个子文件夹</b>（名字自己起，定后不改），该项目的「项目总览」和「PO 明细」都丢进去；<b>团队 Excel</b> 放根目录。打开看板<b>自动扫描导入</b>，不用任何操作（快照日期 = 文件导出时间，重复文件自动跳过）。执行表没有项目列，所以必须放进项目子文件夹，否则不导入。' +
    (c.projects.length ? '　当前项目：' + c.projects.map(esc).join('、') + '。' : (c.hasProj ? '' : '　<span style="color:var(--amber)">本年的执行表还是合并存放的（旧版），把文件放进项目子文件夹重新导入后，决策建议就能区分花钱项目。</span>')) + '</div>' +
    '<div class="muted" style="margin-top:10px"><b>持久化架构</b>：budget.json = 唯一真源（<b>选一次文件后每次变更自动写入</b>，随 git 同步，清浏览器不丢）；浏览器 localStorage 只是缓存（断网/断连时兜底，重连自动同步）。分层备份用于手动归档/迁移。当前 ' + Y + ' 年执行表快照 ' + c.snaps.length + ' 个。' + (fileHandle ? (fileConnected ? ' ✅ 数据文件已连接' : ' ⚠️ 数据文件未连接（点顶部📂重连）') : ' ⏸ 尚未设置数据文件（点上方💾选择 data/budget.json）') + '</div>' +
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
  // 变动计划（团队 Excel「变动计划」页签）：生效年月 = 成本归属月；OD 扣减的滞后由系统按扣减日历处理
  const tPlan = Array.isArray(state.teamPlan) ? state.teamPlan : [];
  const curMo2 = Math.max(Math.min(c.curM, 12), 1);
  const ymNow = Y + '-' + String(curMo2).padStart(2, '0');
  const planEffect = p => {
    const yy = +p.ym.slice(0, 4), mm = +p.ym.slice(5, 7);
    if (yy > Y) return '计入 ' + yy + ' 年（1 月 PO 等已按它估算）';
    if (p.kind === 'po') return '从该月起，每张 PO 每天' + (p.count > 0 ? '多' : '少') + ' ' + fmtCny(Math.abs(p.count) * p.rate);
    return '该月的人从 ' + (mm >= 11 ? '12 月 31 日的年终清算' : (mm + 1) + ' 月底的扣减') + '开始体现';
  };
  const planHtml2 = tPlan.length
    ? '<div style="margin-top:12px"><b style="font-size:13px">变动计划</b> <span class="muted">来自团队 Excel「变动计划」页签 · 人数变化按整月算</span>' +
      '<table class="tbl"><thead><tr><th>生效年月</th><th>类型</th><th class="num">单价</th><th class="num">人数</th><th>备注</th><th>对决策的影响</th></tr></thead><tbody>' +
      tPlan.slice().sort((a, b) => a.ym < b.ym ? -1 : 1).map(p => '<tr' + (p.ym < ymNow ? ' style="opacity:.65"' : '') + '><td>' + esc(p.ym) + (p.ym < ymNow ? ' <span class="muted">已生效</span>' : '') + '</td><td>' + (p.kind === 'po' ? 'PO' : 'OD') + '</td><td class="num">' + fmtCny(p.rate) + '</td><td class="num">' + (p.count > 0 ? '+' : '') + p.count + '</td><td>' + esc(p.note || '') + '</td><td class="muted">' + planEffect(p) + '</td></tr>').join('') + '</tbody></table>' +
      '<div class="muted" style="margin-top:6px">各月人数（含计划）：</div>' +
      '<table class="tbl"><thead><tr>' + Array.from({ length: 13 - curMo2 + 1 }, (_, i) => (curMo2 + i <= 12 ? '<th class="num">' + (curMo2 + i) + '月</th>' : '<th class="num">明年1月</th>')).join('') + '</tr></thead><tbody><tr>' +
      Array.from({ length: 13 - curMo2 + 1 }, (_, i) => { const mo = curMo2 + i, h = mo <= 12 ? c.team.hcSummary(Y, mo) : c.team.hcSummary(Y + 1, 1); return '<td class="num muted">PO ' + h.po + '<br>OD ' + h.od + '</td>'; }).join('') +
      '</tr><tr>' + Array.from({ length: 13 - curMo2 + 1 }, (_, i) => { const mo = curMo2 + i; return '<td class="num muted">' + (mo <= 12 ? 'OD 扣 ' + fmtCny(c.odEst[mo] || 0) : 'PO 需 ' + fmtCny(c.poDecision ? c.poDecision.jan.need : 0)) + '</td>'; }).join('') + '</tr></tbody></table></div>'
    : '';
  const anyOwn = team.some(g => g.kind === 'po' && g.poGroup);
  $('#teamTableWrap').innerHTML = (!team.length && !tPlan.length ? '<div class="empty">还没有团队配置——不配也能用（预测退回历史外推），配上后扩编/缩编的下月预测立即准确。</div>' : '') +
    (team.length ? '<table class="tbl"><thead><tr><th>组名</th><th>类型</th><th class="num">人数</th><th class="num">单价(¥)</th><th>PO 归属</th></tr></thead><tbody>' +
    team.map(g => '<tr><td><b>' + esc(g.name) + '</b></td><td><span class="st st-' + (g.kind === 'po' ? 'open' : 'accepted') + '">' + (g.kind === 'po' ? 'PO·日单价' : 'OD·月单价') + '</span></td><td class="num">' + (g.headcount || 0) + '</td><td class="num">' + fmtCny(g.rate || 0) + '</td><td>' + (g.kind === 'po' ? (g.poGroup ? '<b>' + esc(g.poGroup) + '</b>' : '<span class="muted">未标</span>') : '<span class="muted">—</span>') + '</td></tr>').join('') + '</tbody></table>' +
    (anyOwn && team.some(g => g.kind === 'po' && !g.poGroup && (g.headcount || 0) > 0) ? '<div class="cons-diff info">ℹ️ 有 PO 人员没标归属，他们会并成"未标归属"的一张。在团队 Excel 的 PO 页签加一列「PO归属」（值随意，如 PO甲 / PO乙），或单独一个页签名含「归属」的清单（姓名 + 归属）。</div>' : (!anyOwn ? '<div class="muted" style="margin-top:6px">想按人员归属把 PO 分成几张下：在团队 Excel 的 PO 页签加一列「PO归属」（值随意，如 PO甲 / PO乙），或单独一个页签名含「归属」的清单（姓名 + 归属两列）。</div>' : '')) : '') + calib + planHtml2;

  const pw = $('#planTableWrap');
  pw.innerHTML = !c.plansY.length ? '<div class="empty">' + Y + ' 年还没有规划项。</div>' :
    '<table class="tbl"><thead><tr><th>规划名称</th><th>编码</th><th class="num">金额(WUSD)</th><th class="num">折合¥</th><th class="num">目标%</th><th>备注</th><th>操作</th></tr></thead><tbody>' +
    c.plansY.map(p => '<tr' + (p.dead ? ' style="opacity:.5" title="已失效：预算下不来，不计入执行率分母"' : '') + '><td>' + (p.dead ? '<span class="st st-pending">预算下不来</span> ' : '') + '<b>' + esc(p.name) + '</b></td>' +
      '<td><input data-pedit="' + p.id + '" data-f="code" value="' + esc(p.code || '') + '" placeholder="待关联" style="width:64px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;font-size:12px"></td>' +
      '<td class="num"><input data-pedit="' + p.id + '" data-f="amountW" value="' + (p.amountW != null ? p.amountW : '') + '" inputmode="decimal" style="width:70px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;font-size:12px;text-align:right"></td>' +
      '<td class="num" id="pcny-' + p.id + '">' + fmtCny(wusdOf(p) * 10000 * m.fxRate) + '</td>' +
      '<td class="num"><input data-pedit="' + p.id + '" data-f="target" value="' + (p.target != null ? Math.round(p.target * 100) : '') + '" inputmode="decimal" placeholder="默认" style="width:56px;border:1px solid var(--line);border-radius:6px;padding:3px 6px;font-size:12px;text-align:right"></td>' +
      '<td>' + esc(p.note || '') + '</td>' +
      '<td style="white-space:nowrap"><button class="btn small" data-action="plan:dead" data-id="' + p.id + '">' + (p.dead ? '恢复' : '失效') + '</button> <button class="btn small danger" data-action="plan:del" data-id="' + p.id + '">删除</button></td></tr>').join('') + '</tbody></table>' +
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
    field('所属花钱项目（如：项目A / 项目A,B）', '<input id="f-pplanproject" type="text" value="' + esc(p.planProject || '') + '" placeholder="区分打到哪些花钱项目">') +
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
      kept.push({ id: hit ? hit.id : uid(), year: Y, code: r.code || (hit ? hit.code : ''), name: r.name, amountW: r.amountW, target: r.target, dead: hit ? !!hit.dead : false, note: hit ? hit.note : '' });
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
      schemaVersion: 4,
      meta: state.meta, years: state.years, plans: state.plans,
      team: includeTeam ? state.team : [],
      grantLogs: state.grantLogs, execSnaps: state.execSnaps, projAlias: state.projAlias,
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
  if (!window.showSaveFilePicker) {
    const blob = new Blob([JSON.stringify({ type: 'budget-dash-full', ...state }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'budget.json'; a.click(); URL.revokeObjectURL(a.href);
    alert('当前浏览器不支持直接写文件，已下载 budget.json——请手动覆盖到仓库 data/ 目录。');
    return;
  }
  try {
    if (!fileHandle) {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: 'budget.json',
        types: [{ description: '预算看板数据（JSON）', accept: { 'application/json': ['.json'] } }]
      });
      try { await idbSet('fh', fileHandle); } catch (e) { }
      recentHandle = fileHandle;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    return;
  }
  const ok = await writeThroughNow();
  if (ok) alert('已写入 ' + (fileHandle.name || 'budget.json') + '。\n\n✅ 此后<b>每次变更自动同步写入</b>该文件（无需再点本按钮），数据随 git 走，清浏览器也不丢。'.replace(/<[^>]+>/g, ''));
  else alert('写入失败（权限可能已过期）：数据仍在浏览器缓存中，点顶部「📂 载入数据文件」重连后再试。');
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
  if (kind === 'config') { obj = { type: 'budget-dash-config', schemaVersion: 4, meta: state.meta, years: state.years, plans: state.plans, team: state.team, projAlias: state.projAlias }; name = '预算看板-配置'; }
  else if (kind === 'data') { obj = { type: 'budget-dash-data', schemaVersion: 4, execSnaps: state.execSnaps, poDataByYear: state.poDataByYear, grantLogs: state.grantLogs, importLogs: state.importLogs, projPrints: state.projPrints, projAlias: state.projAlias }; name = '预算看板-数据'; }
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
  const PA = 'IT项目A', PB = 'IT项目B';   // 花钱项目标识 = 数据集子文件夹名
  const S = (itw, od) => ({ itw: { prior: itw[0], granted: itw[1], avail: itw[2], exec: itw[3], fc: itw[4], remain: itw[5] }, od: { prior: od[0], granted: od[1], avail: od[2], exec: od[3], fc: od[4], remain: od[5] } });
  const Z = [0, 0, 0, 0, 0, 0];
  // 执行表按花钱项目分开存（byProject），合并视图 = 各项目相加。111/555 只在 A；222/333 只在 B；444 两个项目下都有钱
  const mk = (date, A, B) => {
    const rows = {};
    [A, B].forEach(o => Object.entries(o).forEach(([c, r]) => {
      const x = rows[c] = rows[c] || { name: r.name, itw: {}, od: {} };
      ['itw', 'od'].forEach(cat => Object.keys(r[cat]).forEach(k => { x[cat][k] = (x[cat][k] || 0) + r[cat][k]; }));
    }));
    return { date, byProject: { [PA]: A, [PB]: B }, rows };
  };
  const snap2 = mk(y + '-11-18',   // 最新（11-18 导入，执行到 10 月）
    { '111': { name: '智能平台预算A', ...S([0, 1750000, 1750000, 1200000, 280000, 270000], Z) }, '444': { name: '安全合规预算D', ...S([30000, 240000, 270000, 198000, 40000, 32000], Z) }, '555': { name: '备用额度E', ...S([0, 210000, 210000, 190000, 20000, 0], Z) } },
    { '222': { name: '智能运维预算B', ...S([0, 1400000, 1400000, 980000, 190000, 230000], [0, 210000, 210000, 168000, 0, 42000]) }, '333': { name: '新出现预算C', ...S([0, 800000, 800000, 300000, 70000, 430000], Z) }, '444': { name: '安全合规预算D', ...S([20000, 160000, 180000, 132000, 40000, 8000], Z) } });
  const snap1 = mk(y + '-10-31',   // 上月（10-31 导入，执行到 9 月；10 月的 PO 还是当月预测）
    { '111': { name: '智能平台预算A', ...S([0, 1750000, 1750000, 1090000, 154000, 506000], Z) }, '444': { name: '安全合规预算D', ...S([30000, 240000, 270000, 174000, 24000, 72000], Z) }, '555': { name: '备用额度E', ...S([0, 210000, 210000, 190000, 20000, 0], Z) } },
    { '222': { name: '智能运维预算B', ...S([0, 1400000, 1400000, 840000, 140000, 420000], [0, 210000, 210000, 147000, 0, 63000]) }, '333': { name: '新出现预算C', ...S([0, 800000, 800000, 140000, 160000, 500000], Z) }, '444': { name: '安全合规预算D', ...S([20000, 160000, 180000, 116000, 16000, 48000], Z) } });
  // PO 明细：PO 金额是整张 PO 的总额（每行重复）；月度执行/预测按行（PO × 花钱项目 × 预算来源）
  const poRows = [];
  const pad = n => String(n).padStart(2, '0');
  const addPo = (no, proj, months, amount, status, name) => {
    Object.entries(months).forEach(([c, mm]) => poRows.push({ poNo: no, resName: name, status, startDate: y + '-' + pad(+Object.keys(mm)[0]) + '-01', amount, itProject: proj, itProjectCode: proj === PA ? 'ITA' : 'ITB', budgetCode: c, months: Object.fromEntries(Object.entries(mm).map(([k, v]) => [+k, v])) }));
  };
  [[3, { 111: 150000, 444: 24000, 555: 30000 }, { 222: 120000, 444: 16000 }],
   [4, { 111: 150000, 444: 24000, 555: 30000 }, { 222: 120000, 444: 16000 }],
   [5, { 111: 140000, 444: 18000, 555: 20000 }, { 222: 110000, 444: 12000 }],
   [6, { 111: 150000, 444: 24000, 555: 30000 }, { 222: 120000, 444: 16000 }],
   [7, { 111: 160000, 444: 24000, 555: 40000 }, { 222: 130000, 444: 16000 }],
   [8, { 111: 160000, 444: 24000 }, { 222: 120000, 333: 60000, 444: 16000 }],
   [9, { 111: 160000, 444: 36000 }, { 222: 120000, 333: 80000, 444: 24000 }]].forEach(([mo, a, b]) => {
    const f = o => Object.fromEntries(Object.entries(o).map(([c, v]) => [c, { [mo]: v }]));
    addPo('PO-A' + mo, PA, f(a), sum(Object.values(a)), 'CLOSED', mo + '月人力外包');
    addPo('PO-B' + mo, PB, f(b), sum(Object.values(b)), 'CLOSED', mo + '月人力外包');
  });
  // 9 月还有一张没关闭的 PO：下了 10 万，只执行了 6 万，没花完的 4 万验收后要返还（回到哪两个预算项取决于当初的分配比例）
  addPo('PO-A09b', PA, { 555: { 9: 40000, 11: 20000 }, 111: { 9: 20000, 11: 20000 } }, 100000, 'OPEN', '9月驻场支持');
  // 10 月的 PO 下多了：没花完的部分还冻着，验收后返还到各自的钱包
  addPo('PO-A10', PA, { 111: { 10: 110000, 11: 20000 }, 444: { 10: 24000 } }, 170000, 'OPEN', '10月人力外包');
  addPo('PO-B10', PB, { 222: { 10: 140000, 11: 30000 }, 333: { 10: 160000, 11: 10000 }, 444: { 10: 16000 } }, 400000, 'OPEN', '10月人力外包');
  // 11 月当月在执行：两张 PO 的预测合计比团队需求多（前面几个月习惯性多下）
  addPo('PO-A11', PA, { 111: { 11: 240000 }, 444: { 11: 40000 } }, 290000, 'OPEN', '11月人力外包');
  addPo('PO-B11', PB, { 222: { 11: 160000 }, 333: { 11: 60000 }, 444: { 11: 40000 } }, 270000, 'OPEN', '11月人力外包');
  const availOf = o => Object.fromEntries(Object.entries(o).map(([c, r]) => [c, (r.itw.avail || 0) + (r.od.avail || 0)]));
  return {
    schemaVersion: 4,
    meta: { year: y, updateFreqDays: 14, lastHcCheck: t },
    years: { [y]: { fxRate: 7.03, execRateTarget: 0.95, bonusMonths: 3.5, attendFactor: 1, workdays: {}, lastHcCheck: t } },
    team: [
      { id: 'tg1', kind: 'po', name: '高级开发', headcount: 6, rate: 2000, project: '', poGroup: 'PO甲' },
      { id: 'tg1b', kind: 'po', name: '高级开发', headcount: 2, rate: 2000, project: '', poGroup: 'PO乙' },
      { id: 'tg2', kind: 'po', name: '初级开发', headcount: 4, rate: 1200, project: '', poGroup: 'PO乙' },
      { id: 'tg3', kind: 'od', name: 'OD工程师', headcount: 2, rate: 10500, project: '' }
    ],
    teamPlan: [   // 变动计划（示例）：12 月临时加 2 个 OD（年终冲量）；明年 1 月 PO 团队进 3 个高级开发
      { ym: y + '-12', kind: 'od', rate: 10500, count: 2, note: '年终冲量' },
      { ym: (y + 1) + '-01', kind: 'po', rate: 2000, count: 3, note: '明年 1 月到岗' }
    ],
    plans: [
      { id: 'pl1', year: y, code: '111', name: '盘古平台建设', amountW: 25, target: 1, note: '要求100%' },
      { id: 'pl2', year: y, code: '222', name: '智能运维中台', amountW: 20, note: '' },
      { id: 'pl3', year: y, code: '', name: '数据治理专项', amountW: 5, target: 0.92, note: '平台还没出现，等 BA 申请' },
      { id: 'pl4', year: y, code: '444', name: '安全合规加固', amountW: 8, target: 0.92, planProject: PA + ',' + PB, note: '两个花钱项目下都有钱' },
      { id: 'pl6', year: y, code: '555', name: '备用额度（不考核）', amountW: 3, target: 0, note: '' }
    ],
    grantLogs: [
      { date: y + '-03-15', code: '111', amountCny: 1000000, note: '首批' },
      { date: y + '-08-20', code: '111', amountCny: 750000, note: '' },
      { date: y + '-04-10', code: '222', amountCny: 1400000, note: '' },
      { date: y + '-06-05', code: '444', amountCny: 400000, note: 'A 项目 24 万 + B 项目 16 万' },
      { date: y + '-05-20', code: '555', amountCny: 210000, note: '' }
    ],
    execSnaps: [snap1, snap2],
    poDataByYear: { [y]: { updatedAt: t, asOf: 11, rows: poRows } },
    projAlias: { ITA: PA, ITB: PB },
    projPrints: { [PA]: { date: y + '-11-18', avail: availOf(snap2.byProject[PA]) }, [PB]: { date: y + '-11-18', avail: availOf(snap2.byProject[PB]) } },
    importLogs: [], importNotes: [],
    updatedAt: { plan: t, grants: t, exec: t, po: t, team: t }
  };
}

/* ================= 事件 ================= */
async function handleAction(action, el, e) {
  const id = el.dataset.id;
  if (action === 'modal:close') { if (e.target === el) closeModal(); return; }
  if (action === 'goto:data') return switchTab('data');
  if (action === 'goto:po') return switchTab('po');

  if (action === 'import:open') return importModal();
  if (action === 'import:pick') { const inp = $('#fileInput'); if (inp) inp.click(); return; }
  if (action === 'import:all') return importAll();
  if (action === 'po:exclAdd') {
    const c0 = calc();
    const row = c0.poList.find(r => r.poNo === el.dataset.key);   // 挂靠按 PO 编号整张剔除（含它在各花钱项目下的行）
    if (!row) return;
    if (!confirm('将 PO「' + (row.resName || row.poNo) + '」标记为挂靠剔除？\n\n影响：从你的 PO 台账/在途冻结/预计返还/月度图/PO建议中剔除；其<b>已执行金额仍计入执行率</b>（平台口径，钱确实从预算花了）。可随时恢复。'.replace(/<[^>]+>/g, ''))) return;
    const yp = yearParams(curYear());
    yp.excludedPos = yp.excludedPos || [];
    if (yp.excludedPos.indexOf(el.dataset.key) < 0) yp.excludedPos.push(el.dataset.key);
    state.years[curYear()] = yp;
    save();
    return;
  }
  if (action === 'po:exclDel') {
    const yp = yearParams(curYear());
    yp.excludedPos = (yp.excludedPos || []).filter(k => String(k).split('|')[0] !== el.dataset.key);
    state.years[curYear()] = yp;
    save();
    return;
  }
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
      if (perm === 'granted') { await loadFromHandle(recentHandle); fileConnected = true; renderBanner(); } else alert('未授权访问文件');
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
  if (action === 'plan:dead') {
    const p = state.plans.find(x => x.id === id);
    if (!p) return;
    if (!p.dead && !confirm('将「' + p.name + '」标记为失效（预算下不来）？\n\n影响：从执行率分母（总体+分来源）中剔除，不再催 BA；金额与历史数据保留，可随时恢复。')) return;
    p.dead = !p.dead;
    touch('plan'); save();
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
    const code = $('#f-code').value.trim(), note = $('#f-note').value.trim(), planProject = $('#f-pplanproject') ? $('#f-pplanproject').value.trim() : '';
    const tRaw = $('#f-target').value.trim();
    let target = null;
    if (tRaw !== '') {
      const tv = parseFloat(tRaw);
      if (!Number.isFinite(tv) || tv < 0 || tv > 100) { alert('执行率目标应为 0~100 的数字，或留空跟随年度默认'); return; }
      target = tv / 100;
    }
    if (id) Object.assign(state.plans.find(p => p.id === id), { name, amountW, code, target, note, planProject });
    else state.plans.push({ id: uid(), year: curYear(), name, amountW, code, target, note, planProject });
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
    plansOf(from).forEach(p => state.plans.push({ id: uid(), year: Y, code: p.code || '', name: p.name, amountW: wusdOf(p), target: p.target != null ? p.target : null, planProject: p.planProject || '', dead: false, note: '复制自' + from }));
    const ypFrom = yearParams(from);
    delete ypFrom.excluded; delete ypFrom.excludedPos;   // 剔除项按年独立：新年不沿用上年的剔除
    state.years[Y] = Object.assign({}, ypFrom, { lastHcCheck: '' });
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

document.addEventListener('toggle', e => { const t = e.target; if (t && t.classList && t.classList.contains('fold')) foldOpen = t.open; }, true);   // 记住推演表的展开状态
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
  if (e.target.matches('[data-fproj]') && importCtx) { importCtx.files[+e.target.dataset.fproj].project = e.target.value.trim(); return; }
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
    // 联动刷新：首页决策卡/行动清单/预算来源表（不重建规划表避免丢焦点）
    renderNow(); renderBudget(); renderPO(); renderData();
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
        let obj = upToV4(JSON.parse(reader.result));
        if (!obj) throw new Error('格式不符');
        if (obj.type === 'budget-dash-config') {
          if (!confirm('恢复配置包：将覆盖当前的规划、团队配置和参数（不影响已导入数据），确认？')) return;
          state.meta = Object.assign({}, state.meta, obj.meta);
          state.years = obj.years || state.years;
          state.plans = obj.plans || []; state.team = obj.team || [];
          if (obj.projAlias) state.projAlias = obj.projAlias;
          save(); alert('配置已恢复');
        } else if (obj.type === 'budget-dash-data') {
          if (!confirm('恢复数据包：将覆盖执行表快照、PO明细和授予流水（不影响配置），确认？')) return;
          state.execSnaps = obj.execSnaps || []; state.poDataByYear = obj.poDataByYear || {}; state.grantLogs = obj.grantLogs || [];
          if (obj.importLogs) state.importLogs = obj.importLogs; if (obj.projPrints) state.projPrints = obj.projPrints; if (obj.projAlias) state.projAlias = obj.projAlias;
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
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]';
  if ((location.protocol === 'http:' || location.protocol === 'https:') && !isLocal) {   // 仅局域网访问者进分享模式；本机维护端始终编辑模式
    try {
      const r = await fetch('data.json', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d && d.budgetBudgetShare && d.state) { SHARE_MODE = true; SHARE_PKG = d; document.body.classList.add('share'); }
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
          fileConnected = true;
        } else {
          const b = $('#quickLoadBtn'); if (b) b.style.display = '';
        }
      }
    } catch (e) { }
  }
})();
