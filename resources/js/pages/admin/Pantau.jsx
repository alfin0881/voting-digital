import { useState } from 'react'
import { angka, persen, tanggalJam } from '../../lib/format'
import { useAdminPage } from '../../hooks/useAdminPage'
import { useApp } from '../../context/AppContext'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Icon from '../../components/Icon'
import { Peringatan, Tombol } from '../../components/UI'
import {
  KartuStatistik,
  GrafikBatang,
  BarisProgres,
  Memuat,
  KepalaHalaman,
  Field,
  Select,
  Panel,
} from '../../components/AdminUI'

/*
 * Pantau partisipasi. Setara dengan App\Livewire\Admin\PantauPartisipasi.
 *
 * Halaman ini sengaja hanya menampilkan ANGKA AGREGAT: total, sudah/belum,
 * laju suara, tren per jam, dan progres per kelas. Daftar nama pemilih tidak
 * ditampilkan di sini karena rincian per pemilih sudah tersedia di Kelola
 * Pemilih — sekaligus menjaga polling 15 detik tetap ringan.
 *
 * SENGAJA tidak menampilkan pilihan kandidat siapa pun — suara bersifat rahasia.
 */
export default function Pantau() {
  const { sesi } = useApp()

  // Ikuti pilihan dari URL (mis. tautan /admin/pantau?pemilihan=3). Kalau URL
  // tidak menyebut pemilihan, server memilih pemilihan aktif terbaru; pilihan
  // itu dibaca dari `data.pemilihan` di bawah agar UI tidak kosong.
  const [pemilihan, setPemilihan] = useState(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('pemilihan') ?? ''
  })

  const params = new URLSearchParams()
  if (pemilihan) params.set('pemilihan', pemilihan)

  const { data, memuat, muatUlang } = useAdminPage(`/admin/pantau?${params}`, {
    izin: 'pantau',
    polling: 15000,
  })

  const r = data?.ringkasan ?? { total: 0, sudah: 0, belum: 0, persen: 0 }

  // Pemilihan yang benar-benar dipakai server. Saat filter belum disentuh,
  // `pemilihan` kosong dan server memakai default aktif; tampilkan default itu
  // di dropdown supaya datanya langsung terlihat.
  const idPemilihan = pemilihan || String(data?.pemilihan?.id ?? '')

  // Tautan ke Kelola Pemilih hanya untuk peran yang memang punya izinnya.
  const bolehKelolaPemilih = Array.isArray(sesi.izin) && sesi.izin.includes('anggota')

  return (
    <KerangkaAdmin judul="Pantau Partisipasi">
      <KepalaHalaman
        aksi={
          <>
            {bolehKelolaPemilih && (
              <Tombol href="/admin/anggota" varian="sekunder" ukuran="kecil">
                <Icon name="users" className="w-4 h-4" />
                Kelola Pemilih
              </Tombol>
            )}
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" />
              Muat Ulang
            </Tombol>
          </>
        }
      >
        <p className="text-sm text-[var(--c-text-muted)]">
          {data?.pemilihan ? data.pemilihan.nama : 'Pilih pemilihan'}
          {memuat ? ' • memuat...' : ''}
        </p>
      </KepalaHalaman>

      {/* Pemilihan yang dipantau */}
      <div className="kasya-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="w-full sm:max-w-xs">
            <Field label="Pemilihan">
              <Select
                value={data?.pemilihan ? idPemilihan : ''}
                onChange={(e) => setPemilihan(e.target.value)}
              >
                <option value="" disabled>
                  {(data?.daftar_pemilihan ?? []).length === 0
                    ? 'Tidak ada pemilihan'
                    : '-- Pilih pemilihan --'}
                </option>
                {(data?.daftar_pemilihan ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <p className="text-xs text-[var(--c-text-muted)] sm:pb-3 max-w-lg">
            Ringkasan diperbarui otomatis tiap 15 detik.
            {bolehKelolaPemilih && ' Rincian status per pemilih ada di Kelola Pemilih.'}
          </p>
        </div>
      </div>

      {!data?.pemilihan && !memuat && (
        <Peringatan warna="informasi" ikon={<Icon name="info" className="w-5 h-5" />}>
          Belum ada pemilihan yang bisa dipantau. Tambahkan pemilihan terlebih dahulu.
        </Peringatan>
      )}

      {idPemilihan && memuat && !data && <Memuat />}

      {data?.pemilihan && (
        <div className="space-y-6">
          {/* Ringkasan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KartuStatistik
              label="Total Peserta"
              nilai={angka(r.total)}
              ikon={<Icon name="users" className="w-5 h-5" />}
            />
            <KartuStatistik
              label="Sudah Memilih"
              nilai={angka(r.sudah)}
              sub={`${persen(r.persen)} partisipasi`}
              ikon={<Icon name="check-circle" className="w-5 h-5" />}
              warna="sukses"
            />
            <KartuStatistik
              label="Belum Memilih"
              nilai={angka(r.belum)}
              ikon={<Icon name="clock" className="w-5 h-5" />}
              warna="peringatan"
            />
            <KartuStatistik
              label="Suara 5 menit terakhir"
              nilai={angka(data.laju?.per_5menit ?? 0)}
              sub={`${angka(data.laju?.per_menit ?? 0)} per menit`}
              ikon={<Icon name="bar-chart" className="w-5 h-5" />}
              warna="netral"
            />
          </div>

          {/* Tren */}
          <Panel
            judul="Tren Partisipasi per Jam"
            keterangan="Wilayah Waktu Barat Indonesia"
            ikon={<Icon name="bar-chart" className="w-4 h-4" />}
          >
            <GrafikBatang
              label={data.tren?.label ?? []}
              data={data.tren?.data ?? []}
              tinggi={240}
              sorotTerakhir
            />
            {data.laju?.terakhir && (
              <p className="text-xs text-[var(--c-text-muted)] mt-3">
                Suara terakhir masuk: {tanggalJam(data.laju.terakhir)}
              </p>
            )}
          </Panel>

          {/* Progres per kelas */}
          <Panel judul="Progres per Kelas" ikon={<Icon name="users" className="w-4 h-4" />}>
            {data.per_kelas.length === 0 ? (
              <p className="text-sm text-[var(--c-text-muted)] text-center py-6">
                Belum ada peserta terdaftar.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.per_kelas.map((k) => (
                  <BarisProgres
                    key={k.kelas}
                    label={k.kelas}
                    sudah={k.sudah}
                    total={k.total}
                    persen={k.persen}
                    warna={k.persen >= 80 ? 'gradient' : k.persen >= 50 ? 'primary' : 'bahaya'}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </KerangkaAdmin>
  )
}
