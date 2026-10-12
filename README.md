# Qur’anLoop

**Dengarkan. Ulangi. Hafalkan.**

Teman sederhana untuk membantu menghafal ayat Al-Qur'an melalui pengulangan audio.
Pilih file audio dari perangkatmu, tentukan rentang waktu, lalu biarkan potongan itu berulang sampai hafal.

Aplikasi ini 100% statis: HTML + CSS + JavaScript murni. Tanpa backend, tanpa database, tanpa framework,
tanpa CDN, tanpa API key. File audio diproses di browser dan **tidak pernah dikirim ke server**.

## Cara menjalankan

Pilih salah satu:

1. **Buka langsung.** Klik dua kali `index.html` (atau seret ke jendela browser). Semua fitur inti bekerja dari `file://`.
2. **Static server sederhana** (opsional), dari folder proyek:
   ```bash
   python3 -m http.server 8080
   # lalu buka http://localhost:8080
   ```

Tidak ada langkah instalasi atau build.

```
quranloop/
├── index.html   struktur halaman, ikon (inline SVG), dialog, toast
├── style.css    design system, CSS variables, tema terang/gelap, layout responsif
├── script.js    pemutar, loop, ekspor WAV, favorit, riwayat, penyimpanan lokal
└── README.md
```

## Fitur

- **Upload audio lokal**: MP3, M4A, WAV, OGG (selama didukung browser). Tombol "Pilih File" atau drag-and-drop.
  File divalidasi (bukan audio, kosong, rusak, atau durasi tidak terbaca → pesan error yang jelas).
  Object URL dilepas saat file diganti atau dihapus.
- **Pemutar**: play/pause, seek (klik dan seret di timeline, atau keyboard), mundur/maju 5 detik, volume, mute,
  waktu berjalan dan durasi (`MM:SS`).
- **Rentang loop**: dua penanda yang bisa digeser pada timeline, input waktu `Mulai` dan `Selesai`
  (`MM:SS`, boleh satu desimal seperti `00:15.5`), tombol ±0,5 detik, dan tombol
  "Gunakan Posisi Saat Ini sebagai Awal/Akhir". Rentang boleh diubah saat audio berjalan.
- **Mode loop**: *Mati*, *Potongan* (hanya rentang terpilih), *Seluruh audio*. Status loop ditampilkan sebagai teks dan ikon, bukan hanya warna.
- **Preset**: 5, 10, 15, 30 detik, dimulai dari posisi audio saat ini dan dibatasi oleh durasi audio.
  Preset hanya mengatur durasi; aplikasi **tidak** mendeteksi batas ayat.
- **Counter pengulangan**: bertambah satu kali per siklus loop yang benar-benar terjadi
  (bukan per event `timeupdate`, dan tidak bertambah ketika kamu menggeser posisi sendiri). Ada tombol reset.
- **Download potongan**: audio didekode dengan Web Audio API, bagian terpilih diekstrak, lalu diunduh sebagai file baru.
- **Favorit**: simpan nama sesi, file, rentang, mode, tanggal, serta label opsional (surah, ayat, catatan).
- **Riwayat sesi**: metadata file, rentang, durasi potongan, jumlah pengulangan, tanggal terakhir digunakan.
- **Tema terang/gelap** dengan preferensi tersimpan.
- **Pengaturan**: volume, mode loop bawaan, reset counter, hapus riwayat/favorit (dengan dialog konfirmasi), info privasi.
- Toast untuk aksi penting, tanpa `alert()`.

## Format ekspor: WAV PCM 16-bit

Potongan selalu diunduh sebagai **WAV PCM 16-bit**, walaupun file sumbernya MP3 atau M4A.
Aplikasi tidak membawa encoder MP3 supaya tetap ringan, jadi hasilnya tidak diberi label MP3.
Contoh nama file: `quranloop-potongan-00-15-00-45.wav`.

Detail teknis:

- Sample rate mengikuti `AudioContext` browser (umumnya 44,1 atau 48 kHz). Jika sumber memakai rate berbeda,
  browser meresample saat mendekode.
- Maksimal 2 channel (mono tetap mono; lebih dari 2 channel diambil dua channel pertama).
- Ukuran WAV ≈ durasi × sample rate × channel × 2 byte. Potongan 30 detik stereo 48 kHz ≈ 5,5 MB.
- Penyandian dilakukan bertahap agar UI tidak membeku, dan `AudioContext` ditutup setelah selesai.

## Batasan yang perlu diketahui

- **Dekode penuh di memori.** Untuk mengekspor, seluruh file harus didekode menjadi `AudioBuffer` (float 32-bit).
  Audio stereo 48 kHz berdurasi 10 menit memakai kira-kira 230 MB RAM sementara. File sangat besar bisa gagal
  di perangkat dengan memori terbatas; aplikasi menampilkan pesan error dan meminta konfirmasi untuk file di atas 120 MB.
  Pemutaran dan loop tidak terpengaruh karena memakai `HTMLAudioElement`.
- **Ketepatan loop.** Loop memakai `currentTime` dan dicek sekitar tiap frame (`requestAnimationFrame`),
  dengan pemeriksaan cadangan tiap 40 ms. Lompatan dilakukan ±25 ms sebelum titik akhir. Format terkompresi
  (MP3/M4A) bisa menimbulkan celah sangat singkat saat seek; WAV biasanya paling mulus.
- **Favorit dan riwayat tidak menyimpan file audio**, hanya metadata. Setelah browser ditutup, aplikasi akan
  meminta kamu memilih ulang file yang sama (banner "Menunggu file audio"). Jika nama file berbeda, rentang tetap
  diterapkan dengan peringatan dan disesuaikan dengan durasi file baru.
- Riwayat dipulihkan otomatis bila file dengan nama dan ukuran yang sama dimuat lagi.
- Dukungan format bergantung pada browser (misalnya OGG tidak diputar di Safari lama).
- Label surah/ayat/catatan adalah input manual; aplikasi tidak mengenali konten audio.

## Browser yang direkomendasikan

Versi terbaru Chrome, Edge, Firefox, atau Safari (membutuhkan `<dialog>`, Pointer Events, Web Audio API, CSS variables).
Diuji untuk layar desktop dan smartphone.

## Penyimpanan lokal

Hanya `localStorage` (tema, pengaturan, favorit, riwayat; semuanya kecil). Kunci: `quranloop.theme`,
`quranloop.settings`, `quranloop.favorites`, `quranloop.history`. Tidak ada koneksi jaringan, analytics, atau pelacakan.

## Pintasan keyboard

- `Spasi`: putar/jeda (saat fokus tidak berada di kontrol lain).
- Timeline: `←/→` ±1 detik (`Shift` ±5), `PageUp/PageDown` ±10, `Home/End`.
- Penanda loop: `←/→` ±0,1 detik (`Shift` ±1), `Home/End` ke batas.

---

Dibuat oleh yusma dev </>
