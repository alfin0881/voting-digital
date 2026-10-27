import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../lib/api'
import { useSearchParams } from '../../lib/navigasi'
import { useApp } from '../../context/AppContext'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import { angka, nomorUrut, warnaKandidat, warnaKandidatHal } from '../../lib/format'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Kartu, Lencana, Tombol, Kosong, Peringatan, Pie3DHasil } from '../../components/UI'
import { KepalaHalaman, Memuat } from '../../components/AdminUI'

const FORMAT_PERSEN = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const persen1 = (n) => `${FORMAT_PERSEN.format(n)}%`

/** Teks putih/gelap di atas warna kandidat, mana yang lebih terbaca (mis. emas). */
function teksDiAtas(hex) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return lum > 0.4 ? '#1f2937' : '#ffffff'
}

/** Urut suara terbanyak -> kecil, beri peringkat kompetisi (1,1,3). */
function urutkan(kandidat) {
  const sorted = [...kandidat].sort(
    (a, b) => b.suara - a.suara || parseInt(a.nomor_urut, 10) - parseInt(b.nomor_urut, 10),
  )
  let peringkat = 0
  let sebelumnya = null
  return sorted.map((k, i) => {
    if (k.suara !== sebelumnya) {
      peringkat = i + 1
      sebelumnya = k.suara
    }
    return { ...k, peringkat }
  })
}

