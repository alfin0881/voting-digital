<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use App\Support\LacakSesiAdmin;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Keamanan akun untuk SEMUA admin (Super Admin, Panitia, Pengawas).
 *
 * Sebelumnya hanya Super Admin yang bisa mengganti password, dan itu pun
 * lewat halaman Kelola Admin. Panitia/Pengawas tidak punya cara mengganti
 * password sendiri. Halaman ini melengkapi itu:
 * - ganti password dengan verifikasi password lama,
 * - melihat perangkat yang sedang login sebagai akun ini,
 * - keluar dari semua sesi (selain perangkat ini atau seluruhnya).
 *
 * Tidak memakai izin fitur: setiap admin berhak mengamankan akunnya sendiri.
 */
class AdminKeamananController extends Controller
{
    use AdminApi;

    /** Panjang minimal password admin. */
    private const MIN_PASSWORD = 8;

    public function index(Request $request): JsonResponse
    {
        $admin = $this->ambil();
        $sesiSekarang = $request->session()->getId();

        $terakhir = CatatanAktivitas::where('admin_id', $admin->id)
            ->where('aksi', 'akun.password')
            ->latest('id')
            ->first();

        $sesi = LacakSesiAdmin::daftarUntukAdmin($admin->id)
            ->map(fn ($s) => [
                'sesi_id'      => $s->session_id,
                'ip_address'   => $s->ip_address,
                'perangkat'    => $s->perangkat,
                'sejak'        => $s->masuk_at?->timezone('Asia/Jakarta')->toIso8601String(),
                'terakhir'     => $s->last_activity?->timezone('Asia/Jakarta')->toIso8601String(),
                'sekarang'     => $s->session_id === $sesiSekarang,
            ])
            ->values();

        return response()->json([
            'admin' => [
                'id'          => $admin->id,
                'nama'        => $admin->nama,
                'email'       => $admin->email,
                'peran'       => $admin->peranAdmin(),
                'peran_label' => $admin->labelPeranAdmin(),
            ],
            'min_password'       => self::MIN_PASSWORD,
            'terakhir_ganti'     => $terakhir?->created_at?->timezone('Asia/Jakarta')->toIso8601String(),
            'sesi'               => $sesi,
            'jumlah_sesi_lain'   => $sesi->where('sekarang', false)->count(),
            'pelacakan_sesi'     => LacakSesiAdmin::siap(),
            'alasan_sesi'        => LacakSesiAdmin::siap()
                ? null
                : 'Pelacakan sesi butuh SESSION_DRIVER=database. Ganti password tetap dapat dilakukan.',
        ]);
    }

    /**
     * Ganti password sendiri. Password lama WAJIB benar, sehingga sesi yang
     * ditinggal terbuka di komputer lain tidak bisa dipakai orang lain untuk
     * mengunci pemilik akun.
     */
    public function gantiPassword(Request $request): JsonResponse
    {
        $admin = $this->ambil();

        $data = $request->validate([
            'password_lama' => ['required', 'string'],
            'password'      => [
                'required',
                'string',
                'min:' . self::MIN_PASSWORD,
                'max:100',
                'confirmed',
                'different:password_lama',
            ],
        ], [
            'password_lama.required' => 'Password lama wajib diisi.',
            'password.required'      => 'Password baru wajib diisi.',
            'password.min'           => 'Password baru minimal ' . self::MIN_PASSWORD . ' karakter.',
            'password.max'           => 'Password baru maksimal 100 karakter.',
            'password.confirmed'     => 'Konfirmasi password baru tidak cocok.',
            'password.different'     => 'Password baru tidak boleh sama dengan password lama.',
        ]);

        if (! Hash::check((string) $data['password_lama'], (string) $admin->password)) {
            throw ValidationException::withMessages([
                'password_lama' => 'Password lama salah.',
            ]);
        }

        $admin->forceFill([
            'password'       => Hash::make((string) $data['password']),
            // Cookie "ingat saya" lama tidak boleh menghidupkan sesi yang sudah
            // dianggap tidak aman setelah password diganti.
            'remember_token' => null,
        ])->save();

        CatatanAktivitas::catat('akun.password', 'Mengganti password akun sendiri.');

        return $this->pesan('Password berhasil diganti. Gunakan password baru pada login berikutnya.');
    }

    /**
     * Keluar dari semua sesi akun ini.
     *
     * `semua = false` (bawaan): perangkat lain dikeluarkan, sesi sekarang tetap
     * dipakai. `semua = true`: seluruh sesi termasuk perangkat ini diakhiri,
     * lalu frontend diarahkan ke halaman login.
     */
    public function logoutSemua(Request $request): JsonResponse
    {
        $admin = $this->ambil();

        $data = $request->validate([
            'password' => ['required', 'string'],
            'semua'    => ['nullable', 'boolean'],
        ], [
            'password.required' => 'Password wajib diisi untuk mengakhiri sesi.',
        ]);

        if (! Hash::check((string) $data['password'], (string) $admin->password)) {
            throw ValidationException::withMessages([
                'password' => 'Password salah.',
            ]);
        }

        if (! LacakSesiAdmin::siap()) {
            return $this->gagal(
                'Fitur ini butuh SESSION_DRIVER=database di file .env.',
                422,
                'tidak_tersedia'
            );
        }

        $sesiSekarang = $request->session()->getId();
        $semua = (bool) ($data['semua'] ?? false);

        $jumlah = LacakSesiAdmin::keluarkanSemuaUntukAdmin(
            $admin->id,
            $semua ? null : $sesiSekarang
        );

        CatatanAktivitas::catat(
            'akun.logout_semua',
            $semua
                ? 'Mengakhiri SEMUA sesi akun sendiri, termasuk perangkat ini.'
                : "Mengakhiri {$jumlah} sesi akun sendiri di perangkat lain."
        );

        if ($semua) {
            // Hapus sesi sekarang dari database lalu bersihkan cookie/CSRF.
            Auth::guard('admin')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'berhasil' => true,
                'pesan'    => 'Semua sesi diakhiri. Silakan login kembali.',
                'redirect' => '/login',
            ]);
        }

        return $this->pesan($jumlah > 0
            ? "{$jumlah} sesi di perangkat lain berhasil diakhiri."
            : 'Tidak ada sesi lain yang sedang aktif.');
    }
}
