import { useMemo, useState } from 'react'
import { Link } from '../../lib/navigasi'
import api from '../../lib/api'
import { petaGalat } from '../../lib/validasi'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Kartu, Lencana, Tombol, Kosong, Peringatan } from '../../components/UI'
import {
  KepalaHalaman,
  Memuat,
  Tabel,
  Baris,
  Sel,
  Field,
  Input,
  Cari,
  AksiBaris,
  KonfirmasiHapus,
} from '../../components/AdminUI'

/*
 * Kelola Kelas.
 *
 * Kelas adalah daftar nama yang dipakai ulang oleh pemilih. Karena itu
 * halaman ini menekankan dua hal:
 *
 * 1. Nama selalu dirapikan (spasi tepi/ganda) dan dicek tanpa membedakan
 *    huruf besar/kecil. "XII RPL 1" dan "xii rpl 1" tidak boleh jadi dua
 *    kelas yang berbeda.
 * 2. Setiap perubahan langsung terlihat akibatnya: jumlah anggota ikut
 *    dipindahkan saat nama diubah, dan anggota menjadi "tanpa kelas" saat
 *    kelas dihapus.
 */

/** Rapikan nama seperti aturan server (spasi tunggal, tanpa spasi tepi). */
const rapikan = (nilai) => String(nilai ?? '').replace(/\s+/g, ' ').trim()

/** Kunci pembanding nama tanpa huruf besar/kecil. */
const kunciNama = (nilai) => rapikan(nilai).toLocaleLowerCase('id-ID')

