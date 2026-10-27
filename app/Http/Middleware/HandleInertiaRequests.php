<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

/**
 * Props global Inertia.
 *
 * `auth` dan `config` dikirim SEKALI bersama halaman pertama, sehingga React
 * tidak perlu lagi memanggil /api/me dan /api/config sebelum bisa menampilkan
 * apa pun. Inilah bagian yang menghilangkan layar "memuat" panjang saat boot.
 */
class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    public function share(Request $request): array
    {
        return [
            ...parent::share($request),

            // Sesi login + izin. Selalu segar di setiap kunjungan.
            'auth' => fn () => \App\Support\SesiPengguna::auth($request),

            // Nama sekolah, durasi idle, status jeda & pengumuman.
            'config' => fn () => \App\Support\SesiPengguna::config(),

            // Pesan sekali-tampil dari redirect()->with(...).
            'flash' => fn () => [
                'pesan' => session('pesan') ?? session('status'),
                'tipe'  => session('tipe', 'sukses'),
                'error' => session('error'),
            ],
        ];
    }
}
