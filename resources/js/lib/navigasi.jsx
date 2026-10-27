import { forwardRef, useCallback, useMemo } from 'react'
import { Link as TautanInertia, router, usePage } from '@inertiajs/react'

/*
 * Jembatan navigasi untuk komponen yang sebelumnya memakai react-router-dom.
 *
 * Migrasi ke Inertia mengganti SELURUH mekanisme pindah halaman: tidak ada
 * lagi React Router di browser. Supaya ratusan baris tampilan tidak perlu
 * ditulis ulang, modul ini menyediakan nama yang sama (Link, NavLink,
 * useNavigate, useParams, useSearchParams) tetapi dijalankan oleh router
 * Inertia.
 *
 * Yang penting: setiap perpindahan tetap berupa kunjungan Inertia, sehingga
 * data halaman berikutnya diambil server dan tidak ada reload penuh.
 */

/** navigate('/path', { replace, state }) — seperti useNavigate(). */
export function useNavigate() {
  return useCallback((tujuan, opsi = {}) => {
    if (typeof tujuan === 'number') {
      window.history.go(tujuan)
      return
    }

    router.visit(tujuan, {
      replace: Boolean(opsi.replace),
      preserveScroll: Boolean(opsi.preserveScroll),
      // `state` tidak dipakai Inertia; dibiarkan agar pemanggil lama tidak error.
    })
  }, [])
}

/** <Link to="..."> — dibungkus menjadi tautan Inertia. */
export const Link = forwardRef(function Link({ to, href, ...sisa }, ref) {
  return <TautanInertia ref={ref} href={to ?? href} {...sisa} />
})

/**
 * <NavLink to="..." end className={({isActive}) => ...}>
 * Mendukung children berupa fungsi, sama seperti react-router-dom.
 */
export const NavLink = forwardRef(function NavLink(
  { to, href, end = false, className, children, ...sisa },
  ref,
) {
  const { url } = usePage()
  const tujuan = to ?? href ?? '/'

  const aktif = useMemo(() => {
    const jalur = url.split('?')[0]
    const dasar = tujuan.split('?')[0]

    if (jalur === dasar) return true
    if (end) return false

    return jalur.startsWith(dasar.endsWith('/') ? dasar : `${dasar}/`)
  }, [url, tujuan, end])

  const kelas = typeof className === 'function' ? className({ isActive: aktif }) : className

  return (
    <TautanInertia ref={ref} href={tujuan} className={kelas} {...sisa}>
      {typeof children === 'function' ? children({ isActive: aktif }) : children}
    </TautanInertia>
  )
})

/**
 * Parameter rute dikirim server sebagai props `params`.
 * Contoh: /user/pemilihan/12/kandidat -> { pemilihanId: 12 }.
 */
export function useParams() {
  const { props } = usePage()
  return props.params ?? {}
}

/**
 * useSearchParams() hanya untuk MEMBACA query.
 *
 * Setter sengaja tidak mengubah URL sendiri: hook useAdminPage sudah memuat
 * ulang data lewat router.get(path) ketika filter berubah, dan router itu juga
 * yang memperbarui alamat di address bar. Kalau setter ikut navigasi, satu
 * perubahan filter akan mengirim dua request.
 */
export function useSearchParams() {
  const { url } = usePage()

  const params = useMemo(() => {
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
    return new URLSearchParams(query)
  }, [url])

  const setParams = useCallback(() => {}, [])

  return [params, setParams]
}

/** <Navigate to="..." replace /> — dipakai untuk pengalihan deklaratif. */
export function Navigate({ to, replace = false }) {
  // Efek langsung saat render aman karena Inertia menunda kunjungan.
  router.visit(to, { replace })
  return null
}
