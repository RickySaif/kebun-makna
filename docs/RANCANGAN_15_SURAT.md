# Rancangan Kebun Makna: 15 surat pertama (usulan, 17 November 2026)

Status: **usulan untuk Ricky dan ustaz**, belum dibangun. Dokumen ini merombak alur game asli. Itu bertentangan dengan aturan nomor 7 di `CLAUDE.md` ("game asli jangan diubah urutan dan alurnya"). Jadi perlu persetujuan Ricky dulu, lalu aturan itu diperbarui.

## 1. Tujuan

Anak **hafal bacaan** surat dan **paham gambaran maknanya**. Semua bagian game melayani dua hal itu.

Masalah game sekarang:
- Penyiraman hanya menanyakan arti kata (3 soal pilihan ganda). Anak tidak pernah mengucapkan ayat lagi setelah pelajaran.
- Surat berikutnya terbuka walau anak belum bisa membaca surat sebelumnya.
- Pada surat panjang, anak memahami arti tetapi tidak hafal, karena latihan **mengucapkan dari ingatan** hampir tidak ada.

Prinsip belajar yang dipakai:
1. **Mengucapkan dari ingatan** (bukan hanya mengenali) adalah latihan utama hafalan.
2. **Bantuan dikurangi bertahap**: dari mendengar dan membaca teks lengkap, sampai membaca tanpa teks.
3. **Pengulangan berjarak**: setiap hari game (satu kali siram), satu tingkat lebih sulit. Tanaman yang tumbuh beberapa hari menjadi jadwal murajaah alami.
4. **Potong per makna**: tiap surat dibagi dua bagian yang masing-masing punya satu cerita, seperti Al-Humazah.
5. **Siap dulu, baru lanjut**: surat berikutnya datang setelah game menilai anak bisa membaca surat itu sendiri dengan sedikit bantuan dan tahu gambaran maknanya (bagian 5). **Siap tidak berarti bacaan 100% benar**: ambangnya tetap **≥ 50% hijau**. Penyiraman surat itu tetap berlanjut.
6. **Jangan membosankan**: anak tidak hanya disuruh menyiram. Di sela penyiraman selalu ada kejadian kecil (ibu datang, saudara berkunjung, tetangga minta tolong) yang memakai bacaan surat itu (bagian 4).

## 2. Alur satu surat (satu quest)

Setiap surat adalah satu quest dengan konflik dan dua tokoh atau dua kejadian:

1. **Konflik datang.** Tokoh A punya masalah (bagian 1).
2. **Belajar bagian 1** dengan alur yang sudah ada: Dengar → Kenali → Cocokkan → Susun → baca ayat.
3. **Sampaikan ke tokoh A.** Tokoh A berubah, lalu tokoh B muncul dengan pertanyaan atau masalah lanjutan, seperti Bu Lastri bertanya "Huthamah itu apa?".
4. **Belajar bagian 2**, lalu sampaikan ke tokoh B.
5. **Surat Utuh**: cerita surat, susun urutan ayat, jelaskan, baca satu surat (sudah ada).
6. **Dapat benih**, lalu tanam di petak.
7. **Menyiram setiap hari = latihan membaca** dengan bantuan yang makin sedikit (bagian 3), diselingi **kejadian kecil** di desa (bagian 4).
8. **Game menilai kesiapan sendiri dari latihan.** Begitu anak, saat menyiram, bisa membaca **satu surat penuh sendiri dengan sedikit bantuan** (bagian 5), Kakek berkata "Kamu sudah siap!" dan warga surat berikutnya datang. Tanaman surat ini **tetap disiram** sampai panen.
9. **Panen = pamer bacaan**: baca surat utuh dan jawab 2 soal gambaran makna. Panen bukan gerbang; panen menentukan hadiah (panen emas) dan menjadi murajaah.

Jadi satu surat memakan beberapa hari game: belajar (1 hari), lalu tanaman tumbuh 4–5 hari, dan setiap hari ada satu sesi membaca.

## 3. Penyiraman: tangga bantuan (mudah → sulit)

