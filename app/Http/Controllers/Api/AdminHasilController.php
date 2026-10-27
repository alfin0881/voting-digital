<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use App\Models\Kandidat;
use App\Models\Pemilihan;
use App\Models\Suara;
use App\Services\KeputusanPemilihan;
use App\Services\PenjagaHasil;
use Illuminate\Http\JsonResponse;

/**
 * Hasil pemilihan + pembuatan putaran kedua (runoff).
 */
class AdminHasilController extends Controller
{
    use AdminApi;

    public function index(PenjagaHasil $penjaga): JsonResponse
    {
        $this->butuhIzin('hasil');

        $data = [];
        $seri = [];
        $terkunci = [];
        $suaraTerbuka = 0;

        foreach (Pemilihan::latest()->get() as $pemilihan) {
            // Selama pemungutan masih berjalan dan mode kerahasiaan aktif,
            // jangan pernah mengirim angka perolehan ke browser. Halaman tetap
            // menerima nama pemilihan supaya panitia tahu apa yang ditutup.
            if ($penjaga->terkunci($pemilihan)) {
                $terkunci[] = [
                    'id'   => $pemilihan->id,
                    'nama' => $pemilihan->nama_pemilihan,
                ];

                continue;
            }

            $total = Suara::where('pemilihan_id', $pemilihan->id)->count();
            $suaraTerbuka += $total;

            $kandidat = Kandidat::where('pemilihan_id', $pemilihan->id)
                ->withCount('suara')
                ->orderBy('nomor_urut')
                ->get()
                ->map(fn (Kandidat $k) => [
                    'id'            => $k->id,
                    'nama_kandidat' => $k->nama_kandidat,
                    'nomor_urut'    => $k->nomor_urut,
                    'suara'         => (int) $k->suara_count,
                    'persentase'    => $total === 0 ? 0 : round(($k->suara_count / $total) * 100, 2),
                ])->values();

            $data[] = [
                'pemilihan' => [
                    'id'            => $pemilihan->id,
                    'nama_pemilihan'=> $pemilihan->nama_pemilihan,
                    'status'        => $pemilihan->status,
                    'putaran'       => $pemilihan->putaran,
                ],
                'kandidat'    => $kandidat,
                'total_suara' => $total,
                'total_peserta' => $pemilihan->totalPeserta(),
                'sudah_memilih' => $pemilihan->totalSudahMemilih(),
                'tersembunyi' => false,
            ];

            // Deteksi seri di puncak.
            if ($total > 0 && $kandidat->count() >= 2) {
                $tertinggi = $kandidat->max('suara');
                if ($kandidat->where('suara', $tertinggi)->count() >= 2) {
                    $seri[$pemilihan->id] = true;
                }
            }
        }

        return response()->json([
            'data'   => $data,
            'seri'   => $seri,
            'suara'  => $suaraTerbuka,
            'hasil_sementara' => [
                'disembunyikan' => $penjaga->aktif(),
                'terkunci'      => $terkunci,
                'alasan'        => $penjaga->aktif()
                    ? 'Hasil sementara disembunyikan sampai pemungutan suara ditutup. '
                        . 'Hasil pemilihan yang sudah ditutup tetap dapat dilihat.'
                    : null,
            ],
        ]);
    }

    /**
     * Buat pemilihan putaran kedua (runoff) dari 2 kandidat teratas
     * karena hasil seri. Putaran II dibuat nonaktif agar panitia bisa
     * mengatur jadwal dulu.
     */
    public function buatRunoff(int $id, KeputusanPemilihan $keputusan, PenjagaHasil $penjaga): JsonResponse
    {
        $this->butuhIzin('hasil');

        $induk = Pemilihan::findOrFail($id);

        if ($penjaga->terkunci($induk)) {
            return $this->gagal(
                'Hasil pemilihan masih disembunyikan sampai pemungutan suara ditutup.',
                422,
                'hasil_disembunyikan'
            );
        }

        // Pemilihan putaran II tidak boleh menjadi induk runoff lagi.
        if ($induk->adalahPutaranKedua()) {
            return $this->gagal(
                'Pemilihan ini sudah merupakan putaran kedua. Runoff tidak bisa dibuat dari runoff.',
                422,
                'sudah_putaran_dua'
            );
        }

        // Cegah tombol yang ditekan dua kali membuat beberapa Putaran II:
        // satu pemilihan induk hanya boleh punya satu pemilihan putaran kedua.
        if ($induk->putaranKedua()->exists()) {
            $sudahAda = $induk->putaranKedua()->first();
            return $this->gagal(
                "Putaran II untuk pemilihan ini sudah pernah dibuat: \"{$sudahAda->nama_pemilihan}\".",
                409,
                'runoff_sudah_ada'
            );
        }

        $rekap = $keputusan->rekap($induk);

        if (! $keputusan->seriDiPuncak($rekap)) {
            return $this->gagal('Tidak terdeteksi seri pada pemilihan ini.', 422, 'tidak_seri');
        }

        // Seri yang melibatkan lebih dari 2 kandidat tidak bisa dipecah
        // dengan format "2 teratas" — pemilihan runoff hanya cocok untuk 2.
        // Seri >= 3 harus diputuskan cara lain oleh panitia.
        $tertinggi = $rekap['kandidat'][0]['suara'];
        $jumlahSeri = count(array_filter(
            $rekap['kandidat'],
            fn ($k) => $k['suara'] === $tertinggi
        ));

        if ($jumlahSeri > 2) {
            return $this->gagal(
                "Seri terjadi pada {$jumlahSeri} kandidat dengan suara sama ({$tertinggi}). "
                . 'Runoff hanya bisa memuat 2 kandidat — putuskan dengan rapat panitia, undian, '
                . 'atau ulangi pemungutan suara untuk seluruh kandidat.',
                422,
                'seri_lebih_dari_dua'
            );
        }

        $hasil = $keputusan->buatRunoff($induk, $rekap);

        CatatanAktivitas::catat('pemilihan.runoff', "Membuat \"{$hasil['pemilihan']->nama_pemilihan}\" dari pemilihan \"{$induk->nama_pemilihan}\" (hasil seri).");

        return $this->pesan('Putaran II dibuat. Aktifkan lewat Kelola Pemilihan.');
    }
}