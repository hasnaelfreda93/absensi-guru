/* ============================================================
   ABSENSI GURU — SDI ASSURYANIYAH BEKASI
   Aplikasi satu halaman (SPA) tanpa framework, offline-first.
   ============================================================
   Struktur berkas:
     1.  KONSTANTA          — daftar status, nama hari/bulan, warna
     2.  UTIL               — bantuan tanggal, teks, angka, CSV
     3.  STORE              — pembacaan & penyimpanan localStorage
     4.  UI                 — toast, modal konfirmasi, riak, animasi
     5.  ROUTER             — perpindahan halaman yang mulus
     6.  HAL. DASHBOARD     — ringkasan hari ini & bulan ini
     7.  HAL. ABSENSI       — form, absen cepat, riwayat, filter
     8.  HAL. DATA GURU     — CRUD guru & tenaga kependidikan
     9.  HAL. REKAP         — rekapitulasi bulanan, ekspor, cetak
     10. HAL. PENGATURAN    — identitas, jam kerja, cadangan data
     11. INIT               — perakitan seluruh modul
   ============================================================ */
'use strict';

/* ===== 1. KONSTANTA ======================================== */

const STATUS = [
  { key: 'Hadir',      badge: 'b-hadir',     color: '#10b981', kode: 'H'  },
  { key: 'Terlambat',  badge: 'b-terlambat', color: '#f59e0b', kode: 'T'  },
  { key: 'Izin',       badge: 'b-izin',      color: '#2563eb', kode: 'I'  },
  { key: 'Sakit',      badge: 'b-sakit',     color: '#8b5cf6', kode: 'S'  },
  { key: 'Dinas Luar', badge: 'b-dinas',     color: '#06b6d4', kode: 'DL' },
  { key: 'Cuti',       badge: 'b-cuti',      color: '#64748b', kode: 'C'  },
  { key: 'Alpa',       badge: 'b-alpa',      color: '#ef4444', kode: 'A'  },
];

/** Status yang dihitung sebagai kehadiran efektif. */
const STATUS_HADIR = ['Hadir', 'Terlambat', 'Dinas Luar'];

/** Status pada panel Absen Cepat. */
const STATUS_CEPAT = ['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Dinas Luar', 'Alpa'];

const HARI  = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
               'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const statusMeta = key => STATUS.find(s => s.key === key) || STATUS[0];

/* ===== 2. UTIL ============================================= */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Tanggal lokal dalam format YYYY-MM-DD (tanpa pergeseran zona waktu). */
function isoDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Bulan lokal dalam format YYYY-MM. */
const isoMonth = (d = new Date()) => isoDate(d).slice(0, 7);

