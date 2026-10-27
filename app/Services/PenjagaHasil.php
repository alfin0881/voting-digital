<?php

namespace App\Services;

use App\Models\Pemilihan;
use App\Models\Pengaturan;
use Illuminate\Support\Collection;

/**
 * Penjaga kerahasiaan hasil sementara.
 *
 * Saat panitia/pengawas menonton angka berjalan, netralitas mereka bisa
 * terpengaruh (mis. ikut mengarahkan pemilih). Pengaturan
 * `sembunyikan_hasil_sementara` menutup perolehan suara untuk pemilihan yang
 * MASIH berlangsung; hasil pemilihan yang sudah ditutup tetap terbuka.
 *
 * Aturan ini sengaja dipusatkan di satu kelas agar dashboard, halaman Hasil,
 * mode layar besar, dan ekspor PDF/Excel memakai definisi yang sama.
 */
class PenjagaHasil
{
    /** Apakah mode sembunyikan hasil sedang aktif? */
    public function aktif(): bool
    {
        return Pengaturan::benar(Pengaturan::SEMBUNYIKAN_HASIL_SEMENTARA);
    }

    /**
     * Apakah hasil pemilihan ini harus disembunyikan?
     *
     * Hanya pemilihan yang benar-benar sedang berlangsung. Pemilihan yang
     * baru akan dibuka, sudah ditutup, atau diarsipkan tetap boleh dilihat.
     */
    public function terkunci(Pemilihan $pemilihan): bool
    {
        return $this->aktif() && $pemilihan->sedangBerlangsung();
    }

    /**
     * Pemilihan yang hasilnya sedang dikunci.
     *
     * @param  Collection<int, Pemilihan>  $daftar
     * @return Collection<int, Pemilihan>
     */
    public function terkunciDari(Collection $daftar): Collection
    {
        return $daftar->filter(fn (Pemilihan $p) => $this->terkunci($p))->values();
    }

    /** Ringkasan untuk dikirim ke frontend (tanpa angka perolehan). */
    public function ringkasan(?Collection $terkunci = null): array
    {
        $daftar = ($terkunci ?? collect())->map(fn (Pemilihan $p) => [
            'id'   => $p->id,
            'nama' => $p->nama_pemilihan,
        ])->values()->all();

        return [
            'disembunyikan' => $this->aktif(),
            'terkunci'      => $daftar,
            'alasan'        => $this->aktif()
                ? 'Hasil sementara disembunyikan sampai pemungutan suara ditutup. '
                    . 'Pengaturan ini hanya dapat diubah oleh Super Admin.'
                : null,
        ];
    }
}
