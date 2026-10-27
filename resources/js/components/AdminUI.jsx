import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import Icon from './Icon'
import Modal from './Modal'
import { angka } from '../lib/format'
import { Tombol, Spinner, Kartu, BilahProgres, LabelKecil, Kerangka as KerangkaUi, Titik } from './UI'

/*
 * Komponen bersama untuk halaman admin.
 * Dipisah agar 11 halaman admin punya tampilan & perilaku yang seragam.
 *
 * Halaman admin sengaja BERBEDA dari halaman pemilih: lebih padat, tanpa
 * animasi yang berlebihan, dan mengutamakan keterbacaan tabel.
 */

/* ======================= LOADING & KOSONG ======================= */

/**
 * Placeholder untuk baris ringkasan di header halaman.
 *
 * Kenapa tidak pakai teks "Memuat..." di sini: area konten di bawah sudah
 * menampilkan spinner + "Memuat data…". Kalau header juga menuliskannya, user
 * membaca kata yang sama dua kali di layar yang sama dan dua-duanya tampil
 * seperti elemen yang belum selesai dibuat, bukan seperti data yang sedang
 * datang. Jadi header cukup menampilkan "ada sesuatu di sini" tanpa kata.
 */
export function MemuatRingkas({ lebar = 'w-32' }) {
  return (
    <span
      className={`skeleton skeleton-muncul inline-block h-3.5 ${lebar} rounded-md align-middle`}
      aria-hidden="true"
    />
  )
}

/**
 * Placeholder saat data dimuat.
 *
 * Dulu hanya spinner di tengah layar kosong, yang bikin admin mengira server
 * mati. Sekarang bentuknya mirip seperti isi sebenarnya (kartu + baris
 * placeholder) supaya transisi ke data terasa jauh lebih halus.
 *
 * `pesan` hanya dipakai pada mode spinner (bukan kartu). Tanpa teks, spinner
 * sendirian terlihat seperti elemen yang belum selesai dibuat; dengan teks
 * jelas bahwa memang sedang memuat.
 */
export function Memuat({ tinggi = 'h-64', kartu = false, pesan = 'Memuat data…' }) {
  if (kartu) {
    return (
      <div className="space-y-4 animate-fade-in" aria-hidden="true">
        <div className="kasya-card p-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2.5">
                <KerangkaUi className="h-9 w-9 rounded-xl" tunda={i * 60} />
                <KerangkaUi className="h-6 w-20" tunda={i * 60 + 50} />
                <KerangkaUi className="h-3 w-14" tunda={i * 60 + 100} />
              </div>
            ))}
          </div>
        </div>
        <div className="kasya-card overflow-hidden">
          <MemuatTabel baris={6} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${tinggi}`}
      role="status"
      aria-live="polite"
    >
      <Spinner className="w-7 h-7 text-[var(--c-primary)]" />
      <p className="text-sm text-[var(--c-text-muted)] flex items-center gap-1">
        {pesan}
        <Titik />
      </p>
    </div>
  )
}

/** Kerangka kasar: beberapa baris "loading" supaya halaman tidak mendadak kosong. */
export function MemuatTabel({ baris = 5 }) {
  return (
    <div className="p-5 space-y-3.5" aria-hidden="true">
      {Array.from({ length: baris }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <KerangkaUi className="h-4 w-8" tunda={i * 70} />
          <KerangkaUi className="h-4 flex-1" tunda={i * 70 + 40} />
          <KerangkaUi className="h-4 w-20" tunda={i * 70 + 80} />
          <KerangkaUi className="h-4 w-16" tunda={i * 70 + 120} />
        </div>
      ))}
    </div>
  )
}

export function KosongTable({ pesan = 'Belum ada data.', ikon = 'inbox' }) {
  return (
    <div className="flex flex-col items-center justify-center py-14">
      <div
        className="w-14 h-14 rounded-xl bg-[var(--c-bg-page)] border border-[var(--c-border)]
          grid place-items-center mb-3 text-[var(--c-text-muted)]"
      >
        <Icon name={ikon} className="w-6 h-6" />
      </div>
      <p className="text-sm text-[var(--c-text-muted)] font-semibold">{pesan}</p>
    </div>
  )
}

/* ======================= JUDUL HALAMAN ======================= */

export function KepalaHalaman({ children, aksi, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 mb-6 ${className}`}>
      <div className="min-w-0">{children}</div>
      {aksi && <div className="flex flex-wrap items-center gap-2.5">{aksi}</div>}
    </div>
  )
}

