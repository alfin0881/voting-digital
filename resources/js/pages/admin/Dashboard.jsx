import { useMemo, useState } from 'react'
import { Link } from '../../lib/navigasi'
import api from '../../lib/api'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import {
  angka,
  durasiHMS,
  sejak,
  persenPerubahan,
  tanggalJam,
} from '../../lib/format'
import { useApp } from '../../context/AppContext'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import { Angka, Cincin, useHitungMundur, useDetikRefresh } from '../../components/Angka'
import {
  Kartu,
  LabelKecil,
  Lencana,
  BilahProgres,
  Tombol,
  Hero,
  Chip,
  Donat,
  KosongDashed,
  KartuStatistik,
  Panel,
  Peringatan,
  TombolIkon,
} from '../../components/UI'
import { GrafikBatang, Memuat } from '../../components/AdminUI'

/*
 * Dashboard admin.
 *
 * Semua angka dihitung di backend; halaman ini hanya merender.
 * Auto-refresh tiap 20 detik karena dipakai saat pemungutan berlangsung.
 *
 * Susunan mengikuti urutan "pentingnya":
 *   1. Sambutan + status langsung + tombol kritis (jeda / mode layar besar)
 *   2. "Perlu Perhatian" — hanya muncul kalau memang ada masalah
 *   3. Empat angka utama (dengan animasi & pembanding jam sebelumnya)
 *   4. Partisipasi + aksi cepat
 *   5. Pemilihan yang sedang aktif
 *   6. Tren per jam (bisa diubah rentangnya) & aktivitas admin terbaru
 *
 * Catatan: kartu "Kesehatan Sistem" pernah ada di bagian bawah. Dihapus karena
 * isinya (backup, ukuran database, bilik suara) sudah tercakup di "Perlu
 * Perhatian" dan halaman Backup. Data `kesehatan` dari backend tidak lagi
 * dirender di sini.
 *
 * Catatan privasi: kartu "Kelas yang belum tuntas" sengaja hanya menampilkan
 * NAMA KELAS, bukan siapa yang belum memilih. Rincian per orang ada di Pantau.
 */

const POLLING_DETIK = 20
const BAWAH_50_PERSEN = 50

/*
 * Buka Mode Layar Besar di tab baru supaya panel admin ini tetap utuh di
 * belakang (bisa berpindah-pindah tanpa menutup apa pun).
 */
const bukaLayarBesar = () => {
  window.open('/admin/layar-besar', '_blank', 'noopener,noreferrer')
}

