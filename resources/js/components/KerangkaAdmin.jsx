import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from '../lib/navigasi'
import api from '../lib/api'
import { inisial } from '../lib/format'
import { kunciScroll } from '../lib/kunciScroll'
import { useApp } from '../context/AppContext'
import Icon from './Icon'
import PencariPerintah from './PencariPerintah'

/*
 * Kerangka panel admin — padanan resources/views/layouts/admin.blade.php.
 *
 * - Menu difilter dari daftar izin yang dikirim /api/admin/profil.
 * - Tema terang/gelap, default-nya terang (lihat AppContext).
 * - Desktop: sidebar tetap, bisa diciutkan (pilihan tersimpan di localStorage).
 * - Mobile: sidebar berupa laci (drawer) dengan tombol tutup, tutup lewat
 *   Esc/ketuk latar, dan scroll halaman dikunci selagi terbuka.
 * - Header halaman menempel di atas di SEMUA ukuran layar; tombol menu
 *   mobile ada di dalam header sehingga tidak menimpa judul/konten.
 *
 * Bahasa visual sidebar memakai token --c-nav-* tersendiri, tetapi nilainya
 * mengikuti tema: gelap pekat di mode gelap dan terang berbalut indigo di
 * mode terang. Dengan begitu sidebar tetap terasa seperti "produk" tersendiri
 * tanpa warna yang bertabrakan saat tema ditukar.
 */

const MENU = [
  { to: '/admin', label: 'Dashboard', icon: 'home', izin: 'dashboard', end: true, grup: 'Ringkasan' },
  { to: '/admin/pemilihan', label: 'Kelola Pemilihan', icon: 'file-text', izin: 'pemilihan', grup: 'Ringkasan' },
  { to: '/admin/kandidat', label: 'Kelola Kandidat', icon: 'award', izin: 'kandidat', grup: 'Ringkasan' },
  { to: '/admin/anggota', label: 'Kelola Pemilih', icon: 'user-check', izin: 'anggota', grup: 'Ringkasan' },
  { to: '/admin/kelas', label: 'Kelola Kelas', icon: 'users', izin: 'anggota', grup: 'Ringkasan' },
  { to: '/admin/pantau', label: 'Pantau Partisipasi', icon: 'clipboard-check', izin: 'pantau', grup: 'Pemungutan' },
  { to: '/admin/kendali', label: 'Kendali Hari-H', icon: 'megaphone', izin: 'kendali', grup: 'Pemungutan' },
  { to: '/admin/sesi', label: 'Sesi Aktif', icon: 'monitor', izin: 'sesi', grup: 'Pemungutan' },
  { to: '/admin/hasil', label: 'Hasil Pemilihan', icon: 'bar-chart', izin: 'hasil', grup: 'Pemungutan' },
  // Mode layar besar berada DI LUAR kerangka admin (satu layar penuh untuk
  // proyektor). Tetap punya izin 'hasil' karena isinya sama persis.
  { to: '/admin/layar-besar', label: 'Mode Layar Besar', icon: 'monitor', izin: 'hasil', grup: 'Pemungutan' },
  { to: '/admin/audit', label: 'Catatan Aktivitas', icon: 'clock', izin: 'audit', grup: 'Sistem' },
  { to: '/admin/admin-aktif', label: 'Admin Aktif', icon: 'log-out', izin: 'sesi_admin', grup: 'Sistem' },
  { to: '/admin/backup', label: 'Backup', icon: 'database', izin: 'backup', grup: 'Sistem' },
  { to: '/admin/pengaturan', label: 'Pengaturan', icon: 'settings', izin: 'pengaturan', grup: 'Sistem' },
  { to: '/admin/akun', label: 'Kelola Admin', icon: 'shield-check', izin: 'admin', grup: 'Sistem' },
  // Setiap admin berhak mengamankan akunnya sendiri, jadi menu ini tidak
  // memakai izin fitur (cukup sesi admin yang sah).
  { to: '/admin/keamanan', label: 'Keamanan Akun', icon: 'lock', grup: 'Sistem' },
]

/* Urutan grup; dipakai untuk memberi judul pemisah di sidebar. */
const URUT_GRUP = ['Ringkasan', 'Pemungutan', 'Sistem']

const KUNCI_CIUT = 'kasya_sidebar_ciut'
const QUERY_DESKTOP = '(min-width: 1024px)'

