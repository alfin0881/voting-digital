<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mencegah browser menyimpan cache halaman yang butuh login.
 * Tanpa ini, tombol "Back" setelah logout menampilkan halaman lama dengan
 * token CSRF basi — klik apa pun di situ menghasilkan error 419.
 */
class TanpaCache
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Expires', '0');

        return $response;
    }
}