/* KartuStatistik sengaja di-import dari UI.jsx agar konsisten dengan
   halaman pemilih. Di sini hanya di-re-export supaya halaman admin
   cukup mengimpor dari satu tempat. */
export {
  KartuStatistik,
  Donat,
  Hero,
  Chip,
  JudulBagian,
  Kosong,
  KosongDashed,
  Panel,
  Lencana,
  Peringatan,
  BilahProgres,
  Sparkline,
} from './UI'

/* ======================= FORM ======================= */

export function Field({ label, wajib, galat, bantuan, children, className = '' }) {
  const id = useId()

  /*
   * JANGAN membungkus kontrol dengan <label>.
   *
   * Pada <input type="date">, klik ikon kalender ikut memicu aktivasi label,
   * yang meneruskan klik kedua ke input. Akibatnya date picker terbuka lalu
   * langsung tertutup — tanggal hanya bisa diketik manual. Label dihubungkan
   * lewat htmlFor + id agar klik teks label tetap memfokuskan field.
   *
   * Hanya anak PERTAMA yang diberi id (kontrol utamanya); anak tambahan
   * seperti preview foto atau penghitung karakter dibiarkan apa adanya.
   */
  const daftar = Children.toArray(children)
  const pertama = daftar[0]

  if (isValidElement(pertama) && pertama.props?.id == null) {
    daftar[0] = cloneElement(pertama, { id })
  }

  const idKontrol = isValidElement(daftar[0]) ? daftar[0].props?.id : undefined

  return (
    <div className={`block ${className}`}>
      <label
        htmlFor={idKontrol}
        className="block text-sm font-semibold text-[var(--c-text)] mb-2"
      >
        {label} {wajib && <span className="text-[var(--c-rose)]">*</span>}
      </label>
      {daftar}
      {bantuan && !galat && (
        <span className="block mt-1.5 text-xs text-[var(--c-text-muted)]">{bantuan}</span>
      )}
      {galat && (
        <span className="block mt-1.5 text-xs font-semibold text-[var(--c-rose)]">{galat}</span>
      )}
    </div>
  )
}

/** Kelas standar input/select/textarea di panel admin. */
export const KELAS_INPUT =
  'w-full h-11 px-4 rounded-xl text-sm bg-[var(--c-bg-surface)] text-[var(--c-text)] ' +
  'placeholder:text-[var(--c-text-subtle)] border border-[var(--c-border)] ' +
  'focus:border-[var(--c-primary)] focus:ring-4 focus:ring-[var(--c-primary-soft)] ' +
  'outline-hidden transition duration-150 disabled:opacity-60'

export function Input(props) {
  const { className = '', ...rest } = props
  return <input {...rest} className={`${KELAS_INPUT} ${className}`} />
}

