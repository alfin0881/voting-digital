<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Pemakaian di route:  ->middleware('izin:pemilihan')
 * Menolak (403) admin yang perannya tidak punya akses ke fitur tersebut.
 */
class IzinAdmin
{
    public function handle(Request $request, Closure $next, string $fitur): Response
    {
        if (! $request->user('admin')?->bolehAkses($fitur)) {
            abort(403, 'Peran Anda tidak memiliki akses ke halaman ini.');
        }

        return $next($request);
    }
}
