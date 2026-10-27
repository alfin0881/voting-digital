<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Pembuat dump database murni PHP (tanpa binary `mysqldump`), agar bisa
 * dijalankan di hosting mana pun. Mendukung MySQL/MariaDB dan SQLite
 * (SQLite dipakai oleh test).
 *
 * Hasilnya berupa potongan SQL yang di-stream, sehingga memori tetap hemat
 * walau data besar.
 *
 * SEJAK PERBAIKAN KEAMANAN: semua backup yang disimpan/diunduh dari aplikasi
 * dienkripsi dengan kunci APP_KEY (format chunk AES via Encrypter Laravel).
 * Dump mentah tidak pernah ditulis ke disk. File lama berakhiran .sql tetap
 * dikenali di daftar, tetapi hanya bisa diunduh/dihapus — bukan dipulihkan.
 */
class DatabaseBackup
{
    /** Penanda format file backup terenkripsi. */
    public const MAGIC = 'KASYA-BACKUP-V1';

    /** Akhiran file backup terenkripsi. */
    public const EKSTENSI = '.sql.enc';

    /**
     * Ukuran potongan plaintext sebelum dienkripsi.
     *
     * Tiap potongan dienkripsi + diberi MAC sendiri, jadi file bisa didekripsi
     * sambil di-stream tanpa menahan seluruh dump di memori.
     */
    public const UKURAN_POTONGAN = 262144;

    public function __construct(protected ?string $connection = null)
    {
    }

    protected function db()
    {
        return DB::connection($this->connection);
    }

    public function driver(): string
    {
        return $this->db()->getDriverName();
    }

    /** Nama database/target untuk ditampilkan (mis. "budget" atau path sqlite). */
    public function namaDatabase(): string
    {
        $driver = $this->driver();
        $config = $this->db()->getConfig();

        return match ($driver) {
            'sqlite' => basename((string) ($config['database'] ?? 'database')),
            default  => (string) ($config['database'] ?? 'database'),
        };
    }

    /**
     * Daftar nama tabel (urut abjad) — HANYA milik database koneksi ini.
     *
     * Sengaja tidak memakai Schema::getTables(): pada MySQL dengan user yang
     * punya akses ke beberapa database, method itu bisa mengembalikan tabel
     * dari schema lain (mis. database project tetangga).
     */
    public function tabel(): array
    {
        $driver = $this->driver();

        if ($driver === 'sqlite') {
            return collect($this->db()->select(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ))->pluck('name')->filter()->values()->all();
        }

        // MySQL / MariaDB: batasi ke table_schema = database koneksi.
        return collect($this->db()->select(
            'SELECT table_name AS name FROM information_schema.tables
             WHERE table_schema = ? AND table_type = ? ORDER BY table_name',
            [$this->db()->getDatabaseName(), 'BASE TABLE']
        ))->pluck('name')->filter()->values()->all();
    }

    /** Perkiraan ukuran seluruh database dalam byte. */
    public function ukuranByte(): int
    {
        if ($this->driver() === 'sqlite') {
            $config = $this->db()->getConfig();
            $file   = $config['database'] ?? null;

            return ($file && is_file($file)) ? (int) filesize($file) : 0;
        }

        // MySQL/MariaDB: jumlahkan data_length + index_length dari information_schema.
        try {
            $row = $this->db()->selectOne(
                'SELECT SUM(data_length + index_length) AS bytes
                 FROM information_schema.tables WHERE table_schema = DATABASE()'
            );

            return (int) ($row->bytes ?? 0);
        } catch (\Throwable) {
            return 0;
        }
    }

    /**
     * Tabel yang dilewati pada backup terjadwal (bukan data inti & bisa besar).
     */
    public const ABAIKAN_TERJADWAL = ['cache', 'cache_locks', 'sessions', 'jobs', 'job_batches', 'failed_jobs'];

    /**
     * Hasilkan seluruh isi dump sebagai potongan-potongan SQL.
     * Dipakai untuk streamDownload() agar tidak menumpuk di memori.
     *
     * @param  array<int, string>  $kecuali  nama tabel yang dilewati
     */
    public function potongan(array $kecuali = []): \Generator
    {
        yield $this->header() . "\n";

        foreach ($this->tabel() as $nama) {
            if (in_array($nama, $kecuali, true)) {
                continue;
            }

            yield $this->ddl($nama) . "\n\n";
            yield from $this->isi($nama);
            yield "\n";
        }

        yield $this->footer();
    }

    /** Versi string (untuk mengukur/uji). Perhatikan memori pada DB besar. */
    public function konten(array $kecuali = []): string
    {
        $out = '';
        foreach ($this->potongan($kecuali) as $bagian) {
            $out .= $bagian;
        }

        return $out;
    }

