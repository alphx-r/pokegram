// ════════════════════════════════════════════════════════════
// CROPPER — Filtros de foto e Cropper.js
// ════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════
// FILTROS DE FOTO
// ════════════════════════════════════════════════════════════

// Filtros padrão — podem ser sobrescritos pelo ADM via Supabase
const DEFAULT_FILTERS = [
  { id:'normal',    name:'Normal',    css:'' },
  { id:'vintage',   name:'Vintage',   css:'sepia(0.55) contrast(1.1) brightness(1.05)' },
  { id:'pb',        name:'P&B',       css:'grayscale(1)' },
  { id:'escuro',    name:'Escuro',    css:'brightness(0.72) contrast(1.3)' },
  { id:'frio',      name:'Frio',      css:'hue-rotate(200deg) saturate(1.2) brightness(1.05)' },
  { id:'quente',    name:'Quente',    css:'saturate(1.4) hue-rotate(-20deg) brightness(1.08)' },
  { id:'dramatico', name:'Dramático', css:'contrast(1.5) saturate(1.3) brightness(0.88)' },
  { id:'fade',      name:'Fade',      css:'brightness(1.1) contrast(0.8) saturate(0.7)' },
];

let _activeFilters = [...DEFAULT_FILTERS];
let _selectedFilter = 'normal';  // id do filtro ativo no crop

async function loadFilters() {
  try {
    const { data } = await db.from('app_config').select('value').eq('key','photo_filters').maybeSingle();
    if (data?.value) _activeFilters = JSON.parse(data.value);
  } catch(_) {}
}

function getFilterCSS(id) {
  return (_activeFilters.find(f => f.id === id) || {}).css || '';
}

// ── toggle faixa de filtros ────────────────────────────────
function _toggleFilterStrip() {
  const strip = document.getElementById('crop-filter-strip');
  const btn   = document.getElementById('btn-toggle-filters');
  if (!strip) return;
  const isVisible = strip.style.display === 'flex';
  strip.style.display = isVisible ? 'none' : 'flex';
  if (btn) {
    btn.style.background = isVisible ? '#2a2a2a' : '#0095f6';
    btn.style.borderColor = isVisible ? '#444' : '#0095f6';
  }
  if (!isVisible) renderFilterStrip();
}

// ── renderiza a faixa de filtros dentro do modal de crop ───
function renderFilterStrip() {
  const wrap = document.getElementById('crop-filter-strip');
  if (!wrap) return;
  const img  = document.getElementById('crop-img');
  wrap.innerHTML = _activeFilters.map(f => `
    <div onclick="selectFilter('${f.id}')" id="fstrip-${f.id}"
         style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;flex-shrink:0">
      <div style="width:58px;height:58px;border-radius:6px;overflow:hidden;border:2px solid ${_selectedFilter===f.id?'#0095f6':'transparent'};transition:border-color .15s">
        <img src="${img.src||''}" style="width:100%;height:100%;object-fit:cover;filter:${f.css||'none'}" draggable="false">
      </div>
      <span style="font-size:10px;color:${_selectedFilter===f.id?'#0095f6':'#aaa'};font-family:'Nunito',sans-serif;font-weight:${_selectedFilter===f.id?'700':'400'}">${f.name}</span>
    </div>`).join('');
}

function selectFilter(id) {
  _selectedFilter = id;
  const css = getFilterCSS(id);
  // Aplica o filtro no wrapper da área inteira do crop (inclui tudo que o Cropper.js injeta)
  const wrap = document.getElementById('crop-area-wrap');
  if (wrap) wrap.style.filter = css || 'none';
  renderFilterStrip();
}

// confirmarCrop com filtro — definido no bloco do cropper abaixo

// reset ao abrir o crop — chamado de dentro de _abrirCrop (cropper.js block)
function _resetFilterOnOpen() {
  _selectedFilter = 'normal';
  const img  = document.getElementById('crop-img');
  const wrap = document.getElementById('crop-area-wrap');
  if (img)  img.style.filter  = '';
  if (wrap) wrap.style.filter = 'none';
  const strip = document.getElementById('crop-filter-strip');
  const btn   = document.getElementById('btn-toggle-filters');
  if (strip) strip.style.display = 'none';
  if (btn) { btn.style.background = '#2a2a2a'; btn.style.borderColor = '#444'; }
}

// ── ADM: gerenciar filtros ──────────────────────────────────
let _admFiltros = [];
let _admPreviewSrc = null;

function admLoadFiltros() {
  _admFiltros = JSON.parse(JSON.stringify(_activeFilters));
  renderAdmFiltroList();
  renderAdmPreviewStrip();
}

