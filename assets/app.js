/* Mapa de alvarás — São Paulo (processos aprovados SEHAB/SMUL e Aprova Digital). Sem build: abre direto no navegador. */
'use strict';
(() => {
  /* ============================================================ config */
  // Paleta conferida com o validador (todos os pares): daltonismo ΔE ≥ 8,3; visão normal ΔE ≥ 16,1.
  // Cor = HIS/HMP ou categoria de uso (igual nos três tipos de obra) · Forma = tipo de alvará.
  const COLORS = {
    his: '#eb6834', decl: '#1baf7a',
    r1: '#86b6ef', r2h: '#00695c', r2v: '#1565c0', rant: '#9575cd', nr: '#b71c1c', sem: '#7f8ea0',
    demol: '#2b2a27', regul: '#5f5e5a', cert: '#8a8984', outro: '#a9a8a3',
  };
  // subclasses de uso (edificação nova, projeto modificativo e reforma)
  const USO_SUB = [
    { sub: 'his', label: 'HIS/HMP', color: 'his', social: 'his' },
    { sub: 'r1', code: 'R1', label: 'Residência unifamiliar (casa)', color: 'r1', social: 'mercado' },
    { sub: 'r2h', code: 'R2h', label: 'Conjunto residencial horizontal', color: 'r2h', social: 'mercado' },
    { sub: 'r2v', code: 'R2v', label: 'Conjunto residencial vertical (prédio)', color: 'r2v', social: 'mercado' },
    { sub: 'rant', code: 'R2/R3', label: 'Residencial multifamiliar (lei antiga)', color: 'rant', social: 'mercado' },
    { sub: 'misto', code: 'R + NR', label: 'Uso misto', color: 'r2v', colors: ['r2v', 'nr'], split: true, social: 'mercado' },
    { sub: 'nr', code: 'NR', label: 'Não residencial (comércio, serviços, indústria)', color: 'nr', social: 'mercado' },
    { sub: 'sem', label: 'Uso não informado (Aprova Digital)', color: 'sem', social: 'mercado' },
    { sub: 'declaratorio', label: 'Processo declaratório', color: 'decl', social: 'decl', only: 'nova' },
  ];
  const OBRAS = [['nova', 'Edificação nova', 'circle'], ['modificativo', 'Projeto modificativo', 'diamond'], ['reforma', 'Reforma', 'square']];
  const CLASSES = [
    ...OBRAS.flatMap(([tipo, group, shape]) => USO_SUB.filter((u) => !u.only || u.only === tipo).map((u) => ({
      key: `${tipo}_${u.sub}`, group, tipo, sub: u.sub, code: u.code, label: u.label,
      color: u.color, colors: u.colors, split: u.split, shape, social: u.social,
    }))),
    { key: 'demolicao', group: 'Demolição', tipo: 'demolicao', label: 'Demolição', color: 'demol', shape: 'triangle' },
    { key: 'regularizacao', group: 'Regularização', tipo: 'regularizacao', label: 'Auto ou certificado de regularização', color: 'regul', shape: 'cross' },
    { key: 'parcelamento', group: 'Parcelamento do solo', tipo: 'parcelamento', label: 'Desdobro, desmembramento, loteamento', color: 'regul', shape: 'tri_down' },
    { key: 'certificado', group: 'Outros', tipo: 'outros', label: 'Certificado de conclusão', color: 'cert', shape: 'ring' },
    { key: 'outro', group: 'Outros', tipo: 'outros', label: 'Funcionamento, equipamentos e outros', color: 'outro', shape: 'dot' },
  ];
  const CLS = Object.fromEntries(CLASSES.map((c) => [c.key, c]));
  // ordem de desenho: atos "cinzas" embaixo; depois nova, modificativo, reforma, demolição;
  // dentro de cada tipo de obra, as subclasses mais raras por cima
  const BOTTOM = ['outro', 'certificado', 'parcelamento', 'regularizacao'];
  const SUB_ORDER = ['sem', 'rant', 'nr', 'r2v', 'his', 'misto', 'r2h', 'declaratorio', 'r1'];
  const OBRA_BASE = { nova: 10, modificativo: 30, reforma: 50 };
  const DRAW_ORDER = Object.fromEntries(CLASSES.map((c) => [c.key,
    BOTTOM.includes(c.key) ? BOTTOM.indexOf(c.key) : c.tipo in OBRA_BASE ? OBRA_BASE[c.tipo] + SUB_ORDER.indexOf(c.sub) : 90]));
  const clsText = (c) => (c.code ? `${c.code} — ${c.label}` : c.label);
  const ETAPAS = [['aprovacao', 'Aprovação'], ['execucao', 'Execução'], ['aprovacao_execucao', 'Aprovação e execução']];
  const ETAPA_LBL = Object.fromEntries(ETAPAS);
  const ATOS = [['emissao', 'Emissão'], ['reconsideracao', 'Reconsideração de despacho'], ['apostilamento', 'Apostilamento'], ['revalidacao', 'Revalidação ou renovação']];
  const ATO_LBL = Object.fromEntries(ATOS);
  const FONTES = [['PA', 'SEHAB/SMUL (processos aprovados)'], ['AD', 'Aprova Digital']];
  const FONTE_LBL = Object.fromEntries(FONTES);
  // Categoria de uso (planilhas SEHAB/SMUL). Códigos padronizados no processamento (scripts/build_data.js).
  // Lei atual = Leis 13.885/2004 e 16.402/2016; lei antiga = Lei 8.001/1973.
  const CAT_GROUPS = [
    { key: 'res', nome: 'Residencial', itens: [
      ['R1', 'Residência unifamiliar (casa)'],
      ['R2h', 'Conjunto residencial horizontal (vila, condomínio de casas)'],
      ['R2v', 'Conjunto residencial vertical (prédio)'],
      ['R2', 'Residência multifamiliar (lei antiga)'],
      ['R3', 'Conjunto residencial (lei antiga)'],
      ['R', 'Residencial, sem subcategoria'],
    ] },
    { key: 'his', nome: 'Interesse social e mercado popular', itens: [
      ['HIS', 'Habitação de Interesse Social'],
      ['HMP', 'Habitação de Mercado Popular'],
      ['EHIS', 'Empreendimento de HIS'],
      ['EHMP', 'Empreendimento de HMP'],
      ['EZEIS', 'Empreendimento em ZEIS'],
    ] },
    { key: 'nr', nome: 'Não residencial', itens: [
      ['NR1', 'Não residencial compatível (comércio e serviços de bairro)'],
      ['NR2', 'Não residencial tolerável'],
      ['NR3', 'Não residencial especial ou incômodo'],
      ['NR4', 'Não residencial, subcategoria nR4'],
      ['NR5', 'Não residencial, subcategoria nR5'],
      ['NR', 'Não residencial, sem subcategoria'],
      ['IND', 'Industrial (Ind-1a, Ind-1b, Ind-2, Ind-3)'],
      ['INFRA', 'Infraestrutura'],
    ] },
    { key: 'antiga', nome: 'Comércio, serviços, indústria e instituições (lei antiga)', itens: [
      ['C1', 'Comércio varejista de âmbito local'],
      ['C2', 'Comércio varejista diversificado'],
      ['C3', 'Comércio atacadista'],
      ['C', 'Comércio, sem subcategoria'],
      ['S1', 'Serviços de âmbito local'],
      ['S2', 'Serviços diversificados'],
      ['S3', 'Serviços especiais'],
      ['S', 'Serviços, sem subcategoria'],
      ['I1', 'Indústria não incômoda'],
      ['I2', 'Indústria diversificada'],
      ['I3', 'Indústria especial'],
      ['I', 'Indústria, sem subcategoria'],
      ['E1', 'Instituições de âmbito local'],
      ['E2', 'Instituições diversificadas'],
      ['E3', 'Instituições especiais'],
      ['E4', 'Usos especiais'],
      ['E', 'Institucional, sem subcategoria'],
    ] },
    { key: 'outros', nome: 'Outros', itens: [
      ['OUTRA', 'Outra categoria'],
      ['SEM', 'Sem categoria (Aprova Digital e campo vazio)'],
    ] },
  ];
  const CAT_LBL = Object.fromEntries(CAT_GROUPS.flatMap((g) => g.itens));
  const ALL_CATS = CAT_GROUPS.flatMap((g) => g.itens.map((i) => i[0]));
  const featCats = (p) => (p.cats && p.cats.length ? p.cats : ['SEM']);
  const USO_LBL = { residencial: 'Residencial', nao_residencial: 'Não residencial', misto: 'Misto (residencial e não residencial)' };
  const PREC_LBL = {
    lote: 'Lote fiscal, pelo SQL (GeoSampa)',
    quadra: 'Centro da quadra fiscal, pelo SQL — o lote não existe mais (remembramento ou condomínio)',
    endereco: 'Endereço da planilha (logradouro e número) no cadastro de lotes do GeoSampa',
    rua: 'Aproximada: número mais próximo no mesmo logradouro (GeoSampa)',
  };
  const FONT = '"Helv", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const PAGES = { a4l: { w: 3508, h: 2480 }, a4p: { w: 2480, h: 3508 }, wide: { w: 3840, h: 2160 } };
  // Fundo: Esri World Light Gray Canvas (gratuito, sem chave, permite exportar)
  const BASEMAPS = {
    gray_labels: ['World_Light_Gray_Base', 'World_Light_Gray_Reference'],
    gray: ['World_Light_Gray_Base'],
    none: [],
  };
  const esriUrl = (layer) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${layer}/MapServer/tile/{z}/{y}/{x}`;
  const TILE_ATTR = 'Base: Esri, © OpenStreetMap e GIS User Community';

  /* ============================================================ estado */
  const S = {
    manifest: null, anos: [], ano: null, distrito: '',
    on: new Set(CLASSES.map((c) => c.key)),
    etapas: new Set(ETAPAS.map((e) => e[0])),
    atos: new Set(ATOS.map((e) => e[0])),
    fontes: new Set(FONTES.map((e) => e[0])),
    cats: new Set(ALL_CATS),
    basemap: 'gray_labels', showDistritos: true,
    data: {}, distritos: null, municipio: null, distritoIndex: {},
  };
  let visible = [];   // feições visíveis do ano atual (ordem de desenho)
  let hits = [];      // posições na tela para hover/clique

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString('pt-BR');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const titleCase = (s) => String(s).toLowerCase().split(/\s+/).map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function periodo(a) {
    if (!a) return '';
    const full = a.data_inicial?.slice(5, 7) === '01' && a.data_final?.slice(5, 7) === '12';
    return full ? String(a.ano) : a.rotulo;
  }

  /* Web Mercator no "mundo" de 256 px (zoom 0) — igual ao Leaflet. */
  function project0(lon, lat) {
    const s = Math.sin((lat * Math.PI) / 180);
    return [((lon + 180) / 360) * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256];
  }

  /* ============================================================ símbolos */
  function pathSym(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'square') { const s = r * 0.9; ctx.rect(x - s, y - s, 2 * s, 2 * s); }
    else if (shape === 'diamond') { const d = r * 1.25; ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath(); }
    else if (shape === 'triangle') { const t = r * 1.5; ctx.moveTo(x, y - t); ctx.lineTo(x + t * 0.866, y + t * 0.5); ctx.lineTo(x - t * 0.866, y + t * 0.5); ctx.closePath(); }
    else if (shape === 'tri_down') { const t = r * 1.5; ctx.moveTo(x, y + t); ctx.lineTo(x + t * 0.866, y - t * 0.5); ctx.lineTo(x - t * 0.866, y - t * 0.5); ctx.closePath(); }
    else if (shape === 'cross') {
      const a = r * 1.2, b = r * 0.42;
      ctx.moveTo(x - b, y - a); ctx.lineTo(x + b, y - a); ctx.lineTo(x + b, y - b); ctx.lineTo(x + a, y - b); ctx.lineTo(x + a, y + b);
      ctx.lineTo(x + b, y + b); ctx.lineTo(x + b, y + a); ctx.lineTo(x - b, y + a); ctx.lineTo(x - b, y + b); ctx.lineTo(x - a, y + b);
      ctx.lineTo(x - a, y - b); ctx.lineTo(x - b, y - b); ctx.closePath();
    }
    else if (shape === 'dot') ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    else ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  function drawSym(ctx, c, x, y, r, ring) {
    if (c.split) { // uso misto: metade residencial (esq.), metade não residencial (dir.), na forma do tipo
      pathSym(ctx, c.shape, x, y, r);
      ctx.lineJoin = 'round'; ctx.lineWidth = ring * 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      const e = r * 1.6;
      ctx.save(); ctx.clip();
      ctx.fillStyle = COLORS[c.colors[0]]; ctx.fillRect(x - e, y - e, e, 2 * e);
      ctx.fillStyle = COLORS[c.colors[1]]; ctx.fillRect(x, y - e, e, 2 * e);
      ctx.restore();
      return;
    }
    pathSym(ctx, c.shape, x, y, r);
    ctx.lineJoin = 'round';
    ctx.lineWidth = ring * 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    if (c.shape === 'ring') {
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.45); ctx.strokeStyle = COLORS[c.color]; ctx.stroke();
    } else {
      ctx.fillStyle = COLORS[c.color]; ctx.fill();
    }
  }
  function symSVG(c, size = 16) {
    const cv = document.createElement('canvas');
    const dpr = 2; cv.width = size * dpr; cv.height = size * dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    drawSym(ctx, c, size / 2, size / 2 + (c.shape === 'triangle' ? 1 : c.shape === 'tri_down' ? -1 : 0), size * 0.3, 1);
    const img = new Image(); img.src = cv.toDataURL(); img.width = size; img.height = size; img.alt = '';
    return img;
  }
  const symR = (z) => (z <= 10 ? 3 : z <= 11 ? 3.5 : z <= 12 ? 4 : z <= 13 ? 5 : 6);

  /* ============================================================ mapa */
  const map = L.map('map', { zoomControl: true, preferCanvas: false, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5 });
  map.attributionControl.setPrefix('');
  const tileGroup = L.layerGroup().addTo(map);
  function setBasemap(style) {
    tileGroup.clearLayers();
    for (const layer of BASEMAPS[style] || []) {
      L.tileLayer(esriUrl(layer), {
        maxNativeZoom: 16, maxZoom: 20, crossOrigin: true,
        attribution: 'Base: Esri, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> e GIS User Community',
      }).addTo(tileGroup);
    }
  }

  const distritosLayer = L.layerGroup().addTo(map);
  const maskLayer = L.layerGroup().addTo(map);

  // camada de pontos: um <canvas> sobre o mapa, redesenhado a cada movimento
  const mapEl = map.getContainer();
  const cv = document.createElement('canvas');
  cv.className = 'pts';
  mapEl.appendChild(cv);
  let refLL = null;
  function screenT() {
    const z = map.getZoom(), k = Math.pow(2, z);
    refLL = refLL || L.latLng(-23.55, -46.63);
    const cp = map.latLngToContainerPoint(refLL), w = project0(refLL.lng, refLL.lat);
    return { z, k, ox: w[0] * k - cp.x, oy: w[1] * k - cp.y };
  }
  function resizeCanvas() {
    const s = map.getSize(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(s.x * dpr); cv.height = Math.round(s.y * dpr);
    cv.style.width = s.x + 'px'; cv.style.height = s.y + 'px';
    draw();
  }
  function draw() {
    cv.style.transition = 'none'; cv.style.transform = '';
    const ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
    const s = map.getSize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s.x, s.y);
    const T = screenT(), r = symR(T.z);
    hits = [];
    for (const f of visible) {
      const x = f.wx * T.k - T.ox, y = f.wy * T.k - T.oy;
      if (x < -10 || y < -10 || x > s.x + 10 || y > s.y + 10) continue;
      drawSym(ctx, CLS[f.c] || CLS.outro, x, y, r, 0.75);
      hits.push([x, y, f]);
    }
  }
  map.on('move', draw);
  map.on('resize', resizeCanvas);
  map.on('zoomanim', (e) => {
    const z0 = map.getZoom(), s = Math.pow(2, e.zoom - z0);
    const T = screenT(), size = map.getSize();
    const w = project0(e.center.lng, e.center.lat), k1 = Math.pow(2, e.zoom);
    const o1x = w[0] * k1 - size.x / 2, o1y = w[1] * k1 - size.y / 2;
    const tx = s * T.ox - o1x, ty = s * T.oy - o1y;
    cv.style.transition = 'transform 0.25s cubic-bezier(0,0,0.25,1)';
    cv.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  });
  map.on('zoomend', draw);

  /* hover e clique */
  const tip = $('tip'), card = $('card');
  function nearest(p) {
    const r = symR(map.getZoom()) + 4;
    let best = null, bd = r * r;
    for (let i = hits.length - 1; i >= 0; i--) {
      const [x, y, f] = hits[i];
      const d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d < bd) { bd = d; best = { f, x, y }; }
    }
    return best;
  }
  const fmtData = (d) => (d ? d.split('-').reverse().join('/') : '');
  map.on('mousemove', (e) => {
    const h = nearest(e.containerPoint);
    mapEl.style.cursor = h ? 'pointer' : '';
    if (!h) { tip.hidden = true; return; }
    const p = h.f.p, c = CLS[h.f.c];
    tip.innerHTML = `<b>${esc(p.endereco || (p.sqls ? 'SQL ' + p.sqls.split(',')[0] : p.id))}</b><span>${esc(c.group)} · ${esc(clsText(c))} · ${fmtData(p.data)}</span>`;
    tip.hidden = false;
    const W = mapEl.clientWidth;
    const left = h.x + 14 + tip.offsetWidth > W ? h.x - 14 - tip.offsetWidth : h.x + 14;
    tip.style.left = left + 'px'; tip.style.top = Math.max(6, h.y - 18) + 'px';
  });
  map.on('mouseout', () => { tip.hidden = true; });
  map.on('click', (e) => {
    const h = nearest(e.containerPoint);
    if (!h) { card.hidden = true; return; }
    showCard(h.f);
  });
  function showCard(f) {
    const p = f.p, c = CLS[f.c];
    const sym = symSVG(c, 14);
    const pa = p.fonte === 'PA';
    const row = (k, v) => (v || v === 0 ? `<dt>${k}</dt><dd>${v}</dd>` : '');
    card.innerHTML = `<button class="x" aria-label="Fechar">×</button>
      <h3>${esc(p.endereco || 'Endereço não identificado')}</h3>
      <div class="cls"></div>
      <dl>
        ${row('Alvará', esc(p.descricao))}
        ${row('Nº do alvará', esc(p.alvara))}
        ${row('Ato', esc(ATO_LBL[p.ato] || ''))}
        ${row('Etapa', esc(ETAPA_LBL[p.etapa] || ''))}
        ${row(pa ? 'Aprovação' : 'Deferimento', fmtData(p.data))}
        ${row('Sistema', esc(FONTE_LBL[p.fonte || 'AD']))}
        ${row(pa ? 'Processo' : 'Processo AD', esc(p.processo))}
        ${row('Processo SEI', esc(p.sei))}
        ${row('SQL', esc((p.sqls || '').replace(/,/g, ', ')) || '—')}
        ${row('Categoria de uso', p.cats ? p.cats.map((k) => `<b>${esc(k === 'OUTRA' ? '—' : k)}</b> ${esc(CAT_LBL[k] || '')}`).join('<br>')
          + (p.categoria ? `<br><small class="raw">na planilha: ${esc(p.categoria)}</small>` : '') : '')}
        ${row('Uso', esc(USO_LBL[p.uso] || ''))}
        ${row('Área construída', p.area ? fmt(p.area) + ' m²' : '')}
        ${row('Blocos/pav./unid.', esc(p.bpu))}
        ${row('Distrito', esc(titleCase(p.distrito || '')) + (p.subprefeitura ? ' · Subpref. ' + esc(titleCase(p.subprefeitura)) : ''))}
        ${row('Uso no IPTU', esc(p.uso_iptu))}
        ${row('Localização', esc(PREC_LBL[p.precisao] || ''))}
        ${row('Código', esc(p.id))}
        <dt>Ver no mapa</dt><dd><a href="https://www.google.com/maps?q=${f.lat},${f.lon}" target="_blank" rel="noopener">Google Maps</a></dd>
      </dl>`;
    const cls = card.querySelector('.cls');
    cls.append(sym, document.createTextNode(`${c.group} · ${clsText(c)}`));
    card.querySelector('.x').onclick = () => { card.hidden = true; };
    card.hidden = false;
  }

  /* ============================================================ dados */
  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
    return r.json();
  }
  async function loadYear(ano) {
    if (S.data[ano]) return S.data[ano];
    const a = S.anos.find((x) => x.ano === ano);
    const geo = await getJSON('data/' + a.arquivo);
    const feats = geo.features.map((f) => {
      const [lon, lat] = f.geometry.coordinates, w = project0(lon, lat);
      return { lon, lat, wx: w[0], wy: w[1], c: CLS[f.properties.classe] ? f.properties.classe : 'outro', p: f.properties };
    });
    feats.sort((a1, b1) => DRAW_ORDER[a1.c] - DRAW_ORDER[b1.c]);
    S.data[ano] = feats;
    return feats;
  }

  const passEtapa = (f) => !f.p.etapa || S.etapas.has(f.p.etapa);
  const passAto = (f) => S.atos.has(f.p.ato || 'emissao');
  const passFonte = (f) => S.fontes.has(f.p.fonte || 'AD');
  const passDist = (f) => !S.distrito || f.p.distrito === S.distrito;
  const allCatsOn = () => S.cats.size === ALL_CATS.length;
  const catsPass = (codes) => allCatsOn() || codes.some((c) => S.cats.has(c));
  const passCat = (f) => catsPass(featCats(f.p));
  const isVisible = (f) => S.on.has(f.c) && passEtapa(f) && passAto(f) && passFonte(f) && passCat(f) && passDist(f);

  /* total do ano com os filtros atuais (sem o distrito), a partir do resumo do manifest */
  function yearCount(a) {
    if (!a.cubo) return Object.entries(a.classes || {}).reduce((s, [k, n]) => s + (S.on.has(k) ? n : 0), 0);
    let n = 0;
    for (const [key, v] of Object.entries(a.cubo)) {
      const [c, ato, etapa, fonte, cats] = key.split('|');
      if (S.on.has(c) && S.atos.has(ato) && (!etapa || S.etapas.has(etapa)) && S.fontes.has(fonte)
        && catsPass(cats ? cats.split('+') : ['SEM'])) n += v;
    }
    return n;
  }

  /* classes que aparecem em algum ano (mantém a legenda igual na série) */
  function presentClasses() {
    const set = new Set();
    for (const a of S.anos) for (const k of Object.keys(a.classes || {})) set.add(k);
    return CLASSES.filter((c) => set.has(c.key));
  }

  /* ============================================================ UI */
  /* anos: uma barra por ano (altura = alvarás no mapa com os filtros atuais); clique escolhe o ano */
  function buildYears() {
    const el = $('years'), ax = $('yearsAxis');
    el.innerHTML = ''; ax.innerHTML = '';
    el.style.gridTemplateColumns = ax.style.gridTemplateColumns = `repeat(${S.anos.length}, 1fr)`;
    S.anos.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'yb'; b.setAttribute('role', 'radio'); b.dataset.ano = a.ano;
      b.tabIndex = -1;
      b.innerHTML = '<i></i>';
      b.onclick = () => setYear(a.ano);
      el.appendChild(b);
      const first = i === 0, last = i === S.anos.length - 1;
      const longe = i >= 3 && i <= S.anos.length - 4; // não encosta no primeiro/último rótulo
      if (first || last || (a.ano % 5 === 0 && longe)) {
        const s = document.createElement('span');
        s.textContent = a.ano; s.style.gridColumn = String(i + 1);
        if (first) s.className = 'first'; else if (last) s.className = 'last';
        ax.appendChild(s);
      }
    });
    el.onkeydown = (e) => {
      const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
      if (!d) return;
      e.preventDefault(); stepYear(d);
      el.querySelector('[aria-checked="true"]')?.focus();
    };
    $('yPrev').onclick = () => stepYear(-1);
    $('yNext').onclick = () => stepYear(1);
  }
  function stepYear(d) {
    const i = S.anos.findIndex((a) => a.ano === S.ano), j = i + d;
    if (j >= 0 && j < S.anos.length) setYear(S.anos[j].ano);
  }
  function updateYearBars() {
    const counts = S.anos.map(yearCount), max = Math.max(1, ...counts);
    document.querySelectorAll('#years .yb').forEach((b, i) => {
      const a = S.anos[i];
      b.querySelector('i').style.height = counts[i] ? Math.max(4, (100 * counts[i]) / max) + '%' : '0';
      b.title = `${periodo(a)}: ${fmt(counts[i])} alvarás no mapa com os filtros atuais (município inteiro)`;
      b.setAttribute('aria-label', b.title);
    });
  }
  function buildLegend() {
    const el = $('legend'); el.innerHTML = '';
    const pres = presentClasses();
    const groups = [...new Set(pres.map((c) => c.group))];
    for (const g of groups) {
      const items = pres.filter((c) => c.group === g);
      const box = document.createElement('div'); box.className = 'grp';
      const head = document.createElement('label'); head.className = 'grp-h';
      const gcb = document.createElement('input'); gcb.type = 'checkbox'; gcb.dataset.group = g;
      gcb.onchange = () => { items.forEach((c) => (gcb.checked ? S.on.add(c.key) : S.on.delete(c.key))); refresh(); };
      head.append(gcb, document.createTextNode(g));
      box.appendChild(head);
      for (const c of items) {
        const row = document.createElement('label'); row.className = 'row'; row.dataset.k = c.key;
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.k = c.key;
        cb.onchange = () => { cb.checked ? S.on.add(c.key) : S.on.delete(c.key); refresh(); };
        const lbl = document.createElement('span');
        if (c.code) { const b = document.createElement('b'); b.textContent = c.code + ' '; lbl.append(b); }
        lbl.append(c.label);
        const n = document.createElement('span'); n.className = 'n';
        row.append(cb, symSVG(c, 16), lbl, n);
        box.appendChild(row);
      }
      el.appendChild(box);
    }
    document.querySelectorAll('[data-preset]').forEach((b) => {
      b.onclick = () => {
        const p = b.dataset.preset;
        const OBRAS = ['Edificação nova', 'Projeto modificativo', 'Reforma', 'Demolição'];
        S.on = new Set(CLASSES.filter((c) =>
          p === 'all' ? true : p === 'nova' ? c.group === 'Edificação nova' : p === 'obras' ? OBRAS.includes(c.group)
            : p === 'his' ? c.social === 'his' : c.social === 'mercado'
        ).map((c) => c.key));
        refresh();
      };
    });
  }
  function buildChips(id, list, set) {
    const el = $(id); el.innerHTML = '';
    for (const [k, lbl] of list) {
      const l = document.createElement('label');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = set.has(k); cb.dataset.k = k;
      cb.onchange = () => { cb.checked ? set.add(k) : set.delete(k); refresh(); };
      const n = document.createElement('span'); n.className = 'n';
      l.append(cb, document.createTextNode(lbl), n);
      el.appendChild(l);
    }
  }
  function buildEtapas() {
    buildChips('etapas', ETAPAS, S.etapas);
    buildChips('atos', ATOS, S.atos);
    buildChips('fontes', FONTES, S.fontes);
  }

  /* categorias de uso: grupos recolhíveis, cada linha com código, descrição e contagem */
  function buildCats() {
    const el = $('cats'); el.innerHTML = '';
    for (const g of CAT_GROUPS) {
      const det = document.createElement('details'); det.className = 'cgrp'; det.dataset.g = g.key;
      const sum = document.createElement('summary');
      const gcb = document.createElement('input'); gcb.type = 'checkbox'; gcb.dataset.g = g.key;
      gcb.setAttribute('aria-label', 'Todas: ' + g.nome);
      gcb.onchange = () => { g.itens.forEach(([k]) => (gcb.checked ? S.cats.add(k) : S.cats.delete(k))); refresh(); };
      const nm = document.createElement('span'); nm.className = 'gn'; nm.textContent = g.nome;
      const n = document.createElement('span'); n.className = 'n';
      sum.append(gcb, nm, n);
      det.appendChild(sum);
      for (const [k, desc] of g.itens) {
        const row = document.createElement('label'); row.className = 'crow'; row.dataset.k = k;
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.k = k;
        cb.onchange = () => { cb.checked ? S.cats.add(k) : S.cats.delete(k); refresh(); };
        const code = document.createElement('b'); code.textContent = k === 'SEM' || k === 'OUTRA' ? '—' : k;
        const d = document.createElement('span'); d.textContent = desc;
        const cn = document.createElement('span'); cn.className = 'n';
        row.append(cb, code, d, cn);
        det.appendChild(row);
      }
      el.appendChild(det);
    }
    const RES = ['R1', 'R2h', 'R2v', 'R2', 'R3', 'R'];
    const NRES = CAT_GROUPS.filter((g) => g.key === 'nr' || g.key === 'antiga').flatMap((g) => g.itens.map((i) => i[0]));
    const HISC = CAT_GROUPS.find((g) => g.key === 'his').itens.map((i) => i[0]);
    document.querySelectorAll('[data-cpreset]').forEach((b) => {
      b.onclick = () => {
        const p = b.dataset.cpreset;
        S.cats = new Set(p === 'all' ? ALL_CATS : p === 'res' ? RES : p === 'nres' ? NRES : HISC);
        refresh();
      };
    });
  }
  /* texto curto do filtro de categoria (PNG) */
  function catsResumo() {
    if (allCatsOn()) return '';
    const on = ALL_CATS.filter((k) => S.cats.has(k));
    if (!on.length) return 'nenhuma';
    const grupos = CAT_GROUPS.filter((g) => g.itens.every(([k]) => S.cats.has(k)));
    const soltos = on.filter((k) => !grupos.some((g) => g.itens.some(([k2]) => k2 === k)));
    return [...grupos.map((g) => g.nome.toLowerCase()), ...soltos.map((k) => (k === 'SEM' ? 'sem categoria' : k === 'OUTRA' ? 'outra' : k))].join(', ');
  }
  function buildDistritos() {
    const sel = $('distrito');
    const names = S.distritos.features.map((f) => f.properties.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    for (const n of names) {
      const o = document.createElement('option'); o.value = n; o.textContent = titleCase(n); sel.appendChild(o);
    }
    sel.onchange = () => setDistrito(sel.value, true);
  }

  function drawBoundaries() {
    distritosLayer.clearLayers();
    if (S.showDistritos) {
      L.geoJSON(S.distritos, { interactive: false, style: { color: '#8a8984', weight: 0.8, fill: false, opacity: 0.9 } }).addTo(distritosLayer);
    }
    L.geoJSON(S.municipio, { interactive: false, style: { color: '#3d3c39', weight: 1.6, fill: false } }).addTo(distritosLayer);
    maskLayer.clearLayers();
    if (S.distrito) {
      const f = S.distritoIndex[S.distrito];
      const outer = [[-26, -49], [-26, -44], [-21, -44], [-21, -49]];
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const holes = polys.map((p) => p[0].map(([x, y]) => [y, x]));
      L.polygon([outer, ...holes], { interactive: false, stroke: false, fillColor: '#ffffff', fillOpacity: 0.6 }).addTo(maskLayer);
      L.geoJSON(f, { interactive: false, style: { color: '#0b0b0b', weight: 2.2, fill: false } }).addTo(maskLayer);
    }
  }

  const FONTE_CURTO = { PA: 'SEHAB/SMUL', AD: 'Aprova Digital' };
  const fontesDe = (a) => a.fontes || [{ fonte: 'AD', total: a.total, data_inicial: a.data_inicial, data_final: a.data_final }];
  /* fonte que existe em anos vizinhos mas falta neste ano */
  function fontesAusentes(a) {
    const out = [];
    for (const [k] of FONTES) {
      const yrs = S.anos.filter((x) => fontesDe(x).some((f) => f.fonte === k)).map((x) => x.ano);
      if (yrs.length && a.ano > Math.min(...yrs) && a.ano < Math.max(...yrs) && !fontesDe(a).some((f) => f.fonte === k)) out.push(k);
    }
    return out;
  }
  function yearNote(a) {
    const parts = fontesDe(a).map((f) => `${FONTE_CURTO[f.fonte]}: ${fmt(f.total)} registros, de ${fmtData(f.data_inicial)} a ${fmtData(f.data_final)}`);
    const miss = fontesAusentes(a);
    return esc(parts.join(' · ')) + (miss.length ? `<br><b>Sem planilha ${miss.map((k) => (k === 'AD' ? 'do Aprova Digital' : 'SEHAB/SMUL')).join(' nem ')} neste ano.</b>` : '');
  }
  function setYear(ano) {
    S.ano = ano;
    document.querySelectorAll('#years button').forEach((b) => {
      const on = +b.dataset.ano === ano;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    });
    const a = S.anos.find((x) => x.ano === ano);
    const i = S.anos.indexOf(a), per = periodo(a);
    $('yCur').textContent = ano;
    $('yRot').textContent = per === String(ano) ? 'ano todo' : per.replace(String(ano), '').trim();
    $('yPrev').disabled = i === 0; $('yNext').disabled = i === S.anos.length - 1;
    $('periodo').innerHTML = yearNote(a);
    card.hidden = true;
    $('loading').hidden = false;
    loadYear(ano).then(() => { $('loading').hidden = true; refresh(); });
  }
  function setDistrito(nome, zoom) {
    S.distrito = nome;
    $('distrito').value = nome;
    drawBoundaries();
    if (zoom) {
      const f = nome ? S.distritoIndex[nome] : S.municipio;
      map.fitBounds(L.geoJSON(f).getBounds(), { padding: [24, 24] });
    }
    refresh();
  }

  function refresh() {
    const feats = S.data[S.ano] || [];
    visible = feats.filter(isVisible);
    draw();

    // contagens: cada filtro conta respeitando os outros filtros (não ele mesmo)
    const byClass = {}, byEtapa = {}, byAto = {}, byFonte = {}, byCat = {};
    const inc = (o, k) => (o[k] = (o[k] || 0) + 1);
    for (const f of feats) {
      if (!passDist(f)) continue;
      const e = passEtapa(f), at = passAto(f), fo = passFonte(f), ca = passCat(f), on = S.on.has(f.c);
      if (e && at && fo && ca) inc(byClass, f.c);
      if (on && at && fo && ca && f.p.etapa) inc(byEtapa, f.p.etapa);
      if (on && e && fo && ca) inc(byAto, f.p.ato || 'emissao');
      if (on && e && at && ca) inc(byFonte, f.p.fonte || 'AD');
      if (on && e && at && fo) for (const k of featCats(f.p)) inc(byCat, k);
    }
    document.querySelectorAll('#cats .crow').forEach((row) => {
      const k = row.dataset.k, n = byCat[k] || 0;
      row.querySelector('.n').textContent = fmt(n);
      row.querySelector('input').checked = S.cats.has(k);
      row.classList.toggle('zero', n === 0);
    });
    document.querySelectorAll('#cats .cgrp').forEach((det) => {
      const g = CAT_GROUPS.find((x) => x.key === det.dataset.g);
      const on = g.itens.filter(([k]) => S.cats.has(k)).length;
      const cb = det.querySelector('summary input');
      cb.checked = on === g.itens.length; cb.indeterminate = on > 0 && on < g.itens.length;
      det.querySelector('summary .n').textContent = fmt(g.itens.reduce((s, [k]) => s + (byCat[k] || 0), 0));
    });
    $('catsTotal').textContent = allCatsOn() ? 'todas' : `${S.cats.size} de ${ALL_CATS.length}`;
    document.querySelectorAll('#legend .row').forEach((row) => {
      const k = row.dataset.k, n = byClass[k] || 0;
      row.querySelector('.n').textContent = fmt(n);
      row.querySelector('input').checked = S.on.has(k);
      row.classList.toggle('zero', n === 0);
    });
    document.querySelectorAll('#legend [data-group]').forEach((g) => {
      const keys = CLASSES.filter((c) => c.group === g.dataset.group).map((c) => c.key).filter((k) => document.querySelector(`#legend .row[data-k="${k}"]`));
      const on = keys.filter((k) => S.on.has(k)).length;
      g.checked = on === keys.length; g.indeterminate = on > 0 && on < keys.length;
    });
    for (const [id, cnt] of [['etapas', byEtapa], ['atos', byAto], ['fontes', byFonte]]) {
      document.querySelectorAll(`#${id} input`).forEach((cb) => {
        const n = cnt[cb.dataset.k] || 0;
        cb.parentElement.querySelector('.n').textContent = fmt(n);
        cb.parentElement.classList.toggle('zero', n === 0);
      });
    }
    $('total').textContent = `${fmt(visible.length)} no mapa`;
    updateYearBars();

    // ranking por distrito (ignora o filtro de distrito)
    const byD = {};
    for (const f of feats) if (S.on.has(f.c) && passEtapa(f) && passAto(f) && passFonte(f) && passCat(f) && f.p.distrito) byD[f.p.distrito] = (byD[f.p.distrito] || 0) + 1;
    const top = Object.entries(byD).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const max = top.length ? top[0][1] : 1;
    const rank = $('rank'); rank.innerHTML = '';
    for (const [d, n] of top) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="nm">${esc(titleCase(d))}</span><span class="n">${fmt(n)}</span><span class="bar"><i style="width:${(100 * n) / max}%"></i></span>`;
      li.onclick = () => setDistrito(d, true);
      rank.appendChild(li);
    }
    buildMetodo();
    writeHash();
  }

  function buildMetodo() {
    const a = S.anos.find((x) => x.ano === S.ano);
    if (!a) return;
    const pct = (n) => (a.mapeados ? Math.round((100 * (n || 0)) / a.mapeados) : 0);
    const rows = CLASSES.filter((c) => a.classes_total[c.key]).map((c) =>
      `<tr><td>${esc(c.group)} · ${esc(clsText(c))}</td><td class="r">${fmt(a.classes_total[c.key])}</td><td class="r">${fmt(a.classes[c.key] || 0)}</td></tr>`).join('');
    const fontes = fontesDe(a).map((f) => `${f.fonte === 'PA' ? 'relatório anual de processos aprovados da SEHAB/SMUL' : 'relatório anual de alvarás do Aprova Digital (SMUL)'} — ${fmt(f.total)} registros, ${fmtData(f.data_inicial)} a ${fmtData(f.data_final)}`);
    const miss = fontesAusentes(a);
    const semLoc = a.sem_localizacao ?? (a.sem_sql || 0) + (a.sql_nao_encontrado || 0);
    const porEnd = (a.por_endereco || 0) + (a.por_rua || 0);
    $('metodo').innerHTML = `
      <p><b>Fontes (${esc(periodo(a))}).</b> ${esc(fontes.join('; '))}.${miss.length ? ` <b>Não há planilha ${miss.map((k) => (k === 'AD' ? 'do Aprova Digital' : 'SEHAB/SMUL')).join(' nem ')} para este ano</b>, o que reduz o total.` : ''}</p>
      <p>Cada símbolo é um alvará (documento), não um empreendimento: o mesmo prédio pode ter alvará de aprovação, depois de execução, apostilamentos e reconsiderações. Use os filtros de etapa e ato para não contar duas vezes.</p>
      <p><b>Classificação.</b> Pela descrição do alvará: a forma indica o tipo; nas obras (edificação nova, modificativo, reforma) a cor indica HIS/HMP ou a categoria de uso — R1, R2h, R2v, R2/R3, uso misto (R + NR), não residencial (NR) ou uso não informado (Aprova Digital). Nos processos SEHAB/SMUL, HIS/HMP vem também da categoria de uso (HIS, HMP, EHIS, EHMP, EZEIS) ou do tipo de construção “habitação de interesse social”. No Aprova Digital, “exceto HIS/HMP” não separa residencial de comercial.</p>
      <p><b>Localização.</b> Pelo SQL no GeoSampa: lote fiscal (${pct(a.por_lote)}%) ou, quando o lote não existe mais, centro da quadra fiscal (${pct(a.por_quadra)}%).${porEnd ? ` Sem SQL utilizável (planilhas de 2000–2001, área rural com código INCRA, SQL inválido), pelo endereço: mesmo número no cadastro de lotes (${pct(a.por_endereco)}%) ou número mais próximo na mesma rua (${pct(a.por_rua)}%).` : ''} Distrito por ponto-em-polígono.</p>
      <table><thead><tr><th>Tipo</th><th class="r">Planilha</th><th class="r">No mapa</th></tr></thead><tbody>${rows}</tbody></table>
      <p>${fmt(semLoc)} registros não foram localizados e ficam fora do mapa.</p>`;
  }

  function writeHash() {
    const h = new URLSearchParams();
    h.set('ano', S.ano);
    if (S.distrito) h.set('distrito', S.distrito);
    history.replaceState(null, '', '#' + h.toString());
  }

  /* ============================================================ exportação */
  const geoCache = new WeakMap();
  function worldRings(geo) {
    if (geoCache.has(geo)) return geoCache.get(geo);
    const rings = [];
    const add = (g) => {
      if (!g) return;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const p of polys) for (const ring of p) rings.push(ring.map(([x, y]) => project0(x, y)));
    };
    if (geo.type === 'FeatureCollection') geo.features.forEach((f) => add(f.geometry));
    else if (geo.type === 'Feature') add(geo.geometry);
    else if (geo.type === 'GeometryCollection') geo.geometries.forEach(add);
    else add(geo);
    geoCache.set(geo, rings);
    return rings;
  }
  function tracePath(ctx, rings, X, Y) {
    for (const r of rings) {
      r.forEach(([wx, wy], i) => (i ? ctx.lineTo(X(wx), Y(wy)) : ctx.moveTo(X(wx), Y(wy))));
      ctx.closePath();
    }
  }
  function loadImg(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const t = setTimeout(() => rej(new Error('timeout')), 20000);
      img.onload = () => { clearTimeout(t); res(img); };
      img.onerror = () => { clearTimeout(t); rej(new Error('tile')); };
      img.src = url;
    });
  }
  async function drawTiles(ctx, style, zf, ox, oy, F) {
    const tz = Math.max(0, Math.min(16, Math.round(zf))); // blocos de 256 px
    const k = Math.pow(2, zf);
    let fail = 0;
    for (const layer of BASEMAPS[style] || []) {
      // nomes: um nível de zoom abaixo, para ficarem legíveis na impressão
      const lz = /Reference/.test(layer) ? Math.max(0, tz - 1) : tz;
      const ltw = 256 / Math.pow(2, lz), ltp = ltw * k;
      const lx0 = Math.floor((F.x + ox) / k / ltw), lx1 = Math.floor((F.x + F.w + ox) / k / ltw);
      const ly0 = Math.floor((F.y + oy) / k / ltw), ly1 = Math.floor((F.y + F.h + oy) / k / ltw);
      // carrega tudo e só depois desenha, para manter a ordem das camadas
      const jobs = [];
      for (let tx = lx0; tx <= lx1; tx++) for (let ty = ly0; ty <= ly1; ty++) {
        const url = esriUrl(layer).replace('{z}', lz).replace('{y}', ty).replace('{x}', tx);
        jobs.push(loadImg(url).then((img) => [img, tx, ty]).catch(() => { fail++; return null; }));
      }
      for (const j of await Promise.all(jobs)) {
        if (j) ctx.drawImage(j[0], j[1] * ltp - ox, j[2] * ltp - oy, ltp + 0.6, ltp + 0.6);
      }
    }
    return fail;
  }
  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function niceLen(m) {
    const p = Math.pow(10, Math.floor(Math.log10(m))), n = m / p;
    return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p;
  }
  const kmLbl = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR')} km` : `${m} m`);

  async function renderPNG(ano, pageKey) {
    const feats = await loadYear(ano);
    const a = S.anos.find((x) => x.ano === ano);
    try { await Promise.all([document.fonts.load(`400 40px ${FONT}`), document.fonts.load(`700 40px ${FONT}`)]); } catch (e) { /* segue com a fonte disponível */ }
    const { w: W, h: H } = PAGES[pageKey];
    const u = Math.min(W, H) / 100;
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';

    // painel lateral / inferior (pu = unidade do painel; encolhe se não couber)
    function drawPanel(ctx, P, pu, anchor) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const per = periodo(a);
      const titulo = ($('titulo').value || 'Alvarás emitidos — {periodo}').replace(/\{periodo\}/g, per);
      const recorte = S.distrito ? `Distrito ${titleCase(S.distrito)}` : 'Município de São Paulo';
      let y = P.y + 1.9 * pu;
      ctx.fillStyle = '#0b0b0b'; ctx.font = `700 ${2.3 * pu}px ${FONT}`;
      for (const l of wrap(ctx, titulo, P.w)) { ctx.fillText(l, P.x, y); y += 2.8 * pu; }
      y += 0.2 * pu;
      ctx.fillStyle = '#52514e'; ctx.font = `400 ${1.45 * pu}px ${FONT}`;
      ctx.fillText(recorte, P.x, y); y += 1.9 * pu;
      for (const [nome, list, set] of [['Etapa', ETAPAS, S.etapas], ['Ato', ATOS, S.atos], ['Sistema', FONTES, S.fontes]]) {
        const on = list.filter(([k2]) => set.has(k2)).map((e) => (nome === 'Sistema' ? FONTE_CURTO[e[0]] : e[1].toLowerCase()));
        if (on.length === list.length) continue;
        for (const l of wrap(ctx, `${nome}: ${on.join(', ') || 'nenhum'}`, P.w)) { ctx.fillText(l, P.x, y); y += 1.8 * pu; }
      }
      const cr = catsResumo();
      if (cr) for (const l of wrap(ctx, `Categoria de uso: ${cr}`, P.w)) { ctx.fillText(l, P.x, y); y += 1.8 * pu; }
      y += 1.6 * pu;

      // legenda (só classes ligadas; mesma lista em todos os anos da série)
      const counts = {};
      for (const f of vis) counts[f.c] = (counts[f.c] || 0) + 1;
      const pres = presentClasses().filter((cl) => S.on.has(cl.key));
      const fReg = `400 ${1.4 * pu}px ${FONT}`, fBold = `700 ${1.4 * pu}px ${FONT}`;
      const lineH = 1.7 * pu;
      // "código — descrição" com o código em negrito; quebra linha se não couber; devolve o nº de linhas
      const drawLabel = (cl, x, yy, maxW) => {
        ctx.font = fReg;
        const lines = wrap(ctx, clsText(cl), maxW);
        lines.forEach((l, li) => {
          const ly = yy + li * lineH;
          let xx = x;
          ctx.fillStyle = '#0b0b0b'; ctx.textAlign = 'left';
          if (li === 0 && cl.code && l.startsWith(cl.code)) {
            ctx.font = fBold; ctx.fillText(cl.code, xx, ly); xx += ctx.measureText(cl.code + ' ').width;
            ctx.font = fReg; ctx.fillText(l.slice(cl.code.length).trim(), xx, ly);
          } else { ctx.font = fReg; ctx.fillText(l, xx, ly); }
        });
        return lines.length;
      };
      ctx.fillStyle = '#52514e'; ctx.font = `700 ${1.15 * pu}px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText('TIPO DE ALVARÁ', P.x, y);
      y += 1.2 * pu;

      // 1) obras: tabela com uma linha por categoria e uma coluna por tipo (forma)
      const obraCls = pres.filter((cl) => cl.tipo in OBRA_BASE);
      if (obraCls.length) {
        const tipos = OBRAS.filter(([t]) => obraCls.some((cl) => cl.tipo === t));
        const subs = USO_SUB.filter((u) => obraCls.some((cl) => cl.sub === u.sub));
        const cellW = 6.6 * pu, gap = 0.8 * pu;
        const labW = P.w - tipos.length * cellW - gap;
        const cellX = (i) => P.x + labW + gap + i * cellW;
        const fHead = `700 ${0.98 * pu}px ${FONT}`;
        ctx.font = fHead;
        const headLines = tipos.map(([, nome]) => wrap(ctx, nome.toUpperCase(), cellW - 0.3 * pu));
        const nHead = Math.max(...headLines.map((l) => l.length));
        y += 1.0 * pu;
        tipos.forEach(([, , shape], i) => {
          drawSym(ctx, { shape, color: 'demol' }, cellX(i) + 0.7 * pu, y, 0.6 * pu, 0.05 * pu);
          ctx.font = fHead; ctx.fillStyle = '#52514e'; ctx.textAlign = 'left';
          headLines[i].forEach((l, li) => ctx.fillText(l, cellX(i), y + 2.0 * pu + li * 1.2 * pu));
        });
        y += 2.0 * pu + (nHead - 1) * 1.2 * pu + 0.7 * pu;
        ctx.strokeStyle = '#c9c8c2'; ctx.lineWidth = 0.05 * pu;
        ctx.beginPath(); ctx.moveTo(P.x, y); ctx.lineTo(P.x + P.w, y); ctx.stroke();
        for (const u of subs) {
          y += 2.1 * pu;
          const n = drawLabel(u, P.x, y, labW - 0.4 * pu);
          tipos.forEach(([t], i) => {
            const cl = CLS[`${t}_${u.sub}`];
            if (!cl || !pres.includes(cl)) return;
            drawSym(ctx, cl, cellX(i) + 0.7 * pu, y - 0.5 * pu, 0.62 * pu, 0.06 * pu);
            const nn = counts[cl.key] || 0;
            ctx.font = fReg; ctx.textAlign = 'left'; ctx.fillStyle = nn ? '#0b0b0b' : '#8a8984';
            ctx.fillText(fmt(nn), cellX(i) + 1.75 * pu, y);
          });
          y += (n - 1) * lineH + 0.35 * pu;
        }
        y += 1.4 * pu;
      }

      // 2) demais tipos: grupos com símbolo, descrição e contagem
      const blocks = [];
      const rest = pres.filter((cl) => !(cl.tipo in OBRA_BASE));
      for (const g of [...new Set(rest.map((cl) => cl.group))]) blocks.push({ g, items: rest.filter((cl) => cl.group === g) });
      const colW = P.cols === 2 ? (P.w - 3 * pu) / 2 : P.w;
      const rowH = 2.3 * pu, grpH = 2.4 * pu, grpGap = 0.9 * pu;
      ctx.font = fReg;
      const avail = colW - 2.6 * pu - ctx.measureText('00.000').width - 1.0 * pu;
      const linesOf = (cl) => { ctx.font = fReg; return wrap(ctx, clsText(cl), avail).length; };
      const blockH = (b) => grpH + b.items.reduce((s2, cl) => s2 + rowH + (linesOf(cl) - 1) * lineH, 0) + grpGap;
      let split = blocks.length;
      if (P.cols === 2 && blocks.length > 1) {
        const total = blocks.reduce((s2, b) => s2 + blockH(b), 0);
        let acc = 0; split = 0;
        while (split < blocks.length && acc + blockH(blocks[split]) / 2 < total / 2) { acc += blockH(blocks[split]); split++; }
        split = Math.max(1, split);
      }
      const yStart = y;
      let colX = P.x, yMax = y;
      blocks.forEach((b, i) => {
        if (P.cols === 2 && i === split) { colX = P.x + colW + 3 * pu; yMax = Math.max(yMax, y); y = yStart; }
        y += grpH * 0.85;
        ctx.fillStyle = '#0b0b0b'; ctx.font = `700 ${1.5 * pu}px ${FONT}`; ctx.textAlign = 'left';
        ctx.fillText(b.g, colX, y);
        y += 0.3 * pu;
        for (const cl of b.items) {
          y += rowH;
          drawSym(ctx, cl, colX + 0.85 * pu, y - 0.5 * pu, 0.66 * pu, 0.06 * pu);
          const n = drawLabel(cl, colX + 2.6 * pu, y, avail);
          ctx.font = fReg; ctx.textAlign = 'right'; ctx.fillStyle = '#52514e';
          ctx.fillText(fmt(counts[cl.key] || 0), colX + colW, y);
          y += (n - 1) * lineH;
        }
        y += grpGap;
      });
      y = Math.max(y, yMax) + 0.6 * pu;
      ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 0.08 * pu;
      ctx.beginPath(); ctx.moveTo(P.x, y); ctx.lineTo(P.x + P.w, y); ctx.stroke();
      y += 2.0 * pu;
      ctx.fillStyle = '#0b0b0b'; ctx.font = `700 ${1.6 * pu}px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText('Total no mapa', P.x, y);
      ctx.textAlign = 'right'; ctx.fillText(fmt(vis.length), P.x + P.w, y);
      ctx.textAlign = 'left';
      y += 2.2 * pu;
      ctx.fillStyle = '#52514e'; ctx.font = `400 ${1.1 * pu}px ${FONT}`;
      for (const l of wrap(ctx, 'Forma = tipo de alvará · cor = HIS/HMP ou categoria de uso (a mesma nos três tipos de obra). Cada símbolo é um alvará (o mesmo prédio pode ter alvará de aprovação, de execução, apostilamentos e reconsiderações).', P.w)) { ctx.fillText(l, P.x, y); y += 1.55 * pu; }

      // fonte (ancorada embaixo)
      const nPrec = {};
      for (const f of vis) nPrec[f.p.precisao] = (nPrec[f.p.precisao] || 0) + 1;
      const pp = (k) => (vis.length ? Math.round((100 * (nPrec[k] || 0)) / vis.length) : 0);
      const cred = $('creditos').value.trim();
      const fontesTxt = fontesDe(a).filter((f) => S.fontes.has(f.fonte)).map((f) => (f.fonte === 'PA'
        ? `SEHAB/SMUL, relatório anual de processos aprovados (${fmtData(f.data_inicial)} a ${fmtData(f.data_final)})`
        : `SMUL, Aprova Digital — relatório de alvarás emitidos (${fmtData(f.data_inicial)} a ${fmtData(f.data_final)})`));
      const miss = fontesAusentes(a);
      const semLoc = a.sem_localizacao ?? (a.sem_sql || 0) + (a.sql_nao_encontrado || 0);
      const locTxt = [];
      if (nPrec.lote) locTxt.push(`lote fiscal pelo SQL (${pp('lote')}%)`);
      if (nPrec.quadra) locTxt.push(`centro da quadra fiscal (${pp('quadra')}%)`);
      if (nPrec.endereco || nPrec.rua) locTxt.push(`endereço da planilha (${pp('endereco') + pp('rua')}%)`);
      const fonte = [
        `Fonte: Prefeitura de São Paulo — ${fontesTxt.join('; ') || '—'}.${miss.length ? ` Não há planilha ${miss.map((k) => (k === 'AD' ? 'do Aprova Digital' : 'SEHAB/SMUL')).join(' nem ')} para ${a.ano}.` : ''}`,
        `Localização no GeoSampa: ${locTxt.join(', ')}. ${fmt(semLoc)} registros sem localização não aparecem.`,
        S.basemap !== 'none' ? 'Limites: GeoSampa. Mapa de fundo: Esri World Light Gray Canvas (© Esri, © OpenStreetMap).' : 'Limites: GeoSampa.',
        cred,
      ].filter(Boolean);
      ctx.font = `400 ${1.0 * pu}px ${FONT}`; ctx.fillStyle = '#52514e';
      const lines = fonte.flatMap((t) => wrap(ctx, t, P.w));
      let fy = anchor ? P.y + P.h - (lines.length - 1) * 1.45 * pu : y + 1.5 * pu;
      if (fy < y + 1.5 * pu) fy = y + 1.5 * pu;
      for (const l of lines) { ctx.fillText(l, P.x, fy); fy += 1.45 * pu; }

      return fy - 1.0 * pu - P.y;
    }

    const vis = feats.filter(isVisible);
    const M = 4 * u;
    const measure = (w, cols, pu) => drawPanel(document.createElement('canvas').getContext('2d'), { x: 0, y: 0, w, h: 1e5, cols }, pu, false);
    let F, P;
    if (W >= H) {
      const pw = Math.round(W * 0.27);
      F = { x: M, y: M, w: W - 3 * M - pw, h: H - 2 * M };
      P = { x: F.x + F.w + M, y: M, w: pw, h: H - 2 * M, cols: 1, pu: u };
      const need = measure(P.w, 1, u);
      if (need > P.h) P.pu = u * (P.h / need) * 0.98;
    } else {
      // retrato: o painel embaixo ocupa o que precisar (até 45% da página); o mapa fica com o resto
      const pw = W - 2 * M, maxP = H - 3 * M - Math.round(H * 0.55);
      let pu = u, need = measure(pw, 2, u);
      if (need > maxP) { pu = u * (maxP / need) * 0.98; need = measure(pw, 2, pu); }
      F = { x: M, y: M, w: W - 2 * M, h: H - 3 * M - need };
      P = { x: M, y: F.y + F.h + M, w: pw, h: need, cols: 2, pu };
    }

    // enquadramento: o recorte inteiro (município/distrito) ou o mesmo da tela
    map.invalidateSize({ pan: false });
    let zf, cw;
    const size = map.getSize();
    if ($('enquadramento').value === 'screen' && size.x > 0 && size.y > 0) {
      const c0 = map.getCenter();
      zf = map.getZoom() + Math.log2(Math.min(F.w / size.x, F.h / size.y));
      cw = project0(c0.lng, c0.lat);
    } else {
      const rings = worldRings(S.distrito ? S.distritoIndex[S.distrito] : S.municipio);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const r0 of rings) for (const [wx, wy] of r0) { x0 = Math.min(x0, wx); y0 = Math.min(y0, wy); x1 = Math.max(x1, wx); y1 = Math.max(y1, wy); }
      zf = Math.log2(Math.min((F.w * 0.92) / (x1 - x0), (F.h * 0.92) / (y1 - y0)));
      cw = [(x0 + x1) / 2, (y0 + y1) / 2];
    }
    const k = Math.pow(2, zf);
    const ox = cw[0] * k - (F.x + F.w / 2), oy = cw[1] * k - (F.y + F.h / 2);
    const X = (wx) => wx * k - ox, Y = (wy) => wy * k - oy;
    const c = { lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * cw[1]) / 256))) * 180) / Math.PI };

    ctx.save();
    ctx.beginPath(); ctx.rect(F.x, F.y, F.w, F.h); ctx.clip();
    ctx.fillStyle = S.basemap === 'none' ? '#ffffff' : '#f6f5f2'; ctx.fillRect(F.x, F.y, F.w, F.h);
    let tileFail = 0;
    if (S.basemap !== 'none') tileFail = await drawTiles(ctx, S.basemap, zf, ox, oy, F);
    ctx.lineJoin = 'round';
    if (S.showDistritos) {
      ctx.beginPath(); tracePath(ctx, worldRings(S.distritos), X, Y);
      ctx.strokeStyle = '#8a8984'; ctx.lineWidth = 0.11 * u; ctx.stroke();
    }
    ctx.beginPath(); tracePath(ctx, worldRings(S.municipio), X, Y);
    ctx.strokeStyle = '#3d3c39'; ctx.lineWidth = 0.22 * u; ctx.stroke();
    let dfeat = null;
    if (S.distrito) {
      dfeat = S.distritoIndex[S.distrito];
      ctx.beginPath(); ctx.rect(F.x, F.y, F.w, F.h); tracePath(ctx, worldRings(dfeat), X, Y);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill('evenodd');
      ctx.beginPath(); tracePath(ctx, worldRings(dfeat), X, Y);
      ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 0.3 * u; ctx.stroke();
    }
    // símbolo cresce devagar com o zoom: ~0,36u no município inteiro em A4
    const r = Math.max(0.26 * u, Math.min(0.75 * u, 0.36 * u * Math.pow(2, (zf - 11.5) * 0.35)));
    for (const f of vis) {
      const x = X(f.wx), y = Y(f.wy);
      if (x < F.x - r * 2 || y < F.y - r * 2 || x > F.x + F.w + r * 2 || y > F.y + F.h + r * 2) continue;
      drawSym(ctx, CLS[f.c], x, y, r, Math.max(1, r * 0.2));
    }
    ctx.restore();
    ctx.strokeStyle = '#3d3c39'; ctx.lineWidth = 0.08 * u; ctx.strokeRect(F.x, F.y, F.w, F.h);

    // norte
    const nx = F.x + F.w - 3.2 * u, ny = F.y + 2.6 * u, nh = 3.4 * u;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(nx, ny + nh * 0.55, nh * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(nx, ny + nh * 0.2); ctx.lineTo(nx + nh * 0.22, ny + nh * 0.95); ctx.lineTo(nx, ny + nh * 0.8); ctx.closePath();
    ctx.fillStyle = '#0b0b0b'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(nx, ny + nh * 0.2); ctx.lineTo(nx - nh * 0.22, ny + nh * 0.95); ctx.lineTo(nx, ny + nh * 0.8); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 0.08 * u; ctx.stroke();
    ctx.fillStyle = '#0b0b0b'; ctx.font = `700 ${1.3 * u}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('N', nx, ny + nh * 0.12);

    // escala
    const lat = c.lat * Math.PI / 180;
    const mpp = (40075016.686 * Math.cos(lat)) / (256 * k);
    const len = niceLen(mpp * F.w * 0.18), bw = len / mpp, bh = 0.45 * u;
    const sx = F.x + 2 * u, sy = F.y + F.h - 2.4 * u;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `400 ${1.05 * u}px ${FONT}`;
    const lastHalf = ctx.measureText(kmLbl(len)).width / 2;
    ctx.fillRect(sx - 1.2 * u, sy - 2.2 * u, bw + lastHalf + 2.4 * u, 3.4 * u);
    ctx.fillStyle = '#0b0b0b'; ctx.fillRect(sx, sy, bw / 2, bh);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(sx + bw / 2, sy, bw / 2, bh);
    ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 0.08 * u; ctx.strokeRect(sx, sy, bw, bh);
    ctx.fillStyle = '#0b0b0b'; ctx.font = `400 ${1.05 * u}px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('0', sx, sy - 0.5 * u);
    ctx.fillText(kmLbl(len / 2).replace(' km', '').replace(' m', ''), sx + bw / 2, sy - 0.5 * u);
    ctx.fillText(kmLbl(len), sx + bw, sy - 0.5 * u);
    if (S.basemap !== 'none') {
      ctx.font = `400 ${0.8 * u}px ${FONT}`; ctx.textAlign = 'right'; ctx.fillStyle = '#52514e';
      const tw = ctx.measureText(TILE_ATTR).width;
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(F.x + F.w - tw - 1.2 * u, F.y + F.h - 1.6 * u, tw + 1.2 * u, 1.6 * u);
      ctx.fillStyle = '#52514e'; ctx.fillText(TILE_ATTR, F.x + F.w - 0.6 * u, F.y + F.h - 0.5 * u);
    }

    drawPanel(ctx, P, P.pu, W >= H);
    return { canvas: out, tileFail };
  }

  function slug(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const toBlob = (canvas) => new Promise((res, rej) => {
    try { canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG vazio'))), 'image/png'); } catch (e) { rej(e); }
  });

  async function exportYears(anos) {
    const st = $('exportStatus');
    const btns = [$('btnPng'), $('btnSerie')];
    btns.forEach((b) => (b.disabled = true));
    try {
      for (const ano of anos) {
        st.textContent = `Gerando ${ano}…`;
        let { canvas, tileFail } = await renderPNG(ano, $('pagina').value);
        let blob;
        try { blob = await toBlob(canvas); }
        catch (e) {
          // fundo bloqueado (CORS): refaz sem o mapa de fundo
          const keep = S.basemap; S.basemap = 'none';
          ({ canvas } = await renderPNG(ano, $('pagina').value));
          S.basemap = keep;
          blob = await toBlob(canvas);
          tileFail = -1;
        }
        const name = `alvaras_${ano}_${S.distrito ? slug(S.distrito) : 'municipio-sp'}.png`;
        download(blob, name);
        st.textContent = tileFail === -1 ? `${name} salvo sem o mapa de fundo (bloqueado pelo navegador).`
          : tileFail > 0 ? `${name} salvo (${tileFail} blocos do fundo não carregaram).` : `${name} salvo.`;
        if (anos.length > 1) await sleep(600);
      }
      if (anos.length > 1) st.textContent = `Série salva: ${anos.join(', ')}.`;
    } catch (e) {
      console.error(e);
      st.textContent = 'Não foi possível gerar o PNG: ' + e.message;
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }

  function exportCSV() {
    const feats = (S.data[S.ano] || []).filter(isVisible);
    const cols = ['id', 'ano', 'data', 'sistema', 'alvara', 'processo', 'sei', 'descricao', 'grupo', 'classe', 'ato', 'etapa', 'sqls', 'endereco', 'categoria', 'cat_codigos', 'cat_descricao', 'uso', 'area', 'bpu', 'uso_iptu', 'distrito', 'subprefeitura', 'regiao', 'precisao', 'lat', 'lon'];
    const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [cols.join(';')];
    for (const f of feats) {
      const p = f.p, c = CLS[f.c];
      const row = {
        ...p, sistema: FONTE_CURTO[p.fonte || 'AD'], grupo: c.group, classe: clsText(c), ato: ATO_LBL[p.ato || 'emissao'], etapa: ETAPA_LBL[p.etapa] || '',
        uso: USO_LBL[p.uso] || '', area: p.area ? String(p.area).replace('.', ',') : '',
        cat_codigos: (p.cats || []).join('; '), cat_descricao: (p.cats || []).map((k) => CAT_LBL[k]).join('; '),
        lat: String(f.lat).replace('.', ','), lon: String(f.lon).replace('.', ','),
      };
      lines.push(cols.map((k) => q(row[k])).join(';'));
    }
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `alvaras_${S.ano}_${S.distrito ? slug(S.distrito) : 'municipio-sp'}.csv`);
  }
  function exportGeoJSON() {
    const feats = (S.data[S.ano] || []).filter(isVisible);
    const fc = { type: 'FeatureCollection', features: feats.map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lon, f.lat] }, properties: f.p })) };
    download(new Blob([JSON.stringify(fc)], { type: 'application/geo+json' }), `alvaras_${S.ano}_${S.distrito ? slug(S.distrito) : 'municipio-sp'}.geojson`);
  }

  /* ============================================================ início */
  async function init() {
    const [manifest, distritos, municipio] = await Promise.all([
      getJSON('data/manifest.json'), getJSON('data/distritos.geojson'), getJSON('data/municipio.geojson'),
    ]);
    S.manifest = manifest; S.anos = manifest.anos; S.distritos = distritos; S.municipio = municipio;
    window.mapaAlvaras = { map, S, renderPNG }; // para depuração no console
    for (const f of distritos.features) S.distritoIndex[f.properties.nome] = f;

    buildYears(); buildLegend(); buildEtapas(); buildCats(); buildDistritos();
    setBasemap(S.basemap);
    // se o mapa nasce com tamanho 0 (aba oculta, painel recolhido), enquadra quando ganhar tamanho
    let fitted = false;
    const fitCity = () => {
      map.invalidateSize({ pan: false });
      if (fitted || !mapEl.clientWidth || !mapEl.clientHeight) return;
      fitted = true;
      const d0 = S.distrito && S.distritoIndex[S.distrito];
      map.fitBounds(L.geoJSON(d0 || municipio).getBounds(), { padding: [10, 10] });
    };
    if (!map._loaded) map.setView([-23.65, -46.6], 10);
    fitCity();
    new ResizeObserver(() => { fitCity(); resizeCanvas(); }).observe(mapEl);
    resizeCanvas();
    drawBoundaries();

    $('basemap').onchange = (e) => { S.basemap = e.target.value; setBasemap(S.basemap); };
    $('showDistritos').onchange = (e) => { S.showDistritos = e.target.checked; drawBoundaries(); };
    $('btnPng').onclick = () => exportYears([S.ano]);
    // série: intervalo de anos
    for (const id of ['serieDe', 'serieAte']) {
      const sel = $(id); sel.innerHTML = '';
      for (const a of S.anos) { const o = document.createElement('option'); o.value = a.ano; o.textContent = a.ano; sel.appendChild(o); }
    }
    $('serieDe').value = S.anos[0].ano; $('serieAte').value = S.anos[S.anos.length - 1].ano;
    $('btnSerie').onclick = () => {
      let d0 = +$('serieDe').value, d1 = +$('serieAte').value;
      if (d0 > d1) [d0, d1] = [d1, d0];
      exportYears(S.anos.map((a) => a.ano).filter((x) => x >= d0 && x <= d1));
    };
    const ys = S.anos.map((a) => a.ano);
    $('sub').textContent = `Processos aprovados SEHAB/SMUL e Aprova Digital · ${ys[0]}–${ys[ys.length - 1]} · município inteiro`;
    $('btnCsv').onclick = exportCSV;
    $('btnGeo').onclick = exportGeoJSON;
    const setPanel = (open) => {
      $('panel').classList.toggle('open', open);
      document.body.classList.toggle('panel-open', open);
      $('panelToggle').textContent = open ? 'Ver mapa' : 'Filtros';
    };
    $('panelToggle').onclick = () => setPanel(!$('panel').classList.contains('open'));
    map.on('click', () => setPanel(false));

    const h = new URLSearchParams(location.hash.slice(1));
    const ano = +h.get('ano');
    const d = h.get('distrito') || '';
    setYear(S.anos.some((a) => a.ano === ano) ? ano : S.anos[S.anos.length - 1].ano);
    if (d && S.distritoIndex[d]) setDistrito(d, fitted);
  }
  init().catch((e) => {
    console.error(e);
    $('loading').textContent = 'Erro ao carregar os dados: ' + e.message + ' (abra o site por um servidor, não pelo arquivo).';
  });
})();