/** "2026-07-30" → "Kamis, 30 Juli 2026" */
function tanggalPanjang(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${HARI[dt.getDay()]}, ${d} ${BULAN[m - 1]} ${y}`;
}

/** "2026-07-30" → "30/07/2026" */
function tanggalPendek(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "2026-07" → "Juli 2026" */
function bulanPanjang(ym) {
  if (!ym) return '—';
  const [y, m] = ym.split('-').map(Number);
  return `${BULAN[m - 1]} ${y}`;
}

const hariDari = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

const uid = () => 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const inisial = nama => String(nama || '?').trim().split(/\s+/)
  .filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

/** Bandingkan dua jam "HH:MM"; true bila a lebih besar dari b. */
const jamLebih = (a, b) => !!a && !!b && a > b;

const jamSekarang = () => new Date().toTimeString().slice(0, 5);

/** Unduh berkas dari string di sisi klien. */
function unduh(namaFile, isi, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([isi], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: namaFile });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Susun CSV ber-BOM dengan pemisah ";" agar rapi di Excel Indonesia. */
function buatCSV(header, baris) {
  const sel = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...baris].map(r => r.map(sel).join(';')).join('\r\n');
}

/* ===== 3. STORE ============================================ */

const Store = {
  KEY_GURU: 'ag_guru_v1',
  KEY_ABSEN: 'ag_absen_v1',
  KEY_SET: 'ag_setting_v1',

  SETTING_DEFAULT: {
    namaSekolah: 'SDI ASSURYANIYAH BEKASI',
    npsn: '',
    tahunAjaran: '2026/2027',
    semester: 'Ganjil',
    jamMasuk: '07:00',
    jamKeluar: '15:00',
    kepsek: '',
    operator: '',
    hariKerja: [1, 2, 3, 4, 5, 6], // Senin–Sabtu
  },

  guru: [],
  absen: [],
  setting: {},

  muat() {
    this.guru    = this._baca(this.KEY_GURU, []);
    this.absen   = this._baca(this.KEY_ABSEN, []);
    this.setting = { ...this.SETTING_DEFAULT, ...this._baca(this.KEY_SET, {}) };
  },

  _baca(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  _tulis(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch {
      UI.toast('Penyimpanan peramban penuh. Unduh cadangan lalu hapus sebagian data.', 'err');
      return false;
    }
  },

  simpanGuru()    { this._tulis(this.KEY_GURU, this.guru); },
  simpanAbsen()   { this._tulis(this.KEY_ABSEN, this.absen); },
  simpanSetting() { this._tulis(this.KEY_SET, this.setting); },

  cariGuru(id) { return this.guru.find(g => g.id === id) || null; },
  namaGuru(id) { return this.cariGuru(id)?.nama || '(guru terhapus)'; },

  /** Catatan absensi seorang guru pada tanggal tertentu. */
  absenPada(guruId, tanggal) {
    return this.absen.find(a => a.guruId === guruId && a.tanggal === tanggal) || null;
  },

  /** Absensi terurut: tanggal terbaru lebih dahulu. */
  absenTerurut() {
    return [...this.absen].sort((a, b) =>
      b.tanggal.localeCompare(a.tanggal) || (b.ts || 0) - (a.ts || 0));
  },

  ukuran() {
    const n = [this.KEY_GURU, this.KEY_ABSEN, this.KEY_SET]
      .reduce((t, k) => t + (localStorage.getItem(k) || '').length, 0);
    return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
  },
};

/* ===== 4. UI =============================================== */

const UI = {
  /* --- Notifikasi ringan --- */
  toast(pesan, tipe = 'info', durasi = 3200) {
    const ikon = { ok: 'fa-circle-check', err: 'fa-circle-exclamation',
                   warn: 'fa-triangle-exclamation', info: 'fa-circle-info' }[tipe] || 'fa-circle-info';
    const el = document.createElement('div');
    el.className = `toast ${tipe}`;
    el.innerHTML = `<i class="fa-solid ${ikon}"></i><span>${esc(pesan)}</span>`;
    $('#toastHost').appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, durasi);
  },

  /* --- Modal konfirmasi berbasis Promise --- */
  konfirmasi(judul, teks, labelYa = 'Ya, Lanjutkan') {
    return new Promise(resolve => {
      const modal = $('#confirmModal');
      $('#cfTitle').textContent = judul;
      $('#cfText').textContent = teks;
      $('#cfYes').textContent = labelYa;
      modal.hidden = false;

      const tutup = hasil => {
        modal.hidden = true;
        $('#cfYes').onclick = $('#cfNo').onclick = modal.onclick = null;
        document.removeEventListener('keydown', onEsc);
        resolve(hasil);
      };
      const onEsc = e => { if (e.key === 'Escape') tutup(false); };

      $('#cfYes').onclick = () => tutup(true);
      $('#cfNo').onclick = () => tutup(false);
      modal.onclick = e => { if (e.target === modal) tutup(false); };
      document.addEventListener('keydown', onEsc);
      $('#cfYes').focus();
    });
  },

  /* --- Efek riak pada setiap tombol --- */
  pasangRiak() {
    document.addEventListener('pointerdown', e => {
      const btn = e.target.closest('.btn');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const d = Math.max(r.width, r.height);
      const s = document.createElement('span');
      s.className = 'ripple';
      s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
      btn.appendChild(s);
      s.addEventListener('animationend', () => s.remove(), { once: true });
    });
  },

  /* --- Angka yang berhitung naik secara mulus --- */
  hitungAngka(el, tujuan, { durasi = 750, suffix = '' } = {}) {
    if (!el) return;
    const awal = parseFloat(String(el.textContent).replace(/[^\d.-]/g, '')) || 0;
    if (awal === tujuan) { el.textContent = tujuan + suffix; return; }
    const mulai = performance.now();
    const langkah = now => {
      const t = Math.min(1, (now - mulai) / durasi);
      const e = 1 - Math.pow(1 - t, 3);                 // easeOutCubic
      el.textContent = Math.round(awal + (tujuan - awal) * e) + suffix;
      if (t < 1) requestAnimationFrame(langkah);
    };
    requestAnimationFrame(langkah);
  },

  /* --- Muncul bertahap saat digulir --- */
  pasangReveal() {
    if (!('IntersectionObserver' in window)) return;
    this.observer = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('shown');
          this.observer.unobserve(en.target);
        }
      });
    }, { threshold: .08, rootMargin: '0px 0px -40px' });
    this.amatiReveal();
  },

  amatiReveal() {
    if (!this.observer) return;
    $$('.page.active .card, .page.active .stat-card').forEach((el, i) => {
      if (el.dataset.revealed) return;
      el.dataset.revealed = '1';
      el.classList.add('reveal');
      el.style.transitionDelay = `${Math.min(i * 55, 420)}ms`;
      this.observer.observe(el);
    });
  },

  /** Beri jeda animasi bertahap pada baris tabel yang baru digambar. */
  bertahap(root, selector = 'tr') {
    $$(selector, root).forEach((el, i) => {
      el.classList.add('anim-row');
      el.style.animationDelay = `${Math.min(i * 28, 400)}ms`;
    });
  },

  /* --- Jam berjalan di kepala halaman --- */
  jalankanJam() {
    const el = $('#liveClock');
    const tik = () => { el.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false }); };
    tik();
    setInterval(tik, 1000);
  },

  /** Isi <select> dengan daftar {value,label} sambil menjaga pilihan lama. */
  isiSelect(sel, items, placeholder) {
    const lama = sel.value;
    sel.innerHTML = (placeholder ? `<option value="">${esc(placeholder)}</option>` : '') +
      items.map(i => `<option value="${esc(i.value)}">${esc(i.label)}</option>`).join('');
    if (items.some(i => i.value === lama)) sel.value = lama;
  },

  kosong(kolom, judul, pesan, ikon = 'fa-inbox') {
    return `<tr><td colspan="${kolom}"><div class="empty">
      <i class="fa-solid ${ikon}"></i><strong>${esc(judul)}</strong>${esc(pesan)}</div></td></tr>`;
  },
};

/* ===== 5. ROUTER =========================================== */

const Router = {
  halaman: 'dashboard',

  init() {
    // Menu utama
    $$('.nav-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        this.buka(a.dataset.page);
        $('#navMenu').classList.remove('open');
      });
    });

    // Tombol lain yang membawa ke halaman tertentu
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-goto]');
      if (!t) return;
      e.preventDefault();
      this.buka(t.dataset.goto);
    });

    // Tombol menu pada layar kecil
    $('#navToggle').addEventListener('click', () => $('#navMenu').classList.toggle('open'));

    // Dukungan tombol kembali peramban
    window.addEventListener('hashchange', () => this.dariHash());
    this.dariHash(false);
  },

  dariHash(gulir = true) {
    const h = location.hash.replace('#', '');
    if (h && $(`#page-${h}`)) this.buka(h, gulir);
    else this.buka('dashboard', false);
  },

  buka(nama, gulir = true) {
    const target = $(`#page-${nama}`);
    if (!target) return;
    this.halaman = nama;

    $$('.page').forEach(p => p.classList.remove('active'));
    target.classList.add('active');
    $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.page === nama));

    if (location.hash !== `#${nama}`) history.replaceState(null, '', `#${nama}`);
    if (gulir) window.scrollTo({ top: 0, behavior: 'smooth' });

    // Segarkan isi halaman yang dibuka
    ({ dashboard: Dashboard, absensi: Absensi, guru: Guru, rekap: Rekap, pengaturan: Pengaturan }[nama])?.render();
    UI.amatiReveal();
  },
};