/*
 * Posisi gulir daftar menu disimpan di tingkat modul.
 *
 * Inertia mengganti komponen halaman pada setiap perpindahan, sehingga
 * KerangkaAdmin (dan <nav> di dalamnya) dipasang ulang dan posisi gulirnya
 * kembali ke atas. Akibatnya, mengklik menu di bagian bawah daftar membuat
 * sidebar "melompat" ke atas. Variabel ini bertahan antar-halaman selama
 * aplikasi belum dimuat ulang penuh, lalu dipulihkan saat kerangka mount.
 */
let posisiGulirMenu = 0

/** true bila layar selebar breakpoint `lg` ke atas. */
function useDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(QUERY_DESKTOP).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY_DESKTOP)
    const onChange = (e) => setDesktop(e.matches)
    setDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return desktop
}

export default function KerangkaAdmin({ children, judul }) {
  const { sesi, keluar, sekolah, judul: judulAplikasi, tema, setTema } = useApp()
  const navigate = useNavigate()
  const desktop = useDesktop()

  const [ciut, setCiut] = useState(() => {
    try {
      return localStorage.getItem(KUNCI_CIUT) === 'true'
    } catch {
      return false
    }
  })
  const [mobileBuka, setMobileBuka] = useState(false)
  const [menuAkun, setMenuAkun] = useState(false)
  const [cariBuka, setCariBuka] = useState(false)

  /*
   * Daftar menu digulir sendiri (bukan halaman), jadi posisinya tidak ikut
   * diurus Inertia. Pulihkan posisi terakhir sebelum browser melukis layar
   * agar tidak terlihat berkedip ke atas dulu.
   */
  const menuRef = useRef(null)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (el) el.scrollTop = posisiGulirMenu
  }, [])

  const catatGulirMenu = () => {
    if (menuRef.current) posisiGulirMenu = menuRef.current.scrollTop
  }

  const boleh = (izin) => !izin || (Array.isArray(sesi.izin) && sesi.izin.includes(izin))
  const menu = MENU.filter((m) => boleh(m.izin))

  /* Jangan ingat state ciut dari mobile; di mobile sidebar selalu lebar penuh. */
  const ciutAktif = desktop && ciut

  useEffect(() => {
    try {
      localStorage.setItem(KUNCI_CIUT, String(ciut))
    } catch {
      /* abaikan */
    }
  }, [ciut])

  /* Judul tab browser mengikuti halaman. */
  useEffect(() => {
    document.title = judul ? `${judul} — ${judulAplikasi}` : judulAplikasi
  }, [judul, judulAplikasi])

  /* Laci mobile: kunci scroll + tutup dengan Esc. */
  useEffect(() => {
    if (!mobileBuka) return undefined

    const lepas = kunciScroll()
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileBuka(false)
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      lepas()
    }
  }, [mobileBuka])

  /* Kalau layar diperlebar ke desktop saat laci terbuka, tutup lacinya. */
  useEffect(() => {
    if (desktop) setMobileBuka(false)
  }, [desktop])

  /* Dropdown akun: tutup saat klik di luar atau tekan Esc. */
  const akunRef = useRef(null)
  useEffect(() => {
    if (!menuAkun) return undefined

    const onKlik = (e) => {
      if (akunRef.current && !akunRef.current.contains(e.target)) setMenuAkun(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuAkun(false)
    }
    document.addEventListener('mousedown', onKlik)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onKlik)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuAkun])

  const pilihKeluar = async () => {
    setMenuAkun(false)
    posisiGulirMenu = 0
    try {
      await api.post('/logout')
    } catch {
      /* tetap keluar dari layar */
    }
    keluar()
    navigate('/login', { replace: true })
  }

  /* Pintasan keyboard: Ctrl+K / Cmd+K membuka palette pencarian.
     Tombol "/" juga dipakai karena terjangkau tanpa melepas tangan
     dari posisi mengetik. */
  useEffect(() => {
    const onKey = (e) => {
      const ketik = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)
      const diKotakIsi = e.target?.isContentEditable

      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setCariBuka((v) => !v)
      } else if (e.key === '/' && !ketik && !diKotakIsi) {
        e.preventDefault()
        setCariBuka(true)
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const lebarSidebar = ciut ? 'lg:w-[76px]' : 'lg:w-[268px]'
  const marginKonten = ciut ? 'lg:ml-[76px]' : 'lg:ml-[268px]'

  // Laci yang tertutup di mobile tidak boleh bisa difokus dengan Tab.
  const sidebarTersembunyi = !desktop && !mobileBuka

  // Item menu aktif = pill berlatar terang; non-aktif transparan sampai di-hover.
  const kelasItem = (aktif) =>
    `menu-item group flex items-center rounded-xl transition-colors duration-200 ${
      ciutAktif ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
    } ${
      aktif
        ? 'aktif bg-[var(--c-nav-aktif)] text-[var(--c-nav-teks-aktif)] font-semibold'
        : 'text-[var(--c-nav-teks)] hover:text-[var(--c-nav-teks-aktif)]'
    }`

  return (
    <div className="kasya-admin min-h-dvh bg-[var(--c-bg-page)]">
      {/* ---------- SIDEBAR ---------- */}
      <aside
        id="menu-admin"
        aria-label="Menu admin"
        inert={sidebarTersembunyi ? '' : undefined}
        className={`fixed inset-y-0 left-0 z-40 flex flex-col w-[268px] max-w-[85vw]
          bg-[linear-gradient(165deg,var(--c-nav-1)_0%,var(--c-nav-2)_100%)]
          shadow-[0_0_60px_-15px_var(--c-nav-bayang)] ring-1 ring-[var(--c-nav-ring)]
          transition-[translate,width] duration-300 ease-out
          lg:translate-x-0 ${lebarSidebar}
          ${mobileBuka ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Ornamen cahaya di belakang; murni dekoratif. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full
            bg-[var(--c-primary)] opacity-[var(--c-nav-ornamen-1)] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 -left-20 h-56 w-56 rounded-full
            bg-[var(--c-sky)] opacity-[var(--c-nav-ornamen-2)] blur-3xl"
        />

        {/* ---------- KEPALA SIDEBAR ---------- */}
        {/* Saat diciutkan, lebar sidebar hanya 76px: logo shield, nama aplikasi,
            dan label peran disembunyikan agar tidak berdesakan. Yang tersisa
            hanya tombol perlebar menu di tengah. */}
        <div className="relative shrink-0 px-4 pt-4 pb-3">
          <div
            className={`flex items-center gap-3 ${
              ciutAktif ? 'justify-center' : 'justify-between'
            }`}
          >
            {ciutAktif ? (
              <button
                type="button"
                onClick={() => setCiut(false)}
                title="Perlebar menu"
                aria-label="Perlebar menu"
                aria-expanded={false}
                aria-controls="menu-admin"
                className="shrink-0 w-10 h-10 grid place-items-center rounded-xl
                  bg-[var(--c-nav-tombol)] text-[var(--c-nav-teks)]
                  ring-1 ring-[var(--c-nav-garis)]
                  hover:bg-[var(--c-nav-tombol-hover)] hover:text-[var(--c-nav-teks-aktif)]
                  transition-colors"
              >
                <Icon name="menu" className="w-5 h-5" />
              </button>
            ) : (
              <>
                <div className="flex items-center gap-3 overflow-hidden min-w-0">
                  <Logo />

                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-tight truncate text-[var(--c-nav-teks-aktif)]">
                      {judulAplikasi}
                    </p>
                    <p className="text-[11px] truncate text-[var(--c-nav-teks)]">
                      {sesi.user?.label || sesi.user?.peran}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setCiut(true)}
                  title="Ciutkan menu"
                  aria-label="Ciutkan menu"
                  aria-expanded
                  aria-controls="menu-admin"
                  className="hidden lg:grid shrink-0 w-8 h-8 place-items-center rounded-lg
                    text-[var(--c-nav-teks)] hover:text-[var(--c-nav-teks-aktif)]
                    hover:bg-[var(--c-nav-tombol)] transition-colors"
                >
                  <Icon name="menu" className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Tutup laci (mobile) */}
            <button
              type="button"
              onClick={() => setMobileBuka(false)}
              aria-label="Tutup menu"
              className="lg:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-xl
                text-[var(--c-nav-teks)] hover:text-[var(--c-nav-teks-aktif)]
                hover:bg-[var(--c-nav-tombol)] transition-colors"
            >
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative mx-4 h-px bg-[var(--c-nav-garis)] shrink-0" />

        {/* ---------- MENU ---------- */}
        <nav
          ref={menuRef}
          onScroll={catatGulirMenu}
          aria-label="Navigasi admin"
          className="relative mt-3 px-3 space-y-0.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-2"
        >
          {menu.length === 0 &&
            [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                aria-hidden="true"
                className="h-10 my-1 rounded-xl bg-[var(--c-nav-tombol)] animate-pulse"
              />
            ))}

          {menu.map((m, i) => (
            <div key={m.to}>
              {/* Pemisah grup — disembunyikan saat menu dicabut. */}
              {!ciutAktif &&
                URUT_GRUP.includes(m.grup) &&
                (i === 0 || menu[i - 1]?.grup !== m.grup) && (
                  <p className="px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--c-nav-teks-lemah)]">
                    {m.grup}
                  </p>
                )}

              <NavLink
                to={m.to}
                end={m.end}
                title={m.label}
                onClick={() => {
                  catatGulirMenu()
                  setMobileBuka(false)
                }}
                className={({ isActive }) => kelasItem(isActive)}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`shrink-0 w-7 h-7 grid place-items-center rounded-lg transition-colors ${
                        isActive
                          ? 'bg-[var(--c-primary)] text-white shadow-lg shadow-[var(--c-primary)]/40'
                          : 'text-[var(--c-nav-teks)] group-hover:text-[var(--c-nav-teks-aktif)]'
                      }`}
                    >
                      <Icon name={m.icon} className="w-5 h-5" />
                    </span>
                    <span className={`text-[13px] truncate ${ciutAktif ? 'sr-only' : ''}`}>
                      {m.label}
                    </span>
                  </>
                )}
              </NavLink>
            </div>
          ))}
        </nav>

        {/* ---------- KAKI SIDEBAR ---------- */}
        <div className="relative shrink-0 px-3 py-3 border-t border-[var(--c-nav-garis)]">
          <button
            type="button"
            onClick={pilihKeluar}
            title="Keluar dari panel admin"
            className={`menu-item group flex items-center w-full px-3 py-2.5 rounded-xl
              text-[var(--c-nav-teks)] hover:text-[var(--c-nav-keluar)] transition-colors duration-200 ${
                ciutAktif ? 'justify-center gap-0' : 'gap-3'
              }`}
          >
            <span className="shrink-0 w-7 h-7 grid place-items-center rounded-lg">
              <Icon name="log-out" className="w-5 h-5" />
            </span>
            <span className={`text-[13px] truncate ${ciutAktif ? 'sr-only' : ''}`}>Keluar</span>
          </button>
        </div>
      </aside>

      {mobileBuka && (
        <div
          onClick={() => setMobileBuka(false)}
          aria-hidden="true"
          className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm animate-fade-in"
        />
      )}

      {/* ---------- KONTEN ---------- */}
      <div className={`min-w-0 transition-[margin] duration-300 ease-out ml-0 ${marginKonten}`}>
        {/* Topbar menempel di atas: kaca buram + garis rambut di bawahnya. */}
        <header className="kasya-tanpa-cetak sticky top-0 z-20 border-b border-[var(--c-border)] bg-[var(--c-bg-page)]/80 backdrop-blur-xl backdrop-saturate-150">
          <div className="max-w-7xl 2xl:max-w-[110rem] mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 md:px-8 2xl:px-12 h-[4.5rem]">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileBuka(true)}
                aria-label="Buka menu"
                aria-expanded={mobileBuka}
                aria-controls="menu-admin"
                className="lg:hidden shrink-0 w-11 h-11 grid place-items-center rounded-xl
                  bg-[var(--c-bg-surface)] border border-[var(--c-border)]
                  text-[var(--c-text)] shadow-sm"
              >
                <Icon name="menu" className="w-5 h-5" />
              </button>

              <div className="min-w-0">
                <p className="hidden sm:block text-xs font-bold uppercase tracking-[0.14em] text-[var(--c-text-subtle)]">
                  Panel Admin
                </p>
                <h1 className="text-lg sm:text-xl font-bold text-[var(--c-text)] truncate leading-tight">
                  {judul}
                </h1>
                <p className="text-xs text-[var(--c-text-muted)] truncate mt-0.5">{sekolah}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Pencarian cepat — disembunyikan di layar sangat kecil;
                  pintasan Ctrl+K tetap berfungsi di sana. */}
              <button
                type="button"
                onClick={() => setCariBuka(true)}
                className="hidden sm:flex items-center gap-2.5 h-11 pl-4 pr-2 rounded-xl
                  bg-[var(--c-bg-surface)] border border-[var(--c-border)] shadow-sm
                  text-[var(--c-text-subtle)] hover:border-[var(--c-primary-soft-border)]
                  hover:text-[var(--c-text)] transition-colors max-w-[16rem] flex-1 lg:flex-none"
              >
                <Icon name="search" className="w-4 h-4 shrink-0" />
                <span className="text-sm flex-1 text-left">Cari halaman…</span>
                <kbd
                  className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded
                    bg-[var(--c-bg-page)] border border-[var(--c-border)]"
                >
                  Ctrl K
                </kbd>
              </button>

              <button
                type="button"
                onClick={() => setCariBuka(true)}
                title="Cari halaman (Ctrl+K)"
                aria-label="Cari halaman"
                className="sm:hidden w-11 h-11 grid place-items-center rounded-xl
                  bg-[var(--c-bg-surface)] border border-[var(--c-border)]
                  text-[var(--c-text-muted)] shadow-sm"
              >
                <Icon name="search" className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')}
                title={tema === 'dark' ? 'Mode terang' : 'Mode gelap'}
                aria-label={tema === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
                className="w-11 h-11 grid place-items-center rounded-xl
                  bg-[var(--c-bg-surface)] border border-[var(--c-border)]
                  text-[var(--c-text-muted)] shadow-sm
                  hover:text-[var(--c-primary)] hover:border-[var(--c-primary-soft-border)]
                  transition-colors"
              >
                <Icon name={tema === 'dark' ? 'sun' : 'moon'} className="w-4 h-4" />
              </button>

              {/* Menu akun: menyatukan nama, peran, tema, dan keluar jadi satu titik. */}
              <div className="relative" ref={akunRef}>
                <button
                  type="button"
                  onClick={() => setMenuAkun((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuAkun}
                  className="flex items-center gap-2 pl-1 pr-2 sm:pr-3 h-11 rounded-xl
                    bg-[var(--c-bg-surface)] border border-[var(--c-border)]
                    shadow-sm hover:border-[var(--c-primary-soft-border)] transition-colors"
                >
                  <span
                    className="w-9 h-9 rounded-lg grid place-items-center text-xs font-bold text-white
                      bg-[linear-gradient(135deg,var(--c-primary),var(--c-violet))]"
                  >
                    {inisial(sesi.user?.nama)}
                  </span>
                  <span className="hidden md:block text-left leading-tight min-w-0 max-w-[10rem]">
                    <span className="block text-sm font-semibold text-[var(--c-text)] truncate">
                      {sesi.user?.nama}
                    </span>
                    <span className="block text-xs text-[var(--c-text-muted)] truncate">
                      {sesi.user?.label || sesi.user?.peran}
                    </span>
                  </span>
                  <Icon name="chevron-right" className="w-3.5 h-3.5 rotate-90 text-[var(--c-text-subtle)] hidden md:block" />
                </button>

                {menuAkun && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64
                      rounded-2xl bg-[var(--c-bg-surface)] border border-[var(--c-border)]
                      shadow-2xl overflow-hidden animate-scale-up origin-top-right"
                  >
                    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--c-border)]">
                      <span
                        className="w-10 h-10 rounded-xl grid place-items-center text-sm font-bold text-white
                          bg-[linear-gradient(135deg,var(--c-primary),var(--c-violet))]"
                      >
                        {inisial(sesi.user?.nama)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--c-text)] truncate">
                          {sesi.user?.nama}
                        </p>
                        <p className="text-[11px] text-[var(--c-text-muted)] truncate">
                          {sesi.user?.label || sesi.user?.peran}
                        </p>
                      </div>
                    </div>

                    <div className="p-1.5">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setTema(tema === 'dark' ? 'light' : 'dark')
                          setMenuAkun(false)
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl
                          text-sm font-medium text-[var(--c-text)] text-left
                          hover:bg-[var(--c-primary-soft)] hover:text-[var(--c-primary-dark)]
                          transition-colors"
                      >
                        <Icon name={tema === 'dark' ? 'sun' : 'moon'} className="w-4 h-4" />
                        Beralih ke mode {tema === 'dark' ? 'terang' : 'gelap'}
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={pilihKeluar}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl
                          text-sm font-medium text-[var(--c-bahaya)] text-left
                          hover:bg-[var(--c-rose-soft)] transition-colors"
                      >
                        <Icon name="log-out" className="w-4 h-4" />
                        Keluar dari panel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl 2xl:max-w-[110rem] mx-auto px-4 sm:px-6 md:px-8 2xl:px-12
          pt-6 pb-20 min-w-0 flex flex-col gap-6">
          {children}
        </main>
      </div>

      <PencariPerintah sesi={sesi} buka={cariBuka} onTutup={() => setCariBuka(false)} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Logo sidebar                                                        */
/* ------------------------------------------------------------------ */

/** Logo sidebar: kotak gradien dengan garis tepi putih transparan. */
function Logo() {
  return (
    <span
      className="relative shrink-0 w-10 h-10 rounded-xl grid place-items-center
        bg-[linear-gradient(135deg,var(--c-primary),var(--c-violet))]
        shadow-lg shadow-[var(--c-primary)]/30"
    >
      <Icon name="shield-check" className="w-5 h-5 text-white" />
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/25"
      />
    </span>
  )
}