export function Select(props) {
  const { className = '', ...rest } = props
  return (
    <select
      {...rest}
      className={`${KELAS_INPUT} cursor-pointer appearance-none pr-9 ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.7rem center',
        backgroundSize: '1rem',
      }}
    />
  )
}

export function Textarea(props) {
  const { className = '', ...rest } = props
  return <textarea {...rest} className={`${KELAS_INPUT} h-auto py-3 resize-y ${className}`} />
}

/** Input file yang selaras dengan design system. */
export function InputFile({ className = '', ...rest }) {
  return (
    <input
      {...rest}
      type="file"
      className={`w-full text-sm text-[var(--c-text-muted)] cursor-pointer
        file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0
        file:bg-[var(--c-primary-soft)] file:text-[var(--c-primary-dark)]
        file:font-bold file:cursor-pointer hover:file:bg-[var(--c-primary-soft)] ${className}`}
    />
  )
}

/** Kolom pencarian dengan ikon di dalam kotak (tanpa label terpisah). */
export function Cari({ placeholder = 'Cari…', className = '', ...rest }) {
  return (
    <div className={`relative ${className}`}>
      <Icon
        name="search"
        className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--c-text-subtle)] pointer-events-none"
      />
      <input {...rest} type="search" placeholder={placeholder} className={`${KELAS_INPUT} pl-10`} />
    </div>
  )
}

/* ======================= TABEL ======================= */

/**
 * Tabel data.
 *
 * Kepala tabel dibuat `sticky` supaya konteks kolom tetap terlihat saat
 * daftar panjang digulir — penting di halaman anggota yang bisa ratusan baris.
 *
 * `sematkan` = 1 bila kolom pertama (nama/NIS/waktu) ikut menempel saat tabel
 * digulir ke samping. Di tabel 8+ kolom, tanpa ini nama orang yang sedang
 * dibaca ikut hilang ke luar layar.
 */
export function Tabel({ kolom, children, className = '', tinggi, sematkan = 0 }) {
  const kelasSematan = sematkan === 1 ? 'kasya-sematkan-1' : ''

  return (
    <div
      className={`overflow-x-auto max-w-full ${className}`}
      style={tinggi ? { maxHeight: tinggi, overflowY: 'auto' } : undefined}
    >
      <table className={`w-full text-left border-collapse kasya-tabel ${kelasSematan}`}>
        <thead className="kasya-tabel-kepala">
          <tr>
            {kolom.map((k, i) => (
              <th key={i} scope="col" className="px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--c-text-muted)] whitespace-nowrap">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--c-border)]">{children}</tbody>
      </table>
    </div>
  )
}

export function Baris({ children, onClick, className = '' }) {
  return (
    <tr
      onClick={onClick}
      className={`transition-colors hover:bg-[var(--c-primary-soft)]/50
        ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  )
}

export function Sel({ children, className = '', ...rest }) {
  // ...rest meneruskan colSpan, title, dsb. Sebelumnya colSpan diabaikan
  // sehingga baris "pilih semua" tidak membentang selebar tabel.
  //
  // Padding vertikal TIDAK diatur di sini, melainkan datang dari kelas
  // `.kasya-tabel` pada <table> — supaya jarak baris seragam di semua tabel
  // tanpa harus mengulang kelas di tiap sel.
  return (
    <td
      {...rest}
      className={`px-4 text-sm text-[var(--c-text)] align-middle ${className}`}
    >
      {children}
    </td>
  )
}

/** Th sortable untuk tabel. */
export function ThSort({ label, aktif, arah, onKlik }) {
  return (
    <th
      scope="col"
      onClick={onKlik}
      className="px-4 py-3 text-xs font-bold uppercase
        tracking-[0.1em] text-[var(--c-text-muted)] whitespace-nowrap cursor-pointer
        hover:text-[var(--c-primary)] transition-colors select-none"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {aktif && <span className="text-[var(--c-primary)]">{arah === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  )
}

/** Tombol aksi ringkas untuk di dalam baris tabel. */
export function AksiBaris({ label, ikon, onClick, warna = 'netral', disabled }) {
  const gaya = {
    netral:
      'text-[var(--c-text-muted)] hover:text-[var(--c-primary)] hover:bg-[var(--c-primary-soft)]',
    bahaya: 'text-[var(--c-text-muted)] hover:text-[var(--c-bahaya)] hover:bg-[var(--c-rose-soft)]',
    sukses: 'text-[var(--c-text-muted)] hover:text-[var(--c-emerald)] hover:bg-[var(--c-emerald-soft)]',
  }

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-9 grid place-items-center rounded-lg transition-colors
        disabled:opacity-40 disabled:pointer-events-none ${gaya[warna] ?? gaya.netral}`}
    >
      <Icon name={ikon} className="w-4 h-4" />
    </button>
  )
}

/* ======================= PAGINASI ======================= */

export function Paginasi({ meta, onGanti }) {
  if (!meta) return null

  const { page = 1, last_page: last = 1, total = 0 } = meta

  if (!last || last <= 1) {
    return (
      <div className="px-4 py-3.5 border-t border-[var(--c-border)]">
        <p className="text-xs text-[var(--c-text-muted)] text-center">
          {total} data
        </p>
      </div>
    )
  }

  // Tampilkan maksimal 5 nomor halaman di sekitar halaman aktif.
  const nomor = []
  const mulai = Math.max(1, Math.min(page - 2, last - 4))
  const akhir = Math.min(last, mulai + 4)

  for (let i = mulai; i <= akhir; i++) nomor.push(i)

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5
        border-t border-[var(--c-border)] bg-[var(--c-bg-subtle)]"
    >
      <p className="text-xs text-[var(--c-text-muted)]">
        Halaman <b className="text-[var(--c-text)]">{page}</b> dari {last} • {total} data
      </p>

      <div className="flex items-center gap-1">
        <Tombol
          varian="polos"
          ukuran="kecil"
          disabled={page <= 1}
          onClick={() => onGanti(page - 1)}
          aria-label="Halaman sebelumnya"
          className="w-9 px-0"
        >
          ‹
        </Tombol>

        {nomor.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onGanti(n)}
            aria-current={n === page ? 'page' : undefined}
            className={`min-w-9 h-9 px-2.5 rounded-lg text-xs font-semibold transition
              ${
                n === page
                  ? 'bg-[var(--c-primary)] text-white shadow-sm shadow-[var(--c-glow)]'
                  : 'text-[var(--c-text-muted)] hover:bg-[var(--c-primary-soft)] hover:text-[var(--c-primary)]'
              }`}
          >
            {n}
          </button>
        ))}

        <Tombol
          varian="polos"
          ukuran="kecil"
          disabled={page >= last}
          onClick={() => onGanti(page + 1)}
          aria-label="Halaman berikutnya"
          className="w-9 px-0"
        >
          ›
        </Tombol>
      </div>
    </div>
  )
}

/* ======================= KONFIRMASI ======================= */

/**
 * Dialog konfirmasi generik untuk tindakan yang berdampak besar
 * (mengaktifkan pemilihan, menghapus, dll).
 *
 * Dipakai ulang oleh `KonfirmasiHapus` supaya seluruh panel admin punya
 * bahasa visual yang sama saat muncul peringatan.
 */
export function Konfirmasi({
  buka,
  onTutup,
  onYa,
  judul,
  pesan,
  tombol = 'Ya, Lanjutkan',
  warna = 'utama',
  ikon = 'warning',
  memuat,
}) {
  const bahaya = warna === 'bahaya'

  return (
    <Modal
      buka={buka}
      onTutup={onTutup}
      judul={judul}
      lebar="max-w-md"
      aksi={
        <>
          <Tombol varian="sekunder" onClick={onTutup} disabled={memuat} className="w-full sm:w-auto">
            Batal
          </Tombol>
          <Tombol
            varian={warna}
            onClick={onYa}
            memuat={memuat}
            className="w-full sm:w-auto"
          >
            {tombol}
          </Tombol>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 w-10 h-10 grid place-items-center rounded-xl
            ${
              bahaya
                ? 'bg-[var(--c-rose-soft)] text-[var(--c-bahaya)]'
                : 'bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)]'
            }`}
        >
          <Icon name={ikon} className="w-5 h-5" />
        </span>
        <div className="text-[var(--c-text-muted)] pt-2 min-w-0">{pesan}</div>
      </div>
    </Modal>
  )
}

