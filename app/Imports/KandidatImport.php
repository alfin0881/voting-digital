<?php

namespace App\Imports;

use App\Models\Kandidat;
use Maatwebsite\Excel\Concerns\SkipsEmptyRows;
use Maatwebsite\Excel\Concerns\ToModel;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

/**
 * Impor kandidat dari Excel untuk SATU pemilihan.
 * Kolom: nomor_urut, nama_kandidat, visi (opsional), misi (opsional).
 * Baris dengan nomor_urut yang sudah ada (atau duplikat) dihitung gagal.
 */
class KandidatImport implements ToModel, WithHeadingRow, SkipsEmptyRows
{
    private int $sukses = 0;
    private int $gagal  = 0;

    /** @var array<int, true> nomor urut yang sudah dipakai (termasuk dari file). */
    private array $nomorDipakai = [];

    public function __construct(private int $pemilihanId)
    {
        // Nomor urut yang sudah ada di database.
        foreach (Kandidat::where('pemilihan_id', $this->pemilihanId)->pluck('nomor_urut') as $no) {
            $this->nomorDipakai[(int) $no] = true;
        }
    }

    public function model(array $row)
    {
        $nama = trim((string) ($row['nama_kandidat'] ?? $row['nama'] ?? ''));
        $no   = (int) ($row['nomor_urut'] ?? $row['no'] ?? 0);

        if ($nama === '' || $no <= 0 || isset($this->nomorDipakai[$no])) {
            $this->gagal++;
            return null;
        }

        $this->nomorDipakai[$no] = true;
        $this->sukses++;

        return new Kandidat([
            'pemilihan_id'  => $this->pemilihanId,
            'nama_kandidat' => $nama,
            'nomor_urut'    => $no,
            'visi'          => filled($row['visi'] ?? null) ? trim((string) $row['visi']) : null,
            'misi'          => filled($row['misi'] ?? null) ? trim((string) $row['misi']) : null,
        ]);
    }

    public function getSukses(): int
    {
        return $this->sukses;
    }

    public function getGagal(): int
    {
        return $this->gagal;
    }
}
