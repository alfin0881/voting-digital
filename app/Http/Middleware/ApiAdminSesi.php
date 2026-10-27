<?php

namespace App\Http\Middleware;

use App\Support\LacakSesiAdmin;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Versi JSON dari BatasiIdleAdmin, khusus route /api/admin/* untuk React.
 *
 * Mirip ApiPemilihSesi: middleware aslinya me-`redirect` ke halaman
 * login, sehingga axios menganggapnya sukses dan React tidak pernah tahu
 * sesinya habis. Di sini dikembalikan 401 JSON supaya frontend bisa langsung
 * mengarahkan admin ke layar login.
 */
class ApiAdminSesi
{
    public function handle(Request $request, Closure $next): Response
    {
        // Cek idle + umur mutlak sekaligus (lihat BatasiIdleAdmin).
        $alasan = BatasiIdleAdmin::kedaluwarsa($request);

        if ($alasan !== null) {
            Auth::guard('admin')->logout();
            Auth::guard('pemilih')->logout();

            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'pesan' => BatasiIdleAdmin::pesan($alasan),
                'kode'  => 'sesi_habis',
            ], 401);
        }

        BatasiIdleAdmin::catat($request);

        // Rekam sesi ini supaya Super Admin bisa melihat & mengeluarkannya
        // dari halaman Sesi Aktif.
        if ($admin = Auth::guard('admin')->user()) {
            LacakSesiAdmin::catat($admin, $request);
        }

        return $next($request);
    }
}