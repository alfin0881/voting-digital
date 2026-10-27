import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from '../lib/navigasi'
import api, { kodeError, pesanError, sesiHabis, statusError } from '../lib/api'
import { useApp, useApi } from '../context/AppContext'
import { nomorUrut, periodeWaktu } from '../lib/format'
import { useStatusPemilih } from '../lib/statusPemilih'
import Kerangka from '../components/Kerangka'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import { Kartu, Kerangka as KerangkaUi, Tombol, Peringatan, Lencana } from '../components/UI'

/*
 * Halaman pilih kandidat — padanan Livewire\User\LihatKandidat.
 *
 * Urutan aturan (PENTING, jangan diubah):
 * 1. Sudah memilih?  -> tidak bisa memilih lagi (409 dari server).
 * 2. Jeda panitia?   -> tombol dikunci, modal konfirmasi ditutup paksa.
 * 3. Kandidat milik pemilihan ini? -> server menolak (UI tidak dipercaya).
 * 4. Pemilihan masih menerima suara? -> dicek ULANG di server saat submit.
 *
 * Tombol kirim dikunci saat request berjalan (anti klik ganda); constraint
 * unique di database tetap jadi penjaga terakhir.
 */
export default function LihatKandidat() {
  const { pemilihanId } = useParams()
  const navigate = useNavigate()
  const { notifikasi } = useApp()
  const { data, memuat, error, muatUlang } = useApi(`/pemilih/pemilihan/${pemilihanId}/kandidat`)

  const [dipilih, setDipilih] = useState(null)
  const [konfirmasi, setKonfirmasi] = useState(false)
  const [mengirim, setMengirim] = useState(false)
  const [jedaPaksa, setJedaPaksa] = useState(false)
  const status = useStatusPemilih()

  // `jedaPaksa` menyalakan status jeda seketika bila server membalas 409
  // "dijeda" saat siswa menekan tombol, tanpa menunggu poller 5 detik.
  const jeda = jedaPaksa || Boolean(status?.jeda)
  const alasanJeda = status?.jeda_alasan || ''

  // Tutup modal konfirmasi begitu jeda menyala.
  useEffect(() => {
    if (jeda) setKonfirmasi(false)
  }, [jeda])

  const headerRef = useRef(null)

  // Tidak terdaftar / pemilihan sudah ditutup -> kembali ke daftar.
  useEffect(() => {
    if (!error) return
    if (sesiHabis(error)) {
      navigate('/login', { replace: true })
      return
    }
    if (statusError(error) === 403) {
      notifikasi(pesanError(error), 'bahaya')
      navigate('/user/pemilihan', { replace: true })
    }
  }, [error, navigate, notifikasi])

  // Fokuskan judul setelah data termuat supaya pembaca layar tahu halaman berganti.
  useEffect(() => {
    headerRef.current?.focus?.()
  }, [data])

  const bukaKonfirmasi = useCallback(
    (kandidat) => {
      if (data?.sudah_memilih) {
        notifikasi('Anda sudah memilih di pemilihan ini!', 'bahaya')
        return
      }
      if (jeda || data?.dijeda) {
        setJedaPaksa(true)
        notifikasi('Pemungutan suara sedang dijeda oleh panitia. Silakan menunggu.', 'bahaya')
        return
      }
      setDipilih(kandidat)
      setKonfirmasi(true)
    },
    [data, jeda, notifikasi],
  )

  const kirimSuara = useCallback(async () => {
    if (mengirim || !dipilih) return

    setMengirim(true)
    try {
      await api.post(`/pemilih/pemilihan/${pemilihanId}/suara`, { kandidat_id: dipilih.id })
      navigate('/user/terima-kasih', { replace: true })
    } catch (err) {
      const kode = kodeError(err)

      // Sudah memilih (termasuk bila dobel klik berhasil sampai server).
      if (statusError(err) === 409 && kode === 'sudah_memilih') {
        setKonfirmasi(false)
        await muatUlang()
        notifikasi('Anda sudah memilih di pemilihan ini!', 'bahaya')
        return
      }

      // Panitia menekan jeda darurat tepat saat siswa menekan tombol.
      if (statusError(err) === 409 && kode === 'dijeda') {
        setJedaPaksa(true)
        setKonfirmasi(false)
        notifikasi('Pemungutan suara sedang dijeda oleh panitia. Silakan menunggu.', 'bahaya')
        return
      }

      // Pemilihan ditutup panitia saat halaman masih terbuka.
      if (statusError(err) === 409) {
        setKonfirmasi(false)
        await muatUlang()
        notifikasi(pesanError(err), 'bahaya')
        return
      }

      notifikasi(pesanError(err), 'bahaya')
    } finally {
      setMengirim(false)
    }
  }, [mengirim, dipilih, pemilihanId, navigate, muatUlang, notifikasi])

  const sudah = data?.sudah_memilih
  const boleh = data?.boleh_memilih && !sudah && !jeda && !data?.dijeda

  return (
    <Kerangka judul="Pilih Kandidat">
      <div className="space-y-8">
        <Link
          to="/user/pemilihan"
          className="inline-flex items-center gap-2 text-sm text-[var(--c-text-muted)] transition hover:text-[var(--c-primary)]"
        >
          <Icon name="home2" className="h-4 w-4" />
          Daftar pemilihan
        </Link>

        {memuat && !data && <KerangkaKandidat />}

        {error && !sesiHabis(error) && statusError(error) !== 403 && (
          <Peringatan warna="bahaya" ikon={<Icon name="warning" />}>
            {pesanError(error)}
            <button
              type="button"
              onClick={muatUlang}
              className="mt-2 block text-sm font-semibold underline hover:no-underline"
            >
              Coba lagi
            </button>
          </Peringatan>
        )}

        {data && (
          <>
            {/* Judul pemilihan: teks polos, tanpa blok warna besar */}
            <header ref={headerRef} tabIndex={-1} className="space-y-2 focus:outline-hidden">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--c-text)] md:text-3xl">
                {data.pemilihan.nama}
              </h1>
              {data.pemilihan.deskripsi && (
                <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--c-text-muted)]">{data.pemilihan.deskripsi}</p>
              )}
              <p className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1 text-sm text-[var(--c-text-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="calendar" className="h-4 w-4" />
                  {periodeWaktu(
                    data.pemilihan.tanggal_mulai,
                    data.pemilihan.jam_mulai,
                    data.pemilihan.tanggal_selesai,
                    data.pemilihan.jam_selesai,
                  )}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="users" className="h-4 w-4" />
                  {data.kandidat.length} kandidat
                </span>
              </p>
            </header>

            {/* Status */}
            {sudah && (
              <Peringatan warna="sukses" ikon={<Icon name="check-circle" className="h-6 w-6" />}>
                <b>Anda sudah memilih di pemilihan ini.</b> Pilihan bersifat final dan tidak dapat
                diubah.
              </Peringatan>
            )}

            {(jeda || data.dijeda) && !sudah && (
              <Peringatan warna="bahaya" ikon={<Icon name="pause" className="h-6 w-6" />}>
                <b>Pemungutan suara sedang dijeda panitia.</b>
                {alasanJeda && <span> {alasanJeda}</span>}
              </Peringatan>
            )}

            {!sudah && !boleh && !jeda && !data.dijeda && data.alasan && (
              <Peringatan warna="peringatan" ikon={<Icon name="warning" className="h-6 w-6" />}>
                {data.alasan}
              </Peringatan>
            )}

            {/* Daftar kandidat */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.kandidat.map((k) => (
                <KartuKandidat
                  key={k.id}
                  kandidat={k}
                  onPilih={() => bukaKonfirmasi(k)}
                  nonaktif={!boleh}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal konfirmasi */}
      <Modal
        buka={konfirmasi}
        onTutup={() => !mengirim && setKonfirmasi(false)}
        judul="Konfirmasi pilihan"
        deskripsi="Pastikan Anda yakin. Pilihan tidak dapat diubah."
        aksi={
          <>
            <Tombol
              varian="sekunder"
              onClick={() => setKonfirmasi(false)}
              disabled={mengirim}
              className="w-full sm:w-auto"
            >
              Ganti pilihan
            </Tombol>
            <Tombol
              varian="sukses"
              onClick={kirimSuara}
              memuat={mengirim}
              disabled={mengirim}
              className="w-full sm:w-auto"
            >
              {mengirim ? 'Menyimpan...' : 'Ya, saya pilih'}
            </Tombol>
          </>
        }
      >
        {dipilih && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg-page)] p-4">
              <FotoKandidat kandidat={dipilih} className="h-16 w-16 rounded-xl" />
              <div className="min-w-0">
                <Lencana warna="informasi">Nomor urut {nomorUrut(dipilih.nomor_urut)}</Lencana>
                <p className="mt-1 truncate text-xl font-bold leading-snug text-[var(--c-text)]">
                  {dipilih.nama_kandidat}
                </p>
              </div>
            </div>

            <Peringatan warna="peringatan" ikon={<Icon name="warning" className="h-6 w-6" />}>
              <b>Tidak bisa dibatalkan.</b> Suara Anda langsung tercatat secara anonim dan
              menjadi final.
            </Peringatan>
          </div>
        )}
      </Modal>
    </Kerangka>
  )
}

