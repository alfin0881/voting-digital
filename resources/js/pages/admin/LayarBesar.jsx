import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { useNavigate } from '../../lib/navigasi'
import api from '../../lib/api'
import { angka, nomorUrut, persen, sejak, warnaKandidat, warnaKandidatHal } from '../../lib/format'
import Icon from '../../components/Icon'
import { Pie, PieChart } from 'recharts'
import { Kartu, Lencana, Spinner } from '../../components/UI'
import { Angka } from '../../components/Angka'
import { useApp } from '../../context/AppContext'
import { useKunciZoom } from '../../hooks/useKunciZoom'

/*
 * MODE LAYAR BESAR — layar proyektor, hanya untuk admin yang login.
 *
 * Prinsip (tidak berubah): data berjeda, tulisan hidup.
 *  - Angka diambil ulang tiap 5 menit (bukan tiap detik) supaya tidak terlihat
 *    final dan tidak membebani server.
 *  - Jam dan hitung mundur tetap bergerak tiap detik.
 *  - Slide berputar otomatis tiap DETIK_PER_SLIDE detik. Tanpa tombol apa pun.
 *
 * Tampilan: satu latar polos, tanpa kotak di dalam kotak. Hierarki dibentuk
 * oleh ukuran dan warna teks, bukan oleh garis dan bingkai.
 */

const DETIK_PER_SLIDE = 20
const JEDA_REFRESH_DETIK = 5 * 60
const MS_KELUAR = 380
const LABEL_JEDA = '5 menit'

/** Teks putih/gelap di atas warna kandidat, mana yang lebih terbaca. */
function teksDiAtas(hex) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return lum > 0.4 ? '#1f2937' : '#ffffff'
}

const CSS = `
.lb-root {
  --c-bg-page: #0c111d; --c-bg-surface: #131a2b; --c-bg-subtle: #182033;
  --c-text: #f8fafc; --c-text-muted: #a3aec2; --c-text-subtle: #7d889e;
  --c-border: rgba(255,255,255,.08); --c-border-strong: rgba(255,255,255,.16);
  color-scheme: dark;
  font-feature-settings: "tnum" 1;
}
@keyframes lb-masuk  { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
@keyframes lb-keluar { from { opacity:1 } to { opacity:0; transform: translateY(-10px) } }
@keyframes lb-isi    { from { transform: scaleX(0) } to { transform: scaleX(1) } }
@keyframes lb-jalan  { from { transform: scaleX(0) } to { transform: scaleX(1) } }

.lb-slide-masuk  { animation: lb-masuk .5s cubic-bezier(.22,1,.36,1) both }
.lb-slide-keluar { animation: lb-keluar .38s ease-in both }
.lb-isi   { transform-origin: left center; animation: lb-isi .9s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0ms) }
.lb-jalan { transform-origin: left center; animation: lb-jalan linear both }

@media (prefers-reduced-motion: reduce) {
  .lb-slide-masuk, .lb-slide-keluar, .lb-isi, .lb-jalan { animation: none !important }
}
`

/* Skala layar: semua ukuran rem ikut membesar di proyektor 1080p/4K. */
function useSkalaLayar(ubahRoot = false) {
  useEffect(() => {
    const awal = document.documentElement.style.fontSize
    const hitung = () => {
      const l = window.innerWidth
      const t = window.innerHeight
      document.documentElement.style.fontSize = `${Math.min(44, Math.max(16, Math.min(l / 100, t / 56)))}px`
    }
    hitung()
    window.addEventListener('resize', hitung)
    return () => {
      window.removeEventListener('resize', hitung)
      if (ubahRoot) document.documentElement.style.fontSize = awal
    }
  }, [ubahRoot])
}