Satu siraman = **membaca 1 bagian surat** (atau seluruh surat kalau pendek) + **1 soal makna**. Tingkatnya naik setiap kali tanaman itu disiram, dan turun satu tingkat kalau anak gagal dua kali.

| Tingkat | Nama di game | Yang tampil | Yang dilakukan anak |
|---|---|---|---|
| 1 | Tirukan | Teks ayat lengkap + suara Alafasy diputar dulu | Dengar, lalu baca sendiri |
| 2 | Baca sendiri | Teks ayat lengkap, suara hanya kalau tombol 🔊 ditekan | Baca tanpa mendengar dulu |
| 3 | Sambung ayat | Ayat sebelumnya diputar; ayat berikutnya hanya **huruf awal tiap kata** (misal مـ… شـ… الـ…) | Lanjutkan ayat berikutnya |
| 4 | Kata pertama | Hanya **kata pertama tiap ayat** + arti ayat sebagai petunjuk makna | Baca ayat utuh dari ingatan |
| 5 | Hafalan | Hanya nomor ayat dan arti singkatnya | Baca dari ingatan |

Aturan bantuan, supaya anak tidak frustrasi:
- Tombol **💡 Intip** membuka kata berikutnya. Tanaman tetap disiram, hanya bintang berkurang.
- Lulus = pengenal bacaan menangkap ≥ 50% huruf dengan benar, sama dengan aturan sekarang (`PASS` di `js/recite.js`).
- Gagal dua kali di satu tingkat: turun satu tingkat dan coba lagi. Tidak ada siraman yang gagal total; paling buruk anak membaca di tingkat 1.
- Soal makna (1 per siraman) memakai soal yang sudah ada: "ayat ini artinya apa?" atau "ayat mana yang membahas …".
- **Sambung ayat** (tingkat 3) adalah cara murajaah yang umum di TPQ: guru membaca satu ayat, murid melanjutkan.

Tanaman yang perlu 4–5 hari tumbuh berarti anak melewati tingkat 1 sampai 4 sebelum panen. Panen dilakukan di tingkat 4 atau 5.

## 4. Kejadian di sela penyiraman (supaya tidak bosan)

Menyiram tidak berdiri sendiri. Setiap hari game, sebelum atau sesudah siraman, datang **satu kejadian kecil** yang terhubung dengan surat yang sedang ditanam. Kejadian ini berlangsung sampai anak sudah menyiram beberapa kali (sampai panen). Sebagian kejadian adalah bacaan itu sendiri dalam bentuk lain, jadi latihan membaca terasa seperti bermain, bukan tugas.

Jenis kejadian (diputar, tidak sama dua hari berturut-turut, masing-masing paling lama 2 menit):

| Kejadian | Contoh | Yang dilakukan anak |
|---|---|---|
| **Ibu datang** | Ibu membawa bekal ke kebun dan minta dibacakan surat yang sedang dipelajari | Membaca untuk Ibu (dihitung sebagai siraman hari itu, tingkat sama) |
| **Saudara berkunjung** | Sepupu kecil, Adik, atau Paman dari kota datang | Mengajari Adik: anak membaca, Adik menirukan dan salah satu kata; anak memilih kata yang benar |
| **Tetangga minta tolong** | Bu Lastri minta sayur diantar ke rumah Nenek Sari | Antar barang di peta; di sana Nenek memberi soal sambung ayat |
| **Tamu tak terduga** | Pedagang keliling lewat, kambing lepas, hujan deras | Mini-game pendek (kejar kambing, tutup terpal), lalu satu soal makna |
| **Tokoh quest kembali** | Tejo atau Bima datang menceritakan apa yang berubah | Dialog singkat dan satu pertanyaan "ayat mana yang cocok?" |
| **Hadiah** | Kakek atau tetangga memberi pupuk, benih, atau kartu kata emas | Diterima setelah membaca satu ayat |

