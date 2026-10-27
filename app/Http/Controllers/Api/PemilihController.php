<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\AuthController as AuthApi;
use App\Http\Controllers\Controller;
use App\Models\Kandidat;
use App\Models\Partisipasi;
use App\Models\Pemilihan;
use App\Models\PesertaPemilihan;
use App\Models\Suara;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * API JSON untuk aksi dan polling halaman pemilih.
 *
 * Data awal halaman dikirim lewat props Inertia, sedangkan aturan pemungutan
 * (jadwal, status memilih, pengumuman) tetap diperiksa di sini agar aksi dari
 * halaman yang sudah terbuka selalu divalidasi ulang oleh server.
 */
class PemilihController extends Controller
{
    /**
     * Daftar pemilihan yang boleh dipilih + progres keseluruhan.
     * SETARA dengan DaftarPemilihan::muat()
     */
    public function daftar(): JsonResponse
    {
        $pemilih = $this->pemilih();

        $aktif = $pemilih->pemilihanDiikuti()
            ->bolehDipilihSekarang()
            ->withCount('kandidat')
            ->get();

        // Progres dihitung dari SEMUA pemilihan yang diikuti (bukan hanya yang
        // aktif) supaya siswa tahu total kewajiban memilihnya.
        $diikuti = $pemilih->pemilihanDiikuti()->get();
        $total   = $diikuti->count();
        $sudah   = $diikuti->filter(fn ($p) => $pemilih->sudahMemilih($p->id))->count();

        return response()->json([
            'user' => [
                'nama'  => $pemilih->nama,
                'nis'   => $pemilih->nis,
                'kelas' => $pemilih->kelas,
            ],
            'dijeda'    => Pemilihan::sedangDijeda(),
            'progres'   => [
                'total'  => $total,
                'sudah'  => $sudah,
                'belum'  => $total - $sudah,
                'persen' => $total > 0 ? round($sudah / $total * 100) : 0,
            ],
            'pemilihan' => $aktif->map(fn (Pemilihan $p) => [
                'id'              => $p->id,
                'nama'            => $p->nama_pemilihan,
                'deskripsi'       => $p->deskripsi,
                'tanggal_mulai'   => $p->tanggal_mulai?->format('Y-m-d'),
                'tanggal_selesai' => $p->tanggal_selesai?->format('Y-m-d'),
                'jam_mulai'       => substr($p->jamMulaiEfektif(), 0, 5),
                'jam_selesai'     => substr($p->jamSelesaiEfektif(), 0, 5),
                'jumlah_kandidat' => $p->kandidat_count,
                'sudah_memilih'   => $pemilih->sudahMemilih($p->id),
                'boleh_memilih'   => $p->bolehMenerimaSuara(),
                'alasan'          => $p->alasanTidakBolehMemilih(),
            ])->values(),
        ]);
    }

    /**
     * Status jeda + pengumuman, dipanggil frontend secara polling ringan
     * supaya pesan panitia muncul tanpa perlu refresh.
     */
    public function status(): JsonResponse
    {
        return response()->json((new AuthApi())->statusPemungutan());
    }

    /** Heartbeat: menandai pemilih masih aktif (lihat BatasiIdleUser). */
    public function ping(): JsonResponse
    {
        return response()->json(['berhasil' => true]);
    }

    /** SETARA dengan LihatKandidat::mount() */
    public function kandidat(int $pemilihanId): JsonResponse
    {
        $pemilih   = $this->pemilih();
        $pemilihan = Pemilihan::findOrFail($pemilihanId);

        // Tidak terdaftar -> 403 (React mengarahkan balik ke daftar).
        if (! $pemilih->terdaftarDiPemilihan($pemilihan->id)) {
            return response()->json([
                'pesan' => 'Anda tidak terdaftar dalam pemilihan ini.',
                'kode'  => 'tidak_terdaftar',
            ], 403);
        }

        $sudahMemilih = $pemilih->sudahMemilih($pemilihan->id);

        // Sudah memilih -> tetap boleh dibuka (konfirmasi suara tercatat), walau
        // pemilihan sudah ditutup. Belum memilih & tidak boleh memilih -> tolak
        // sebelum sempat menampilkan tombol pilih.
        $boleh = $pemilihan->bolehMenerimaSuara();

        if (! $sudahMemilih && ! $boleh) {
            return response()->json([
                'pesan' => $pemilihan->alasanTidakBolehMemilih(),
                'kode'  => 'tidak_boleh',
            ], 403);
        }

        $kandidat = Kandidat::where('pemilihan_id', $pemilihan->id)
            ->orderBy('nomor_urut')
            ->get();

        return response()->json([
            'pemilihan' => [
                'id'              => $pemilihan->id,
                'nama'            => $pemilihan->nama_pemilihan,
                'deskripsi'       => $pemilihan->deskripsi,
                'tanggal_mulai'   => $pemilihan->tanggal_mulai?->format('Y-m-d'),
                'tanggal_selesai' => $pemilihan->tanggal_selesai?->format('Y-m-d'),
                'jam_mulai'       => substr($pemilihan->jamMulaiEfektif(), 0, 5),
                'jam_selesai'     => substr($pemilihan->jamSelesaiEfektif(), 0, 5),
                'status'          => $pemilihan->status,
            ],
            'dijeda'        => Pemilihan::sedangDijeda(),
            'sudah_memilih' => $sudahMemilih,
            'boleh_memilih' => $boleh && ! $sudahMemilih,
            'alasan'        => $pemilihan->alasanTidakBolehMemilih(),
            'jumlah_suara'  => $pemilihan->totalSuara(),
            'kandidat'      => $kandidat->map(fn (Kandidat $k) => [
                'id'            => $k->id,
                'nomor_urut'    => $k->nomor_urut,
                'nama_kandidat' => $k->nama_kandidat,
                'visi'          => $k->visi,
                'misi'          => $k->misi,
                'foto_url'      => $k->fotoUrl(),
            ])->values(),
        ]);
    }

