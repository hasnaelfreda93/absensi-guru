# Absensi & Jurnal — SDI Assuryaniyah

Aplikasi web internal yang **wajib login dengan akun Google** sebelum terbuka.
Setelah masuk, tersedia **dua menu utama yang dipilih di awal** (dan bisa
diganti kapan saja lewat tombol *Ganti Menu*):

1. **Absensi Siswa** — guru mendata kelas dan nama siswa sekali, lalu setiap
   hari cukup menandai **S** (sakit), **I** (izin), atau **A** (alpa) pada nama
   siswa yang tidak masuk; sisanya otomatis hadir.
2. **Jurnal Harian** — catatan kegiatan mengajar: identitas guru, kelas, mapel,
   jam, metode, materi, tujuan, jumlah hadir/tidak hadir, refleksi, kendala,
   dan tindak lanjut.

Berjalan sepenuhnya di browser tanpa server sendiri: seluruh pengolahan data
terjadi di perangkat, dan penyimpanannya memakai Google Drive akun yang login.
Siap dihosting di GitHub Pages.

## Login Google (gerbang aplikasi)

Halaman pertama yang muncul adalah **layar masuk** — header, menu, dan seluruh
halaman baru tampil setelah login berhasil.

- Tekan **Masuk dengan Google**, pilih akun, lalu izinkan akses Drive.
- Login diingat: selama sesi Google di browser masih aktif, pembukaan
  berikutnya masuk sendiri tanpa dialog (layar *Memeriksa sesi Google…*).
- Akun yang sedang dipakai ditampilkan di bilah menu; tombol **Keluar**
  ada di menu yang sama, bersebelahan dengan *Ganti Menu*.
- **Keluar** mencabut izin dan mengunci aplikasi kembali ke layar masuk.
  Data yang sudah dikirim ke Drive tetap aman dan kembali saat masuk lagi.
- Bila sesi Google berakhir di tengah pemakaian, aplikasi terkunci lagi dan
  meminta masuk ulang.

> Login memerlukan alamat `http(s)://` — membuka `index.html` langsung dari
> berkas (`file://`) ditolak Google, jadi pakai server lokal atau GitHub Pages
> (lihat *Menjalankan lokal*).

## Halaman — menu Absensi

| Menu | Kegunaan |
| --- | --- |
| **Beranda** | Ringkasan hari ini, cincin persentase kehadiran bulan berjalan, daftar nama siswa yang tidak masuk, dan status pengisian tiap kelas. |
| **Input Absensi** | Pilih tanggal dan kelas, lalu tandai H/S/I/A per nama siswa. Ada kotak **cari nama dengan saran otomatis** (ketik `int` → muncul Intan, Intania, …), ringkasan langsung di atas tabel, dan tombol *Tandai Semua Hadir*. Mendukung **pengisian susulan (backdate)**: navigasi *Hari sebelumnya / Hari ini*, penanda tanggal lampau, waktu terakhir disimpan, dan panel **Tanggal Belum Lengkap** (30 hari terakhir) yang bisa diklik untuk langsung mengisi. Tanggal setelah hari ini dikunci. |
| **Riwayat** | Semua catatan tersimpan beserta **nama siswa yang tidak masuk**, filter rentang tanggal / kelas / nama, dan dua bentuk ekspor Excel. |
| **Data Kelas** | Tambah, ubah, hapus kelas dan wali kelas. Jumlah siswa terhitung otomatis. |
| **Data Siswa** | Tambah siswa satu per satu, atau **impor banyak sekaligus dari berkas Excel** — kolom Nama / NIS / L-P dikenali otomatis dari baris judul. Pencarian, ekspor Excel, dan template Excel. |
| **Rekap** | Rekap per kelas dan **rekap per siswa** (diurutkan dari yang paling sering tidak masuk), ekspor Excel, cetak/PDF berkop sekolah, serta **Ekspor Absensi per Tanggal**: Excel satu baris per siswa dengan kolom tanggal 01–31 berisi H/S/I/A plus jumlah, persentase, dan baris kesimpulan. |
| **Pengaturan** | Hari sekolah (hari efektif). Tampil di kedua menu. |

