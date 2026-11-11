/*
 * build_data.js — processa as planilhas de alvarás da Prefeitura de São Paulo
 * e gera os arquivos que o site lê em ../data/.
 *
 * Uso:   cd scripts && npm install && node build_data.js
 *
 * Fontes (o ano vem do nome do arquivo):
 *   ../dados_brutos/processos_aprovados/PA_<ano>.xls(x)
 *        Relatório anual de processos aprovados (SEHAB/APROV → SMUL, sistema SLE).
 *        Traz SQL (desde 2002), endereço, categoria de uso, área, blocos/pavimentos/unidades.
 *   ../dados_brutos/aprova_digital/AD_<ano>.xlsx
 *        Relatório anual de alvarás do Aprova Digital (SMUL). Só traz o SQL.
 *
 * Etapas
 *  1. Lê as planilhas (acha o cabeçalho sozinho) — leitura guardada em ../cache/planilhas/.
 *  2. Classifica cada alvará pela "Descrição" (tipo × HIS/HMP × etapa × ato).
 *     HIS/HMP nos processos SEHAB/SMUL vem também da "Categoria de uso".
 *  3. Normaliza os SQLs (11 dígitos): repõe zeros perdidos, tira o prefixo "00."
 *     dos relatórios 2002–2010, recupera SQL que o Excel virou número decimal,
 *     separa códigos INCRA (área rural, sem lote fiscal).
 *  4. Geolocaliza pelo WFS do GeoSampa:
 *       lote_cidadao  (setor+quadra+lote)  → centróide do lote, endereço, uso IPTU
 *       quadra_fiscal (setor+quadra)       → centro da quadra (lote remembrado etc.)
 *       lote_cidadao  (logradouro+número)  → para quem não tem SQL (2000–2001,
 *                                            INCRA, SQL inválido): mesmo número
 *                                            ou o número mais próximo na mesma rua.
 *  5. Atribui distrito / subprefeitura / região por ponto-em-polígono.
 *  6. Escreve ../data/alvaras_<ano>.geojson, ../data/manifest.json,
 *     ../data/distritos.geojson e ../data/municipio.geojson.
 *
 * Nomes de pessoas (proprietário, responsáveis técnicos) NÃO vão para o site.
 * As respostas do WFS ficam em ../cache/ para não repetir consultas.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const RAW_AD = path.join(ROOT, 'dados_brutos', 'aprova_digital');
const RAW_PA = path.join(ROOT, 'dados_brutos', 'processos_aprovados');
const OUT = path.join(ROOT, 'data');
const CACHE = path.join(ROOT, 'cache');
const WFS = 'https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs';
const POOL = 5;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(CACHE, 'planilhas'), { recursive: true });

/* ------------------------------------------------------------------ util */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = (f, dflt) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : dflt);
const writeJSON = (f, obj) => fs.writeFileSync(f, JSON.stringify(obj));
const deacc = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const strip = (s) => deacc(s).toLowerCase();
const up = (s) => deacc(s).toUpperCase().replace(/\s+/g, ' ').trim();
const txt = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const round6 = (x) => Math.round(x * 1e6) / 1e6;

async function wfs(params, attempt = 1) {
  const body = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    outputFormat: 'application/json', srsName: 'EPSG:4326', ...params,
  });
  try {
    const res = await fetch(WFS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const t = await res.text();
    if (!t.startsWith('{')) throw new Error('resposta não-JSON: ' + t.slice(0, 200));
    return JSON.parse(t);
  } catch (e) {
    if (attempt >= 5) throw e;
    console.warn(`  WFS falhou (${e.message}); tentativa ${attempt + 1}…`);
    await sleep(3000 * attempt);
    return wfs(params, attempt + 1);
  }
}

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