/* ===== 6. HALAMAN DASHBOARD ================================ */

const Dashboard = {
  render() {
    const hariIni = isoDate();
    const bulanIni = isoMonth();

    // Tanggal besar pada hero
    const now = new Date();
    $('#heroDay').textContent   = HARI[now.getDay()];
    $('#heroDate').textContent  = now.getDate();
    $('#heroMonth').textContent = `${BULAN[now.getMonth()]} ${now.getFullYear()}`;
    $('#todayLabel').textContent = `— ${tanggalPanjang(hariIni)}`;
    $('#dashMonthLabel').textContent = bulanPanjang(bulanIni);

    // Kartu statistik hari ini
    const hari = Store.absen.filter(a => a.tanggal === hariIni);
    const n = k => hari.filter(a => a.status === k).length;
    const belum = Math.max(0, Store.guru.length - new Set(hari.map(a => a.guruId)).size);

    UI.hitungAngka($('#stTotalGuru'), Store.guru.length);
    UI.hitungAngka($('#stHadir'), n('Hadir'));
    UI.hitungAngka($('#stTelat'), n('Terlambat'));
    UI.hitungAngka($('#stIzin'), n('Izin') + n('Sakit'));
    UI.hitungAngka($('#stDinas'), n('Dinas Luar'));
    UI.hitungAngka($('#stAlpa'), belum);

    this.renderCincin(bulanIni);
    this.renderTerakhir();
  },

  /** Cincin persentase kehadiran bulan berjalan + rincian per status. */
  renderCincin(bulan) {
    const data = Store.absen.filter(a => a.tanggal.startsWith(bulan));
    const total = data.length;
    const hadir = data.filter(a => STATUS_HADIR.includes(a.status)).length;
    const pct = total ? Math.round((hadir / total) * 100) : 0;

    // requestAnimationFrame agar transisi --pct tetap terlihat
    requestAnimationFrame(() => { $('#attRing').style.setProperty('--pct', pct); });
    UI.hitungAngka($('#attPct'), pct, { suffix: '%' });

    $('#monthLegend').innerHTML = total
      ? STATUS.map(s => {
          const c = data.filter(a => a.status === s.key).length;
          return `<li><span class="dot" style="background:${s.color}"></span>
            <span class="lg-name">${s.key}</span>
            <span class="lg-val">${c}</span></li>`;
        }).join('')
      : `<li><span class="lg-name">Belum ada catatan pada ${esc(bulanPanjang(bulan))}.</span></li>`;
  },

  renderTerakhir() {
    const body = $('#recentBody');
    const data = Store.absenTerurut().slice(0, 8);

    body.innerHTML = data.length
      ? data.map(a => {
          const m = statusMeta(a.status);
          return `<tr>
            <td>${tanggalPendek(a.tanggal)}</td>
            <td class="nm">${esc(Store.namaGuru(a.guruId))}</td>
            <td><span class="badge ${m.badge}">${esc(a.status)}</span></td>
            <td>${esc(a.masuk || '—')}</td>
          </tr>`;
        }).join('')
      : UI.kosong(4, 'Belum ada absensi', 'Mulai dari menu Absensi Harian.', 'fa-clipboard');

    UI.bertahap(body);
  },
};

/* ===== 7. HALAMAN ABSENSI ================================== */