## Halaman — menu Jurnal

| Menu | Kegunaan |
| --- | --- |
| **Isi Jurnal** | Formulir jurnal harian. Identitas guru (nama dan status — Wali Kelas / Guru Kelas / Guru Mapel) **diingat otomatis** untuk pengisian berikutnya. Bila kelas dan tanggal cocok dengan catatan absensi, **jumlah hadir/tidak hadir terisi otomatis** (tetap bisa diubah). Tanggal setelah hari ini dikunci. |
| **Riwayat Jurnal** | Daftar jurnal tersimpan, filter rentang tanggal dan kata kunci, ubah/hapus, ekspor Excel lengkap, serta **Laporan Bulanan**: satu baris per tanggal (01 sampai akhir bulan) — tanggal tanpa jurnal tetap tampil kosong agar terlihat mana yang belum diisi. |

## Impor daftar siswa (Excel)

Siapkan berkas Excel dengan baris judul, lalu unggah — kolom dikenali otomatis:

| Nama | NIS | L/P |
| --- | --- | --- |
| Intan Permata | 2024001 | P |
| Ahmad Fauzi | | L |

`Nama` wajib; `NIS` dan `L/P` boleh kosong — berkas berisi `Nama` + `L/P` saja
pun langsung terbaca. Yang ditangani otomatis: kolom nomor urut di depan,
berkas tanpa baris judul (isi sel ditebak dari bentuknya), serta nama yang
sudah ada di kelas tersebut (dilewati, tidak menggandakan).
Tekan **Unduh Template Excel** untuk mendapatkan berkas contoh.

## Catatan perilaku

- **Satu kelas satu catatan per tanggal** — mengisi ulang tanggal yang sama (termasuk susulan) akan memperbarui catatan, bukan menggandakan.
- **Tanggal setelah hari ini tidak bisa diisi** — input dikunci ke hari ini dan tanggal lampau.
- **Ramah ponsel** — di layar sempit tabel input berubah menjadi kartu per siswa dengan tombol H/S/I/A besar yang nyaman disentuh; seluruh halaman bebas guliran mendatar.
- Hanya siswa yang **tidak** hadir yang disimpan, sehingga data tetap ringkas: 7 kelas / 179 siswa / 14 hari ≈ 37 KB.
- **Jumlah siswa dicuplik saat penyimpanan**, sehingga rekap bulan lalu tidak berubah ketika daftar siswa diperbarui.
- Seluruh laporan diekspor sebagai **Excel (.xlsx)** berjudul rapi dan diakhiri bagian **KESIMPULAN** (rata-rata kehadiran, total per status, siswa dengan absen ≥ 10%, dst.).
- Data dikerjakan di `localStorage` browser dan **disinkronkan ke Google Drive** akun yang login (lihat bagian di bawah) — tidak ada server lain.
- **Aplikasi terkunci sampai login berhasil**; data lokal perangkat tetap utuh setelah *Keluar* dan dipakai lagi saat masuk kembali.

## Sinkronisasi Google Drive

Berjalan otomatis begitu login berhasil — tidak ada lagi pengaturan yang perlu
disentuh. Inilah penyimpanan utama sekaligus cadangan aplikasi:

- Aplikasi membuat jalur
  `sdi-assuryaniyah/data-aplikasi-jurnal-absen/data-aplikasi-jurnal-absen.json`
  di Drive akun yang login (scope `drive.file` — aplikasi hanya bisa menyentuh
  berkas buatannya sendiri, bukan seluruh isi Drive).
- Setiap perubahan **menimpa berkas yang sama** (tidak menumpuk berkas baru),
  dikirim otomatis beberapa detik setelah perubahan.
- Saat aplikasi dibuka, data dibandingkan berdasarkan cap waktu — **yang lebih
  baru dipakai** (Drive → perangkat, atau perangkat → Drive).
