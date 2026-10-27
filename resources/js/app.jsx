import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import api from './lib/api'
import { AppProvider } from './context/AppContext'
import ErrorBoundary from './components/ErrorBoundary'
import JagaSesi from './components/JagaSesi'
import JagaSesiAdmin from './components/JagaSesiAdmin'
import ToastWadah from './components/ToastWadah'

/*
 * Titik masuk aplikasi Inertia.
 *
 * Semua halaman di-resolve dari resources/js/pages. Server yang menentukan
 * halaman mana yang dirender (lewat Inertia::render), bukan React Router.
 *
 * Pembagian bingkai:
 * - admin/*            : penjaga idle admin + heartbeat + wadah toast
 * - admin/LayarBesar   : layar proyektor, sengaja tanpa auto-logout idle
 * - Login              : tanpa bingkai
 * - sisanya (pemilih)  : penjaga idle pemilih + wadah toast
 */

const halaman = import.meta.glob('./pages/**/*.jsx')

/** Denyut admin: heartbeat ringan ke server tiap menit. */
function DenyutAdmin({ children }) {
  useEffect(() => {
    const timer = setInterval(() => {
      api.post('/admin/ping').catch(() => {})
    }, 60000)

    return () => clearInterval(timer)
  }, [])

  return children ?? null
}

function bingkai(nama, Komponen) {
  function Halaman(props) {
    const isi = <Komponen {...props} />

    if (nama === 'admin/LayarBesar') {
      return <AppProvider>{isi}</AppProvider>
    }

    if (nama.startsWith('admin/')) {
      return (
        <AppProvider>
          <JagaSesiAdmin>
            <DenyutAdmin>{isi}</DenyutAdmin>
            <ToastWadah />
          </JagaSesiAdmin>
        </AppProvider>
      )
    }

    if (nama === 'Login') {
      return <AppProvider>{isi}</AppProvider>
    }

    return (
      <AppProvider>
        <JagaSesi>{isi}</JagaSesi>
        <ToastWadah />
      </AppProvider>
    )
  }

  return Halaman
}

createInertiaApp({
  // Judul tab diatur oleh KerangkaAdmin / Kerangka per halaman; halaman yang
  // tidak memakai kerangka tetap memakai judul dari app.blade.php.
  resolve: async (nama) => {
    const jalur = `./pages/${nama}.jsx`
    const pemuat = halaman[jalur]

    if (!pemuat) {
      throw new Error(`Halaman Inertia tidak ditemukan: ${jalur}`)
    }

    const modul = await pemuat()

    return { default: bingkai(nama, modul.default) }
  },

  setup({ el, App, props }) {
    createRoot(el).render(
      <ErrorBoundary>
        <App {...props} />
      </ErrorBoundary>,
    )
  },

  // Bilah progres tipis di atas layar saat berpindah halaman.
  progress: {
    color: '#4f46e5',
    showSpinner: false,
  },
})