const Absensi = {
  init() {
    // Isi pilihan status pada filter
    UI.isiSelect($('#fltStatus'), STATUS.map(s => ({ value: s.key, label: s.key })), 'Semua status');

    $('#absTanggal').value = isoDate();

    // Deteksi keterlambatan otomatis saat jam masuk diisi
    $('#absMasuk').addEventListener('change', () => this.deteksiTerlambat());
    $('#absTanggal').addEventListener('change', () => this.renderCepat());

    $('#formAbsensi').addEventListener('submit', e => { e.preventDefault(); this.simpan(); });
    $('#absReset').addEventListener('click', () => this.resetForm());
    $('#absNow').addEventListener('click', () => {
      $('#absMasuk').value = jamSekarang();
      this.deteksiTerlambat();
      UI.toast(`Jam masuk diisi ${jamSekarang()}.`, 'info');
    });

    // Filter riwayat
    ['#fltCari', '#fltDari', '#fltSampai', '#fltStatus'].forEach(s =>
      $(s).addEventListener('input', () => this.renderRiwayat()));
    $('#fltReset').addEventListener('click', () => {
      ['#fltCari', '#fltDari', '#fltSampai', '#fltStatus'].forEach(s => { $(s).value = ''; });
      this.renderRiwayat();
      UI.toast('Filter dibersihkan.', 'info');
    });

    $('#absExport').addEventListener('click', () => this.ekspor());
    $('#absClearFiltered').addEventListener('click', () => this.hapusTerfilter());

    // Aksi pada tabel riwayat (delegasi peristiwa)
    $('#absBody').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'edit') this.muatKeForm(btn.dataset.id);
      if (btn.dataset.act === 'del') this.hapus(btn.dataset.id);
    });

    // Aksi pada panel absen cepat
    $('#quickList').addEventListener('click', e => {
      const btn = e.target.closest('.qbtn');
      if (btn) this.absenCepat(btn.dataset.guru, btn.dataset.status);
    });
  },

  render() {
    UI.isiSelect($('#absGuru'),
      Store.guru.map(g => ({ value: g.id, label: `${g.nama}${g.jabatan ? ' — ' + g.jabatan : ''}` })),
      '— Pilih Guru —');
    $('#hintJam').textContent = Store.setting.jamMasuk;
    if (!$('#absTanggal').value) $('#absTanggal').value = isoDate();
    this.renderCepat();
    this.renderRiwayat();
  },

  deteksiTerlambat() {
    const masuk = $('#absMasuk').value;
    const sel = $('#absStatus');
    if (!masuk) return;
    if (jamLebih(masuk, Store.setting.jamMasuk)) {
      if (sel.value === 'Hadir') sel.value = 'Terlambat';
    } else if (sel.value === 'Terlambat') {
      sel.value = 'Hadir';
    }
  },

  /* --- Simpan / ubah --- */
  simpan() {
    const id = $('#absId').value;
    const rec = {
      tanggal: $('#absTanggal').value,
      guruId: $('#absGuru').value,
      status: $('#absStatus').value,
      masuk: $('#absMasuk').value,
      keluar: $('#absKeluar').value,
      keterangan: $('#absKeterangan').value.trim(),
    };

    if (!rec.tanggal || !rec.guruId) {
      UI.toast('Tanggal dan nama guru wajib diisi.', 'err');
      return;
    }
    if (rec.keluar && rec.masuk && rec.keluar < rec.masuk) {
      UI.toast('Jam keluar tidak boleh lebih awal dari jam masuk.', 'err');
      return;
    }

    const ganda = Store.absenPada(rec.guruId, rec.tanggal);
    if (ganda && ganda.id !== id) {
      // Satu guru satu catatan per tanggal → perbarui catatan yang ada
      Object.assign(ganda, rec, { ts: Date.now() });
      Store.simpanAbsen();
      UI.toast(`Absensi ${Store.namaGuru(rec.guruId)} pada ${tanggalPendek(rec.tanggal)} diperbarui.`, 'warn');
    } else if (id) {
      const lama = Store.absen.find(a => a.id === id);
      Object.assign(lama, rec, { ts: Date.now() });
      Store.simpanAbsen();
      UI.toast('Perubahan absensi tersimpan.', 'ok');
    } else {
      Store.absen.push({ id: uid(), ...rec, ts: Date.now() });
      Store.simpanAbsen();
      UI.toast(`Absensi ${Store.namaGuru(rec.guruId)} tersimpan.`, 'ok');
    }

    this.resetForm();
    this.render();
    Dashboard.render();
    Pengaturan.renderStat();
  },

  absenCepat(guruId, status) {
    const tanggal = $('#absTanggal').value || isoDate();
    const masuk = STATUS_HADIR.includes(status) && status !== 'Dinas Luar' ? jamSekarang() : '';
    Store.absen.push({
      id: uid(), tanggal, guruId, status, masuk, keluar: '', keterangan: '', ts: Date.now(),
    });
    Store.simpanAbsen();
    UI.toast(`${Store.namaGuru(guruId)} → ${status}`, 'ok', 2200);
    this.renderCepat();
    this.renderRiwayat();
    Dashboard.render();
    Pengaturan.renderStat();
  },

  muatKeForm(id) {
    const a = Store.absen.find(x => x.id === id);
    if (!a) return;
    $('#absId').value = a.id;
    $('#absTanggal').value = a.tanggal;
    $('#absGuru').value = a.guruId;
    $('#absStatus').value = a.status;
    $('#absMasuk').value = a.masuk || '';
    $('#absKeluar').value = a.keluar || '';
    $('#absKeterangan').value = a.keterangan || '';
    $('#absSubmitLabel').textContent = 'Perbarui Absensi';
    $('#formAbsensi').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#formAbsensi').closest('.card').classList.add('flash');
    setTimeout(() => $('#formAbsensi').closest('.card').classList.remove('flash'), 1300);
  },

  resetForm() {
    $('#formAbsensi').reset();
    $('#absId').value = '';
    $('#absTanggal').value = isoDate();
    $('#absSubmitLabel').textContent = 'Simpan Absensi';
  },

  async hapus(id) {
    const a = Store.absen.find(x => x.id === id);
    if (!a) return;
    const ok = await UI.konfirmasi('Hapus Absensi',
      `Hapus catatan ${Store.namaGuru(a.guruId)} tanggal ${tanggalPendek(a.tanggal)}?`, 'Ya, Hapus');
    if (!ok) return;
    Store.absen = Store.absen.filter(x => x.id !== id);
    Store.simpanAbsen();
    UI.toast('Catatan absensi dihapus.', 'ok');
    this.render();
    Dashboard.render();
    Pengaturan.renderStat();
  },

  /* --- Absen cepat: guru yang belum tercatat --- */
  renderCepat() {
    const tanggal = $('#absTanggal').value || isoDate();
    $('#quickDateLabel').textContent = tanggalPanjang(tanggal);
    $('#quickDate2').textContent = tanggalPanjang(tanggal);

    const belum = Store.guru.filter(g => !Store.absenPada(g.id, tanggal));
    $('#quickCount').textContent = `${belum.length} belum absen`;

    const host = $('#quickList');
    if (!Store.guru.length) {
      host.innerHTML = `<div class="empty"><i class="fa-solid fa-user-plus"></i>
        <strong>Data guru masih kosong</strong>Tambahkan guru terlebih dahulu pada menu Data Guru.</div>`;
      return;
    }
    if (!belum.length) {
      host.innerHTML = `<div class="empty"><i class="fa-solid fa-circle-check" style="color:#10b981"></i>
        <strong>Absensi lengkap</strong>Seluruh guru sudah tercatat pada tanggal ini.</div>`;
      return;
    }

    host.innerHTML = belum.map((g, i) => `
      <div class="quick-item anim-row" style="animation-delay:${Math.min(i * 30, 400)}ms">
        <div class="qi-avatar">${esc(inisial(g.nama))}</div>
        <div class="qi-info">
          <div class="qi-name">${esc(g.nama)}</div>
          <div class="qi-role">${esc(g.jabatan || '—')}${g.mapel ? ' • ' + esc(g.mapel) : ''}</div>
        </div>
        <div class="qi-btns">
          ${STATUS_CEPAT.map(s =>
            `<button class="qbtn" data-status="${esc(s)}" data-guru="${g.id}">${esc(s)}</button>`).join('')}
        </div>
      </div>`).join('');
  },

  /* --- Riwayat + filter --- */
  terfilter() {
    const q = $('#fltCari').value.trim().toLowerCase();
    const dari = $('#fltDari').value;
    const sampai = $('#fltSampai').value;
    const st = $('#fltStatus').value;

    return Store.absenTerurut().filter(a => {
      if (dari && a.tanggal < dari) return false;
      if (sampai && a.tanggal > sampai) return false;
      if (st && a.status !== st) return false;
      if (q) {
        const g = Store.cariGuru(a.guruId);
        const hay = [Store.namaGuru(a.guruId), a.keterangan, g?.jabatan, g?.mapel, g?.nip]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },

  renderRiwayat() {
    const data = this.terfilter();
    const body = $('#absBody');
    $('#absCount').textContent = `${data.length} dari ${Store.absen.length} catatan`;

    body.innerHTML = data.length
      ? data.map(a => {
          const g = Store.cariGuru(a.guruId);
          const m = statusMeta(a.status);
          return `<tr>
            <td><span class="nm">${tanggalPendek(a.tanggal)}</span>
                <span class="sub">${HARI[hariDari(a.tanggal)]}</span></td>
            <td><span class="nm">${esc(Store.namaGuru(a.guruId))}</span>
                ${g?.nip ? `<span class="sub">NIP ${esc(g.nip)}</span>` : ''}</td>
            <td>${esc(g?.jabatan || '—')}</td>
            <td><span class="badge ${m.badge}">${esc(a.status)}</span></td>
            <td>${esc(a.masuk || '—')}</td>
            <td>${esc(a.keluar || '—')}</td>
            <td>${esc(a.keterangan || '—')}</td>
            <td><div class="act-row">
              <button class="icon-btn ib-edit" data-act="edit" data-id="${a.id}" title="Ubah"><i class="fa-solid fa-pen"></i></button>
              <button class="icon-btn ib-del" data-act="del" data-id="${a.id}" title="Hapus"><i class="fa-solid fa-trash"></i></button>
            </div></td>
          </tr>`;
        }).join('')
      : UI.kosong(8, 'Tidak ada catatan', 'Sesuaikan filter atau catat absensi baru.', 'fa-clipboard-list');

    UI.bertahap(body);
  },

  ekspor() {
    const data = this.terfilter();
    if (!data.length) { UI.toast('Tidak ada data untuk diekspor.', 'warn'); return; }
    const baris = data.map(a => {
      const g = Store.cariGuru(a.guruId);
      return [a.tanggal, HARI[hariDari(a.tanggal)], Store.namaGuru(a.guruId), g?.nip || '',
              g?.jabatan || '', g?.mapel || '', a.status, a.masuk || '', a.keluar || '', a.keterangan || ''];
    });
    unduh(`absensi-guru-sdi-assuryaniyah-${isoDate()}.csv`,
      buatCSV(['Tanggal', 'Hari', 'Nama Guru', 'NIP/NIY', 'Jabatan', 'Mapel/Bidang',
               'Status', 'Jam Masuk', 'Jam Keluar', 'Keterangan'], baris),
      'text/csv;charset=utf-8');
    UI.toast(`${data.length} catatan diekspor ke CSV.`, 'ok');
  },

  async hapusTerfilter() {
    const data = this.terfilter();
    if (!data.length) { UI.toast('Tidak ada data terfilter.', 'warn'); return; }
    const ok = await UI.konfirmasi('Hapus Data Terfilter',
      `${data.length} catatan absensi akan dihapus permanen. Lanjutkan?`, 'Ya, Hapus Semua');
    if (!ok) return;
    const buang = new Set(data.map(a => a.id));
    Store.absen = Store.absen.filter(a => !buang.has(a.id));
    Store.simpanAbsen();
    UI.toast(`${buang.size} catatan dihapus.`, 'ok');
    this.render();
    Dashboard.render();
    Pengaturan.renderStat();
  },
};

/* ===== 8. HALAMAN DATA GURU ================================ */

const Guru = {
  init() {
    $('#formGuru').addEventListener('submit', e => { e.preventDefault(); this.simpan(); });
    $('#guruReset').addEventListener('click', () => this.resetForm());
    $('#guruCari').addEventListener('input', () => this.renderTabel());
    $('#guruExport').addEventListener('click', () => this.ekspor());

    $('#guruBody').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'edit') this.muatKeForm(btn.dataset.id);
      if (btn.dataset.act === 'del') this.hapus(btn.dataset.id);
    });
  },

  render() { this.renderTabel(); },

  ambilForm() {
    return {
      nama: $('#guruNama').value.trim(),
      nip: $('#guruNip').value.trim(),
      nuptk: $('#guruNuptk').value.trim(),
      jk: $('#guruJk').value,
      jabatan: $('#guruJabatan').value,
      mapel: $('#guruMapel').value.trim(),
      kelas: $('#guruKelas').value,
      statusPeg: $('#guruStatusPeg').value,
      hp: $('#guruHp').value.trim(),
    };
  },

  simpan() {
    const id = $('#guruId').value;
    const rec = this.ambilForm();
    if (!rec.nama) { UI.toast('Nama guru wajib diisi.', 'err'); return; }

    const kembar = Store.guru.find(g =>
      g.id !== id && g.nama.toLowerCase() === rec.nama.toLowerCase());
    if (kembar) { UI.toast(`Nama "${rec.nama}" sudah terdaftar.`, 'err'); return; }

    if (id) {
      Object.assign(Store.guru.find(g => g.id === id), rec);
      UI.toast('Data guru diperbarui.', 'ok');
    } else {
      Store.guru.push({ id: uid(), ...rec, ts: Date.now() });
      UI.toast(`${rec.nama} ditambahkan.`, 'ok');
    }
    Store.simpanGuru();
    this.resetForm();
    this.renderTabel();
    Absensi.render();
    Rekap.render();
    Dashboard.render();
    Pengaturan.renderStat();
  },

  muatKeForm(id) {
    const g = Store.cariGuru(id);
    if (!g) return;
    $('#guruId').value = g.id;
    $('#guruNama').value = g.nama || '';
    $('#guruNip').value = g.nip || '';
    $('#guruNuptk').value = g.nuptk || '';
    $('#guruJk').value = g.jk || 'Laki-laki';
    $('#guruJabatan').value = g.jabatan || 'Guru Kelas';
    $('#guruMapel').value = g.mapel || '';
    $('#guruKelas').value = g.kelas || '';
    $('#guruStatusPeg').value = g.statusPeg || 'GTY';
    $('#guruHp').value = g.hp || '';
    $('#guruSubmitLabel').textContent = 'Perbarui Guru';
    $('#formGuru').scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  resetForm() {
    $('#formGuru').reset();
    $('#guruId').value = '';
    $('#guruSubmitLabel').textContent = 'Simpan Guru';
  },

  async hapus(id) {
    const g = Store.cariGuru(id);
    if (!g) return;
    const jml = Store.absen.filter(a => a.guruId === id).length;
    const ok = await UI.konfirmasi('Hapus Guru',
      `Hapus ${g.nama}?${jml ? ` ${jml} catatan absensinya juga akan dihapus.` : ''}`, 'Ya, Hapus');
    if (!ok) return;
    Store.guru = Store.guru.filter(x => x.id !== id);
    Store.absen = Store.absen.filter(a => a.guruId !== id);
    Store.simpanGuru();
    Store.simpanAbsen();
    UI.toast(`${g.nama} dihapus.`, 'ok');
    this.renderTabel();
    Absensi.render();
    Rekap.render();
    Dashboard.render();
    Pengaturan.renderStat();
  },

  terfilter() {
    const q = $('#guruCari').value.trim().toLowerCase();
    const urut = [...Store.guru].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    if (!q) return urut;
    return urut.filter(g =>
      [g.nama, g.nip, g.nuptk, g.jabatan, g.mapel, g.kelas, g.statusPeg, g.hp]
        .join(' ').toLowerCase().includes(q));
  },

  renderTabel() {
    const data = this.terfilter();
    const body = $('#guruBody');
    $('#guruCount').textContent = `${data.length} dari ${Store.guru.length} guru`;

    body.innerHTML = data.length
      ? data.map((g, i) => `<tr>
          <td>${i + 1}</td>
          <td><span class="nm">${esc(g.nama)}</span>
              <span class="sub">${esc(g.jk || '—')}${g.nuptk ? ' • NUPTK ' + esc(g.nuptk) : ''}</span></td>
          <td>${esc(g.nip || '—')}</td>
          <td>${esc(g.jabatan || '—')}</td>
          <td>${esc(g.mapel || '—')}</td>
          <td>${esc(g.kelas || '—')}</td>
          <td><span class="pill">${esc(g.statusPeg || '—')}</span></td>
          <td>${esc(g.hp || '—')}</td>
          <td><div class="act-row">
            <button class="icon-btn ib-edit" data-act="edit" data-id="${g.id}" title="Ubah"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn ib-del" data-act="del" data-id="${g.id}" title="Hapus"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`).join('')
      : UI.kosong(9, 'Belum ada data guru', 'Isi formulir di atas untuk menambahkan.', 'fa-user-plus');

    UI.bertahap(body);
  },

  ekspor() {
    const data = this.terfilter();
    if (!data.length) { UI.toast('Tidak ada data guru untuk diekspor.', 'warn'); return; }
    const baris = data.map((g, i) => [i + 1, g.nama, g.nip || '', g.nuptk || '', g.jk || '',
      g.jabatan || '', g.mapel || '', g.kelas || '', g.statusPeg || '', g.hp || '']);
    unduh(`data-guru-sdi-assuryaniyah-${isoDate()}.csv`,
      buatCSV(['No', 'Nama', 'NIP/NIY', 'NUPTK', 'Jenis Kelamin', 'Jabatan',
               'Mapel/Bidang', 'Kelas', 'Status Kepegawaian', 'No. HP'], baris),
      'text/csv;charset=utf-8');
    UI.toast(`${data.length} data guru diekspor.`, 'ok');
  },
};

