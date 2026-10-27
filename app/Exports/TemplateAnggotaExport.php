<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithColumnWidths;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\Alignment;

class TemplateAnggotaExport implements FromArray, WithHeadings, WithStyles, WithColumnWidths
{
    /**
     * Return contoh data untuk template
     *
     * @return array
     */
    public function array(): array
    {
        return [
            ['Andi', '12.3456', 'XII RPL 1', 'K7M2QX'],
            ['Budi', '12.3457', 'XII RPL 2', ''],
            ['Caca', '12.3458', 'XI FKK 1', ''],
        ];
    }

    /**
     * Header kolom
     *
     * @return array
     */
    public function headings(): array
    {
        return ['nama', 'nis', 'kelas', 'password'];
    }

    /**
     * Styling untuk worksheet
     *
     * @param Worksheet $sheet
     * @return array
     */
    public function styles(Worksheet $sheet)
    {
        return [
            // Style untuk baris header (baris 1)
            1 => [
                'font' => [
                    'bold' => true,
                    'color' => ['rgb' => 'FFFFFF'],
                    'size' => 12,
                ],
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => '6495ED'], // Warna indigo
                ],
                'alignment' => [
                    'horizontal' => Alignment::HORIZONTAL_CENTER,
                    'vertical' => Alignment::VERTICAL_CENTER,
                ],
            ],
        ];
    }

    /**
     * Lebar kolom
     *
     * @return array
     */
    public function columnWidths(): array
    {
        return [
            'A' => 30, // nama
            'B' => 15, // nis
            'C' => 20, // kelas
            'D' => 15, // password
        ];
    }
}