<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithTitle;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Satu sheet per pemilihan: info ringkas + tabel perolehan suara per kandidat.
 */
class DetailHasilSheet implements FromArray, WithTitle, ShouldAutoSize, WithStyles, WithColumnFormatting
{
    private const BARIS_HEADER = 9; // baris judul tabel kandidat

    public function __construct(private array $data, private int $urutan)
    {
    }

    public function title(): string
    {
        // Nama sheet Excel: maks. 31 karakter, tanpa \ / ? * [ ] :
        $bersih = trim(preg_replace('/[\\\\\/\?\*\[\]:]/', '', $this->data['nama']));

        return mb_substr($this->urutan . '. ' . $bersih, 0, 31);
    }

    public function array(): array
    {
        $d = $this->data;

        $rows = [
            ['Pemilihan', $d['nama']],
            ['Periode', $d['periode']],
            ['Status', $d['sementara'] ? 'Aktif (hasil sementara)' : 'Nonaktif'],
            ['Peserta terdaftar', $d['total_peserta']],
            ['Sudah memilih', $d['sudah_memilih']],
            ['Belum memilih', $d['belum_memilih']],
            ['Partisipasi', $d['persen_partisipasi'] / 100],
            [''], // baris pemisah (array kosong [] akan dibuang oleh library)
            ['Peringkat', 'No. Urut', 'Nama Kandidat', 'Jumlah Suara', 'Persentase'],
        ];

        foreach ($d['kandidat'] as $k) {
            $rows[] = [$k['peringkat'], $k['nomor_urut'], $k['nama'], $k['suara'], $k['persen'] / 100];
        }

        $rows[] = ['Total suara', '', '', $d['total_suara'], $d['total_suara'] > 0 ? 1 : 0];
        $rows[] = [''];
        $rows[] = ['Pemenang / terdepan', $d['pemenang']];

        return $rows;
    }

    public function columnFormats(): array
    {
        return ['E' => NumberFormat::FORMAT_PERCENTAGE_00];
    }

    public function styles(Worksheet $sheet): array
    {
        $barisTotal = self::BARIS_HEADER + count($this->data['kandidat']) + 1;

        // Persentase partisipasi (B7) ikut berformat persen.
        $sheet->getStyle('B7')->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_PERCENTAGE_00);
        $sheet->getStyle('B1:B7')->getAlignment()->setHorizontal('left');

        return [
            'A1:A7' => ['font' => ['bold' => true]],
            self::BARIS_HEADER => [
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => 'solid', 'startColor' => ['rgb' => '0C4780']],
            ],
            $barisTotal => ['font' => ['bold' => true]],
            $barisTotal + 2 => ['font' => ['bold' => true]],
        ];
    }
}