/* ===== 9. HALAMAN REKAP =================================== */

const Rekap = {
  init() {
    $('#rekapBulan').value = isoMonth();
    $('#rekapBulan').addEventListener('change', () => this.render());
    $('#rekapGuru').addEventListener('change', () => this.render());
    $('#rekapExport').addEventListener('click', () => this.ekspor());
    $('#rekapPrint').addEventListener('click', () => {
      UI.toast('Menyiapkan dokumen cetak…', 'info', 1600);
      setTimeout(() => window.print(), 320);
    });
  },

  render() {
    UI.isiSelect($('#rekapGuru'),
      [...Store.guru].sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
        .map(g => ({ value: g.id, label: g.nama })), 'Semua Guru');

    const bulan = $('#rekapBulan').value || isoMonth();
    const filterGuru = $('#rekapGuru').value;
    const { baris, hariKerja } = this.hitung(bulan, filterGuru);

    $('#printPeriod').textContent =
      `Periode ${bulanPanjang(bulan)} • Tahun Pelajaran ${Store.setting.tahunAjaran} • Semester ${Store.setting.semester}`;
    $('#rekapInfo').textContent = `${baris.length} guru • ${hariKerja} hari tercatat`;
    $('#signKepsek').textContent = Store.setting.kepsek || '…………………………';
    $('#signOperator').textContent = Store.setting.operator || '…………………………';
    $('#signDate').textContent = tanggalPanjang(isoDate()).split(', ')[1];

    const body = $('#rekapBody');
    body.innerHTML = baris.length
      ? baris.map((r, i) => `<tr>
          <td>${i + 1}</td>
          <td><span class="nm">${esc(r.nama)}</span></td>
          <td>${esc(r.jabatan || '—')}</td>
          ${STATUS.map(s => `<td>${r.count[s.key] || 0}</td>`).join('')}
          <td><strong>${r.hadir}</strong></td>
          <td><span class="badge ${r.pct >= 90 ? 'b-hadir' : r.pct >= 75 ? 'b-terlambat' : 'b-alpa'}">${r.pct}%</span></td>
        </tr>`).join('')
      : UI.kosong(12, 'Belum ada data pada periode ini',
          'Pilih bulan lain atau catat absensi terlebih dahulu.', 'fa-chart-simple');

    // Baris total
    $('#rekapFoot').innerHTML = baris.length ? (() => {
      const tot = k => baris.reduce((t, r) => t + (r.count[k] || 0), 0);
      const totHadir = baris.reduce((t, r) => t + r.hadir, 0);
      const totCatat = baris.reduce((t, r) => t + r.tercatat, 0);
      const pct = totCatat ? Math.round((totHadir / totCatat) * 100) : 0;
      return `<tr><td colspan="3">JUMLAH</td>
        ${STATUS.map(s => `<td>${tot(s.key)}</td>`).join('')}
        <td>${totHadir}</td><td>${pct}%</td></tr>`;
    })() : '';

    UI.bertahap(body);
  },

  /** Hitung rekapitulasi satu bulan. */
  hitung(bulan, guruId) {
    const data = Store.absen.filter(a => a.tanggal.startsWith(bulan));
    const hariKerja = new Set(data.map(a => a.tanggal)).size;
    const daftar = guruId ? Store.guru.filter(g => g.id === guruId) : Store.guru;

    const baris = daftar
      .map(g => {
        const punya = data.filter(a => a.guruId === g.id);
        const count = {};
        STATUS.forEach(s => { count[s.key] = punya.filter(a => a.status === s.key).length; });
        const hadir = STATUS_HADIR.reduce((t, k) => t + count[k], 0);
        const tercatat = punya.length;
        return {
          id: g.id, nama: g.nama, nip: g.nip || '', jabatan: g.jabatan || '',
          count, hadir, tercatat,
          pct: hariKerja ? Math.round((hadir / hariKerja) * 100) : 0,
        };
      })
      .filter(r => r.tercatat > 0 || !!guruId)
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

    return { baris, hariKerja };
  },

  ekspor() {
    const bulan = $('#rekapBulan').value || isoMonth();
    const { baris, hariKerja } = this.hitung(bulan, $('#rekapGuru').value);
    if (!baris.length) { UI.toast('Tidak ada data pada periode ini.', 'warn'); return; }

    const isi = baris.map((r, i) => [i + 1, r.nama, r.nip, r.jabatan,
      ...STATUS.map(s => r.count[s.key] || 0), r.hadir, hariKerja, r.pct + '%']);

    unduh(`rekap-absensi-${bulan}-sdi-assuryaniyah.csv`,
      buatCSV(['No', 'Nama Guru', 'NIP/NIY', 'Jabatan', ...STATUS.map(s => s.key),
               'Total Hadir', 'Hari Tercatat', '% Kehadiran'], isi),
      'text/csv;charset=utf-8');
    UI.toast(`Rekap ${bulanPanjang(bulan)} diekspor.`, 'ok');
  },
};