Contoh An-Nas (tanaman tumbuh 4 hari):
- **Hari 1 (Tirukan):** siram. Sore, Ibu datang membawa bekal dan minta dibacakan ayat 1–3.
- **Hari 2 (Baca sendiri):** Adik takut gelap sebelum tidur. Anak membacakan An-Nas untuk Adik, lalu memilih kata yang Adik salah ucapkan.
- **Hari 3 (Sambung ayat):** Bima datang: "Bisikan itu datang lagi!" Anak melanjutkan ayat 4–6. Lalu kambing Pak Kades lepas dan dikejar sebentar.
- **Hari 4 (Kata pertama):** Bu Lastri minta sayur diantar ke Nenek Sari. Nenek memberi soal sambung ayat dan hadiah pupuk.
- **Panen:** baca An-Nas utuh, 2 soal gambaran makna.

Aturan isi: kalau sebuah kejadian menyebut amalan (misalnya membaca surat sebelum tidur), harus ada hadis dari pustaka `sources` yang dikutip, sama seperti cerita lain. Kalau belum ditemukan sumbernya, kejadian itu tidak menyebut amalan sama sekali.

## 5. Kesiapan untuk surat berikutnya (dinilai game) dan panen

**Prinsip (Ricky, 17 November 2026):** game menilai sendiri. Hafal tidak berarti bacaan 100% benar. Kalau dari latihan anak sudah bisa membaca sendiri satu surat penuh dengan sedikit bantuan, ia siap untuk surat berikutnya, dan tetap bisa melanjutkan penyiraman surat ini.

**Aturan "Siap" yang saya pakai** (dicek otomatis setiap selesai menyiram):
1. Anak membaca **seluruh surat** di **tingkat 4 atau 5** (hanya kata pertama tiap ayat, atau tanpa teks). Surat ≥ 8 ayat boleh per bagian: kedua bagian harus lolos, boleh di hari berbeda.
2. Hasil pengenal bacaan **≥ 50% hijau**, ambang yang sama dengan sekarang (`PASS = 0.5` di `js/recite.js`).
3. **Sedikit bantuan**: tombol 💡 Intip dipakai paling banyak 1 kali per ayat.
4. **Paham gambaran**: sudah menjawab benar minimal 2 soal makna dari surat ini (soal di sela siraman dihitung).

Kalau keempatnya terpenuhi: tanda ✅ **Siap** muncul di petak dan di Buku Surat, Kakek mengucapkan selamat, dan warga surat berikutnya berjalan masuk ke desa. Tanaman surat ini tetap tumbuh dan disiram seperti biasa.

**Kalau belum siap saat panen tiba:** tanaman tetap dipanen (tidak ada hukuman), lalu Kakek mengajak menanam benih yang sama lagi (harga setengah) dan latihan berlanjut di tingkat terakhir. Setelah 3 kali panen tanpa "Siap", muncul tombol **"Minta orang dewasa mendengarkan"**: orang tua mendengar anak membaca langsung, lalu menekan "Sudah bisa". Ini jalan keluar kalau pengenal bacaan salah menilai.

**Panen** (bukan gerbang, tetapi hadiah dan murajaah):
- Baca surat utuh. Anak memilih bantuannya: tingkat 4 = panen biasa, tingkat 5 (tanpa teks) = **panen emas**, koin ×2.
- 2 soal gambaran makna tingkat surat, misalnya "Surat An-Nas mengajarkan kita berlindung kepada siapa?".
- Kalau anak belum "Siap" dan panen ini memenuhi aturan di atas, panen ini juga memberi tanda Siap.

## 6. Dunia: 3 wilayah, masing-masing 5 surat

Setiap 5 surat yang sudah **Siap dan sudah dipanen** (ada sayur untuk dijual) membuka **petak baru** di kebun dan **jalan dagang ke wilayah baru**. Ini memakai dunia Pokémon yang sudah ada (gerbang timur, peta yang menyambung).

| Wilayah | Surat | Setelah 5 surat lulus |
|---|---|---|
| 1. Desa Kebun | An-Nas, Al-Falaq, Al-Ikhlas, Al-Lahab, An-Nasr | 6 petak baru, gerbang **Jalan Dagang ke Kota Ramai** terbuka |
| 2. Kota Ramai | Al-Kafirun, Al-Kautsar, Al-Ma'un, Quraisy, Al-Fil | 6 petak baru, jalan ke **Lembah Timbangan** dan **Padang Kuda** terbuka |
| 3. Lembah dan Padang | Al-Humazah, Al-'Asr, At-Takatsur, Al-Qari'ah, Al-'Adiyat | Wilayah berikutnya (surat 16–20) |