export default function Hasil() {
  const { sesi } = useApp()
  const [params] = useSearchParams()
  const { data, memuat, muatUlang } = useAdminPage('/admin/hasil', {
    izin: 'hasil',
    polling: 20000,
  })
  const { jalankan, memuat: memproses } = useAksiAdmin()

  const [konfirmasiRunoff, setKonfirmasiRunoff] = useState(null)
  const [aktif, setAktif] = useState(0)

  const baris = useMemo(() => data?.data ?? [], [data])

  // Deep-link dari kartu Kelola Pemilihan: /admin/hasil?pemilihan=12.
  // Diterapkan sekali saja, supaya polling 20 detik tidak mengembalikan
  // admin ke tab awal saat ia sedang membuka pemilihan lain.
  const idAwal = Number(params.get('pemilihan') || 0)
  const deepLinkRef = useRef(false)

  useEffect(() => {
    if (deepLinkRef.current || baris.length === 0) return

    if (idAwal) {
      const indeks = baris.findIndex((r) => Number(r.pemilihan.id) === idAwal)

      if (indeks >= 0) setAktif(indeks)
    }

    deepLinkRef.current = true
  }, [baris, idAwal])

  // Ekspor butuh izin tersendiri; peran yang hanya boleh melihat hasil
  // tetap dapat membuka halaman, tapi tanpa tombol unduh.
  const bolehEkspor = sesi.izin?.includes('export')

  // Jaga indeks tab tetap valid saat daftar hasil berubah.
  useEffect(() => {
    if (aktif >= baris.length) setAktif(0)
  }, [baris.length, aktif])

  const buatRunoff = async () => {
    if (!konfirmasiRunoff) return
    try {
      await jalankan(() => api.post(`/admin/hasil/${konfirmasiRunoff.id}/runoff`))
      setKonfirmasiRunoff(null)
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  if (memuat && !data) {
    return (
      <KerangkaAdmin judul="Hasil Pemilihan">
        <Memuat tinggi="h-96" />
      </KerangkaAdmin>
    )
  }

  const totalSemua = baris.reduce((s, r) => s + (r.total_suara || 0), 0)
  const adaBerlangsung = baris.some((r) => r.pemilihan.status === 'aktif')
  const terkunci = data?.hasil_sementara?.terkunci ?? []
  const adaTerkunci = terkunci.length > 0

  return (
    <KerangkaAdmin judul="Hasil Pemilihan">
      <KepalaHalaman
        aksi={
          <>
            <Tombol varian="sekunder" ukuran="kecil" onClick={muatUlang}>
              <Icon name="refresh" className="w-3.5 h-3.5" />
              Muat Ulang
            </Tombol>
            {bolehEkspor && (
              <>
                <Unduh href="/unduh/hasil/export/pdf" label="PDF" />
                <Unduh href="/unduh/hasil/export/excel" label="Excel" />
                <Unduh href="/unduh/hasil/export/excel-latar" label="Excel (Latar)" />
              </>
            )}
          </>
        }
      >
        <p className="text-sm text-[var(--c-text-muted)]">
          {baris.length > 0
            ? `${baris.length} pemilihan • ${angka(totalSemua)} suara tercatat`
            : 'Belum ada hasil untuk ditampilkan'}
        </p>
        {adaBerlangsung && (
          <p className="mt-1 inline-flex items-center gap-2 text-xs text-[var(--c-text-subtle)]">
            <span className="relative flex h-2 w-2">
              <span className="denyut absolute inline-flex h-full w-full rounded-full bg-[var(--c-emerald)] opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--c-emerald)]" />
            </span>
            Angka diperbarui otomatis setiap 20 detik
          </p>
        )}
      </KepalaHalaman>

      {adaTerkunci && (
        <Peringatan
          warna="informasi"
          ikon={<Icon name="lock" className="w-5 h-5" />}
          className="mb-5"
        >
          <b>Hasil sementara disembunyikan.</b>{' '}
          {data.hasil_sementara?.alasan ||
            'Perolehan suara pemilihan yang masih berlangsung tidak ditampilkan sampai pemungutan ditutup.'}
          <span className="block mt-1">
            Ditutup sementara: {terkunci.map((t) => t.nama).join(', ')}.
          </span>
        </Peringatan>
      )}

      {baris.length > 1 && (
        <div
          role="tablist"
          aria-label="Pilih pemilihan"
          className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1"
        >
          {baris.map((r, i) => (
            <TabPemilihan
              key={r.pemilihan.id}
              row={r}
              terpilih={i === aktif}
              onPilih={() => setAktif(i)}
            />
          ))}
        </div>
      )}

      {baris.length === 0 ? (
        adaTerkunci ? (
          <Kosong
            ikon={<Icon name="lock" className="w-8 h-8" />}
            judul="Hasil Masih Disembunyikan"
            deskripsi="Perolehan suara baru ditampilkan setelah pemungutan suara ditutup. Hasil akan muncul otomatis di halaman ini."
          />
        ) : (
          <Kosong
            ikon={<Icon name="bar-chart" className="w-8 h-8" />}
            judul="Belum Ada Hasil"
            deskripsi="Hasil akan muncul setelah ada pemilihan yang selesai."
          />
        )
      ) : (
        <HasilSatuPemilihan
          key={baris[aktif].pemilihan.id}
          row={baris[aktif]}
          seri={!!data.seri?.[baris[aktif].pemilihan.id]}
          onRunoff={(id, nama) => setKonfirmasiRunoff({ id, nama })}
        />
      )}

      <Modal
        buka={!!konfirmasiRunoff}
        onTutup={() => setKonfirmasiRunoff(null)}
        judul="Buat putaran kedua (runoff)?"
        lebar="max-w-md"
        aksi={
          <>
            <Tombol
              varian="sekunder"
              onClick={() => setKonfirmasiRunoff(null)}
              className="w-full sm:w-auto"
            >
              Batal
            </Tombol>
            <Tombol onClick={buatRunoff} memuat={memproses} className="w-full sm:w-auto">
              Ya, Buat Putaran II
            </Tombol>
          </>
        }
      >
        <p className="text-[13px] text-[var(--c-text-muted)]">
          Putaran kedua akan dibuat otomatis dari <b>2 kandidat teratas</b> pada pemilihan &quot;
          {konfirmasiRunoff?.nama}&quot;. Pemungutan suara putaran II dimulai <b>H+1</b> dan
          berlangsung dua hari. Putaran II dibuat <b>nonaktif</b> — aktifkan lewat menu Kelola
          Pemilihan.
        </p>
      </Modal>
    </KerangkaAdmin>
  )
}

/* ------------------------------------------------------------------ */
/* Tab pemilihan                                                       */
/* ------------------------------------------------------------------ */

function TabPemilihan({ row, terpilih, onPilih }) {
  const { pemilihan, total_suara: total = 0 } = row
  const berlangsung = pemilihan.status === 'aktif'

  return (
    <button
      type="button"
      role="tab"
      aria-selected={terpilih}
      onClick={onPilih}
      className={`shrink-0 max-w-[260px] flex items-center gap-2.5 px-4 py-2 rounded-full border text-left transition-colors
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-primary)]
        ${
          terpilih
            ? 'bg-[var(--c-text)] border-[var(--c-text)] text-[var(--c-bg-surface)]'
            : 'bg-transparent border-[var(--c-border)] text-[var(--c-text)] hover:bg-[var(--c-bg-subtle)]'
        }`}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          berlangsung ? 'bg-[var(--c-emerald)]' : 'bg-current opacity-30'
        }`}
        title={berlangsung ? 'Sedang berlangsung' : 'Tidak aktif'}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold truncate">{pemilihan.nama_pemilihan}</span>
        <span className="block text-xs tabular-nums opacity-70">{angka(total)} suara</span>
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Satu pemilihan: kepala, partisipasi, banner, diagram, kartu nama   */
/* ------------------------------------------------------------------ */

function HasilSatuPemilihan({ row, seri, onRunoff }) {
  const {
    pemilihan,
    kandidat = [],
    total_suara: totalSuara = 0,
    total_peserta: totalPeserta = null,
    sudah_memilih: sudahMemilih = null,
  } = row
  const berlangsung = pemilihan.status === 'aktif'

  const peringkat = useMemo(() => urutkan(kandidat), [kandidat])
  const puncak = peringkat.filter((k) => k.peringkat === 1 && k.suara > 0)
  const imbang = seri || puncak.length > 1
  const pemimpin = !imbang && puncak.length === 1 ? puncak[0] : null
  const penyusul = peringkat.find((k) => k.peringkat > 1) ?? null
  const selisih = pemimpin && penyusul ? pemimpin.suara - penyusul.suara : null

  const dataDonat = kandidat.map((k) => ({
    label: `No. ${nomorUrut(k.nomor_urut)} — ${k.nama_kandidat}`,
    nilai: Number(k.suara) || 0,
    warna: warnaKandidat(k.nomor_urut),
  }))

  const indexJuara = useMemo(() => {
    if (totalSuara <= 0 || imbang) return -1
    return peringkat.findIndex((k) => k.peringkat === 1 && k.suara > 0)
  }, [peringkat, totalSuara, imbang])

  return (
    <Kartu className="overflow-hidden animate-fade-in">
      {/* ---------- Kepala ---------- */}
      <div className="px-5 sm:px-7 2xl:px-10 pt-5 sm:pt-6 2xl:pt-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl 2xl:text-3xl font-bold tracking-tight text-[var(--c-text)] leading-tight">
            {pemilihan.nama_pemilihan}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <Lencana
              warna={berlangsung ? 'peringatan' : 'netral'}
              ikon={<Icon name={berlangsung ? 'clock' : 'check-circle'} className="w-3 h-3" />}
            >
              {berlangsung ? 'Sedang berlangsung' : 'Tidak aktif'}
            </Lencana>
            {pemilihan.putaran === 2 && <Lencana warna="informasi">Putaran II</Lencana>}
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-[var(--c-text-muted)] max-w-xs sm:text-right">
          {berlangsung
            ? 'Angka masih bisa berubah selama pemungutan suara berjalan.'
            : 'Pemungutan suara tidak sedang berjalan.'}
        </p>
      </div>

      {totalPeserta > 0 && sudahMemilih !== null && (
        <Partisipasi sudah={sudahMemilih} total={totalPeserta} />
      )}

      {kandidat.length === 0 ? (
        <p className="px-5 py-12 text-center text-[13px] text-[var(--c-text-muted)]">
          Belum ada kandidat pada pemilihan ini.
        </p>
      ) : (
        <>
          {/* ---------- 1. Banner status: satu baris, tidak berebut dengan donat ---------- */}
          <div className="px-5 sm:px-7 2xl:px-10 pt-5 sm:pt-6 2xl:pt-7">
            {totalSuara === 0 ? (
              <KartuBelumAda />
            ) : imbang ? (
              <KartuImbang
                kandidat={puncak}
                onRunoff={() => onRunoff(pemilihan.id, pemilihan.nama_pemilihan)}
              />
            ) : (
              <BannerPemimpin
                pemimpin={pemimpin}
                berlangsung={berlangsung}
                penyusul={penyusul}
                selisih={selisih}
                total={totalSuara}
              />
            )}
          </div>

          {/* ---------- 2. Diagram: elemen terbesar halaman ini ---------- */}
          <BlokDiagram dataDonat={dataDonat} totalSuara={totalSuara} sorot={indexJuara} />

          {/* ---------- 3. Nama kandidat sebagai kartu persegi panjang ---------- */}
          <div className="px-5 sm:px-7 2xl:px-10 py-5 sm:py-6 2xl:py-7">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
              <h3 className="text-base font-bold text-[var(--c-text)]">Perolehan suara</h3>
              <p className="text-xs text-[var(--c-text-muted)]">
                {angka(kandidat.length)} kandidat • urut dari suara terbanyak • persentase dari total
                suara masuk
              </p>
            </div>

            {totalSuara > 0 && (
              <BilahSebaran peringkat={peringkat} total={totalSuara} className="mb-4" />
            )}

            <ol className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {peringkat.map((k, i) => (
                <KartuKandidat
                  key={k.id ?? k.nomor_urut}
                  k={k}
                  total={totalSuara}
                  juara={!imbang && k.peringkat === 1 && k.suara > 0}
                  seriDiPuncak={imbang && k.peringkat === 1 && k.suara > 0}
                  ket={keteranganBaris(k, peringkat, imbang, totalSuara)}
                  tunda={i * 70}
                />
              ))}
            </ol>
          </div>
        </>
      )}
    </Kartu>
  )
}

/** Kalimat pendek di bawah nama: posisi kandidat terhadap pemimpin. */
function keteranganBaris(k, peringkat, imbang, total) {
  if (total === 0 || (k.suara === 0 && peringkat[0].suara === 0)) return null
  const atas = peringkat[0]
  if (k.peringkat === 1) {
    if (imbang) return 'Imbang di puncak'
    const kedua = peringkat.find((x) => x.peringkat > 1)
    return kedua ? `Unggul ${angka(k.suara - kedua.suara)} suara dari No. ${nomorUrut(kedua.nomor_urut)}` : null
  }
  return `Kurang ${angka(atas.suara - k.suara)} suara dari No. ${nomorUrut(atas.nomor_urut)}`
}

/* ------------------------------------------------------------------ */
/* 1. Banner status: pemimpin sedang unggul, dalam satu baris          */
/* ------------------------------------------------------------------ */

/**
 * Banner Mendatar, bukan kartu besar.
 *
 * Versi sebelumnya memakai kartu setinggi layar dengan persentase raksasa.
 * Di halaman yang sekarang donat-nya sendiri yang jadi elemen utama, sehingga
 * banner ini sengaja ditipiskan: satu baris, informatif tapi tidak berebut
 * perhatian dengan diagram.
 */
function BannerPemimpin({ pemimpin, berlangsung, penyusul, selisih, total }) {
  const warna = warnaKandidat(pemimpin.nomor_urut)
  const persenPemimpin = total > 0 ? (pemimpin.suara / total) * 100 : 0

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3"
      style={{
        background: warnaKandidatHal(pemimpin.nomor_urut, 0.1),
        borderColor: warnaKandidatHal(pemimpin.nomor_urut, 0.4),
      }}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--c-text-muted)]">
        <Icon name="trophy" className="w-4 h-4 text-[var(--c-amber)]" />
        {berlangsung ? 'Memimpin saat ini' : 'Pemenang'}
      </span>

      <span
        className="shrink-0 w-9 h-9 rounded-xl grid place-items-center text-sm font-extrabold"
        style={{ background: warna, color: teksDiAtas(warna) }}
        title={`Nomor urut ${nomorUrut(pemimpin.nomor_urut)}`}
      >
        {nomorUrut(pemimpin.nomor_urut)}
      </span>

      <p
        className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--c-text)] truncate"
        title={pemimpin.nama_kandidat}
      >
        {pemimpin.nama_kandidat}
      </p>

      <p className="text-sm text-[var(--c-text-muted)] tabular-nums whitespace-nowrap">
        <b className="text-[var(--c-text)]">{angka(pemimpin.suara)} suara</b>
        <span className="mx-1.5 opacity-50">•</span>
        {persen1(persenPemimpin)}
      </p>

      {penyusul && (
        <p className="ml-auto text-[13px] text-[var(--c-text)] whitespace-nowrap">
          Unggul <b className="tabular-nums">{angka(selisih)} suara</b> dari No.{' '}
          {nomorUrut(penyusul.nomor_urut)}
        </p>
      )}

      {berlangsung && (
        <p className="w-full text-xs text-[var(--c-text-subtle)]">
          Hasil sementara — pemenang resmi ditetapkan setelah pemungutan suara selesai.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Diagram — bagian terbesar halaman                                */
/* ------------------------------------------------------------------ */

/**
 * Blok diagram dengan latar sendiri.
 *
 * Latar `bg-subtle` + garis pemisah di atas dan bawah dipakai supaya donat
 * dibaca sebagai "papan utama", bukan sekadar salah satu elemen di dalam
 * kartu. Lebarnya dibatasi (bukan `w-full`) supaya donat tidak teregang
 * raksasa di monitor lebar — ApexCharts menjaga donatnya tetap bundar.
 */
function BlokDiagram({ dataDonat, totalSuara, sorot }) {
  // ApexCharts butuh tinggi dalam piksel, jadi tinggi donat mengikuti lebar
  // jendela: 290 di HP, 380 di laptop, 450 di layar lebar.
  const [lebar, setLebar] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth))
  useEffect(() => {
    const onResize = () => setLebar(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const tinggi = lebar < 640 ? 290 : lebar < 1536 ? 380 : 450

  return (
    <section className="mt-5 sm:mt-6 border-y border-[var(--c-border)] bg-[var(--c-bg-subtle)]/60 px-5 sm:px-7 2xl:px-10 py-7 sm:py-9 2xl:py-10">
      <div className="mx-auto flex w-full max-w-[40rem] flex-col items-center">
        <Pie3DHasil
          data={dataDonat}
          tinggi={tinggi}
          tengahAngka={angka(totalSuara)}
          tengahLabel="suara masuk"
          maksLebar={tinggi * 1.3}
          sorot={sorot}
          className="kasya-pie-masuk w-full"
        />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 3. Kartu kandidat — persegi panjang sederhana                      */
/* ------------------------------------------------------------------ */

/**
 * Satu kartu persegi panjang per kandidat, langsung di bawah donat.
 *
 * Bentuknya sengaja polos: strip warna di tepi kiri, lencana nomor urut
 * dengan warna kandidat, nama, suara, persentase, lalu bilah tipis di
 * bawah. Warna yang sama persis dengan irisan donat, jadi pembaca bisa
 * mencocokkan kartu mana yang punya irisan mana tanpa membaca daftar
 * warna terpisah.
 *
 * Deret ini diurutkan dari suara terbanyak. Kartu juara diberi latar
 * bercorak supaya terlihat langsung tanpa harus membaca angkanya.
 */
function KartuKandidat({ k, total, juara, seriDiPuncak, ket, tunda }) {
  const warna = warnaKandidat(k.nomor_urut)
  const persen = total > 0 ? (k.suara / total) * 100 : 0

  // Bilah mulai dari 0 lalu tumbuh sekali saat kartu muncul; saat data
  // real-time berubah, lebarnya bergeser halus dari nilai sebelumnya.
  const [lebar, setLebar] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setLebar(persen))
    return () => cancelAnimationFrame(id)
  }, [persen])

  return (
    <li
      className="relative overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-bg-surface)] pl-5 pr-4 py-3"
      style={
        juara
          ? {
              background: warnaKandidatHal(k.nomor_urut, 0.08),
              borderColor: warnaKandidatHal(k.nomor_urut, 0.45),
            }
          : undefined
      }
    >
      {/* Strip warna kandidat — penanda yang sama dengan irisan donat. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: warna }} />

      <div className="flex items-center gap-3">
        <span
          className="shrink-0 w-9 h-9 rounded-lg grid place-items-center text-sm font-bold"
          style={{ background: warna, color: teksDiAtas(warna) }}
          title={`Nomor urut ${nomorUrut(k.nomor_urut)}`}
        >
          {nomorUrut(k.nomor_urut)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[15px] font-bold text-[var(--c-text)] truncate"
              title={k.nama_kandidat}
            >
              {k.nama_kandidat}
            </span>
            {(juara || seriDiPuncak) && (
              <Icon name="trophy" className="w-4 h-4 shrink-0 text-[var(--c-amber)]" />
            )}
          </p>
          <p
            className={`text-xs mt-0.5 truncate ${
              juara || seriDiPuncak ? 'text-[var(--c-emerald)] font-semibold' : 'text-[var(--c-text-muted)]'
            }`}
          >
            {ket ?? `Peringkat ${k.peringkat}`}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--c-text)] tabular-nums leading-none">
            {angka(k.suara)}
          </p>
          <p className="mt-1 text-xs font-bold text-[var(--c-text-muted)] tabular-nums">
            {persen1(persen)}
          </p>
        </div>
      </div>

      <div
        className="mt-2.5 h-1.5 rounded-full bg-[var(--c-border)] overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(persen)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Perolehan ${k.nama_kandidat}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none"
          style={{ width: `${lebar}%`, background: warna, transitionDelay: `${tunda}ms` }}
        />
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Partisipasi: berapa pemilih yang sudah memberikan suara             */
/* ------------------------------------------------------------------ */

function Partisipasi({ sudah, total }) {
  const p = Math.min(100, (sudah / total) * 100)
  return (
    <div className="px-5 sm:px-7 2xl:px-10 pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] text-[var(--c-text-muted)]">
          <b className="text-[var(--c-text)] tabular-nums">{angka(sudah)}</b> dari{' '}
          <b className="text-[var(--c-text)] tabular-nums">{angka(total)}</b> pemilih sudah memberikan suara
        </p>
        <p className="text-sm font-bold text-[var(--c-text)] tabular-nums">
          {persen1(p)} <span className="text-xs font-medium text-[var(--c-text-muted)]">partisipasi</span>
        </p>
      </div>
      <div
        className="mt-2.5 h-1.5 rounded-full bg-[var(--c-border)] overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(p)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Partisipasi pemilih"
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--c-emerald),var(--c-primary))] transition-[width] duration-1000 ease-out motion-reduce:transition-none"
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Satu bilah berisi seluruh suara, terbagi menurut kandidat           */
/* ------------------------------------------------------------------ */

function BilahSebaran({ peringkat, total, className = '' }) {
  return (
    <div
      className={`flex h-3 2xl:h-4 gap-1 rounded-full overflow-hidden ${className}`}
      role="img"
      aria-label="Sebaran suara menurut kandidat"
    >
      {peringkat
        .filter((k) => k.suara > 0)
        .map((k) => {
          const pr = (k.suara / total) * 100
          return (
            <div
              key={k.id ?? k.nomor_urut}
              className="min-w-[4px] first:rounded-l-full last:rounded-r-full transition-[flex-grow] duration-700 motion-reduce:transition-none"
              style={{ flexBasis: 0, flexGrow: k.suara, background: warnaKandidat(k.nomor_urut) }}
              title={`No. ${nomorUrut(k.nomor_urut)} ${k.nama_kandidat}: ${angka(k.suara)} suara (${persen1(pr)})`}
            />
          )
        })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Kartu status khusus: imbang di puncak / belum ada suara            */
/* ------------------------------------------------------------------ */

function KartuImbang({ kandidat, onRunoff }) {
  return (
    <div className="rounded-2xl p-5 sm:p-6 border border-[var(--c-amber)]/45 bg-[var(--c-amber-soft)]">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center bg-[var(--c-amber)] text-white">
          <Icon name="warning" className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-[var(--c-text)]">Hasil imbang di puncak</p>
          <p className="text-[13px] leading-relaxed text-[var(--c-text-muted)] mt-0.5">
            {kandidat.length} kandidat sama-sama memperoleh{' '}
            <b className="text-[var(--c-text)] tabular-nums">{angka(kandidat[0].suara)} suara</b>.
            Belum ada pemenang. Anda bisa membuat putaran kedua dari 2 kandidat teratas.
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {kandidat.map((k) => {
          const w = warnaKandidat(k.nomor_urut)
          return (
            <li
              key={k.id ?? k.nomor_urut}
              className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-[var(--c-bg-surface)] border border-[var(--c-border)] text-[13px] font-semibold text-[var(--c-text)]"
            >
              <span
                className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold"
                style={{ background: w, color: teksDiAtas(w) }}
              >
                {nomorUrut(k.nomor_urut)}
              </span>
              {k.nama_kandidat}
            </li>
          )
        })}
      </ul>

      <Tombol varian="peringatan" className="mt-5" onClick={onRunoff}>
        <Icon name="refresh" className="w-4 h-4" />
        Buat Putaran II
      </Tombol>
    </div>
  )
}

function KartuBelumAda() {
  return (
    <div className="rounded-2xl p-5 sm:p-6 border border-dashed border-[var(--c-border-strong)] flex items-center gap-4">
      <span className="shrink-0 w-12 h-12 rounded-xl grid place-items-center bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)]">
        <Icon name="inbox" className="w-6 h-6" />
      </span>
      <div>
        <p className="font-bold text-[var(--c-text)]">Belum ada suara masuk</p>
        <p className="text-[13px] leading-relaxed text-[var(--c-text-muted)] mt-0.5">
          Diagram perolehan suara dan kartu nama muncul di sini begitu pemilih
          pertama memberikan suara.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tautan unduh — Tombol bergaya tautan (href), bukan <a><button>       */
/* ------------------------------------------------------------------ */

function Unduh({ href, label }) {
  return (
    <Tombol href={href} varian="sekunder" ukuran="kecil">
      <Icon name="download" className="w-3.5 h-3.5" />
      {label}
    </Tombol>
  )
}