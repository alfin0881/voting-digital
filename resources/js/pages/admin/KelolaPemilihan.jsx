import { useMemo, useState } from 'react'
import { Link, useNavigate } from '../../lib/navigasi'
import api from '../../lib/api'
import { petaGalat } from '../../lib/validasi'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import { angka, tanggalPendek, tanggalPanjang } from '../../lib/format'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Kartu, Lencana, Tombol, Kosong, Panel, BilahProgres, Peringatan } from '../../components/UI'
import {
  KepalaHalaman,
  Memuat,
  MemuatRingkas,
  Field,
  Input,
  Textarea,
  Cari,
  AksiBaris,
  Konfirmasi,
} from '../../components/AdminUI'

/*
 * Kelola Pemilihan. Setara dengan App\Livewire\Admin\KelolaPemilihan.
 *
 * TAMPILAN: kartu, bukan tabel.
 *
 * Alasannya, isi tiap pemilihan terlalu banyak untuk jadi satu baris —
 * nama, deskripsi, periode, status nyata, jumlah kandidat, suara, dan
 * Progress. Di tabel semua itu dipipihkan jadi kolom 7 yang sempit-sempit
 * dan horizontal scroll, padahal yang paling penting justru status dan
 * progres. Di kartu, tiap pemilihan punya "wajah"-nya sendiri dan bisa
 * dibaca tanpa menggulir ke samping.
 *
 * Dua hal yang membuat halaman ini ramah pakai:
 *
 * 1. STATUS SEBENARNYA DITAMPILKAN, bukan hanya kolom status di database.
 *    Kolom `status` hanya berisi "aktif / nonaktif", padahal suara hanya
 *    benar-benar diterima bila hari ini berada di antara tanggal mulai dan
 *    selesai. Menampilkan "Aktif" untuk pemilihan yang sudah lewat tanggal
 *    membuat admin mengira ada bug.
 *
 * 2. TINDAKAN BESAR SELALU DIKONFIRMASI. Mengaktifkan pemilihan membuat
 *    pemilih bisa langsung memberikan suara, jadi tidak boleh satu klik
 *    tanpa sengaja.
 *
 * 3. HAPUS PERMANEN MENUNTUT KETIK NAMA. Tombol hapus biasa hanya
 *    mengarsipkan pemilihan (soft delete) beserta datanya, sehingga riwayat
 *    suara tetap bisa diaudit dan pemilihan bisa dipulihkan. Hapus permanen
 *    (termasuk seluruh riwayat suara anonim) menuntut admin mengetik nama
 *    pemilihan dengan tepat — lapisan kedua setelah dialog konfirmasi.
 */

const KOSONG = {
  nama_pemilihan: '',
  deskripsi: '',
  tanggal_mulai: '',
  tanggal_selesai: '',
  // Kosong-sepanjang-hari secara bawaan; panitia bisa mempersempit (mis. 07:00-12:00).
  jam_mulai: '00:00',
  jam_selesai: '23:59',
  status: 'nonaktif',
}

/* Urutan tampil: yang paling butuh perhatian admin dulu. */
const URUT_STATUS = {
  Berlangsung: 0,
  Dijeda: 1,
  'Akan mulai': 2,
  Selesai: 3,
  Nonaktif: 4,
  Diarsipkan: 5,
}

/* Warna + ikon per keadaan. `aksen` dipakai sebagai garis atas kartu. */
const GAYA_STATUS = {
  Berlangsung: { warna: 'sukses', ikon: 'check-circle', aksen: 'var(--c-emerald)', denyut: true },
  Dijeda: { warna: 'peringatan', ikon: 'pause', aksen: 'var(--c-amber)', denyut: true },
  'Akan mulai': { warna: 'informasi', ikon: 'calendar', aksen: 'var(--c-sky)' },
  Selesai: { warna: 'peringatan', ikon: 'clock', aksen: 'var(--c-amber)' },
  Nonaktif: { warna: 'netral', ikon: 'pause', aksen: 'var(--c-text-subtle)' },
  Diarsipkan: { warna: 'netral', ikon: 'inbox', aksen: 'var(--c-text-subtle)' },
}

const SARING = [
  { kunci: 'semua', label: 'Semua' },
  { kunci: 'Berlangsung', label: 'Berlangsung' },
  { kunci: 'Dijeda', label: 'Dijeda' },
  { kunci: 'Akan mulai', label: 'Akan mulai' },
  { kunci: 'Selesai', label: 'Selesai' },
  { kunci: 'Nonaktif', label: 'Nonaktif' },
]

