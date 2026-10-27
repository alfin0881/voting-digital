import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from '../../lib/navigasi'
import api from '../../lib/api'
import { petaGalat } from '../../lib/validasi'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import { inisial, nomorUrut } from '../../lib/format'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Kartu, Tombol, Kosong, Panel } from '../../components/UI'
import {
  KepalaHalaman,
  Memuat,
  MemuatRingkas,
  Field,
  Input,
  Textarea,
  Select,
  Cari,
  KonfirmasiHapus,
} from '../../components/AdminUI'

/*
 * Kelola kandidat. Setara dengan App\Livewire\Admin\KelolaKandidat.
 *
 * Dua hal teknis yang harus dijaga di sini:
 * - Foto dikirim sebagai multipart/form-data (ada file), bukan JSON.
 * - Preview foto memakai object URL, jadi URL lama harus di-revoke agar
 *   tidak bocor di memori selama admin mengganti foto berkali-kali.
 *
 * Peningkatan ramah pakai:
 * - Pencarian nama kandidat (dulu tidak ada sama sekali; yang ada hanya
 *   saring menurut pemilihan, padahal nama justru yang dicari).
 * - Impor dari Excel. Endpoint-nya sudah ada di backend
 *   (POST /admin/kandidat/import) tapi belum punya antarmuka — dulu admin
 *   bisa mengunduh template tapi tidak punya cara mengisinya.
 * - Nomor urut duplikat dicek sebelum dikirim, bukan menunggu error 422.
 */

const KOSONG = {
  pemilihan_id: '',
  nama_kandidat: '',
  nomor_urut: '',
  visi: '',
  misi: '',
  foto_lama: null,
}