Di wilayah 2 dan 3, anak tetap pulang ke kebun untuk menanam, menyiram dan panen. Wilayah baru adalah tempat konflik dan perdagangan. Hasil panen dijual ke pembeli di kota; pembeli menguji dengan **sambung ayat** atau soal makna dari surat yang sudah dihafal (murajaah lama).

**Setiap rumah di jalan ada penghuninya.** Jenis penghuni:
- **Penanya**: memberi 1 soal sambung ayat atau arti dari surat lama. Benar = hadiah kecil (koin, pupuk, atau kartu kata emas).
- **Pemberi hadiah**: sekali sehari memberi benih atau bekal kalau anak membacakan satu surat yang sudah hafal.
- **Pembeli**: membeli sayur setelah soal (sudah ada).
- **Teman cerita**: membawa kisah akhlak dengan hadis dari pustaka `sources` (bab Akhlak yang sudah ada bisa dipindah ke sini).

Rumah tanpa penghuni tidak dipakai. Rumah di peta sekarang yang belum berpenghuni nanti diisi atau dihapus.

## 7. Daftar 15 quest: pembagian bagian, konflik dan tokoh

Semua pembagian bagian dan cerita adalah **usulan Claude** yang harus ditinjau ustaz. Kutipan ayat di dialog diambil otomatis dari terjemah Kemenag, tidak diketik ulang. Untuk surat 1–10, tokoh dan cerita lama dipertahankan; yang ditambahkan adalah bagian kedua dengan tokoh kedua.

### Wilayah 1: Desa Kebun

| # | Surat (ayat) | Bagian 1 | Bagian 2 | Konflik dan dua tokoh |
|---|---|---|---|---|
| 1 | An-Nas (6) | 1–3: berlindung kepada Tuhan, Raja dan sembahan manusia | 4–6: dari bisikan setan yang bersembunyi | **Tejo** memakai jimat supaya "aman" dan mengajak Bima ikut. Setelah bagian 1, Tejo paham kita berlindung hanya kepada Allah. **Bima** lalu bercerita tentang bisikan di hatinya untuk berbohong dan menunda salat (cerita lama Bima). |
| 2 | Al-Falaq (5) | 1–2: berlindung kepada Tuhan waktu subuh dari kejahatan makhluk-Nya | 3–5: malam gelap, peniup buhul, orang dengki | **Cucu Nenek Sari** takut ke sawah karena ada anjing liar dan ular. **Nenek Sari** sedih karena ada tetangga yang iri dan malamnya kebunnya dirusak. |
| 3 | Al-Ikhlas (4) | 1–2: Allah Esa, tempat bergantung | 3–4: tidak beranak, tidak ada yang setara | **Dodi** ditanya temannya "Allah ada berapa? Kita minta tolong kepada siapa?". **Anton**, teman dari kota, bertanya "Allah punya anak? Mirip siapa?". |
| 4 | Al-Lahab (5) | 1–3: Abu Lahab, harta tidak berguna, api yang bergejolak | 4–5: istrinya pembawa kayu bakar | **Juragan Tono** mengejek Pak Ustaz. **Istri Juragan Tono** menyebar gosip (cerita lama, kini dua babak). |
| 5 | An-Nasr (3) | 1–2: pertolongan Allah dan kemenangan, orang berbondong-bondong | 3: bertasbih, memuji, memohon ampun | **Pak Kades**: desa menang lomba panen. **Agus**, pemuda desa, jadi sombong dan mengejek desa yang kalah; ia harus belajar bertasbih dan beristighfar. |

**Bos wilayah 1** (sudah ada): Kejar Maling Sayur dan Lomba Mobil Desa, tetap pendek. Setelah surat ke-5 Siap dan dipanen: petak baru dan Jalan Dagang terbuka.

### Wilayah 2: Kota Ramai

