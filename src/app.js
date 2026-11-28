'use strict';
/* ================= 工具 ================= */
const LS_KEY = 'budgetDash.v3';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'x' + Math.random().toString(36).slice(2, 9);
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
// 钱包分配明细按钱包合并：同一个钱包（花钱项目 × 预算来源）分几次取的（先补缺口、后用余量…）并成一条
const mergeW = items => {
  const by = {};
  (items || []).forEach(x => {
    if (!(x.amt > 0.5)) return;
    const k = x.code + '|' + x.proj;
    const o = by[k] || (by[k] = Object.assign({}, x, { amt: 0, odBack: 0, fromReserve: 0, split: false }));
    o.amt += x.amt; o.odBack += x.odBack || 0; o.fromReserve += x.fromReserve || 0;
    o.fromRef = !!o.fromRef || !!x.fromRef; o.fromCur = !!o.fromCur || !!x.fromCur;   // 只要有一部分来自验收返还就标出来
  });
  return Object.values(by);
};

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
const fmtPct = v => (v == null || !Number.isFinite(v)) ? '—' : (v * 100).toFixed(1) + '%';
/* ---- 页内提示（代替阻塞式弹窗）：右上角冒出来，不打断操作。短的几秒后自己消失，长的（导入日志之类）留着，看完点 × ---- */
function notify(msg, kind) {
  const root = $('#toastRoot'); if (!root) return;
  const text = String(msg == null ? '' : msg).replace(/<[^>]+>/g, '');
  const long = text.length > 90 || /\n/.test(text.trim());
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || (long ? 'info' : 'ok'));
  el.innerHTML = '<div class="toast-body">' + esc(text) + '</div><button class="toast-x" title="关闭">×</button>';
  root.appendChild(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.toast-x').onclick = close;
  if (!long) setTimeout(close, 5000);
  while (root.children.length > 4) root.firstChild.remove();
}
const warn = msg => notify(msg, 'warn');
function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00');
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400000);
}
const MON_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// 把各种写法的日期统一成 YYYY-MM-DD：2026-10-31、2026/10/31、2026.10.31、2026年10月31日、带时间的、
// 10/31/2026、31/10/2026、10/31/26（Excel 默认日期格式）、31-Oct-26、Oct 31, 2026、20261031；serialOk 时也认 Excel 日期序列号
function normalizeDate(s, serialOk) {
  const p2 = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const y4 = y => (String(y).length === 2 ? 2000 + +y : +y);
  if (s instanceof Date && !isNaN(s)) return p2(s.getFullYear(), s.getMonth() + 1, s.getDate());
  const t = String(s == null ? '' : s).replace(/[\u200B-\u200D\uFEFF]/g, '').trim().replace(/\s+/g, ' ').replace(/[\/\.年月]/g, '-').replace(/日/g, '');
  const serial = serialOk ? (typeof s === 'number' ? s : (/^\d{5}$/.test(t) ? +t : 0)) : 0;
  if (serial > 20000 && serial < 80000) { const d = new Date(Math.round((serial - 25569) * 86400000)); return p2(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (m) return p2(m[1], m[2], m[3]);
  if ((m = t.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/))) return p2(m[1], m[2], m[3]);
  if ((m = t.match(/^(\d{4})-(\d{1,2})(?![-\d])/))) return p2(m[1], m[2], 1);
  if ((m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})(?!\d)/))) {   // m/d/yyyy、m/d/yy 或 d/m/yyyy：前一个数大于 12 就对调
    let a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) { const x = a; a = b; b = x; }
    return p2(y4(m[3]), a, b);
  }
  if ((m = t.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})$/)) && MON_EN[m[2].slice(0, 3).toLowerCase()]) return p2(y4(m[3]), MON_EN[m[2].slice(0, 3).toLowerCase()], +m[1]);
  if ((m = t.match(/^([A-Za-z]{3,9})[- ](\d{1,2})[- ,]*(\d{2,4})$/)) && MON_EN[m[1].slice(0, 3).toLowerCase()]) return p2(y4(m[3]), MON_EN[m[1].slice(0, 3).toLowerCase()], +m[2]);
  return null;
}
// 一段文字里出现的所有日期（"2026-10-31 ~ 2026-11-30" 这种把起止写在一格里的），按出现的先后
function findDates(s) {
  const out = [];
  String(s == null ? '' : s).replace(/\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?/g, x => { const d = normalizeDate(x); if (d && out.indexOf(d) < 0) out.push(d); return x; });
  return out;
}
const MONTH_RE = /^(1[0-2]|[1-9])月(执行|预测)$/;
// 平台上的两个特殊项目（本来就不关联规划、不参与我的预算）
const SPECIAL_RE = /PO\s*受益部门|不向变更项目/;
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
const foldOpen = {};                           // 各折叠块的展开状态（按 id 记，重渲染时保留）
let chartTodo = {};                             // 折叠块里等着画的图（展开时才画：foldPoCharts / foldMonth）
let fileHandle = null;                       // 数据文件句柄（File System Access，会话内记忆）
let fileConnected = false;                   // budget.json 写穿连接状态（断连时数据仅存浏览器缓存，重连即同步）
let fileWriteTimer = null, fileWriting = false;
async function writeThroughNow() {           // 立即把当前状态写入 budget.json（原子写：临时文件+提交）
  if (!fileHandle) return true;
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
  if (!fileHandle) return;
  clearTimeout(fileWriteTimer);
  fileWriteTimer = setTimeout(async () => { const ok = await writeThroughNow(); if (!ok && fileWriting) scheduleFileWrite(); }, 800);   // 上一次还没写完而被跳过的，等它写完再补一次，最后一次的状态不能漏
}
let recentHandle = null;                     // 上次用过的数据文件句柄（IndexedDB 持久记忆）
let dirHandle = null;                        // 数据集文件夹句柄（平台导出文件都放这里）
let datasetPerm = 'granted';                 // 数据集文件夹的读取权限。浏览器重启后可能要重新授权（'prompt'）：这时打开页面的自动扫描做不了，要在首页说清楚

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
  if (!silent) notify('已载入 ' + (f.name || 'budget.json') + '（更新于 ' + new Date(f.lastModified).toLocaleString() + '）');
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
  if (!window.showDirectoryPicker) { warn('当前浏览器不支持选择文件夹（请用 Chrome/Edge）'); return; }
  try { dirHandle = await window.showDirectoryPicker({ mode: 'read' }); }
  catch (e) { return; }
  try { await idbSet('dir', dirHandle); } catch (e) { }
  await scanDataset(true);
}
/* ---- 解析版本 ----
   导入时解析好、存下来的数据（PO 明细行、执行表快照、团队配置），在解析逻辑变了以后不会自己更新；
   而数据集文件夹里的文件没变就不会重读，于是刷新页面也还是旧结果。
   做法：每类一个版本号，改了这一类的解析逻辑（或导入时算好存下来的字段）就把号 +1；
   打开看板时发现数据里的版本号落后 → 把数据集文件夹里这一类文件全部重读一遍（文件没变也重读），不需要用户手动重导。 */
const PARSE_VER = { po: 3, exec: 2, team: 2, grants: 2 };   // 2026-11-28 四类全部 +1：数据集扫描有一段时间导入后没保存（见 scanDataset），把数据集里的文件全部重读一遍补回来
const PARSE_KEYS = ['po', 'exec', 'team', 'grants'];
const PARSE_NAME = { po: 'PO 明细', exec: '预算执行表', team: '团队配置', grants: '预算授予' };
// 没有版本号的旧数据：PO 明细当作第 0 版（服务期识别改过，要重读）；执行表、团队配置当作第 1 版
const parseVerOf = s => Object.assign({ po: 0, exec: 1, team: 1, grants: 1 }, (s && s.parseVer) || {});   // 预算授予是新加的文件类型，旧数据里没有，不算落后
const parseVerNeed = () => PARSE_KEYS.filter(k => parseVerOf(state)[k] !== PARSE_VER[k]);
const parseVerMark = kinds => { if (!(kinds && kinds.length)) return; state.parseVer = Object.assign(parseVerOf(state)); kinds.forEach(k => { state.parseVer[k] = PARSE_VER[k]; }); };
// 这一类有没有数据可重读（团队配置可能是手工录入的，不在数据集里也不提示）
const parseKindHasData = k => k === 'po' ? Object.keys(state.poDataByYear || {}).some(y => ((((state.poDataByYear || {})[y] || {}).rows) || []).length > 0) : k === 'exec' ? (state.execSnaps || []).length > 0 : k === 'grants' ? Object.keys(((state.grantData || {}).byProject) || {}).length > 0 : false;
// 这次扫描要读哪些文件：新文件全要；解析规则变了的类别，文件没变也要重读。
// known[签名] 记着每个文件上次识别成的类型（po / exec / team / unknown / error）；更早的记录只有一个 1，类型未知，需要读一下才知道
function pickScanFiles(files, known, sigOf, verNeed) {
  return files.filter(it => {
    const raw = known[sigOf(it)];
    if (raw == null) return true;
    if (!verNeed.length) return false;
    return typeof raw !== 'string' || verNeed.indexOf(raw) >= 0;
  }).map(it => Object.assign({}, it, { _new: known[sigOf(it)] == null }));
}
async function scanDataset(manual, force) {
  if (!dirHandle) { datasetPerm = 'none'; if (manual) warn('请先设置数据集文件夹'); return false; }
  let perm = 'granted';
  try { perm = await dirHandle.queryPermission({ mode: 'read' }); } catch (e) { }
  if (perm !== 'granted') {
    try { perm = await dirHandle.requestPermission({ mode: 'read' }); } catch (e) { }
    if (perm !== 'granted') { datasetPerm = perm || 'prompt'; if (manual) warn('未授权读取该文件夹'); return false; }
  }
  datasetPerm = 'granted';
  const files = [];
  try { await walkDir(dirHandle, files); } catch (e) { if (manual) warn('读取文件夹失败：' + e.message); return false; }
  let known = {};
  try { known = JSON.parse(localStorage.getItem('budgetDash.dataset') || '{}'); } catch (e) { }
  const sigOf = it => it.project + '|' + it.file.name + '|' + it.file.size + '|' + it.file.lastModified;   // 含所在文件夹：挪动过 = 新文件
  const verNeed = PARSE_KEYS.filter(k => (force ? PARSE_KEYS : parseVerNeed()).indexOf(k) >= 0);   // 解析规则变了的类别
  // 规则变了的类别：已经重读的、或根本没有这类数据可重读的，记为已更新；剩下的（以前是手动导入的）继续在首页提示，
  // 并记下其中"数据集文件夹里没有这类文件"的，提示改成手动导入
  const finishVer = imported => {
    const inFolder = k => files.some(it => known[sigOf(it)] === k);
    const done = verNeed.filter(k => imported.indexOf(k) >= 0 || !parseKindHasData(k));
    if (done.length) { parseVerMark(done); }
    const noFile = verNeed.filter(k => done.indexOf(k) < 0 && !inFolder(k));
    const before = JSON.stringify(state.parseVerNoFile || []);
    state.parseVerNoFile = (state.parseVerNoFile || []).filter(k => verNeed.indexOf(k) < 0).concat(noFile);
    if (done.length || JSON.stringify(state.parseVerNoFile) !== before) save();
    return verNeed.filter(k => done.indexOf(k) < 0);
  };
  const todo = pickScanFiles(files, known, sigOf, verNeed);
  if (!todo.length) {
    const left = finishVer([]);
    const msg = left.length
      ? '看板更新了 ' + left.map(k => PARSE_NAME[k]).join('、') + ' 的解析规则，但数据集文件夹里没有这类文件——它们以前是手动导入的，请用「导入平台数据」重新导入一次'
      : (verNeed.length ? '' : '数据集文件夹里没有新文件（识别到的 ' + files.length + ' 个文件都已导入过）');
    if (manual && msg) notify(msg);
    return false;
  }
  const nNew = todo.filter(it => it._new).length;
  const r = await importFilesAuto(todo, {
    verNeed, noLog: nNew === 0,   // 只是按新规则重读、没有新文件：不记入导入记录（回测用的是真实导入）
    onKind: (it, kind) => { known[sigOf(it)] = kind || 'unknown'; },
    onError: it => { known[sigOf(it)] = 'error'; }
  });
  if (r.touched) save();   // 和手动导入一样：存下来并刷新页面。2026-11-23 重构时这一步丢了——文件读进了内存却没存，刷新就没；
                           // 而文件已被记成「已导入」，之后再扫也不重读（2026-11-28 内网发现：换了新导出的文件，自动和手工扫描都像没读到）
  files.forEach(it => { if (known[sigOf(it)] == null) known[sigOf(it)] = 'unknown'; });
  localStorage.setItem('budgetDash.dataset', JSON.stringify(known));   // 存下来以后才把文件记成已导入：万一没存上，下次扫描还会重读
  const left = finishVer(r.kinds);
  const reRead = verNeed.filter(k => r.kinds.indexOf(k) >= 0);
  const head = reRead.length
    ? '🔄 看板更新了 ' + reRead.map(k => PARSE_NAME[k]).join('、') + ' 的解析规则，已按新规则重新读取数据集里的文件' + (nNew ? '（同时导入了 ' + nNew + ' 个新文件）' : '') + (left.length ? '\n⚠️ ' + left.map(k => PARSE_NAME[k]).join('、') + '以前是手动导入的，数据集里没有，需要用「导入平台数据」重新导入一次' : '')
    : '📁 数据集自动导入完成';
  notify(head + '：\n\n' + r.text + '\n\n快照日期按文件导出时间记录。');
  return true;
}
async function importFilesAuto(items, opts) {
  opts = opts || {};
  const parsed = [];
  for (const it of items) {
    const f = it.file;
    try {
      const rows = await parseWorkbookFile(f);
      const kind = detectKind(rows);
      if (opts.onKind) opts.onKind(it, kind);
      if (it._new === false && opts.verNeed && opts.verNeed.indexOf(kind) < 0) continue;   // 规则没变的类别：读一下只为确认类型，不重新导入
      const rec = { name: f.name, project: it.project || '', kind, rows, file: f, snapDate: fileSnapDate(f) };
      if (kind === 'team') { try { rec.sheets = await parseAllSheets(f); } catch (e) { } }
      parsed.push(rec);
    } catch (err) {
      if (opts.onError) opts.onError(it);
      parsed.push({ name: f.name, project: it.project || '', kind: '', error: '解析失败 ' + err.message });
    }
  }
  const r = importParsed(parsed);
  if (r.touched && !opts.noLog) recordImportLog(calc());   // 每次导入记一份决策快照（并回测上次的估计）
  return r;
}
// 已导入过的花钱项目（子文件夹名），供手动导入时选择
function knownProjects() {
  const s = new Set(Object.keys(state.projPrints || {}));
  (state.execSnaps || []).forEach(x => Object.keys(x.byProject || {}).forEach(p => s.add(p)));
  return Array.from(s).sort();
}
// 导入核心（数据集自动扫描与手动拖拽共用）。items = [{name, project, kind, rows, sheets?, snapDate, file?, error?}]
// project = 花钱项目标识（文件所在的一级子文件夹名）。执行表没有项目列，必须带 project 才导入。
// PO 明细：每个项目文件夹取最新的一份（每次导出都是全年全量，旧的已被新的覆盖），只替换这个项目的行，别的项目原来的行保留。
// 团队配置：留着的旧文件里取最新的一份。file.lastModified = 文件修改时间；手动导入没有 file 时同项目的后一个覆盖前一个。
// 预算授予：同样按项目文件夹取最新的一份。每次导入后自动和上一次比，认出这段时间发生的事（detectImportChanges）。
function importParsed(items) {
  const Y = curYear();
  const parts = [];
  const poFiles = [], execFiles = [], teamFiles = [], grantFiles = [];
  // 变化识别用：导入前的样子
  const poPrev = (state.poDataByYear || {})[Y];
  const before = {
    po: poPrev && (poPrev.rows || []).length ? { at: poPrev.updatedAt, asOf: poPrev.asOf, rows: poPrev.rows } : null,
    exec: latestExecRows() ? execCompact(latestExecRows()) : null,
    grants: JSON.parse(JSON.stringify((state.grantData || {}).byProject || {})), grantsOk: !!(state.grantData && Object.keys(state.grantData.byProject || {}).length),
    team: JSON.stringify([state.team, state.teamPlan]), teamOk: (state.team || []).length > 0
  };
  const prevAt = state.lastImportAt || '';
  items.forEach((it, idx) => {
    if (it.error) { parts.push('❌ ' + it.name + '：' + it.error); return; }
    if (!it.kind) { parts.push('⚠️ ' + it.name + '：未能识别类型，已跳过'); return; }
    const tag = it.project ? '·' + it.project : '';
    const mt = (it.file && it.file.lastModified) || 0;
    if (it.kind === 'po') {
      try {
        const r = parsePoRows(it.rows);
        poFiles.push({ project: it.project || '', name: it.name, mt, idx, r });
        learnProjectAlias(r.rows, it.project);
        parts.push('📄 ' + it.name + '（PO明细' + tag + '）：' + r.rows.length + ' 行');
        if (!r.hasEndCol) parts.push('⚠️ ' + it.name + '（PO明细' + tag + '）：没找到「费用结束时间」列（表头要有"费用结束/截止/到期"或"费用起止"）——服务期只能按各 PO 的月度金额推断，当月 PO 的预测可能被算成返还');
        else if (r.noEnd) parts.push('⚠️ ' + it.name + '（PO明细' + tag + '）：有 ' + r.noEnd + ' 行读不到费用结束时间——这些 PO 的服务期按月度金额推断，请到 PO 台账核对');
      } catch (err) { parts.push('❌ ' + it.name + '（PO明细）：' + err.message); }
    } else if (it.kind === 'exec') {
      if (!it.project) { parts.push('⚠️ ' + it.name + '（执行表）：不在花钱项目的子文件夹里，未导入——请放进对应项目的子文件夹'); return; }
      try { execFiles.push({ name: it.name, project: it.project, date: it.snapDate, rows: parseExecRows(it.rows) }); }
      catch (err) { parts.push('❌ ' + it.name + '（执行表）：' + err.message); }
    } else if (it.kind === 'team') {
      let persons = null, tPlan = null;
      const tNotes = [];
      if (it.sheets) { const r2 = parseTeamSheets(it.sheets); if (r2.groups.length) persons = r2.groups; tPlan = r2.plan; tNotes.push(...r2.notes); }
      if (!persons) persons = parseTeamTable(it.rows);
      if (!persons.length) { parts.push('⚠️ ' + it.name + '（团队配置）：未识别到人员（需要 PO/OD 页签+姓名/单价列，或 类型/人数/单价 列）'); return; }
      teamFiles.push({ name: it.name, mt, idx, persons, tPlan, tNotes });
    } else if (it.kind === 'grants') {
      try { grantFiles.push({ project: it.project || '', name: it.name, mt, idx, rows: parseGrantRows(it.rows) }); }
      catch (err) { parts.push('❌ ' + it.name + '（预算授予）：' + err.message); }
    }
  });
  // 同一组里取最新的：有修改时间按修改时间；都没有（手动导入）按先后顺序，后一个为准
  const latest = list => list.reduce((pick, f) => (!pick || f.mt > pick.mt || (f.mt === pick.mt && !f.mt && f.idx > pick.idx)) ? f : pick, null);
  const kinds = [];
  const team = latest(teamFiles);
  if (team) {
    state.team = team.persons.map(g => Object.assign({ id: uid(), poGroup: '' }, g));
    if (team.tPlan != null) state.teamPlan = team.tPlan;   // 页签式：以 Excel 的「变动计划」页签为准（没有该页签 = 清空）；平面表：保留已有的
    touch('team');
    const ownN = sum(team.persons.filter(g => g.kind === 'po' && g.poGroup), g => g.headcount || 0);
    parts.push('👥 ' + team.name + '（团队配置）：' + sum(team.persons, g => g.headcount || 0) + ' 人 / ' + team.persons.length + ' 组已更新（以数据集为准）' +
      (ownN ? '；其中 ' + ownN + ' 人标了 PO 归属' : '') + (team.tPlan && team.tPlan.length ? '；变动计划 ' + team.tPlan.length + ' 条' : '') +
      (teamFiles.length > 1 ? '；共 ' + teamFiles.length + ' 份团队文件，以最新修改的「' + team.name + '」为准' : ''));
    team.tNotes.forEach(n => parts.push('ℹ️ ' + n));
    kinds.push('team');
  }
  // 预算授予流水：每个项目文件夹取最新的一份
  const gBy = {};
  grantFiles.forEach(f => { if (!gBy[f.project] || latest([gBy[f.project], f]) === f) gBy[f.project] = f; });
  state.grantData = state.grantData || { byProject: {} };
  Object.values(gBy).forEach(f => {
    state.grantData.byProject[f.project] = { updatedAt: todayStr(), rows: f.rows, prev: state.grantData.byProject[f.project] || null };
    parts.push('📄 ' + f.name + '（预算授予' + (f.project ? '·' + f.project : '') + '）：' + f.rows.length + ' 行');
    kinds.push('grants');
  });
  const poBy = {};
  poFiles.forEach(f => { if (!poBy[f.project] || latest([poBy[f.project], f]) === f) poBy[f.project] = f; });
  const poChosen = Object.values(poBy);
  poFiles.filter(f => poBy[f.project] !== f).forEach(f => parts.push('ℹ️ ' + f.name + '（PO明细' + (f.project ? '·' + f.project : '') + '）：同一文件夹里有更新的导出，以「' + poBy[f.project].name + '」为准'));
  let asOf = 0;
  if (poChosen.length) {
    state.poDataByYear = state.poDataByYear || {};
    // 只替换这次导入的项目文件夹，别的项目的行保留。早期导入的行没记所属文件夹（分不清来自哪个文件），一律丢掉：
    // 它们本来就是从同样的导出文件读来的，那些项目再导入时会重新读进来；留着反而会和新行重复
    const replaced = {};
    poChosen.forEach(f => { replaced[f.project] = 1; f.r.rows.forEach(x => { x.proj = f.project; }); asOf = Math.max(asOf, f.r.asOf); });
    const kept = (poPrev && poPrev.rows || []).filter(r => r.proj != null && !replaced[r.proj]);
    const newAll = kept.concat(...poChosen.map(f => f.r.rows));
    state.poDataByYear[Y] = { updatedAt: todayStr(), asOf, rows: newAll };
    // 快照留存：每次导入留一份摘要（每张 PO 一行：金额、状态、已执行、预测），保留最近 6 次；完整的历史在平台导出文件里
    state.poDataByYear[Y].history = ((poPrev && poPrev.history) || []).slice(-5).concat([{ at: todayStr(), asOf, rows: poCompact(newAll, asOf) }]);
    touch('po');
    kinds.push('po');
  }
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
    kinds.push('exec');
  }
  // 导入提醒（放错文件夹、缺项目等）：留在风险区，下次导入时替换
  const dropped = items.filter(it => it.kind === 'exec' && !it.project);
  dropped.forEach(it => notes.push('「' + it.name + '」（执行表）没有花钱项目归属，未导入——请把它放进对应花钱项目的子文件夹'));
  state.importNotes = notes.map(text => ({ date: todayStr(), text }));
  notes.forEach(n => parts.push('⚠️ ' + n));
  // 变化识别：导入后和导入前比
  const touched = !!(poChosen.length || execFiles.length || team || Object.keys(gBy).length);
  let changes = null;
  if (touched) {
    const after = {
      po: poChosen.length ? { at: todayStr(), asOf, rows: state.poDataByYear[Y].rows } : null,
      exec: execFiles.length && latestExecRows() ? execCompact(latestExecRows()) : null,
      grants: Object.keys(gBy).length ? state.grantData.byProject : null,
      team: JSON.stringify([state.team, state.teamPlan])
    };
    changes = state.changes = { at: todayStr(), prevAt, items: detectImportChanges(before, after) };
    state.changeLog = (state.changeLog || []).concat([changes]).slice(-40);
    state.lastImportAt = changes.at;
    if (changes.items.length) parts.push('🔔 相比上次导入（' + (prevAt || '首次') + '）：' + changes.items.map(x => x.txt).join('；'));
    else parts.push('🔔 相比上次导入（' + (prevAt || '首次') + '）没有发现变化');
  }
  return { text: parts.join('\n'), touched, kinds, changes };
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
      try { await loadFromHandle(h); } catch (e) { warn('载入失败：' + e.message); }
      return;
    } catch (e) { if (e && e.name === 'AbortError') return; /* 回退到 input */ }
  }
  const inp = $('#importFile'); if (inp) inp.click();
}

function defaultYearParams() {
  return { fxRate: 7.03, execRateTarget: 0.95, bonusMonths: 3.5, attendFactor: 1, workdays: {}, lastHcCheck: '', excluded: [], otPeople: 12, otSkip: '2,6', festAttend: 0.9, odYearEnd: '' };   // odYearEnd：年终清算预计扣款（用户自己的测算总额），'' = 按人数测算
}
function defaultState() {
  const y = new Date().getFullYear();
  return {
    schemaVersion: 4,
    meta: { year: y, updateFreqDays: 14 },
    years: { [y]: defaultYearParams() },
    plans: [],          // {id, year, code, name, amountW, target, planProject, dead, note}  code 可空，平台授予后关联
    grantLogs: [],      // {date, code, amountCny, note}      授予流水（辅助，按日期自然分年）
    grantData: { byProject: {} }, grantAttr: {},   // 授予流水的规划归属：{授予单号|编码: 规划 id}
   // 平台导出的预算授予流水：byProject[项目] = {updatedAt, rows, prev}
    changes: null, changeLog: [], lastImportAt: '',   // 本次导入相比上次发现了什么 / 历次记录 / 上次导入日期
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
function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); try { localStorage.setItem('budgetDash.savedAt', String(Date.now())); } catch (e) { } scheduleFileWrite(); renderAll(); }   // 每次保存都写穿到 budget.json（防抖 800ms）——以前只有 saveSilent 会写穿
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
/* ---- 预算授予流水（平台导出，按花钱项目）----
   一行一笔授予操作：普通授予（只有正数）= 预算到账；调整行（一列为负、另一列为正，授予人如「IT版本经理调整」）= IT外包和 OD 之间的调拨；
   备注「以前年度授予未结算」= 往年结转。没有日期列，事件时间按导入时间记 */
function parseGrantRows(rows) {
  const col = {};
  (rows[0] || []).forEach((x, i) => {
    const H = String(x == null ? '' : x).replace(/[\s\u3000]+/g, '');
    if (/^年度$/.test(H)) col.yr = i;
    else if (/项目编码|预算来源编码/.test(H)) col.code = i;
    else if (/项目名称|预算来源名称/.test(H)) col.name = i;
    else if (/授予单号/.test(H)) col.doc = i;
    else if (/授予人/.test(H)) col.by = i;
    else if (/OD/i.test(H)) col.od = i;
    else if (/外包人力/.test(H)) col.itw = i;
    else if (/合计/.test(H)) col.total = i;
    else if (/备注/.test(H)) col.note = i;
  });
  if (col.code == null) throw new Error('未找到「项目编码」列');
  const txt = (r, k) => (k != null ? String(r[k] == null ? '' : r[k]).trim() : '');
  const num = (r, k) => { const n = k != null ? parseMoney(r[k]) : null; return n == null ? 0 : n; };
  const out = [];
  rows.slice(1).forEach(r => {
    const code = txt(r, col.code);
    if (!code) return;
    out.push({ yr: txt(r, col.yr), code, name: txt(r, col.name), docNo: txt(r, col.doc), by: txt(r, col.by), itw: num(r, col.itw), od: num(r, col.od), total: num(r, col.total), note: txt(r, col.note) });
  });
  return out;
}
/* ---- 两次导入之间的变化识别 ----
   快照 = 一次导入（平台导出都是全年全量，一次导入就带进了这段时间发生的所有事）；事件 = 两次导入之间的差。
   每类数据只和"它自己上一次导入"比：PO 明细（新下的、验收关闭的、执行增加）、执行表（OD 扣减、到账）、
   授予流水（新出现的授予单号：到账 / 调拨 / 往年结转）、团队配置。第一次导入只建立基准，不做比对 */
const poCompact = (rows, asOf) => (rows || []).map(r => ({ no: r.poNo, nm: r.resName, st: r.status, amt: r.amount || 0, sd: r.startDate, ed: r.endDate, code: r.budgetCode, proj: r.proj || '',
  E: sum(Object.entries(r.months || {}), ([m, v]) => +m < asOf ? v : 0), F: sum(Object.entries(r.months || {}), ([m, v]) => +m >= asOf ? v : 0) }));   // E = 已执行合计，F = 预测合计
const execCompact = rows => Object.entries(rows || {}).map(([code, r]) => ({ code, name: r.name, itwG: (r.itw && r.itw.granted) || 0, itwE: (r.itw && r.itw.exec) || 0, odG: (r.od && r.od.granted) || 0, odE: (r.od && r.od.exec) || 0 }));
const latestExecRows = () => { const s = state.execSnaps || []; return s.length ? (s[s.length - 1].rows || {}) : null; };
function detectImportChanges(before, after) {
  const items = [];
  if (after.po && before.po) {
    const pvByPo = {}, curByPo = {};
    poCompact(before.po.rows, before.po.asOf || 13).forEach(r => { const g = pvByPo[r.no] = pvByPo[r.no] || { no: r.no, nm: r.nm, st: r.st, E: 0, F: 0 }; g.E += r.E; g.F += r.F; g.st = r.st; });
    poCompact(after.po.rows, after.asOf || 13).forEach(r => { const g = curByPo[r.no] = curByPo[r.no] || { no: r.no, nm: r.nm, st: r.st, sd: r.sd, ed: r.ed, amt: r.amt, E: 0, F: 0 }; g.E += r.E; g.F += r.F; g.st = r.st; g.amt = Math.max(g.amt, r.amt); });
    const news = [], closed = []; let exN = 0, exS = 0;
    Object.values(curByPo).forEach(g => {
      const o = pvByPo[g.no];
      if (!o) { if (g.amt > 500 || g.F > 500 || g.E > 500) news.push(g); return; }
      if (o.st !== g.st && g.st !== 'OPEN') closed.push({ no: g.no, nm: g.nm, refund: o.F });
      else if (g.E - o.E > 500) { exN++; exS += g.E - o.E; }
    });
    Object.values(pvByPo).forEach(o => { if (!curByPo[o.no] && o.F > 500) closed.push({ no: o.no, nm: o.nm, refund: o.F }); });   // 从明细里消失了、之前还有没花完的预测 = 关闭
    news.forEach(g => items.push({ t: 'poNew', amt: g.amt || g.F, txt: '新下 PO「' + (g.nm || g.no) + '」' + fmtCny(g.amt || g.F) + (g.sd ? '（服务期 ' + g.sd + (g.ed && g.ed !== g.sd ? ' ~ ' + g.ed : '') + '）' : '') }));
    closed.forEach(g => items.push({ t: 'accept', amt: g.refund, txt: '验收关闭「' + (g.nm || g.no) + '」' + (g.refund > 500 ? '，冻结的 ' + fmtCny(g.refund) + ' 回到账户' : '') }));
    if (exN) items.push({ t: 'poExec', amt: exS, txt: exN + ' 张 PO 的执行增加 ' + fmtCny(exS) });
  }
  if (after.exec && before.exec) {
    const pv = {}; before.exec.forEach(r => { pv[r.code] = r; });
    let odS = 0, odN = 0, itwS = 0, newN = 0; const odTop = [];
    after.exec.forEach(r => {
      const o = pv[r.code];
      if (!o) { newN++; return; }
      const dOd = r.odE - o.odE, dItw = r.itwE - o.itwE, dG = (r.itwG + r.odG) - (o.itwG + o.odG);
      if (dOd > 500) { odS += dOd; odN++; odTop.push(shortName(r.name) + ' ' + fmtCny(dOd)); }
      if (dItw > 500) itwS += dItw;
      if (dG > 500 && !after.grants) items.push({ t: 'grant', amt: dG, txt: '预算到账「' + r.name + '」+' + fmtCny(dG) });
    });
    if (odS > 500) items.push({ t: 'odDeduct', amt: odS, txt: 'OD 扣减 ' + fmtCny(odS) + (odN > 1 ? '（' + odN + ' 个来源）' : '') + '：' + odTop.slice(0, 4).join('、') });
    if (itwS > 500 && !items.some(x => x.t === 'poExec')) items.push({ t: 'itwExec', amt: itwS, txt: 'IT外包 执行增加 ' + fmtCny(itwS) });
    if (newN) items.push({ t: 'newSrc', txt: '平台新增 ' + newN + ' 个预算来源' });
  }
  if (after.grants && before.grantsOk) {
    const pvDocs = new Set();
    Object.values(before.grants).forEach(g => (g.rows || []).forEach(r => pvDocs.add(r.docNo + '|' + r.code)));
    Object.values(after.grants).forEach(g => (g.rows || []).forEach(r => {
      if (pvDocs.has(r.docNo + '|' + r.code)) return;
      const amt = r.total || r.itw + r.od;
      if (r.itw < -500 || r.od < -500) items.push({ t: 'transfer', amt: Math.max(r.itw, r.od), txt: '调拨「' + r.name + '」' + (r.od > 0 ? 'IT外包 → OD ' : 'OD → IT外包 ') + fmtCny(Math.max(r.itw, r.od)) + (r.by ? '（' + r.by + '）' : '') });
      else if (/以前年度/.test(r.note)) items.push({ t: 'carry', amt, txt: '往年结转「' + r.name + '」' + fmtCny(amt) });
      else items.push({ t: 'grant', amt, txt: '预算到账「' + r.name + '」+' + fmtCny(amt) + (r.by ? '（' + r.by + '）' : '') });
    }));
  }
  if (before.teamOk && after.team !== before.team) {   // 第一次导入团队配置只建立基准
    const hc = sum(state.team || [], g => g.headcount || 0);
    items.push({ t: 'team', txt: '团队配置有更新：' + hc + ' 人 / ' + (state.team || []).length + ' 组' + ((state.teamPlan || []).length ? '，变动计划 ' + state.teamPlan.length + ' 条' : '') });
  }
  return items;
}
function detectKind(rows) {
  const h = (rows[0] || []).join(' ');
  if (/授予单号/.test(h)) return 'grants';
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
  const endCol = col(/结束|离开|到期|截止/);   // 结束年月（可选）：填了 = 临时人员，只在 [生效年月, 结束年月) 这一段里算
  const ymCol = header.findIndex((h, i) => i !== endCol && /年月|月份|生效|起始|开始/.test(String(h || '')));
  const kindCol = col(/类型|渠道|分类/), priceCol = col(/单价|价格|费用|费率/), cntCol = col(/人数|数量|增减/), noteCol = col(/备注|说明/);
  if (ymCol < 0 || priceCol < 0 || cntCol < 0) return { list: [], notes: ['需要「生效年月」「单价」「人数」三列'] };
  rows.slice(1).forEach((r, i) => {
    const ym = normYm(r[ymCol]);
    const end = endCol >= 0 && String(r[endCol] == null ? '' : r[endCol]).trim() !== '' ? normYm(r[endCol]) : '';
    const rate = parseMoney(r[priceCol]);
    const cnt = Math.round(parseFloat(String(r[cntCol] == null ? '' : r[cntCol]).replace(/[＋+人\s]/g, '').replace(/[－—–]/g, '-')));
    if (!ym && !end && rate == null && !cnt) return;   // 空行
    if (!ym) { notes.push('第 ' + (i + 2) + ' 行的生效年月认不出（' + r[ymCol] + '）'); return; }
    if (endCol >= 0 && String(r[endCol] == null ? '' : r[endCol]).trim() !== '' && !end) { notes.push('第 ' + (i + 2) + ' 行的结束年月认不出（' + r[endCol] + '）'); return; }
    if (end && end <= ym) { notes.push('第 ' + (i + 2) + ' 行的结束年月需晚于生效年月'); return; }
    if (rate == null || rate <= 0) { notes.push('第 ' + (i + 2) + ' 行的单价无效'); return; }
    if (!cnt) { notes.push('第 ' + (i + 2) + ' 行的人数无效（填 +2 / -1）'); return; }
    let kind = kindCol >= 0 ? (/od/i.test(String(r[kindCol] || '')) ? 'od' : /po/i.test(String(r[kindCol] || '')) ? 'po' : '') : '';
    if (!kind) kind = /月/.test(String(header[priceCol] || '')) ? 'od' : (/日/.test(String(header[priceCol] || '')) ? 'po' : '');
    if (!kind) { notes.push('第 ' + (i + 2) + ' 行无法判断 PO/OD（类型列填 PO 或 OD，或单价列名含 日/月）'); return; }
    const ownCol = col(/归属/);   // 归属（可选）：临时的 PO 人员归哪张 PO（值与「po归属」页签里的一致）
    out.push({ ym, end, kind, rate, count: cnt, own: ownCol >= 0 ? String(r[ownCol] || '').trim() : '', note: noteCol >= 0 ? String(r[noteCol] || '').trim() : '' });
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
  // 表头先去掉空白（导出的表头里常带换行、两端空格）再匹配；同一类列出现多个时（如两个"费用结束时间"）取有值的那个
  const cands = {};
  header.forEach((h, i) => {
    const H = String(h == null ? '' : h).replace(/[\s\u3000]+/g, '');
    const hit = (k, re) => { if (re.test(H)) { (cands[k] = cands[k] || []).push(i); return true; } return false; };
    if (hit('span', /起止|期间|服务期/)) return;   // 起止写在一格里的（"费用起止时间"：2026-10-31 ~ 2026-11-30）
    if (hit('resNo', /资源申请编号/)) return;
    if (hit('resName', /资源申请名称/)) return;
    if (hit('poNo', /^PO编码$|PO编号|^PO号/)) return;
    if (hit('status', /PO状态/)) return;
    if (hit('startDate', /费用(起|开始)|起始(时间|日期)|开始(时间|日期)/)) return;
    if (hit('endDate', /费用(结束|终止|截止|到期|止)|结束(时间|日期)|终止(时间|日期)|截止(时间|日期)|到期(时间|日期)/)) return;
    if (hit('amount', /^PO金额/)) return;
    if (hit('itProjectCode', /IT项目编码/)) return;
    if (hit('itProject', /IT项目名称/)) return;
    if (hit('budgetCode', /^项目编码$/)) return;
    if (hit('budgetName', /^项目名称$/)) return;
    const mh = parseMonthHeader(H);
    if (mh) { (cands.months = cands.months || {})[mh.month] = i; if (mh.fc) (cands.fcMonths = cands.fcMonths || []).push(mh.month); }
  });
  const col = {};
  const filledN = i => rows.slice(1).filter(r => String(r[i] == null ? '' : r[i]).trim() !== '').length;
  Object.entries(cands).forEach(([k, v]) => { col[k] = (Array.isArray(v) && k !== 'fcMonths') ? v.slice().sort((a, b) => filledN(b) - filledN(a))[0] : v; });
  if (col.poNo == null && col.resNo == null) throw new Error('未找到 PO 编号列');
  const asOf = col.fcMonths && col.fcMonths.length ? Math.min(...col.fcMonths) : 13;
  const out = [];
  // 平台导出的 PO 级列（编号/名称/状态/起止/金额/项目）常为纵向合并单元格：
  // 仅首行有值、后续行为空 → 在同一张 PO 内向下填充（换了一张 PO 就重新开始，不继承上一张的日期）；
  // 金额被填充的行打标记（按 PO 计金额而非按行累加）
  const FILL = ['resNo', 'resName', 'poNo', 'status', 'startDate', 'endDate', 'span', 'amount', 'itProject', 'itProjectCode'];
  const cell = (r, k) => (col[k] != null ? String(r[col[k]] == null ? '' : r[col[k]]).trim() : '');
  let last = {}, lastPo = null;
  let noEnd = 0;   // 有起始时间、但读不到结束时间的行数（空的、格式认不出、或早于开始时间）
  rows.slice(1).forEach(r => {
    const rawPo = cell(r, 'poNo') || cell(r, 'resNo');
    if (rawPo && rawPo !== lastPo) { last = {}; lastPo = rawPo; }
    let amtFilled = false;
    FILL.forEach(k => {
      if (col[k] == null) return;
      if (cell(r, k) !== '') last[k] = cell(r, k);
      else if (last[k] != null) { r[col[k]] = last[k]; if (k === 'amount') amtFilled = true; }
    });
    const poNo = cell(r, 'poNo') || cell(r, 'resNo');
    if (!poNo) return;
    const months = {};
    if (col.months) Object.entries(col.months).forEach(([m, i]) => { const v = parseMoney(r[i]); if (v != null) months[+m] = (months[+m] || 0) + v; });
    // 起止时间：分两列的各读各的；写在一格里的（"2026-10-31 ~ 2026-11-30"）取第一个和最后一个日期
    const sp = col.span != null ? findDates(r[col.span]) : [];
    const startDate = normalizeDate(cell(r, 'startDate'), true) || sp[0] || '';
    const endDate = normalizeDate(cell(r, 'endDate'), true) || sp[sp.length - 1] || '';
    if (startDate && (!endDate || endDate < startDate)) noEnd++;
    out.push({
      poNo, resName: cell(r, 'resName'),
      status: /CLOSED|close|验收|结/.test(cell(r, 'status')) ? 'CLOSED' : 'OPEN',
      startDate,
      amount: parseMoney(col.amount != null ? r[col.amount] : '') || 0,
      amtFilled,
      itProject: cell(r, 'itProject'),
      itProjectCode: cell(r, 'itProjectCode'),
      budgetCode: col.budgetCode != null ? String(r[col.budgetCode]).trim() : '',
      endDate,
      months
    });
  });
  return { asOf, rows: out, noEnd, hasStartCol: col.startDate != null || col.span != null, hasEndCol: col.endDate != null || col.span != null };
}
// 费用起止时间是否完整可读
const poHasEnd = r => !!(r.startDate && r.endDate && r.endDate >= r.startDate);
// PO 的服务期覆盖哪些月份：按费用起止时间逐月看，覆盖不足 10 天的月份不算
//   （如 10-31 ~ 11-30 的 PO 是 11 月的：10-31 只占 1 天，不算 10 月；若只按起始月判断，会把它的 11 月预测全当成返还）
//   结束时间读不到（空的、格式认不出、或早于开始时间）时：只对「当前月、或上个月 20 号以后才开始」的 PO 做推断
//   （上个月底开的 PO 是给当月用的）——从开始月起，紧接着的月份里还有执行/预测金额，说明那个月还在服务期内，
//   把最后一个这样的月份底当作结束时间。更早开的 PO 没有结束时间时只算开始月，它在当月的预测按"多下后摊出来的"处理
//   （验收后返还）。连起始时间也没有时，直接按有金额的月份算。
//   （只在服务期内，当月的预测才会按团队需求拆成「将执行 / 多下」；服务期之外的预测才算返还）
function poOwnMonths(r, asOf) {
  const st = r.startDate ? new Date(r.startDate + 'T00:00:00') : null;
  const mvMonths = Object.keys(r.months || {}).map(Number).filter(mo => r.months[mo] > 0).sort((a, b) => a - b);
  if (!st || isNaN(st)) return new Set(mvMonths);
  let en = poHasEnd(r) ? new Date(r.endDate + 'T00:00:00') : null;
  if (!en || isNaN(en)) {
    let prev = st.getMonth() + 1;
    if (asOf >= 1 && asOf <= 12 && st >= new Date(st.getFullYear(), asOf - 2, 20)) mvMonths.forEach(mo => { if (mo >= prev && mo - prev <= 1) prev = mo; });
    en = new Date(st.getFullYear(), prev, 0);   // 没有结束时间：推断到最后一个紧接着还有金额的月份底（更早开的 PO：只算开始月）
  }
  if (en - st > 370 * 86400000) en = new Date(st.getTime() + 370 * 86400000);
  const out = new Set();
  let d = new Date(st.getFullYear(), st.getMonth(), st.getDate());
  while (d <= en) {
    const y = d.getFullYear(), mo = d.getMonth();
    const mEnd = new Date(y, mo + 1, 0);
    const segEnd = en < mEnd ? en : mEnd;
    const days = Math.round((segEnd - d) / 86400000) + 1;
    if (days >= 10) out.add(mo + 1);
    d = new Date(y, mo + 1, 1);
  }
  return out;
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
    '<div class="muted">日常用「数据集文件夹」自动导入即可（<b>每个花钱项目一个子文件夹</b>，文件丢进去打开看板就导）。这里手动拖入时：<b>拖整个文件夹</b>按子文件夹名识别花钱项目；拖散文件时，执行表和预算授予要在下面指定属于哪个花钱项目（PO 明细和团队表不用）。自动识别类型，按年全量导出，可放心重复导入。</div>' +
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
        [['', '— 请选择类型 —'], ['po', 'PO 明细'], ['exec', '预算执行表'], ['team', '团队配置'], ['grants', '预算授予']].map(([v, l]) => '<option value="' + v + '"' + (f.kind === v ? ' selected' : '') + '>' + l + '</option>').join('') +
        '</select>' + ((f.kind === 'exec' || f.kind === 'po' || f.kind === 'grants') ? projCell(f, fi) : '') + '<span class="muted">' + (f.rows ? f.rows.length + ' 行（含表头）' : '') + '</span>') +
      '</div>' +
      (f.error ? '' : f.kind === 'po' ? poDiagnose(f) : f.kind === 'exec' ? execDiagnose(f) : f.kind === 'team' ? teamDiagnose(f) : f.kind === 'grants' ? grantDiagnose(f) : '') +
      '</div>').join('');
}
function poDiagnose(f) {
  try {
    const { asOf, rows, noEnd, hasStartCol, hasEndCol } = parsePoRows(f.rows);
    const rs = rows.slice(0, 8).map(r => {
      const mSum = sum(Object.entries(r.months), ([, v]) => v);
      const mTxt = Object.entries(r.months).map(([m, v]) => m + '月' + (v >= 10000 ? (v / 10000).toFixed(1) + 'w' : v)).join(' ');
      const own = Array.from(poOwnMonths(r, asOf)).sort((a, b) => a - b).map(mo => mo + '月').join('、');
      const noEndRow = r.startDate && !poHasEnd(r);
      return '<tr><td>' + esc(r.poNo) + '</td><td>' + esc(r.budgetCode) + '</td><td>' + esc(r.startDate || '—') + '</td><td' + (noEndRow ? ' style="color:var(--amber)"' : '') + '>' + esc(r.endDate || (r.startDate ? '未读到' : '—')) + '</td><td>' + (r.startDate ? esc(own) : '—') + '</td><td class="num">' + fmtCny(r.amount) + '</td><td>' + r.status + '</td><td class="num">' + fmtCny(mSum) + '</td><td class="muted">' + esc(mTxt || '无月度值') + '</td></tr>';
    }).join('');
    const dataRows = f.rows.length - 1;
    const skipped = dataRows - rows.length;
    // 服务期靠「费用起始时间 ~ 费用结束时间」判断：读不到结束时间的 PO，当月预测会被误判成返还，所以在这里明确提示
    const warn = (!hasStartCol && !hasEndCol) ? '<div class="cons-diff warn">⚠ 表头里没找到「费用起始时间」「费用结束时间」列（要有"费用起始 / 开始"、"费用结束 / 截止 / 到期"或"费用起止"字样）——所有 PO 的服务期只能按月度金额推断。</div>'
      : !hasEndCol ? '<div class="cons-diff warn">⚠ 表头里没找到「费用结束时间」列（要有"费用结束 / 截止 / 到期"或"费用起止"字样）——服务期只能按各 PO 的月度金额推断。</div>'
      : noEnd ? '<div class="cons-diff warn">⚠ 有 ' + noEnd + ' 行读不到费用结束时间（空白、格式认不出、或早于开始时间，见上面标黄的格）——这些 PO 的服务期按月度金额推断：紧接着的月份有预测，就认作还在服务期内。</div>' : '';
    return '<div class="muted" style="margin:6px 0 3px">🔍 解析诊断：识别为 <b>PO明细</b>，文件读取 <b>' + f.rows.length + '</b> 行（含表头）→ 有效解析 <b>' + rows.length + '</b> 行' + (skipped > 0 ? '，<span style="color:var(--amber)">跳过 ' + skipped + ' 行（PO编号列为空）</span>' : '') + '；执行/预测分界月 asOf=<b>' + asOf + '</b>（<' + asOf + '月=实际，≥' + asOf + '月=平台预测）</div>' + warn +
      '<div class="paste-preview"><table><tr><th>PO编码</th><th>预算来源</th><th>费用起始</th><th>费用结束</th><th>服务期认作</th><th>金额</th><th>状态</th><th>月度合计</th><th>各月读到的值</th></tr>' + rs + '</table></div>' +
      '<div class="muted">「服务期认作」= 这张 PO 算哪几个月的（覆盖不足 10 天的月份不算，所以 10-31 ~ 11-30 认作 11 月）。服务期内的当月预测按团队需求拆成将执行 / 多下；服务期之外的才算返还。若与 Excel 对不上，截图此面板发给维护人。</div>';
  } catch (e) { return '<div class="cons-diff warn">🔍 解析失败：' + esc(e.message) + '</div>'; }
}
function grantDiagnose(f) {
  try {
    const rows = parseGrantRows(f.rows);
    const rs = rows.slice(0, 6).map(r => '<tr><td>' + esc(r.code) + '</td><td>' + esc(r.name || '') + '</td><td class="muted">' + esc(r.docNo || '') + '</td><td class="muted">' + esc(r.by || '') + '</td><td class="num">' + fmtCny(r.itw) + '</td><td class="num">' + fmtCny(r.od) + '</td><td class="muted">' + esc(r.note || '') + '</td></tr>').join('');
    return '<div class="muted" style="margin:6px 0 3px">🔍 解析诊断：识别为 <b>预算授予</b>，共 <b>' + rows.length + '</b> 行</div><div class="paste-preview"><table><tr><th>项目编码</th><th>名称</th><th>授予单号</th><th>授予人</th><th class="num">IT外包</th><th class="num">OD</th><th>备注</th></tr>' + rs + '</table></div>';
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
  if (!importCtx || !importCtx.files.length) { warn('请先添加文件'); return; }
  const bad = importCtx.files.find(f => f.error || !f.kind);
  if (bad) { warn('有文件未能识别，请先处理：\n' + (bad.error || bad.name + ' 未选择类型')); return; }
  const noProj = importCtx.files.find(f => f.kind === 'exec' && !(f.project || '').trim());
  if (noProj) { warn('执行表「' + noProj.name + '」还没有指定花钱项目——执行表没有项目列，请在文件旁填写它属于哪个花钱项目（子文件夹名）。'); return; }
  const noProjG = importCtx.files.find(f => f.kind === 'grants' && !(f.project || '').trim());
  if (noProjG) { warn('预算授予「' + noProjG.name + '」还没有指定花钱项目——预算授予是按花钱项目导出的，请在文件旁填写它属于哪个花钱项目。'); return; }
  const snapDate = ($('#snapDate') && $('#snapDate').value) || importCtx.snapDate || todayStr();
  const items = importCtx.files.map(f => ({ name: f.name, kind: f.kind, rows: f.rows, sheets: f.sheets, project: (f.project || '').trim(), snapDate }));
  const r = importParsed(items);
  if (r.touched) recordImportLog(calc());
  parseVerMark(r.kinds);   // 手动导入的数据是按当前规则解析的
  save(); closeModal();
  notify('导入完成：\n\n' + r.text + (r.touched ? '\n\n所有指标已自动重算。' : ''));
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
  const otPeople = Math.max(0, +m.otPeople || 0);                                   // 上线周周末加班的人数（按 1 倍单价计费）
  const otSkip = String(m.otSkip != null ? m.otSkip : '2,6').split(/[,，、\s]+/).filter(Boolean).map(Number);   // 没有上线的月份
  const festDef = (+m.festAttend > 0) ? +m.festAttend : 0.9;                        // 春节当月和 1 月的出勤系数（还没有实际数时用）
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
    return hit || r.proj || (projects.length === 1 ? projects[0] : '');
  };

  /* ---- 规划关联与汇总（预算来源视角：跨项目合并） ---- */
  // 一个编码可以对应多条规划（多对一，少量场景）：以系统里的预算项为计算和考核单位——金额相加，目标按金额加权（不考核的按 0 计）
  const tgtOf = p => (p && p.target != null) ? p.target : m.execRateTarget;
  const plansByCode = {};
  plansY.forEach(p => { if (p.code) (plansByCode[p.code] = plansByCode[p.code] || []).push(p); });
  const planOf = c => {
    const all = plansByCode[c] || [], live = all.filter(p => !p.dead);
    if (!live.length) return all[0] || null;   // 都失效了：按失效处理
    if (live.length === 1) return live[0];
    const amt = sum(live, p => wusdOf(p));
    return { id: live.map(p => p.id).join('+'), code: c, name: live.map(p => p.name).join(' + '), amountW: amt, target: amt > 0 ? sum(live, p => wusdOf(p) * tgtOf(p)) / amt : m.execRateTarget, plans: live, merged: true, dead: false, planProject: live[0].planProject || '' };
  };
  // 特殊项：平台上的两个固定项目——「不向变更项目申请预算，费用由PO受益部门承担」「费用先结算至PO受益部门…」
  //   本来就不关联规划，不是我的预算：不参与任何计算，也不报"未关联"
  const specialRows = snap ? Object.keys(snap.rows).filter(c => excl.indexOf(c) < 0 && SPECIAL_RE.test(snap.rows[c].name || '')).map(c => ({ code: c, name: snap.rows[c].name, itwAvail: snap.rows[c].itw.avail || 0, itwExec: snap.rows[c].itw.exec || 0, odAvail: snap.rows[c].od.avail || 0, odExec: snap.rows[c].od.exec || 0 })) : [];
  const specialSet = new Set(specialRows.map(x => x.code));
  const codes = snap ? Object.keys(snap.rows).filter(c => excl.indexOf(c) < 0 && !specialSet.has(c)) : [];
  const unmatched = codes.filter(c => !plansByCode[c]);
  const planCnyTotal = sum(plansY.filter(p => !p.dead), p => wusdOf(p) * 10000 * fx);
  let itwExec = 0, odExec = 0, availTotal = 0, itwFc = 0, remainTotal = 0, odRemainTotal = 0;
  const per = {};
  codes.forEach(c => {
    const r = snap.rows[c];
    const p = planOf(c);
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
  let weightedTarget = null;   // （tgtOf 已提前到 plansByCode 之前定义）
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
     团队配置（PO / OD 页签）= 常驻人员，现在在岗的。变动计划里有两种行：
       ① 填了「结束年月」= 临时人员：只在 [生效年月, 结束年月) 这一段里算，和页签无关（页签里不要列临时人员）
       ② 没填「结束年月」= 常驻人员的进出：用来还原过去月份的人数
            往将来看，加上"现在之后、该月及以前"生效的变动；往过去看，减去"该月之后、现在及以前"生效的变动
     生效年月 = 成本归属月（到岗的月份；离场填离场后的第一个月），按整月算。
     OD 扣减的滞后不在这里处理，由扣减日历决定用哪个月的人数（见下方 odDeduct）。 */
  const team = state.team || [];
  const plan = Array.isArray(state.teamPlan) ? state.teamPlan : [];
  const perms = plan.filter(p => !p.end);
  const temps = plan.filter(p => p.end);
  const poGroups = team.filter(g => g.kind === 'po');
  const odGroups = team.filter(g => g.kind === 'od');
  const hasPoCfg = poGroups.some(g => (g.headcount || 0) > 0) || plan.some(p => p.kind === 'po');
  const hasOdCfg = odGroups.some(g => (g.headcount || 0) > 0) || plan.some(p => p.kind === 'od');
  const attend = m.attendFactor != null ? m.attendFactor : 1;
  const ymOf = (yy, mo) => yy + '-' + String(mo).padStart(2, '0');
  const nowYm = todayStr().slice(0, 7);   // 团队配置反映的是"现在"的人数
  const ownerOf = p => team.find(g => g.kind === p.kind && g.rate === p.rate);   // 一条变动只落到同类型同单价的第一个组（两个组单价相同时不能重复计入）
  const deltaAt = (p, ym) => (p.ym <= ym && p.ym > nowYm) ? p.count : (p.ym > ym && p.ym <= nowYm) ? -p.count : 0;
  const hcAt = (g, yy, mo) => Math.max(0, (g.headcount || 0) + sum(perms.filter(p => ownerOf(p) === g), p => deltaAt(p, ymOf(yy, mo))));
  // 常驻变动里出现了、团队配置里却没有同单价组的：按净人数算一个虚拟组
  const virtualAt = (kind, yy, mo) => {
    const acc = {}, ym = ymOf(yy, mo);
    perms.filter(p => p.kind === kind && !ownerOf(p)).forEach(p => { acc[p.rate] = (acc[p.rate] || 0) + deltaAt(p, ym); });
    return Object.entries(acc).filter(([, c]) => c > 0).map(([rate, c]) => ({ rate: +rate, headcount: c }));
  };
  // 临时人员：生效年月 ≤ 该月 < 结束年月。PO 的临时人员带上「归属」（归哪张 PO），没填的并入"未标归属"
  const tempAt = (kind, yy, mo) => {
    const acc = {}, ym = ymOf(yy, mo);
    temps.filter(p => p.kind === kind && p.ym <= ym && ym < p.end).forEach(p => {
      const k = p.rate + '|' + (kind === 'po' ? (p.own || '') : '');
      acc[k] = acc[k] || { rate: p.rate, headcount: 0, own: kind === 'po' ? (p.own || '') : '' };
      acc[k].headcount += p.count;
    });
    return Object.values(acc).filter(x => x.headcount !== 0);
  };
  const poDailyAt = (yy, mo) => sum(poGroups, g => hcAt(g, yy, mo) * (g.rate || 0)) + sum(virtualAt('po', yy, mo), v => v.headcount * v.rate) + sum(tempAt('po', yy, mo), v => v.headcount * v.rate);
  const odCostAt = (yy, mo) => sum(odGroups, g => hcAt(g, yy, mo) * (g.rate || 0)) + sum(virtualAt('od', yy, mo), v => v.headcount * v.rate) + sum(tempAt('od', yy, mo), v => v.headcount * v.rate);
  const curMo = Math.max(Math.min(curM, 12), 1);
  const poDaily = hasPoCfg ? poDailyAt(Y, curMo) : 0;      // 现在的 PO 日额（含已生效的计划）
  const theoryOd = hasOdCfg ? odCostAt(Y, curMo) : 0;      // 现在的 OD 月额
  const theoryPo = mo => poDailyAt(Y, mo) * workdays(mo);   // 满勤时的月消耗（不含加班）
  // 按「PO归属」拆分某年月的 PO 日额（来自团队 Excel 的归属页签 / 归属列）；没标归属的并成一组
  const poSplit = (yy, mo) => {
    const acc = {};
    poGroups.forEach(g => { const h = hcAt(g, yy, mo); if (h > 0) { const k = g.poGroup || ''; acc[k] = acc[k] || { daily: 0, hc: 0 }; acc[k].daily += h * (g.rate || 0); acc[k].hc += h; } });
    virtualAt('po', yy, mo).forEach(v => { acc[''] = acc[''] || { daily: 0, hc: 0 }; acc[''].daily += v.headcount * v.rate; acc[''].hc += v.headcount; });
    tempAt('po', yy, mo).forEach(v => { const k = v.own || ''; acc[k] = acc[k] || { daily: 0, hc: 0 }; acc[k].daily += v.headcount * v.rate; acc[k].hc += v.headcount; });
    return Object.entries(acc).map(([label, x]) => ({ label, daily: x.daily, hc: x.hc })).sort((a, b) => b.daily - a.daily);
  };
  /* ---- PO：PO 级字段按 PO 编号只取一次；行级（月度执行/预测）相加 ----
     info: s=所属月（费用起始月）, E=已执行, C=所属月内的预测, B=超出所属月的预测 */
  const asOf = po ? po.asOf : 13;
  // 旧版本导入的 PO 明细：行里没有「费用结束时间」这个字段（导入时解析好才存下来的，更新看板不会自动重读文件）
  const poParsedOld = !!(po && (po.rows || []).some(r => !('endDate' in r)));
  const poList = po ? po.rows.filter(r => excl.indexOf(r.budgetCode) < 0 && !specialSet.has(r.budgetCode) && !exclPosSet.has(r.poNo)) : [];
  const poExcludedRows = po ? po.rows.filter(r => excl.indexOf(r.budgetCode) < 0 && exclPosSet.has(r.poNo)) : [];
  /* 剔除出决策的 PO（挂靠 / 非团队月度消耗）：花的是你的预算，但不属于 PO 团队的月度消耗——
     · 已执行额：计入执行率（平台口径）
     · 未关闭的、服务期内 当前月及以后 的预测：别的团队还会花掉的钱 → 计入对应预算来源的年底执行（和缺口），但不计入团队的 PO 需求、不抵"已下"
     · 服务期之外的预测：验收后返还，不参与年底的资金安排（保守） */
  const poExclActByCode = {}, poExclWillByCode = {}, poExclWillM = {}, poExclAgg = {};
  let poExclAct = 0, poExclWill = 0, poExclFrozen = 0;
  poExcludedRows.forEach(r => {
    const a = sum(Object.entries(r.months), ([mm, v]) => +mm < asOf ? v : 0);
    poExclActByCode[r.budgetCode] = (poExclActByCode[r.budgetCode] || 0) + a;
    poExclAct += a;
    const g = poExclAgg[r.poNo] = poExclAgg[r.poNo] || { poNo: r.poNo, resName: r.resName, open: r.status === 'OPEN', amount: 0, act: 0, will: 0, out: 0, start: r.startDate, end: r.endDate };
    g.act += a; g.amount = Math.max(g.amount, r.amount || 0); g.open = g.open || r.status === 'OPEN';
    if (!g.open) return;
    const own = poOwnMonths(r, asOf);
    Object.entries(r.months).forEach(([mm, v]) => {
      const mi = +mm;
      if (mi < asOf || !(v > 0)) return;
      if (own.has(mi)) { g.will += v; poExclWillByCode[r.budgetCode] = (poExclWillByCode[r.budgetCode] || 0) + v; poExclWillM[mi] = (poExclWillM[mi] || 0) + v; }
      else g.out += v;
    });
  });
  Object.values(poExclAgg).forEach(g => { if (g.open) poExclFrozen += g.amount > 0 ? Math.max(0, g.amount - g.act) : g.will + g.out; });   // 冻结按 PO 整张算（PO 金额每行重复，只取一次）
  Object.values(poExclAgg).forEach(g => { poExclWill += g.will; });
  const poMonthlyAct = {}, poMonthlyFc = {}, poActByCode = {};
  const byPo = {};         // PO 编号 → PO 级汇总
  const info = new Map();  // PO 行 → 拆分结果
  poList.forEach(r => {
    // 每行的预测（≥ 当前月）按 PO 的服务期分三类：
    //   cur = 当前月、在服务期内的预测：在执行，按团队当月需求拆成「将执行 / 多下」
    //   fut = 服务期内、当前月之后各月的预测：已提前下的，会在那个月执行
    //   B   = 服务期之外的预测：没花掉，验收后返还（往月 PO 的预测全在这一类）
    const own = poOwnMonths(r, asOf);
    if (!own.size) own.add(asOf);   // 费用起始缺失：按当月在执行处理
    const inf = { own, noStart: !r.startDate, E: 0, cur: 0, fut: 0, futM: {}, B: 0, w: 0, frozen: 0, refund: 0, willExec: 0 };
    Object.entries(r.months).forEach(([mm, v]) => {
      const mi = +mm;
      if (mi < asOf) { poMonthlyAct[mi] = (poMonthlyAct[mi] || 0) + v; poActByCode[r.budgetCode] = (poActByCode[r.budgetCode] || 0) + v; inf.E += v; }
      else {
        poMonthlyFc[mi] = (poMonthlyFc[mi] || 0) + v;
        if (mi === asOf && own.has(mi)) inf.cur += v;
        else if (own.has(mi)) { inf.fut += v; inf.futM[mi] = (inf.futM[mi] || 0) + v; }
        else inf.B += v;
      }
    });
    info.set(r, inf);
    const g = byPo[r.poNo] = byPo[r.poNo] || { poNo: r.poNo, resName: r.resName, status: r.status, startDate: r.startDate, endDate: r.endDate || '', amount: 0, E: 0, rows: [] };
    g.amount = Math.max(g.amount, r.amount || 0);   // PO 金额是 PO 口径（每行重复同一个数）→ 只取一次，不能相加
    g.E += inf.E; g.status = r.status;
    if (!g.startDate) g.startDate = r.startDate;
    if (!g.endDate) g.endDate = r.endDate || '';
    if (!g.resName) g.resName = r.resName;
    g.rows.push(r);
  });
  Object.values(byPo).forEach(g => {   // PO 级的服务期与所处阶段
    const ms = new Set();
    g.rows.forEach(r => { info.get(r).own.forEach(mo => ms.add(mo)); });
    g.own = Array.from(ms).sort((a, b) => a - b);
    g.mainM = g.own.length ? g.own[0] : asOf;   // 主月（台账标签、多下率用）
    g.phase = !g.own.length || g.mainM > asOf ? 'future' : (g.own.indexOf(asOf) >= 0 ? 'cur' : 'past');   // past=往月未关闭 cur=当月在执行 future=已提前下
    g.noEnd = g.rows.some(r => r.startDate && !poHasEnd(r));   // 结束时间读不到：服务期是按这张 PO 的月度金额推断的
  });
  // OD 月度历史（执行表快照差值）
  const odMonthly = {};
  let prevOd = 0, firstSnap = true;
  snaps.forEach(s => {
    const t = sum(Object.entries(s.rows), ([c, r]) => (excl.indexOf(c) < 0 && !specialSet.has(c)) ? (r.od.exec || 0) : 0);
    if (!firstSnap) {
      // 执行表口径是「1-上月执行」：M 月导入的快照，其相对上一份的增量实为 (M-1) 月执行
      let mo = +s.date.slice(5, 7) - 1;
      if (mo === 0) mo = 12;
      odMonthly[mo] = (odMonthly[mo] || 0) + (t - prevOd);
    }
    firstSnap = false; prevOd = t;
  });
  const normalAll = Object.entries(odMonthly).filter(([mo]) => +mo !== 6 && +mo !== 12).sort((a, b) => +a[0] - +b[0]);
  const normalDeltas = normalAll.slice(-3).map(([, v]) => v);
  // 无差值历史（仅一次导入）时：OD 累计执行 ÷ 已过月数（快照月-1，执行表口径为 1-上月）估算月均
  const odMonths = snaps.length ? Math.max(+(snaps[snaps.length - 1].date.slice(5, 7)) - 1, 1) : 1;
  const odAvg = normalDeltas.length ? sum(normalDeltas) / normalDeltas.length : (odExec > 0 ? odExec / odMonths : 0);

  /* ---- 团队需求：消耗 =（日额 × 工作日 + 上线周加班）× 出勤系数；建议金额 = 消耗 + 安全垫 ----
     没有团队配置时退回历史：近 3 月实际月均 × 按工作日折算（B 主 A 兜底）。
     · 加班：上线周的周末加一天，按 1 倍单价计费。每个月都上线，除了参数里填的月份（默认 2 月、6 月）。
       加班只能换调休（按小时记），所以它不改变全年的钱，只是把消耗在月份之间挪：加班的当月多花，调休的当月少花。
     · 出勤系数 = 实际 ÷（日额 × 工作日 + 加班），从已记全的月份反推。两种月份各记各的：
         平月（平时有事才休）                        → 最近 3 个已记全的平月（不够就往前一年找）
         春节当月和 1 月（调休到期，大家集中在过年前后休）→ 最近一个有数据的年份里的同类月份
       比值离 1 太远的不采用（多半是 PO 明细没导全、执行列没记全）：平月要在 0.7~1.3，过年月份缺勤本来就多、下限放到 0.5。
       不采用的退回参数里的出勤系数，首页提醒先核对数据。
     · 安全垫：出勤系数是从实际数反推的 → 半天日额；用的是参数里的值 → 一天日额 */
  const poHist = Object.entries(poMonthlyAct).filter(([mo, v]) => v > 0 && +mo < asOf).sort((a, b) => +a[0] - +b[0]);
  const poLast3 = poHist.slice(-3);
  const poAvg = poLast3.length ? sum(poLast3, ([, v]) => v) / poLast3.length : 0;
  const poAvgWd = poLast3.length ? sum(poLast3, ([mo]) => workdays(+mo)) / poLast3.length : workdays(Math.max(Math.min(curM, 12), 1));
  const otCost = (yy, mo) => {   // 这个月上线周加班的钱 = 加班人数 × 这个月的平均日单价（加班人数不超过当时 PO 团队的人数）
    if (!hasPoCfg || otPeople <= 0 || otSkip.indexOf(mo) >= 0) return 0;
    const hc = sum(poGroups, g => hcAt(g, yy, mo)) + sum(virtualAt('po', yy, mo), v => v.headcount) + sum(tempAt('po', yy, mo), v => v.headcount);
    return hc > 0 ? Math.min(otPeople, hc) / hc * poDailyAt(yy, mo) : 0;
  };
  const wdOf = (yy, mo) => { const v = ((((state.years || {})[yy] || {}).workdays) || {})[mo]; return (v != null && v !== '' && !Number.isNaN(+v)) ? +v : wdDefaultY(yy, mo); };   // 那一年那个月的工作日（含手工覆盖）
  const cnyMonth = yy => { const f = LUNAR_FEST[yy]; return f ? +String(f.cny).slice(0, 2) : 2; };   // 春节（正月初一）所在的月
  const isFest = (yy, mo) => mo === 1 || mo === cnyMonth(yy);            // 调休到期的 1 月 + 春节当月
  const basePo = (yy, mo) => poDailyAt(yy, mo) * wdOf(yy, mo) + otCost(yy, mo);   // 满勤时的月消耗
  const actOf = (yy, mo) => {   // 团队在某年某月的实际执行（PO 明细的月度执行列；往年按那一年自己的剔除名单）
    if (yy === Y) return poMonthlyAct[mo] || 0;
    const pd = (state.poDataByYear || {})[yy];
    if (!pd || !pd.rows || !(mo < (pd.asOf || 13))) return 0;
    const yp0 = yearParams(yy), exP = new Set((yp0.excludedPos || []).map(k => String(k).split('|')[0])), exC = yp0.excluded || [];
    return sum(pd.rows.filter(r => !exP.has(r.poNo) && exC.indexOf(r.budgetCode) < 0), r => +(r.months[mo] || 0));
  };
  const attOf = kind => {   // 一种月份的出勤系数 { months: 用了哪几个月, r: 实际 ÷ 理论, auto: 是不是从实际数反推的, v: 采用的值, bad: 有实际数但不可信 }
    const nMax = kind === 'normal' ? 3 : 12, mos = [];
    for (let yy = Y; yy >= Y - 3 && mos.length < nMax; yy--) {
      let found = 0;
      for (let mo = 12; mo >= 1 && mos.length < nMax; mo--) {
        if ((kind === 'normal') === isFest(yy, mo)) continue;
        if (yy === Y && mo >= asOf) continue;                 // 这个月还没记全
        const act = actOf(yy, mo), wd = wdOf(yy, mo), th = poDailyAt(yy, mo) * wd, ot = otCost(yy, mo), base = th + ot;
        if (!(act > 0) || !(base > 0)) continue;
        mos.push({ yy, mo, wd, th, ot, base, act }); found++;
      }
      if (found && kind === 'fest') break;                    // 春节当月和 1 月：只看最近一个有数据的年份（同一年的放在一起）
    }
    const act = sum(mos, x => x.act), base = sum(mos, x => x.base), r = base > 0 ? act / base : null;
    const ok = r != null && r >= (kind === 'normal' ? 0.7 : 0.5) && r <= 1.3;
    return { months: mos, r, auto: ok, v: ok ? r : (kind === 'normal' ? attend : festDef), bad: r != null && !ok };
  };
  const attN = attOf('normal'), attF = attOf('fest');
  const attendOf = (yy, mo) => isFest(yy, mo) ? attF : attN;
  const needPo = mo => hasPoCfg ? basePo(Y, mo) * attendOf(Y, mo).v : (poAvg > 0 && poAvgWd > 0 ? poAvg * workdays(mo) / poAvgWd : 0);   // 团队这个月的消耗（期望值，不含安全垫）
  const cushionPo = mo => hasPoCfg ? poDailyAt(Y, mo) * (attendOf(Y, mo).auto ? 0.5 : 1) : (poAvg > 0 && poAvgWd > 0 ? poAvg / poAvgWd * 0.5 : 0);   // 安全垫
  const advisePo = mo => needPo(mo) + cushionPo(mo);          // 建议下的金额
  const poDailyJan = hasPoCfg ? poDailyAt(Y + 1, 1) : 0;   // 明年 1 月的日额（含明年生效的计划）
  const cushionJan = hasPoCfg ? poDailyJan * (attendOf(Y + 1, 1).auto ? 0.5 : 1) : (poAvg > 0 && poAvgWd > 0 ? poAvg / poAvgWd * 0.5 : 0);
  const needJan = hasPoCfg ? basePo(Y + 1, 1) * attendOf(Y + 1, 1).v + cushionJan : (poAvg > 0 && poAvgWd > 0 ? poAvg * janWd / poAvgWd + cushionJan : 0);   // 1 月 PO 的建议金额（含安全垫）

  /* ---- 在途 PO：当前月的预测按团队当月需求拆成「将执行 / 多下」；服务期之外的预测全部算返还 ---- */
  const started = curM >= 1 && curM <= 12;
  const teamNeedAsOf = needPo(asOf);
  const curFc = sum(poList, r => info.get(r).cur);
  const kNeed = (curFc > 0 && teamNeedAsOf > 0) ? Math.min(1, teamNeedAsOf / curFc) : 1;   // 当月预测里会执行掉的比例
  Object.values(byPo).forEach(g => {
    g.cur = sum(g.rows, r => info.get(r).cur);
    g.fut = sum(g.rows, r => info.get(r).fut);
    g.B = sum(g.rows, r => info.get(r).B);
    g.willExec = g.cur * kNeed + g.fut;
    if (g.status !== 'OPEN') { g.frozen = 0; g.refund = 0; }
    else if (g.amount > 0) {
      g.frozen = Math.max(g.amount - g.E, 0); g.refund = Math.max(g.frozen - g.willExec, 0);
      if (g.E < 0.5 && g.cur + g.fut + g.B < 0.5 && g.mainM >= asOf) g.refund = 0;   // 认不出属于哪个月的 PO（见下面的 poNoFc）：不知道会不会执行，不算成会返还
    }
    else { g.frozen = g.cur + g.fut + g.B; g.refund = g.frozen - g.willExec; }   // 没有 PO 金额列时退回按预测估
    // 分到各行（= 各钱包）：将执行按当月预测比例 + 已提前下的；返还按「服务期外的预测 + 当月多下的部分」比例分
    const R = sum(g.rows, r => { const i = info.get(r); return i.B + i.cur * (1 - kNeed); });
    g.rows.forEach(r => {
      const i = info.get(r);
      i.willExec = i.cur * kNeed + i.fut;
      i.refund = g.status === 'OPEN' ? (R > 0 ? g.refund * (i.B + i.cur * (1 - kNeed)) / R : g.refund / g.rows.length) : 0;
      i.frozen = i.willExec + i.refund;
    });
    g.detail = g.rows.map(r => { const i = info.get(r); return { code: r.budgetCode, name: per[r.budgetCode] ? per[r.budgetCode].name : (r.budgetCode || '—'), proj: projOfRow(r), E: i.E, cur: i.cur, fut: i.fut, frozen: i.frozen, willExec: i.willExec, refund: i.refund }; });
  });
  // 有金额、服务期还没过，却没有任何月度执行 / 预测金额的 PO：认不出它属于哪个月，没法算成「已下」（多半是刚下的 PO 月度金额没填，或平台还没生成）
  const poNoFc = Object.values(byPo).filter(g => g.status === 'OPEN' && g.amount > 0 && g.E < 0.5 && g.cur + g.fut + g.B < 0.5 && g.mainM >= asOf)
    .map(g => ({ poNo: g.poNo, name: g.resName || '', amount: g.amount, start: g.startDate || '', end: g.endDate || '' }));
  let poFrozen = 0, poReturn = 0, openCnt = 0;
  Object.values(byPo).forEach(g => { if (g.status === 'OPEN') { openCnt++; poFrozen += g.frozen; poReturn += g.refund; } });
  const willExecByCode = {}, refundByCode = {}, issuedByMonth = {}, issuedPoList = [], wallets = {}, refundPastByCode = {}, refundPastW = {}, refundCurByCode = {}, refundCurW = {};
  poList.forEach(r => {
    const i = info.get(r), c = r.budgetCode, p = projOfRow(r), g = byPo[r.poNo];
    willExecByCode[c] = (willExecByCode[c] || 0) + i.willExec;
    refundByCode[c] = (refundByCode[c] || 0) + i.refund;
    Object.entries(i.futM).forEach(([mo, v]) => {   // 已提前下的（服务期在以后月份）；按 PO 记一份，决策卡上列出"已下"是哪几张
      issuedByMonth[mo] = (issuedByMonth[mo] || 0) + v;
      issuedPoList.push({ mo: +mo, poNo: g.poNo, name: g.resName, amt: v, start: g.startDate, end: g.endDate, code: c, proj: p });
    });
    const key = c + '|' + p;
    if (g.status === 'OPEN' && g.phase === 'past') { refundPastByCode[c] = (refundPastByCode[c] || 0) + i.refund; refundPastW[key] = (refundPastW[key] || 0) + i.refund; }   // 往月未关闭 PO 的返还额（按来源 / 钱包）
    if (g.status === 'OPEN' && g.phase === 'cur' && curM === 11) { refundCurByCode[c] = (refundCurByCode[c] || 0) + i.refund; refundCurW[key] = (refundCurW[key] || 0) + i.refund; }   // 11 月这张 PO 多下的部分：12 月下旬验收后返还，赶得上下 1 月的 PO
    const w = wallets[key] = wallets[key] || { key, code: c, proj: p, name: per[c] ? per[c].name : c, E: 0, frozen: 0, willExec: 0, refund: 0, pos: [] };
    w.E += i.E; w.frozen += i.frozen; w.willExec += i.willExec; w.refund += i.refund;
    if (g.status === 'OPEN' && i.frozen > 0) w.pos.push(g.poNo);
  });
  const curWillExec = curFc * kNeed;
  const curOver = Math.max(0, curFc - curWillExec);
  /* ---- OD 扣减估算：扣减日历 1月0 / 2–5月各扣上月 / 6月2（上半年清算）/ 7–11月各扣上月 / 12月≈bonusMonths（年终清算） ----
     有团队配置（或变动计划）时，每笔扣减按"费用所属月"的人数算，滞后自动体现：11 月底扣的是 10 月的人数×单价 */
  const odBase = hasOdCfg ? theoryOd : odAvg;
  const odMult = mo => mo === 1 ? 0 : mo === 6 ? 2 : mo === 12 ? (m.bonusMonths || 3.5) : 1;
  const odDeduct = mo => mo === 1 ? 0 : mo === 6 ? odCostAt(Y, 5) + odCostAt(Y, 6) : mo === 12 ? odCostAt(Y, 11) + odCostAt(Y, 12) + Math.max(0, (m.bonusMonths || 3.5) - 2) * odCostAt(Y, 12) : odCostAt(Y, mo - 1);
  // 这次扣减里"已约定的临时 OD"占多少：变动计划里带结束年月的 OD 人员。临时 OD 是前面月份看到总体执行率不够、
  // 找别的团队挂 OD 谈好的——说好了就是必须扣的，和常规 OD 一样是硬性支出（不是年底"有钱再补"的可选项）
  const odTempCost = (yy, mo) => sum(tempAt('od', yy, mo), v => v.headcount * v.rate);
  const odTempIn = {
    cost: mo => mo === 12 ? odTempCost(Y, 11) + odTempCost(Y, 12) * (1 + Math.max(0, (m.bonusMonths || 3.5) - 2)) : odTempCost(Y, mo - 1),
    hc: mo => mo === 12 ? sum(tempAt('od', Y, 12), v => v.headcount) : sum(tempAt('od', Y, mo - 1), v => v.headcount)
  };
  // 年终清算那一笔（12 月 31 日）：用户可以按自己的测算直接给一个总额——绩效、入职时间、临时 OD 等因素都算在里面（用户 2026-11-28）。
  // 填了就以它为准，平时每个月的扣减还是按配置算；清空就回到按人数测算。人数后来变了由用户自己改
  const odYE = +(m.odYearEnd || 0) > 0 ? +m.odYearEnd : 0;
  const odNeed = mo => (mo === 12 && odYE) ? odYE : (hasOdCfg ? odDeduct(mo) : odBase * odMult(mo));
  const odEst = {}, poEst = {};
  if (started) for (let mo = curM; mo <= 12; mo++) { odEst[mo] = odNeed(mo); poEst[mo] = mo === asOf ? curWillExec : (mo > asOf ? needPo(mo) : 0); }
  const odFuture = sum(Object.entries(odEst), ([mo, v]) => +mo >= curM ? v : 0);
  // 全年逐月的团队消耗（给"新年测算"用：不管现在是几月都按整年算；人数含变动计划和上线周加班，乘出勤系数）
  const yearCost = { po: [], od: [] };
  for (let mo = 1; mo <= 12; mo++) { yearCost.po.push(hasPoCfg ? basePo(Y, mo) * attendOf(Y, mo).v : 0); yearCost.od.push(hasOdCfg ? odNeed(mo) : 0); }
  const poFuture = sum(Object.values(poEst));

  /* ================= 年底推演：每个来源从现在推到 12/31，本月的指令是推演的第一步 =================
     优先级（用户 2026-11-25 定）：① 执行率（每个考核来源年底达标）→ ② OD 尽量只挂在一个花钱项目上 → ③ 1 月 PO 用达标之后剩下的钱 → ④ 花不掉
     团队的 PO 和配置里的 OD 都是硬性支出；推演决定的是 PO 从哪些钱包出、每个月底的 OD 挂在哪个项目、从哪些预算项出（规则见下方） */
  const srcRows = [];
  const blank = () => ({ used: 0, usedItw: {}, usedOd: {}, po: 0, poNext: 0, odExec: 0, odXfer: 0, jan: 0 });
  codes.forEach(c => {
    const s = per[c], p = s.plan;
    const assessed = !!(p && !p.dead && s.planCny > 0 && s.target > 0);
    const willExec = willExecByCode[c] || 0;
    const exclExec = poExclWillByCode[c] || 0;   // 剔除出决策的 PO 还会在这个来源上执行的（别人的团队在花，计入年底执行）
    const row = Object.assign({ code: c, name: p ? p.name : s.name, platName: s.name, plan: p, planCny: p && !p.dead ? s.planCny : null, target: p ? s.target : null, assessed, unmatched: !p, exec: s.exec, willExec, exclExec, refund: refundByCode[c] || 0, refundUsable: refundByCode[c] || 0,
      wallets: Object.keys(s.byProj).map(pk => ({ proj: pk, itw: s.byProj[pk].itwRemain, od: s.byProj[pk].odRemain })) }, blank());
    row.gap = assessed ? Math.max(0, s.planCny * s.target - s.exec - willExec - exclExec) : 0;
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
  // 今年能用上的返还额：往月未关闭 PO 的返还；年底（11、12 月）当月 PO 的返还要到明年才回来，不算
  srcRows.forEach(r => { r.refundUsable = curM >= 11 ? (refundPastByCode[r.code] || 0) : (refundByCode[r.code] || 0); });
  // 名字有两种：name = 年初规划里的名字（看执行率时用）；platName = IT 系统里的预算项名（下 PO、调拨、催 BA 时要在系统里对上的那个）。
  // 决策里一律用 decName（系统里的名字；还没到账的来源没有系统名，只能用规划名）；看执行率的地方用规划名，并标出系统里对应哪一项
  srcRows.forEach(r => { r.decName = r.platName || r.name; });
  /* ---- 推演的规则（用户 2026-11-25 定的优先级）----
     ① 执行率：每个考核来源年底达标（要求 100% 的花完）。所以 PO 和 OD 都先花还有缺口的来源，缺口补齐了才花别的来源；
        验收返还的钱只有 OD 这一条路（赶得上 12 月 31 日的年终清算），所以 OD 先花它
     ② OD 尽量只挂在一个花钱项目上（锚定项目，系统选）。为了让 OD 挂得进去，下 PO 时给锚定项目留出足够的 IT外包（预留）——
        但只在"剩下的缺口都能靠常规 OD 补上"时才守；补不上就有缺口的来源先动用预留（执行率优先），届时这部分 OD 挂到别的项目
     ③ 1 月 PO 用达标之后剩下的钱      ④ 花不掉的
     团队的 PO 和配置里的 OD 都是硬性支出，这里决定的是：PO 从哪些钱包出、每个月底的 OD 挂在哪个项目、从哪些预算项出。
     OD 不分临时还是常驻：写进配置的就是谈成了的，照配置扣；配置里没有的不替用户假设，只把缺口摆出来 */
  const anchorCfg = (m.odAnchor && typeof m.odAnchor === 'object') ? m.odAnchor : {};
  const projList = projects.length ? projects.slice() : [''];
  const odIn = pk => sum(codes, c => (per[c].byProj[pk] ? per[c].byProj[pk].odRemain : 0));
  const itwIn = pk => sum(codes, c => (per[c].byProj[pk] ? per[c].byProj[pk].itwRemain : 0));
  // 系统选的挂载项目：年终清算（12 月底那笔）挂在"只能靠 OD 花的钱"（有缺口的来源的验收返还）最多的项目；平时挂在 OD 额度最多的项目
  const refundGapIn = pk => sum(srcRows, r => r.gapLeft > 0.5 ? Math.min(r.gapLeft, (refundPastW[r.code + '|' + pk] || 0) + (refundCurW[r.code + '|' + pk] || 0)) : 0);
  const byQuota = projList.slice().sort((a, b) => (odIn(b) - odIn(a)) || (itwIn(b) - itwIn(a)))[0];
  const byRefund = projList.slice().sort((a, b) => (refundGapIn(b) - refundGapIn(a)) || (odIn(b) - odIn(a)) || (itwIn(b) - itwIn(a)))[0];
  const anchorOf = mo => { for (let x = mo; x >= 1; x--) if (anchorCfg[x]) return anchorCfg[x]; return mo === 12 ? byRefund : byQuota; };
  const reserve = {};   // 项目 → 给 OD 留出的 IT外包（= 挂在这个项目上的各月 OD 扣减 − 这个项目里已有的 OD 额度）
  if (started) for (let mo = curM; mo <= 12; mo++) { if (!odEst[mo]) continue; const a = anchorOf(mo); reserve[a] = (reserve[a] || 0) + odEst[mo]; }
  codes.forEach(c => Object.keys(per[c].byProj).forEach(pk => { if (reserve[pk] != null) reserve[pk] -= per[c].byProj[pk].odRemain; }));
  Object.keys(reserve).forEach(k => { reserve[k] = Math.max(0, reserve[k]); });
  // 每个项目的 OD 额度里，后面各次扣减用不到的富余部分：可以调回 IT外包 去下 PO（卡片上写明）；用得到的一律不动
  const odSpare = {};
  projList.forEach(pk => { odSpare[pk] = Math.max(0, odIn(pk) - (started ? sum(Array.from({ length: 13 - curM }, (_, i) => curM + i), mo => anchorOf(mo) === pk ? (odEst[mo] || 0) : 0) : 0)); });
  const odSpareLeft = Object.assign({}, odSpare);   // 被 PO 用掉后相应扣减
  const reserveLeft = Object.assign({}, reserve);   // OD 从这个项目的 IT外包 里花了钱之后相应扣减
  const refundUsed = {};   // 往月 PO 的返还额中已经被用掉的部分（钱包 key），避免同一笔返还被用两次
  const refundAvail = key => Math.max(0, (refundPastW[key] || 0) - (refundUsed[key] || 0));
  const refundCurUsed = {};   // 11 月这张 PO 多下的部分中已被用掉的（钱包 key）
  // 验收返还能不能用，看它什么时候到账、要花的钱什么时候花。花钱的先后是"PO 先、OD 后"（OD 月底才扣）：
  //   往月 PO 的返还 12 月 15 日前到账；11 月这张 PO 多下的部分 12 月下旬才到账——赶得上 12 月 31 日的年终清算和 12 月下旬下的 1 月 PO，但时间很紧；
  //   11 月底那笔扣减两笔都赶不上，只能用现有的 OD 额度和 IT外包；下 PO 只能用现在手里有的钱
  const refundCurAvail = key => curM === 11 ? Math.max(0, (refundCurW[key] || 0) - (refundCurUsed[key] || 0)) : 0;
  const refundAllAvail = key => refundAvail(key) + refundCurAvail(key);
  const useRefundKey = (key, amt) => {   // 先用往月 PO 的返还，再用 11 月 PO 的
    const g1 = Math.min(refundAvail(key), amt);
    if (g1 > 0) refundUsed[key] = (refundUsed[key] || 0) + g1;
    if (amt - g1 > 0) refundCurUsed[key] = (refundCurUsed[key] || 0) + (amt - g1);
  };
  const refundLeftC = r => sum(r.wallets, w => refundAllAvail(r.code + '|' + w.proj));   // 这个来源各钱包里还没用掉的返还额
  // 从某来源取钱给 PO：优先一个钱包取够；锚定项目之外的钱先用；IT外包剩余先用，不够再用 OD 额度（须先调回，且只用富余的部分）
  const itwAvail = (r, w) => Math.max(0, w.itw - (r.usedItw[w.proj] || 0));
  const odAvailOf = (r, w) => Math.max(0, w.od - (r.usedOd[w.proj] || 0));
  const projItwFree = pk => sum(srcRows, r => { const w = r.wallets.find(x => x.proj === pk); return w ? itwAvail(r, w) : 0; });
  const take = (r, amt, detail, po) => {
    let left = amt;
    const ups = detail ? detail.projs : null;
    const isAnch = w => !!(po && po.anchor != null && w.proj === po.anchor);
    // 锚定项目里还能给 PO 用的额度 = 该项目的 IT外包 剩余 − 给 OD 留的预留
    let anchorAllow = (po && po.anchor != null) ? Math.max(0, projItwFree(po.anchor) - (reserveLeft[po.anchor] || 0)) : Infinity;
    const itwCap = w => isAnch(w) ? (po.strict ? Math.min(itwAvail(r, w), anchorAllow) : itwAvail(r, w)) : itwAvail(r, w);
    const cap = w => itwCap(w) + (po ? Math.min(odAvailOf(r, w), odSpareLeft[w.proj] || 0) : odAvailOf(r, w));
    r.wallets.slice().sort((a, b) => (isAnch(a) - isAnch(b)) || ((cap(b) >= amt) - (cap(a) >= amt)) || ((ups && ups.has(b.proj) ? 1 : 0) - (ups && ups.has(a.proj) ? 1 : 0)) || (cap(b) - cap(a))).forEach(w => {
      if (left <= 0) return;
      const c = cap(w);
      if (c <= 0.5) return;
      const g = Math.min(c, left);
      const gi = Math.min(itwCap(w), g), go = g - gi;
      let fromReserve = 0;
      if (isAnch(w) && gi > 0) { fromReserve = Math.max(0, gi - anchorAllow); anchorAllow -= gi; }
      r.usedItw[w.proj] = (r.usedItw[w.proj] || 0) + gi; r.usedOd[w.proj] = (r.usedOd[w.proj] || 0) + go; r.used += g; left -= g;
      if (go > 0 && po) odSpareLeft[w.proj] = Math.max(0, (odSpareLeft[w.proj] || 0) - go);   // 富余额度是按项目算的，各来源合起来不能超过
      if (detail) { ups.add(w.proj); detail.items.push({ code: r.code, name: r.decName, proj: w.proj, amt: g, odBack: go, fromReserve }); }
    });
    return amt - left;
  };
  const itwFree = (r, pk) => { const w = r.wallets.find(x => x.proj === pk); return w ? Math.max(0, w.itw - (r.usedItw[pk] || 0)) : 0; };
  const poMonths = [];
  const nextDetail = { projs: new Set(), items: [] };
  // 当月的团队 PO（下个月的）：先花还有缺口的来源（缺口大的优先），缺口都补到了才花别的来源（余量大的优先）。
  // 先不动锚定项目里留给 OD 的钱——但只在这剩余的缺口都能靠常规 OD 补上时才守；
  // 补不上就有缺口的来源先动用这笔预留（执行率优先），届时那笔 OD 再挂到别的项目
  const allocPoMonth = (mo, det) => {
    const issued0 = issuedByMonth[mo] || 0, short0 = Math.max(0, needPo(mo) - issued0);
    // 已经下了一部分时：连团队的消耗都不够才要补（补到建议金额）；够消耗、只差安全垫的不用补。
    // 用户 2026-11-28：按之前的测算把 12 月的 PO 下了，数据更新后建议金额略有变化，系统不要再叫他下
    const pm = { mo, theory: needPo(mo), issued: issued0, short: short0, need: issued0 > 0.5 ? (short0 > 500 ? Math.max(0, advisePo(mo) - issued0) : 0) : advisePo(mo), funded: 0, tookReserve: 0, keptReserve: true };   // 还要下的金额（没下过时含安全垫）
    poMonths.push(pm);
    const po = { anchor: anchorOf(mo), strict: true };
    let left = pm.need;
    const n0 = det ? det.items.length : 0;
    const gapRound = () => {
      po.strict = true;
      srcRows.filter(r => r.gapLeft > 0.5 && r.funds - r.used > 0.5).sort((a, b) => b.gapLeft - a.gapLeft).forEach(r => {
        if (left <= 0.5) return;
        const got = take(r, Math.min(r.gapLeft, r.funds - r.used, left), det, po);
        r.po += got; r.gapLeft -= got; left -= got; if (det) r.poNext += got;
      });
    };
    const freeRound = strict => {
      po.strict = strict;
      srcRows.filter(r => r.funds - r.used > 0.5).sort((a, b) => (b.funds - b.used) - (a.funds - a.used)).forEach(r => {
        if (left <= 0.5) return;
        const got = take(r, Math.min(r.funds - r.used, left), det, po);
        r.po += got; left -= got; if (det) r.poNext += got;
      });
    };
    const reserveRound = () => {   // 有缺口的来源动用锚定项目的预留
      po.strict = false;
      srcRows.filter(r => r.gapLeft > 0.5 && r.funds - r.used > 0.5).sort((a, b) => b.gapLeft - a.gapLeft).forEach(r => {
        if (left <= 0.5) return;
        const got = take(r, Math.min(r.gapLeft, r.funds - r.used, left), det, po);
        r.po += got; r.gapLeft -= got; left -= got; if (det) r.poNext += got;
      });
    };
    gapRound();
    // 剩下的缺口靠常规 OD 补得上吗：OD 的钱够（从这次扣减到年底的常规扣减 ≥ 剩下的缺口），且这些来源手里得有钱（可支配 + 返还）
    const gapCap = sum(srcRows.filter(r => r.gapLeft > 0.5), r => Math.min(r.gapLeft, r.funds - r.used + refundLeftC(r)));
    pm.keptReserve = gapCap <= odFuture;
    if (pm.keptReserve) { freeRound(true); reserveRound(); } else { reserveRound(); freeRound(true); }
    freeRound(false);
    pm.funded = pm.need - left;
    if (det) pm.tookReserve = sum(det.items.slice(n0), x => x.fromReserve || 0);   // 动用了锚定项目预留的部分
  };
  // 月底的 OD 扣减：挂在锚定项目，从这些预算项出。顺序就是优先级——
  //   ① 先花还有缺口的来源（缺口大的优先）：年底时先用早到的验收返还（它只有 OD 这一条路），再用已有的 OD 额度，再从 IT外包 调拨，
  //      最后才用 11 月 PO 多下的那部分返还（12 月下旬才到账，时间很紧）；
  //      锚定项目里不够，再去别的项目找有缺口的来源——这部分 OD 就挂在那个项目上
  //   ② 有缺口的来源都补到了（或没钱可补），才花没缺口的来源：先不考核、没关联规划的，再按余量从大到小；同样先锚定项目、后别的项目
  //   最后还没着落的 = 没有钱扣
  const odPlan = (amount, anchor, mo) => {
    let left = amount;
    const res = { amount, anchor, used: [], xfer: [], refund: [], left: 0, other: 0, refundPast: 0, refundCur: 0, byProj: {} };
    const gapList = () => srcRows.filter(r => r.gapLeft > 0.5).sort((a, b) => b.gapLeft - a.gapLeft);
    const freeList = () => srcRows.slice().sort((a, b) => (a.assessed ? 1 : 0) - (b.assessed ? 1 : 0) || (b.funds - b.used) - (a.funds - a.used));
    const one = (r, pk, gapOnly, stage) => {   // 从某来源在这个项目里的钱包出钱，分三步：① 早到的返还（年底）和 OD 额度 ② 从 IT外包 调拨 ③ 11 月 PO 的返还（年底）
      const w = r.wallets.find(x => x.proj === pk);
      if (!w || left <= 0.5) return;
      const book = (kind, g, extra, fromFunds) => {   // fromFunds：这笔钱是不是从现在可支配（r.funds）里出的；返还是后到账的钱，不在 r.funds 里
        left -= g; r.gapLeft = Math.max(0, r.gapLeft - g); r.odExec += g; if (fromFunds) r.used += g;
        res[kind].push(Object.assign({ code: r.code, name: r.decName, proj: pk, amt: g }, extra || {}));
        res.byProj[pk] = (res.byProj[pk] || 0) + g;
        if (pk !== anchor) res.other += g;
      };
      const useRef = useCur => {   // 年终清算赶得上的验收返还：先用往月 PO 的（12 月 15 日前到账）；11 月 PO 多下的部分 12 月下旬才到，排在最后——时间很紧，能不等就不等
        if (mo !== 12 || stage !== (useCur ? 3 : 1)) return;
        const key = r.code + '|' + pk, avail = useCur ? refundCurAvail(key) : refundAvail(key), cap = Math.min(avail, gapOnly ? r.gapLeft : left, left);
        if (cap <= 0.5) return;
        useRefundKey(key, cap);
        if (useCur) res.refundCur += cap; else res.refundPast += cap;
        reserveLeft[pk] = Math.max(0, (reserveLeft[pk] || 0) - cap);   // 返还的钱顶掉了一部分要从 IT外包 调的
        book('refund', cap, { past: useCur ? 0 : cap, cur: useCur ? cap : 0 }, false);
      };
      useRef(false);
      const q = stage === 1 ? Math.min(odAvailOf(r, w), gapOnly ? r.gapLeft : left, left) : 0;
      if (q > 0.5) { r.usedOd[pk] = (r.usedOd[pk] || 0) + q; book('used', q, null, true); }
      const g = stage === 2 ? Math.min(itwFree(r, pk), gapOnly ? r.gapLeft : left, left) : 0;
      if (g > 0.5) {
        r.usedItw[pk] = (r.usedItw[pk] || 0) + g;
        reserveLeft[pk] = Math.max(0, (reserveLeft[pk] || 0) - g);
        r.odXfer += g; book('xfer', g, null, true);
      }
      useRef(true);
    };
    const run = (pk, gapOnly) => gapOnly
      ? gapList().forEach(r => [1, 2, 3].forEach(st => { if (left > 0.5) one(r, pk, true, st); }))        // 有缺口的来源：一个来源把三步走完再换下一个（缺口大的优先）
      : [1, 2, 3].forEach(st => { if (left > 0.5) freeList().forEach(r => one(r, pk, false, st)); });   // 没缺口的来源：先把不用调拨的（OD 额度）用完，再动 IT外包
    run(anchor, true);
    // 别的项目里还缺口的来源有钱：这部分 OD 挂到那个项目（执行率优先于"只挂一个项目"，金额再小也用）。
    // 只剩零头以内差距的来源不算——它本来就按达标算，不值得为此多挂一个项目
    const tolOf = r => Math.min(3000, (r.planCny || 0) * 0.005);
    const gapPot = pk => sum(srcRows.filter(r => r.gapLeft > tolOf(r)), r => { const w = r.wallets.find(x => x.proj === pk); if (!w) return 0; return Math.min(r.gapLeft, (mo === 12 ? refundAllAvail(r.code + '|' + pk) : 0) + odAvailOf(r, w) + itwFree(r, pk)); });
    let otherGap = 0;   // 挂到别的项目上的部分里，为还缺口的来源出的（其余是因为挂在的那个项目里的钱不够）
    if (left > 0.5) projList.filter(pk => pk !== anchor && gapPot(pk) > 0.5).sort((a, b) => gapPot(b) - gapPot(a)).forEach(pk => { const l0 = left; run(pk, true); otherGap += l0 - left; });
    if (left > 0.5) run(anchor, false);
    if (left > 0.5) projList.forEach(pk => { if (pk !== anchor) run(pk, false); });
    res.left = Math.max(0, left); res.otherGap = otherGap;
    return res;
  };
  // 提醒窗口（按扣减所在月）：1–4 月 → 5 月底；5–6 月 → 6 月底；7–10 月 → 10 月底；11–12 月 → 年底
  const winEndOf = mo => mo <= 4 ? 5 : mo <= 6 ? 6 : mo <= 10 ? 10 : 12;
  // 钱严格按月排：每个月先排「下月的团队 PO」（20 号前后下单），再排「当月月底的 OD 扣减」
  const odLog = [];        // {mo, kind: used|xfer|refund, code, name, proj, amt, past?, cur?}
  const odPlans = [];      // 每个月底那笔扣减怎么挂、从哪些预算项出
  let odUnfunded = 0;
  const allocOdMonth = mo => {
    if (!odEst[mo]) return;
    const plan = odPlan(odEst[mo], anchorOf(mo), mo);
    ['used', 'xfer', 'refund'].forEach(kind => plan[kind].forEach(x => odLog.push(Object.assign({ mo, kind }, x))));
    odUnfunded += plan.left;
    const inA = kind => sum(plan[kind].filter(x => x.proj === plan.anchor), x => x.amt);
    odPlans.push({
      mo, need: odEst[mo], anchor: plan.anchor,
      usedAnchor: inA('used'), usedAll: sum(plan.used, x => x.amt), xferAnchor: inA('xfer'), xferAll: sum(plan.xfer, x => x.amt), refund: plan.refundPast + plan.refundCur, refundPast: plan.refundPast, refundCur: plan.refundCur,
      xferWallets: plan.xfer.filter(x => x.proj === plan.anchor),
      otherProj: projList.filter(pk => pk !== plan.anchor && (plan.byProj[pk] || 0) > 0.5).map(pk => ({ proj: pk, amt: plan.byProj[pk] })),   // 挂到别的项目上的部分
      refundOutside: plan.refund.filter(x => x.proj !== plan.anchor),
      other: plan.other, otherGap: plan.otherGap, left: plan.left,
      temp: hasOdCfg ? odTempIn.cost(mo) : 0, tempHc: hasOdCfg ? odTempIn.hc(mo) : 0   // 其中配置里的临时 OD（金额、12 月的在岗人数）
    });
  };
  if (started) for (let mo = curM; mo <= 12; mo++) { if (mo < 12) allocPoMonth(mo + 1, mo === curM ? nextDetail : null); allocOdMonth(mo); }
  const odWinEnd = winEndOf(Math.max(curM, 1));
  const odWinNeed = started ? sum(Object.entries(odEst), ([mo, v]) => +mo <= odWinEnd ? v : 0) : 0;
  // 1 月 PO：用达标之后剩下的钱（只认 IT外包 剩余，OD 额度要先调回）；不够再用验收返还
  const janItems = [];
  let janReserve = 0, janFromRefund = 0, janOdBack = 0, janFromCur = 0;
  if (curM >= 11) {
    let left = needJan;
    srcRows.slice().sort((a, b) => sum(b.wallets, w => Math.max(0, w.itw - (b.usedItw[w.proj] || 0))) - sum(a.wallets, w => Math.max(0, w.itw - (a.usedItw[w.proj] || 0)))).forEach(r => r.wallets.forEach(w => {
      if (left <= 0) return;
      const g = Math.min(Math.max(0, w.itw - (r.usedItw[w.proj] || 0)), left);
      if (g <= 0) return;
      r.usedItw[w.proj] = (r.usedItw[w.proj] || 0) + g; r.used += g; r.jan += g; left -= g;
      janItems.push({ code: r.code, name: r.decName, proj: w.proj, amt: g });
    }));
    srcRows.forEach(r => r.wallets.forEach(w => {   // 仍然不够：年底清算后用不上的 OD 额度也调回 IT外包（下 PO 前要调，卡片上标明）
      if (left <= 0) return;
      const g = Math.min(left, odAvailOf(r, w));
      if (g <= 0) return;
      r.usedOd[w.proj] = (r.usedOd[w.proj] || 0) + g; r.used += g; left -= g; janOdBack += g; r.jan += g;
      janItems.push({ code: r.code, name: r.decName, proj: w.proj, amt: g, odBack: g });
    }));
    srcRows.forEach(r => r.wallets.forEach(w => {   // 仍然不够：用验收返还的钱（先用往月 PO 的，再用 11 月 PO 多下的部分）
      if (left <= 0) return;
      const key = r.code + '|' + w.proj, g = Math.min(left, refundAllAvail(key));
      if (g <= 0) return;
      const g1 = Math.min(refundAvail(key), g);
      useRefundKey(key, g);
      left -= g; janFromRefund += g1; janFromCur += g - g1; r.jan += g;
      janItems.push({ code: r.code, name: r.decName, proj: w.proj, amt: g, fromRef: g1 > 0.5, fromCur: g - g1 > 0.5 });
    }));
    janReserve = needJan - left;
  }
  srcRows.forEach(r => {
    r.endExec = r.exec + r.willExec + (r.exclExec || 0) + r.po + r.odExec;            // 年底预计执行（含剔除出决策的 PO 还会执行的）
    r.rate = r.planCny ? r.endExec / r.planCny : null;
    r.tol = Math.min(3000, (r.planCny || 0) * 0.005);             // 零头：规划 0.5% 以内且不超过 ¥3,000
    r.hit = r.assessed ? r.endExec >= r.planCny * r.target - r.tol : true;          // 按配置里的安排，年底达不达标
    r.short = r.assessed ? Math.max(0, r.planCny * r.target - r.endExec) : 0;       // 年底还差多少
    r.left = r.funds - r.used;
    // 还差的钱里，这个来源手里还有多少（没花掉的钱 + 没用掉的返还）：这些钱只能靠再挂 OD 花掉；一分不剩才是真的钱不够
    r.odAble = r.assessed && !r.hit ? Math.min(r.short, r.left + refundLeftC(r)) : 0;
  });
  const odAvgRate = hasOdCfg ? theoryOd / Math.max(sum(odGroups, g => hcAt(g, Y, curMo)) + sum(virtualAt('od', Y, curMo), v => v.headcount), 1) : (odAvg || 0);   // 一个人一个月的 OD 成本
  // 达标缺口：按配置里的安排到年底还差多少。系统不替用户假设还会再挂 OD，只把缺口和"钱在哪"摆出来
  const shortList = srcRows.filter(r => r.assessed && !r.hit).map(r => ({ code: r.code, name: r.decName, planName: r.name, short: r.short, odAble: r.odAble, people: Math.ceil(r.odAble / Math.max(odAvgRate, 1)), jan: r.jan, wallets: r.wallets.map(w => ({ proj: w.proj, left: Math.max(0, (w.itw + w.od) - (r.usedItw[w.proj] || 0) - (r.usedOd[w.proj] || 0)), refund: Math.min(refundAllAvail(r.code + '|' + w.proj), r.odAble) })).filter(w => w.left > 500 || w.refund > 500) }));
  const shortTotal = sum(shortList, x => x.short), shortAble = sum(shortList, x => x.odAble);
  // 缺口要是靠再挂 OD 补上，会占掉多少本来留给 1 月的钱
  const janAfterFill = janReserve - sum(shortList, x => Math.min(x.jan, x.odAble));

  /* ---- 年底资金安排（11、12 月）：把从现在到明年 1 月的每一笔钱按排钱的先后摆在一起 ----
     每个钱包一行：现在可用 → 验收返还到账 → 12 月 PO / OD / 1 月 PO → 年底剩余。
     留给 1 月的钱 = 各来源达标之后的结余；理论上限 = 每个考核来源"恰好达标"时剩下的钱 + 不考核/未关联来源剩下的钱 */
  const yearPlan = (() => {
    if (curM < 11) return null;
    const wAll = {};
    const wOf = (code, proj) => { const k = code + '|' + proj; return wAll[k] = wAll[k] || { key: k, code, proj, now: 0, refundPast: refundPastW[k] || 0, refundCur: refundCurW[k] || 0, po: 0, odCur: 0, odDec: 0, jan: 0, janRef: 0, left: 0 }; };
    srcRows.forEach(r => r.wallets.forEach(w => {
      const k = r.code + '|' + w.proj, o = wOf(r.code, w.proj);
      o.now += w.itw + w.od;
      o.left += Math.max(0, w.itw + w.od - (r.usedItw[w.proj] || 0) - (r.usedOd[w.proj] || 0)) + Math.max(0, (refundPastW[k] || 0) - (refundUsed[k] || 0)) + Math.max(0, (refundCurW[k] || 0) - (refundCurUsed[k] || 0));   // 年底剩余 = 没花掉的 + 到账后没用掉的返还
    }));
    if (curM === 11) nextDetail.items.forEach(x => { wOf(x.code, x.proj).po += x.amt; });
    odLog.forEach(x => { if (x.mo === curM) wOf(x.code, x.proj).odCur += x.amt; else if (x.mo === 12) wOf(x.code, x.proj).odDec += x.amt; });
    janItems.forEach(x => { const o = wOf(x.code, x.proj); o.jan += x.amt; if (x.fromRef || x.fromCur) o.janRef += x.amt; });
    let janMax = 0, beyond = 0;
    srcRows.forEach(r => {
      const refunds = (r.refundUsable || 0) + (refundCurByCode[r.code] || 0);
      const potential = r.exec + r.willExec + (r.exclExec || 0) + r.funds + refunds;   // 这个来源今年一共能动的钱（已执行 + 在途将执行 + 现在可用 + 返还）
      if (r.assessed) { janMax += Math.max(0, potential - r.planCny * r.target); beyond += Math.max(0, r.endExec - r.planCny * r.target); }   // beyond = 超出目标的执行（占用了本可以留给 1 月的钱）
      else janMax += r.funds + refunds;
    });
    // 已经下了的 12 月 PO：钱已经冻结，不在各钱包的「现在可用」里；按钱包记一份（年底测算、资金安排要用）
    const isW = {};
    issuedPoList.forEach(x => { if (x.mo === 12) isW[x.code + '|' + x.proj] = (isW[x.code + '|' + x.proj] || 0) + x.amt; });
    const wList = Object.values(wAll);
    wList.forEach(o => { o.poIssued = isW[o.key] || 0; });
    const curOdP = odPlans.find(x => x.mo === curM) || null, decOdP = curM === 11 ? (odPlans.find(x => x.mo === 12) || null) : null;
    const poWillDec = (asOf >= 12 && started) ? curWillExec : (issuedByMonth[12] || 0);   // 12 月看：当月在执行的 PO 将执行的部分
    const poIssued = curM === 11 ? (issuedByMonth[12] || 0) : (curM === 12 ? poWillDec : 0);   // 12 月 PO 里钱已经冻结的部分
    const poWill = curM === 11 ? poIssued + (poMonths.length ? poMonths[0].need : 0) : poWillDec;   // 12 月的 PO 到年底将执行多少 = 已下的 + 还要下的
    const odRefund = (curOdP ? curOdP.refund : 0) + (decOdP ? decOdP.refund : 0);   // 到年底的 OD 扣减里花掉的验收返还
    const janRefund = janFromRefund + janFromCur;                                      // 1 月 PO 里用的验收返还
    return {
      wallets: wList, janMax, beyond,
      curOd: curOdP, decOd: decOdP,
      refundPast: sum(Object.values(refundPastW)), refundCur: sum(Object.values(refundCurW)), have: sum(srcRows, r => r.funds),
      poNext: curM === 11 && poMonths.length ? poMonths[0].need : 0,
      poIssued, poWill,
      rest: { odCur: odEst[curM] || 0, odDec: odEst[12] || 0, po: poWill, total: poWill + odFuture },   // 到年底还要花多少（按现在的情况）
      refund: { od: odRefund, jan: janRefund, idle: Math.max(0, sum(Object.values(refundPastW)) + sum(Object.values(refundCurW)) - odRefund - janRefund) },   // 返还的钱：OD 花掉多少、1 月 PO 用多少、连 1 月也用不上多少
      leftTotal: sum(wList, w => w.jan + w.left)   // 年底结算后手里还剩多少 = 留给 1 月 PO 的 + 没安排用途的（含到账后没用掉的返还）
    };
  })();
  const forecastEnd = sum(srcRows, r => r.endExec);
  const forecastRate = planCnyTotal > 0 ? forecastEnd / planCnyTotal : null;
  const assessedN = srcRows.filter(r => r.assessed).length;
  const hitN = srcRows.filter(r => r.assessed && r.hit).length;

  const unspent = Math.max(0, sum(srcRows, r => r.left));

  /* ---- 钱够不够：按到账时间逐笔看。在途冻结的钱算进来，但按它回来的时间——
     现在可支配 →（每个月）下下月的 PO（20 号前后下单，只能用当时手里有的钱）→ 月底的 OD 扣减 → 返还到账
     往月 PO 的冻结：平时下个月就回来；年底按 12 月 15 日前到账。11 月这张 PO 多下的部分 12 月下旬才回来（赶得上 12/31 的清算，时间很紧）。
     剔除出决策的 PO 的冻结不算（默认别的团队会花掉）。1 月 PO 是最后的优先级，不在这里算，另见「1 月 PO 缺口」
     每笔标 near（这个月、下个月的，到下下月下 PO 为止）：这两个月里钱就不够的是眼下的风险，催 BA 的依据之一 ---- */
  const S = sum(srcRows, r => r.funds), P = sum(poMonths, p => p.need), D = odFuture;
  const cash = { start: S, events: [], short: null, shortNear: null, refundPast: sum(Object.values(refundPastW)), refundCur: sum(Object.values(refundCurW)) };
  if (started) {
    let avail = S;
    const ev = (when, label, out, inn, note, near) => {
      avail += inn - out;
      cash.events.push({ when, label, out, inn, avail, near: !!near, note: note || '' });
      if (avail < -500) { const sh = { when, label, short: -avail, near: !!near }; if (!cash.short) cash.short = sh; if (near && !cash.shortNear) cash.shortNear = sh; }
    };
    for (let mo = curM; mo <= 12; mo++) {
      const near = mo <= curM + 1;
      if (mo <= 11) { const pm = poMonths.find(p => p.mo === mo + 1); if (pm && pm.need > 0.5) ev(mo === curM && now.getDate() > 20 ? '尽快' : mo + '-20 前', (pm.issued > 0.5 ? '补 ' : '下 ') + (mo + 1) + ' 月 PO', pm.need, 0, '', near); }
      if (curM >= 11) {
        if (mo === 11) ev('11-30', '11 月底的 OD 扣减', odEst[mo] || 0, 0, '', near);
        if (mo === 12) {
          if (cash.refundPast > 0.5) ev('12-15 前', '往月 PO 验收，冻结的钱返还', 0, cash.refundPast, '在途冻结', near);
          if (cash.refundCur > 0.5) ev('12 月下旬', '11 月 PO 多下的部分验收返还', 0, cash.refundCur, '在途冻结 · 时间很紧', near);
          ev('12-31', '年终清算', odEst[mo] || 0, 0, '', near);
        }
      } else {
        if ((odEst[mo] || 0) > 0.5) ev(mo + ' 月底', mo + ' 月底的 OD 扣减', odEst[mo], 0, '', near);
        if (mo === curM && cash.refundPast > 0.5) ev((mo + 1) + ' 月', '往月 PO 验收，冻结的钱返还', 0, cash.refundPast, '在途冻结', near);
        if (mo === curM + 1 && cash.refundCur > 0.5) ev((mo + 1) + ' 月', curM + ' 月这张 PO 多下的部分返还', 0, cash.refundCur, '在途冻结', near);
      }
    }
  }
  const fund = { total: S, poNeed: P, odNeed: D, short: cash.short ? cash.short.short : 0, when: cash.short ? cash.short.when : '', cash };   // short：按到账时间算，第一个不够的时间点差多少

  /* ---- 到账（按规划看）。已到账 = 往年结转 + 本年度授予——执行表的「可用预算」就是这两列相加；结转被收回时平台上这个数会变小，下次导入自动体现。
         未到账 = 规划金额 − 已到账。这是催 BA 的唯一依据：「已规划、还没申请到账的钱」。
         PO 冻结的钱是已经到账的，只是被冻住了，归「催验收」——和催 BA 是两件事。
         多条规划挂同一个 IT 预算项时，钱在平台上是合在一起的：合计按 IT 预算项算；要分到每条规划，只能靠平台授予流水（授予单号）里的「归哪条规划」 ---- */
  const flowRows = {};
  Object.values((state.grantData || {}).byProject || {}).forEach(g => (g.rows || []).forEach(r => { if (r.code) (flowRows[r.code] = flowRows[r.code] || []).push(r); }));
  const gAttr = state.grantAttr || {};
  const planGrant = {};      // 规划 id → { got 已到账, plan 规划金额, un 未到账, tol 零头, split 能不能按规划拆, noAttr 这一项里还没选归属的授予 }
  const noAttrByCode = {};   // IT 预算项 → 授予流水里还没选「归哪条规划」的金额
  const livePlans = plansY.filter(p => !p.dead && wusdOf(p) > 0);
  livePlans.forEach(p => {
    const pc = wusdOf(p) * 10000 * fx, skip = !!(p.code && excl.indexOf(p.code) >= 0), s = (p.code && !skip) ? per[p.code] : null;
    const mates = p.code ? livePlans.filter(q => q.code === p.code) : [];
    planGrant[p.id] = { got: s ? Math.min(s.avail, pc) : 0, plan: pc, un: s ? Math.max(0, pc - s.avail) : pc, tol: Math.min(3000, pc * 0.005),
      split: mates.length <= 1 || !!(flowRows[p.code] || []).length, noAttr: 0 };
  });
  Object.keys(flowRows).forEach(code => {   // 多对一：按授予流水里的归属分到每条规划
    const ps = livePlans.filter(q => q.code === code);
    if (ps.length <= 1) return;
    ps.forEach(q => { planGrant[q.id].got = 0; });
    flowRows[code].forEach(r => {
      const amt = r.total || ((r.itw || 0) + (r.od || 0)), g = planGrant[gAttr[r.docNo + '|' + code]];
      if (g) g.got += amt; else noAttrByCode[code] = (noAttrByCode[code] || 0) + amt;
    });
    ps.forEach(q => { const g = planGrant[q.id]; g.got = Math.min(g.got, g.plan); g.un = Math.max(0, g.plan - g.got); g.noAttr = noAttrByCode[code] || 0; });
  });
  const baUnits = [];        // 催 BA 的单位：一条规划独占一个 IT 预算项 → 这条规划；多条共用 → 这个 IT 预算项（钱是合在一起的）
  const seenCode = {};
  livePlans.forEach(p => {
    if (p.code && (seenCode[p.code] || excl.indexOf(p.code) >= 0)) return;
    if (p.code) seenCode[p.code] = 1;
    const s = p.code ? per[p.code] : null, group = p.code ? livePlans.filter(q => q.code === p.code) : [p];
    const plan = sum(group, q => planGrant[q.id].plan), got = s ? Math.min(s.avail, plan) : 0;
    baUnits.push({ code: p.code || '', name: group.length > 1 ? (s ? s.name : p.name) : p.name, plans: group, plan, got, un: Math.max(0, plan - got), tol: Math.min(3000, plan * 0.005), shared: group.length > 1, onPlat: !!s });
  });
  // 催 BA 的待办只在两种情况下出现（用户 2026-11-25 定）：① 到账进度比时间进度落后 10 个百分点以上；② 两个月内手里的钱就不够（到下下月下 PO 为止）。
  // 没到账的金额平时一直显示在规划行和预算来源页上，不出待办。没导入平台数据时不知道到账多少，不催
  const perMonth = Math.max(needPo(Math.min(Math.max(curM, 1), 12)), 1);
  const baList = (snap && started) ? baUnits.filter(u => u.un > u.tol && (u.got / u.plan < timeProg - 0.1 || cash.shortNear)).map(u => ({
    code: u.code, name: u.name, plan: u.plan, got: u.got, short: u.un, pct: u.got / u.plan, shared: u.shared, onPlat: u.onPlat,
    behind: u.got / u.plan < timeProg - 0.1, latest: Math.max(Math.min(curM, 11) + 1, 12 - Math.ceil(u.un / perMonth))   // 最晚到账月：再晚就来不及靠 PO 花掉
  })).sort((a, b) => b.short - a.short) : [];
  const ungrantedTotal = sum(baUnits, u => u.un);
  srcRows.forEach(r => { const u = baUnits.find(x => r.notGranted ? x.plans.some(q => q.id === r.plan.id) : (r.code && x.code === r.code)); r.un = u ? u.un : 0; });   // 这一行对应的钱里还有多少没到账
shortList.forEach(x => { const r = srcRows.find(y => y.code === x.code && y.decName === x.name); x.un = r ? r.un : 0; });
  const excessOd = Math.max(0, odRemainTotal - D);   // 多余 OD 额度：年底花不掉，需调回

  /* ---- 本月指令 ---- */
  const nextM = curM >= 12 ? null : curM + 1;
  const ceilK = v => Math.ceil(v / 1000) * 1000;
  let poDecision = null;
  if (started && snap) {
    const yearEnd = curM >= 11;
    // 按「PO归属」把这次要下的 PO 拆成几张（各张金额 = 建议金额 × 这张的日额占比），钱包分配按顺序依次分给各张
    // 把钱包（花钱项目 × 预算来源）整块分给各张 PO：每张 PO 的金额由人员决定、保持不变；同一个钱包尽量不拆到两张 PO，
    // 每张 PO 最多只拆一个钱包（钱数少时穷举找最接近目标的组合，否则从大到小放）
    const assignWallets = (parts, items) => {
      const pool = mergeW(items);   // 同一个钱包可能分几次取过，先并成一条
      const spare = x => {   // 这个钱包在所有安排（PO、OD、1 月 PO）之后还剩多少没花
        const r = srcRows.find(q => q.code === x.code), w = r && r.wallets.find(q => q.proj === x.proj);
        return w ? Math.max(0, w.itw + w.od - (r.usedItw[x.proj] || 0) - (r.usedOd[x.proj] || 0)) : 0;
      };
      const withSpare = (list, d) => list.filter(x => spare(x) >= d).sort((a, b) => b.amt - a.amt)[0];   // 自己还有 d 这么多没花的钱包里，金额最大的那个
      const bestSubset = (cands, target) => {   // 总额最接近 target 的一组钱包（同样接近时取不超过目标的、钱包数少的）
        let best = { diff: Infinity, set: [] };
        const n = cands.length;
        if (n > 16) return null;
        for (let mask = 1; mask < (1 << n); mask++) {
          let s = 0, set = [];
          for (let i = 0; i < n; i++) if (mask & (1 << i)) { s += cands[i].amt; set.push(cands[i]); }
          const diff = Math.abs(s - target) + (s > target ? 0.5 : 0) + set.length * 1e-6;   // 略偏向"不超过目标"；钱包数少的优先
          if (diff < best.diff) best = { diff, set };
        }
        return best.set;
      };
      parts.slice().sort((a, b) => b.need - a.need).forEach((p, idx, arr) => {
        if (idx === arr.length - 1) { p.alloc = pool.filter(x => x.amt > 0.5); pool.length = 0; return; }   // 最后一张拿走剩下的
        const sub = bestSubset(pool, p.need) || pool.slice().sort((a, b) => b.amt - a.amt).filter(x => x.amt <= p.need + 0.5);
        let s = sum(sub, x => x.amt);
        sub.forEach(x => p.alloc.push(x));
        sub.forEach(x => pool.splice(pool.indexOf(x), 1));
        const splitOne = (x, g) => {   // 把钱包 x 的一部分（g）给这张 PO；"OD 额度调回""占用预留"这些标记按比例分到两份上
          const f = x.amt > 0 ? g / x.amt : 0;
          const part = Object.assign({}, x, { amt: g, odBack: (x.odBack || 0) * f, fromReserve: (x.fromReserve || 0) * f, split: true });
          p.alloc.push(part); x.amt -= g; x.odBack = (x.odBack || 0) * (1 - f); x.fromReserve = (x.fromReserve || 0) * (1 - f); x.split = true;
          if (x.amt <= 0.5) pool.splice(pool.indexOf(x), 1);
        };
        const smallD = Math.max(2000, p.need * 0.01);   // 零头：不到这个数就不为此把钱包拆到两张 PO
        if (s < p.need - 0.5 && pool.length) {
          const big = pool.slice().sort((a, b) => b.amt - a.amt)[0], d = p.need - s, top = withSpare(sub, d);
          if (d <= smallD && top) top.amt += d;   // 只差一点零头：加到这张 PO 里自己还有钱的最大的钱包上
          else splitOne(big, Math.min(d, big.amt));   // 差得多：从剩下最大的钱包里拆
        } else if (s > p.need + 0.5) {   // 多了一点
          const over = s - p.need, bigTop = p.alloc.slice().sort((a, b) => b.amt - a.amt)[0], x = withSpare(p.alloc.filter(w => w !== bigTop), over);
          if (over <= smallD && x) { bigTop.amt -= over; x.amt += over; }   // 只多一点零头：在这张 PO 内部的钱包之间挪一下，不为此拆别的钱包
          else {   // 多得较多：把其中最小的一个钱包放回去，再从它里面拆出需要的部分
            const small = p.alloc.slice().sort((a, b) => a.amt - b.amt)[0];
            p.alloc.splice(p.alloc.indexOf(small), 1); pool.push(small);
            splitOne(small, Math.max(0, small.amt - over));
          }
        }
      });
      parts.forEach(p => {   // 每张 PO 里各钱包、各花钱项目的占比；钱包按花钱项目、金额从大到小排
        const dRnd = p.toIssue - sum(p.alloc, x => x.amt), bigW = withSpare(p.alloc, dRnd);   // 各张金额取整到千多出来的零头：加到这张 PO 里自己还有钱的最大的钱包上
        if (dRnd > 0.5 && dRnd <= 1000 && bigW) bigW.amt += dRnd;
        p.alloc.sort((a, b) => ((a.proj || '') < (b.proj || '') ? -1 : (a.proj || '') > (b.proj || '') ? 1 : 0) || b.amt - a.amt);
        const t = sum(p.alloc, x => x.amt);
        p.total = t;
        p.alloc.forEach(x => { x.pct = t > 0 ? x.amt / t : 0; });   // 占这张 PO 的比例
        // 比例分两层（和在系统里下 PO 时填的一样）：先按花钱项目分（合计 100%），每个项目内再按预算项分（项目内合计 100%）
        const gs = {};
        p.alloc.forEach(x => { const g = gs[x.proj || ''] = gs[x.proj || ''] || { proj: x.proj || '', amt: 0, items: [] }; g.amt += x.amt; g.items.push(x); });
        p.projShares = Object.values(gs).map(g => ({ proj: g.proj, amt: g.amt, pct: t > 0 ? g.amt / t : 0 })).sort((a, b) => b.amt - a.amt);
        p.projGroups = p.projShares.map(s => { const g = gs[s.proj]; g.pct = s.pct; g.items.forEach(x => { x.pctProj = g.amt > 0 ? x.amt / g.amt : 0; }); return g; });
      });
    };
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
      assignWallets(parts, items);
      return parts;
    };
    const dailyNext = (hasPoCfg && nextM) ? poDailyAt(Y, nextM) : 0;
    const ymCur = ymOf(Y, curMo);
    const planAhead = plan.filter(p => p.ym >= ymCur || (p.end && p.end > ymCur)).sort((a, b) => a.ym < b.ym ? -1 : 1);   // 本月及以后生效的、或本月还没结束的变动计划
    poDecision = {
      yearEnd, isDec: curM === 12, nextM, asOf,
      // ① PO（1–11 月：下月的 PO；12 月：下旬下明年 1 月的 PO）
      po: nextM ? {
        nextM, wd: workdays(nextM), theory: theoryPo(nextM), need: advisePo(nextM), expect: needPo(nextM), issued: issuedByMonth[nextM] || 0, issuedList: issuedPoList.filter(x => x.mo === nextM),   // need = 建议下的金额（含安全垫）；expect = 预计的消耗
        toIssue: ceilK(Math.max(0, (poMonths.length && poMonths[0].mo === nextM) ? poMonths[0].need : advisePo(nextM) - (issuedByMonth[nextM] || 0))),
        short: Math.max(0, needPo(nextM) - (issuedByMonth[nextM] || 0)),   // 已下的连团队消耗都不够的部分
        unfunded: poMonths.length ? Math.max(0, poMonths[0].need - poMonths[0].funded) : 0,   // 还要下的里面没有钱包可出的
        low: needPo(nextM), high: advisePo(nextM),
        base: basePo(Y, nextM), ot: otCost(Y, nextM), cushion: cushionPo(nextM), attend: attendOf(Y, nextM), fest: isFest(Y, nextM),
        alloc: nextDetail.items, projs: Array.from(nextDetail.projs), funded: poMonths.length ? poMonths[0].funded : 0,
        histNext: (poAvg > 0 && poAvgWd > 0) ? poAvg * workdays(nextM) / poAvgWd : 0,
        daily: dailyNext,
        keptReserve: poMonths.length ? poMonths[0].keptReserve : true,   // 这张 PO 有没有守住锚定项目留给 OD 的钱
        tookReserve: poMonths.length ? poMonths[0].tookReserve : 0,        // 占用了留给 OD 的钱
        odBackTotal: sum(nextDetail.items, x => x.odBack || 0),              // 需要从 OD 额度调回 IT外包 的钱
        splitWallets: (() => { const seen = {}; return nextDetail.items.filter(x => x.split).filter(x => { const k = x.code + '|' + x.proj; if (seen[k]) return false; seen[k] = 1; return true; }); })(),
        parts: splitParts(Y, nextM, advisePo(nextM), nextDetail.items, issuedByMonth[nextM] || 0)
      } : null,
      // ④ 1 月 PO（11 月预演；12 月就是本月的 PO 指令）
      jan: { need: needJan, toIssue: ceilK(needJan), expect: needJan - cushionJan, base: basePo(Y + 1, 1), ot: otCost(Y + 1, 1), cushion: cushionJan, attend: attendOf(Y + 1, 1), fest: true, wd: janWd, reserve: janReserve, short: Math.max(0, needJan - janReserve), fromRefund: janFromRefund, fromCur: janFromCur, odBackTotal: janOdBack, alloc: janItems, hist: (poAvg > 0 && poAvgWd > 0) ? poAvg * janWd / poAvgWd : 0, daily: poDailyJan, parts: splitParts(Y + 1, 1, needJan, janItems, 0) },
      planAhead,
      // ② OD：本月 = 保证这个月底的扣减够用（必做，在锚定项目里）；往后 = 每个月底的扣减能不能继续只落在锚定项目（提醒）
      od: (() => {
        const curP = odPlans.find(x => x.mo === curM) || null;
        const nextAnchor = nextM ? anchorOf(nextM) : (curP ? curP.anchor : anchorDefault);
        const plans = odPlans.filter(x => x.mo > curM && x.mo <= odWinEnd);
        // 不在下个月锚定项目里的 OD 额度（扣完这个月之后还剩的）：下 PO 缺钱时可以调回 IT外包
        const quotaOutside = sum(srcRows, r => sum(r.wallets.filter(w => w.proj !== nextAnchor), w => Math.max(0, w.od - (r.usedOd[w.proj] || 0))));
        const afterCur = Math.max(0, odRemainTotal - (curP ? curP.usedAnchor + curP.other : 0));
        const futureNeed = Math.max(0, odWinNeed - (curP ? curP.need : 0));
        return {
          winEnd: odWinEnd,
          anchorCur: curP ? curP.anchor : anchorOf(curM), anchorNext: nextAnchor,
          anchors: Array.from({ length: 13 - curM }, (_, i) => curM + i).filter(mo => odEst[mo]).map(mo => ({ mo, proj: anchorOf(mo), explicit: !!anchorCfg[mo] })),
          projList,
          curNeed: curP ? curP.need : 0, curTransfer: curP ? curP.xferAnchor : 0, curWallets: curP ? curP.xferWallets : [], curShort: curP ? curP.left : 0,
          curRefundCur: curP ? curP.refundCur : 0,   // 11 月底这笔里靠 11 月 PO 的钱（11 月底的扣减等不到它，应该是 0）
          curXferAll: curP ? curP.xferAll : 0, curRefundPast: curP ? curP.refundPast : 0, curOtherProj: curP ? curP.otherProj : [], curTemp: curP ? curP.temp : 0, curTempHc: curP ? curP.tempHc : 0,
          splitMo: plans.filter(p => p.otherProj.length),   // 要把一部分 OD 挂到别的项目上的月份
          lateRefund: plans.filter(p => p.refundCur > 500),   // 年终清算里要等 11 月 PO 的钱（12 月下旬才回来）的月份
          curUsed: curP ? curP.usedAnchor : 0, curOther: curP ? curP.other : 0, curRefund: curP ? curP.refund : 0,
          have: odRemainTotal, afterCur,
          futureNeed, futureGap: Math.max(0, futureNeed - afterCur), futureNoMoney: sum(plans, p => p.left), plans,
          futureUsed: sum(plans, p => p.usedAll), futureXfer: sum(plans, p => p.xferAll), futureRefund: sum(plans, p => p.refund),   // 往后要转到 OD 的钱 = futureXfer（现在从 IT外包 调）+ futureRefund（验收返还到账后再调）；其余用现有的 OD 额度
          quotaOutside, excessOd, unfundedYear: odUnfunded
        };
      })(),
      // ③ 临时 OD 补缺口
      short: { total: shortTotal, able: shortAble, list: shortList, rate: odAvgRate, janAfterFill },   // 达标缺口：按配置里的安排到年底还差多少；able = 其中钱还在这些来源里、只能靠再挂 OD 花掉的
      poNoFc,
      refundPast: sum(Object.values(refundPastByCode)),   // 往月 PO 的验收返还额（年底可用，前提是 12 月 15 日前验收）
      exclExec: poExclWill,   // 剔除出决策的 PO 还会执行的（别的团队在花，计入年底执行）
      yearPlan,               // 年底资金安排：每个钱包的进出、留给 1 月的理论上限
      refundCur: sum(Object.values(refundCurW)),   // 11 月这张 PO 多下的部分（12 月下旬验收后返还，只用于 1 月 PO）
      baList, baUnits, planGrant, ungrantedTotal,   // 催 BA 只看规划了还没到账的钱（见上）
      // 在途识别结果（本月）
      inflight: { fc: curFc, willExec: curWillExec, over: curOver, k: kNeed, need: teamNeedAsOf, bySrc: Object.keys(willExecByCode).map(c => ({ code: c, name: per[c] ? per[c].name : c, fc: sum(poList.filter(r => r.budgetCode === c), r => info.get(r).cur) })).filter(x => x.fc > 0) },
      // 推演汇总
      rows: srcRows, hit: hitN, assessed: assessedN, weightedTarget, forecastEnd, unspent,
      fund
    };
  }
  const odOverList = codes.filter(c => (per[c].odExec || 0) > (per[c].odAvail || 0) && (per[c].odExec || 0) > 0);

  // OD 校准：只比"已有实际数的那几笔扣减"对应的费用月理论值（含变动计划的还原），计划内的加人/减人不算偏差
  const odHistTh = normalAll.slice(-3).map(([mo]) => odCostAt(Y, Math.max(+mo - 1, 1)));
  const calibOd = (hasOdCfg && odAvg > 0) ? ((odHistTh.length ? sum(odHistTh) / odHistTh.length : theoryOd) - odAvg) / odAvg : null;

  // 到账进度（总体）：已到账 ÷ 规划合计
  const grantProg = planCnyTotal > 0 ? availTotal / planCnyTotal : null;

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
    const gImp = {};   // 平台导出的授予流水（数据集里的预算授予文件）：本年度授予合计，有它时以它为准
    Object.values((state.grantData || {}).byProject || {}).forEach(g => (g.rows || []).forEach(r => { if (!/以前年度/.test(r.note)) gImp[r.code] = (gImp[r.code] || 0) + (r.total || r.itw + r.od); }));
    codes.forEach(c => { if (gImp[c] != null) logs[c] = gImp[c]; });
    codes.forEach(c => {
      const b = snap.rows[c].itw.granted || 0;
      if (logs[c] != null && Math.abs(logs[c] - b) > Math.max(1000, b * 0.02)) grantChecks.push({ code: c, name: snap.rows[c].name, logSum: logs[c], granted: b });
    });
  }

  return {
    Y, fx, snaps, snap, po, poList, excluded: excl, codes, per, plansY, unmatched, planCnyTotal, poDecision, itwExec, odExec, execTotal, execRate, weightedTarget,
    timeProg, curM, poMonthlyAct, poMonthlyFc, poActByCode, poFrozen, poReturn, openCnt,
    odMonthly, odAvg, odEst, odFuture, poFuture, poEst, forecastEnd, forecastRate,
    grantProg, checks, grantChecks, availTotal, remainTotal, itwFc,
    poExcludedRows, poExclAct, poExclActByCode, poExclWill, poExclFrozen, poExclAgg, poExclWillM,
    odYearEnd: { manual: odYE, formula: hasOdCfg ? odDeduct(12) : odBase * odMult(12) },   // 年终清算：用户测算的总额（0 = 没填）和按人数测算的数
    workdays, yearCost, team: { poGroups, odGroups, poDaily, theoryOd, theoryPo, calibOd, attend, hasPoCfg, hasOdCfg, plan, odCostAt, hcAt,
      basePo, otCost, needPo, cushionPo, advisePo, attendOf, isFest, attN, attF, otPeople, otSkip,   // PO 月度需求：消耗 = basePo × 出勤系数；建议金额 = advisePo
      hcSummary: (yy, mo) => ({ po: sum(poGroups, g => hcAt(g, yy, mo)) + sum(virtualAt('po', yy, mo), v => v.headcount) + sum(tempAt('po', yy, mo), v => v.headcount), od: sum(odGroups, g => hcAt(g, yy, mo)) + sum(virtualAt('od', yy, mo), v => v.headcount) + sum(tempAt('od', yy, mo), v => v.headcount) }) },
    poAvg, poAvgWd, poWillExec: sum(Object.values(willExecByCode)),   // 在途 PO 里会执行掉的合计
    today: { m: now.getMonth() + 1, d: now.getDate() },   // 今天几月几号：待办的截止时间要看日子，不能只知道月份
    projects, hasProj, byPo, poParsedOld, wallets, odRemainTotal, odOverList, specialRows,
    importNotes: state.importNotes || [],
    odAsOfText: snap ? 'OD 执行截至 ' + (+snap.date.slice(5, 7)) + ' 月（平台口径，滞后约 1 个月）' : ''
  };
}
/* ================= 渲染：通用 ================= */
function rateColor(rate, timeProg, target, forecast) {
  if (rate == null || !target) return '';
  // 有推演结果时按结果着色：会达标=绿（已达）/蓝（在途），会差=红；没有推演时按时间进度
  if (typeof forecast === 'number') return forecast >= target ? (rate >= target ? 'f-green' : '') : 'f-red';
  if (rate >= target) return 'f-green';
  if (rate >= timeProg - 0.05) return '';
  return 'f-red';
}
function renderBanner() {
  const el = $('#freshnessBanner');
  const freq = state.meta.updateFreqDays || 14, t = todayStr(), Y = curYear();
  const hasAny = state.execSnaps.length || Object.keys(state.poDataByYear || {}).length;
  if (!hasAny && !state.plans.length) { el.className = 'banner warn'; el.innerHTML = '⚠️ 还没有任何数据：先到「数据管理」录入年初规划，再把平台导出的文件放进数据集文件夹'; $('#yearBadge').textContent = Y + ' 年度'; return; }
  // 只看平台数据新不新（PO 明细、执行表）；规划、团队配置不按天数催
  const chips = [];
  [['po', 'PO 明细'], ['exec', '执行表']].forEach(([k, label]) => {
    const has = k === 'po' ? !!poOf(Y) : state.execSnaps.some(s => inYear(s.date, Y));
    if (!has) { if (Y === new Date().getFullYear()) chips.push(label + '：今年还没导入'); return; }   // 往年、还没开始的年度不催
    const d = (state.updatedAt || {})[k];
    const days = d ? daysBetween(d, t) : null;
    if (days == null || days > freq) chips.push(label + '：' + (days == null ? '没记录导入时间' : days + ' 天没更新'));
  });
  const fileKnown = !!(fileHandle || recentHandle);   // 设过数据文件：没连上时 fileHandle 是空的，只有 recentHandle 还记着上次的文件
  let fileChip = '';
  if (fileKnown && !fileConnected) fileChip = '<span class="chip" style="border-color:var(--red);color:var(--red)">💾 数据文件未连接</span>';
  else if (fileKnown && fileConnected) fileChip = '<span class="chip">💾 budget.json 已连接</span>';
  if (fileKnown && !fileConnected) {
    el.className = 'banner warn';
    el.innerHTML = '⚠️ <b>数据文件未连接</b>：数据暂存浏览器缓存（不丢），点上方「📂 载入数据文件」重新连接（不用再选文件）即恢复自动同步。' + (chips.length ? '<br>数据待更新：' + chips.map(c => '<span class="chip">' + esc(c) + '</span>').join('') : '');
    $('#yearBadge').textContent = Y + ' 年度';
    return;
  }
  if (chips.length) { el.className = 'banner warn'; el.innerHTML = '⚠️ 数据待更新：' + chips.map(c => '<span class="chip">' + esc(c) + '</span>').join('') + fileChip; }
  else { el.className = 'banner ok'; el.innerHTML = '✓ 平台数据 ' + freq + ' 天内已更新' + fileChip; }
  $('#yearBadge').textContent = Y + ' 年度';
}

/* ================= 渲染：现在与行动（首页） =================
   首屏三件事：本周待办（做什么、什么时候、多少钱）· 执行率（现在 → 目标 → 预计年底）· 需要留意的问题
   往下：本周期操作（下 PO 的比例表、OD、年底资金安排）→ 来源健康度（严重的在前）→ 折起来的明细 */
function actHash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return 'a' + h; }
function actsStore() { try { return JSON.parse(localStorage.getItem('budgetDash.acts') || '{}'); } catch (e) { return {}; } }
function actDone(h) { const d = actsStore()[h]; return d != null && d.slice(0, 7) === todayStr().slice(0, 7); }
const pctTxt = v => { const p = v * 100; return (p >= 9.95 ? String(Math.round(p)) : p.toFixed(1)).replace(/\.0$/, '') + '%'; };
// 折叠块：id 记着展开状态（重渲染时保留）；def = 用户没动过时的默认（有事的那个月默认展开）
const foldHtml = (id, summary, body, def, cls) => '<details class="fold ' + (cls || '') + '" id="' + id + '"' + ((id in foldOpen ? foldOpen[id] : !!def) ? ' open' : '') + '><summary>' + summary + '</summary>' + body + '</details>';
// 刻度条：实心 = 现在的执行率；绿线 = 目标；虚线 = 时间进度；粗线 = 预计年底（颜色看达不达标）
const barScale = (...vals) => Math.min(1.5, Math.ceil(Math.max(0, ...vals.filter(v => v != null)) * 10 - 1e-9) / 10 + 0.05);   // 最大的那个向上取整到 10%，再留一点余量
function miniBar(now, target, timeProg, fore, foreCls) {
  const sc = barScale(now, target, fore);
  const x = v => (v == null ? 0 : Math.min(1, v / sc) * 100).toFixed(1) + '%';
  return '<div class="mini-bar">' +
    '<div class="fill ' + rateColor(now, timeProg, target, fore) + '" style="width:' + x(now) + '"></div>' +
    (target ? '<div class="mk" style="left:' + x(target) + '" title="目标 ' + fmtPct(target) + '"></div>' : '') +
    (timeProg > 0 && timeProg < 1 ? '<div class="mk time" style="left:' + x(timeProg) + '" title="时间进度 ' + fmtPct(timeProg) + '"></div>' : '') +
    (fore != null ? '<div class="mk fore ' + (foreCls || '') + '" style="left:' + x(fore) + '" title="预计年底 ' + fmtPct(fore) + '"></div>' : '') +
    '</div>';
}
const odWhatOf = mo => mo === 12 ? ((+yearParams(curYear()).odYearEnd || 0) > 0 ? '年终清算：按你的测算' : '年终清算：11 月 + 12 月 + 年终奖') : mo === 6 ? '上半年清算：5 月 + 6 月' : (mo - 1) + ' 月的费用';   // 某个月底扣的是什么

// 钱不够时先做什么——两件事分开说：规划了还没到账的催 BA（按规划看）；已经到账、冻在 PO 里的催验收
function moneyWhy(c, d) {
  if (!d) return '';
  const parts = [];
  if (d.ungrantedTotal > 1000) parts.push('规划了还没到账 <b>' + fmtCny(d.ungrantedTotal) + '</b>（催 BA）');
  const frozen = d.fund.cash.refundPast + d.fund.cash.refundCur;
  if (frozen > 1000) parts.push('冻在 PO 里 <b>' + fmtCny(frozen) + '</b>（验收后回来，催验收）');
  return parts.join('；');
}

// 待办与提醒：把原来分散在摘要条、风险区、决策卡、行动清单里的同一件事归成两份——
//   待办 = 有明确动作的（按先后排，带时间和金额）；提醒 = 不用去操作系统、但要知道的
function buildAgenda(c, d, m) {
  const todos = [], notes = [];
  const P = d && d.po, J = d && d.jan, O = d && d.od, I = d && d.inflight;
  const add = t => todos.push(t);
  const freq = state.meta.updateFreqDays || 14;
  const why = moneyWhy(c, d);   // 钱不够时先做什么：没到账的催 BA、冻结的催验收，分开说（没有推演结果时是空串）
  if (d) {
    /* ① PO：1–11 月是下月的 PO；12 月是下旬下明年 1 月的 */
    if (d.isDec) {
      if (J.toIssue > 0) add({ key: 'janPo:' + J.toIssue, due: '12-20 前', title: '下旬下 <b>1 月 PO</b>', amt: fmtCny(J.toIssue), lv: J.short > 0 ? 'amber' : '',
        note: J.short > 0 ? '<span style="color:var(--red)">结余缺 ' + fmtCny(J.short) + '</span>（团队 1 月需要 ' + fmtCny(J.need) + '）' : '✓ 今年的结余够 1 月整月，团队不断档', goto: 'opsPo' });
    } else if (P && P.toIssue > 0) {
      const noFund = P.unfunded, late = c.today.m === c.curM && c.today.d > 20;   // 过了 20 号（下单的日子）还没下完
      add({ key: 'po:' + P.nextM + ':' + P.toIssue, due: late ? '尽快' : c.curM + '-20 前',
        title: P.issued > 0.5 ? P.nextM + ' 月 PO <b>还差 ' + fmtCny(P.toIssue) + '</b>（已下 ' + fmtCny(P.issued) + '）' : '下 <b>' + P.nextM + ' 月 PO</b>',
        amt: P.issued > 0.5 ? '' : fmtCny(P.toIssue), lv: noFund > 1000 ? 'red' : (P.issued > 0.5 ? 'amber' : ''),
        note: (P.issued > 0.5 ? '按最新数据，团队 ' + P.nextM + ' 月的消耗约 ' + fmtCny(P.expect) + '，已下的 ' + fmtCny(P.issued) + ' 不够' + (late ? '——可以在 ' + P.nextM + ' 月里补一张' : '——把差额补上')
                           : '团队需求 ' + fmtCny(P.need) + (late ? '（已经过了 ' + c.curM + '-20）' : '')) +
          (noFund > 1000 ? '；<span style="color:var(--red)">其中 ' + fmtCny(Math.round(noFund / 1000) * 1000) + ' 没有钱可出' + (why ? '——' + why : '') + '</span>' : '，金额和比例见下方'), goto: 'opsPo' });
    }
    /* 下 PO 之前：先把用不到的 OD 额度调回 IT外包 */
    [P ? { x: P, due: '下 PO 前' } : null, d.isDec ? { x: J, due: '下 1 月 PO 前' } : null].filter(Boolean).forEach(o => {
      if (o.x.odBackTotal > 0.5) add({ key: 'odBack:' + o.x.odBackTotal, due: o.due, lv: 'amber', title: '先把 <b>OD 额度调回 IT外包</b>', amt: fmtCny(o.x.odBackTotal), note: '后面的 OD 扣减用不到的额度；是哪几个预算项，见比例表里标〔〕的', goto: 'opsPo' });
    });
    /* ② OD：这个月底的扣减是必做的；往后各月是提醒（可顺手一起调） */
    if (c.odOverList.length) add({ key: 'odOver', due: '立即', lv: 'red', title: '<b>OD 额度已经不足</b>，马上调拨', note: c.odOverList.map(code => esc(c.per[code].name) + ' 已执行 ' + fmtCny(c.per[code].odExec) + ' > 可用 ' + fmtCny(c.per[code].odAvail)).join('；') + '——否则会落到「费用先结算至PO受益部门」' });
    if (O.curShort > 0.5) add({ key: 'odShort:' + Math.round(O.curShort), due: c.curM + ' 月底', lv: 'red', title: '月底 OD 扣减缺 <b>' + fmtCny(O.curShort) + '</b>，且没有钱可调', note: odWhatOf(c.curM) + '要扣 ' + fmtCny(O.curNeed) + '——' + (why || '先核对可支配的钱是不是都算上了'), goto: 'opsOd' });
    else if (O.curXferAll > 0) add({ key: 'odCur:' + Math.round(O.curXferAll), due: c.curM + ' 月底', lv: 'amber', title: '<b>OD 调拨</b>（IT外包 → OD）', amt: fmtCny(O.curXferAll), note: '赶在月底扣减前；' + odWhatOf(c.curM) + '要扣 ' + fmtCny(O.curNeed) + (c.hasProj ? '，挂在 ' + esc(O.anchorCur) : '') + '，从哪几个预算项调见明细', goto: 'opsOd' });
    const noMoney = O.plans.filter(p => p.left > 0.5), splitMo = O.plans.filter(p => p.otherProj.length);
    const futT = O.futureXfer + O.futureRefund, futRef = O.futureRefund, futCur = sum(O.lateRefund, p => p.refundCur);   // 往后各月一共要转到 OD 的钱；其中靠验收返还的、靠 11 月 PO 的
    if (futT > 1000 || noMoney.length) add({ key: 'odFut:' + Math.round(futT) + ':' + noMoney.map(p => p.mo).join(','), due: (noMoney.length ? noMoney[0].mo : (O.plans.find(p => p.xferAll + p.refund > 500) || {}).mo || 12) + ' 月底', lv: noMoney.length ? 'red' : 'amber',
      title: noMoney.length ? '<b>OD 调拨（往后）</b>，<span style="color:var(--red)">' + noMoney.map(p => p.mo + ' 月').join('、') + '没有钱可调</span>' : '<b>OD 调拨（往后）</b>',
      amt: fmtCny(noMoney.length ? sum(noMoney, p => p.left) : futT),
      note: '扣完这个月后 OD 额度剩 ' + fmtCny(O.afterCur) + '；到年底（含年终清算）还要再扣 ' + fmtCny(O.futureNeed) + '：' +
        (O.futureXfer > 500 ? '从 IT外包 调 ' + fmtCny(O.futureXfer) : '') +
        (futRef > 500 ? (O.futureXfer > 500 ? '；' : '') + '验收返还到账后再调 ' + fmtCny(futRef) + '（往月 PO 的 ' + fmtCny(futRef - futCur) + ' 要到 12 月 15 日前' + (futCur > 500 ? '、11 月 PO 多下的 ' + fmtCny(futCur) + ' 要到 12 月下旬——时间很紧' : '') + '）' : '') +
        (O.futureUsed > 500 ? (futT > 500 ? '；' : '') + '其余 ' + fmtCny(O.futureUsed) + ' 用现有的 OD 额度' : '') +
        (noMoney.length ? '——' + (why || '先把往月 PO 验收掉让钱回来') : (O.futureXfer > 1000 ? '——现在能调的可以这个月顺手一起调；等返还的那部分到账前调不了' : '')), goto: 'opsOd' });
    const splitWhy = p => p.otherGap > 500 ? '那边有还缺口的来源，这笔钱只有 OD 这一条路' + (p.other - p.otherGap > 500 ? '；挂在的项目里的钱也不够' : '') : '挂在的项目里的钱不够';
    if (splitMo.length) add({ key: 'odSplit:' + splitMo.map(p => p.mo).join(',') + ':' + splitMo.map(p => Math.round(sum(p.otherProj, x => x.amt))).join(','), due: splitMo[0].mo + ' 月底', lv: 'amber', title: '<b>OD 要挂到两个项目</b>', amt: fmtCny(sum(splitMo, p => sum(p.otherProj, x => x.amt))), note: '系统算下来，' + splitMo.map(p => p.mo + ' 月要把 ' + fmtCny(sum(p.otherProj, x => x.amt)) + ' 挂到 ' + p.otherProj.map(x => esc(x.proj)).join('、')).join('；') + '（' + splitMo.map(p => p.mo + '月：' + splitWhy(p)).join('；') + '）。执行率优先于只挂一个项目；怎么挂见明细', goto: 'opsOd' });
    /* ③ 催 BA：只看"规划了还没到账"的钱（已到账 = 往年结转 + 本年度授予）。到账进度落后 10 个百分点以上、或两个月内手里的钱不够才出待办；PO 冻结的钱不在这里（见 ④） */
    if (d.baList.length) add({ key: 'ba:' + d.baList.map(b => Math.round(b.short)).join(',') + (d.fund.cash.shortNear ? ':soon' : ''), due: d.fund.cash.shortNear ? '尽快' : '本月', lv: d.fund.cash.shortNear ? 'red' : 'amber',
      title: '<b>催 BA 到账</b>：' + d.baList.length + ' ' + (d.baList.some(b => b.shared) ? '项' : '条规划') + '还没到账', amt: fmtCny(sum(d.baList, b => b.short)),
      note: d.baList.map(b => esc(b.name) + ' 到账 ' + fmtCny(b.got) + ' / 规划 ' + fmtCny(b.plan) + (b.onPlat ? '（' + fmtPct(b.pct) + '）' : '——平台上还没出现') + (b.shared ? '，多条规划共用' : '') + '，还差 <b>' + fmtCny(b.short) + '</b>' + (b.latest ? '，最晚 ' + b.latest + ' 月到账' : '')).join('；') +
        (d.fund.cash.shortNear ? '；<span style="color:var(--red)">两个月内手里的钱不够：到 ' + esc(d.fund.cash.shortNear.when) + '（' + esc(d.fund.cash.shortNear.label) + '）时差 ' + fmtCny(d.fund.cash.shortNear.short) + '</span>' : (d.baList.some(b => b.behind) ? '；到账进度落后时间进度（' + fmtPct(c.timeProg) + '）' : '')), goto: 'planCard' });
    /* ④ 催验收：往月没关闭的 PO 冻结着钱 */
    if (c.poReturn > 0) add({ key: 'accept:' + c.openCnt, due: d.yearEnd && !d.isDec ? '12-15 前' : '尽快', title: '<b>催验收</b>', amt: c.openCnt + ' 张',
      note: '在途冻结 ' + fmtCny(c.poFrozen) + '，验收后返还 <b>' + fmtCny(c.poReturn) + '</b>' + (d.yearEnd ? '；12 月 15 日前完成，返还的钱才能用于 1 月 PO' : '；验收周期约 1 个月'), btn: 'goto:po', btnTxt: '看明细' });
    /* 年底 */
    if (d.yearEnd && d.short.total > 0) add({ key: 'short:' + Math.round(d.short.total), due: '清算前', lv: d.short.able > 1000 ? 'amber' : 'red', title: '年底还有 <b>' + fmtCny(d.short.total) + '</b> 到不了目标', amt: d.short.list.length + ' 个来源' + (d.short.able > 1000 ? '，其中 ' + fmtCny(d.short.able) + ' 的钱还在' : ''),
      note: d.short.list.map(x => { const a = Math.min(x.short, x.un || 0), rest = x.short - a, b = Math.min(rest, x.odAble), bits = [];
        if (a > 1000) bits.push(fmtCny(a) + ' 还没到账——催 BA'); if (b > 1000) bits.push(fmtCny(b) + ' 的钱还在这个 IT 预算项里，只能靠 OD 花'); if (rest - b > 1000) bits.push(fmtCny(rest - b) + ' 钱都到了也不够——调低目标或再挂 OD');
        return esc(x.name) + ' 差 ' + fmtCny(x.short) + (bits.length ? '（' + bits.join('；') + '）' : ''); }).join('、') +
        (d.short.able > 1000 ? '——钱还在的那部分：12 月的 PO 已经下了，只能靠 OD 花，再挂约 ' + Math.ceil(d.short.able / Math.max(d.short.rate, 1)) + ' 个 OD，写进变动计划后自动计入年终清算' : ''), goto: 'srcHealth' });
    if (d.yearEnd && !d.isDec && J.short > 0) add({ key: 'janShort:' + Math.round(J.short), due: '12-20 前', lv: 'amber', title: '1 月 PO 缺 <b>' + fmtCny(J.short) + '</b>',
      note: '达标后的结余只够 ' + fmtCny(J.reserve) + '，团队 1 月需要 ' + fmtCny(J.need) + '——调低某个来源的目标就能补足（目标由你权衡）', btn: 'goto:data', btnTxt: '去调目标', goto: 'opsYear' });
  }
  /* 数据与配置 */
  // 已经有「重读数据集」那条待办时不重复提醒（点哪条都是重新授权 + 扫描）
  if (dirHandle && datasetPerm !== 'granted' && (c.snap || c.po) && !parseVerNeed().some(parseKindHasData)) add({ key: 'dsPerm', due: '尽快', lv: 'amber', title: '<b>数据集文件夹要重新授权</b>', note: '浏览器没有这个文件夹的读取权限，打开时的自动扫描被跳过了——点一下重新授权并扫描，新放进来的文件才会导进来', btn: 'dataset:scan', btnTxt: '授权并扫描' });
  /* 挂载：规划 → IT 预算项（多对一）。平台数据导入后才看得出哪条没挂；平台上有、规划里没有的 IT 预算项另算一条 */
  const noMount = c.snap ? c.plansY.filter(p => !p.dead && wusdOf(p) > 0 && !p.code) : [];
  if (noMount.length) add({ key: 'mount:' + noMount.map(p => p.id).join(','), due: '本月', title: '<b>' + noMount.length + ' 条规划还没挂 IT 预算项</b>', note: noMount.map(p => esc(p.name)).join('、') + '——挂上以后执行率才算得准；在年初规划表每行的「IT 预算项」里选，选完自动保存', goto: 'planCard' });
  if (c.unmatched.length) add({ key: 'unmatched:' + c.unmatched.join(','), due: '本月', title: '<b>平台上 ' + c.unmatched.length + ' 个 IT 预算项规划里没有</b>', note: c.unmatched.map(u => esc(c.per[u].name)).join('、') + '——是你的就新增一条规划挂上，不是你的就剔除', goto: 'srcHealth' });
  const pvNeed = parseVerNeed().filter(parseKindHasData);
  const pvNames = pvNeed.map(k => PARSE_NAME[k]).join('、');
  const pvNoFile = pvNeed.length > 0 && pvNeed.every(k => (state.parseVerNoFile || []).indexOf(k) >= 0);   // 数据集文件夹里没有这类文件（以前是手动导入的）
  const pvBtn = (!dirHandle || pvNoFile) ? 'import:open' : 'dataset:scan';
  { const sb = $('#datasetScanBtn'); if (sb && dirHandle) sb.textContent = pvNeed.length ? '🔄 重读数据集' : '📁 扫描数据集'; }
  if (pvNeed.length) add({ key: 'reread:' + pvNames, due: '尽快', lv: 'red', title: '<b>重读 ' + esc(pvNames) + '</b>', note: '看板更新了它们的解析规则，现在的数据还是按旧规则算的' + ((dirHandle && !pvNoFile) ? '（数据集里的文件不用重新导出）' : ''), btn: pvBtn, btnTxt: (dirHandle && !pvNoFile) ? '重读数据集' : '去导入' });
  else if (c.poParsedOld) add({ key: 'reimport', due: '尽快', title: '<b>重新导入一次 PO 明细</b>', note: '现在的数据是更新看板之前导入的，没有「费用结束时间」，PO 的服务期只能推断', btn: 'import:open', btnTxt: '导入' });
  const stale = ['po', 'exec'].some(k => { const dd = (state.updatedAt || {})[k]; const days = dd ? daysBetween(dd, todayStr()) : null; return days == null || days > freq; });
  if (stale) add({ key: 'import', due: '尽快', title: '<b>导入最新平台数据</b>', note: '每个花钱项目的执行表 + PO 明细（＋预算授予）放进数据集对应子文件夹；月底、月初各一次', btn: 'import:open', btnTxt: '导入' });
  if (state.team.length) {
    const days = state.meta.lastHcCheck ? daysBetween(state.meta.lastHcCheck, todayStr()) : null;
    if (days == null || days > 35) add({ key: 'hc', due: '本月', title: '<b>确认团队人数没变</b>', note: '上次确认：' + (state.meta.lastHcCheck || '从未') + '；有变化就改团队 Excel，放进数据集', btn: 'hc:confirm', btnTxt: '人数没变' });
  }
  if (d && (c.curM === 5 || c.curM === 11)) add({ key: 'clear:' + c.curM, due: c.curM + ' 月底', title: '为 <b>' + (c.curM === 5 ? '6 月上半年清算' : '12 月全年清算 + 年终奖') + '</b>做准备', note: '确认 OD 额度充足' + (c.curM === 11 ? (c.odYearEnd.manual > 0 ? '；年终清算按你的测算 ' + fmtCny(c.odYearEnd.manual) + '（按人数测算是 ' + fmtCny(c.odYearEnd.formula) + '）' : '，并把年终清算的数校准一下：在参数里直接填你测算的总额，或者改年终奖月数（当前 ' + (m.bonusMonths || 3.5) + '）') : '，必要时调拨'), goto: 'opsOd' });

  /* ---- 提醒：不用去操作系统，但要知道的 ---- */
  if (d) {
    if (d.fund.short > 0) { const cs = d.fund.cash.short; notes.push(['red', '钱不够', '按到账时间排下来，到 <b>' + esc(cs.when) + '</b>（' + esc(cs.label) + '）时差 <b>' + fmtCny(d.fund.short) + '</b>' + (cs.near ? '，就在这两个月内' : '') + '。' + (why || '钱都到了、也没有冻结的——是规划本身不够花')]); }
    if (P && P.tookReserve > 0.5 && (O.splitMo.length || O.plans.some(p => p.left > 0.5) || O.curOtherProj.length)) notes.push(['amber', '为了执行率，PO 动了留给 OD 的钱', '这次 PO 从 ' + esc(O.anchorNext) + ' 里拿了 <b>' + fmtCny(P.tookReserve) + '</b>（本来是给 OD 留的）：有缺口的来源靠常规 OD 补不上，执行率优先。后面的 OD 怎么挂见 ②', 'opsOd']);
    if (O.lateRefund.length) notes.push(['amber', '年终清算要等 11 月 PO 的钱', '年终清算里有 <b>' + fmtCny(sum(O.lateRefund, p => p.refundCur)) + '</b> 要等 11 月 PO 多下的部分验收返还（12 月下旬才到账）。赶得上 12 月 31 日，但时间很紧：验收一拖过年底，这笔就没有钱扣', 'opsOd']);
    if (I.fc > 0 && I.fc < I.need * 0.95) notes.push(['amber', '当月 PO 不够', '当月在执行的 PO 预计执行 ' + fmtCny(I.fc) + '，团队当月需求约 ' + fmtCny(I.need) + '，差 <b>' + fmtCny(I.need - I.fc) + '</b>——需要补一张 PO']);
    if (I.over > 0) notes.push(['amber', '当月多下', '在执行的 PO ' + fmtCny(I.fc) + '，团队当月需求约 ' + fmtCny(I.need) + '，预计多下 <b>' + fmtCny(I.over) + '</b>（' + fmtPct(I.over / I.fc) + '），验收后才能回来']);
    if (d.yearEnd && d.unspent > 10000 && J.short <= 0 && d.short.able <= 1000) notes.push(['amber', '花不掉的余量', '达标并留足 1 月 PO 后仍有 <b>' + fmtCny(d.unspent) + '</b> 花不掉——年底临时加 OD / 找别人花 / 调低目标', 'opsYear']);
    if (d.yearEnd && O.excessOd > 10000) notes.push(['amber', '多余 OD 额度', 'OD 额度多于到年底的扣减，多出 <b>' + fmtCny(O.excessOd) + '</b>，年底前调回 IT外包，否则花不掉', 'opsOd']);
  }
  if (c.checks.length) notes.push(['red', '两表不符', 'PO 明细汇总与执行表有 <b>' + c.checks.length + '</b> 项对不上（最大差额 ' + fmtCny(Math.max(...c.checks.map(k => Math.abs(k.diff)))) + '）', 'foldChecks']);
  if (c.grantChecks.length) notes.push(['amber', '授予流水对不上', '平台导出的授予流水与执行表「本年度授予」有 <b>' + c.grantChecks.length + '</b> 项不符', 'foldChecks']);
  if (d && d.poNoFc.length) notes.push(['amber', '有 PO 认不出属于哪个月', d.poNoFc.map(g => '<b>' + esc(g.poNo) + '</b>（' + esc(g.name) + ' ' + fmtCny(g.amount) + (g.start ? '，' + esc(g.start) + (g.end ? ' ~ ' + esc(g.end) : '') : '') + '）').join('、') + '：有金额，但没有任何月度执行 / 预测金额——如果这是 12 月的 PO，系统没法把它算成「已下」。请到平台上核对这张 PO 的月度金额，重新导出 PO 明细', 'opsPo']);
  c.importNotes.filter(n => n && n.text).forEach(n => notes.push(['amber', '导入提醒', esc(n.text)]));
  if (c.team.hasPoCfg && (c.team.attN.bad || c.team.attF.bad)) notes.push(['red', '团队配置和实际对不上', '近几月的实际执行 ÷ 理论 = <b>' + ((c.team.attN.bad ? c.team.attN : c.team.attF).r).toFixed(2) + '</b>，差得太离谱——先核对数据（PO 明细是不是都导进来了、执行列记全了没有）；这期间 PO 建议按参数里的出勤系数算，安全垫按一天日额', 'teamCard']);
  if (c.team.hasOdCfg && Math.abs(c.team.calibOd || 0) > 0.1) notes.push(['amber', '团队校准', 'OD 理论与近 3 月实际偏差 <b>' + fmtPct(c.team.calibOd) + '</b>（理论 ' + fmtCny(c.team.theoryOd) + ' vs ' + fmtCny(c.odAvg) + '）', 'teamCard']);
  if (c.curM <= 3 && c.po) {
    const crossPO = c.po.rows.filter(r => r.startDate && +String(r.startDate).slice(0, 4) === c.Y && +String(r.startDate).slice(5, 7) === 1);
    const crossAmt = sum(crossPO, r => sum(Object.entries(r.months), ([mm, v]) => +mm < c.po.asOf ? v : 0));
    if (crossAmt > 0) notes.push(['info', '1 月 PO', '本年执行含 <b>' + fmtCny(crossAmt) + '</b> 的 1 月 PO（去年 12 月下旬下单、用去年结余）——按费用起始时间计入今年，属正常']);
  }
  if (c.curM >= 11 && d) notes.push(['info', '落账节奏', '冲今年执行率只能靠年内能执行完的 PO 和 12 月 31 日的 OD 清算；12 月下旬下的 1 月 PO 用今年的结余、计入明年']);
  return { todos, notes };
}

// 首屏右边：执行率（现在 → 目标 → 预计年底）+ 三个钱的数 + 需要留意的提醒
function renderHero(c, d, m, ag) {
  const P = d && d.po, O = d && d.od;
  /* ---- 待办 ---- */
  $('#todoSub').textContent = ag.todos.length ? ag.todos.length + ' 项 · 按先后排 · 完成可勾选（当月有效）' : '';
  $('#nowTodo').innerHTML = ag.todos.length ? ag.todos.map(t => {
    const h = actHash(t.key), done = actDone(h);
    return '<div class="todo' + (t.lv ? ' ' + t.lv : '') + (done ? ' done' : '') + '"><span class="todo-dot"></span><span class="todo-due">' + t.due + '</span>' +
      '<div class="todo-body"' + (t.note ? ' title="' + esc(t.note.replace(/<[^>]+>/g, '')) + '"' : '') + '><div class="todo-title">' + t.title + (t.amt ? ' <span class="todo-amt">' + t.amt + '</span>' : '') + (t.goto ? ' <a class="lnk" data-action="goto:anchor" data-target="' + t.goto + '">明细 ↓</a>' : '') + '</div>' +
      (t.note && t.lv === 'red' ? '<div class="todo-note">' + t.note + '</div>' : '') + '</div>' +
      '<span class="todo-x">' + (t.btn ? '<button class="btn small" data-action="' + t.btn + '">' + (t.btnTxt || '去处理') + '</button> ' : '') +
      '<button class="btn small" data-action="act:toggle" data-h="' + h + '">' + (done ? '撤销' : '✓ 完成') + '</button></span></div>';
  }).join('') : '<div class="empty">' + (c.snap ? '✓ 本周期没有待办——数据最新，没有要做的事。' : '导入平台数据后，这里列出要做的事。') + '</div>';

  /* ---- 执行率 ---- */
  const tgtAll = c.weightedTarget != null ? c.weightedTarget : m.execRateTarget;
  const rate = c.execRate, fore = d ? c.forecastRate : null;
  const rateCls = rate == null ? '' : (rate >= tgtAll ? 'c-green' : (rate >= c.timeProg * tgtAll - 0.05 ? '' : 'c-red'));
  let foreCls = 'f-red';   // 预计年底的颜色：各考核来源都达标 = 绿；有到不了目标的 = 红
  if (d && d.assessed > 0) foreCls = d.hit >= d.assessed ? 'f-green' : 'f-red';
  else if (fore != null) foreCls = fore >= tgtAll ? 'f-green' : 'f-red';
  const itwRemain = sum(c.codes, x => c.per[x].itwRemain), odRemain = c.remainTotal - itwRemain;
  const hitTxt = !d ? '' : d.assessed > 0
    ? (d.hit >= d.assessed ? '<span style="color:var(--green)"><b>' + d.assessed + '/' + d.assessed + '</b> 个考核来源都能达标 ✓</span>'

      : '<span style="color:var(--red)"><b>' + (d.assessed - d.hit) + '/' + d.assessed + '</b> 个考核来源到不了目标</span>') + ' <a class="lnk" data-action="goto:anchor" data-target="srcHealth">逐个看 ↓</a>'
    : '';
  const sc = barScale(rate, tgtAll, fore), px = v => (v == null ? 0 : Math.min(1, v / sc) * 100).toFixed(1) + '%';
  const grantCls = c.grantProg == null ? '' : (c.grantProg >= c.timeProg - 0.1 ? 'c-green' : 'c-red');
  $('#nowRate').innerHTML =
    '<div class="gauge-nums">' +
      '<div class="g-num"><div class="lab">现在</div><div class="val ' + rateCls + '">' + fmtPct(c.snap ? rate : null) + '</div></div>' +
      '<div class="g-num"><div class="lab">目标</div><div class="val c-green">' + fmtPct(tgtAll) + '</div><div class="sub">各来源目标按规划加权</div></div>' +
      '<div class="g-num"><div class="lab">预计年底</div><div class="val ' + (d && d.assessed > 0 ? (d.hit >= d.assessed ? 'c-green' : 'c-red') : (fore != null ? (foreCls === 'f-green' ? 'c-green' : 'c-red') : '')) + '">' + fmtPct(fore) + '</div></div>' +
    '</div>' +
    (c.snap ? '<div class="gbar"><div class="fill ' + rateColor(rate, c.timeProg, tgtAll, fore) + '" style="width:' + px(rate) + '"></div>' +
      '<div class="mk" style="left:' + px(tgtAll) + '" title="目标 ' + fmtPct(tgtAll) + '"></div>' +
      (c.timeProg > 0 && c.timeProg < 1 ? '<div class="mk time" style="left:' + px(c.timeProg) + '" title="时间进度 ' + fmtPct(c.timeProg) + '"></div>' : '') +
      (fore != null ? '<div class="mk fore ' + foreCls + '" style="left:' + px(fore) + '" title="预计年底 ' + fmtPct(fore) + '"></div>' : '') + '</div>' +
      '<div class="gbar-legend"><span><i class="lg-fill"></i>已执行 ' + fmtCny(c.execTotal) + ' / 规划 ' + fmtCny(c.planCnyTotal) + '</span><span><i class="lg-mk"></i>目标</span><span><i class="lg-time"></i>时间进度 ' + fmtPct(c.timeProg) + '</span><span><i class="lg-fore"></i>预计年底（按配置里的安排）</span></div>'
    : '<div class="empty">还没有平台数据</div>') +
    (hitTxt ? '<div class="hit-line">' + hitTxt + '</div>' : '') +
    (c.snap ? '<div class="stats">' +
      '<div class="stat"><div class="lab">可支配</div><div class="val ' + (d && d.fund.short > 0 ? 'c-red' : '') + '">' + fmtCny(c.remainTotal) + '</div><div class="sub">IT外包 ' + fmtCny(itwRemain) + ' · OD ' + fmtCny(odRemain) + (d && d.od.excessOd > 10000 ? '<span style="color:var(--amber)"> · 多余 OD ' + fmtCny(d.od.excessOd) + '</span>' : '') + '</div></div>' +
      '<div class="stat"><div class="lab">在途冻结</div><div class="val ' + (c.poReturn > 0 ? 'c-amber' : '') + '">' + fmtCny(c.poFrozen) + '</div><div class="sub">' + c.openCnt + ' 张未关闭 · 返还 ' + fmtCny(c.poReturn) + (c.poExclFrozen > 0.5 ? ' · 另有剔除的 PO 冻结 ' + fmtCny(c.poExclFrozen) : '') + '</div></div>' +
      '<div class="stat"><div class="lab">到账进度</div><div class="val ' + grantCls + '">' + fmtPct(c.grantProg) + '</div><div class="sub">' + fmtCny(c.availTotal) + ' / ' + fmtCny(c.planCnyTotal) + '</div></div>' +
      '</div>' : '') +
    '<div class="notes-title">需要留意 <span class="muted">' + (ag.notes.length ? ag.notes.length + ' 条' : '') + '</span></div>' +
    (ag.notes.length ? ag.notes.map(([lv, tag, txt, to]) => '<div class="note ' + lv + '"><i>' + (lv === 'red' ? '!' : lv === 'amber' ? '·' : 'i') + '</i><div><b>' + tag + '</b>　' + txt + (to ? ' <a class="lnk" data-action="goto:anchor" data-target="' + to + '">看</a>' : '') + '</div></div>').join('')
      : '<div class="note ok"><i>✓</i><div>没有需要留意的问题</div></div>');
}

// 本周期操作：下 PO 的比例表（照着填）→ OD 扣减与调拨 → 年底资金安排（11、12 月）→ 分来源推演表。
// 这里的预算项一律用 IT 系统里的名字（在系统里操作时能直接对上）
const tileK = (label, val, note, cls) => '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value ' + (cls || '') + '">' + val + '</div><div class="kpi-sub">' + note + '</div></div>';
function renderOps(c, d, m) {
  const box = $('#poDecisionBox'), sub = $('#poDecisionSub');
  if (!d) { sub.textContent = ''; box.innerHTML = '<div class="empty">' + (c.curM > 12 ? '本年度已结束，没有待下的 PO。' : '导入执行表和 PO 明细后，这里给出下 PO 的金额和比例。') + '</div>'; return; }
  const P = d.po, J = d.jan, O = d.od, I = d.inflight;
  sub.textContent = (d.isDec ? '12 月下旬下 1 月 PO' : P ? (P.issued > 0.5 ? (P.toIssue > 0 ? P.nextM + ' 月 PO 已下 ' + fmtCny(P.issued) + '，还差 ' + fmtCny(P.toIssue) : P.nextM + ' 月 PO 已下 ' + fmtCny(P.issued) + '，不用再下') : '为 ' + P.nextM + ' 月 PO（' + P.wd + ' 个工作日）') : '') + (c.snap ? ' · 数据截至 ' + c.snap.date : '');
  const rowBy = {}; d.rows.forEach(r => { if (r.code) rowBy[r.code] = r; });
  const decName = x => (rowBy[x.code] && rowBy[x.code].decName) || x.name || x.code;   // 决策里用 IT 系统里的预算项名（在系统里操作时能直接对上）
  const planHtml = () => d.planAhead.length
    ? '<div class="ins-sub plan-ahead">已计入变动计划：' + d.planAhead.map(p => esc(p.ym.slice(2).replace('-', '年')) + '月' + (p.end ? '–' + esc(p.end.slice(2).replace('-', '年')) + '月前 ' : ' ') + p.kind.toUpperCase() + ' ' + (p.count > 0 ? '+' : '') + p.count + ' 人' + (p.end ? '（临时）' : '') + '（' + (p.kind === 'po' ? '日' : '月') + '单价 ' + fmtCny(p.rate) + '）' + (p.note ? '·' + esc(p.note) : '')).join('；') + '</div>'
    : '';
  // 标记：要把 OD 额度调回 IT外包 的钱包、被拆到两张 PO 的钱包；1 月 PO 里要等验收返还的钱
  const flagHtml = x => (x.odBack > 0.5 ? '<span class="flag">〔先把 ' + fmtCny(x.odBack) + ' 的 OD 额度调回 IT外包〕</span>' : '') +
    (x.split ? '<span class="flag">〔同时出现在两张 PO〕</span>' : '');
  const refTag = x => (x.fromCur ? '<span class="flag wait">（要等 11 月的 PO 12 月下旬验收返还）</span>' : (x.fromRef ? '<span class="sub">（验收返还后才有）</span>' : ''));
  /* 比例表：和在系统里下 PO 时填的一样，分两层——先按花钱项目分（占这张 PO），项目内再按预算项分（占该项目） */
  const poTableHtml = p => {
    if (!p.projGroups || !p.projGroups.length) return '<div class="ins-sub" style="color:var(--red)">没有可用的钱包</div>';
    const tot = p.total || sum(p.alloc || [], x => x.amt);
    let rows = '';
    p.projGroups.forEach(g => {
      g.items.forEach((x, xi) => {
        rows += '<tr' + (xi === 0 ? ' class="first"' : '') + '>' +
          (c.hasProj && xi === 0 ? '<td rowspan="' + g.items.length + '" class="po-proj"><b>' + esc(g.proj || '—') + '</b><div class="sub">' + pctTxt(g.pct) + '</div></td>' : '') +
          '<td>' + esc(x.name || x.code) + flagHtml(x) + refTag(x) + '</td>' +
          '<td class="num"><b>' + fmtCny(x.amt) + '</b></td>' +
          '<td class="num">' + pctTxt(g.amt > 0 ? x.amt / g.amt : 0) + '</td>' +
          (c.hasProj ? '<td class="num sub">' + pctTxt(tot > 0 ? x.amt / tot : 0) + '</td>' : '') + '</tr>';
      });
    });
    return '<div class="tbl-wrap"><table class="tbl tbl-po"><thead><tr>' + (c.hasProj ? '<th>花钱项目<div class="sub">占这张 PO</div></th>' : '') + '<th>预算项（系统里的名字）</th><th class="num">金额</th><th class="num">占该项目</th>' + (c.hasProj ? '<th class="num">占这张 PO</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  };
  const partHtml = p => {
    const tot = p.total != null ? p.total : sum(p.alloc, x => x.amt);
    return '<div class="po-part"><div class="po-part-head"><b>' + esc(p.label || '本次 PO') + '</b><span class="po-amt">' + fmtCny(p.toIssue) + '</span><span class="sub">' + p.hc + ' 人 · 日额 ' + fmtCny(p.daily) + '</span></div>' +
      poTableHtml(p) +
      (tot < p.toIssue - 1000 ? '<div class="ins-sub bad">还差 ' + fmtCny(p.toIssue - tot) + ' 没有钱可出</div>' : '') + '</div>';
  };
  const partsHtml = parts => (parts && parts.length)
    ? '<div class="ins-sub">按人员归属分 <b>' + parts.length + '</b> 张下（同一个预算项尽量只放在一张 PO 里）</div>' + parts.map(partHtml).join('')
    : '';
  const allocHtml = items => {   // 没有按归属分张：只列一张表
    const ms = mergeW(items);
    if (!ms.length) return '';
    const gs = {};
    ms.forEach(x => { const g = gs[x.proj || ''] = gs[x.proj || ''] || { proj: x.proj || '', amt: 0, items: [] }; g.amt += x.amt; g.items.push(x); });
    const tot = sum(ms, x => x.amt);
    const groups = Object.values(gs).sort((a, b) => b.amt - a.amt);
    groups.forEach(g => { g.items.sort((a, b) => b.amt - a.amt); g.pct = tot > 0 ? g.amt / tot : 0; });
    return poTableHtml({ projGroups: groups, total: tot });
  };
  const odAllOk = O.plans.every(p => p.other <= 0.5 && p.left <= 0.5);   // 往后每个月的扣减都能只落在锚定项目
  // 建议金额的来由：消耗（日额 × 工作日 + 上线周加班，乘出勤系数）+ 安全垫
  const howTxt = x => !c.team.hasPoCfg
    ? '来由：没有 PO 团队配置，按近 3 月的实际月均 × 按工作日折算 = ' + fmtCny(x.expect) + '，加安全垫 ' + fmtCny(x.cushion) + '（半天）= <b>' + fmtCny(x.need) + '</b>——把团队 Excel 放进数据集根目录，就会改用人数 × 单价来算'
    : '来由：（日额 ' + fmtCny(x.daily) + ' × ' + x.wd + ' 个工作日' + (x.ot > 0 ? ' ＋ 上线周加班 ' + fmtCny(x.ot) : '') + '）× 出勤 <b>' + x.attend.v.toFixed(3) + '</b> = ' + fmtCny(x.expect) +
    '，加安全垫 <b>' + fmtCny(x.cushion) + '</b>（' + (x.attend.auto ? '半天日额' : '一天日额') + '）= <b>' + fmtCny(x.need) + '</b>' +
    '<span class="muted">　｜　' + (x.attend.auto ? '出勤从近 ' + x.attend.months.length + ' 个' + (x.fest ? '过年月份' : '平月') + '的实际反推' + (x.fest ? '' : '')
      : x.attend.bad ? '<span class="bad">实际数和理论差得太离谱，先核对数据；出勤暂用参数里的值</span>' : (x.fest ? '过年前后集中调休，出勤单独记；' : '') + '这类月份还没有实际数，出勤用参数里的值') +
    ((x.histNext || x.hist) > 0 ? '　｜　近 3 月实际月均按工作日折算 ' + fmtCny(x.histNext || x.hist) : '') + '</span>';
  let html = '';
  /* ---- 年底预演（年中起）：按现在的安排推到 12 月 31 日会是什么样，让人早点知道往哪个方向调 ---- */
  if (c.curM >= 7 && c.curM <= 10) {
    const miss = d.rows.filter(r => r.assessed && !r.hit), allOd = O.plans.concat([{ mo: c.curM, left: O.curShort, otherProj: O.curOtherProj }]), nm = allOd.filter(p => p.left > 0.5), sp = allOd.filter(p => p.otherProj.length);
    html += '<div class="preview-line"><b>年底预演</b><span class="muted">（按现在的安排推到 12 月 31 日）</span>　考核来源 <b>' + d.hit + '/' + d.assessed + '</b> 能达标' +
      (miss.length ? '：' + miss.map(r => esc(r.name) + ' 差 ' + fmtCny(r.short)).join('、') : ' ✓') +
      '　｜　OD 扣减 ' + (nm.length ? '<span class="bad">' + nm.map(p => p.mo + ' 月有 ' + fmtCny(p.left) + ' 没有钱扣').join('、') + '</span>' : '都有钱' + (sp.length ? '，' + sp.map(p => p.mo + ' 月要挂到 ' + (p.otherProj.length + 1) + ' 个项目').join('、') : '，都能只挂一个项目')) +
      (d.yearEnd ? '　｜　留给 1 月 PO <b>' + fmtCny(J.reserve) + '</b>' + (J.short > 0.5 ? '，<span class="bad">缺 ' + fmtCny(J.short) + '</span>' : ' ✓ 够') : '') +
      '<span class="muted">　详见下方 ② 和推演表</span></div>';
  }
  /* ---- 年底测算（11、12 月，替代上面的「年底预演」）。用户 2026-11-28：12 月的 PO 已经下了，就要按现在的情况告诉他——
         到年底还要花多少钱、冻结的钱回来以后还有多少花不了。数字全部出自推演；数据有问题也照样给数，只是标出来 ---- */
  if (c.curM >= 11 && c.curM <= 12 && d.yearPlan) {
    const YP = d.yearPlan, nov = c.curM === 11, R = YP.rest, rf = YP.refund;
    const refundAll = YP.refundPast + YP.refundCur, refundYear = Math.max(0, refundAll - rf.od);   // 返还的钱里今年花不了的
    const poN = P ? new Set(P.issuedList.map(x => x.poNo)).size : 0;
    const poSt = nov && P
      ? (P.issued > 0.5 ? (P.toIssue > 0 ? '<span class="warn">已下 ' + fmtCny(P.issued) + (poN ? '（' + poN + ' 张）' : '') + '，<b>还差 ' + fmtCny(P.toIssue) + '</b></span>' : '<span style="color:var(--green)">已下 <b>' + fmtCny(P.issued) + '</b>' + (poN ? '（' + poN + ' 张）' : '') + '，不用再下 ✓</span>')
                        : '<span class="bad">还没下：要下 <b>' + fmtCny(P.toIssue) + '</b></span>')
      : '已在执行，预计执行 ' + fmtCny(YP.poWill);
    const cs = d.fund.cash.short, evs = d.fund.cash.events, minEv = evs.length ? evs.reduce((m, e) => e.avail < m.avail ? e : m, evs[0]) : null;
    const leftPart = R.total - YP.poIssued;   // 到年底还要花的里面，还没冻结、要靠现在的钱和返还来出的部分
    const issues = [].concat(c.checks.length ? ['两表不符 ' + c.checks.length + ' 项'] : [], (c.team.hasPoCfg && (c.team.attN.bad || c.team.attF.bad)) ? ['团队配置和实际对不上'] : [], (d.poNoFc && d.poNoFc.length) ? ['有 ' + d.poNoFc.length + ' 张 PO 认不出属于哪个月'] : []);
    html += '<div class="preview-line ye-calc" id="opsYeCalc"><b>年底测算</b><span class="muted">（按现在的情况推到 12 月 31 日）</span>' +
      '<div class="yc-row"><span class="yc-k">12 月 PO</span><span>' + poSt + (YP.poIssued > 0.5 ? '　<span class="muted">钱已冻结，年底预计执行 ' + fmtCny(YP.poWill) + '</span>' : '') + '</span></div>' +
      '<div class="yc-row"><span class="yc-k">到年底还要花</span><span><b>' + fmtCny(R.total) + '</b>　＝　' + (nov && R.odCur > 0.5 ? '11 月底 OD ' + fmtCny(R.odCur) + '　＋　' : '') + '12 月 PO 执行 ' + fmtCny(R.po) + '　＋　年终清算 ' + fmtCny(R.odDec) + (c.odYearEnd.manual > 0 ? '（按你的测算）' : '') + '</span></div>' +
      '<div class="yc-row"><span class="yc-k">钱从哪来</span><span>' + (YP.poIssued > 0.5 ? '12 月 PO 的 ' + fmtCny(YP.poIssued) + ' 已冻结；其余 <b>' + fmtCny(leftPart) + '</b> 用 ' : '') +
        '现在可支配 ' + fmtCny(YP.have) + '　＋　冻结返还 ' + fmtCny(refundAll) + '（12-15 前 ' + fmtCny(YP.refundPast) + '、12 月下旬 ' + fmtCny(YP.refundCur) + '）　→　' +
        (cs ? '<span class="bad">不够：到 ' + esc(cs.when) + '（' + esc(cs.label) + '）时差 <b>' + fmtCny(cs.short) + '</b></span>' : '<span style="color:var(--green)">够 ✓</span>' + (minEv ? '，最紧的时候（' + esc(minEv.when) + '）手里还有 ' + fmtCny(minEv.avail) : '')) + '</span></div>' +
      '<div class="yc-row"><span class="yc-k">冻结的钱</span><span>现在冻着 <b>' + fmtCny(c.poFrozen) + '</b>（' + c.openCnt + ' 张）：会执行掉 ' + fmtCny(c.poWillExec) + '，验收后返还 <b>' + fmtCny(c.poReturn) + '</b>' +
        (d.poNoFc.length ? '，<span class="warn">另有 ' + fmtCny(sum(d.poNoFc, g => g.amount)) + '（' + d.poNoFc.length + ' 张）认不出属于哪个月，先核对</span>' : '') +
        (refundAll > 500 ? '<div class="sub">返还的 ' + fmtCny(refundAll) + '：年终清算花掉 ' + fmtCny(rf.od) + '；<b>' + fmtCny(refundYear) + ' 今年花不了</b>' + (rf.jan > 500 ? '——其中 ' + fmtCny(rf.jan) + ' 能留给 1 月 PO' : '') + (rf.idle > 500 ? '，<span class="warn">' + fmtCny(rf.idle) + ' 连 1 月也用不上</span>' : '') + '</div>' : '') + '</span></div>' +
      '<div class="yc-row"><span class="yc-k">年底结算后</span><span>手里剩 <b>' + fmtCny(YP.leftTotal) + '</b>：留给 1 月 PO ' + fmtCny(J.reserve) + '（团队 1 月要 ' + fmtCny(J.need) + (J.short > 0.5 ? '，<span class="bad">缺 ' + fmtCny(J.short) + '</span>' : ' ✓ 够') + '）' +
        (d.unspent > 1000 ? '　｜　<span class="warn">花不掉 ' + fmtCny(d.unspent) + '</span>' : '') +
        (d.short.total > 0.5 ? '　｜　<span class="bad">' + (d.assessed - d.hit) + ' 个来源到不了目标，差 ' + fmtCny(d.short.total) + '</span>' : '　｜　<span style="color:var(--green)">考核来源都能达标 ✓</span>') + '</span></div>' +
      (issues.length ? '<div class="yc-row"><span class="yc-k">先核对</span><span class="bad">⚠ ' + issues.join('、') + '——上面的数是按现在的数据算的，核对后会更准</span></div>' : '') +
      '</div>';
  }
  /* ① PO */
  if (d.isDec) {
    html += '<div class="ins" id="opsPo"><div class="ins-head">① 下旬下 <b>1 月 PO</b>：<b class="big">' + fmtCny(J.toIssue) + '</b></div>' +
      '<div class="ins-sub">' + howTxt(J) + '</div>' +
      (partsHtml(J.parts) || allocHtml(J.alloc)) +
      (J.odBackTotal > 0.5 ? '<div class="ins-sub warn">⚠ 下这张 PO 前，先把 <b>' + fmtCny(J.odBackTotal) + '</b> 的 OD 额度调回 IT外包（标〔〕的那些预算项）</div>' : '') +
      (!J.alloc.length && J.toIssue > 0 ? '<div class="ins-sub bad">没有可用的钱——达标后的结余不够</div>' : '') + planHtml() +
      '<div class="ins-sub">' + (J.short > 0 ? '<span style="color:var(--red)">1 月 PO 缺 ' + fmtCny(J.short) + '：调低任一考核来源的目标 ' + fmtCny(J.short) + ' 即可补足（目标由你权衡）</span>' : '✓ 今年的结余够 1 月整月，团队不断档') +
      (J.fromRefund > 0 ? '　｜　其中 ' + fmtCny(J.fromRefund) + ' 要等往月 PO 在 12 月 15 日前验收返还' : '') + (J.fromCur > 0 ? '，' + fmtCny(J.fromCur) + ' 要等 11 月的 PO 在 12 月下旬验收返还' : '') + '</div></div>';
  } else if (P) {
    const basis = howTxt(P);
    const late = c.today.m === c.curM && c.today.d > 20;   // 过了 20 号（下单的日子）
    // "已下"是哪几张 PO：服务期覆盖下月、已经提前下的 PO 会从下月的 PO 金额里扣掉；不属于团队月度消耗的可以在这里直接剔除出决策
    const issuedHtml = (() => {
      if (!(P.issued > 0 && P.issuedList.length)) return '';
      const gp = {};
      P.issuedList.forEach(x => { const o = gp[x.poNo] = gp[x.poNo] || { poNo: x.poNo, name: x.name, start: x.start, end: x.end, amt: 0 }; o.amt += x.amt; });
      return '<div class="ins-sub">已下 ' + fmtCny(P.issued) + '，来自：' + Object.values(gp).map(x =>
        '<span class="issued"><b>' + esc(x.poNo) + '</b><span class="muted">' + (x.name ? '（' + esc(x.name) + (x.start ? '，' : '') : '') + (x.start ? esc(x.start) + (x.end && x.end !== x.start ? ' ~ ' + esc(x.end) : '') : '') + (x.name ? '）' : '') + '</span> ' + fmtCny(x.amt) +
        ' <button class="btn small" data-action="po:exclAdd" data-key="' + esc(x.poNo) + '" title="不参与 PO 台账/在途冻结/建议的 PO（挂靠、非团队月度消耗）：整张剔除，已执行额仍计入执行率">剔除出决策</button></span>').join('、') +
        '<div class="sub">' + (P.toIssue > 0 ? P.nextM + ' 月 PO：已下 ' + fmtCny(P.issued) + '　＋　这次补 ' + fmtCny(P.toIssue) : '') + '（这些 PO 的服务期覆盖 ' + P.nextM + ' 月，系统把它们 ' + P.nextM + ' 月的预测算作已经提前下）' +
        '<details class="fold" style="margin-top:2px"><summary>怎么判断要不要剔除</summary><div class="ins-sub">这张 PO ' + P.nextM + ' 月的钱，是不是团队表里这些人 ' + P.nextM + ' 月消耗的一部分——是，扣掉就是对的；不是（别的人、别的用途、其实会退回），点「剔除出决策」——之后不再参与 PO 台账/冻结/建议，不抵你的 PO；<b>已执行的、以及它今年还会花掉的，都计入执行率</b>；可随时在 PO 台账恢复。</div></details></div></div>';
    })();
    if (P.toIssue <= 0) html += '<div class="ins ok" id="opsPo"><div class="ins-head">✓ ' + P.nextM + ' 月 PO 已下 ' + fmtCny(P.issued) + '，不用再下</div><div class="ins-sub">' +
      (P.issued < P.need - 1000 ? '比建议金额（' + fmtCny(P.need) + '）少 ' + fmtCny(P.need - P.issued) + '，在安全垫以内；团队 ' + P.nextM + ' 月的消耗约 ' + fmtCny(P.expect) : P.issued > P.need + 1000 ? '比建议金额（' + fmtCny(P.need) + '）多 ' + fmtCny(P.issued - P.need) + '，多下的部分验收后返还' : '和建议金额（' + fmtCny(P.need) + '）一致') + '</div>' + issuedHtml + planHtml() + '</div>';
    else html += '<div class="ins" id="opsPo">' +
      '<div class="ins-head">① ' + (late ? '尽快下' : '20 号前下') + ' <b>' + P.nextM + ' 月 PO</b>：<b class="big">' + fmtCny(P.toIssue) + '</b>' + (P.issued > 0 ? '<span class="muted">（已下 ' + fmtCny(P.issued) + '；按最新数据团队 ' + P.nextM + ' 月消耗约 ' + fmtCny(P.expect) + '，已下的不够——' + (late ? '可以在 ' + P.nextM + ' 月里补一张' : '把差额补上') + '）</span>' : '') + '</div>' +
      '<div class="ins-sub">' + basis + '</div>' + issuedHtml +
      ((P.parts && P.parts.length) ? partsHtml(P.parts)
        : (P.alloc.length ? allocHtml(P.alloc) : '<div class="ins-sub bad">可支配的钱不够，这张 PO 没有钱包可出' + (moneyWhy(c, d) ? '——' + moneyWhy(c, d) : '') + '</div>')) +
      (P.odBackTotal > 0.5 ? '<div class="ins-sub warn">⚠ 下这张 PO 前，先把 <b>' + fmtCny(P.odBackTotal) + '</b> 的 OD 额度调回 IT外包（不在 OD 挂的那个项目里、或后面的 OD 扣减用不到的额度，标〔〕的那些预算项）</div>' : '') +
      (P.tookReserve > 0.5 ? '<div class="ins-sub ' + (odAllOk ? '' : 'warn') + '">这张 PO 从 ' + esc(O.anchorNext) + ' 留给 OD 的钱里拿了 <b>' + fmtCny(P.tookReserve) + '</b>：有缺口的来源靠常规 OD 补不上，执行率优先' + (odAllOk ? '；后面的 OD 仍然挂得进去' : '；后面的 OD 怎么挂见 ②') + '</div>' : '') +
      (P.toIssue - P.funded > 1000 ? '<div class="ins-sub bad">其中 <b>' + fmtCny(Math.round((P.toIssue - P.funded) / 1000) * 1000) + '</b> 没有钱可出' + (moneyWhy(c, d) ? '——' + moneyWhy(c, d) : '') + '</div>' : '') + planHtml() +
      (!(P.parts && P.parts.length) ? '<div class="ins-sub muted">在团队 Excel 里加「PO归属」页签后，这里会按人员归属给出每张 PO 的金额和占比。</div>' : '') + '</div>';
  }
  /* 图（折着，展开才画）：各张 PO 的金额按预算来源拆色；各钱包本次出多少 / 出完还剩多少 */
  const chartParts = d.isDec ? J.parts : (P ? P.parts : null);
  const chartItems = d.isDec ? J.alloc : (P ? P.alloc : null);
  if (chartParts && chartParts.length && (d.isDec ? J.toIssue : (P ? P.toIssue : 0)) > 0) {
    const n1 = chartParts.length, n2 = Array.from(new Set((chartItems || []).map(x => x.code + '|' + x.proj))).length;
    const h = Math.max(96, Math.max(n1, n2) * 42 + 62);
    html += foldHtml('foldPoCharts', '图：各张 PO 的金额构成 · 各钱包出多少、还剩多少',
      '<div class="po-charts"><div><div class="po-chart-title">各张 PO 下多少 · 钱从哪些预算来源出</div><div class="chart-box" style="height:' + h + 'px"><canvas id="poSplitChart"></canvas></div></div>' +
      (n2 ? '<div><div class="po-chart-title">各钱包：本次出多少 · 出完还剩多少</div><div class="chart-box" style="height:' + h + 'px"><canvas id="poWalletChart"></canvas></div></div>' : '') + '</div>', false, 'sec');
  }
  /* ② OD：系统给出的挂法——每个月底那笔扣减挂在哪个花钱项目、从哪些预算项出（规则见 calc）：
       先花还有缺口的来源（年底先用验收返还），锚定项目里不够就去别的项目找，这部分就挂到那个项目上；缺口都补到了才花没缺口的来源。
       本月那笔是必做的，往后各月是预演 */
  const yes = v => v > 500 ? fmtCny(v) : '<span class="muted">—</span>';
  const srcTxt = (used, xferW, refundPast, refundCur) => {
    const parts = [];
    if (used > 500) parts.push('OD 额度 ' + fmtCny(used));
    if (xferW.length) parts.push('IT外包 调 ' + fmtCny(sum(xferW, x => x.amt)) + '<div class="sub">' + xferW.map(x => esc(shortName(x.name)) + ' ' + fmtCny(x.amt)).join('、') + '</div>');
    if (refundPast > 500) parts.push('验收返还 ' + fmtCny(refundPast) + '<div class="sub">往月 PO 的，12 月 15 日前到账；到账后转到 OD</div>');
    if (refundCur > 500) parts.push('<span class="warn">验收返还 ' + fmtCny(refundCur) + '</span><div class="sub warn">11 月 PO 多下的，12 月下旬才到；到账后转到 OD</div>');
    return parts.length ? parts.join('<br>') : '<span class="muted">—</span>';
  };
  const odStatus = (p, isCur) => {
    const tags = [];
    if (p.left > 0.5) tags.push('<span class="tag t-red">' + fmtCny(p.left) + ' 没有钱扣</span>');
    if (p.otherProj.length) tags.push('<span class="tag t-amber">挂到 ' + (p.otherProj.length + 1) + ' 个项目</span>');
    if (p.refundCur > 500) tags.push('<span class="tag t-amber">要等 11 月 PO 的钱</span>');
    if (!tags.length && isCur && O.curXferAll > 0.5) tags.push('<span class="tag t-amber">要调拨 ' + fmtCny(O.curXferAll) + '</span>');
    if (!tags.length) tags.push('<span class="tag t-green">' + (isCur ? '✓ 钱够，不用调' : '✓ 一个项目，钱够') + '</span>');
    return tags.join(' ');
  };
  const odRow = p => '<tr' + (p.mo === c.curM ? ' class="cur"' : '') + '><td><b>' + p.mo + ' 月底</b></td><td>' + odWhatOf(p.mo) + (p.temp > 0.5 ? '<div class="sub">含配置里的临时 OD ' + fmtCny(p.temp) + (p.tempHc ? '（' + p.tempHc + ' 人）' : '') + '</div>' : '') + '</td>' +
    '<td class="num"><b>' + fmtCny(p.need) + '</b></td>' +
    '<td>' + (c.hasProj ? '<b>' + esc(p.anchor) + '</b>' : '') + p.otherProj.map(x => '<div class="sub">另挂 <b>' + esc(x.proj) + '</b> ' + fmtCny(x.amt) + '</div>').join('') + '</td>' +
    '<td>' + srcTxt(p.usedAnchor, p.xferWallets, p.refundPast, p.refundCur) + '</td><td>' + odStatus(p, p.mo === c.curM) + '</td></tr>';
  const odRows = [];
  if (O.curNeed > 0) odRows.push(odRow({ mo: c.curM, need: O.curNeed, anchor: O.anchorCur, usedAnchor: O.curUsed, xferWallets: O.curWallets, refundPast: O.curRefundPast, refundCur: 0, otherProj: O.curOtherProj, left: O.curShort, temp: O.curTemp, tempHc: O.curTempHc }));
  O.plans.forEach(p => odRows.push(odRow(p)));
  const curSplit = O.curOtherProj.length > 0;
  const lateSum = sum(O.lateRefund, p => p.refundCur);
  const odSum = (O.curShort > 0.5 ? '<span style="color:var(--red)">本月缺 <b>' + fmtCny(O.curShort) + '</b>，没有钱扣</span>' : O.curNeed > 0 ? (O.curXferAll > 0.5 ? '本月要调 <b>' + fmtCny(O.curXferAll) + '</b>' : '本月 ✓ ' + (c.hasProj ? '挂在 ' + esc(O.anchorCur) + '，钱够' : '钱够，不用调')) : '本月没有扣减') +
    (O.plans.length ? '　｜　往后' + (O.futureNoMoney > 0.5 ? ' <span style="color:var(--red)">' + fmtCny(O.futureNoMoney) + ' 没有钱扣</span>' : ' ✓ 都有钱' + (O.futureXfer + O.futureRefund > 1000 ? (O.futureXfer <= 500 ? '（' + fmtCny(O.futureRefund) + ' 等验收返还到账后再转到 OD）' : '（要转到 OD ' + fmtCny(O.futureXfer + O.futureRefund) + (O.futureRefund > 500 ? '，其中 ' + fmtCny(O.futureRefund) + ' 等验收返还到账后再调' : '') + '）') : '')) +
      (O.splitMo.length ? '；<span class="warn">' + O.splitMo.map(p => p.mo + ' 月要挂到 ' + (p.otherProj.length + 1) + ' 个项目').join('、') + '</span>' : '') +
      (lateSum > 500 ? '；<span class="warn">' + O.lateRefund.map(p => p.mo + ' 月').join('、') + '有 ' + fmtCny(lateSum) + ' 要等 11 月 PO 的钱</span>' : '') +
      '（算到 ' + odLabelOf(O).replace(/（(.*)）$/, '，$1') + '）' : '');
  const an = p => (c.hasProj ? ' OD 挂的 <b>' + esc(p) + '</b> ' : '');
  html += foldHtml('opsOd', '② OD 怎么挂：' + odSum,
    '<div class="tbl-wrap" style="margin-top:6px"><table class="tbl tbl-od"><thead><tr><th>时间</th><th>扣什么</th><th class="num">要扣</th><th>挂在哪个项目</th><th>从哪些预算项出</th><th>状态</th></tr></thead><tbody>' + odRows.join('') + '</tbody></table></div>' +
    (lateSum > 500 ? '<div class="ins-sub warn" style="margin-top:6px">⚠ 时间很紧：年终清算里有 <b>' + fmtCny(lateSum) + '</b> 要等 11 月 PO 多下的部分验收返还（12 月下旬才到账）。赶得上 12 月 31 日的清算，但验收一拖过年底，这笔就没有钱扣。想稳一点：把往月 PO 的验收提到 11 月 20 日下 12 月 PO 之前（返还的钱直接进 12 月的 PO，不用靠 OD 花），或让 12 月的 PO 少从这些来源拿。</div>' : '') +
    (O.quotaOutside > 0.5 ? '<div class="ins-sub">不在' + an(O.anchorNext) + '里的 OD 额度还有 <b>' + fmtCny(O.quotaOutside) + '</b>' +
      (P && P.odBackTotal > 0.5 ? '：本次 PO 已安排从里面调回 ' + fmtCny(P.odBackTotal) + ' 到 IT外包（见比例表里标〔〕的预算项）' + (O.quotaOutside - P.odBackTotal > 0.5 ? '，剩下的 ' + fmtCny(O.quotaOutside - P.odBackTotal) + ' 这次用不上' : '') : '：这次 PO 用不上它，后面的 OD 扣减也用不到——下 1 月 PO 时再调回 IT外包') + '</div>' : '') +
    (O.excessOd > 10000 ? '<div class="ins-sub warn">多出 ' + fmtCny(O.excessOd) + ' 的 OD 额度年底前调回 IT外包，否则花不掉</div>' : '') +
    (c.hasProj ? '<div class="ins-sub">挂在哪个项目是系统选的（年底取"只能靠 OD 花的钱"最多的项目，平时取 OD 额度最多的）。想试别的项目可以在这里改，改了某个月，之后的月份都跟着用它，直到再改' +
      O.anchors.map(a => '：' + a.mo + ' 月 <select data-odanchor="' + a.mo + '">' + O.projList.map(pk => '<option value="' + esc(pk) + '"' + (pk === a.proj ? ' selected' : '') + '>' + esc(pk) + '</option>').join('') + '</select>').join('') + '</div>' : ''), O.curShort > 0.5 || O.curXferAll > 0.5 || curSplit);
  /* 钱够不够（折着）：按到账时间逐笔看。在途冻结的钱算进来，但按它回来的时间 */
  if (d.fund.cash.events.length) {
    const cs = d.fund.cash;
    html += foldHtml('opsCash', '钱够不够（按到账时间逐笔看）：' + (cs.short ? '<span style="color:var(--red)">' + esc(cs.short.when) + ' 差 <b>' + fmtCny(cs.short.short) + '</b></span>' : '✓ 到年底都够'),
      '<div class="tbl-wrap" style="margin-top:6px"><table class="tbl tbl-cash" style="max-width:900px"><thead><tr><th>时间</th><th>事</th><th class="num">支出</th><th class="num">到账</th><th class="num">之后手里</th></tr></thead><tbody>' +
      '<tr><td class="muted">现在</td><td>可支配</td><td class="num"><span class="muted">—</span></td><td class="num"><b>' + fmtCny(cs.start) + '</b></td><td class="num"><b>' + fmtCny(cs.start) + '</b></td></tr>' +
      cs.events.map(e => '<tr><td class="muted" style="white-space:nowrap">' + esc(e.when) + '</td><td>' + esc(e.label) + (e.note ? '<span class="muted">（' + esc(e.note) + '）</span>' : '') + '</td><td class="num">' + (e.out > 0.5 ? '− ' + fmtCny(e.out) : '<span class="muted">—</span>') + '</td><td class="num">' + (e.inn > 0.5 ? '+ ' + fmtCny(e.inn) : '<span class="muted">—</span>') + '</td><td class="num' + (e.avail < -500 ? ' bad' : '') + '"><b>' + fmtCny(e.avail) + '</b></td></tr>').join('') +
      '</tbody></table></div><div class="muted" style="margin-top:6px">在途冻结的钱按它回来的时间算：往月 PO 验收后返还（平时下个月，年底按 12 月 15 日前），11 月 PO 多下的部分 12 月下旬才回（已算上，但时间很紧）。剔除出决策的 PO 的冻结不算（默认别的团队会花掉）。1 月 PO 是最后的优先级，不在这里算。</div>', false, 'sec');
  }
  /* ③ 年底资金安排（11、12 月）：把从现在到明年 1 月的每一笔钱按排钱的先后摆在一起。
     排列顺序 = 钱的优先级（排在前面的先拿到钱）：团队的 PO → OD（本月、年底清算）→ 1 月 PO（用达标之后剩下的钱）→ 花不掉。
     达标缺口单列一行：按配置里的安排还差多少、钱在哪；系统不替用户假设还会再挂 OD */
  if (d.yearEnd) {
    const miss = d.rows.filter(r => r.assessed && !r.hit);
    const YP = d.yearPlan || { wallets: [], have: 0 };
    const nov = c.curM === 11;
    const wtag = (code, proj) => (c.hasProj && proj ? '<b>' + esc(proj) + '</b> / ' : '') + esc(decName({ code }));   // 钱包：花钱项目 / 系统里的预算项
    const walletsOf = f => YP.wallets.filter(w => f(w) > 0.5).map(w => wtag(w.code, w.proj) + ' ' + fmtCny(f(w))).join('、');
    const odFrom = pl => [
      pl.usedAnchor > 0.5 ? '已有 OD 额度 ' + fmtCny(pl.usedAnchor) : '',
      pl.temp > 0.5 ? '其中配置里的临时 OD <b>' + fmtCny(pl.temp) + '</b>' + (pl.tempHc ? '（' + pl.tempHc + ' 人）' : '') : '',
      pl.xferAnchor > 0.5 ? '从 IT外包 调 ' + fmtCny(pl.xferAnchor) + (pl.xferWallets.length ? '（' + pl.xferWallets.map(x => wtag(x.code, x.proj) + ' ' + fmtCny(x.amt)).join('、') + '）' : '') : '',
      pl.refundPast > 0.5 ? '验收返还 ' + fmtCny(pl.refundPast) + '（往月 PO 的，12 月 15 日前到账）' : '',
      pl.refundCur > 0.5 ? '<span class="warn">验收返还 ' + fmtCny(pl.refundCur) + '（11 月 PO 的，12 月下旬才到——时间很紧）</span>' : '',
      pl.otherProj.length ? '另挂到 ' + pl.otherProj.map(x => '<b>' + esc(x.proj) + '</b> ' + fmtCny(x.amt)).join('、') : '',
      pl.left > 0.5 ? '<span class="bad">' + fmtCny(pl.left) + ' 没有钱扣</span>' : ''
    ].filter(Boolean).join('；') + (c.hasProj && pl.anchor ? '　｜　挂在 <b>' + esc(pl.anchor) + '</b>' : '');
    const poNoMoney = (nov && P) ? P.unfunded : 0;   // 还要下的里面没有钱包可出的（已经下了的部分钱已冻结，不算）
    const odNoMoney = (YP.curOd ? YP.curOd.left : 0) + (YP.decOd ? YP.decOd.left : 0);
    const janUnfunded = Math.max(0, J.need - J.reserve);
    const steps = [];
    if (nov && P) {
      if (YP.poIssued > 0.5) steps.push({ when: '已下', title: '12 月 PO 已下（' + new Set(P.issuedList.map(x => x.poNo)).size + ' 张，钱已冻结）', amt: YP.poIssued, from: walletsOf(w => w.poIssued), note: '服务期覆盖 12 月，预计 12 月执行' });
      if (YP.poNext > 0.5) steps.push({ when: c.today.d > 20 ? '尽快' : '11-20', title: YP.poIssued > 0.5 ? '12 月 PO 还要补一张' : '下 12 月 PO（团队 12 月的消耗）', amt: YP.poNext, from: P.projs.length ? '从 ' + P.projs.map(x => '<b>' + esc(x) + '</b>').join('、') + ' 出' : '', note: '比例见 ①' + (poNoMoney > 0.5 ? '；<span class="bad">其中 ' + fmtCny(poNoMoney) + ' 没有钱可出</span>' : '') });
    }
    if (YP.curOd) steps.push({ when: c.curM + ' 月底', title: nov ? 'OD 扣 10 月的费用' : 'OD 年终清算（11 月 + 12 月 + 年终奖' + (c.odYearEnd.manual > 0 ? '，按你的测算' : '') + '）', amt: YP.curOd.need, from: odFrom(YP.curOd) });
    if (d.refundPast > 0.5) steps.push({ when: '12-15 前', title: '往月的 PO 验收，冻结的钱返还到账', amt: d.refundPast, from: walletsOf(w => w.refundPast), note: '到账后：转到 OD 可用于年终清算，也可用于 1 月 PO' });
    if (nov && d.refundCur > 0.5) steps.push({ when: '12 月下旬', title: '11 月这张 PO 多下的部分验收，返还到账', amt: d.refundCur, from: walletsOf(w => w.refundCur), note: '年终清算是月底才扣，赶得上但时间很紧；1 月 PO 要看下得早不早' });
    if (nov && YP.decOd) steps.push({ when: '12-31', title: 'OD 年终清算（11 月 + 12 月 + 年终奖' + (c.odYearEnd.manual > 0 ? '，按你的测算' : '') + '）', amt: YP.decOd.need, from: odFrom(YP.decOd) });
    if (d.short.total > 0.5) steps.push({ when: '年底', title: '按配置里的安排，这些来源到不了目标', amt: 0, gap: true,
      from: d.short.list.map(x => esc(x.name) + ' 差 <b>' + fmtCny(x.short) + '</b>' + (x.odAble > 1000 ? '（钱还在 ' + fmtCny(x.odAble) + '，只能靠 OD 花）' : '（钱不够）')).join('、'),
      note: (d.short.able > 1000 ? '钱还在的那部分：再挂约 ' + Math.ceil(d.short.able / Math.max(d.short.rate, 1)) + ' 个 OD，写进变动计划后自动计入上面的清算；' : '') + '钱不够的：还没到账的催 BA，其余调低目标或再挂 OD' });
    steps.push({ when: nov ? '12-20' : '现在', title: '下 1 月 PO（用达标之后剩下的钱）', amt: J.reserve, from: (J.parts && J.parts.length) ? J.parts.map(partHtml).join('') : allocHtml(J.alloc),
      note: '团队 1 月需要 ' + fmtCny(J.need) + (janUnfunded > 0.5 ? '，<b style="color:var(--red)">缺 ' + fmtCny(janUnfunded) + '</b>（只能满足 ' + (J.need > 0 ? Math.round(J.reserve / J.need * 100) : 0) + '%）' : '，✓ 够') + (J.odBackTotal > 0.5 ? '；其中 ' + fmtCny(J.odBackTotal) + ' 要先把 OD 额度调回 IT外包' : '') + (J.reserve - d.short.janAfterFill > 1000 ? '；达标缺口要是靠再挂 OD 补上，这里会少 ' + fmtCny(J.reserve - d.short.janAfterFill) : '') });
    if (d.unspent > 10000) steps.push({ when: '年底', title: '达标并留足 1 月后还花不掉的钱', amt: d.unspent, from: walletsOf(w => (!w.jan && w.left > 10000 ? w.left : 0)), note: '年底临时加 OD / 找别人花 / 调低目标' });
    const odMust = (YP.curOd ? YP.curOd.need : 0) + (YP.decOd ? YP.decOd.need : 0);
    const must = YP.poWill + odMust;   // 到年底还要花多少：12 月的 PO 将执行（已下的 ＋ 这次下的）＋ OD
    const moneyIn = d.refundPast + (nov ? d.refundCur : 0);
    const verdict = (poNoMoney + odNoMoney > 0.5)
      ? '<b style="color:var(--red)">钱不够：</b>' + [poNoMoney > 0.5 ? '12 月 PO 有 ' + fmtCny(poNoMoney) + ' 没有着落' : '', odNoMoney > 0.5 ? 'OD 有 ' + fmtCny(odNoMoney) + ' 没有钱扣' : ''].filter(Boolean).join('、') + '——' + (moneyWhy(c, d) || '钱都到了，是规划本身不够')
      : (janUnfunded > 0.5 ? '<b style="color:var(--amber)">今年的硬性支出都够</b>；留给 1 月的差 ' + fmtCny(janUnfunded) : '<b style="color:var(--green)">都够</b>');
    // 按钱包看：每个钱包的钱怎么进出（现在可用 ＋ 返还到账 − 各项支出 ＝ 年底剩余）
    const cols = [['12 月 PO 已下', w => w.poIssued], ['现在可用', w => w.now], ['返还到账', w => w.refundPast + w.refundCur]].concat(nov ? [['12 月 PO 这次下', w => w.po], ['OD 11 月', w => w.odCur], ['OD 年底清算', w => w.odDec]] : [['OD 年底清算', w => w.odCur]]).concat([['1 月 PO', w => w.jan], ['年底剩余', w => w.left]]);
    const ws = YP.wallets.filter(w => w.poIssued + w.now + w.refundPast + w.refundCur + w.po + w.odCur + w.odDec + w.jan > 0.5).sort((a, b) => (b.now + b.refundPast + b.refundCur) - (a.now + a.refundPast + a.refundCur));
    const n0 = v => v > 0.5 ? fmtCny(v) : '<span class="muted">—</span>';
    const rateCls = d.hit >= d.assessed ? 'c-green' : 'c-red';
    const yeSum = (poNoMoney + odNoMoney > 0.5 ? '<span style="color:var(--red)">钱不够 ' + fmtCny(poNoMoney + odNoMoney) + '</span>　｜　' : '') +
      '必须花 <b>' + fmtCny(must) + '</b>　＋　留 1 月 <b>' + fmtCny(J.reserve) + '</b>' + (janUnfunded > 0.5 ? '（<span style="color:var(--red)">1 月缺 ' + fmtCny(janUnfunded) + '</span>）' : '') +
      (d.short.total > 0.5 ? '　｜　<span class="' + (d.short.able > 1000 ? 'warn' : 'bad') + '">达标缺口 ' + fmtCny(d.short.total) + '</span>' : '');
    html += foldHtml('opsYear', '③ 年底资金安排（排到明年 1 月）：' + yeSum,
      '<div class="ye">' +
      '<div class="kpi-grid" style="margin-top:6px">' +
      tileK('达标来源', d.hit + ' / ' + d.assessed, miss.length ? '到不了目标：' + miss.slice(0, 3).map(r => esc(r.name) + ' 差 ' + fmtCny(r.short) + (r.odAble > 1000 ? '（钱还在）' : '')).join('、') + (miss.length > 3 ? '…' : '') : '全部达标 ✓', miss.length ? (d.short.able > 1000 ? 'c-amber' : 'c-red') : 'c-green') +
      tileK('预计总体执行率', fmtPct(c.forecastRate), '加权目标 ' + fmtPct(d.weightedTarget) + '　｜　按配置里的安排', rateCls) +
      tileK('留给 1 月的 PO', fmtCny(J.reserve), '团队 1 月需要 ' + fmtCny(J.need) + (janUnfunded > 0.5 ? '，<b style="color:var(--red)">缺 ' + fmtCny(janUnfunded) + '</b>' : ' ✓ 够') + (YP.janMax > 0.5 ? ' · 理论上限 ' + fmtCny(YP.janMax) : ''), janUnfunded > 0.5 ? 'c-amber' : 'c-green') +
      '</div>' +
      '<div class="ins-sub">总账：到年底还要花 <b>' + fmtCny(must) + '</b>（12 月 PO 将执行 ' + fmtCny(YP.poWill) + ' ＋ OD ' + fmtCny(odMust) + '）＋ 留给 1 月 <b>' + fmtCny(J.reserve) + '</b> ＝ <b>' + fmtCny(must + J.reserve) + '</b>；钱的来源：' + (YP.poIssued > 0.5 ? '12 月 PO 已冻结 ' + fmtCny(YP.poIssued) + ' ＋ ' : '') + '现在可用 ' + fmtCny(YP.have) + ' ＋ 验收返还 ' + fmtCny(moneyIn) + ' ＝ <b>' + fmtCny(YP.poIssued + YP.have + moneyIn) + '</b>。' + verdict + '</div>' +
      (YP.janMax > 0.5 ? '<div class="ins-sub muted">留给 1 月的钱 = 各来源达标之后的结余，理论上限 ' + fmtCny(YP.janMax) + '；其中约 ' + fmtCny(YP.beyond) + ' 被超出目标的执行占用（12 月的 PO、OD 超出目标的部分，今年必须花）。想给 1 月多留：调低某些来源的目标，或催 BA 把没到账的预算补齐。</div>' : '') +
      (c.curM >= 11 ? '<div class="ins-sub muted">明年的规划下来后：用顶栏切到明年 → 开启新年（复制今年的规划和参数，再改金额）→ 明年首页有「新年测算」（团队人数够不够、能留多少给后年 1 月）。1 月的 PO 按今年的结余下；到看 2 月的 PO 时，明年的预算还没到账看板会提醒。</div>' : '') +
      '<div class="tbl-wrap"><table class="tbl tbl-steps"><thead><tr><th>时间</th><th>动作</th><th class="num">金额</th><th>钱从哪来</th></tr></thead><tbody>' +
      steps.map(s => '<tr' + (s.gap ? ' class="gap-row"' : '') + '><td class="muted" style="white-space:nowrap">' + s.when + '</td><td><b>' + s.title + '</b></td><td class="num">' + (s.gap ? '<span class="muted">—</span>' : '<b>' + fmtCny(s.amt) + '</b>') + '</td><td>' + (s.from || '') + (s.note ? '<div class="muted" style="margin-top:2px">' + s.note + '</div>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>' +
      (ws.length ? '<details class="fold" id="foldYeWallets"' + (foldOpen.foldYeWallets ? ' open' : '') + '><summary>按钱包看（每个钱包的钱怎么进出）</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>钱包</th>' + cols.map(x => '<th class="num">' + x[0] + '</th>').join('') + '</tr></thead><tbody>' +
        ws.map(w => '<tr><td>' + wtag(w.code, w.proj) + '</td>' + cols.map(x => '<td class="num">' + n0(x[1](w)) + '</td>').join('') + '</tr>').join('') +
        '<tr style="font-weight:600"><td>合计</td>' + cols.map(x => '<td class="num">' + fmtCny(sum(ws, x[1])) + '</td>').join('') + '</tr></tbody></table></div>' +
        '<div class="muted" style="margin-top:6px">现在可用 ＋ 返还到账 − 各项支出 ＝ 年底剩余。返还的钱用在哪一步就计在哪一步。「12 月 PO 已下」的钱已经冻结，不在「现在可用」里，所以也不重复算支出，单列出来看。</div></details>' : '') +
      '</div>', false, 'sec');
  }
  /* 本月识别：在途 */
  if (I.fc > 0) html += '<div class="ins-sub identify">本月识别：在执行 PO 的预测合计 ' + fmtCny(I.fc) + '（' + I.bySrc.map(x => esc(shortName(x.name)) + ' ' + fmtCny(x.fc)).join('、') + '）→ 预计执行 <b>' + fmtCny(I.willExec) + '</b>' + (I.over > 0 ? '，多下 <b style="color:' + (I.over / I.fc > 0.05 ? 'var(--red)' : 'var(--amber)') + '">' + fmtCny(I.over) + '</b>（冻结，下月验收后返还）' : '') + (I.fc < I.need * 0.95 ? '，<b style="color:var(--red)">比团队需求少 ' + fmtCny(I.need - I.fc) + '</b>' : '') + '</div>';
  /* 分来源推演表（折着） */
  html += foldHtml('opsSim', '分来源推演表（' + d.rows.length + ' 个来源，从现在推到 12 月 31 日）',
    '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
    '<th>预算来源</th><th class="num">规划</th><th class="num">目标</th><th class="num">已执行</th><th class="num">在途将执行</th><th class="num">缺口</th><th class="num">可支配<div class="sub">另有冻结待返还</div></th>' +
    '<th class="num">后续PO<br><span class="sub">含本月</span></th><th class="num">OD<br><span class="sub">含调拨、返还</span></th><th class="num">1月PO</th><th class="num">年底预计</th><th>达标</th><th class="num">余量去向</th></tr></thead><tbody>' +
    d.rows.map(r => {
      const st = !r.assessed ? '<span class="muted">' + (r.unmatched ? '未关联' : '不考核') + '</span>' : r.notGranted ? '<span style="color:var(--red)">未到账</span>'
        : r.hit ? (r.rate > r.target + 0.02 ? '<span style="color:var(--green)">✓ 超出 ' + fmtPct(r.rate - r.target) + '</span>' : '<span style="color:var(--green)">✓</span>')
        : '<span style="color:var(--red)">✗ 差 ' + fmtCny(r.short) + '</span>' + (r.odAble > r.tol ? '<div class="sub warn">钱还在，只能靠 OD 花 ' + fmtCny(r.odAble) + '</div>' : '');
      const leftTxt = r.jan > 0 ? '留1月 ' + fmtCny(r.jan) : (r.left > 1000 ? '花不掉 ' + fmtCny(r.left) : '<span class="muted">—</span>');
      return '<tr' + (r.notGranted ? ' style="opacity:.7"' : '') + '><td><b>' + esc(r.name) + '</b>' + (r.platName && r.platName !== r.name ? '<div class="sub muted">系统：' + esc(r.platName) + '</div>' : '') + (c.hasProj && r.wallets.length > 1 ? '<div class="sub muted">' + r.wallets.map(w => esc(w.proj) + ' ' + fmtCny(w.itw + w.od)).join(' / ') + '</div>' : '') + '</td>' +
        '<td class="num">' + (r.planCny ? fmtCny(r.planCny) : '—') + '</td><td class="num">' + (r.target != null && r.assessed ? fmtPct(r.target) : '—') + '</td>' +
        '<td class="num">' + fmtCny(r.exec) + '</td><td class="num">' + (r.willExec + (r.exclExec || 0) > 0 ? fmtCny(r.willExec + (r.exclExec || 0)) : '<span class="muted">—</span>') + (r.exclExec > 0.5 ? '<span class="muted" title="其中 ' + fmtCny(r.exclExec) + ' 是剔除出决策的 PO 还会执行的（别的团队在花你的预算）"> *</span>' : '') + '</td><td class="num">' + (r.gap > 0 ? fmtCny(r.gap) : '<span class="muted">—</span>') + '</td>' +
        '<td class="num">' + fmtCny(r.funds) + (r.refund > 500 ? '<div class="sub">+ ' + fmtCny(r.refund) + '</div>' : '') + '</td>' +
        '<td class="num">' + (r.po > 0 ? fmtCny(r.po) : '<span class="muted">—</span>') + (r.poNext > 0 ? '<div class="sub">本月 ' + fmtCny(r.poNext) + '</div>' : '') + '</td><td class="num">' + (r.odExec > 0 ? fmtCny(r.odExec) : '<span class="muted">—</span>') + '</td><td class="num">' + (r.jan > 0 ? fmtCny(r.jan) : '<span class="muted">—</span>') + '</td>' +
        '<td class="num">' + (r.planCny ? fmtPct(r.rate) : '—') + '</td><td>' + st + '</td><td class="num">' + leftTxt + '</td></tr>';
    }).join('') +
    '</tbody></table></div><div class="muted" style="margin-top:6px">缺口 = 规划×目标 − 已执行 − 在途将执行。后续 PO 和 OD 都先花还有缺口的来源（缺口大的优先），缺口补齐了才花别的来源；OD 在年底先用验收返还（这笔钱只有 OD 这一条路）；1 月 PO 用达标之后的 IT外包 结余。达标与否按配置里的安排算，配置里没有的 OD 不替你假设。' + (d.exclExec > 0.5 ? ' 带 * 的「在途将执行」含剔除出决策的 PO 还会执行的 <b>' + fmtCny(d.exclExec) + '</b>：别的团队在花你的预算，计入该来源的年底执行，但不抵团队的月度 PO。' : '') + '</div>', false, 'sec');
  box.innerHTML = html;
}
// 提醒窗口的终点：1–4 月 → 5 月底；5–6 月 → 6 月底；7–10 月 → 10 月底；11–12 月 → 年底
const odLabelOf = O => O.winEnd === 5 ? '5 月底' : O.winEnd === 6 ? '6 月底（含上半年清算）' : O.winEnd === 10 ? '10 月底' : '12 月底（含年终清算）';

// 来源健康度：一个 IT 预算项一行，按严重程度排——到不了目标（红）→ 差一点钱还在 / 规划里没有对应项（黄）→ 达标（绿）→ 不考核（灰）
// 首页只展开有问题的，正常的折在下面；预算来源页整张展开（opts.full），多列规划金额、到账和执行的拆分
// 执行按 IT 预算项看（钱从 IT 预算项出，年底考核也看它）；到账按规划看——一对一的在行内写，多对一的每条规划一行
// 一对一时主名用年初规划里的名字（熟悉），并标出系统里对应哪一项；多对一时主名用系统名
let healthOpen = false;
function healthRows(c, d) {
  const items = d.rows.map(r => {
    let g, tag;   // g：0 红　1 黄　2 绿　3 灰
    if (r.unmatched) { g = 1; tag = ['t-amber', '规划里没有']; }
    else if (!r.assessed) { g = 3; tag = ['t-gray', r.notGranted ? '还没到账 · 不考核' : '不考核']; }
    else if (r.hit) { g = 2; tag = ['t-green', '✓ 达标']; }
    else if (r.short - r.odAble <= r.tol) { g = 1; tag = ['t-amber', '差一点 · 钱还在']; }
    else { g = 0; tag = ['t-red', '到不了目标']; }
    return { r, g, tag };
  });
  return items.sort((a, b) => a.g - b.g || (b.r.short || 0) - (a.r.short || 0));
}
// 一个 IT 预算项两根细条，条的总长 = 规划金额。
// 上面看执行：已执行 → 在途将执行 → 已安排到年底（PO + OD）；到目标线之间还差的部分画成斜纹，绿线是目标
// 下面看到账：已到账（其中冻结待返还画成灰点）；没到账的部分是浅色斜线
function srcBar(r, c) {
  if (!r.planCny) return '<span class="muted">—</span>';
  const s = c.per[r.code], granted = s ? s.avail : 0, pc = r.planCny;
  const sc = barScale(1, r.rate || 0, granted / pc);
  const pos = v => (Math.max(0, Math.min(sc, v)) / sc * 100).toFixed(1) + '%';
  const w = v => (Math.max(0, Math.min(sc, v)) / sc * 100).toFixed(1) + '%';
  const inflight = r.willExec + (r.exclExec || 0);
  return '<div class="sbar">' +
    '<div class="sb exe">' +
      '<div class="l a" style="width:' + w(r.exec / pc) + '" title="已执行 ' + fmtCny(r.exec) + '"></div>' +
      '<div class="l b" style="left:' + pos(r.exec / pc) + ';width:' + w(inflight / pc) + '" title="在途将执行 ' + fmtCny(inflight) + '"></div>' +
      '<div class="l c" style="left:' + pos((r.exec + inflight) / pc) + ';width:' + w((r.po + r.odExec) / pc) + '" title="已安排到年底（PO ' + fmtCny(r.po) + ' + OD ' + fmtCny(r.odExec) + '）"></div>' +
      (r.assessed && !r.hit ? '<div class="l d" style="left:' + pos(r.endExec / pc) + ';width:' + w(Math.min(r.short, r.target * pc - r.endExec) / pc) + '" title="还差 ' + fmtCny(r.short) + '（到目标线）"></div>' : '') +
      (r.assessed ? '<div class="mk" style="left:' + pos(r.target) + '" title="目标 ' + fmtPct(r.target) + '"></div>' : '') +
    '</div>' +
    '<div class="sb gr">' +
      '<div class="l e" style="width:' + w(granted / pc) + '" title="已到账 ' + fmtCny(granted) + '（规划 ' + fmtCny(pc) + '）"></div>' +
      (r.refund > 500 ? '<div class="l f" style="left:' + pos((granted - r.refund) / pc) + ';width:' + w(Math.min(r.refund, granted) / pc) + '" title="其中冻结待返还 ' + fmtCny(r.refund) + '"></div>' : '') +
      (granted < pc - 500 ? '<div class="l u" style="left:' + pos(granted / pc) + ';width:' + w((pc - granted) / pc) + '" title="还没到账 ' + fmtCny(pc - granted) + '"></div>' : '') +
    '</div></div>';
}
function srcHealthHtml(c, d, opts) {
  opts = opts || {};
  if (!d) return '<div class="empty">' + (c.curM > 12 ? '本年度已结束。' : '导入执行表后，这里按 IT 预算项列出目标、预计年底和还差多少。') + '</div>';
  const items = healthRows(c, d);
  const inherit = code => !!(code && c.per[code] && c.per[code].targetInherit);
  const cnt = g => items.filter(x => x.g === g).length;
  const full = !!opts.full, open = full || healthOpen;
  const planLink = (pid, nm) => '<a class="lnk" data-action="goto:anchor" data-target="plan-' + esc(pid) + '" title="点到年初规划表里改（名称、金额、目标、挂在哪个 IT 预算项）">' + esc(nm) + '</a>';
  // 到不了目标时，差的钱属于哪一种（按先后拆）：还没到账（催 BA）→ 还在这个 IT 预算项里、只能靠 OD 花 → 钱都到了也不够
  const whyShort = r => {
    const bits = [];
    let need = r.short;
    const a = Math.min(need, r.un || 0); need -= a;
    const b = Math.min(need, r.odAble); need -= b;
    if (a > r.tol) bits.push('<b>' + fmtCny(a) + '</b> 还没到账——催 BA');
    if (b > r.tol) bits.push('<b>' + fmtCny(b) + '</b> 还在这个 IT 预算项里' + (r.refund > 500 ? '（其中 ' + fmtCny(Math.min(r.refund, b)) + ' 冻在 PO 里，验收后回来）' : '') + '，只能靠再挂 OD 花');
    if (need > r.tol) bits.push('<b>' + fmtCny(need) + '</b> 钱都到了也不够——调低目标');
    return '差的钱：' + bits.join('；');
  };
  const rowHtml = x => {
    const r = x.r, s = r.code && c.per[r.code], now = r.planCny ? r.exec / r.planCny : null;
    const subPlans = r.plan ? (r.plan.merged ? r.plan.plans : [r.plan]) : [];
    const wallets = r.wallets.map(w => (c.hasProj ? '<b>' + esc(w.proj) + '</b> ' : '') + 'IT外包 ' + fmtCny(w.itw) + (w.od > 500 ? ' · OD ' + fmtCny(w.od) : '')).join('<br>');
    let main;
    if (!r.assessed) main = '<span class="muted">' + (r.unmatched ? '新增一条规划挂上以后才有目标' : '不考核') + '</span>';
    else if (r.notGranted) main = '<b>' + fmtPct(r.target) + '</b> → <span class="muted">平台上还没出现</span>' + (r.un > r.tol ? '<div class="sub bad">规划了 ' + fmtCny(r.un) + ' 还没到账——催 BA</div>' : '');
    else {
      const how = r.hit ? (r.rate > r.target + 0.02 ? '<div class="sub">✓ 达标，超出目标 ' + fmtPct(r.rate - r.target) + '</div>' : '<div class="sub" style="color:var(--green)">✓ 达标</div>')
        : (r.short - r.odAble <= r.tol ? '<div class="sub warn">差的钱都在这个 IT 预算项里，12 月的 PO 下了之后只能靠 OD 花——再挂 OD 就能补平</div>'
        : '<div class="sub bad">' + whyShort(r) + '</div>');
      main = '<b>' + fmtPct(r.target) + (inherit(r.code) ? '<span class="muted">·默认</span>' : '') + '</b> → <b class="' + (r.hit ? '' : 'bad') + '">' + fmtPct(r.rate) + '</b>' + (r.hit ? '' : '　差 <b class="bad">' + fmtCny(r.short) + '</b>') + how;
    }
    // 名字：一对一用规划名（点得动，跳到年初规划表）；多对一用系统名，下面每条规划一行；规划里没有的给出「新增」「剔除」
    let nameCell;
    if (r.unmatched) nameCell = '<b>' + esc(r.platName || r.name) + '</b><div class="sub muted">IT 预算项 ' + esc(r.code) + '</div>' +
      (c.snap ? '<div class="btn-row" style="margin-top:4px">' + smallBtn('plan:newCode', '＋ 新增规划', '', ' data-id="' + esc(r.code) + '" title="是我的预算：新增一条规划，挂到这个 IT 预算项上"') + smallBtn('excl:add', '剔除', 'ghost', ' data-id="' + esc(r.code) + '" title="不是我的预算：整个来源不参与计算"') + '</div>' : '');
    else if (r.plan && r.plan.merged) nameCell = '<b>' + esc(r.platName) + '</b><div class="sub muted">IT 预算项 ' + esc(r.code) + ' · 挂着 ' + subPlans.length + ' 条规划</div>';
    else nameCell = (r.plan ? planLink(r.plan.id, r.name) : '<b>' + esc(r.name) + '</b>') +
      (r.platName && r.platName !== r.name ? '<div class="sub">系统：' + esc(r.platName) + (r.code ? ' [' + esc(r.code) + ']' : '') + '</div>' : (r.code ? '<div class="sub muted">IT 预算项 ' + esc(r.code) + '</div>' : ''));
    // 首页（窄表）只在还有钱没到账时写一行到账情况
    let grantLine = '';
    if (!full && c.snap && subPlans.length && r.un > r.tol) {
      const gs = subPlans.map(p => d.planGrant[p.id]).filter(Boolean), noSplit = gs.some(g => !g.split);
      grantLine = subPlans.length > 1
        ? '<div class="sub bad">规划：' + subPlans.map(p => { const g = d.planGrant[p.id]; return esc(p.name) + (g && g.split ? '（未到账 ' + fmtCny(g.un) + '）' : ''); }).join('、') + (noSplit ? '　合计未到账 <b>' + fmtCny(r.un) + '</b>' : '') + '</div>'
        : (gs.length && gs[0].split ? '<div class="sub bad">规划 ' + fmtCny(gs[0].plan) + ' · 到账 ' + fmtCny(gs[0].got) + ' · 未到账 <b>' + fmtCny(gs[0].un) + '</b></div>' : '');
    }
    const carry = (s && c.snap && c.snap.rows[r.code]) ? ((c.snap.rows[r.code].itw.prior || 0) + (c.snap.rows[r.code].od.prior || 0)) : 0;
    const row = '<tr class="g' + x.g + (x.g >= 2 && !open ? ' ok' : '') + '">' +
      '<td><span class="tag ' + x.tag[0] + '">' + x.tag[1] + '</span></td>' +
      '<td class="src">' + nameCell + grantLine + '</td>' +
      (full ? '<td class="num">' + (r.planCny ? fmtCny(r.planCny) : '—') + (subPlans.length === 1 && subPlans[0].amountW != null ? '<div class="sub">' + fmtWusd(wusdOf(subPlans[0])) + ' 万美金</div>' : '') + '</td>' +
              '<td class="num">' + (s ? '到账 <b>' + fmtCny(s.avail) + '</b>' + (carry > 500 ? '<div class="sub">含往年结转 ' + fmtCny(carry) + '</div>' : '') + (r.refund > 500 ? '<div class="sub">其中冻在 PO 里 ' + fmtCny(r.refund) + '</div>' : '')
                : (r.plan ? '到账 <b>' + fmtCny(0) + '</b>' : '')) +
                (!r.plan ? '' : r.un > r.tol ? '<div class="sub bad">未到账 <b>' + fmtCny(r.un) + '</b></div>' : (s ? '<div class="sub" style="color:var(--green)">✓ 都到了</div>' : '')) + '</td>' : '') +
      '<td class="main">' + main + '</td>' +
      '<td class="bar-cell">' + (r.notGranted ? '<span class="muted">平台上还没有这一项</span>' : srcBar(r, c)) + '</td>' +
      (full && s ? '<td class="num">' + fmtCny(r.exec) + '<div class="sub">' + fmtPct(now) + ' · IT外包 ' + fmtCny(s.itwExec) + ' · OD ' + fmtCny(s.odExec) + '</div></td>' : (full ? '<td class="num">—</td>' : '')) +
      '<td class="num">' + fmtCny(r.funds) + (r.wallets.length ? '<div class="sub">' + (wallets || '—') + '</div>' : '') + '</td></tr>';
    // 多对一：每条规划一行，看到账（执行不拆——钱从这个 IT 预算项出）
    const subs = (full && r.plan && r.plan.merged) ? r.plan.plans.map((p, pi) => {
      const g = d.planGrant[p.id], noAttr = (g && g.noAttr > 500 && pi === 0) ? g.noAttr : 0;   // 没选归属的授予是整个 IT 预算项的，只在第一条规划下写一次
      return '<tr class="sub-plan g' + x.g + (x.g >= 2 && !open ? ' ok' : '') + '"><td></td><td class="src">└ ' + planLink(p.id, p.name) + '</td>' +
        '<td class="num">' + (g ? fmtCny(g.plan) + '<div class="sub">目标 ' + (p.target != null ? fmtPct(p.target) : '默认') + '</div>' : '—') + '</td>' +
        '<td class="num">' + (g ? (g.split ? '到账 ' + fmtCny(g.got) + (noAttr ? '<div class="sub warn">有 ' + fmtCny(noAttr) + ' 的授予还没选归属</div>' : '') + (g.un > g.tol ? '<div class="sub bad">未到账 ' + fmtCny(g.un) + '</div>' : '<div class="sub" style="color:var(--green)">✓ 都到了</div>') : '<span class="muted">按规划拆不开</span>') : '—') + '</td>' +
        '<td colspan="3" class="muted">执行不按规划拆：钱从这个 IT 预算项出，执行率按 IT 预算项合并算</td></tr>';
    }).join('') : '';
    return row + subs;
  };
  const head = full
    ? '<thead><tr><th>状态</th><th>IT 预算项<div class="sub">一对一：规划里的名字 · 系统里对应哪一项　多对一：系统名，下面每条规划一行</div></th><th class="num">规划<div class="sub">万美金</div></th><th class="num">到账<div class="sub">往年结转 + 本年度授予</div></th><th>目标 → 预计年底<div class="sub">算法的最终目标：预计年底 ≥ 目标</div></th><th class="bar-cell">执行和到账<div class="sub">上：执行　下：到账</div></th><th class="num">已执行<div class="sub">现在 · IT外包 · OD</div></th><th class="num">可支配<div class="sub">按钱包</div></th></tr></thead>'
    : '<thead><tr><th>状态</th><th>IT 预算项<div class="sub">一对一：规划里的名字 · 系统里对应哪一项　多对一：系统名</div></th><th>目标 → 预计年底<div class="sub">算法的最终目标：预计年底 ≥ 目标</div></th><th class="bar-cell">执行和到账<div class="sub">上：执行　下：到账</div></th><th class="num">可支配<div class="sub">按钱包</div></th></tr></thead>';
  const colN = full ? 8 : 5;
  const okN = cnt(2) + cnt(3), badN = items.length - okN, hitN = cnt(2), unN = items.filter(x => x.r.unmatched).length;
  const foldRow = (okN > 0 && !full) ? '<tr class="fold-row" data-action="health:toggle"><td colspan="' + colN + '">' + (open ? '▾' : '▸') + ' 其余 ' + okN + ' 个不用管：达标 ' + hitN + ' 个 · 不考核 ' + cnt(3) + ' 个</td></tr>' : '';
  return '<div class="tbl-wrap"><table class="tbl tbl-health' + (open ? ' open' : '') + (full ? ' full' : '') + '">' + head + '<tbody>' +
    items.filter(x => x.g < 2).map(rowHtml).join('') + foldRow + items.filter(x => x.g >= 2).map(rowHtml).join('') + '</tbody></table></div>' +
    (badN ? '' : '<div class="muted" style="margin-top:6px">✓ 考核来源都能达标</div>') +
    '<div class="bar-legend">' +
    '<span><i class="lg-a"></i>已执行</span><span><i class="lg-b"></i>在途将执行</span><span><i class="lg-c"></i>已安排到年底（PO + OD）</span><span><i class="lg-d"></i>还差</span><span><i class="lg-mk"></i>目标线</span>' +
    '<span class="sep">｜</span><span><i class="lg-e"></i>已到账</span><span><i class="lg-f"></i>冻结待返还</span><span><i class="lg-u"></i>还没到账</span></div>' +
    '<div class="muted" style="margin-top:4px">' +
    '<span class="tag t-red">到不了目标</span> 按配置里的安排到年底差这么多；差的钱属于哪种写在行里（还没到账 / 还在这个 IT 预算项里 / 钱都到了也不够）　' +
    '<span class="tag t-amber">差一点 · 钱还在</span> 差的钱都在这个 IT 预算项里，再挂 OD 就能补平（12 月的 PO 下了之后，这笔钱只有 OD 这一条路）　' +
    '<span class="tag t-amber">规划里没有</span> 平台有、规划里没对上——新增一条规划挂上，或剔除　' +
    '<span class="tag t-gray">还没到账</span> 规划了、平台上还没出现</div>';
}
// 钱包 = 花钱项目 × 预算项（下 PO、OD 扣减都落在钱包上）。执行表的余额按花钱项目各有一份；在途冻结按钱包记
function walletHtml(c, d) {
  if (!c.snap || !c.hasProj) return '';
  const decName = code => { const r = d && d.rows.find(x => x.code === code); return (r && r.decName) || (c.per[code] ? c.per[code].name : code); };
  const rows = [], subs = [];
  c.projects.forEach(pk => {
    let src = null;
    for (let i = c.snaps.length - 1; i >= 0 && !src; i--) src = (c.snaps[i].byProject || {})[pk] || null;   // 这个项目最新的一份执行表
    if (!src) return;
    const sub = { pk, n: 0, avail: 0, exec: 0, itw: 0, od: 0, frozen: 0, refund: 0, used: 0 };
    c.codes.forEach(code => {
      const o = src[code]; if (!o) return;
      const itwA = o.itw.avail || 0, odA = o.od.avail || 0, itwE = o.itw.exec || 0, odE = o.od.exec || 0, itwR = o.itw.remain || 0, odR = o.od.remain || 0;
      if (!(itwA + odA > 0.5 || itwR + odR > 0.5)) return;   // 这个项目下没有这一项的钱
      const r = d ? d.rows.find(x => x.code === code) : null, w = c.wallets[code + '|' + pk];
      const used = r ? (r.usedItw[pk] || 0) + (r.usedOd[pk] || 0) : 0;
      rows.push({ pk, code, name: decName(code), plan: r ? r.name : '', itwA, odA, itwE, odE, itwR, odR, frozen: w ? w.frozen : 0, refund: w ? w.refund : 0, used, hasD: !!r });
      sub.n++; sub.avail += itwA + odA; sub.exec += itwE + odE; sub.itw += itwR; sub.od += odR; sub.frozen += w ? w.frozen : 0; sub.refund += w ? w.refund : 0; sub.used += used;
    });
    if (sub.n) subs.push(sub);
  });
  if (!rows.length) return '';
  const split = (a, b) => fmtCny(a) + (b > 500 ? '<div class="sub">OD ' + fmtCny(b) + '</div>' : '');
  const cell = x => '<td class="num">' + fmtCny(x.itwR + x.odR) + '<div class="sub">IT外包 ' + fmtCny(x.itwR) + (x.odR > 500 ? ' · OD ' + fmtCny(x.odR) : '') + '</div></td>' +
    '<td class="num">' + (x.frozen > 500 ? fmtCny(x.frozen) + (x.refund > 500 ? '<div class="sub">返还 ' + fmtCny(x.refund) + '</div>' : '') : '<span class="muted">—</span>') + '</td>' +
    '<td class="num">' + (x.hasD ? (x.used > 500 ? fmtCny(x.used) : '<span class="muted">—</span>') : '—') + '</td>';
  const subRow = s => '<tr class="sub-total"><td>' + esc(s.pk) + ' 小计</td><td class="sub">' + s.n + ' 个预算项</td><td></td><td class="num">' + fmtCny(s.avail) + '</td><td class="num">' + fmtCny(s.exec) + '</td><td class="num">' + fmtCny(s.itw + s.od) + '</td><td class="num">' + fmtCny(s.frozen) + '</td><td class="num">' + (d ? fmtCny(s.used) : '—') + '</td></tr>';
  let html = '<h3 class="sec-title">钱包（花钱项目 × 预算项）<span class="muted">　下 PO、OD 扣减都落在钱包上；一个预算项在两个花钱项目下都有钱时，是两个钱包</span></h3>' +
    '<div class="tbl-wrap"><table class="tbl tbl-wallet"><thead><tr><th>花钱项目</th><th>预算项<div class="sub">系统里的名字 · 规划里的名字</div></th><th class="num">到账<div class="sub">往年结转 + 本年度授予 · IT外包 / OD</div></th><th class="num">已执行<div class="sub">IT外包 / OD</div></th><th class="num">现在剩余<div class="sub">IT外包 · OD</div></th><th class="num">在途冻结<div class="sub">验收后返还</div></th><th class="num">已安排到年底<div class="sub">PO · OD · 临时 OD · 1 月 PO</div></th></tr></thead><tbody>';
  subs.forEach(s => {
    html += rows.filter(x => x.pk === s.pk).sort((a, b) => (b.itwR + b.odR) - (a.itwR + a.odR)).map(x =>
      '<tr><td><b>' + esc(x.pk) + '</b></td><td><b>' + esc(x.name) + '</b>' + (x.plan && x.plan !== x.name ? '<div class="sub">规划：' + esc(x.plan) + '</div>' : '') + '<div class="sub muted">' + esc(x.code) + '</div></td>' +
      '<td class="num">' + split(x.itwA, x.odA) + '</td><td class="num">' + split(x.itwE, x.odE) + '</td>' + cell(x) + '</tr>').join('');
    html += subRow(s);
  });
  return html + '</tbody></table></div><div class="muted" style="margin-top:6px">现在剩余 = 到账 − 已执行 − 平台预测的在途部分（执行表的口径）；「已安排到年底」= 按本页的建议，到年底从这个钱包要花掉的钱（含 1 月 PO），其余就是年底剩下的。</div>';
}
/* ---- 本期结论（首页第一块）：以现在的时间节点回答三件事——有没有执行率风险、有没有钱不够的风险、照着这个月的安排做是不是就没事。
   全部出自已有的推演，不需要额外输入（用户 2026-11-26：信息太多，要先看到综合结论）。结论分三级（用户定）：
     ✓ 照做就没事：考核来源年底都达标，钱到年底也够
     ⚠ 照做，再把下面的事处理掉就没事：到不了目标的差的钱都是还没到账的；钱会不够，但有可等的钱（规划了没到账的、冻在 PO 里的）
     ✗ 照做也不行：有来源的钱只能靠再挂 OD 花、或钱都到了也不够；钱不够又没有可等的 ---- */
function buildVerdict(c, d) {
  if (!d || !c.snap) return null;
  const O = d.od, J = d.jan;
  const miss = d.rows.filter(r => r.assessed && !r.hit && r.short > 3000);   // 只差零头的不算
  let A = 0, B = 0, C = 0; const needBa = new Set(), bNames = [], cNames = [];   // 到不了目标的钱按原因拆：还没到账 / 只能靠再挂 OD 花 / 钱都到了也不够
  miss.forEach(r => {
    let need = r.short;
    const a = Math.min(need, r.un || 0); need -= a;
    const b = Math.min(need, r.odAble); need -= b;
    A += a; B += b; C += need;
    if (a > 3000) needBa.add(r.code ? 'c:' + r.code : 'n:' + r.name);
    if (b > 3000) bNames.push(r.name);
    if (need > 3000) cNames.push(r.name);
  });
  d.baList.forEach(b => needBa.add(b.code ? 'c:' + b.code : 'n:' + b.name));   // 待办里在催的也算
  const baUnits = d.baUnits.filter(u => u.un > u.tol && needBa.has(u.code ? 'c:' + u.code : 'n:' + u.name));
  const baAmt = sum(baUnits, u => u.un);
  const frozen = d.fund.cash.refundPast + d.fund.cash.refundCur, short = d.fund.cash.short, near = d.fund.cash.shortNear;
  const execLv = !miss.length ? 'ok' : (B + C <= 3000 ? 'warn' : 'bad');
  const levers = d.ungrantedTotal + frozen;   // 可等的钱
  const moneyLv = !short ? 'ok' : (levers >= short.short - 1000 ? 'warn' : 'bad');
  const ex = [], mo = [];
  if (miss.length) {
    const cp = [];
    if (B > 3000) cp.push(fmtCny(B) + ' 的钱只能靠再挂 OD 花掉');
    if (C > 3000) cp.push(fmtCny(C) + ' 钱都到了也不够，要调低目标');
    ex.push(execLv === 'warn' ? miss.length + ' 个来源到不了目标，原因都是钱还没到账——到了就能达标' : miss.length + ' 个来源照做也到不了目标：' + cp.join('；'));
  }
  if (short) mo.push((near ? '两个月内手里的钱就不够' : '钱会不够') + '：到 ' + esc(short.when) + '（' + esc(short.label) + '）时差 ' + fmtCny(short.short) +
    (moneyLv === 'warn' ? '，可等的钱回来就够' : '，就算规划的钱都到账、冻结的都回来也还差 ' + fmtCny(Math.max(0, short.short - levers))));
  const lv = execLv === 'bad' || moneyLv === 'bad' ? 'bad' : (execLv === 'ok' && moneyLv === 'ok') ? 'ok' : 'warn';
  const head = lv === 'ok' ? '照着这个月的安排做就没事：' + (d.assessed ? '考核来源年底都能达标' : '没有设考核目标的来源') + '，钱到年底也够'
    : lv === 'warn' ? '照着这个月的安排做，再把下面的事处理掉就没事：' + ex.concat(mo).join('；')
    : '照着这个月的安排做也不行：' + ex.concat(mo).join('；');
  const cp2 = [];
  if (A > 3000) cp2.push(fmtCny(A) + ' 是钱还没到账');
  if (B > 3000) cp2.push(fmtCny(B) + ' 只能靠再挂 OD 花');
  if (C > 3000) cp2.push(fmtCny(C) + ' 钱都到了也不够');
  const evs = d.fund.cash.events, minEv = evs.length ? evs.reduce((m, e) => e.avail < m.avail ? e : m, evs[0]) : null;
  const teamBad = c.team.hasPoCfg && (c.team.attN.bad || c.team.attF.bad);
  const acts = [];
  if (baUnits.length) acts.push('<b>催 BA 到账</b> ' + fmtCny(baAmt) + '（' + baUnits.map(u => esc(u.name)).join('、') + '）');
  if (O && O.lateRefund.length) acts.push('<b>抓紧验收</b>：年终清算有 ' + fmtCny(sum(O.lateRefund, p => p.refundCur)) + ' 要等 11 月 PO 的钱（12 月下旬才到账），时间很紧');
  else if (short && frozen > 1000) acts.push('<b>催验收</b>：冻在 PO 里的 ' + fmtCny(frozen) + ' 验收后才回来');
  if (B > 3000) acts.push('<b>再挂约 ' + Math.ceil(B / Math.max(d.short.rate, 1)) + ' 个 OD</b>：' + fmtCny(B) + ' 的钱还在 IT 预算项里、只能靠 OD 花（' + bNames.map(esc).join('、') + '），写进变动计划');
  if (C > 3000) acts.push('<b>调低目标</b>：' + fmtCny(C) + ' 钱都到了也不够（' + cNames.map(esc).join('、') + '）');
  if (d.yearEnd && J && J.short > 500) acts.push('<b>1 月 PO 缺 ' + fmtCny(J.short) + '</b>：调低某个来源的目标就能补足');
  if (c.checks.length || teamBad) acts.push('<b>先核对数据</b>：' + [c.checks.length ? '两表不符 ' + c.checks.length + ' 项' : '', teamBad ? '团队配置和实际对不上' : ''].filter(Boolean).join('、') + '——数据不对，上面的结论不可靠');
  return {
    lv, head, acts,
    rows: [
      { k: '执行率', lv: execLv, tag: execLv === 'ok' ? '没风险' : '有风险', goto: 'srcHealth',
        txt: !d.assessed ? '没有设考核目标的来源' : d.hit + '/' + d.assessed + ' 达标' +
          (miss.length ? '，到不了的差 ' + fmtCny(sum(miss, r => r.short)) + (cp2.length === 1 && A > 3000 ? '，全部因为 ' + fmtCny(baAmt || A) + ' 规划了还没到账' : cp2.length ? '，其中 ' + cp2.join('、') : '')
            : '，总体预计年底 ' + fmtPct(c.forecastRate) + '（目标 ' + fmtPct(d.weightedTarget) + '）') },
      { k: '钱', lv: moneyLv, tag: moneyLv === 'ok' ? '没风险' : '有风险', goto: d.yearPlan ? 'opsYeCalc' : 'opsCash',
        // 11、12 月先回答两件事（用户 2026-11-28）：到年底还要花多少钱；冻结的钱回来以后有多少花不了。明细在本周期操作的「年底测算」
        txt: (d.yearPlan ? '到年底还要花 <b>' + fmtCny(d.yearPlan.rest.total) + '</b>（12 月 PO ' + fmtCny(d.yearPlan.poWill) + (d.yearPlan.poIssued > 0.5 ? '，其中 ' + fmtCny(d.yearPlan.poIssued) + ' 已冻结' : '') + '　＋　OD ' + fmtCny(d.yearPlan.rest.total - d.yearPlan.poWill) + '），' : '') +
          (!short ? '钱够' + (minEv ? '，最紧的时候（' + esc(minEv.when) + '）手里还有 ' + fmtCny(minEv.avail) : '')
          : '到 ' + esc(short.when) + '（' + esc(short.label) + '）时差 ' + fmtCny(short.short) + (short.near ? '，就在这两个月内' : '') + '；可等的钱：' +
            (function() { const p = []; if (d.ungrantedTotal > 1000) p.push('规划了还没到账 ' + fmtCny(d.ungrantedTotal)); if (frozen > 1000) p.push('冻在 PO 里 ' + fmtCny(frozen)); return p.length ? p.join('、') : '没有'; })()) +
          (d.yearPlan && frozen > 500 ? '；冻结的钱验收后返还 <b>' + fmtCny(frozen) + '</b>，其中 <b>' + fmtCny(Math.max(0, frozen - d.yearPlan.refund.od)) + ' 今年花不了</b>' + (d.yearPlan.refund.jan > 500 ? '（能留给 1 月 PO ' + fmtCny(d.yearPlan.refund.jan) + '）' : '') : '') }
    ]
  };
}
function renderVerdict(c, d) {
  const el = $('#verdictBox'); if (!el) return;
  const v = buildVerdict(c, d);
  if (!v) { el.innerHTML = ''; return; }
  const mark = { ok: '✓', warn: '⚠', bad: '✗' }, tagOf = lv => 'tag ' + (lv === 'ok' ? 't-green' : lv === 'warn' ? 't-amber' : 't-red');
  el.innerHTML = '<div class="verdict v-' + v.lv + '"><div class="v-head"><span class="v-lab">本期结论</span><span class="muted">截至 ' + esc(String(c.snap.date || '').slice(5)) + '</span>　<b>' + mark[v.lv] + ' ' + v.head + '</b></div><div class="v-rows">' +
    v.rows.map(r => '<div class="v-row"><span class="v-k">' + r.k + '</span><span class="' + tagOf(r.lv) + '">' + r.tag + '</span><span class="v-t">' + r.txt + '</span><a class="lnk" data-action="goto:anchor" data-target="' + r.goto + '">明细 ↓</a></div>').join('') +
    '<div class="v-row"><span class="v-k">要你处理</span><span class="' + (v.acts.length ? tagOf(v.lv === 'bad' ? 'bad' : 'warn') : tagOf('ok')) + '">' + (v.acts.length ? v.acts.length + ' 件' : '没有') + '</span><span class="v-t">' +
      (v.acts.length ? v.acts.map(a => '<div>' + a + '</div>').join('') : '照这个月的待办做就行') + '</span><a class="lnk" data-action="goto:anchor" data-target="nowTodo">去待办 ↓</a></div>' +
    '</div></div>';
}
function renderNow() {
  const c = calc(), Y = curYear(), m = yearParams(Y);
  $('#yearBadge').textContent = Y + ' 年度';
  const tabNow = $('#tab-now');
  /* ---- 还没有数据 ---- */
  const ob = $('#onboard'), sb = $('#summaryBar');
  if (!c.plansY.length && !c.po && !c.snaps.length) {
    const hasOtherYear = state.plans.length || state.execSnaps.length;
    ob.innerHTML = '<div class="onboard"><h2>' + Y + ' 年度还没有数据</h2>' +
      (hasOtherYear
        ? '<div class="muted" style="margin-bottom:12px">开启新年：复制上年规划和参数（挂在哪个 IT 预算项沿用，金额再改成新年的），然后正常导入新年平台数据。</div>' +
          '<div class="btn-row" style="justify-content:center"><button class="btn primary" data-action="year:start">🚀 开启 ' + Y + ' 年度（复制上年）</button>' +
          '<button class="btn" data-action="data:demo">加载示例数据</button></div>'
        : '<div class="muted" style="margin-bottom:12px">四步开始：① 数据管理 → 录入年初规划（名称 + 万美金）② 平台导出文件放进数据集文件夹（每个花钱项目一个子文件夹）③ 选一次数据文件（budget.json）④ 回到本页看进展、风险与行动。团队 Excel 放数据集根目录，预测更准。</div>' +
          '<div class="btn-row" style="justify-content:center"><button class="btn primary" data-action="data:demo">加载示例数据</button>' +
          '<button class="btn" data-action="goto:data">去录规划</button></div>') + '</div>';
    sb.innerHTML = hasOtherYear ? '<b>' + Y + ' 年度待开启</b>：历史年度数据已封卷保存，随时可切换回看。' : '<b>开始前</b>：先用示例数据体验，或直接录入你的规划。';
    sb.style.display = ''; tabNow.classList.add('no-data');
  } else { ob.innerHTML = ''; sb.innerHTML = ''; sb.style.display = 'none'; tabNow.classList.remove('no-data'); }
  const d = c.poDecision, P = d && d.po, J = d && d.jan, O = d && d.od;
  renderVerdict(c, d);   // 本期结论：首页第一块

  /* ---- 本次导入发现了什么（自动和上一次导入比，不用点任何东西；明细点开才显示） ---- */
  {
    const nyb = $('#newYearBox'); if (nyb) nyb.innerHTML = '';
    const ic = $('#importChanges');
    if (ic) {
      const CH = (state.changes && inYear(state.changes.at, Y)) ? state.changes : null;   // 只看本年度的导入记录（新年的视图里不显示去年的）
      const pend = c.byPo ? Object.values(c.byPo).filter(g => g.status === 'OPEN' && g.phase === 'past' && g.frozen > 500) : [];
      if (!CH && !pend.length && !c.snap) ic.innerHTML = '';
      else {
        const its = (CH && CH.items) || [], grp = t => its.filter(x => x.t === t), sm = g => fmtCny(sum(g, x => x.amt || 0));
        const line = [];
        const g1 = grp('poNew'); if (g1.length) line.push('新下 PO <b>' + g1.length + ' 张</b> ' + sm(g1));
        const g2 = grp('accept'); if (g2.length) line.push('验收关闭 <b>' + g2.length + ' 张</b>' + (sum(g2, x => x.amt || 0) > 500 ? '，返还 ' + sm(g2) : ''));
        const g3 = grp('poExec').concat(grp('itwExec')); if (g3.length) line.push('PO 执行增加 ' + sm(g3));
        const g4 = grp('odDeduct'); if (g4.length) line.push('OD 扣减 <b>' + sm(g4) + '</b>');
        const g5 = grp('grant'); if (g5.length) line.push('预算到账 <b>' + g5.length + ' 笔</b> ' + sm(g5));
        const g6 = grp('transfer'); if (g6.length) line.push('调拨 ' + g6.length + ' 笔 ' + sm(g6));
        const g7 = grp('carry'); if (g7.length) line.push('往年结转 ' + sm(g7));
        if (grp('newSrc').length) line.push(grp('newSrc')[0].txt);
        if (grp('team').length) line.push('团队配置有更新');
        ic.innerHTML = '<div class="strip"><span class="muted">数据截至 <b>' + esc(c.snap ? c.snap.date : '—') + '</b></span>' +
          (CH ? '<span class="muted">　｜　本次导入（' + esc(CH.at) + '）相比上次（' + esc(CH.prevAt || '首次') + '）：</span>' + (line.length ? line.join('；') : '<span class="muted">没有发现变化</span>') : '') +
          (pend.length ? '<span class="muted">　｜　待验收 ' + pend.length + ' 张，冻结 ' + fmtCny(sum(pend, g => g.frozen)) + '</span>' : '') +
          (c.snap && c.po && !c.checks.length ? '<span style="color:var(--green)">　｜　✓ 两表一致</span>' : '') +
          (its.length ? '<details class="inline-fold"><summary>明细</summary><div class="inline-fold-body">' + its.map(x => '<div>· ' + esc(x.txt) + '</div>').join('') + '</div></details>' : '') + '</div>';
      }
    }
  }

  /* ---- 新年测算：本年度有规划、还没有平台数据时，按规划、各来源目标和现在的团队估一遍 ----
     结论先行（团队够不够人、能留多少给后年 1 月），逐月消耗折叠；预算几月到账算不准，不画资金曲线，等有了实际到账再看 */
  if (c.plansY.length && !c.snap) {
    const fx = m.fxRate, TP = c.yearCost || { po: [], od: [] };
    const tgt = p => (p.target != null ? p.target : m.execRateTarget);
    const live = c.plansY.filter(p => !p.dead && wusdOf(p) > 0);
    const cny = p => wusdOf(p) * 10000 * fx;
    const A = sum(live, cny), B = sum(live, p => cny(p) * tgt(p)), C = Math.max(0, A - B);   // 规划合计 / 按目标要花掉 / 达标后最多能留
    const assessedCny = sum(live.filter(p => tgt(p) > 0), cny);
    const D = sum(TP.po), E = sum(TP.od), F = D + E, G = B - F;   // PO、OD 全年消耗；G = 目标额度内的余量
    const team = (state.team || []).filter(g => (g.headcount || 0) > 0);
    const hcPo = sum(team.filter(g => g.kind === 'po'), g => g.headcount), hcOd = sum(team.filter(g => g.kind === 'od'), g => g.headcount);
    const perPo = hcPo > 0 ? D / hcPo : 0, perOd = hcOd > 0 ? E / hcOd : 0;
    const janNeed = TP.po[0] || 0, janGap = Math.max(0, janNeed - C), cutPts = assessedCny > 0 ? janGap / assessedCny * 100 : 0;
    let carry = '';
    try {   // 去年那边预计留多少 1 月 PO（去年视图的年底资金安排）；calc 不改状态，临时切过去算一下再切回来
      const y0 = state.meta.year; state.meta.year = y0 - 1;
      try { const pd = calc().poDecision; if (pd && pd.jan) carry = '去年那边：预计留 1 月 PO <b>' + fmtCny(pd.jan.reserve) + '</b>，首次导入后计入今年的可用、不占今年的规划。'; }
      finally { state.meta.year = y0; }
    } catch (e) { }
    const cutTxt = (gap, pp, np, po, no) => {   // 超支 gap 时：减哪边的人；要减的超过现有人数就直说"全减也不够"
      const rp = pp > 0 ? Math.ceil(gap / pp) : Infinity, ro = po > 0 ? Math.ceil(gap / po) : Infinity;
      if (rp > np && ro > no) return '两边的人全减也不够，必须追加预算';
      return [rp <= np ? 'PO 团队要减 <b>' + rp + '</b> 人' : 'PO 团队全减也不够', ro <= no ? 'OD 团队要减 <b>' + ro + '</b> 人' : 'OD 团队全减也不够'].join('，或 ');
    };
    const concl = !team.length ? '还没有团队配置：录入团队 Excel（放进数据集）后，这里会算出全年够养多少人。'
      : G >= 0 ? '结论：按目标要花掉 ' + fmtCny(B) + '，PO ＋ OD 全年 ' + fmtCny(F) + '，还余 <b>' + fmtCny(G) + '</b>——够 PO 再加 <b>' + (perPo ? Math.floor(G / perPo) : 0) + '</b> 人，或 OD 再加 <b>' + (perOd ? Math.floor(G / perOd) : 0) + '</b> 人（二选一）。'
      : '结论：按现在的团队全年要花 ' + fmtCny(F) + '，超过按目标的额度 <b style="color:var(--red)">' + fmtCny(-G) + '</b>' + (F > A ? '，已经超过规划合计 ' + fmtCny(A) : '') + '——' + cutTxt(-G, perPo, hcPo, perOd, hcOd) + '；或者调低目标（每降 1 个百分点约 ' + fmtCny(assessedCny / 100) + '）。';
    let cum = 0;
    const ny = $('#newYearBox');
    if (ny) ny.innerHTML = '<div class="card" style="border-left:4px solid var(--blue);margin-top:16px"><div class="card-title">新年测算<span class="card-sub">' + Y + ' 年度还没有平台数据 · 按规划、各来源目标和现在的团队（含变动计划）估算</span></div>' +
      '<div class="kpi-grid" style="margin-top:6px">' +
      tileK('规划合计', fmtCny(A), '按各来源目标要花掉 <b>' + fmtCny(B) + '</b>；达标后最多能留 <b>' + fmtCny(C) + '</b> 给后年 1 月') +
      tileK('PO 团队', hcPo + ' 人', team.length ? '全年 <b>' + fmtCny(D) + '</b>' + (perPo ? '，人均 ' + fmtCny(perPo) + '/年' : '') : '还没有团队配置') +
      tileK('OD 团队', hcOd + ' 人', team.length ? '全年 <b>' + fmtCny(E) + '</b>（含年终奖）' + (perOd ? '，人均 ' + fmtCny(perOd) + '/年' : '') : '') +
      tileK('留给后年 1 月', fmtCny(C), '团队 1 月需要 <b>' + fmtCny(janNeed) + '</b>（1 月没有 OD 扣减）' + (janGap > 500 ? '，<b style="color:var(--red)">缺 ' + fmtCny(janGap) + '</b>：要留够，各考核来源的目标合计还要再降约 ' + cutPts.toFixed(1) + ' 个百分点' : '，✓ 够'), janGap > 500 ? 'c-amber' : 'c-green') +
      '</div>' +
      '<div class="ins-sub">' + concl + '</div>' +
      (carry ? '<div class="ins-sub muted">' + carry + '</div>' : '') +
      (team.length ? '<details class="fold"><summary>逐月团队消耗（不含预算到账节奏）</summary><table class="tbl"><thead><tr><th>月</th><th class="num">工作日</th><th class="num">PO 团队</th><th class="num">OD 扣减</th><th class="num">累计</th></tr></thead><tbody>' +
        TP.po.map((v, i) => { cum += v + (TP.od[i] || 0); return '<tr><td>' + (i + 1) + ' 月</td><td class="num">' + c.workdays(i + 1) + '</td><td class="num">' + fmtCny(v) + '</td><td class="num">' + (TP.od[i] ? fmtCny(TP.od[i]) : '<span class="muted">—</span>') + '</td><td class="num">' + fmtCny(cum) + '</td></tr>'; }).join('') + '</tbody></table></details>' : '') +
      '<div class="muted" style="margin-top:6px">人数要调就写进变动计划或团队 Excel，这里跟着变。预算几月到账现在算不准，所以不画资金曲线；1 月的 PO 用去年的结余下，到看 2 月的 PO 时如果预算还没到账，看板会提醒。</div></div>';
  }

  /* ---- 首屏：待办 · 执行率 · 提醒 ---- */
  const ag = buildAgenda(c, d, m);
  renderHero(c, d, m, ag);
  /* ---- 本周期操作：下 PO 的比例表 · OD · 年底资金安排 ---- */
  renderOps(c, d, m);
  /* ---- 来源健康度 ---- */
  $('#srcHealth').innerHTML = srcHealthHtml(c, d, {});

  /* ---- 折起来的明细：逐月图 · 数据校验 · 建议 vs 实际 ---- */
  const ckHtml = (!c.snap || !c.po) ? '<div class="empty">导入 PO 明细 + 执行表后自动交叉校验。</div>' :
    '<table class="cons-table"><tr><td>PO 明细已执行合计（≤' + (c.po.asOf - 1) + ' 月）</td><td>vs 执行表 IT外包 1-上月执行</td></tr></table>' +
    (c.checks.length === 0 ? '<div class="cons-diff ok">✓ 两表一致</div>'
      : '<div class="cons-diff warn">⚠️ ' + c.checks.length + ' 个预算来源两表不符：</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>预算来源</th><th class="num">PO明细汇总</th><th class="num">执行表</th><th class="num">差额</th></tr></thead><tbody>' +
      c.checks.map(k => '<tr><td>' + esc(k.name) + ' [' + esc(k.code) + ']</td><td class="num">' + fmtCny(k.poSum) + '</td><td class="num">' + fmtCny(k.execSum) + '</td><td class="num">' + fmtCny(k.diff) + '</td></tr>').join('') + '</tbody></table></div>') +
    (c.grantChecks.length ? '<div class="cons-diff info">ℹ️ 授予流水与执行表「本年度授予」不符：' + c.grantChecks.map(k => esc(k.name) + '（流水 ' + fmtCny(k.logSum) + ' vs 表 ' + fmtCny(k.granted) + '）').join('、') + '</div>' : '');
  $('#nowFolds').innerHTML =
    foldHtml('foldMonth', '逐月消耗与累计执行率', '<div class="chart-box" style="height:320px;margin-top:8px"><canvas id="monthlyChart"></canvas></div><div class="muted" id="chartHint" style="margin-top:6px"></div>', false) +
    ((c.checks.length || c.grantChecks.length) ? foldHtml('foldChecks', '<span style="color:var(--red)">数据校验：' + (c.checks.length ? '两表不符 ' + c.checks.length + ' 项' : '') + (c.checks.length && c.grantChecks.length ? '、' : '') + (c.grantChecks.length ? '授予流水不符 ' + c.grantChecks.length + ' 项' : '') + '</span>', ckHtml, false) : '') +
    foldHtml('foldBacktest', '建议 vs 实际（每次导入自动记一份建议，下次导入后用实际数回测）', backtestHtml(c), false);
  const ch = $('#chartHint');
  if (ch) ch.innerHTML = (c.snap && c.snaps.length < 2)
    ? 'ℹ️ OD 月度柱需要<b>至少两次导入</b>才有（相邻执行表快照的差值）；当前仅 1 次导入，OD 月均按「累计执行 ÷ 已过月数」估算（' + fmtCny(c.odAvg) + '/月），下次导入后自动校准。累计执行率一个点 = 一份执行表快照。'
    : 'ℹ️ 累计执行率一个点 = 一份执行表快照（执行表的口径是「1–上月执行」）；虚线是推到年底的预计。';

  /* 图在折叠块里：折着的时候画布尺寸是 0，展开时才画（见 drawFold）；展开着的现在就画 */
  ['poSplit', 'poWallet', 'm'].forEach(k => { if (charts[k]) { charts[k].destroy(); charts[k] = null; } });
  chartTodo = { po: chartTodoParts(c, d), month: c };
  ['foldPoCharts', 'foldMonth'].forEach(id => { const el = document.getElementById(id); if (el && el.open) drawFold(id); });
}
// 折叠块里要画的图：PO 的两张图要等展开（数据取法和 renderOps 里一致）
function chartTodoParts(c, d) {
  if (!d) return null;
  const P = d.po, J = d.jan;
  const parts = d.isDec ? J.parts : (P ? P.parts : null), items = d.isDec ? J.alloc : (P ? P.alloc : null);
  return (parts && parts.length && (d.isDec ? J.toIssue : (P ? P.toIssue : 0)) > 0) ? { c, d, parts, items } : null;
}
function drawFold(id) {
  if (id === 'foldPoCharts' && chartTodo.po) drawPoCharts(chartTodo.po.c, chartTodo.po.d, chartTodo.po.parts, chartTodo.po.items);
  if (id === 'foldMonth' && chartTodo.month) drawChart(chartTodo.month);
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
    }).join('') + '</tbody></table><div class="muted" style="margin-top:6px">当月多下 = 那个月 PO 的总额 − 实际执行（含已验收返还的）。连续偏大说明习惯性多下。</div>';
}
function shortName(s) { const t = String(s || ''); return t.length > 14 ? t.slice(0, 13) + '…' : t; }

// 决策卡里的两张图（一眼看懂，代替纯文字）：
//   ① 各张 PO 的金额，按预算来源拆成不同颜色；② 各钱包本次出多少（深色）/ 出完还剩多少（浅色）
const SRC_COLORS = ['#3b6ef5', '#0d9488', '#d97706', '#7c5cd6', '#18a058', '#db2777', '#0891b2', '#ca8a04', '#dc2626', '#475569'];
let poSrcColors = {};   // 预算来源 → 颜色（同一个来源在两张图里同色）
const fmtWan = v => Math.abs(v) >= 10000 ? String(Math.round(v / 1000) / 10).replace(/\.0$/, '') + '万' : String(Math.round(v));
const segLabelPlugin = {   // 在堆叠条里写金额（条太窄就不写）
  id: 'segLabel', afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = '600 11px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (!meta) return;
      meta.data.forEach(bar => {
        if (!bar || bar.skip || !bar.hasValue() || typeof bar.base !== 'number') return;
        const w = Math.abs(bar.x - bar.base);
        if (w < 40) return;
        const idx = bar.index != null ? bar.index : (bar.$context && bar.$context.dataIndex);
        const raw = ds.data[idx];
        const val = Array.isArray(raw) ? raw[1] - raw[0] : +raw;
        if (!(val > 0)) return;
        ctx.fillStyle = di === 0 ? '#fff' : '#334155';
        ctx.fillText(fmtWan(val), (bar.x + bar.base) / 2, bar.y);
      });
    });
    ctx.restore();
  }
};
function drawPoCharts(c, d, parts, items) {
  if (typeof Chart === 'undefined' || !parts || !parts.length) return;
  ['poSplit', 'poWallet'].forEach(k => { if (charts[k]) { charts[k].destroy(); charts[k] = null; } });
  poSrcColors = {};
  items = items || [];
  const colorOf = code => { poSrcColors[code] = poSrcColors[code] || SRC_COLORS[Object.keys(poSrcColors).length % SRC_COLORS.length]; return poSrcColors[code]; };
  const common = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,   // 不做动画：折叠块里刚展开时画布尺寸还不稳
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, callback: v => v >= 10000 ? (v / 10000) + '万' : v } },
      y: { stacked: true, grid: { display: false }, ticks: { font: { size: 12 } } }
    },
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + '：' + fmtCny(ctx.parsed.x) } } }
  };
  const c1 = document.getElementById('poSplitChart');
  if (c1) {
    const codes = [];
    parts.forEach(p => p.alloc.forEach(x => { if (codes.indexOf(x.code) < 0) codes.push(x.code); }));
    const datasets = codes.length ? codes.map(code => {
      const x0 = items.find(x => x.code === code) || {};
      return { label: (c.hasProj && x0.proj ? x0.proj + ' / ' : '') + (x0.name || code), data: parts.map(p => sum(p.alloc.filter(x => x.code === code), x => x.amt)), backgroundColor: colorOf(code) };
    }) : [{ label: '要下的金额（目前没有可用的钱包）', data: parts.map(p => p.need), backgroundColor: SRC_COLORS[0] }];
    charts.poSplit = new Chart(c1, { type: 'bar', data: { labels: parts.map(p => p.label || '本次 PO'), datasets }, options: common, plugins: [segLabelPlugin] });
  }
  const c2 = document.getElementById('poWalletChart');
  if (c2) {
    const wk = {};
    items.forEach(x => { const k = x.code + '|' + x.proj; const o = wk[k] = wk[k] || { code: x.code, name: x.name, proj: x.proj, used: 0 }; o.used += x.amt; });
    const rows = Object.values(wk).sort((a, b) => b.used - a.used);
    const remainAfter = w => {   // 这个钱包现在的剩余（IT外包 + OD）减去本次要出的
      const r = d.rows.find(x => x.code === w.code), ww = r && r.wallets.find(z => z.proj === w.proj);
      return ww ? Math.max(0, ww.itw + ww.od - w.used) : 0;
    };
    charts.poWallet = new Chart(c2, {
      type: 'bar',
      data: { labels: rows.map(w => (c.hasProj ? w.proj + ' / ' : '') + w.name), datasets: [
        { label: '本次出', data: rows.map(w => w.used), backgroundColor: rows.map(w => colorOf(w.code)) },
        { label: '出完还剩', data: rows.map(remainAfter), backgroundColor: '#dbe3f0' }] },
      options: common, plugins: [segLabelPlugin]
    });
  }
}
function drawChart(c) {
  const canvas = $('#monthlyChart');
  if (!canvas) return;
  if (charts.m) { charts.m.destroy(); charts.m = null; }
  if (typeof Chart === 'undefined') return;
  const labels = [], poA = [], poF = [], odA = [], odF = [], cum = [], cumFc = [], tgt = [];
  // 累计执行率：一份执行表快照一个点（执行表的口径是「1–上月执行」：M 月导入的快照 = 到 M-1 月底的累计），同一个月取最后一份
  const pt = {};
  (c.snaps || []).forEach(s => {
    const mo = +String(s.date || '').slice(5, 7) - 1;
    if (!(mo >= 1) || !(c.planCnyTotal > 0)) return;
    pt[mo] = sum(c.codes, code => { const r = s.rows[code]; return r ? (r.itw.exec || 0) + (r.od.exec || 0) : 0; }) / c.planCnyTotal;
  });
  let lastMo = 0;
  for (let mo = 1; mo <= 12; mo++) {
    labels.push(mo + '月');
    poA.push(c.poMonthlyAct[mo] || 0);
    poF.push(mo >= c.curM ? (c.poEst[mo] || 0) : (c.poMonthlyFc[mo] || 0));
    odA.push(c.odMonthly[mo] || 0);
    odF.push(mo >= c.curM ? (c.odEst[mo] || 0) : 0);
    if (pt[mo] != null) lastMo = mo;
    tgt.push(c.weightedTarget);
  }
  const fc = (c.curM >= 1 && c.curM <= 12 && c.forecastRate != null && lastMo < 12) ? c.forecastRate : null;   // 推到年底的预计：从最后一个实际点画到 12 月
  for (let mo = 1; mo <= 12; mo++) { cum.push(pt[mo] != null ? pt[mo] : null); cumFc.push(fc != null && (mo === lastMo || mo === 12) ? (mo === 12 ? fc : pt[mo]) : null); }
  const pace = c.planCnyTotal / 12;
  const yMax = barScale(...cum.filter(v => v != null), fc, c.weightedTarget);
  charts.m = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'PO 实际', data: poA, backgroundColor: '#3b6ef5', stack: 'a', borderRadius: 3 },
        { label: 'OD 实际', data: odA, backgroundColor: '#0d9488', stack: 'a', borderRadius: 3 },
        { label: 'PO 预测', data: poF, backgroundColor: '#a8bff9', stack: 'b', borderRadius: 3 },
        { label: 'OD 估算', data: odF, backgroundColor: '#8fd6cf', stack: 'b', borderRadius: 3 },
        { label: '平均节奏', data: labels.map(() => pace), type: 'line', borderColor: '#98a1b3', borderDash: [6, 4], pointRadius: 0, borderWidth: 2 },
        { label: '加权目标', data: tgt, type: 'line', yAxisID: 'y1', borderColor: '#18a058', borderDash: [2, 4], pointRadius: 0, borderWidth: 1.5 },
        { label: '预计年底', data: cumFc, type: 'line', yAxisID: 'y1', borderColor: '#7c5cd6', borderDash: [5, 4], pointBackgroundColor: '#7c5cd6', pointRadius: ctx => ctx.dataIndex === 12 ? 5 : 0, borderWidth: 2, spanGaps: true },
        { label: '累计执行率', data: cum, type: 'line', yAxisID: 'y1', borderColor: '#1c2333', backgroundColor: '#1c2333', pointRadius: 4, pointHoverRadius: 5, borderWidth: 2, spanGaps: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { left: 6, right: 4 } },
      scales: {
        x: { stacked: false, grid: { display: false } },
        y: { stacked: false, position: 'left', ticks: { callback: v => v >= 10000 ? (v / 10000) + '万' : v } },
        y1: { stacked: false, position: 'right', min: 0, max: yMax, grid: { display: false }, ticks: { callback: v => Math.round(v * 100) + '%' } }
      },
      plugins: {
        legend: { labels: { boxWidth: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.yAxisID === 'y1' ? ctx.dataset.label + '：' + fmtPct(ctx.parsed.y) : ctx.dataset.label + '：' + fmtCny(ctx.parsed.y) } }
      }
    }
  });
}

/* ================= 渲染：预算来源 ================= */
function renderBudget() {
  const c = calc(), d = c.poDecision;
  const wrap = $('#budgetTableWrap');
  if (!c.snap && !c.plansY.length) { wrap.innerHTML = '<div class="empty">先录入规划、导入执行表。</div>'; return; }
  const tgtAll = c.weightedTarget != null ? c.weightedTarget : yearParams(c.Y).execRateTarget;
  const items = d ? healthRows(c, d) : [];
  const n = g => items.filter(x => x.g === g).length;
  const sum = items.length
    ? '共 ' + items.length + ' 个预算来源：' + [n(0) ? '<span class="tag t-red">要处理 ' + n(0) + '</span>' : '', n(1) ? '<span class="tag t-amber">要留意 ' + n(1) + '</span>' : '', '<span class="tag t-green">达标 ' + n(2) + '</span>', '<span class="tag t-gray">不考核 ' + n(3) + '</span>'].filter(Boolean).join(' ') +
      '<br><span class="muted">总体执行率</span> <b>' + fmtPct(c.execRate) + '</b> → 预计年底 <b>' + fmtPct(c.forecastRate) + '</b>（加权目标 ' + fmtPct(tgtAll) + '）　｜　规划 ' + fmtCny(c.planCnyTotal) + ' · 已到账 ' + fmtCny(c.availTotal) + ' · 已执行 ' + fmtCny(c.execTotal) + '（IT外包 ' + fmtCny(c.itwExec) + ' · OD ' + fmtCny(c.odExec) + '）· 可支配 ' + fmtCny(c.remainTotal)
    : '';
  const plansOnly = (!c.snap && c.plansY.length)
    ? '<h3 class="sec-title">年初规划<span class="muted">　平台上还没有数据，导入后这里按预算来源列出健康度和钱包</span></h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>规划名称</th><th>IT 预算项</th><th class="num">金额（万美金）</th><th class="num">折合 ¥</th><th class="num">目标</th><th>所属花钱项目</th></tr></thead><tbody>' +
      c.plansY.map(p => '<tr' + (p.dead ? ' style="opacity:.5"' : '') + '><td><b>' + esc(p.name) + '</b>' + (p.dead ? ' <span class="tag t-gray">预算下不来</span>' : '') + '</td><td>' + esc(p.code || '') + (p.code ? '' : ' <span class="muted">还没挂</span>') + '</td><td class="num">' + fmtWusd(wusdOf(p)) + '</td><td class="num">' + fmtCny(wusdOf(p) * 10000 * c.fx) + '</td><td class="num">' + (p.target == null ? '<span class="muted">默认</span>' : p.target === 0 ? '<span class="muted">不考核</span>' : fmtPct(p.target)) + '</td><td class="muted">' + esc(p.planProject || '—') + '</td></tr>').join('') + '</tbody></table></div>'
    : '';
  // 特殊项：平台上的两个固定项目，本来就不关联规划、不参与计算（只在表下说明，不报风险）
  const specialHint = (c.specialRows && c.specialRows.length)
    ? '<div class="muted" style="margin-top:6px">特殊项（平台的固定项目，不关联规划、不参与计算）：' + c.specialRows.map(x => esc(x.name) + ' [' + esc(x.code) + ']' + (x.odExec > 0 ? '（累计有 ' + fmtCny(x.odExec) + ' 的 OD 费用，说明之前有过额度不足）' : '')).join('；') + '</div>'
    : '';
  const exclHint = c.excluded && c.excluded.length
    ? '<div class="cons-diff info" style="margin-top:8px">🚫 已剔除 ' + c.excluded.length + ' 个预算来源（它的执行与 PO 均不参与计算）：' + c.excluded.map(x => esc(x) + (c.snap && c.snap.rows[x] ? ' ' + esc(c.snap.rows[x].name) : '')).join('、') + '　<button class="btn small" data-action="excl:manage">恢复</button></div>'
    : '';
  wrap.innerHTML = (sum ? '<div class="sum-line">' + sum + '</div>' : '') +
    (items.length ? '<h3 class="sec-title">来源健康度</h3>' + srcHealthHtml(c, d, { full: true }) : '') + plansOnly +
    walletHtml(c, d) + exclHint + specialHint;
}

/* ================= 渲染：PO ================= */
function renderPO() {
  const c = calc();
  const wrap = $('#poTableWrap'), frozenWrap = $('#poFrozenWrap'), overWrap = $('#poOverWrap');
  if (!c.po) {
    $('#poSub').textContent = '';
    wrap.innerHTML = '<div class="empty">尚未导入 PO 明细。</div>'; frozenWrap.innerHTML = ''; overWrap.innerHTML = '';
    return;
  }
  const d = c.poDecision;
  const decNameBy = {}; ((c.poDecision && c.poDecision.rows) || []).forEach(r => { if (r.code) decNameBy[r.code] = r.decName; });   // 台账里也用 IT 系统里的预算项名（和下 PO、对账时看到的一致）
  const wl = x => (x.proj && c.hasProj ? '<b>' + esc(x.proj) + '</b> / ' : (c.hasProj ? '<span class="muted">未区分项目</span> / ' : '')) + esc(decNameBy[x.code] || x.name || x.code || '—');
  const byStart = (a, b) => (b.startDate || '').localeCompare(a.startDate || '');
  const all = Object.values(c.byPo);
  const openPos = all.filter(g => g.status === 'OPEN').sort(byStart);
  const closedPos = all.filter(g => g.status !== 'OPEN').sort(byStart);
  const exclN = c.poExcludedRows.length ? new Set(c.poExcludedRows.map(r => r.poNo)).size : 0;
  $('#poSub').textContent = '快照 ' + c.po.updatedAt + ' · 未关闭 ' + openPos.length + ' 张（已关闭 ' + closedPos.length + ' 张，折在下面）' + (exclN ? ' · 剔除出决策 ' + exclN + ' 张' : '');

  /* ---- PO 台账：一张 PO 一行（可跨多个花钱项目/预算来源），下面列出它涉及的每个钱包 ---- */
  const posHtml = g =>
    '<tr><td><b>' + esc(g.poNo) + '</b>' + (g.resName ? '<div class="muted">' + esc(g.resName) + '</div>' : '') + '</td>' +
    '<td>' + (g.startDate ? esc(g.startDate) + (g.endDate && g.endDate !== g.startDate ? ' ~ ' + esc(g.endDate) : '') : '<span class="muted" title="费用起始时间缺失，按当月处理">未识别</span>') + '<div class="muted">' + (g.phase === 'past' ? '往月未关闭' : g.phase === 'cur' ? '当月在执行' : '已提前下') + ' · 服务期认作 ' + (g.own.map(mo => mo + ' 月').join('、') || '—') + '</div>' + (g.noEnd ? '<div style="color:var(--amber)" title="没读到费用结束时间（空白、格式认不出、或早于开始时间），服务期是按这张 PO 的月度金额推断的">结束时间未读到</div>' : '') + '</td>' +
    '<td class="num">' + (g.amount > 0 ? fmtCny(g.amount) : '<span class="muted">—</span>') + '</td>' +
    '<td class="num">' + fmtCny(g.E) + '</td>' +
    '<td class="num"><b>' + fmtCny(g.frozen) + '</b></td>' +
    '<td class="num">' + fmtCny(g.willExec) + '</td>' +
    '<td class="num" style="color:' + (g.refund > 0 ? 'var(--amber)' : 'inherit') + '"><b>' + fmtCny(g.refund) + '</b></td>' +
    '<td>' + g.detail.map(x => '<div class="wl-line">' + wl(x) + '：冻结 ' + fmtCny(x.frozen) + (x.refund > 0 ? ' → 验收后返还 <b>' + fmtCny(x.refund) + '</b>（退回本预算项）' : (x.frozen > 0 ? '（会执行掉）' : '')) + '</div>').join('') + '</td>' +
    '<td class="ops"><button class="btn small ghost" data-action="po:exclAdd" data-key="' + esc(g.poNo) + '" title="这张 PO 花的是你的预算（已执行额仍计入执行率），但不属于团队的月度消耗（挂靠、别的用途）：整张剔除，不再参与 PO 台账/在途冻结/预计返还/PO 建议">剔除出决策</button></td></tr>';
  wrap.innerHTML =
    '<table class="tbl"><thead><tr><th>PO</th><th>费用起止</th><th class="num">PO 总额</th><th class="num">已执行</th><th class="num">在途冻结</th><th class="num">其中将执行</th><th class="num">验收后返还</th><th>涉及的钱包（冻结 → 返还到哪）</th><th>操作</th></tr></thead><tbody>' +
    (openPos.length ? openPos.map(posHtml).join('') : '<tr><td colspan="9" class="empty">没有未关闭的 PO，没有在途冻结 ✓</td></tr>') + '</tbody></table>' +
    (closedPos.length ? '<details class="fold"><summary>已关闭的 PO（' + closedPos.length + ' 张，不占资金）</summary><table class="tbl"><thead><tr><th>PO</th><th>费用起止</th><th class="num">PO 总额</th><th class="num">已执行</th><th>涉及的钱包（已执行）</th></tr></thead><tbody>' +
      closedPos.map(g => '<tr style="opacity:.75"><td><b>' + esc(g.poNo) + '</b><div class="muted">' + esc(g.resName || '') + '</div></td><td>' + esc(g.startDate || '—') + (g.endDate && g.endDate !== g.startDate ? ' ~ ' + esc(g.endDate) : '') + '</td><td class="num">' + fmtCny(g.amount) + '</td><td class="num">' + fmtCny(g.E) + '</td><td>' + g.detail.map(x => '<div class="wl-line">' + wl(x) + '：' + fmtCny(x.E) + '</div>').join('') + '</td></tr>').join('') + '</tbody></table></details>' : '');

  // 剔除出决策区（PO 级：按 PO 编号整张剔除——挂靠、非团队月度消耗的 PO；执行率仍按平台口径，已执行额照算）
  let exclHtml = '';
  if (c.poExcludedRows.length) {
    const exAgg = {};
    c.poExcludedRows.forEach(r => {
      const g = exAgg[r.poNo] = exAgg[r.poNo] || { poNo: r.poNo, resName: r.resName, amount: 0, act: 0, srcs: {} };
      g.amount = Math.max(g.amount, r.amount || 0);
      g.act += sum(Object.entries(r.months), ([mm, v]) => +mm < c.po.asOf ? v : 0);
      g.srcs[r.budgetCode] = 1;
    });
    exclHtml = '<div class="cons-diff info" style="margin-top:10px">🚫 已剔除出决策的 PO ' + Object.keys(exAgg).length + ' 张（挂靠 / 非团队月度消耗：花的是你的预算，但不是 PO 团队在花）——<b>不参与</b> PO 台账/在途冻结/预计返还/月度图/近 3 月实际/PO 建议，不抵下月"已下"；累计已执行 ' + fmtCny(c.poExclAct) + ' <b>计入执行率</b>，未关闭的还会执行 ' + fmtCny(c.poExclWill) + ' <b>计入对应预算来源的年底执行</b>（在途冻结 ' + fmtCny(c.poExclFrozen) + '）</div>' +
      '<table class="tbl"><thead><tr><th>PO</th><th>内容</th><th>预算来源</th><th class="num">PO 总额</th><th class="num">已执行<br><span class="sub">计入执行率</span></th><th class="num">还会执行<br><span class="sub">计入年底执行</span></th><th class="num">在途冻结</th><th>操作</th></tr></thead><tbody>' +
      Object.values(exAgg).map(g => { const x = c.poExclAgg[g.poNo] || {}; return '<tr><td><b>' + esc(g.poNo) + '</b>' + (x.start ? '<div class="muted">' + esc(x.start) + (x.end && x.end !== x.start ? ' ~ ' + esc(x.end) : '') + '</div>' : '') + '</td><td>' + esc(g.resName || '') + '</td><td class="muted">' + Object.keys(g.srcs).map(code => esc(decNameBy[code] || (c.per[code] ? c.per[code].name : code))).join('、') + '</td><td class="num">' + fmtCny(g.amount) + '</td><td class="num">' + fmtCny(g.act) + '</td><td class="num">' + (x.open ? fmtCny(x.will || 0) : '<span class="muted">—</span>') + '</td><td class="num">' + (x.open ? fmtCny((x.amount || 0) > 0 ? Math.max(0, x.amount - x.act) : (x.will || 0) + (x.out || 0)) : '<span class="muted">—</span>') + '</td><td class="ops"><button class="btn small" data-action="po:exclDel" data-key="' + esc(g.poNo) + '">恢复</button></td></tr>'; }).join('') + '</tbody></table>';
  }
  wrap.insertAdjacentHTML('beforeend', exclHtml);

  /* ---- 在途与返还：按钱包看（验收后多少钱回到哪个钱包） ---- */
  const ws = Object.values(c.wallets).filter(w => w.frozen > 0.5).sort((a, b) => b.frozen - a.frozen);
  const willExecTotal = sum(openPos, g => g.willExec);
  const pastRefund = sum(openPos.filter(g => g.phase === 'past'), g => g.refund);
  const curOver = sum(openPos.filter(g => g.phase !== 'past'), g => g.refund);
  frozenWrap.innerHTML =
    '<div class="stats">' +
    '<div class="stat"><div class="lab">未关闭 PO</div><div class="val">' + c.openCnt + ' 张</div><div class="sub">已关闭 ' + closedPos.length + ' 张</div></div>' +
    '<div class="stat"><div class="lab">在途冻结</div><div class="val">' + fmtCny(c.poFrozen) + '</div><div class="sub">PO 总额 − 已执行</div></div>' +
    '<div class="stat"><div class="lab">其中将执行</div><div class="val">' + fmtCny(willExecTotal) + '</div><div class="sub">团队会花掉的</div></div>' +
    '<div class="stat"><div class="lab">验收后返还</div><div class="val c-amber">' + fmtCny(c.poReturn) + '</div><div class="sub">往月 ' + fmtCny(pastRefund) + ' · 当月多下 ' + fmtCny(curOver) + '</div></div>' +
    '</div>' +
    (ws.length
      ? '<table class="tbl" style="margin-top:8px"><thead><tr><th>钱包（钱回到这里）</th><th class="num">冻结</th><th class="num">将执行</th><th class="num">验收后返还</th><th>PO</th></tr></thead><tbody>' +
        ws.map(w => '<tr><td>' + wl(w) + '</td><td class="num"><b>' + fmtCny(w.frozen) + '</b></td><td class="num">' + fmtCny(w.willExec) + '</td><td class="num" style="color:var(--amber)"><b>' + fmtCny(w.refund) + '</b></td><td class="muted">' + Array.from(new Set(w.pos)).map(esc).join('、') + '</td></tr>').join('') +
        '</tbody><tfoot><tr><td>合计</td><td class="num">' + fmtCny(sum(ws, w => w.frozen)) + '</td><td class="num">' + fmtCny(sum(ws, w => w.willExec)) + '</td><td class="num">' + fmtCny(sum(ws, w => w.refund)) + '</td><td></td></tr></tfoot></table>'
      : '<div class="empty">没有在途冻结 ✓</div>') +
    '<details class="fold"><summary>口径说明</summary><div class="muted" style="line-height:1.8;margin-top:4px">PO 金额按 PO 只算一次（一张 PO 可能跨几个花钱项目、几个预算项），月度执行 / 预测按行相加；服务期按费用起止时间判断（如 10-31 ~ 11-30 算 11 月的 PO，覆盖不足 10 天的月份不算）。往月 PO 剩余的钱验收后全部返还；当月在执行的按团队当月需求估，多下约 ' + fmtCny(curOver) + ' 会返还。执行表的「剩余」已经扣掉全部在途预测，所以这笔钱现在不能用。</div></details>';

  /* ---- 多下率：往月「下了多少（PO 总额）vs 实际执行」，用来看习惯性多下 ---- */
  const issuedM = {};
  all.forEach(g => { const mo = g.mainM; if (mo && g.amount > 0) issuedM[mo] = (issuedM[mo] || 0) + g.amount; });
  const mos = Object.keys(issuedM).map(Number).filter(mo => mo < c.po.asOf).sort((a, b) => b - a).slice(0, 6);
  const pastRows = mos.map(mo => { const iss = issuedM[mo], ex = c.poMonthlyAct[mo] || 0; return { mo, iss, ex, over: iss - ex, rate: iss > 0 ? (iss - ex) / iss : 0 }; });
  const overRows = pastRows.slice();
  if (d && d.inflight.fc > 0) overRows.unshift({ mo: c.po.asOf, iss: d.inflight.fc, ex: d.inflight.willExec, over: d.inflight.over, rate: d.inflight.over / d.inflight.fc, cur: true });
  const pIss = sum(pastRows, x => x.iss), pEx = sum(pastRows, x => x.ex), pRate = pIss > 0 ? (pIss - pEx) / pIss : 0;
  overWrap.innerHTML = overRows.length
    ? '<div class="sum-line">最近 ' + pastRows.length + ' 个已结束的月份：PO 总额 <b>' + fmtCny(pIss) + '</b> · 实际执行 <b>' + fmtCny(pEx) + '</b> · 多下 <b style="color:' + (pRate > 0.05 ? 'var(--red)' : pRate > 0.02 ? 'var(--amber)' : 'var(--green)') + '">' + fmtCny(pIss - pEx) + '（' + fmtPct(pRate) + '）</b></div>' +
      '<table class="tbl"><thead><tr><th>月</th><th class="num">PO 总额</th><th class="num">实际执行</th><th class="num">多下</th><th class="num">多下率</th></tr></thead><tbody>' +
      overRows.map(x => '<tr' + (x.cur ? ' style="background:var(--blue-bg)"' : '') + '><td>' + x.mo + ' 月' + (x.cur ? ' <span class="muted">（预估）</span>' : '') + '</td><td class="num">' + fmtCny(x.iss) + '</td><td class="num">' + fmtCny(x.ex) + '</td><td class="num">' + fmtCny(x.over) + '</td><td class="num" style="color:' + (x.rate > 0.05 ? 'var(--red)' : x.rate > 0.02 ? 'var(--amber)' : 'var(--green)') + '"><b>' + fmtPct(x.rate) + '</b></td></tr>').join('') + '</tbody></table>' +
      '<div class="muted" style="margin-top:6px">多下率 = 下了多少 vs 实际执行。连续偏大说明习惯性多下；剔除出决策的 PO 不计入。</div>'
    : '<div class="empty">还没有已结束月份的数据。</div>';
}

// 每次导入记一份决策快照；并用这次导入看到的实际数回测之前的记录
function recordImportLog(c) {
  const logs = state.importLogs = state.importLogs || [];
  if (c.po) logs.forEach(L => {
    if (L.checked || L.year !== c.Y) return;
    if (c.po.asOf > L.month) {   // 记录的那个月已经变成执行列，可以回测
      let over = 0, issuedNext = 0;
      Object.values(c.byPo).forEach(g => {
        const mo = g.mainM;   // PO 的主月（服务期覆盖的第一个月）
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
// 数据从哪来、存在哪、新不新（状态面板）→ 年初规划 → 团队与需求测算、参数 → 决策设置（锚定、剔除）→ 授予流水
let paramSavedAt = 0;
const smallBtn = (action, txt, cls, extra) => '<button class="btn small ' + (cls || '') + '" data-action="' + action + '"' + (extra || '') + '>' + txt + '</button>';
// 参数改完自动保存（和规划表一样）。在原有年度参数上改这几项：剔除名单、OD 锚定项目等其他设置要留着
function saveParams() {
  const tg = parseFloat($('#meta-target').value), fx = parseFloat($('#meta-fx').value), bo = parseFloat($('#meta-bonus').value), fq = parseInt($('#meta-freq').value, 10), at = parseFloat($('#meta-attend').value);
  const otP = parseFloat($('#meta-otpeople').value), fa = parseFloat($('#meta-fest').value), otS = String($('#meta-otskip').value || '').split(/[,，、\s]+/).filter(Boolean).map(Number);
  const yeRaw = String(($('#meta-odyearend') || {}).value || '').trim(), ye = yeRaw === '' ? '' : parseFloat(yeRaw);   // 年终清算预计扣款：留空 = 按人数测算
  let msg = '';
  if (!(tg >= 50 && tg <= 100)) msg = '默认执行率目标应在 50~100';
  else if (!(fx > 0 && fx < 20)) msg = '汇率无效';
  else if (!(bo >= 0 && bo <= 12)) msg = '年终奖扣减应在 0~12 个月';
  else if (!(fq >= 1 && fq <= 60)) msg = '更新提醒应在 1~60 天';
  else if (!Number.isFinite(at) || at < 0.5 || at > 1.5) msg = '出勤系数应在 0.5~1.5';
  else if (!(otP >= 0 && otP <= 500)) msg = '上线周加班的人数应在 0~500';
  else if (otS.some(n => !(n >= 1 && n <= 12))) msg = '没有上线的月份应填 1~12 的数字，用逗号隔开';
  else if (!(fa >= 0.5 && fa <= 1.5)) msg = '春节当月和 1 月的出勤系数应在 0.5~1.5';
  else if (ye !== '' && !(ye > 0 && ye < 1e9)) msg = '年终清算预计扣款应填一个金额（元），留空 = 按人数测算';
  if (msg) { warn(msg + '，已恢复成原来的值'); renderAll(); return false; }
  const yp = yearParams(curYear());
  state.years[curYear()] = Object.assign({}, yp, { fxRate: fx, execRateTarget: tg / 100, bonusMonths: bo, attendFactor: at, workdays: yp.workdays || {}, lastHcCheck: yp.lastHcCheck || '', otPeople: otP, otSkip: otS.join(','), festAttend: fa, odYearEnd: ye });
  state.meta.updateFreqDays = fq;
  paramSavedAt = Date.now();
  save();
  return true;
}
function renderData() {
  const Y = curYear(), m = yearParams(Y), c = calc(), d = c.poDecision;
  const row = (icon, cls, name, stateHtml, hint, btns) => '<div class="st-row ' + cls + '"><span class="st-ico">' + icon + '</span><div class="st-main"><div class="st-name">' + name + '<span class="st-dot"></span><span class="st-state">' + stateHtml + '</span></div>' + (hint ? '<div class="st-hint">' + hint + '</div>' : '') + '</div><div class="st-btns">' + (btns || '') + '</div></div>';

  /* ---- 数据与文件：状态面板 ---- */
  const freq = state.meta.updateFreqDays || 14, t = todayStr();
  const upd = k => { const dd = (state.updatedAt || {})[k]; if (!dd) return { txt: '<span class="bad">还没导入</span>', stale: true }; const days = daysBetween(dd, t); return { txt: esc(dd) + (days > freq ? ' <span class="bad">（' + days + ' 天前）</span>' : ''), stale: days > freq }; };
  const gUpd = Object.values((state.grantData || {}).byProject || {}).map(g => g.updatedAt || '').sort().pop() || '';
  const pvNeed = parseVerNeed().filter(parseKindHasData);
  const pvNames = pvNeed.map(k => PARSE_NAME[k]).join('、');
  const pvNoFile = pvNeed.length > 0 && pvNeed.every(k => (state.parseVerNoFile || []).indexOf(k) >= 0);   // 数据集文件夹里没有这类文件（以前是手动导入的）
  const canReread = !!(dirHandle && !pvNoFile);
  const dataStale = upd('po').stale || upd('exec').stale;
  $('#dataMgmt').innerHTML =
    row('💾', fileHandle ? (fileConnected ? 'ok' : 'warn') : (recentHandle ? 'warn' : 'none'), '数据文件 budget.json',
      fileHandle ? (fileConnected ? '已连接，每次改动自动写入' : '未连接——数据暂存浏览器缓存，不丢') : (recentHandle ? '未连接——浏览器重启后要重新授权；数据暂存浏览器缓存，不丢。点「重新连接」就行，不用再选文件' : '还没设置'),
      '主数据存在仓库的 data/budget.json，随 git 走，清浏览器也不丢；浏览器里只是缓存。换电脑、换浏览器时 pull 后打开同一个文件即可。',
      fileHandle ? smallBtn('data:saveFile', fileConnected ? '立即写入一次' : '重新连接')
        : (recentHandle ? smallBtn('data:saveFile', '重新连接', 'primary') + smallBtn('data:openFile', '换一个文件', 'ghost', ' title="仓库挪了位置、文件改了名，或想换成别的数据文件时用"') : smallBtn('data:saveFile', '选择数据文件', 'primary'))) +
    row('📁', dirHandle ? (datasetPerm === 'granted' ? 'ok' : 'warn') : 'none', '数据集文件夹',
      dirHandle ? (datasetPerm === 'granted' ? '已连接' + (c.projects.length ? '：<b>' + c.projects.map(esc).join('、') + '</b>' : '') + (state.lastImportAt && inYear(state.lastImportAt, Y) ? '，上次导入 ' + esc(state.lastImportAt) : '')
        : '<span class="bad">要重新授权</span>——浏览器没有这个文件夹的读取权限，打开时的自动扫描被跳过了；点右边的「授权并扫描数据集」') : '还没设置',
      '每个花钱项目一个子文件夹（名字自己起，定后不改），该项目的执行表、PO 明细、预算授予都丢进去；团队 Excel 放根目录。打开看板自动扫描导入，重复的文件自动跳过。',
      dirHandle ? smallBtn('dataset:scan', datasetPerm === 'granted' ? '扫描数据集' : '授权并扫描数据集', datasetPerm === 'granted' ? '' : 'primary', ' title="有新文件没自动导进来时点它"') + smallBtn('dataset:set', '更换文件夹') : smallBtn('dataset:set', '设置数据集文件夹', 'primary')) +
    row('📥', dataStale ? 'warn' : 'ok', '平台数据',
      'PO 明细 ' + upd('po').txt + '　·　执行表 ' + upd('exec').txt + '　·　预算授予 ' + (gUpd ? esc(gUpd) : '<span class="muted">还没导入</span>') + '　·　团队 ' + upd('team').txt,
      '平时靠数据集自动导入。临时手动导入（拖文件）时，执行表和预算授予要填属于哪个花钱项目。',
      smallBtn('import:open', '导入平台数据', dataStale ? 'primary' : '')) +
    row('🔄', pvNeed.length ? 'warn' : 'ok', '解析规则',
      pvNeed.length ? '要重读：<b>' + esc(pvNames) + '</b>' : '都是按最新规则读的',
      pvNeed.length ? '看板更新了这些文件的读法，现在的数据还是按旧规则算的' + (canReread ? '——文件不用重新导出' : '——数据集文件夹里没有这类文件，要手动导入一次') : '看板更新了解析逻辑时，打开会自动把数据集里的文件重读一遍',
      pvNeed.length ? (canReread ? smallBtn('dataset:scan', '重读数据集', 'primary') : smallBtn('import:open', '去导入', 'primary')) : smallBtn('dataset:rescan', '全部重读一遍', '', ' title="怀疑数据还是旧的时候用：只重读平台数据和团队配置，不影响规划、目标和参数"')) +
    '<input type="file" id="importFile" accept=".json,application/json" style="display:none">' +
    '<div class="grp"><span class="grp-lab">备份与迁移</span>' + smallBtn('data:openFile', '打开 / 恢复数据文件') + smallBtn('data:export', '分层备份') + '</div>' +
    '<div class="grp"><span class="grp-lab">年度</span>' + smallBtn('year:start', '开启 ' + (Y + 1) + ' 年度', '', ' data-y="' + (Y + 1) + '"') + '<span class="muted">新规划下来后用：复制本年的规划和参数，再把金额改成新年的；看别的年度用顶上的 ◀ ▶</span></div>' +
    '<details class="fold"><summary>维护：示例数据、清空</summary><div class="btn-row" style="margin-top:6px">' + smallBtn('data:demo', '加载示例数据（会覆盖当前数据）') + smallBtn('data:clear', '清空全部数据', 'danger') + '</div></details>';

  // 规划金额疑似过小（旧版按万美金录入被迁移误除以 1 万）→ 修复入口
  const plansAll = state.plans || [];
  const maxW = plansAll.length ? Math.max(...plansAll.map(wusdOf)) : 0;
  const oldFix = $('#wusdFix'); if (oldFix) oldFix.remove();
  if (plansAll.length && maxW > 0 && maxW < 0.5) {
    $('#planTableWrap').insertAdjacentHTML('beforebegin',
      '<div class="cons-diff warn" id="wusdFix">🩹 检测到规划金额异常小（最大 ' + fmtWusd(maxW) + ' 万美金）——可能是旧版按<b>万美金</b>录入、升级时被误按美元换算。<button class="btn small primary" data-action="repair:wusd">一键修复（所有金额 ×10000）</button>　修复前已自动备份。</div>');
  }

  /* ---- 年初规划：一行一条规划，每一格都能直接改。
         挂载（这条规划的钱从哪个 IT 预算项出）是规划的属性，只在这里改：下拉选 IT 预算项（系统名），不手敲编码；多条规划可以挂同一个（多对一） ---- */
  const share = {}; c.plansY.forEach(q => { if (q.code && !q.dead) (share[q.code] = share[q.code] || []).push(q); });
  const itName = code => (c.per[code] ? c.per[code].name : '') + ' [' + code + ']';
  // 下拉的选项：平台上出现的 IT 预算项，已经挂着别的规划的标出来；自己挂的编码平台上还没有时也留着（选中的那一项）
  const itOptions = (cur, selfId) => {
    let h = '<option value="">— 还没挂 —</option>';
    c.codes.forEach(code => { const others = (share[code] || []).filter(q => q.id !== selfId); h += '<option value="' + esc(code) + '"' + (cur === code ? ' selected' : '') + '>' + esc(itName(code)) + (others.length ? '（已挂：' + esc(others.map(q => q.name).join('、')) + '）' : '') + '</option>'; });
    if (cur && c.codes.indexOf(cur) < 0) h += '<option value="' + esc(cur) + '" selected>' + esc(cur) + ((c.excluded || []).indexOf(cur) >= 0 ? '（已剔除）' : '（平台上还没出现）') + '</option>';
    return h;
  };
  const pw = $('#planTableWrap');
  pw.innerHTML = !c.plansY.length ? '<div class="empty">' + Y + ' 年还没有规划项：年初拿到规划清单后「批量粘贴」（每行 名称、金额）或一条条新增；平台上出现预算项以后，在每行的「IT 预算项」里选。</div>' :
    '<table class="tbl tbl-plan"><thead><tr><th>规划名称</th><th>IT 预算项<div class="sub">这条规划的钱从哪一项出 · 系统里的名字</div></th><th>所属花钱项目</th><th class="num">金额<div class="sub">万美金</div></th><th class="num">折合 ¥</th><th class="num">目标 %<div class="sub">留空 = 默认</div></th><th>到账和执行<div class="sub">到账按规划看 · 执行按 IT 预算项看</div></th><th>备注</th><th></th></tr></thead><tbody>' +
    c.plansY.slice().sort((a, b) => (!!a.code) - (!!b.code)).map(p => {   // 还没挂的排在最上面
      const s = p.code ? c.per[p.code] : null, r = (p.code && d && d.rows) ? d.rows.find(x => x.code === p.code) : null;   // 还没导入平台数据时 d 是空的
      const g = (d && d.planGrant[p.id]) || { got: 0, plan: wusdOf(p) * 10000 * m.fxRate, un: 0, tol: 0, split: true, noAttr: 0 };
      let plat;
      if (p.dead) plat = '<span class="tag t-gray">已失效</span>';
      else if (!c.snap) plat = '<span class="muted">导入平台数据后显示到账</span>';
      else if (!p.code) plat = '<span class="tag t-gray">还没挂 IT 预算项</span><div class="sub muted">挂上才算执行率</div>';
      else if ((c.excluded || []).indexOf(p.code) >= 0) plat = '<span class="tag t-gray">这个 IT 预算项已剔除</span>';
      else if (!s) plat = '<span class="tag t-amber">平台上还没出现</span><div class="sub bad">规划 ' + fmtCny(g.plan) + ' 都还没到账——催 BA</div>';
      else {
        plat = ((share[p.code] || []).length > 1 && !g.split ? '<span class="muted">和别的规划共用，到账只能看合计</span>' : '到账 <b>' + fmtCny(g.got) + '</b> / ' + fmtCny(g.plan)) +
          (g.noAttr > 500 ? '<div class="sub warn">有 ' + fmtCny(g.noAttr) + ' 的授予还没选归哪条规划（见下面「授予流水」）</div>' : '') +
          (g.split ? (g.un > g.tol ? '<div class="sub bad">未到账 ' + fmtCny(g.un) + '</div>' : '<div class="sub" style="color:var(--green)">✓ 都到了</div>') : '') +
          '<div class="sub">执行 ' + fmtPct(s.execRate) + (r && r.assessed ? ' → 年底 ' + fmtPct(r.rate) : '') + '</div>';
      }
      return '<tr id="plan-' + esc(p.id) + '"' + (p.dead ? ' class="dead"' : (!p.code && c.snap ? ' class="nomount"' : '')) + '><td><input class="cell-in" data-pedit="' + p.id + '" data-f="name" value="' + esc(p.name) + '" style="width:100%;min-width:120px"></td>' +
        '<td><select class="cell-in" data-pedit="' + p.id + '" data-f="code" style="width:100%;min-width:170px">' + itOptions(p.code, p.id) + '</select></td>' +
        '<td><input class="cell-in" data-pedit="' + p.id + '" data-f="planProject" value="' + esc(p.planProject || '') + '" placeholder="如 项目A,项目B" style="width:100px"></td>' +
        '<td class="num"><input class="cell-in" data-pedit="' + p.id + '" data-f="amountW" value="' + (p.amountW != null ? p.amountW : '') + '" inputmode="decimal" style="width:70px"></td>' +
        '<td class="num" id="pcny-' + p.id + '">' + fmtCny(wusdOf(p) * 10000 * m.fxRate) + '</td>' +
        '<td class="num"><input class="cell-in" data-pedit="' + p.id + '" data-f="target" value="' + (p.target != null ? Math.round(p.target * 100) : '') + '" inputmode="decimal" placeholder="默认" style="width:56px"></td>' +
        '<td>' + plat + '</td>' +
        '<td><input class="cell-in" data-pedit="' + p.id + '" data-f="note" value="' + esc(p.note || '') + '" style="width:110px"></td>' +
        '<td style="white-space:nowrap">' + smallBtn('plan:dead', p.dead ? '恢复' : '失效', '', ' data-id="' + p.id + '" title="预算下不来的项目：从执行率的分母里拿掉、不再催 BA"') + ' ' + smallBtn('plan:del', '删除', 'danger', ' data-id="' + p.id + '"') + '</td></tr>';
    }).join('') + '</tbody></table>' +
    '<div class="muted" style="margin-top:6px">每一格都能直接改，改完自动保存。「IT 预算项」是这条规划的钱从哪一项出，多条规划可以挂同一个（多对一）；还没挂的排在最上面。目标留空 = 用参数里的默认目标，填 0 = 不考核。</div>';
  /* ---- 团队配置（只读，来源 = 数据集里的团队 Excel）+ PO 月度需求的来历 ---- */
  const team = state.team || [];
  const tPlan = Array.isArray(state.teamPlan) ? state.teamPlan : [];
  const poT = team.filter(g => g.kind === 'po'), odT = team.filter(g => g.kind === 'od');
  const hcOf = a => sum(a, g => g.headcount || 0);
  const curMo2 = Math.max(Math.min(c.curM, 12), 1);
  let need = '';
  if (c.team.hasPoCfg) {
    // 建议金额怎么来的：满勤消耗 + 加班，乘出勤系数，再加安全垫。出勤系数两类月份各一个，下面列出各自是从哪几个月反推的
    const PX = d ? (d.isDec ? d.jan : d.po) : null;
    const attLine = (name, a, note) => '<tr><td><b>' + name + '</b><div class="sub">' + note + '</div></td><td class="num"><b>' + a.v.toFixed(3) + '</b></td><td>' +
      (a.auto ? '从 ' + a.months.map(x => (x.yy !== Y ? x.yy + ' 年' : '') + x.mo + ' 月').join('、') + ' 的实际反推' + (a.bad ? '' : '')
        : a.bad ? '<span class="bad">实际 ÷ 理论 = ' + a.r.toFixed(2) + '，差得太离谱，不可信——先核对数据；现在用的是参数里的值</span>' : '这类月份还没有实际数——用的是参数里的值') + '</td></tr>';
    const mos = c.team.attN.months.concat(c.team.attF.months).sort((a, b) => a.yy - b.yy || a.mo - b.mo);
    need = '<h3 class="sec-title">PO 团队的月度需求怎么来的<span class="muted">　消耗 =（日额 × 工作日 + 上线周加班）× 出勤系数；建议金额 = 消耗 + 安全垫</span></h3>' +
      '<div class="sum-line">PO 团队 <b>' + hcOf(poT) + '</b> 人 · 日额 <b>' + fmtCny(c.team.poDaily) + '</b>　｜　上线周的周末加班：每场 <b>' + c.team.otPeople + '</b> 人 × 1 天，按 1 倍单价；没有上线的月份：' + (c.team.otSkip.length ? c.team.otSkip.join('、') + ' 月' : '无') +
      (PX ? '<br>' + (d.isDec ? '明年 1 月' : PX.nextM + ' 月') + '的建议金额：（日额 ' + fmtCny(PX.daily) + ' × ' + PX.wd + ' 个工作日' + (PX.ot > 0 ? ' ＋ 加班 ' + fmtCny(PX.ot) : '') + '）× 出勤 ' + PX.attend.v.toFixed(3) + ' = ' + fmtCny(PX.expect) + '，加安全垫 ' + fmtCny(PX.cushion) + '（' + (PX.attend.auto ? '半天日额' : '一天日额') + '）= <b>' + fmtCny(PX.need) + '</b>' : '') + '</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>出勤系数<div class="sub">实际执行 ÷（日额 × 工作日 + 加班）</div></th><th class="num">现在用的值</th><th>来处</th></tr></thead><tbody>' +
      attLine('平月', c.team.attN, '平时有事才休') + attLine('春节当月和 1 月', c.team.attF, '调休到 1 月作废，大家集中在过年前后休') + '</tbody></table></div>' +
      (mos.length
        ? '<div class="tbl-wrap"><table class="tbl" style="margin-top:8px"><thead><tr><th>月</th><th class="num">工作日</th><th class="num">满勤消耗<div class="sub">日额 × 工作日</div></th><th class="num">加班</th><th class="num">实际执行<div class="sub">PO 明细</div></th><th class="num">出勤<div class="sub">实际 ÷（满勤 + 加班）</div></th></tr></thead><tbody>' +
          mos.map(x => { const q = x.act / x.base; return '<tr><td>' + (x.yy !== Y ? x.yy + ' 年' : '') + x.mo + ' 月' + (c.team.isFest(x.yy, x.mo) ? ' <span class="tag t-amber">过年前后</span>' : '') + '</td><td class="num">' + x.wd + '</td><td class="num">' + fmtCny(x.th) + '</td><td class="num">' + (x.ot > 0 ? fmtCny(x.ot) : '<span class="muted">—</span>') + '</td><td class="num">' + fmtCny(x.act) + '</td><td class="num"><span class="' + (q < 0.7 || q > 1.3 ? 'bad' : Math.abs(q - 1) > 0.1 ? 'warn' : '') + '">' + q.toFixed(3) + '</span></td></tr>'; }).join('') +
          '</tbody></table></div><div class="muted" style="margin-top:6px">某个月的实际明显偏低时，先看那个月的执行列是不是还没记全、PO 明细是不是都导进来了。加班和调休是同一笔钱在月份之间挪（加班的当月多花、调休的当月少花），所以看出勤要拿同类月份比。</div>'
        : '<div class="muted">还没有已记全的月份，出勤系数用的是参数里的值。</div>');
  } else need = '<div class="muted" style="margin-top:8px">没有 PO 团队配置：月度需求 = 近 3 月实际月均 × 按工作日折算（' + fmtCny(c.poAvg) + '/月）。把团队 Excel 放进数据集根目录，就会改用人数 × 单价来算。</div>';
  const ymTxt = ym => ym.slice(0, 4) + '年' + (+ym.slice(5, 7)) + '月';
  const ymNow = Y + '-' + String(curMo2).padStart(2, '0');
  const planEffect = p => {
    const yy = +p.ym.slice(0, 4), mm = +p.ym.slice(5, 7);
    if (p.end) {
      const ey = +p.end.slice(0, 4), em = +p.end.slice(5, 7);
      const months = (ey - yy) * 12 + (em - mm);
      return '临时人员：' + ymTxt(p.ym) + ' 起，到 ' + ymTxt(p.end) + ' 前为止（共 ' + months + ' 个月）' +
        (p.kind === 'po' ? '，这期间每张 PO 每天' + (p.count > 0 ? '多' : '少') + ' ' + fmtCny(Math.abs(p.count) * p.rate) : '，从 ' + (mm >= 11 ? '12 月 31 日的年终清算' : (mm + 1) + ' 月底的扣减') + '开始体现');
    }
    if (yy > Y) return '常驻变动：计入 ' + yy + ' 年（1 月 PO 等已按它估算）';
    if (p.kind === 'po') return '常驻变动：从该月起，每张 PO 每天' + (p.count > 0 ? '多' : '少') + ' ' + fmtCny(Math.abs(p.count) * p.rate);
    return '常驻变动：该月的人从 ' + (mm >= 11 ? '12 月 31 日的年终清算' : (mm + 1) + ' 月底的扣减') + '开始体现，更早月份的人数相应还原';
  };
  const planMo0 = Math.max(curMo2 - 1, 1);   // 各月人数表从上个月开始列（OD 有滞后，上个月的人数决定这个月底的扣减）
  const planMos = Array.from({ length: 14 - planMo0 }, (_, i) => planMo0 + i);   // 最后一项 13 = 明年 1 月
  const planHtml2 = tPlan.length
    ? '<details class="fold" id="foldTeamPlan"' + (foldOpen.foldTeamPlan ? ' open' : '') + '><summary>变动计划 ' + tPlan.length + ' 条<span class="muted">　来自团队 Excel「变动计划」页签</span></summary>' +
      '<table class="tbl"><thead><tr><th>生效年月</th><th>结束年月</th><th>类型</th><th class="num">单价</th><th class="num">人数</th><th>备注</th><th>对决策的影响</th></tr></thead><tbody>' +
      tPlan.slice().sort((a, b) => a.ym < b.ym ? -1 : 1).map(p => {
        const ended = p.end && p.end <= ymNow;
        return '<tr' + ((ended || (!p.end && p.ym < ymNow)) ? ' style="opacity:.65"' : '') + '><td>' + esc(ymTxt(p.ym)) + '</td><td>' + (p.end ? esc(ymTxt(p.end)) : '<span class="muted">常驻</span>') + '</td><td>' + (p.kind === 'po' ? 'PO' : 'OD') + (p.own ? '·归 ' + esc(p.own) : '') + '</td><td class="num">' + fmtCny(p.rate) + '</td><td class="num">' + (p.count > 0 ? '+' : '') + p.count + '</td><td>' + esc(p.note || '') + '</td><td class="muted">' + planEffect(p) + (ended ? '；已结束' : '') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="muted" style="margin:8px 0 4px">各月人数（含计划）与对应的扣减 / 需求：</div>' +
      '<table class="tbl"><thead><tr>' + planMos.map(mo => '<th class="num">' + (mo <= 12 ? mo + '月' : '明年1月') + '</th>').join('') + '</tr></thead><tbody>' +
      '<tr>' + planMos.map(mo => { const h = mo <= 12 ? c.team.hcSummary(Y, mo) : c.team.hcSummary(Y + 1, 1); return '<td class="num muted">PO ' + h.po + '<br>OD ' + h.od + '</td>'; }).join('') + '</tr>' +
      '<tr>' + planMos.map(mo => '<td class="num muted">' + (mo === 13 ? 'PO 需 ' + fmtCny(d && d.jan ? d.jan.need : 0) : (mo < curMo2 ? '（上个月）' : mo === 12 ? 'OD 扣 ' + fmtCny(c.odEst[12] || 0) + '（年底）' : 'OD 扣 ' + fmtCny(c.odEst[mo] || 0))) + '</td>').join('') + '</tr></tbody></table></details>'
    : '';
  const anyOwn = team.some(g => g.kind === 'po' && g.poGroup);
  $('#teamTableWrap').innerHTML = (!team.length && !tPlan.length ? '<div class="empty">还没有团队配置——不配也能用（预测退回历史外推）。把团队 Excel 放进数据集根目录，打开看板自动导入。</div>' : '') +
    (team.length ? '<div class="tbl-wrap"><table class="tbl tbl-team"><thead><tr><th>类型</th><th>组</th><th>PO 归属</th><th class="num">人数</th><th class="num">单价</th><th class="num">小计</th></tr></thead><tbody>' +
      team.map(g => '<tr><td><span class="tag ' + (g.kind === 'po' ? 't-blue' : 't-teal') + '">' + (g.kind === 'po' ? 'PO' : 'OD') + '</span></td><td><b>' + esc(g.name) + '</b></td><td>' + (g.kind === 'po' ? (g.poGroup ? '<b>' + esc(g.poGroup) + '</b>' : '<span class="muted">未标</span>') : '<span class="muted">—</span>') + '</td><td class="num">' + (g.headcount || 0) + '</td><td class="num">' + (g.kind === 'po' ? '日 ' : '月 ') + fmtCny(g.rate || 0) + '</td><td class="num">' + fmtCny((g.headcount || 0) * (g.rate || 0)) + '</td></tr>').join('') + '</tbody></table></div>' +
      (team.some(g => g.kind === 'po' && (g.headcount || 0) > 0 && !g.poGroup) ? '<div class="muted" style="margin-top:6px">' + (anyOwn ? '没标归属的 PO 人员会并成「未标归属」的一张。' : '') + '想按人员归属把 PO 分成几张下：在团队 Excel 的 PO 页签加一列「PO归属」（值随意，如 PO甲 / PO乙），或单独一个页签名含「归属」的清单（姓名 + 归属两列）。</div>' : '') : '') +
    '<div class="muted" style="margin-top:6px">' + (c.team.hasOdCfg ? 'OD 团队 <b>' + hcOf(odT) + '</b> 人 · 月额 ' + fmtCny(c.team.theoryOd) + (c.odAvg > 0 ? '　｜　近 3 月实际月均 ' + fmtCny(c.odAvg) + (c.team.calibOd != null ? '（偏差 ' + fmtPct(c.team.calibOd) + '）' : '') : '') : '没有 OD 团队配置：OD 扣减按近 3 月实际估算（' + fmtCny(c.odAvg) + '/月）') + '</div>' +
    need + planHtml2;

  /* ---- 参数：改完自动保存 ---- */
  $('#paramYear').textContent = Y;
  const nDefault = c.plansY.filter(p => !p.dead && p.target == null && wusdOf(p) > 0).length;   // 沿用默认目标的来源
  const pf = (id, label, val, step, hint) => '<label class="field"><span class="field-label">' + label + '</span><input id="' + id + '" data-param="1" type="number" step="' + step + '" value="' + val + '"><span class="sub">' + hint + '</span></label>';
  let wdHtml = '<details class="fold"><summary>每月工作日（天）——默认按官方放假安排自动算，个别月不准可以覆盖</summary><div class="wd-grid" style="margin-top:8px">';
  for (let mo = 1; mo <= 12; mo++) {
    const v = (m.workdays && m.workdays[mo] != null && m.workdays[mo] !== '') ? m.workdays[mo] : '';
    wdHtml += '<label class="field"><span class="field-label">' + mo + '月 · 默认 ' + c.workdays(mo) + '</span><input type="number" min="15" max="31" data-wd="' + mo + '" value="' + v + '" placeholder="' + c.workdays(mo) + '"></label>';
  }
  const hY = HOLIDAYS[Y] ? Y + ' 年：官方放假安排（含调休）' : (LUNAR_FEST[Y] ? Y + ' 年：按农历节日推算（国务院调休拼假无法预知，约有 2~4 天/年误差）' : Y + ' 年：固定节日 + 周末推算');
  wdHtml += '</div><div class="btn-row" style="margin-top:10px"><button class="btn small primary" data-action="wd:save">保存工作日</button><span class="muted">' + hY + '；留空用自动值。</span></div></details>';
  const yeManual = c.odYearEnd.manual > 0, yeF = c.odYearEnd.formula || 0;   // 年终清算：用户测算的总额 vs 按人数测算
  const yeHint = yeManual
    ? '已按你的数算。按人数测算是 ' + fmtCny(yeF) + '，你的数比它' + (c.odYearEnd.manual >= yeF ? '多 ' : '少 ') + fmtCny(Math.abs(c.odYearEnd.manual - yeF)) + '；团队人数变了要自己改这里'
    : (yeF > 0 ? '按人数测算是 ' + fmtCny(yeF) + '。绩效、入职时间、临时 OD 都算在你的数里；平时每个月的扣减不受影响' : '填 12 月 31 日那笔扣减的总额；平时每个月的扣减不受影响');
  $('#metaForm').innerHTML =
    '<div class="form-grid">' +
    pf('meta-fx', '汇率', m.fxRate, '0.01', '规划里的万美金折成人民币') +
    pf('meta-target', '默认执行率目标（%）', m.execRateTarget * 100, '0.5', nDefault ? '没单独设目标的 ' + nDefault + ' 个来源在用它；各来源自己的目标在规划表里设' : '各来源都设了自己的目标，这个现在没人用') +
    pf('meta-bonus', '12 月年终奖扣减（几个月的月均）', m.bonusMonths, '0.5', '年终清算 = 11 月 + 12 月 + 这几个月' + (yeManual ? '；已填了下面的测算，年终清算以它为准' : '')) +
    '<label class="field"><span class="field-label">年终清算预计扣款（按你的测算，元）</span><input id="meta-odyearend" data-param="1" type="number" step="1000" min="0" value="' + (m.odYearEnd || '') + '" placeholder="留空 = 按人数测算"><span class="sub">' + yeHint + '</span></label>' +
    pf('meta-otpeople', '上线周的周末加班：每场几个人', m.otPeople != null ? m.otPeople : 12, '1', '加班一天按 1 倍单价计入当月；加班只能换调休，所以全年的钱不变，只是把消耗在月份之间挪') +
    '<label class="field"><span class="field-label">没有上线的月份</span><input id="meta-otskip" data-param="1" type="text" value="' + esc(c.team.otSkip.join(',')) + '" placeholder="如 2,6"><span class="sub">这些月份没有加班；用逗号隔开</span></label>' +
    pf('meta-attend', '平月的出勤系数（实际数不可信时用它）', m.attendFactor != null ? m.attendFactor : 1, '0.05', '平时有事才休的月份。正常情况下自动从近 3 个平月的实际反推，这里只用在上不了自动的时候') +
    pf('meta-fest', '春节当月和 1 月的出勤系数（还没有实际数时用它）', m.festAttend != null && +m.festAttend > 0 ? m.festAttend : 0.9, '0.05', '调休到次年 1 月作废，大家集中在过年前后休。有过年月份的实际数后自动反推') +
    pf('meta-freq', '数据更新提醒（天）', state.meta.updateFreqDays || 14, '1', '超过这么多天没导入平台数据，首页就提醒') +
    '</div><div class="muted" id="paramMsg" style="margin-top:6px">' + (Date.now() - paramSavedAt < 4000 ? '<span style="color:var(--green)">✓ 已保存</span>' : '改完点一下别处就保存。') + '</div>' + wdHtml;

  /* ---- 决策设置：OD 锚定项目、剔除名单（集中入口；首页决策卡和各页签里也能改） ---- */
  const yp = yearParams(Y), srcEx = c.excluded || [];
  const poEx = Array.from(new Set((yp.excludedPos || []).map(k => String(k).split('|')[0])));
  const anchorSel = a => '<label class="anchor-item">' + a.mo + ' 月 <select data-odanchor="' + a.mo + '">' + d.od.projList.map(pk => '<option value="' + esc(pk) + '"' + (pk === a.proj ? ' selected' : '') + '>' + esc(pk) + '</option>').join('') + '</select></label>';
  $('#ruleBox').innerHTML =
    '<h3 class="sec-title">OD 挂在哪个项目<span class="muted">　系统按 "只能靠 OD 花的钱最多的项目" 选（平时取 OD 额度最多的）。想试别的项目可以改，改了某个月，之后的月份都跟着用它</span></h3>' +
    (d && c.hasProj
      ? (d.od.anchors.length ? '<div class="anchor-row">' + d.od.anchors.map(anchorSel).join('') + '</div>' : '<div class="muted">今年的 OD 扣减都排完了。</div>') +
        '<div class="muted" style="margin-top:4px">现在用的就是系统选的。' + (Object.keys(yp.odAnchor || {}).length ? ' <a class="lnk" data-action="odanchor:reset">恢复默认</a>' : '现在用的就是默认。') + '</div>'
      : '<div class="muted">导入执行表后可以设置。</div>') +
    '<h3 class="sec-title">剔除的预算来源<span class="muted">　整个来源（连它的 PO）不参与计算；只对本年度有效</span></h3>' +
    (srcEx.length ? '<div class="ex-list">' + srcEx.map(code => '<span class="ex-item"><b>' + esc(code) + '</b> ' + esc(c.snap && c.snap.rows[code] ? c.snap.rows[code].name : '') + ' ' + smallBtn('excl:del', '恢复', 'ghost', ' data-id="' + esc(code) + '"') + '</span>').join('') + '</div>'
      : '<div class="muted">没有。平台上出现了不在你规划里的预算来源时，到「预算来源」页把它剔除。</div>') +
    '<h3 class="sec-title">剔除出决策的 PO<span class="muted">　花的是你的预算、但不是 PO 团队在花（挂靠等）：不抵下月的 PO；已执行的和今年还会花掉的仍计入执行率。会带进新年</span></h3>' +
    (poEx.length ? '<div class="ex-list">' + poEx.map(no => '<span class="ex-item"><b>' + esc(no) + '</b> ' + esc((c.poExclAgg[no] || {}).resName || '') + ' ' + smallBtn('po:exclDel', '恢复', 'ghost', ' data-key="' + esc(no) + '"') + '</span>').join('') + '</div>'
      : '<div class="muted">没有。首页决策卡「已下」的旁边、PO 台账每一行的末尾都可以剔除。</div>');

  /* ---- 授予流水：以平台导出的预算授予文件为准（数据集里自动导入）。以前手工记的留作兜底：某个来源没有平台文件时用它核对 ---- */
  const gw = $('#grantTableWrap');
  const gRows = [];
  Object.entries((state.grantData || {}).byProject || {}).forEach(([pk, g]) => (g.rows || []).forEach(r => gRows.push(Object.assign({ proj: pk }, r))));
  const attr = state.grantAttr || {};
  const merged = c.codes.filter(code => c.per[code].plan && c.per[code].plan.merged);   // 多条规划对应系统里同一个预算项的
  const plansOfCode = code => (c.per[code].plan && c.per[code].plan.plans) || [];
  const logs = [...(state.grantLogs || [])].filter(g => inYear(g.date, Y)).sort((a, b) => a.date < b.date ? 1 : -1);
  let gHtml = '';
  if (gRows.length) {
    const byCode = {};
    gRows.forEach(r => { const o = byCode[r.code] = byCode[r.code] || { name: r.name || r.code, n: 0, itw: 0, od: 0, carry: 0 }; o.n++; if (/以前年度/.test(r.note)) o.carry += r.total || r.itw + r.od; else { o.itw += r.itw; o.od += r.od; } });
    gHtml = '<div class="sum-line">共 <b>' + gRows.length + '</b> 行：' + Object.values(byCode).map(o => esc(o.name) + ' 授予 <b>' + fmtCny(o.itw + o.od) + '</b>' + (o.carry > 0 ? '（另有往年结转 ' + fmtCny(o.carry) + '）' : '')).join('　·　') + '</div>' +
      (merged.length ? merged.map(code => '<div class="muted" style="margin-bottom:6px"><b>' + esc(c.per[code].name) + '</b> 对应多条规划：' + plansOfCode(code).map(p => {
        const rs = gRows.filter(r => r.code === code && !/以前年度/.test(r.note));
        return '「' + esc(p.name) + '」已归属 ' + fmtCny(sum(rs.filter(r => attr[r.docNo + '|' + r.code] === p.id), r => r.total || r.itw + r.od)) + ' / 规划 ' + fmtCny(wusdOf(p) * 10000 * m.fxRate);
      }).join('；') + (gRows.some(r => r.code === code && !/以前年度/.test(r.note) && !attr[r.docNo + '|' + r.code]) ? '；<span class="bad">有还没选归属的</span>' : '') + '</div>').join('') : '') +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>花钱项目</th><th>预算项<div class="sub">系统里的名字</div></th><th>授予单号</th><th>授予人</th><th class="num">IT外包</th><th class="num">OD</th><th>备注</th>' + (merged.length ? '<th>归哪条规划</th>' : '') + '</tr></thead><tbody>' +
      gRows.map(r => '<tr><td>' + esc(r.proj || '—') + '</td><td><b>' + esc(r.name || r.code) + '</b><div class="sub muted">' + esc(r.code) + '</div></td><td class="muted">' + esc(r.docNo) + '</td><td class="muted">' + esc(r.by) + '</td><td class="num">' + fmtCny(r.itw) + '</td><td class="num">' + fmtCny(r.od) + '</td><td class="muted">' + esc(r.note) + '</td>' +
        (merged.length ? '<td>' + (merged.indexOf(r.code) >= 0 && !/以前年度/.test(r.note)
          ? '<select data-grantattr="' + esc(r.docNo + '|' + r.code) + '"><option value="">未选</option>' + plansOfCode(r.code).map(p => '<option value="' + esc(p.id) + '"' + (attr[r.docNo + '|' + r.code] === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>'
          : '<span class="muted">—</span>') + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>' +
      (merged.length ? '<div class="muted" style="margin-top:6px">一个预算项对应多条规划时：按授予邮件里写的规划归属，给每一笔选一下归哪条规划（执行率还是按系统里的预算项看）。</div>' : '');
  } else gHtml = '<div class="empty">数据集里还没有预算授予文件。从平台导出「预算授予」（按花钱项目），放进对应花钱项目的子文件夹，打开看板自动导入。</div>';
  if (logs.length) gHtml += '<details class="fold"><summary>以前手工记的授予（兜底，' + logs.length + ' 笔）</summary><div class="muted" style="margin:4px 0">某个来源没有平台上的授予文件时，用它和执行表核对；有平台文件的以平台为准。</div><table class="tbl"><thead><tr><th>日期</th><th>预算来源</th><th class="num">金额</th><th>备注</th></tr></thead><tbody>' +
    logs.map(g => '<tr><td>' + esc(g.date) + '</td><td>' + esc(g.code) + ' <span class="muted">' + esc(c.snap && c.snap.rows[g.code] ? c.snap.rows[g.code].name : '') + '</span></td><td class="num">' + fmtCny(g.amountCny) + '</td><td class="muted">' + esc(g.note || '') + '</td></tr>').join('') + '</tbody></table></details>';
  gw.innerHTML = gHtml;
}
/* ================= 弹窗 ================= */
function openModal(inner) {
  $('#modalRoot').innerHTML = '<div class="modal-overlay" data-action="modal:close"><div class="modal">' + inner + '</div></div>';
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modalRoot').innerHTML = ''; document.body.style.overflow = ''; }
const field = (label, inner) => '<label class="field"><span class="field-label">' + label + '</span>' + inner + '</label>';

function planModal(p) {
  const isNew = !p || !!p._new;
  p = p || { name: '', code: '', amountW: '', note: '' };
  const c = calc();   // 挂在哪个 IT 预算项：下拉里选（系统名），不手敲编码
  const share = {}; c.plansY.forEach(q => { if (q.code && !q.dead) (share[q.code] = share[q.code] || []).push(q); });
  let opts = '<option value="">— 还没挂（平台上出现后再挂）—</option>' + c.codes.map(code => '<option value="' + esc(code) + '"' + (p.code === code ? ' selected' : '') + '>' + esc(c.per[code].name + ' [' + code + ']') + ((share[code] || []).length ? '（已挂：' + esc(share[code].map(q => q.name).join('、')) + '）' : '') + '</option>').join('');
  if (p.code && c.codes.indexOf(p.code) < 0) opts += '<option value="' + esc(p.code) + '" selected>' + esc(p.code) + '（平台上还没出现）</option>';
  openModal('<h3>' + (isNew ? '新增规划项' : '编辑规划项') + '</h3><div class="form-grid">' +
    field('规划名称（年初口径）', '<input id="f-name" type="text" value="' + esc(p.name) + '">') +
    field('金额（WUSD·万美金，可带小数）', '<input id="f-amount" type="text" inputmode="decimal" value="' + (p.amountW != null && p.amountW !== '' ? p.amountW : '') + '" placeholder="如 5.5 = $55,000">') +
    field('挂在哪个 IT 预算项', '<select id="f-code">' + opts + '</select>') +
    field('所属花钱项目（如：项目A / 项目A,B）', '<input id="f-pplanproject" type="text" value="' + esc(p.planProject || '') + '" placeholder="区分打到哪些花钱项目">') +
    field('执行率目标（%）', '<input id="f-target" type="text" inputmode="decimal" value="' + (p.target != null ? Math.round(p.target * 100) : '') + '" placeholder="留空=年度默认；0=不考核，如 100 / 92">') +
    field('备注', '<input id="f-note" type="text" value="' + esc(p.note || '') + '">') +
    '</div><div class="modal-actions"><button class="btn" data-action="modal:close">取消</button><button class="btn primary" data-action="plan:save" data-id="' + (isNew ? '' : p.id) + '">保存</button></div>');
}
function planPasteModal() {
  openModal('<h3>批量粘贴规划</h3>' +
    '<div class="muted" style="margin-bottom:8px">每行一个规划项，格式：<b>名称, 金额WUSD[, 编码][, 目标%]</b>（逗号/制表符分隔；金额单位<b>万美金</b>保留小数，如 5.5；≥1000 视为美元自动换算；目标留空=年度默认、0=不考核）。年初从清单粘贴新建；新年粘贴后改金额。<b>替换</b>按名称保留已经挂在哪个 IT 预算项上。</div>' +
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
  if (!rows.length) { warn('未识别到任何规划项，检查格式：名称, 金额USD[, 编码]'); return; }
  const Y = curYear();
  if (mode === 'replace') {
    if (plansOf(Y).length && !confirm('替换将覆盖 ' + Y + ' 年现有 ' + plansOf(Y).length + ' 项规划（按名称保留挂在哪个 IT 预算项），确认？')) return;
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
  notify('已' + (mode === 'replace' ? '替换' : '追加') + ' ' + rows.length + ' 项规划（' + Y + ' 年）。');
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
// 重新连接数据文件（浏览器重启后会忘记授权，但上次用的文件还记着）：只向浏览器把读写权限要回来，不弹"选文件 / 另存为"的对话框。
// 浏览器缓存和文件谁的更新就以谁为准（和打开页面时一样）：断开连接期间在浏览器里改的，连上后写回文件；git 拉下来的新文件，载入页面。
// 以前这里直接用文件覆盖浏览器里的数据——断开期间做的改动一点"重连"就没了（用户 2026-11-28 反映每次打开都要重选数据文件，排查时发现）
async function reconnectDataFile() {
  if (!recentHandle || !recentHandle.requestPermission) return openDataFile();
  let perm = 'prompt';
  try { perm = await recentHandle.requestPermission({ mode: 'readwrite' }); }
  catch (e) { return openDataFile(); }   // 记着的文件已经不在了（仓库挪了位置、文件改了名）：重新选
  if (perm !== 'granted') { warn('浏览器没有允许读写这个文件：数据暂存浏览器缓存（不丢），下次再点一下「重新连接」'); return; }
  let f;
  try { f = await recentHandle.getFile(); }
  catch (e) { warn('上次用的数据文件找不到了（仓库挪了位置，或文件改了名），请重新选择'); return openDataFile(); }
  try {
    const savedAt = +(localStorage.getItem('budgetDash.savedAt') || 0), localRaw = localStorage.getItem(LS_KEY);
    if (localRaw && savedAt > f.lastModified) {   // 浏览器里的比文件新：以浏览器为准，连上后写回文件
      fileHandle = recentHandle; fileConnected = true;
      const ok = await writeThroughNow();
      renderAll();
      notify('已重新连接 ' + (f.name || 'budget.json') + '：浏览器里有比文件新的数据，已写回文件' + (ok ? '' : '（没写进去，权限可能过期；数据仍在浏览器缓存里）'));
    } else {
      await loadFromHandle(recentHandle, true);
      notify('已重新连接 ' + (f.name || 'budget.json') + '（更新于 ' + new Date(f.lastModified).toLocaleString() + '）');
    }
  } catch (e) { warn('载入失败：' + e.message); }
  const b = $('#quickLoadBtn'); if (b) b.style.display = 'none';
  renderBanner();
}
async function saveToDataFile() {
  if (!window.showSaveFilePicker) {
    const blob = new Blob([JSON.stringify({ type: 'budget-dash-full', ...state }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'budget.json'; a.click(); URL.revokeObjectURL(a.href);
    warn('当前浏览器不支持直接写文件，已下载 budget.json——请手动覆盖到仓库 data/ 目录。');
    return;
  }
  try {
    if (!fileHandle && recentHandle && recentHandle.requestPermission) return reconnectDataFile();   // 记得上次的文件：只要回授权，不再弹「另存为」
    if (fileHandle && !fileConnected) return reconnectDataFile();   // 授权过期了
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
  if (ok) renderData();   // 数据管理那一行的状态和按钮立刻更新
  if (ok) notify('已写入 ' + (fileHandle.name || 'budget.json') + '。\n\n✅ 此后<b>每次变更自动同步写入</b>该文件（无需再点本按钮），数据随 git 走，清浏览器也不丢。'.replace(/<[^>]+>/g, ''));
  else warn('写入失败（权限可能已过期）：数据仍在浏览器缓存中，点顶部「📂 载入数据文件」重连后再试。');
}
function exportModal() {
  openModal('<h3>分层备份</h3>' +
    '<div class="muted" style="margin-bottom:10px">三类备份包，恢复时自动识别：全量（配置+数据，灾备用）；仅配置（规划 + 团队和变动计划 + 参数 + 决策设置——换电脑、换浏览器时先导它）；仅数据（执行表快照 + PO 明细 + 授予流水，归档用）。文件只存在你本机。</div>' +
    '<div class="btn-row" style="justify-content:center;gap:12px">' +
    '<button class="btn primary" data-action="export:full">📦 全量备份</button>' +
    '<button class="btn" data-action="export:config">⚙️ 仅配置</button>' +
    '<button class="btn" data-action="export:data">📊 仅数据</button></div>' +
    '<div class="modal-actions"><button class="btn" data-action="modal:close">关闭</button></div>');
}
function doExport(kind) {
  let obj, name;
  if (kind === 'config') { obj = { type: 'budget-dash-config', schemaVersion: 4, meta: state.meta, years: state.years, plans: state.plans, team: state.team, teamPlan: state.teamPlan, grantAttr: state.grantAttr, projAlias: state.projAlias }; name = '预算看板-配置'; }
  else if (kind === 'data') { obj = { type: 'budget-dash-data', schemaVersion: 4, execSnaps: state.execSnaps, poDataByYear: state.poDataByYear, grantLogs: state.grantLogs, grantData: state.grantData, grantAttr: state.grantAttr, changeLog: state.changeLog, lastImportAt: state.lastImportAt, importLogs: state.importLogs, projPrints: state.projPrints, projAlias: state.projAlias }; name = '预算看板-数据'; }
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
    // 服务期 = 第一个有金额的月份（上旬开的月度 PO）；之后的预测是没花完的部分
    Object.entries(months).forEach(([c, mm]) => { const mo0 = +Object.keys(mm)[0]; poRows.push({ poNo: no, resName: name, status, startDate: y + '-' + pad(mo0) + '-01', endDate: y + '-' + pad(mo0) + '-' + pad(new Date(y, mo0, 0).getDate()), amount, itProject: proj, itProjectCode: proj === PA ? 'ITA' : 'ITB', budgetCode: c, months: Object.fromEntries(Object.entries(mm).map(([k, v]) => [+k, v])) }); });
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
    parseVer: Object.assign({}, PARSE_VER),
    lastImportAt: y + '-11-18',
    changes: { at: y + '-11-18', prevAt: y + '-10-31', items: [
      { t: 'poNew', amt: 290000, txt: '新下 PO「11月人力外包」¥29万（服务期 ' + y + '-11-01 ~ ' + y + '-11-30）' },
      { t: 'poNew', amt: 270000, txt: '新下 PO「11月人力外包」¥27万（服务期 ' + y + '-11-01 ~ ' + y + '-11-30）' },
      { t: 'accept', amt: 40000, txt: '验收关闭「9月驻场支持」，冻结的 ¥4万 回到账户' },
      { t: 'poExec', amt: 333200, txt: '4 张 PO 的执行增加 ¥33.32万' },
      { t: 'odDeduct', amt: 21000, txt: 'OD 扣减 ¥2.1万：智能运维预算B ¥2.1万' }
    ] },   // 示例数据是按当前规则生成的
    meta: { year: y, updateFreqDays: 14, lastHcCheck: t },
    years: { [y]: { fxRate: 7.03, execRateTarget: 0.95, bonusMonths: 3.5, attendFactor: 1, workdays: {}, lastHcCheck: t } },
    team: [
      { id: 'tg1', kind: 'po', name: '高级开发', headcount: 6, rate: 2000, project: '', poGroup: 'PO甲' },
      { id: 'tg1b', kind: 'po', name: '高级开发', headcount: 2, rate: 2000, project: '', poGroup: 'PO乙' },
      { id: 'tg2', kind: 'po', name: '初级开发', headcount: 4, rate: 1200, project: '', poGroup: 'PO乙' },
      { id: 'tg3', kind: 'od', name: 'OD工程师', headcount: 2, rate: 10500, project: '' }
    ],
    teamPlan: [   // 变动计划（示例）：12 月临时加 2 个 OD 和 2 个 PO 人员（归 PO甲），到明年 1 月前为止；明年 1 月 PO 团队进 3 个高级开发（常驻）
      { ym: y + '-12', end: (y + 1) + '-01', kind: 'od', rate: 10500, count: 2, note: '年终冲量' },
      { ym: y + '-12', end: (y + 1) + '-01', kind: 'po', rate: 2000, count: 2, own: 'PO甲', note: '12月临时支援' },
      { ym: (y + 1) + '-01', end: '', kind: 'po', rate: 2000, count: 3, note: '明年 1 月到岗' }
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
  if (action === 'goto:anchor') {   // 跳到页面里的某一块（在别的页签就先切过去）；它在折叠块里的话顺手展开
    let t = document.getElementById(el.dataset.target);
    if (!t && /^plan-/.test(el.dataset.target)) { renderData(); t = document.getElementById(el.dataset.target); }   // 规划表的行可能还没画出来
    if (!t) return;
    const panel = t.closest('.tab-panel'); if (panel && !panel.classList.contains('active')) switchTab(panel.id.replace('tab-', ''));
    if (t.tagName === 'DETAILS') t.open = true;
    for (let p = t.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
    t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');   // 闪一下，让人看到是哪一行
    t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
  }
  if (action === 'health:toggle') { healthOpen = !healthOpen; renderNow(); return; }
  if (action === 'odanchor:reset') {   // OD 锚定项目全部恢复默认（取 OD 额度最多的项目）
    const yp = yearParams(curYear()); delete yp.odAnchor; state.years[curYear()] = yp; save(); return;
  }

  if (action === 'import:open') return importModal();
  if (action === 'import:pick') { const inp = $('#fileInput'); if (inp) inp.click(); return; }
  if (action === 'import:all') return importAll();
  if (action === 'po:exclAdd') {
    const c0 = calc();
    const row = c0.poList.find(r => r.poNo === el.dataset.key);   // 挂靠按 PO 编号整张剔除（含它在各花钱项目下的行）
    if (!row) return;
    const yp = yearParams(curYear());
    yp.excludedPos = yp.excludedPos || [];
    if (yp.excludedPos.indexOf(el.dataset.key) < 0) yp.excludedPos.push(el.dataset.key);
    state.years[curYear()] = yp;
    save();
    notify('已把 PO「' + (row.resName || row.poNo) + '」剔除出决策：不再抵下月的 PO；已执行的和今年还会花掉的仍计入执行率。想恢复：PO 台账，或数据管理 → 决策设置');
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
  if (action === 'data:saveFile') return saveToDataFile();
  if (action === 'data:openFile') return openDataFile();
  if (action === 'dataset:set') return setDatasetDir();
  if (action === 'excl:add') {
    const c0 = calc();
    const name = (c0.snap && c0.snap.rows[id] && c0.snap.rows[id].name) || id;
    const yp = yearParams(curYear());
    yp.excluded = yp.excluded || [];
    if (yp.excluded.indexOf(id) < 0) yp.excluded.push(id);
    state.years[curYear()] = yp;
    save();
    notify('已剔除预算来源「' + name + '」：它的执行、可用、剩余和花它的钱的 PO 都不参与计算。想恢复：数据管理 → 决策设置');
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
  if (action === 'dataset:rescan') {
    return scanDataset(true, PARSE_KEYS.slice());
  }
  if (action === 'data:openRecent') {
    if (!recentHandle) return;
    return reconnectDataFile();
  }
  if (action === 'data:export') return exportModal();
  if (action === 'export:full') return doExport('full');
  if (action === 'export:config') return doExport('config');
  if (action === 'export:data') return doExport('data');
  if (action === 'wd:save') {
    const wd = {};
    $$('[data-wd]').forEach(inp => { const v = inp.value.trim(); if (v !== '') wd[+inp.dataset.wd] = +v; });
    const yp = yearParams(curYear());
    state.years[curYear()] = Object.assign({}, yp, { workdays: wd });
    save(); notify('工作日已保存（' + curYear() + ' 年）');
    return;
  }

  if (action === 'repair:wusd') {
    const plansAll = state.plans || [];
    if (!plansAll.length) return;
    if (!confirm('将所有规划金额 ×10000 恢复为你当时录入的万美金数字。\n\n注意：旧版录入时小数会被四舍五入（如 5.5 → 6），修复后请对照清单核对。\n修复前会自动备份当前数据。确认执行？')) return;
    try { localStorage.setItem('budgetDash.autobak', JSON.stringify({ t: todayStr() + ' ' + new Date().toTimeString().slice(0, 5), data: state })); } catch (e) { }
    plansAll.forEach(p => { p.amountW = Math.round(wusdOf(p) * 10000 * 10000) / 10000; });
    touch('plan'); save();
    notify('已修复 ' + plansAll.length + ' 项规划金额（×10000）。请到规划表核对数值，小数位如与清单不符请手动改。');
    return;
  }
  if (action === 'plan:dead') {
    const p = state.plans.find(x => x.id === id);
    if (!p) return;
    p.dead = !p.dead;
    touch('plan'); save();
    notify(p.dead ? '已把「' + p.name + '」标为失效：不计入执行率的分母、不再催 BA' : '已恢复「' + p.name + '」');
    return;
  }
  if (action === 'plan:add') return planModal(null);
  if (action === 'plan:paste') return planPasteModal();
  if (action === 'plan:pasteGo') return planPasteGo(el.dataset.mode);
  if (action === 'plan:del') {
    const p = state.plans.find(x => x.id === id);
    if (p && confirm('删除规划项「' + p.name + '」？')) { state.plans = state.plans.filter(x => x.id !== id); touch('plan'); save(); }
    return;
  }
  if (action === 'plan:save') {
    const name = $('#f-name').value.trim(), amountW = parseWusd($('#f-amount').value);
    if (!name) { warn('请填写规划名称'); return; }
    if (amountW == null || amountW <= 0) { warn('请填写有效的万美金金额（如 5.5）'); return; }
    const code = $('#f-code').value.trim(), note = $('#f-note').value.trim(), planProject = $('#f-pplanproject') ? $('#f-pplanproject').value.trim() : '';
    const tRaw = $('#f-target').value.trim();
    let target = null;
    if (tRaw !== '') {
      const tv = parseFloat(tRaw);
      if (!Number.isFinite(tv) || tv < 0 || tv > 100) { warn('执行率目标应为 0~100 的数字，或留空跟随年度默认'); return; }
      target = tv / 100;
    }
    if (id) Object.assign(state.plans.find(p => p.id === id), { name, amountW, code, target, note, planProject });
    else state.plans.push({ id: uid(), year: curYear(), name, amountW, code, target, note, planProject });
    touch('plan'); save(); closeModal();
    return;
  }
  if (action === 'plan:newCode') {   // 平台上出现了规划里没有的 IT 预算项：新增一条规划挂上去（IT 预算项已经选好）
    const c0 = calc();
    return planModal({ _new: true, code: id, name: c0.per[id] ? c0.per[id].name : '', amountW: '', note: '' });
  }

  if (action === 'year:prev') { switchYear(curYear() - 1); return; }
  if (action === 'year:next') { switchYear(curYear() + 1); return; }
  if (action === 'year:start') {
    const want = +(el.dataset.y || 0);   // 从数据管理里点的是「开启下一年度」：先切过去
    if (want >= 2000 && want <= 2100 && want !== curYear()) { state.meta.year = want; if (!state.years[want]) state.years[want] = defaultYearParams(); }
    const Y = curYear();
    const from = (state.plans.some(p => p.year === Y - 1) || (state.poDataByYear || {})[Y - 1] || state.execSnaps.some(s => inYear(s.date, Y - 1))) ? Y - 1 : (state.plans.length ? Math.max(...state.plans.map(p => p.year)) : null);
    if (from == null) { warn('没有可复制的上一年数据，请直接录入规划'); return; }
    if (state.plans.some(p => p.year === Y)) { warn(Y + ' 年已有规划，无需开启'); return; }
    if (!confirm('开启 ' + Y + ' 年度：复制 ' + from + ' 年的规划（挂在哪个 IT 预算项沿用、金额可再调）与年度参数（团队配置共用），确认？')) return;
    plansOf(from).forEach(p => state.plans.push({ id: uid(), year: Y, code: p.code || '', name: p.name, amountW: wusdOf(p), target: p.target != null ? p.target : null, planProject: p.planProject || '', dead: false, note: '复制自' + from }));
    const ypFrom = yearParams(from);
    delete ypFrom.excluded;   // 预算来源的剔除按年独立：新年不沿用上年的剔除（来源可能不一样）
    ypFrom.workdays = {};     // 每月工作日的手工覆盖是上一年放假安排的微调，不带到新年（新年用官方放假表 / 自动值，不对再调）
    // PO 级的剔除（按 PO 编号）带进新年：跨年的长 PO 明年还会出现在明细里，应该继续不参与决策；对新年没有的 PO 编号不起作用
    state.years[Y] = Object.assign({}, ypFrom, { lastHcCheck: '', odYearEnd: '' });   // 年终清算的测算是今年的事，不带进新年
    state.meta.lastHcCheck = '';   // 新年重新确认一次团队人数
    touch('plan'); save();
    notify(Y + ' 年度已开启：规划 ' + plansOf(Y).length + ' 项已复制。请到「数据管理」核对金额与汇率，然后正常导入新年数据。');
    return;
  }
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

document.addEventListener('toggle', e => {   // 折叠块：记下展开状态（重渲染时保留）；里面有图的，展开时才画（折着的时候画布尺寸是 0）
  const t = e.target; if (!t || !t.classList || !t.classList.contains('fold') || !t.id) return;
  foldOpen[t.id] = t.open;
  if (t.open) drawFold(t.id);
}, true);
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
  if (e.target.matches('[data-odanchor]')) {   // 设定某个月起 OD 的锚定项目（没再单独设置的月份都沿用）
    const mo = +e.target.dataset.odanchor, yp = yearParams(curYear());
    yp.odAnchor = Object.assign({}, yp.odAnchor || {}); yp.odAnchor[mo] = e.target.value;
    state.years[curYear()] = yp; saveSilent(); renderNow(); renderPO();
    return;
  }
  if (e.target.matches('[data-fproj]') && importCtx) { importCtx.files[+e.target.dataset.fproj].project = e.target.value.trim(); return; }
  if (e.target.matches('[data-param]')) { saveParams(); return; }   // 参数：改完自动保存
  if (e.target.matches('[data-pedit]')) {   // 规划表里直接改（改完就存）
    const id2 = e.target.dataset.pedit, f = e.target.dataset.f, p = state.plans.find(x => x.id === id2);
    if (!p) return;
    const v = e.target.value.trim(), oldCode = p.code || '';
    if (f === 'amountW') {
      const w = parseWusd(v);
      if (w == null || w <= 0) { warn('金额无效（万美金，如 5.5）'); e.target.value = p.amountW != null ? p.amountW : ''; return; }
      p.amountW = w;
    } else if (f === 'code') {
      p.code = v || '';
    } else if (f === 'planProject') {
      p.planProject = v;
    } else if (f === 'target') {
      if (v === '') p.target = null;
      else { const tv = parseFloat(v); if (!Number.isFinite(tv) || tv < 0 || tv > 100) { warn('目标应为 0~100 或留空'); e.target.value = p.target != null ? Math.round(p.target * 100) : ''; return; } p.target = tv / 100; }
    } else if (f === 'name') {
      if (!v) { warn('规划名称不能为空'); e.target.value = p.name; return; }
      p.name = v;
    } else if (f === 'note') {
      p.note = v;
    }
    const mountChanged = f === 'code' && oldCode !== p.code;
    touch('plan'); saveSilent();
    const cnyCell = $('#pcny-' + id2);
    if (cnyCell) cnyCell.textContent = fmtCny(wusdOf(p) * 10000 * yearParams(curYear()).fxRate);
    renderBanner();
    // 联动刷新：首页决策卡/行动清单/预算来源表（不重建规划表避免丢焦点）
    renderNow(); renderBudget(); renderPO(); renderData();
    if (mountChanged) {   // 挂载变了：说清楚结果——共用 = 多对一；取消 = 这条规划算不进执行率
      const c2 = calc(), nm = p.code && c2.per[p.code] ? c2.per[p.code].name : '';
      if (!p.code) notify('「' + p.name + '」已经不挂任何 IT 预算项——执行率算不到它，记得重新挂上', 'warn');
      else {
        const others = state.plans.filter(q => q.id !== p.id && q.year === curYear() && q.code === p.code && !q.dead);
        notify(others.length
          ? '「' + p.name + '」挂到了 IT 预算项「' + nm + '」，和「' + others.map(q => q.name).join('、') + '」共用（多对一）：执行率按这个 IT 预算项合并算；授予流水里要给每一笔选归哪条规划'
          : '「' + p.name + '」挂到了 IT 预算项「' + (nm || p.code) + '」' + (c2.per[p.code] ? '' : '（平台上还没出现）'));
      }
    }
    return;
  }
  if (e.target.matches('[data-grantattr]')) {   // 授予流水里这一笔归哪条规划（多条规划对应一个系统预算项时用；按授予邮件里的规划归属人工判断）
    const key = e.target.dataset.grantattr, v = e.target.value;
    state.grantAttr = state.grantAttr || {};
    if (v) state.grantAttr[key] = v; else delete state.grantAttr[key];
    save();
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
          if (obj.teamPlan) state.teamPlan = obj.teamPlan; if (obj.grantAttr) state.grantAttr = obj.grantAttr;
          if (obj.projAlias) state.projAlias = obj.projAlias;
          save(); notify('配置已恢复');
        } else if (obj.type === 'budget-dash-data') {
          if (!confirm('恢复数据包：将覆盖执行表快照、PO明细和授予流水（不影响配置），确认？')) return;
          state.execSnaps = obj.execSnaps || []; state.poDataByYear = obj.poDataByYear || {}; state.grantLogs = obj.grantLogs || []; if (obj.grantData) state.grantData = obj.grantData; state.grantAttr = obj.grantAttr || {}; if (obj.changeLog) state.changeLog = obj.changeLog; if (obj.lastImportAt) state.lastImportAt = obj.lastImportAt; state.changes = null;
          if (obj.importLogs) state.importLogs = obj.importLogs; if (obj.projPrints) state.projPrints = obj.projPrints; if (obj.projAlias) state.projAlias = obj.projAlias;
          save(); notify('数据已恢复');
        } else {
          if (!Array.isArray(obj.plans)) throw new Error('格式不符');
          if ((state.plans.length || state.execSnaps.length) && !confirm('导入全量包将覆盖当前全部数据，确认？')) return;
          state = obj; save(); notify('恢复成功');
        }
      } catch (err) { warn('导入失败：不是本看板导出的备份文件'); }
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
  load();
  renderAll();
  try {
    const dh = await idbGet('dir');
    if (dh) {
      dirHandle = dh;
      const b2 = $('#datasetScanBtn'); if (b2) b2.style.display = '';
      let dp = 'granted';
      try { dp = await dh.queryPermission({ mode: 'read' }); } catch (e) { }
      if (dp === 'granted') await scanDataset(false);
      else { datasetPerm = dp || 'prompt'; renderNow(); renderData(); }   // 没有读取权限时自动扫描做不了：首页和数据管理里写明，让人点一下重新授权
    }
  } catch (e) { }
  // 解析规则变了的类别没能自动重读（没设数据集 / 没授权 / 文件夹里没有这类文件）：没有这类数据的直接记为已更新，有的留在首页提示
  try {
    const done = parseVerNeed().filter(k => !parseKindHasData(k));
    if (done.length) { parseVerMark(done); save(); }
    const sb = $('#datasetScanBtn');
    if (sb && dirHandle) sb.textContent = parseVerNeed().some(parseKindHasData) ? '🔄 重读数据集' : '📁 扫描数据集';
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
})();
