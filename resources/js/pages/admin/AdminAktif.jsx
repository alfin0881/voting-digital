import { useState } from 'react'
import api from '../../lib/api'
import { useAdminPage, useAksiAdmin } from '../../hooks/useAdminPage'
import { angka } from '../../lib/format'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { Kartu, Lencana, Tombol, Kosong, Peringatan } from '../../components/UI'
import { KepalaHalaman, Memuat, Tabel, Baris, Sel, KartuStatistik } from '../../components/AdminUI'

/*
 * Admin/panitia yang SEDANG login ke panel, plus aksi memutus sesinya.
 *
 * Sengaja dipisah dari halaman "Sesi Aktif" (yang khusus pemilih di komputer
 * lab) supaya tidak bercampur.
 *
 * Backend: App\Http\Controllers\Api\AdminAktifController. Sesi admin tidak
 * bisa dibaca dari tabel `sessions` (payload-nya terenkripsi), jadi dilacak
 * sendiri di tabel `sesi_admin` — lihat App\Support\LacakSesiAdmin.
 *
 * Halaman ini KESELURUHAN hanya untuk Super Admin (izin 'sesi_admin'). Menu,
 * pencarian perintah, dan endpoint-nya memakai izin yang sama, jadi peran lain
 * tidak pernah melihat halaman ini sama sekali.
 *
 * Butuh SESSION_DRIVER=database. Kalau tidak, backend mengirim
 * { tersedia: false } beserta cara mengaktifkannya.
 */