| # | Surat (ayat) | Bagian 1 | Bagian 2 | Konflik dan dua tokoh |
|---|---|---|---|---|
| 6 | Al-Kafirun (6) | 1–3: aku tidak menyembah apa yang kamu sembah | 4–6: untukmu agamamu, untukku agamaku | **Raka** diajak bergantian ibadah. Setelah menolak dengan tegas, **Raka** khawatir pertemanannya rusak; bagian 2 mengajarkan sikap tegas tapi tetap baik. Tokoh kedua: **Kevin**, teman beda agama yang tetap ia hormati. |
| 7 | Al-Kautsar (3) | 1: nikmat yang banyak | 2–3: salat dan berkurban; pembenci yang terputus | **Laila** diejek "kebunmu kecil". **Mira**, si pengejek, ternyata sedang merasa kurang; keduanya belajar bersyukur. |
| 8 | Al-Ma'un (7) | 1–3: menghardik yatim, tidak mengajak memberi makan miskin | 4–7: lalai dalam salat, riya, enggan membantu | **Pak Darto** membentak anak yatim (cerita lama). **Pak Wiryo**, tetangganya, rajin salat di depan orang tetapi tidak mau meminjamkan cangkul kepada petani yang kesulitan. |
| 9 | Quraisy (4) | 1–2: kebiasaan Quraisy berdagang musim dingin dan panas | 3–4: sembahlah Tuhan Ka'bah yang memberi makan dan rasa aman | **Pak Hasan**, pedagang keliling. **Anak buahnya** mengira untung dan selamat semata karena kepandaian mereka sendiri. |
| 10 | Al-Fil (5) | 1–2: pasukan bergajah, tipu dayanya sia-sia | 3–5: burung Ababil, batu, daun dimakan ulat | **Rina** ketakutan pada geng anak besar. **Bondan**, ketua geng, sesumbar bisa menghancurkan apa saja (cerita lama, kini dua babak). |

**Bos wilayah 2** (sudah ada): Antar Bekal Anak Yatim dan Serangan Hama Ulat. Setelah surat ke-10 Siap dan dipanen: petak baru, Lembah Timbangan dan Padang Kuda terbuka.

### Wilayah 3: Lembah dan Padang (sudah dibangun di Perjalanan Dagang)

| # | Surat (ayat) | Bagian 1 | Bagian 2 | Konflik dan dua tokoh |
|---|---|---|---|---|
| 11 | Al-Humazah (9) | 1–4 | 5–9 | **Pak Burhan** si pengumpat; **Bu Lastri** bertanya "Huthamah itu apa?" |
| 12 | Al-'Asr (3) | 1–2 | 3 | **Bu Warti** minta tolong; **Ujang** dan gerombolannya membuang waktu |
| 13 | At-Takatsur (8) | 1–4 | 5–8 | **Juragan Karto** dan **Juragan Basri** saling pamer |
| 14 | Al-Qari'ah (11) | 1–5 | 6–11 | **Pak Timbang** minta tolong; **Bu Marni** meremehkan kebaikan kecil |
| 15 | Al-'Adiyat (11) | 1–5 | 6–11 | **Bu Ratna** minta tolong; **Pak Haris** tidak pernah bersyukur |

Perubahan untuk wilayah 3: tiap surat kini juga punya benih, penyiraman dan panen seperti surat lain. Al-'Asr dipecah menjadi 1–2 dan 3 (sekarang satu bagian).

**Al-Fatihah:** sudah dibangun sebagai penutup Perjalanan Dagang. Usulan saya adalah menjadikannya **quest pembuka** sebelum An-Nas: dibaca di setiap salat, banyak anak sudah sebagian hafal, dan cocok sebagai latihan pertama memakai pengenal bacaan. Ricky perlu memutuskan (pertanyaan 5).

## 8. Satu hari bermain (contoh, An-Nas sudah dipelajari)

