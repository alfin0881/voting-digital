import { useEffect, useRef } from 'react'
import Icon from './Icon'
import { kunciScroll } from '../lib/kunciScroll'

/*
 * Modal yang aman untuk dipakai di komputer lab:
 * - terkunci di layar (focus trap sederhana: Tab tidak keluar dari modal)
 * - bisa ditutup dengan Esc
 * - scroll body terkunci selagi terbuka (aman bila ada beberapa pengunci)
 * - judul & tombol aksi selalu terlihat; hanya isi yang bisa digulir
 * - tombol punya area sentuh besar untuk siswa yang memakai HP
 */
export default function Modal({
  buka,
  onTutup,
  judul,
  deskripsi,
  children,
  aksi,
  lebar = 'max-w-lg',
}) {
  const kotakRef = useRef(null)
  const tombolTutupRef = useRef(null)

  // onTutup hampir selalu fungsi inline yang berganti identitas tiap render.
  // Disimpan di ref supaya efek di bawah TIDAK dijalankan ulang setiap kali
  // induk render (mis. tiap ketikan di form). Sebelumnya itu membuat fokus
  // melompat ke tombol tutup di tengah mengetik.
  const onTutupRef = useRef(onTutup)
  useEffect(() => {
    onTutupRef.current = onTutup
  })

  useEffect(() => {
    if (!buka) return

    const sebelumnya = document.activeElement
    const lepasKunci = kunciScroll()

    // Fokus ke kontrol pertama di isi modal; kalau tidak ada, ke tombol tutup.
    const pertamaDiIsi = kotakRef.current?.querySelector(
      '[data-isi-modal] input:not([disabled]), [data-isi-modal] select:not([disabled]), [data-isi-modal] textarea:not([disabled])',
    )
    ;(pertamaDiIsi ?? tombolTutupRef.current)?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onTutupRef.current?.()
        return
      }

      if (e.key === 'Tab' && kotakRef.current) {
        const fokusable = kotakRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (!fokusable.length) return
        const pertama = fokusable[0]
        const terakhir = fokusable[fokusable.length - 1]

        if (e.shiftKey && document.activeElement === pertama) {
          e.preventDefault()
          terakhir.focus()
        } else if (!e.shiftKey && document.activeElement === terakhir) {
          e.preventDefault()
          pertama.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      lepasKunci()
      sebelumnya?.focus?.()
    }
  }, [buka])

  if (!buka) return null

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onMouseDown={(e) => {
        // Hanya tutup bila klik di area gelap, bukan di dalam kotak.
        if (e.target === e.currentTarget) onTutupRef.current?.()
      }}
    >
      <div
        ref={kotakRef}
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        className={`w-full ${lebar} max-h-[92dvh] flex flex-col overflow-hidden
          bg-[var(--c-bg-surface)] border border-[var(--c-border)]
          rounded-t-2xl sm:rounded-2xl shadow-2xl animate-scale-up`}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-[var(--c-border)] shrink-0 bg-[var(--c-bg-subtle)]">
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-[var(--c-text)] break-words">{judul}</h2>
            {deskripsi && (
              <p className="text-xs text-[var(--c-text-muted)] mt-0.5 break-words">{deskripsi}</p>
            )}
          </div>
          <button
            ref={tombolTutupRef}
            type="button"
            onClick={() => onTutupRef.current?.()}
            aria-label="Tutup"
            className="shrink-0 w-8 h-8 grid place-items-center rounded-lg
              text-[var(--c-text-muted)] hover:bg-[var(--c-bg-page)] hover:text-[var(--c-text)] transition"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div
          data-isi-modal
          className="p-5 text-[13px] flex-1 min-h-0 overflow-y-auto overscroll-contain"
        >
          {children}
        </div>

        {aksi && (
          <div
            className="px-5 py-4 border-t border-[var(--c-border)] shrink-0
              bg-[var(--c-bg-subtle)] flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5"
          >
            {aksi}
          </div>
        )}
      </div>
    </div>
  )
}
