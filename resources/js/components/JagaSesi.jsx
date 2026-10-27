import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '../lib/navigasi'
import api, { sesiHabis } from '../lib/api'
import { useApp } from '../context/AppContext'
import Modal from '../components/Modal'
import { Tombol } from '../components/UI'
import Icon from '../components/Icon'

/*
 * Penjaga sesi untuk komputer lab — padanan komponen Blade <x-sesi-pemilih>.
 *
 * Aturan yang dipertahankan:
 * - Auto-logout setelah idle_timeout detik tanpa aktivitas.
 * - Per.warning muncul idle_warning detik sebelum logout, dengan hitung mundur.
 * - Tombol "Saya masih di sini" membatalkan timer.
 * - Heartbeat ke server HANYA bila ada aktivitas (bukan tiap detik).
 * - Heartbeat yang dijawab 401/419 langsung berarti logout.
 * - Tombol Back setelah keluar memuat ulang halaman (bfcache).
 *
 * Semua waktu dihitung dari Date.now(), bukan jumlah tick, supaya tetap akurat
 * walau tab di-throttle browser.
 */
export default function JagaSesi({ children, aktif = true }) {
  // `resetSesi` = setter dari context; `sedangKeluar` = state lokal.
  // Namanya sengaja dibedakan karena keduanya tidak boleh tertukar.
  const { config, keluar: resetSesi, tandaiSesiHabis } = useApp()
  const navigate = useNavigate()

  const [sisa, setSisa] = useState(null) // null = tidak sedang diperingatkan
  const [sedangKeluar, setSedangKeluar] = useState(false)

  // Pakai ref agar listener tidak perlu di-rebind tiap render.
  const refs = useRef({
    aktif: Date.now(),
    ping: Date.now(),
    keluar: false,
  })

  const idleMs = (config?.idle_timeout ?? 180) * 1000
  const warnMs = (config?.idle_warning ?? 30) * 1000
  const pingEvery = 30 * 1000

  const keLogin = useCallback(
    async (pesan) => {
      if (refs.current.keluar) return
      refs.current.keluar = true
      setSedangKeluar(true)

      try {
        await api.post('/logout')
      } catch {
        // Network mati / sesi sudah habis di server — abaikan.
      }

      resetSesi()
      // Disimpan di context, bukan toast (wadah toast ikut ter-unmount).
      tandaiSesiHabis(pesan)
      navigate('/login', { replace: true })
    },
    [resetSesi, tandaiSesiHabis, navigate],
  )

  // Reset timer setiap ada aktivitas (mouse, keyboard, scroll, sentuh).
  const tandaiAktif = useCallback(() => {
    if (refs.current.keluar) return
    refs.current.aktif = Date.now()
  }, [])

  const ping = useCallback(async () => {
    refs.current.ping = Date.now()
    try {
      // 2xx = sesi masih aman; sesi yang sudah habis akan jatuh ke catch.
      await api.post('/pemilih/ping')
    } catch (e) {
      // 401/419 dari server = sesi tidak berlaku lagi.
      if (sesiHabis(e)) {
        keLogin('Sesi Anda telah berakhir. Silakan login kembali.')
      }
      // Error jaringan lain: biarkan, timer browser tetap yang memutuskan.
    }
  }, [keLogin])

  useEffect(() => {
    if (!aktif) return

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

      if (sisaMs <= warnMs) {
        setSisa(Math.ceil(sisaMs / 1000))
      } else {
        setSisa(null)
      }

      // Heartbeat hanya bila ada aktivitas sejak ping terakhir.
      if (refs.current.aktif > refs.current.ping && Date.now() - refs.current.ping >= pingEvery) {
        ping()
      }
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
  }, [aktif, idleMs, warnMs, pingEvery, tandaiAktif, ping, keLogin])

  if (sedangKeluar) return null

  return (
    <>
      {children}

      {/* Indikator "komputer sedang dipakai" */}
      <div
        className="fixed bottom-3 left-3 z-[60] hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/90 text-white text-xs font-semibold shadow-lg backdrop-blur pointer-events-none select-none"
        title="Komputer ini sedang dipakai pemilih"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
        </span>
        Komputer sedang dipakai
      </div>

      {/* Peringatan idle */}
      <Modal
        buka={sisa !== null}
        onTutup={() => {}}
        judul="Masih di sana?"
        lebar="max-w-md"
        aksi={
          <Tombol
            className="w-full"
            onClick={() => {
              tandaiAktif()
              setSisa(null)
            }}
          >
            Saya masih di sini
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
            Ini demi keamanan, agar komputer lab tidak bisa dipakai orang berikutnya.
          </p>
        </div>
      </Modal>
    </>
  )
}
