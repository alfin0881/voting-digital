<?php

/*
| Pengaturan laporan hasil pemilihan (export PDF & Excel).
|
| CATATAN: nilai di sini hanya BAWAAN. Begitu admin mengisi nama sekolah di
| halaman Admin > Pengaturan (tabel `pengaturan`), nilai yang tersimpan di
| sana yang dipakai — jadi satu instalasi bisa dipakai banyak sekolah tanpa
| mengubah file ini. Isi generik di bawah supaya paket bawaan tidak terlihat
| milik satu sekolah tertentu.
*/
return [
    // Nama sekolah pada kop laporan PDF & Excel.
    'sekolah' => 'Nama Sekolah',
];
