/* ============================================================
   ABSENSI SISWA — SDI ASSURYANIYAH
   Guru mengisi jumlah Sakit / Izin / Alpa tiap kelas per hari.
   Hadir dihitung otomatis: jumlah siswa − (S + I + A).
   Aplikasi satu halaman, tanpa framework, offline-first.
   ============================================================
   Struktur berkas:
     1.  KONSTANTA       — kategori absensi, nama hari & bulan
     2.  UTIL            — bantuan tanggal, teks, CSV, unduhan
     3.  STORE           — baca/simpan localStorage
     4.  UI              — toast, modal, riak, animasi angka & baris
     5.  ROUTER          — perpindahan halaman yang mulus
     6.  HAL. BERANDA    — ringkasan hari ini & bulan berjalan
     7.  HAL. INPUT      — tabel isian semua kelas untuk satu tanggal
     8.  HAL. RIWAYAT    — catatan tersimpan, filter, ekspor
     9.  HAL. DATA KELAS — CRUD kelas & jumlah siswa
     10. HAL. REKAP      — rekapitulasi bulanan, ekspor, cetak
     11. HAL. PENGATURAN — hari sekolah, cadangan data
     12. INIT            — perakitan seluruh modul
   ============================================================ */
'use strict';

/* ===== 1. KONSTANTA ======================================== */

/** Kategori ketidakhadiran yang diisi guru. */
const KATEGORI = [
  { key: 'sakit', label: 'Sakit', kode: 'S', color: '#8b5cf6' },
  { key: 'izin',  label: 'Izin',  kode: 'I', color: '#06b6d4' },
  { key: 'alpa',  label: 'Alpa',  kode: 'A', color: '#ef4444' },
];

const WARNA_HADIR = '#10b981';

const HARI  = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
               'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/* ===== 2. UTIL ============================================= */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Tanggal lokal YYYY-MM-DD (tanpa pergeseran zona waktu). */
function isoDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Bulan lokal YYYY-MM. */
const isoMonth = (d = new Date()) => isoDate(d).slice(0, 7);

/** "2026-07-30" → "Kamis, 30 Juli 2026" */
function tanggalPanjang(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${HARI[new Date(y, m - 1, d).getDay()]}, ${d} ${BULAN[m - 1]} ${y}`;
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

/** Bilangan bulat non-negatif dari nilai input apa pun. */
const num = v => Math.max(0, parseInt(v, 10) || 0);

/** Persentase dibulatkan, aman terhadap pembagi nol. */
const persen = (bagian, total) => total > 0 ? Math.round((bagian / total) * 100) : 0;

/** Unduh berkas dari string di sisi klien. */
function unduh(namaFile, isi, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([isi], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: namaFile });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** CSV ber-BOM dengan pemisah ";" agar rapi dibuka di Excel Indonesia. */
function buatCSV(header, baris) {
  const sel = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...baris].map(r => r.map(sel).join(';')).join('\r\n');
}

/* ===== 3. STORE ============================================ */

/*  Bentuk data
    kelas : { id, nama, wali, jumlah }
    absen : { id, tanggal, kelasId, total, sakit, izin, alpa, keterangan, guru, ts }
            `total` adalah cuplikan jumlah siswa saat pencatatan, agar rekap
            lama tidak berubah ketika jumlah siswa kelas diperbarui.          */

const Store = {
  KEY_KELAS: 'as_kelas_v1',
  KEY_ABSEN: 'as_absen_v1',
  KEY_SET: 'as_setting_v1',

  SETTING_DEFAULT: {
    hariSekolah: [1, 2, 3, 4, 5, 6], // Senin–Sabtu
  },

  kelas: [],
  absen: [],
  setting: {},

  muat() {
    this.kelas   = this._baca(this.KEY_KELAS, []);
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
    } catch {
      UI.toast('Penyimpanan browser penuh. Unduh cadangan lalu hapus sebagian data.', 'err');
    }
  },

  simpanKelas()   { this._tulis(this.KEY_KELAS, this.kelas); },
  simpanAbsen()   { this._tulis(this.KEY_ABSEN, this.absen); },
  simpanSetting() { this._tulis(this.KEY_SET, this.setting); },

  cariKelas(id) { return this.kelas.find(k => k.id === id) || null; },
  namaKelas(id) { return this.cariKelas(id)?.nama || '(kelas terhapus)'; },

  /** Kelas terurut menurut nama, mengikuti urutan alami (I, II, … X). */
  kelasTerurut() {
    return [...this.kelas].sort((a, b) =>
      a.nama.localeCompare(b.nama, 'id', { numeric: true, sensitivity: 'base' }));
  },

  /** Catatan satu kelas pada tanggal tertentu. */
  absenPada(kelasId, tanggal) {
    return this.absen.find(a => a.kelasId === kelasId && a.tanggal === tanggal) || null;
  },

  /** Seluruh catatan pada satu tanggal. */
  absenTanggal(tanggal) {
    return this.absen.filter(a => a.tanggal === tanggal);
  },

  /** Absensi terurut: tanggal terbaru lebih dahulu. */
  absenTerurut() {
    return [...this.absen].sort((a, b) =>
      b.tanggal.localeCompare(a.tanggal) ||
      Store.namaKelas(a.kelasId).localeCompare(Store.namaKelas(b.kelasId), 'id', { numeric: true }));
  },

  totalSiswa() { return this.kelas.reduce((t, k) => t + num(k.jumlah), 0); },

  ukuran() {
    const n = [this.KEY_KELAS, this.KEY_ABSEN, this.KEY_SET]
      .reduce((t, k) => t + (localStorage.getItem(k) || '').length, 0);
    return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
  },
};

/** Jumlah siswa hadir pada sebuah catatan. */
const hadirDari = a => Math.max(0, num(a.total) - num(a.sakit) - num(a.izin) - num(a.alpa));

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

  /* --- Kartu muncul bertahap saat digulir --- */
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

  /** Animasi bertahap pada baris yang baru digambar. */
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

  /** Isi <select> dengan {value,label} sambil menjaga pilihan lama. */
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

  /** Badge persentase berwarna sesuai ambang kehadiran. */
  badgePersen(p) {
    const kelas = p >= 95 ? 'b-hadir' : p >= 85 ? 'b-terlambat' : 'b-alpa';
    return `<span class="badge ${kelas}">${p}%</span>`;
  },
};

/* ===== 5. ROUTER =========================================== */

const HALAMAN = {
  dashboard: () => Beranda,
  absensi:   () => Input,
  riwayat:   () => Riwayat,
  kelas:     () => Kelas,
  rekap:     () => Rekap,
  pengaturan:() => Pengaturan,
};

const Router = {
  init() {
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

    $('#navToggle').addEventListener('click', () => $('#navMenu').classList.toggle('open'));

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

    $$('.page').forEach(p => p.classList.remove('active'));
    target.classList.add('active');
    $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.page === nama));

    if (location.hash !== `#${nama}`) history.replaceState(null, '', `#${nama}`);
    if (gulir) window.scrollTo({ top: 0, behavior: 'smooth' });

    HALAMAN[nama]?.().render();
    UI.amatiReveal();
  },
};