function admAddFiltro() {
  _admFiltros.push({ id: 'filtro_' + Date.now(), name: 'Novo filtro', css: '' });
  renderAdmFiltroList();
  renderAdmPreviewStrip();
}

function admRemoveFiltro(idx) {
  _admFiltros.splice(idx, 1);
  renderAdmFiltroList();
  renderAdmPreviewStrip();
}

function admMoveFiltro(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= _admFiltros.length) return;
  [_admFiltros[idx], _admFiltros[target]] = [_admFiltros[target], _admFiltros[idx]];
  renderAdmFiltroList();
  renderAdmPreviewStrip();
}

function admFiltroField(idx, field, value) {
  _admFiltros[idx][field] = value;
  if (field === 'css') renderAdmPreviewStrip();
}

function renderAdmFiltroList() {
  const el = document.getElementById('filtro-list');
  if (!el) return;
  el.innerHTML = _admFiltros.map((f, i) => `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:4px;min-width:140px;flex:1">
        <label style="font-size:11px;color:var(--muted);font-weight:600">NOME</label>
        <input value="${f.name}" oninput="admFiltroField(${i},'name',this.value)"
          style="border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'Nunito',sans-serif;background:var(--surface);color:var(--text);width:100%">
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex:3;min-width:220px">
        <label style="font-size:11px;color:var(--muted);font-weight:600">CSS FILTER <span style="font-weight:400;opacity:.7">(ex: sepia(0.5) contrast(1.2))</span></label>
        <input value="${f.css}" oninput="admFiltroField(${i},'css',this.value);renderAdmPreviewStrip()"
          placeholder="deixe vazio para Normal"
          style="border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'Nunito',sans-serif;background:var(--surface);color:var(--text);width:100%">
      </div>
      <div style="display:flex;gap:6px;align-items:flex-end;padding-top:18px">
        <button onclick="admMoveFiltro(${i},-1)" title="Mover para cima"
          style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:6px 10px;cursor:pointer;font-size:14px">↑</button>
        <button onclick="admMoveFiltro(${i},1)"  title="Mover para baixo"
          style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:6px 10px;cursor:pointer;font-size:14px">↓</button>
        <button onclick="admRemoveFiltro(${i})"  title="Remover"
          style="background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:14px;color:#dc2626">✕</button>
      </div>
    </div>`).join('');
}

function admLoadPreviewImg(input) {
  const file = input.files[0]; if (!file) return;
  document.getElementById('filtro-preview-fname').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => { _admPreviewSrc = e.target.result; renderAdmPreviewStrip(); };
  reader.readAsDataURL(file);
}

