import { useEffect, useState } from 'react'
import api from '../../lib/api'
import { useSearchParams } from '../../lib/navigasi'
import { petaGalat } from '../../lib/validasi'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import { useApp } from '../../context/AppContext'
import { angka, inisial } from '../../lib/format'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Kartu, Lencana, Tombol, Kosong, Peringatan, Spinner } from '../../components/UI'
import {
  KepalaHalaman,
  Memuat,
  MemuatRingkas,
  Tabel,
  Baris,
  Sel,
  Field,
  Input,
  Select,
  Paginasi,
  KonfirmasiHapus,
  BarisProgres,
  TombolSalin,
  AksiBaris,
  KerangkaUi,
} from '../../components/AdminUI'

/*
 * Kelola pemilih. Setara dengan App\Livewire\Admin\KelolaAnggota.
 *
 * Ini halaman paling padat di panel: filter + sortir + paginasi, CRUD,
 * acak password (satu / massal), pendaftaran peserta, detail vote,
 * tandai tidak hadir, dan impor Excel.
 *
 * Catatan penting soal kode kartu:
 * Password login disimpan sebagai HASH, sedangkan kode asli untuk kartu disimpan
 * terpisah dan TERENKRIPSI di server. Kode tidak ikut dikirim bersama data
 * pemilih; hanya admin berizin 'kode_kartu' yang bisa membukanya satu per satu
 * (tombol "Tampilkan kode"), dan setiap pembukaan masuk audit log. Kode yang
 * tampil di layar sebaiknya dipakai sebentar lalu ditutup — jangan difoto.
 */

const PER_PAGE = 25

const KOSONG = { nama: '', nis: '', kelas: '', kelas_baru: '', password: '' }

/** Rapikan nama kelas sama seperti aturan server. */
const rapikanKelas = (nilai) => String(nilai ?? '').replace(/\s+/g, ' ').trim()

