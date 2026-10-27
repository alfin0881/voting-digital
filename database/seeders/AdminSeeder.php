<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    /**
     * Admin disimpan di tabel `admins` (terpisah dari pemilih).
     * Login admin memakai EMAIL, password di-hash.
     * GANTI password bawaan ini sebelum aplikasi dipakai sungguhan.
     */
    public function run(): void
    {
        DB::table('admins')->updateOrInsert(
            ['email' => 'admin@sekolah.sch.id'],
            [
                'nama'       => 'Admin',
                'password'   => Hash::make('admin123'),
                'peran'      => 'super_admin',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }
}