function renderAdmPreviewStrip() {
  const el = document.getElementById('filtro-preview-strip');
  if (!el) return;
  const src = _admPreviewSrc || 'https://placehold.co/80x80/cccccc/888888?text=foto';
  el.innerHTML = _admFiltros.map(f => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">
      <div style="width:72px;height:72px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
        <img src="${src}" style="width:100%;height:100%;object-fit:cover;filter:${f.css||'none'}" draggable="false">
      </div>
      <span style="font-size:10px;color:var(--muted);font-family:'Nunito',sans-serif;max-width:72px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
    </div>`).join('');
}

async function admSalvarFiltros() {
  const ok  = document.getElementById('filtros-fb-ok');
  const err = document.getElementById('filtros-fb-err');
  ok.style.display = err.style.display = 'none';
  const { error } = await db.from('app_config')
    .upsert({ key: 'photo_filters', value: JSON.stringify(_admFiltros) }, { onConflict: 'key' });
  if (error) { err.textContent = error.message; err.style.display='block'; return; }
  _activeFilters = JSON.parse(JSON.stringify(_admFiltros));
  ok.style.display = 'block';
  setTimeout(() => ok.style.display='none', 2500);
}


// ── Image Cropper (Cropper.js) ─────────────────────────────
let _cropperInstance = null, _cropCallback = null, _cropFlipXState = false;

function _abrirCrop(src, callback, aspectRatio) {
  _cropCallback   = callback;
  _cropFlipXState = false;
  const overlay = document.getElementById('modal-crop-overlay');
  overlay.style.display = 'flex';
  const img = document.getElementById('crop-img');
  if (_cropperInstance) { _cropperInstance.destroy(); _cropperInstance = null; }
  img.onload = () => {
    _cropperInstance = new Cropper(img, {
      aspectRatio:      (aspectRatio === undefined || isNaN(aspectRatio)) ? NaN : aspectRatio,
      viewMode:         2,
      autoCropArea:     1,
      background:       false,
      responsive:       true,
      checkOrientation: false,
      guides:           true,
      zoomOnWheel:      true,
      initialAspectRatio: 1,
    });
    // reset filtro ao abrir — faixa permanece escondida até o usuário clicar
    setTimeout(() => {
      _selectedFilter = 'normal';
      const ci      = document.getElementById('crop-img');
      if (ci) ci.style.filter = '';
      // limpa o filtro do wrapper do crop
      const wrapEl = document.getElementById('crop-area-wrap');
      if (wrapEl) wrapEl.style.filter = 'none';
      // não chama renderFilterStrip — faixa fica oculta por padrão
      const strip = document.getElementById('crop-filter-strip');
      const btn   = document.getElementById('btn-toggle-filters');
      if (strip) strip.style.display = 'none';
      if (btn) { btn.style.background = '#2a2a2a'; btn.style.borderColor = '#444'; }
    }, 350);
  };
  img.onerror = () => alert('Erro ao carregar a imagem.');
  img.crossOrigin = src.startsWith('data:') ? null : 'anonymous';
  img.src = '';
  img.src = src;
}

function fecharCrop() {
  document.getElementById('modal-crop-overlay').style.display = 'none';
  if (_cropperInstance) { _cropperInstance.destroy(); _cropperInstance = null; }
  // NÃO zera _cropCallback aqui — confirmarCrop precisa dele ainda
}

function confirmarCrop() {
  if (!_cropperInstance || !_cropCallback) return;
  const cb = _cropCallback; // salva referência antes de fechar

  // Stories: 1080×1920 — banner/header: 1500×500 — posts/avatar: 1080×1080
  const isStory  = Math.abs(_cropperInstance.options.aspectRatio - 9/16) < 0.01;
  const isBanner = Math.abs(_cropperInstance.options.aspectRatio - 3)    < 0.01;
  const canvas = _cropperInstance.getCroppedCanvas(
    isStory
      ? { width: 1080, height: 1920, imageSmoothingQuality: 'high' }
      : isBanner
      ? { width: 1500, height: 500, imageSmoothingQuality: 'high' }
      : { maxWidth: 1080, maxHeight: 1080, imageSmoothingQuality: 'high' }
  );
  const filterCSS = getFilterCSS(_selectedFilter);

  // aplica filtro no canvas via offscreen canvas
  let finalCanvas = canvas;
  if (filterCSS) {
    const off = document.createElement('canvas');
    off.width  = canvas.width;
    off.height = canvas.height;
    const ctx = off.getContext('2d');
    ctx.filter = filterCSS;
    ctx.drawImage(canvas, 0, 0);
    finalCanvas = off;
  }

  // Brave com Shields ativo pode retornar null em toBlob — fallback via toDataURL
  function _canvasToBlob(cvs, mimeType, quality, callback) {
    try {
      cvs.toBlob(blob => {
        if (blob) { callback(blob); return; }
        try {
          const dataUrl = cvs.toDataURL(mimeType, quality);
          const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1];
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8 = new Uint8Array(n);
          while (n--) u8[n] = bstr.charCodeAt(n);
          callback(new Blob([u8], { type: mime }));
        } catch (e) { console.error('canvas export failed:', e); callback(null); }
      }, mimeType, quality);
    } catch (e) { console.error('toBlob failed:', e); callback(null); }
  }

  _canvasToBlob(finalCanvas, 'image/png', undefined, blob => {
    const file = new File([blob], 'image.png', { type: 'image/png' });
    fecharCrop();
    _cropCallback = null; // limpa só depois de usar
    cb(file);             // dispara o callback com o arquivo recortado
  }, 'image/png');
}

function _cropRotate(deg) { if (_cropperInstance) _cropperInstance.rotate(deg); }
function _cropFlipX() {
  if (!_cropperInstance) return;
  _cropFlipXState = !_cropFlipXState;
  _cropperInstance.scaleX(_cropFlipXState ? -1 : 1);
}

// adapters — mantém compatibilidade com openCropper(file, mode, callback)
function openCropper(file, mode, callback) {
  // sempre 1:1 para postagens e avatar; 9:16 para stories; 3:1 para banner/header
  const ratio = (mode === 'story') ? 9/16 : (mode === 'banner') ? 3 : 1;
  const reader = new FileReader();
  reader.onload = e => _abrirCrop(e.target.result, callback, ratio);
  reader.readAsDataURL(file);
}

function closeCropper() { fecharCrop(); }
function confirmCrop()  { confirmarCrop(); }

// loadFilters() é chamado pelo bootstrap em core.js (após `db` estar definido)

