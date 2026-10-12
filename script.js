/* Qur’anLoop — script.js
   Vanilla JS, tanpa dependensi, tanpa jaringan.
   Semua pemrosesan audio terjadi di browser. */
(function () {
  'use strict';

  /* =====================================================================
     1. Konstanta & util
     ===================================================================== */
  var STORAGE = {
    theme: 'quranloop.theme',
    settings: 'quranloop.settings',
    favorites: 'quranloop.favorites',
    history: 'quranloop.history'
  };
  var MAX_FAVORITES = 100;
  var MAX_HISTORY = 50;
  var MIN_RANGE = 0.5;               // detik, rentang loop minimum
  var LOOP_LOOKAHEAD = 0.025;        // detik, lompat sedikit sebelum akhir agar akurat
  var SEEK_STEP = 5;                 // detik
  var FINE_STEP = 0.5;               // detik, tombol +/- pada input waktu
  var LARGE_FILE_BYTES = 120 * 1024 * 1024;
  var LOAD_TIMEOUT_MS = 15000;
  var SUPPORTED_EXT = ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'aac'];
  var NS = 'http://www.w3.org/2000/svg';

  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function round1(v) { return Math.round(v * 10) / 10; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /** 75.4 -> "01:15" */
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var t = Math.floor(sec);
    return pad(Math.floor(t / 60)) + ':' + pad(t % 60);
  }

  /** Seperti formatTime, tetapi menampilkan satu desimal bila perlu: "00:15.5" */
  function formatPrecise(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var tenths = Math.round(sec * 10);
    var frac = tenths % 10;
    var whole = (tenths - frac) / 10;
    return formatTime(whole) + (frac ? '.' + frac : '');
  }

  /** Menerima "MM:SS", "MM:SS.d", "H:MM:SS", atau detik biasa. NaN bila tidak valid. */
  function parseTime(text) {
    var s = String(text == null ? '' : text).trim().replace(',', '.');
    if (!s) return NaN;
    if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(s)) return NaN;
    var parts = s.split(':');
    if (parts.length > 1) {
      var last = parseFloat(parts[parts.length - 1]);
      if (last >= 60) return NaN;
      if (parts.length === 3 && parseFloat(parts[1]) >= 60) return NaN;
    }
    return parts.reduce(function (acc, p) { return acc * 60 + parseFloat(p); }, 0);
  }

  function formatBytes(n) {
    if (!isFinite(n) || n < 0) n = 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' KB';
    return (n / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' MB';
  }

  function formatDate(ts) {
    var d = new Date(Number(ts));
    if (isNaN(d.getTime())) return '-';
    try { return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return d.toLocaleString(); }
  }

  function modeLabel(m) {
    return m === 'whole' ? 'Loop seluruh audio' : m === 'off' ? 'Loop nonaktif' : 'Loop potongan';
  }
  function isMode(m) { return m === 'off' || m === 'segment' || m === 'whole'; }

  /** Pembuat elemen kecil. Teks selalu lewat textContent (aman dari XSS). */
  function h(tag, props) {
    var n = document.createElement(tag);
    var keys = Object.keys(props || {});
    keys.forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(kid) {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) { kid.forEach(add); return; }
      n.append(kid);
    });
    return n;
  }

  function icon(name, cls) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  /* =====================================================================
     2. Referensi DOM
     ===================================================================== */
  var IDS = [
    'themeToggle', 'metaTheme', 'heroWave',
    'pendingBanner', 'pendingTitle', 'pendingText', 'pendingPick', 'pendingCancel',
    'uploadCard', 'dropzone', 'uploadLoading', 'uploadError', 'fileChip', 'fileInput',
    'pickBtn', 'replaceBtn', 'removeBtn', 'chipName', 'chipMeta',
    'playerCard', 'nowName', 'loopBadge', 'loopBadgeText',
    'timeline', 'tlSeek', 'tlRange', 'tlProgress', 'tlPlayhead', 'handleStart', 'handleEnd',
    'curTime', 'durTime', 'backBtn', 'playBtn', 'playUse', 'fwdBtn', 'muteBtn', 'muteUse',
    'counterNum', 'counterReset',
    'startInput', 'endInput', 'startMinus', 'startPlus', 'endMinus', 'endPlus',
    'useStart', 'useEnd', 'rangeMsg', 'rangeSummary', 'resetRange', 'saveFav',
    'exportBtn', 'exportIcon', 'exportSpinner', 'exportLabel', 'exportStatus', 'exportEstimate', 'exportResult',
    'infoEmpty', 'infoList', 'infoName', 'infoFormat', 'infoSize', 'infoDuration', 'infoStart', 'infoEnd', 'infoClip',
    'labelSurah', 'labelAyat', 'labelNote',
    'favList', 'favEmpty', 'histList', 'histEmpty', 'favCount', 'histCount',
    'setDefaultMode', 'setResetCounter',
    'confirmDialog', 'confirmTitle', 'confirmMessage', 'confirmOk',
    'saveDialog', 'saveForm', 'saveName', 'saveSurah', 'saveAyat', 'saveNote', 'saveSummary',
    'toastRegion', 'audio'
  ];
  var el = {};
  IDS.forEach(function (id) {
    el[id] = document.getElementById(id);
    if (!el[id]) console.warn('Qur’anLoop: elemen #' + id + ' tidak ditemukan.');
  });
  var audio = el.audio;
  var loopRadios = $$('input[name="loopMode"]');
  var volumeSliders = $$('[data-volume]');

  /* =====================================================================
     3. State
     ===================================================================== */
  var state = {
    file: null,
    url: null,
    loading: false,
    loaded: false,
    duration: 0,
    start: 0,
    end: 0,
    mode: 'segment',
    repeats: 0,
    label: { surah: '', ayat: '', note: '' },
    pending: null,       // konfigurasi (favorit/riwayat) yang menunggu file
    exporting: false,
    view: 'player'
  };
  var loop = { prevT: null };
  var loadTimer = 0;
  var rafId = 0;
  var intervalId = 0;
  var historyTimer = 0;
  var storageWarned = false;

  /* =====================================================================
     4. Penyimpanan lokal
     ===================================================================== */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) {
        if (!storageWarned) {
          storageWarned = true;
          toast('Penyimpanan lokal tidak tersedia. Pengaturan tidak akan bertahan setelah halaman ditutup.', 'error', 6000);
        }
        return false;
      }
    }
  };

  var settings = (function () {
    var s = store.get(STORAGE.settings, {});
    if (!s || typeof s !== 'object') s = {};
    return {
      defaultMode: isMode(s.defaultMode) ? s.defaultMode : 'segment',
      volume: typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : 1
    };
  })();
  state.mode = settings.defaultMode;

  function saveSettings() { return store.set(STORAGE.settings, settings); }

  function readList(key) {
    var l = store.get(key, []);
    return Array.isArray(l) ? l.filter(function (i) { return i && typeof i === 'object'; }) : [];
  }

  /* =====================================================================
     5. Toast & dialog
     ===================================================================== */
  function toast(message, type, ms) {
    type = type || 'info';
    var iconName = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
    var node = h('div', { class: 'toast toast-' + type, role: type === 'error' ? 'alert' : null },
      icon(iconName), h('span', { text: message }));
    el.toastRegion.appendChild(node);
    while (el.toastRegion.children.length > 4) el.toastRegion.firstElementChild.remove();
    var life = ms || (type === 'error' ? 5000 : 3200);
    setTimeout(function () {
      node.classList.add('leaving');
      setTimeout(function () { node.remove(); }, 220);
    }, life);
  }

  function openDialog(d) {
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }

  function confirmAction(opts) {
    var d = el.confirmDialog;
    if (typeof d.showModal !== 'function') return Promise.resolve(window.confirm(opts.message));
    return new Promise(function (resolve) {
      el.confirmTitle.textContent = opts.title;
      el.confirmMessage.textContent = opts.message;
      el.confirmOk.textContent = opts.confirmText || 'Hapus';
      d.returnValue = '';
      d.addEventListener('close', function onClose() {
        d.removeEventListener('close', onClose);
        resolve(d.returnValue === 'ok');
      });
      openDialog(d);
    });
  }

  $$('[data-dialog-cancel]').forEach(function (b) {
    b.addEventListener('click', function () { b.closest('dialog').close('cancel'); });
  });

  /* =====================================================================
     6. Tema
     ===================================================================== */
  function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    el.metaTheme.setAttribute('content', theme === 'dark' ? '#0B1220' : '#F8FAFC');
    el.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap');
    if (persist) store.set(STORAGE.theme, theme);
  }

  /* =====================================================================
     7. Navigasi antar halaman
     ===================================================================== */
  function showView(name) {
    state.view = name;
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + name; });
    $$('.rail-btn').forEach(function (b) {
      if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (name === 'favorites') renderFavorites();
    if (name === 'history') renderHistory();
    if (name === 'settings') renderCounts();
    window.scrollTo(0, 0);
  }

  /* =====================================================================
     8. Validasi rentang
     ===================================================================== */
  function minRange() { return Math.min(MIN_RANGE, state.duration / 2); }

  function validateRange(s, e) {
    if (!state.loaded) return { ok: false, message: 'Muat file audio terlebih dahulu.' };
    if (!(s >= 0)) return { ok: false, message: 'Waktu mulai tidak boleh kurang dari 00:00.' };
    if (e > state.duration + 0.001) {
      return { ok: false, message: 'Waktu selesai tidak boleh melebihi durasi audio (' + formatPrecise(state.duration) + ').' };
    }
    if (!(s < e)) return { ok: false, message: 'Waktu mulai harus lebih kecil dari waktu selesai.' };
    if (e - s < minRange() - 0.001) return { ok: false, message: 'Rentang loop terlalu pendek. Minimal 0,5 detik.' };
    return { ok: true, message: '' };
  }

  function setRangeMsg(text) {
    if (text) { el.rangeMsg.textContent = text; el.rangeMsg.hidden = false; }
    else { el.rangeMsg.textContent = ''; el.rangeMsg.hidden = true; }
  }

  function markInvalid(input, text) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'rangeMsg');
    setRangeMsg(text);
    toast(text, 'error');
  }

  function clearInvalid() {
    [el.startInput, el.endInput].forEach(function (i) {
      i.removeAttribute('aria-invalid');
      i.removeAttribute('aria-describedby');
    });
    setRangeMsg('');
  }

  /* =====================================================================
     9. Render
     ===================================================================== */
  function pct(t) {
    return state.duration > 0 ? clamp(t / state.duration, 0, 1) * 100 : 0;
  }

  var lastCur = '', lastDur = '';
  function renderProgress() {
    var t = state.loaded ? audio.currentTime : 0;
    var p = pct(t);
    el.tlProgress.style.width = p + '%';
    el.tlPlayhead.style.left = p + '%';
    var c = formatTime(t);
    if (c !== lastCur) { el.curTime.textContent = c; lastCur = c; }
    var d = formatTime(state.duration);
    if (d !== lastDur) { el.durTime.textContent = d; lastDur = d; }
  }

  function renderTimelineRange() {
    var s = pct(state.start), e = pct(state.end);
    el.tlRange.style.left = s + '%';
    el.tlRange.style.width = Math.max(0, e - s) + '%';
    el.handleStart.style.left = s + '%';
    el.handleEnd.style.left = e + '%';
    var min = minRange();
    el.handleStart.setAttribute('aria-valuemin', '0');
    el.handleStart.setAttribute('aria-valuemax', String(round1(Math.max(0, state.end - min))));
    el.handleStart.setAttribute('aria-valuenow', String(state.start));
    el.handleStart.setAttribute('aria-valuetext', formatPrecise(state.start));
    el.handleEnd.setAttribute('aria-valuemin', String(round1(state.start + min)));
    el.handleEnd.setAttribute('aria-valuemax', String(state.duration));
    el.handleEnd.setAttribute('aria-valuenow', String(state.end));
    el.handleEnd.setAttribute('aria-valuetext', formatPrecise(state.end));
  }

  function renderRangeInputs() {
    el.startInput.value = formatPrecise(state.start);
    el.endInput.value = formatPrecise(state.end);
    var clip = state.loaded ? formatPrecise(state.end - state.start) : '00:00';
    el.rangeSummary.replaceChildren(document.createTextNode('Durasi potongan: '), h('strong', { text: clip }));
  }

  function renderLoopBadge() {
    var text, mode = state.loaded ? state.mode : 'off';
    if (!state.loaded) text = 'Menunggu audio';
    else if (mode === 'segment') text = 'Loop potongan aktif: ' + formatPrecise(state.start) + ' – ' + formatPrecise(state.end);
    else if (mode === 'whole') text = 'Loop seluruh audio aktif';
    else text = 'Loop nonaktif';
    el.loopBadgeText.textContent = text;
    el.loopBadge.dataset.mode = mode;
    el.playerCard.dataset.loop = mode;
    loopRadios.forEach(function (r) { r.checked = r.value === state.mode; });
  }

  function renderInfo() {
    el.infoEmpty.hidden = state.loaded;
    el.infoList.hidden = !state.loaded;
    el.nowName.textContent = state.loaded ? state.file.name : 'Belum ada audio';
    if (!state.loaded) return;
    el.infoName.textContent = state.file.name;
    el.infoFormat.textContent = fileFormat(state.file);
    el.infoSize.textContent = formatBytes(state.file.size);
    el.infoDuration.textContent = formatPrecise(state.duration);
    el.infoStart.textContent = formatPrecise(state.start);
    el.infoEnd.textContent = formatPrecise(state.end);
    el.infoClip.textContent = formatPrecise(state.end - state.start);
  }

  function renderFileUI() {
    el.dropzone.hidden = state.loaded || state.loading;
    el.uploadLoading.hidden = !state.loading;
    el.fileChip.hidden = !state.loaded;
    if (state.loaded) {
      el.chipName.textContent = state.file.name;
      el.chipMeta.textContent = fileFormat(state.file, true) + ' · ' + formatBytes(state.file.size) + ' · ' + formatPrecise(state.duration);
    }
  }

  function renderEstimate() {
    if (!state.loaded) { el.exportEstimate.textContent = 'Muat audio untuk melihat perkiraan ukuran.'; return; }
    var secs = Math.max(0, state.end - state.start);
    var bytes = secs * 48000 * 2 * 2 + 44; // batas atas: 48 kHz, stereo, 16-bit
    el.exportEstimate.textContent = 'Potongan ' + formatPrecise(secs) + ' · perkiraan ukuran WAV hingga ' + formatBytes(bytes) + '.';
  }

  function renderCounter(bump) {
    el.counterNum.textContent = String(state.repeats);
    if (bump) {
      el.counterNum.classList.remove('bump');
      void el.counterNum.offsetWidth; // mulai ulang animasi
      el.counterNum.classList.add('bump');
    }
  }

  function renderPending() {
    var p = state.pending;
    el.pendingBanner.hidden = !p;
    if (!p) return;
    el.pendingTitle.textContent = 'Menunggu file audio untuk “' + p.title + '”';
    el.pendingText.textContent = 'Pilih file “' + p.fileName + '” untuk menerapkan rentang ' +
      formatPrecise(p.start) + ' – ' + formatPrecise(p.end) + '. File audio tidak disimpan oleh aplikasi.';
  }

  function renderRange() {
    renderTimelineRange();
    renderRangeInputs();
    renderLoopBadge();
    renderInfo();
    renderEstimate();
  }

  function renderAll() {
    renderFileUI();
    renderRange();
    renderProgress();
    renderCounter(false);
    renderPending();
    setPlayingUI(!audio.paused && state.loaded);
  }

  function fileFormat(file, short) {
    var name = file.name || '';
    var ext = name.indexOf('.') > -1 ? name.split('.').pop().toUpperCase() : '';
    if (ext.length > 5) ext = '';
    var type = file.type || '';
    if (short) return ext || type || 'Audio';
    if (ext && type) return ext + ' (' + type + ')';
    return ext || type || 'Tidak diketahui';
  }

  function setLoadedUI(on) {
    $$('[data-needs-audio]').forEach(function (n) {
      if (n.matches('button,input,select,textarea')) n.disabled = !on;
      else { n.setAttribute('aria-disabled', String(!on)); n.tabIndex = on ? 0 : -1; }
    });
    if (state.exporting) el.exportBtn.disabled = true;
  }

  /* =====================================================================
     10. Muat / hapus file
     ===================================================================== */
  function validateFile(file) {
    if (!file) return 'Tidak ada file yang dipilih.';
    if (file.size === 0) return 'File kosong. Pilih file audio yang berisi data.';
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    var isAudioType = /^audio\//i.test(file.type || '');
    if (!isAudioType && SUPPORTED_EXT.indexOf(ext) === -1) {
      return 'File tidak didukung. Pilih file audio MP3, M4A, WAV, atau OGG.';
    }
    return '';
  }

  function showUploadError(text) {
    if (text) { el.uploadError.textContent = text; el.uploadError.hidden = false; }
    else { el.uploadError.textContent = ''; el.uploadError.hidden = true; }
  }

  function loadFile(file) {
    var problem = validateFile(file);
    if (problem) {
      showUploadError(problem);
      toast(problem, 'error');
      return;
    }
    showUploadError('');
    unloadAudio();
    state.file = file;
    state.loading = true;
    state.url = URL.createObjectURL(file);
    clearInvalid();
    renderAll();
    loadTimer = setTimeout(function () {
      if (state.loading) failLoad('Waktu memuat audio habis. File mungkin rusak atau terlalu besar untuk browser ini.');
    }, LOAD_TIMEOUT_MS);
    audio.src = state.url;
    audio.load();
  }

  function unloadAudio() {
    flushHistory();
    clearTimeout(loadTimer);
    stopTicker();
    audio.pause();
    audio.removeAttribute('src');
    audio.loop = false;
    audio.load();
    if (state.url) { URL.revokeObjectURL(state.url); state.url = null; }
    state.file = null;
    state.loaded = false;
    state.loading = false;
    state.duration = 0;
    state.start = 0;
    state.end = 0;
    state.repeats = 0;
    state.label = { surah: '', ayat: '', note: '' };
    state.mode = settings.defaultMode;
    loop.prevT = null;
    el.labelSurah.value = '';
    el.labelAyat.value = '';
    el.labelNote.value = '';
    el.exportResult.hidden = true;
    setLoadedUI(false);
    document.body.classList.remove('is-playing');
  }

  function failLoad(message) {
    unloadAudio();
    showUploadError(message);
    toast(message, 'error');
    renderAll();
  }

  function removeFile() {
    unloadAudio();
    el.fileInput.value = '';
    clearInvalid();
    renderAll();
    toast('File audio dihapus dari pemutar.', 'info');
  }

  function onMetadata() {
    if (!state.file || !state.loading) return;
    var d = audio.duration;
    if (!isFinite(d) || d <= 0) {
      failLoad('Durasi audio tidak dapat dibaca. File mungkin rusak atau formatnya tidak lengkap.');
      return;
    }
    clearTimeout(loadTimer);
    state.loading = false;
    state.loaded = true;
    state.duration = d;
    state.start = 0;
    state.end = d;
    state.repeats = 0;
    audio.volume = settings.volume;
    setLoadedUI(true);
    setMode(settings.defaultMode, true);

    var note = '';
    if (state.pending) {
      var cfg = state.pending;
      state.pending = null;
      var clamped = applyConfig(cfg);
      if (cfg.fileName !== state.file.name) note = ' Nama file berbeda dari yang tersimpan, rentang tetap diterapkan.';
      else if (clamped) note = ' Rentang disesuaikan dengan durasi audio.';
      else note = ' Konfigurasi tersimpan diterapkan.';
    } else {
      var h0 = findHistory(state.file);
      if (h0 && applyConfig(h0, true)) note = ' Rentang dari riwayat dipulihkan.';
    }
    renderAll();
    toast('Audio berhasil dimuat.' + note, 'success');
    saveHistoryNow();
  }

  function onDurationChange() {
    if (!state.loaded) return;
    var d = audio.duration;
    if (!isFinite(d) || d <= 0 || Math.abs(d - state.duration) < 0.01) return;
    var wasFull = state.end >= state.duration - 0.05;
    state.duration = d;
    if (wasFull || state.end > d) state.end = d;
    if (state.start >= state.end - minRange()) state.start = Math.max(0, state.end - minRange());
    renderAll();
  }

  function onAudioError() {
    if (!state.file) return;
    var code = audio.error ? audio.error.code : 0;
    if (code === 1) return; // dibatalkan oleh kita sendiri
    var msg;
    if (code === 2) msg = 'Terjadi kesalahan saat membaca file audio.';
    else if (code === 3) msg = 'File audio rusak atau tidak dapat didekode oleh browser.';
    else if (code === 4) msg = 'Format audio ini tidak didukung oleh browser kamu. Coba MP3, M4A, WAV, atau OGG lain.';
    else msg = 'Audio tidak dapat diputar.';
    if (state.loading) failLoad(msg);
    else { toast(msg, 'error'); setPlayingUI(false); stopTicker(); }
  }

  /* Konfigurasi dari favorit/riwayat. Mengembalikan true bila ada nilai yang disesuaikan. */
  function applyConfig(cfg, fromHistory) {
    var d = state.duration, min = minRange();
    var s = Number(cfg.start), e = Number(cfg.end), adjusted = false;
    if (!isFinite(s) || s < 0) { s = 0; adjusted = true; }
    if (!isFinite(e) || e > d) { e = d; adjusted = true; }
    if (!(e - s >= min)) { s = 0; e = d; adjusted = true; }
    state.start = round1(s);
    state.end = e > d - 0.05 ? d : round1(e);
    var isFullRange = state.start === 0 && state.end === d;
    if (fromHistory && isFullRange) return false; // tidak ada yang perlu dipulihkan
    if (!fromHistory || isMode(cfg.mode)) setMode(isMode(cfg.mode) ? cfg.mode : settings.defaultMode, true);
    var lb = cfg.label || {};
    state.label = { surah: String(lb.surah || ''), ayat: String(lb.ayat || ''), note: String(lb.note || '') };
    el.labelSurah.value = state.label.surah;
    el.labelAyat.value = state.label.ayat;
    el.labelNote.value = state.label.note;
    try { audio.currentTime = state.mode === 'segment' ? state.start : 0; } catch (err) { /* abaikan */ }
    loop.prevT = null;
    return fromHistory ? true : adjusted;
  }

  /* =====================================================================
     11. Pemutar
     ===================================================================== */
  function setPlayingUI(playing) {
    el.playUse.setAttribute('href', playing ? '#i-pause' : '#i-play');
    el.playBtn.setAttribute('aria-label', playing ? 'Jeda' : 'Putar');
    document.body.classList.toggle('is-playing', !!playing);
  }

  function handlePlayError(err) {
    var name = err && err.name;
    if (name === 'AbortError') return; // pemutaran diinterupsi (mis. file diganti)
    if (name === 'NotAllowedError') {
      toast('Browser memblokir pemutaran otomatis. Tekan tombol Putar sekali lagi.', 'info', 5000);
    } else if (name === 'NotSupportedError') {
      toast('Audio tidak dapat diputar di browser ini.', 'error');
    } else {
      toast('Gagal memutar audio.', 'error');
    }
    setPlayingUI(false);
  }

  function safePlay() {
    var p;
    try { p = audio.play(); } catch (err) { handlePlayError(err); return; }
    if (p && typeof p.catch === 'function') p.catch(handlePlayError);
  }

  function togglePlay() {
    if (!state.loaded) return;
    if (!audio.paused) { audio.pause(); return; }
    if (state.mode === 'segment') {
      var t = audio.currentTime;
      if (t < state.start - 0.05 || t >= state.end - 0.05) audio.currentTime = state.start;
    }
    loop.prevT = null;
    safePlay();
  }

  function seekTo(t) {
    if (!state.loaded) return;
    audio.currentTime = clamp(t, 0, state.duration);
    renderProgress();
  }

  function onTimeUpdate() {
    if (!state.loaded) return;
    checkLoop();
    if (!rafId) renderProgress(); // saat rAF aktif, rAF yang menggambar
    el.tlSeek.setAttribute('aria-valuemax', String(state.duration));
    el.tlSeek.setAttribute('aria-valuenow', String(Math.floor(audio.currentTime)));
    el.tlSeek.setAttribute('aria-valuetext', formatTime(audio.currentTime) + ' dari ' + formatTime(state.duration));
  }

  /* Mesin loop: dipanggil dari rAF, interval cadangan, dan timeupdate. */
  function checkLoop() {
    if (state.mode !== 'segment' || !state.loaded || audio.paused) { loop.prevT = null; return; }
    var t = audio.currentTime;
    var prev = loop.prevT;
    loop.prevT = t;
    if (t >= state.end - LOOP_LOOKAHEAD) {
      // Hitung sebagai pengulangan hanya bila posisi tiba di akhir lewat pemutaran normal,
      // bukan karena pengguna menggeser posisi atau mengubah rentang.
      var natural = prev !== null && prev < state.end && t >= prev && t - prev < 0.6;
      loopBack(natural);
    }
  }

  function loopBack(counted) {
    try { audio.currentTime = state.start; } catch (err) { return; }
    loop.prevT = state.start;
    if (audio.paused) safePlay();
    if (counted) {
      state.repeats += 1;
      renderCounter(true);
      scheduleHistory();
    }
  }

  function onEnded() {
    if (!state.loaded) return;
    if (state.mode === 'segment') { loopBack(true); return; }
    setPlayingUI(false);
    stopTicker();
    renderProgress();
  }

  function startTicker() {
    if (!rafId) {
      var step = function () {
        rafId = 0;
        if (audio.paused || !state.loaded) return;
        checkLoop();
        renderProgress();
        rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    }
    if (!intervalId) intervalId = setInterval(checkLoop, 40); // cadangan saat tab tersembunyi
  }

  function stopTicker() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (intervalId) { clearInterval(intervalId); intervalId = 0; }
  }

  function onVolumeChange() {
    var v = audio.muted ? 0 : audio.volume;
    volumeSliders.forEach(function (s) {
      s.value = String(v);
      s.setAttribute('aria-valuetext', Math.round(v * 100) + '%');
    });
    var off = audio.muted || audio.volume === 0;
    el.muteUse.setAttribute('href', off ? '#i-volume-off' : '#i-volume');
    el.muteBtn.setAttribute('aria-label', off ? 'Aktifkan suara' : 'Bisukan suara');
  }

  /* =====================================================================
     12. Rentang loop
     ===================================================================== */
  function setMode(mode, silent) {
    if (!isMode(mode)) return;
    state.mode = mode;
    audio.loop = mode === 'whole';
    loop.prevT = null;
    renderLoopBadge();
    if (!silent && mode === 'segment' && state.loaded && !audio.paused && audio.currentTime < state.start - 0.05) {
      audio.currentTime = state.start;
    }
    if (!silent) scheduleHistory();
  }

  function setRange(s, e) {
    state.start = s;
    state.end = e;
    renderRange();
    scheduleHistory();
  }

  function commitTimeInput(which) {
    if (!state.loaded) return;
    var input = which === 'start' ? el.startInput : el.endInput;
    var v = parseTime(input.value);
    if (isNaN(v)) { markInvalid(input, 'Format waktu tidak valid. Gunakan MM:SS, misalnya 00:15.'); return; }
    // Toleransi pembulatan tampilan (0,1 dtk): nilai di sekitar durasi dianggap sama dengan durasi.
    // Nilai yang jelas melewati durasi dibiarkan apa adanya agar ditolak oleh validasi.
    if (Math.abs(v - state.duration) <= 0.06) v = state.duration;
    else if (v < state.duration) v = round1(v);
    var s = which === 'start' ? v : state.start;
    var e = which === 'end' ? v : state.end;
    var res = validateRange(s, e);
    if (!res.ok) { markInvalid(input, res.message); return; }
    clearInvalid();
    setRange(s, e);
    toast('Rentang loop berhasil diubah.', 'success');
  }

  function nudge(which, delta) {
    if (!state.loaded) return;
    var s = state.start, e = state.end;
    if (which === 'start') s = round1(s + delta); else e = round1(e + delta);
    if (e > state.duration - 0.05 && e <= state.duration + 0.5 && which === 'end') e = state.duration;
    if (s < 0 && s > -0.5) s = 0;
    var res = validateRange(s, e);
    if (!res.ok) { markInvalid(which === 'start' ? el.startInput : el.endInput, res.message); return; }
    clearInvalid();
    setRange(s, e);
  }

  function moveHandle(which, t) {
    var min = minRange();
    t = round1(t);
    if (which === 'start') {
      setRange(clamp(t, 0, round1(state.end - min)), state.end);
    } else {
      var e = clamp(t, round1(state.start + min), state.duration);
      if (e > state.duration - 0.05) e = state.duration;
      setRange(state.start, e);
    }
    clearInvalid();
  }

  function useCurrentAsStart() {
    if (!state.loaded) return;
    var t = round1(audio.currentTime), min = minRange();
    if (t > state.duration - min) {
      markInvalid(el.startInput, 'Posisi saat ini terlalu dekat dengan akhir audio untuk menjadi awal loop.');
      return;
    }
    var e = state.end;
    if (e - t < min) e = Math.min(state.duration, round1(t + 10));
    clearInvalid();
    setRange(t, e);
    toast('Awal loop diatur ke ' + formatPrecise(t) + '.', 'success');
  }

  function useCurrentAsEnd() {
    if (!state.loaded) return;
    var t = round1(audio.currentTime);
    if (t >= state.duration - 0.05) t = state.duration;
    var res = validateRange(state.start, t);
    if (!res.ok) { markInvalid(el.endInput, res.message); return; }
    clearInvalid();
    setRange(state.start, t);
    toast('Akhir loop diatur ke ' + formatPrecise(t) + '.', 'success');
  }

  function applyPreset(seconds) {
    if (!state.loaded) return;
    var d = state.duration, min = minRange();
    var s = round1(clamp(audio.currentTime, 0, d));
    var e = s + seconds;
    if (e > d - 0.05) e = d;                 // batasi pada durasi audio
    if (e - s < min) s = Math.max(0, round1(e - seconds)); // posisi terlalu dekat akhir: mundurkan awal
    e = e >= d ? d : round1(e);
    var res = validateRange(s, e);
    if (!res.ok) { markInvalid(el.startInput, res.message); return; }
    clearInvalid();
    var enabled = false;
    if (state.mode === 'off') { setMode('segment', true); enabled = true; }
    setRange(s, e);
    toast('Preset ' + seconds + ' detik: ' + formatPrecise(s) + ' – ' + formatPrecise(e) + (enabled ? '. Loop potongan diaktifkan.' : '.'), 'success');
  }

  function resetRange() {
    if (!state.loaded) return;
    clearInvalid();
    setRange(0, state.duration);
    toast('Rentang loop dikembalikan ke seluruh audio.', 'info');
  }

  function resetCounter() {
    state.repeats = 0;
    renderCounter(false);
    scheduleHistory();
    toast('Counter pengulangan direset.', 'info');
  }

  /* =====================================================================
     13. Timeline: seek, drag handle, keyboard
     ===================================================================== */
  function timeFromPointer(e) {
    var r = el.timeline.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return clamp((e.clientX - r.left) / r.width, 0, 1) * state.duration;
  }

  function bindTimeline() {
    var scrubbing = false;
    el.tlSeek.addEventListener('pointerdown', function (e) {
      if (!state.loaded) return;
      scrubbing = true;
      el.tlSeek.setPointerCapture(e.pointerId);
      seekTo(timeFromPointer(e));
      loop.prevT = null;
      e.preventDefault();
      el.tlSeek.focus({ preventScroll: true });
    });
    el.tlSeek.addEventListener('pointermove', function (e) { if (scrubbing) seekTo(timeFromPointer(e)); });
    var endScrub = function (e) {
      if (!scrubbing) return;
      scrubbing = false;
      try { el.tlSeek.releasePointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
    };
    el.tlSeek.addEventListener('pointerup', endScrub);
    el.tlSeek.addEventListener('pointercancel', endScrub);

    el.tlSeek.addEventListener('keydown', function (e) {
      if (!state.loaded) return;
      var step = e.shiftKey ? 5 : 1, t = audio.currentTime, handled = true;
      switch (e.key) {
        case 'ArrowLeft': case 'ArrowDown': seekTo(t - step); break;
        case 'ArrowRight': case 'ArrowUp': seekTo(t + step); break;
        case 'PageDown': seekTo(t - 10); break;
        case 'PageUp': seekTo(t + 10); break;
        case 'Home': seekTo(0); break;
        case 'End': seekTo(state.duration); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    });

    [['start', el.handleStart], ['end', el.handleEnd]].forEach(function (pair) {
      var which = pair[0], handle = pair[1], dragging = false;
      handle.addEventListener('pointerdown', function (e) {
        if (!state.loaded) return;
        dragging = true;
        handle.setPointerCapture(e.pointerId);
        handle.classList.add('dragging');
        el.handleStart.classList.remove('on-top');
        el.handleEnd.classList.remove('on-top');
        handle.classList.add('on-top');
        handle.focus({ preventScroll: true });
        e.preventDefault();
      });
      handle.addEventListener('pointermove', function (e) {
        if (dragging) moveHandle(which, timeFromPointer(e));
      });
      var stop = function (e) {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('dragging');
        try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
      };
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
      handle.addEventListener('keydown', function (e) {
        if (!state.loaded) return;
        var step = e.shiftKey ? 1 : 0.1, cur = which === 'start' ? state.start : state.end, handled = true;
        switch (e.key) {
          case 'ArrowLeft': case 'ArrowDown': moveHandle(which, cur - step); break;
          case 'ArrowRight': case 'ArrowUp': moveHandle(which, cur + step); break;
          case 'Home': moveHandle(which, which === 'start' ? 0 : state.start + minRange()); break;
          case 'End': moveHandle(which, which === 'start' ? state.end - minRange() : state.duration); break;
          default: handled = false;
        }
        if (handled) e.preventDefault();
      });
    });
  }

  /* =====================================================================
     14. Ekspor potongan (Web Audio API -> WAV PCM 16-bit)
     ===================================================================== */
  function clipFileName(s, e) {
    function f(t) {
      var tenths = Math.round(t * 10), frac = tenths % 10, whole = (tenths - frac) / 10;
      return pad(Math.floor(whole / 60)) + '-' + pad(whole % 60) + (frac ? 'd' + frac : '');
    }
    return 'quranloop-potongan-' + f(s) + '-' + f(e) + '.wav';
  }

  function readFile(file) {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error || new Error('Gagal membaca file.')); };
      r.readAsArrayBuffer(file);
    });
  }

  function decodeAudio(ctx, arrayBuffer) {
    return new Promise(function (resolve, reject) {
      var p = ctx.decodeAudioData(arrayBuffer, resolve, reject); // callback untuk Safari lama
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  }

  function nextTick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  function writeStr(view, offset, str) {
    for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  /** Mengambil [startSec, endSec) dari AudioBuffer dan menyandikannya menjadi WAV 16-bit. */
  function sliceToWav(buffer, startSec, endSec) {
    var sr = buffer.sampleRate;
    var s0 = clamp(Math.round(startSec * sr), 0, buffer.length);
    var s1 = clamp(Math.round(endSec * sr), 0, buffer.length);
    var frames = s1 - s0;
    if (frames <= 0) return Promise.reject(new Error('Rentang tidak berisi audio.'));
    var channels = Math.min(buffer.numberOfChannels, 2);
    var dataSize = frames * channels * 2;
    if (dataSize + 44 > 0xFFFFFFFF) return Promise.reject(new Error('Potongan terlalu besar untuk format WAV.'));

    var out = new ArrayBuffer(44 + dataSize);
    var view = new DataView(out);
    writeStr(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(view, 8, 'WAVE');
    writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);                 // PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * channels * 2, true); // byte rate
    view.setUint16(32, channels * 2, true);      // block align
    view.setUint16(34, 16, true);                // bit depth
    writeStr(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    var data = [];
    for (var c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

    var CHUNK = 262144, offset = 44, i = 0;
    return new Promise(function (resolve, reject) {
      (function work() {
        try {
          var stop = Math.min(frames, i + CHUNK);
          for (var n = i; n < stop; n++) {
            for (var ch = 0; ch < channels; ch++) {
              var x = data[ch][s0 + n];
              x = x < -1 ? -1 : x > 1 ? 1 : x;
              view.setInt16(offset, Math.round(x < 0 ? x * 32768 : x * 32767), true);
              offset += 2;
            }
          }
          i = stop;
          if (i < frames) setTimeout(work, 0); // beri napas ke UI
          else resolve({ blob: new Blob([out], { type: 'audio/wav' }), sampleRate: sr, channels: channels, frames: frames });
        } catch (err) { reject(err); }
      })();
    });
  }

  function setExporting(on, status) {
    state.exporting = on;
    el.exportBtn.disabled = on || !state.loaded;
    el.exportSpinner.hidden = !on;
    el.exportIcon.style.display = on ? 'none' : '';
    el.exportLabel.textContent = on ? 'Memproses…' : 'Download Potongan';
    el.exportStatus.textContent = status || '';
  }

  function exportErrorMessage(err) {
    var name = err && err.name, msg = err && err.message;
    if (name === 'EncodingError' || name === 'NotSupportedError') return 'Browser tidak dapat mendekode file ini, jadi potongan tidak bisa dibuat.';
    if (err instanceof RangeError || /memory|allocation|array buffer/i.test(msg || '')) return 'Memori tidak cukup untuk memproses file sebesar ini. Coba file yang lebih kecil.';
    if (err && err.userMessage) return err.userMessage;
    return 'Pemrosesan audio gagal' + (msg ? ': ' + msg : '.');
  }

  function exportClip() {
    if (!state.loaded || state.exporting) return Promise.resolve();
    var s = state.start, e = state.end;
    var res = validateRange(s, e);
    if (!res.ok) { toast(res.message, 'error'); return Promise.resolve(); }

    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('Browser ini tidak mendukung Web Audio API, jadi potongan tidak bisa dibuat.', 'error'); return Promise.resolve(); }

    var file = state.file;
    var guard = file.size > LARGE_FILE_BYTES
      ? confirmAction({
          title: 'File berukuran besar',
          message: 'File ini ' + formatBytes(file.size) + '. Mendekode seluruh audio butuh memori besar dan bisa gagal di perangkat dengan memori terbatas. Lanjutkan?',
          confirmText: 'Lanjutkan'
        })
      : Promise.resolve(true);

    return guard.then(function (ok) {
      if (!ok) return;
      var ctx = null;
      setExporting(true, 'Membaca file…');
      return readFile(file)
        .then(function (ab) {
          setExporting(true, 'Mendekode audio…');
          ctx = new AC();
          return decodeAudio(ctx, ab);
        })
        .then(function (buffer) {
          setExporting(true, 'Membuat file WAV…');
          var end = Math.min(e, buffer.duration);
          if (s >= end) { var er = new Error('Rentang di luar durasi audio yang berhasil didekode.'); er.userMessage = er.message; throw er; }
          return sliceToWav(buffer, s, end);
        })
        .then(function (r) {
          var name = clipFileName(s, e);
          var url = URL.createObjectURL(r.blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
          el.exportResult.textContent = name + ' · ' + formatBytes(r.blob.size) + ' · ' + formatPrecise(r.frames / r.sampleRate) +
            ' · WAV PCM 16-bit, ' + (r.sampleRate / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' kHz, ' + (r.channels === 1 ? 'mono' : 'stereo');
          el.exportResult.hidden = false;
          toast('Potongan audio berhasil dibuat. Unduhan dimulai.', 'success');
          scheduleHistory();
        })
        .catch(function (err) {
          console.error('Qur’anLoop export:', err);
          el.exportResult.hidden = true;
          toast(exportErrorMessage(err), 'error', 6500);
        })
        .then(function () {
          if (ctx && typeof ctx.close === 'function') { try { ctx.close(); } catch (er) { /* abaikan */ } }
          setExporting(false, '');
        });
    });
  }

  /* =====================================================================
     15. Riwayat
     ===================================================================== */
  function fileKey(file) { return file.name + '|' + file.size; }

  function findHistory(file) {
    var key = fileKey(file);
    return readList(STORAGE.history).filter(function (i) { return i.key === key; })[0] || null;
  }

  var historyDirty = false;
  function scheduleHistory() {
    if (!state.loaded) return;
    historyDirty = true;
    clearTimeout(historyTimer);
    historyTimer = setTimeout(saveHistoryNow, 600);
  }

  function flushHistory() {
    clearTimeout(historyTimer);
    if (historyDirty && state.loaded) saveHistoryNow();
  }

  function saveHistoryNow() {
    clearTimeout(historyTimer);
    historyDirty = false;
    if (!state.loaded || !state.file) return;
    var list = readList(STORAGE.history), key = fileKey(state.file);
    var data = {
      key: key, fileName: state.file.name, fileSize: state.file.size,
      lastUsed: Date.now(), start: state.start, end: state.end, mode: state.mode,
      repeats: state.repeats, label: { surah: state.label.surah, ayat: state.label.ayat, note: state.label.note }
    };
    var item = list.filter(function (i) { return i.key === key; })[0];
    if (item) Object.assign(item, data); else list.push(Object.assign({ id: uid() }, data));
    list.sort(function (a, b) { return (b.lastUsed || 0) - (a.lastUsed || 0); });
    if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
    store.set(STORAGE.history, list);
    if (state.view === 'history') renderHistory();
    renderCounts();
  }

  /* =====================================================================
     16. Favorit
     ===================================================================== */
  function openSaveDialog() {
    if (!state.loaded) return;
    var res = validateRange(state.start, state.end);
    if (!res.ok) { toast(res.message, 'error'); return; }
    var base = state.file.name.replace(/\.[^.]+$/, '');
    var suggestion = [state.label.surah, state.label.ayat ? 'ayat ' + state.label.ayat : ''].filter(Boolean).join(' ') || base;
    el.saveSummary.textContent = state.file.name + ' · ' + formatPrecise(state.start) + ' – ' + formatPrecise(state.end) + ' · ' + modeLabel(state.mode);
    el.saveName.value = suggestion.slice(0, 60);
    el.saveSurah.value = state.label.surah;
    el.saveAyat.value = state.label.ayat;
    el.saveNote.value = state.label.note;
    el.saveDialog.returnValue = '';
    openDialog(el.saveDialog);
    setTimeout(function () { el.saveName.focus(); el.saveName.select(); }, 0);
  }

  function onSaveDialogClose() {
    if (el.saveDialog.returnValue !== 'save' || !state.loaded) return;
    var name = el.saveName.value.trim();
    if (!name) return;
    var list = readList(STORAGE.favorites);
    list.unshift({
      id: uid(), name: name, fileName: state.file.name, fileSize: state.file.size,
      start: state.start, end: state.end, mode: state.mode, savedAt: Date.now(),
      label: { surah: el.saveSurah.value.trim(), ayat: el.saveAyat.value.trim(), note: el.saveNote.value.trim() }
    });
    if (list.length > MAX_FAVORITES) list.length = MAX_FAVORITES;
    if (store.set(STORAGE.favorites, list)) {
      state.label = { surah: el.saveSurah.value.trim(), ayat: el.saveAyat.value.trim(), note: el.saveNote.value.trim() };
      el.labelSurah.value = state.label.surah;
      el.labelAyat.value = state.label.ayat;
      el.labelNote.value = state.label.note;
      toast('Konfigurasi disimpan ke favorit.', 'success');
      scheduleHistory();
    }
    renderCounts();
    if (state.view === 'favorites') renderFavorites();
  }

  /* =====================================================================
     17. Daftar favorit & riwayat
     ===================================================================== */
  function entryNode(item, kind) {
    var isFav = kind === 'fav';
    var title = isFav ? (item.name || item.fileName || 'Tanpa nama') : (item.fileName || 'Tanpa nama');
    var start = Number(item.start) || 0, end = Number(item.end) || 0;
    var meta = [
      ['Rentang', formatPrecise(start) + ' – ' + formatPrecise(end)],
      ['Durasi potongan', formatPrecise(Math.max(0, end - start))],
      ['Mode', modeLabel(item.mode)]
    ];
    if (isFav) meta.push(['Disimpan', formatDate(item.savedAt)]);
    else { meta.push(['Terakhir digunakan', formatDate(item.lastUsed)]); meta.push(['Pengulangan', (Number(item.repeats) || 0) + ' kali']); }
    var lb = item.label || {};
    var labelText = [lb.surah, lb.ayat ? 'ayat ' + lb.ayat : ''].filter(Boolean).join(', ');

    return h('article', { class: 'entry', 'data-id': item.id },
      h('div', { class: 'entry-main' },
        h('h3', { class: 'entry-title', text: title }),
        isFav ? h('p', { class: 'entry-file' }, icon('music'), h('span', { text: item.fileName || '' })) : null,
        labelText ? h('p', { class: 'entry-label', text: labelText }) : null,
        h('dl', { class: 'meta-grid' }, meta.map(function (m) {
          return h('div', {}, h('dt', { text: m[0] }), h('dd', { text: m[1] }));
        })),
        lb.note ? h('p', { class: 'entry-note', text: lb.note }) : null
      ),
      h('div', { class: 'entry-actions' },
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-action': 'open' }, icon('play'), 'Buka'),
        h('button', { type: 'button', class: 'icon-btn', 'data-action': 'delete', 'aria-label': 'Hapus ' + title }, icon('trash'))
      )
    );
  }

  function renderEntries(container, emptyEl, items, kind) {
    container.replaceChildren();
    emptyEl.hidden = items.length > 0;
    items.forEach(function (i) { container.appendChild(entryNode(i, kind)); });
  }

  function renderFavorites() { renderEntries(el.favList, el.favEmpty, readList(STORAGE.favorites), 'fav'); }
  function renderHistory() { renderEntries(el.histList, el.histEmpty, readList(STORAGE.history), 'hist'); }
  function renderCounts() {
    el.favCount.textContent = String(readList(STORAGE.favorites).length);
    el.histCount.textContent = String(readList(STORAGE.history).length);
  }

  function openConfig(item, title) {
    var cfg = {
      title: title, fileName: item.fileName || '', fileSize: item.fileSize,
      start: item.start, end: item.end, mode: item.mode, label: item.label
    };
    showView('player');
    if (state.loaded && state.file.name === cfg.fileName) {
      var adjusted = applyConfig(cfg);
      renderAll();
      scheduleHistory();
      toast(adjusted ? 'Konfigurasi diterapkan dan disesuaikan dengan durasi audio.' : 'Konfigurasi diterapkan.', 'success');
      return;
    }
    state.pending = cfg;
    renderPending();
    toast('Pilih file “' + cfg.fileName + '” untuk melanjutkan.', 'info', 5000);
    el.pendingPick.focus();
  }

  function bindList(container, key, kind) {
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var id = btn.closest('.entry').dataset.id;
      var list = readList(key);
      var item = list.filter(function (i) { return i.id === id; })[0];
      if (!item) return;
      if (btn.dataset.action === 'open') {
        openConfig(item, kind === 'fav' ? (item.name || item.fileName) : item.fileName);
      } else if (btn.dataset.action === 'delete') {
        store.set(key, list.filter(function (i) { return i.id !== id; }));
        if (kind === 'fav') renderFavorites(); else renderHistory();
        renderCounts();
        toast(kind === 'fav' ? 'Favorit dihapus.' : 'Item riwayat dihapus.', 'info');
      }
    });
  }

  function clearAll(kind) {
    var isFav = kind === 'favorites';
    var key = isFav ? STORAGE.favorites : STORAGE.history;
    var count = readList(key).length;
    if (!count) { toast(isFav ? 'Belum ada favorit untuk dihapus.' : 'Riwayat sudah kosong.', 'info'); return; }
    confirmAction({
      title: isFav ? 'Hapus semua favorit?' : 'Hapus seluruh riwayat?',
      message: count + ' item akan dihapus dari perangkat ini. Tindakan ini tidak dapat dibatalkan.',
      confirmText: 'Hapus semua'
    }).then(function (ok) {
      if (!ok) return;
      store.set(key, []);
      historyDirty = false;
      renderFavorites(); renderHistory(); renderCounts();
      toast(isFav ? 'Semua favorit dihapus.' : 'Seluruh riwayat dihapus.', 'success');
    });
  }

  /* =====================================================================
     18. Event binding
     ===================================================================== */
  function bindEvents() {
    // Audio
    audio.addEventListener('loadedmetadata', onMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', function () { setPlayingUI(true); startTicker(); });
    audio.addEventListener('pause', function () { setPlayingUI(false); stopTicker(); renderProgress(); scheduleHistory(); });
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onAudioError);
    audio.addEventListener('volumechange', onVolumeChange);
    audio.addEventListener('seeking', function () { loop.prevT = null; });

    // Tema
    el.themeToggle.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });

    // Navigasi
    $$('.rail-btn').forEach(function (b) { b.addEventListener('click', function () { showView(b.dataset.view); }); });

    // Upload
    el.pickBtn.addEventListener('click', function () { el.fileInput.click(); });
    el.replaceBtn.addEventListener('click', function () { el.fileInput.click(); });
    el.pendingPick.addEventListener('click', function () { el.fileInput.click(); });
    el.pendingCancel.addEventListener('click', function () { state.pending = null; renderPending(); });
    el.removeBtn.addEventListener('click', removeFile);
    el.fileInput.addEventListener('change', function () {
      var f = el.fileInput.files && el.fileInput.files[0];
      el.fileInput.value = '';
      if (f) loadFile(f);
    });

    var dragDepth = 0;
    el.uploadCard.addEventListener('dragenter', function (e) { e.preventDefault(); dragDepth++; el.uploadCard.classList.add('is-dragover'); });
    el.uploadCard.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    el.uploadCard.addEventListener('dragleave', function () { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) el.uploadCard.classList.remove('is-dragover'); });
    el.uploadCard.addEventListener('drop', function (e) {
      e.preventDefault();
      dragDepth = 0;
      el.uploadCard.classList.remove('is-dragover');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      if (files.length > 1) toast('Hanya file pertama yang dipakai.', 'info');
      loadFile(files[0]);
    });
    // Cegah browser membuka file yang dilepas di luar area upload.
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });

    // Transport
    el.playBtn.addEventListener('click', togglePlay);
    el.backBtn.addEventListener('click', function () { seekTo(audio.currentTime - SEEK_STEP); });
    el.fwdBtn.addEventListener('click', function () { seekTo(audio.currentTime + SEEK_STEP); });
    el.muteBtn.addEventListener('click', function () {
      if (audio.muted || audio.volume === 0) {
        audio.muted = false;
        if (audio.volume === 0) audio.volume = 0.5;
      } else audio.muted = true;
    });
    volumeSliders.forEach(function (s) {
      s.addEventListener('input', function () {
        var v = clamp(parseFloat(s.value), 0, 1);
        audio.muted = v === 0;
        audio.volume = v;
        if (v > 0) { settings.volume = v; saveSettings(); }
      });
    });

    // Mode loop
    loopRadios.forEach(function (r) { r.addEventListener('change', function () { if (r.checked) setMode(r.value); }); });

    // Input waktu
    el.startInput.addEventListener('change', function () { commitTimeInput('start'); });
    el.endInput.addEventListener('change', function () { commitTimeInput('end'); });
    el.startMinus.addEventListener('click', function () { nudge('start', -FINE_STEP); });
    el.startPlus.addEventListener('click', function () { nudge('start', FINE_STEP); });
    el.endMinus.addEventListener('click', function () { nudge('end', -FINE_STEP); });
    el.endPlus.addEventListener('click', function () { nudge('end', FINE_STEP); });
    el.useStart.addEventListener('click', useCurrentAsStart);
    el.useEnd.addEventListener('click', useCurrentAsEnd);
    el.resetRange.addEventListener('click', resetRange);
    $$('[data-preset]').forEach(function (b) { b.addEventListener('click', function () { applyPreset(Number(b.dataset.preset)); }); });

    // Counter
    el.counterReset.addEventListener('click', resetCounter);
    el.setResetCounter.addEventListener('click', resetCounter);

    // Label sesi
    [['surah', el.labelSurah], ['ayat', el.labelAyat], ['note', el.labelNote]].forEach(function (p) {
      p[1].addEventListener('input', function () { state.label[p[0]] = p[1].value; scheduleHistory(); });
    });

    // Ekspor, favorit
    el.exportBtn.addEventListener('click', exportClip);
    el.saveFav.addEventListener('click', openSaveDialog);
    el.saveDialog.addEventListener('close', onSaveDialogClose);

    // Daftar & pengaturan
    bindList(el.favList, STORAGE.favorites, 'fav');
    bindList(el.histList, STORAGE.history, 'hist');
    $$('[data-action="clear-history"]').forEach(function (b) { b.addEventListener('click', function () { clearAll('history'); }); });
    $$('[data-action="clear-favorites"]').forEach(function (b) { b.addEventListener('click', function () { clearAll('favorites'); }); });
    el.setDefaultMode.addEventListener('change', function () {
      if (!isMode(el.setDefaultMode.value)) return;
      settings.defaultMode = el.setDefaultMode.value;
      if (saveSettings()) toast('Pengaturan disimpan.', 'success');
    });

    // Pintasan: Spasi = putar/jeda (hanya bila fokus tidak di kontrol lain)
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'Space' || e.target !== document.body || e.ctrlKey || e.metaKey || e.altKey) return;
      if (state.view !== 'player' || !state.loaded || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      togglePlay();
    });

    // Simpan riwayat saat halaman disembunyikan/ditutup
    document.addEventListener('visibilitychange', function () { if (document.hidden) flushHistory(); });
    window.addEventListener('pagehide', flushHistory);

    bindTimeline();
  }

  /* =====================================================================
     19. Inisialisasi
     ===================================================================== */
  function buildWave() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 36; i++) {
      var hgt = 18 + Math.round(Math.abs(Math.sin(i * 0.55) * 0.6 + Math.sin(i * 1.7) * 0.4) * 78);
      var s = document.createElement('span');
      s.style.setProperty('--h', hgt + '%');
      s.style.setProperty('--d', (-(i % 12) * 0.11).toFixed(2) + 's');
      frag.appendChild(s);
    }
    el.heroWave.appendChild(frag);
  }

  function init() {
    buildWave();
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
    audio.volume = settings.volume;
    el.setDefaultMode.value = settings.defaultMode;
    onVolumeChange();
    setLoadedUI(false);
    bindEvents();
    renderAll();
    renderCounts();
    showView('player');
  }

  init();
})();
