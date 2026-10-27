<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Kelas extends Model
{
    protected $table = 'kelas';

    protected $fillable = ['nama'];

    /**
     * Rapikan nama kelas: buang spasi tepi dan spasi ganda di tengah.
     *
     * Tanpa ini "XII RPL 1", " XII RPL 1 " dan "XII  RPL 1" dianggap tiga
     * kelas berbeda, padahal maksudnya sama.
     */
    public static function normalisasi(?string $nama): string
    {
        $nama = preg_replace('/\s+/u', ' ', (string) $nama) ?? '';

        return trim($nama);
    }

    /**
     * Cari kelas tanpa membedakan huruf besar/kecil.
     *
     * Kolom `nama` unik, tetapi MySQL (umumnya case-insensitive) dan SQLite
     * (case-sensitive) berperilaku berbeda. Pencarian manual ini membuat
     * pengecekan duplikat konsisten di keduanya.
     */
    public static function cariNama(?string $nama): ?self
    {
        $baku = static::normalisasi($nama);

        if ($baku === '') {
            return null;
        }

        return static::query()
            ->whereRaw('LOWER(nama) = ?', [mb_strtolower($baku)])
            ->first();
    }

    /**
     * Sinkronkan daftar kelas dengan kelas yang dipakai pemilih.
     *
     * Sekaligus merapikan spasi pada data lama, supaya kelas yang dibuat
     * otomatis tidak muncul sebagai duplikat.
     */
    public static function sinkronDariPemilih(): void
    {
        $dariPemilih = Pemilih::query()
            ->whereNotNull('kelas')
            ->where('kelas', '!=', '')
            ->distinct()
            ->pluck('kelas');

        foreach ($dariPemilih as $nama) {
            $baku = static::normalisasi($nama);

            if ($baku === '') {
                continue;
            }

            $ada = static::cariNama($baku);

            if ($ada) {
                // Pakai ejaan yang sudah ada di tabel kelas agar tidak ada
                // dua baris yang hanya beda huruf besar/kecil.
                if ($nama !== $ada->nama) {
                    Pemilih::where('kelas', $nama)->update(['kelas' => $ada->nama]);
                }

                continue;
            }

            if ($nama !== $baku) {
                Pemilih::where('kelas', $nama)->update(['kelas' => $baku]);
            }

            static::create(['nama' => $baku]);
        }
    }
}
