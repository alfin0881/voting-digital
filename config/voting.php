<?php

/*
|--------------------------------------------------------------------------
| Pengaturan sesi pemilih (komputer lab)
|--------------------------------------------------------------------------
| Semua nilai bisa diubah lewat .env tanpa mengubah kode.
*/

return [

    // Berapa detik tanpa aktivitas sebelum pemilih otomatis di-logout.
    'idle_timeout' => (int) env('VOTING_IDLE_TIMEOUT', 180),

    // Peringatan "sesi akan berakhir" muncul sekian detik sebelum logout.
    'idle_warning' => (int) env('VOTING_IDLE_WARNING', 30),

    // Toleransi tambahan di sisi server (detik). Timer browser yang utama;
    // server hanya cadangan (mis. browser ditutup / JS mati).
    'idle_server_grace' => (int) env('VOTING_IDLE_SERVER_GRACE', 60),

    // Biaya bcrypt untuk hash password pemilih. 10 ≈ 50-100 ms per hash:
    // cukup aman untuk kode kartu sekali pakai, dan acak/impor massal
    // ribuan pemilih tetap selesai dalam hitungan menit.
    'hash_rounds' => (int) env('VOTING_HASH_ROUNDS', 10),

    // Hitung mundur di halaman "Terima Kasih" sebelum otomatis logout (detik).
    'logout_countdown' => (int) env('VOTING_LOGOUT_COUNTDOWN', 8),

    /*
    |--------------------------------------------------------------------------
    | Sesi admin (panel pengelola)
    |--------------------------------------------------------------------------
    | Auto-logout admin setelah sekian detik tidak ada aktivitas, supaya
    | komputer/panel tidak bisa langsung diakses orang lain setelah admin
    | meninggalkannya. Default lebih longgar dari pemilih.
    */

    // Detik tanpa aktivitas sebelum admin otomatis di-logout (default 15 menit).
    'admin_idle_timeout' => (int) env('ADMIN_IDLE_TIMEOUT', 600),

    // Peringatan "sesi akan berakhir" muncul sekian detik sebelumnya.
    'admin_idle_warning' => (int) env('ADMIN_IDLE_WARNING', 60),

    /*
    | Batas mutlak umur sesi admin (detik sejak login).
    |
    | Idle timeout saja BELUM cukup: kalau tab admin dibiarkan terbuka semalaman
    | (heartbeat tiap menit selalu dianggap aktivitas), atau cookie "ingat saya"
    | sempat terpasang, sesi lama masih bisa dipakai keesokan hari. Batas ini
    | memaksa login ulang apa pun yang terjadi, sehingga sesi dari hari
    | sebelumnya tidak pernah bisa membuka panel.
    |
    | Default 8 jam: cukup untuk satu hari acara, tidak pernah lintas hari.
    | Isi 0 untuk mematikan batas ini.
    */
    'admin_session_max' => (int) env('ADMIN_SESSION_MAX', 28800),
];
