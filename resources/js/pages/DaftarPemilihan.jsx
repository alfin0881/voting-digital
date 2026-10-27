import { useEffect, useState } from 'react'
import { Link, useNavigate } from '../lib/navigasi'
import { pesanError, sesiHabis } from '../lib/api'
import { useApi } from '../context/AppContext'
import { periodeWaktu } from '../lib/format'
import { useStatusPemilih } from '../lib/statusPemilih'
import Kerangka from '../components/Kerangka'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import { Kartu, Kosong, Lencana, BilahProgres, Kerangka as KerangkaUi, Tombol, Peringatan } from '../components/UI'

const KUNCI_PANDUAN = 'panduan_pemilih_v2'

/*
 * Daftar pemilihan untuk pemilih — padanan Livewire\User\DaftarPemilihan.
 *
 * Perbaikan dibanding versi Blade lama:
 * - Status jeda & daftar pemilihan di-poll tanpa reload penuh, jadi tombol
 *   "Mulai Memilih" tidak lagi bisa diklik setelah panitia menjeda.
 * - Kartu bisa diklik SELURUH AREANYA (bukan cuma tombol kecil di bawah).
 * - Skeleton loading supaya tidak ada kedipan konten kosong.
 */
export default function DaftarPemilihan() {
  const navigate = useNavigate()
  const { data, memuat, error, muatUlang } = useApi('/pemilih/pemilihan')
  const [panduan, setPanduan] = useState(false)

  // Status jeda diambil dari poller BERSAMA (lihat lib/statusPemilih.js).
  // Halaman ini berada di dalam <Kerangka> yang juga memakai poller yang sama,
  // jadi tidak perlu timer sendiri lagi.
  const status = useStatusPemilih()
  const jeda = Boolean(status?.jeda)

  // Tampilkan panduan sekali saja per browser (seperti versi Blade).
  useEffect(() => {
    try {
      if (!localStorage.getItem(KUNCI_PANDUAN)) {
        setPanduan(true)
        localStorage.setItem(KUNCI_PANDUAN, '1')
      }
    } catch {
      /* abaikan */
    }
  }, [])

  // Sesi habis -> balik ke login, jangan tampilkan halaman rusak.
  useEffect(() => {
    if (error && sesiHabis(error)) {
      navigate('/login', { replace: true })
    }
  }, [error, navigate])

  const dijeda = jeda || data?.dijeda

  return (
    <Kerangka judul="Daftar Pemilihan">
      <div className="space-y-8">
        <Sambutan
          nama={data?.user?.nama}
          nis={data?.user?.nis}
          kelas={data?.user?.kelas}
          jumlah={data?.pemilihan?.length}
        />

        {memuat && !data && <KerangkaDaftar />}
        {error && !sesiHabis(error) && (
          <Peringatan warna="bahaya" ikon={<Icon name="warning" />}>
            {pesanError(error)}
            <button
              type="button"
              onClick={muatUlang}
              className="block mt-2 text-sm font-semibold underline hover:no-underline"
            >
              Coba lagi
            </button>
          </Peringatan>
        )}

        {data && (
          <>
            {data.progres.total > 0 && <Progres progres={data.progres} />}

            {dijeda && (
              <Peringatan warna="bahaya" ikon={<Icon name="pause" />}>
                <b>Pemungutan suara sedang dijeda panitia.</b> Tombol memilih dinonaktifkan
                sampai jeda dicabut.
              </Peringatan>
            )}

            {data.pemilihan.length > 0 && !dijeda && (
              <div className="bg-[var(--c-primary-soft)] border border-[var(--c-primary-soft-border)] rounded-2xl p-5 flex items-start gap-4 animate-slide-up">
                <div className="shrink-0 w-11 h-11 bg-[var(--c-primary)]/20 rounded-xl flex items-center justify-center">
                  <Icon name="info" className="w-6 h-6 text-[var(--c-primary-dark)]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--c-text)] mb-1">Informasi Penting</h3>
                  <ul className="text-[15px] leading-relaxed text-[var(--c-text-muted)] space-y-1.5 list-disc pl-5">
                    <li>Pilih salah satu kandidat dengan bijak</li>
                    <li>
                      Anda hanya bisa memilih <b>satu kali (1x)</b> untuk setiap
                      organisasi/ekstrakulikuler
                    </li>
                    <li>Keputusan Anda bersifat final dan tidak dapat diubah</li>
                  </ul>
                </div>
              </div>
            )}

            {data.pemilihan.length > 0 ? (
              <section>
                <h2 className="text-2xl font-bold tracking-tight text-[var(--c-text)] mb-4 animate-fade-in">
                  Pemilihan Tersedia
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {data.pemilihan.map((p, i) => (
                    <KartuPemilihan
                      key={p.id}
                      data={p}
                      dijeda={dijeda}
                      index={i}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <Kosong
                ikon={<Icon name="inbox" className="w-12 h-12" />}
                judul="Belum Ada Pemilihan"
                deskripsi="Saat ini tidak ada pemilihan yang aktif untuk Anda."
                aksi={
                  <Tombol varian="sekunder" onClick={muatUlang}>
                    <Icon name="refresh" className="w-4 h-4" />
                    Muat Ulang
                  </Tombol>
                }
              />
            )}
          </>
        )}
      </div>

      {/* Tombol bantuan mengambang */}
      <button
        type="button"
        onClick={() => setPanduan(true)}
        title="Cara memilih"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-[var(--c-primary)] text-white font-semibold shadow-2xl hover:bg-[var(--c-primary-hover)] hover:scale-105 transition"
      >
        <Icon name="help" className="w-5 h-5" />
        <span className="hidden sm:inline">Cara Memilih</span>
      </button>

      <ModalPanduan buka={panduan} onTutup={() => setPanduan(false)} />
    </Kerangka>
  )
}

function Sambutan({ nama, nis, kelas, jumlah }) {
  return (
    <div className="bg-[var(--c-primary)] rounded-2xl shadow-2xl p-6 sm:p-8 text-white animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
            Selamat Datang! <span aria-hidden="true">👋</span>
          </h1>
          <p className="text-white/90 text-lg font-medium truncate">{nama || '...'}</p>
          <p className="text-white/75 text-[15px] mt-1">
            NIS: {nis || '...'} {kelas ? `• ${kelas}` : ''}
          </p>
        </div>
        <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 sm:p-6 text-center w-full sm:w-auto shrink-0">
          <p className="text-white text-[15px]">Pemilihan Tersedia</p>
          <p className="text-4xl font-bold mt-1 tabular-nums">
            {jumlah === undefined ? '...' : jumlah}
          </p>
        </div>
      </div>
    </div>
  )
}

function Progres({ progres }) {
  return (
    <Kartu className="p-5 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--c-primary-soft)] flex items-center justify-center shrink-0">
            <Icon name="clipboard-check" className="w-5 h-5 text-[var(--c-primary-dark)]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--c-text)]">Progres Memilih Anda</h3>
            <p className="text-[15px] leading-relaxed text-[var(--c-text-muted)]">
              {progres.belum > 0 ? (
                <>
                  Masih ada <b className="text-amber-500">{progres.belum}</b> pemilihan yang
                  belum Anda pilih.
                </>
              ) : (
                <span className="text-emerald-400 font-semibold">
                  Semua pemilihan sudah Anda pilih. Terima kasih!
                </span>
              )}
            </p>
          </div>
        </div>
        <span className="text-2xl font-extrabold text-[var(--c-text)] tabular-nums">
          {progres.sudah}
          <span className="text-[var(--c-text-muted)] text-lg">/{progres.total}</span>
        </span>
      </div>
      <BilahProgres persen={progres.persen} />
    </Kartu>
  )
}

function KartuPemilihan({ data: p, dijeda, index }) {
  const sudah = p.sudah_memilih

  return (
    <Kartu
      className="overflow-hidden kasya-card-hover hover:border-[var(--c-primary)]/60 animate-slide-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative h-44 bg-[var(--c-primary)] p-5 flex flex-col justify-between">
        <Lencana
          warna={sudah ? 'sukses' : 'netral'}
          ikon={sudah ? <Icon name="check" className="w-3.5 h-3.5" /> : null}
          className="self-start"
        >
          {sudah ? 'Sudah Memilih' : 'Belum Memilih'}
        </Lencana>
        <h3 className="text-xl font-bold text-white leading-snug line-clamp-2">
          {p.nama}
        </h3>
      </div>

      <div className="p-5 flex flex-col">
        {p.deskripsi && (
          <p className="text-[var(--c-text-muted)] text-[15px] leading-relaxed mb-4 line-clamp-2">
            {p.deskripsi}
          </p>
        )}

        <div className="space-y-2 mb-5">
          <div className="flex items-center gap-2 text-sm text-[var(--c-text-muted)]">
            <Icon name="calendar" className="w-4 h-4 text-[var(--c-primary)] shrink-0" />
            <span>
              {periodeWaktu(p.tanggal_mulai, p.jam_mulai, p.tanggal_selesai, p.jam_selesai)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--c-text-muted)]">
            <Icon name="users" className="w-4 h-4 text-[var(--c-primary)] shrink-0" />
            <span>{p.jumlah_kandidat} Kandidat</span>
          </div>
        </div>

        <div className="mt-auto">
          {sudah ? (
            <div className="h-11 cursor-not-allowed bg-emerald-500/10 text-emerald-400 flex items-center justify-center gap-2 px-5 rounded-xl border border-emerald-500/30 text-sm font-semibold">
              <Icon name="check-circle" className="w-5 h-5" />
              Terima Kasih Sudah Memilih
            </div>
          ) : dijeda ? (
            <div className="h-11 cursor-not-allowed bg-red-500/10 text-red-400 flex items-center justify-center gap-2 px-5 rounded-xl border border-red-500/30 text-sm font-semibold">
              <Icon name="pause" className="w-5 h-5" />
              Sedang Dijeda
            </div>
          ) : (
            <Link
              to={`/user/pemilihan/${p.id}/kandidat`}
              className="h-11 flex items-center justify-center gap-2 px-5 bg-[var(--c-primary)] text-white rounded-xl text-sm font-semibold hover:bg-[var(--c-primary-hover)] transition duration-200"
            >
              Mulai Memilih <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </div>
    </Kartu>
  )
}

function ModalPanduan({ buka, onTutup }) {
  const langkah = [
    {
      judul: 'Pilih pemilihan',
      teks: 'Klik tombol "Mulai Memilih" pada pemilihan yang ingin Anda ikuti.',
    },
    {
      judul: 'Baca & pilih kandidat',
      teks: 'Pelajari visi-misi setiap kandidat, lalu klik "Pilih Kandidat Ini" pada pilihan Anda.',
    },
    {
      judul: 'Konfirmasi',
      teks: 'Periksa lagi pilihan Anda, lalu klik "Ya, Saya Pilih Sekarang". Selesai!',
    },
  ]

  return (
    <Modal
      buka={buka}
      onTutup={onTutup}
      judul="Cara Memilih"
      deskripsi="Ikuti 3 langkah singkat berikut"
      aksi={
        <Tombol className="w-full sm:w-auto" onClick={onTutup}>
          Saya Mengerti, Mulai Memilih
        </Tombol>
      }
    >
      <div className="space-y-4">
        {langkah.map((l, i) => (
          <div key={l.judul} className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-full bg-[var(--c-primary)] text-white font-bold flex items-center justify-center shrink-0">
              {i + 1}
            </div>
            <div>
              <p className="text-[15px] font-bold leading-snug text-[var(--c-text)]">{l.judul}</p>
              <p className="text-[15px] leading-relaxed text-[var(--c-text-muted)]">{l.teks}</p>
            </div>
          </div>
        ))}

        <Peringatan warna="peringatan" ikon={<Icon name="warning" className="w-6 h-6" />}>
          <b>Penting:</b> Pilihan bersifat final dan tidak bisa diubah. Suara Anda dirahasiakan.
          Jika tidak ada aktivitas, Anda akan otomatis keluar demi keamanan.
        </Peringatan>
      </div>
    </Modal>
  )
}

function KerangkaDaftar() {
  return (
    <div className="space-y-8">
      <Kartu className="h-44" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Kartu key={i} className="h-96">
            <KerangkaUi className="h-44 w-full rounded-none" />
            <div className="p-5 space-y-4">
              <KerangkaUi className="h-5 w-3/4" />
              <KerangkaUi className="h-3 w-full" />
              <KerangkaUi className="h-3 w-2/3" />
              <KerangkaUi className="h-11 w-full mt-4" />
            </div>
          </Kartu>
        ))}
      </div>
    </div>
  )
}