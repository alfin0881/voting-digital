<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use App\Support\LacakSesiAdmin;
use Illuminate\Http\JsonResponse;

/**
 * Admin/panitia yang SEDANG LOGIN, plus aksi memutus sesinya.
 *
 * Dipisah dari AdminSesiController (halaman "Sesi Aktif") karena keduanya
 * beda hal: Sesi Aktif membahas pemilih di komputer lab, sedangkan halaman
 * ini membahas pengelola yang sedang memakai panel.
 *
 * Akses KESELURUHAN halaman ini hanya untuk Super Admin: kunci izin
 * 'sesi_admin' di config/peran_admin.php tidak diberikan ke peran lain, jadi
 * Panitia dan Pengawas otomatis mendapat 403 (menu-nya juga tidak muncul).
 *
 * Catatan soal LacakSesiAdmin: tabel `sessions` tidak bisa dipakai untuk
 * melihat sesi admin (payload-nya terenkripsi dan user_id-nya sengaja null),
 * jadi sesi admin dilacak sendiri di tabel `sesi_admin`.
 *
 * Hanya berfungsi bila SESSION_DRIVER=database; kalau tidak, backend
 * mengirim { tersedia: false } beserta cara mengaktifkannya.
 */
class AdminAktifController extends Controller
{
    use AdminApi;

    /** Daftar admin/panitia yang sedang login, terbaru dulu. */
    public function index(): JsonResponse
    {
        $admin = $this->butuhIzin('sesi_admin');

        if (! $this->driverDatabase()) {
            return response()->json([
                'tersedia' => false,
                'alasan'   => 'Fitur ini butuh SESSION_DRIVER=database di file .env.',
                'sesi'     => [],
                'saya_id'  => $admin->id,
            ]);
        }

        $saya = session()->getId();

        $sesi = LacakSesiAdmin::daftar()->map(fn ($s) => [
            'sesi_id'     => $s->session_id,
            'admin_id'    => $s->admin_id,
            'nama'        => $s->admin?->nama ?? 'Akun dihapus',
            'email'       => $s->admin?->email,
            'peran'       => $s->admin?->peranAdmin(),
            'label_peran' => $s->admin?->labelPeranAdmin() ?? '-',
            'ip_address'  => $s->ip_address,
            'perangkat'   => $s->perangkat,
            'diam'        => max(0, now()->timestamp - $s->last_activity->timestamp),
            'sejak'       => $s->masuk_at?->timestamp,
            'durasi'      => max(0, now()->timestamp - (int) $s->masuk_at?->timestamp),
            'saya'        => $s->session_id === $saya,
        ])->values();

        return response()->json([
            'tersedia' => true,
            'sesi'     => $sesi,
            'saya_id'  => $admin->id,
        ]);
    }

    /** Keluarkan paksa satu sesi admin/panitia. */
    public function destroy(string $sesiId): JsonResponse
    {
        $this->butuhIzin('sesi_admin');

        if (! $this->driverDatabase()) {
            return $this->gagal('Fitur ini butuh SESSION_DRIVER=database.', 422, 'tidak_tersedia');
        }

        $saya   = session()->getId();
        $target = LacakSesiAdmin::cari($sesiId);

        if ($sesiId === $saya) {
            return $this->gagal('Sesi Anda sendiri tidak bisa dikeluarkan.', 422, 'sesi_sendiri');
        }

        if (! $target) {
            return $this->gagal('Sesi sudah berakhir.', 422, 'sudah_berakhir');
        }

        $nama = $target->admin?->nama ?? 'Admin';

        if (! LacakSesiAdmin::keluarkan($sesiId, $saya)) {
            return $this->gagal('Sesi sudah berakhir.', 422, 'sudah_berakhir');
        }

        CatatanAktivitas::catat(
            'sesi.keluarkan_admin',
            "Mengeluarkan paksa sesi {$nama} (perangkat " . ($target->perangkat ?? 'tidak diketahui') . ")."
        );

        return $this->pesan("Sesi {$nama} berhasil dikeluarkan. Tabnya akan kembali ke halaman login.");
    }

    /** Keluarkan semua sesi admin/panitia KECUALI sesi sendiri. */
    public function destroySemua(): JsonResponse
    {
        $this->butuhIzin('sesi_admin');

        if (! $this->driverDatabase()) {
            return $this->gagal('Fitur ini butuh SESSION_DRIVER=database.', 422, 'tidak_tersedia');
        }

        $jumlah = LacakSesiAdmin::keluarkanSemua(session()->getId());

        CatatanAktivitas::catat('sesi.keluarkan_admin_semua', "Mengeluarkan paksa {$jumlah} sesi admin/panitia lain.");

        return $this->pesan($jumlah > 0
            ? "{$jumlah} sesi admin/panitia lain dikeluarkan."
            : 'Tidak ada sesi admin lain yang sedang aktif.');
    }

    private function driverDatabase(): bool
    {
        return config('session.driver') === 'database';
    }
}