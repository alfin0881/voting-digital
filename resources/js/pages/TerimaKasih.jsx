import { useEffect, useState } from 'react'
import { useNavigate } from '../lib/navigasi'
import api from '../lib/api'
import { useApp, useApi } from '../context/AppContext'
import Kerangka from '../components/Kerangka'
import Icon from '../components/Icon'
import { Kartu, Tombol, Spinner, Titik } from '../components/UI'

/*
 * Halaman "Terima Kasih" — padanan Livewire\User\TerimaKasih.
 *
 * Dua perilaku penting:
 * - Kalau masih ada pemilihan lain yang belum dipilih, JANGAN auto-logout;
 *   siswa harus diberi tombol untuk lanjut memilih.
 * - Kalau sudah selesai semua, hitung mundur lalu keluar otomatis supaya
 *   komputer lab tidak tertinggal dalam keadaan terbuka.
 */
export default function TerimaKasih() {
  const navigate = useNavigate()
  const { keluar } = useApp()

  // Data awal sudah dikirim server sebagai props Inertia; tidak ada request
  // susulan setelah halaman tampil.
  const { data } = useApi('/pemilih/setelah-memilih')
  const [sisa, setSisa] = useState(null)

  useEffect(() => {
    if (!data) return
    // Hitung mundur hanya kalau tidak ada lagi yang harus dipilih.
    setSisa(data.masih_ada_pemilihan ? null : data.countdown)
  }, [data])

  const keLogin = async () => {
    try {
      await api.post('/logout')
    } catch {
      /* abaikan */
    }
    keluar()
    navigate('/login', { replace: true })
  }

  // Hitung mundur otomatis.
  useEffect(() => {
    if (sisa === null) return
    if (sisa <= 0) {
      keLogin()
      return
    }
    const timer = setTimeout(() => setSisa((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [sisa, keluar, navigate])

  const masihAda = data?.masih_ada_pemilihan

  return (
    <Kerangka judul="Terima Kasih">
      <div className="max-w-2xl mx-auto">
        <Kartu className="p-6 sm:p-8 text-center animate-scale-up">
          {!data ? (
            <div className="py-12 flex flex-col items-center gap-4" role="status" aria-live="polite">
              <Spinner className="w-9 h-9 text-[var(--c-primary)]" />
              <p className="text-[15px] text-[var(--c-text-muted)] flex items-center gap-1">
                Memuat hasil suara
                <Titik />
              </p>
              <div className="baris-muat h-1 w-28 rounded-full" />
            </div>
          ) : (
            <>
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Icon name="check-circle" className="w-14 h-14 text-emerald-400" />
              </div>

              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--c-text)] mb-2">
                Terima Kasih!
              </h1>
              <p className="text-[15px] leading-relaxed text-[var(--c-text-muted)] mb-2">
                Pilihan Anda telah tercatat.
              </p>
              <p className="text-[15px] leading-relaxed text-[var(--c-text-muted)]">
                Suara Anda bersifat rahasia dan tidak dapat diubah.
              </p>

              {masihAda ? (
                <div className="mt-6 pt-6 border-t border-[var(--c-border)]">
                  <p className="text-[15px] leading-relaxed text-[var(--c-text)] mb-4">
                    Anda masih punya pemilihan lain yang belum dipilih. Silakan lanjutkan.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Tombol ukuran="besar" onClick={() => navigate('/user/pemilihan')}>
                      Lanjut Memilih
                    </Tombol>
                    <Tombol varian="sekunder" ukuran="besar" onClick={keLogin}>
                      Selesai & Keluar
                    </Tombol>
                  </div>
                </div>
              ) : (
                <div className="mt-6 pt-6 border-t border-[var(--c-border)]">
                  <p className="text-[15px] leading-relaxed text-[var(--c-text-muted)] mb-4">
                    Seluruh pilihan Anda sudah lengkap. Anda akan keluar otomatis dalam
                  </p>
                  <p className="text-5xl font-extrabold text-[var(--c-primary)] tabular-nums mb-6">
                    {Math.max(0, sisa ?? 0)}
                  </p>
                  <Tombol ukuran="besar" onClick={keLogin}>
                    Keluar Sekarang
                  </Tombol>
                  <p className="text-xs text-[var(--c-text-muted)] mt-4">
                    Bergantian agar komputer ini bisa dipakai pemilih berikutnya.
                  </p>
                </div>
              )}
            </>
          )}
        </Kartu>
      </div>
    </Kerangka>
  )
}