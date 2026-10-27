<?php

namespace App\Support;

/**
 * Pembuat password acak untuk pemilih.
 * Huruf/angka yang mudah tertukar (0/O, 1/I/L) sengaja dibuang supaya
 * mudah dibaca dari kartu dan diketik di komputer lab.
 */
class KodePemilih
{
    private const HURUF = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public static function buat(int $panjang = 6): string
    {
        $kode = '';
        $maks = strlen(self::HURUF) - 1;

        for ($i = 0; $i < $panjang; $i++) {
            $kode .= self::HURUF[random_int(0, $maks)];
        }

        return $kode;
    }
}
