<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Versi JSON dari BatasiIdleUser, khusus route /api/* untuk React.
 *
 * Kenapa tidak pakai BatasiIdleUser langsung? Middleware itu me-`redirect` ke
 * halaman login. Axios akan mengikuti redirect itu dan menganggapnya sukses
 * (200 + HTML), sehingga React tidak pernah tahu sesinya sudah habis.
 * Di sini invece dikembalikan 401 JSON agar frontend bisa langsung
 * mengarahkan pengguna ke layar login.
 *
 * Logikanya sengaja dibuat sama persis dengan BatasiIdleUser (batas + grace
 * yang sama, kunci session yang sama) supaya perilaku server tetap konsisten
 * baik untuk halaman Inertia maupun request API.
 */
class ApiPemilihSesi
{
    public function handle(Request $request, Closure $next): Response
    {
        $batas    = config('voting.idle_timeout') + config('voting.idle_server_grace');
        $terakhir = $request->session()->get(BatasiIdleUser::KUNCI);

        if ($terakhir !== null && (time() - (int) $terakhir) > $batas) {
            Auth::guard('pemilih')->logout();
            Auth::guard('admin')->logout();

            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'pesan' => 'Sesi berakhir karena tidak ada aktivitas. Silakan login kembali.',
                'kode'  => 'sesi_habis',
            ], 401);
        }

        $request->session()->put(BatasiIdleUser::KUNCI, time());

        return $next($request);
    }
}