/** Konfirmasi khusus hapus — delegate ke `Konfirmasi` di atas. */
export function KonfirmasiHapus({ buka, onTutup, onYa, judul, pesan, memuat }) {
  return (
    <Konfirmasi
      buka={buka}
      onTutup={onTutup}
      onYa={onYa}
      judul={judul || 'Hapus data?'}
      pesan={pesan}
      tombol="Ya, Hapus"
      warna="bahaya"
      memuat={memuat}
    />
  )
}

/* ======================= GRAFIK BATANG (SVG, tanpa library) ======================= */

/** Lebar perkiraan teks dalam px — dipakai untuk mengatur margin & label. */
function lebarTeks(teks, fontSize) {
  return String(teks).length * fontSize * 0.6
}

/*
 * Dibuat sekali di luar fungsi, bukan tiap call. angkaRingkas dipanggil
 * per label sumbu-Y dan per batang, jadi di grafik yang sering re-render
 * versi lama membuat hundreds formatter. Hasil format tidak berubah.
 */
const FORMAT_RINGKAS = new Intl.NumberFormat('id-ID')

/** 1234 -> "1.234"; dipakai di sumbu-Y & nilai di atas batang. */
function angkaRingkas(n) {
  const v = Math.round(Number(n) || 0)
  return FORMAT_RINGKAS.format(v)
}

/**
 * Pilih satu langkah sumbu-Y yang "bulat" dan menutupi nilai tertinggi.
 *
 * Sumbu-Y lama memakai Math.round(maks * p) pada garis 0.25/0.5/0.75/1, sehingga
 * maks=3 menghasilkan label 1, 2, 2, 3 — kembar dan membingungkan. Sekarang
 * langkahnya diambil dari daftar 1 / 2 / 2,5 / 5 × 10ⁿ, jadi setiap garis
 * jatuh di angka bulat dan berbeda.
 */
