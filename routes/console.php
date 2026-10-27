<?php

use App\Models\Pengaturan;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Penjadwalan
|--------------------------------------------------------------------------
| Perintah dicek tiap jam (menit ke-0) dan hanya dijalankan bila:
|   - backup terjadwal aktif, DAN
|   - jam sekarang sama dengan jam yang dipilih panitia.
|
| Pengecekan sengaja dilakukan di dalam ->when() (saat scheduler berjalan),
| BUKAN saat file ini dimuat, supaya aplikasi tidak menyentuh tabel `pengaturan`
| sebelum migrasi dijalankan.
|
| Jalankan scheduler: `php artisan schedule:work` (dev) atau cron:
|   * * * * * cd /path-project && php artisan schedule:run >> /dev/null 2>&1
*/
Schedule::command('backup:jadwal')
    ->hourly()
    ->when(function () {
        try {
            return Pengaturan::benar(Pengaturan::BACKUP_JADWAL_AKTIF)
                && (int) now()->hour === (int) Pengaturan::baca(Pengaturan::BACKUP_JAM, '23');
        } catch (\Throwable) {
            return false;
        }
    });

/*
|--------------------------------------------------------------------------
| Tutup otomatis pemilihan
|--------------------------------------------------------------------------
| Tiap menit, pemilihan aktif yang waktu selesainya (tanggal + jam) sudah
| lewat dinonaktifkan. Suara yang masuk setelah waktu selesai tetap ditolak
| oleh model walau scheduler mati; perintah ini hanya merapikan status.
*/
Schedule::command('pemilihan:tutup-otomatis')
    ->everyMinute()
    ->withoutOverlapping();