/* Centróide (lon/lat) ponderado por área; para MultiPolygon usa todas as partes. */
function centroid(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let A = 0, cx = 0, cy = 0, n = 0, sx = 0, sy = 0;
  for (const poly of polys) {
    const ring = poly[0];
    for (let k = 0; k < ring.length - 1; k++) {
      const [x0, y0] = ring[k], [x1, y1] = ring[k + 1];
      const f = x0 * y1 - x1 * y0;
      A += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
      sx += x0; sy += y0; n++;
    }
  }
  if (Math.abs(A) < 1e-14) return n ? [sx / n, sy / n] : null;
  return [cx / (3 * A), cy / (3 * A)];
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeom(x, y, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    if (!pointInRing(x, y, poly[0])) continue;
    let hole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(x, y, poly[h])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}
function bbox(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys) for (const [x, y] of p[0]) {
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  return b;
}

/* ------------------------------------------------------- classificação */
const RE_HIS_CAT = /(^|[^A-Z])E?H\.?\s?I\.?\s?S([^A-Z]|$)|(^|[^A-Z])E?H\.?\s?M\.?\s?P([^A-Z]|$)|EZEIS|INTERESSE SOCIAL/;

/* Edificação nova exceto HIS/HMP: subclasse pela categoria de uso (só processos SEHAB/SMUL). */
const RES_CODES = new Set(['R1', 'R2h', 'R2v', 'R2', 'R3', 'R']);
const isNR = (k) => /^(NR\d?|IND|INFRA|[CSI]\d?|E\d?)$/.test(k);
function usoSub(cats) {
  const R = cats.filter((k) => RES_CODES.has(k)), N = cats.filter(isNR);
  if (R.length && N.length) return 'misto';
  if (cats.includes('R2v')) return 'r2v';
  if (cats.includes('R2h')) return 'r2h';
  if (cats.includes('R1')) return 'r1';
  if (R.length) return 'rant';
  if (N.length) return 'nr';
  return 'sem';
}

function classify(desc, fonte, cat = '', tipoC = '', cats = []) {
  // junta palavras quebradas pelo sistema: "EDI-FICACAO", "RE- FORMA", "EDIFICACAONOVA"
  const d = strip(desc).replace(/([a-z])-\s*([a-z])/g, '$1$2').replace(/\s+/g, ' ');

  let ato = 'emissao';
  if (/^recons|reconsidera/.test(d)) ato = 'reconsideracao';
  else if (d.includes('apostilamento')) ato = 'apostilamento';
  else if (/revalidac|renovac/.test(d)) ato = 'revalidacao';

  let tipo;
  if (d.includes('certificado de conclus')) tipo = 'certificado';
  else if (d.includes('regulariza')) tipo = 'regularizacao';
  else if (/desdobro|desmembr|remembr|loteament|reparcel|diretrizes|termo de verif/.test(d)) tipo = 'parcelamento';
  else if (d.includes('modificativo')) tipo = 'modificativo';
  else if (d.includes('demolic')) tipo = 'demolicao';
  else if (/reforma|reconstruc/.test(d)) tipo = 'reforma';
  else if (/edificacao ?nova|residencias unifamiliares/.test(d)) tipo = 'nova';
  else tipo = 'outro';

  // "EXCETO HIS/HMP" contém "HIS" — testar EXCETO primeiro.
  let social;
  if (d.includes('exceto')) social = 'mercado';
  else if (d.includes('declarat')) social = 'declaratorio';
  else if (/\bhis\b|\bhmp\b/.test(d)) social = 'his';
  else if (RE_HIS_CAT.test(up(cat) + ' | ' + up(tipoC))) social = 'his';
  else social = fonte === 'PA' ? 'mercado' : 'na';

  let etapa = '';
  if (/aprovacao e execucao|aprov\. e exec/.test(d)) etapa = 'aprovacao_execucao';
  else if (/aprovacao/.test(d)) etapa = 'aprovacao';
  else if (/execucao/.test(d) && !/termo de verif/.test(d)) etapa = 'execucao';
  if (!['nova', 'modificativo', 'reforma', 'demolicao'].includes(tipo)) etapa = '';

  let classe;
  if (tipo === 'nova') classe = social === 'declaratorio' ? 'nova_declaratorio' : social === 'his' ? 'nova_his' : 'nova_' + usoSub(cats);
  else if (tipo === 'modificativo' || tipo === 'reforma') classe = `${tipo}_${social === 'his' ? 'his' : usoSub(cats)}`;
  else classe = tipo;

  return { tipo, social, etapa, ato, classe };
}

/* Categoria de uso → códigos padronizados (descrições ficam no site, assets/app.js).
   "R2V-01; NR1-04 - NR2" → ["R2v", "NR1", "NR2"]. Subcategorias (S2.1, C2.3…) viram a categoria (S2, C2). */
function catCodes(cat) {
  const out = new Set();
  for (const part of up(cat).split(/[;,]|\s-\s(?=[A-Z])/)) {
    const t = part.replace(/\s+/g, '');
    if (!t) continue;
    let c, m;
    if (/^EHIS/.test(t)) c = 'EHIS';
    else if (/^EHMP/.test(t)) c = 'EHMP';
    else if (/^EZEIS/.test(t)) c = 'EZEIS';
    else if (/^H\.?I\.?S/.test(t)) c = 'HIS';
    else if (/^H\.?M\.?P/.test(t)) c = 'HMP';
    else if (/^R2V/.test(t)) c = 'R2v';
    else if (/^R2H/.test(t)) c = 'R2h';
    else if (/^R1(\D|$|\d\d)/.test(t)) c = 'R1';
    else if (/^R2/.test(t)) c = 'R2';
    else if (/^R3/.test(t)) c = 'R3';
    else if (/^R\.?$/.test(t)) c = 'R';
    else if ((m = t.match(/^NR([1-5])/))) c = 'NR' + m[1];
    else if (/^NR\.?$/.test(t)) c = 'NR';
    else if (/^INFRA/.test(t)) c = 'INFRA';
    else if (/^IND/.test(t)) c = 'IND';
    else if ((m = t.match(/^([CSIE])([1-4])?(?![A-Z])/))) c = m[1] + (m[2] || '');
    else c = 'OUTRA';
    out.add(c);
  }
  return [...out];
}

/* Uso pela categoria (só processos SEHAB/SMUL): residencial, não residencial, misto. */
function usoFromCat(cat, tipoC) {
  let r = false, nr = false;
  for (const t0 of up(cat).split(/[;,]|\s-\s/)) {
    const t = t0.trim();
    if (!t) continue;
    if (/^(E?H\.?I\.?S|E?H\.?M\.?P|EZEIS|R)/.test(t)) r = true;
    else if (/^(NR|C|S|I|E|IND|N)/.test(t)) nr = true;
  }
  const tc = up(tipoC);
  if (/RESIDENCIAL|INTERESSE SOCIAL/.test(tc)) r = true;
  else if (/SERVICO|COMERCIAL|INSTITUCIONAL|INDUSTRIAL/.test(tc)) nr = true;
  return r && nr ? 'misto' : r ? 'residencial' : nr ? 'nao_residencial' : '';
}

/* --------------------------------------------------------------- SQLs */
const sqlIssues = { zerosRepostos: 0, decimalExcel: 0, prefixo00: 0, incra: 0, invalidos: 0, exemplosInvalidos: [] };
/* strict = true (processos SEHAB/SMUL): texto curto sem pontuação é ambíguo e vai para o endereço. */
function parseSQLs(cell, strict = false) {
  if (cell === null || cell === undefined || cell === '') return { sqls: [], incra: false };
  if (typeof cell === 'number') {
    // Excel transformou "07136804442,07136804450" em 7136804442.07136…: só a 1ª parte é recuperável.
    if (!Number.isInteger(cell)) sqlIssues.decimalExcel++;
    const s = String(Math.trunc(cell));
    if (s.length < 11 && s.length >= 8) sqlIssues.zerosRepostos++;
    return { sqls: s.length >= 8 && s.length <= 11 ? [s.padStart(11, '0')] : [], incra: s.length === 13 };
  }
  const s = String(cell).trim();
  if (!s || s === '-') return { sqls: [], incra: false };
  const out = [];
  let incra = false;
  for (let part of s.split(/[,;\s/]+/)) {
    if (!part) continue;
    if (/^\d+\.\d+$/.test(part) && part.split('.')[0].length >= 8) { sqlIssues.decimalExcel++; part = part.split('.')[0]; }
    let dig = part.replace(/\D/g, '');
    if (!dig) continue;
    if ((dig.length === 13 || dig.length === 12) && dig.startsWith('00')) { sqlIssues.prefixo00++; dig = dig.slice(2); }
    else if (dig.length === 13) { sqlIssues.incra++; incra = true; continue; }
    if (dig.length === 11 || (dig.length === 10 && /^\d{2}\.\d{3}\.\d{3}\.\d{4}-?$/.test(part))) out.push(dig);
    else if (!strict && dig.length >= 8 && dig.length < 11) { sqlIssues.zerosRepostos++; out.push(dig.padStart(11, '0')); }
    else {
      sqlIssues.invalidos++;
      if (sqlIssues.exemplosInvalidos.length < 20) sqlIssues.exemplosInvalidos.push(part);
    }
  }
  return { sqls: [...new Set(out)], incra };
}

function parseDate(v) {
  if (typeof v === 'number' && v > 30000 && v < 60000) {
    const p = XLSX.SSF.parse_date_code(v);
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);
  if (!m) return '';
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseNum(v) {
  if (typeof v === 'number') return v > 0 ? Math.round(v * 100) / 100 : null;
  let s = String(v ?? '').trim();
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const x = parseFloat(s);
  return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : null;
}

/* Endereço como veio na planilha, limpo: "AV  FELIPE CARRILLO PUERTO 00032 " → "AV FELIPE CARRILLO PUERTO, 32" */
function cleanEndereco(s) {
  let a = txt(s).replace(/\s*,\s*/g, ', ');
  a = a.replace(/^([A-Z]{1,5}\.?\s+.+?)\s+0*(\d{1,5})(?=\D|$)/, '$1, $2');
  return a.replace(/,\s*,/g, ',');
}
/* Endereço para busca: tipo + nome + número. */
function parseEndereco(s) {
  const a = up(s).replace(/,/g, ' ').replace(/\s+/g, ' ');
  const m = a.match(/^([A-Z]{1,5})\.?\s+([A-Z0-9][A-Z0-9 .'-]*?[A-Z][A-Z0-9 .'-]*?)\s+0*(\d{1,5})(?!\d)/);
  if (!m) return null;
  const nome = m[2].replace(/[.\s-]+$/, '').trim();
  if (nome.length < 3 || /[%_]/.test(nome)) return null;
  return { tipo: m[1], nome, num: +m[3] };
}

/* ------------------------------------------------------- leitura */
function cached(file, reader) {
  const st = fs.statSync(file);
  const cf = path.join(CACHE, 'planilhas', `${path.basename(file)}-${st.size}-${Math.round(st.mtimeMs)}.json`);
  if (fs.existsSync(cf)) return readJSON(cf);
  const t = Date.now();
  const r = reader(file);
  writeJSON(cf, r);
  console.log(`  lido ${path.basename(file)} em ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return r;
}

function readAprovaDigital(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets['Plan1'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  const hi = rows.findIndex((r) => r.some((c) => strip(c) === 'descricao') && r.some((c) => strip(c) === 'sqls'));
  if (hi < 0) throw new Error('Cabeçalho não encontrado em ' + file);
  const h = rows[hi].map(strip);
  const col = (name) => h.findIndex((c) => c.startsWith(name));
  const C = {
    data: col('data de deferimento'), proc: col('processo aprova'), sei: col('processo sei'),
    desc: col('descricao'), sqls: col('sqls'),
  };
  const titulo = rows.slice(0, hi).flat().filter((x) => String(x).trim()).join(' ');
  const recs = [];
  for (const r of rows.slice(hi + 1)) {
    if (!String(r[C.desc]).trim()) continue;
    recs.push({
      data: parseDate(r[C.data]),
      processo: txt(r[C.proc]),
      sei: txt(r[C.sei]),
      descricao: txt(r[C.desc]),
      sql: r[C.sqls],
    });
  }
  return { titulo, recs };
}

function readProcessos(file) {
  const wb = XLSX.readFile(file);
  let best = null;
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true, blankrows: false });
    let hi = -1;
    for (let i = 0; i < Math.min(rows.length, 60); i++) {
      const r = rows[i].map(up);
      if (r.some((c) => c.startsWith('DESCRI')) && r.some((c) => c.includes('ALVAR'))) { hi = i; break; }
    }
    if (hi >= 0 && (!best || rows.length > best.rows.length)) best = { rows, hi };
  }
  if (!best) throw new Error('Cabeçalho não encontrado em ' + file);
  const { rows, hi } = best;
  const H = rows[hi].map(up);
  const col = (pred) => H.findIndex(pred);
  const C = {
    mes: col((c) => c.startsWith('MES')),
    regional: col((c) => /^(ADMINISTRACAO REGIONAL|SUBPREFEITURA|PREFEITURA REGIONAL)/.test(c)),
    alvara: col((c) => c === 'ALVARA'),
    processo: col((c) => c === 'PROCESSO'),
    desc: col((c) => c.startsWith('DESCRI')),
    tipoc: col((c) => c.startsWith('TIPO DA CONSTRU')),
    sql: col((c) => c.includes('SQL')),
    cat: col((c) => c.startsWith('CATEGORIA DE USO')),
    zona: col((c) => c.startsWith('ZONA DE USO')),
    area: col((c) => c.startsWith('AREA DA CONSTRU')),
    end: col((c) => c.startsWith('ENDERE')),
    num: col((c) => c === 'NUMERO'),
    aprov: col((c) => c.startsWith('APROVACAO')),
    bpu: col((c) => c.startsWith('(B)LOCOS')),
    nbl: col((c) => c.startsWith('NUMERO DE BLOCOS')),
    nun: col((c) => c.startsWith('NUMERO DE UNIDADES')),
    npav: col((c) => c.startsWith('NUMERO DE PAVIMENTOS')),
  };
  const g = (r, k) => (C[k] >= 0 ? r[C[k]] : '');
  const titulo = rows.slice(0, hi).flat().map(txt).filter((x) => x && !/^P[aá]gina/i.test(x)).join(' · ');
  const recs = [];
  for (const r of rows.slice(hi + 1)) {
    const desc = txt(g(r, 'desc'));
    if (!desc || /^\*+$/.test(desc)) continue;
    let end = txt(g(r, 'end'));
    const num = txt(g(r, 'num'));
    if (num && !/\d\s*$/.test(end)) end = `${end} ${num}`;
    let bpu = txt(g(r, 'bpu'));
    if (!bpu && (C.nbl >= 0 || C.nun >= 0)) {
      const b = txt(g(r, 'nbl')), p = txt(g(r, 'npav')), u = txt(g(r, 'nun'));
      if (b || p || u) bpu = `B: ${b || '-'} P: ${p || '-'} U: ${u || '-'}`;
    }
    recs.push({
      data: parseDate(g(r, 'aprov')),
      alvara: txt(g(r, 'alvara')),
      processo: txt(g(r, 'processo')),
      descricao: desc,
      sql: g(r, 'sql'),
      categoria: txt(g(r, 'cat')).replace(/\s*-\s*/g, ' - '),
      tipo_construcao: txt(g(r, 'tipoc')),
      zona: txt(g(r, 'zona')),
      area: parseNum(g(r, 'area')),
      endereco: end,
      regional: txt(g(r, 'regional')),
      bpu,
    });
  }
  return { titulo, recs };
}

/* ----------------------------------------------------- geolocalização */
async function geocodeLots(keys10) {
  const cacheFile = path.join(CACHE, 'lotes.json');
  const cache = readJSON(cacheFile, {});
  const todo = [...new Set(keys10)].filter((k) => !(k in cache));
  console.log(`Lotes: ${keys10.length} pedidos, ${todo.length} a consultar no GeoSampa`);
  // agrupa por setor+quadra
  const bySQ = new Map();
  for (const k of todo) {
    const sq = k.slice(0, 6);
    if (!bySQ.has(sq)) bySQ.set(sq, []);
    bySQ.get(sq).push(k.slice(6, 10));
  }
  const groups = [...bySQ.entries()];
  const batches = [];
  for (let i = 0; i < groups.length; i += 60) batches.push(groups.slice(i, i + 60));
  let done = 0;
  const t0 = Date.now();
  await pool(batches, POOL, async (batch) => {
    const cql = batch
      .map(([sq, lots]) => `(cd_setor_fiscal='${sq.slice(0, 3)}' AND cd_quadra_fiscal='${sq.slice(3, 6)}' AND cd_lote IN (${lots.map((l) => `'${l}'`).join(',')}))`)
      .join(' OR ');
    const j = await wfs({
      typeNames: 'geoportal:lote_cidadao',
      propertyName: 'cd_setor_fiscal,cd_quadra_fiscal,cd_lote,cd_condominio,nm_logradouro_completo,cd_numero_porta,dc_tipo_uso_imovel,tx_situ_lote,ge_poligono',
      CQL_FILTER: cql,
    });
    const found = {};
    for (const f of j.features) {
      const p = f.properties;
      const k = p.cd_setor_fiscal + p.cd_quadra_fiscal + p.cd_lote;
      const c = f.geometry ? centroid(f.geometry) : null;
      if (!c) continue;
      const rec = {
        lon: round6(c[0]), lat: round6(c[1]),
        end: [p.nm_logradouro_completo, p.cd_numero_porta].filter(Boolean).join(', '),
        uso: p.dc_tipo_uso_imovel || '',
        sit: p.tx_situ_lote || '',
      };
      // prefere lote ATIVO e de condomínio "00"
      const prev = found[k];
      const score = (r, cond) => (r.sit === 'ATIVO' ? 2 : 0) + (cond === '00' ? 1 : 0) + (r.end ? 1 : 0);
      if (!prev || score(rec, p.cd_condominio) > prev.s) found[k] = { ...rec, s: score(rec, p.cd_condominio) };
    }
    for (const [sq, lots] of batch) for (const l of lots) {
      const k = sq + l;
      if (found[k]) { const { s, ...r } = found[k]; cache[k] = r; } else cache[k] = null;
    }
    done++;
    if (done % 20 === 0 || done === batches.length) {
      const el = (Date.now() - t0) / 1000;
      console.log(`  lotes: ${done}/${batches.length} consultas · ${Math.round(el)} s (faltam ~${Math.round((el / done) * (batches.length - done))} s)`);
      writeJSON(cacheFile, cache);
    }
  });
  writeJSON(cacheFile, cache);
  return cache;
}

async function geocodeQuadras(keys6) {
  const cacheFile = path.join(CACHE, 'quadras.json');
  const cache = readJSON(cacheFile, {});
  const todo = [...new Set(keys6)].filter((k) => !(k in cache));
  console.log(`Quadras (fallback): ${keys6.length} pedidas, ${todo.length} a consultar`);
  const bySetor = new Map();
  for (const k of todo) {
    const s = k.slice(0, 3);
    if (!bySetor.has(s)) bySetor.set(s, []);
    bySetor.get(s).push(k.slice(3, 6));
  }
  const groups = [...bySetor.entries()];
  const batches = [];
  for (let i = 0; i < groups.length; i += 25) batches.push(groups.slice(i, i + 25));
  let done = 0;
  await pool(batches, POOL, async (batch) => {
    const cql = batch
      .map(([s, qs]) => `(cd_setor_fiscal='${s}' AND cd_quadra_fiscal IN (${qs.map((q) => `'${q}'`).join(',')}))`)
      .join(' OR ');
    const j = await wfs({
      typeNames: 'geoportal:quadra_fiscal',
      propertyName: 'cd_setor_fiscal,cd_quadra_fiscal,qt_area_quadra_fiscal,ge_poligono',
      CQL_FILTER: cql,
    });
    // uma quadra pode ter várias subquadras: média ponderada pela área
    const acc = {};
    for (const f of j.features) {
      const p = f.properties;
      const k = p.cd_setor_fiscal + p.cd_quadra_fiscal;
      const c = f.geometry ? centroid(f.geometry) : null;
      if (!c) continue;
      const w = p.qt_area_quadra_fiscal || 1;
      acc[k] = acc[k] || { x: 0, y: 0, w: 0 };
      acc[k].x += c[0] * w; acc[k].y += c[1] * w; acc[k].w += w;
    }
    for (const [s, qs] of batch) for (const q of qs) {
      const k = s + q;
      cache[k] = acc[k] ? { lon: round6(acc[k].x / acc[k].w), lat: round6(acc[k].y / acc[k].w) } : null;
    }
    done++;
    if (done % 20 === 0 || done === batches.length) console.log(`  quadras: ${done}/${batches.length} consultas`);
  });
  writeJSON(cacheFile, cache);
  return cache;
}

/* Lotes de cada logradouro (por nome, qualquer tipo): nome → [[setor+quadra+lote, número, tipo], …] */
async function geocodeRuas(nomes) {
  const cacheFile = path.join(CACHE, 'ruas.json');
  const cache = readJSON(cacheFile, {});
  const todo = [...new Set(nomes)].filter((n) => !(n in cache));
  console.log(`Logradouros (endereço sem SQL): ${nomes.length} pedidos, ${todo.length} a consultar`);
  const batches = [];
  for (let i = 0; i < todo.length; i += 30) batches.push(todo.slice(i, i + 30));
  let done = 0;
  const t0 = Date.now();
  await pool(batches, POOL, async (batch) => {
    const cql = batch.map((n) => `nm_logradouro_completo LIKE '% ${n.replace(/'/g, "''")}'`).join(' OR ');
    const j = await wfs({
      typeNames: 'geoportal:lote_cidadao',
      propertyName: 'cd_setor_fiscal,cd_quadra_fiscal,cd_lote,nm_logradouro_completo,cd_numero_porta',
      CQL_FILTER: cql,
    });
    const want = new Set(batch);
    const acc = Object.fromEntries(batch.map((n) => [n, new Map()]));
    for (const f of j.features) {
      const p = f.properties;
      const full = up(p.nm_logradouro_completo);
      const sp = full.indexOf(' ');
      const tipo = full.slice(0, sp), nome = full.slice(sp + 1);
      if (!want.has(nome)) continue;
      const k = p.cd_setor_fiscal + p.cd_quadra_fiscal + p.cd_lote;
      const num = parseInt(p.cd_numero_porta, 10);
      if (!acc[nome].has(k)) acc[nome].set(k, [k, Number.isFinite(num) ? num : null, tipo]);
    }
    for (const n of batch) cache[n] = [...acc[n].values()];
    done++;
    if (done % 10 === 0 || done === batches.length) {
      const el = (Date.now() - t0) / 1000;
      console.log(`  logradouros: ${done}/${batches.length} consultas · ${Math.round(el)} s (faltam ~${Math.round((el / done) * (batches.length - done))} s)`);
      writeJSON(cacheFile, cache);
    }
  });
  writeJSON(cacheFile, cache);
  return cache;
}