    // =========================================================================
    // BACKUP TERJADWAL (simpan ke disk local + retensi)
    // =========================================================================

    /** Folder penyimpanan backup di disk 'local'. */
    public const FOLDER = 'backups';

    /**
     * Tulis dump TERENKRIPSI ke disk 'local'. Kembalikan jumlah byte yang ditulis.
     *
     * Nama file otomatis diberi akhiran .sql.enc bila belum ada.
     */
    public function simpan(string $path, array $kecuali = self::ABAIKAN_TERJADWAL): int
    {
        if (! str_ends_with($path, self::EKSTENSI)) {
            $path .= self::EKSTENSI;
        }

        $disk = Storage::disk('local');
        $disk->makeDirectory(dirname($path));
        $absolut = $disk->path($path);

        $fh = fopen($absolut, 'wb');
        if (! $fh) {
            throw new \RuntimeException("Tidak bisa menulis file backup: {$absolut}");
        }

        $byte = 0;
        foreach ($this->potonganTerenkripsi($kecuali) as $bagian) {
            $byte += fwrite($fh, $bagian);
        }
        fclose($fh);

        return $byte;
    }

    /** Daftar file backup (path relatif), terbaru dulu. Mendukung .sql.enc lama. */
    public function daftarBackup(): array
    {
        $disk = Storage::disk('local');

        if (! $disk->exists(self::FOLDER)) {
            return [];
        }

        $files = collect($disk->files(self::FOLDER))
            ->filter(fn ($f) => str_ends_with($f, self::EKSTENSI) || str_ends_with($f, '.sql'))
            ->sortByDesc(fn ($f) => $disk->lastModified($f))
            ->values()
            ->all();

        return $files;
    }

    /** Apakah file backup memakai format terenkripsi yang bisa dipulihkan? */
    public function terenkripsi(string $path): bool
    {
        return str_ends_with($path, self::EKSTENSI);
    }

    /**
     * Hasilkan dump TERENKRIPSI sebagai potongan biner.
     *
     * Format:
     *   baris pertama  : MAGIC + "\n"
     *   berulang       : [4 byte panjang big-endian][payload Encrypter]
     *
     * Dipakai untuk unduhan langsung tanpa menyimpan file sementara.
     */
    public function potonganTerenkripsi(array $kecuali = []): \Generator
    {
        yield self::MAGIC . "\n";

        $buffer = '';

        foreach ($this->potongan($kecuali) as $bagian) {
            $buffer .= $bagian;

            while (strlen($buffer) >= self::UKURAN_POTONGAN) {
                $potong  = substr($buffer, 0, self::UKURAN_POTONGAN);
                $buffer  = substr($buffer, self::UKURAN_POTONGAN);

                yield $this->bingkai($potong);
            }
        }

        if ($buffer !== '') {
            yield $this->bingkai($buffer);
        }
    }

    /**
     * Dekripsi file backup ke path tujuan (plaintext sementara).
     *
     * Dipakai oleh proses restore; file sementara WAJIB dihapus pemanggil
     * setelah selesai. Melempar RuntimeException bila format/kunci tidak cocok.
     */
    public function dekripsiKeFile(string $path, string $tujuan): void
    {
        $masukan = Storage::disk('local')->readStream($path);

        if (! is_resource($masukan)) {
            throw new \RuntimeException('File backup tidak bisa dibaca.');
        }

        $keluaran = fopen($tujuan, 'wb');
        if (! $keluaran) {
            fclose($masukan);
            throw new \RuntimeException("Tidak bisa menulis file sementara: {$tujuan}");
        }

        try {
            $magic = fgets($masukan);

            if ($magic === false || trim($magic) !== self::MAGIC) {
                throw new \RuntimeException('Format backup tidak dikenali atau bukan backup terenkripsi.');
            }

            while (! feof($masukan)) {
                $kepala = fread($masukan, 4);

                if ($kepala === false || $kepala === '') {
                    break;
                }

                if (strlen($kepala) !== 4) {
                    throw new \RuntimeException('File backup rusak (header potongan tidak lengkap).');
                }

                $panjang = unpack('N', $kepala)[1];

                // Batas atas menjaga file rusak/berbahaya tidak memakan memori
                // berlebihan. Payload terenkripsi selalu lebih besar dari
                // plaintext, jadi beri kelonggaran 2x + 1 KB.
                $maks = self::UKURAN_POTONGAN * 2 + 4096;

                if ($panjang < 1 || $panjang > $maks) {
                    throw new \RuntimeException('File backup rusak (ukuran potongan tidak wajar).');
                }

                $isi = '';

                while (strlen($isi) < $panjang && ! feof($masukan)) {
                    $bagian = fread($masukan, $panjang - strlen($isi));

                    if ($bagian === false || $bagian === '') {
                        break;
                    }

                    $isi .= $bagian;
                }

                if (strlen($isi) !== $panjang) {
                    throw new \RuntimeException('File backup rusak (potongan terpotong).');
                }

                try {
                    $plain = app('encrypter')->decryptString($isi);
                } catch (\Throwable) {
                    throw new \RuntimeException(
                        'Backup tidak bisa didekripsi. Pastikan APP_KEY server sama dengan saat backup dibuat.'
                    );
                }

                fwrite($keluaran, $plain);
            }
        } finally {
            fclose($masukan);
            fclose($keluaran);
        }
    }