export default function KelolaAnggota() {
  const { notifikasi, sesi } = useApp()
  // Izin khusus: cetak kartu, lihat kode, acak password (lihat config/peran_admin.php).
  const bisaKode = Array.isArray(sesi?.izin) && sesi.izin.includes('kode_kartu')
  const { jalankan, memuat: memproses } = useAksiAdmin()

  // Filter bisa datang dari tautan halaman lain, mis.
  // /admin/anggota?filter_kelas=XII+RPL+1 (dari Kelola Kelas) atau
  // /admin/anggota?filter_pemilihan=3 (dari kartu Kelola Pemilihan).
  const [paramsAwal] = useSearchParams()

  // Filter & paginasi (di-debounce agar tidak request tiap ketikan).
  const [search, setSearch] = useState(() => paramsAwal.get('search') ?? '')
  const [cariTunda, setCariTunda] = useState(() => paramsAwal.get('search') ?? '')
  const [kelas, setKelas] = useState(() => paramsAwal.get('filter_kelas') ?? '')
  const [pemilihan, setPemilihan] = useState(() => paramsAwal.get('filter_pemilihan') ?? '')
  const [status, setStatus] = useState(() => paramsAwal.get('filter_status') ?? '')
  const [sort, setSort] = useState(() => paramsAwal.get('sort') ?? 'nama')
  const [direction, setDirection] = useState(() =>
    paramsAwal.get('direction') === 'desc' ? 'desc' : 'asc',
  )
  const [page, setPage] = useState(() => Math.max(1, Number(paramsAwal.get('page')) || 1))
  const [terpilih, setTerpilih] = useState([])

  useEffect(() => {
    const timer = setTimeout(() => {
      setCariTunda(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const kueri = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) })
  if (cariTunda) kueri.set('search', cariTunda)
  if (kelas) kueri.set('filter_kelas', kelas)
  if (pemilihan) kueri.set('filter_pemilihan', pemilihan)
  if (status) kueri.set('filter_status', status)
  kueri.set('sort', sort)
  kueri.set('direction', direction)

  const { data, memuat, muatUlang } = useAdminPage(`/admin/anggota?${kueri}`, { izin: 'anggota' })

  const [form, setForm] = useState(null)
  const [hapus, setHapus] = useState(null)
  const [galat, setGalat] = useState({})
  const [modalImport, setModalImport] = useState(false)
  const [hasilAcak, setHasilAcak] = useState(null)
  const [peserta, setPeserta] = useState(null)
  const [detail, setDetail] = useState(null)
  const [identitas, setIdentitas] = useState(null)
  const [modalReset, setModalReset] = useState(false)

  const anggota = data?.anggota ?? []
  const daftarKelas = data?.filter?.kelas ?? []
  const daftarPemilihan = data?.filter?.rekap ?? []
  const pemilihanTerpilih = daftarPemilihan.find((p) => String(p.id) === String(pemilihan))
  

  /* ------------------------------------------------------------------ */
  /* CRUD                                                                */
  /* ------------------------------------------------------------------ */

  const bukaTambah = () => {
    setGalat({})
    setForm({ ...KOSONG })
  }

  const bukaEdit = async (u) => {
    setGalat({})
    try {
      // Kode kartu TIDAK pernah ikut dikirim; kolom kode dikosongkan dan
      // hanya diisi bila panitia ingin menggantinya.
      const detailRes = await api.get(`/admin/anggota/${u.id}`)
      setForm({
        id: u.id,
        nama: detailRes.data.nama,
        nis: detailRes.data.nis,
        kelas: detailRes.data.kelas || '',
        kelas_baru: '',
        password: '',
        punya_kode: detailRes.data.punya_kode,
      })
    } catch {
      setForm({
        id: u.id,
        nama: u.nama,
        nis: u.nis,
        kelas: u.kelas || '',
        kelas_baru: '',
        password: '',
        punya_kode: false,
      })
    }
  }

  const ubah = (kunci, nilai) => setForm((f) => ({ ...f, [kunci]: nilai }))

  const simpan = async () => {
    setGalat({})

    const kelasBaru = form.kelas === '__baru__' ? rapikanKelas(form.kelas_baru) : null

    if (form.kelas === '__baru__' && !kelasBaru) {
      setGalat({ kelas: 'Nama kelas baru wajib diisi.' })
      return
    }

    const kelasFinal = form.kelas === '__baru__' ? kelasBaru : form.kelas

    try {
      await jalankan(
        () =>
          form.id
            ? api.put(`/admin/anggota/${form.id}`, {
                nama: form.nama,
                nis: form.nis,
                kelas: kelasFinal,
                password: form.password || '',
              })
            : api.post('/admin/anggota', { ...form, kelas: kelasFinal }),
        { sukses: form.id ? 'Anggota berhasil diperbarui.' : 'Anggota berhasil ditambahkan.' },
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
      await jalankan(() => api.delete(`/admin/anggota/${hapus.id}`), {
        sukses: 'Anggota berhasil dihapus.',
      })
      setHapus(null)
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  /* ------------------------------------------------------------------ */
  /* ACAK PASSWORD                                                       */
  /* ------------------------------------------------------------------ */

  /*
   * Pengacakan hanya lewat satu tombol di kepala halaman, dengan dua
   * pilihan di dalamnya:
   *
   *   1. yang dicentang di tabel saja  (biasanya 1-3 orang)
   *   2. seluruh pemilih terdaftar    (stok kartu habis, dll)
   *
   * Tidak ada tombol acak per baris. Satu tombol dengan dua tujuan yang
   * dipilih sadar jauh lebih aman daripada awalan di setiap baris, karena
   * mengacak = mematikan kode yang mungkin sudah dipegang siswa.
   */
  const acakCakupan = async (cakupan) => {
    const body =
      cakupan === 'terpilih'
        ? { cakupan: 'ids', ids: terpilih }
        : { cakupan: 'semua' }

    try {
      const res = await jalankan(() => api.post('/admin/anggota/acak-password', body))
      setModalReset(false)
      setTerpilih([])
      if (res) {
        setHasilAcak({ judul: res.data.judul, hasil: res.data.hasil, params: res.data.params })
        muatUlang({ diam: true })
      }
    } catch {
      /* toast sudah tampil */
    }
  }

  /* ------------------------------------------------------------------ */
  /* PESERTA & DETAIL VOTE                                               */
  /* ------------------------------------------------------------------ */

  const bukaPeserta = async (u) => {
    try {
      const res = await api.get(`/admin/anggota/${u.id}/peserta`)
      setPeserta({
        id: u.id,
        nama: u.nama,
        daftar: res.data.daftar,
        dipilih: res.data.pemilihan_terpilih,
        memuat: false,
      })
    } catch {
      /* toast sudah tampil */
    }
  }

  const simpanPeserta = async () => {
    try {
      await jalankan(() =>
        api.put(`/admin/anggota/${peserta.id}/peserta`, {
          pemilihan: peserta.dipilih,
        }),
      )
      setPeserta(null)
      muatUlang({ diam: true })
    } catch {
      /* toast sudah tampil */
    }
  }

  const bukaDetail = async (u) => {
    try {
      const res = await api.get(`/admin/anggota/${u.id}/detail-vote`)
      setDetail(res.data)
    } catch {
      /* toast sudah tampil */
    }
  }

  /**
   * Tandai peserta "tidak hadir" pada satu pemilihan (anti-golput).
   * Endpoint hanya memperbarui status; detail dimuat ulang supaya badge
   * langsung berubah tanpa menutup modal. Tanda ini ikut direkap dan bisa
   * disaring lewat filter Status > "Ditandai tidak hadir".
   */
  const tandaiTidakHadir = async (pemilihanId) => {
    if (!detail) return
    try {
      await jalankan(() =>
        api.post(`/admin/anggota/${detail.pemilihan.id}/tidak-hadir`, {
          pemilihan_id: pemilihanId,
        }),
      )
      muatUlang({ diam: true })

      const res = await api.get(`/admin/anggota/${detail.pemilihan.id}/detail-vote`)
      setDetail(res.data)
    } catch {
      /* toast sudah tampil */
    }
  }

  /**
   * Lihat identitas + kode kartu SATU pemilih.
   *
   * Dulu satu-satunya jalan melihat kode kartu adalah mengacak ulang, padahal
   * itu langsung membatalkan kode yang sudah dibagikan ke siswa. Tombol ini
   * karena itu hanya MEMBACA — tidak mengubah apa pun.
   */
  const bukaIdentitas = async (u) => {
    setIdentitas({ memuat: true, nama: u.nama })
    try {
      const res = await api.get(`/admin/anggota/${u.id}`)
      setIdentitas({ memuat: false, ...res.data })
    } catch {
      setIdentitas(null)
    }
  }

  /* ------------------------------------------------------------------ */
  /* TABEL                                                               */
  /* ------------------------------------------------------------------ */

  const gantiSort = (kolom) => {
    if (sort === kolom) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(kolom)
      setDirection('asc')
    }
    setPage(1)
  }

  // "Pilih semua" hanya menilai baris di halaman ini. Sebelumnya dibandingkan
  // lewat jumlah, sehingga setelah pindah halaman kotaknya tampak tercentang
  // padahal belum ada baris di halaman baru yang dipilih.
  const semuaTerpilih = anggota.length > 0 && anggota.every((u) => terpilih.includes(u.id))

  const toggleSemua = () => {
    const idHalaman = anggota.map((u) => u.id)
    setTerpilih((t) =>
      semuaTerpilih
        ? t.filter((id) => !idHalaman.includes(id))
        : [...new Set([...t, ...idHalaman])],
    )
  }

  const toggleSatu = (id) => {
    setTerpilih((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))
  }

  const adaFilter = cariTunda || kelas || status || pemilihan

  const resetFilter = () => {
    setSearch('')
    setCariTunda('')
    setKelas('')
    setPemilihan('')
    setStatus('')
    setPage(1)
  }

  return (
    <KerangkaAdmin judul="Kelola Pemilih">
      

      <KepalaHalaman
        aksi={
          <>
            <Tombol href="/unduh/anggota/template" varian="sekunder" ukuran="kecil">
              <Icon name="download" className="w-4 h-4" />
              Template
            </Tombol>
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => setModalImport(true)}>
              <Icon name="clipboard-check" className="w-4 h-4" />
              Impor Excel
            </Tombol>
            {/* Dua pilihan, tapi tombolnya TIDAK PERNAH nonaktif: "acak semua"
          tidak perlu langkah tambahan apa pun. */}
            {bisaKode && (
              <Tombol varian="sekunder" ukuran="kecil" onClick={() => setModalReset(true)}>
                <Icon name="shuffle" className="w-4 h-4" />
                Acak Password
              </Tombol>
            )}
            <Tombol onClick={bukaTambah}>
              <Icon name="plus" className="w-4 h-4" />
              Tambah Pemilih
            </Tombol>
          </>
        }
      >
        <p className="text-sm text-[var(--c-text-muted)] h-6 flex items-center">
          {memuat ? (
            <MemuatRingkas lebar="w-28" />
          ) : (
            <>
              {data?.meta?.total ?? 0} pemilih
              {pemilihanTerpilih && (
                <span className="text-[var(--c-text-subtle)]">
                  {' '}
                  · peserta {pemilihanTerpilih.nama}
                </span>
              )}
            </>
          )}
        </p>
      </KepalaHalaman>

      {/* Filter */}
      <Kartu className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Field label="Cari">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nama atau NIS..."
            />
          </Field>

          <Field label="Kelas">
            <Select
              value={kelas}
              onChange={(e) => {
                setKelas(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Semua kelas</option>
              <option value="__tanpa__">Tanpa kelas</option>
              {daftarKelas.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Pemilihan"
            bantuan={pemilihanTerpilih ? 'Status & badge mengikuti pemilihan ini.' : undefined}
          >
            <Select
              value={pemilihan}
              onChange={(e) => {
                setPemilihan(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Semua pemilihan</option>
              {daftarPemilihan.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Semua</option>
              <option value="sudah">Sudah memilih</option>
              <option value="belum">Belum memilih</option>
              <option value="tidak">Ditandai tidak hadir</option>
            </Select>
          </Field>

          <div className="flex items-end">
            <Tombol varian="sekunder" onClick={resetFilter} className="w-full">
              Reset Filter
            </Tombol>
          </div>
        </div>
      </Kartu>

      {/* Tabel */}
      <Kartu className="overflow-hidden">
        {memuat && !data ? (
          <Memuat tinggi="h-72" />
        ) : anggota.length === 0 ? (
          <Kosong
            ikon={<Icon name="users" className="w-12 h-12" />}
            judul="Tidak Ada Pemilih"
            deskripsi={
              adaFilter
                ? 'Tidak ada pemilih yang cocok dengan filter.'
                : 'Tambahkan pemilih atau impor dari Excel.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Tabel kolom={['Pilih', 'Nama', 'NIS', 'Kelas', 'Status', 'Pemilihan', 'Aksi']}>
              <Baris>
                <Sel className="w-10">
                  <input
                    type="checkbox"
                    checked={semuaTerpilih}
                    onChange={toggleSemua}
                    aria-label="Pilih semua di halaman ini"
                    className="w-4 h-4 rounded accent-[var(--c-primary)]"
                  />
                </Sel>
                <Sel colSpan={6} className="text-xs text-[var(--c-text-muted)]">
                  {terpilih.length > 0 ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span>
                        <b className="text-[var(--c-primary)]">{terpilih.length} dipilih</b> — tombol
                        Acak Password akan berlaku untuk mereka saja
                      </span>
                      <button
                        type="button"
                        onClick={() => setTerpilih([])}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded
                          bg-[var(--c-bg-page)] border border-[var(--c-border)]
                          text-[11px] font-semibold text-[var(--c-text)] hover:border-[var(--c-primary)]"
                      >
                        <Icon name="x" className="w-3 h-3" />
                        Kosongkan
                      </button>
                    </span>
                  ) : (
                    'Klik centang untuk memilih beberapa pemilih'
                  )}
                </Sel>
              </Baris>

              {anggota.map((u) => (
                <Baris key={u.id}>
                  <Sel className="w-10">
                    <input
                      type="checkbox"
                      checked={terpilih.includes(u.id)}
                      onChange={() => toggleSatu(u.id)}
                      aria-label={`Pilih ${u.nama}`}
                      className="w-4 h-4 rounded accent-[var(--c-primary)]"
                    />
                  </Sel>

                  <Sel>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--c-primary-soft)] flex items-center justify-center text-xs font-bold text-[var(--c-primary-dark)] shrink-0">
                        {inisial(u.nama)}
                      </div>
                      <span className="font-semibold whitespace-nowrap">{u.nama}</span>
                    </div>
                  </Sel>

                  <Sel className="text-[var(--c-text-muted)] tabular-nums">{u.nis}</Sel>
                  <Sel className="text-[var(--c-text-muted)]">{u.kelas || '-'}</Sel>

                  <Sel>
                    <Lencana
                      warna={u.sudah_memilih ? 'sukses' : 'netral'}
                      ikon={u.sudah_memilih ? <Icon name="check" className="w-3.5 h-3.5" /> : null}
                    >
                      {u.sudah_memilih ? 'Sudah' : 'Belum'}
                    </Lencana>
                  </Sel>

                  <Sel>
                    <div className="flex flex-wrap gap-1">
                      {u.pemilihan.length === 0 ? (
                        <span className="text-xs text-[var(--c-text-muted)]">-</span>
                      ) : (
                        u.pemilihan.slice(0, 2).map((p) => (
                          <Lencana key={p.id} warna="informasi">
                            {p.nama.length > 14 ? `${p.nama.slice(0, 14)}…` : p.nama}
                          </Lencana>
                        ))
                      )}
                      {u.pemilihan.length > 2 && (
                        <Lencana warna="netral">+{u.pemilihan.length - 2}</Lencana>
                      )}
                    </div>
                  </Sel>

                  <Sel>
                    {/* Aksi baris: ikon saja. Label penuh ada di `title`
                        sehingga tetap terbaca lewat hover dan pembaca layar. */}
                    <div className="flex items-center gap-0.5">
                      <AksiBaris
                        label="Kelola pendaftaran pemilihan"
                        ikon="clipboard-check"
                        onClick={() => bukaPeserta(u)}
                      />
                      <AksiBaris
                        label="Ubah data pemilih"
                        ikon="pencil"
                        onClick={() => bukaEdit(u)}
                      />
                      <AksiBaris
                        label="Lihat identitas & kode kartu"
                        ikon="user"
                        onClick={() => bukaIdentitas(u)}
                      />
                      <AksiBaris
                        label="Lihat detail keikutsertaan"
                        ikon="eye"
                        onClick={() => bukaDetail(u)}
                      />
                      <AksiBaris
                        label={`Hapus ${u.nama}`}
                        ikon="trash"
                        warna="bahaya"
                        onClick={() =>
                          setHapus({
                            id: u.id,
                            pesan: `Pemilih "${u.nama}" (NIS ${u.nis}) akan dihapus permanen. Pemilih yang sudah memilih tidak bisa dihapus agar riwayat partisipasi & suaranya tetap bisa diaudit.`,
                          })
                        }
                      />
                    </div>
                  </Sel>
                </Baris>
              ))}
            </Tabel>
          </div>
        )}

        <Paginasi meta={data?.meta} onGanti={setPage} />
      </Kartu>

      {/* ---------- MODAL TAMBAH / UBAH ---------- */}
      <Modal
        buka={!!form}
        onTutup={() => !memproses && setForm(null)}
        judul={form?.id ? 'Ubah Pemilih' : 'Tambah Pemilih'}
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
            <Field label="Nama Lengkap" wajib galat={galat.nama}>
              <Input
                value={form.nama}
                onChange={(e) => ubah('nama', e.target.value)}
                placeholder="Nama lengkap siswa"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="NIS" wajib galat={galat.nis}>
                <Input
                  value={form.nis}
                  onChange={(e) => ubah('nis', e.target.value)}
                  inputMode="numeric"
                />
              </Field>

              <Field
                label="Kelas"
                galat={galat.kelas}
                bantuan={
                  form.kelas === '__baru__'
                    ? 'Kelas baru dibuat otomatis saat data disimpan.'
                    : undefined
                }
              >
                <Select
                  value={form.kelas || ''}
                  onChange={(e) => {
                    ubah('kelas', e.target.value)
                    if (e.target.value !== '__baru__') ubah('kelas_baru', '')
                  }}
                >
                  <option value="">-- Pilih kelas --</option>
                  {daftarKelas.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                  <option value="__baru__">+ Tambah kelas baru…</option>
                </Select>

                {form.kelas === '__baru__' && (
                  <Input
                    value={form.kelas_baru || ''}
                    onChange={(e) => ubah('kelas_baru', e.target.value)}
                    placeholder="Contoh: XII RPL 1"
                    maxLength={50}
                    className="mt-2"
                  />
                )}
              </Field>
            </div>

            <Field
              label="Kode Kartu (password)"
              wajib={!form?.id}
              galat={galat.password}
              bantuan={
                form?.id
                  ? 'Kosongkan bila tidak ingin mengubah. Minimal 6 karakter. Tidak peka huruf besar/kecil saat login.'
                  : 'Minimal 6 karakter. Dicetak di kartu pemilih.'
              }
            >
              <div className="flex gap-2">
                <Input
                  value={form.password}
                  onChange={(e) => ubah('password', e.target.value)}
                  autoComplete="new-password"
                />
                <Tombol
                  varian="sekunder"
                  type="button"
                  onClick={() =>
                    ubah('password', Math.random().toString(36).slice(2, 8).toUpperCase())
                  }
                  title="Isi kode acak"
                >
                  <Icon name="refresh" className="w-4 h-4" />
                </Tombol>
              </div>
            </Field>

            {form?.id && (
              <Peringatan warna="peringatan" ikon={<Icon name="lock" className="w-5 h-5" />}>
                Kode kartu lama tersimpan aman (hash + terenkripsi) dan tidak ditampilkan di form
                ini. Isi kolom di atas hanya bila ingin menggantinya dengan kode baru; kode lama
                langsung tidak berlaku.
              </Peringatan>
            )}
          </div>
        )}
      </Modal>

      {/* ---------- MODAL ACAK PASSWORD ---------- */}
      <ModalHapusReset
        buka={modalReset}
        onTutup={() => setModalReset(false)}
        jumlahTerpilih={terpilih.length}
        total={data?.meta?.total ?? 0}
        onJalankan={acakCakupan}
        memuat={memproses}
      />

      {/* ---------- MODAL HASIL ACAK ---------- */}
      <ModalHasilAcak hasil={hasilAcak} onTutup={() => setHasilAcak(null)} onSukses={notifikasi} />

      {/* ---------- MODAL PESERTA ---------- */}
      <Modal
        buka={!!peserta}
        onTutup={() => setPeserta(null)}
        judul="Pendaftaran Pemilihan"
        deskripsi={peserta?.nama}
        aksi={
          <>
            <Tombol varian="sekunder" onClick={() => setPeserta(null)} className="w-full sm:w-auto">
              Batal
            </Tombol>
            <Tombol onClick={simpanPeserta} memuat={memproses} className="w-full sm:w-auto">
              Simpan
            </Tombol>
          </>
        }
      >
        {peserta && (
          <div className="space-y-2">
            <Peringatan warna="informasi" ikon={<Icon name="info" className="w-5 h-5" />}>
              Pemilihan yang sudah dipilih siswa <b>tidak bisa dilepas</b>.
            </Peringatan>

            {peserta.daftar.length === 0 ? (
              <p className="text-sm text-[var(--c-text-muted)]">Belum ada pemilihan.</p>
            ) : (
              peserta.daftar.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--c-bg-page)] border border-[var(--c-border)] cursor-pointer hover:border-[var(--c-primary)] transition"
                >
                  <input
                    type="checkbox"
                    checked={peserta.dipilih.includes(p.id)}
                    onChange={(e) => {
                      setPeserta((s) => ({
                        ...s,
                        dipilih: e.target.checked
                          ? [...s.dipilih, p.id]
                          : s.dipilih.filter((x) => x !== p.id),
                      }))
                    }}
                    className="w-5 h-5 rounded accent-[var(--c-primary)]"
                  />
                  <span className="text-sm text-[var(--c-text)] flex-1">{p.nama}</span>
                  <Lencana warna={p.status === 'aktif' ? 'sukses' : 'netral'}>
                    {p.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                  </Lencana>
                </label>
              ))
            )}
          </div>
        )}
      </Modal>

      {/* ---------- MODAL DETAIL ---------- */}
      <Modal
        buka={!!detail}
        onTutup={() => setDetail(null)}
        judul="Detail Keikutsertaan"
        deskripsi={detail ? `${detail.pemilihan.nama} • NIS ${detail.pemilihan.nis}` : ''}
        aksi={
          <Tombol varian="sekunder" onClick={() => setDetail(null)} className="w-full sm:w-auto">
            Tutup
          </Tombol>
        }
      >
        {detail && (
          <div className="space-y-4">
            <Peringatan warna="informasi" ikon={<Icon name="info" className="w-5 h-5" />}>
              Daftar ini hanya menunjukkan <b>sudah/tidak memilih</b>. Pilihan kandidat tidak
              ditampilkan karena suara bersifat rahasia.
            </Peringatan>

            {detail.detail.length === 0 ? (
              <p className="text-sm text-[var(--c-text-muted)]">
                Tidak terdaftar pada pemilihan apa pun.
              </p>
            ) : (
              <div className="space-y-2">
                {detail.detail.map((d) => (
                  <div
                    key={d.pemilihan_id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--c-bg-page)] border border-[var(--c-border)]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--c-text)] truncate">
                        {d.nama}
                      </p>
                      <p className="text-xs text-[var(--c-text-muted)]">
                        {d.tanggal_mulai} — {d.tanggal_selesai}
                        {d.waktu_memilih && ` • memilih: ${d.waktu_memilih}`}
                      </p>
                    </div>
                    <div className="flex items-center shrink-0">
                      {d.sudah_memilih ? (
                        <Lencana warna="sukses" ikon={<Icon name="check" className="w-3.5 h-3.5" />}>
                          Sudah
                        </Lencana>
                      ) : d.tidak_hadir ? (
                        <Lencana warna="peringatan" ikon={<Icon name="x" className="w-3.5 h-3.5" />}>
                          Tidak Hadir
                        </Lencana>
                      ) : (
                        <Tombol
                          varian="sekunder"
                          ukuran="kecil"
                          memuat={memproses}
                          onClick={() => tandaiTidakHadir(d.pemilihan_id)}
                        >
                          Tandai Tidak Hadir
                        </Tombol>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>


      <ModalIdentitas
        identitas={identitas}
        bisaKode={bisaKode}
        onTutup={() => setIdentitas(null)}
        onBukaPeserta={(u) => {
          setIdentitas(null)
          bukaPeserta(u)
        }}
        onBukaDetail={(u) => {
          setIdentitas(null)
          bukaDetail(u)
        }}
      />

      <ModalImport
        buka={modalImport}
        onTutup={() => setModalImport(false)}
        onSukses={() => {
          setModalImport(false)
          muatUlang()
        }}
        daftarKelas={daftarKelas}
      />
    </KerangkaAdmin>
  )
}

/* ==================================================================== */
/* MODAL ACAK PASSWORD                                                  */
/* ==================================================================== */

/**
 * Dialog untuk tombol "Acak Password" di kepala halaman.
 *
 * Dua pilihan yang disengaja dipisah, bukan ditebak dari state tabel:
 * mengacak mematikan kode yang mungkin sudah dipegang siswa, jadi admin
 * sebaiknya menyatakan sendiri cakupannya. "Acak semua" tetap bisa dipakai
 * tanpa mencentang apa pun — hanya opsi "yang dicentang" yang butuh centang.
 */
function ModalHapusReset({ buka, onTutup, jumlahTerpilih, total, onJalankan, memuat }) {
  return (
    <Modal
      buka={buka}
      onTutup={memuat ? () => {} : onTutup}
      judul="Acak Kode Kartu"
      deskripsi="Pilih cakupannya. Kode lama akan langsung tidak berlaku."
      aksi={
        <Tombol varian="sekunder" onClick={onTutup} disabled={memuat} className="w-full sm:w-auto">
          Batal
        </Tombol>
      }
    >
      <div className="space-y-3">
        <PilihanAcak
          ikon="check-circle"
          judul="Yang dicentang saja"
          keterangan={
            jumlahTerpilih > 0
              ? `${jumlahTerpilih} pemilih${jumlahTerpilih === 1 ? '' : ' dipilih'} di tabel`
              : 'Belum ada yang dicentang di tabel'
          }
          nada="aman"
          nonaktif={jumlahTerpilih === 0}
          onKlik={() => onJalankan('terpilih')}
        />

        <PilihanAcak
          ikon="users"
          judul="Semua pemilih"
          keterangan={`${total} pemilih terdaftar — bukan hanya yang terlihat di halaman ini`}
          nada="bahaya"
          nonaktif={total === 0}
          onKlik={() => onJalankan('semua')}
        />

        <Peringatan warna="peringatan" ikon={<Icon name="warning" className="w-5 h-5" />}>
          Kode kartu yang sudah dibagikan ke siswa menjadi tidak berlaku. Pastikan siswa sudah diberi
          kode baru.
        </Peringatan>
      </div>
    </Modal>
  )
}

/** Satu baris pilihan cakupan di dalam dialog acak. */
function PilihanAcak({ ikon, judul, keterangan, nada, nonaktif, onKlik }) {
  return (
    <button
      type="button"
      disabled={nonaktif}
      onClick={onKlik}
      className={`w-full flex items-start gap-3 text-left p-4 rounded-xl border
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        ${
          nada === 'bahaya'
            ? 'bg-[var(--c-rose-soft)] border-[var(--c-rose)]/35 hover:border-[var(--c-bahaya)]'
            : 'bg-[var(--c-bg-page)] border-[var(--c-border)] hover:border-[var(--c-primary)]'
        }`}
    >
      <span
        className={`shrink-0 w-9 h-9 rounded-lg grid place-items-center text-white
          ${nada === 'bahaya' ? 'bg-[var(--c-bahaya)]' : 'bg-[var(--c-primary)]'}`}
      >
        <Icon name={ikon} className="w-4 h-4" />
      </span>

      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-[var(--c-text)]">{judul}</span>
        <span className="block text-[12px] text-[var(--c-text-muted)] mt-0.5">{keterangan}</span>
      </span>
    </button>
  )
}

/* ==================================================================== */
/* MODAL HASIL ACAK (menampilkan kode kartu di layar)                    */
/* ==================================================================== */

function ModalHasilAcak({ hasil, onTutup, onSukses }) {
  const [cari, setCari] = useState('')

  useEffect(() => {
    setCari('')
  }, [hasil])

  if (!hasil) return null

  const daftar = hasil.hasil.filter((h) => {
    const q = cari.toLowerCase()
    return (
      !q ||
      h.nama.toLowerCase().includes(q) ||
      String(h.nis).includes(cari) ||
      String(h.password).toLowerCase().includes(q)
    )
  })

  const teksSalin = daftar
    .map((h) => `${h.nis}\t${h.nama}\t${h.kelas || '-'}\t${h.password}`)
    .join('\n')

  return (
    <Modal
      buka
      onTutup={onTutup}
      judul={`Kode Kartu — ${hasil.judul}`}
      deskripsi={`${hasil.hasil.length} kode baru. Tutup setelah selesai dicetak/disalin.`}
      lebar="max-w-4xl"
      aksi={
        <>
          <TombolSalin
            teks={teksSalin}
            label="Salin Semua"
            onSukses={() => onSukses('Daftar kode kartu disalin.', 'sukses')}
          />
          <Tombol onClick={onTutup} className="w-full sm:w-auto">
            Selesai
          </Tombol>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          type="search"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama, NIS, atau kode..."
        />

        {/* Ringkasan jumlah, supaya saat difilter jelas bedanya antara
            tidak ada kode sama sekali dan tidak ada yang cocok. */}
        <p className="text-[12px] text-[var(--c-text-muted)] tabular-nums">
          Menampilkan {daftar.length} dari {hasil.hasil.length} kode kartu
        </p>

        {/* Grid ini sengaja TIDAK punya max-height atau overflow sendiri.
            Area isi modal sudah bisa digulir; scroll kedua hanya
            menghasilkan ruang kosong di bawah daftar dan dua scrollbar. */}
        {daftar.length === 0 ? (
          <p className="text-center text-[13px] text-[var(--c-text-muted)] py-8">
            Tidak ada yang cocok dengan pencarian.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
            {daftar.map((h, i) => (
              <KartuKode key={`${h.nis}-${i}`} h={h} onSukses={onSukses} />
            ))}
          </div>
        )}

        {hasil.params && (
          <div className="flex justify-end">
            <Tombol
              href={`/unduh/anggota/kartu-pemilih?${new URLSearchParams(hasil.params)}`}
              varian="sekunder"
              ukuran="kecil"
            >
              <Icon name="download" className="w-4 h-4" />
              Unduh Kartu PDF
            </Tombol>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Kartu kode                                                         */
/* ------------------------------------------------------------------ */

/**
 * Satu kartu untuk satu kode kartu pemilih.
 *
 * Kode ditampilkan besar dan monospace (bukan angka biasa) karena tugasnya
 * memang untuk DICETAK dan DIBACAK SISWA, bukan sekadar dilihat admin.
 * Tiap kartu punya tombol salin sendiri supaya tidak perlu menyeleksi teks
 * manual satu per satu.
 */
function KartuKode({ h, onSukses }) {
  const [tersalin, setTersalin] = useState(false)

  const salin = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(h.password)
      } else {
        // Fallback untuk komputer lab tanpa clipboard aman.
        const area = document.createElement('textarea')
        area.value = h.password
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }

      setTersalin(true)
      onSukses?.(`Kode kartu ${h.nama} tersalin.`, 'sukses')
      setTimeout(() => setTersalin(false), 1600)
    } catch {
      onSukses?.('Gagal menyalin. Pilih kode dan tekan Ctrl+C.', 'bahaya')
    }
  }

  return (
    /* h-full + mt-auto pada kotak kode: kartu dalam satu baris selalu sama
       tinggi dan semua kode rata di bawah, sehingga tidak ada celah kosong
       yang membesar di antara kartu yang namanya panjang dan pendek. */
    <div className="kasya-card h-full rounded-xl p-3 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-[var(--c-text)] truncate" title={h.nama}>
            {h.nama}
          </p>
          <p className="text-[11px] text-[var(--c-text-muted)] truncate">
            NIS {h.nis} · {h.kelas || '-'}
          </p>
        </div>

        <AksiBaris
          label={tersalin ? 'Tersalin' : 'Salin kode kartu'}
          ikon={tersalin ? 'check' : 'clipboard-check'}
          warna={tersalin ? 'sukses' : 'netral'}
          onClick={salin}
        />
      </div>

      {/* Kotak kode: garis putus-putus seperti motif tiket, supaya jelas
          ini bagian yang harus dicatat / dibacakan siswa.
          mt-auto membuatnya rata di bawah kartu walau nama lebih panjang. */}
      <div
        className="mt-auto rounded-lg border border-dashed border-[var(--c-primary-soft-border)]
          bg-[var(--c-primary-soft)] px-3 py-2.5 text-center"
      >
        <code
          className="block font-mono text-[15px] font-bold tracking-[0.18em]
            text-[var(--c-primary-dark)] break-all"
        >
          {h.password}
        </code>
      </div>
    </div>
  )
}

/* ==================================================================== */
/* MODAL IMPOR EXCEL                                                    */
/* ==================================================================== */

function ModalImport({ buka, onTutup, onSukses, daftarKelas = [] }) {
  const { jalankan, memuat } = useAksiAdmin()
  const [file, setFile] = useState(null)
  const [galat, setGalat] = useState(null)
  const [kelas, setKelas] = useState('')
  const [kelasBaru, setKelasBaru] = useState('')
  const [pakaiBaru, setPakaiBaru] = useState(false)

  useEffect(() => {
    if (buka) {
      setFile(null)
      setGalat(null)
      setKelas('')
      setKelasBaru('')
      setPakaiBaru(false)
    }
  }, [buka])

  const proses = async () => {
    if (!file) {
      setGalat('Pilih file Excel terlebih dahulu.')
      return
    }

    setGalat(null)
    const body = new FormData()
    body.append('file', file)
    const kelasTerpilih = pakaiBaru ? kelasBaru.trim() : kelas
    if (kelasTerpilih) body.append('kelas', kelasTerpilih)

    try {
      await jalankan(() => api.post('/admin/anggota/import', body))
      setFile(null)
      onSukses()
    } catch (e) {
      setGalat(e?.response?.data?.pesan || 'Gagal mengimpor file.')
    }
  }

  return (
    <Modal
      buka={buka}
      onTutup={onTutup}
      judul="Impor Pemilih dari Excel"
      aksi={
        <>
          <Tombol varian="sekunder" onClick={onTutup} className="w-full sm:w-auto">
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
        <Peringatan warna="informasi" ikon={<Icon name="info" className="w-5 h-5" />}>
          Gunakan template resmi agar kolom terbaca benar.{' '}
          <a href="/unduh/anggota/template" className="underline font-semibold">
            Unduh template
          </a>
          .
        </Peringatan>

        <Field label="Kelas tujuan" bantuan="Pilih kelas yang akan diberikan ke seluruh baris impor (opsional).">
          {!pakaiBaru ? (
            <Select value={kelas} onChange={(e) => setKelas(e.target.value)}>
              <option value="">-- Tanpa penetapan kelas --</option>
              {daftarKelas.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              value={kelasBaru}
              onChange={(e) => setKelasBaru(e.target.value)}
              placeholder="Nama kelas baru, mis. XII RPL 1"
            />
          )}
        </Field>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPakaiBaru((v) => !v)}
            className="text-[var(--c-primary)] font-semibold hover:underline"
          >
            {pakaiBaru ? 'Pilih dari daftar kelas' : 'Kelas baru belum ada di daftar'}
          </button>
        </div>

        <Field label="File Excel" wajib galat={galat}>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-[var(--c-text-muted)] file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[var(--c-primary-soft)] file:text-[var(--c-primary-dark)] file:font-semibold file:cursor-pointer"
          />
        </Field>

        <p className="text-xs text-[var(--c-text-muted)]">
          Format .xlsx, .xls, atau .csv. Maksimal 4MB. NIS yang sudah terdaftar akan dilewati. Jika
          kelas tujuan dipilih, kolom kelas di Excel akan ditimpa.
        </p>
      </div>
    </Modal>
  )
}


/* ==================================================================== */
/* MODAL IDENTITAS PEMILIH                                              */
/* ==================================================================== */

/**
 * Menampilkan identitas satu pemilih beserta kode kartunya.
 *
 * Modal ini sendiri tidak pernah mengubah apa pun. Tapi karena yang sering
 * terjadi justru "kartu saya hilang, tolong cetak ulang" — tombol acak
 * sengaja ditaruh DI DALAM modal ini. Jadi saat sudah melihat kode lama,
 * admin bisa langsung memutuskan untuk menerbitkan yang baru tanpa harus
 * balik ke tabel dulu.
 */
function ModalIdentitas({ identitas, bisaKode, onTutup, onBukaPeserta, onBukaDetail }) {
  const [tersalin, setTersalin] = useState(false)
  // Kode diambil SESUDAH admin menekan tombol (dan dicatat di audit log),
  // tidak ikut data pemilih. Otomatis disembunyikan lagi setelah 30 detik.
  const [kode, setKode] = useState(null)
  const [memuatKode, setMemuatKode] = useState(false)
  const [pesanKode, setPesanKode] = useState('')

  useEffect(() => {
    setTersalin(false)
    setKode(null)
    setPesanKode('')
  }, [identitas?.id])

  useEffect(() => {
    if (!kode) return undefined
    const t = setTimeout(() => setKode(null), 30000)
    return () => clearTimeout(t)
  }, [kode])

  if (!identitas) return null

  const bisaTampil = !identitas.memuat && typeof kode === 'string' && kode.length > 0

  const tampilkanKode = async () => {
    setMemuatKode(true)
    setPesanKode('')
    try {
      const res = await api.get(`/admin/anggota/${identitas.id}/kode-kartu`)
      if (res.data.kode) {
        setKode(res.data.kode)
      } else {
        setPesanKode(res.data.pesan || 'Kode kartu tidak tersedia.')
      }
    } catch (e) {
      setPesanKode(e?.response?.data?.pesan || 'Tidak bisa membuka kode kartu.')
    } finally {
      setMemuatKode(false)
    }
  }

  const salin = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(kode)
      } else {
        const area = document.createElement('textarea')
        area.value = kode
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
      setTersalin(true)
      setTimeout(() => setTersalin(false), 1600)
    } catch {
      /* diamkan; pengguna masih bisa menyeleksi manual */
    }
  }

  return (
    <Modal
      buka
      onTutup={onTutup}
      judul="Identitas Pemilih"
      deskripsi={identitas.memuat ? 'Memuat…' : identitas.nama}
      lebar="max-w-lg"
      aksi={
        <>
          <Tombol varian="sekunder" onClick={() => onBukaPeserta(identitas)}>
            <Icon name="clipboard-check" className="w-4 h-4" />
            Daftar Peserta
          </Tombol>
          <Tombol varian="sekunder" onClick={() => onBukaDetail(identitas)}>
            <Icon name="eye" className="w-4 h-4" />
            Riwayat Memilih
          </Tombol>
          <Tombol onClick={onTutup}>Tutup</Tombol>
        </>
      }
    >
      <div className="space-y-4">
        {/* Data dasar */}
        <dl className="grid grid-cols-2 gap-3">
          <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--c-text-subtle)]">
            NIS
          </dt>
          <dd className="text-[13px] font-semibold text-[var(--c-text)] tabular-nums">
            {identitas.nis || '-'}
          </dd>

          <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--c-text-subtle)]">
            Kelas
          </dt>
          <dd className="text-[13px] font-semibold text-[var(--c-text)]">
            {identitas.kelas || '-'}
          </dd>
        </dl>

        {/* Kode kartu */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--c-text-subtle)] mb-1.5">
            Kode Kartu (password)
          </p>

          {identitas.memuat ? (
            <KerangkaUi className="h-12 w-full" />
          ) : bisaTampil ? (
            <div
              className="flex items-center justify-between gap-3 rounded-xl border border-dashed
                border-[var(--c-primary-soft-border)] bg-[var(--c-primary-soft)] px-4 py-3"
            >
              <code
                className="font-mono text-lg font-bold tracking-[0.18em]
                  text-[var(--c-primary-dark)] break-all"
              >
                {kode}
              </code>

              <AksiBaris
                label={tersalin ? 'Tersalin' : 'Salin kode kartu'}
                ikon={tersalin ? 'check' : 'clipboard-check'}
                warna={tersalin ? 'sukses' : 'netral'}
                onClick={salin}
                className="bg-[var(--c-bg-surface)] shrink-0"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg-page)] px-4 py-3 space-y-3">
              <p className="text-[12px] text-[var(--c-text-muted)] flex items-start gap-2">
                <Icon name="lock" className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Kode kartu tersimpan terenkripsi dan disembunyikan.
                  {bisaKode && identitas.punya_kode
                    ? ' Membukanya akan dicatat di audit log.'
                    : !bisaKode
                      ? ' Peran Anda tidak diizinkan melihat kode kartu.'
                      : ' Pemilih ini belum punya kode tersimpan (data lama) — gunakan Acak Password untuk menerbitkan kode baru.'}
                </span>
              </p>

              {bisaKode && identitas.punya_kode && (
                <Tombol
                  varian="sekunder"
                  ukuran="kecil"
                  onClick={tampilkanKode}
                  memuat={memuatKode}
                >
                  <Icon name="eye" className="w-4 h-4" />
                  Tampilkan kode
                </Tombol>
              )}

              {pesanKode && (
                <p className="text-[12px] text-[var(--c-text-muted)]">{pesanKode}</p>
              )}
            </div>
          )}
        </div>

        {!identitas.memuat && (
          <p className="text-[11px] text-[var(--c-text-subtle)] flex items-start gap-1.5">
            <Icon name="info" className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              Kode yang ditampilkan otomatis disembunyikan lagi setelah 30 detik. Kalau perlu kode
              baru, pakai tombol
              <b className="text-[var(--c-text)]"> Acak Password</b> di kepala halaman — pilih
              yang dicentang saja, atau semua pemilih.
            </span>
          </p>
        )}
      </div>
    </Modal>
  )
}
