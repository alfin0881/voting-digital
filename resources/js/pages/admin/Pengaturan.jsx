import { useEffect, useMemo, useState } from 'react'
import api from '../../lib/api'
import { petaGalat } from '../../lib/validasi'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import { useApp } from '../../context/AppContext'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Lencana, Tombol, Peringatan } from '../../components/UI'
import { KepalaHalaman, Field, Input, Memuat, Panel } from '../../components/AdminUI'

const MAKS_SEKOLAH = 120
const MAKS_APLIKASI = 40

/* Card polos: judul + keterangan di atas, isi di bawah. */
function CardPengaturan({ judul, keterangan, aksi, children }) {
  return (
    <div className="kasya-card p-5 space-y-5 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--c-text)]">{judul}</h2>
          {keterangan && (
            <p className="mt-0.5 text-xs text-[var(--c-text-muted)]">{keterangan}</p>
          )}
        </div>
        {aksi}
      </div>
      {children}
    </div>
  )
}

export default function Pengaturan() {
  const { muatUlangConfig } = useApp()
  const { data, memuat, muatUlang } = useAdminPage('/admin/pengaturan', { izin: 'pengaturan' })
  const { jalankan, memuat: memproses } = useAksiAdmin()

  const [namaSekolah, setNamaSekolah] = useState('')
  const [namaAplikasi, setNamaAplikasi] = useState('')
  const [galat, setGalat] = useState({})
  const [konfirmasiReset, setKonfirmasiReset] = useState(false)
  const [hasilSementara, setHasilSementara] = useState(false)
  const [galatHasil, setGalatHasil] = useState(null)
  const [memprosesHasil, setMemprosesHasil] = useState(false)

  useEffect(() => {
    if (!data) return
    setNamaSekolah(data.nama_sekolah || '')
    setNamaAplikasi(data.nama_aplikasi || '')
    setHasilSementara(!!data.sembunyikan_hasil)
  }, [data])

  const berubah = useMemo(
    () =>
      !!data &&
      (namaSekolah !== (data.nama_sekolah || '') ||
        namaAplikasi !== (data.nama_aplikasi || '')),
    [data, namaSekolah, namaAplikasi],
  )

  useEffect(() => {
    if (!berubah) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [berubah])

  const simpan = async () => {
    setGalat({})
    try {
      await jalankan(() => api.post('/admin/pengaturan', {
        nama_sekolah: namaSekolah,
        nama_aplikasi: namaAplikasi,
      }), { sukses: 'Identitas sekolah disimpan.' })
      muatUlang({ diam: true })
      await muatUlangConfig()
    } catch (e) {
      setGalat(petaGalat(e))
    }
  }

  const reset = async () => {
    setKonfirmasiReset(false)
    await jalankan(() => api.post('/admin/pengaturan/reset'), {
      sukses: 'Identitas sekolah dikembalikan ke bawaan sistem.',
    })
    muatUlang({ diam: true })
    await muatUlangConfig()
  }

  const simpanHasilSementara = async () => {
    setGalatHasil(null)
    setMemprosesHasil(true)
    try {
      const hasil = await jalankan(
        () => api.post('/admin/pengaturan/hasil-sementara', { aktif: hasilSementara ? 1 : 0 }),
        { sukses: 'Pengaturan kerahasiaan hasil disimpan.' },
      )
      setHasilSementara(!!hasil?.data?.sembunyikan_hasil)
      muatUlang({ diam: true })
    } catch (e) {
      setGalatHasil(petaGalat(e))
      setHasilSementara(!!data?.sembunyikan_hasil)
    } finally {
      setMemprosesHasil(false)
    }
  }

  if (memuat && !data) {
    return <KerangkaAdmin judul="Pengaturan"><Memuat tinggi="h-64" /></KerangkaAdmin>
  }

  if (!data) {
    return (
      <KerangkaAdmin judul="Pengaturan">
        <Panel>
          <Peringatan warna="bahaya" ikon={<Icon name="warning" className="w-5 h-5" />}>
            Gagal memuat pengaturan. Muat ulang halaman; bila tetap gagal, periksa koneksi ke server.
          </Peringatan>
        </Panel>
      </KerangkaAdmin>
    )
  }

  return (
    <KerangkaAdmin judul="Pengaturan">
      <KepalaHalaman
        aksi={
          <>
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" /> Muat Ulang
            </Tombol>
            <Tombol onClick={simpan} memuat={memproses} disabled={!berubah} ukuran="kecil">
              <Icon name="check" className="w-4 h-4" /> Simpan
            </Tombol>
          </>
        }
      >
        <p className="text-sm text-[var(--c-text-muted)]">
          Identitas yang dipakai di seluruh halaman, laporan, dan kartu pemilih.
        </p>
      </KepalaHalaman>

      {data.dari_bawaan && (
        <div className="mb-5">
          <Peringatan warna="informasi" ikon={<Icon name="info" className="w-5 h-5" />}>
            Masih memakai nama bawaan sistem. Isi nama di bawah untuk menyesuaikan dengan sekolah Anda.
          </Peringatan>
        </div>
      )}

      {/* Dua card berdampingan: kiri identitas, kanan kerahasiaan hasil */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* KIRI: IDENTITAS */}
        <CardPengaturan
          judul="Identitas Sekolah"
          keterangan="Tampil di navbar, login, laporan, dan kartu pemilih."
        >
          <Field
            label="Nama sekolah"
            wajib
            galat={galat.nama_sekolah}
            bantuan={`${namaSekolah.length}/${MAKS_SEKOLAH} karakter`}
          >
            <Input
              value={namaSekolah}
              onChange={(e) => setNamaSekolah(e.target.value)}
              placeholder="Contoh: SMK Negeri 1 Surabaya"
              maxLength={MAKS_SEKOLAH}
              className={namaSekolah.length >= MAKS_SEKOLAH ? 'border-[var(--c-amber)]' : ''}
            />
          </Field>

          <Field
            label="Nama aplikasi"
            galat={galat.nama_aplikasi}
            bantuan={`Kosongkan untuk bawaan "${data.bawaan_aplikasi}". ${namaAplikasi.length}/${MAKS_APLIKASI} karakter`}
          >
            <Input
              value={namaAplikasi}
              onChange={(e) => setNamaAplikasi(e.target.value)}
              placeholder={data.bawaan_aplikasi}
              maxLength={MAKS_APLIKASI}
              className={namaAplikasi.length >= MAKS_APLIKASI ? 'border-[var(--c-amber)]' : ''}
            />
          </Field>

          {!data.dari_bawaan && (
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-[var(--c-border)]">
              <p className="text-xs text-[var(--c-text-muted)]">
                Hapus nama kustom dan pakai nilai bawaan sistem.
              </p>
              <Tombol
                varian="sekunder"
                ukuran="kecil"
                onClick={() => setKonfirmasiReset(true)}
                memuat={memproses}
              >
                <Icon name="refresh" className="w-3.5 h-3.5" /> Kembalikan
              </Tombol>
            </div>
          )}
        </CardPengaturan>

        {/* KANAN: KERAHASIAAN HASIL */}
        <CardPengaturan
          judul="Kerahasiaan Hasil"
          keterangan="Sembunyikan perolehan suara sebelum pemungutan ditutup."
          aksi={
            <Lencana warna={data.sembunyikan_hasil ? 'sukses' : 'netral'}>
              {data.sembunyikan_hasil ? 'Aktif' : 'Nonaktif'}
            </Lencana>
          }
        >
          <label
            className={`flex items-start gap-3 ${
              data.boleh_ubah_hasil ? 'cursor-pointer' : 'opacity-70'
            }`}
          >
            <input
              type="checkbox"
              checked={hasilSementara}
              disabled={!data.boleh_ubah_hasil || memprosesHasil}
              onChange={(e) => setHasilSementara(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded accent-[var(--c-primary)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--c-text)]">
                Sembunyikan hasil sampai pemungutan ditutup
              </span>
              <span className="block text-xs text-[var(--c-text-muted)] mt-1">
                Berlaku untuk leaderboard, halaman Hasil, layar besar, dan ekspor. Pemilihan yang sudah ditutup tetap terlihat.
              </span>
            </span>
          </label>

          {!data.boleh_ubah_hasil && (
            <Peringatan warna="informasi" ikon={<Icon name="info" className="w-5 h-5" />}>
              Hanya <b>Super Admin</b> yang dapat mengubah pengaturan ini.
            </Peringatan>
          )}

          {galatHasil && (
            <Peringatan warna="bahaya" ikon={<Icon name="warning" className="w-5 h-5" />}>
              {galatHasil?.aktif || galatHasil?.pesan || 'Pengaturan gagal disimpan.'}
            </Peringatan>
          )}

          {data.boleh_ubah_hasil && (
            <div className="flex justify-end pt-4 border-t border-[var(--c-border)]">
              <Tombol
                onClick={simpanHasilSementara}
                memuat={memprosesHasil}
                disabled={hasilSementara === !!data.sembunyikan_hasil}
                ukuran="kecil"
              >
                <Icon name="check" className="w-4 h-4" /> Simpan
              </Tombol>
            </div>
          )}
        </CardPengaturan>
      </div>

      {/* Konfirmasi reset */}
      <Modal
        buka={konfirmasiReset}
        onTutup={() => setKonfirmasiReset(false)}
        judul="Kembalikan ke nama bawaan?"
        lebar="max-w-md"
        aksi={
          <>
            <Tombol varian="sekunder" onClick={() => setKonfirmasiReset(false)} className="w-full sm:w-auto">
              Batal
            </Tombol>
            <Tombol onClick={reset} memuat={memproses} className="w-full sm:w-auto" warna="bahaya">
              Ya, Kembalikan
            </Tombol>
          </>
        }
      >
        <p className="text-[var(--c-text-muted)]">
          Nama sekolah dan nama aplikasi akan kembali ke bawaan sistem (<b>{data.bawaan_sekolah}</b>).
        </p>
      </Modal>
    </KerangkaAdmin>
  )
}