/* ===== 6. HALAMAN BERANDA ================================== */

const Beranda = {
  render() {
    const hariIni = isoDate();
    const now = new Date();

    $('#heroDay').textContent   = HARI[now.getDay()];
    $('#heroDate').textContent  = now.getDate();
    $('#heroMonth').textContent = `${BULAN[now.getMonth()]} ${now.getFullYear()}`;
    $('#todayLabel').textContent = `— ${tanggalPanjang(hariIni)}`;
    $('#dashMonthLabel').textContent = bulanPanjang(isoMonth());

    // Statistik hari ini
    const data = Store.absenTanggal(hariIni);
    const jml = k => data.reduce((t, a) => t + num(a[k]), 0);
    const hadir = data.reduce((t, a) => t + hadirDari(a), 0);
    const sudah = new Set(data.map(a => a.kelasId));

    UI.hitungAngka($('#stTotal'), Store.totalSiswa());
    UI.hitungAngka($('#stHadir'), hadir);
    UI.hitungAngka($('#stSakit'), jml('sakit'));
    UI.hitungAngka($('#stIzin'), jml('izin'));
    UI.hitungAngka($('#stAlpa'), jml('alpa'));
    UI.hitungAngka($('#stBelum'), Store.kelas.filter(k => !sudah.has(k.id)).length);

    this.renderCincin(isoMonth());
    this.renderHariIni(hariIni);
  },

  /** Cincin persentase kehadiran bulan berjalan + rincian kategori. */
  renderCincin(bulan) {
    const data = Store.absen.filter(a => a.tanggal.startsWith(bulan));
    const total = data.reduce((t, a) => t + num(a.total), 0);
    const hadir = data.reduce((t, a) => t + hadirDari(a), 0);
    const pct = persen(hadir, total);

    requestAnimationFrame(() => { $('#attRing').style.setProperty('--pct', pct); });
    UI.hitungAngka($('#attPct'), pct, { suffix: '%' });

    const baris = [{ label: 'Hadir', color: WARNA_HADIR, nilai: hadir }]
      .concat(KATEGORI.map(k => ({
        label: k.label, color: k.color,
        nilai: data.reduce((t, a) => t + num(a[k.key]), 0),
      })));

    $('#monthLegend').innerHTML = total
      ? baris.map(b => `<li><span class="dot" style="background:${b.color}"></span>
          <span class="lg-name">${b.label}</span>
          <span class="lg-val">${b.nilai}</span></li>`).join('')
      : `<li><span class="lg-name">Belum ada catatan pada ${esc(bulanPanjang(bulan))}.</span></li>`;
  },

  /** Daftar kelas beserta status pengisian hari ini. */
  renderHariIni(tanggal) {
    const body = $('#todayBody');
    const daftar = Store.kelasTerurut();

    if (!daftar.length) {
      body.innerHTML = UI.kosong(6, 'Belum ada kelas',
        'Tambahkan kelas terlebih dahulu pada menu Data Kelas.', 'fa-chalkboard');
      return;
    }

    body.innerHTML = daftar.map(k => {
      const a = Store.absenPada(k.id, tanggal);
      if (!a) {
        return `<tr><td class="nm">${esc(k.nama)}</td>
          <td colspan="5"><span class="badge b-cuti">Belum diisi</span></td></tr>`;
      }
      const h = hadirDari(a);
      return `<tr>
        <td class="nm">${esc(k.nama)}</td>
        <td><strong>${h}</strong> / ${num(a.total)}</td>
        <td>${num(a.sakit)}</td><td>${num(a.izin)}</td><td>${num(a.alpa)}</td>
        <td>${UI.badgePersen(persen(h, num(a.total)))}</td>
      </tr>`;
    }).join('');

    UI.bertahap(body);
  },
};

