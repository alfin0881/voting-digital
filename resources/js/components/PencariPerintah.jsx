import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '../lib/navigasi'
import Icon from './Icon'
import { kunciScroll } from '../lib/kunciScroll'

/*
 * Command palette (Ctrl+K / Cmd+K).
 *
 * Admin punya 11 halaman; mencari lewat klik sidebar cukup cepat tetapi
 * melelahkan saat sedang panik di hari-H. Palette ini memangkas itu:
 * ketik beberapa huruf, tekan Enter.
 *
 * Sifat penting:
 * - Hanya menampilkan halaman & aksi yang memang boleh diakses peran ini,
 *   jadi tidak pernah menampilkan shortcut yang nanti ditolak 403.
 * - Mengunci scroll halaman, menutup dengan Esc / klik di luar, dan mengembalikan
 *   fokus ke pemicunya.
 * - Tanpa library: pencocokan samar (fuzzy) sederhana sudah cukup untuk 20-an item.
 */

/** Halaman admin + kata kunci tambahan agar pencarian tidak kaku. */
const HALAMAN = [
  { to: '/admin', label: 'Dashboard', ikon: 'home', izin: 'dashboard', kata: 'beranda ringkasan utama' },
  { to: '/admin/pemilihan', label: 'Kelola Pemilihan', ikon: 'file-text', izin: 'pemilihan', kata: 'buat ubah status jadwal' },
  { to: '/admin/kandidat', label: 'Kelola Kandidat', ikon: 'award', izin: 'kandidat', kata: 'peserta suara foto visi misi' },
  { to: '/admin/anggota', label: 'Kelola Pemilih', ikon: 'user-check', izin: 'anggota', kata: 'siswa nis kelas impor kartu' },
  { to: '/admin/pantau', label: 'Pantau Partisipasi', ikon: 'clipboard-check', izin: 'pantau', kata: 'monitor progres kelas' },
  { to: '/admin/kendali', label: 'Kendali Hari-H', ikon: 'megaphone', izin: 'kendali', kata: 'jeda darurat pengumuman' },
  { to: '/admin/sesi', label: 'Sesi Aktif', ikon: 'monitor', izin: 'sesi', kata: 'keluarkan paksa bilik login ganda pemilih' },
  { to: '/admin/admin-aktif', label: 'Admin Aktif', ikon: 'log-out', izin: 'sesi_admin', kata: 'keluarkan paksa panitia admin yang login' },
  { to: '/admin/hasil', label: 'Hasil Pemilihan', ikon: 'bar-chart', izin: 'hasil', kata: 'perolehan suara undian' },
  {
    to: '/admin/layar-besar',
    label: 'Mode Layar Besar',
    ikon: 'monitor',
    izin: 'hasil',
    kata: 'proyektor layar besar real-time ppt presentasi',
  },
  { to: '/admin/audit', label: 'Catatan Aktivitas', ikon: 'clock', izin: 'audit', kata: 'riwayat log jejak admin' },
  { to: '/admin/backup', label: 'Backup', ikon: 'database', izin: 'backup', kata: 'unduh salinan database jadwal pulihkan restore' },
  { to: '/admin/akun', label: 'Kelola Admin', ikon: 'shield-check', izin: 'admin', kata: 'akun pengguna peran akses' },
  { to: '/admin/keamanan', label: 'Keamanan Akun', ikon: 'lock', izin: null, kata: 'password sandi ganti sesi logout perangkat' },
]

/** Aksi unduh berkas. Bukan navigasi halaman, jadi punya `href`. */
const UNDUHAN = [
  {
    label: 'Template Kandidat (Excel)',
    ikon: 'download',
    izin: 'kandidat',
    href: '/unduh/kandidat/template',
    kata: 'impor bulk peserta',
  },
  {
    label: 'Template Pemilih (Excel)',
    ikon: 'download',
    izin: 'anggota',
    href: '/unduh/anggota/template',
    kata: 'impor bulk siswa',
  },
  {
    label: 'Ekspor Hasil ke Excel',
    ikon: 'download',
    izin: 'export',
    href: '/unduh/hasil/export/excel',
    kata: 'unduh rekap nilai',
  },
  {
    label: 'Ekspor Hasil ke PDF',
    ikon: 'download',
    izin: 'export',
    href: '/unduh/hasil/export/pdf',
    kata: 'cetak berita acara',
  },
]

/** Skor sederhana: cocok di awal > cocok di tengah > hanya berurutan (subsequence). */
function skor(teks, kueri) {
  if (!kueri) return 1
  const t = teks.toLowerCase()
  const q = kueri.toLowerCase()

  if (t.startsWith(q)) return 1000 - t.length
  const di = t.indexOf(q)
  if (di >= 0) return 500 - di - t.length

  // "kmdl" harus bisa menemukan "Kelola": huruf-hurufnya muncul berurutan.
  let i = 0
  for (const huruf of q) {
    i = t.indexOf(huruf, i)
    if (i < 0) return 0
    i += 1
  }
  return 10
}

