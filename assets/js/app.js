/* ============================================================
   ABSENSI SISWA — SDI ASSURYANIYAH
   Guru menandai kehadiran per nama siswa (Hadir / Sakit / Izin / Alpa).
   Aplikasi satu halaman, tanpa framework, offline-first.
   ============================================================
   Struktur berkas:
     1.  KONSTANTA       — status kehadiran, nama hari & bulan
     2.  UTIL            — tanggal, teks, CSV, unduhan
     3.  STORE           — kelas, siswa, absensi di localStorage
     4.  UI              — toast, modal, riak, animasi, autocomplete
     5.  ROUTER          — perpindahan halaman yang mulus
     6.  HAL. BERANDA    — ringkasan hari ini & bulan berjalan
     7.  HAL. INPUT      — daftar siswa satu kelas, tandai per nama
     8.  HAL. RIWAYAT    — catatan tersimpan, filter, ekspor
     9.  HAL. DATA KELAS — CRUD kelas
     10. HAL. DATA SISWA — CRUD siswa, impor CSV/tempel, ekspor
     11. HAL. REKAP      — rekap per kelas & per siswa, ekspor, cetak
     12. HAL. PENGATURAN — hari sekolah, cadangan data
     13. INIT            — perakitan seluruh modul
   ============================================================ */
'use strict';

/* ===== 1. KONSTANTA ======================================== */

/** Status kehadiran. `Hadir` adalah bawaan dan tidak ikut disimpan. */
const STATUS = [
  { key: 'Hadir', kode: 'H', badge: 'b-hadir', color: '#10b981' },
  { key: 'Sakit', kode: 'S', badge: 'b-sakit', color: '#8b5cf6' },
  { key: 'Izin',  kode: 'I', badge: 'b-izin',  color: '#06b6d4' },
  { key: 'Alpa',  kode: 'A', badge: 'b-alpa',  color: '#ef4444' },
];

/** Status ketidakhadiran saja — yang benar-benar dicatat. */
const ABSEN = STATUS.filter(s => s.key !== 'Hadir');

const statusMeta = key => STATUS.find(s => s.key === key) || STATUS[0];

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

const num = v => Math.max(0, parseInt(v, 10) || 0);

const persen = (bagian, total) => total > 0 ? Math.round((bagian / total) * 100) : 0;

/** Normalisasi teks untuk pencarian & pembandingan nama. */
const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Urutan alami: "I A" < "II A" < "X". */
const bandingNama = (a, b) =>
  String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' });

/** Unduh berkas dari string di sisi klien. */
function unduh(namaFile, isi, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([isi], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: namaFile });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** CSV ber-BOM dengan pemisah ";" agar langsung rapi di Excel Indonesia. */
function buatCSV(header, baris) {
  const sel = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...baris].map(r => r.map(sel).join(';')).join('\r\n');
}

const unduhCSV = (nama, header, baris) =>
  unduh(nama, buatCSV(header, baris), 'text/csv;charset=utf-8');

/* ===== 3. STORE ============================================ */

/*  Bentuk data
    kelas : { id, nama, wali }
    siswa : { id, kelasId, nama, nis, jk }
    absen : { id, tanggal, kelasId, total, guru, ts,
              entri: [ { siswaId, status, ket } ] }

    Hanya siswa yang TIDAK hadir disimpan dalam `entri`; sisanya dianggap
    hadir. `total` adalah cuplikan jumlah siswa saat penyimpanan, agar rekap
    lama tidak berubah ketika daftar siswa diperbarui.                      */