function langkahRapi(maks, jumlahGaris = 4) {
  const target = (maks || 1) / jumlahGaris

  for (const pangkat of [1, 10, 100, 1000, 10000, 100000]) {
    for (const faktor of [1, 2, 2.5, 5]) {
      const langkah = faktor * pangkat
      if (langkah >= target) return langkah
    }
  }

  return Math.max(1, Math.ceil(target))
}

/**
 * Grafik batang SVG yang mengikuti lebar kartunya.
 *
 * Versi lama memakai viewBox selebar 100 satuan dengan tinggi tetap; di
 * kartu yang lebar, SVG diskalakan "meet" sehingga grafik hanya tergambar
 * ~100px di tengah dan teksnya mengecil tak terbaca. Sekarang lebar kartu
 * diukur (ResizeObserver) dan grafik digambar 1:1 dalam piksel.
 *
 * `sorotTerakhir` meredupkan bucket terakhir — dipakai untuk "jam berjalan"
 * yang isinya belum genap satu jam, supaya tidak disalahbaca sebagai data final.
 *
 * Sengaja SVG, bukan Chart.js: menambah ratusan kB dependency untuk satu
 * grafik tidak sepadan.
 */
export function GrafikBatang({
  label = [],
  data = [],
  tinggi = 200,
  warna = 'var(--c-primary)',
  warnaIsi = 'var(--c-primary)',
  sorotTerakhir = false,
}) {
  const wadahRef = useRef(null)
  const [lebar, setLebar] = useState(320)

  /* Id unik per instance supaya dua grafik di halaman yang sama (Dashboard &
     Pantau) tidak saling "mencuri" gradien yang sama. */
  const idAwal = useId()
  const idGradien = `grafik-batang-isi-${idAwal.replace(/:/g, '')}`

  useEffect(() => {
    const el = wadahRef.current
    if (!el) return undefined

    const ukur = () => setLebar(Math.max(160, Math.floor(el.clientWidth)))
    ukur()

    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(ukur)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const nilai = data.map((d) => Number(d) || 0)
  const jumlah = Math.max(1, nilai.length)

  /* Sumbu-Y dibulatkan ke angka "bulat" (1 / 2 / 5 × 10ⁿ) supaya garis
    -nitiknya jatuh di angka yang mudah dibaca (0, 25, 50, 75, 100) dan tidak
     pernah menampilkan label kembar seperti "2 2 3 3" seperti dulu. */
  const puncak = Math.max(1, ...nilai)
  const langkah = langkahRapi(puncak)
  const maks = langkah * Math.max(1, Math.ceil(puncak / langkah))
  const tick = Array.from({ length: Math.round(maks / langkah) + 1 }, (_, i) => i * langkah)

  /* Ruang kiri dihitung dari lebar teks tick terpanjang, bukan dipatok 30px —
     kalau suaranya ribuan, angka "1.200" dulu keluar dari kanvas. */
  const kiri = Math.max(26, Math.ceil(lebarTeks(angkaRingkas(maks), 10)) + 12)
  const bawah = 26 // ruang label sumbu-X
  const atas = 20 // ruang untuk nilai di atas batang
  const areaW = Math.max(40, lebar - kiri - 6)
  const areaH = Math.max(40, tinggi - bawah - atas)
  const slot = areaW / jumlah
  const lebarBar = Math.min(36, Math.max(3, slot * 0.58))

  /* Label sumbu-X hanya digambar seperlunya: "10:00" ±26px, jadi jarak aman
     antar label dibulatkan ke kelipatan terdekat supaya tidak pernah menimpa. */
  const langkahLabel = Math.max(
    1,
    Math.ceil(jumlah / Math.max(1, Math.floor(areaW / (lebarTeks('00:00', 10) + 12))))
  )

  /* Nilai di atas batang hanya muat kalau batangnya tidak terlalu rapat. */
  const tampilNilai = slot >= 26

  return (
    <div ref={wadahRef} className="w-full min-w-0">
      <svg
        width={lebar}
        height={tinggi}
        viewBox={`0 0 ${lebar} ${tinggi}`}
        role="img"
        aria-label="Grafik batang"
        className="block max-w-full"
      >
        <defs>
          <linearGradient id={idGradien} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={warnaIsi} stopOpacity="0.95" />
            <stop offset="100%" stopColor={warnaIsi} stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {tick.map((v) => {
          const y = atas + areaH - areaH * (v / maks)
          return (
            <g key={v}>
              <line
                x1={kiri}
                x2={lebar - 6}
                y1={y}
                y2={y}
                stroke="var(--c-border)"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <text
                x={kiri - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-[var(--c-text-muted)]"
                style={{ fontSize: 11 }}
              >
                {angkaRingkas(v)}
              </text>
            </g>
          )
        })}

        {nilai.map((n, i) => {
          const tinggiBar = (n / maks) * areaH
          const x = kiri + i * slot + slot / 2
          const y = atas + areaH - tinggiBar
          /* Bucket terakhir = jam yang sedang berjalan, jadi belum penuh.
             Warnanya diredupkan supaya admin tidak salah baca. */
          const belumPenuh = sorotTerakhir && i === jumlah - 1

          return (
            <g key={i}>
              <rect
                x={x - lebarBar / 2}
                y={n > 0 ? y : atas + areaH - 2}
                width={lebarBar}
                height={n > 0 ? Math.max(3, tinggiBar) : 2}
                rx={4}
                fill={n > 0 ? `url(#${idGradien})` : warnaIsi}
                opacity={n > 0 ? (belumPenuh ? 0.45 : 1) : 0.25}
              >
                <title>{`${label[i] ?? ''}: ${angka(n)}${belumPenuh ? ' (jam berjalan, belum penuh)' : ''}`}</title>
              </rect>

              {tampilNilai && n > 0 && (
                <text
                  x={x}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-[var(--c-text)]"
                  style={{ fontSize: 11, fontWeight: 700 }}
                >
                  {angkaRingkas(n)}
                </text>
              )}

              {i % langkahLabel === 0 && (
                <text
                  x={x}
                  y={tinggi - 8}
                  textAnchor="middle"
                  className="fill-[var(--c-text-muted)]"
                  style={{ fontSize: 11, fontWeight: 600 }}
                >
                  {label[i] ?? ''}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ======================= BARIS PROGRES + KELAS ======================= */

export function BarisProgres({ label, sudah, total, persen, warna = 'gradient' }) {
  // Warna menyesuaikan tingkat partisipasi: gradasi hijau-biru bila >=80%, biru muda >=50%, merah di bawahnya.
  const warnaOtomatis =
    warna === 'gradient' ? (persen >= 80 ? 'gradient' : persen >= 50 ? 'sky' : 'bahaya') : warna

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-sm font-semibold text-[var(--c-text)] truncate">{label}</span>
        <span className="text-xs text-[var(--c-text-muted)] tabular-nums whitespace-nowrap">
          {sudah}/{total} • {persen}%
        </span>
      </div>
      <BilahProgres persen={persen} tinggi="h-1.5" warna={warnaOtomatis} />
    </div>
  )
}

/* ======================= FILTER BAR ======================= */

/**
 * Baris filter. Dibungkus kartu agar terlihat sebagai satu alat, bukan
 * sekadar deretan input yang lepas-lepas.
 */
export function BarFilter({ children, reset, label = 'Saring data' }) {
  return (
    <div className="kasya-card mb-5 overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 p-4">
        <span className="hidden sm:flex items-center gap-2 h-10 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--c-text-muted)]">
          <Icon name="search" className="w-4 h-4" />
          {label}
        </span>
        {children}
        {reset && (
          <Tombol varian="sekunder" ukuran="kecil" onClick={reset} className="h-10">
            <Icon name="refresh" className="w-4 h-4" />
            Reset
          </Tombol>
        )}
      </div>
    </div>
  )
}

/* ======================= SALIN KE PAPAN KLIP ======================= */

/** Tombol salin. Memakai clipboard API, ada fallback untuk HTTP lama. */
export function TombolSalin({ teks, label = 'Salin', onSukses, onGagal }) {
  const [sudah, setSudah] = useState(false)

  const salin = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(teks)
      } else {
        // Fallback untuk komputer lab tanpa clipboard aman.
        const area = document.createElement('textarea')
        area.value = teks
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }

      setSudah(true)
      onSukses?.()
      setTimeout(() => setSudah(false), 1800)
    } catch (e) {
      onGagal?.(e)
    }
  }

  return (
    <Tombol varian="sekunder" ukuran="kecil" onClick={salin}>
      <Icon name={sudah ? 'check' : 'clipboard-check'} className="w-4 h-4" />
      {sudah ? 'Tersalin' : label}
    </Tombol>
  )
}

/* Re-export supaya halaman cukup mengimpor dari satu file. */
export { KerangkaUi, LabelKecil, Kartu, Tombol, Spinner }