<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Batas sesi admin sisi server (cadangan + lapis kedua).
 *
 * Ada DUA pemeriksaan, keduanya wajib:
 *
 *  1. IDLE — sudah lama tidak ada aktivitas. Ditutup juga oleh timer browser.
 *  2. UMUR MUTLAK — sesi sudah melewati N detik sejak login, tetap dipaksa
 *    login ulang walau admin terus aktif memakai panel.
 *
 * Pemeriksaan (2) penting karena idle saja tidak menutup semua celah:
 * - cookie "ingat saya" (remember) yang pernah aktif akan login otomatis
 *   kembali di hari berikutnya dengan sesi BARU yang belum punya aktivitas;
 * - tab yang dibiarkan terbuka semalaman terus mengirim heartbeat, sehingga
 *   idle tidak pernah terpicu padahal tidak ada orang di depan komputer.
 *
 * Semua pemanggil (ApiAdminSesi, /api/me, BatasiIdleAdmin) memakai
 * {@see self::kedaluwarsa()} supaya aturannya tidak berbeda antar lapisan.
 */
class BatasiIdleAdmin
{
    /** Kunci waktu aktivitas terakhir (di-refresh setiap request sah). */
    public const KUNCI = 'aktivitas_admin_terakhir';

    /** Kunci waktu login, tidak pernah di-refresh. Dasar batas umur mutlak. */
    public const MASUK = 'waktu_masuk_admin';

    /**
     * Alasan sesi admin sudah tidak sah lagi, atau null bila masih sah.
     *
     * Mengembalikan string alasan (bukan bool) supaya pemanggil bisa
     * menampilkan pesan yang tepat ke pengguna.
     */
    public static function kedaluwarsa(Request $request): ?string
    {
        $terakhir = $request->session()->get(self::KUNCI);

        // Belum pernah ada aktivitas tercatat = sesi baru/belum Initialize,
        // biarkan lewat supaya pengecekan tidak memaksa keluar tanpa alasan.
        if ($terakhir !== null) {
            $batas = (int) config('voting.admin_idle_timeout') + (int) config('voting.idle_server_grace');

            if ((time() - (int) $terakhir) > $batas) {
                return 'idle';
            }
        }

        $masuk = $request->session()->get(self::MASUK);

        if ($masuk !== null) {
            $maks = (int) config('voting.admin_session_max');

            if ($maks > 0 && (time() - (int) $masuk) > $maks) {
                return 'umur';
            }
        }

        return null;
    }

    /** Pesan yang ditampilkan sesuai alasan kedaluwarsa. */
    public static function pesan(?string $alasan): string
    {
        return $alasan === 'umur'
            ? 'Sesi admin sudah berakhir (umur sesi maksimum tercapai). Silakan login kembali.'
            : 'Sesi admin berakhir karena tidak ada aktivitas. Silakan login kembali.';
    }

    /**
     * Catat aktivitas, dan saat pertama kali pastikan waktu login ada.
     *
     * Pemanggil WAJIB memanggil ini SETELAH {@see self::kedaluwarsa()} supaya
     * request yang sudah terlambat tidak ikut me-refresh penanda waktu.
     */
    public static function catat(Request $request): void
    {
        $request->session()->put(self::KUNCI, time());

        if ($request->session()->get(self::MASUK) === null) {
            $request->session()->put(self::MASUK, time());
        }
    }

    /**
     * Bersihkan seluruh penanda sesi admin.
     *
     * Dipanggil saat login baru supaya waktu login lama tidak terbawa, dan
     * saat logout supaya tidak ada sisa yang bisa dipakai.
     */
    public static function bersihkan(Request $request): void
    {
        $request->session()->forget(self::KUNCI);
        $request->session()->forget(self::MASUK);
    }

    public function handle(Request $request, Closure $next): Response
    {
        $alasan = self::kedaluwarsa($request);

        if ($alasan !== null) {
            Auth::guard('admin')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect('/login')->with('error', self::pesan($alasan));
        }

        self::catat($request);

        return $next($request);
    }
}