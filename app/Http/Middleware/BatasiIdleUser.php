<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cadangan sisi server untuk auto-logout karena idle (khusus pemilih).
 *
 * Timer utama ada di browser (components/sesi-pemilih). Middleware ini
 * menutup celah bila browser ditutup / JavaScript mati: begitu ada request
 * lagi setelah lewat batas idle, sesi langsung dihapus.
 */
class BatasiIdleUser
{
    public const KUNCI = 'aktivitas_terakhir';

    public function handle(Request $request, Closure $next): Response
    {
        $batas = config('voting.idle_timeout') + config('voting.idle_server_grace');
        $terakhir = $request->session()->get(self::KUNCI);

        if ($terakhir !== null && (time() - (int) $terakhir) > $batas) {
            Auth::guard('pemilih')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect('/login')
                ->with('error', 'Sesi berakhir karena tidak ada aktivitas. Silakan login kembali.');
        }

        $request->session()->put(self::KUNCI, time());

        return $next($request);
    }
}