/* Títulos por extenso (planilhas antigas) → abreviação usada no cadastro do GeoSampa. */
const ABBR = {
  BARAO: 'BR', BARONESA: 'BRSA', CONSELHEIRO: 'CONS', CARDEAL: 'CARD', PROFESSOR: 'PROF', PROFESSORA: 'PROFA',
  DOUTOR: 'DR', DOUTORA: 'DRA', ENGENHEIRO: 'ENG', SENADOR: 'SEN', MARECHAL: 'MAL', SANTA: 'STA', SANTO: 'STO',
  CORONEL: 'CEL', CAPITAO: 'CAP', TENENTE: 'TEN', GENERAL: 'GAL', MINISTRO: 'MIN', PADRE: 'PE', PRESIDENTE: 'PRES',
  DEPUTADO: 'DEP', VEREADOR: 'VER', GOVERNADOR: 'GOV', ALMIRANTE: 'ALM', BRIGADEIRO: 'BRIG', COMENDADOR: 'COM',
  DESEMBARGADOR: 'DES', MAJOR: 'MAJ', MARQUES: 'MARQ', MONSENHOR: 'MONS', SARGENTO: 'SGT', SOLDADO: 'SOLD',
  VISCONDE: 'VISC', ARQUITETO: 'ARQ', PREFEITO: 'PREF', EMBAIXADOR: 'EMB', JORNALISTA: 'JORN', MAESTRO: 'MTO',
  CONEGO: 'CON', REGENTE: 'REG', CONDE: 'CDE', IRMAO: 'IR', IRMA: 'IR', JUNIOR: 'JR', FILHO: 'FO', NOSSA: 'NS', SENHORA: 'SRA',
};
const TITLES = new Set([...Object.values(ABBR), 'DOM', 'FREI', 'SAO', 'S', 'GEN', 'COMEND', 'PRESID']);
const STOPW = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'D']);
const canonTokens = (name) => up(name).replace(/[.'-]/g, ' ').split(' ').filter(Boolean).map((t) => ABBR[t] || t).filter((t) => !STOPW.has(t));
function sameTokens(a, b) {
  if (!a.length || a.length !== b.length) return false;
  // iguais, ou um é a inicial do outro ("M" = "MARTINS")
  return a.every((t, i) => t === b[i] || (Math.min(t.length, b[i].length) <= 2 && (t.startsWith(b[i]) || b[i].startsWith(t))));
}
/* 2 = mesmo nome (títulos abreviados); 1 = mesmo nome sem os títulos; 0 = diferente */
function nameMatch(ours, theirs) {
  const a = canonTokens(ours), b = canonTokens(theirs);
  if (sameTokens(a, b)) return 2;
  const a2 = a.filter((t) => !TITLES.has(t)), b2 = b.filter((t) => !TITLES.has(t));
  if (a2.some((t) => t.length >= 4) && sameTokens(a2, b2)) return 1;
  return 0;
}

/* Segunda tentativa para os logradouros que não apareceram com o nome por extenso:
   busca pela palavra mais longa do nome e compara com títulos abreviados. */
async function geocodeRuasFuzzy(nomes) {
  const cacheFile = path.join(CACHE, 'ruas_fuzzy.json');
  const cache = readJSON(cacheFile, {});
  const todo = [...new Set(nomes)].filter((n) => !(n in cache));
  const byTok = new Map();
  for (const n of todo) {
    const toks = canonTokens(n).filter((t) => !TITLES.has(t) && /^[A-Z]+$/.test(t)).sort((x, y) => y.length - x.length);
    if (!toks.length || toks[0].length < 4) { cache[n] = []; continue; }
    if (!byTok.has(toks[0])) byTok.set(toks[0], []);
    byTok.get(toks[0]).push(n);
  }
  const toks = [...byTok.keys()];
  console.log(`Logradouros com títulos abreviados: ${todo.length} nomes, ${toks.length} palavras a consultar`);
  const batches = [];
  for (let i = 0; i < toks.length; i += 15) batches.push(toks.slice(i, i + 15));
  let done = 0;
  await pool(batches, POOL, async (batch) => {
    const cql = batch.map((t) => `nm_logradouro_completo LIKE '%${t}%'`).join(' OR ');
    const j = await wfs({
      typeNames: 'geoportal:lote_cidadao',
      propertyName: 'cd_setor_fiscal,cd_quadra_fiscal,cd_lote,nm_logradouro_completo,cd_numero_porta',
      CQL_FILTER: cql,
    });
    // agrupa os lotes por nome de logradouro do GeoSampa
    const streets = new Map();
    for (const f of j.features) {
      const p = f.properties;
      const full = up(p.nm_logradouro_completo);
      if (!streets.has(full)) streets.set(full, new Map());
      const k = p.cd_setor_fiscal + p.cd_quadra_fiscal + p.cd_lote;
      const num = parseInt(p.cd_numero_porta, 10);
      streets.get(full).set(k, [k, Number.isFinite(num) ? num : null, full.slice(0, full.indexOf(' '))]);
    }
    for (const t of batch) for (const n of byTok.get(t)) {
      let best = 0, lots = [];
      for (const [full, m] of streets) {
        const s = nameMatch(n, full.slice(full.indexOf(' ') + 1));
        if (s > best) { best = s; lots = [...m.values()]; } else if (s && s === best) lots.push(...m.values());
      }
      cache[n] = lots;
    }
    done++;
    if (done % 10 === 0 || done === batches.length) { console.log(`  títulos: ${done}/${batches.length} consultas`); writeJSON(cacheFile, cache); }
  });
  writeJSON(cacheFile, cache);
  return cache;
}

/* Candidatos (até 6 lotes) para um endereço: mesmo número; senão o número mais próximo (mesma paridade, até 60). */
function addrCandidates(a, ruas) {
  const lots = ruas[a.nome] || [];
  if (!lots.length) return null;
  const sameTipo = lots.filter((l) => l[2] === a.tipo);
  const base = sameTipo.length ? sameTipo : lots;
  const exact = base.filter((l) => l[1] === a.num);
  if (exact.length) return { prec: 'endereco', keys: exact.slice(0, 6).map((l) => l[0]) };
  const near = base
    .filter((l) => l[1] !== null && l[1] % 2 === a.num % 2 && Math.abs(l[1] - a.num) <= 60)
    .sort((x, y) => Math.abs(x[1] - a.num) - Math.abs(y[1] - a.num));
  if (near.length) return { prec: 'rua', keys: near.slice(0, 6).map((l) => l[0]) };
  return null;
}

async function getBoundaries() {
  const fD = path.join(CACHE, 'distritos_wfs.geojson');
  const fS = path.join(CACHE, 'subprefeituras_wfs.geojson');
  if (!fs.existsSync(fD)) {
    console.log('Baixando distritos (GeoSampa)…');
    writeJSON(fD, await wfs({ typeNames: 'geoportal:distrito_municipal' }));
  }
  if (!fs.existsSync(fS)) {
    console.log('Baixando subprefeituras (GeoSampa)…');
    writeJSON(fS, await wfs({ typeNames: 'geoportal:subprefeitura', propertyName: 'cd_identificador_subprefeitura,nm_subprefeitura,sg_subprefeitura' }));
  }
  const D = readJSON(fD), S = readJSON(fS);
  const subById = Object.fromEntries(S.features.map((f) => [f.properties.cd_identificador_subprefeitura, f.properties.nm_subprefeitura]));
  const dist = D.features.map((f) => ({
    nome: f.properties.nm_distrito_municipal,
    sigla: f.properties.sg_distrito_municipal,
    subpref: subById[f.properties.cd_identificador_subprefeitura] || '',
    regiao: f.properties.nm_regiao_05 || '',
    geom: f.geometry,
    bb: bbox(f.geometry),
  }));
  return { D, dist };
}

function locateDistrict(dist, lon, lat) {
  for (const d of dist) {
    if (lon < d.bb[0] || lon > d.bb[2] || lat < d.bb[1] || lat > d.bb[3]) continue;
    if (pointInGeom(lon, lat, d.geom)) return d;
  }
  return null;
}

/* Exporta limites simplificados para o site (mapshaper). */
async function writeBoundaries(D) {
  const mapshaper = require('mapshaper');
  const slim = {
    type: 'FeatureCollection',
    features: D.features.map((f) => ({
      type: 'Feature', geometry: f.geometry,
      properties: { nome: f.properties.nm_distrito_municipal, sigla: f.properties.sg_distrito_municipal, regiao: f.properties.nm_regiao_05 },
    })),
  };
  const input = { 'd.json': JSON.stringify(slim) };
  const o1 = await mapshaper.applyCommands('-i d.json -simplify 12% keep-shapes -o distritos.geojson precision=0.00001', input);
  fs.writeFileSync(path.join(OUT, 'distritos.geojson'), o1['distritos.geojson']);
  const o2 = await mapshaper.applyCommands('-i d.json -dissolve -simplify 12% keep-shapes -o municipio.geojson geojson-type=FeatureCollection precision=0.00001', input);
  fs.writeFileSync(path.join(OUT, 'municipio.geojson'), o2['municipio.geojson']);
}

/* semelhança entre o nome da regional na planilha e a subprefeitura/distrito do ponto */
const tokens = (s) => new Set(up(s).replace(/[^A-Z ]/g, ' ').split(' ').filter((t) => t.length > 2 && !['DOS', 'DAS', 'DE', 'DO', 'DA'].includes(t)));
function regionalScore(regional, d) {
  if (!regional || !d) return 0;
  const a = tokens(regional);
  if (!a.size) return 0;
  const b = new Set([...tokens(d.subpref), ...tokens(d.nome)]);
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  if (up(regional) === 'SE' && up(d.subpref) === 'SE') n = 1;
  return n;
}

/* ---------------------------------------------------------------- main */
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const FONTES = {
  PA: { nome: 'Processos aprovados', orgao: 'SEHAB/SMUL', descricao: 'Relatório anual de processos aprovados (SEHAB/APROV, depois SMUL — sistema SLE)' },
  AD: { nome: 'Aprova Digital', orgao: 'SMUL', descricao: 'Relatório anual de alvarás emitidos pelo Aprova Digital (SMUL)' },
};
const listXls = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith('~$')).sort() : []);

