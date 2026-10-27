import { useApp } from '../context/AppContext'
import Icon from './Icon'

/*
 * Wadah toast. Dipasang sekali di dalam <JagaSesi>/<JagaSesiAdmin> supaya
 * notifikasi tetap tampil di semua halaman.
 *
 * Dibuat dengan `role="status"` + `aria-live="polite"` supaya pembaca layar
 * ikut membacakan pesan, tidak hanya pengguna yang bisa melihat.
 *
 * Bentuknya: kartu putih berlapis warna di tepi kiri + ikon. Lebih modern
 * daripada blok warna solid, dan di mode terang tetap terbaca.
 */
export default function ToastWadah() {
  const { toast } = useApp()
  if (!toast.length) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none"
    >
      {toast.map((t) => {
        const gaya = GAYA[t.tipe] ?? GAYA.sukses

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 pl-3.5 pr-4 py-3
              rounded-xl bg-[var(--c-bg-surface)] border border-[var(--c-border)]
              shadow-xl animate-slide-up max-w-[90vw] ${gaya.garis}`}
          >
            <span
              className={`w-8 h-8 shrink-0 grid place-items-center rounded-lg ${gaya.latar}`}
            >
              <Icon name={IKON[t.tipe] ?? IKON.sukses} className="w-4 h-4" />
            </span>
            <span className="text-[13px] font-medium text-[var(--c-text)]">{t.pesan}</span>
          </div>
        )
      })}
    </div>
  )
}

const GAYA = {
  sukses: {
    garis: 'border-l-4 border-l-[var(--c-emerald)]',
    latar: 'bg-[var(--c-emerald-soft)] text-[var(--c-emerald)]',
  },
  bahaya: {
    garis: 'border-l-4 border-l-[var(--c-bahaya)]',
    latar: 'bg-[var(--c-rose-soft)] text-[var(--c-bahaya)]',
  },
  peringatan: {
    garis: 'border-l-4 border-l-[var(--c-amber)]',
    latar: 'bg-[var(--c-amber-soft)] text-[var(--c-amber)]',
  },
  informasi: {
    garis: 'border-l-4 border-l-[var(--c-primary)]',
    latar: 'bg-[var(--c-primary-soft)] text-[var(--c-primary-dark)]',
  },
}

const IKON = {
  sukses: 'check-circle',
  bahaya: 'x-circle',
  peringatan: 'warning',
  informasi: 'info',
}