/* ===== 7. HALAMAN INPUT ABSENSI ============================ */

const Input = {
  init() {
    $('#inputTanggal').value = isoDate();
    $('#inputTanggal').addEventListener('change', () => this.render());
    $('#btnHariIni').addEventListener('click', () => {
      $('#inputTanggal').value = isoDate();
      this.render();
    });
    $('#btnNolkan').addEventListener('click', () => this.nolkan());
    $('#btnMuatUlang').addEventListener('click', () => {
      this.render();
      UI.toast('Isian dimuat ulang dari data tersimpan.', 'info');
    });
    $('#btnSimpanSemua').addEventListener('click', () => this.simpan());

    // Hitung ulang kolom Hadir setiap kali angka berubah
    $('#inputBody').addEventListener('input', e => {
      if (e.target.classList.contains('num')) this.hitungBaris(e.target.closest('tr'));
      if (e.target.classList.contains('num') || e.target.classList.contains('ket-input')) this.hitungTotal();
    });

    // Enter berpindah ke kolom isian berikutnya
    $('#inputBody').addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.classList.contains('num')) return;
      e.preventDefault();
      const semua = $$('#inputBody .num');
      const i = semua.indexOf(e.target);
      semua[Math.min(i + 1, semua.length - 1)]?.focus();
    });
  },

  get tanggal() { return $('#inputTanggal').value || isoDate(); },

  render() {
    const tanggal = this.tanggal;
    $('#inputDateLabel').textContent = tanggalPanjang(tanggal);

    const daftar = Store.kelasTerurut();
    const body = $('#inputBody');

    if (!daftar.length) {
      body.innerHTML = UI.kosong(7, 'Belum ada kelas',
        'Tambahkan kelas terlebih dahulu pada menu Data Kelas.', 'fa-chalkboard');
      $('#inputFoot').innerHTML = '';
      $('#inputStatusPill').textContent = '0 kelas';
      return;
    }

    body.innerHTML = daftar.map(k => {
      const a = Store.absenPada(k.id, tanggal);
      const total = num(k.jumlah);
      const v = f => a ? num(a[f]) : 0;
      const kolom = f => `<td><input type="number" class="num${a && v(f) ? ' isi' : ''}"
        data-f="${f}" min="0" max="${total}" value="${v(f)}" aria-label="${f} ${esc(k.nama)}"></td>`;

      return `<tr data-kelas="${k.id}" data-total="${total}"${a ? ' class="tersimpan"' : ''}>
        <td><span class="nm">${esc(k.nama)}</span>
            ${k.wali ? `<span class="sub">${esc(k.wali)}</span>` : ''}</td>
        <td>${total}</td>
        ${KATEGORI.map(c => kolom(c.key)).join('')}
        <td class="hadir-cell">${a ? hadirDari(a) : total}</td>
        <td><input type="text" class="ket-input" value="${esc(a?.keterangan || '')}" placeholder="—"></td>
      </tr>`;
    }).join('');

    // Nama guru piket terakhir untuk tanggal ini
    const contoh = Store.absenTanggal(tanggal).find(a => a.guru);
    $('#inputGuru').value = contoh?.guru || '';

    const terisi = new Set(Store.absenTanggal(tanggal).map(a => a.kelasId)).size;
    $('#inputStatusPill').textContent = terisi
      ? `${terisi} dari ${daftar.length} kelas tersimpan`
      : `${daftar.length} kelas belum diisi`;

    UI.bertahap(body);
    this.hitungTotal();
  },

  /** Perbarui kolom Hadir satu baris + validasi agar tidak melebihi jumlah siswa. */
  hitungBaris(tr) {
    if (!tr) return;
    const total = num(tr.dataset.total);
    const input = f => $(`.num[data-f="${f}"]`, tr);
    let jumlahAbsen = KATEGORI.reduce((t, c) => t + num(input(c.key).value), 0);

    KATEGORI.forEach(c => {
      const el = input(c.key);
      el.classList.toggle('isi', num(el.value) > 0);
      el.classList.remove('lebih');
    });

    if (jumlahAbsen > total) {
      KATEGORI.forEach(c => input(c.key).classList.add('lebih'));
      $('.hadir-cell', tr).textContent = 0;
      return;
    }
    $('.hadir-cell', tr).textContent = total - jumlahAbsen;
  },

  /** Baris jumlah di kaki tabel. */
  hitungTotal() {
    const baris = $$('#inputBody tr[data-kelas]');
    if (!baris.length) { $('#inputFoot').innerHTML = ''; return; }

    let total = 0, sakit = 0, izin = 0, alpa = 0;
    baris.forEach(tr => {
      total += num(tr.dataset.total);
      sakit += num($('.num[data-f="sakit"]', tr).value);
      izin  += num($('.num[data-f="izin"]', tr).value);
      alpa  += num($('.num[data-f="alpa"]', tr).value);
    });
    const hadir = Math.max(0, total - sakit - izin - alpa);

    $('#inputFoot').innerHTML = `<tr>
      <td>JUMLAH</td><td>${total}</td>
      <td>${sakit}</td><td>${izin}</td><td>${alpa}</td>
      <td>${hadir} <span class="sub">${persen(hadir, total)}%</span></td><td></td>
    </tr>`;
  },

  nolkan() {
    $$('#inputBody .num').forEach(el => { el.value = 0; el.classList.remove('isi', 'lebih'); });
    $$('#inputBody tr[data-kelas]').forEach(tr => this.hitungBaris(tr));
    this.hitungTotal();
    UI.toast('Seluruh isian dinolkan. Tekan Simpan Absensi untuk menyimpan.', 'info');
  },

  simpan() {
    const tanggal = this.tanggal;
    const baris = $$('#inputBody tr[data-kelas]');
    if (!baris.length) { UI.toast('Belum ada kelas untuk diisi.', 'warn'); return; }

    // Validasi terlebih dahulu — jangan simpan sebagian
    const salah = baris.find(tr => {
      const total = num(tr.dataset.total);
      const isi = KATEGORI.reduce((t, c) => t + num($(`.num[data-f="${c.key}"]`, tr).value), 0);
      return isi > total;
    });
    if (salah) {
      const nama = $('.nm', salah).textContent;
      UI.toast(`Jumlah absen kelas ${nama} melebihi jumlah siswa.`, 'err', 4200);
      $('.num', salah).focus();
      return;
    }

    const guru = $('#inputGuru').value.trim();
    let baru = 0, diperbarui = 0;

    baris.forEach(tr => {
      const kelasId = tr.dataset.kelas;
      const rec = {
        tanggal, kelasId,
        total: num(tr.dataset.total),
        keterangan: $('.ket-input', tr).value.trim(),
        guru,
        ts: Date.now(),
      };
      KATEGORI.forEach(c => { rec[c.key] = num($(`.num[data-f="${c.key}"]`, tr).value); });

      const lama = Store.absenPada(kelasId, tanggal);
      if (lama) { Object.assign(lama, rec); diperbarui++; }
      else { Store.absen.push({ id: uid(), ...rec }); baru++; }
    });

    Store.simpanAbsen();
    UI.toast(`Absensi ${tanggalPanjang(tanggal)} tersimpan — ${baru} baru, ${diperbarui} diperbarui.`, 'ok', 4000);
    this.render();
    Pengaturan.renderStat();
  },
};

