import { useState } from 'react'
import api from '../../lib/api'
import { petaGalat } from '../../lib/validasi'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import { inisial } from '../../lib/format'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Kartu, Lencana, Tombol, Peringatan } from '../../components/UI'
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
  KonfirmasiHapus,
} from '../../components/AdminUI'

/*
 * Kelola akun admin & peran. Setara dengan App\Livewire\Admin\KelolaAdmin.
 * Hanya Super Admin yang boleh mengakses halaman ini (dijaga backend).
 */
const KOSONG = { nama: '', email: '', peran_admin: 'panitia', password: '' }

export default function KelolaAdmin() {
  const { data, memuat, muatUlang } = useAdminPage('/admin/akun', { izin: 'admin' })
  const { jalankan, memuat: memproses } = useAksiAdmin()

  const [form, setForm] = useState(null)
  const [hapus, setHapus] = useState(null)
  const [galat, setGalat] = useState({})

  const admin = data?.admin ?? []
  const peran = data?.peran ?? []

  const bukaTambah = () => {
    setGalat({})
    setForm({ ...KOSONG })
  }

  const bukaEdit = (a) => {
    setGalat({})
    setForm({
      id: a.id,
      nama: a.nama,
      email: a.email,
      peran_admin: a.peran,
      password: '', // kosong = tidak diubah
    })
  }

  const ubah = (kunci, nilai) => setForm((f) => ({ ...f, [kunci]: nilai }))

  const simpan = async () => {
    setGalat({})
    try {
      await jalankan(
        () => (form.id ? api.put(`/admin/akun/${form.id}`, form) : api.post('/admin/akun', form)),
        {
          sukses: form.id ? 'Akun admin berhasil diperbarui.' : 'Akun admin berhasil ditambahkan.',
        },
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
      await jalankan(() => api.delete(`/admin/akun/${hapus.id}`), {
        sukses: 'Akun admin berhasil dihapus.',
      })
      setHapus(null)
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  return (
    <KerangkaAdmin judul="Kelola Admin">
      <KepalaHalaman
        aksi={
          <>
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" />
              Muat Ulang
            </Tombol>
            <Tombol onClick={bukaTambah}>
              <Icon name="plus" className="w-4 h-4" />
              Tambah Admin
            </Tombol>
          </>
        }
      >
        <p className="text-sm text-[var(--c-text-muted)] h-6 flex items-center">
          {memuat ? <MemuatRingkas lebar="w-28" /> : `${admin.length} akun admin`}
        </p>
      </KepalaHalaman>

      {/* Penjelasan peran */}
      {peran.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {peran.map((p) => (
            <Kartu key={p.kunci} className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <b className="text-sm text-[var(--c-text)]">{p.label}</b>
                <Lencana warna="netral">{p.kunci}</Lencana>
              </div>
              <p className="text-xs text-[var(--c-text-muted)]">{p.keterangan}</p>
            </Kartu>
          ))}
        </div>
      )}

      {memuat && !data && <Memuat />}

      {admin.length > 0 && (
        <Kartu className="overflow-hidden">
          <Tabel kolom={['Admin', 'Peran', 'Dibuat', 'Aksi']} sematkan={1}>
            {admin.map((a) => (
              <Baris key={a.id}>
                <Sel>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[var(--c-primary-soft)] flex items-center justify-center font-bold text-[var(--c-primary-dark)] shrink-0">
                      {inisial(a.nama)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{a.nama}</span>
                        {a.saya && <Lencana warna="informasi">Kamu</Lencana>}
                      </div>
                      <p className="text-xs text-[var(--c-text-muted)] truncate">{a.email}</p>
                    </div>
                  </div>
                </Sel>
                <Sel>
                  <Lencana warna={a.super ? 'bahaya' : 'netral'}>{a.peran_label}</Lencana>
                </Sel>
                <Sel className="text-[var(--c-text-muted)] text-xs">
                  {a.dibuat ? new Date(a.dibuat).toLocaleDateString('id-ID') : '-'}
                </Sel>
                <Sel>
                  <div className="flex gap-1.5">
                    <Tombol varian="sekunder" ukuran="kecil" onClick={() => bukaEdit(a)}>
                      Ubah
                    </Tombol>
                    <Tombol
                      varian="bahaya"
                      ukuran="kecil"
                      disabled={a.saya}
                      title={a.saya ? 'Tidak bisa menghapus akun sendiri' : undefined}
                      onClick={() =>
                        setHapus({
                          id: a.id,
                          pesan: `Akun "${a.nama}" akan dihapus permanen.`,
                        })
                      }
                    >
                      Hapus
                    </Tombol>
                  </div>
                </Sel>
              </Baris>
            ))}
          </Tabel>
        </Kartu>
      )}

      {/* ---------- MODAL FORM ---------- */}
      <Modal
        buka={!!form}
        onTutup={() => !memproses && setForm(null)}
        judul={form?.id ? 'Ubah Akun Admin' : 'Tambah Akun Admin'}
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
            <Field label="Nama" wajib galat={galat.nama}>
              <Input
                value={form.nama}
                onChange={(e) => ubah('nama', e.target.value)}
                placeholder="Nama lengkap admin"
              />
            </Field>

            <Field
              label="Email"
              wajib
              galat={galat.email}
              bantuan="Dipakai sebagai identitas login."
            >
              <Input
                type="email"
                value={form.email}
                onChange={(e) => ubah('email', e.target.value)}
                placeholder="admin@sekolah.sch.id"
              />
            </Field>

            <Field label="Peran" wajib galat={galat.peran_admin}>
              <Select
                value={form.peran_admin}
                onChange={(e) => ubah('peran_admin', e.target.value)}
              >
                {peran.map((p) => (
                  <option key={p.kunci} value={p.kunci}>
                    {p.label} — {p.keterangan}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Password"
              wajib={!form.id}
              galat={galat.password}
              bantuan={
                form.id
                  ? 'Minimal 6 karakter. Kosongkan bila tidak ingin mengubah password.'
                  : 'Minimal 6 karakter.'
              }
            >
              <Input
                type="password"
                value={form.password}
                onChange={(e) => ubah('password', e.target.value)}
                autoComplete="new-password"
              />
            </Field>

            <Peringatan warna="informasi" ikon={<Icon name="info" className="w-5 h-5" />}>
              Hanya <b>Super Admin</b> yang punya izin membuka halaman ini. Pastikan sistem selalu
              punya minimal satu Super Admin.
            </Peringatan>
          </div>
        )}
      </Modal>

      <KonfirmasiHapus
        buka={!!hapus}
        onTutup={() => setHapus(null)}
        onYa={konfirmasiHapus}
        judul="Hapus akun admin?"
        pesan={hapus?.pesan}
        memuat={memproses}
      />
    </KerangkaAdmin>
  )
}
