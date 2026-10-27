import { useEffect, useState } from 'react'
import { useAdminPage } from '../../hooks/useAdminPage'
import { tanggalJam } from '../../lib/format'
import KerangkaAdmin from '../../components/KerangkaAdmin'
import Icon from '../../components/Icon'
import { Kartu, Lencana, Tombol, Kosong } from '../../components/UI'
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
} from '../../components/AdminUI'

/*
 * Catatan aktivitas (audit log). Setara dengan App\Livewire\Admin\AuditLog.
 * Halaman baca-saja — tidak ada tombol aksi selain filter.
 */
const RENTANG = [
  { nilai: '1', label: '24 jam terakhir' },
  { nilai: '7', label: '7 hari terakhir' },
  { nilai: '30', label: '30 hari terakhir' },
  { nilai: '0', label: 'Semua waktu' },
]

export default function AuditLog() {
  const [search, setSearch] = useState('')
  const [searchTunda, setSearchTunda] = useState('')
  const [aksi, setAksi] = useState('')
  const [rentang, setRentang] = useState('7')
  const [page, setPage] = useState(1)

  // Pencarian ditunda 400 ms supaya tidak request di setiap ketikan.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTunda((lama) => {
        const baru = search.trim()
        if (baru !== lama) setPage(1)
        return baru
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const params = new URLSearchParams({ page: String(page) })
  if (searchTunda) params.set('search', searchTunda)
  if (aksi) params.set('filter_aksi', aksi)
  params.set('filter_rentang', rentang)

  const { data, memuat, muatUlang } = useAdminPage(`/admin/audit?${params}`, { izin: 'audit' })

  const catatan = data?.catatan ?? []

  const reset = () => {
    setSearch('')
    setSearchTunda('')
    setAksi('')
    setRentang('7')
    setPage(1)
  }

  const gantiFilter = (setter) => (nilai) => {
    setter(nilai)
    setPage(1)
  }

  return (
    <KerangkaAdmin judul="Catatan Aktivitas">
      <KepalaHalaman
        aksi={
          <>
            <Tombol varian="sekunder" ukuran="kecil" onClick={() => muatUlang()}>
              <Icon name="refresh" className="w-4 h-4" />
              Muat Ulang
            </Tombol>
          </>
        }
      >
        <p className="text-sm text-[var(--c-text-muted)] h-6 flex items-center">
          {memuat ? (
            <MemuatRingkas lebar="w-44" />
          ) : (
            `${data?.meta?.total ?? 0} catatan (total keseluruhan ${data?.total_catatan ?? 0})`
          )}
        </p>
      </KepalaHalaman>

      {/* Filter */}
      <Kartu className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Cari">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nama admin atau keterangan..."
            />
          </Field>

          <Field label="Jenis Aksi">
            <Select value={aksi} onChange={(e) => gantiFilter(setAksi)(e.target.value)}>
              <option value="">Semua aksi</option>
              {(data?.daftar_aksi ?? []).map((a) => (
                <option key={a.kunci} value={a.kunci}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Rentang Waktu">
            <Select value={rentang} onChange={(e) => gantiFilter(setRentang)(e.target.value)}>
              {RENTANG.map((r) => (
                <option key={r.nilai} value={r.nilai}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end">
            <Tombol varian="sekunder" onClick={reset} className="w-full">
              <Icon name="refresh" className="w-4 h-4" />
              Reset Filter
            </Tombol>
          </div>
        </div>
      </Kartu>

      {memuat && !data && <Memuat tinggi="h-96" />}

      {!memuat && catatan.length === 0 && (
        <Kosong
          ikon={<Icon name="clock" className="w-12 h-12" />}
          judul="Tidak Ada Catatan"
          deskripsi="Tidak ada aktivitas yang cocok dengan filter."
        />
      )}

      {catatan.length > 0 && (
        <Kartu className="overflow-hidden">
          <Tabel
          kolom={['Waktu', 'Admin', 'Aksi', 'Keterangan', 'IP']}
          sematkan={1}
        >
            {catatan.map((c) => (
              <Baris key={c.id}>
                <Sel className="text-[var(--c-text-muted)] text-xs whitespace-nowrap">
                  {tanggalJam(c.waktu)}
                </Sel>
                <Sel className="font-semibold whitespace-nowrap">{c.nama_admin}</Sel>
                <Sel>
                  <Lencana warna={warnaLencana(c.warna)}>{c.label}</Lencana>
                </Sel>
                <Sel className="text-[var(--c-text-muted)] text-xs min-w-[14rem] break-words">
                  {c.deskripsi || '-'}
                </Sel>
                <Sel className="text-[var(--c-text-muted)] text-xs font-mono whitespace-nowrap">
                  {c.ip_address || '-'}
                </Sel>
              </Baris>
            ))}
          </Tabel>
          <Paginasi meta={data.meta} onGanti={setPage} />
        </Kartu>
      )}
    </KerangkaAdmin>
  )
}

/** Warna dari backend (emerald/amber/red/sky/slate) -> warna Lencana. */
function warnaLencana(warna) {
  return (
    {
      emerald: 'sukses',
      amber: 'peringatan',
      red: 'bahaya',
      sky: 'informasi',
    }[warna] ?? 'netral'
  )
}
