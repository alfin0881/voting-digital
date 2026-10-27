<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\WithMultipleSheets;

/**
 * Workbook Excel: sheet "Ringkasan" + satu sheet per pemilihan.
 */
class HasilPemilihanExport implements WithMultipleSheets
{
    public function __construct(private array $laporan, private array $meta)
    {
    }

    public function sheets(): array
    {
        $sheets = [new RingkasanHasilSheet($this->laporan, $this->meta)];

        foreach (array_values($this->laporan) as $i => $data) {
            $sheets[] = new DetailHasilSheet($data, $i + 1);
        }

        return $sheets;
    }
}
