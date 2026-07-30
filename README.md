# Absensi Guru — SDI ASSURYANIYAH BEKASI

Aplikasi web pencatatan kehadiran guru dan tenaga kependidikan
**SDI ASSURYANIYAH BEKASI**. Berjalan sepenuhnya di peramban (*offline-first*),
tanpa server dan tanpa login — siap dihosting di GitHub Pages.

Gaya visual, logo, dan identitas mengikuti situs resmi sekolah
[sdi-assuryaniyah.sch.id](https://sdi-assuryaniyah.sch.id/).

---

## Fitur

| Menu | Kegunaan |
| --- | --- |
| **Beranda** | Ringkasan kehadiran hari ini, cincin persentase kehadiran bulan berjalan, dan daftar absensi terakhir. |
| **Absensi Harian** | Formulir kehadiran, panel **Absen Cepat** untuk mencatat banyak guru sekaligus, riwayat lengkap dengan pencarian dan filter tanggal/status, ekspor CSV. |
| **Data Guru** | Tambah, ubah, hapus data guru & tenaga kependidikan (nama, NIP/NIY, NUPTK, jabatan, mapel, kelas, status kepegawaian, no. HP). |
| **Rekap & Laporan** | Rekapitulasi bulanan per guru (H, T, I, S, DL, C, A), persentase kehadiran, ekspor CSV, dan cetak/PDF berkop sekolah lengkap dengan kolom tanda tangan. |
| **Pengaturan** | Identitas sekolah, tahun pelajaran, batas jam masuk, hari kerja, nama kepala sekolah & operator, serta cadangan/pemulihan data. |

Catatan teknis:

- **Deteksi keterlambatan otomatis** — jam masuk yang melewati *Batas Jam Masuk*
  akan mengubah status menjadi *Terlambat*.
- **Satu guru satu catatan per tanggal** — input berulang memperbarui catatan yang ada.
- **Total Hadir** = Hadir + Terlambat + Dinas Luar. Persentase dihitung dari
  jumlah hari yang tercatat pada bulan tersebut.
- Data disimpan di `localStorage` peramban dan **tidak dikirim ke server mana pun**.

## Struktur berkas

```
.
├── index.html              # Kerangka halaman (topbar, header, nav, 5 halaman, footer)
├── assets/
│   ├── css/style.css       # Tema — token warna diambil dari situs resmi sekolah
│   ├── js/app.js           # Logika aplikasi, terbagi menjadi modul bernomor
│   └── img/logo.png        # Logo resmi SDI Assuryaniyah Bekasi
├── .nojekyll               # Agar GitHub Pages menyajikan berkas apa adanya
└── README.md
```

`assets/js/app.js` disusun berurutan agar mudah ditelusuri:

```
1. KONSTANTA        6. HAL. DASHBOARD     11. INIT
2. UTIL             7. HAL. ABSENSI
3. STORE            8. HAL. DATA GURU
4. UI               9. HAL. REKAP
5. ROUTER          10. HAL. PENGATURAN
```

## Menjalankan secara lokal

Cukup buka `index.html` di peramban. Bila ingin melalui server lokal:

```bash
python -m http.server 8000
# lalu buka http://localhost:8000
```

## Hosting ke GitHub Pages

1. Buat repositori baru di GitHub, lalu unggah seluruh berkas:

   ```bash
   git init
   git add .
   git commit -m "Aplikasi Absensi Guru SDI Assuryaniyah Bekasi"
   git branch -M main
   git remote add origin https://github.com/<username>/<nama-repo>.git
   git push -u origin main
   ```

2. Buka **Settings → Pages** pada repositori tersebut.
3. Bagian **Build and deployment → Source**, pilih **Deploy from a branch**.
4. Pilih branch **main**, folder **/ (root)**, lalu **Save**.
5. Tunggu satu hingga dua menit. Aplikasi tersedia di:

   ```
   https://<username>.github.io/<nama-repo>/
   ```

Seluruh tautan aset bersifat relatif, sehingga aplikasi bekerja baik di root
domain maupun di subfolder repositori.

## Pemakaian pertama kali

1. Buka **Pengaturan** → atur *Batas Jam Masuk*, *Hari Kerja*, tahun pelajaran,
   serta nama kepala sekolah dan operator untuk tanda tangan laporan.
2. Buka **Data Guru** → masukkan seluruh guru dan tenaga kependidikan.
   Ingin mencoba lebih dulu? Tekan **Muat Data Contoh** di halaman Pengaturan.
3. Setiap hari, buka **Absensi Harian** dan gunakan panel **Absen Cepat**.
4. Akhir bulan, buka **Rekap & Laporan** → **Ekspor CSV** atau **Cetak / PDF**.
5. Unduh **Cadangan (JSON)** secara berkala dari halaman Pengaturan.

> **Penting:** karena data tersimpan di peramban, membersihkan data situs atau
> berpindah perangkat akan menghilangkan catatan. Selalu simpan cadangan JSON.

---

© 2020–2026 SDI ASSURYANIYAH BEKASI — Powered by Team IT Assuryaniyah