    /** Satu potongan terenkripsi: panjang (4 byte) + payload. */
    private function bingkai(string $plain): string
    {
        $payload = app('encrypter')->encryptString($plain);

        return pack('N', strlen($payload)) . $payload;
    }

    /**
     * Hapus backup lama, sisakan $retensi file terbaru.
     * Kembalikan jumlah file yang dihapus.
     */
    public function hapusLama(int $retensi): int
    {
        $retensi = max(1, $retensi);
        $disk = \Illuminate\Support\Facades\Storage::disk('local');

        $hapus = array_slice($this->daftarBackup(), $retensi);
        foreach ($hapus as $f) {
            $disk->delete($f);
        }

        return count($hapus);
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    protected function header(): string
    {
        $baris = [
            '-- =============================================================',
            '-- Backup database e-voting',
            '-- Database : ' . $this->namaDatabase(),
            '-- Driver   : ' . $this->driver(),
            '-- Dibuat   : ' . now()->format('Y-m-d H:i:s') . ' (server)',
            '-- =============================================================',
            '',
        ];

        // FOREIGN_KEY_CHECKS hanya dikenal MySQL; jangan tulis di SQLite.
        if ($this->driver() !== 'sqlite') {
            $baris[] = 'SET FOREIGN_KEY_CHECKS=0;';
            $baris[] = '';
        }

        return implode("\n", $baris);
    }

    protected function footer(): string
    {
        if ($this->driver() === 'sqlite') {
            return "-- Selesai.\n";
        }

        return "SET FOREIGN_KEY_CHECKS=1;\n-- Selesai.\n";
    }

    /** Statement CREATE TABLE untuk satu tabel. */
    protected function ddl(string $tabel): string
    {
        $t = $this->kutip($tabel);

        if ($this->driver() === 'sqlite') {
            $row = $this->db()->selectOne(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?",
                [$tabel]
            );
            $create = $row->sql ?? "CREATE TABLE {$t} (...)";

            return "DROP TABLE IF EXISTS {$t};\n{$create};";
        }

        $row  = (array) $this->db()->selectOne('SHOW CREATE TABLE ' . $t);
        // Kolom kedua biasanya "Create Table" (nama bisa berubah sesuai versi).
        $ddl  = $row['Create Table'] ?? (array_values($row)[1] ?? '');

        return "DROP TABLE IF EXISTS {$t};\n{$ddl};";
    }

    /** INSERT statement per batch untuk satu tabel. */
    protected function isi(string $tabel): \Generator
    {
        $kolom = $this->db()->getSchemaBuilder()->getColumnListing($tabel);

        if (empty($kolom)) {
            return;
        }

        $t = $this->kutip($tabel);
        $daftarKolom = implode(', ', array_map(fn ($k) => $this->kutip($k), $kolom));

        $batch = [];
        $total = 0;

        foreach ($this->db()->table($tabel)->cursor() as $row) {
            $nilai = array_map(fn ($k) => $this->nilai($row->{$k} ?? null), $kolom);
            $batch[] = "INSERT INTO {$t} ({$daftarKolom}) VALUES (" . implode(', ', $nilai) . ');';
            $total++;

            if (count($batch) >= 500) {
                yield implode("\n", $batch) . "\n";
                $batch = [];
            }
        }

        if (! empty($batch)) {
            yield implode("\n", $batch) . "\n";
        }

        if ($total === 0) {
            yield "-- (tabel kosong)\n";
        }
    }

    /** Format satu nilai untuk SQL. */
    protected function nilai(mixed $value): string
    {
        if ($value === null) {
            return 'NULL';
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        return $this->db()->getPdo()->quote((string) $value);
    }

    /** Kutip nama identifier sesuai driver. */
    protected function kutip(string $identifier): string
    {
        $bersih = str_replace('"', '""', $identifier);

        // SQLite & MySQL sama-sama menerima backtick, tapi tanda kutip ganda
        // lebih aman untuk nama yang mengandung spasi pada SQLite.
        return ($this->driver() === 'sqlite') ? '"' . $bersih . '"' : '`' . $bersih . '`';
    }
}
