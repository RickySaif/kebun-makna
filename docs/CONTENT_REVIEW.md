# Antrian Tinjauan Konten (Content review queue)

**Peninjau:** ustaz (dipilih Ricky). **Persetujuan:** Ricky mengubah status secara manual setelah ustaz setuju. Tidak perlu akun khusus untuk peninjau.

Setiap konten agama baru (cerita, dialog, kuis) dicantumkan di bawah. Untuk tiap item, ustaz cukup membaca dua kolom:

- **Kiri — Cerita / dialog** dalam bahasa Indonesia, persis seperti yang akan dilihat anak.
- **Kanan — Sumber yang dikutip**: teks Arab, terjemahan Indonesia, nomor rujukan (`ref_label`) dan atribusi, disalin apa adanya dari pustaka `sources` (tidak diketik ulang).

Status:
- ⏳ **pending** — belum ditinjau. Anak **tidak** melihat konten ini; hanya orang tua (pratinjau) yang bisa.
- ✅ **approved** — sudah disetujui ustaz, diubah oleh Ricky. Baru muncul untuk anak.
- ✏️ **revisi** — ustaz minta perubahan (tulis catatannya di "Catatan peninjau").

Cara Ricky menyetujui: ubah `"status": "pending"` menjadi `"status": "approved"` di file `content/akhlak/<id>.json`, ubah status di dokumen ini, lalu commit.

Catatan penomoran hadis: nomor Bukhari/Muslim di pustaka memakai **penomoran Lidwa Pusaka**, yang bisa berbeda dari penomoran sunnah.com / Fuad Abdul Baqi. Selalu periksa teksnya, bukan hanya nomornya.

## Ringkasan

| id | judul | sumber | status |
|---|---|---|---|
| — | (belum ada item) | — | — |

## Item

(Belum ada item. Item baru ditambahkan dengan format berikut.)

<!--
### <id> — <judul>  · Status: ⏳ pending

<table>
<tr><th width="50%">Cerita / dialog (yang dilihat anak)</th><th width="50%">Sumber yang dikutip</th></tr>
<tr><td valign="top">

…dialog…

</td><td valign="top">

**<ref_label>** — <attribution>

<div dir="rtl">…arabic…</div>

…indonesian…

</td></tr>
</table>

**Catatan peninjau:** …
-->