(async () => {
  /* 1. leitura */
  const all = [];          // registros de todas as fontes
  const fontesAno = {};    // ano → [{fonte, arquivo, titulo, total}]
  for (const [fonte, dir, reader] of [['PA', RAW_PA, readProcessos], ['AD', RAW_AD, readAprovaDigital]]) {
    for (const f of listXls(dir)) {
      const m = f.match(/(20\d{2})/);
      if (!m) { console.warn('Ignorado (sem ano no nome):', f); continue; }
      const ano = +m[1];
      const { titulo, recs } = cached(path.join(dir, f), reader);
      for (const r of recs) {
        const { sqls, incra } = parseSQLs(r.sql, fonte === 'PA');
        all.push({ ...r, fonte, ano, sqls, incra });
      }
      (fontesAno[ano] = fontesAno[ano] || []).push({ fonte, arquivo: f, titulo, total: recs.length });
      console.log(`${fonte} ${ano}: ${recs.length} registros  (${f})`);
    }
  }

  if (process.env.DRY) { // conferência rápida, sem consultar o GeoSampa
    const t = {};
    const inc = (k) => (t[k] = (t[k] || 0) + 1);
    for (const r of all) {
      const c = classify(r.descricao, r.fonte, r.categoria, r.tipo_construcao, r.fonte === 'PA' ? catCodes(r.categoria) : []);
      inc(`classe ${c.classe}`); inc(`ato ${c.ato}`); inc(`etapa ${c.etapa || '-'}`);
      inc(r.sqls.length ? 'com SQL' : r.incra ? 'INCRA' : 'sem SQL');
      if (!r.sqls.length && r.fonte === 'PA') inc(parseEndereco(r.endereco) ? 'sem SQL, endereço ok' : 'sem SQL, endereço ruim');
      if (r.fonte === 'PA') inc('uso ' + (usoFromCat(r.categoria, r.tipo_construcao) || '-'));
      if (r.fonte === 'PA') for (const c of catCodes(r.categoria)) inc('cat ' + c);
      if (!r.data) inc('sem data');
      else if (!r.data.startsWith(String(r.ano))) inc('data fora do ano');
    }
    console.log(Object.entries(t).sort().map(([k, v]) => `${k}: ${v}`).join('\n'));
    console.log('SQL:', JSON.stringify(sqlIssues));
    const outros = {};
    for (const r of all) if (classify(r.descricao, r.fonte).classe === 'outro') outros[up(r.descricao)] = (outros[up(r.descricao)] || 0) + 1;
    console.log('— outros:', Object.entries(outros).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v} ${k}`).join('\n  '));
    return;
  }

  /* 2. lotes e quadras pelo SQL */
  const keys10 = new Set();
  for (const r of all) for (const s of r.sqls) keys10.add(s.slice(0, 10));
  const lots = await geocodeLots([...keys10]);
  const need6 = new Set();
  for (const k of keys10) if (!lots[k]) need6.add(k.slice(0, 6));
  const quadras = await geocodeQuadras([...need6]);

  const bySQL = (r) => {
    const hits = r.sqls.map((s) => lots[s.slice(0, 10)]).filter(Boolean);
    if (hits.length) return { prec: 'lote', pts: hits };
    const qs = [...new Set(r.sqls.map((s) => s.slice(0, 6)))].map((k) => quadras[k]).filter(Boolean);
    if (qs.length) return { prec: 'quadra', pts: qs };
    return null;
  };

  /* 3. endereço, para quem ficou sem localização pelo SQL */
  const semSQL = [];
  for (const r of all) {
    if (r.fonte !== 'PA' || bySQL(r)) continue;
    const a = parseEndereco(r.endereco);
    if (a) { r._addr = a; semSQL.push(r); }
  }
  const ruas = await geocodeRuas(semSQL.map((r) => r._addr.nome));
  const vazios = Object.keys(ruas).filter((n) => !ruas[n].length);
  const fuzzy = await geocodeRuasFuzzy(vazios);
  for (const n of vazios) if (fuzzy[n] && fuzzy[n].length) ruas[n] = fuzzy[n];
  const candKeys = new Set();
  for (const r of semSQL) {
    r._cand = addrCandidates(r._addr, ruas);
    if (r._cand) r._cand.keys.forEach((k) => candKeys.add(k));
  }
  Object.assign(lots, await geocodeLots([...candKeys]));   // mesmo cache de lotes

  /* 4. limites */
  const { D, dist } = await getBoundaries();
  await writeBoundaries(D);

  /* 5. saída por ano */
  const manifest = {
    gerado_em: new Date().toISOString().slice(0, 10),
    fontes: FONTES,
    geolocalizacao: 'GeoSampa (lote_cidadao, quadra_fiscal, distrito_municipal, subprefeitura)',
    anos: [],
  };
  const anos = [...new Set(all.map((r) => r.ano))].sort((a, b) => a - b);
  const prefix = { PA: 'PA', AD: 'AD' };
  for (const ano of anos) {
    const recs = all.filter((r) => r.ano === ano)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0) || (a.fonte < b.fonte ? -1 : 1));
    const feats = [];
    const st = {
      total: recs.length, mapeados: 0, por_lote: 0, por_quadra: 0, por_endereco: 0, por_rua: 0,
      sem_localizacao: 0, sem_sql_nem_endereco: 0, incra: 0, fora_municipio: 0,
      classes: {}, classes_total: {}, atos: {}, cubo: {},
    };
    const fst = Object.fromEntries((fontesAno[ano] || []).map((f) => [f.fonte, { ...f, mapeados: 0, datas: [] }]));
    const seq = { PA: 0, AD: 0 };
    for (const r of recs) {
      seq[r.fonte]++;
      const cats = r.fonte === 'PA' ? catCodes(r.categoria).sort() : [];
      const cls = classify(r.descricao, r.fonte, r.categoria, r.tipo_construcao, cats);
      st.classes_total[cls.classe] = (st.classes_total[cls.classe] || 0) + 1;
      if (r.data && r.data.startsWith(String(ano))) fst[r.fonte].datas.push(r.data);
      if (r.incra) st.incra++;

      let loc = bySQL(r), lon, lat, h0 = null;
      if (loc) {
        lon = loc.pts.reduce((s, p) => s + p.lon, 0) / loc.pts.length;
        lat = loc.pts.reduce((s, p) => s + p.lat, 0) / loc.pts.length;
        if (loc.prec === 'lote') h0 = loc.pts.find((p) => p.end) || loc.pts[0];
      } else if (r._cand) {
        // vários lotes com o mesmo endereço (ruas homônimas): fica o que cai na regional da planilha
        const cands = r._cand.keys.map((k) => lots[k]).filter(Boolean)
          .map((p) => ({ p, d: locateDistrict(dist, p.lon, p.lat) }))
          .map((c) => ({ ...c, s: regionalScore(r.regional, c.d) }))
          .sort((a, b) => b.s - a.s);
        // se a planilha diz a regional e nenhum candidato cai nela, é rua homônima em outro lugar: descarta
        const exigeRegional = tokens(r.regional).size > 0;
        if (cands.length && (!exigeRegional || cands[0].s > 0)) {
          loc = { prec: r._cand.prec };
          ({ lon, lat } = cands[0].p);
          h0 = cands[0].p;
        }
      }
      if (!loc) {
        st.sem_localizacao++;
        if (!r.sqls.length && !r._addr) st.sem_sql_nem_endereco++;
        continue;
      }
      const d = locateDistrict(dist, lon, lat);
      if (!d) st.fora_municipio++;
      st.mapeados++;
      st['por_' + loc.prec]++;
      fst[r.fonte].mapeados++;
      st.classes[cls.classe] = (st.classes[cls.classe] || 0) + 1;
      st.atos[cls.ato] = (st.atos[cls.ato] || 0) + 1;
      const ck = `${cls.classe}|${cls.ato}|${cls.etapa}|${r.fonte}|${cats.join('+')}`;
      st.cubo[ck] = (st.cubo[ck] || 0) + 1;

      const p = {
        id: `${prefix[r.fonte]}${String(ano).slice(2)}-${String(seq[r.fonte]).padStart(4, '0')}`,
        ano,
        data: r.data,
        fonte: r.fonte,
        alvara: r.alvara,
        processo: r.processo,
        sei: r.sei,
        descricao: r.descricao,
        classe: cls.classe,
        ato: cls.ato,
        etapa: cls.etapa,
        sqls: r.sqls.join(','),
        precisao: loc.prec,
        endereco: r.fonte === 'PA' && r.endereco ? cleanEndereco(r.endereco) : h0 ? h0.end : '',
        uso_iptu: h0 ? h0.uso : '',
        categoria: r.categoria,
        cats: cats.length ? cats : null,
        uso:r.fonte === 'PA' ? usoFromCat(r.categoria, r.tipo_construcao) : '',
        area: r.area,
        bpu: r.bpu,
        distrito: d ? d.nome : '',
        subprefeitura: d ? d.subpref : '',
        regiao: d ? d.regiao : '',
      };
      for (const k of Object.keys(p)) if (p[k] === '' || p[k] === null || p[k] === undefined) delete p[k];
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [round6(lon), round6(lat)] }, properties: p });
    }
    const fontes = Object.values(fst).map(({ datas, ...f }) => {
      datas.sort();
      return { ...f, data_inicial: datas[0] || '', data_final: datas[datas.length - 1] || '' };
    }).sort((a, b) => (a.fonte < b.fonte ? 1 : -1)); // PA antes de AD
    const datas = fontes.flatMap((f) => [f.data_inicial, f.data_final]).filter(Boolean).sort();
    const [d0, d1] = [datas[0], datas[datas.length - 1]];
    const rotulo = d0 && d1 ? `${MES[+d0.slice(5, 7) - 1]}–${MES[+d1.slice(5, 7) - 1]} ${ano}` : String(ano);
    const file = `alvaras_${ano}.geojson`;
    fs.writeFileSync(path.join(OUT, file), JSON.stringify({ type: 'FeatureCollection', features: feats }));
    manifest.anos.push({ ano, rotulo, arquivo: file, data_inicial: d0, data_final: d1, fontes, ...st });
    console.log(`${ano} (${rotulo}): ${st.total} · mapeados ${st.mapeados} (lote ${st.por_lote}, quadra ${st.por_quadra}, endereço ${st.por_endereco}, rua ${st.por_rua}) · sem localização ${st.sem_localizacao} · fora ${st.fora_municipio} · ${fontes.map((f) => f.fonte + ' ' + f.total).join(' + ')}`);
  }
  manifest.correcoes_sql = sqlIssues;
  writeJSON(path.join(OUT, 'manifest.json'), manifest);
  console.log('SQL:', JSON.stringify(sqlIssues));
  console.log('OK →', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