const Store = {
  KEY_KELAS: 'as_kelas_v2',
  KEY_SISWA: 'as_siswa_v2',
  KEY_ABSEN: 'as_absen_v2',
  KEY_SET:   'as_setting_v2',

  SETTING_DEFAULT: { hariSekolah: [1, 2, 3, 4, 5, 6] },   // Senin–Sabtu

  kelas: [],
  siswa: [],
  absen: [],
  setting: {},

  muat() {
    this.kelas   = this._baca(this.KEY_KELAS, []);
    this.siswa   = this._baca(this.KEY_SISWA, []);
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
  simpanSiswa()   { this._tulis(this.KEY_SISWA, this.siswa); },
  simpanAbsen()   { this._tulis(this.KEY_ABSEN, this.absen); },
  simpanSetting() { this._tulis(this.KEY_SET, this.setting); },

  /* --- Kelas --- */
  cariKelas(id) { return this.kelas.find(k => k.id === id) || null; },
  namaKelas(id) { return this.cariKelas(id)?.nama || '(kelas terhapus)'; },
  kelasTerurut() { return [...this.kelas].sort((a, b) => bandingNama(a.nama, b.nama)); },

  /* --- Siswa --- */
  cariSiswa(id) { return this.siswa.find(s => s.id === id) || null; },
  namaSiswa(id) { return this.cariSiswa(id)?.nama || '(siswa terhapus)'; },

  /** Siswa satu kelas, terurut menurut nama. */
  siswaKelas(kelasId) {
    return this.siswa.filter(s => s.kelasId === kelasId)
      .sort((a, b) => bandingNama(a.nama, b.nama));
  },

  /** Seluruh siswa terurut kelas lalu nama. */
  siswaTerurut() {
    return [...this.siswa].sort((a, b) =>
      bandingNama(this.namaKelas(a.kelasId), this.namaKelas(b.kelasId)) ||
      bandingNama(a.nama, b.nama));
  },

  jumlahSiswa(kelasId) { return this.siswa.filter(s => s.kelasId === kelasId).length; },

  /* --- Absensi --- */
  absenPada(kelasId, tanggal) {
    return this.absen.find(a => a.kelasId === kelasId && a.tanggal === tanggal) || null;
  },

  absenTanggal(tanggal) { return this.absen.filter(a => a.tanggal === tanggal); },

  absenTerurut() {
    return [...this.absen].sort((a, b) =>
      b.tanggal.localeCompare(a.tanggal) ||
      bandingNama(this.namaKelas(a.kelasId), this.namaKelas(b.kelasId)));
  },

  ukuran() {
    const n = [this.KEY_KELAS, this.KEY_SISWA, this.KEY_ABSEN, this.KEY_SET]
      .reduce((t, k) => t + (localStorage.getItem(k) || '').length, 0);
    return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
  },
};

/** Jumlah siswa hadir pada satu catatan kelas. */
const hadirDari = a => Math.max(0, num(a.total) - (a.entri?.length || 0));

/** Jumlah entri dengan status tertentu pada satu catatan. */
const jumlahStatus = (a, status) => (a.entri || []).filter(e => e.status === status).length;

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
    const baru = [];
    $$('.page.active .card, .page.active .stat-card').forEach((el, i) => {
      if (el.dataset.revealed) return;
      el.dataset.revealed = '1';
      el.classList.add('reveal');
      el.style.transitionDelay = `${Math.min(i * 55, 420)}ms`;
      this.observer.observe(el);
      baru.push(el);
    });
    // Jaring pengaman: apa pun yang terjadi pada observer, isi kartu tidak
    // boleh tertinggal tak terlihat.
    if (baru.length) {
      setTimeout(() => baru.forEach(el => el.classList.add('shown')), 1500);
    }
  },

  /** Animasi bertahap pada baris yang baru digambar. */
  bertahap(root, selector = 'tr') {
    $$(selector, root).forEach((el, i) => {
      el.classList.add('anim-row');
      el.style.animationDelay = `${Math.min(i * 24, 400)}ms`;
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
    else if (!placeholder && items.length) sel.value = items[0].value;
  },

  kosong(kolom, judul, pesan, ikon = 'fa-inbox') {
    return `<tr><td colspan="${kolom}"><div class="empty">
      <i class="fa-solid ${ikon}"></i><strong>${esc(judul)}</strong>${esc(pesan)}</div></td></tr>`;
  },

  badgePersen(p) {
    const kelas = p >= 95 ? 'b-hadir' : p >= 85 ? 'b-terlambat' : 'b-alpa';
    return `<span class="badge ${kelas}">${p}%</span>`;
  },

  /** Tebalkan bagian nama yang cocok dengan kata kunci. */
  sorotCocok(teks, kunci) {
    const i = norm(teks).indexOf(norm(kunci));
    if (!kunci || i < 0) return esc(teks);
    return esc(teks.slice(0, i)) + '<mark>' + esc(teks.slice(i, i + kunci.length)) +
           '</mark>' + esc(teks.slice(i + kunci.length));
  },
};

/* --- Autocomplete nama siswa ------------------------------- */
/*  Ketik "int" → muncul "Intan Permata", "Intania Zahra", dst.
    Mendukung papan ketik: ↑ ↓ Enter Esc.                       */

const Autocomplete = {
  pasang(inputSel, listSel, { sumber, onPilih, maks = 8 }) {
    const input = $(inputSel);
    const list = $(listSel);
    let hasil = [], aktif = -1;

    const tutup = () => {
      list.hidden = true;
      list.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      aktif = -1;
    };

    const gambar = kunci => {
      hasil = sumber(kunci).slice(0, maks);
      if (!hasil.length) {
        list.innerHTML = `<li class="ac-empty">Tidak ada siswa bernama &ldquo;${esc(kunci)}&rdquo;.</li>`;
      } else {
        list.innerHTML = hasil.map((h, i) => `
          <li class="ac-item${i === aktif ? ' aktif' : ''}" role="option" data-i="${i}"
              aria-selected="${i === aktif}">
            <span class="ac-nama">${UI.sorotCocok(h.nama, kunci)}</span>
            <span class="ac-kelas">${esc(h.kelas)}</span>
          </li>`).join('');
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

    const pilih = i => {
      const h = hasil[i];
      if (!h) return;
      input.value = '';
      tutup();
      onPilih(h);
    };

    input.addEventListener('input', () => {
      const kunci = input.value.trim();
      if (kunci.length < 1) { tutup(); return; }
      aktif = -1;
      gambar(kunci);
    });

    input.addEventListener('keydown', e => {
      if (list.hidden || !hasil.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        aktif = (aktif + (e.key === 'ArrowDown' ? 1 : hasil.length - 1)) % hasil.length;
        gambar(input.value.trim());
        $(`.ac-item[data-i="${aktif}"]`, list)?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        pilih(aktif >= 0 ? aktif : 0);
      } else if (e.key === 'Escape') {
        tutup();
      }
    });

    list.addEventListener('mousedown', e => {
      const li = e.target.closest('.ac-item');
      if (li) { e.preventDefault(); pilih(Number(li.dataset.i)); }
    });

    input.addEventListener('blur', () => setTimeout(tutup, 120));
  },
};

/* ===== 5. ROUTER =========================================== */

const HALAMAN = {
  dashboard:  () => Beranda,
  absensi:    () => Input,
  riwayat:    () => Riwayat,
  kelas:      () => Kelas,
  siswa:      () => Siswa,
  rekap:      () => Rekap,
  pengaturan: () => Pengaturan,
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

    const data = Store.absenTanggal(hariIni);
    const hadir = data.reduce((t, a) => t + hadirDari(a), 0);
    const sudah = new Set(data.map(a => a.kelasId));

    UI.hitungAngka($('#stTotal'), Store.siswa.length);
    UI.hitungAngka($('#stHadir'), hadir);
    ABSEN.forEach(s => UI.hitungAngka($(`#st${s.key}`),
      data.reduce((t, a) => t + jumlahStatus(a, s.key), 0)));
    UI.hitungAngka($('#stBelum'), Store.kelas.filter(k => !sudah.has(k.id)).length);

    this.renderCincin(isoMonth());
    this.renderTidakMasuk(hariIni, data);
    this.renderStatusKelas(hariIni);
  },

  /** Cincin persentase kehadiran bulan berjalan + rincian status. */
  renderCincin(bulan) {
    const data = Store.absen.filter(a => a.tanggal.startsWith(bulan));
    const total = data.reduce((t, a) => t + num(a.total), 0);
    const hadir = data.reduce((t, a) => t + hadirDari(a), 0);
    const pct = persen(hadir, total);

    requestAnimationFrame(() => { $('#attRing').style.setProperty('--pct', pct); });
    UI.hitungAngka($('#attPct'), pct, { suffix: '%' });

    const baris = [{ label: 'Hadir', color: statusMeta('Hadir').color, nilai: hadir }]
      .concat(ABSEN.map(s => ({
        label: s.key, color: s.color,
        nilai: data.reduce((t, a) => t + jumlahStatus(a, s.key), 0),
      })));

    $('#monthLegend').innerHTML = total
      ? baris.map(b => `<li><span class="dot" style="background:${b.color}"></span>
          <span class="lg-name">${b.label}</span>
          <span class="lg-val">${b.nilai}</span></li>`).join('')
      : `<li><span class="lg-name">Belum ada catatan pada ${esc(bulanPanjang(bulan))}.</span></li>`;
  },

  /** Daftar nama siswa yang tidak masuk hari ini. */
  renderTidakMasuk(tanggal, data) {
    const body = $('#todayBody');
    const daftar = data.flatMap(a =>
      (a.entri || []).map(e => ({ ...e, kelasId: a.kelasId })))
      .sort((x, y) => bandingNama(Store.namaKelas(x.kelasId), Store.namaKelas(y.kelasId)) ||
                      bandingNama(Store.namaSiswa(x.siswaId), Store.namaSiswa(y.siswaId)));

    body.innerHTML = daftar.length
      ? daftar.map(e => `<tr>
          <td class="nm">${esc(Store.namaSiswa(e.siswaId))}</td>
          <td>${esc(Store.namaKelas(e.kelasId))}</td>
          <td><span class="badge ${statusMeta(e.status).badge}">${esc(e.status)}</span></td>
          <td>${esc(e.ket || '—')}</td>
        </tr>`).join('')
      : UI.kosong(4, data.length ? 'Alhamdulillah, hadir semua' : 'Belum ada absensi hari ini',
          data.length ? 'Tidak ada siswa yang tidak masuk.' : 'Mulai dari menu Input Absensi.',
          data.length ? 'fa-circle-check' : 'fa-clipboard');

    UI.bertahap(body);
  },

  /** Ringkasan pengisian tiap kelas hari ini. */
  renderStatusKelas(tanggal) {
    const body = $('#kelasStatusBody');
    const daftar = Store.kelasTerurut();
    const terisi = daftar.filter(k => Store.absenPada(k.id, tanggal)).length;
    $('#kelasStatusPill').textContent = daftar.length
      ? `${terisi} dari ${daftar.length} kelas terisi` : '0 kelas';

    if (!daftar.length) {
      body.innerHTML = UI.kosong(8, 'Belum ada kelas',
        'Tambahkan kelas pada menu Data Kelas.', 'fa-chalkboard');
      return;
    }

    body.innerHTML = daftar.map(k => {
      const a = Store.absenPada(k.id, tanggal);
      const jml = Store.jumlahSiswa(k.id);
      if (!a) {
        return `<tr>
          <td class="nm">${esc(k.nama)}</td><td>${esc(k.wali || '—')}</td><td>${jml}</td>
          <td colspan="5"><span class="badge b-cuti">Belum diisi</span></td></tr>`;
      }
      const h = hadirDari(a);
      return `<tr>
        <td class="nm">${esc(k.nama)}</td>
        <td>${esc(k.wali || '—')}</td>
        <td>${num(a.total)}</td>
        <td><strong>${h}</strong></td>
        ${ABSEN.map(s => `<td>${jumlahStatus(a, s.key)}</td>`).join('')}
        <td>${UI.badgePersen(persen(h, num(a.total)))}</td>
      </tr>`;
    }).join('');

    UI.bertahap(body);
  },
};

/* ===== 7. HALAMAN INPUT ABSENSI ============================ */

const Input = {
  /** Status kerja sementara: { siswaId: {status, ket} }, belum disimpan. */
  draft: new Map(),

  init() {
    $('#inputTanggal').value = isoDate();
    $('#inputTanggal').addEventListener('change', () => this.render());
    $('#inputKelas').addEventListener('change', () => this.render());
    $('#btnMuatUlang').addEventListener('click', () => {
      this.render();
      UI.toast('Isian dimuat ulang dari data tersimpan.', 'info');
    });
    $('#btnSemuaHadir').addEventListener('click', () => this.semuaHadir());
    $('#btnSimpanAbsen').addEventListener('click', () => this.simpan());

    // Klik tombol status pada baris siswa
    $('#absenBody').addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (btn) this.setStatus(btn.dataset.siswa, btn.dataset.s);
    });

    // Keterangan per siswa
    $('#absenBody').addEventListener('input', e => {
      if (!e.target.classList.contains('ket-input')) return;
      const id = e.target.dataset.siswa;
      const d = this.draft.get(id) || { status: 'Hadir', ket: '' };
      this.draft.set(id, { ...d, ket: e.target.value });
    });

    // Cari nama siswa dengan saran otomatis
    Autocomplete.pasang('#cariSiswa', '#cariSiswaList', {
      sumber: kunci => {
        const k = norm(kunci);
        return Store.siswaTerurut()
          .filter(s => norm(s.nama).includes(k) || norm(s.nis).includes(k))
          .map(s => ({ id: s.id, nama: s.nama, kelas: Store.namaKelas(s.kelasId), kelasId: s.kelasId }));
      },
      onPilih: h => this.lompatKe(h),
    });
  },

  get tanggal() { return $('#inputTanggal').value || isoDate(); },
  get kelasId() { return $('#inputKelas').value; },

  render() {
    UI.isiSelect($('#inputKelas'),
      Store.kelasTerurut().map(k => ({
        value: k.id, label: `${k.nama} (${Store.jumlahSiswa(k.id)} siswa)`,
      })));

    const tanggal = this.tanggal;
    const kelasId = this.kelasId;
    $('#inputDateLabel').textContent = tanggalPanjang(tanggal);

    const body = $('#absenBody');

    if (!Store.kelas.length) {
      body.innerHTML = UI.kosong(5, 'Belum ada kelas',
        'Tambahkan kelas pada menu Data Kelas terlebih dahulu.', 'fa-chalkboard');
      $('#inputStatusPill').textContent = '0 kelas';
      $('#sumRow').innerHTML = '';
      return;
    }

    const daftar = Store.siswaKelas(kelasId);
    if (!daftar.length) {
      body.innerHTML = UI.kosong(5, 'Belum ada siswa di kelas ini',
        'Tambahkan siswa pada menu Data Siswa.', 'fa-user-plus');
      $('#inputStatusPill').textContent = 'Belum ada siswa';
      $('#sumRow').innerHTML = '';
      return;
    }

    // Muat catatan tersimpan ke draft (bawaan: seluruhnya Hadir)
    const rec = Store.absenPada(kelasId, tanggal);
    this.draft = new Map(daftar.map(s => [s.id, { status: 'Hadir', ket: '' }]));
    (rec?.entri || []).forEach(e => {
      if (this.draft.has(e.siswaId)) this.draft.set(e.siswaId, { status: e.status, ket: e.ket || '' });
    });
    $('#inputGuru').value = rec?.guru || $('#inputGuru').value;
    $('#inputStatusPill').textContent = rec
      ? `Tersimpan • ${daftar.length} siswa` : `Belum diisi • ${daftar.length} siswa`;

    body.innerHTML = daftar.map((s, i) => {
      const d = this.draft.get(s.id);
      return `<tr data-siswa="${s.id}"${d.status !== 'Hadir' ? ' class="baris-absen"' : ''}>
        <td>${i + 1}</td>
        <td><span class="nm">${esc(s.nama)}</span>
            ${s.jk ? `<span class="sub">${s.jk === 'P' ? 'Perempuan' : 'Laki-laki'}</span>` : ''}</td>
        <td>${esc(s.nis || '—')}</td>
        <td><div class="seg">${STATUS.map(st => `
          <button type="button" class="seg-btn${d.status === st.key ? ' on' : ''}"
                  data-s="${st.key}" data-siswa="${s.id}"
                  title="${st.key}" aria-label="${esc(s.nama)}: ${st.key}"
                  aria-pressed="${d.status === st.key}">${st.kode}</button>`).join('')}</div></td>
        <td><input type="text" class="ket-input" data-siswa="${s.id}"
              value="${esc(d.ket)}" placeholder="—"
              ${d.status === 'Hadir' ? 'disabled' : ''}></td>
      </tr>`;
    }).join('');

    UI.bertahap(body);
    this.renderRingkasan();
  },

  /** Ubah status satu siswa lalu perbarui tampilan baris tersebut. */
  setStatus(siswaId, status) {
    const d = this.draft.get(siswaId);
    if (!d) return;
    this.draft.set(siswaId, { status, ket: status === 'Hadir' ? '' : d.ket });

    const tr = $(`#absenBody tr[data-siswa="${siswaId}"]`);
    if (!tr) return;
    $$('.seg-btn', tr).forEach(b => {
      const on = b.dataset.s === status;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    tr.classList.toggle('baris-absen', status !== 'Hadir');

    const ket = $('.ket-input', tr);
    ket.disabled = status === 'Hadir';
    if (status === 'Hadir') ket.value = '';

    this.renderRingkasan();
  },

  /** Kartu ringkasan di atas tabel. */
  renderRingkasan() {
    const nilai = [...this.draft.values()];
    const total = nilai.length;
    const n = k => nilai.filter(v => v.status === k).length;
    const hadir = n('Hadir');

    $('#sumRow').innerHTML = `
      <span class="sum-item si-total"><b>${total}</b> Siswa</span>
      <span class="sum-item si-hadir"><b>${hadir}</b> Hadir</span>
      ${ABSEN.map(s => `<span class="sum-item si-${s.key.toLowerCase()}"><b>${n(s.key)}</b> ${s.key}</span>`).join('')}
      <span class="sum-item"><b>${persen(hadir, total)}%</b> Kehadiran</span>`;
  },

  semuaHadir() {
    this.draft.forEach((_, id) => this.draft.set(id, { status: 'Hadir', ket: '' }));
    $$('#absenBody tr[data-siswa]').forEach(tr => {
      $$('.seg-btn', tr).forEach(b => {
        const on = b.dataset.s === 'Hadir';
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      tr.classList.remove('baris-absen');
      const ket = $('.ket-input', tr);
      ket.value = ''; ket.disabled = true;
    });
    this.renderRingkasan();
    UI.toast('Semua siswa ditandai hadir. Tekan Simpan Absensi untuk menyimpan.', 'info');
  },

  /** Lompat ke siswa hasil pencarian, pindah kelas bila perlu. */
  lompatKe(h) {
    if (h.kelasId !== this.kelasId) {
      $('#inputKelas').value = h.kelasId;
      this.render();
    }
    const tr = $(`#absenBody tr[data-siswa="${h.id}"]`);
    if (!tr) { UI.toast(`${h.nama} tidak ditemukan pada daftar.`, 'warn'); return; }
    tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    tr.classList.remove('sorot');
    void tr.offsetWidth;                       // paksa ulang animasi
    tr.classList.add('sorot');
    $('.seg-btn[data-s="Sakit"]', tr)?.focus();
    UI.toast(`${h.nama} — kelas ${h.kelas}. Pilih S, I, atau A.`, 'info', 2600);
  },

  simpan() {
    const kelasId = this.kelasId;
    const tanggal = this.tanggal;
    const daftar = Store.siswaKelas(kelasId);
    if (!daftar.length) { UI.toast('Belum ada siswa pada kelas ini.', 'warn'); return; }

    const entri = daftar
      .map(s => ({ siswaId: s.id, ...this.draft.get(s.id) }))
      .filter(e => e.status && e.status !== 'Hadir')
      .map(e => ({ siswaId: e.siswaId, status: e.status, ket: (e.ket || '').trim() }));

    const rec = {
      tanggal, kelasId, total: daftar.length,
      guru: $('#inputGuru').value.trim(), entri, ts: Date.now(),
    };

    const lama = Store.absenPada(kelasId, tanggal);
    if (lama) Object.assign(lama, rec);
    else Store.absen.push({ id: uid(), ...rec });
    Store.simpanAbsen();

    const hadir = daftar.length - entri.length;
    UI.toast(`Absensi ${Store.namaKelas(kelasId)} — ${tanggalPanjang(tanggal)} tersimpan. ` +
             `Hadir ${hadir}, tidak masuk ${entri.length}.`, 'ok', 4200);
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
    $('#riwayatExport').addEventListener('click', () => this.eksporHarian());
    $('#riwayatExportRinci').addEventListener('click', () => this.eksporRinci());
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
    const q = norm($('#fltCari').value);

    return Store.absenTerurut().filter(a => {
      if (dari && a.tanggal < dari) return false;
      if (sampai && a.tanggal > sampai) return false;
      if (kelasId && a.kelasId !== kelasId) return false;
      if (q) {
        const teks = norm([
          Store.namaKelas(a.kelasId), a.guru,
          ...(a.entri || []).map(e => `${Store.namaSiswa(e.siswaId)} ${e.ket || ''}`),
        ].join(' '));
        if (!teks.includes(q)) return false;
      }
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
          const chips = (a.entri || []).length
            ? `<div class="nama-chips">${a.entri.map(e =>
                `<span class="nchip n-${e.status.toLowerCase()}" title="${esc(e.ket || e.status)}">${
                  esc(Store.namaSiswa(e.siswaId))} (${statusMeta(e.status).kode})</span>`).join('')}</div>`
            : '<span class="badge b-hadir">Hadir semua</span>';
          return `<tr>
            <td><span class="nm">${tanggalPendek(a.tanggal)}</span>
                <span class="sub">${HARI[hariDari(a.tanggal)]}</span></td>
            <td class="nm">${esc(Store.namaKelas(a.kelasId))}</td>
            <td>${num(a.total)}</td>
            <td><strong>${h}</strong></td>
            ${ABSEN.map(s => `<td>${jumlahStatus(a, s.key)}</td>`).join('')}
            <td>${chips}</td>
            <td><div class="act-row">
              <button class="icon-btn ib-edit" data-act="edit" data-id="${a.id}" title="Ubah di halaman input"><i class="fa-solid fa-pen"></i></button>
              <button class="icon-btn ib-del" data-act="del" data-id="${a.id}" title="Hapus"><i class="fa-solid fa-trash"></i></button>
            </div></td>
          </tr>`;
        }).join('')
      : UI.kosong(9, 'Tidak ada catatan', 'Sesuaikan filter atau isi absensi terlebih dahulu.', 'fa-clipboard-list');

    UI.bertahap(body);
  },

  bukaDiInput(id) {
    const a = Store.absen.find(x => x.id === id);
    if (!a) return;
    $('#inputTanggal').value = a.tanggal;
    $('#inputKelas').value = a.kelasId;
    Router.buka('absensi');
    UI.toast(`Membuka absensi ${Store.namaKelas(a.kelasId)} — ${tanggalPanjang(a.tanggal)}.`, 'info');
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

  /** Satu baris per kelas per hari. */
  eksporHarian() {
    const data = this.terfilter();
    if (!data.length) { UI.toast('Tidak ada data untuk diekspor.', 'warn'); return; }
    const baris = data.map(a => {
      const h = hadirDari(a);
      const nama = st => (a.entri || []).filter(e => e.status === st)
        .map(e => Store.namaSiswa(e.siswaId)).join(', ');
      return [a.tanggal, HARI[hariDari(a.tanggal)], Store.namaKelas(a.kelasId), num(a.total), h,
              ...ABSEN.map(s => jumlahStatus(a, s.key)),
              persen(h, num(a.total)) + '%',
              ...ABSEN.map(s => nama(s.key)), a.guru || ''];
    });
    unduhCSV(`absensi-harian-${isoDate()}.csv`,
      ['Tanggal', 'Hari', 'Kelas', 'Jumlah Siswa', 'Hadir', ...ABSEN.map(s => s.key), '% Kehadiran',
       'Nama Sakit', 'Nama Izin', 'Nama Alpa', 'Diisi Oleh'], baris);
    UI.toast(`${data.length} catatan diekspor.`, 'ok');
  },

  /** Satu baris per siswa yang tidak masuk. */
  eksporRinci() {
    const data = this.terfilter();
    const baris = data.flatMap(a => (a.entri || []).map(e => {
      const s = Store.cariSiswa(e.siswaId);
      return [a.tanggal, HARI[hariDari(a.tanggal)], Store.namaKelas(a.kelasId),
              Store.namaSiswa(e.siswaId), s?.nis || '', e.status, e.ket || '', a.guru || ''];
    }));
    if (!baris.length) { UI.toast('Tidak ada siswa tidak masuk pada data terfilter.', 'warn'); return; }
    unduhCSV(`absensi-rinci-per-siswa-${isoDate()}.csv`,
      ['Tanggal', 'Hari', 'Kelas', 'Nama Siswa', 'NIS', 'Status', 'Keterangan', 'Diisi Oleh'], baris);
    UI.toast(`${baris.length} baris rinci diekspor.`, 'ok');
  },
};

/* ===== 9. HALAMAN DATA KELAS =============================== */

const Kelas = {
  init() {
    $('#formKelas').addEventListener('submit', e => { e.preventDefault(); this.simpan(); });
    $('#kelasReset').addEventListener('click', () => this.resetForm());
    $('#kelasExport').addEventListener('click', () => this.ekspor());

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
    const rec = { nama: $('#kelasNama').value.trim(), wali: $('#kelasWali').value.trim() };
    if (!rec.nama) { UI.toast('Nama kelas wajib diisi.', 'err'); return; }

    const kembar = Store.kelas.find(k => k.id !== id && norm(k.nama) === norm(rec.nama));
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
    Siswa.render();
    Pengaturan.renderStat();
  },

  muatKeForm(id) {
    const k = Store.cariKelas(id);
    if (!k) return;
    $('#kelasId').value = k.id;
    $('#kelasNama').value = k.nama || '';
    $('#kelasWali').value = k.wali || '';
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
    const jmlSiswa = Store.jumlahSiswa(id);
    const jmlAbsen = Store.absen.filter(a => a.kelasId === id).length;
    const ok = await UI.konfirmasi('Hapus Kelas',
      `Hapus kelas ${k.nama}? ${jmlSiswa} data siswa dan ${jmlAbsen} catatan absensinya ikut terhapus.`,
      'Ya, Hapus');
    if (!ok) return;
    Store.kelas = Store.kelas.filter(x => x.id !== id);
    Store.siswa = Store.siswa.filter(s => s.kelasId !== id);
    Store.absen = Store.absen.filter(a => a.kelasId !== id);
    Store.simpanKelas(); Store.simpanSiswa(); Store.simpanAbsen();
    UI.toast(`Kelas ${k.nama} dihapus.`, 'ok');
    renderSemua();
  },

  renderTabel() {
    const data = Store.kelasTerurut();
    const body = $('#kelasBody');
    $('#kelasCount').textContent = `${data.length} kelas • ${Store.siswa.length} siswa`;

    body.innerHTML = data.length
      ? data.map((k, i) => `<tr>
          <td>${i + 1}</td>
          <td class="nm">${esc(k.nama)}</td>
          <td>${esc(k.wali || '—')}</td>
          <td>${Store.jumlahSiswa(k.id)}</td>
          <td><div class="act-row">
            <button class="icon-btn ib-edit" data-act="edit" data-id="${k.id}" title="Ubah"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn ib-del" data-act="del" data-id="${k.id}" title="Hapus"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`).join('')
      : UI.kosong(5, 'Belum ada kelas', 'Isi formulir di atas untuk menambahkan.', 'fa-chalkboard');

    $('#kelasFoot').innerHTML = data.length
      ? `<tr><td colspan="3">TOTAL SISWA</td><td>${Store.siswa.length}</td><td></td></tr>` : '';

    UI.bertahap(body);
  },

  ekspor() {
    const data = Store.kelasTerurut();
    if (!data.length) { UI.toast('Belum ada kelas untuk diekspor.', 'warn'); return; }
    unduhCSV(`data-kelas-${isoDate()}.csv`, ['No', 'Kelas', 'Wali Kelas', 'Jumlah Siswa'],
      data.map((k, i) => [i + 1, k.nama, k.wali || '', Store.jumlahSiswa(k.id)]));
    UI.toast(`${data.length} kelas diekspor.`, 'ok');
  },
};

/* ===== 10. HALAMAN DATA SISWA ============================== */

const Siswa = {
  init() {
    $('#formSiswa').addEventListener('submit', e => { e.preventDefault(); this.simpan(); });
    $('#siswaReset').addEventListener('click', () => this.resetForm());
    $('#siswaCari').addEventListener('input', () => this.renderTabel());
    $('#siswaFltKelas').addEventListener('change', () => this.renderTabel());
    $('#siswaExport').addEventListener('click', () => this.ekspor());
    $('#siswaHapusKelas').addEventListener('click', () => this.hapusTerfilter());
    $('#btnImpor').addEventListener('click', () => this.impor());
    $('#btnTemplate').addEventListener('click', () => this.template());
    $('#imporFile').addEventListener('change', e => this.bacaBerkas(e));

    $('#siswaBody').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'edit') this.muatKeForm(btn.dataset.id);
      if (btn.dataset.act === 'del') this.hapus(btn.dataset.id);
    });
  },

  render() {
    const opsi = Store.kelasTerurut().map(k => ({ value: k.id, label: k.nama }));
    UI.isiSelect($('#siswaKelas'), opsi);
    UI.isiSelect($('#imporKelas'), opsi);
    UI.isiSelect($('#siswaFltKelas'), opsi, 'Semua kelas');
    this.renderTabel();
  },

  simpan() {
    const id = $('#siswaId').value;
    const rec = {
      kelasId: $('#siswaKelas').value,
      nama: $('#siswaNama').value.trim(),
      nis: $('#siswaNis').value.trim(),
      jk: $('#siswaJk').value,
    };
    if (!rec.kelasId) { UI.toast('Pilih kelas terlebih dahulu. Tambahkan kelas bila belum ada.', 'err'); return; }
    if (!rec.nama) { UI.toast('Nama siswa wajib diisi.', 'err'); return; }

    const kembar = Store.siswa.find(s =>
      s.id !== id && s.kelasId === rec.kelasId && norm(s.nama) === norm(rec.nama));
    if (kembar) { UI.toast(`"${rec.nama}" sudah ada di kelas ${Store.namaKelas(rec.kelasId)}.`, 'err'); return; }

    if (id) {
      Object.assign(Store.cariSiswa(id), rec);
      UI.toast('Data siswa diperbarui.', 'ok');
    } else {
      Store.siswa.push({ id: uid(), ...rec, ts: Date.now() });
      UI.toast(`${rec.nama} ditambahkan ke kelas ${Store.namaKelas(rec.kelasId)}.`, 'ok');
    }
    Store.simpanSiswa();
    this.resetForm();
    this.renderTabel();
    Kelas.renderTabel();
    Pengaturan.renderStat();
  },

  muatKeForm(id) {
    const s = Store.cariSiswa(id);
    if (!s) return;
    $('#siswaId').value = s.id;
    $('#siswaKelas').value = s.kelasId;
    $('#siswaNama').value = s.nama || '';
    $('#siswaNis').value = s.nis || '';
    $('#siswaJk').value = s.jk || 'L';
    $('#siswaSubmitLabel').textContent = 'Perbarui Siswa';
    const card = $('#formSiswa').closest('.card');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 1300);
  },

  resetForm() {
    const kelasLama = $('#siswaKelas').value;
    $('#formSiswa').reset();
    $('#siswaId').value = '';
    $('#siswaKelas').value = kelasLama;         // tetap di kelas yang sama
    $('#siswaSubmitLabel').textContent = 'Simpan Siswa';
    $('#siswaNama').focus();
  },

  async hapus(id) {
    const s = Store.cariSiswa(id);
    if (!s) return;
    const ok = await UI.konfirmasi('Hapus Siswa',
      `Hapus ${s.nama} dari kelas ${Store.namaKelas(s.kelasId)}? Riwayat absensinya ikut terhapus.`, 'Ya, Hapus');
    if (!ok) return;
    Store.siswa = Store.siswa.filter(x => x.id !== id);
    Store.absen.forEach(a => { a.entri = (a.entri || []).filter(e => e.siswaId !== id); });
    Store.simpanSiswa(); Store.simpanAbsen();
    UI.toast(`${s.nama} dihapus.`, 'ok');
    this.renderTabel();
    Kelas.renderTabel();
    Pengaturan.renderStat();
  },

  terfilter() {
    const kelasId = $('#siswaFltKelas').value;
    const q = norm($('#siswaCari').value);
    return Store.siswaTerurut().filter(s => {
      if (kelasId && s.kelasId !== kelasId) return false;
      if (q && !norm(`${s.nama} ${s.nis}`).includes(q)) return false;
      return true;
    });
  },

  renderTabel() {
    const data = this.terfilter();
    const body = $('#siswaBody');
    $('#siswaCount').textContent = `${data.length} dari ${Store.siswa.length} siswa`;

    body.innerHTML = data.length
      ? data.map((s, i) => `<tr>
          <td>${i + 1}</td>
          <td class="nm">${esc(s.nama)}</td>
          <td>${esc(s.nis || '—')}</td>
          <td>${esc(s.jk || '—')}</td>
          <td><span class="pill">${esc(Store.namaKelas(s.kelasId))}</span></td>
          <td><div class="act-row">
            <button class="icon-btn ib-edit" data-act="edit" data-id="${s.id}" title="Ubah"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn ib-del" data-act="del" data-id="${s.id}" title="Hapus"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`).join('')
      : UI.kosong(6, 'Belum ada siswa',
          'Tambahkan satu per satu, atau impor sekaligus dari CSV.', 'fa-user-plus');

    UI.bertahap(body);
  },

  async hapusTerfilter() {
    const data = this.terfilter();
    if (!data.length) { UI.toast('Tidak ada siswa terfilter.', 'warn'); return; }
    const ok = await UI.konfirmasi('Hapus Siswa Terfilter',
      `${data.length} siswa akan dihapus permanen beserta riwayat absensinya. Lanjutkan?`, 'Ya, Hapus Semua');
    if (!ok) return;
    const buang = new Set(data.map(s => s.id));
    Store.siswa = Store.siswa.filter(s => !buang.has(s.id));
    Store.absen.forEach(a => { a.entri = (a.entri || []).filter(e => !buang.has(e.siswaId)); });
    Store.simpanSiswa(); Store.simpanAbsen();
    UI.toast(`${buang.size} siswa dihapus.`, 'ok');
    this.renderTabel();
    Kelas.renderTabel();
    Pengaturan.renderStat();
  },

  /* --- Impor massal --- */

  bacaBerkas(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      $('#imporTeks').value = String(reader.result || '');
      UI.toast(`Berkas "${file.name}" dimuat. Periksa lalu tekan Impor Siswa.`, 'info', 4000);
      $('#imporTeks').scrollIntoView({ behavior: 'smooth', block: 'center' });
      e.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  },

  /** Kata yang menandai baris judul, bukan nama siswa. */
  JUDUL: /^(no|nomor|urut|nama|nama siswa|nama lengkap|nis|nisn|name|jk|l\/p|p\/l|jenis kelamin|kelas|keterangan|ket)$/i,

  /** Ubah teks mentah (CSV atau tempelan) menjadi daftar {nama, nis}. */
  uraikan(teks) {
    // BOM dari Excel dibuang agar baris judul tetap terdeteksi
    const baris = String(teks).replace(/^﻿/, '').split(/\r?\n/)
      .map(b => b.trim()).filter(Boolean);

    const hasil = [];
    baris.forEach(b => {
      let kolom = b.split(/[;,\t]/)
        .map(k => k.trim().replace(/^"(.*)"$/, '$1').trim())
        .filter(Boolean);
      if (!kolom.length) return;

      // Baris yang seluruh selnya berupa kata judul diabaikan ("nama", "No;Nama;NIS", …)
      if (kolom.every(k => this.JUDUL.test(k))) return;

      // Kolom nomor urut di depan dibuang: "1", "1.", "1)"
      if (kolom.length > 1 && /^\d{1,3}[.)]?$/.test(kolom[0])) kolom = kolom.slice(1);
      if (!kolom.length) return;

      let nama = '', nis = '';
      if (/^\d{4,}$/.test(kolom[0]) && kolom[1]) {
        nis = kolom[0]; nama = kolom[1];              // NIS ditulis lebih dulu
      } else {
        nama = kolom[0];
        nis = /^\d{3,}$/.test(kolom[1] || '') ? kolom[1] : '';
      }
      if (nama) hasil.push({ nama, nis });
    });
    return hasil;
  },

  impor() {
    const kelasId = $('#imporKelas').value;
    if (!kelasId) { UI.toast('Pilih kelas tujuan terlebih dahulu.', 'err'); return; }

    const daftar = this.uraikan($('#imporTeks').value);
    if (!daftar.length) { UI.toast('Tidak ada nama yang terbaca. Periksa isi kotak impor.', 'err'); return; }

    const adaSekarang = new Set(Store.siswaKelas(kelasId).map(s => norm(s.nama)));
    let masuk = 0, lewat = 0;

    daftar.forEach(d => {
      if (adaSekarang.has(norm(d.nama))) { lewat++; return; }
      adaSekarang.add(norm(d.nama));
      Store.siswa.push({ id: uid(), kelasId, nama: d.nama, nis: d.nis || '', jk: 'L', ts: Date.now() });
      masuk++;
    });

    Store.simpanSiswa();
    $('#imporTeks').value = '';
    UI.toast(`${masuk} siswa masuk ke kelas ${Store.namaKelas(kelasId)}` +
             (lewat ? `, ${lewat} dilewati karena sudah ada.` : '.'), 'ok', 4500);
    this.renderTabel();
    Kelas.renderTabel();
    Pengaturan.renderStat();
  },

  template() {
    // Satu kolom "nama" saja — bentuk paling sederhana untuk diisi di Excel
    unduhCSV('template-data-siswa.csv', ['nama'],
      [['Intan Permata'], ['Intania Zahra'], ['Ahmad Fauzi'], ['Budi Santoso']]);
    UI.toast('Template CSV diunduh. Isi kolom nama lalu unggah kembali.', 'ok');
  },

  ekspor() {
    const data = this.terfilter();
    if (!data.length) { UI.toast('Tidak ada siswa untuk diekspor.', 'warn'); return; }
    unduhCSV(`data-siswa-${isoDate()}.csv`, ['No', 'Nama Siswa', 'NIS', 'L/P', 'Kelas'],
      data.map((s, i) => [i + 1, s.nama, s.nis || '', s.jk || '', Store.namaKelas(s.kelasId)]));
    UI.toast(`${data.length} data siswa diekspor.`, 'ok');
  },
};

