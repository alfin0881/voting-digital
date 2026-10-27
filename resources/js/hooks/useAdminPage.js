import { useCallback, useEffect, useRef, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import api, { kodeError, pesanError, sesiHabis, statusError } from '../lib/api'
import { useNavigate } from '../lib/navigasi'
import { useApp } from '../context/AppContext'

/*
 * Hook bersama untuk halaman admin.
 *
 * MIGRASI INERTIA:
 * - Data awal TIDAK diambil lagi lewat axios setelah halaman mount. Server
 *   sudah mengirimnya sebagai props `data` bersama HTML, jadi tabel/kartu bisa
 *   langsung tampil (tidak ada spinner awal).
 * - `muatUlang()` memakai partial reload Inertia: HANYA prop `data` yang
 *   diminta ulang. Props auth/config tidak ikut dihitung, jadi polling jauh
 *   lebih ringan daripada request JSON penuh sebelumnya.
 * - Ketika filter berubah (path berisi ?page=, ?search=, ...), data dimuat
 *   ulang lewat router.get sehingga alamat di address bar ikut benar dan bisa
 *   di-bookmark.
 */
export function useAdminPage(path, { izin, polling } = {}) {
  const { props } = usePage()
  const navigate = useNavigate()
  const { notifikasi, sesi } = useApp()

  const [memuat, setMemuat] = useState(false)
  const [galat, setGalat] = useState(null)

  const jalurRef = useRef(path)
  const mountRef = useRef(false)

  // Selalu baca path terbaru tanpa membuat ulang callback (penting agar
  // polling tidak di-reset setiap kali filter berubah).
  const pathRef = useRef(path)
  pathRef.current = path

  const muat = useCallback(
    ({ diam = false, ubahUrl = false } = {}) => {
      // Hemat kuota & baterai: jangan polling saat tab tidak terlihat.
      if (diam && typeof document !== 'undefined' && document.hidden) {
        return Promise.resolve()
      }

      if (!diam) setMemuat(true)
      setGalat(null)

      return new Promise((resolve) => {
        const opsi = {
          only: ['data'],
          preserveScroll: true,
          preserveState: true,
          onSuccess: () => resolve(),
          onError: (e) => {
            setGalat(e)
            resolve()
          },
          onHttpException: (e) => {
            setGalat(e)
            tangani(e)
            resolve()
          },
          onFinish: () => setMemuat(false),
        }

        if (ubahUrl) {
          router.get(pathRef.current, {}, { ...opsi, replace: true })
        } else {
          router.reload(opsi)
        }
      })
    },
    // `tangani` hanya memakai nilai stabil dari context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /** 401/419 = sesi habis -> balik login. 403 = tidak punya izin. */
  const tangani = useCallback(
    (e) => {
      const status = statusError(e) ?? e?.status ?? null

      if (status === 401 || status === 419) {
        router.visit('/login', { replace: true })
        return
      }

      if (status === 403) {
        notifikasi(pesanError(e, 'Peran Anda tidak memiliki akses ke fitur ini.'), 'bahaya')
        router.visit('/admin', { replace: true })
      }
    },
    [navigate, notifikasi],
  )

  // Muat ulang ketika filter berubah — tetapi JANGAN saat mount, karena data
  // awal sudah dikirim server. Ini yang menghilangkan request ganda.
  useEffect(() => {
    if (!mountRef.current) {
      mountRef.current = true
      jalurRef.current = path
      return
    }

    if (path !== jalurRef.current) {
      jalurRef.current = path
      muat({ ubahUrl: true })
    }
  }, [path, muat])

  // Polling opsional (dashboard, pantau, monitor hari-H).
  useEffect(() => {
    if (!polling) return undefined

    const timer = setInterval(() => muat({ diam: true }), polling)
    return () => clearInterval(timer)
  }, [polling, muat])

  // Alihkan ke dashboard bila peran tidak punya izin halaman ini. Server juga
  // menolak lewat middleware; ini hanya jaring pengaman di sisi tampilan.
  useEffect(() => {
    if (izin && sesi.siap && Array.isArray(sesi.izin) && !sesi.izin.includes(izin)) {
      navigate('/admin', { replace: true })
    }
  }, [izin, sesi.siap, sesi.izin, navigate])

  return {
    data: props.data ?? null,
    memuat,
    galat,
    muatUlang: muat,
    // Tidak dipakai lagi, dipertahankan agar halaman lama tidak error.
    setData: () => {},
    tangani,
  }
}

/**
 * Pembungkus aksi POST/PUT/DELETE untuk halaman admin.
 * Aksi tulis tetap memakai JSON API karena butuh kode error spesifik
 * (409 sudah memilih, 422 validasi, dsb). Navigasi & data awal memakai Inertia.
 */
export function useAksiAdmin() {
  const { notifikasi } = useApp()
  const [memuat, setMemuat] = useState(false)

  const jalankan = useCallback(
    async (fn, { sukses = 'Berhasil.', diam = false } = {}) => {
      setMemuat(true)
      try {
        const hasil = await fn()

        if (hasil?.data?.pesan && !diam) {
          notifikasi(hasil.data.pesan, hasil.data.tipe || 'sukses')
        } else if (!diam) {
          notifikasi(sukses, 'sukses')
        }

        return hasil
      } catch (e) {
        const status = statusError(e)
        if (status !== 422) {
          notifikasi(pesanError(e), 'bahaya')
        }
        throw e
      } finally {
        setMemuat(false)
      }
    },
    [notifikasi],
  )

  return { jalankan, memuat }
}

/** Konfirmasi tindakan berbahaya (hapus, keluarkan paksa, dsb). */
export function useKonfirmasi() {
  const [konfirmasi, setKonfirmasi] = useState(null)
  const { jalankan, memuat } = useAksiAdmin()

  const tanya = useCallback((payload) => setKonfirmasi(payload), [])

  const jalankanKonfirmasi = useCallback(async () => {
    if (!konfirmasi?.aksi) return

    try {
      await jalankan(konfirmasi.aksi, { sukses: konfirmasi.sukses, diam: konfirmasi.diam })
      setKonfirmasi(null)
    } catch {
      // Pesan sudah ditampilkan lewat toast; modal dibiarkan terbuka.
    }
  }, [konfirmasi, jalankan])

  return { konfirmasi, tanya, jalankanKonfirmasi, tutup: () => setKonfirmasi(null), memuat }
}

export { api, kodeError, pesanError, sesiHabis, statusError }
