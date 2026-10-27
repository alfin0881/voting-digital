<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Session;
use App\Support\SessionHandlerPemilih;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Schema::defaultStringLength(191);

        // Driver "database" versi aplikasi ini: kolom sessions.user_id hanya diisi id PEMILIH
        // (sesi admin = null). Lihat penjelasan di SessionHandlerPemilih.
        // Closure ini cukup mengembalikan HANDLER; SessionManager yang membungkusnya jadi Store
        // (termasuk versi terenkripsi bila SESSION_ENCRYPT=true).
        Session::extend('database', function ($app) {
            $config = $app['config'];

            return new SessionHandlerPemilih(
                $app['db']->connection($config->get('session.connection')),
                $config->get('session.table'),
                $config->get('session.lifetime'),
                $app
            );
        });

        // Batas idle sisi server untuk layar pemilih ditangani oleh
        // App\Http\Middleware\ApiPemilihSesi (balas 401 JSON) pada route
        // /api/pemilih/*, supaya React tahu sesi sudah habis.
    }
}