export default function PencariPerintah({ sesi, buka, onTutup }) {
  const navigate = useNavigate()
  const [kueri, setKueri] = useState('')
  const [sorot, setSorot] = useState(0)
  const inputRef = useRef(null)

  const boleh = (izin) => !izin || !Array.isArray(sesi?.izin) || sesi.izin.includes(izin)

  // Susun daftar sekali, lalu urutkan ulang saat kueri berubah.
  const semua = useMemo(
    () => [
      ...HALAMAN.filter((h) => boleh(h.izin)).map((h) => ({ ...h, grup: 'Halaman' })),
      ...UNDUHAN.filter((u) => boleh(u.izin)).map((u) => ({ ...u, grup: 'Unduhan' })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sesi?.izin],
  )

  const hasil = useMemo(() => {
    if (!kueri.trim()) return semua
    return semua
      .map((item) => ({
        ...item,
        s: Math.max(
          skor(item.label, kueri),
          skor(item.kata ?? '', kueri) - 60, // kata kunci tidak boleh mengalahkan label
        ),
      }))
      .filter((item) => item.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
  }, [semua, kueri])

  /* Kunci scroll + fokus ke kolom pencarian selagi terbuka. */
  useEffect(() => {
    if (!buka) return undefined

    const lepas = kunciScroll()
    const timer = setTimeout(() => inputRef.current?.focus(), 30)

    return () => {
      clearTimeout(timer)
      lepas()
    }
  }, [buka])

  /* Kueri & sorotan direset setiap dibuka, supaya tidak menyisakan sisa pencarian. */
  useEffect(() => {
    if (buka) {
      setKueri('')
      setSorot(0)
    }
  }, [buka])

  /* Navigasi papan ketik: atas/bawah untuk pindah, Enter untuk membuka, Esc menutup. */
  const jalankan = (item) => {
    if (!item) return
    onTutup()

    // Beri jeda satu frame supaya overlay sempat hilang sebelum browser
    // memulai unduhan; tanpa ini beberapa browser membatalkan unduhan.
    setTimeout(() => {
      if (item.to) navigate(item.to)
      else if (item.href) window.location.href = item.href
    }, 30)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSorot((i) => (hasil.length ? (i + 1) % hasil.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSorot((i) => (hasil.length ? (i - 1 + hasil.length) % hasil.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      jalankan(hasil[sorot])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onTutup()
    }
  }

  /* Bila daftar hasil berubah, pastikan sorotan tidak jatuh di luar jangkauan. */
  useEffect(() => {
    setSorot((i) => (i >= hasil.length ? 0 : i))
  }, [hasil.length])

  if (!buka) return null

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex items-start
        justify-center pt-[12vh] px-4 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onTutup()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cari halaman atau aksi"
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-[var(--c-bg-surface)]
          border border-[var(--c-border)] shadow-2xl animate-scale-up origin-top"
      >
        <div className="flex items-center gap-3 px-4 border-b border-[var(--c-border)]">
          <Icon name="search" className="w-4 h-4 shrink-0 text-[var(--c-text-subtle)]" />
          <input
            ref={inputRef}
            value={kueri}
            onChange={(e) => {
              setKueri(e.target.value)
              setSorot(0)
            }}
            onKeyDown={onKeyDown}
            type="text"
            placeholder="Ketik halaman,misal 'pantau' atau 'kelola'…"
            aria-label="Kata kunci pencarian"
            aria-autocomplete="list"
            className="flex-1 h-14 bg-transparent border-0 outline-hidden
              text-[15px] text-[var(--c-text)] placeholder:text-[var(--c-text-subtle)]"
          />
          <kbd
            className="hidden sm:block shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded
              bg-[var(--c-bg-page)] border border-[var(--c-border)] text-[var(--c-text-muted)]"
          >
            Esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {hasil.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[var(--c-text-muted)]">
              Tidak ada yang cocok dengan “{kueri}”.
            </p>
          ) : (
            <>
              {hasil.map((item, i) => {
                // Pemisah grup hanya ditampilkan saat daftarutuh (tanpa filter),
                // supaya tidak membingungkan saat hasil pencarian bercampur.
                const tampilkanGrup = !kueri.trim() && hasil[i - 1]?.grup !== item.grup

                return (
                  <div key={`${item.grup}-${item.label}`}>
                    {tampilkanGrup && (
                      <p
                        className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase
                          tracking-[0.14em] text-[var(--c-text-subtle)]"
                      >
                        {item.grup}
                      </p>
                    )}

                    <button
                      type="button"
                      onMouseEnter={() => setSorot(i)}
                      onClick={() => jalankan(item)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left
                        transition-colors ${
                          i === sorot
                            ? 'bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)]'
                            : 'text-[var(--c-text)] hover:bg-[var(--c-bg-page)]'
                        }`}
                    >
                      <span className="shrink-0 w-7 h-7 grid place-items-center rounded-lg bg-[var(--c-bg-page)] border border-[var(--c-border)]">
                        <Icon name={item.ikon} className="w-4 h-4" />
                      </span>
                      <span className="text-[13px] font-semibold truncate">{item.label}</span>
                      <Icon
                        name="chevron-right"
                        className="w-4 h-4 ml-auto shrink-0 opacity-40"
                      />
                    </button>
                  </div>
                )
              })}
            </>
          )}
        </div>

        <div
          className="flex items-center gap-4 px-4 py-2.5 border-t border-[var(--c-border)]
            bg-[var(--c-bg-subtle)] text-[10px] text-[var(--c-text-muted)]"
        >
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 rounded bg-[var(--c-bg-surface)] border border-[var(--c-border)]">
              ↑
            </kbd>
            <kbd className="px-1 rounded bg-[var(--c-bg-surface)] border border-[var(--c-border)]">
              ↓
            </kbd>
            pindah
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 rounded bg-[var(--c-bg-surface)] border border-[var(--c-border)]">
              Enter
            </kbd>
            buka
          </span>
          <span className="ml-auto">{semua.length} item</span>
        </div>
      </div>
    </div>
  )
}