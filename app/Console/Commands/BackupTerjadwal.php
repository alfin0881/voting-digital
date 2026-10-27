<?php

namespace App\Console\Commands;

use App\Models\Pengaturan;
use App\Services\DatabaseBackup;
use Illuminate\Console\Command;

/**
 * Backup database terjadwal: simpan dump ke storage/app/private/backups,
 * lalu hapus yang lama sesuai retensi.
 *
 * Jadwal & jumlah retensi diatur lewat halaman Kendali Hari-H (tabel pengaturan).
 */
class BackupTerjadwal extends Command
{
    protected $signature = 'backup:jadwal';

    protected $description = 'Membuat backup database terjadwal dan membersihkan backup lama.';

    public function handle(DatabaseBackup $backup): int
    {
        $retensi = max(1, (int) Pengaturan::baca(Pengaturan::BACKUP_RETENSI, '7'));

        $this->info('Membuat backup database...');

        try {
            $nama = DatabaseBackup::FOLDER . '/voting-' . now()->format('Ymd-His') . '.sql.enc';
            $byte = $backup->simpan($nama);
        } catch (\Throwable $e) {
            $this->error('Backup gagal: ' . $e->getMessage());
            return self::FAILURE;
        }

        $dihapus = $backup->hapusLama($retensi);

        Pengaturan::tulis(Pengaturan::BACKUP_TERAKHIR_JADWAL, now()->toDateTimeString());

        $this->info(sprintf(
            'Backup selesai: %s (%.1f KB). %d backup lama dihapus (retensi %d).',
            $nama,
            $byte / 1024,
            $dihapus,
            $retensi
        ));

        return self::SUCCESS;
    }
}
