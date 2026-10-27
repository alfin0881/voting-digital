<?php

namespace App\Imports;

use App\Models\Pemilih;
use Illuminate\Support\Facades\Hash;
use App\Support\KodePemilih;
use Maatwebsite\Excel\Concerns\ToModel;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use Maatwebsite\Excel\Concerns\WithValidation;
use Maatwebsite\Excel\Concerns\SkipsEmptyRows;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;


class AnggotaImport implements 
    ToModel,
    WithHeadingRow, 
    SkipsEmptyRows, 
    WithColumnFormatting
{
    private $sukses = 0;
    private $gagal = 0;

    /** Kelas yang ditetapkan untuk semua baris impor (opsional). */
    private ?string $kelas;

    /** @var array<string, true> NIS yang sudah terpakai (dari DB maupun dari file ini). */
    private array $nisDipakai = [];

    public function __construct(?string $kelas = null)
    {
        $this->kelas = filled($kelas) ? trim($kelas) : null;

        // Muat sekali di awal, bukan query per baris. Sebelumnya setiap baris
        // menjalankan Pemilih::where('nis', ...)->exists(), jadi mengimpor 2.000
        //siswa berarti 2.000 perjalanan bolak-balik ke MySQL.
        //
        // Pola ini sama dengan KandidatImport yang mengunci nomor_urut di awal.
        foreach (Pemilih::pluck('nis') as $nis) {
            $this->nisDipakai[(string) $nis] = true;
        }
    }

    /**
     * Convert setiap row Excel menjadi model Pemilih
     *
     * @param array $row
     * @return \Illuminate\Database\Eloquent\Model|null
     */
    public function model(array $row)
    {
        $nis = trim((string) $row['nis']);
        $nis = ltrim($nis, "'"); // buang petik Excel NIS

        // Dicek terhadap daftar di memori, bukan lewat query ulang.
        if (isset($this->nisDipakai[$nis])) {
            $this->gagal++;
            return null;
        }

        // Tandai sekalian supaya NIS kembar di dalam satu file ikut tertangkap,
        // sama seperti nomor urut kembar pada KandidatImport.
        $this->nisDipakai[$nis] = true;

        $this->sukses++;

        // Kelas dari dropdown (jika dipilih) menang atas kolom Excel, supaya
        // admin bisa menetapkan kelas untuk seluruh baris impor sekaligus.
        $kelas = $this->kelas ?? ($row['kelas'] ?? null);

        // Password kosong -> dibuatkan kode acak (bukan lagi sama dengan NIS)
        $kode = filled($row['password'] ?? null) ? trim((string) $row['password']) : KodePemilih::buat();

        $pemilih = new Pemilih([
            'nama' => $row['nama'],
            'nis' => $nis,
            'kelas' => filled($kelas) ? trim((string) $kelas) : null,
        ]);

        // Hash untuk login + salinan terenkripsi untuk cetak kartu.
        return $pemilih->aturKode($kode);
    }


    /**
     * Validasi untuk setiap row
     *
     * @return array
     */
    public function rules(): array
    {
        return [
            'nama' => 'required|string|min:3',
            'nis' => 'required|string',
            'kelas' => 'nullable|string',
            'password' => 'nullable|string',
        ];
    }

    /**
     * Custom validation messages
     *
     * @return array
     */
    public function customValidationMessages()
    {
        return [
            'nama.required' => 'Kolom nama wajib diisi',
            'nama.min' => 'Nama minimal 3 karakter',
            'nis.required' => 'Kolom NIS wajib diisi',
        ];
    }

    /**
     * Baris pertama adalah header
     *
     * @return int
     */
    public function headingRow(): int
    {
        return 1;
    }

    /**
     * Get jumlah data berhasil diimport
     *
     * @return int
     */
    public function getSukses(): int
    {
        return $this->sukses;
    }

    /**
     * Get jumlah data gagal diimport
     *
     * @return int
     */
    public function getGagal(): int
    {
        return $this->gagal;
    }

    public function columnFormats(): array
{
    return [
        'B' => NumberFormat::FORMAT_TEXT, // ganti B sesuai kolom NIS
    ];
}

}