<?php

namespace App\Support;

use Illuminate\Session\DatabaseSessionHandler;

/**
 * Handler sesi database yang HANYA mengisi kolom sessions.user_id untuk pemilih.
 *
 * Masalah bawaan Laravel: kolom user_id diisi dari "guard bawaan" pada akhir request,
 * padahal middleware auth:admin memindahkan guard bawaan ke "admin" (Auth::shouldUse).
 * Akibatnya sesi ADMIN tersimpan dengan user_id = id admin. Karena admin dan pemilih
 * ada di tabel berbeda dan boleh punya id yang sama (mis. sama-sama 1), halaman
 * Sesi Aktif salah mengira sesi admin itu sebagai pemilih ("login hantu"), dan tombol
 * Keluarkan / Keluarkan Semua ikut menghapus sesi admin sendiri -> error 419.
 *
 * Di sini user_id selalu dibaca dari guard "pemilih", jadi sesi admin bernilai null.
 */
class SessionHandlerPemilih extends DatabaseSessionHandler
{
    protected function userId()
    {
        return $this->container->make('auth')->guard('pemilih')->id();
    }
}
