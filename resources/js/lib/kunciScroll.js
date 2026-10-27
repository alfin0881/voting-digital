/*
 * Pengunci scroll body yang aman dipakai bersamaan.
 *
 * Modal, laci menu mobile, dan peringatan idle semuanya mengunci scroll.
 * Kalau masing-masing langsung menulis document.body.style.overflow, yang
 * tertutup duluan akan membuka kunci milik yang masih terbuka. Di sini
 * dipakai penghitung: scroll baru dilepas setelah SEMUA pemakai selesai.
 */
let jumlah = 0
let aslinya = ''

export function kunciScroll() {
  if (jumlah === 0) {
    aslinya = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  jumlah += 1

  let sudahLepas = false
  return function lepas() {
    if (sudahLepas) return
    sudahLepas = true
    jumlah = Math.max(0, jumlah - 1)
    if (jumlah === 0) document.body.style.overflow = aslinya
  }
}
