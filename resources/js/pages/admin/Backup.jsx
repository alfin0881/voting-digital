import { useEffect, useState } from 'react'
import api from '../../lib/api'
import { petaGalat } from '../../lib/validasi'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import { angka, tanggalJam } from '../../lib/format'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Kartu, Lencana, Tombol, Peringatan, Kosong } from '../../components/UI'
import {
  KepalaHalaman,
  Memuat,
  MemuatRingkas,
  Tabel,
  Baris,
  Sel,
  Field,
  Input,
  KartuStatistik,
  KonfirmasiHapus,
} from '../../components/AdminUI'

/*
 * Halaman Backup. Setara dengan App\Livewire\Admin\BackupDatabase.
 *
 * Catatan penting: unduhan .sql (backup) & berkas hasil tugas latar
 * DILAYANI LARAVAN (bukan React), karena hasilnya berupa file, bukan halaman.
 */
export default function Backup() {
  const { data, memuat, muatUlang } = useAdminPage('/admin/backup', { izin: 'backup' })
  const { jalankan, memuat: memproses } = useAksiAdmin()

  const [jadwal, setJadwal] = useState(null)
  const [galat, setGalat] = useState({})
  const [hapusTugas, setHapusTugas] = useState(null)

  // Restore database: form terpisah karena butuh konfirmasi ketat.
  const [pulihkan, setPulihkan] = useState(null)
  const [formPulihkan, setFormPulihkan] = useState({
    konfirmasi: '',
    password: '',
    cadangkan_dulu: true,
  })
  const [galatPulihkan, setGalatPulihkan] = useState({})
  const [memprosesPulihkan, setMemprosesPulihkan] = useState(false)

  // Isi form jadwal dari data server saat halaman dimuat.
  // (Pakai useEffect, bukan setState di tengah render — yang itu bikin render berulang.)
  useEffect(() => {
    if (!data) return
    setJadwal({
      aktif: data.jadwal.aktif,
      jam: data.jadwal.jam,
      retensi: data.jadwal.retensi,
    })
  }, [data])

  const simpanJadwal = async () => {
    setGalat({})
    try {
      await jalankan(() => api.post('/admin/backup/jadwal', jadwal))
      muatUlang()
    } catch (e) {
      setGalat(petaGalat(e))
    }
  }

  const jalankanBackup = async () => {
    try {
      await jalankan(() => api.post('/admin/backup/jalankan'))
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  const konfirmasiHapusTugas = async () => {
    if (!hapusTugas) return
    try {
      await jalankan(() => api.delete(`/admin/backup/tugas/${hapusTugas.id}`), {
        sukses: 'Tugas dihapus.',
      })
      setHapusTugas(null)
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  const bukaPulihkan = (file) => {
    setGalatPulihkan({})
    setFormPulihkan({ konfirmasi: '', password: '', cadangkan_dulu: true })
    setPulihkan(file)
  }

  const jalankanPulihkan = async () => {
    if (!pulihkan) return

    setGalatPulihkan({})
    setMemprosesPulihkan(true)

    try {
      await jalankan(
        () =>
          api.post('/admin/backup/pulihkan', {
            nama: pulihkan.nama,
            konfirmasi: formPulihkan.konfirmasi,
            password: formPulihkan.password,
            cadangkan_dulu: formPulihkan.cadangkan_dulu,
          }),
        { sukses: 'Database berhasil dipulihkan.' },
      )

      setPulihkan(null)
      muatUlang()
    } catch (e) {
      setGalatPulihkan(petaGalat(e))
    } finally {
      setMemprosesPulihkan(false)
    }
  }

  const tugas = data?.tugas ?? []
  const daftarBackup = data?.daftar_backup ?? []

  return (
    <KerangkaAdmin judul="Backup">
      <KepalaHalaman
        aksi={
          <>
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" />
              Muat Ulang
            </Tombol>
            <Tombol href="/unduh/backup" varian="sekunder" ukuran="kecil">
              <Icon name="download" className="w-4 h-4" />
              Unduh Backup
            </Tombol>
            <Tombol onClick={jalankanBackup} memuat={memproses} disabled={data?.driver !== 'mysql'}>
              <Icon name="database" className="w-4 h-4" />
              Backup Sekarang
            </Tombol>
          </>
        }
      >
        <p className="text-sm text-[var(--c-text-muted)] h-6 flex items-center">
          {data ? (
            `${data.nama_database} • ukuran ${data.ukuran}`
          ) : (
            <MemuatRingkas lebar="w-40" />
          )}
        </p>
      </KepalaHalaman>

      {memuat && !data && <Memuat tinggi="h-96" />}

      {data && (
        <div className="space-y-6">
          {data.driver !== 'mysql' && (
            <Peringatan warna="peringatan" ikon={<Icon name="warning" className="w-5 h-5" />}>
              Driver database saat ini <b>{data.driver}</b>. Backup otomatis hanya berjalan di
              MySQL/MariaDB.
            </Peringatan>
          )}

          <Peringatan warna="informasi" ikon={<Icon name="lock" className="w-5 h-5" />}>
            Semua backup baru <b>dienkripsi dengan APP_KEY</b> dan berakhiran{' '}
            <code className="text-xs">.sql.enc</code>. File lama{' '}
            <code className="text-xs">.sql</code> masih bisa diunduh/dihapus, tetapi tidak bisa
            dipulihkan dari halaman ini.
          </Peringatan>

          {/* Statistik */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KartuStatistik
              label="Ukuran Database"
              nilai={data.ukuran}
              ikon={<Icon name="database" className="w-5 h-5" />}
            />
            <KartuStatistik
              label="Jumlah Tabel"
              nilai={angka(data.jumlah_tabel)}
              ikon={<Icon name="inbox" className="w-5 h-5" />}
              warna="netral"
            />
            <KartuStatistik
              label="File Backup"
              nilai={angka(daftarBackup.length)}
              sub={`retensi ${jadwal?.retensi ?? data.jadwal.retensi} file`}
              ikon={<Icon name="inbox" className="w-5 h-5" />}
              warna="sukses"
            />
            <KartuStatistik
              label="Backup Terjadwal"
              nilai={jadwal?.aktif ? 'Aktif' : 'Mati'}
              sub={
                jadwal?.aktif
                  ? `setiap hari ${String(jadwal.jam).padStart(2, '0')}:00`
                  : 'tidak aktif'
              }
              ikon={<Icon name="clock" className="w-5 h-5" />}
              warna={jadwal?.aktif ? 'sukses' : 'netral'}
            />
          </div>

          {/* Jadwal */}
          {jadwal && (
            <Kartu className="p-5 sm:p-6">
              <h2 className="font-bold text-[var(--c-text)] mb-4">Backup Terjadwal</h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <Field label="Status">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={jadwal.aktif}
                      onChange={(e) => setJadwal({ ...jadwal, aktif: e.target.checked })}
                      className="w-5 h-5 rounded accent-[var(--c-primary)]"
                    />
                    <span className="text-sm text-[var(--c-text)]">
                      {jadwal.aktif ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </label>
                </Field>

                <Field label="Jam Backup" galat={galat.jam}>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={jadwal.jam}
                    onChange={(e) => setJadwal({ ...jadwal, jam: e.target.value })}
                  />
                </Field>

                <Field
                  label="Retensi (jumlah file)"
                  galat={galat.retensi}
                  bantuan="File lama otomatis dihapus."
                >
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={jadwal.retensi}
                    onChange={(e) => setJadwal({ ...jadwal, retensi: e.target.value })}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Tombol onClick={simpanJadwal} memuat={memproses} ukuran="kecil">
                  Simpan Pengaturan
                </Tombol>
                {data.jadwal.terakhir && (
                  <p className="text-xs text-[var(--c-text-muted)]">
                    Terakhir jalan: {tanggalJam(data.jadwal.terakhir)}
                  </p>
                )}
              </div>

              <Peringatan
                warna="informasi"
                ikon={<Icon name="info" className="w-5 h-5" />}
                className="mt-4"
              >
                Jadwal berjalan bila server menjalankan{' '}
                <code className="text-xs">schedule:work</code> (dev) atau cron{' '}
                <code className="text-xs">schedule:run</code> tiap menit.
              </Peringatan>
            </Kartu>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Daftar tabel */}
            <Kartu className="p-5 sm:p-6">
              <h2 className="font-bold text-[var(--c-text)] mb-3">Tabel dalam Database</h2>
              <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                {data.daftar_tabel.map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-1 rounded-lg bg-[var(--c-bg-page)] border border-[var(--c-border)] text-xs text-[var(--c-text-muted)] font-mono"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Kartu>

            {/* File backup */}
            <Kartu className="p-5 sm:p-6">
              <h2 className="font-bold text-[var(--c-text)] mb-1">File Backup di Server</h2>
              <p className="text-xs text-[var(--c-text-muted)] mb-3">
                {data.boleh_pulihkan
                  ? 'Super Admin dapat memulihkan database dari file terenkripsi.'
                  : 'Pemulihan database hanya dapat dilakukan Super Admin.'}
              </p>
              {daftarBackup.length === 0 ? (
                <p className="text-sm text-[var(--c-text-muted)]">Belum ada file backup.</p>
              ) : (
                <ul className="space-y-2 max-h-72 overflow-y-auto">
                  {daftarBackup.map((b) => (
                    <li
                      key={b.nama}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm rounded-xl border border-[var(--c-border)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-[var(--c-text)] truncate" title={b.nama}>
                          {b.nama}
                        </p>
                        <p className="text-[var(--c-text-muted)] text-[11px] mt-0.5">
                          {b.ukuran} • {tanggalJam(b.waktu)} •{' '}
                          {b.terenkripsi ? 'Terenkripsi' : 'Tidak terenkripsi (lama)'}
                        </p>
                      </div>

                      {b.bisa_dipulihkan ? (
                        <Tombol
                          varian="sekunder"
                          ukuran="kecil"
                          onClick={() => bukaPulihkan(b)}
                        >
                          <Icon name="refresh" className="w-3.5 h-3.5" />
                          Pulihkan
                        </Tombol>
                      ) : (
                        <Lencana warna={b.terenkripsi ? 'netral' : 'peringatan'}>
                          {b.terenkripsi ? 'Terenkripsi' : 'Lama'}
                        </Lencana>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {data.restore_terakhir && (
                <p className="mt-3 text-[11px] text-[var(--c-text-muted)]">
                  Restore terakhir: {tanggalJam(data.restore_terakhir.waktu)} —{' '}
                  {data.restore_terakhir.deskripsi}
                </p>
              )}
            </Kartu>
          </div>

          {/* Tugas latar belakang */}
          <Kartu className="overflow-hidden">
            <div className="p-5 border-b border-[var(--c-border)]">
              <h2 className="font-bold text-[var(--c-text)]">Tugas Latar Belakang</h2>
              <p className="text-xs text-[var(--c-text-muted)]">
                Impor & ekspor besar dijalankan di server supaya halaman tidak timeout.
              </p>
            </div>

            {tugas.length === 0 ? (
              <Kosong pesan="Belum ada tugas latar belakang." ikon="clipboard-check" />
            ) : (
              <Tabel kolom={['Judul', 'Jenis', 'Status', 'Pesan', 'Dibuat', 'Aksi']} sematkan={1}>
                {tugas.map((t) => (
                  <Baris key={t.id}>
                    <Sel className="font-semibold">{t.judul}</Sel>
                    <Sel className="text-[var(--c-text-muted)] text-xs">{t.jenis}</Sel>
                    <Sel>
                      <Lencana
                        warna={
                          t.warna === 'emerald'
                            ? 'sukses'
                            : t.warna === 'red'
                              ? 'bahaya'
                              : t.warna === 'sky'
                                ? 'informasi'
                                : 'netral'
                        }
                      >
                        {t.status_label}
                      </Lencana>
                    </Sel>
                    <Sel className="text-[var(--c-text-muted)] text-xs max-w-[240px]">
                      <span className="block truncate" title={t.pesan || undefined}>
                        {t.pesan || '-'}
                      </span>
                    </Sel>
                    <Sel className="text-[var(--c-text-muted)] text-xs whitespace-nowrap">
                      {tanggalJam(t.dibuat)}
                    </Sel>
                    <Sel>
                      <div className="flex gap-1.5">
                        {t.siap_diunduh && (
                          <Tombol href={`/unduh/tugas/${t.id}`} varian="sekunder" ukuran="kecil">
                            Unduh
                          </Tombol>
                        )}
                        <Tombol varian="bahaya" ukuran="kecil" onClick={() => setHapusTugas(t)}>
                          Hapus
                        </Tombol>
                      </div>
                    </Sel>
                  </Baris>
                ))}
              </Tabel>
            )}
          </Kartu>
        </div>
      )}

      <KonfirmasiHapus
        buka={!!hapusTugas}
        onTutup={() => setHapusTugas(null)}
        onYa={konfirmasiHapusTugas}
        judul="Hapus tugas ini?"
        pesan={`Tugas "${hapusTugas?.judul}" dan berkas hasilnya akan dihapus.`}
        memuat={memproses}
      />

      {/* ---------- RESTORE DATABASE (konfirmasi ketat) ---------- */}
      <Modal
        buka={!!pulihkan}
        onTutup={() => (memprosesPulihkan ? null : setPulihkan(null))}
        judul="Pulihkan database dari backup?"
        lebar="max-w-lg"
        aksi={
          <>
            <Tombol
              varian="sekunder"
              onClick={() => setPulihkan(null)}
              disabled={memprosesPulihkan}
              className="w-full sm:w-auto"
            >
              Batal
            </Tombol>
            <Tombol
              varian="bahaya"
              onClick={jalankanPulihkan}
              memuat={memprosesPulihkan}
              disabled={
                formPulihkan.konfirmasi.trim() !== pulihkan?.nama || !formPulihkan.password
              }
              className="w-full sm:w-auto"
            >
              Ya, Timpa Database
            </Tombol>
          </>
        }
      >
        <div className="space-y-4">
          <Peringatan warna="bahaya" ikon={<Icon name="warning" className="w-5 h-5" />}>
            <b>Tindakan ini menimpa seluruh data saat ini.</b> Semua pemilihan, suara,
            partisipasi, akun admin, dan pengaturan akan diganti dengan isi file backup.
            Pastikan Anda sudah memiliki backup pengaman.
          </Peringatan>

          <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg-subtle)] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--c-text-muted)]">
              File yang dipulihkan
            </p>
            <p className="font-mono text-xs text-[var(--c-text)] break-all mt-1">
              {pulihkan?.nama}
            </p>
          </div>

          <Field
            label="Ketik ulang nama file"
            wajib
            galat={galatPulihkan.konfirmasi}
            bantuan="Harus sama persis, termasuk ekstensi .sql.enc."
          >
            <Input
              value={formPulihkan.konfirmasi}
              onChange={(e) =>
                setFormPulihkan((f) => ({ ...f, konfirmasi: e.target.value }))
              }
              placeholder={pulihkan?.nama}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <Field
            label="Password akun Anda"
            wajib
            galat={galatPulihkan.password}
            bantuan="Diperlukan untuk memastikan tindakan ini dilakukan pemilik akun."
          >
            <Input
              type="password"
              value={formPulihkan.password}
              onChange={(e) => setFormPulihkan((f) => ({ ...f, password: e.target.value }))}
              autoComplete="current-password"
            />
          </Field>

          <label className="flex items-start gap-2.5 text-[12px] text-[var(--c-text)] cursor-pointer">
            <input
              type="checkbox"
              checked={formPulihkan.cadangkan_dulu}
              onChange={(e) =>
                setFormPulihkan((f) => ({ ...f, cadangkan_dulu: e.target.checked }))
              }
              className="mt-0.5 w-4 h-4 rounded accent-[var(--c-primary)]"
            />
            <span>
              Buat backup pengaman otomatis sebelum restore{' '}
              <span className="text-[var(--c-text-muted)]">(sangat disarankan)</span>
            </span>
          </label>

          {galatPulihkan.nama && (
            <p className="text-xs font-semibold text-[var(--c-rose)]">{galatPulihkan.nama}</p>
          )}
        </div>
      </Modal>
    </KerangkaAdmin>
  )
}