export default function KelolaKandidat() {
  const navigate = useNavigate()

  // Mendukung deep-link dari halaman lain, mis. tombol "Kelola kandidat"
  // di kartu Kelola Pemilihan yang membuka
  // /admin/kandidat?pemilihan=12 — jadi admin tidak perlu memilih ulang.
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState(() => params.get('pemilihan') ?? '')
  const [cari, setCari] = useState('')

  const { data, memuat, muatUlang } = useAdminPage(
    `/admin/kandidat${filter ? `?pemilihan=${filter}` : ''}`,
    { izin: 'kandidat' },
  )
  const { jalankan, memuat: memproses } = useAksiAdmin()

  const [form, setForm] = useState(null)
  const [hapus, setHapus] = useState(null)
  const [galat, setGalat] = useState({})
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [modalImpor, setModalImpor] = useState(false)
  const refFile = useRef(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    // Revoke supaya tidak ada kebocoran memori saat foto diganti berulang.
    return () => URL.revokeObjectURL(url)
  }, [file])

  const daftarPemilihan = data?.pemilihan ?? []
  const semuaKandidat = data?.kandidat ?? []

  /* Pencarian nama + pengurutan nomor urut, di sisi browser. */
  const kandidat = useMemo(() => {
    const kata = cari.trim().toLowerCase()

    return semuaKandidat
      .filter((k) => (kata ? k.nama_kandidat.toLowerCase().includes(kata) : true))
      .sort((a, b) => Number(a.nomor_urut) - Number(b.nomor_urut))
  }, [semuaKandidat, cari])

  /* Nomor urut yang sudah dipakai pada pemilihan yang sedang diedit.
     Dipakai untuk pesan duplikat sebelum request dikirim.

     Disimpan sebagai ANGKA, bukan string: kolomnya bertipe string dan data
     lama bisa berisi "1" maupun "01". Kalau dibandingkan sebagai string,
     kandidat bernomor "01" tidak akan terdeteksi duplikat saat admin mengetik
     1 di form. */
  const nomorTerpakai = useMemo(() => {
    const set = new Set()

    for (const k of semuaKandidat) {
      if (k.pemilihan_id !== form?.pemilihan_id) continue
      if (form?.id && k.id === form.id) continue
      set.add(parseInt(k.nomor_urut, 10))
    }

    return set
  }, [semuaKandidat, form])

  const ubahFilter = (nilai) => {
    setFilter(nilai)
    // URL ikut diperbarui supaya tautan halaman bisa dibagikan/di-bookmark.
    if (nilai) setParams({ pemilihan: nilai }, { replace: true })
    else setParams({}, { replace: true })
  }

  const bersihkanForm = () => {
    setGalat({})
    setFile(null)
    setPreview(null)
    if (refFile.current) refFile.current.value = ''
  }

  const bukaTambah = () => {
    bersihkanForm()
    setForm({ ...KOSONG, pemilihan_id: filter || daftarPemilihan[0]?.id || '' })
  }

  const bukaEdit = (k) => {
    bersihkanForm()
    setForm({
      id: k.id,
      pemilihan_id: k.pemilihan_id,
      nama_kandidat: k.nama_kandidat,
      nomor_urut: k.nomor_urut,
      visi: k.visi || '',
      misi: k.misi || '',
      foto_lama: k.foto_url,
    })
  }

  const ubah = (kunci, nilai) => setForm((f) => ({ ...f, [kunci]: nilai }))

  /* Cek duplikat nomor urut sebelum menyentuh server. */
  const galatDuplikat = useMemo(() => {
    if (!form?.nomor_urut || !form?.pemilihan_id) return null
    return nomorTerpakai.has(parseInt(form.nomor_urut, 10))
      ? 'Nomor urut ini sudah dipakai kandidat lain pada pemilihan yang sama.'
      : null
  }, [form, nomorTerpakai])

  const simpan = async () => {
    setGalat({})

    if (galatDuplikat) {
      setGalat({ nomor_urut: galatDuplikat })
      return
    }

    // Multipart wajib karena ada file; jangan pakai JSON.
    const body = new FormData()
    body.append('pemilihan_id', form.pemilihan_id)
    body.append('nama_kandidat', form.nama_kandidat)
    body.append('nomor_urut', form.nomor_urut)
    body.append('visi', form.visi ?? '')
    body.append('misi', form.misi ?? '')
    if (file) body.append('foto', file)

    try {
      await jalankan(
        () =>
          form.id ? api.put(`/admin/kandidat/${form.id}`, body) : api.post('/admin/kandidat', body),
        { sukses: form.id ? 'Kandidat berhasil diperbarui.' : 'Kandidat berhasil ditambahkan.' },
      )
      setForm(null)
      muatUlang()
    } catch (e) {
      setGalat(petaGalat(e))
    }
  }

  const konfirmasiHapus = async () => {
    if (!hapus) return
    try {
      await jalankan(() => api.delete(`/admin/kandidat/${hapus.id}`), {
        sukses: 'Kandidat berhasil dihapus.',
      })
      setHapus(null)
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  const terpilih = daftarPemilihan.find((p) => String(p.id) === String(filter))

  return (
    <KerangkaAdmin judul="Kelola Kandidat">
      <KepalaHalaman
        aksi={
          <>
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" />
              Muat Ulang
            </Tombol>
            <Tombol href="/unduh/kandidat/template" varian="sekunder" ukuran="kecil">
              <Icon name="download" className="w-4 h-4" />
              Template
            </Tombol>
            <Tombol
              varian="sekunder"
              ukuran="kecil"
              onClick={() => setModalImpor(true)}
              disabled={daftarPemilihan.length === 0}
            >
              <Icon name="clipboard-check" className="w-4 h-4" />
              Impor Excel
            </Tombol>
            <Tombol onClick={bukaTambah} disabled={daftarPemilihan.length === 0}>
              <Icon name="plus" className="w-4 h-4" />
              Tambah Kandidat
            </Tombol>
          </>
        }
      >
        <div>
          <h2 className="text-[15px] font-bold text-[var(--c-text)]">Daftar Kandidat</h2>
          <p className="text-sm text-[var(--c-text-muted)] mt-0.5 h-6 flex items-center">
            {memuat ? (
              <MemuatRingkas lebar="w-52" />
            ) : terpilih ? (
              `${semuaKandidat.length} kandidat di ${terpilih.nama}`
            ) : (
              `${semuaKandidat.length} kandidat dari ${daftarPemilihan.length} pemilihan`
            )}
          </p>
        </div>
      </KepalaHalaman>

      {memuat && !data && <Memuat kartu />}

      {/* Belum ada pemilihan sama sekali — tidak ada yang bisa diisi. */}
      {daftarPemilihan.length === 0 && !memuat && (
        <Kosong
          ikon={<Icon name="award" className="w-12 h-12" />}
          judul="Belum Ada Pemilihan"
          deskripsi="Kandidat selalu menempel pada sebuah pemilihan. Buat pemilihan dulu, baru isi daftar kandidatnya."
          aksi={
            <Tombol onClick={() => navigate('/admin/pemilihan')}>
              <Icon name="file-text" className="w-4 h-4" />
              Buat Pemilihan
            </Tombol>
          }
        />
      )}

      {daftarPemilihan.length > 0 && (
        <>
          {/* ---------- FILTER ---------- */}
          <div className="kasya-card p-5">
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="md:w-72">
                <Field label="Cari nama kandidat">
                  <Cari
                    value={cari}
                    onChange={(e) => setCari(e.target.value)}
                    placeholder="Ketik nama kandidat…"
                    aria-label="Cari nama kandidat"
                  />
                </Field>
              </div>

              <div className="md:w-72">
                <Field label="Saring menurut pemilihan">
                  <Select
                    value={filter}
                    onChange={(e) => ubahFilter(e.target.value)}
                    aria-label="Saring menurut pemilihan"
                  >
                    <option value="">Semua pemilihan</option>
                    {daftarPemilihan.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nama}
                        {p.status === 'aktif' ? ' (aktif)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {(cari.trim() || filter) && (
                <Tombol
                  varian="sekunder"
                  onClick={() => {
                    setCari('')
                    ubahFilter('')
                  }}
                >
                  <Icon name="refresh" className="w-4 h-4" />
                  Reset
                </Tombol>
              )}
            </div>
          </div>

          {kandidat.length === 0 ? (
            <Panel judul="Tidak ada kandidat" ikon={<Icon name="search" className="w-4 h-4" />}>
              <p className="text-[13px] text-[var(--c-text-muted)] mb-4">
                {semuaKandidat.length === 0
                  ? 'Belum ada kandidat. Tambahkan satu per satu, atau impor banyak sekaligus dari Excel.'
                  : 'Tidak ada kandidat yang cocok dengan pencarian ini.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Tombol onClick={bukaTambah}>
                  <Icon name="plus" className="w-4 h-4" />
                  Tambah Kandidat
                </Tombol>
                <Tombol varian="sekunder" onClick={() => setModalImpor(true)}>
                  <Icon name="clipboard-check" className="w-4 h-4" />
                  Impor dari Excel
                </Tombol>
              </div>
            </Panel>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {kandidat.map((k) => (
                <KartuKandidat
                  key={k.id}
                  k={k}
                  onUbah={() => bukaEdit(k)}
                  onHapus={() =>
                    setHapus({
                      id: k.id,
                      pesan: `Kandidat "${k.nama_kandidat}" akan dihapus permanen. Kandidat yang sudah menerima suara tidak bisa dihapus agar rekap hasil tidak berubah.`,
                    })
                  }
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
        judul={form?.id ? 'Ubah Kandidat' : 'Tambah Kandidat'}
        lebar="max-w-2xl"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Pemilihan" wajib galat={galat.pemilihan_id}>
                <Select
                  value={form.pemilihan_id}
                  onChange={(e) => ubah('pemilihan_id', e.target.value)}
                >
                  <option value="">-- Pilih --</option>
                  {daftarPemilihan.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Nomor Urut"
                wajib
                galat={galat.nomor_urut ?? galatDuplikat}
                bantuan={
                  form.nomor_urut
                    ? `Ditampilkan sebagai No. ${nomorUrut(form.nomor_urut)}`
                    : 'Urutan tampil di layar pemilih.'
                }
              >
                <Input
                  type="number"
                  min="1"
                  value={form.nomor_urut}
                  onChange={(e) => ubah('nomor_urut', e.target.value)}
                />
              </Field>
            </div>

            <Field label="Nama Kandidat" wajib galat={galat.nama_kandidat}>
              <Input
                value={form.nama_kandidat}
                onChange={(e) => ubah('nama_kandidat', e.target.value)}
                placeholder="Nama lengkap kandidat"
              />
            </Field>

            <Field
              label="Foto"
              galat={galat.foto}
              bantuan="JPG/PNG, maksimal 2MB. Dikosongkan berarti foto lama tetap dipakai."
            >
              <div className="flex flex-wrap items-center gap-4">
                {(preview || form.foto_lama) && (
                  <img
                    src={preview || form.foto_lama}
                    alt="Preview"
                    className="w-20 h-20 object-cover rounded-xl border border-[var(--c-border)] shrink-0"
                  />
                )}

                <input
                  ref={refFile}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="flex-1 min-w-[12rem] text-sm text-[var(--c-text-muted)] file:mr-3
                    file:py-2.5 file:px-4 file:rounded-xl file:border-0
                    file:bg-[var(--c-primary-soft)] file:text-[var(--c-primary-dark)]
                    file:font-bold file:cursor-pointer hover:file:bg-[var(--c-primary-soft)]"
                />
              </div>

              {(preview || form.foto_lama) && (
                <span className="block mt-1.5 text-[11px] text-[var(--c-text-subtle]">
                  {preview ? 'Foto baru — akan dipakai saat disimpan' : 'Foto saat ini'}
                </span>
              )}
            </Field>

            <Field
              label="Visi"
              galat={galat.visi}
              bantuan="Tampil di halaman pemilih. Singkat dan jelas lebih baik."
            >
              <Textarea
                rows={2}
                value={form.visi}
                onChange={(e) => ubah('visi', e.target.value)}
                placeholder="Visi singkat kandidat"
              />
            </Field>

            <Field
              label="Misi"
              galat={galat.misi}
              bantuan="Satu baris per misi (tekan Enter untuk baris baru)."
            >
              <Textarea
                rows={5}
                value={form.misi}
                onChange={(e) => ubah('misi', e.target.value)}
                placeholder={'Memperbaiki ruang kelas\nMenambah sarana belajar'}
              />

              <span className="mt-1.5 block text-[11px] text-[var(--c-text-muted)] tabular-nums">
                {hitungBaris(form.misi)} misi terdaftar
              </span>
            </Field>
          </div>
        )}
      </Modal>

      {/* ---------- MODAL IMPOR ---------- */}
      <ModalImpor
        buka={modalImpor}
        onTutup={() => setModalImpor(false)}
        onSukses={() => {
          setModalImpor(false)
          muatUlang()
        }}
        daftarPemilihan={daftarPemilihan}
        terpilih={filter || daftarPemilihan[0]?.id || ''}
      />

      <KonfirmasiHapus
        buka={!!hapus}
        onTutup={() => setHapus(null)}
        onYa={konfirmasiHapus}
        judul="Hapus kandidat?"
        pesan={hapus?.pesan}
        memuat={memproses}
      />
    </KerangkaAdmin>
  )
}

/* ------------------------------------------------------------------ */
/* Kartu kandidat                                                      */
/* ------------------------------------------------------------------ */

function KartuKandidat({ k, onUbah, onHapus }) {
  const misi = hitungBaris(k.misi)
  const belumLengkap = !k.visi || !k.misi

  return (
    <Kartu className="overflow-hidden kasya-card-hover animate-fade-in flex flex-col">
      {/* ---------- Foto ---------- */}
      <div className="relative aspect-[4/3] bg-[var(--c-primary-soft)] grid place-items-center">
        {k.foto_url ? (
          <img
            src={k.foto_url}
            alt={k.nama_kandidat}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <span className="text-5xl font-extrabold text-[var(--c-primary-dark)]">
            {inisial(k.nama_kandidat)}
          </span>
        )}

        {/* Nomor urut sebagai lencana di atas foto. */}
        <span
          className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1
            rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-bold"
        >
          No. {nomorUrut(k.nomor_urut)}
        </span>

        {!k.foto_url && (
          <span className="absolute bottom-3 left-3 text-[10px] text-[var(--c-primary-dark)] font-semibold bg-[var(--c-bg-surface)]/80 rounded px-1.5 py-0.5">
            Belum ada foto
          </span>
        )}
      </div>

      {/* ---------- Isi ---------- */}
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="font-bold text-[var(--c-text)] leading-snug break-words">
          {k.nama_kandidat}
        </h3>
        <p className="text-[11px] text-[var(--c-text-muted)] truncate mt-0.5">
          {k.pemilihan_nama}
        </p>

        {belumLengkap && (
          <p className="mt-2 text-[11px] text-[var(--c-amber)] flex items-start gap-1.5">
            <Icon name="info" className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              {!k.visi && !k.misi
                ? 'Visi dan misi belum diisi — pemilih akan melihat halaman kosong.'
                : !k.visi
                  ? 'Visi belum diisi.'
                  : 'Misi belum diisi.'}
            </span>
          </p>
        )}

        <div className="mt-3 space-y-3">
          <Bagian
            label="Visi"
            isi={k.visi}
            kosong="Belum diisi visi."
          />

          <Bagian
            label={`Misi${misi > 0 ? ` · ${misi}` : ''}`}
            isi={k.misi}
            kosong="Belum diisi misi."
            daftar
          />
        </div>

        {/* ---------- Aksi ---------- */}
        <div className="mt-auto pt-4 flex items-center gap-2">
          <Tombol varian="sekunder" ukuran="kecil" className="flex-1" onClick={onUbah}>
            <Icon name="pencil" className="w-3.5 h-3.5" />
            Ubah
          </Tombol>
          <Tombol varian="bahaya" ukuran="kecil" onClick={onHapus}>
            <Icon name="trash" className="w-3.5 h-3.5" />
            Hapus
          </Tombol>
        </div>
      </div>
    </Kartu>
  )
}

/** Blok label + isi (bisa berupa daftar baris untuk misi). */
function Bagian({ label, isi, kosong, daftar = false }) {
  const baris = daftar ? String(isi ?? '').split('\n').filter((b) => b.trim()) : []

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--c-text-subtle)] mb-1">
        {label}
      </p>

      {!isi ? (
        <p className="text-[12px] text-[var(--c-text-subtle)] italic">{kosong}</p>
      ) : daftar ? (
        <ul className="space-y-1">
          {baris.map((b, i) => (
            <li key={i} className="text-[12px] text-[var(--c-text-muted)] flex gap-1.5">
              <span className="text-[var(--c-primary)] shrink-0">•</span>
              <span className="min-w-0">{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-[var(--c-text-muted)]">{isi}</p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modal impor Excel                                                   */
/* ------------------------------------------------------------------ */

function ModalImpor({ buka, onTutup, onSukses, daftarPemilihan, terpilih }) {
  // Punya useAksiAdmin sendiri supaya tombol "Mulai Impor" punya status
  // memuatnya sendiri tanpa harus meneruskan state dari halaman induk.
  const { jalankan, memuat } = useAksiAdmin()

  const [pemilihanId, setPemilihanId] = useState(terpilih)
  const [file, setFile] = useState(null)
  const [galat, setGalat] = useState(null)

  /* Ikuti pilihan di halaman induk selama modal belum dipakai. */
  useEffect(() => {
    if (buka) setPemilihanId(terpilih)
  }, [buka, terpilih])

  const proses = async () => {
    if (!pemilihanId) {
      setGalat('Pilih pemilihan tujuan terlebih dahulu.')
      return
    }

    if (!file) {
      setGalat('Pilih file Excel terlebih dahulu.')
      return
    }

    setGalat(null)

    const body = new FormData()
    body.append('pemilihan_id', pemilihanId)
    body.append('file', file)

    try {
      await jalankan(() => api.post('/admin/kandidat/import', body))
      setFile(null)
      onSukses()
    } catch (e) {
      setGalat(e?.response?.data?.pesan || 'Gagal mengimpor file.')
    }
  }

  return (
    <Modal
      buka={buka}
      onTutup={memuat ? () => {} : onTutup}
      judul="Impor Kandidat dari Excel"
      deskripsi="Menambahkan banyak kandidat sekaligus ke satu pemilihan."
      aksi={
        <>
          <Tombol varian="sekunder" onClick={onTutup} disabled={memuat} className="w-full sm:w-auto">
            Batal
          </Tombol>
          <Tombol onClick={proses} memuat={memuat} className="w-full sm:w-auto">
            <Icon name="clipboard-check" className="w-4 h-4" />
            Mulai Impor
          </Tombol>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--c-text-muted)] flex items-start gap-2">
          <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5 text-[var(--c-primary-dark)]" />
          <span>
            Gunakan template resmi agar kolom terbaca benar.{' '}
            <a href="/unduh/kandidat/template" className="underline font-semibold">
              Unduh template
            </a>
            .
          </span>
        </p>

        <Field label="Masuk ke pemilihan" wajib>
          <Select value={pemilihanId} onChange={(e) => setPemilihanId(e.target.value)}>
            <option value="">-- Pilih --</option>
            {daftarPemilihan.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="File Excel" wajib galat={galat}>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-[var(--c-text-muted)] file:mr-3 file:py-2.5
              file:px-4 file:rounded-xl file:border-0 file:bg-[var(--c-primary-soft)]
              file:text-[var(--c-primary-dark)] file:font-bold file:cursor-pointer
              hover:file:bg-[var(--c-primary-soft)]"
          />
        </Field>

        <p className="text-[12px] text-[var(--c-text-muted)]">
          Format .xlsx, .xls, atau .csv · maksimal 4MB. Nomor urut yang sudah ada pada pemilihan
          tujuan akan dilewati.
        </p>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

/** Jumlah baris misi yang tidak kosong (untuk penghitung di modal). */
function hitungBaris(misi) {
  return String(misi ?? '')
    .split('\n')
    .filter((b) => b.trim()).length
}