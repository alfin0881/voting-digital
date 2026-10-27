<?php

namespace App\Console\Commands;

use App\Models\CatatanAktivitas;
use App\Models\Pemilihan;
use Illuminate\Console\Command;

/**
 * Tutup otomatis pemilihan yang waktu selesainya (tanggal + jam) sudah lewat.
 *
 * Penolakan suara setelah waktu selesai TIDAK bergantung pada perintah ini:
 * Pemilihan::bolehMenerimaSuara() selalu membandingkan dengan jam server.
 * Perintah ini hanya merapikan datanya — status berubah menjadi "nonaktif"
 * supaya dashboard, hasil (tidak lagi "sementara"), dan daftar aktif akurat
 * tanpa menunggu panitia menekan tombol.
 *
 * Dijadwalkan tiap menit lewat routes/console.php.
 */
class TutupPemilihanOtomatis extends Command
{
    protected $signature = 'pemilihan:tutup-otomatis';

    protected $description = 'Nonaktifkan pemilihan yang waktu selesainya sudah lewat';

    public function handle(): int
    {
        $jumlah = 0;

        Pemilihan::melewatiWaktuSelesai()->get()->each(function (Pemilihan $p) use (&$jumlah) {
            // Pastikan ulang di PHP (zona waktu & jam efektif) sebelum menutup.
            if (! $p->sudahLewatWaktu()) {
                return;
            }

            $p->forceFill(['status' => 'nonaktif'])->save();

            CatatanAktivitas::catat(
                'pemilihan.tutup_otomatis',
                "Pemilihan \"{$p->nama_pemilihan}\" ditutup otomatis pada "
                . $p->waktuSelesai()->format('d M Y H:i') . '.'
            );

            $this->line("Ditutup: {$p->nama_pemilihan}");
            $jumlah++;
        });

        $this->info("{$jumlah} pemilihan ditutup otomatis.");

        return self::SUCCESS;
    }
}
