<?php

namespace App\Http\Controllers;

use App\Models\CatatanAktivitas;
use App\Models\Pemilih;
use App\Models\Pengaturan;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;

/**
 * Cetak kartu pemilih (NIS + kode kartu) untuk dibagikan panitia saat hari-H.
 * Akses dibatasi middleware 'izin:anggota' + 'izin:kode_kartu' (lihat routes/web.php).
 * Kode dibaca dari kolom kode_kartu (terenkripsi), BUKAN dari password (hash),
 * dan setiap pencetakan dicatat di audit log.
 */
class KartuPemilihController extends Controller
{
    public function cetak(Request $request)
    {
        $query = Pemilih::orderBy('kelas')->orderBy('nama');

        // Filter opsional: satu kelas saja, atau daftar ID tertentu (dari halaman Kelola Pemilih).
        if ($request->filled('kelas')) {
            $query->where('kelas', $request->string('kelas'));
        }

        if ($request->filled('ids')) {
            $ids = array_filter(explode(',', (string) $request->query('ids')), 'is_numeric');
            abort_if(empty($ids), 422, 'Daftar pemilih tidak valid.');
            $query->whereIn('id', $ids);
        }

        $daftar = $query->get(['id', 'nama', 'nis', 'kelas', 'kode_kartu']);

        abort_if($daftar->isEmpty(), 404, 'Tidak ada data pemilih untuk dicetak.');

        // Dekripsi hanya di sini; pemilih lama tanpa kode (atau APP_KEY berubah)
        // tetap tercetak, dengan keterangan perlu diacak ulang.
        $tanpaKode = 0;
        $pemilih = $daftar->map(function (Pemilih $p) use (&$tanpaKode) {
            $kode = $p->kodeKartuAman();
            $kode === null && $tanpaKode++;

            return (object) [
                'nama'  => $p->nama,
                'nis'   => $p->nis,
                'kelas' => $p->kelas,
                'kode'  => $kode,
            ];
        });

        $cakupan = $request->filled('ids')
            ? count($pemilih) . ' pemilih terpilih'
            : ($request->filled('kelas') ? "kelas {$request->string('kelas')}" : 'semua pemilih');
        CatatanAktivitas::catat(
            'anggota.cetak_kartu',
            "Mencetak kartu pemilih ({$cakupan}), {$pemilih->count()} kartu"
            . ($tanpaKode > 0 ? ", {$tanpaKode} di antaranya belum punya kode" : '') . '.'
        );

        $pdf = Pdf::loadView('exports.kartu-pemilih', [
            'pemilih' => $pemilih,
            'sekolah' => Pengaturan::namaSekolah(),
        ])->setPaper($this->ukuranF4(), 'portrait');

        $nama = 'kartu-pemilih-' . ($request->filled('kelas') ? $request->string('kelas') : 'semua') . '.pdf';

        return $pdf->download($nama);
    }

    /**
     * Ukuran kertas F4 (215 x 330 mm), dalam satuan poin PDF (1 mm = 2.83465 pt).
     * F4 lebih besar dari A4 sehingga kartu pemilih bisa dicetak lebih besar
     * dan lebih mudah dibaca/digunting.
     */
    private function ukuranF4(): array
    {
        return [0.0, 0.0, 609.45, 935.43];
    }
}