/* ===== 8. HALAMAN RIWAYAT ================================== */

const Riwayat = {
  init() {
    ['#fltDari', '#fltSampai', '#fltKelas', '#fltCari'].forEach(s =>
      $(s).addEventListener('input', () => this.renderTabel()));
    $('#fltReset').addEventListener('click', () => {
      ['#fltDari', '#fltSampai', '#fltKelas', '#fltCari'].forEach(s => { $(s).value = ''; });
      this.renderTabel();
      UI.toast('Filter dibersihkan.', 'info');
    });
    $('#riwayatExport').addEventListener('click', () => this.ekspor());
    $('#riwayatHapus').addEventListener('click', () => this.hapusTerfilter());

    $('#riwayatBody').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'edit') this.bukaDiInput(btn.dataset.id);
      if (btn.dataset.act === 'del') this.hapus(btn.dataset.id);
    });
  },

  render() {
    UI.isiSelect($('#fltKelas'),
      Store.kelasTerurut().map(k => ({ value: k.id, label: k.nama })), 'Semua kelas');
    this.renderTabel();
  },

  terfilter() {
    const dari = $('#fltDari').value;
    const sampai = $('#fltSampai').value;
    const kelasId = $('#fltKelas').value;
    const q = $('#fltCari').value.trim().toLowerCase();

    return Store.absenTerurut().filter(a => {
      if (dari && a.tanggal < dari) return false;
      if (sampai && a.tanggal > sampai) return false;
      if (kelasId && a.kelasId !== kelasId) return false;
      if (q && !`${a.keterangan || ''} ${a.guru || ''} ${Store.namaKelas(a.kelasId)}`
        .toLowerCase().includes(q)) return false;
      return true;
    });
  },

  renderTabel() {
    const data = this.terfilter();
    const body = $('#riwayatBody');
    $('#riwayatCount').textContent = `${data.length} dari ${Store.absen.length} catatan`;

    body.innerHTML = data.length
      ? data.map(a => {
          const h = hadirDari(a);
          return `<tr>
            <td><span class="nm">${tanggalPendek(a.tanggal)}</span>
                <span class="sub">${HARI[hariDari(a.tanggal)]}</span></td>
            <td class="nm">${esc(Store.namaKelas(a.kelasId))}</td>
            <td>${num(a.total)}</td>
            <td><strong>${h}</strong></td>
            <td>${num(a.sakit)}</td><td>${num(a.izin)}</td><td>${num(a.alpa)}</td>
            <td>${UI.badgePersen(persen(h, num(a.total)))}</td>
            <td>${esc(a.keterangan || '—')}</td>
            <td><div class="act-row">
              <button class="icon-btn ib-edit" data-act="edit" data-id="${a.id}" title="Ubah di halaman input"><i class="fa-solid fa-pen"></i></button>
              <button class="icon-btn ib-del" data-act="del" data-id="${a.id}" title="Hapus"><i class="fa-solid fa-trash"></i></button>
            </div></td>
          </tr>`;
        }).join('')
      : UI.kosong(10, 'Tidak ada catatan', 'Sesuaikan filter atau isi absensi terlebih dahulu.', 'fa-clipboard-list');

    UI.bertahap(body);
  },

  /** Ubah = buka tanggal terkait di halaman Input Absensi. */
  bukaDiInput(id) {
    const a = Store.absen.find(x => x.id === id);
    if (!a) return;
    $('#inputTanggal').value = a.tanggal;
    Router.buka('absensi');
    UI.toast(`Membuka absensi ${tanggalPanjang(a.tanggal)} untuk diubah.`, 'info');
  },

  async hapus(id) {
    const a = Store.absen.find(x => x.id === id);
    if (!a) return;
    const ok = await UI.konfirmasi('Hapus Catatan',
      `Hapus absensi kelas ${Store.namaKelas(a.kelasId)} tanggal ${tanggalPendek(a.tanggal)}?`, 'Ya, Hapus');
    if (!ok) return;
    Store.absen = Store.absen.filter(x => x.id !== id);
    Store.simpanAbsen();
    UI.toast('Catatan dihapus.', 'ok');
    this.renderTabel();
    Pengaturan.renderStat();
  },

  async hapusTerfilter() {
    const data = this.terfilter();
    if (!data.length) { UI.toast('Tidak ada data terfilter.', 'warn'); return; }
    const ok = await UI.konfirmasi('Hapus Data Terfilter',
      `${data.length} catatan akan dihapus permanen. Lanjutkan?`, 'Ya, Hapus Semua');
    if (!ok) return;
    const buang = new Set(data.map(a => a.id));
    Store.absen = Store.absen.filter(a => !buang.has(a.id));
    Store.simpanAbsen();
    UI.toast(`${buang.size} catatan dihapus.`, 'ok');
    this.renderTabel();
    Pengaturan.renderStat();
  },

  ekspor() {
    const data = this.terfilter();
    if (!data.length) { UI.toast('Tidak ada data untuk diekspor.', 'warn'); return; }
    const baris = data.map(a => {
      const h = hadirDari(a);
      return [a.tanggal, HARI[hariDari(a.tanggal)], Store.namaKelas(a.kelasId), num(a.total),
              h, num(a.sakit), num(a.izin), num(a.alpa),
              persen(h, num(a.total)) + '%', a.keterangan || '', a.guru || ''];
    });
    unduh(`absensi-siswa-${isoDate()}.csv`,
      buatCSV(['Tanggal', 'Hari', 'Kelas', 'Jumlah Siswa', 'Hadir', 'Sakit', 'Izin', 'Alpa',
               '% Kehadiran', 'Keterangan', 'Diisi Oleh'], baris),
      'text/csv;charset=utf-8');
    UI.toast(`${data.length} catatan diekspor ke CSV.`, 'ok');
  },
};