/* ===== 10. HALAMAN PENGATURAN ============================= */

const Pengaturan = {
  init() {
    // Deretan pilihan hari kerja
    $('#hariKerjaRow').innerHTML = HARI.map((h, i) =>
      `<label class="chip" data-hari="${i}"><input type="checkbox" value="${i}">${h}</label>`).join('');
    $('#hariKerjaRow').addEventListener('change', e => {
      e.target.closest('.chip')?.classList.toggle('on', e.target.checked);
    });

    $('#formSetting').addEventListener('submit', e => { e.preventDefault(); this.simpan(); });
    $('#btnBackup').addEventListener('click', () => this.cadangkan());
    $('#fileRestore').addEventListener('change', e => this.pulihkan(e));
    $('#btnSeed').addEventListener('click', () => this.muatContoh());
    $('#btnWipe').addEventListener('click', () => this.hapusSemua());
  },

  render() {
    const s = Store.setting;
    $('#setNamaSekolah').value = s.namaSekolah;
    $('#setNpsn').value = s.npsn;
    $('#setTahunAjaran').value = s.tahunAjaran;
    $('#setSemester').value = s.semester;
    $('#setJamMasuk').value = s.jamMasuk;
    $('#setJamKeluar').value = s.jamKeluar;
    $('#setKepsek').value = s.kepsek;
    $('#setOperator').value = s.operator;

    $$('#hariKerjaRow .chip').forEach(chip => {
      const on = s.hariKerja.includes(Number(chip.dataset.hari));
      chip.classList.toggle('on', on);
      $('input', chip).checked = on;
    });

    this.renderStat();
  },

  renderStat() {
    UI.hitungAngka($('#dbGuru'), Store.guru.length);
    UI.hitungAngka($('#dbAbsen'), Store.absen.length);
    $('#dbSize').textContent = Store.ukuran();
  },

  simpan() {
    Object.assign(Store.setting, {
      namaSekolah: $('#setNamaSekolah').value.trim() || Store.SETTING_DEFAULT.namaSekolah,
      npsn: $('#setNpsn').value.trim(),
      tahunAjaran: $('#setTahunAjaran').value.trim(),
      semester: $('#setSemester').value,
      jamMasuk: $('#setJamMasuk').value || '07:00',
      jamKeluar: $('#setJamKeluar').value || '15:00',
      kepsek: $('#setKepsek').value.trim(),
      operator: $('#setOperator').value.trim(),
      hariKerja: $$('#hariKerjaRow input:checked').map(i => Number(i.value)),
    });
    Store.simpanSetting();
    UI.toast('Pengaturan tersimpan.', 'ok');
    Absensi.render();
    Rekap.render();
  },

  cadangkan() {
    const isi = JSON.stringify({
      aplikasi: 'Absensi Guru SDI Assuryaniyah Bekasi',
      versi: 1,
      dibuat: new Date().toISOString(),
      setting: Store.setting,
      guru: Store.guru,
      absen: Store.absen,
    }, null, 2);
    unduh(`cadangan-absensi-guru-${isoDate()}.json`, isi, 'application/json');
    UI.toast('Cadangan berhasil diunduh.', 'ok');
  },

  pulihkan(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const d = JSON.parse(reader.result);
        if (!Array.isArray(d.guru) || !Array.isArray(d.absen)) throw new Error('format');
        const ok = await UI.konfirmasi('Pulihkan Cadangan',
          `Berkas memuat ${d.guru.length} guru dan ${d.absen.length} catatan absensi. Seluruh data saat ini akan diganti.`,
          'Ya, Pulihkan');
        if (!ok) return;
        Store.guru = d.guru;
        Store.absen = d.absen;
        Store.setting = { ...Store.SETTING_DEFAULT, ...(d.setting || {}) };
        Store.simpanGuru(); Store.simpanAbsen(); Store.simpanSetting();
        UI.toast('Data berhasil dipulihkan.', 'ok');
        renderSemua();
      } catch {
        UI.toast('Berkas cadangan tidak dikenali.', 'err');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  },

  async muatContoh() {
    if (Store.guru.length || Store.absen.length) {
      const ok = await UI.konfirmasi('Muat Data Contoh',
        'Data contoh akan menimpa seluruh data yang ada. Lanjutkan?', 'Ya, Muat Contoh');
      if (!ok) return;
    }
    const { guru, absen } = buatDataContoh();
    Store.guru = guru;
    Store.absen = absen;
    Store.simpanGuru();
    Store.simpanAbsen();
    UI.toast(`Data contoh dimuat: ${guru.length} guru, ${absen.length} catatan.`, 'ok');
    renderSemua();
    Router.buka('dashboard');
  },

  async hapusSemua() {
    const ok = await UI.konfirmasi('Hapus Semua Data',
      'Seluruh data guru, absensi, dan pengaturan akan dihapus permanen dari peramban ini. Tindakan tidak dapat dibatalkan.',
      'Ya, Hapus Semua');
    if (!ok) return;
    [Store.KEY_GURU, Store.KEY_ABSEN, Store.KEY_SET].forEach(k => localStorage.removeItem(k));
    Store.muat();
    UI.toast('Seluruh data telah dihapus.', 'ok');
    renderSemua();
  },
};

