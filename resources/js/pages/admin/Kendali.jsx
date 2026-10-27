import { useEffect, useState } from 'react'
import api from '../../lib/api'
import { petaGalat } from '../../lib/validasi'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import { useApp } from '../../context/AppContext'
import { angka } from '../../lib/format'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Kartu, Tombol, Peringatan } from '../../components/UI'
import {
  KepalaHalaman,
  Field,
  Textarea,
  Select,
  Input,
  KartuStatistik,
  Memuat,
} from '../../components/AdminUI'

/*
 * Kendali hari-H. Setara dengan App\Livewire\Admin\KendaliHariH.
 *
 * Dua alat GLOBAL untuk panitia:
 *  1. Pengumuman   -> banner di layar semua pemilih.
 *  2. Jeda darurat -> menghentikan sementara penerimaan suara.
 *
 * Plus pintasan ke Mode Layar Besar (proyektor).
 *
 * Catatan: "Halaman Hasil Publik" (tautan tanpa login) sudah DIHAPUS.
 * Untuk memamerkan hasil ke audiens, pakai Mode Layar Besar yang hanya bisa
 * dibuka admin yang sedang login.
 */
export default function Kendali() {
  const { data, memuat, muatUlang } = useAdminPage('/admin/kendali', {
    izin: 'kendali',
    polling: 30000,
  })
  const { jalankan, memuat: memproses } = useAksiAdmin()

  const [teks, setTeks] = useState('')
  const [tipe, setTipe] = useState('info')
  const [alasan, setAlasan] = useState('')
  const [galat, setGalat] = useState({})
  const [konfirmasiJeda, setKonfirmasiJeda] = useState(false)

  // Selalu ikuti nilai terbaru dari server saat halaman dibuka / di-refresh.
  useEffect(() => {
    if (!data) return
    setTeks(data.pengumuman.teks || '')
    setTipe(data.pengumuman.tipe || 'info')
    setAlasan(data.jeda.alasan || '')
  }, [data])

  const kirimPengumuman = async () => {
    setGalat({})
    try {
      await jalankan(() => api.post('/admin/kendali/pengumuman', { pengumuman: teks, tipe }), {
        sukses: 'Pengumuman dikirim ke layar pemilih.',
      })
      muatUlang({ diam: true })
    } catch (e) {
      setGalat(petaGalat(e))
    }
  }

  const togglePengumuman = async () => {
    await jalankan(() => api.post('/admin/kendali/pengumuman/toggle'))
    muatUlang({ diam: true })
  }

  const hapusPengumuman = async () => {
    await jalankan(() => api.delete('/admin/kendali/pengumuman'), {
      sukses: 'Pengumuman dihapus.',
    })
    setTeks('')
    muatUlang({ diam: true })
  }

  // Jeda perlu konfirmasi karena dampaknya besar: memblokir semua pemilih.
  const toggleJeda = async () => {
    setKonfirmasiJeda(false)
    await jalankan(() => api.post('/admin/kendali/jeda', { jeda_alasan: alasan }))
    muatUlang({ diam: true })
  }

  if (memuat && !data) {
    return (
      <KerangkaAdmin judul="Kendali Hari-H">
        <MemuatTinggi />
      </KerangkaAdmin>
    )
  }

  if (!data) {
    return (
      <KerangkaAdmin judul="Kendali Hari-H">
        <Kartu className="p-10 text-center text-[var(--c-text-muted)]">
          Gagal memuat pengaturan.
        </Kartu>
      </KerangkaAdmin>
    )
  }

  const jeda = data.jeda.aktif

  return (
    <KerangkaAdmin judul="Kendali Hari-H">
      <div className="space-y-6">
        {/* Ringkasan cepat */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KartuStatistik
            label="Pemilihan Aktif"
            nilai={angka(data.ringkasan.pemilihan_aktif)}
            ikon={<Icon name="file-text" className="w-5 h-5" />}
          />
          <KartuStatistik
            label="Suara Hari Ini"
            nilai={angka(data.ringkasan.suara_hari_ini)}
            ikon={<Icon name="check-circle" className="w-5 h-5" />}
            warna="sukses"
          />
          <KartuStatistik
            label="Suara 5 Menit Terakhir"
            nilai={angka(data.ringkasan.suara_5menit)}
            ikon={<Icon name="clock" className="w-5 h-5" />}
            warna="peringatan"
          />
        </div>

        {/* ---------- JEDA DARURAT (paling kritis, di atas) ---------- */}
        <Kartu className={`p-5 sm:p-6 border-2 ${jeda ? 'bg-red-500/10 border-red-500/50' : ''}`}>
          <KepalaHalaman
            aksi={
              <Tombol
                varian={jeda ? 'sukses' : 'bahaya'}
                onClick={() => setKonfirmasiJeda(true)}
                memuat={memproses}
              >
                <Icon name={jeda ? 'check' : 'pause'} className="w-4 h-4" />
                {jeda ? 'Cabut Jeda' : 'Jeda Pemungutan Suara'}
              </Tombol>
            }
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  jeda
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)]'
                }`}
              >
                <Icon name="pause" className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-[var(--c-text)]">Jeda Darurat</h2>
                <p className="text-xs text-[var(--c-text-muted)]">
                  Menghentikan sementara penerimaan suara di SEMUA pemilihan.
                </p>
              </div>
            </div>
          </KepalaHalaman>

          {jeda ? (
            <Peringatan
              warna="bahaya"
              ikon={<Icon name="warning" className="w-5 h-5" />}
              className="mt-4"
            >
              <b>Pemungutan suara sedang dijeda.</b>
              {data.jeda.alasan && <span> Alasan: {data.jeda.alasan}</span>}
            </Peringatan>
          ) : (
            <Field
              label="Alasan jeda (opsional)"
              galat={galat.jeda_alasan}
              bantuan="Ditampilkan ke semua pemilih sebagai penjelasan."
              className="mt-4"
            >
              <Input
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                placeholder="Contoh: Listrik padam sebentar"
                maxLength={200}
              />
            </Field>
          )}
        </Kartu>

        {/* ---------- PENGUMUMAN ---------- */}
        <Kartu className="p-5 sm:p-6">
          <KepalaHalaman
            aksi={
              <>
                {data.pengumuman.teks && (
                  <Tombol
                    varian="sekunder"
                    ukuran="kecil"
                    onClick={togglePengumuman}
                    memuat={memproses}
                  >
                    <Icon name={data.pengumuman.aktif ? 'eye' : 'inbox'} className="w-4 h-4" />
                    {data.pengumuman.aktif ? 'Sembunyikan' : 'Tampilkan'}
                  </Tombol>
                )}
                {data.pengumuman.teks && (
                  <Tombol
                    varian="bahaya"
                    ukuran="kecil"
                    onClick={hapusPengumuman}
                    memuat={memproses}
                  >
                    Hapus
                  </Tombol>
                )}
              </>
            }
          >
            <h2 className="font-bold text-[var(--c-text)]">Pengumuman Panitia</h2>
            <p className="text-xs text-[var(--c-text-muted)]">
              Banner di layar seluruh pemilih yang sedang login.
            </p>
          </KepalaHalaman>

          {data.pengumuman.aktif && data.pengumuman.teks && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[var(--c-primary-soft)] border border-[var(--c-primary-soft-border)]">
              <p className="text-xs font-bold text-[var(--c-primary-dark)] uppercase mb-1">
                Sedang tampil di layar pemilih
              </p>
              <p className="text-sm text-[var(--c-text)] whitespace-pre-line">
                {data.pengumuman.teks}
              </p>
            </div>
          )}

          <div className="space-y-4">
            <Field label="Tipe" wajib galat={galat.tipe}>
              <Select value={tipe} onChange={(e) => setTipe(e.target.value)}>
                <option value="info">Info — netral</option>
                <option value="peringatan">Peringatan — perlu perhatian</option>
                <option value="penting">Penting — mendesak</option>
              </Select>
            </Field>

            <Field
              label="Teks pengumuman"
              wajib
              galat={galat.pengumuman}
              bantuan={`${teks.length}/300 karakter`}
            >
              <Textarea
                rows={4}
                value={teks}
                onChange={(e) => setTeks(e.target.value)}
                maxLength={300}
                placeholder="Contoh: Kelas XII RPL 1 silakan ke Lab 2. Sisa waktu 10 menit."
              />
            </Field>

            <Tombol onClick={kirimPengumuman} memuat={memproses}>
              <Icon name="check" className="w-4 h-4" />
              Kirim Pengumuman
            </Tombol>
          </div>
        </Kartu>

        {/* ---------- MODE LAYAR BESAR ---------- */}
        <KartuLayarBesar />
      </div>

      {/* Konfirmasi jeda — berdampak besar, jadi wajib konfirmasi */}
      <Modal
        buka={konfirmasiJeda}
        onTutup={() => setKonfirmasiJeda(false)}
        judul={jeda ? 'Cabut jeda pemungutan suara?' : 'Jeda pemungutan suara?'}
        lebar="max-w-md"
        aksi={
          <>
            <Tombol
              varian="sekunder"
              onClick={() => setKonfirmasiJeda(false)}
              className="w-full sm:w-auto"
            >
              Batal
            </Tombol>
            <Tombol
              varian={jeda ? 'sukses' : 'bahaya'}
              onClick={toggleJeda}
              memuat={memproses}
              className="w-full sm:w-auto"
            >
              {jeda ? 'Ya, Cabut Jeda' : 'Ya, Jeda Sekarang'}
            </Tombol>
          </>
        }
      >
        <p className="text-[var(--c-text-muted)]">
          {jeda
            ? 'Pemungutan suara akan langsung kembali normal untuk semua pemilih.'
            : 'Semua pemilihan akan langsung menolak suara dari semua pemilih, hingga jeda dicabut. Pastikan tidak ada pemilih yang sedang memilih saat ini.'}
        </p>
      </Modal>
    </KerangkaAdmin>
  )
}

/* Awalnya cuma teks "Memuat..." yang diam, jadi tidak jelas apakah halaman
   masih hidup atau request-nya menggantung. Sekarang pakai Memuat yang sama
   dengan halaman admin lain: spinner + titik + bilah proses. */
function MemuatTinggi() {
  return <Memuat tinggi="h-64" pesan="Memuat data…" />
}

/* ------------------------------------------------------------------ */
/* Mode Layar Besar                                                     */
/* ------------------------------------------------------------------ */

/*
 * Menggantikan kartu "Halaman Hasil Publik" yang sudah dihapus.
 *
 * Bedanya penting: ini BUKAN tautan yang dibagikan. Layar ini hanya terbuka
 * untuk admin yang sedang login di komputer proyektor, jadi tidak ada siapa
 * pun yang bisa melihat hasil lewat tautan. Untuk audiens, panitia cukup
 * mengarahkan mereka ke layar proyektor.
 */
function KartuLayarBesar() {
  return (
    <Kartu className="overflow-hidden">
      <div className="p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--c-border)] bg-[var(--c-bg-subtle)]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-xl bg-[var(--c-bg-surface)] border border-[var(--c-border)] text-[var(--c-primary-dark)] grid place-items-center shrink-0">
            <Icon name="monitor" className="w-6 h-6" />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold text-[var(--c-text)]">Mode Layar Besar</h2>
            <p className="text-xs text-[var(--c-text-muted)]">
              Untuk proyektor di ruang assembly. Satu layar penuh, angka bergerak sendiri.
            </p>
          </div>
        </div>

        <Tombol onClick={bukaLayarBesar}>
          <Icon name="external" className="w-4 h-4" />
          Buka Layar Besar
        </Tombol>
      </div>

      <div className="p-5 sm:p-6">
        <ul className="grid sm:grid-cols-3 gap-3">
          <Butir
            ikon="lock"
            judul="Tanpa tautan publik"
            ket="Hanya admin yang sedang login yang bisa membuka. Tidak ada URL yang bisa dibagikan ke luar."
          />
          <Butir
            ikon="clock"
            judul="Data berjeda, tulisan hidup"
            ket="Angka diambil tiap 5 menit supaya tidak terlihat berubah tiap detik; jam dan hitung mundur tetap berjalan tiap detik."
          />
          <Butir
            ikon="refresh"
            judul="Ganti slide otomatis"
            ket="Kalau ada beberapa pemilihan, layar berputar sendiri. Tekan F11 untuk layar penuh, Esc untuk keluar."
          />
        </ul>
      </div>
    </Kartu>
  )
}

/** Buka di tab baru supaya panel admin tetap utuh di belakang. */
const bukaLayarBesar = () => {
  window.open('/admin/layar-besar', '_blank', 'noopener,noreferrer')
}

function Butir({ ikon, judul, ket }) {
  return (
    <li className="flex gap-3 rounded-xl bg-[var(--c-bg-page)] border border-[var(--c-border)] p-5">
      <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)]">
        <Icon name={ikon} className="w-4 h-4" />
      </span>
      <span className="min-w-0">
        <b className="block text-[13px] text-[var(--c-text)]">{judul}</b>
        <span className="block mt-1 text-xs leading-relaxed text-[var(--c-text-muted)]">{ket}</span>
      </span>
    </li>
  )
}