/* ===== 9. HALAMAN DATA KELAS =============================== */

const Kelas = {
  init() {
    $('#formKelas').addEventListener('submit', e => { e.preventDefault(); this.simpan(); });
    $('#kelasReset').addEventListener('click', () => this.resetForm());

    $('#kelasBody').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'edit') this.muatKeForm(btn.dataset.id);
      if (btn.dataset.act === 'del') this.hapus(btn.dataset.id);
    });
  },

  render() { this.renderTabel(); },

  simpan() {
    const id = $('#kelasId').value;
    const rec = {
      nama: $('#kelasNama').value.trim(),
      wali: $('#kelasWali').value.trim(),
      jumlah: num($('#kelasJumlah').value),
    };
    if (!rec.nama) { UI.toast('Nama kelas wajib diisi.', 'err'); return; }
    if (rec.jumlah < 1) { UI.toast('Jumlah siswa minimal 1.', 'err'); return; }

    const kembar = Store.kelas.find(k =>
      k.id !== id && k.nama.toLowerCase() === rec.nama.toLowerCase());
    if (kembar) { UI.toast(`Kelas "${rec.nama}" sudah terdaftar.`, 'err'); return; }

    if (id) {
      Object.assign(Store.cariKelas(id), rec);
      UI.toast(`Kelas ${rec.nama} diperbarui.`, 'ok');
    } else {
      Store.kelas.push({ id: uid(), ...rec, ts: Date.now() });
      UI.toast(`Kelas ${rec.nama} ditambahkan.`, 'ok');
    }
    Store.simpanKelas();
    this.resetForm();
    this.renderTabel();
    Pengaturan.renderStat();
  },

  muatKeForm(id) {
    const k = Store.cariKelas(id);
    if (!k) return;
    $('#kelasId').value = k.id;
    $('#kelasNama').value = k.nama || '';
    $('#kelasWali').value = k.wali || '';
    $('#kelasJumlah').value = num(k.jumlah);
    $('#kelasSubmitLabel').textContent = 'Perbarui Kelas';
    const card = $('#formKelas').closest('.card');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 1300);
  },

  resetForm() {
    $('#formKelas').reset();
    $('#kelasId').value = '';
    $('#kelasSubmitLabel').textContent = 'Simpan Kelas';
  },

  async hapus(id) {
    const k = Store.cariKelas(id);
    if (!k) return;
    const jml = Store.absen.filter(a => a.kelasId === id).length;
    const ok = await UI.konfirmasi('Hapus Kelas',
      `Hapus kelas ${k.nama}?${jml ? ` ${jml} catatan absensinya juga akan dihapus.` : ''}`, 'Ya, Hapus');
    if (!ok) return;
    Store.kelas = Store.kelas.filter(x => x.id !== id);
    Store.absen = Store.absen.filter(a => a.kelasId !== id);
    Store.simpanKelas();
    Store.simpanAbsen();
    UI.toast(`Kelas ${k.nama} dihapus.`, 'ok');
    this.renderTabel();
    Pengaturan.renderStat();
  },

  renderTabel() {
    const data = Store.kelasTerurut();
    const body = $('#kelasBody');
    $('#kelasCount').textContent = `${data.length} kelas • ${Store.totalSiswa()} siswa`;

    body.innerHTML = data.length
      ? data.map((k, i) => `<tr>
          <td>${i + 1}</td>
          <td class="nm">${esc(k.nama)}</td>
          <td>${esc(k.wali || '—')}</td>
          <td>${num(k.jumlah)}</td>
          <td><div class="act-row">
            <button class="icon-btn ib-edit" data-act="edit" data-id="${k.id}" title="Ubah"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn ib-del" data-act="del" data-id="${k.id}" title="Hapus"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`).join('')
      : UI.kosong(5, 'Belum ada kelas', 'Isi formulir di atas untuk menambahkan.', 'fa-chalkboard');

    $('#kelasFoot').innerHTML = data.length
      ? `<tr><td colspan="3">TOTAL SISWA</td><td>${Store.totalSiswa()}</td><td></td></tr>` : '';

    UI.bertahap(body);
  },
};

