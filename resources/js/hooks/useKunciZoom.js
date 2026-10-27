import { useEffect } from 'react'

/*
 * Kunci zoom tampilan.
 *
 * MASALAH: di Mode Layar Besar, panelists sering reconhecida menekan
 * Ctrl+'+' / Ctrl+'-' atau Ctrl+scroll untuk "memperbesar angka". Browser
 * lalu memperbesar SELURUH halaman, dan dari situ tidak ada tombol yang
 * mengembalikan ukuran normal — deretan angka jadi terpotong di tepi layar
 * proyektor sampai halaman harus dimuat ulang.
 *
 * Yang dikunci di sini:
 *   - Ctrl (atau Cmd di Mac) + '+', '-', '=', '_', dan '0'
 *   - Ctrl + scroll / trackpad (zoom sentuh)
 *   - cubitan / sentuhan dua jari pada layar sentuh
 *
 * PENTING — BATASNYA: ini hanya menahan ZOOM. Scroll, Ctrl+C, Ctrl+P, dan
 * semua pintasan lain tetap jalan. Menu zoom browser (tiga titik) tidak bisa
 * dikunci dari JavaScript; pengaturan kiosk browser (Appearance > Zoom harus
 * "Block") tetap perlu dilakukan manual di perangkat proyektor.
 *
 * CATATAN AKSESIBILITAS: memblokir zoom berarti orang yang butuh memperbesar
 * teks tidak bisa melakukannya dengan pintasan keyboard. Karena itu hook ini
 * HANYA dipasang di halaman layar besar yang dipandang jauh, bukan di panel
 * admin yang dipakai bekerja dari dekat.
 *
 * @param {boolean} aktif true untuk mengunci, false untuk melepas.
 */
export function useKunciZoom(aktif = true) {
  useEffect(() => {
    if (!aktif) return undefined

    /* Pintasan keyboard pembesar/perkecil. `preventDefault` di sini yang
       memblokir aksi browser; `stopPropagation` supaya handler halaman lain
       (mis. F11 di layar besar) tetap bisa bekerja. */
    const kunci = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return

      const k = e.key
      const zoom =
        k === '+' ||
        k === '=' || // Shift+= untuk "+" di banyak keyboard
        k === '-' ||
        k === '_' || // Shift+- untuk "_"
        k === '0' || // Ctrl+0 = kembali ke 100%
        k === 'Add' ||
        k === 'Subtract' ||
        k === 'Equal' ||
        k === 'NumpadAdd' ||
        k === 'NumpadSubtract'

      if (zoom) e.preventDefault()
    }

    /* Ctrl + scroll. `ctrlKey` true saat pengguna memutar scroll sambil
       menahan Ctrl — inilah yang membuat browser zoom. Tanpa modifier,
       scroll biasa tetap berfungsi. */
    const roda = (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault()
    }

    /* Cubitan (pinch) pada layar sentuh. */
    const cubit = (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault()
    }

    // `passive: false` wajib, tanpa itu preventDefault pada scroll diabaikan.
    document.addEventListener('keydown', kunci)
    document.addEventListener('wheel', roda, { passive: false })
    document.addEventListener('touchmove', cubit, { passive: false })

    return () => {
      document.removeEventListener('keydown', kunci)
      document.removeEventListener('wheel', roda)
      document.removeEventListener('touchmove', cubit)
    }
  }, [aktif])
}