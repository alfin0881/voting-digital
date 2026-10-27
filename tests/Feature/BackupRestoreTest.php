<?php

namespace Tests\Feature;

use App\Models\Pengaturan;
use App\Services\DatabaseBackup;
use App\Services\DatabaseRestore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Backup dienkripsi, tidak menyimpan SQL plain, dan bisa didekripsi/dipulihkan.
 */
class BackupRestoreTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    public function test_file_backup_tidak_berisi_sql_plain_dan_bisa_didekripsi(): void
    {
        $backup = app(DatabaseBackup::class);

        $nama = DatabaseBackup::FOLDER . '/uji-' . now()->format('Ymd-His') . '.sql.enc';
        $byte = $backup->simpan($nama);

        $this->assertGreaterThan(0, $byte);
        $this->assertTrue(Storage::disk('local')->exists($nama));

        $isi = Storage::disk('local')->get($nama);

        $this->assertStringStartsWith(DatabaseBackup::MAGIC, $isi);
        $this->assertStringNotContainsString('CREATE TABLE', $isi);
        $this->assertStringNotContainsString('INSERT INTO', $isi);

        $tujuan = Storage::disk('local')->path('backups/uji-hasil.sql');
        $backup->dekripsiKeFile($nama, $tujuan);

        $plain = file_get_contents($tujuan);
        $this->assertStringContainsString('CREATE TABLE', $plain);
        $this->assertStringContainsString('INSERT INTO', $plain);

        @unlink($tujuan);
    }

    public function test_restore_mengembalikan_data_dan_menolak_file_plain(): void
    {
        Pengaturan::tulis('uji_restore', 'sebelum');

        $backup = app(DatabaseBackup::class);
        $nama = DatabaseBackup::FOLDER . '/uji-restore.sql.enc';
        $backup->simpan($nama);

        Pengaturan::tulis('uji_restore', 'sesudah');
        $this->assertSame('sesudah', Pengaturan::baca('uji_restore'));

        $jumlah = app(DatabaseRestore::class)->pulihkan($nama);

        $this->assertGreaterThan(0, $jumlah);
        $this->assertSame('sebelum', Pengaturan::baca('uji_restore'));

        // File .sql lama tidak boleh diterima jalur restore.
        Storage::disk('local')->put('backups/lama.sql', 'CREATE TABLE x (id int);');

        $this->expectException(\RuntimeException::class);
        app(DatabaseRestore::class)->pulihkan('backups/lama.sql');
    }
}