function KartuKandidat({ kandidat: k, onPilih, nonaktif }) {
  const daftarMisi = k.misi
    ? String(k.misi)
        .split('\n')
        .filter((b) => b.trim())
    : []

  return (
    <Kartu className={`flex flex-col overflow-hidden ${nonaktif ? 'opacity-70' : ''}`}>
      {/* Foto + nomor urut */}
      <div className="relative h-56 overflow-hidden bg-[var(--c-bg-subtle)] sm:h-64">
        <FotoKandidat
          kandidat={k}
          className="h-full w-full rounded-none object-[center_25%]"
          ukuranInisial="text-6xl"
        />
        <span
          className="absolute right-3 top-3 grid h-10 min-w-10 place-items-center rounded-full bg-[var(--c-bg-surface)] px-2 text-lg font-extrabold tabular-nums text-[var(--c-text)] shadow ring-1 ring-black/5"
          aria-label={`Nomor urut ${nomorUrut(k.nomor_urut)}`}
        >
          {nomorUrut(k.nomor_urut)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <h3 className="break-words text-2xl text-center uppercase font-bold leading-snug text-[var(--c-text)]">
          {k.nama_kandidat}
        </h3>

        {(k.visi || daftarMisi.length > 0) && (
          <div className="space-y-4 border-t border-[var(--c-border)] pt-2 text-[15px] leading-relaxed text-[var(--c-text-muted)]">
            {k.visi && (
              <section>
                <h4 className="mb-1 font-semibold text-[var(--c-text)]">Visi</h4>
                <p>{k.visi}</p>
              </section>
            )}

            {daftarMisi.length > 0 && (
              <section>
                <h4 className="mb-1 font-semibold text-[var(--c-text)]">Misi</h4>
                <ul className="space-y-1.5">
                  {daftarMisi.map((baris, i) => (
                    <li key={i} className="flex gap-2">
                      <Icon
                        name="check"
                        className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--c-sukses)]"
                      />
                      <span>{baris.replace(/^\s*[-•*]\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <Tombol
          ukuran="besar"
          className="mt-auto w-full"
          onClick={onPilih}
          disabled={nonaktif}
          aria-label={`Pilih ${k.nama_kandidat}`}
        >
          <Icon name="check-circle" className="h-5 w-5" />
          Pilih kandidat ini
        </Tombol>
      </div>
    </Kartu>
  )
}

/** Foto kandidat, atau avatar inisial bila tidak ada foto / gagal dimuat. */
function FotoKandidat({ kandidat, className = '', ukuranInisial = 'text-xl' }) {
  const [gagal, setGagal] = useState(false)

  if (!kandidat.foto_url || gagal) {
    return (
      <div
        className={`${className} flex shrink-0 items-center justify-center bg-[var(--c-primary-soft)] font-bold text-[var(--c-primary-dark)] ${ukuranInisial}`}
        aria-hidden="true"
      >
        {kandidat.nama_kandidat
          ?.split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((k) => k[0])
          .join('')
          .toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={kandidat.foto_url}
      alt={`Foto ${kandidat.nama_kandidat}`}
      onError={() => setGagal(true)}
      className={`${className} shrink-0 object-cover`}
    />
  )
}

function KerangkaKandidat() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <KerangkaUi className="h-8 w-2/3" />
        <KerangkaUi className="h-4 w-1/3" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2].map((i) => (
          <Kartu key={i} className="overflow-hidden">
            <KerangkaUi className="h-56 w-full rounded-none sm:h-64" />
            <div className="space-y-4 p-5">
              <KerangkaUi className="h-5 w-3/4" />
              <KerangkaUi className="h-10 w-full" />
            </div>
          </Kartu>
        ))}
      </div>
    </div>
  )
}