import { useEffect, useRef, useState } from 'react'
import { useForm, usePage } from '@inertiajs/react'
import { useApp } from '../context/AppContext'
import { Tombol, LabelKecil } from '../components/UI'
import Icon from '../components/Icon'

/*
 * Layar login.
 *
 * Satu form untuk dua peran, sama seperti aslinya:
 *  - Admin login pakai EMAIL
 *  - Pemilih login pakai NIS + kode kartu
 * Backend yang membedakan, jadi form ini tidak perlu menebak peran.
 *
 * MIGRASI: form dikirim lewat Inertia (useForm). Tidak ada lagi axios +
 * navigate manual; server yang mengalihkan ke /admin atau /user/pemilihan
 * setelah login berhasil.
 */
export default function Login() {
  const {
    siap,
    sekolah,
    aplikasi: namaAplikasi,
    tema,
    setTema,
    pesanSesiHabis,
    tutupPesanSesiHabis,
  } = useApp()

  const { data, setData, post, processing, errors, reset } = useForm({
    nis: '',
    password: '',
  })

  // GALAT DUA SUMBER:
  // - `errors` (useForm) terisi saat validasi direject server (422, lewat onError).
  // - `props.errors` (props Inertia) terisi saat backend redirect kembali dengan
  //   withErrors() -- mis. "Email/NIS atau password salah" (kasus 401 -> redirect).
  // useForm TIDAK mengangkap redirect ini, jadi props.errors wajib dibaca juga
  // agar pesan salah password tetap tampil.
  const { props } = usePage()
  const galatHalaman = props.errors?.nis || props.errors?.password

  const [lihatPassword, setLihatPassword] = useState(false)
  const [galatSesi, setGalatSesi] = useState(null)
  const refInput = useRef(null)

  useEffect(() => {
    refInput.current?.focus()
  }, [])

  // Sesi habis (idle / dipaksa keluar): tampilkan sebabnya sebagai galat.
  useEffect(() => {
    if (!pesanSesiHabis) return
    setGalatSesi(pesanSesiHabis)
    tutupPesanSesiHabis()
  }, [pesanSesiHabis, tutupPesanSesiHabis])

  const kirim = (e) => {
    e?.preventDefault()
    if (processing) return

    setGalatSesi(null)
    post('/login', {
      onError: () => {
        reset('password')
        refInput.current?.focus()
      },
    })
  }

  const galat = galatSesi || galatHalaman || errors.nis || errors.password

  return (
    <div className="min-h-screen bg-[var(--c-bg-page)] relative overflow-hidden">
      {/* Latar dekoratif */}
      <div className="pointer-events-none absolute -left-32 -top-32 w-[28rem] h-[28rem] rounded-full bg-[var(--c-primary)]/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 w-[24rem] h-[24rem] rounded-full bg-[var(--c-violet)]/20 blur-3xl" />

      {/* Tombol tema */}
      <button
        type="button"
        onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')}
        title={tema === 'dark' ? 'Mode terang' : 'Mode gelap'}
        aria-label={tema === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
        className="absolute top-5 right-5 z-20 w-11 h-11 flex items-center justify-center
          rounded-2xl bg-[var(--c-bg-surface)]/80 backdrop-blur border border-[var(--c-border)]
          text-[var(--c-text)] hover:border-[var(--c-primary)] hover:text-[var(--c-primary)]
          transition-all duration-200"
      >
        <Icon name={tema === 'dark' ? 'sun' : 'moon'} />
      </button>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Logo & judul */}
          <div className="text-center mb-8 animate-slide-up">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-linear-to-br from-[var(--c-primary)]
                to-[var(--c-primary-hover)] flex items-center justify-center
                shadow-2xl shadow-[var(--c-glow)]"
            >
              <Icon name="check-circle" className="w-8 h-8 text-white" />
            </div>

            <LabelKecil className="text-[var(--c-primary-dark)] mb-2">
              Sistem Pemungutan Suara
            </LabelKecil>

            <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-balance text-[var(--c-text)] mb-1.5 break-words">
              {namaAplikasi}
            </h1>
            {sekolah && (
              <p className="text-[var(--c-text-muted)] text-sm break-words">{sekolah}</p>
            )}
          </div>

          {/* Kartu form */}
          <div
            className="kasya-card p-6 animate-scale-up"
            style={{ animationDelay: '80ms' }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[var(--c-primary-soft)] border border-[var(--c-primary-soft-border)] flex items-center justify-center text-[var(--c-primary-dark)]">
                <Icon name="lock" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[var(--c-text)] leading-tight">Masuk</h2>
                <p className="text-xs text-[var(--c-text-muted)]">
                  Gunakan NIS dan kode kartu dari panitia
                </p>
              </div>
            </div>

            {galat && (
              <div
                role="alert"
                className="mb-5 px-4 py-3.5 rounded-2xl bg-[var(--c-rose-soft)]
                  border border-[var(--c-rose)]/40 flex items-start gap-2.5 animate-fade-in"
              >
                <Icon name="warning" className="w-5 h-5 text-[var(--c-rose)] shrink-0 mt-0.5" />
                <span className="text-[13px] font-semibold text-[var(--c-text)]">{galat}</span>
              </div>
            )}

            <form onSubmit={kirim} noValidate>
              <label htmlFor="nis" className="block text-[13px] font-semibold text-[var(--c-text)] mb-1.5">
                NIS / Email
              </label>
              <div className="relative">
                <input
                  ref={refInput}
                  id="nis"
                  name="nis"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  disabled={!siap}
                  value={data.nis}
                  onChange={(e) => setData('nis', e.target.value)}
                  placeholder="Contoh: 20250001"
                  className="w-full pl-11 pr-3 py-2.5 rounded-xl bg-[var(--c-bg-page)]
                    text-[var(--c-text)] placeholder:text-[var(--c-text-muted)]
                    border-2 border-[var(--c-border)] focus:border-[var(--c-primary)]
                    focus:ring-4 focus:ring-[var(--c-primary-soft)]
                    outline-hidden transition duration-200"
                />
                <Icon
                  name="user"
                  className="w-[18px] h-[18px] text-[var(--c-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
              </div>

              <label
                htmlFor="password"
                className="block text-[13px] font-semibold text-[var(--c-text)] mt-4 mb-1.5"
              >
                Password / Kode Kartu
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={lihatPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={!siap}
                  value={data.password}
                  onChange={(e) => setData('password', e.target.value)}
                  placeholder="Masukkan kode kartu"
                  className="w-full pl-11 pr-11 py-2.5 rounded-xl bg-[var(--c-bg-page)]
                    text-[var(--c-text)] placeholder:text-[var(--c-text-muted)]
                    border-2 border-[var(--c-border)] focus:border-[var(--c-primary)]
                    focus:ring-4 focus:ring-[var(--c-primary-soft)]
                    outline-hidden transition duration-200"
                />
                <Icon
                  name="lock"
                  className="w-[18px] h-[18px] text-[var(--c-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <button
                  type="button"
                  onClick={() => setLihatPassword((v) => !v)}
                  aria-label={lihatPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center
                    justify-center rounded-lg text-[var(--c-text-muted)] hover:text-[var(--c-text)]
                    hover:bg-[var(--c-bg-surface)] transition"
                >
                  <Icon name="eye" />
                </button>
              </div>

              <Tombol
                type="submit"
                ukuran="besar"
                className="w-full mt-5"
                memuat={processing}
                disabled={!siap || !data.nis || !data.password}
              >
                {processing ? 'Memproses...' : 'Masuk'}
                {!processing && <Icon name="chevron-right" className="w-5 h-5" />}
              </Tombol>
            </form>

            <p className="mt-6 text-xs text-[var(--c-text-muted)] text-center leading-relaxed">
              Lupa kode kartu? Hubungi petugas panitia di kelas.
            </p>
          </div>

          <p className="mt-7 text-center text-xs text-[var(--c-text-muted)]">
            Gunakan komputer yang diberikan panitia untuk memilih.
          </p>
        </div>
      </div>
    </div>
  )
}