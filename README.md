# Absensi Siswa — SDI Assuryaniyah

Aplikasi web absensi siswa untuk pemakaian internal. Guru mendata kelas dan nama
siswa sekali, lalu setiap hari cukup menandai **S** (sakit), **I** (izin), atau
**A** (alpa) pada nama siswa yang tidak masuk — sisanya otomatis hadir.
Berjalan sepenuhnya di browser (*offline*), tanpa server dan tanpa login, siap
dihosting di GitHub Pages.

## Halaman

| Menu | Kegunaan |
| --- | --- |
| **Beranda** | Ringkasan hari ini, cincin persentase kehadiran bulan berjalan, daftar nama siswa yang tidak masuk, dan status pengisian tiap kelas. |
| **Input Absensi** | Pilih tanggal dan kelas, lalu tandai H/S/I/A per nama siswa. Ada kotak **cari nama dengan saran otomatis** (ketik `int` → muncul Intan, Intania, …), ringkasan langsung di atas tabel, dan tombol *Tandai Semua Hadir*. |
| **Riwayat** | Semua catatan tersimpan beserta **nama siswa yang tidak masuk**, filter rentang tanggal / kelas / nama, dan dua bentuk ekspor CSV. |
| **Data Kelas** | Tambah, ubah, hapus kelas dan wali kelas. Jumlah siswa terhitung otomatis. |
| **Data Siswa** | Tambah siswa satu per satu, atau **impor banyak sekaligus** dari berkas CSV / tempelan daftar nama. Pencarian, ekspor CSV, dan template CSV. |
| **Rekap** | Rekap per kelas dan **rekap per siswa** (diurutkan dari yang paling sering tidak masuk), ekspor CSV, cetak/PDF berkop sekolah. |
| **Pengaturan** | Hari sekolah, cadangan & pemulihan data (JSON), data contoh, hapus semua data. |

## Impor daftar siswa

Bentuk paling sederhana — satu kolom nama, boleh diawali baris judul `nama`:

```
nama
Intan Permata
Intania Zahra
Ahmad Fauzi
```

Bila ingin sekalian NIS, tulis `Nama;NIS` (pemisah boleh `;` `,` atau Tab).
Yang ditangani otomatis: baris judul, BOM dari Excel, kolom nomor urut di depan
(`1;Intan;2024001`), NIS yang ditulis lebih dulu, sel berkutip, baris kosong,
serta nama yang sudah ada di kelas tersebut (dilewati, tidak menggandakan).
Tekan **Unduh Template CSV** untuk mendapatkan berkas contoh.

## Catatan perilaku

- **Satu kelas satu catatan per tanggal** — mengisi ulang tanggal yang sama akan memperbarui catatan, bukan menggandakan.
- Hanya siswa yang **tidak** hadir yang disimpan, sehingga data tetap ringkas: 7 kelas / 179 siswa / 14 hari ≈ 37 KB.
- **Jumlah siswa dicuplik saat penyimpanan**, sehingga rekap bulan lalu tidak berubah ketika daftar siswa diperbarui.
- Seluruh ekspor CSV memakai pemisah `;` dan BOM UTF-8, jadi langsung rapi saat dibuka di Excel.
- Data disimpan di `localStorage` browser dan **tidak dikirim ke server mana pun**.

## Struktur berkas

```
.
├── index.html              # Kerangka halaman (header, nav, 7 halaman, footer)
├── assets/
│   ├── css/style.css       # Tema — warna & font mengikuti identitas sekolah
│   ├── js/app.js           # Logika aplikasi, modul bernomor 1–13
│   └── img/logo.png        # Logo SDI Assuryaniyah
├── .nojekyll
└── README.md
```

`assets/js/app.js` disusun berurutan agar mudah ditelusuri:

```
1. KONSTANTA   5. ROUTER         9.  HAL. DATA KELAS   13. INIT
2. UTIL        6. HAL. BERANDA   10. HAL. DATA SISWA
3. STORE       7. HAL. INPUT     11. HAL. REKAP
4. UI          8. HAL. RIWAYAT   12. HAL. PENGATURAN
```

## Menjalankan lokal

Cukup buka `index.html` di browser, atau:

```bash
python -m http.server 8000   # lalu buka http://localhost:8000
```

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

1. **Data Kelas** → masukkan seluruh kelas beserta wali kelasnya.
2. **Data Siswa** → pilih kelas, lalu impor daftar nama dari CSV atau tempelkan.
   Ingin mencoba dahulu? Tekan **Muat Data Contoh** di halaman Pengaturan.
3. Setiap hari, **Input Absensi** → pilih kelas → klik S/I/A pada yang tidak masuk → **Simpan Absensi**.
4. Akhir bulan, **Rekap** → **Ekspor CSV** atau **Cetak / PDF**.
5. Unduh **Cadangan (JSON)** secara berkala dari halaman Pengaturan.

> **Penting:** data tersimpan per browser per perangkat. Membersihkan data situs
> atau berpindah perangkat akan menghilangkan catatan — selalu simpan cadangan JSON.
