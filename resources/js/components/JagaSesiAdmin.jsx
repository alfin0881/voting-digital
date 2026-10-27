import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '../lib/navigasi'
import api, { sesiHabis } from '../lib/api'
import { useApp } from '../context/AppContext'
import Modal from './Modal'
import { Tombol } from './UI'
import Icon from './Icon'

/*
 * Auto-logout admin karena idle — padanan komponen Blade <x-sesi-admin>.
 *
 * Bedanya dari JagaSesi (dipakai layar pemilih):
 * - Durasi idle lebih longgar (config voting.admin_idle_timeout, default 15 menit).
 * - Peringatan muncul 1 menit sebelum keluar.
 * - Hanya admin yang logout; sesi pemilih tidak disentuh.
 *
 * Cara kerjanya sama dengan sisi pemilih: dihitung dari Date.now() (bukan
 * jumlah tick) supaya akurat walau tab di-throttle browser.
 */
/*
 * `abaiIdle` membebaskan halaman ini dari auto-logout idle.
 *
 * Dipakai Mode Layar Besar: proyektor tidak ada yang disentuh sepanjang acara
 * beberapa jam, jadi auto-logout biasa akan membuat layar gelap di tengah
 * acara. Halaman itu hanya menampilkan angka agregat — tidak bisa mengubah
 * apa pun — jadi risikonya jauh lebih kecil daripada kegunaannya. Sesi tetap
 *REQUIRE login admin, dan batas umur sesi mutlak di server tetap berlaku.
 */
export default function JagaSesiAdmin({ children, abaiIdle = false }) {
  const { config, keluar, tandaiSesiHabis } = useApp()
  const navigate = useNavigate()

  const [sisa, setSisa] = useState(null)
  const refs = useRef({ aktif: Date.now(), keluar: false })

  const idleMs = (config?.admin_idle_timeout ?? 900) * 1000
  // Peringatan maksimal 1 menit, dan harus lebih kecil dari total idle.
  const warnMs = Math.min((config?.admin_idle_warning ?? 60) * 1000, idleMs - 1000)

  const keLogin = useCallback(
    async (pesan) => {
      if (refs.current.keluar) return
      refs.current.keluar = true

      try {
        await api.post('/logout')
      } catch {
        // Jaringan mati / sesi sudah habis di server — abaikan saja.
      }

      keluar()
      // Pesan disimpan di context, bukan toast: wadah toast ada di dalam
      // <ButuhAdmin> dan ikut hilang begitu sesi dibersihkan.
      tandaiSesiHabis(pesan)
      navigate('/login', { replace: true })
    },
    [keluar, tandaiSesiHabis, navigate],
  )

  const tandaiAktif = useCallback(() => {
    if (refs.current.keluar) return
    refs.current.aktif = Date.now()
  }, [])

  useEffect(() => {
    // Mode layar besar: layar proyektor sengaja dibiarkan tanpa akun idle,
    // sebab tidak ada yang menyentuh komputer itu sepanjang acara. Sesi tetap
    // harus login admin, dan batas umur mutlak di server tetap berlaku.
    if (abaiIdle) return undefined

    const EKSTERNA = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'click']
    EKSTERNA.forEach((ev) =>
      window.addEventListener(ev, tandaiAktif, { passive: true, capture: true }),
    )

    const timer = setInterval(() => {
      if (refs.current.keluar) return

      const diam = Date.now() - refs.current.aktif
      const sisaMs = idleMs - diam

      if (sisaMs <= 0) {
        keLogin('Sesi berakhir karena tidak ada aktivitas. Silakan login kembali.')
        return
      }

      setSisa(sisaMs <= warnMs ? Math.ceil(sisaMs / 1000) : null)
    }, 1000)

    // Tombol Back / bfcache: jangan tampilkan halaman lama setelah keluar.
    const onPageShow = (e) => {
      if (e.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', onPageShow)

    return () => {
      EKSTERNA.forEach((ev) => window.removeEventListener(ev, tandaiAktif, true))
      clearInterval(timer)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [idleMs, warnMs, tandaiAktif, keLogin, abaiIdle])

  return (
    <>
      {children}

      <Modal
        buka={sisa !== null}
        onTutup={() => {}}
        judul="Masih ada aktivitas?"
        lebar="max-w-md"
        aksi={
          <Tombol
            className="w-full"
            onClick={() => {
              tandaiAktif()
              setSisa(null)
            }}
          >
            Saya masih bekerja
          </Tombol>
        }
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Icon name="clock" className="w-8 h-8 text-amber-500" />
          </div>
          <p className="text-[var(--c-text-muted)] mb-1">
            Tidak ada aktivitas. Anda akan otomatis keluar dalam
          </p>
          <p className="text-5xl font-extrabold text-amber-500 my-3 tabular-nums">{sisa ?? 0}</p>
          <p className="text-xs text-[var(--c-text-muted)]">
            Demi keamanan panel, komputer ini akan terkunci untuk pengguna berikutnya.
          </p>
        </div>
      </Modal>
    </>
  )
}
