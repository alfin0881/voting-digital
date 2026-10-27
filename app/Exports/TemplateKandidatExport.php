<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithColumnWidths;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Template impor kandidat. Kolom: nomor_urut, nama_kandidat, visi, misi.
 */
class TemplateKandidatExport implements FromArray, WithHeadings, WithStyles, WithColumnWidths
{
    public function array(): array
    {
        return [
            [1, 'Andi Pratama', 'Mewujudkan OSIS yang aktif dan inklusif', "Mengadakan kegiatan rutin\nMenambah ekstrakurikuler baru"],
            [2, 'Budi Santoso', 'OSIS yang transparan', "Laporan keuangan terbuka\nForum aspirasi siswa"],
        ];
    }

    public function headings(): array
    {
        return ['nomor_urut', 'nama_kandidat', 'visi', 'misi'];
    }

    public function styles(Worksheet $sheet)
    {
        return [
            1 => [
                'font'      => ['bold' => true, 'color' => ['rgb' => 'FFFFFF'], 'size' => 12],
                'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '6495ED']],
                'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER],
            ],
        ];
    }

    public function columnWidths(): array
    {
        return ['A' => 12, 'B' => 28, 'C' => 45, 'D' => 45];
    }
}
