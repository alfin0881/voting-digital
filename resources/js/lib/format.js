/*
 *|Format tanggal & angka dalam bahasa Indonesia.
 * Sengaja dihitung di sisi browser supaya tidak perlu endpoint tambahan.
 */

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

/** "2026-10-01" -> "1 Oktober 2026" */
export function tanggalPanjang(iso) {
  if (!iso) return '-'
  const d = parseTanggal(iso)
  if (!d) return '-'
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Periode pemilihan lengkap dengan jam.
 *  - satu hari : "2 November 2026, 07:00–12:00"
 *  - beberapa hari : "2 November 2026, 07:00 – 4 November 2026, 12:00"
 * Jam kosong dianggap sepanjang hari dan tidak ditampilkan.
 */
export function periodeWaktu(mulai, jamMulai, selesai, jamSelesai) {
  const penuh = (!jamMulai || jamMulai === '00:00') && (!jamSelesai || jamSelesai === '23:59')

  if (mulai && mulai === selesai) {
    return penuh
      ? tanggalPanjang(mulai)
      : `${tanggalPanjang(mulai)}, ${jamMulai || '00:00'}–${jamSelesai || '23:59'}`
  }

  const a = penuh ? tanggalPanjang(mulai) : `${tanggalPanjang(mulai)}, ${jamMulai || '00:00'}`
  const b = penuh ? tanggalPanjang(selesai) : `${tanggalPanjang(selesai)}, ${jamSelesai || '23:59'}`

  return `${a} – ${b}`
}

/** "2026-10-01" -> "1 Okt 2026" (untuk ruang sempit) */
export function tanggalPendek(iso) {
  if (!iso) return '-'
  const d = parseTanggal(iso)
  if (!d) return '-'
  return `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

/** "2026-10-01" -> "Kamis, 1 Oktober 2026" */
export function tanggalLengkap(iso) {
  if (!iso) return '-'
  const d = parseTanggal(iso)
  if (!d) return '-'
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
}

export function tanggalJam(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}, ${jamMenit(d)}`
}

export function jamMenit(d) {
  const jam = String(d.getHours()).padStart(2, '0')
  const menit = String(d.getMinutes()).padStart(2, '0')
  return `${jam}:${menit}`
}

/**
 * Parse 'YYYY-MM-DD' sebagai waktu LOKAL, bukan UTC.
 * `new Date('2026-10-01')` di-JS dihitung sebagai UTC sehingga di zona waktu
 * negatif (seperti WIB = UTC+7 tidak, tapi mis.nya UTC-5) bisa bergeser sehari.
 */
function parseTanggal(iso) {
  const bagian = String(iso).split('-').map(Number)
  if (bagian.length < 3 || bagian.some(Number.isNaN)) return null
  return new Date(bagian[0], bagian[1] - 1, bagian[2])
}

/*
 * Formatter dibuat SEKALI di tingkat modul, bukan setiap kali fungsi dipanggil.
 *
 * new Intl.NumberFormat() itu mahal: butuh data ICU dan cukup lama dibuat.
 * Versi lama membuatnya tiap panggilan, padahal angka() dipanggil di dalam
 * map() per baris tabel dan per batang grafik. Di halaman yang re-render tiap
 * detik, ini menambah beban nyata.
 *
 * Format-nya sama persis, jadi hasil tampilannya tidak berubah.
 */
const FORMAT_ANGKA = new Intl.NumberFormat('id-ID')
const FORMAT_PERSEN = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
// bytes() butuh jumlah desimal berbeda tergantung satuan (0 untuk "B",
// 1 untuk KB dan seterusnya), jadi keduanya dibuat terpisah di sini.
const FORMAT_BYTES_BULAT = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
const FORMAT_BYTES_SATUAN = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

/** 1234 -> "1.234" */
export function angka(n) {
  return FORMAT_ANGKA.format(Number(n) || 0)
}

/** 45.6789 -> "45,68%" */
export function persen(n) {
  const v = Number(n) || 0
  return `${FORMAT_PERSEN.format(v)}%`
}

/** Nama -> "AF" untuk avatar inisial. */
export function inisial(nama = '') {
  const kata = String(nama).trim().split(/\s+/).filter(Boolean)
  if (!kata.length) return '?'
  if (kata.length === 1) return kata[0].slice(0, 2).toUpperCase()
  return (kata[0][0] + kata[kata.length - 1][0]).toUpperCase()
}

/**
 * Nomor urut kandidat -> "01", "02", "03", … "10".
 *
 * Di database kolomnya bertipe string tapi isinya belum dipadding
 * (KandidatImport menyimpannya sebagai integer), jadi pemaddingan dilakukan
 * di saat tampilan. Keuntungannya: data lama ikut beres tanpa perlu migrasi,
 * dan siapa pun yang menambah kandidat lewat API tidak harus ingat formatnya.
 */
export function nomorUrut(n) {
  const v = parseInt(n, 10)
  if (!Number.isFinite(v)) return String(n ?? '')

  // Di atas 99, padding dua digit tidak lagi berguna tapi tidak salah juga.
  return String(v).padStart(2, '0')
}

/* --------------------------------------------------------------------------
   Format untuk panel admin
   -------------------------------------------------------------------------- */

/**
 * Durasi dalam detik -> "01:02:03" (jam:menit:detik, minimal 2 digit).
 * Dipakai untuk hitung mundur yang berdetak tiap detik di dashboard.
 */
export function durasiHMS(detik) {
  const total = Math.max(0, Math.floor(Number(detik) || 0))
  const jam = Math.floor(total / 3600)
  const menit = Math.floor((total % 3600) / 60)
  const dtk = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(jam)}:${pad(menit)}:${pad(dtk)}`
}

/**
 * Durasi dalam detik -> ringkasan supaya muat di chip sempit
 * (mis. "1 hari 2 jam").
 */
export function durasiPendek(detik) {
  const total = Math.max(0, Math.floor(Number(detik) || 0))
  const hari = Math.floor(total / 86400)
  const jam = Math.floor((total % 86400) / 3600)
  const menit = Math.floor((total % 3600) / 60)
  const dtk = total % 60

  if (hari > 0) return `${hari} hari ${jam} jam`
  if (jam > 0) return `${jam} jam ${menit} mnt`
  return `${menit} mnt ${dtk} dtk`
}

/** 1234567 -> "1,2 MB" (pembulatan satu angka desimal). */
export function bytes(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return '0 B'

  const satuan = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(satuan.length - 1, Math.floor(Math.log(v) / Math.log(1024)))
  const nilai = v / 1024 ** i

  return `${(i === 0 ? FORMAT_BYTES_BULAT : FORMAT_BYTES_SATUAN).format(nilai)} ${satuan[i]}`
}

/** ISO -> "3 jam lalu" / "2 hari lalu" / "baru saja". */
export function sejak(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'

  const detik = Math.floor((Date.now() - d.getTime()) / 1000)
  if (detik < 60) return 'baru saja'

  const menit = Math.floor(detik / 60)
  if (menit < 60) return `${menit} menit lalu`

  const jam = Math.floor(menit / 60)
  if (jam < 24) return `${jam} jam lalu`

  const hari = Math.floor(jam / 24)
  return hari < 30 ? `${hari} hari lalu` : tanggalPendek(iso)
}

/**
 * Persentase perubahan antara dua angka -> nilai untuk ChipDelta.
 * Mengembalikan null bila tidak ada pembanding yang bermakna (mis. 0 -> 0),
 * supaya pemanggil bisa menyembunyikan chip daripada menampilkan "±0%".
 */
export function persenPerubahan(kini, lalu) {
  const a = Number(kini) || 0
  const b = Number(lalu) || 0
  if (b <= 0) return null
  return Math.round(((a - b) / b) * 100)
}

/*
 * ---------------------------------------------------------------------------
 * Warna kandidat
 * ---------------------------------------------------------------------------
 * Setiap nomor urut punya warna sendiri supaya warna kandidat cepat dikenali
 * dari daftar, dari diagram donat, sampai kartu di halaman hasil.
 *
 * Nilainya disalin apa adanya dari App\Livewire\Admin\HasilPemilihan::getColor()
 * supaya warna di React sama persis dengan yang dulu dipakai (dan sama dengan
 * warna di PDF/Excel hasil export).
 *
 * Nomor urut bisa 1 atau '01' sesuai sumber data, jadi keduanya dipetakan.
 */
const WARNA_KANDIDAT = {
  1: '#0c4780',
  2: '#dbad09',
  3: '#f63b3e',
  4: '#10b981',
  5: '#8b5cf6',
}

export const WARNA_DEFAULT = '#64748b'

export function warnaKandidat(nomorUrut) {
  return WARNA_KANDIDAT[Number(nomorUrut)] ?? WARNA_DEFAULT
}

/** Warna dengan nilai alpha CSS, mis. warnaKandidatHal(1, 0.15) -> rgba(...,.15) */
export function warnaKandidatHal(nomorUrut, alpha = 0.15) {
  const hex = warnaKandidat(nomorUrut)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}