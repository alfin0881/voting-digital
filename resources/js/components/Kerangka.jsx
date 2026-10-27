import { useNavigate } from '../lib/navigasi'
import { useState } from 'react'
import api from '../lib/api'
import { inisial } from '../lib/format'
import { useApp } from '../context/AppContext'
import { useStatusPemilih } from '../lib/statusPemilih'
import Icon from './Icon'

/*
 * Kerangka halaman untuk layar pemilih.
 * Meniru layouts/user.blade.php, ditambah tema terang/gelap dan tombol
 * refresh yang menggantikan cara lama.reload() penuh.
 */
export default function Kerangka({ children, judul }) {
  const { sesi, keluar, sekolah, judul: judulAplikasi, tema, setTema } = useApp()
  const navigate = useNavigate()
  const [memprosesKeluar, setMemprosesKeluar] = useState(false)

  const pilihKeluar = async () => {
    setMemprosesKeluar(true)
    try {
      await api.post('/logout')
    } catch {
      // Gagal logout tidak boleh menyisakan pengguna terjebak di layar.
    }
    keluar()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--c-bg-page)]">
      <Navbar
        judul={judulAplikasi}
        user={sesi.user}
        sekolah={sekolah}
        onKeluar={pilihKeluar}
        memprosesKeluar={memprosesKeluar}
        tema={tema}
        setTema={setTema}
      />

      <main className="flex-1 py-5 sm:py-7">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          {judul && <h1 className="sr-only">{judul}</h1>}
          <Pengumuman />
          {children}
        </div>
      </main>

      <footer className="mt-10 sm:mt-16 py-6 sm:py-8 bg-[var(--c-bg-surface)]/50 border-t border-[var(--c-border)]">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-[var(--c-text-muted)] text-sm">
            © {new Date().getFullYear()} {judulAplikasi}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

function Navbar({ judul, user, sekolah, onKeluar, memprosesKeluar, tema, setTema }) {
  return (
    <nav className="bg-[var(--c-bg-surface)]/80 backdrop-blur-lg border-b border-[var(--c-border)] sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                bg-linear-to-br from-[var(--c-primary)] to-[var(--c-primary-hover)]
                shadow-md shadow-[var(--c-glow)]"
            >
              <Icon name="check-circle" className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] sm:text-base font-bold text-[var(--c-text)] leading-tight truncate tracking-tight">
                {judul}
              </h1>
              <p className="hidden sm:block text-xs text-[var(--c-text-muted)] truncate">
                {sekolah}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {user && (
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0
                    font-black text-white bg-linear-to-br from-[var(--c-primary)]
                    to-[var(--c-primary-hover)] shadow-md shadow-[var(--c-glow)]"
                >
                  {inisial(user.nama)}
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-[13px] font-semibold text-[var(--c-text)] leading-tight truncate max-w-[160px]">
                    {user.nama}
                  </p>
                  <p className="text-xs text-[var(--c-text-muted)] truncate max-w-[160px]">
                    {user.nis ? `NIS: ${user.nis}` : ''}
                    {user.kelas ? ` • ${user.kelas}` : ''}
                  </p>
                </div>
              </div>
            )}

            <TombolTema tema={tema} setTema={setTema} />

            <button
              type="button"
              onClick={onKeluar}
              disabled={memprosesKeluar}
              title="Keluar"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--c-bahaya)] text-white
                rounded-lg hover:opacity-90 hover:shadow-lg transition duration-300 text-[13px] font-semibold
                disabled:opacity-50 active:scale-95"
            >
              <Icon name="log-out" className="w-4 h-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

function TombolTema({ tema, setTema }) {
  return (
    <button
      type="button"
      onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')}
      title={tema === 'dark' ? 'Mode terang' : 'Mode gelap'}
      aria-label={tema === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
      className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--c-bg-surface)]
        border border-[var(--c-border)] text-[var(--c-text)] hover:border-[var(--c-primary)]
        hover:text-[var(--c-primary)] transition-all duration-200"
    >
      <Icon name={tema === 'dark' ? 'sun' : 'moon'} />
    </button>
  )
}

/*
 * Banner pengumuman panitia + status jeda darurat.
 *
 * Data diambil dari useStatusPemilih() — satu poller BERSAMA untuk seluruh
 * halaman pemilih. Sebelumnya komponen ini punya timer sendiri 10 detik,
 * sementara halaman di dalamnya (LihatKandidat) punya timer 5 detik ke
 * endpoint yang sama, jadi satu terminal mengirim 3 request untuk data yang
 * sama. Sekarang semuanya berbagi satu request.
 */
function Pengumuman() {
  const status = useStatusPemilih()

  if (!status) return null

  return (
    <div className="mb-5 space-y-3">
      {status.jeda && (
        <div
          className="px-4 py-3 rounded-xl bg-[var(--c-rose-soft)] border border-[var(--c-rose)]/40
            text-[var(--c-text)] flex items-start gap-3 animate-fade-in"
        >
          <Icon name="pause" className="w-5 h-5 text-[var(--c-rose)] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Pemungutan suara sedang dijeda.</p>
            {status.jeda_alasan && (
              <p className="text-xs text-[var(--c-text-muted)] mt-0.5">{status.jeda_alasan}</p>
            )}
            <p className="text-xs text-[var(--c-text-muted)] mt-0.5">
              Silakan menunggu atau hubungi panitia.
            </p>
          </div>
        </div>
      )}

      {status.pengumuman_aktif && status.pengumuman && (
        <div className="px-4 py-3 rounded-xl bg-[var(--c-primary-soft)] border border-[var(--c-primary-soft-border)] text-[var(--c-text)] flex items-start gap-3 animate-fade-in">
          <Icon
            name={status.pengumuman_tipe === 'penting' ? 'warning' : 'info'}
            className="w-5 h-5 text-[var(--c-primary-dark)] shrink-0 mt-0.5"
          />
          <p className="text-[13px] whitespace-pre-line">{status.pengumuman}</p>
        </div>
      )}
    </div>
  )
}
