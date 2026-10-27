<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\Admin;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

/**
 * Helper bersama untuk semua controller API admin.
 *
 * Menyediakan:
 * - ambil()            : admin yang sedang login (401 JSON kalau belum).
 * - id()               : id admin untuk Jefferson ke catatan aktivitas.
 * - tolakIzin()        : 403 kalau peran admin tidak punya akses fitur.
 * - pesanSukses()      : pembungkus respons sukses yang seragam.
 */
trait AdminApi
{
    protected function ambil(): Admin
    {
        $admin = Auth::guard('admin')->user();

        if (! $admin) {
            abort(response()->json([
                'pesan' => 'Silakan login kembali.',
                'kode'  => 'belum_login',
            ], 401));
        }

        return $admin;
    }

    protected function id(): ?int
    {
        return Auth::guard('admin')->id();
    }

    /**
     * Pemeriksaan izin per-request.
     *
     * Route sudah dilindungi middleware 'izin:...' saat dipanggil, tapi
     * pemeriksaan diulang di sini supaya aman bila peran admin berubah
     * saat halamannya masih terbuka.
     */
    protected function butuhIzin(string $fitur): Admin
    {
        $admin = $this->ambil();

        abort_unless(
            $admin->bolehAkses($fitur),
            response()->json([
                'pesan' => 'Peran Anda tidak memiliki akses ke fitur ini.',
                'kode'  => 'tidak_diizinkan',
            ], 403)
        );

        return $admin;
    }

    /**
     * Sama seperti butuhIzin(), tetapi hanya untuk Super Admin.
     *
     * Dipakai aksi yang bisa memengaruhi seluruh sistem atau membuka data
     * sensitif (restore database, membuka/menyembunyikan hasil sementara).
     */
    protected function butuhSuperAdmin(string $fitur): Admin
    {
        $admin = $this->butuhIzin($fitur);

        abort_unless(
            $admin->adalahSuperAdmin(),
            response()->json([
                'pesan' => 'Tindakan ini hanya boleh dilakukan Super Admin.',
                'kode'  => 'khusus_super_admin',
            ], 403)
        );

        return $admin;
    }

    protected function pesan(string $pesan, string $tipe = 'sukses'): JsonResponse
    {
        return response()->json([
            'berhasil' => true,
            'pesan'    => $pesan,
            'tipe'     => $tipe,
        ]);
    }

    protected function gagal(string $pesan, int $status = 422, ?string $kode = null): JsonResponse
    {
        return response()->json(array_filter([
            'pesan' => $pesan,
            'kode'  => $kode,
        ]), $status);
    }
}