export default function AdminAktif() {
  const { data, memuat, muatUlang } = useAdminPage('/admin/admin-aktif', { izin: 'sesi_admin' })
  const { jalankan, memuat: memproses } = useAksiAdmin()
  const [konfirmasi, setKonfirmasi] = useState(null)

  const keluarkan = async () => {
    if (!konfirmasi) return
    try {
      await jalankan(konfirmasi.aksi)
      setKonfirmasi(null)
      muatUlang()
    } catch {
      /* toast sudah tampil */
    }
  }

  const sesi = data?.sesi ?? []
  const sesiLain = sesi.filter((s) => !s.saya)

  return (
    <KerangkaAdmin judul="Admin Aktif">
      <KepalaHalaman
        aksi={
          <>
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" />
              Muat Ulang
            </Tombol>
            {data?.tersedia && sesiLain.length > 0 && (
              <Tombol
                varian="bahaya"
                ukuran="kecil"
                onClick={() =>
                  setKonfirmasi({
                    judul: 'Keluarkan semua admin lain?',
                    pesan: `Semua ${sesiLain.length} sesi admin/panitia lain akan diputus. Tab mereka langsung kembali ke halaman login, termasuk yang sedang mengerjakan tugas.`,
                    aksi: () => api.delete('/admin/admin-aktif'),
                    peringatan:
                      'Sesi Anda sendiri tidak terpengaruh. Gunakan setelah acara selesai supaya tablet/PC tidak tertinggal terbuka.',
                  })
                }
              >
                Keluarkan Semua Admin
              </Tombol>
            )}
          </>
        }
      >
        <p className="text-sm text-[var(--c-text-muted)]">
          {data?.tersedia
            ? `${sesi.length} admin/panitia sedang login`
            : 'Fitur butuh SESSION_DRIVER=database'}
        </p>
      </KepalaHalaman>

      {memuat && !data && <Memuat />}

      {data && !data.tersedia && (
        <Kartu className="p-10 text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/15 flex items-center justify-center">
            <Icon name="warning" className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-[var(--c-text)] mb-2">Fitur tidak tersedia</h2>
          <p className="text-[var(--c-text-muted)] text-sm max-w-lg mx-auto">
            {data.alasan ||
              'Ubah SESSION_DRIVER=database di file .env agar sesi bisa dilacak dari server.'}
          </p>
        </Kartu>
      )}

      {data?.tersedia && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <KartuStatistik
              label="Admin Aktif"
              nilai={angka(sesi.length)}
              sub={`${sesiLain.length} selain Anda`}
              ikon={<Icon name="shield-check" className="w-5 h-5" />}
              warna="sukses"
            />
            <KartuStatistik
              label="Dapat Dikeluarkan"
              nilai={angka(sesiLain.length)}
              sub="Sesi admin lain yang aktif"
              ikon={<Icon name="log-out" className="w-5 h-5" />}
              warna={sesiLain.length > 0 ? 'bahaya' : 'netral'}
            />
          </div>


          {sesi.length === 0 ? (
            <Kosong
              ikon={<Icon name="shield" className="w-12 h-12" />}
              judul="Tidak Ada Admin Aktif"
              deskripsi="Belum ada admin/panitia yang sedang login. Panel sedang tidak dipakai siapa pun selain Anda."
            />
          ) : (
            <Kartu className="overflow-hidden">
              <Tabel kolom={['Admin', 'Peran', 'Perangkat', 'IP', 'Aktivitas', 'Aksi']}>
                {sesi.map((s) => (
                  <Baris key={s.sesi_id}>
                    <Sel>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{s.nama}</span>
                        {s.saya && <Lencana warna="sukses">Sesi Anda</Lencana>}
                      </div>
                      <p className="text-xs text-[var(--c-text-muted)]">{s.email || '-'}</p>
                    </Sel>
                    <Sel>
                      <Lencana warna={s.peran === 'super_admin' ? 'bahaya' : 'netral'}>
                        {s.label_peran}
                      </Lencana>
                    </Sel>
                    <Sel className="text-[var(--c-text-muted)] text-xs">
                      {s.perangkat || '-'}
                      <p className="text-xs opacity-70">login {formatWaktu(s.sejak)}</p>
                    </Sel>
                    <Sel className="text-[var(--c-text-muted)] font-mono text-xs">
                      {s.ip_address || '-'}
                    </Sel>
                    <Sel>
                      <span
                        className={s.diam > 60 ? 'text-amber-500' : 'text-[var(--c-text-muted)]'}
                      >
                        {formatDiam(s.diam)} lalu
                      </span>
                      <p className="text-xs text-[var(--c-text-muted)]">
                        {formatDurasi(s.durasi)} di panel
                      </p>
                    </Sel>
                    <Sel>
                      {s.saya ? (
                        <span className="text-xs text-[var(--c-text-muted)]">—</span>
                      ) : (
                        <Tombol
                          varian="bahaya"
                          ukuran="kecil"
                          onClick={() =>
                            setKonfirmasi({
                              judul: 'Keluarkan sesi admin ini?',
                              pesan: `Sesi ${s.nama} (${s.label_peran}) akan diputus. Tabnya langsung kembali ke halaman login dan pekerjaan yang belum disimpan bisa hilang.`,
                              aksi: () => api.delete(`/admin/admin-aktif/${s.sesi_id}`),
                              peringatan:
                                'Sesi Anda sendiri tidak terpengaruh. Passwordnya tidak berubah, jadi admin tersebut bisa login lagi kapan saja.',
                            })
                          }
                        >
                          Keluarkan
                        </Tombol>
                      )}
                    </Sel>
                  </Baris>
                ))}
              </Tabel>
            </Kartu>
          )}
        </div>
      )}

      <Modal
        buka={!!konfirmasi}
        onTutup={() => setKonfirmasi(null)}
        judul={konfirmasi?.judul || 'Keluarkan sesi?'}
        lebar="max-w-md"
        aksi={
          <>
            <Tombol
              varian="sekunder"
              onClick={() => setKonfirmasi(null)}
              className="w-full sm:w-auto"
            >
              Batal
            </Tombol>
            <Tombol
              varian="bahaya"
              onClick={keluarkan}
              memuat={memproses}
              className="w-full sm:w-auto"
            >
              Ya, Keluarkan
            </Tombol>
          </>
        }
      >
        <p className="text-[var(--c-text-muted)]">{konfirmasi?.pesan}</p>
        <Peringatan
          warna="peringatan"
          ikon={<Icon name="warning" className="w-5 h-5" />}
          className="mt-4"
        >
          {konfirmasi?.peringatan || 'Sesi kamu sendiri tidak akan terpengaruh.'}
        </Peringatan>
      </Modal>
    </KerangkaAdmin>
  )
}

/** Detik -> "45 detik" / "3 menit" / "5 jam" */
function formatDiam(detik) {
  const s = Math.max(0, Number(detik) || 0)
  if (s < 60) return `${s} detik`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} menit`
  return `${Math.floor(m / 60)} jam`
}

/** Unix timestamp -> "08:30" (jam lokal browser). */
function formatWaktu(detik) {
  if (! detik) return '-'
  return new Date(detik * 1000).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Durasi dalam detik -> "1j 5m" (kolom "di panel"). */
function formatDurasi(detik) {
  const s = Math.max(0, Number(detik) || 0)
  const j = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)

  if (j > 0) return `${j}j ${m}m`
  if (m > 0) return `${m}m`
  return `${s} detik`
}