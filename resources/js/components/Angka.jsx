import { useEffect, useRef, useState } from 'react'

/*
 * Hook & komponen kecil yang membuat angka di panel admin terasa "hidup".
 *
 * Semuanya murni presentasi: tidak ada data baru yang diambil, hanya cara
 * menampilkan angka yang sama supaya perubahannya mudah SADARI saat polling
 * 20 detik bringing angka baru.
 */

/* ==========================================================================
   HITUNG MENUJU ANGKA (count-up)
   ========================================================================== */

/**
 * Nilai yang secara halus bergerak dari nilai lama ke nilai baru.
 *
 * `duration` milidetik; 0 berarti langsung ikut (dipakai saat reduced motion).
 * Angka dibulatkan tiap frame sehingga tidak pernah tampil sebagai "341.28".
 */
export function useHitungMenuju(target, duration = 700) {
  const dariRef = useRef(null)
  const [nilai, setNilai] = useState(Number(target) || 0)

  useEffect(() => {
    const tujuan = Number(target) || 0

    // Perubahan pertama tidak dianimasikan dari 0 (halaman baru saja muat) —
    // langsung tampilkan agar tidak terlihat seperti menghitung dari nol.
    if (dariRef.current === null) {
      dariRef.current = tujuan
      setNilai(tujuan)
      return undefined
    }

    const dari = dariRef.current
    if (dari === tujuan) return undefined

    // Hormati pengaturan sistem: tanpa animasi kalau pengguna minta ringan.
    const kurangi = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (kurangi || duration <= 0) {
      dariRef.current = tujuan
      setNilai(tujuan)
      return undefined
    }

    const mulai = performance.now()
    let raf = 0

    const langkah = (waktu) => {
      const rasio = Math.min(1, (waktu - mulai) / duration)
      // easeOutCubic: cepat di awal, melambat di akhir — terasa "natural".
      const eased = 1 - (1 - rasio) ** 3
      setNilai(Math.round(dari + (tujuan - dari) * eased))

      if (rasio < 1) {
        raf = requestAnimationFrame(langkah)
      } else {
        dariRef.current = tujuan
      }
    }

    raf = requestAnimationFrame(langkah)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return nilai
}

/*
 * Formatter default dibuat SEKALI di luar komponen.
 *
 * Sebelumnya ditulis sebagai default parameter:
 *   format = (n) => new Intl.NumberFormat('id-ID').format(n)
 * Arrow itu dievaluasi ulang pada SETIAP render, dan <Angka> memang
 * re-render tiap frame selama animasi 700ms. Di Dashboard ada 8 <Angka>,
 * jadi satu animasi bisa membuat ratusan formatter. Format dan hasilnya
 * tetap sama, cuma tidak dibuat berulang.
 */
const FORMAT_DEFAULT = new Intl.NumberFormat('id-ID')

/**
 * Angka yang beranimasi. `format` menerima hasil hook `useHitungMenuju`
 * (default pemisah ribuan ala Indonesia).
 */
export function Angka({ nilai, format, durasi = 700, className = '' }) {
  const n = useHitungMenuju(nilai, durasi)
  return <span className={`tabular-nums ${className}`}>{(format ?? FORMAT_DEFAULT.format)(n)}</span>
}

/* ==========================================================================
   HITUNG MUNDUR BERDETAK
   ========================================================================== */

/**
 * Hitung mundur yang benar-benar berjalan tiap detik.
 *
 * `detikAwal` datang dari server (sisa waktu sampai penutupan). Renderer
 * hitung mundur secara lokal supaya tidak terlihat "melompat" tiap polling 20
 * detik; ketika angka server datang lagi, sisanya diselaraskan.
 */
export function useHitungMundur(detikAwal, aktif = true) {
  const [sisa, setSisa] = useState(Number(detikAwal) || 0)
  const refAcuan = useRef({ sisa: Number(detikAwal) || 0, pada: Date.now() })

  useEffect(() => {
    const detik = Number(detikAwal)
    if (!Number.isFinite(detik)) return

    // Hitung mundur yang sedang berjalan: selaraskan, jangan mulai dari nol.
    const berjalan = Math.max(
      0,
      refAcuan.current.sisa - Math.floor((Date.now() - refAcuan.current.pada) / 1000),
    )
    refAcuan.current = { sisa: Math.min(detik, berjalan), pada: Date.now() }
    setSisa(refAcuan.current.sisa)
  }, [detikAwal])

  useEffect(() => {
    if (!aktif) return undefined

    const timer = setInterval(() => {
      refAcuan.current.sisa = Math.max(0, refAcuan.current.sisa - 1)
      setSisa(refAcuan.current.sisa)
    }, 1000)

    return () => clearInterval(timer)
  }, [aktif])

  return sisa
}

/* ==========================================================================
   DETIK SAMPAI DATA BARU
   ========================================================================== */

/**
 * Detik menuju pemuatan berikutnya, untuk indikator "sejak kapan data ini
 * disegarkan".
 *
 * `stempel` biasanya field `diperbarui` dari server: setiap kali polling
 * mengembalikan nilai baru, hitungan bereset ke `totalDetik`.
 *
 * Mengembalikan { sisa, persen } di mana `persen` = bagian yang sudah
 * terisi, dipakai langsung sebagai nilai `Cincin`.
 */
export function useDetikRefresh(stempel, totalDetik = 20) {
  const [sisa, setSisa] = useState(totalDetik)

  // Data baru datang -> hitungan mulai lagi dari awal.
  useEffect(() => {
    setSisa(totalDetik)
  }, [stempel, totalDetik])

  useEffect(() => {
    const timer = setInterval(() => {
      // Berputar, bukan berhenti di 0: kalau polling gagal, cincin tetap
      // bergerak dan admin melihat sistem masih mencoba.
      setSisa((s) => (s <= 1 ? totalDetik : s - 1))
    }, 1000)

    return () => clearInterval(timer)
  }, [totalDetik])

  return { sisa, persen: ((totalDetik - sisa) / totalDetik) * 100 }
}

/* ==========================================================================
   CINCIN PROGRES
   ========================================================================== */

/**
 * Cincin SVG tipis untuk indikator "menuju penuh" / "menuju refresh".
 * `persen` 0–100, `tebal` dalam piksel.
 */
export function Cincin({
  persen = 0,
  ukuran = 16,
  tebal = 2,
  warna = 'currentColor',
  jejak = 'currentColor',
  className = '',
  children,
  putar = true,
}) {
  const r = (ukuran - tebal) / 2
  const keliling = 2 * Math.PI * r
  const nilai = Math.min(100, Math.max(0, Number(persen) || 0))

  return (
    <span className={`relative inline-grid place-items-center shrink-0 ${className}`} style={{ width: ukuran, height: ukuran }}>
      <svg
        width={ukuran}
        height={ ukuran}
        className={putar ? '-rotate-90' : undefined}
        aria-hidden="true"
      >
        <circle cx={ukuran / 2} cy={ukuran / 2} r={r} fill="none" stroke={jejak} strokeWidth={tebal} />
        <circle
          cx={ukuran / 2}
          cy={ukuran / 2}
          r={r}
          fill="none"
          stroke={warna}
          strokeWidth={tebal}
          strokeLinecap="round"
          strokeDasharray={keliling}
          strokeDashoffset={keliling - (nilai / 100) * keliling}
          style={{ transition: 'stroke-dashoffset 900ms linear' }}
        />
      </svg>
      {children}
    </span>
  )
}