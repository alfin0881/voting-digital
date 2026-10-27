/*
 * Komponen UI dasar — dipakai seluruh aplikasi (pemilih & admin).
 *
 * Semua styling memakai token --c-* supaya tema terang/gelap bisa ditukar
 * tanpa menyentuh komponen. Nilai bawaan (default prop) sengaja dibuat
 * netral supaya pemanggil bebas menimpanya.
 */

import { lazy, Suspense, useId, useMemo } from 'react'
import { angka, WARNA_DEFAULT } from '../lib/format'

/*
 * ApexCharts dimuat secara dinamis (lazy), bukan di-impor di atas.
 *
 * Alasannya: file ini (UI.jsx) diimpor oleh hampir semua halaman, termasuk
 * halaman /login yang ringan. Kalau Chart diimpor langsung, seluruh
 * ApexCharts (~958 KB) ikut terunduh setiap kali siapa pun membuka aplikasi,
 * padahal donat hanya dipakai di 2 halaman: Hasil dan LayarBesar.
 *
 * Dipindah ke lazy, berkas baru diambil saat Pie3DHasil benar-benar dirender.
 * apexcharts juga dipisah jadi chunk sendiri lewat manualChunks di
 * vite.config.js, jadi tidak tercampur dengan kode aplikasi.
 */
const Chart = lazy(() => import('react-apexcharts'))

// Warna netral untuk placeholder saat belum ada suara sama sekali.
const WARNA_KOSONG = WARNA_DEFAULT

/**
 * Spinner — indikator memutar.
 *
 * Dipakai di dalam tombol, kartu kecil, dan apa pun yang tidak punya ruang
 * untuk kerangka. Preferensi reduced-motion dihormati lewat blok media query
 * global di index.css (animasi dimatikan, spinner tetap terlihat sebagai
 * lingkaran sehingga tidak hilang sama sekali).
 */
