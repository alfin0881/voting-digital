<?php

namespace App\Jobs;

use App\Exports\HasilPemilihanExport;
use App\Models\Pemilihan;
use App\Models\Pengaturan;
use App\Models\TugasLatar;
use App\Services\LaporanHasil;
use App\Services\PenjagaHasil;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;

/**
 * Ekspor hasil pemilihan ke Excel di latar belakang.
 * $pemilihanId null = semua pemilihan.
 */
class EksporHasilJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 600;

    public function __construct(public int $tugasId, public ?int $pemilihanId = null)
    {
    }

    public function handle(LaporanHasil $laporan, PenjagaHasil $penjaga): void
    {
        $tugas = TugasLatar::find($this->tugasId);

        if (! $tugas) {
            return;
        }

        $tugas->update(['status' => TugasLatar::PROSES]);

        try {
            if ($this->pemilihanId) {
                $pemilihan = Pemilihan::findOrFail($this->pemilihanId);

                if ($penjaga->terkunci($pemilihan)) {
                    $tugas->tandaiGagal('Ekspor dibatalkan: hasil pemilihan masih disembunyikan sampai pemungutan ditutup.');

                    return;
                }

                $data = [$laporan->untuk($pemilihan)];
            } else {
                $data = $laporan->semua();

                $terkunci = Pemilihan::whereIn('id', array_column($data, 'id'))
                    ->get()
                    ->filter(fn (Pemilihan $p) => $penjaga->terkunci($p))
                    ->pluck('id')
                    ->all();

                $data = array_values(array_filter(
                    $data,
                    fn (array $baris) => ! in_array($baris['id'], $terkunci, true)
                ));

                if (empty($data)) {
                    $tugas->tandaiGagal('Ekspor dibatalkan: hasil masih disembunyikan sampai pemungutan ditutup.');

                    return;
                }
            }

            $meta = [
                'sekolah' => Pengaturan::namaSekolah(),
                'dicetak' => now()->locale('id')->translatedFormat('d F Y, H:i') . ' WIB',
                'oleh'    => ($tugas->nama_admin ?? 'Sistem') . ' (ekspor latar belakang)',
            ];

            $nama = 'tugas/hasil-' . ($this->pemilihanId ? "pemilihan-{$this->pemilihanId}" : 'semua')
                . '-' . now()->format('Ymd-His') . '.xlsx';

            Excel::store(new HasilPemilihanExport($data, $meta), $nama, 'local');

            $tugas->tandaiSelesai($nama, 'Ekspor ' . count($data) . ' pemilihan selesai.');
        } catch (\Throwable $e) {
            $tugas->tandaiGagal('Gagal mengekspor: ' . $e->getMessage());
            throw $e;
        }
    }

    public function failed(\Throwable $e): void
    {
        TugasLatar::find($this->tugasId)?->tandaiGagal('Gagal: ' . $e->getMessage());
    }
}
