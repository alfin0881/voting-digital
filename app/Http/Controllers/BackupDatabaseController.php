<?php

namespace App\Http\Controllers;

use App\Models\CatatanAktivitas;
use App\Services\DatabaseBackup;
use Illuminate\Http\Request;

/**
 * Unduh salinan (dump) database sebagai file .sql.enc TERENKRIPSI.
 * Akses dibatasi middleware 'izin:backup' (Super Admin & Panitia).
 * Dump dibuat murni dengan PHP (DatabaseBackup) dan di-stream agar hemat memori.
 *
 * Sejak hardening keamanan, file yang diunduh selalu terenkripsi dengan
 * APP_KEY. Tanpa kunci tersebut isi database (termasuk hash password) tidak
 * bisa dibaca.
 */
class BackupDatabaseController extends Controller
{
    public function unduh(Request $request, DatabaseBackup $backup)
    {
        $nama = 'backup-voting-' . now()->format('Ymd-His') . '.sql.enc';

        CatatanAktivitas::catat(
            'backup.unduh',
            "Mengunduh backup terenkripsi database \"{$backup->namaDatabase()}\" ({$this->ukuranManusiawi($backup->ukuranByte())})."
        );

        return response()->streamDownload(function () use ($backup) {
            foreach ($backup->potonganTerenkripsi() as $bagian) {
                echo $bagian;
                if (ob_get_level() > 0) {
                    flush();
                }
            }
        }, $nama, [
            'Content-Type'        => 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="' . $nama . '"',
            'Cache-Control'       => 'no-store, no-cache',
        ]);
    }

    private function ukuranManusiawi(int $byte): string
    {
        $satuan = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = 0;
        $nilai = (float) $byte;

        while ($nilai >= 1024 && $i < count($satuan) - 1) {
            $nilai /= 1024;
            $i++;
        }

        return round($nilai, $i === 0 ? 0 : 1) . ' ' . $satuan[$i];
    }
}