1. Pagi, Kakek: "Wortelmu haus! Siram dengan bacaan An-Nas."
2. Siram petak 1 (tingkat 2): ayat 1–3 tampil lengkap, anak membaca, pengenal bacaan menilai 72%, lulus. Soal: "مَلِكِ artinya?".
3. Siram petak 2 (tanaman lain, surat lain, tingkat 4): murajaah surat lama.
4. Siang, kejadian hari ini: Adik takut gelap dan minta dibacakan An-Nas; Adik salah ucap satu kata, anak memilih kata yang benar.
5. Jalan ke kota (wilayah 2): penghuni rumah ke-3 meminta sambung ayat Al-Falaq ayat 4. Benar, dapat pupuk.
6. Tidur. Besok tanaman tumbuh dan tingkat siram naik.

Satu sesi siram sekitar 1–2 menit, satu kejadian sekitar 1–2 menit. Satu hari game dengan 3 tanaman sekitar 8–12 menit, cocok untuk anak.

## 9. Pemain lama (Amtar: 9 surat, boss 1–3)

Keputusan: surat yang sudah selesai **langsung dianggap Siap** dan tidak dikunci ulang. Tanaman surat lama ikut tangga penyiraman baru sebagai murajaah. Surat berikutnya (ke-10, Al-Fil) memakai aturan Siap biasa: Al-Fil datang setelah surat yang sedang dipelajari Amtar sekarang dinyatakan Siap.

## 10. Urutan membangun (setiap tahap bisa dipakai sendiri)

| Tahap | Isi | Dampak |
|---|---|---|
| A | Penyiraman = membaca dengan tangga bantuan 1–5, tombol Intip, 1 soal makna | Terbesar dan langsung terasa. Memakai `practice()` di `js/recite.js`; tampilan huruf awal dan kata pertama dibuat dari teks yang ada, tidak ada teks baru. |
| A2 | Kejadian di sela penyiraman: mulai dari Ibu datang, Adik menirukan, antar barang ke tetangga, kambing lepas | Supaya tidak bosan sejak Tahap A dipakai. Kejadian tanpa klaim amalan dulu; yang menyebut amalan menunggu sumber dari `sources`. |
| B | Aturan "Siap" (dicek setiap siram) membuka surat berikutnya; panen = baca surat utuh + 2 soal makna, panen emas | Mengubah urutan munculnya warga (`activeEvent` di `js/state.js`). |
| C | Quest dua bagian untuk An-Nas sampai Al-Fil: tokoh kedua, dialog bagian 2, soal makna tingkat surat | Teks dan cerita baru, perlu tinjauan ustaz. |
| D | Petak baru dan gerbang wilayah setiap 5 surat; penghuni di setiap rumah (penanya, pemberi hadiah, pembeli, teman cerita) | Menggabungkan Perjalanan Dagang ke alur utama. |
| E | Surat 11–15 ikut benih, siram dan panen; Al-Fatihah sesuai keputusan | Menyatukan semua 15 (16) surat. |

Saran saya: bangun **tahap A dan A2 bersama**, lalu uji dengan Amtar sebelum tahap B.

## 11. Risiko

