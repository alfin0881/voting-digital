<?php

namespace App\Http\Controllers;

use App\Exports\HasilPemilihanExport;
use App\Jobs\EksporHasilJob;
use App\Models\CatatanAktivitas;
use App\Models\Pemilihan;
use App\Models\Pengaturan;
use App\Models\TugasLatar;
use App\Services\LaporanHasil;
use App\Services\PenjagaHasil;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Maatwebsite\Excel\Facades\Excel;

/**
 * Export hasil pemilihan ke PDF & Excel.
 * Akses dibatasi lewat middleware 'izin:export' (Super Admin & Panitia).
 * Tanpa parameter {pemilihan} = semua pemilihan.
 */
class ExportHasilController extends Controller
{
    public function __construct(
        private LaporanHasil $laporan,
        private PenjagaHasil $penjaga,
    ) {
    }

    public function pdf(Request $request, ?Pemilihan $pemilihan = null)
    {
        $data = $this->ambilData($pemilihan);

        return Pdf::loadView('exports.hasil-pdf', [
                'laporan' => $data,
                'meta'    => $this->meta($request),
            ])
            ->setPaper('a4', 'portrait')
            ->download($this->namaFile($pemilihan, 'pdf'));
    }

    public function excel(Request $request, ?Pemilihan $pemilihan = null)
    {
        $data = $this->ambilData($pemilihan);

        return Excel::download(
            new HasilPemilihanExport($data, $this->meta($request)),
            $this->namaFile($pemilihan, 'xlsx')
        );
    }

    private function ambilData(?Pemilihan $pemilihan): array
    {
        if ($pemilihan && $this->penjaga->terkunci($pemilihan)) {
            abort(403, 'Hasil pemilihan ini masih disembunyikan sampai pemungutan suara ditutup.');
        }

        if ($pemilihan) {
            $data = [$this->laporan->untuk($pemilihan)];
        } else {
            $data = $this->laporan->semua();

            $terkunci = Pemilihan::whereIn('id', array_column($data, 'id'))
                ->get()
                ->filter(fn (Pemilihan $p) => $this->penjaga->terkunci($p))
                ->pluck('id')
                ->all();

            $data = array_values(array_filter(
                $data,
                fn (array $baris) => ! in_array($baris['id'], $terkunci, true)
            ));
        }

        abort_if(empty($data), 404, $this->penjaga->aktif()
            ? 'Hasil masih disembunyikan sampai pemungutan suara ditutup.'
            : 'Belum ada data pemilihan untuk diexport.');

        return $data;
    }

    private function meta(Request $request): array
    {
        $user = $request->user('admin');

        return [
            'sekolah' => Pengaturan::namaSekolah(),
            'dicetak' => now()->locale('id')->translatedFormat('d F Y, H:i') . ' WIB',
            'oleh'    => $user->nama . ' (' . $user->labelPeranAdmin() . ')',
        ];
    }

    private function namaFile(?Pemilihan $pemilihan, string $ekstensi): string
    {
        $bagian = $pemilihan ? Str::slug($pemilihan->nama_pemilihan) : 'semua-pemilihan';

        return 'hasil-' . ($bagian ?: 'pemilihan') . '-' . now()->format('Ymd') . '.' . $ekstensi;
    }

    /**
     * Jalankan ekspor Excel di latar belakang (queue) agar tidak timeout.
     * Setelah selesai, file bisa diunduh dari daftar tugas.
     */
    public function excelLatar(Request $request, ?Pemilihan $pemilihan = null)
    {
        $judul = $pemilihan
            ? 'Ekspor Excel: ' . $pemilihan->nama_pemilihan
            : 'Ekspor Excel: semua pemilihan';

        $tugas = TugasLatar::buat('ekspor_hasil', $judul);

        EksporHasilJob::dispatch($tugas->id, $pemilihan?->id);

        CatatanAktivitas::catat('ekspor.latar', "Menjalankan ekspor Excel latar belakang ({$judul}).");

        // Halaman "Backup" kini dilayani React di /admin/backup.
        return redirect('/admin/backup')
            ->with('success', 'Ekspor sedang diproses di latar belakang. Unduh di daftar Tugas Latar Belakang.');
    }
}