export function Spinner({ className = 'w-4 h-4' }) {
  return (
    <svg
      className={`${className} kasya-putar`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
      <path d="M12 2a10 10 0 0010 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Tiga titik berurutan — lebih "tenang" daripada spinner untuk teks pendek
 * seperti "Memuat...", jadi tidak perlu lingkaran besar yang menarik
 * perhatian dari isi halaman.
 */
export function Titik({ className = '' }) {
  return (
    <span className={`titik-muat ${className}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * Indikator memuat ringkas: spinner + label + bilah proses bolak-balik.
 *
 * Dipakai untuk layar penuh dan area yang belum tahu apa isinya.
 * Untuk area yang sudah punya bentuk — tabel, kartu statistik — pakai
 * Kerangka/Memuat supaya transisinya lebih halus.
 */
export function MemuatLayar({
  pesan = 'Memuat…',
  detail,
  className = '',
  /* Spinner disembunyikan kalau pemanggil sudah menaruh indikator sendiri di
     slot `children` (mis. logo berdenyut) — supaya tidak ada dua penanda yang
     sama-sama berputar di satu layar. */
  tanpaSpinner = false,
  children,
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 animate-fade-in ${className}`}
      role="status"
      aria-live="polite"
    >
      {!tanpaSpinner && (children ?? <Spinner className="w-9 h-9 text-[var(--c-primary)]" />)}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-sm font-semibold text-[var(--c-text-muted)] flex items-center gap-1">
          {pesan}
          <Titik />
        </p>
        {detail && <p className="text-xs text-[var(--c-text-subtle)]">{detail}</p>}
      </div>
      <div className="baris-muat h-1 w-32 rounded-full" />
    </div>
  )
}

/* ==========================================================================
   KARTU
   ========================================================================== */

export function Kartu({ children, className = '', hover = false, style, ...rest }) {
  return (
    <div
      {...rest}
      style={style}
      className={`kasya-card ${hover ? 'kasya-card-hover' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * Kartu dengan kepala yang menempel: judul, keterangan, dan slot aksi.
 * Dipakai halaman admin supaya jarak antar-bagian selalu sama, tidak
 * ditentukan manual (`mb-4`, `mt-4`, ...) di tiap file.
 */
export function Panel({ judul, keterangan, aksi, ikon, children, className = '', bodyClass = 'p-5' }) {
  return (
    <section className={`kasya-card overflow-hidden ${className}`}>
      {(judul || aksi) && (
        <header
          className="flex flex-wrap items-start justify-between gap-3 px-5 py-4
            border-b border-[var(--c-border)] bg-[var(--c-bg-subtle)]"
        >
          <div className="flex items-start gap-3 min-w-0">
            {ikon && (
              <span
                className="shrink-0 w-9 h-9 rounded-lg grid place-items-center
                  bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)]"
              >
                {ikon}
              </span>
            )}
            <div className="min-w-0">
              {judul && (
                <h2 className="text-[16px] font-bold text-[var(--c-text)] leading-tight">{judul}</h2>
              )}
              {keterangan && (
                <p className="text-sm text-[var(--c-text-muted)] mt-1">{keterangan}</p>
              )}
            </div>
          </div>

          {aksi && <div className="flex flex-wrap items-center gap-2 shrink-0">{aksi}</div>}
        </header>
      )}

      <div className={bodyClass}>{children}</div>
    </section>
  )
}

/* ==========================================================================
   TOMBOL
   ========================================================================== */

const VARIAN = {
  utama:
    'bg-[var(--c-primary)] text-white shadow-md shadow-[var(--c-glow)] hover:bg-[var(--c-primary-hover)] hover:shadow-lg',
  sukses: 'bg-[var(--c-emerald)] text-white shadow-md hover:brightness-110',
  bahaya: 'bg-[var(--c-bahaya)] text-white shadow-md hover:brightness-110',
  peringatan: 'bg-[var(--c-amber)] text-white shadow-md hover:brightness-110',
  gelapis:
    'bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)] border border-[var(--c-primary-soft-border)] hover:bg-[var(--c-primary)] hover:text-white hover:border-[var(--c-primary)]',
  sekunder:
    'bg-[var(--c-bg-surface)] text-[var(--c-text)] border border-[var(--c-border)] shadow-sm hover:border-[var(--c-primary-soft-border)] hover:text-[var(--c-primary)] hover:bg-[var(--c-primary-soft)]',
  polos:
    'text-[var(--c-text-muted)] hover:text-[var(--c-primary)] hover:bg-[var(--c-primary-soft)]',
  /* Alias untuk "halus" supaya halaman lama tidak perlu diubah. */
  halus:
    'bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)] border border-[var(--c-primary-soft-border)] hover:bg-[var(--c-primary)] hover:text-white hover:border-[var(--c-primary)]',
}

const UKURAN = {
  kecil: 'h-9 px-3.5 text-xs rounded-lg gap-1.5',
  sedang: 'h-10 px-4 text-sm rounded-xl gap-2',
  besar: 'h-11 px-5 text-base rounded-xl gap-2',
}

export function Tombol({
  children,
  varian = 'utama',
  ukuran = 'sedang',
  memuat = false,
  className = '',
  href,
  ...rest
}) {
  const kelas = `inline-flex items-center justify-center font-semibold whitespace-nowrap
        transition-all duration-200 active:scale-[0.97]
        disabled:opacity-50 disabled:pointer-events-none
        ${VARIAN[varian] ?? VARIAN.utama} ${UKURAN[ukuran] ?? UKURAN.sedang} ${className}`

  // Dengan href, tampil sebagai tautan bergaya tombol. Membungkus <button>
  // di dalam <a> itu HTML tidak valid dan di sebagian browser (Firefox)
  // klik pada tombolnya tidak membuka tautan -> unduhan tidak jalan.
  if (href) {
    const nonaktif = rest.disabled || memuat
    return (
      <a
        href={nonaktif ? undefined : href}
        aria-disabled={nonaktif || undefined}
        className={`${kelas} ${nonaktif ? 'opacity-50 pointer-events-none' : ''}`}
        {...(rest.download !== undefined ? { download: rest.download } : {})}
        {...(rest.target ? { target: rest.target, rel: 'noopener noreferrer' } : {})}
        onClick={rest.onClick}
      >
        {memuat && <Spinner />}
        {children}
      </a>
    )
  }

  return (
    <button type="button" {...rest} disabled={rest.disabled || memuat} className={kelas}>
      {memuat && <Spinner />}
      {children}
    </button>
  )
}

/** Tombol berbentuk lingkaran dengan ikon saja (untuk topbar & aksi baris). */
export function TombolIkon({ children, label, className = '', ...rest }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`w-9 h-9 grid place-items-center rounded-xl
        bg-[var(--c-bg-surface)] border border-[var(--c-border)] shadow-sm
        text-[var(--c-text-muted)] hover:text-[var(--c-primary)]
        hover:border-[var(--c-primary-soft-border)] transition-colors
        disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ==========================================================================
   LABEL KECIL — untuk judul metrik
   ========================================================================== */

export function LabelKecil({ children, className = '' }) {
  return (
    <span
      className={`block text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--c-text-muted)] ${className}`}
    >
      {children}
    </span>
  )
}

/** Judul bagian + keterangan, dengan slot aksi di kanan (tanpa kartu). */
export function JudulBagian({ judul, keterangan, aksi, ikon, className = '' }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 mb-5 ${className}`}>
      <div className="flex items-start gap-3 min-w-0">
        {ikon && (
          <span
            className="shrink-0 w-9 h-9 rounded-lg grid place-items-center
              bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)]"
          >
            {ikon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-[var(--c-text)] leading-tight">{judul}</h2>
          {keterangan && <p className="text-sm text-[var(--c-text-muted)] mt-1">{keterangan}</p>}
        </div>
      </div>
      {aksi && <div className="flex flex-wrap items-center gap-2">{aksi}</div>}
    </div>
  )
}

/* ==========================================================================
   HERO — banner gradient dengan pola dekoratif
   ========================================================================== */

export function Hero({ children, className = '' }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl text-white shadow-lg
        bg-[linear-gradient(120deg,var(--c-primary)_0%,var(--c-primary-hover)_45%,var(--c-violet)_100%)]
        ${className}`}
    >
      {/* Pola bola dekoratif (murni visual). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-16 -bottom-28 h-56 w-56 rounded-full bg-white/[0.07]"
      />
      {/* Jejak cahaya tipis supaya gradient tidak terasa datar. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(115deg, transparent 45%, rgba(255,255,255,0.18) 50%, transparent 55%)',
        }}
      />

      <div className="relative p-6 sm:p-7">{children}</div>
    </div>
  )
}

/** Chip status di dalam Hero. */
export function Chip({ children, warna = 'putih', ikon, denyut = false }) {
  const gaya = {
    putih: 'bg-white/15 border-white/25 text-white',
    bahaya: 'bg-[var(--c-bahaya)] border-white/30 text-white',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border backdrop-blur-sm
        text-[11px] font-semibold ${gaya[warna] ?? gaya.putih}`}
    >
      {denyut && (
        <span className="relative flex h-2 w-2">
          <span className="denyut absolute inline-flex h-full w-full rounded-full bg-current opacity-70" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {ikon}
      {children}
    </span>
  )
}

/* ==========================================================================
   LENCANA
   ========================================================================== */

const WARNA_LENCANA = {
  sukses: 'bg-[var(--c-emerald-soft)] text-[var(--c-emerald)] border-[var(--c-emerald)]/30',
  peringatan: 'bg-[var(--c-amber-soft)] text-[var(--c-amber)] border-[var(--c-amber)]/30',
  bahaya: 'bg-[var(--c-rose-soft)] text-[var(--c-rose)] border-[var(--c-rose)]/30',
  informasi:
    'bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)] border-[var(--c-primary-soft-border)]',
  sky: 'bg-[var(--c-sky-soft)] text-[var(--c-sky)] border-[var(--c-sky)]/30',
  violet: 'bg-[var(--c-violet-soft)] text-[var(--c-violet)] border-[var(--c-violet)]/30',
  netral: 'bg-[var(--c-bg-page)] text-[var(--c-text-muted)] border-[var(--c-border)]',
  solid: 'bg-white/15 text-white border-white/25',
}

export function Lencana({ warna = 'netral', children, ikon, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border
        text-[10px] font-bold uppercase tracking-wide leading-5 whitespace-nowrap
        ${WARNA_LENCANA[warna] ?? WARNA_LENCANA.netral} ${className}`}
    >
      {ikon}
      {children}
    </span>
  )
}

/* ==========================================================================
   BILAH PROGRES
   ========================================================================== */

const WARNA_BILAH = {
  gradient: 'bg-[linear-gradient(90deg,var(--c-emerald),var(--c-primary))]',
  primary: 'bg-[var(--c-primary)]',
  sukses: 'bg-[var(--c-emerald)]',
  peringatan: 'bg-[var(--c-amber)]',
  bahaya: 'bg-[var(--c-rose)]',
  sky: 'bg-[var(--c-sky)]',
  violet: 'bg-[var(--c-violet)]',
}

export function BilahProgres({ persen = 0, tinggi = 'h-2', warna = 'gradient', className = '' }) {
  return (
    <div
      className={`${tinggi} rounded-full bg-[var(--c-border)] overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(persen)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${WARNA_BILAH[warna] ?? WARNA_BILAH.gradient}`}
        style={{ width: `${Math.min(100, Math.max(0, persen))}%` }}
      />
    </div>
  )
}

/* ==========================================================================
   SPARKLINE — jejak tren mini untuk kartu statistik
   ========================================================================== */

/**
 * Grafik garis tipis tanpa sumbu, untuk memberi kesan "hidup" pada angka
 * statis. Sengaja tanpa pustaka eksternal.
 *
 * `data` berupa larik angka; `tinggi` dalam piksel. Area di bawah garis
 * diisi gradasi supaya kartu tidak terasa kosong.
 */
export function Sparkline({ data = [], tinggi = 36, warna = 'var(--c-primary)', className = '' }) {
  // useId supaya dua sparkline dengan warna sama di satu halaman tetap punya
  // <linearGradient> masing-masing — kalau ID-nya sama, keduanya memakai
  // gradien pertama dan salah satu terlihat salah warna.
  const idUnik = useId().replace(/:/g, '')
  const nilai = data.map((d) => Number(d) || 0)

  if (nilai.length < 2) return null

  const lebar = 120
  const min = Math.min(...nilai)
  const maks = Math.max(...nilai)
  // Kalau semua nilai sama, rentang dibuat non-nol supaya garis tidak jadi
  // satu garis lurus di tengah.
  const rentang = maks - min || 1

  const titik = nilai.map((n, i) => {
    const x = (i / (nilai.length - 1)) * lebar
    const y = tinggi - 3 - ((n - min) / rentang) * (tinggi - 8)
    return [x, y]
  })

  const garis = titik
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ')
  const area = `${garis} L ${lebar} ${tinggi} L 0 ${tinggi} Z`
  const idGradien = `spark-${idUnik}`

  return (
    <svg
      viewBox={`0 0 ${lebar} ${tinggi}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height: tinggi }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={idGradien} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={warna} stopOpacity="0.28" />
          <stop offset="100%" stopColor={warna} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={area} fill={`url(#${idGradien})`} />
      <path
        d={garis}
        fill="none"
        stroke={warna}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={titik[titik.length - 1][0]}
        cy={titik[titik.length - 1][1]}
        r="2.5"
        fill={warna}
      />
    </svg>
  )
}

/* ==========================================================================
   KARTU STATISTIK
   ========================================================================== */

const WARNA_STAT = {
  primary: ['bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)]', 'var(--c-primary)'],
  sky: ['bg-[var(--c-sky-soft)] text-[var(--c-sky)]', 'var(--c-sky)'],
  violet: ['bg-[var(--c-violet-soft)] text-[var(--c-violet)]', 'var(--c-violet)'],
  sukses: ['bg-[var(--c-emerald-soft)] text-[var(--c-emerald)]', 'var(--c-emerald)'],
  peringatan: ['bg-[var(--c-amber-soft)] text-[var(--c-amber)]', 'var(--c-amber)'],
  bahaya: ['bg-[var(--c-rose-soft)] text-[var(--c-rose)]', 'var(--c-rose)'],
  netral: ['bg-[var(--c-bg-page)] text-[var(--c-text-muted)]', 'var(--c-text-muted)'],
}

/**
 * Kartu metrik. `delta` (opsional) menampilkan chip perubahan dengan tanda
 * panah; `tren` (opsional) larik angka untuk sparkline di kaki kartu.
 */
export function KartuStatistik({ label, nilai, sub, ikon, warna = 'primary', delta, tren, className = '' }) {
  const [latar] = WARNA_STAT[warna] ?? WARNA_STAT.primary
  const aksen = (WARNA_STAT[warna] ?? WARNA_STAT.primary)[1]

  return (
    <Kartu hover className={`relative overflow-hidden p-5 ${className}`}>
      {/* Cahaya warna di sudut — petunjuk visual tanpa menambah elemen. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-[0.14] blur-2xl"
        style={{ background: aksen }}
      />

      <div className="relative flex items-start justify-between gap-2 mb-3.5">
        <span className={`w-10 h-10 rounded-xl grid place-items-center ${latar}`}>{ikon}</span>
        {delta !== undefined && delta !== null && <ChipDelta nilai={delta} />}
      </div>

      <p className="text-2xl font-bold text-[var(--c-text)] leading-none tabular-nums">
        {nilai}
      </p>
      <LabelKecil className="mt-1.5">{label}</LabelKecil>
      {sub && <p className="text-[11px] text-[var(--c-text-muted)] mt-1">{sub}</p>}

      {tren && tren.length > 1 && (
        <Sparkline data={tren} warna={aksen} tinggi={32} className="mt-3 -mb-1" />
      )}
    </Kartu>
  )
}

/** Chip kecil untuk menunjukkan perubahan nilai (naik/ turun/tetap). */
export function ChipDelta({ nilai }) {
  const angka = Number(nilai)
  const naik = angka > 0
  const turun = angka < 0

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold
        ${
          naik
            ? 'bg-[var(--c-emerald-soft)] text-[var(--c-emerald)]'
            : turun
              ? 'bg-[var(--c-rose-soft)] text-[var(--c-rose)]'
              : 'bg-[var(--c-bg-page)] text-[var(--c-text-muted)]'
        }`}
    >
      {naik ? '▲' : turun ? '▼' : '–'}
      {Math.abs(angka)}%
    </span>
  )
}

/* ==========================================================================
   GRAFIK DONAT (SVG, tanpa library eksternal)
   ========================================================================== */

export function Donat({
  persen = 0,
  ukuran = 160,
  tebal = 14,
  warna = 'var(--c-emerald)',
  label,
  sublabel,
}) {
  // Jari-jari lingkaran diturunkan dari ukuran & tebal garis.
  const r = (ukuran - tebal) / 2
  const keliling = 2 * Math.PI * r
  const nilai = Math.min(100, Math.max(0, Number(persen) || 0))
  const terisi = (nilai / 100) * keliling
  const sisa = keliling - terisi

  return (
    <div className="relative shrink-0" style={{ width: ukuran, height: ukuran }}>
      <svg width={ukuran} height={ukuran} className="-rotate-90">
        <circle
          cx={ukuran / 2}
          cy={ukuran / 2}
          r={r}
          fill="none"
          stroke="var(--c-border)"
          strokeWidth={tebal}
        />
        <circle
          cx={ukuran / 2}
          cy={ukuran / 2}
          r={r}
          fill="none"
          stroke={warna}
          strokeWidth={tebal}
          strokeLinecap="round"
          strokeDasharray={`${terisi} ${sisa}`}
          className="transition-all duration-1000 ease-out"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-[var(--c-text)] tabular-nums leading-none">
          {nilai}%
        </span>
        {label && <LabelKecil className="mt-1">{label}</LabelKecil>}
        {sublabel && (
          <span className="text-[10px] text-[var(--c-text-muted)] mt-0.5">{sublabel}</span>
        )}
      </div>
    </div>
  )
}

/* ==========================================================================
   DONAT HASIL — multi-bagian, satu warna per kandidat
   ========================================================================== */

/**
 * Diagram donat perolehan suara.
 *
 * Dibuat sebagai SVG arc (bukan Chart.js) supaya tidak menambah dependency
 * berat untuk satu grafik. `data` berisi { label, nilai, warna }.
 * Tiap busur diberi celah kecil supaya warna kandidat tidak menyatu
 * jadi satu gumpalan.
 *
 * `className` dipakai pemanggil untuk mengecilkan diagram supaya ikut
 * ukuran wadahnya (berguna untuk satu layar penuh).
 * `animasi` menyalakan animasi masuk per-busur secara berurutan.
 */
export function DonatHasil({
  data = [],
  ukuran = 240,
  tebal = 44,
  tengahAngka,
  tengahLabel,
  className = '',
  animasi = false,
}) {
  const r = (ukuran - tebal) / 2
  const pusat = ukuran / 2
  const total = data.reduce((s, d) => s + (Number(d.nilai) || 0), 0)

  // Sudut kumulatif tiap busur. Mulai dari -90° (atas) supaya urutannya
  // searah jarum jam, seperti grafik pie pada umumnya.
  let sudut = -Math.PI / 2
  const busur = data
    .map((d) => {
      const nilai = Number(d.nilai) || 0
      if (nilai <= 0) return null

      const besar = (nilai / total) * Math.PI * 2
      const awal = sudut
      sudut += besar

      // Sisakan celah di antara busur supaya terpisah jelas.
      const celah = 0.025
      const s = awal + celah / 2
      const e = Math.max(s + 0.002, awal + besar - celah / 2)

      return {
        ...d,
        nilai,
        path: busurPath(pusat, pusat, r, s, e),
        persen: total > 0 ? (nilai / total) * 100 : 0,
      }
    })
    .filter(Boolean)

  return (
    <svg
      width={ukuran}
      height={ukuran}
      viewBox={`0 0 ${ukuran} ${ukuran}`}
      role="img"
      className={`block ${className}`}
    >
      {busur.length === 0 ? (
        <circle
          cx={pusat}
          cy={pusat}
          r={r}
          fill="none"
          stroke="var(--c-border)"
          strokeWidth={tebal}
        />
      ) : (
        busur.map((b, i) => (
          <path
            key={i}
            d={b.path}
            fill="none"
            stroke={b.warna}
            strokeWidth={tebal}
            className={`transition-opacity hover:opacity-80 ${
              animasi ? 'kasya-pie-busur' : ''
            }`}
            // Busur muncul satu per satu, mengikuti urutan perolehan suara.
            style={animasi ? { animationDelay: `${250 + i * 110}ms` } : undefined}
          >
            <title>{`${b.label}: ${b.nilai} suara (${b.persen.toFixed(1)}%)`}</title>
          </path>
        ))
      )}

      {tengahAngka !== undefined && (
        <>
          <text
            x={pusat}
            y={pusat}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-[var(--c-text)]"
            style={{ fontSize: ukuran * 0.15, fontWeight: 700 }}
          >
            {tengahAngka}
          </text>
          <text
            x={pusat}
            y={pusat + ukuran * 0.13}
            textAnchor="middle"
            className="fill-[var(--c-text-muted)]"
            style={{ fontSize: ukuran * 0.055, fontWeight: 600 }}
          >
            {tengahLabel ?? ''}
          </text>
        </>
      )}
    </svg>
  )
}

/** Path SVG untuk satu busur donat. */
function busurPath(cx, cy, r, awal, akhir) {
  const x1 = cx + r * Math.cos(awal)
  const y1 = cy + r * Math.sin(awal)
  const x2 = cx + r * Math.cos(akhir)
  const y2 = cy + r * Math.sin(akhir)
  const lebihSeparuh = akhir - awal > Math.PI ? 1 : 0

  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${lebihSeparuh} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

/* ==========================================================================
   DONAT HASIL MODERN (ApexCharts) — flat, bersih, mudah dibaca
   ========================================================================== */

/**
 * Diagram donat perolehan suara — versi flat modern (ApexCharts).
 *
 * Kenapa bukan "3D": efek rotateX sebelumnya membuat teks, tooltip, dan
 * irisan ikut miring sehingga sulit dibaca di proyektor maupun HP. Donat
 * flat dengan gradient halus + celah antar irisan terbaca jelas oleh semua
 * orang dan tetap terasa premium.
 *
 * Props dipertahankan kompatibel dengan pemanggil lama:
 *   - `sorot`  : indeks kandidat juara -> irisannya sedikit ditebalkan
 *   - `miring` : DIABAIKAN (dulu sudut 3D). Dibiarkan agar pemanggil lama
 *                tidak error, tapi tidak dipakai.
 *   - `tengahAngka` / `tengahLabel` : teks di lubang donat.
 *   - `skalaTengah` : pengali ukuran teks di lubang donat (1 = ukuran
 *                bawaan). Pemanggil layar besar menaikkan sendiri karena
 *                font-size <html>-nya sudah diskalakan.
 *
 * Ukuran di sini memakai REM, bukan piksel, supaya donat ikut membesar
 * bersama seluruh halaman di Mode Layar Besar.
 *
 * Nama fungsi `Pie3DHasil` sengaja dipertahankan supaya import di file lain
 * (Hasil.jsx, LayarBesar.jsx) tidak perlu diubah. Secara visual ini DONAT
 * FLAT, bukan pie 3D.
 */
export function Pie3DHasil({
  data = [],
  tinggi = 360,
  tengahAngka,
  tengahLabel,
  className = '',
  maksLebar = 440,
  sorot = -1,
  skalaTengah = 1,
  persenIrisan = false,
  // `miring` sengaja tidak di-destructure; lihat catatan di atas.
}) {
  const total = data.reduce((s, d) => s + (Number(d.nilai) || 0), 0)

  // Tanpa data, ApexCharts error karena pie butuh minimal satu seri.
  //
  // `seri` sengaja di-memo: kalau dibuat sebagai array baru tiap render,
  // identitasnya selalu berubah sehingga useMemo `opsi` di bawah tidak
  // pernah kena cache dan ApexCharts tetap menganimasikan ulang tiap detak
  // jam. Dependensinya hanya nilai yang benar-benar dipakai.
  const seri = useMemo(
    () =>
      data.length > 0
        ? data
        : [{ label: 'Belum ada suara', nilai: 1, warna: WARNA_KOSONG }],
    [data],
  )

  // ApexCharts donut HARUS menerima deret angka.
  const series = seri.map((d) => Number(d.nilai) || 0)

  /* Lubang donat sengaja dikecilkan (60% dari jari-jari) supaya cincin
     irisannya lebih tebal. Cincin tipis membuat diagram ini nyaris tak
     terlihat di proyektor; cincin tebal terbaca sekilas dari kursi paling
     belakang. */
  const ukuranLubang = sorot >= 0 ? '58%' : '62%'

  /* Label persentase di dalam cincin, hanya kalau pemanggil memintanya
     (halaman hasil admin tidak memintanya karena latarnya terang).
     Teks label tidak bisa memakai rem — ApexCharts menulisnya sebagai atribut
     font-size di dalam SVG, bukan sebagai CSS — jadi ukurannya dihitung dari
     tinggi donat: sekitar 5,5% dari tinggi, dibatasi 13-22px supaya tetap
     proporsional di HP maupun di proyektor 4K. */
  const ukuranLabel = Math.max(13, Math.min(22, Math.round(tinggi * 0.055)))
  /* Label hanya aman kalau donat cukup besar. Pada donat kecil, teks
     13px itu justru menabrak angka di lubang tengah dan membuat
     diagram jadi terlihat kumuh. Jadi di bawah ambang ini label
     dimatikan dan porcentasenya tetap terbaca di kartu nama. */
  const adaLabelIrisan = !!persenIrisan && tinggi >= 300

  /* Teks di lubang donat harus mengikuti besar donat, bukan ukuran tetap.
     Donat kecil dengan angka besar akan menimpa cincinnya sendiri.
     Angka ~8,5% dari tinggi donat, label ~3,4%, lalu dijepit agar tidak
     terlalu kecil di HP maupun terlalu besar di proyektor 4K. */
  const ukuranAngkaTengah = Math.max(13, Math.min(54, Math.round(tinggi * 0.085 * skalaTengah)))
  const ukuranLabelTengah = Math.max(8, Math.min(19, Math.round(tinggi * 0.034 * skalaTengah)))

  /*
   * Opsi chart dihitung dengan useMemo, bukan object literal biasa.
   *
   * react-apexcharts membandingkan `options` berdasarkan identitas object.
   * Kalau object-nya dibuat baru tiap render, ApexCharts menganggap
   * konfigurasi berubah lalu menjalankan updateOptions() beserta animasi
   * 700ms + 350ms LAGI.
   *
   * Di LayarBesar ada jam digital yang berubah tiap detik dan state jam itu
   * ikut merender ulang subtree donat. Akibatnya donat beranimasi ulang SETIAP
   * DETIK di layar proyektor — cincinnya terus bergetar dan tidak pernah diam.
   *
   * useMemo membuat identitas `opsi` tetap sama selama inputnya tidak
   * berubah, sehingga animasi hanya berjalan saat angka suaranya memang
   * berganti. Perilaku animasi tidak dikurangi: saat data berubah, donat tetap
   * dianimasikan seperti sedia.
   *
   * `seri` ikut jadi dependensi karena isi label/warna/nilainya memengaruhi
   * options (labels, colors, dan closure formatter di dalam tooltip).
   */
  const opsi = useMemo(
    () => ({
      chart: {
      type: 'donut',
      fontFamily: 'inherit',
      height: tinggi,
      animations: {
        enabled: true,
        speed: 700,
        animateGradually: { enabled: true, delay: 80 },
        dynamicAnimation: { enabled: true, speed: 350 },
      },
      foreColor: 'var(--c-text-muted)',
      toolbar: { show: false },
      /* Bayangan lembut di bawah cincin supaya donat tidak terasa "tempel"
         di latar kartu. Mati di layar besar karena sudah gelap. */
      dropShadow: {
        enabled: true,
        top: 8,
        left: 0,
        bottom: 4,
        right: 0,
        blur: 18,
        opacity: 0.22,
        color: '#0b1020',
      },
    },
    labels: seri.map((d) => d.label),
    colors: seri.map((d) => d.warna),
    series,
    stroke: {
      width: 3,
      colors: ['var(--c-bg-surface)'],
      lineCap: 'round',
    },
    fill: {
      opacity: 1,
      type: 'gradient',
      gradient: {
        shade: 'light',
        type: 'diagonal2',
        shadeIntensity: 0.18,
        opacityFrom: 1,
        opacityTo: 0.82,
        stops: [0, 100],
      },
    },
    plotOptions: {
      pie: {
        donut: { size: ukuranLubang },
        expandOnClick: false,
        dataLabels: {
          enabled: adaLabelIrisan,
          formatter: (v) => (total > 0 ? `${((Number(v) / total) * 100).toFixed(1)}%` : ''),
        },
      },
    },
    legend: { show: false },
    dataLabels: {
      enabled: adaLabelIrisan,
      style: { fontSize: `${ukuranLabel}px`, fontWeight: 800, colors: ['#ffffff'] },
      /* Bayangan gelap di belakang angka putih supaya label tetap terbaca,
         baik di atas warna kandidat yang terang maupun di atas lubang donat. */
      dropShadow: {
        enabled: true,
        top: 1,
        left: 0,
        bottom: 2,
        right: 0,
        blur: 4,
        opacity: 0.5,
        color: '#000000',
      },
    },
    states: {
      hover: { filter: { type: 'lighten', value: 0.1 } },
      active: { filter: { type: 'none' } },
    },
    tooltip: {
      // `y` di donut = nilai absolut per irisan.
      y: {
        formatter: (v) => {
          const p = total > 0 ? ((Number(v) / total) * 100).toFixed(1) : '0,0'
          return `${angka(v)} suara (${p}%)`
        },
      },
      theme: 'dark',
      style: { fontSize: '12px' },
    },
    responsive: [
      {
        breakpoint: 480,
        options: { chart: { height: Math.max(220, tinggi - 80) } },
      },
    ],
    }),
    [seri, total, tinggi, ukuranLubang, ukuranLabel, adaLabelIrisan],
  )

  return (
    <div className={`w-full ${className}`} style={{ maxWidth: maksLebar }}>
      <div className="relative">
        {/* Halo lembut di belakang cincin — bikin donat terasa "hidup"
            tanpa harus membesar. Kelipatannya dibuat rapat (1,02) supaya
            blur yang berat tidak ikut membesar bersama donat yang besar. */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2
            pointer-events-none rounded-full blur-3xl opacity-60"
          style={{
            width: tinggi * 1.02,
            height: tinggi * 1.02,
            background:
              'radial-gradient(closest-side, var(--c-glow), transparent 78%)',
          }}
        />

        <div className="relative">
          {/* Chart dimuat terpisah; selagi berkas ApexCharts diunduh, area
              donat sengaja dikosongkan (fallback) supaya tidak melompat. */}
          <Suspense fallback={<div style={{ height: tinggi, width: tinggi }} />}>
            <Chart type="donut" height={tinggi} options={opsi} series={series} />
          </Suspense>
        </div>

        {tengahAngka !== undefined && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span
              className="block font-extrabold text-[var(--c-text)] tabular-nums leading-none tracking-tight"
              style={{ fontSize: `${ukuranAngkaTengah}px` }}
            >
              {tengahAngka}
            </span>
            {tengahLabel && (
              <span
                className="block uppercase tracking-[0.16em] font-bold text-[var(--c-text-muted)]"
                style={{ fontSize: `${ukuranLabelTengah}px`, marginTop: `${Math.round(ukuranAngkaTengah * 0.22)}px` }}
              >
                {tengahLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ==========================================================================
   PERINGATAN
   ========================================================================== */

const GAYA_PERINGATAN = {
  peringatan: {
    wadah: 'bg-[var(--c-amber-soft)] border-[var(--c-amber)]/35',
    ikon: 'bg-[var(--c-amber)] text-white',
  },
  bahaya: {
    wadah: 'bg-[var(--c-rose-soft)] border-[var(--c-rose)]/35',
    ikon: 'bg-[var(--c-bahaya)] text-white',
  },
  sukses: {
    wadah: 'bg-[var(--c-emerald-soft)] border-[var(--c-emerald)]/35',
    ikon: 'bg-[var(--c-emerald)] text-white',
  },
  informasi: {
    wadah: 'bg-[var(--c-primary-soft)] border-[var(--c-primary-soft-border)]',
    ikon: 'bg-[var(--c-primary)] text-white',
  },
}

export function Peringatan({ children, warna = 'peringatan', ikon, className = '' }) {
  const gaya = GAYA_PERINGATAN[warna] ?? GAYA_PERINGATAN.informasi

  return (
    <div
      role="status"
      className={`${gaya.wadah} border rounded-xl px-5 py-4 flex items-start gap-3 ${className}`}
    >
      {ikon && (
        <span className={`shrink-0 w-8 h-8 grid place-items-center rounded-lg ${gaya.ikon}`}>
          {ikon}
        </span>
      )}
      <div className="text-sm text-[var(--c-text)] min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  )
}

/* ==========================================================================
   KOSONG
   ========================================================================== */

export function Kosong({ ikon, judul, deskripsi, aksi }) {
  return (
    <div className="kasya-card p-8 text-center animate-scale-up">
      <div
        className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--c-primary-soft)]
          border border-[var(--c-primary-soft-border)] grid place-items-center
          text-[var(--c-primary-dark)]"
      >
        {ikon}
      </div>
      <h3 className="text-base font-bold text-[var(--c-text)]">{judul}</h3>
      {deskripsi && <p className="text-[13px] text-[var(--c-text-muted)] mt-1.5">{deskripsi}</p>}
      {aksi && <div className="mt-5 flex justify-center">{aksi}</div>}
    </div>
  )
}

/**
 * Placeholder saat data masih dimuat.
 *
 * `tunda` (ms) menggeser kemunculan dan kilau isian. Beri nilai berbeda per
 * baris supaya isian muncul sedikit bergantian seperti data yang benar-benar
 * sedang datar — bukan semua kotak menyala bareng.
 */
export function Kerangka({ className = 'h-4 w-full', tunda = 0 }) {
  return (
    <div
      className={`skeleton skeleton-muncul ${className}`}
      style={tunda ? { '--tunda': `${tunda}ms` } : undefined}
    />
  )
}

/** Keadaan kosong bergaya dashed, untuk daftar di dalam kartu. */
export function KosongDashed({ ikon, pesan }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-10 rounded-xl
        border border-dashed border-[var(--c-border)]"
    >
      {ikon && (
        <div
          className="w-12 h-12 rounded-xl kasya-card grid place-items-center
            mb-3 text-[var(--c-text-muted)]"
        >
          {ikon}
        </div>
      )}
      <p className="text-[var(--c-text-muted)] text-[13px] font-semibold text-center px-4">
        {pesan}
      </p>
    </div>
  )
}