/* ===== 11. HALAMAN REKAP ================================== */

const Rekap = {
  init() {
    $('#rekapBulan').value = isoMonth();
    $('#rekapBulan').addEventListener('change', () => this.render());
    $('#rekapKelas').addEventListener('change', () => this.render());
    $('#rekapKelasExport').addEventListener('click', () => this.eksporKelas());
    $('#rekapSiswaExport').addEventListener('click', () => this.eksporSiswa());
    $('#rekapPrint').addEventListener('click', () => {
      UI.toast('Menyiapkan dokumen cetak…', 'info', 1600);
      setTimeout(() => window.print(), 320);
    });
  },

  render() {
    UI.isiSelect($('#rekapKelas'),
      Store.kelasTerurut().map(k => ({ value: k.id, label: k.nama })), 'Semua kelas');

    const bulan = $('#rekapBulan').value || isoMonth();
    $('#printPeriod').textContent = bulanPanjang(bulan);
    this.renderKelas(bulan);
    this.renderSiswa(bulan);
  },

  /** Catatan pada bulan & kelas terpilih. */
  data(bulan) {
    const kelasId = $('#rekapKelas').value;
    return Store.absen.filter(a =>
      a.tanggal.startsWith(bulan) && (!kelasId || a.kelasId === kelasId));
  },

  /* --- Rekap per kelas --- */
  hitungKelas(bulan) {
    const data = this.data(bulan);
    const kelasId = $('#rekapKelas').value;
    const daftar = kelasId ? Store.kelas.filter(k => k.id === kelasId) : Store.kelasTerurut();

    return daftar.map(k => {
      const punya = data.filter(a => a.kelasId === k.id);
      const mungkin = punya.reduce((t, a) => t + num(a.total), 0);
      const hadir = punya.reduce((t, a) => t + hadirDari(a), 0);
      const c = {};
      ABSEN.forEach(s => { c[s.key] = punya.reduce((t, a) => t + jumlahStatus(a, s.key), 0); });
      return {
        nama: k.nama, wali: k.wali || '', hari: punya.length,
        siswa: Store.jumlahSiswa(k.id), hadir, ...c, mungkin,
        pct: persen(hadir, mungkin),
      };
    }).filter(r => r.hari > 0);
  },

  renderKelas(bulan) {
    const baris = this.hitungKelas(bulan);
    const hari = new Set(this.data(bulan).map(a => a.tanggal)).size;
    $('#rekapKelasInfo').textContent = `${baris.length} kelas • ${hari} hari tercatat`;

    const body = $('#rekapKelasBody');
    body.innerHTML = baris.length
      ? baris.map((r, i) => `<tr>
          <td>${i + 1}</td>
          <td class="nm">${esc(r.nama)}</td>
          <td>${esc(r.wali || '—')}</td>
          <td>${r.hari}</td>
          <td>${r.siswa}</td>
          <td><strong>${r.hadir}</strong></td>
          ${ABSEN.map(s => `<td>${r[s.key]}</td>`).join('')}
          <td>${UI.badgePersen(r.pct)}</td>
        </tr>`).join('')
      : UI.kosong(10, 'Belum ada data pada periode ini',
          'Pilih bulan lain atau isi absensi terlebih dahulu.', 'fa-chart-simple');

    $('#rekapKelasFoot').innerHTML = baris.length ? (() => {
      const t = k => baris.reduce((s, r) => s + r[k], 0);
      return `<tr><td colspan="3">JUMLAH</td><td>${hari}</td><td>${t('siswa')}</td>
        <td>${t('hadir')}</td>${ABSEN.map(s => `<td>${t(s.key)}</td>`).join('')}
        <td>${persen(t('hadir'), t('mungkin'))}%</td></tr>`;
    })() : '';

    UI.bertahap(body);
  },

  /* --- Rekap per siswa --- */
  hitungSiswa(bulan) {
    const data = this.data(bulan);
    // Jumlah hari tercatat untuk tiap kelas
    const hariKelas = new Map();
    data.forEach(a => hariKelas.set(a.kelasId, (hariKelas.get(a.kelasId) || 0) + 1));

    const kelasId = $('#rekapKelas').value;
    const daftar = kelasId ? Store.siswaKelas(kelasId) : Store.siswaTerurut();

    return daftar.map(s => {
      const hari = hariKelas.get(s.kelasId) || 0;
      const c = {};
      ABSEN.forEach(st => { c[st.key] = 0; });
      data.filter(a => a.kelasId === s.kelasId).forEach(a => {
        const e = (a.entri || []).find(x => x.siswaId === s.id);
        if (e && c[e.status] !== undefined) c[e.status]++;
      });
      const absen = ABSEN.reduce((t, st) => t + c[st.key], 0);
      return {
        nama: s.nama, nis: s.nis || '', kelas: Store.namaKelas(s.kelasId),
        hari, hadir: Math.max(0, hari - absen), ...c, absen,
        pct: persen(Math.max(0, hari - absen), hari),
      };
    })
      .filter(r => r.hari > 0)
      .sort((a, b) => b.absen - a.absen || bandingNama(a.kelas, b.kelas) || bandingNama(a.nama, b.nama));
  },

  renderSiswa(bulan) {
    const baris = this.hitungSiswa(bulan);
    const bermasalah = baris.filter(r => r.absen > 0).length;
    $('#rekapSiswaInfo').textContent = baris.length
      ? `${baris.length} siswa • ${bermasalah} pernah tidak masuk` : '—';

    const body = $('#rekapSiswaBody');
    body.innerHTML = baris.length
      ? baris.map((r, i) => `<tr>
          <td>${i + 1}</td>
          <td class="nm">${esc(r.nama)}</td>
          <td>${esc(r.kelas)}</td>
          <td>${r.hari}</td>
          <td><strong>${r.hadir}</strong></td>
          ${ABSEN.map(s => `<td>${r[s.key]}</td>`).join('')}
          <td><strong>${r.absen}</strong></td>
          <td>${UI.badgePersen(r.pct)}</td>
        </tr>`).join('')
      : UI.kosong(10, 'Belum ada data pada periode ini',
          'Pilih bulan lain atau isi absensi terlebih dahulu.', 'fa-user-graduate');

    UI.bertahap(body);
  },

  eksporKelas() {
    const bulan = $('#rekapBulan').value || isoMonth();
    const baris = this.hitungKelas(bulan);
    if (!baris.length) { UI.toast('Tidak ada data pada periode ini.', 'warn'); return; }
    unduhCSV(`rekap-per-kelas-${bulan}.csv`,
      ['No', 'Kelas', 'Wali Kelas', 'Hari Tercatat', 'Jumlah Siswa', 'Hadir',
       ...ABSEN.map(s => s.key), '% Kehadiran'],
      baris.map((r, i) => [i + 1, r.nama, r.wali, r.hari, r.siswa, r.hadir,
        ...ABSEN.map(s => r[s.key]), r.pct + '%']));
    UI.toast(`Rekap per kelas ${bulanPanjang(bulan)} diekspor.`, 'ok');
  },

  eksporSiswa() {
    const bulan = $('#rekapBulan').value || isoMonth();
    const baris = this.hitungSiswa(bulan);
    if (!baris.length) { UI.toast('Tidak ada data pada periode ini.', 'warn'); return; }
    unduhCSV(`rekap-per-siswa-${bulan}.csv`,
      ['No', 'Nama Siswa', 'NIS', 'Kelas', 'Hari Tercatat', 'Hadir',
       ...ABSEN.map(s => s.key), 'Total Absen', '% Kehadiran'],
      baris.map((r, i) => [i + 1, r.nama, r.nis, r.kelas, r.hari, r.hadir,
        ...ABSEN.map(s => r[s.key]), r.absen, r.pct + '%']));
    UI.toast(`Rekap per siswa ${bulanPanjang(bulan)} diekspor.`, 'ok');
  },
};

