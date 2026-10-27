<?php

namespace App\Services;

use App\Models\Kandidat;
use App\Models\Pemilihan;
use App\Models\Suara;

/**
 * Sumber data tunggal untuk laporan hasil (PDF & Excel) agar angkanya
 * selalu sama di kedua format. Hanya berisi hasil agregat: tidak ada
 * identitas pemilih maupun pilihan per orang.
 */
class LaporanHasil
{
    /** @return array<int, array> laporan semua pemilihan, terbaru dulu */
    public function semua(): array
    {
        return Pemilihan::orderByDesc('tanggal_mulai')->orderByDesc('id')
            ->get()
            ->map(fn (Pemilihan $p) => $this->untuk($p))
            ->all();
    }

    public function untuk(Pemilihan $pemilihan): array
    {
        $totalSuara = Suara::where('pemilihan_id', $pemilihan->id)->count();

        $kandidat = Kandidat::where('pemilihan_id', $pemilihan->id)
            ->withCount('suara')
            ->orderBy('nomor_urut')
            ->get();

        $baris = $this->beriPeringkat($kandidat, $totalSuara);

        $totalPeserta = $pemilihan->totalPeserta();
        $sudahMemilih = $pemilihan->totalSudahMemilih();

        return [
            'id'                 => $pemilihan->id,
            'nama'               => $pemilihan->nama_pemilihan,
            'deskripsi'          => $pemilihan->deskripsi,
            'periode'            => $this->tanggal($pemilihan->tanggal_mulai) . ' ' . substr($pemilihan->jamMulaiEfektif(), 0, 5)
                . ' s/d ' . $this->tanggal($pemilihan->tanggal_selesai) . ' ' . substr($pemilihan->jamSelesaiEfektif(), 0, 5),
            'status'             => $pemilihan->status,
            'sementara'          => $pemilihan->status === 'aktif',
            'total_peserta'      => $totalPeserta,
            'sudah_memilih'      => $sudahMemilih,
            'belum_memilih'      => max(0, $totalPeserta - $sudahMemilih),
            'persen_partisipasi' => $totalPeserta === 0 ? 0.0 : round(($sudahMemilih / $totalPeserta) * 100, 2),
            'total_suara'        => $totalSuara,
            'kandidat'           => $baris,
            'pemenang'           => $this->tentukanPemenang($baris, $totalSuara),
        ];
    }

    /**
     * Susun baris hasil lengkap dengan peringkatnya.
     *
     * Peringkat memakai aturan Baku: peringkat = 1 + jumlah kandidat yang
     * suaranya LEBIH BANYAK. Kandidat dengan suara sama dibagi peringkat
     * sama, dan peringkat berikutnya melompat (1, 1, 3) — persis seperti
     * cara hitung lama.
     *
     * Versi lama menuliskan `where('suara_count', '>', ...)->count()` di dalam
     * map, sehingga setiap kandidat memindai SELURUH daftar kandidat sekali
     * lagi (O(n^2)). Cukup terasa ketika laporan dirender untuk semua
     * pemilihan sekaligus di layar besar maupun saat ekspor. Di sini
     * pengurutan cukup satu kali O(n log n).
     *
     * @param  \Illuminate\Support\Collection  $kandidat  sudah withCount('suara')
     * @return array<int, array>
     */
    private function beriPeringkat($kandidat, int $totalSuara): array
    {
        // Peringkat = 1 + jumlah kandidat yang suaranya lebih banyak. Kandidat
        // dengan suara sama dibagi peringkat sama dan peringkat berikutnya
        // melompat (mis. 1, 1, 3) — persis seperti cara hitung versi lama.
        //
        // Versi lama menuliskan where('suara_count', '>', ...)->count() di
        // dalam map, jadi tiap kandidat memindai seluruh daftar sekali lagi
        // (O(n^2)). Cukup terasa saat laporan dirender untuk semua pemilihan
        // sekaligus di layar besar maupun saat ekspor.
        //
        // Di sini daftar diurutkan menurun SEKALI, lalu peringkat tiap nilai
        // diambil dari posisi kemunculan pertamanya: semua unsur di depannya
        // pasti lebih besar, persis syarat di atas.
        $peringkatNilai = [];

        foreach ($kandidat->sortByDesc('suara_count')->values() as $i => $k) {
            $suara = (int) $k->suara_count;

            if (! array_key_exists($suara, $peringkatNilai)) {
                $peringkatNilai[$suara] = $i + 1;
            }
        }

        return $kandidat
            ->values()
            ->map(function ($k) use ($totalSuara, $peringkatNilai) {
                $suara = (int) $k->suara_count;

                return [
                    'peringkat'  => $peringkatNilai[$suara],
                    'nomor_urut' => $k->nomor_urut,
                    'nama'       => $k->nama_kandidat,
                    'suara'      => $suara,
                    'persen'     => $totalSuara === 0 ? 0.0 : round(($suara / $totalSuara) * 100, 2),
                ];
            })
            ->all();
    }

    private function tentukanPemenang(array $baris, int $totalSuara): string
    {
        if ($totalSuara === 0 || empty($baris)) {
            return 'Belum ada suara';
        }

        $tertinggi = max(array_column($baris, 'suara'));
        $terdepan  = array_values(array_filter($baris, fn ($b) => $b['suara'] === $tertinggi));

        if (count($terdepan) > 1) {
            return 'Seri: ' . implode(', ', array_map(fn ($b) => $b['nama'], $terdepan));
        }

        return $terdepan[0]['nama'];
    }

    private function tanggal($tanggal): string
    {
        return $tanggal ? $tanggal->copy()->locale('id')->translatedFormat('d F Y') : '-';
    }
}
