<?php

namespace App\Http\Controllers\Halaman;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Inertia\Inertia;
use Inertia\Response as HalamanInertia;

/**
 * Halaman panel admin (Inertia).
 *
 * Logika data TIDAK diduplikasi di sini. Setiap method memanggil controller
 * API yang sudah ada (sumber aturan bisnis + pemeriksaan izin) lalu meneruskan
 * hasilnya sebagai props Inertia.
 *
 * Keuntungannya:
 * - satu sumber kebenaran untuk angka & aturan (API tetap hidup untuk aksi
 *   tulis, polling, dan test yang sudah ada);
 * - data halaman pertama datang bersama HTML, jadi React tidak perlu
 *   menembak request tambahan setelah mount.
 */
class AdminHalamanController extends Controller
{
    public function dashboard(): HalamanInertia
    {
        return Inertia::render('admin/Dashboard', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminDashboardController::class, 'index'),
        ]);
    }

    public function pemilihan(): HalamanInertia
    {
        return Inertia::render('admin/KelolaPemilihan', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminPemilihanController::class, 'index'),
        ]);
    }

    public function kandidat(): HalamanInertia
    {
        return Inertia::render('admin/KelolaKandidat', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminKandidatController::class, 'index'),
        ]);
    }

    public function anggota(): HalamanInertia
    {
        return Inertia::render('admin/KelolaAnggota', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminAnggotaController::class, 'index'),
        ]);
    }

    public function kelas(): HalamanInertia
    {
        return Inertia::render('admin/KelolaKelas', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminKelasController::class, 'index'),
        ]);
    }

    public function pantau(): HalamanInertia
    {
        return Inertia::render('admin/Pantau', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminPantauController::class, 'index'),
        ]);
    }

    public function kendali(): HalamanInertia
    {
        return Inertia::render('admin/Kendali', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminKendaliController::class, 'index'),
        ]);
    }

    public function sesi(): HalamanInertia
    {
        return Inertia::render('admin/SesiAktif', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminSesiController::class, 'index'),
        ]);
    }

    public function adminAktif(): HalamanInertia
    {
        return Inertia::render('admin/AdminAktif', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminAktifController::class, 'index'),
        ]);
    }

    public function hasil(): HalamanInertia
    {
        return Inertia::render('admin/Hasil', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminHasilController::class, 'index'),
        ]);
    }

    public function akun(): HalamanInertia
    {
        return Inertia::render('admin/KelolaAdmin', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminKelolaAdminController::class, 'index'),
        ]);
    }

    public function backup(): HalamanInertia
    {
        return Inertia::render('admin/Backup', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminBackupController::class, 'index'),
        ]);
    }

    public function audit(): HalamanInertia
    {
        return Inertia::render('admin/AuditLog', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminAuditController::class, 'index'),
        ]);
    }

    public function pengaturan(): HalamanInertia
    {
        return Inertia::render('admin/Pengaturan', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminPengaturanController::class, 'index'),
        ]);
    }

    public function keamanan(): HalamanInertia
    {
        return Inertia::render('admin/KeamananAkun', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminKeamananController::class, 'index'),
        ]);
    }

    /** Mode proyektor: satu layar penuh, tanpa kerangka admin. */
    public function layarBesar(): HalamanInertia
    {
        return Inertia::render('admin/LayarBesar', [
            'data' => $this->props(\App\Http\Controllers\Api\AdminLayarController::class, 'index'),
        ]);
    }

    /**
     * Panggil method controller API dan ambil array JSON-nya.
     *
     * `app()->call` dipakai supaya dependency (Request, service) tetap
     * di-resolve seperti request biasa, termasuk query string filter halaman
     * (?page=, ?search=, ?pemilihan=). Dengan begitu pagination & filter
     * bekerja tanpa kode tambahan.
     */
    private function props(string $controller, string $method, array $parameter = []): array
    {
        $hasil = app()->call([app($controller), $method], $parameter);

        if ($hasil instanceof JsonResponse) {
            return (array) $hasil->getData(true);
        }

        return (array) $hasil;
    }
}
