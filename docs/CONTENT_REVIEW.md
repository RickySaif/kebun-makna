# Daftar sumber konten cerita (untuk ustaz)

Ustaz meninjau seluruh versi beta (https://rickysaif.github.io/kebun-makna/beta/) sebelum Ricky memindahkannya ke versi utama. Dokumen ini hanya daftar: setiap cerita baru dan sumber (`sources.id`) yang dikutipnya.

- Teks Arab dan terjemahan di game **disalin apa adanya** dari pustaka `sources` ke `source_rows` di tiap file cerita (`content/tools/snapshot-sources.mjs`). Tes `beta/tests/phase8-akhlak.mjs` memastikan salinannya sama persis dengan pustaka.
- Kalimat cerita dan dialog ditulis oleh Claude. Kalimat yang merangkum hadis/ayat adalah yang perlu dicek paling teliti: apakah sesuai dengan teks sumbernya.
- Catatan penomoran hadis: nomor Bukhari/Muslim memakai **penomoran Lidwa Pusaka**, yang bisa berbeda dari penomoran sunnah.com / Fuad Abdul Baqi. Periksa teksnya, bukan hanya nomornya.

## Bab "Akhlak Seorang Muslim"
Bab ini terbuka setelah pemain menyelesaikan 10 surat dan game boss ke-4 (Serangan Hama Ulat). Di setiap kisah, seorang warga punya masalah; pemain memilih hadis/ayat yang tepat dari tiga pilihan, lalu sumbernya ditampilkan lengkap dan warga menceritakan apa yang akan ia lakukan.

| # | cerita | file | sumber yang dikutip | kalimat di cerita yang merangkum sumber |
|---|---|---|---|---|
| 1 | Pot Bunga yang Pecah (jujur) | `content/akhlak/jujur.json` | `muslim:4719` (HR. Muslim no. 4719) | "Kejujuran membimbing kepada kebaikan, dan kebaikan membimbing ke surga… Dusta mengantarkan kepada kejahatan." |
| 2 | Disuruh Ibu Lagi (berbakti kepada ibu) | `content/akhlak/ibu.json` | `bukhari:5514` (HR. Bukhari no. 5514) | "Seseorang bertanya kepada Rasulullah ﷺ siapa yang paling berhak ia perlakukan dengan baik. Beliau menjawab: ibumu, ibumu, ibumu, kemudian ayahmu." |
| 3 | Kebaikan yang Kecil (wajah ramah) | `content/akhlak/wajah.json` | `muslim:4760` (HR. Muslim no. 4760) | "Nabi ﷺ berpesan: jangan menganggap remeh kebaikan sedikit pun, walaupun hanya bermanis muka kepada saudaramu ketika bertemu." |
| 4 | Ranting Berduri di Jalan | `content/akhlak/jalan.json` | `bukhari:2292` (HR. Bukhari no. 2292) | "Rasulullah ﷺ menceritakan seorang laki-laki yang menemukan potongan duri di jalan, lalu mengambilnya. Allah bersyukur kepadanya dan mengampuninya." |
| 5 | Sumur Desa Hampir Kering (hemat air) | `content/akhlak/air.json` | `quran:7:31` (QS. Al-A'raf 7:31), `bukhari:194` (HR. Bukhari no. 194) | "Allah berfirman: makan dan minumlah, tetapi jangan berlebihan…" · "Anas meriwayatkan bahwa Nabi ﷺ berwudu dengan satu mud, takaran yang kecil." (**mohon dicek**: penjelasan "takaran yang kecil" untuk mud adalah tambahan kami) |
| 6 | Anak Baru di Desa (salam) | `content/akhlak/salam.json` | `muslim:81` (HR. Muslim no. 81) | "Rasulullah ﷺ bersabda bahwa kita tidak beriman sampai saling menyayangi, dan beliau menunjukkan caranya: sebarkanlah salam di antara kalian." |
| 7 | Sayur Bu Rahma (berbagi dengan tetangga) | `content/akhlak/tetangga.json` | `muslim:4758` (HR. Muslim no. 4758) | "Rasulullah ﷺ berpesan kepada Abu Dzar: kalau memasak kuah sayur, perbanyaklah airnya, dan berikan sebagiannya kepada tetanggamu." |
| 8 | Pertandingan Bola (menahan marah) | `content/akhlak/marah.json` | `bukhari:5649` (HR. Bukhari no. 5649) | "Rasulullah ﷺ bersabda: orang yang kuat bukanlah yang pandai bergulat, tetapi orang yang dapat menahan dirinya ketika marah." |

## Bagian lain yang memakai sumber
- **Beranda (kiriman anak/orang tua):** setiap kiriman wajib mengutip satu baris dari `sources` (dipilih dari pustaka, tidak diketik). Untuk hadis, kartu menampilkan *matan* (teks dalam kutipan setelah rantai perawi) jika bisa dipisahkan dengan pasti, dan teks lengkap beserta sanad di balik "Lihat lengkap". Mohon ustaz mengecek beberapa contoh kartu hadis.
- **Lomba arti kata:** hanya memakai arti per kata dari blok `DATA` yang sudah ditinjau di game lama.

## Bab "Perjalanan Dagang" (2026-11-16, usulan Ricky)
Bab ini terbuka bersamaan dengan Akhlak (setelah 10 surat dan boss ke-4). Amtar berdagang sayur di sepanjang jalan, menjawab pertanyaan pembeli tentang surat-surat sebelumnya, dan belajar surat baru untuk melewati orang yang menghalangi jalan. Surat panjang dipelajari per **bagian** (3–5 ayat). Semua teks cerita ada di `content/dagang/story.json`; teks dan terjemah ayat berasal dari `content/dagang/surah-<no>.json` (terjemah Kemenag, sama persis dengan tabel `sources`), dan kutipan di cerita diambil otomatis dari file itu (`{tr:SSS:a-b}`), bukan diketik ulang.

**Yang mohon ditinjau ustaz:**
- **Pembagian bagian tiap surat** (usulan Claude, belum ada rujukan tertulis): Al-Humazah 1–4 | 5–9, At-Takatsur 1–4 | 5–8, Al-Qari'ah 1–5 | 6–11, Al-'Adiyat 1–5 | 6–11, Al-Fatihah 1–4 | 5–7, Al-'Asr 1–3 (satu bagian). Al-Fatihah mengikuti pembagian pujian dan permohonan seperti dalam hadis di bawah (Bismillah dihitung ayat 1, sesuai penomoran Kemenag).
- **Jalan cerita** (suami istri pada Al-Humazah, gerombolan pada Al-'Asr, dua saudagar pada At-Takatsur, dst.) adalah karangan untuk anak, mengikuti ide Ricky. Cerita tidak mengaitkan ayat dengan sebab turun tertentu dan tidak menyatakan nasib seseorang; tokoh hanya membaca terjemah ayat lalu berubah.
- Kalimat tokoh yang **menafsirkan** ayat (bukan sekadar mengutip): Al-'Adiyat, Pak Haris: "Kudaku berlari kencang sampai terengah-engah untukku. Tapi aku, yang diberi Allah kuda, harta, dan kesehatan, hampir tidak pernah berterima kasih." (renungan tokoh, mohon dicek apakah pantas); Al-Qari'ah, Bu Marni mengaitkan "timbangan" dengan amal kecil.
- Hadis yang dikutip: kartu hadis menampilkan teks persis dari `sources` (`story.json` → `source_rows`, diambil dengan `content/tools/snapshot-dagang.mjs`).

| tempat / tokoh | surat (bagian) | sumber yang dikutip | kalimat di cerita yang merangkum sumber |
|---|---|---|---|
| Kota Ramai: Pak RT, Pak Burhan, Bu Lastri | Al-Humazah (1–4, 5–9) | `quran:104:1`–`104:9`; hadis `muslim:4690` | Pak Burhan: "Aku hanya membicarakan hal yang benar… kenapa disebut mengumpat?" lalu kartu hadis tentang ghibah dibuka; ia menyimpulkan "menyebut yang benar pun, kalau saudara kita tidak suka dibicarakan, itu ghibah. Dan kalau tidak benar, itu dusta" |
| Warung Bu Warti, gerombolan Ujang | Al-'Asr (1–3) | `quran:103:1`–`103:3`; hadis `bukhari:5933` | Ujang: "Kesehatan dan waktu luang… Kami punya dua-duanya" (dua nikmat yang sering dilupakan) |
| Desa: Kakek Umar, Juragan Karto dan Basri | At-Takatsur (1–4, 5–8) | `quran:102:1`–`102:8`; hadis `muslim:5258` | Juragan Karto: "Yang benar-benar menjadi hartaku hanyalah yang kumakan, kukenakan, dan kusedekahkan" |
| Lembah Timbangan: Pak Timbang, Bu Marni | Al-Qari'ah (1–5, 6–11) | `quran:101:1`–`101:11`; hadis `bukhari:6188` | Bu Marni: "Ringan di lisan, berat di timbangan" (dua kalimat tasbih) |
| Padang Kuda: Bu Ratna, Pak Haris | Al-'Adiyat (1–5, 6–11) | `quran:100:1`–`100:11`; `quran:14:7` | Pak Haris mulai bersyukur setelah kartu ayat tentang syukur dibuka |
| Persimpangan Tiga Jalan: Pak Ustaz, Pak Soleh | Al-Fatihah (1–4, 5–7) | `quran:1:1`–`1:7`; hadis `muslim:598` | Pak Ustaz: Rasulullah ﷺ menyampaikan firman Allah tentang pembagian salat antara Allah dan hamba-Nya (kartu hadis dibuka) |

Pembeli di jalan (Bu Sinta, Pak Jajang, Pak Anto, Bu Ratna) hanya menguji arti kata dan ayat dari surat yang sudah dipelajari pemain (soal yang sama dengan penyiraman dan boss), tanpa sumber baru.
