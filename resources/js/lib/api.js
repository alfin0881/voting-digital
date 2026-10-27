import axios from 'axios'

/*
 * Klien HTTP tunggal untuk seluruh aplikasi.
 *
 * Dua hal penting soal sesi Laravel:
 * 1. withCredentials: true  -> cookie sesi ikut dikirim (wajib, karena login
 *                              memakai guard session, bukan token).
 * 2. Token CSRF            -> Laravel otomatis menulis cookie `XSRF-TOKEN`
 *                              saat request web_group pertama. Axios membacanya
 *                              dan mengirim balik sebagai header X-XSRF-TOKEN.
 *                              Jadi PANGGIL endpoint GET dulu (mis. /api/config)
 *                              sebelum POST, atau tokennya belum ada.
 *
 * Saat development semua request lewat proxy Vite ke Backend, jadi browser
 * tetap melihat satu origin dan tidak ada masalah SameSite.
 */
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
  },
})

/**
 * Ambil pesan error yang aman untuk ditampilkan ke pengguna.
 * Endpoint kita selalu mengirim JSON { pesan: "..." }, jadi dipakai lebih dulu.
 */
export function pesanError(error, fallback = 'Terjadi kesalahan. Silakan coba lagi.') {
  const dariServer = error?.response?.data?.pesan
  if (dariServer) return dariServer

  if (error?.response?.status === 0 || error?.code === 'ERR_NETWORK') {
    return 'Tidak dapat terhubung ke server. Periksa jaringan, lalu hubungi panitia.'
  }

  if (error?.response?.data?.errors) {
    // Error validasi Laravel: ambil pesan pertama.
    const pertama = Object.values(error.response.data.errors)[0]
    if (Array.isArray(pertama) && pertama[0]) return pertama[0]
  }

  return fallback
}

export function kodeError(error) {
  return error?.response?.data?.kode ?? null
}

export function statusError(error) {
  return error?.response?.status ?? null
}

/** True bila sesi sudah tidak valid (idle habis / belum login). */
export function sesiHabis(error) {
  const status = statusError(error)
  return status === 401 || status === 419
}

export default api