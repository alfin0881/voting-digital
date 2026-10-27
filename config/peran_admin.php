<?php

/*
|--------------------------------------------------------------------------
| Peran Admin & Hak Akses
|--------------------------------------------------------------------------
| Akun admin ada di tabel `admins` (terpisah dari pemilih); peran disimpan di kolom
| `peran`. Untuk mengubah pembagian tugas, cukup edit daftar 'izin'.
|
| Kunci fitur yang tersedia:
|   dashboard, hasil, export, pemilihan, kandidat, anggota, admin,
|   sesi (sesi PEMILIH aktif & logout paksa), pantau (monitor partisipasi),
|   kendali (pengumuman & jeda darurat hari-H),
|   backup (unduh salinan database), audit (catatan aktivitas),
|   pengaturan (identitas sekolah & nama aplikasi) — hanya Super Admin & Panitia,
|   sesi_admin (daftar admin/panitia yang sedang login + memutus sesinya)
|     -- KHUSUS Super Admin, tidak diberikan ke peran lain.
| Tanda '*' = semua fitur.
*/

return [

    // Peran untuk admin lama yang kolom peran-nya masih kosong (null).
    'bawaan' => 'super_admin',

    'peran' => [

        'super_admin' => [
            'label'      => 'Super Admin',
            'keterangan' => 'Akses penuh, termasuk mengelola akun admin lain.',
            // '*' sudah mencakup sesi_admin; ditulis eksplisit agar mudah dibaca.
            'izin'       => ['*', 'sesi_admin'],
        ],

        'panitia' => [
            'label'      => 'Panitia',
            'keterangan' => 'Mengelola pemilihan, kandidat, dan data pemilih; melihat dan mengekspor hasil; kendali hari-H; mengganti nama sekolah.',
            // 'kode_kartu' = boleh mencetak kartu & melihat/mengacak kode kartu pemilih
            // (setiap pembukaan tercatat di audit log). Hapus dari daftar ini bila
            // panitia tertentu tidak boleh memegang kode.
            'izin'       => ['dashboard', 'hasil', 'export', 'pemilihan', 'kandidat', 'anggota', 'kode_kartu', 'sesi', 'pantau', 'kendali', 'backup', 'audit', 'pengaturan'],
        ],

        'pengawas' => [
            'label'      => 'Pengawas',
            'keterangan' => 'Hanya melihat dashboard dan hasil pemilihan (tanpa export dan tanpa mengubah data).',
            'izin'       => ['dashboard', 'hasil', 'pantau'],
        ],

    ],
];
