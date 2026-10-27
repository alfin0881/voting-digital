import { Component } from 'react'
import Icon from './Icon'

/**
 * Penangkap error React.
 *
 * Tanpa ini, satu kesalahan render membuat seluruh halaman kosong dan
 * penyebabnya hanya terlihat di Console — padahal panelists tidak akan
 * membuka Console. Di sini error ditampilkan apa adanya di layar agar
 * jelas masalahnya di mana.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })

    // Tetap kirim ke console supaya developer punya jejak lengkap.
    console.error('Terjadi kesalahan di', this.props.alamat ?? 'aplikasi', error, info)
  }

  render() {
    const { error, info } = this.state
    const { children } = this.props

    if (!error) return children

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--c-bg-page)] px-4 py-10">
        <div className="w-full max-w-2xl bg-[var(--c-bg-surface)] border border-red-500/40 rounded-3xl shadow-2xl p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center shrink-0">
              <Icon name="warning" className="w-6 h-6 text-red-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold text-[var(--c-text)]">
                Ada kesalahan saat menampilkan halaman
              </h1>
              <p className="text-sm text-[var(--c-text-muted)] mt-1">
                Halaman ini gagal dimuat. Muat ulang dulu; kalau tetap sama, salin pesan di bawah
                dan kirim ke developer.
              </p>
            </div>
          </div>

          <pre className="mt-5 p-4 rounded-2xl bg-[var(--c-bg-page)] border border-[var(--c-border)] text-xs text-red-300 overflow-x-auto whitespace-pre-wrap break-words max-h-64">
            {error?.message ?? String(error)}
            {info?.componentStack}
          </pre>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-3 rounded-xl bg-[var(--c-primary)] hover:bg-[var(--c-primary-hover)] text-white font-semibold transition"
            >
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null, info: null })}
              className="px-5 py-3 rounded-xl bg-[var(--c-bg-page)] border border-[var(--c-border)] text-[var(--c-text)] font-semibold transition"
            >
              Coba Lagi
            </button>
            <a
              href="/login"
              className="px-5 py-3 rounded-xl bg-[var(--c-bg-page)] border border-[var(--c-border)] text-[var(--c-text)] font-semibold transition"
            >
              Ke Halaman Login
            </a>
          </div>
        </div>
      </div>
    )
  }
}
