<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\Pemilihan;
use App\Models\Pengaturan;
use App\Services\LaporanHasil;
use App\Services\PenjagaHasil;
use Illuminate\Http\JsonResponse;

/**
 * Data untuk Mode Layar Besar (display mode) yang diputar di proyektor.
 *
 * Bedanya dengan "halaman hasil publik" yang sudah dihapus: data ini hanya
 * bisa diambil oleh admin yang sedang login. Tidak ada tautan yang bisa
 * dibagikan ke luar, jadi perolehan suara tidak bocor ke siapa pun.
 *
 * Perhitungan tetap memakai LaporanHasil — service yang sama dengan PDF dan
 * Excel — sehingga angka di layar selalu identik dengan berkas yang diunduh
 * panitia.
 */
class AdminLayarController extends Controller
{
    use AdminApi;

    public function index(LaporanHasil $laporan, PenjagaHasil $penjaga): JsonResponse
    {
        $this->butuhIzin('hasil');

        // Mode layar besar menampilkan angka mentah, jadi pemilihan yang masih
        // berlangsung dibuang saat pengaturan kerahasiaan hasil aktif.
        $terkunci = $penjaga->terkunciDari(Pemilihan::latest()->get());
        $data = collect($laporan->semua())
            ->reject(fn (array $baris) => $terkunci->contains('id', $baris['id']))
            ->values();

        // Hitung mundur ke penutupan terdekat. Dikirim sebagai jumlah detik,
        // lalu dikurangi sendiri di browser tiap detik supaya tidak terlihat
        // melompat setiap data diambil ulang.
        $terdekat = Pemilihan::where('status', 'aktif')
            ->get()
            ->filter(fn (Pemilihan $p) => $p->waktuSelesai()->isFuture())
            ->sortBy(fn (Pemilihan $p) => $p->waktuSelesai()->getTimestamp())
            ->first();

        return response()->json([
            'sekolah'        => Pengaturan::namaSekolah(),
            'judul_aplikasi' => Pengaturan::judulAplikasi(),
            'jeda'           => [
                'aktif'  => Pengaturan::benar(Pengaturan::JEDA),
                'alasan' => (string) Pengaturan::baca(Pengaturan::JEDA_ALASAN, ''),
            ],
            'penutupan' => [
                'detik' => $terdekat
                    ? max(0, now()->diffInSeconds($terdekat->waktuSelesai(), false))
                    : null,
                'nama'  => $terdekat?->nama_pemilihan,
            ],
            'diperbarui' => now()->timezone('Asia/Jakarta')->toIso8601String(),
            'data'       => $data,
            'hasil_sementara' => $penjaga->ringkasan($terkunci),
        ]);
    }
}