/* ===== 12. HALAMAN PENGATURAN ============================= */

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
    UI.hitungAngka($('#dbSiswa'), Store.siswa.length);
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
      versi: 2,
      dibuat: new Date().toISOString(),
      setting: Store.setting,
      kelas: Store.kelas,
      siswa: Store.siswa,
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
        if (!Array.isArray(d.kelas) || !Array.isArray(d.siswa) || !Array.isArray(d.absen)) {
          throw new Error('format');
        }
        const ok = await UI.konfirmasi('Pulihkan Cadangan',
          `Berkas memuat ${d.kelas.length} kelas, ${d.siswa.length} siswa, dan ${d.absen.length} catatan. ` +
          'Seluruh data saat ini akan diganti.', 'Ya, Pulihkan');
        if (!ok) return;
        Store.kelas = d.kelas;
        Store.siswa = d.siswa;
        Store.absen = d.absen;
        Store.setting = { ...Store.SETTING_DEFAULT, ...(d.setting || {}) };
        Store.simpanKelas(); Store.simpanSiswa(); Store.simpanAbsen(); Store.simpanSetting();
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
    if (Store.kelas.length || Store.siswa.length) {
      const ok = await UI.konfirmasi('Muat Data Contoh',
        'Data contoh akan menimpa seluruh data yang ada. Lanjutkan?', 'Ya, Muat Contoh');
      if (!ok) return;
    }
    const d = buatDataContoh();
    Store.kelas = d.kelas;
    Store.siswa = d.siswa;
    Store.absen = d.absen;
    Store.simpanKelas(); Store.simpanSiswa(); Store.simpanAbsen();
    UI.toast(`Data contoh dimuat: ${d.kelas.length} kelas, ${d.siswa.length} siswa.`, 'ok');
    renderSemua();
    Router.buka('dashboard');
  },

  async hapusSemua() {
    const ok = await UI.konfirmasi('Hapus Semua Data',
      'Seluruh data kelas, siswa, absensi, dan pengaturan akan dihapus permanen dari browser ini. ' +
      'Tindakan tidak dapat dibatalkan.', 'Ya, Hapus Semua');
    if (!ok) return;
    [Store.KEY_KELAS, Store.KEY_SISWA, Store.KEY_ABSEN, Store.KEY_SET]
      .forEach(k => localStorage.removeItem(k));
    Store.muat();
    UI.toast('Seluruh data telah dihapus.', 'ok');
    renderSemua();
  },
};

