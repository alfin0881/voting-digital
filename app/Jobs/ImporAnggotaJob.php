<?php

namespace App\Jobs;

use App\Imports\AnggotaImport;
use App\Models\TugasLatar;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;

/**
 * Impor data pemilih dari file Excel yang sudah diunggah, di latar belakang.
 */
class ImporAnggotaJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 600;

    public function __construct(public int $tugasId, public string $path, public ?string $kelas = null)
    {
    }

    public function handle(): void
    {
        $tugas = TugasLatar::find($this->tugasId);

        if (! $tugas) {
            return;
        }

        $tugas->update(['status' => TugasLatar::PROSES]);

        try {
            $import = new AnggotaImport($this->kelas);
            Excel::import($import, Storage::disk('local')->path($this->path));

            $sukses = $import->getSukses();
            $gagal  = $import->getGagal();

            $tugas->tandaiSelesai(null,
                "Impor selesai: {$sukses} berhasil, {$gagal} gagal (NIS duplikat/data tidak valid)."
            );
        } catch (\Throwable $e) {
            $tugas->tandaiGagal('Gagal impor: ' . $e->getMessage());
            throw $e;
        } finally {
            Storage::disk('local')->delete($this->path);
        }
    }

    public function failed(\Throwable $e): void
    {
        TugasLatar::find($this->tugasId)?->tandaiGagal('Gagal: ' . $e->getMessage());
    }
}
