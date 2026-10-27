<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Daftar pemilih yang sedang login + logout paksa.
 *
 * Halaman ini khusus SESI PEMILIH (komputer lab). Sesi admin/panitia punya
 * halaman sendiri: AdminAktifController (/admin/admin-aktif), supaya tidak
 * bercampur.
 *
 * Hanya berfungsi bila SESSION_DRIVER=database (diberi tahu lewat
 * "tersedia": false bila tidak).
 */
class AdminSesiController extends Controller
{
    use AdminApi;

    public function index(): JsonResponse
    {
        $this->butuhIzin('sesi');

        if (! $this->driverDatabase()) {
            return response()->json([
                'tersedia' => false,
                'alasan'   => 'Fitur ini butuh SESSION_DRIVER=database di file .env.',
                'sesi'     => [],
                'ganda'    => [],
                'idle_timeout' => (int) config('voting.idle_timeout'),
            ]);
        }

        $t     = config('session.table', 'sessions');
        $sesi  = $this->querySesiPemilih()
            ->orderByDesc("{$t}.last_activity")
            ->get(["{$t}.id as sesi_id", "{$t}.ip_address", "{$t}.last_activity",
                   'pemilih.id as pemilih_id', 'pemilih.nama', 'pemilih.nis', 'pemilih.kelas'])
            ->map(function ($row) {
                $row->diam = max(0, now()->timestamp - (int) $row->last_activity);

                return [
                    'sesi_id'    => $row->sesi_id,
                    'ip_address' => $row->ip_address,
                    'diam'       => $row->diam,
                    'pemilih_id' => $row->pemilih_id,
                    'nama'       => $row->nama,
                    'nis'        => $row->nis,
                    'kelas'      => $row->kelas,
                ];
            });

        // NIS yang login di lebih dari satu komputer -> tandai
        $ganda = $sesi->groupBy('pemilih_id')->filter(fn ($g) => $g->count() > 1)->keys()->values();

        return response()->json([
            'tersedia'     => true,
            'sesi'         => $sesi,
            'ganda'        => $ganda,
            'idle_timeout' => (int) config('voting.idle_timeout'),
        ]);
    }

    /** Keluarkan paksa satu sesi pemilih. */
    public function destroy(string $sesiId): JsonResponse
    {
        $this->butuhIzin('sesi');

        if (! $this->driverDatabase()) {
            return $this->gagal('Fitur ini butuh SESSION_DRIVER=database.', 422, 'tersedia');
        }

        $t = config('session.table', 'sessions');

        // Hanya sesi milik pemilih; sesi admin tidak ikut terhapus.
        $hapus = DB::table($t)
            ->where('id', $sesiId)
            ->where('id', '!=', session()->getId())
            ->whereIn('user_id', DB::table('pemilih')->select('id'))
            ->delete();

        if ($hapus) {
            CatatanAktivitas::catat('sesi.keluarkan', "Mengeluarkan paksa satu sesi pemilih (id {$sesiId}).");
        }

        return $hapus
            ? $this->pesan('Sesi pemilih berhasil dikeluarkan.')
            : $this->gagal('Sesi sudah berakhir.', 422, 'sudah_berakhir');
    }

    /** Keluarkan semua sesi pemilih. */
    public function destroySemua(): JsonResponse
    {
        $this->butuhIzin('sesi');

        if (! $this->driverDatabase()) {
            return $this->gagal('Fitur ini butuh SESSION_DRIVER=database.', 422, 'tidak_tersedia');
        }

        $jumlah = DB::table(config('session.table', 'sessions'))
            ->where('id', '!=', session()->getId())
            ->whereIn('user_id', DB::table('pemilih')->select('id'))
            ->delete();

        CatatanAktivitas::catat('sesi.keluarkan_semua', "Mengeluarkan paksa {$jumlah} sesi pemilih.");

        return $this->pesan("{$jumlah} sesi pemilih dikeluarkan.");
    }

    /**
     * Sesi pemilih yang masih dianggap aktif.
     * sessions.user_id hanya terisi ID pemilih; sesi admin bernilai null.
     */
    private function querySesiPemilih()
    {
        $t     = config('session.table', 'sessions');
        $batas = now()->timestamp
            - (int) config('voting.idle_timeout')
            - (int) config('voting.idle_server_grace');

        return DB::table($t)
            ->join('pemilih', 'pemilih.id', '=', "{$t}.user_id")
            ->where("{$t}.id", '!=', session()->getId())
            ->where("{$t}.last_activity", '>=', $batas);
    }

    private function driverDatabase(): bool
    {
        return config('session.driver') === 'database';
    }
}