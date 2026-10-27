import { useEffect, useState } from 'react'
import api, { sesiHabis } from './api'

/*
 * Satu sumber data bersama untuk /api/pemilih/status.
 *
 * MASALAH YANG DISELESAIKAN
 * ------------------------
 * Sebelum ini endpoint yang sama dipanggil dari beberapa tempat sekaligus:
 *   - components/Kerangka.jsx  (Pengumuman)   -> tiap 10 detik
 *   - pages/DaftarPemilihan.jsx               -> tiap 10 detik
 *   - pages/LihatKandidat.jsx                  -> tiap 5 detik
 *
 * Halaman kandidat berada DI DALAM Kerangka, jadi satu terminal mengirim tiga
 * request yang isinya persis sama. Pada 30 terminal-terminal itu berarti
 * ratusan request per menit, semuanya untuk data yang tidak berubah.
 *
 * CARA KERJA
 * ---------
 * - Hanya ada SATU timer dan SATU request berjalan, berapa pun jumlah
 *   komponen yang memakainya.
 * - Komponen berlangganan lewat useStatusPemilih().
 * - Kalau sebuah request masih berjalan, pemanggil lain menunggu request itu
 *   (in-flight), bukan membuka koneksi baru.
 * - Timer hanya hidup selama masih ada komponen yang berlangganan, dan
 *   berhenti sendiri saat tidak ada yang memakai.
 *
 * CATATAN PENTING
 * ---------------
 * Ini TIDAK mengubah aturan penguncian suara maupun jeda. Yang diubah hanya
 * cara data diambil: satu request bersama, bukan tiga. Nilai `jeda` yang
 * diterima tiap komponen sama persis seperti sebelumnya.
 */

// Seberapa sering data diambil ulang: mengikuti consumer tercepat
// (LihatKandidat, 5 detik).
const SELA_MS = 5000

// Kalau data baru saja tiba, pakai yang itu daripada buka request lagi.
const SEGAR_MS = 2500

/** Data terakhir yang diketahui, beserta waktu terakhir diambil. */
let cache = null

/** Request yang sedang berjalan, supaya tidak terjadi permintaan ganda. */
let berjalan = null

/** Komponen yang berlangganan. */
const pendengar = new Set()

let timer = null

const sekarang = () => Date.now()

/**
 * Ambil status pemilih. Satu request dipakai bersama semua pemanggil.
 */
function ambil() {
  // Data masih segar -> pakai cache, jangan query server.
  if (cache && sekarang() - cache.pada < SEGAR_MS) {
    return Promise.resolve(cache.data)
  }

  // Request sebelumnya belum selesai -> tunggu, jangan buka yang baru.
  if (berjalan) return berjalan

  berjalan = api
    .get('/pemilih/status')
    .then((res) => {
      cache = { data: res.data, pada: sekarang() }
      return cache.data
    })
    .catch((e) => {
      // Sesi habis: biarkan cache apa adanya supaya pemanggil berikutnya
      // tetap mencoba (bisa saja sesi sudah login ulang).
      if (!sesiHabis(e)) cache = null
      throw e
    })
    .finally(() => {
      berjalan = null
    })

  return berjalan
}

/** Siarkan data ke semua pendengar. */
function siarkan(data) {
  pendengar.forEach((fn) => {
    try {
      fn(data)
    } catch {
      // Satu pendengar bermasalah jangan menggagalkan yang lain.
    }
  })
}

function berhenti() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function hidup() {
  if (timer || pendengar.size === 0) return

  timer = setInterval(() => {
    ambil()
      .then(siarkan)
      .catch(() => {
        // Diamkan; siklus berikutnya mencoba lagi.
      })
  }, SELA_MS)
}

/**
 * Berlangganan status pemilih.
 *
 * @param {Function} fn  dipanggil dengan data terbaru setiap ada pembaruan
 * @returns {Function}    unsubscribe
 */
function berlangganan(fn) {
  pendengar.add(fn)
  hidup()

  // Kirim data yang sudah ada supaya komponen langsung terisi tanpa menunggu.
  if (cache) {
    try {
      fn(cache.data)
    } catch {
      // abaikan
    }
  }

  return () => {
    pendengar.delete(fn)
    if (pendengar.size === 0) berhenti()
  }
}

/**
 * Paksa ambil data terbaru sekarang juga (dipakai saat halaman pertama dibuka).
 * Hasilnya otomatis disiarkan ke semua pendengar.
 */
export function segarkanStatusPemilih() {
  return ambil()
    .then((data) => {
      siarkan(data)
      return data
    })
    .catch(() => null)
}

/**
 * Hook React untuk status pemilih.
 *
 * Dipakai begitu saja di komponen:
 *   const status = useStatusPemilih()
 *   if (status?.jeda) ...
 */
export function useStatusPemilih() {
  const [status, setStatus] = useState(cache ? cache.data : null)

  useEffect(() => {
    // Daftar dulu supaya hasil ambil() langsung masuk ke state.
    const lepas = berlangganan(setStatus)

    // Page load: minta data sekarang, jangan tunggu timer 5 detik pertama.
    segarkanStatusPemilih()

    return lepas
  }, [])

  return status
}

export { berlangganan }