/* ===== DATA CONTOH ======================================== */

function buatDataContoh() {
  const kelasDaftar = [
    ['I A',  'Siti Maryam, S.Pd.'],
    ['I B',  'Nur Hidayah, S.Pd.'],
    ['II A', 'Dewi Lestari, S.Pd.'],
    ['III',  'Rahmat Hidayat, S.Pd.'],
    ['IV',   'Muhammad Ridwan, S.Pd.'],
    ['V',    'Aisyah Rahmawati, S.Pd.'],
    ['VI',   'Yusuf Maulana, S.Pd.'],
  ];
  const kelas = kelasDaftar.map(([nama, wali], i) => ({ id: `k${i}`, nama, wali, ts: Date.now() }));

  // Nama contoh; awalan "Int…" sengaja diulang untuk menguji saran otomatis
  const namaP = ['Intan', 'Intania', 'Indah', 'Aisyah', 'Anisa', 'Citra', 'Dewi',
                 'Fatimah', 'Hana', 'Jihan', 'Laila', 'Nabila', 'Putri', 'Rara',
                 'Salsabila', 'Vania', 'Yasmin'];
  const namaL = ['Ahmad', 'Budi', 'Bayu', 'Dimas', 'Fauzan', 'Gilang', 'Hafiz',
                 'Ilham', 'Khalid', 'Muhammad', 'Naufal', 'Rizki', 'Taufik',
                 'Umar', 'Wildan'];
  const margaP = ['Permata', 'Zahra', 'Safitri', 'Anggraini', 'Lestari', 'Kusuma'];
  const margaL = ['Pratama', 'Ramadhan', 'Nugroho', 'Hidayat', 'Wijaya',
                  'Saputra', 'Maulana', 'Firdaus'];

  const siswa = [];
  kelas.forEach((k, ki) => {
    const jumlah = 24 + (ki % 5);
    for (let i = 0; i < jumlah; i++) {
      const perempuan = i % 2 === 1;
      const depan = perempuan ? namaP : namaL;
      const marga  = perempuan ? margaP : margaL;
      siswa.push({
        id: `s${ki}-${i}`, kelasId: k.id,
        nama: `${depan[(ki * 5 + i) % depan.length]} ${marga[(ki * 3 + i) % marga.length]}`,
        nis: `2024${String(ki + 1).padStart(2, '0')}${String(i + 1).padStart(2, '0')}`,
        jk: perempuan ? 'P' : 'L',
        ts: Date.now(),
      });
    }
  });

  // 14 hari sekolah terakhir; pola tetap agar hasil dapat diulang
  const absen = [];
  const hariSekolah = Store.setting.hariSekolah?.length ? Store.setting.hariSekolah : [1, 2, 3, 4, 5, 6];
  const alasan = { Sakit: 'Demam', Izin: 'Acara keluarga', Alpa: 'Tanpa keterangan' };
  const d = new Date();
  let terisi = 0;

  while (terisi < 14) {
    if (hariSekolah.includes(d.getDay())) {
      const tanggal = isoDate(d);
      kelas.forEach((k, ki) => {
        const anak = siswa.filter(s => s.kelasId === k.id);
        const entri = [];
        anak.forEach((s, si) => {
          const p = (terisi * 13 + ki * 7 + si * 5) % 47;
          const status = p === 3 ? 'Sakit' : p === 11 ? 'Izin' : p === 29 ? 'Alpa' : null;
          if (status) entri.push({ siswaId: s.id, status, ket: alasan[status] });
        });
        absen.push({
          id: `a${terisi}-${ki}`, tanggal, kelasId: k.id, total: anak.length,
          guru: 'Guru Piket', entri, ts: Date.now(),
        });
      });
      terisi++;
    }
    d.setDate(d.getDate() - 1);
  }

  return { kelas, siswa, absen };
}

/* ===== 13. INIT =========================================== */

function renderSemua() {
  Beranda.render();
  Input.render();
  Riwayat.render();
  Kelas.render();
  Siswa.render();
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
  Siswa.init();
  Rekap.init();
  Pengaturan.init();
  Router.init();

  renderSemua();
  UI.pasangReveal();

  if (!Store.kelas.length && !Store.siswa.length) {
    setTimeout(() => UI.toast(
      'Selamat datang! Mulai dari Data Kelas, lalu Data Siswa. Ingin mencoba dahulu? Muat Data Contoh di Pengaturan.',
      'info', 7000), 700);
  }
}

document.addEventListener('DOMContentLoaded', init);