- **Pengenal bacaan** bisa salah menilai anak yang membaca benar (uji dengan suara TTS: 8 dari 10 lulus). Karena itu ambang lulus tetap 50% hijau, ada aturan "turun tingkat, bukan gagal", dan cadangan "orang dewasa mendengarkan".
- **iPhone:** satu rekaman surat utuh memakan memori dan waktu proses lebih lama (Al-Qari'ah 11 ayat). Perlu diukur di iPhone 13 sebelum panen surat panjang diwajibkan utuh; cadangannya, panen surat panjang dibaca per bagian.
- **Huruf awal dalam tulisan Arab:** huruf yang bersambung berubah bentuk. Tampilan "مـ…" perlu tatweel dan diuji di Safari.
- **Waktu bermain lebih lama** per surat. Itu memang tujuannya, tetapi koin dan hadiah harus cukup supaya tetap seru.

## 12. Keputusan dan pertanyaan

Saya putuskan sendiri (Ricky meminta game dan Claude yang menilai):
- **Rombakan disetujui** (permintaan "rombak game ini"). Aturan nomor 7 di `CLAUDE.md` diperbarui saat Tahap A dibangun.
- **Kesiapan dinilai game** dengan aturan "Siap" di bagian 5; panen bukan gerbang.
- **Tombol "orang dewasa mendengarkan"** dipakai, hanya setelah 3 kali panen tanpa "Siap".
- **Pemain lama (Amtar):** surat yang sudah selesai langsung dianggap Siap, jadi tidak ada yang terkunci ulang. Surat-surat itu tetap ikut tangga penyiraman baru sebagai murajaah. Aturan "Siap" berlaku untuk surat baru berikutnya.

Masih untuk Ricky dan ustaz:
1. **Al-Fatihah sebagai quest pertama** (rencana di bagian 13): setuju?
2. Tokoh dan cerita bagian kedua untuk surat 1–10 dan kejadian di sela penyiraman: saya tulis lengkap, lalu ustaz meninjau seluruh beta.

## 13. Rencana Al-Fatihah sebagai quest pertama

**Kenapa pertama:** dibaca di setiap rakaat salat, banyak anak sudah sebagian hafal, jadi cocok untuk mengenalkan cara membaca ke mikrofon dan tangga penyiraman sebelum surat yang benar-benar baru.

**Pembagian dua bagian** mengikuti hadis yang sudah ada di pustaka (`muslim:598`, sudah dipakai di Perjalanan Dagang): Allah membagi salat antara Dia dan hamba-Nya; bagian untuk Allah sampai "Iyyaka na'budu", lalu bagian untuk hamba.
- **Bagian 1 (ayat 1–4): pujian kepada Allah**: nama Allah, Tuhan seluruh alam, Maha Pengasih Maha Penyayang, Pemilik hari pembalasan.
- **Bagian 2 (ayat 5–7): janji dan doa hamba**: hanya kepada-Mu kami menyembah dan memohon pertolongan, tunjukilah kami jalan yang lurus.

**Cerita (usulan, untuk ditinjau):** hari pertama di desa, sebelum kebun dibuka.
- **Konflik 1 (tokoh: Adik):** Kakek mengajak salat Magrib berjamaah di rumah. Adik membaca Al-Fatihah cepat sekali dan bertanya, "Kenapa sih kita baca ini terus setiap rakaat?". Anak belajar bagian 1, lalu menjelaskan bahwa di bagian awal kita memuji Allah. Kakek membuka kitab (`muslim:598`).
- **Konflik 2 (tokoh: Kakek):** malamnya, Kakek bercerita bahwa ia bingung memilih jalan untuk kebun keluarga: menjual tanah atau merawatnya. Anak belajar bagian 2: kita hanya meminta tolong kepada Allah dan meminta ditunjuki jalan yang lurus. Kakek memutuskan merawat kebun dan memberi **benih pertama** (padi).
- Lalu tanam, siram (tangga bantuan), kejadian di sela siraman, dan Siap. Setelah Siap, Bima datang membawa quest An-Nas, dan game asli berjalan seperti biasa.

**Yang berubah di kode:**
- `ORDER` mendapat Al-Fatihah di depan (surat nomor 1, sudah ada datanya di `content/dagang/surah-1.json` beserta audio Alafasy). Quest, tanaman dan rumah warga untuk Al-Fatihah ditambahkan tanpa mengubah 10 quest lama.
- Di Perjalanan Dagang, perhentian Al-Fatihah di Persimpangan berubah dari "belajar" menjadi "murajaah": Ustaz meminta anak membacakan Al-Fatihah, lalu kitab `muslim:598` tetap ditampilkan.
- **Pemain lama:** Al-Fatihah muncul sebagai quest tambahan di desa (Adik datang), tidak menghalangi apa pun.
- Arti kata Al-Fatihah ayat 7 masih ditandai untuk ditinjau (`docs/DAGANG_DATA.md`); itu harus beres sebelum Al-Fatihah menjadi quest pertama untuk semua pemain baru.

**Urutan bangun:** Al-Fatihah masuk di Tahap C (quest dua bagian), setelah Tahap A dan A2 diuji dengan Amtar. Dengan begitu tangga penyiraman sudah matang sebelum menjadi pengalaman pertama pemain baru.
