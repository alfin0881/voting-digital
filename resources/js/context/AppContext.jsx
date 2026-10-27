import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { router, usePage } from '@inertiajs/react'

const AppContext = createContext(null)

const KUNCI_TEMA = 'kasya_theme'

/**
 * Sumber kebenaran tunggal untuk hal-hal yang dipakai semua halaman:
 * - config runtime dari server (durasi idle, nama sekolah, status jeda)
 * - sesi login (siapa yang sedang masuk, izin menu)
 * - toast notifikasi
 * - tema terang/gelap
 *
 * PERUBAHAN PENTING (migrasi Inertia):
 * Sebelumnya komponen ini memanggil /api/config dan /api/me saat aplikasi
 * start. Dua request itu membuat layar login/panel sempat kosong. Sekarang
 * keduanya sudah menjadi props global Inertia (`config` dan `auth`), jadi
 * tersedia sejak render pertama tanpa request tambahan.
 */
export function AppProvider({ children }) {
  const { props } = usePage()

  const config = props.config ?? null
  const auth = props.auth ?? { terlogin: false, role: null, user: null, izin: [], pesan: null }
  const flash = props.flash ?? null

  const [toast, setToast] = useState([])

  /* Alasan sesi terakhir berakhir (idle/419). Server mengirimnya di props
   * auth.pesan; pesan disembunyikan lagi setelah ditampilkan di layar login.
   *
   * Disimpan juga di variabel tingkat modul karena Inertia mengganti komponen
   * halaman (dan AppProvider ikut ter-unmount) saat berpindah ke /login.
   * Tanpa ini pesan "sesi berakhir" hilang sebelum sempat dibaca. */
  const [pesanSesiHabis, setPesanSesiHabis] = useState(() => pesanSesiTerakhir)

  const [tema, setTema] = useState(() => {
    try {
      return localStorage.getItem(KUNCI_TEMA) === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  /* --- Terapkan tema ke <html> --- */
  useEffect(() => {
    document.documentElement.setAttribute('data-mode', tema)
    try {
      localStorage.setItem(KUNCI_TEMA, tema)
    } catch {
      /* abaikan */
    }
  }, [tema])

  /* --- Judul tab browser mengikuti identitas sekolah ---
     KerangkaAdmin/KerangkaHalaman menimpanya lagi dengan nama halaman, tapi
     layar login & mode layar besar tidak lewat frame itu. */
  useEffect(() => {
    if (!config?.judul_aplikasi) return
    if (document.title === 'E-Voting') document.title = config.judul_aplikasi
  }, [config])

  /* --- Pesan sesi habis dari server --- */
  useEffect(() => {
    if (auth?.pesan) setPesanSesiHabis(auth.pesan)
  }, [auth?.pesan])

  /* --- Flash message -> toast ---
     Dipakai saat server mengalihkan halaman (mis. izin ditolak / sesi habis). */
  useEffect(() => {
    const pesan = flash?.error || flash?.pesan
    if (!pesan) return

    const id = idBerikutnya()
    const tipe = flash?.error ? 'bahaya' : flash?.tipe || 'sukses'
    setToast((t) => [...t, { id, pesan, tipe }])

    // Jangan mengembalikan cleanup: respons polling berikutnya akan
    // membersihkan timer ini dan toast tidak pernah hilang sendiri.
    setTimeout(() => {
      setToast((t) => t.filter((x) => x.id !== id))
    }, 4000)
  }, [flash])

  /* --- Config runtime ---
     Dipakai setelah admin menyimpan identitas sekolah supaya nama baru
     langsung tampil tanpa refresh manual. Hanya `config` yang diminta ulang. */
  const muatUlangConfig = useCallback(() => {
    router.reload({ only: ['config'], preserveScroll: true, preserveState: true })
  }, [])

  /* --- Toast --- */
  const tutupToast = useCallback((id) => {
    setToast((t) => t.filter((x) => x.id !== id))
  }, [])

  const notifikasi = useCallback(
    (pesan, tipe = 'sukses') => {
      if (!pesan) return
      const id = idBerikutnya()
      setToast((t) => [...t, { id, pesan, tipe }])
      setTimeout(() => tutupToast(id), 4000)
    },
    [tutupToast],
  )

  /* --- Sesi ---
     Login/logout sekarang dilakukan lewat kunjungan Inertia, jadi props
     `auth` otomatis berubah setelah server membalas. Fungsi di bawah tinggal
     menjaga kompatibilitas komponen lama. */
  const sesi = useMemo(
    () => ({
      ...auth,
      siap: true,
      izin: Array.isArray(auth.izin) ? auth.izin : [],
    }),
    [auth],
  )

  const masuk = useCallback(() => {}, [])
  const keluar = useCallback(() => {}, [])

  const tandaiSesiHabis = useCallback((pesan) => {
    pesanSesiTerakhir = pesan || 'Sesi berakhir karena tidak ada aktivitas. Silakan login kembali.'
    setPesanSesiHabis(pesanSesiTerakhir)
  }, [])

  const tutupPesanSesiHabis = useCallback(() => {
    pesanSesiTerakhir = null
    setPesanSesiHabis(null)
  }, [])

  const tanganiSesiHabis = useCallback(() => {
    router.visit('/login', { replace: true })
  }, [])

  const nilai = useMemo(
    () => ({
      config,
      sesi,
      masuk,
      keluar,
      tandaiSesiHabis,
      pesanSesiHabis,
      tutupPesanSesiHabis,
      tanganiSesiHabis,
      notifikasi,
      tema,
      setTema,
      muatUlangConfig,
      toast,
      tutupToast,
      sekolah: config?.nama_sekolah ?? config?.sekolah ?? '',
      aplikasi: config?.nama_aplikasi ?? 'E-Voting',
      judul: config?.judul_aplikasi ?? 'E-Voting',
      siap: true,
    }),
    [
      config,
      sesi,
      masuk,
      keluar,
      tandaiSesiHabis,
      pesanSesiHabis,
      tutupPesanSesiHabis,
      tanganiSesiHabis,
      notifikasi,
      tutupToast,
      toast,
      tema,
      muatUlangConfig,
    ],
  )

  return <AppContext.Provider value={nilai}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp() harus dipakai di dalam <AppProvider>')
  return ctx
}

/** Penghitung id sederhana (cukup untuk toast; tidak butuh library). */
let penghitungId = 0
const idBerikutnya = () => `toast-${++penghitungId}`

/**
 * Pesan "sesi berakhir" bertahan di tingkat modul, bukan state React.
 * Inertia tidak melakukan reload penuh saat pindah halaman, tetapi komponen
 * halaman (termasuk AppProvider) di-unmount lalu dipasang ulang. Variabel modul
 * tetap hidup di antara keduanya, jadi pesan bisa muncul di layar login.
 */
let pesanSesiTerakhir = null

/**
 * Hook data halaman untuk layar pemilih.
 *
 * Data awal berasal dari props Inertia (`data`), bukan dari request axios
 * setelah mount. `muatUlang` meminta ulang HANYA prop data (partial reload),
 * sehingga auth/config tidak ikut dihitung ulang.
 */
export function useApi(path, { aktif = true } = {}) {
  const { props } = usePage()
  const [memuat, setMemuat] = useState(false)
  const [error, setError] = useState(null)

  const muatUlang = useCallback(() => {
    if (!aktif) return Promise.resolve()

    setMemuat(true)
    setError(null)

    return new Promise((resolve) => {
      router.reload({
        only: ['data'],
        preserveScroll: true,
        preserveState: true,
        onError: (e) => setError(e),
        onHttpException: (e) => setError(e),
        onFinish: () => {
          setMemuat(false)
          resolve()
        },
      })
    })
  }, [aktif])

  return {
    data: props.data ?? null,
    memuat,
    error,
    muatUlang,
    // Dipertahankan untuk kompatibilitas; data sekarang milik server.
    setData: () => {},
  }
}

/** Helper kecil: true bila error ini berarti sesi sudah tidak berlaku. */
export { sesiHabis } from '../lib/api'
