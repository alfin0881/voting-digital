<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\BatasiIdleAdmin;
use App\Http\Middleware\BatasiIdleUser;
use App\Http\Middleware\IzinAdmin;
use App\Http\Middleware\TanpaCache;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Props global Inertia (auth, config, flash) untuk semua rute web.
        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
        ]);

        $middleware->alias([
            'nocache' => TanpaCache::class,
            'izin' => IzinAdmin::class,
            'izin.halaman' => \App\Http\Middleware\IzinHalaman::class,
            'idle.user' => BatasiIdleUser::class,
            'idle.admin' => BatasiIdleAdmin::class,
        ]);

        // Pengguna yang sudah login dan membuka /login diarahkan ke halamannya masing-masing.
        // URL ditulis langsung (bukan route()) karena halaman-halaman ini kini
        // dilayani React Router, bukan route Laravel.
        $middleware->redirectUsersTo(fn () => Auth::guard('admin')->check()
            ? '/admin'
            : '/user/pemilihan');

        // Tamu yang membuka halaman berhak akses -> layar login React.
        // Default Laravel memakai route('login'), yang sudah tidak ada.
        $middleware->redirectGuestsTo(fn () => '/login');
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Error 419 (sesi/token CSRF kedaluwarsa) -> arahkan ke login dengan pesan
        // ramah, bukan halaman "Page Expired". Untuk logout, anggap saja sudah keluar.
        // (Laravel mengubah TokenMismatchException menjadi HttpException 419.)
        $exceptions->render(function (HttpException $e, Request $request) {
            if ($e->getStatusCode() !== 419) {
                return null; // biarkan penanganan bawaan
            }

            // Untuk logout, anggap saja sudah keluar.
            if ($request->routeIs('logout')) {
                return redirect('/login');
            }

            return redirect('/login')
                ->with('error', 'Sesi Anda telah berakhir. Silakan login kembali.');
        });
    })->create();