export default function Dashboard() {
  const { sesi } = useApp()
  const [rentangJam, setRentangJam] = useState(12)
  const [konfirmasi, setKonfirmasi] = useState(null)

  const { data, memuat, muatUlang } = useAdminPage('/admin', {
    izin: 'dashboard',
    polling: POLLING_DETIK * 1000,
  })
  const { jalankan, memuat: memproses } = useAksiAdmin()

  /* Semua hook harus dipanggil SEBELUM return awal apa pun, kalau tidak React
     akan complaining "hooks called conditionally" saat halaman berpindah dari
     "memuat" ke "ada data". */

  /* Hitung mundur yang berdetak: server mengirim sisa waktu, lalu renderer
     menguranginya sendiri tiap detik supaya tidak terlihat melompat
     setiap polling 20 detik. */
  const sisaPenutupan = useHitungMundur(data?.penutupan?.detik ?? null, !!data?.penutupan?.nama)

  /* Cincin "sejak berapa detik data terakhir di-sync". */
  const refresh = useDetikRefresh(data?.diperbarui, POLLING_DETIK)

  /* Rentang grafik dipotong di sisi client — data mentahnya cuma 12 bucket,
     jadi tidak perlu request ulang ke server setiap kali admin klik. */
  const trenTampil = useMemo(() => {
    const tren = data?.tren_jam ?? { label: [], data: [] }
    const potong = Math.max(1, Math.min(rentangJam, tren.data.length))

    return {
      label: tren.label.slice(-potong),
      data: tren.data.slice(-potong),
    }
  }, [data?.tren_jam, rentangJam])

  /* Jam tersibuk pada rentang yang sedang ditampilkan. Harus dihitung lewat
     hook DI ATAS return awal apa pun — kalau tidak, React menghitung jumlah
     hook berbeda antara render "memuat" dan render "ada data". */
  const trenPuncak = useMemo(() => {
    let nilai = 0
    let indeks = -1

    trenTampil.data.forEach((v, i) => {
      const n = Number(v) || 0
      if (n > nilai) {
        nilai = n
        indeks = i
      }
    })

    return { nilai, label: indeks >= 0 ? trenTampil.label[indeks] : 'Belum ada' }
  }, [trenTampil])

  const boleh = (izin) => !Array.isArray(sesi.izin) || sesi.izin.includes(izin)

  /* --- Aksi kritis hari-H -------------------------------------------- */

  const toggleJeda = () =>
    setKonfirmasi({
      judul: data?.status?.dijeda ? 'Lanjutkan pemungutan?' : 'Jeda pemungutan suara?',
      pesan: data?.status?.dijeda
        ? 'Semua pemilih akan bisa memilih kembali setelah jeda dicabut.'
        : 'Semua pemilihan akan MENOLAK suara sampai jeda dicabut. Gunakan hanya bila ada alasan kuat.',
      tombol: data?.status?.dijeda ? 'Ya, Lanjutkan' : 'Ya, Jeda',
      warna: data?.status?.dijeda ? 'utama' : 'bahaya',
      jalankan: async () => {
        await jalankan(() => api.post('/admin/kendali/jeda'))
        setKonfirmasi(null)
        muatUlang()
      },
    })

  if (memuat && !data) {
    return (
      <KerangkaAdmin judul="Dashboard">
        <Memuat kartu />
      </KerangkaAdmin>
    )
  }

  if (!data) {
    return (
      <KerangkaAdmin judul="Dashboard">
        <Kartu className="p-10 text-center text-[var(--c-text-muted)]">
          Gagal memuat dashboard.
        </Kartu>
      </KerangkaAdmin>
    )
  }

  const s = data.statistik
  const belum = Math.max(0, s.total_pemilih - s.siswa_sudah)
  const tren = data.tren_jam
  const jamTerakhir = tren.data[tren.data.length - 1] ?? 0

  /* Pembanding: bucket terakhir (jam berjalan, belum penuh) vs jam sebelumnya. */
  const deltaJam = persenPerubahan(jamTerakhir, tren.data[tren.data.length - 2] ?? 0)

  /* Statistik tren pada rentang yang sedang ditampilkan (bukan 12 jam penuh),
     supaya angkanya cocok dengan grafik yang terlihat. */
  const trenTotal = trenTampil.data.reduce((a, b) => a + (Number(b) || 0), 0)
  const trenRataRata = trenTampil.data.length
    ? Math.round(trenTotal / trenTampil.data.length)
    : 0

  return (
    <KerangkaAdmin judul="Dashboard">
      <div className="space-y-6">
        {/* ================= HERO / BAR STATUS LIVE ================= */}
        <Hero className="animate-fade-in">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div className="space-y-1.5 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Dashboard Admin
              </p>
              <h1 className="text-xl sm:text-2xl font-bold leading-tight">
                Selamat datang, {sesi.user?.nama ?? 'Panitia'}
              </h1>
              <p className="text-[12px] text-white/75 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>Diperbarui {tanggalJam(data.diperbarui)} WIB</span>
                <span aria-hidden="true" className="opacity-50">
                  •
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Cincin
                    persen={refresh.persen}
                    ukuran={12}
                    tebal={2}
                    warna="#ffffff"
                    jejak="rgba(255,255,255,0.3)"
                  />
                  <span>sync {refresh.sisa} dtk lagi</span>
                </span>
              </p>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
              {/* Hitung mundur yang berdetak tiap detik. */}
              {data.penutupan?.nama ? (
                <div className="text-left lg:text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                    Ditutup dalam
                  </p>
                  <p
                    className="text-3xl sm:text-4xl font-bold leading-none mt-1 tabular-nums"
                    aria-live="off"
                  >
                    {durasiHMS(sisaPenutupan)}
                  </p>
                  <p className="text-[11px] text-white/75 mt-1 max-w-[16rem] truncate">
                    {data.penutupan.nama}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-1.5 lg:justify-end">
                <Chip denyut>{data.ringkasan_aktif.length} pemilihan aktif</Chip>

                {data.status.dijeda && (
                  <Chip warna="bahaya" ikon={<Icon name="pause" className="w-3 h-3" />}>
                    Sedang dijeda
                  </Chip>
                )}

                

                {data.live?.tersedia && (
                  <Chip ikon={<Icon name="monitor" className="w-3 h-3" />}>
                    {angka(data.live.aktif)} di bilik
                  </Chip>
                )}
              </div>
            </div>
          </div>

          {/* Aksi kritis: terjangkau dalam satu klik, tanpa pindah halaman. */}
          <div className="relative mt-5 pt-4 border-t border-white/20 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70 mr-1">
              Cepat
            </span>

            {boleh('kendali') && (
              <>
                <Tombol
                  varian="sekunder"
                  ukuran="kecil"
                  onClick={toggleJeda}
                  memuat={memproses}
                >
                  <Icon name={data.status.dijeda ? 'play' : 'pause'} className="w-3.5 h-3.5" />
                  {data.status.dijeda ? 'Lanjutkan' : 'Jeda Pemungutan'}
                </Tombol>

                </>
            )}

            {boleh('hasil') && (
              <Tombol varian="sekunder" ukuran="kecil" onClick={bukaLayarBesar}>
                <Icon name="monitor" className="w-3.5 h-3.5" />
                Mode Layar Besar
              </Tombol>
            )}

            <TombolIkon label="Muat ulang sekarang" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" />
            </TombolIkon>
          </div>
        </Hero>

        {data.hasil_sementara?.terkunci?.length > 0 && (
          <Peringatan warna="informasi" ikon={<Icon name="lock" className="w-5 h-5" />}>
            <b>Hasil sementara disembunyikan.</b>{' '}
            {data.hasil_sementara.alasan ||
              'Perolehan suara tidak ditampilkan sampai pemungutan ditutup.'}
            <span className="block mt-1 text-[12px]">
              Pemilihan: {data.hasil_sementara.terkunci.map((t) => t.nama).join(', ')}.
            </span>
          </Peringatan>
        )}

        {/* ================= PERLU PERHATIAN ================= */}
        <PerluPerhatian data={data} />

        {/* ================= ANGKA UTAMA ================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KartuStatistik
            label="Total Pemilihan"
            nilai={<Angka nilai={s.total_pemilihan} />}
            warna="primary"
            ikon={<Icon name="file-text" className="w-5 h-5" />}
          />
          <KartuStatistik
            label="Total Pemilih"
            nilai={<Angka nilai={s.total_pemilih} />}
            warna="sky"
            ikon={<Icon name="users" className="w-5 h-5" />}
          />
          <KartuStatistik
            label="Total Kandidat"
            nilai={<Angka nilai={s.total_kandidat} />}
            warna="violet"
            ikon={<Icon name="award" className="w-5 h-5" />}
          />
          <KartuStatistik
            label="Suara Masuk"
            nilai={<Angka nilai={s.total_suara} />}
            sub={`${angka(s.suara_hari_ini)} hari ini`}
            delta={deltaJam}
            tren={tren.data}
            warna="sukses"
            ikon={<Icon name="bar-chart" className="w-5 h-5" />}
          />
        </div>

        {/* ================= PARTISIPASI + AKSI CEPAT ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Panel
            className="lg:col-span-2 animate-slide-up"
            judul="Partisipasi Pemilih"
            keterangan="Siswa yang sudah dan belum memilih"
            ikon={<Icon name="clipboard-check" className="w-4 h-4" />}
            aksi={
              <Link
                to="/admin/pantau"
                className="inline-flex items-center gap-1 text-xs font-semibold
                  text-[var(--c-primary-dark)] hover:underline"
              >
                Pantau detail
                <Icon name="chevron-right" className="w-3.5 h-3.5" />
              </Link>
            }
          >
            <div className="flex flex-col md:flex-row items-center gap-8">
              <Donat persen={s.persen_partisipasi} label="Partisipasi" />

              <div className="flex-1 w-full space-y-2.5">
                <BarisRingkas
                  warna="var(--c-emerald)"
                  latar="bg-[var(--c-emerald-soft)]"
                  label="Sudah Memilih"
                  nilai={s.siswa_sudah}
                  satuan="siswa"
                />
                <BarisRingkas
                  warna="var(--c-text-muted)"
                  latar="bg-[var(--c-bg-page)]"
                  label="Belum Memilih"
                  nilai={belum}
                  satuan="siswa"
                />

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <KecilAngka
                    label="Hari ini"
                    nilai={s.suara_hari_ini}
                    satuan="suara"
                    warna="var(--c-sky)"
                  />
                  <KecilAngka
                    label="5 menit terakhir"
                    nilai={s.suara_5menit}
                    satuan="suara"
                    warna="var(--c-emerald)"
                  />
                </div>
              </div>
            </div>
          </Panel>

          <AksiCepat />
        </div>

        {/* ================= PEMILIHAN AKTIF ================= */}
        <Panel
          judul="Pemilihan Sedang Aktif"
          keterangan={
            data.ringkasan_aktif.length > 0
              ? `${data.ringkasan_aktif.length} sedang berlangsung`
              : undefined
          }
          ikon={<Icon name="monitor" className="w-4 h-4" />}
        >
          {data.ringkasan_aktif.length === 0 ? (
            <KosongDashed
              ikon={<Icon name="file-text" className="w-5 h-5" />}
              pesan="Tidak ada pemilihan yang aktif saat ini."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.ringkasan_aktif.map((p) => (
                <div
                  key={p.id}
                  className="kasya-kartu kasya-kartu-aktif rounded-xl p-5 animate-fade-in"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <h3 className="font-bold text-[var(--c-text)] truncate">{p.nama}</h3>
                      <p className="text-xs text-[var(--c-text-muted)] mt-0.5">
                        Berakhir {tanggalPanjangSingkat(p.selesai)}
                      </p>
                    </div>
                    <Lencana
                      warna="sukses"
                      ikon={<span className="denyut w-1.5 h-1.5 rounded-full bg-current" />}
                    >
                      Aktif
                    </Lencana>
                  </div>

                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <LabelKecil>Suara terkumpul</LabelKecil>
                      <p className="text-2xl font-bold text-[var(--c-primary)] leading-none mt-1 tabular-nums">
                        <Angka nilai={p.suara} />
                      </p>
                    </div>
                    <div className="text-right">
                      <LabelKecil>Partisipasi</LabelKecil>
                      <p className="text-lg font-bold text-[var(--c-text)] mt-0.5 tabular-nums">
                        {p.persen}%
                      </p>
                    </div>
                  </div>

                  <BilahProgres persen={p.persen} tinggi="h-2" />
                  <p className="text-[11px] text-[var(--c-text-muted)] mt-2">
                    {angka(p.sudah)} / {angka(p.peserta)} peserta sudah memilih
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ================= TREN + AKTIVITAS =================
            `items-start` penting: tanpa itu, grid meregangkan kedua panel
            sampai sama tinggi, sehingga tinggi Tren ikut ditentukan oleh
            jumlah item di Aktivitas Terbaru. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-5">
          <Panel
            className="lg:col-span-2"
            judul="Tren Suara Masuk"
            keterangan="Jumlah suara per jam · WIB"
            ikon={<Icon name="bar-chart" className="w-4 h-4" />}
            aksi={
              <div
                role="group"
                aria-label="Rentang grafik"
                className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--c-bg-page)] border border-[var(--c-border)]"
              >
                {/* Backend hanya mengirim 12 bucket, jadi rentang dibatasi di situ. */}
                {[6, 12].map((j) => (
                  <button
                    key={j}
                    type="button"
                    onClick={() => setRentangJam(j)}
                    aria-pressed={rentangJam === j}
                    className={`px-2.5 h-7 rounded-md text-[11px] font-semibold transition-colors ${
                      rentangJam === j
                        ? 'bg-[var(--c-bg-surface)] text-[var(--c-primary)] shadow-sm'
                        : 'text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                    }`}
                  >
                    {j} jam
                  </button>
                ))}
              </div>
            }
          >
            {s.total_suara > 0 ? (
              <>
                <GrafikBatang
                  label={trenTampil.label}
                  data={trenTampil.data}
                  tinggi={260}
                  warna="var(--c-primary)"
                  warnaIsi="var(--c-primary)"
                  sorotTerakhir
                />

                {/* Ringkasan tren dalam bentuk kartu, bukan paragraf panjang:
                    angkanya bisa dibandingkan sekilas tanpa membaca teks. */}
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                  <RingkasTren
                    label="Jam berjalan"
                    nilai={jamTerakhir}
                    sub="belum genap satu jam"
                  />
                  <RingkasTren
                    label="Dibanding jam lalu"
                    nilai={
                      deltaJam === null
                        ? '—'
                        : `${deltaJam >= 0 ? '+' : ''}${deltaJam}%`
                    }
                    sub={deltaJam === null ? 'tidak ada pembanding' : deltaJam >= 0 ? 'naik' : 'turun'}
                    warna={
                      deltaJam === null
                        ? 'var(--c-text)'
                        : deltaJam >= 0
                          ? 'var(--c-emerald)'
                          : 'var(--c-rose)'
                    }
                  />
                  <RingkasTren label="Puncak" nilai={trenPuncak.nilai} sub={trenPuncak.label} />
                  <RingkasTren
                    label={`Total ${rentangJam} jam`}
                    nilai={trenTotal}
                    sub={`rata-rata ${trenRataRata}/jam`}
                  />
                </dl>

                <p className="text-[11px] text-[var(--c-text-subtle)] mt-2.5">
                  Batang paling kanan diredupkan karena jam berjalan belum genap satu jam.
                </p>
              </>
            ) : (
              <KosongDashed pesan="Belum ada suara masuk." />
            )}
          </Panel>

          <AktivitasTerbaru data={data} />
        </div>
      </div>

      {/* Konfirmasi untuk aksi kritis. */}
      <Modal
        buka={!!konfirmasi}
        onTutup={() => !memproses && setKonfirmasi(null)}
        judul={konfirmasi?.judul}
        lebar="max-w-md"
        aksi={
          <>
            <Tombol varian="sekunder" onClick={() => setKonfirmasi(null)} disabled={memproses}>
              Batal
            </Tombol>
            <Tombol
              varian={konfirmasi?.warna ?? 'utama'}
              onClick={konfirmasi?.jalankan}
              memuat={memproses}
            >
              {konfirmasi?.tombol}
            </Tombol>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span
            className={`shrink-0 w-10 h-10 grid place-items-center rounded-xl
              ${
                konfirmasi?.warna === 'bahaya'
                  ? 'bg-[var(--c-rose-soft)] text-[var(--c-bahaya)]'
                  : 'bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)]'
              }`}
          >
            <Icon name="warning" className="w-5 h-5" />
          </span>
          <p className="text-[var(--c-text-muted)] pt-2">{konfirmasi?.pesan}</p>
        </div>
      </Modal>
    </KerangkaAdmin>
  )
}

/* ------------------------------------------------------------------ */
/* PERLU PERHATIAN                                                     */
/* ------------------------------------------------------------------ */

/**
 * Daftar kondisi yang perlu ditindak admin.
 *
 * Sengaja hanya tampil kalau memang ada masalah. Strip yang kosong membuat
 * layar terasa lebih tenang, dan membuat peringatan yang benar-benar muncul
 * terasa jauh lebih serius.
 */
function PerluPerhatian({ data }) {
  const s = data.statistik
  const lalu = []

  /* Pemungutan dijeda — kondisi paling kritis. */
  if (data.status.dijeda) {
    lalu.push({
      kunci: 'jeda',
      warna: 'bahaya',
      ikon: 'pause',
      judul: 'Pemungutan suara sedang dijeda',
      pesan: 'Semua pemilihan menolak suara sementara. Jangan lupa mencabut jeda setelah selesai.',
      ke: null,
    })
  }

  /* Satu NIS login di beberapa komputer — risiko suara terhitung dua kali. */
  if (data.live?.tersedia && data.live.ganda.length > 0) {
    const daftar = data.live.ganda
      .slice(0, 3)
      .map((g) => `${g.nama} (${g.jumlah} perangkat)`)
      .join(', ')

    lalu.push({
      kunci: 'ganda',
      warna: 'bahaya',
      ikon: 'shield',
      judul: `${data.live.ganda.length} pemilih login di lebih dari satu komputer`,
      pesan: `Periksa dan keluarkan sesi ganda dari Sesi Aktif. ${daftar}.`,
      ke: '/admin/sesi',
    })
  }

  /* Tidak ada suara masuk padahal masih ada pemilihan aktif. */
  if (
    data.ringkasan_aktif.length > 0 &&
    s.total_suara > 0 &&
    s.suara_5menit === 0
  ) {
    lalu.push({
      kunci: 'hening',
      warna: 'peringatan',
      ikon: 'clock',
      judul: 'Tidak ada suara masuk dalam 5 menit terakhir',
      pesan: `Pemungutan masih berjalan dengan ${angka(s.total_suara)} suara. Periksa bilik suara bila ini tidak disengaja.`,
      ke: '/admin/kendali',
    })
  }

  /* Kelas yang masih di bawah separuh. */
  const kelasTertinggal = data.per_kelas.filter((k) => k.persen < BAWAH_50_PERSEN)
  if (kelasTertinggal.length > 0 && data.per_kelas.length > 0) {
    const nama = kelasTertinggal
      .slice(0, 4)
      .map((k) => k.kelas)
      .join(', ')

    lalu.push({
      kunci: 'kelas',
      warna: 'peringatan',
      ikon: 'megaphone',
      judul: `${kelasTertinggal.length} kelas belum melewati ${BAWAH_50_PERSEN}% partisipasi`,
      pesan: `${nama}${kelasTertinggal.length > 4 ? ' dan lainnya' : ''}. Bisa dikanggil lewat pengumuman di Kendali Hari-H.`,
      ke: '/admin/pantau',
    })
  }

  /* Backup harian belum ada. */
  if (data.kesehatan?.tersedia) {
    const k = data.kesehatan
    const belumBackup =
      !k.backup_terakhir ||
      new Date().getTime() - new Date(k.backup_terakhir).getTime() > 24 * 3600 * 1000

    if (belumBackup) {
      lalu.push({
        kunci: 'backup',
        warna: 'peringatan',
        ikon: 'database',
        judul: 'Belum ada backup database dalam 24 jam terakhir',
        pesan: 'Unduh salinan database sebelum pemungutan ditutup sebagai pengaman.',
        ke: '/admin/backup',
      })
    }
  }

  if (lalu.length === 0) return null

  return (
    <section aria-label="Perlu perhatian" className="space-y-2.5">
      {lalu.map((p) => (
        <div
          key={p.kunci}
          className={`flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border
            ${
              p.warna === 'bahaya'
                ? 'bg-[var(--c-rose-soft)] border-[var(--c-rose)]/35'
                : 'bg-[var(--c-amber-soft)] border-[var(--c-amber)]/35'
            }`}
        >
          <span
            className={`shrink-0 w-8 h-8 grid place-items-center rounded-lg text-white
              ${p.warna === 'bahaya' ? 'bg-[var(--c-bahaya)]' : 'bg-[var(--c-amber)]'}`}
          >
            <Icon name={p.ikon} className="w-4 h-4" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-[var(--c-text)]">{p.judul}</p>
            <p className="text-[12px] text-[var(--c-text-muted)] mt-0.5">{p.pesan}</p>
          </div>

          {p.ke && (
            <Link
              to={p.ke}
              className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-lg
                bg-[var(--c-bg-surface)] border border-[var(--c-border)]
                text-[12px] font-semibold text-[var(--c-text)] hover:border-[var(--c-primary)]
                transition-colors"
            >
              Tindak lanjuti
              <Icon name="chevron-right" className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      ))}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* AKTIVITAS TERBARU                                                  */
/* ------------------------------------------------------------------ */

/* Peta warna dari backend (CatatanAktivitas::warna()) ke token CSS. */
const WARNA_AKTIVITAS = {
  emerald: 'var(--c-emerald)',
  amber: 'var(--c-amber)',
  red: 'var(--c-rose)',
  sky: 'var(--c-sky)',
  slate: 'var(--c-text-muted)',
}

/**
 * Linimasa 8 aksi admin terakhir.
 *
 * Menggantikan "Partisipasi per Kelas": informasi jenis ini jauh lebih berguna
 * saat pemungutan berlangsung — panitia bisa langsung tahu "tadi siapa yang
 * mengubah apa" tanpa pindah halaman. Label & warna sudah dikirim backend,
 * jadi daftar aksi tidak perlu diduplikasi di frontend.
 */
function AktivitasTerbaru({ data }) {
  const a = data.aktivitas

  if (!a?.tersedia) return null

  return (
    <Panel
      judul="Aktivitas Terbaru"
      keterangan="8 aksi terakhir"
      ikon={<Icon name="clock" className="w-4 h-4" />}
      aksi={
        <Link
          to="/admin/audit"
          className="inline-flex items-center gap-1 text-xs font-semibold
            text-[var(--c-primary-dark)] hover:underline"
        >
          Semua
          <Icon name="chevron-right" className="w-3.5 h-3.5" />
        </Link>
      }
    >
      {a.items.length === 0 ? (
        <KosongDashed pesan="Belum ada aktivitas tercatat." />
      ) : (
        <ol className="relative space-y-4 pl-6">
          {/* Garis penghubung linimasa; berhenti sebelum titik terakhir. */}
          <span
            aria-hidden="true"
            className="absolute left-[7px] top-1.5 bottom-3 w-px bg-[var(--c-border)]"
          />

          {a.items.map((it) => {
            const warna = WARNA_AKTIVITAS[it.warna] ?? WARNA_AKTIVITAS.slate

            return (
              <li key={it.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ring-4"
                  style={{ background: warna, boxShadow: `0 0 0 4px var(--c-bg-surface)` }}
                />

                <p className="text-[13px] font-semibold text-[var(--c-text)] leading-snug">
                  {it.label}
                </p>

                {it.deskripsi && (
                  <p className="text-[12px] text-[var(--c-text-muted)] mt-0.5 break-words">
                    {it.deskripsi}
                  </p>
                )}

                <p className="text-[11px] text-[var(--c-text-subtle)] mt-0.5">
                  {it.nama} · {sejak(it.waktu)}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Potongan kecil                                                     */
/* ------------------------------------------------------------------ */

/** Baris ringkasan di dalam kartu partisipasi. */
function BarisRingkas({ warna, latar, label, nilai, satuan }) {
  return (
    <div
      className={`flex items-center justify-between py-3 px-4 rounded-xl ${latar} border border-[var(--c-border)]/60`}
    >
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full" style={{ background: warna }} />
        <span className="text-[13px] font-semibold text-[var(--c-text)]">{label}</span>
      </div>
      <span className="text-base font-bold text-[var(--c-text)]">
        <Angka nilai={nilai} />{' '}
        <span className="text-[10px] font-medium text-[var(--c-text-muted)]">{satuan}</span>
      </span>
    </div>
  )
}

/** Kotak angka ringkas di bawah grafik tren. */
function RingkasTren({ label, nilai, sub, warna = 'var(--c-text)' }) {
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg-page)] px-4 py-3 min-w-0">
      <dt className="text-[11px] text-[var(--c-text-muted)] truncate">{label}</dt>
      <dd
        className="text-[17px] font-bold leading-tight mt-0.5 tabular-nums truncate"
        style={{ color: warna }}
      >
        {nilai}
      </dd>
      {sub && <p className="text-[11px] text-[var(--c-text-subtle)] truncate">{sub}</p>}
    </div>
  )
}

/** Kotak angka kecil (suara hari ini / 5 menit terakhir). */
function KecilAngka({ label, nilai, satuan, warna }) {
  return (
    <div className="rounded-xl border border-[var(--c-border)] p-4 bg-[var(--c-bg-page)]">
      <LabelKecil>{label}</LabelKecil>
      <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: warna }}>
        <Angka nilai={nilai} />{' '}
        <span className="text-[10px] font-medium text-[var(--c-text-muted)]">{satuan}</span>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panel Aksi Cepat                                                   */
/* ------------------------------------------------------------------ */

function AksiCepat() {
  const { sesi } = useApp()

  // Hanya tampilkan shortcut yang memang boleh diakses peran ini, supaya
  // tidak ada menu yang kalau diklik hanya muncul "Akses ditolak".
  const menu = [
    { to: '/admin/pantau', label: 'Pantau Partisipasi', ikon: 'clipboard-check', izin: 'pantau' },
    { to: '/admin/kendali', label: 'Kendali Hari-H', ikon: 'megaphone', izin: 'kendali' },
    { to: '/admin/hasil', label: 'Lihat Hasil', ikon: 'bar-chart', izin: 'hasil' },
    { to: '/admin/anggota', label: 'Kelola Pemilih', ikon: 'user-check', izin: 'anggota' },
    { to: '/admin/backup', label: 'Backup', ikon: 'database', izin: 'backup' },
  ].filter((m) => !sesi.izin || sesi.izin.includes(m.izin))

  return (
    <Panel
      judul="Aksi Cepat"
      keterangan="Pintasan ke halaman yang paling sering dibuka"
      ikon={<Icon name="zap" className="w-4 h-4" />}
      className="animate-slide-up"
    >
      {menu.length === 0 ? (
        <p className="text-[13px] text-[var(--c-text-muted)]">
          Tidak ada akses cepat untuk peran Anda.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {menu.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="group flex flex-col gap-2.5 p-4 rounded-xl border border-[var(--c-border)]
                bg-[var(--c-bg-page)] hover:border-[var(--c-primary-soft-border)]
                hover:bg-[var(--c-primary-soft)] transition-colors"
            >
              <span
                className="w-8 h-8 rounded-lg grid place-items-center
                  bg-[var(--c-bg-surface)] text-[var(--c-text-muted)] border border-[var(--c-border)]
                  group-hover:text-[var(--c-primary)] group-hover:border-transparent transition-colors"
              >
                <Icon name={m.ikon} className="w-4 h-4" />
              </span>
              <span className="text-[12px] font-semibold text-[var(--c-text)] leading-snug">
                {m.label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Format helpers                                                      */
/* ------------------------------------------------------------------ */

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** "2026-10-20" -> "20 Okt 2026" */
function tanggalPanjangSingkat(iso) {
  if (!iso) return '-'
  const bagian = String(iso).split('-').map(Number)
  if (bagian.length < 3) return '-'
  return `${bagian[2]} ${BULAN[bagian[1] - 1]} ${bagian[0]}`
}