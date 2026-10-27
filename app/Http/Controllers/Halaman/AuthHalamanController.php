<?php

namespace App\Http\Controllers\Halaman;

use App\Http\Controllers\Api\AuthController as AuthApi;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response as Halaman;

/**
 * Halaman login (Inertia).
 *
 * Aturan login TIDAK ditulis ulang: request diteruskan ke
 * Api\AuthController supaya batas percobaan, kunci sementara, dan
 * auto-upgrade password plain -> hash tetap sama persis dengan endpoint JSON.
 */
class AuthHalamanController extends Controller
{
    public function login(): Halaman|RedirectResponse
    {
        if (Auth::guard('admin')->check()) {
            return redirect('/admin');
        }

        if (Auth::guard('pemilih')->check()) {
            return redirect('/user/pemilihan');
        }

        return Inertia::render('Login');
    }

    public function masuk(Request $request): RedirectResponse
    {
        /** @var JsonResponse $hasil */
        $hasil = app(AuthApi::class)->login($request);
        $data  = (array) $hasil->getData(true);

        if ($hasil->getStatusCode() === 200) {
            $tujuan = ($data['role'] ?? null) === 'admin'
                ? '/admin'
                : '/user/pemilihan';

            return redirect()->intended($tujuan);
        }

        // Salah password / terkunci sementara: tampilkan sebagai galat form.
        return redirect('/login')
            ->withErrors(['nis' => $data['pesan'] ?? 'Login gagal. Silakan coba lagi.'])
            ->withInput($request->only('nis'));
    }
}