export default function KelolaKelas() {
  const { jalankan, memuat: memproses } = useAksiAdmin()

  const { data, memuat, muatUlang } = useAdminPage('/admin/kelas', { izin: 'anggota' })

  const daftar = useMemo(() => data?.kelas ?? [], [data])
  const tanpaKelas = data?.tanpa_kelas ?? 0

  const [tambah, setTambah] = useState('')
  const [galatTambah, setGalatTambah] = useState({})
  const [bukaTambah, setBukaTambah] = useState(false)
  const [cari, setCari] = useState('')
  const [edit, setEdit] = useState(null)
  const [galatEdit, setGalatEdit] = useState({})
  const [hapus, setHapus] = useState(null)

  const tersaring = useMemo(() => {
    const kata = cari.trim().toLowerCase()

    return kata
      ? daftar.filter((k) => k.nama.toLowerCase().includes(kata))
      : daftar
  }, [daftar, cari])

  const duplikat = (nama, kecualiId = null) =>
    daftar.find((k) => k.id !== kecualiId && kunciNama(k.nama) === kunciNama(nama))

  const tambahKelas = async () => {
    const nama = rapikan(tambah)

    if (!nama) {
      setGalatTambah({ nama: 'Nama kelas wajib diisi.' })
      return
    }

    const sudahAda = duplikat(nama)

    if (sudahAda) {
      setGalatTambah({ nama: `Kelas "${sudahAda.nama}" sudah terdaftar.` })
      return
    }

    setGalatTambah({})

    try {
      await jalankan(() => api.post('/admin/kelas', { nama }), {
        sukses: `Kelas "${nama}" ditambahkan.`,
      })
      setTambah('')
      setBukaTambah(false)
      muatUlang()
    } catch (e) {
      setGalatTambah(petaGalat(e))
    }
  }

  const bukaModalTambah = () => {
    setGalatTambah({})
    setTambah('')
    setBukaTambah(true)
  }

  const bukaEdit = (k) => {
    setGalatEdit({})
    setEdit({ id: k.id, dari: k.nama, ke: k.nama, jumlah: k.jumlah })
  }

  const simpanEdit = async () => {
    if (!edit) return

    const baru = rapikan(edit.ke)

    if (!baru) {
      setGalatEdit({ nama: 'Nama kelas wajib diisi.' })
      return
    }

    if (baru === edit.dari) {
      setEdit(null)
      return
    }

    const sudahAda = duplikat(baru, edit.id)

    // Bila nama sudah dipakai kelas lain, server akan MENGGABUNGKAN kedua
    // kelas. Itu tindakan besar, jadi minta konfirmasi dulu di dalam modal.
    if (sudahAda && !edit.gabung) {
      setGalatEdit({
        nama: `Kelas "${sudahAda.nama}" sudah ada. Simpan sekali lagi untuk menggabungkan kedua kelas.`,
      })
      setEdit((s) => ({ ...s, gabung: true }))
      return
    }

    setGalatEdit({})

    try {
      await jalankan(() => api.put(`/admin/kelas/${edit.id}`, { nama: baru }))
      setEdit(null)
      muatUlang()
    } catch (e) {
      setGalatEdit(petaGalat(e))
      setEdit((s) => (s ? { ...s, gabung: false } : s))
    }
  }

  const konfirmasiHapus = async () => {
    if (!hapus) return

    try {
      await jalankan(() => api.delete(`/admin/kelas/${hapus.id}`))
      setHapus(null)
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  return (
    <KerangkaAdmin judul="Kelola Kelas">
      <KepalaHalaman
        aksi={
          <>
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" />
              Muat Ulang
            </Tombol>
            <Tombol onClick={bukaModalTambah} className="w-full sm:w-auto">
              <Icon name="plus" className="w-4 h-4" />
              Tambah Kelas
            </Tombol>
          </>
        }
      >
        <div>
          <h2 className="text-[15px] font-bold text-[var(--c-text)]">Daftar Kelas</h2>
          <p className="text-sm text-[var(--c-text-muted)] mt-0.5 h-6 flex items-center">
            {memuat
              ? 'Memuat…'
              : `${daftar.length} kelas · ${tanpaKelas} pemilih tanpa kelas`}
          </p>
        </div>
      </KepalaHalaman>

      {tanpaKelas > 0 && (
        <Peringatan warna="peringatan" ikon={<Icon name="warning" className="w-5 h-5" />}>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <b>{tanpaKelas} pemilih</b> belum punya kelas. Mereka tetap bisa memilih, tetapi
              tidak ikut terhitung di rekap per kelas.
            </span>
            <Link
              to="/admin/anggota?filter_kelas=__tanpa__"
              className="font-semibold underline underline-offset-2 hover:text-[var(--c-text)]"
            >
              Lihat pemilih tanpa kelas
            </Link>
          </span>
        </Peringatan>
      )}

      <Kartu className="overflow-hidden">
        {memuat && !data ? (
          <Memuat tinggi="h-72" />
        ) : daftar.length === 0 ? (
          <Kosong
            ikon={<Icon name="users" className="w-12 h-12" />}
            judul="Belum Ada Kelas"
            deskripsi="Gunakan tombol 'Tambah Kelas' di kanan atas. Kelas juga bisa muncul otomatis saat pemilih diimpor dengan kolom kelas."
          />
        ) : (
          <>
            {daftar.length > 6 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--c-border)]">
                <Cari
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Cari kelas…"
                  aria-label="Cari kelas"
                  className="sm:w-72"
                />
                <span className="text-xs text-[var(--c-text-muted)] tabular-nums">
                  {tersaring.length} dari {daftar.length} kelas
                </span>
              </div>
            )}

            {tersaring.length === 0 ? (
              <Kosong
                ikon={<Icon name="search" className="w-12 h-12" />}
                judul="Kelas Tidak Ditemukan"
                deskripsi="Tidak ada kelas yang cocok dengan kata kunci."
                aksi={
                  <Tombol varian="sekunder" onClick={() => setCari('')}>
                    Hapus pencarian
                  </Tombol>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Tabel kolom={['Kelas', 'Jumlah Anggota', 'Aksi']}>
                  {tersaring.map((k) => (
                    <Baris key={k.id}>
                      <Sel className="font-semibold">
                        <span className="inline-flex items-center gap-2">
                          {k.nama}
                          {k.jumlah === 0 && <Lencana warna="netral">kosong</Lencana>}
                        </span>
                      </Sel>

                      <Sel>
                        {k.jumlah > 0 ? (
                          <Link
                            to={`/admin/anggota?filter_kelas=${encodeURIComponent(k.nama)}`}
                            className="inline-flex items-center gap-1.5 text-[var(--c-primary)]
                              font-semibold tabular-nums hover:underline underline-offset-2"
                            title={`Lihat ${k.jumlah} anggota kelas ${k.nama}`}
                          >
                            <Icon name="users" className="w-4 h-4" />
                            {k.jumlah} anggota
                            <Icon name="chevron-right" className="w-3.5 h-3.5" />
                          </Link>
                        ) : (
                          <span className="text-[var(--c-text-muted)] tabular-nums">0 anggota</span>
                        )}
                      </Sel>

                      <Sel>
                        <div className="flex items-center gap-0.5">
                          <AksiBaris label={`Ubah nama kelas ${k.nama}`} ikon="pencil" onClick={() => bukaEdit(k)} />
                          <AksiBaris
                            label={`Hapus ${k.nama}`}
                            ikon="trash"
                            warna="bahaya"
                            onClick={() => setHapus(k)}
                          />
                        </div>
                      </Sel>
                    </Baris>
                  ))}
                </Tabel>
              </div>
            )}
          </>
        )}
      </Kartu>

      {/* ---------- MODAL UBAH NAMA ---------- */}
      <Modal
        buka={!!edit}
        onTutup={() => !memproses && setEdit(null)}
        judul="Ubah Nama Kelas"
        deskripsi={edit ? `${edit.jumlah} anggota terdaftar di kelas ini.` : ''}
        aksi={
          <>
            <Tombol
              varian="sekunder"
              onClick={() => setEdit(null)}
              disabled={memproses}
              className="w-full sm:w-auto"
            >
              Batal
            </Tombol>
            <Tombol onClick={simpanEdit} memuat={memproses} className="w-full sm:w-auto">
              {edit?.gabung ? 'Gabungkan Kelas' : 'Simpan'}
            </Tombol>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <Field label="Nama lama">
              <Input value={edit.dari} disabled />
            </Field>

            <Field label="Nama baru" wajib galat={galatEdit.nama}>
              <Input
                value={edit.ke}
                onChange={(e) => {
                  setEdit((s) => ({ ...s, ke: e.target.value, gabung: false }))
                  if (galatEdit.nama) setGalatEdit({})
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') simpanEdit()
                }}
                placeholder="Nama kelas baru"
                maxLength={50}
                autoFocus
              />
            </Field>

            {edit.gabung && (
              <Peringatan warna="peringatan" ikon={<Icon name="warning" className="w-5 h-5" />}>
                Nama ini sudah dipakai kelas lain. Menyimpan akan menggabungkan kedua kelas dan
                memindahkan <b>semua anggotanya</b>. Tindakan ini tidak bisa dibatalkan.
              </Peringatan>
            )}

            {edit.jumlah > 0 && !edit.gabung && (
              <p className="text-[12px] text-[var(--c-text-muted)] flex items-start gap-2">
                <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <b className="text-[var(--c-text)]">{edit.jumlah} anggota</b> akan ikut
                  dipindahkan ke nama baru.
                </span>
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ---------- MODAL TAMBAH KELAS ---------- */}
      <Modal
        buka={bukaTambah}
        onTutup={() => !memproses && setBukaTambah(false)}
        judul="Tambah Kelas"
        deskripsi="Nama kelas otomatis dirapikan (spasi berlebih dibuang) dan tidak boleh sama."
        aksi={
          <>
            <Tombol
              varian="sekunder"
              onClick={() => setBukaTambah(false)}
              disabled={memproses}
              className="w-full sm:w-auto"
            >
              Batal
            </Tombol>
            <Tombol onClick={tambahKelas} memuat={memproses} className="w-full sm:w-auto">
              <Icon name="plus" className="w-4 h-4" />
              Tambah
            </Tombol>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nama kelas" wajib galat={galatTambah.nama}>
            <Input
              value={tambah}
              onChange={(e) => {
                setTambah(e.target.value)
                if (galatTambah.nama) setGalatTambah({})
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') tambahKelas()
              }}
              placeholder="Contoh: XII RPL 1"
              maxLength={50}
              autoFocus
            />
          </Field>
        </div>
      </Modal>

      {/* ---------- KONFIRMASI HAPUS ---------- */}
      <KonfirmasiHapus
        buka={!!hapus}
        onTutup={() => !memproses && setHapus(null)}
        onYa={konfirmasiHapus}
        judul="Hapus kelas?"
        pesan={
          hapus && (
            <>
              <p>
                Kelas <b className="text-[var(--c-text)]">{hapus.nama}</b> akan dihapus.
              </p>
              <p className="mt-2">
                {hapus.jumlah > 0 ? (
                  <>
                    <b className="text-[var(--c-text)]">{hapus.jumlah} anggota</b> kelas ini akan
                    menjadi <b>tanpa kelas</b>. Data pemilih dan hak pilihnya tidak berubah.
                  </>
                ) : (
                  'Kelas ini belum punya anggota.'
                )}{' '}
                Tindakan ini tidak dapat dibatalkan.
              </p>
            </>
          )
        }
        memuat={memproses}
      />
    </KerangkaAdmin>
  )
}