    /**
     * Simpan suara. SETARA dengan LihatKandidat::pilih()
     *
     * Urutan pengecekan WAJIB sama dengan aslinya (sudah memilih -> jeda ->
     * kandidat valid -> pemilihan masih boleh menerima suara -> transaksi),
     * supaya tidak ada celah dobel vote yang baru muncul di versi React.
     */
    public function suara(Request $request, int $pemilihanId): JsonResponse
    {
        // Catatan urutan: pemeriksaan "terdaftar / sudah memilih / jeda" dilakukan
        // SEBELUM validasi kandidat_id. Ini sengaja, agar orang yang tidak
        // terdaftar tidak bisa melihat pesan validasi yang membocorkan
        // keberadaan kandidat di pemilihan lain.
        $pemilih   = $this->pemilih();
        $pemilihan = Pemilihan::findOrFail($pemilihanId);

        if (! $pemilih->terdaftarDiPemilihan($pemilihan->id)) {
            return response()->json([
                'pesan' => 'Anda tidak terdaftar dalam pemilihan ini.',
                'kode'  => 'tidak_terdaftar',
            ], 403);
        }

        if ($pemilih->sudahMemilih($pemilihan->id)) {
            return response()->json([
                'pesan'         => 'Anda sudah memilih di pemilihan ini!',
                'kode'          => 'sudah_memilih',
                'sudah_memilih' => true,
            ], 409);
        }

        // Jeda darurat: hentikan di sini walau jeda baru saja ditekan panitia.
        if (Pemilihan::sedangDijeda()) {
            return response()->json([
                'pesan' => 'Pemungutan suara sedang dijeda oleh panitia. Silakan menunggu.',
                'kode'  => 'dijeda',
                'jeda'  => true,
            ], 409);
        }

        $data = $request->validate([
            'kandidat_id' => ['required', 'integer', 'exists:kandidat,id'],
        ], [
            'kandidat_id.required' => 'Kandidat belum dipilih.',
        ]);

        $kandidat = Kandidat::findOrFail($data['kandidat_id']);

        if ((int) $kandidat->pemilihan_id !== (int) $pemilihan->id) {
            return response()->json([
                'pesan' => 'Kandidat tidak valid untuk pemilihan ini.',
                'kode'  => 'kandidat_salah',
            ], 422);
        }

        // Jaga-jaga: pemilihan bisa saja ditutup panitia tepat ketika halaman ini
        // masih terbuka di perangkat pemilih.
        $pemilihan->refresh();

        if (! $pemilihan->bolehMenerimaSuara()) {
            return response()->json([
                'pesan' => $pemilihan->alasanTidakBolehMemilih(),
                'kode'  => 'ditutup',
            ], 409);
        }

        $now = now();

        try {
            DB::transaction(function () use ($pemilih, $pemilihan, $kandidat, $now) {
                // 1. Catat BAHWA user ini sudah memilih (tanpa kandidat).
                //    Unique (pemilih_id, pemilihan_id) mencegah dobel vote,
                //    termasuk bila tombol diklik dua kali / dua tab bersamaan.
                Partisipasi::create([
                    'pemilih_id'    => $pemilih->id,
                    'pemilihan_id'  => $pemilihan->id,
                    'waktu_memilih' => $now,
                ]);

                // 2. Simpan ISI suara secara anonim (tanpa identitas & waktu).
                Suara::create([
                    'pemilihan_id' => $pemilihan->id,
                    'kandidat_id'  => $kandidat->id,
                ]);

                // 3. Update status_voting di peserta_pemilihan (satu baris per user).
                PesertaPemilihan::where('pemilih_id', $pemilih->id)
                    ->first()
                    ?->tandaiSudahMemilih($pemilihan->id);
            });
        } catch (QueryException $e) {
            // Gagal karena sudah pernah memilih (unique constraint) -> beri tahu,
            // bukan error 500.
            if ($pemilih->sudahMemilih($pemilihan->id)) {
                return response()->json([
                    'pesan'         => 'Anda sudah memilih di pemilihan ini!',
                    'kode'          => 'sudah_memilih',
                    'sudah_memilih' => true,
                ], 409);
            }

            throw $e;
        }

        return response()->json([
            'berhasil' => true,
            'redirect' => '/user/terima-kasih',
        ]);
    }

    /**
     * Data untuk halaman "Terima Kasih".
     */
    public function setelahMemilih(): JsonResponse
    {
        $pemilih = $this->pemilih();

        $masihAda = $pemilih->pemilihanDiikuti()
            ->bolehDipilihSekarang()
            ->get()
            ->contains(fn ($p) => ! $pemilih->sudahMemilih($p->id));

        return response()->json([
            'masih_ada_pemilihan' => $masihAda,
            'countdown'           => (int) config('voting.logout_countdown'),
            'sudah_selesai'       => ! $masihAda,
            'nama'                => $pemilih->nama,
        ]);
    }

    private function pemilih(): \App\Models\Pemilih
    {
        return Auth::guard('pemilih')->user()
            ?? abort(401, 'Silakan login kembali.');
    }
}