/* ===== DATA CONTOH ======================================== */

function buatDataContoh() {
  const daftar = [
    ['Ust. Ahmad Fauzan, S.Pd.I.', 'Kepala Sekolah', 'Manajemen Sekolah', 'Semua Kelas', 'Laki-laki', 'GTY'],
    ['Siti Maryam, S.Pd.', 'Guru Kelas', 'Guru Kelas I', 'I', 'Perempuan', 'GTY'],
    ['Nur Hidayah, S.Pd.', 'Guru Kelas', 'Guru Kelas II', 'II', 'Perempuan', 'GTY'],
    ['Rahmat Hidayat, S.Pd.', 'Guru Kelas', 'Guru Kelas III', 'III', 'Laki-laki', 'GTT'],
    ['Dewi Lestari, S.Pd.', 'Guru Kelas', 'Guru Kelas IV', 'IV', 'Perempuan', 'GTY'],
    ['Muhammad Ridwan, S.Pd.', 'Guru Kelas', 'Guru Kelas V', 'V', 'Laki-laki', 'GTY'],
    ['Fitri Handayani, S.Pd.', 'Guru Kelas', 'Guru Kelas VI', 'VI', 'Perempuan', 'GTY'],
    ['Ust. Abdul Karim, Al-Hafizh', 'Guru Tahfidz', 'Tahfidz Al-Qur’an', 'Semua Kelas', 'Laki-laki', 'GTY'],
    ['Ustzh. Khadijah, Al-Hafizhah', 'Guru Tahfidz', 'Tahfidz Al-Qur’an', 'Semua Kelas', 'Perempuan', 'GTY'],
    ['Yusuf Maulana, S.Pd.', 'Guru Mata Pelajaran', 'Pendidikan Jasmani', 'Semua Kelas', 'Laki-laki', 'GTT'],
    ['Aisyah Rahmawati, S.Pd.', 'Guru Mata Pelajaran', 'Bahasa Inggris', 'Semua Kelas', 'Perempuan', 'GTT'],
    ['Bagus Prakoso', 'Operator Sekolah', 'Dapodik & Administrasi', '', 'Laki-laki', 'Honorer'],
  ];

  const guru = daftar.map(([nama, jabatan, mapel, kelas, jk, statusPeg], i) => ({
    id: `seed${i}`,
    nama, jabatan, mapel, kelas, jk, statusPeg,
    nip: `1985${String(i + 1).padStart(2, '0')}0720100${String(i + 1).padStart(2, '0')}`,
    nuptk: `${3000000000000000 + i * 137}`,
    hp: `0812${String(34567890 + i * 1111).slice(0, 8)}`,
    ts: Date.now(),
  }));

  // Absensi 14 hari kerja terakhir dengan variasi status yang wajar
  const absen = [];
  const kerja = Store.SETTING_DEFAULT.hariKerja;
  const d = new Date();
  let terisi = 0;

  while (terisi < 14) {
    if (kerja.includes(d.getDay())) {
      const tanggal = isoDate(d);
      guru.forEach((g, gi) => {
        const acak = (terisi * 7 + gi * 13) % 20;             // pola tetap, bukan acak murni
        let status = 'Hadir', masuk = '06:4' + ((gi % 5) + 1), keluar = '15:00', ket = '';
        if (acak === 3)       { status = 'Terlambat'; masuk = '07:1' + (gi % 6); ket = 'Terlambat karena hujan'; }
        else if (acak === 7)  { status = 'Izin'; masuk = ''; keluar = ''; ket = 'Keperluan keluarga'; }
        else if (acak === 11) { status = 'Sakit'; masuk = ''; keluar = ''; ket = 'Surat keterangan dokter'; }
        else if (acak === 15) { status = 'Dinas Luar'; masuk = '07:00'; keluar = '14:00'; ket = 'Rapat gugus di UPTD'; }
        absen.push({ id: `sa${terisi}-${gi}`, tanggal, guruId: g.id, status, masuk, keluar, keterangan: ket, ts: Date.now() });
      });
      terisi++;
    }
    d.setDate(d.getDate() - 1);
  }

  return { guru, absen };
}

/* ===== 11. INIT =========================================== */

function renderSemua() {
  Dashboard.render();
  Absensi.render();
  Guru.render();
  Rekap.render();
  Pengaturan.render();
  UI.amatiReveal();
}

function init() {
  Store.muat();

  UI.pasangRiak();
  UI.jalankanJam();

  Absensi.init();
  Guru.init();
  Rekap.init();
  Pengaturan.init();
  Router.init();

  renderSemua();
  UI.pasangReveal();

  // Sambutan pertama kali
  if (!Store.guru.length && !Store.absen.length) {
    setTimeout(() => UI.toast('Selamat datang! Mulai dengan mengisi Data Guru, atau muat Data Contoh di Pengaturan.', 'info', 6000), 700);
  }
}

document.addEventListener('DOMContentLoaded', init);