/* ===== 10. HALAMAN REKAP ================================== */

const Rekap = {
  init() {
    $('#rekapBulan').value = isoMonth();
    $('#rekapBulan').addEventListener('change', () => this.render());
    $('#rekapExport').addEventListener('click', () => this.ekspor());
    $('#rekapPrint').addEventListener('click', () => {
      UI.toast('Menyiapkan dokumen cetak…', 'info', 1600);
      setTimeout(() => window.print(), 320);
    });
  },

  render() {
    const bulan = $('#rekapBulan').value || isoMonth();
    const { baris, hari } = this.hitung(bulan);

    $('#printPeriod').textContent = bulanPanjang(bulan);
    $('#rekapInfo').textContent = `${baris.length} kelas • ${hari} hari tercatat`;

    const body = $('#rekapBody');
    body.innerHTML = baris.length
      ? baris.map((r, i) => `<tr>
          <td>${i + 1}</td>
          <td class="nm">${esc(r.nama)}</td>
          <td>${esc(r.wali || '—')}</td>
          <td>${r.hari}</td>
          <td><strong>${r.hadir}</strong></td>
          <td>${r.sakit}</td><td>${r.izin}</td><td>${r.alpa}</td>
          <td>${UI.badgePersen(r.pct)}</td>
        </tr>`).join('')
      : UI.kosong(9, 'Belum ada data pada periode ini',
          'Pilih bulan lain atau isi absensi terlebih dahulu.', 'fa-chart-simple');

    $('#rekapFoot').innerHTML = baris.length ? (() => {
      const t = k => baris.reduce((s, r) => s + r[k], 0);
      return `<tr><td colspan="3">JUMLAH</td><td>${hari}</td>
        <td>${t('hadir')}</td><td>${t('sakit')}</td><td>${t('izin')}</td><td>${t('alpa')}</td>
        <td>${persen(t('hadir'), t('mungkin'))}%</td></tr>`;
    })() : '';

    UI.bertahap(body);
  },

  /** Rekapitulasi satu bulan per kelas. */
  hitung(bulan) {
    const data = Store.absen.filter(a => a.tanggal.startsWith(bulan));
    const hari = new Set(data.map(a => a.tanggal)).size;

    const baris = Store.kelasTerurut()
      .map(k => {
        const punya = data.filter(a => a.kelasId === k.id);
        const jml = f => punya.reduce((t, a) => t + num(a[f]), 0);
        const mungkin = punya.reduce((t, a) => t + num(a.total), 0);
        const hadir = punya.reduce((t, a) => t + hadirDari(a), 0);
        return {
          nama: k.nama, wali: k.wali || '', hari: punya.length,
          hadir, sakit: jml('sakit'), izin: jml('izin'), alpa: jml('alpa'),
          mungkin, pct: persen(hadir, mungkin),
        };
      })
      .filter(r => r.hari > 0);

    return { baris, hari };
  },

  ekspor() {
    const bulan = $('#rekapBulan').value || isoMonth();
    const { baris } = this.hitung(bulan);
    if (!baris.length) { UI.toast('Tidak ada data pada periode ini.', 'warn'); return; }

    const isi = baris.map((r, i) =>
      [i + 1, r.nama, r.wali, r.hari, r.hadir, r.sakit, r.izin, r.alpa, r.pct + '%']);
    unduh(`rekap-absensi-siswa-${bulan}.csv`,
      buatCSV(['No', 'Kelas', 'Wali Kelas', 'Hari Tercatat', 'Hadir', 'Sakit', 'Izin', 'Alpa', '% Kehadiran'], isi),
      'text/csv;charset=utf-8');
    UI.toast(`Rekap ${bulanPanjang(bulan)} diekspor.`, 'ok');
  },
};

