<?php

namespace App\Services;

use App\Models\Kandidat;
use App\Models\Pemilihan;
use App\Models\PesertaPemilihan;
use App\Models\Suara;

/**
 * Logika keputusan hasil pemilihan:
 * - menghitung perolehan suara & menentukan pemenang (mendukung seri);
 * - membuat pemilihan putaran kedua (runoff) dari 2 kandidat teratas.
 */
class KeputusanPemilihan
{
    /**
     * Rekap perolehan suara satu pemilihan.
     * Setiap kandidat: id, nomor_urut, nama_kandidat, suara, persen.
     *
     * @return array{kandidat: array<int, array>, total: int}
     */
    public function rekap(Pemilihan $pemilihan): array
    {
        $total = Suara::where('pemilihan_id', $pemilihan->id)->count();

        $kandidat = Kandidat::where('pemilihan_id', $pemilihan->id)
            ->withCount('suara')
            ->orderByDesc('suara_count')
            ->orderBy('nomor_urut')
            ->get()
            ->map(fn (Kandidat $k) => [
                'id'            => $k->id,
                'nomor_urut'    => $k->nomor_urut,
                'nama_kandidat' => $k->nama_kandidat,
                'suara'         => (int) $k->suara_count,
                'persen'        => $total > 0 ? round(($k->suara_count / $total) * 100, 2) : 0.0,
            ])
            ->values()
            ->all();

        return ['kandidat' => $kandidat, 'total' => $total];
    }

    /**
     * Apakah hasil pemilihanini SERI di puncak? (dua kandidat atau lebih
     * berbagi perolehan suara tertinggi). Rekap harus berisi suara > 0.
     */
    public function seriDiPuncak(array $rekap): bool
    {
        if ($rekap['total'] === 0 || count($rekap['kandidat']) < 2) {
            return false;
        }

        $tertinggi = $rekap['kandidat'][0]['suara'];
        $teratas   = array_filter($rekap['kandidat'], fn ($k) => $k['suara'] === $tertinggi);

        return count($teratas) >= 2;
    }

    /** Kandidat dengan perolehan suara tertinggi (bisa lebih dari satu bila seri). */
    public function teratas(array $rekap, int $ambil = 2): array
    {
        return array_slice($rekap['kandidat'], 0, $ambil);
    }

    /**
     * Buat pemilihan putaran kedua dari 2 kandidat teratas putaran ini.
     * Tanggal putaran kedua dimulai H-1 setelah putaran pertama selesai.
     *
     * @return array{pemilihan: Pemilihan, kandidat: array<int, Kandidat>}
     */
    public function buatRunoff(Pemilihan $induk, array $rekap): array
    {
        $teratas = $this->teratas($rekap, 2);

        $mulai = $induk->tanggal_selesai->copy()->addDay();
        $selesai = $mulai->copy()->addDay(); // default 2 hari

        $putaranDua = Pemilihan::create([
            'nama_pemilihan'  => $induk->nama_pemilihan . ' — Putaran II',
            'deskripsi'       => 'Putaran kedua (runoff) karena hasil seri: '
                . implode(' vs ', array_map(fn ($k) => $k['nama_kandidat'], $teratas)) . '.',
            'tanggal_mulai'   => $mulai->toDateString(),
            'tanggal_selesai' => $selesai->toDateString(),
            'jam_mulai'       => $induk->jamMulaiEfektif(),
            'jam_selesai'     => $induk->jamSelesaiEfektif(),
            'status'          => 'nonaktif',
            'putaran'         => 2,
            'induk_id'        => $induk->id,
        ]);

        $dibuat = [];
        foreach ($teratas as $i => $lama) {
            $asli = Kandidat::find($lama['id']);
            if (! $asli) {
                continue;
            }

            $dibuat[] = Kandidat::create([
                'pemilihan_id'  => $putaranDua->id,
                'nama_kandidat' => $asli->nama_kandidat,
                'nomor_urut'    => $i + 1, // diurutkan ulang 1 & 2 pada putaran kedua
                'foto'          => $asli->foto,
                'visi'          => $asli->visi,
                'misi'          => $asli->misi,
            ]);
        }

        // Salin daftar peserta dari pemilihan induk. Tanpa ini, putaran II
        // berdiri tanpa peserta (0 orang) dan tidak ada yang bisa memilih
        // sampai panitia mendaftarkan ulang seluruh siswa kayak kecil.
        PesertaPemilihan::whereJsonContains('pemilihan_ids', $induk->id)
            ->get()
            ->each(fn (PesertaPemilihan $peserta) => $peserta->tambahPemilihan($putaranDua->id));

        return ['pemilihan' => $putaranDua, 'kandidat' => $dibuat];
    }
}
