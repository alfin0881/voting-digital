<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Penjaga izin untuk HALAMAN Inertia.
 *
 * Berbeda dari IzinAdmin (yang membalas 403), middleware ini mengarahkan
 * kembali ke dashboard dengan pesan. Tujuannya supaya admin yang mengetik URL
 * halaman terlarang tidak melihat halaman error, melainkan kembali ke panel
 * dengan penjelasan — perilaku yang sama dengan versi React sebelumnya.
 */
class IzinHalaman
{
    public function handle(Request $request, Closure $next, string $fitur): Response
    {
        $admin = $request->user('admin');

        if (! $admin || ! $admin->bolehAkses($fitur)) {
            // Dashboard tersedia untuk semua peran, jadi tidak ada risiko loop.
            return redirect('/admin')
                ->with('error', 'Peran Anda tidak memiliki akses ke halaman itu.');
        }

        return $next($request);
    }
}
