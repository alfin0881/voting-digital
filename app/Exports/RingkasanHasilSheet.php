<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithTitle;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class RingkasanHasilSheet implements FromArray, WithHeadings, WithTitle, ShouldAutoSize, WithStyles, WithColumnFormatting
{
    public function __construct(private array $laporan, private array $meta)
    {
    }

    public function title(): string
    {
        return 'Ringkasan';
    }

    public function headings(): array
    {
        return ['No', 'Pemilihan', 'Periode', 'Status', 'Peserta Terdaftar', 'Sudah Memilih',
                'Belum Memilih', 'Partisipasi', 'Total Suara', 'Pemenang / Terdepan'];
    }

    public function array(): array
    {
        $rows = [];

        foreach (array_values($this->laporan) as $i => $d) {
            $rows[] = [
                $i + 1,
                $d['nama'],
                $d['periode'],
                $d['sementara'] ? 'Aktif (hasil sementara)' : 'Nonaktif',
                $d['total_peserta'],
                $d['sudah_memilih'],
                $d['belum_memilih'],
                $d['persen_partisipasi'] / 100, // format persen Excel
                $d['total_suara'],
                $d['pemenang'],
            ];
        }

        $rows[] = ['']; // baris pemisah (array kosong [] akan dibuang oleh library)
        $rows[] = ['', 'Dicetak pada: ' . $this->meta['dicetak']];
        $rows[] = ['', 'Dicetak oleh: ' . $this->meta['oleh']];
        $rows[] = ['', 'Catatan: data berupa hasil agregat; suara bersifat rahasia dan tidak terhubung ke pemilih.'];

        return $rows;
    }

    public function columnFormats(): array
    {
        return ['H' => NumberFormat::FORMAT_PERCENTAGE_00];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => 'solid', 'startColor' => ['rgb' => '0C4780']],
            ],
        ];
    }
}