/* ===== 11. HALAMAN PENGATURAN ============================= */

const Pengaturan = {
  init() {
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
    $$('#hariKerjaRow .chip').forEach(chip => {
      const on = Store.setting.hariSekolah.includes(Number(chip.dataset.hari));
      chip.classList.toggle('on', on);
      $('input', chip).checked = on;
    });
    this.renderStat();
  },

  renderStat() {
    UI.hitungAngka($('#dbKelas'), Store.kelas.length);
    UI.hitungAngka($('#dbAbsen'), Store.absen.length);
    $('#dbSize').textContent = Store.ukuran();
  },

  simpan() {
    Store.setting.hariSekolah = $$('#hariKerjaRow input:checked').map(i => Number(i.value));
    Store.simpanSetting();
    UI.toast('Pengaturan tersimpan.', 'ok');
  },

  cadangkan() {
    const isi = JSON.stringify({
      aplikasi: 'Absensi Siswa SDI Assuryaniyah',
      versi: 1,
      dibuat: new Date().toISOString(),
      setting: Store.setting,
      kelas: Store.kelas,
      absen: Store.absen,
    }, null, 2);
    unduh(`cadangan-absensi-siswa-${isoDate()}.json`, isi, 'application/json');
    UI.toast('Cadangan berhasil diunduh.', 'ok');
  },

  pulihkan(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const d = JSON.parse(reader.result);
        if (!Array.isArray(d.kelas) || !Array.isArray(d.absen)) throw new Error('format');
        const ok = await UI.konfirmasi('Pulihkan Cadangan',
          `Berkas memuat ${d.kelas.length} kelas dan ${d.absen.length} catatan. Seluruh data saat ini akan diganti.`,
          'Ya, Pulihkan');
        if (!ok) return;
        Store.kelas = d.kelas;
        Store.absen = d.absen;
        Store.setting = { ...Store.SETTING_DEFAULT, ...(d.setting || {}) };
        Store.simpanKelas(); Store.simpanAbsen(); Store.simpanSetting();
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
    if (Store.kelas.length || Store.absen.length) {
      const ok = await UI.konfirmasi('Muat Data Contoh',
        'Data contoh akan menimpa seluruh data yang ada. Lanjutkan?', 'Ya, Muat Contoh');
      if (!ok) return;
    }
    const { kelas, absen } = buatDataContoh();
    Store.kelas = kelas;
    Store.absen = absen;
    Store.simpanKelas();
    Store.simpanAbsen();
    UI.toast(`Data contoh dimuat: ${kelas.length} kelas, ${absen.length} catatan.`, 'ok');
    renderSemua();
    Router.buka('dashboard');
  },

  async hapusSemua() {
    const ok = await UI.konfirmasi('Hapus Semua Data',
      'Seluruh data kelas, absensi, dan pengaturan akan dihapus permanen dari browser ini. Tindakan tidak dapat dibatalkan.',
      'Ya, Hapus Semua');
    if (!ok) return;
    [Store.KEY_KELAS, Store.KEY_ABSEN, Store.KEY_SET].forEach(k => localStorage.removeItem(k));
    Store.muat();
    UI.toast('Seluruh data telah dihapus.', 'ok');
    renderSemua();
  },
};