- Karena itu pekerjaan bisa dilanjutkan dari perangkat lain cukup dengan
  masuk memakai akun Google yang sama.

**Setup sekali oleh admin** (± 5 menit, gratis) di
[console.cloud.google.com](https://console.cloud.google.com):

1. Buat project baru → **Enable API** → aktifkan *Google Drive API*.
2. **OAuth consent screen** → External → isi nama aplikasi → **Publish**.
   Selama masih *Testing*, hanya akun yang terdaftar sebagai *Test users*
   yang bisa masuk — dan tanpa bisa masuk, aplikasi tidak terbuka sama sekali.
3. **Credentials → Create Credentials → OAuth Client ID** → tipe *Web application*
   → pada *Authorized JavaScript origins* tambahkan alamat aplikasi
   (`https://<username>.github.io`).
4. Salin **Client ID** → isi konstanta `Drive.CLIENT_ID` di `assets/js/app.js`
   (sudah terisi untuk deployment saat ini; ganti hanya bila berpindah
   project/akun Google Cloud).

## Struktur berkas

```
.
├── index.html              # Gerbang login, header, nav, 8 halaman, footer
├── assets/
│   ├── css/style.css       # Tema — warna & font mengikuti identitas sekolah
│   ├── js/app.js           # Logika aplikasi, modul bernomor 1–13
│   ├── js/vendor/xlsx.full.min.js  # SheetJS — baca/tulis berkas Excel (offline)
│   └── img/logo.png        # Logo SDI Assuryaniyah
├── .nojekyll
└── README.md
```

`assets/js/app.js` disusun berurutan agar mudah ditelusuri:

```
1. KONSTANTA   5. MODE & ROUTER   9.  HAL. DATA KELAS   11b. HAL. JURNAL
2. UTIL        6. HAL. BERANDA    10. HAL. DATA SISWA   12.  HAL. PENGATURAN
3. STORE       7. HAL. INPUT      11. HAL. REKAP        12b. LOGIN & DRIVE
4. UI          8. HAL. RIWAYAT                          13.  INIT
```

Gerbang login ada di modul **12b** (`Drive`): ia yang menahan aplikasi sebelum
masuk, membuka kelas `masuk` pada `<body>` setelah berhasil, dan menangani
tombol *Keluar* di bilah menu.

## Menjalankan lokal

Harus lewat server (bukan klik ganda `index.html`), karena login Google menolak
origin `file://`:

```bash
python -m http.server 8000   # lalu buka http://localhost:8000
```

Agar login berhasil, `http://localhost:8000` juga perlu terdaftar pada
*Authorized JavaScript origins* di Google Cloud Console.

## Hosting ke GitHub Pages

1. Unggah seluruh berkas ke repositori GitHub:

   ```bash
   git remote add origin https://github.com/<username>/<nama-repo>.git
   git push -u origin main
   ```

2. Buka **Settings → Pages** → **Deploy from a branch** → branch **main**, folder **/ (root)** → **Save**.
3. Aplikasi tersedia di `https://<username>.github.io/<nama-repo>/`.

Seluruh tautan aset bersifat relatif, jadi aplikasi bekerja baik di root domain
maupun di subfolder repositori.

## Pemakaian pertama

1. **Masuk dengan Google** pada layar awal, lalu pilih menu (Absensi / Jurnal).
2. **Data Kelas** → masukkan seluruh kelas beserta wali kelasnya.
3. **Data Siswa** → pilih kelas, lalu impor daftar nama dari berkas Excel.
4. Setiap hari, **Input Absensi** → pilih kelas → klik S/I/A pada yang tidak masuk → **Simpan Absensi**.
5. Akhir bulan, **Rekap** → **Ekspor Excel** atau **Cetak / PDF**.

> **Penting:** pakailah akun Google yang sama di setiap perangkat — data
> tersimpan di `sdi-assuryaniyah/data-aplikasi-jurnal-absen/` pada Drive akun
> tersebut, dan itulah yang ditarik kembali saat masuk dari perangkat lain.