export default function KelolaPemilihan() {
  const navigate = useNavigate()
  const [lihatArsip, setLihatArsip] = useState(false)
  const { data, memuat, muatUlang } = useAdminPage(
    lihatArsip ? '/admin/pemilihan?arsip=1' : '/admin/pemilihan',
    { izin: 'pemilihan' },
  )
  const { jalankan, memuat: memproses } = useAksiAdmin()

  const [form, setForm] = useState(null) // null = modal tertutup
  const [hapus, setHapus] = useState(null) // {id, nama, permanenSaja}
  const [ketikKonfirmasi, setKetikKonfirmasi] = useState('')
  const [toggle, setToggle] = useState(null)
  const [galat, setGalat] = useState({})
  const [cari, setCari] = useState('')
  const [saring, setSaring] = useState('semua')

  // Tab Arsip punya data source berbeda (?arsip=1), filter tampilan biasa
  // jadi tidak relevan — reset supaya tidak menyimpan hasil kosong.
  const gantiMode = (arsip) => {
    setLihatArsip(arsip)
    setSaring('semua')
    setCari('')
  }

  const bukaTambah = () => {
    setGalat({})
    setForm({ ...KOSONG })
  }

  const bukaEdit = (p) => {
    setGalat({})
    setForm({
      id: p.id,
      nama_pemilihan: p.nama,
      deskripsi: p.deskripsi || '',
      tanggal_mulai: p.tanggal_mulai || '',
      tanggal_selesai: p.tanggal_selesai || '',
      jam_mulai: p.jam_mulai || '00:00',
      jam_selesai: p.jam_selesai || '23:59',
      status: p.status,
    })
  }

  const ubah = (kunci, nilai) => {
    setForm((f) => ({ ...f, [kunci]: nilai }))
    if (galat[kunci]) setGalat((g) => ({ ...g, [kunci]: undefined }))
  }

  const simpan = async () => {
    const nama = form.nama_pemilihan.trim()

    // Validasi cepat di sisi klien supaya kesalahan sepele tidak perlu
    // menunggu perjalanan ke server.
    if (nama.length < 3) {
      setGalat({ nama_pemilihan: 'Nama pemilihan minimal 3 karakter.' })
      return
    }

    if (!form.tanggal_mulai) {
      setGalat({ tanggal_mulai: 'Tanggal mulai wajib diisi.' })
      return
    }

    if (!form.tanggal_selesai) {
      setGalat({ tanggal_selesai: 'Tanggal selesai wajib diisi.' })
      return
    }

    if (form.tanggal_selesai < form.tanggal_mulai) {
      setGalat({ tanggal_selesai: 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.' })
      return
    }

    if (!form.jam_mulai) {
      setGalat({ jam_mulai: 'Jam mulai wajib diisi.' })
      return
    }

    if (!form.jam_selesai) {
      setGalat({ jam_selesai: 'Jam selesai wajib diisi.' })
      return
    }

    if (
      form.tanggal_selesai === form.tanggal_mulai &&
      form.jam_selesai <= form.jam_mulai
    ) {
      setGalat({ jam_selesai: 'Jam selesai harus setelah jam mulai pada hari yang sama.' })
      return
    }

    setGalat({})

    const isi = { ...form, nama_pemilihan: nama }

    try {
      await jalankan(
        () =>
          isi.id
            ? api.put(`/admin/pemilihan/${isi.id}`, isi)
            : api.post('/admin/pemilihan', isi),
        { sukses: isi.id ? 'Pemilihan berhasil diperbarui.' : 'Pemilihan berhasil ditambahkan.' },
      )
      setForm(null)
      muatUlang()
    } catch (e) {
      setGalat(petaGalat(e))
    }
  }

  /* Ubah status selalu lewat dialog konfirmasi, tidak langsung jalan. */
  const toggleStatus = async () => {
    if (!toggle) return
    try {
      await jalankan(() => api.patch(`/admin/pemilihan/${toggle.id}/status`))
      setToggle(null)
      muatUlang()
    } catch {
      /* toast sudah tampil; modal dibiarkan terbuka agar bisa diulang */
    }
  }

  /* Tanpa ketik nama -> arsip (soft delete, bisa dipulihkan dari tab Arsip). */
  const arsipkan = async () => {
    if (!hapus) return
    try {
      await jalankan(() => api.delete(`/admin/pemilihan/${hapus.id}`))
      setHapus(null)
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  /* Dengan ketik nama -> hapus permanen beserta seluruh riwayat suara. */
  const hapusPermanen = async () => {
    if (!hapus) return
    try {
      await jalankan(() =>
        api.delete(`/admin/pemilihan/${hapus.id}`, { data: { konfirmasi: ketikKonfirmasi } }),
      )
      setHapus(null)
      setKetikKonfirmasi('')
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  const pulihkan = async (p) => {
    try {
      await jalankan(() => api.post(`/admin/pemilihan/${p.id}/pulihkan`))
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  const semua = useMemo(
    () =>
      (data?.pemilihan ?? []).map((p) => ({
        ...p,
        // Server menghitung keadaan memakai jam & zona waktu aplikasi.
        // Fallback lokal hanya untuk data lama yang belum punya field ini.
        keadaan: p.keadaan ?? hitungKeadaan(p),
      })),
    [data],
  )

  const daftar = useMemo(() => {
    const kata = cari.trim().toLowerCase()

    return semua
      .filter((p) => (saring === 'semua' ? true : p.keadaan === saring))
      .filter((p) => (kata ? p.nama.toLowerCase().includes(kata) : true))
      .sort((a, b) => {
        const beda = URUT_STATUS[a.keadaan] - URUT_STATUS[b.keadaan]
        if (beda !== 0) return beda

        // Di dalam kelompok sama, yang tanggalnya paling dekat ditampilkan dulu.
        const sa = a.tanggal_selesai ?? '9999'
        const sb = b.tanggal_selesai ?? '9999'
        return sa < sb ? -1 : sa > sb ? 1 : 0
      })
  }, [semua, cari, saring])

  const jumlah = (keadaan) => semua.filter((p) => p.keadaan === keadaan).length

  /* Aksi kartu — dikumpulkan supaya tidak ditulis ulang di setiap kartu. */
  const mintaToggle = (p) =>
    setToggle({
      id: p.id,
      nama: p.nama,
      keadaan: p.keadaan,
      akanAktif: p.status !== 'aktif',
      tanggal_mulai: p.tanggal_mulai,
      tanggal_selesai: p.tanggal_selesai,
      jam_mulai: p.jam_mulai,
      jam_selesai: p.jam_selesai,
      jumlah_kandidat: p.jumlah_kandidat,
      jumlah_peserta: p.total_peserta,
    })

  /* Tombol hapus pada kartu aktif: default adalah arsip yang aman. */
  const mintaHapus = (p) => {
    setKetikKonfirmasi('')
    setHapus({
      id: p.id,
      nama: p.nama,
      permanenSaja: false,
    })
  }

  /* Tombol hapus permanen pada kartu arsip: langsung butuh ketik nama. */
  const mintaHapusPermanen = (p) => {
    setKetikKonfirmasi('')
    setHapus({
      id: p.id,
      nama: p.nama,
      permanenSaja: true,
    })
  }

  return (
    <KerangkaAdmin judul="Kelola Pemilihan">
      <KepalaHalaman
        aksi={
          <>
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" />
              Muat Ulang
            </Tombol>
            <Tombol
              varian="sekunder"
              ukuran="kecil"
              onClick={() => gantiMode(!lihatArsip)}
              aria-pressed={lihatArsip}
            >
              <Icon name="inbox" className="w-4 h-4" />
              {lihatArsip ? 'Kembali' : 'Arsip'}
            </Tombol>
            {!lihatArsip && (
              <Tombol onClick={bukaTambah}>
                <Icon name="plus" className="w-4 h-4" />
                Tambah Pemilihan
              </Tombol>
            )}
          </>
        }
      >
        <div>
          <h2 className="text-[15px] font-bold text-[var(--c-text)]">Daftar Pemilihan</h2>
          <p className="text-sm text-[var(--c-text-muted)] mt-0.5 h-6 flex items-center">
            {memuat ? (
              <MemuatRingkas lebar="w-52" />
            ) : lihatArsip ? (
              `${semua.length} pemilihan terarsip · suara & peserta masih tersimpan`
            ) : (
              `${semua.length} pemilihan · ${jumlah('Berlangsung')} sedang berlangsung`
            )}
          </p>
        </div>
      </KepalaHalaman>

      {data?.dijeda && (
        <Peringatan warna="peringatan" ikon={<Icon name="pause" className="w-5 h-5" />}>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Pemungutan suara sedang <b>dijeda</b>. Semua pemilihan berstatus aktif belum
              menerima suara sampai jeda dicabut.
            </span>
            <Link
              to="/admin/kendali"
              className="font-semibold underline underline-offset-2 hover:text-[var(--c-text)]"
            >
              Buka Kendali Hari-H
            </Link>
          </span>
        </Peringatan>
      )}

      {memuat && !data && <Memuat kartu />}

      {!memuat && semua.length === 0 && (
        <Kosong
          ikon={<Icon name={lihatArsip ? 'inbox' : 'file-text'} className="w-12 h-12" />}
          judul={lihatArsip ? 'Arsip Kosong' : 'Belum Ada Pemilihan'}
          deskripsi={
            lihatArsip
              ? 'Tidak ada pemilihan yang diarsipkan. Pemilihan yang diarsipkan lewat tombol Hapus akan muncul di sini, termasuk seluruh riwayat suaranya.'
              : 'Buat pemilihan dulu, lalu tambahkan kandidat dan peserta. Pemilih baru bisa memilih setelah pemilihan diaktifkan dan tanggalnya sedang berjalan.'
          }
          aksi={
            !lihatArsip && <Tombol onClick={bukaTambah}>Buat Pemilihan Pertama</Tombol>
          }
        />
      )}

      {semua.length > 0 && (
        <>
          {/* ---------- FILTER ---------- */}
          <div className="kasya-card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Cari
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari nama pemilihan…"
                aria-label="Cari pemilihan"
                className="sm:w-72"
              />

              {/* Pemilihan terarsip semuanya "Diarsipkan", jadi pill status
                  biasa tidak berguna di tab ini. */}
              {!lihatArsip && (
                <div
                  role="group"
                  aria-label="Saring status"
                  className="flex flex-wrap items-center gap-1 p-1 rounded-xl
                    bg-[var(--c-bg-page)] border border-[var(--c-border)]"
                >
                  {SARING.map((s) => {
                    const aktif = saring === s.kunci
                    const n = s.kunci === 'semua' ? semua.length : jumlah(s.kunci)

                    return (
                      <button
                        key={s.kunci}
                        type="button"
                        onClick={() => setSaring(s.kunci)}
                        aria-pressed={aktif}
                        className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg
                          text-[12px] font-semibold transition-colors ${
                            aktif
                              ? 'bg-[var(--c-bg-surface)] text-[var(--c-primary)] shadow-sm'
                              : 'text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                          }`}
                      >
                        {s.label}
                        <span
                          className={`text-[10px] tabular-nums ${
                            aktif ? 'text-[var(--c-primary)]' : 'text-[var(--c-text-subtle)]'
                          }`}
                        >
                          {n}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {(cari.trim() || saring !== 'semua') && (
                <Tombol
                  varian="polos"
                  ukuran="kecil"
                  onClick={() => {
                    setCari('')
                    setSaring('semua')
                  }}
                  className="h-10"
                >
                  <Icon name="x" className="w-4 h-4" />
                  Reset
                </Tombol>
              )}
            </div>
          </div>

          {daftar.length === 0 ? (
            <Panel judul="Tidak ada yang cocok" ikon={<Icon name="search" className="w-4 h-4" />}>
              <p className="text-[13px] text-[var(--c-text-muted)]">
                Tidak ada pemilihan dengan filter ini. Coba ubah kata kunci atau pilih status lain.
              </p>
            </Panel>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {daftar.map((p) => (
                <KartuPemilihan
                  key={p.id}
                  p={p}
                  onUbah={() => bukaEdit(p)}
                  onToggle={() => mintaToggle(p)}
                  onHapus={() => mintaHapus(p)}
                  onHapusPermanen={() => mintaHapusPermanen(p)}
                  onPulihkan={() => pulihkan(p)}
                  onKandidat={() => navigate(`/admin/kandidat?pemilihan=${p.id}`)}
                  onPeserta={() => navigate(`/admin/anggota?filter_pemilihan=${p.id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------- MODAL FORM ---------- */}
      <Modal
        buka={!!form}
        onTutup={() => !memproses && setForm(null)}
        judul={form?.id ? 'Ubah Pemilihan' : 'Tambah Pemilihan'}
        deskripsi={form?.id ? form.nama_pemilihan : 'Isi data pemilihan baru.'}
        aksi={
          <>
            <Tombol
              varian="sekunder"
              onClick={() => setForm(null)}
              disabled={memproses}
              className="w-full sm:w-auto"
            >
              Batal
            </Tombol>
            <Tombol onClick={simpan} memuat={memproses} className="w-full sm:w-auto">
              Simpan
            </Tombol>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Field label="Nama Pemilihan" wajib galat={galat.nama_pemilihan}>
              <Input
                value={form.nama_pemilihan}
                onChange={(e) => ubah('nama_pemilihan', e.target.value)}
                placeholder="Contoh: Pemilihan Ketua OSIS"
              />
            </Field>

            <Field
              label="Deskripsi"
              galat={galat.deskripsi}
              bantuan="Opsional, ditampilkan ke pemilih."
            >
              <Textarea
                rows={3}
                value={form.deskripsi}
                onChange={(e) => ubah('deskripsi', e.target.value)}
                placeholder="Penjelasan singkat tentang pemilihan ini"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tanggal Mulai" wajib galat={galat.tanggal_mulai}>
                <Input
                  type="date"
                  value={form.tanggal_mulai}
                  max={form.tanggal_selesai || undefined}
                  onChange={(e) => ubah('tanggal_mulai', e.target.value)}
                />
              </Field>
              <Field label="Tanggal Selesai" wajib galat={galat.tanggal_selesai}>
                <Input
                  type="date"
                  value={form.tanggal_selesai}
                  min={form.tanggal_mulai || undefined}
                  onChange={(e) => ubah('tanggal_selesai', e.target.value)}
                />
              </Field>
              <Field label="Jam Mulai" wajib galat={galat.jam_mulai}>
                <Input
                  type="time"
                  value={form.jam_mulai}
                  onChange={(e) => ubah('jam_mulai', e.target.value)}
                />
              </Field>
              <Field label="Jam Selesai (tutup otomatis)" wajib galat={galat.jam_selesai}>
                <Input
                  type="time"
                  value={form.jam_selesai}
                  onChange={(e) => ubah('jam_selesai', e.target.value)}
                />
              </Field>
            </div>

            {/* Pintasan jam yang paling sering dipakai. */}
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--c-text-muted)]">
              <span>Pintasan:</span>
              <Tombol
                varian="sekunder"
                ukuran="kecil"
                type="button"
                onClick={() => setForm((f) => ({ ...f, jam_mulai: '07:00', jam_selesai: '12:00' }))}
              >
                Jam sekolah 07:00–12:00
              </Tombol>
              <Tombol
                varian="sekunder"
                ukuran="kecil"
                type="button"
                onClick={() => setForm((f) => ({ ...f, jam_mulai: '00:00', jam_selesai: '23:59' }))}
              >
                Sepanjang hari
              </Tombol>
            </div>

            {/* Ringkasan rentang, supaya admin tidak perlu menghitung sendiri. */}
            {form.tanggal_mulai && form.tanggal_selesai && (
              <p className="text-[12px] text-[var(--c-text-muted)] flex items-center gap-2">
                <Icon name="calendar" className="w-4 h-4 shrink-0" />
                Berlangsung <b className="text-[var(--c-text)]">{selisihHari(form)} hari</b> —{' '}
                {tanggalPanjang(form.tanggal_mulai)} {form.jam_mulai} sampai{' '}
                {tanggalPanjang(form.tanggal_selesai)} {form.jam_selesai}. Pemungutan suara ditutup
                otomatis pada jam selesai.
              </p>
            )}

            <Field label="Status" wajib galat={galat.status}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <PilStatus
                  aktif={form.status === 'nonaktif'}
                  onKlik={() => ubah('status', 'nonaktif')}
                  ikon="pause"
                  judul="Nonaktif"
                  keterangan="Belum menerima suara"
                />
                <PilStatus
                  aktif={form.status === 'aktif'}
                  onKlik={() => ubah('status', 'aktif')}
                  ikon="check-circle"
                  judul="Aktif"
                  keterangan="Menerima suara"
                />
              </div>
            </Field>

            <p className="text-[12px] text-[var(--c-text-muted)] flex items-start gap-2">
              <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Status <b className="text-[var(--c-text)]">Aktif</b> hanya menerima suara bila hari
                ini berada di antara tanggal mulai dan selesai. Mengaktifkan tidak langsung membuka
                suara bila tanggalnya belum mulai atau sudah lewat.
              </span>
            </p>
          </div>
        )}
      </Modal>

      {/* ---------- KONFIRMASI STATUS ---------- */}
      <Konfirmasi
        buka={!!toggle}
        onTutup={() => setToggle(null)}
        onYa={toggleStatus}
        judul={toggle?.akanAktif ? 'Aktifkan pemilihan?' : 'Nonaktifkan pemilihan?'}
        tombol={toggle?.akanAktif ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan'}
        warna={toggle?.akanAktif ? 'utama' : 'bahaya'}
        ikon={toggle?.akanAktif ? 'check-circle' : 'pause'}
        memuat={memproses}
        pesan={
          toggle && (
            <>
              <p>
                <b className="text-[var(--c-text)]">{toggle.nama}</b>{' '}
                {toggle.akanAktif
                  ? toggle.keadaan === 'Berlangsung'
                    ? 'akan menerima suara mulai sekarang.'
                    : 'akan diaktifkan, tetapi baru menerima suara sesuai jadwal di bawah.'
                  : 'akan berhenti menerima suara. Pemilih tidak bisa memilih selama ini.'}
              </p>

              {toggle.akanAktif && (
                <ul className="mt-3 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Hanya berlaku bila waktu sekarang berada di antara{' '}
                      {tanggalPendek(toggle.tanggal_mulai)} {toggle.jam_mulai} dan{' '}
                      {tanggalPendek(toggle.tanggal_selesai)} {toggle.jam_selesai}.
                      {toggle.keadaan !== 'Berlangsung' && (
                        <>
                          {' '}
                          Saat ini keterangan menunjukkan{' '}
                          <b className="text-[var(--c-text)]">{toggle.keadaan}</b>.
                        </>
                      )}
                    </span>
                  </li>
                  {toggle.jumlah_kandidat === 0 && (
                    <li className="flex items-start gap-2 text-[var(--c-amber)]">
                      <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Belum ada kandidat. Pemilih tidak akan punya apa pun untuk dipilih.</span>
                    </li>
                  )}
                  {toggle.jumlah_peserta === 0 && (
                    <li className="flex items-start gap-2 text-[var(--c-amber)]">
                      <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Belum ada peserta terdaftar. Tidak ada yang bisa memberikan suara.</span>
                    </li>
                  )}
                </ul>
              )}
            </>
          )
        }
      />

      {/* ---------- MODAL ARSIP / HAPUS PERMANEN ---------- */}
      <Modal
        buka={!!hapus}
        onTutup={() => !memproses && (setHapus(null), setKetikKonfirmasi(''))}
        judul={
          hapus
            ? hapus.permanenSaja
              ? `Hapus permanen "${hapus.nama}"?`
              : `Arsipkan "${hapus.nama}"?`
            : ''
        }
        deskripsi="Pemilihan arsip bisa dipulihkan kapan saja."
        lebar="max-w-lg"
        aksi={
          <>
            <Tombol
              varian="sekunder"
              onClick={() => (setHapus(null), setKetikKonfirmasi(''))}
              disabled={memproses}
              className="w-full sm:w-auto"
            >
              Batal
            </Tombol>

            {/* Tombol Arsip hanya muncul bila berasal dari kartu aktif. */}
            {hapus && !hapus.permanenSaja && (
              <Tombol
                onClick={arsipkan}
                memuat={memproses}
                className="w-full sm:w-auto"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="inbox" className="w-4 h-4" />
                  Arsipkan
                </span>
              </Tombol>
            )}
          </>
        }
      >
        {hapus && (
          <div className="space-y-4">
            {!hapus.permanenSaja && (
              <p className="text-[13px] text-[var(--c-text-muted)] flex items-start gap-2">
                <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Pemilihan disembunyikan dari semua daftar, tetapi{' '}
                  <b className="text-[var(--c-text)]">
                    kandidat, peserta, dan seluruh riwayat suara tetap utuh
                  </b>{' '}
                  di database dan bisa dipulihkan dari tab Arsip.
                </span>
              </p>
            )}

            {hapus.permanenSaja && (
              <p className="text-[13px] text-[var(--c-text-muted)] flex items-start gap-2">
                <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5 text-[var(--c-bahaya)]" />
                <span>
                  Menghapus permanen membuang{' '}
                  <b className="text-[var(--c-text)]">seluruh riwayat suara anonim</b> pemilihan ini
                  dari database. Riwayat suara adalah dokumen yang wajib disimpan — pertimbangkan
                  arsip atau backup terlebih dahulu.
                </span>
              </p>
            )}

            <div className="rounded-xl border border-[var(--c-rose-soft)] bg-[var(--c-rose-soft)] p-4">
              <p className="text-[13px] text-[var(--c-text)] mb-2">
                Untuk menghapus permanen, ketik <b>{hapus.nama}</b> dengan tepat:
              </p>
              <Input
                value={ketikKonfirmasi}
                onChange={(e) => setKetikKonfirmasi(e.target.value)}
                placeholder={`Ketik: ${hapus.nama}`}
                aria-label="Konfirmasi hapus permanen"
                disabled={memproses}
                className="mb-2"
              />
              <Tombol
                varian="bahaya"
                ukuran="kecil"
                onClick={hapusPermanen}
                memuat={memproses}
                disabled={ketikKonfirmasi.trim().toLowerCase() !== hapus.nama.toLowerCase()}
                className="w-full"
              >
                Hapus Permanen
              </Tombol>
            </div>
          </div>
        )}
      </Modal>
    </KerangkaAdmin>
  )
}

/* ------------------------------------------------------------------ */
/* Kartu pemilihan                                                     */
/* ------------------------------------------------------------------ */

function KartuPemilihan({
  p,
  onUbah,
  onToggle,
  onHapus,
  onHapusPermanen,
  onPulihkan,
  onKandidat,
  onPeserta,
}) {
  const gaya = GAYA_STATUS[p.keadaan]
  const terarsip = p.keadaan === 'Diarsipkan'

  const persen =
    p.total_peserta > 0 ? Math.round((p.sudah_memilih / p.total_peserta) * 100) : 0

  const sudahSiap = p.jumlah_kandidat > 0

  return (
    <article
      className="kasya-card kasya-kartu-aktif rounded-2xl overflow-hidden
        flex flex-col animate-fade-in"
    >
      {/* Garis warna status — membuat daftar bisa dipindai sekilas
          tanpa harus membaca teks pill-nya satu per satu. */}
      <span aria-hidden="true" className="h-1 w-full shrink-0" style={{ background: gaya.aksen }} />

      <div className="p-5 flex-1 flex flex-col">
        {/* ---------- Kepala ---------- */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-[15px] font-bold text-[var(--c-text)] leading-snug min-w-0">
            <span className="break-words">{p.nama}</span>
          </h3>

          <Lencana
            warna={gaya.warna}
            ikon={
              gaya.denyut ? (
                <>
                  <span className="denyut w-1.5 h-1.5 rounded-full bg-current" />
                  <Icon name={gaya.ikon} className="w-3 h-3" />
                </>
              ) : (
                <Icon name={gaya.ikon} className="w-3 h-3" />
              )
            }
          >
            {p.keadaan}
          </Lencana>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {p.putaran === 2 && <Lencana warna="informasi">Putaran II</Lencana>}
        {terarsip && p.diarsipkan_at && (
          <Lencana warna="netral">Arsip · {p.diarsipkan_at}</Lencana>
        )}
          {p.deskripsi && (
            <span
              className="text-[12px] text-[var(--c-text-muted)] truncate"
              title={p.deskripsi}
            >
              {p.deskripsi}
            </span>
          )}
        </div>

        {/* ---------- Periode ---------- */}
        <div className="flex items-start gap-2.5 text-[12px] text-[var(--c-text-muted)] mb-4">
          <Icon name="calendar" className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {tanggalPendek(p.tanggal_mulai)} {p.jam_mulai} — {tanggalPendek(p.tanggal_selesai)}{' '}
            {p.jam_selesai}
            {keteranganPeriode(p) && (
              <span className="block text-[11px] text-[var(--c-text-subtle)] mt-0.5">
                {keteranganPeriode(p)}
              </span>
            )}
          </span>
        </div>

        {/* ---------- Angka ringkas ---------- */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <AngkaKartu ikon="award" label="Kandidat" nilai={angka(p.jumlah_kandidat)} warna="var(--c-violet)" />
          <AngkaKartu ikon="users" label="Peserta" nilai={angka(p.total_peserta)} warna="var(--c-sky)" />
          <AngkaKartu ikon="bar-chart" label="Suara" nilai={angka(p.total_suara)} warna="var(--c-emerald)" />
          <AngkaKartu ikon="check-circle" label="Sudah" nilai={angka(p.sudah_memilih)} warna="var(--c-primary)" />
        </div>

        {/* ---------- Progres ---------- */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-[12px] text-[var(--c-text-muted)]">
              Partisipasi
              <span className="text-[var(--c-text-subtle)]">
                {' '}
                · {angka(p.sudah_memilih)} dari {angka(p.total_peserta)} peserta
              </span>
            </span>
            <span
              className={`text-[13px] font-bold tabular-nums ${
                p.total_peserta === 0
                  ? 'text-[var(--c-text-subtle)]'
                  : persen >= 80
                    ? 'text-[var(--c-emerald)]'
                    : persen >= 50
                      ? 'text-[var(--c-sky)]'
                      : 'text-[var(--c-amber)]'
              }`}
            >
              {p.total_peserta > 0 ? `${persen}%` : '—'}
            </span>
          </div>

          <BilahProgres
            persen={persen}
            tinggi="h-2"
            warna={persen >= 80 ? 'gradient' : persen >= 50 ? 'sky' : 'peringatan'}
          />
        </div>

        {/* Peringatan yang biasanya terlewat: aktif tapi belum siap. */}
        {!sudahSiap && p.keadaan === 'Berlangsung' && (
          <p className="mt-4 flex items-start gap-2 text-[12px] text-[var(--c-amber)]">
            <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Belum ada kandidat. Pemilih tidak akan punya apa pun untuk dipilih — tambahkan
              kandidat dulu.
            </span>
          </p>
        )}

        {p.total_peserta === 0 && (
          <p className="mt-4 flex items-start gap-2 text-[12px] text-[var(--c-amber)]">
            <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Belum ada peserta terdaftar. Daftarkan pemilih dulu agar mereka bisa memilih.
            </span>
          </p>
        )}

        {/* ---------- Aksi ---------- */}
        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-0.5">
            {terarsip ? (
              <>
                <AksiBaris
                  label={`Pulihkan ${p.nama} dari arsip`}
                  ikon="refresh"
                  warna="sukses"
                  onClick={onPulihkan}
                />
                <AksiBaris
                  label={`Hapus permanen ${p.nama}`}
                  ikon="trash"
                  warna="bahaya"
                  onClick={onHapusPermanen}
                />
              </>
            ) : (
              <>
                <AksiBaris
                  label={`Kelola kandidat ${p.nama}`}
                  ikon="award"
                  onClick={onKandidat}
                />
                <AksiBaris
                  label={`Atur peserta ${p.nama}`}
                  ikon="clipboard-check"
                  onClick={onPeserta}
                />
                <AksiBaris
                  label={p.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                  ikon={p.status === 'aktif' ? 'pause' : 'play'}
                  warna={p.status === 'aktif' ? 'netral' : 'sukses'}
                  onClick={onToggle}
                />
                <AksiBaris label={`Ubah ${p.nama}`} ikon="pencil" onClick={onUbah} />
                <AksiBaris label={`Arsip ${p.nama}`} ikon="trash" warna="bahaya" onClick={onHapus} />
              </>
            )}
          </div>

          {!terarsip && (
            <Link
              to={`/admin/hasil?pemilihan=${p.id}`}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-lg
                bg-[var(--c-bg-page)] border border-[var(--c-border)]
                text-[12px] font-semibold text-[var(--c-text)] whitespace-nowrap
                hover:border-[var(--c-primary)] hover:text-[var(--c-primary)] transition-colors"
            >
              Lihat Hasil
              <Icon name="chevron-right" className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

/** Kotak angka kecil di dalam kartu. */
function AngkaKartu({ ikon, label, nilai, warna }) {
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg-page)] px-3 py-2.5">
      <span className="flex items-center gap-1.5 mb-1">
        <Icon name={ikon} className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--c-text-subtle)] truncate">
          {label}
        </span>
      </span>
      <span className="block text-base font-bold tabular-nums leading-none" style={{ color: warna }}>
        {nilai}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helper status & tanggal                                            */
/* ------------------------------------------------------------------ */

/** Tanggal hari ini sebagai "YYYY-MM-DD" menurut waktu komputer. */
function hariIni() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Keadaan nyata sebuah pemilihan.
 *
 * Kolom `status` di database hanya "aktif / nonaktif", padahal suara hanya
 * benar-benar masuk bila tanggal hari ini berada di dalam rentang. Tanpa
 * pemisahan ini, pemilihan yang sudah lewat tanggal tetap bertuliskan
 * "Aktif" dan admin mengira ada masalah.
 */
function hitungKeadaan(p) {
  if (p.status !== 'aktif') return 'Nonaktif'

  const sekarang = sekarangLokal()
  if (p.tanggal_mulai && sekarang < `${p.tanggal_mulai} ${p.jam_mulai || '00:00'}`) return 'Akan mulai'
  if (p.tanggal_selesai && sekarang > `${p.tanggal_selesai} ${p.jam_selesai || '23:59'}`) return 'Selesai'
  return 'Berlangsung'
}

/** Keterangan relatif yang enak dibaca: "3 hari lagi", "selesai 2 hari lalu". */
function keteranganPeriode(p) {
  const hari = hariIni()
  const sekarang = sekarangLokal()

  if (p.tanggal_mulai && sekarang < `${p.tanggal_mulai} ${p.jam_mulai || '00:00'}`) {
    const n = selisihTanggal(hari, p.tanggal_mulai)
    return n === 0 ? `mulai hari ini pukul ${p.jam_mulai}` : `mulai ${n} hari lagi`
  }

  if (p.tanggal_selesai && sekarang > `${p.tanggal_selesai} ${p.jam_selesai || '23:59'}`) {
    return `selesai ${selisihTanggal(p.tanggal_selesai, hari)} hari lalu`
  }

  if (p.tanggal_selesai) {
    const n = selisihTanggal(hari, p.tanggal_selesai)
    return n === 0 ? `berakhir hari ini pukul ${p.jam_selesai}` : `berakhir ${n} hari lagi`
  }

  return ''
}

/** "YYYY-MM-DD HH:MM" menurut waktu komputer (hanya cadangan; server yang menentukan). */
function sekarangLokal() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${hariIni()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Selisih hari antara dua "YYYY-MM-DD" (absolut). */
function selisihTanggal(dari, ke) {
  const ms = new Date(`${ke}T00:00:00`).getTime() - new Date(`${dari}T00:00:00`).getTime()
  return Math.round(Math.abs(ms) / 86400000)
}

/** Panjang rentang dalam hari (inklusif), buat ringkasan di modal. */
function selisihHari(form) {
  return selisihTanggal(form.tanggal_mulai, form.tanggal_selesai) + 1
}

/* ------------------------------------------------------------------ */
/* Pil status di dalam modal form                                     */
/* ------------------------------------------------------------------ */

function PilStatus({ aktif, onKlik, ikon, judul, keterangan }) {
  return (
    <button
      type="button"
      onClick={onKlik}
      aria-pressed={aktif}
      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
        aktif
          ? 'border-[var(--c-primary)] bg-[var(--c-primary-soft)]'
          : 'border-[var(--c-border)] bg-[var(--c-bg-surface)] hover:border-[var(--c-primary-soft-border)]'
      }`}
    >
      <span
        className={`shrink-0 w-8 h-8 rounded-lg grid place-items-center ${
          aktif
            ? 'bg-[var(--c-primary)] text-white'
            : 'bg-[var(--c-bg-page)] text-[var(--c-text-muted)] border border-[var(--c-border)]'
        }`}
      >
        <Icon name={ikon} className="w-4 h-4" />
      </span>

      <span className="min-w-0">
        <span
          className={`block text-[13px] font-semibold ${
            aktif ? 'text-[var(--c-primary-dark)]' : 'text-[var(--c-text)]'
          }`}
        >
          {judul}
        </span>
        <span className="block text-[11px] text-[var(--c-text-muted)] mt-0.5">{keterangan}</span>
      </span>
    </button>
  )
}