/* ===== DATA CONTOH ======================================== */

function buatDataContoh() {
  const daftar = [
    ['I A',  'Siti Maryam, S.Pd.',      28],
    ['I B',  'Nur Hidayah, S.Pd.',      27],
    ['II A', 'Dewi Lestari, S.Pd.',     30],
    ['II B', 'Fitri Handayani, S.Pd.',  29],
    ['III',  'Rahmat Hidayat, S.Pd.',   26],
    ['IV',   'Muhammad Ridwan, S.Pd.',  31],
    ['V',    'Aisyah Rahmawati, S.Pd.', 28],
    ['VI',   'Yusuf Maulana, S.Pd.',    25],
  ];

  const kelas = daftar.map(([nama, wali, jumlah], i) => ({
    id: `k${i}`, nama, wali, jumlah, ts: Date.now(),
  }));

  // 14 hari sekolah terakhir, pola tetap agar hasil dapat diulang
  const absen = [];
  const hariSekolah = Store.setting.hariSekolah?.length ? Store.setting.hariSekolah : [1, 2, 3, 4, 5, 6];
  const d = new Date();
  let terisi = 0;

  while (terisi < 14) {
    if (hariSekolah.includes(d.getDay())) {
      const tanggal = isoDate(d);
      kelas.forEach((k, ki) => {
        const p = (terisi * 5 + ki * 3) % 11;
        const sakit = p % 4 === 0 ? (p % 3) : 0;
        const izin  = p % 5 === 0 ? 1 : 0;
        const alpa  = p === 7 ? 1 : 0;
        absen.push({
          id: `sa${terisi}-${ki}`, tanggal, kelasId: k.id, total: k.jumlah,
          sakit, izin, alpa,
          keterangan: alpa ? 'Tanpa keterangan' : '',
          guru: 'Guru Piket', ts: Date.now(),
        });
      });
      terisi++;
    }
    d.setDate(d.getDate() - 1);
  }

  return { kelas, absen };
}

/* ===== 12. INIT =========================================== */

function renderSemua() {
  Beranda.render();
  Input.render();
  Riwayat.render();
  Kelas.render();
  Rekap.render();
  Pengaturan.render();
  UI.amatiReveal();
}

function init() {
  Store.muat();

  UI.pasangRiak();
  UI.jalankanJam();

  Input.init();
  Riwayat.init();
  Kelas.init();
  Rekap.init();
  Pengaturan.init();
  Router.init();

  renderSemua();
  UI.pasangReveal();

  if (!Store.kelas.length && !Store.absen.length) {
    setTimeout(() => UI.toast('Selamat datang! Mulai dengan mengisi Data Kelas, atau muat Data Contoh di Pengaturan.', 'info', 6000), 700);
  }
}

document.addEventListener('DOMContentLoaded', init);
