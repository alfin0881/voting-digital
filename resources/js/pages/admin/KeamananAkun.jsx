import { useState } from 'react'
import api from '../../lib/api'
import { petaGalat } from '../../lib/validasi'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import { tanggalJam } from '../../lib/format'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Lencana, Tombol, Peringatan, Kosong } from '../../components/UI'
import { KepalaHalaman, Field, Input, Memuat, Panel } from '../../components/AdminUI'

/*
 * Keamanan Akun — tersedia untuk SEMUA admin (Super Admin, Panitia, Pengawas).
 *
 * Dua fungsi utama:
 * 1. Ganti password sendiri dengan verifikasi password lama. Setiap perubahan
 *    dicatat di Catatan Aktivitas.
 * 2. Melihat perangkat yang sedang login sebagai akun ini dan mengakhiri
 *    sesi lain (atau seluruh sesi) tanpa perlu izin Kelola Admin.
 */
export default function KeamananAkun() {
  const { data, memuat, muatUlang } = useAdminPage('/admin/keamanan')
  const { jalankan, memuat: memproses } = useAksiAdmin()

  const [form, setForm] = useState({
    password_lama: '',
    password: '',
    password_confirmation: '',
  })
  const [galat, setGalat] = useState({})
  const [tampil, setTampil] = useState(false)

  const [modalKeluar, setModalKeluar] = useState(false)
  const [passwordKeluar, setPasswordKeluar] = useState('')
  const [semuaSesi, setSemuaSesi] = useState(false)
  const [galatKeluar, setGalatKeluar] = useState({})
  const [memprosesKeluar, setMemprosesKeluar] = useState(false)

  const ubah = (kunci, nilai) => setForm((f) => ({ ...f, [kunci]: nilai }))

  const gantiPassword = async (e) => {
    e?.preventDefault?.()
    setGalat({})

    try {
      await jalankan(() => api.post('/admin/keamanan/password', form), {
        sukses: 'Password berhasil diganti.',
      })
      setForm({ password_lama: '', password: '', password_confirmation: '' })
      setTampil(false)
      muatUlang({ diam: true })
    } catch (err) {
      setGalat(petaGalat(err))
    }
  }

  const bukaModalKeluar = () => {
    setPasswordKeluar('')
    setSemuaSesi(false)
    setGalatKeluar({})
    setModalKeluar(true)
  }

  const keluarkanSesi = async () => {
    setGalatKeluar({})
    setMemprosesKeluar(true)

    try {
      const hasil = await jalankan(
        () =>
          api.post('/admin/keamanan/logout-semua', {
            password: passwordKeluar,
            semua: semuaSesi ? 1 : 0,
          }),
        { sukses: 'Sesi berhasil diakhiri.' },
      )

      if (hasil?.data?.redirect) {
        // Server sudah menghapus sesi ini; muat ulang penuh agar cookie dan
        // props Inertia benar-benar bersih.
        window.location.assign(hasil.data.redirect)
        return
      }

      setModalKeluar(false)
      muatUlang({ diam: true })
    } catch (err) {
      setGalatKeluar(petaGalat(err))
    } finally {
      setMemprosesKeluar(false)
    }
  }

  if (memuat && !data) {
    return (
      <KerangkaAdmin judul="Keamanan Akun">
        <Memuat tinggi="h-64" />
      </KerangkaAdmin>
    )
  }

  if (!data) {
    return (
      <KerangkaAdmin judul="Keamanan Akun">
        <Panel>
          <Peringatan warna="bahaya" ikon={<Icon name="warning" className="w-5 h-5" />}>
            Gagal memuat data keamanan akun. Muat ulang halaman atau periksa koneksi ke server.
          </Peringatan>
        </Panel>
      </KerangkaAdmin>
    )
  }

  const sesi = data.sesi ?? []
  const lain = sesi.filter((s) => !s.sekarang)

  return (
    <KerangkaAdmin judul="Keamanan Akun">
      <KepalaHalaman
        aksi={
          <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
            <Icon name="refresh" className="w-4 h-4" />
            Muat Ulang
          </Tombol>
        }
      >
        <p className="text-sm text-[var(--c-text-muted)]">
          {data.admin.nama} • {data.admin.email} • {data.admin.peran_label}
        </p>
      </KepalaHalaman>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ---------- GANTI PASSWORD ---------- */}
        <Panel
          judul="Ganti Password"
          keterangan="Gunakan password yang kuat dan tidak dipakai di akun lain."
          ikon={<Icon name="lock" className="w-4 h-4" />}
          bodyClass="p-5"
        >
          <form onSubmit={gantiPassword} className="space-y-4">
            <Field
              label="Password lama"
              wajib
              galat={galat.password_lama}
              bantuan="Diminta sebagai bukti bahwa Anda pemilik akun."
            >
              <Input
                type={tampil ? 'text' : 'password'}
                value={form.password_lama}
                onChange={(e) => ubah('password_lama', e.target.value)}
                autoComplete="current-password"
              />
            </Field>

            <Field
              label="Password baru"
              wajib
              galat={galat.password}
              bantuan={`Minimal ${data.min_password} karakter.`}
            >
              <Input
                type={tampil ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => ubah('password', e.target.value)}
                autoComplete="new-password"
              />
            </Field>

            <Field
              label="Ulangi password baru"
              wajib
              galat={galat.password_confirmation}
            >
              <Input
                type={tampil ? 'text' : 'password'}
                value={form.password_confirmation}
                onChange={(e) => ubah('password_confirmation', e.target.value)}
                autoComplete="new-password"
              />
            </Field>

            <label className="flex items-center gap-2 text-[12px] text-[var(--c-text)] cursor-pointer">
              <input
                type="checkbox"
                checked={tampil}
                onChange={(e) => setTampil(e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--c-primary)]"
              />
              Tampilkan password
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Tombol type="submit" memuat={memproses} ukuran="kecil">
                <Icon name="check" className="w-4 h-4" />
                Simpan Password Baru
              </Tombol>
              {data.terakhir_ganti && (
                <p className="text-[11px] text-[var(--c-text-muted)]">
                  Terakhir diganti: {tanggalJam(data.terakhir_ganti)}
                </p>
              )}
            </div>
          </form>
        </Panel>

        {/* ---------- SESI / PERANGKAT ---------- */}
        <Panel
          judul="Perangkat yang Login"
          keterangan="Sesi aktif milik akun Anda."
          ikon={<Icon name="monitor" className="w-4 h-4" />}
          aksi={
            data.pelacakan_sesi && lain.length > 0 ? (
              <Tombol varian="bahaya" ukuran="kecil" onClick={bukaModalKeluar}>
                <Icon name="log-out" className="w-3.5 h-3.5" />
                Akhiri Sesi Lain
              </Tombol>
            ) : null
          }
          bodyClass="p-5"
        >
          {!data.pelacakan_sesi ? (
            <Peringatan warna="informasi" ikon={<Icon name="info" className="w-5 h-5" />}>
              {data.alasan_sesi}
            </Peringatan>
          ) : sesi.length === 0 ? (
            <Kosong
              ikon={<Icon name="monitor" className="w-8 h-8" />}
              judul="Belum ada sesi tercatat"
              deskripsi="Sesi akan muncul setelah Anda membuka panel dari perangkat lain."
            />
          ) : (
            <ul className="space-y-2.5">
              {sesi.map((s) => (
                <li
                  key={s.sesi_id}
                  className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg-subtle)] px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon name="monitor" className="w-4 h-4 text-[var(--c-text-muted)]" />
                    <p className="text-[13px] font-semibold text-[var(--c-text)] flex-1 min-w-0 truncate">
                      {s.perangkat || 'Perangkat tidak dikenal'}
                    </p>
                    {s.sekarang && <Lencana warna="sukses">Perangkat ini</Lencana>}
                  </div>
                  <p className="text-[11px] text-[var(--c-text-muted)] mt-1.5">
                    IP {s.ip_address || '-'} • login {tanggalJam(s.sejak)} • aktif{' '}
                    {tanggalJam(s.terakhir)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {data.pelacakan_sesi && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Tombol varian="sekunder" ukuran="kecil" onClick={bukaModalKeluar}>
                <Icon name="log-out" className="w-3.5 h-3.5" />
                Keluar dari Perangkat Lain / Semua Sesi
              </Tombol>
              <p className="text-[11px] text-[var(--c-text-muted)]">
                {data.jumlah_sesi_lain > 0
                  ? `${data.jumlah_sesi_lain} sesi lain sedang aktif.`
                  : 'Tidak ada sesi lain yang aktif.'}
              </p>
            </div>
          )}
        </Panel>
      </div>

      <Peringatan warna="informasi" ikon={<Icon name="shield-check" className="w-5 h-5" />}>
        Setelah mengganti password, sesi di perangkat lain tetap aktif sampai Anda menekan
        <b> Akhiri Sesi Lain</b>. Lakukan itu bila Anda mencurigai akun dipakai orang lain.
      </Peringatan>

      {/* ---------- MODAL AKHIRI SESI ---------- */}
      <Modal
        buka={modalKeluar}
        onTutup={() => (memprosesKeluar ? null : setModalKeluar(false))}
        judul="Akhiri sesi akun?"
        lebar="max-w-md"
        aksi={
          <>
            <Tombol
              varian="sekunder"
              onClick={() => setModalKeluar(false)}
              disabled={memprosesKeluar}
              className="w-full sm:w-auto"
            >
              Batal
            </Tombol>
            <Tombol
              varian="bahaya"
              onClick={keluarkanSesi}
              memuat={memprosesKeluar}
              disabled={!passwordKeluar}
              className="w-full sm:w-auto"
            >
              Ya, Akhiri Sesi
            </Tombol>
          </>
        }
      >
        <div className="space-y-4">
          <Peringatan warna="peringatan" ikon={<Icon name="warning" className="w-5 h-5" />}>
            Perangkat yang dikeluarkan harus login ulang. Masukkan password akun Anda untuk
            melanjutkan.
          </Peringatan>

          <Field label="Password akun" wajib galat={galatKeluar.password}>
            <Input
              type="password"
              value={passwordKeluar}
              onChange={(e) => setPasswordKeluar(e.target.value)}
              autoComplete="current-password"
            />
          </Field>

          <label className="flex items-start gap-2.5 text-[12px] text-[var(--c-text)] cursor-pointer">
            <input
              type="checkbox"
              checked={semuaSesi}
              onChange={(e) => setSemuaSesi(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-[var(--c-primary)]"
            />
            <span>
              Termasuk perangkat ini
              <span className="block text-[var(--c-text-muted)]">
                Anda akan langsung keluar dan harus login kembali.
              </span>
            </span>
          </label>

          {galatKeluar.password && (
            <p className="text-xs font-semibold text-[var(--c-rose)]">{galatKeluar.password}</p>
          )}
        </div>
      </Modal>
    </KerangkaAdmin>
  )
}
