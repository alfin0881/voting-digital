<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Pemulihan database dari file backup TERENKRIPSI.
 *
 * Proses ini menimpa data yang sedang dipakai, jadi hanya dipanggil setelah
 * controller memverifikasi Super Admin, password, dan konfirmasi nama file.
 * Service ini sendiri tetap defensif: menolak file non-.sql.enc dan menolak
 * driver yang tidak didukung.
 */
class DatabaseRestore
{
    public function __construct(private DatabaseBackup $backup)
    {
    }

    /**
     * Pulihkan database dari path relatif di disk 'local'.
     *
     * @return int jumlah statement SQL yang dieksekusi
     */
    public function pulihkan(string $path): int
    {
        if (! $this->backup->terenkripsi($path)) {
            throw new \RuntimeException(
                'Hanya backup terenkripsi (.sql.enc) yang dapat dipulihkan. '
                . 'Backup lama .sql harus dipulihkan manual oleh administrator server.'
            );
        }

        $driver = $this->backup->driver();

        if (! in_array($driver, ['mysql', 'mariadb', 'sqlite'], true)) {
            throw new \RuntimeException("Driver database {$driver} tidak didukung untuk restore.");
        }

        $disk = Storage::disk('local');

        if (! $disk->exists($path)) {
            throw new \RuntimeException('File backup tidak ditemukan.');
        }

        $sementara = DatabaseBackup::FOLDER . '/.restore-' . Str::random(20) . '.sql';
        $absolut   = $disk->path($sementara);

        $this->backup->dekripsiKeFile($path, $absolut);

        $pdo = DB::connection()->getPdo();
        $jumlah = 0;

        try {
            $this->foreignKey($pdo, $driver, false);

            foreach ($this->statementDariFile($absolut) as $sql) {
                $pdo->exec($sql);
                $jumlah++;
            }

            $this->foreignKey($pdo, $driver, true);
        } catch (\Throwable $e) {
            // Coba hidupkan kembali pengecekan FK, lalu teruskan galat aslinya.
            try {
                $this->foreignKey($pdo, $driver, true);
            } catch (\Throwable) {
                // diabaikan; galat utama lebih penting
            }

            Log::error('Restore database gagal.', [
                'file'  => $path,
                'driver'=> $driver,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        } finally {
            @unlink($absolut);
        }

        // Cache menyimpan nilai pengaturan & statistik; jangan sampai data
        // lama tetap tampil setelah database diganti.
        Cache::flush();

        Log::info('Restore database selesai.', [
            'file'       => $path,
            'driver'     => $driver,
            'statement'  => $jumlah,
        ]);

        return $jumlah;
    }

    private function foreignKey(\PDO $pdo, string $driver, bool $aktif): void
    {
        if ($driver === 'sqlite') {
            $pdo->exec('PRAGMA foreign_keys=' . ($aktif ? 'ON' : 'OFF'));
            return;
        }

        $pdo->exec('SET FOREIGN_KEY_CHECKS=' . ($aktif ? '1' : '0'));
    }

    /**
     * Baca file SQL sebagai generator statement.
     *
     * Tidak memakai explode(';') karena isi kolom bisa mengandung titik koma
     * dan baris baru. Pemindai ini menghormati tanda kutip, escape backslash,
     * serta komentar baris/block.
     *
     * @return \Generator<int, string>
     */
    private function statementDariFile(string $path): \Generator
    {
        $fh = fopen($path, 'rb');

        if (! $fh) {
            throw new \RuntimeException('File sementara hasil dekripsi tidak bisa dibaca.');
        }

        $sql          = '';
        $quote        = null;   // ' | " | `
        $escape       = false;
        $komentarBaris = false;
        $komentarBlok  = false;
        $berikutnya   = null;

        try {
            while (true) {
                $c = $berikutnya ?? fgetc($fh);
                $berikutnya = null;

                if ($c === false) {
                    break;
                }

                if ($komentarBaris) {
                    if ($c === "\n") {
                        $komentarBaris = false;
                        $sql .= "\n";
                    }
                    continue;
                }

                if ($komentarBlok) {
                    if ($c === '*') {
                        $n = fgetc($fh);

                        if ($n === '/') {
                            $komentarBlok = false;
                            continue;
                        }

                        // Bukan penutup komentar; buang karakter '*' dan proses
                        // karakter berikutnya seperti biasa.
                        $berikutnya = $n === false ? null : $n;
                    }
                    continue;
                }

                if ($quote !== null) {
                    $sql .= $c;

                    if ($escape) {
                        $escape = false;
                        continue;
                    }

                    if ($c === '\\') {
                        $escape = true;
                        continue;
                    }

                    if ($c === $quote) {
                        $n = fgetc($fh);

                        if ($n === $quote) {
                            // Kutip ganda di dalam string ('' atau "") = escape.
                            $sql .= $n;
                            continue;
                        }

                        $quote = null;
                        $berikutnya = $n === false ? null : $n;
                    }

                    continue;
                }

                // Di luar string & komentar.
                if ($c === "'" || $c === '"' || $c === '`') {
                    $quote = $c;
                    $sql .= $c;
                    continue;
                }

                if ($c === '-' || $c === '/') {
                    $n = fgetc($fh);

                    if ($c === '-' && $n === '-') {
                        $komentarBaris = true;
                        continue;
                    }

                    if ($c === '/' && $n === '*') {
                        $komentarBlok = true;
                        continue;
                    }

                    $sql .= $c;
                    $berikutnya = $n === false ? null : $n;
                    continue;
                }

                if ($c === ';') {
                    $stmt = trim($sql);
                    $sql = '';

                    if ($stmt !== '') {
                        yield $stmt;
                    }

                    continue;
                }

                $sql .= $c;
            }

            $stmt = trim($sql);

            if ($stmt !== '') {
                yield $stmt;
            }
        } finally {
            fclose($fh);
        }
    }
}
