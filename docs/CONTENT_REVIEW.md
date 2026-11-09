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
