# Absensi Siswa — SDI Assuryaniyah

Aplikasi web absensi siswa untuk pemakaian internal. Guru cukup mengisi jumlah
**sakit, izin, dan alpa** tiap kelas setiap hari — jumlah hadir terhitung
otomatis. Berjalan sepenuhnya di browser (*offline*), tanpa server dan tanpa
login, siap dihosting di GitHub Pages.

## Halaman

| Menu | Kegunaan |
| --- | --- |
| **Beranda** | Ringkasan hari ini (total siswa, hadir, sakit, izin, alpa, kelas yang belum input), cincin persentase kehadiran bulan berjalan, dan status pengisian tiap kelas. |
| **Input Absensi** | Pilih tanggal, lalu isi angka Sakit/Izin/Alpa untuk seluruh kelas dalam satu tabel. Kolom Hadir dan baris JUMLAH terhitung langsung. Tombol *Hari Ini*, *Nolkan Semua*, dan satu tombol **Simpan Absensi**. |
| **Riwayat** | Seluruh catatan tersimpan, filter rentang tanggal / kelas / keterangan, ubah, hapus, ekspor CSV. |
| **Data Kelas** | Tambah, ubah, hapus kelas beserta wali kelas dan jumlah siswa. |
| **Rekap** | Rekapitulasi bulanan per kelas (hari tercatat, hadir, sakit, izin, alpa, % kehadiran), ekspor CSV, cetak/PDF. |
| **Pengaturan** | Hari sekolah, cadangan & pemulihan data (JSON), data contoh, hapus semua data. |

Catatan perilaku:

- **Satu kelas satu catatan per tanggal** — mengisi ulang tanggal yang sama akan memperbarui catatan, bukan menggandakan.
- **Jumlah siswa dicuplik saat penyimpanan**, sehingga rekap bulan lalu tidak berubah ketika jumlah siswa kelas diperbarui.
- Isian yang melebihi jumlah siswa ditolak dan ditandai merah sebelum penyimpanan.
- Data disimpan di `localStorage` browser dan **tidak dikirim ke server mana pun**.

## Struktur berkas

```
.
├── index.html              # Kerangka halaman (header, nav, 6 halaman, footer)
├── assets/
│   ├── css/style.css       # Tema — warna & font mengikuti identitas sekolah
│   ├── js/app.js           # Logika aplikasi, modul bernomor 1–12
│   └── img/logo.png        # Logo SDI Assuryaniyah
├── .nojekyll
└── README.md
```

`assets/js/app.js` disusun berurutan agar mudah ditelusuri:

```
1. KONSTANTA     5. ROUTER        9.  HAL. DATA KELAS
2. UTIL          6. HAL. BERANDA  10. HAL. REKAP
3. STORE         7. HAL. INPUT    11. HAL. PENGATURAN
4. UI            8. HAL. RIWAYAT  12. INIT
```

## Menjalankan lokal

Cukup buka `index.html` di browser, atau:

```bash
python -m http.server 8000   # lalu buka http://localhost:8000
```

## Hosting ke GitHub Pages

1. Unggah seluruh berkas ke repositori GitHub:

   ```bash
   git init
   git add .
   git commit -m "Aplikasi Absensi Siswa SDI Assuryaniyah"
   git branch -M main
   git remote add origin https://github.com/<username>/<nama-repo>.git
   git push -u origin main
   ```

2. Buka **Settings → Pages** → **Deploy from a branch** → branch **main**, folder **/ (root)** → **Save**.
3. Aplikasi tersedia di `https://<username>.github.io/<nama-repo>/`.

Seluruh tautan aset bersifat relatif, jadi aplikasi bekerja baik di root domain
maupun di subfolder repositori.

## Pemakaian pertama

1. Buka **Data Kelas** → masukkan seluruh kelas beserta jumlah siswa.
   Ingin mencoba dahulu? Tekan **Muat Data Contoh** di halaman Pengaturan.
2. Setiap hari, buka **Input Absensi** → isi angka S/I/A → **Simpan Absensi**.
3. Akhir bulan, buka **Rekap** → **Ekspor CSV** atau **Cetak / PDF**.
4. Unduh **Cadangan (JSON)** secara berkala dari halaman Pengaturan.

> **Penting:** data tersimpan per browser. Membersihkan data situs atau
> berpindah perangkat akan menghilangkan catatan — selalu simpan cadangan JSON.
