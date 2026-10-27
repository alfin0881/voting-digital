/*
 * Membantu memetakan error validasi Laravel ke bentuk yang enak dipakai form.
 *
 * Laravel mengirim 422 dengan bentuk:
 *   { errors: { nama_pemilihan: ["Nama pemilihan minimal 3 karakter"] } }
 *
 * Form React jauh lebih mudah kalau diubah jadi:
 *   { nama_pemilihan: "Nama pemilihan minimal 3 karakter" }
 */
export function petaGalat(e) {
  const errors = e?.response?.data?.errors
  if (!errors) return {}

  const hasil = {}
  for (const [kunci, nilai] of Object.entries(errors)) {
    hasil[kunci] = Array.isArray(nilai) ? nilai[0] : nilai
  }
  return hasil
}