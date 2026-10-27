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
 * Sesi PEMILIH yang sedang aktif di komputer lab + logout paksa.
 *
 * Sengaja TIDAK bercampur dengan sesi admin/panitia: yang punya halaman
 * tersendiri, yaitu "Admin Aktif" (/admin/admin-aktif).
 *
 * Halaman ini butuh SESSION_DRIVER=database. Kalau tidak, backend mengirim
 * { tersedia: false } dan halaman menjelaskan cara mengaktifkannya.
 */
export default function SesiAktif() {
  const { data, memuat, muatUlang } = useAdminPage('/admin/sesi', { izin: 'sesi' })
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
  const ganda = data?.ganda ?? []

  return (
    <KerangkaAdmin judul="Sesi Aktif">
      <KepalaHalaman
        aksi={
          <>
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" />
              Muat Ulang
            </Tombol>
            {data?.tersedia && sesi.length > 0 && (
              <Tombol
                varian="bahaya"
                ukuran="kecil"
                onClick={() =>
                  setKonfirmasi({
                    judul: 'Keluarkan semua sesi pemilih?',
                    pesan: `Semua ${sesi.length} sesi pemilih akan dikeluarkan paksa. Pemilih yang sedang memilih mungkin kehilangan suaranya.`,
                    aksi: () => api.delete('/admin/sesi'),
                    peringatan: 'Sesi admin kamu sendiri tidak akan terpengaruh.',
                  })
                }
              >
                Keluarkan Semua
              </Tombol>
            )}
          </>
        }
      >
        <p className="text-sm text-[var(--c-text-muted)]">
          {data?.tersedia
            ? `${sesi.length} pemilih sedang login`
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
              label="Pemilih Aktif"
              nilai={angka(sesi.length)}
              sub={`Idle timeout ${data.idle_timeout} detik`}
              ikon={<Icon name="monitor" className="w-5 h-5" />}
              warna="sukses"
            />
            <KartuStatistik
              label="NIS Login Ganda"
              nilai={angka(ganda.length)}
              sub="NIS yang login di >1 komputer"
              ikon={<Icon name="users" className="w-5 h-5" />}
              warna={ganda.length > 0 ? 'bahaya' : 'netral'}
            />
          </div>

          {sesi.length === 0 ? (
            <Kosong
              ikon={<Icon name="monitor" className="w-12 h-12" />}
              judul="Tidak Ada Pemilih Aktif"
              deskripsi="Belum ada pemilih yang sedang login."
            />
          ) : (
            <Kartu className="overflow-hidden">
              <Tabel kolom={['Pemilih', 'Kelas', 'IP', 'Aktivitas Terakhir', 'Aksi']}>
                {sesi.map((s) => {
                  const gandaMasuk = ganda.includes(s.pemilih_id)

                  return (
                    <Baris key={s.sesi_id}>
                      <Sel>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{s.nama}</span>
                          {gandaMasuk && <Lencana warna="bahaya">NIS Ganda</Lencana>}
                        </div>
                        <p className="text-xs text-[var(--c-text-muted)]">NIS {s.nis}</p>
                      </Sel>
                      <Sel className="text-[var(--c-text-muted)]">{s.kelas || '-'}</Sel>
                      <Sel className="text-[var(--c-text-muted)] font-mono text-xs">
                        {s.ip_address}
                      </Sel>
                      <Sel>
                        <span
                          className={s.diam > 60 ? 'text-amber-500' : 'text-[var(--c-text-muted)]'}
                        >
                          {formatDiam(s.diam)} lalu
                        </span>
                      </Sel>
                      <Sel>
                        <Tombol
                          varian="bahaya"
                          ukuran="kecil"
                          onClick={() =>
                            setKonfirmasi({
                              judul: 'Keluarkan sesi pemilih ini?',
                              pesan: `Sesi milik ${s.nama} (NIS ${s.nis}) akan dikeluarkan paksa.`,
                              aksi: () => api.delete(`/admin/sesi/${s.sesi_id}`),
                              peringatan: 'Sesi admin kamu sendiri tidak akan terpengaruh.',
                            })
                          }
                        >
                          Keluarkan
                        </Tombol>
                      </Sel>
                    </Baris>
                  )
                })}
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