/* Mengukur kotak yang benar-benar tersedia, supaya donat tidak menimpa apa pun. */
function useKotak(ref, bawaan = { w: 560, h: 420 }) {
  const [kotak, setKotak] = useState(bawaan)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined

    const ro = new ResizeObserver(([entri]) => {
      const w = Math.floor(entri.contentRect.width)
      const h = Math.floor(entri.contentRect.height)
      setKotak((s) => (Math.abs(s.w - w) < 4 && Math.abs(s.h - h) < 4 ? s : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return kotak
}

export default function LayarBesar() {
  useSkalaLayar(true)
  useKunciZoom(true)
  const { keluar, judul: judulAplikasi } = useApp()
  const navigate = useNavigate()

  const dataAwal = usePage().props.data ?? null
  const [data, setData] = useState(dataAwal)
  const [galat, setGalat] = useState(null)
  const [memuat, setMemuat] = useState(!dataAwal)
  const [slide, setSlide] = useState(null)
  const [jam, setJam] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setJam(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    document.title = `Layar Besar — ${judulAplikasi}`
  }, [judulAplikasi])

  const layarPenuh = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const ambil = useCallback(
    async (tampilLoading) => {
      if (tampilLoading) setMemuat(true)
      try {
        const res = await api.get('/admin/layar')
        setData(res.data)
        setGalat(null)
      } catch (err) {
        const status = err?.response?.status
        if (status === 401 || status === 419) {
          keluar()
          navigate('/login', { replace: true })
          return
        }
        setGalat('Gagal memuat data hasil. Layar akan mencoba lagi.')
      } finally {
        setMemuat(false)
      }
    },
    [keluar, navigate],
  )

  /* Pengambilan berjeda; berhenti saat tab disembunyikan. */
  useEffect(() => {
    let timer = null
    const mulai = () => {
      timer = setInterval(() => {
        if (document.visibilityState === 'hidden') return
        ambil(false)
      }, JEDA_REFRESH_DETIK * 1000)
    }
    const cekTab = () => {
      if (document.visibilityState === 'hidden') {
        clearInterval(timer)
        timer = null
      } else if (timer === null) {
        mulai()
      }
    }
    if (document.visibilityState !== 'hidden') mulai()
    document.addEventListener('visibilitychange', cekTab)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', cekTab)
    }
  }, [ambil])

  /* Pintasan: F11 layar penuh, Backspace kembali. Esc sengaja tidak dipakai. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F11') {
        e.preventDefault()
        layarPenuh()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        navigate('/admin/hasil')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navigate])

  if (memuat) {
    return (
      <Pembungkus sekolah={data?.sekolah}>
        <div className="flex-1 grid place-items-center" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-4">
            <Spinner className="w-10 h-10 text-white" />
            <p className="text-white/60 text-lg">Menyiapkan layar…</p>
          </div>
        </div>
      </Pembungkus>
    )
  }

  const daftar = data?.data ?? []

  if (galat && !data) {
    return (
      <Pembungkus sekolah={data?.sekolah}>
        <div className="flex-1 grid place-items-center">
          <Kartu className="p-10 text-center max-w-md w-full">
            <Icon name="warning" className="w-10 h-10 mx-auto mb-3 text-red-400" />
            <h1 className="text-xl font-bold text-[var(--c-text)] mb-1">{galat}</h1>
            <p className="text-[var(--c-text-muted)] text-sm">Periksa koneksi, lalu muat ulang.</p>
            <button
              type="button"
              onClick={() => ambil(true)}
              className="mt-5 px-5 py-2.5 rounded-xl bg-[var(--c-primary)] text-white font-semibold"
            >
              Muat ulang
            </button>
          </Kartu>
        </div>
      </Pembungkus>
    )
  }

  return (
    <Pembungkus
      sekolah={data?.sekolah}
      jam={jam}
      jeda={data?.jeda}
      diperbarui={data?.diperbarui}
      slide={slide}
    >
      <Carousel
        daftar={daftar}
        stempel={data?.diperbarui}
        onSlide={setSlide}
        terkunci={data?.hasil_sementara?.terkunci ?? []}
      />
    </Pembungkus>
  )
}

/* ------------------------------------------------------------------ */
/* Carousel otomatis                                                    */
/* ------------------------------------------------------------------ */

function Carousel({ daftar, stempel, onSlide, terkunci = [] }) {
  const [index, setIndex] = useState(0)
  const [keluar, setKeluar] = useState(false)
  const jml = daftar.length

  useEffect(() => {
    if (jml <= 1) return undefined
    let tundaGanti = null
    const timer = setTimeout(() => {
      setKeluar(true)
      tundaGanti = setTimeout(() => {
        setIndex((i) => (i + 1) % jml)
        setKeluar(false)
      }, MS_KELUAR)
    }, DETIK_PER_SLIDE * 1000)
    return () => {
      clearTimeout(timer)
      clearTimeout(tundaGanti)
    }
  }, [jml, index])

  useEffect(() => {
    setIndex((i) => (i < jml ? i : 0))
  }, [jml])

  useEffect(() => {
    onSlide?.(daftar[index] ?? null)
  }, [daftar, index, onSlide])

  if (jml === 0) {
    const adaTerkunci = terkunci.length > 0

    return (
      <div className="flex-1 grid place-items-center text-center">
        <div className="max-w-xl px-6">
          <Icon
            name={adaTerkunci ? 'lock' : 'inbox'}
            className="w-12 h-12 mx-auto mb-3 text-white/40"
          />
          <h2 className="text-xl font-bold text-white">
            {adaTerkunci ? 'Hasil sementara disembunyikan' : 'Belum ada hasil untuk ditampilkan'}
          </h2>
          <p className="text-white/60 mt-1">
            {adaTerkunci
              ? 'Perolehan suara baru ditampilkan setelah pemungutan suara ditutup.'
              : 'Perolehan suara muncul di sini begitu pemungutan dimulai.'}
          </p>
          {adaTerkunci && (
            <p className="text-white/45 text-sm mt-2">
              {terkunci.map((t) => t.nama).join(', ')}
            </p>
          )}
        </div>
      </div>
    )
  }

  const p = daftar[index]
  if (!p) return null

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div
        key={`${p.id}-${stempel ?? ''}`}
        className={`flex-1 min-h-0 flex ${keluar ? 'lb-slide-keluar' : 'lb-slide-masuk'}`}
      >
        <BadanPemilihan p={p} />
      </div>
      <BilahGanti jml={jml} index={index} />
    </div>
  )
}

/* Indikator slide, murni dekoratif. */
function BilahGanti({ jml, index }) {
  if (jml <= 1) return null
  return (
    <div aria-hidden="true" className="shrink-0 flex gap-1.5">
      {Array.from({ length: jml }, (_, i) => (
        <div key={i} className="h-0.5 flex-1 rounded-full bg-white/10 overflow-hidden">
          {i < index && <div className="h-full w-full bg-white/30" />}
          {i === index && (
            <div
              className="lb-jalan h-full bg-white/70"
              style={{ animationDuration: `${DETIK_PER_SLIDE}s` }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Kerangka layar                                                       */
/* ------------------------------------------------------------------ */

function Pembungkus({ children, sekolah, jam, jeda, diperbarui, slide }) {
  const waktu = (jam ?? new Date()).toLocaleTimeString('id-ID', { hour12: false })
  const keterangan = [sekolah, slide?.periode].filter(Boolean).join(' · ')

  return (
    <div className="lb-root h-[100dvh] min-h-[30rem] flex flex-col overflow-hidden bg-[#0c111d] text-white">
      <style>{CSS}</style>

      <header className="shrink-0">
        <div className="max-w-[110rem] mx-auto px-4 sm:px-10 pt-5 sm:pt-7 pb-3 flex items-start gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight leading-tight truncate">
                {slide?.nama ?? 'Perolehan Suara'}
              </h1>
              {slide && (
                <Lencana
                  warna={slide.sementara ? 'peringatan' : 'sukses'}
                  ikon={<Icon name={slide.sementara ? 'clock' : 'check-circle'} className="w-3.5 h-3.5" />}
                  className="shrink-0"
                >
                  {slide.sementara ? 'Berlangsung' : 'Selesai'}
                </Lencana>
              )}
            </div>
            {keterangan && <p className="mt-1 text-sm sm:text-lg text-white/55 truncate">{keterangan}</p>}
          </div>

          <p className="shrink-0 text-3xl sm:text-5xl font-semibold tabular-nums leading-none">{waktu}</p>
        </div>

        {jeda?.aktif && (
          <div className="max-w-[110rem] mx-auto px-4 sm:px-10 pb-2">
            <div className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm sm:text-base font-semibold">
              <Icon name="pause" className="w-4 h-4 shrink-0" />
              Pemungutan suara dijeda{jeda.alasan ? ` — ${jeda.alasan}` : ''}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 min-h-0 max-w-[110rem] w-full mx-auto px-4 sm:px-10 pb-4 sm:pb-6 flex flex-col">
        {children}
        <p className="shrink-0 mt-3 text-xs sm:text-sm text-white/45">
          {slide && !slide.sementara
            ? 'Pemilihan selesai. Rincian final dan berkas export ada di panel panitia.'
            : `Angka diperbarui tiap ${LABEL_JEDA} dan masih dapat berubah. Penetapan pemenang oleh panitia.`}
          {diperbarui && ` · Diperbarui ${sejak(diperbarui)}`}
        </p>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Satu pemilihan: donat di kiri, peringkat di kanan                    */
/* ------------------------------------------------------------------ */

function BadanPemilihan({ p }) {
  const total = p.total_suara || 0

  const kandidat = useMemo(
    () =>
      [...p.kandidat].sort(
        (a, b) => (a.peringkat ?? 0) - (b.peringkat ?? 0) || Number(a.nomor_urut) - Number(b.nomor_urut),
      ),
    [p.kandidat],
  )

  const adaJuara = total > 0 && kandidat.length > 0

  return (
    <div
      className="flex-1 min-h-0 w-full grid gap-6 lg:gap-12 grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-[minmax(0,1fr)]
        overflow-y-auto lg:overflow-hidden [scrollbar-width:thin]"
    >
      <PanggungPie p={p} kandidat={kandidat} total={total} />

      <section className="min-h-0 flex flex-col" aria-label="Peringkat kandidat">
        <p className="shrink-0 pb-2 text-sm sm:text-base text-white/50 tabular-nums">
          {kandidat.length} kandidat · {angka(total)} suara
        </p>

        {kandidat.length > 0 ? (
          <ul className="flex flex-col gap-1 overflow-y-auto [scrollbar-width:thin] lg:min-h-0 lg:flex-1 lg:pr-1">
            {kandidat.map((k, i) => (
              <BarisKandidat key={k.nomor_urut} k={k} total={total} urutan={i} juara={adaJuara && i === 0} />
            ))}
          </ul>
        ) : (
          <p className="text-white/60">Belum ada kandidat.</p>
        )}
      </section>
    </div>
  )
}

/*
 * Pie chart Recharts: persentase dan nomor kandidat dicetak DI LUAR irisan,
 * dihubungkan garis penunjuk. Pie sengaja dibuat lebih kecil dari panel supaya
 * ada ruang untuk label, dan areanya melebar ke samping mengisi panel.
 */
const RADIAN = Math.PI / 180

function PanggungPie({ p, kandidat, total }) {
  const ruang = useRef(null)
  const kotak = useKotak(ruang)

  const tinggi = Math.max(180, Math.min(900, kotak.h - 8))
  const lebar = Math.max(220, Math.min(kotak.w - 8, tinggi * 1.6))
  const fs = Math.max(14, Math.round(tinggi * 0.055))
  const radius = Math.max(60, Math.min(tinggi / 2 - fs * 2.2, lebar / 2 - fs * 4.5))

  const data = useMemo(
    () =>
      kandidat.map((k) => ({
        no: nomorUrut(k.nomor_urut),
        label: `No. ${nomorUrut(k.nomor_urut)} — ${k.nama}`,
        nilai: k.suara,
        fill: warnaKandidat(k.nomor_urut),
      })),
    [kandidat],
  )

  const labelLuar = (props) => {
    const { cx, cy, midAngle, outerRadius, percent, payload } = props
    if (!(percent > 0)) return null
    const no = props.no ?? payload?.no
    const lurus = props.x != null && props.y != null
    const x = lurus ? props.x : cx + (outerRadius + 20) * Math.cos(-midAngle * RADIAN)
    const y = lurus ? props.y : cy + (outerRadius + 20) * Math.sin(-midAngle * RADIAN)
    const kanan = x > cx
    return (
      <text
        x={x + (kanan ? 6 : -6)}
        y={y}
        textAnchor={kanan ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={fs}
      >
        <tspan fill="#ffffff" fontWeight={700} fontSize={Math.round(fs * 1.25)}>
          {`${Math.round(percent * 100)}%`}
        </tspan>
        <tspan fill="rgba(255,255,255,.6)" dx={6}>
          {`No. ${no}`}
        </tspan>
      </text>
    )
  }

  return (
    <div className="min-h-0 flex flex-col items-center gap-3 h-[26rem] lg:h-auto">
      <div ref={ruang} className="relative flex-1 min-h-0 w-full">
        <div className="absolute inset-0 grid place-items-center overflow-hidden">
        {total > 0 ? (
          <PieChart width={lebar} height={tinggi} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={data}
              dataKey="nilai"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={radius}
              startAngle={90}
              endAngle={-270}
              stroke="#0c111d"
              strokeWidth={3}
              labelLine={{ stroke: 'rgba(255,255,255,.35)', strokeWidth: 2 }}
              label={labelLuar}
              isAnimationActive
            />
          </PieChart>
        ) : (
          <div
            className="grid place-items-center rounded-full border-2 border-dashed border-white/15 text-white/55 text-lg text-center"
            style={{ width: radius * 2, height: radius * 2 }}
          >
            Belum ada suara masuk
          </div>
        )}
      </div>
      </div>

      <p className="shrink-0 text-sm sm:text-lg text-white/65 text-center tabular-nums">
        <b className="text-white">{angka(total)}</b> suara
        {p.total_peserta > 0 && (
          <>
            {' · '}
            <b className="text-white">{angka(p.sudah_memilih)}</b> dari{' '}
            <b className="text-white">{angka(p.total_peserta)}</b> peserta memilih (
            {persen(p.persen_partisipasi)})
          </>
        )}
      </p>
    </div>
  )
}

/*
 * Satu baris kandidat: nomor berwarna, nama + bilah, suara + persen.
 * Warna nomor dan bilah sama dengan irisan donat, jadi tidak perlu legenda.
 * Pemegang peringkat 1 diberi latar tipis dan ikon piala.
 */
function BarisKandidat({ k, total, urutan, juara }) {
  const lebar = total > 0 ? (k.suara / total) * 100 : 0
  const warna = warnaKandidat(k.nomor_urut)
  const tunda = 200 + urutan * 80

  return (
    <li
      className={`rounded-2xl px-3 sm:px-4 py-3 ${juara ? '' : 'border-b border-white/[0.07] last:border-b-0'}`}
      style={juara ? { background: warnaKandidatHal(k.nomor_urut, 0.16) } : undefined}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <span
          className="shrink-0 grid place-items-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl text-base sm:text-lg font-bold"
          style={{ background: warna, color: teksDiAtas(warna) }}
          title={`Nomor urut ${nomorUrut(k.nomor_urut)}`}
        >
          {nomorUrut(k.nomor_urut)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate font-semibold tracking-tight ${juara ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl text-white/90'}`}
              title={k.nama}
            >
              {k.nama}
            </span>
            {juara && <Icon name="trophy" className="w-5 h-5 shrink-0 text-amber-300" />}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="lb-isi h-full rounded-full"
              style={{ width: `${lebar}%`, background: warna, '--d': `${tunda}ms` }}
            />
          </div>
        </div>

        <div className="shrink-0 text-right leading-none">
          <b className={`block font-bold tabular-nums ${juara ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'}`}>
            <Angka nilai={k.suara} />
          </b>
          <span className="mt-1 block text-sm sm:text-base text-white/55 tabular-nums">{persen(k.persen)}</span>
        </div>
      </div>
    </li>
  )
}