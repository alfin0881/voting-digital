<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Catatan aktivitas (audit log). Hanya baca.
 */
class AdminAuditController extends Controller
{
    use AdminApi;

    public function index(Request $request): JsonResponse
    {
        $this->butuhIzin('audit');

        $perPage = min(100, max(5, (int) $request->input('per_page', 30)));
        $page    = max(1, (int) $request->input('page', 1));
        $search  = trim((string) $request->input('search', ''));
        $aksi    = (string) $request->input('filter_aksi', '');
        $rentang = (string) $request->input('filter_rentang', '7');

        $query = CatatanAktivitas::query()->latest();

        // '0' = semua rentang waktu.
        if ($rentang !== '0') {
            $query->where('created_at', '>=', now()->subDays((int) $rentang));
        }

        if ($aksi !== '') {
            $query->where('aksi', $aksi);
        }

        if ($search !== '') {
            $cari = "%{$search}%";
            $query->where(fn ($q) => $q->where('nama_admin', 'like', $cari)
                                       ->orWhere('deskripsi', 'like', $cari));
        }

        $total = (clone $query)->count();
        $baris = $query->paginate($perPage, ['*'], 'page', $page);

        // Label & warna diambil dari model supaya sama persis dengan Blade lama.
        $daftar = CatatanAktivitas::daftarAksi();

        return response()->json([
            'catatan' => collect($baris->items())->map(fn (CatatanAktivitas $c) => [
                'id'         => $c->id,
                'nama_admin' => $c->nama_admin ?: 'Sistem',
                'aksi'       => $c->aksi,
                'label'      => $daftar[$c->aksi]['label'] ?? $c->aksi,
                'warna'      => $daftar[$c->aksi]['warna'] ?? 'slate',
                'deskripsi'  => $c->deskripsi,
                'ip_address' => $c->ip_address,
                'waktu'      => $c->created_at?->timezone('Asia/Jakarta')->toIso8601String(),
            ]),
            'meta' => [
                'total'     => $total,
                'page'      => $baris->currentPage(),
                'per_page'  => $baris->perPage(),
                'last_page' => $baris->lastPage(),
            ],
            'daftar_aksi' => collect($daftar)->map(fn ($d, $k) => [
                'kunci' => $k, 'label' => $d['label'], 'warna' => $d['warna'],
            ])->values(),
            'total_catatan' => CatatanAktivitas::count(),
        ]);
    }
}