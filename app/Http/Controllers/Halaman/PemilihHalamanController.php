<?php

namespace App\Http\Controllers\Halaman;

use App\Http\Controllers\Api\PemilihController as PemilihApi;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as Halaman;

/**
 * Halaman pemilih (Inertia).
 *
 * Data awal (daftar pemilihan, kandidat, status terima kasih) dikirim bersama
 * HTML, sehingga layar pemilih tidak lagi menampilkan spinner sebelum
 * /api/pemilih/* selesai. Endpoint JSON tetap ada untuk polling status jeda
 * dan pengumuman.
 */
class PemilihHalamanController extends Controller
{
    public function daftar(): Halaman
    {
        return Inertia::render('DaftarPemilihan', [
            'data'   => $this->props('daftar'),
            'params' => [],
        ]);
    }

    public function kandidat(int $pemilihan): Halaman|RedirectResponse
    {
        $hasil = app(PemilihApi::class)->kandidat($pemilihan);

        // Tidak terdaftar / pemilihan sudah tidak boleh menerima suara.
        if ($hasil->getStatusCode() !== 200) {
            $data = (array) $hasil->getData(true);

            return redirect('/user/pemilihan')
                ->with('error', $data['pesan'] ?? 'Pemilihan tidak dapat dibuka.');
        }

        return Inertia::render('LihatKandidat', [
            'data'   => (array) $hasil->getData(true),
            'params' => ['pemilihanId' => $pemilihan],
        ]);
    }

    /**
     * Simpan suara lewat Inertia (bukan axios), lalu redirect ke terima kasih.
     *
     * Endpoint /api/pemilih/.../suara tetap tersedia untuk kompatibilitas,
     * tetapi halaman baru memakai jalur ini supaya tidak ada dua kali
     * perpindahan halaman (POST lalu navigate).
     */
    public function suara(Request $request, int $pemilihan): RedirectResponse
    {
        $hasil = app(PemilihApi::class)->suara($request, $pemilihan);
        $data  = (array) $hasil->getData(true);

        if ($hasil->getStatusCode() === 200) {
            return redirect('/user/terima-kasih');
        }

        // Sudah memilih / jeda / kandidat salah: kembali dengan pesan.
        return redirect("/user/pemilihan/{$pemilihan}/kandidat")
            ->with('error', $data['pesan'] ?? 'Suara gagal disimpan.');
    }

    public function setelahMemilih(): Halaman
    {
        return Inertia::render('TerimaKasih', [
            'data'   => $this->props('setelahMemilih'),
            'params' => [],
        ]);
    }

    /** Panggil method controller API dan ambil array JSON-nya. */
    private function props(string $method): array
    {
        $hasil = app(PemilihApi::class)->{$method}();

        return $hasil instanceof JsonResponse ? (array) $hasil->getData(true) : [];
    }
}
