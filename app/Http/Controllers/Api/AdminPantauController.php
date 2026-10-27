<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\Partisipasi;
use App\Models\Pemilihan;
use App\Models\PesertaPemilihan;
use App\Models\Pemilih;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Monitor partisipasi.
 *
 * SENGAJA tidak menampilkan pilihan kandidat siapa pun (suara rahasia).
 */
class AdminPantauController extends Controller
{
    use AdminApi;

    public function index(Request $request): JsonResponse
    {
        $this->butuhIzin('pantau');

        $daftarPemilihan = Pemilihan::orderByDesc('tanggal_mulai')->get(['id', 'nama_pemilihan', 'status']);

        // Default: pemilihan aktif terbaru, atau terbaru bila tidak ada yang aktif.
        $default = $daftarPemilihan->firstWhere('status', 'aktif') ?? $daftarPemilihan->first();

        $pemilihanId = $request->integer('pemilihan') ?: $default?->id;
        $pemilihan   = $daftarPemilihan->firstWhere('id', $pemilihanId);

        $kosong = [
            'ringkasan' => ['total' => 0, 'sudah' => 0, 'belum' => 0, 'persen' => 0],
            'per_kelas' => [],
            'laju'      => ['per_menit' => 0, 'per_5menit' => 0, 'per_jam' => 0, 'terakhir' => null],
            'tren'      => ['label' => [], 'data' => []],
        ];

        if (! $pemilihan) {
            return response()->json($kosong + [
                'daftar_pemilihan' => $daftarPemilihan->map(fn ($p) => [
                    'id' => $p->id, 'nama' => $p->nama_pemilihan, 'status' => $p->status,
                ]),
                'pemilihan' => null,
            ]);
        }

        $idPeserta = PesertaPemilihan::whereJsonContains('pemilihan_ids', (int) $pemilihan->id)
            ->pluck('pemilih_id');

        $peserta = Pemilih::whereIn('id', $idPeserta)
            ->get(['id', 'kelas'])
            ->each(fn ($u) => $u->kelas = $u->kelas ?: 'Tanpa Kelas');

        $sudahIds = Partisipasi::where('pemilihan_id', $pemilihan->id)->pluck('pemilih_id')->flip();

        $sudah = $peserta->filter(fn ($u) => $sudahIds->has($u->id))->count();
        $total = $peserta->count();

        $perKelas = $peserta->groupBy('kelas')->sortKeys()->map(function ($grup) use ($sudahIds) {
            $s = $grup->filter(fn ($u) => $sudahIds->has($u->id))->count();
            $t = $grup->count();

            return [
                'kelas'  => $grup->first()->kelas,
                'total'  => $t,
                'sudah'  => $s,
                'belum'  => $t - $s,
                'persen' => $t > 0 ? round($s / $t * 100) : 0,
            ];
        })->values();

        return response()->json([
            'daftar_pemilihan' => $daftarPemilihan->map(fn ($p) => [
                'id' => $p->id, 'nama' => $p->nama_pemilihan, 'status' => $p->status,
            ]),
            'pemilihan'     => ['id' => $pemilihan->id, 'nama' => $pemilihan->nama_pemilihan, 'status' => $pemilihan->status],
            'ringkasan'     => [
                'total'  => $total,
                'sudah'  => $sudah,
                'belum'  => $total - $sudah,
                'persen' => $total > 0 ? round($sudah / $total * 100, 1) : 0,
            ],
            'per_kelas'     => $perKelas,
            'laju'          => $this->hitungLaju((int) $pemilihan->id),
            'tren'          => $this->trenPerJam((int) $pemilihan->id),
        ]);
    }

    /** Laju suara masuk: 1 / 5 / 60 menit terakhir + waktu suara terakhir. */
    private function hitungLaju(int $pemilihanId): array
    {
        $hitungSejak = fn ($menit) => Partisipasi::where('pemilihan_id', $pemilihanId)
            ->where('waktu_memilih', '>=', now()->copy()->subMinutes($menit))
            ->count();

        $terakhir = Partisipasi::where('pemilihan_id', $pemilihanId)->max('waktu_memilih');

        return [
            'per_menit'  => $hitungSejak(1),
            'per_5menit' => $hitungSejak(5),
            'per_jam'    => $hitungSejak(60),
            'terakhir'   => $terakhir
                ? \Illuminate\Support\Carbon::parse($terakhir)->timezone('Asia/Jakarta')->toIso8601String()
                : null,
        ];
    }

    /** Tren partisipasi per jam (11 jam lalu s/d sekarang), label WIB. */
    private function trenPerJam(int $pemilihanId): array
    {
        $mulai = now()->subHours(11)->startOfHour();

        $waktu = Partisipasi::where('pemilihan_id', $pemilihanId)
            ->where('waktu_memilih', '>=', $mulai)
            ->pluck('waktu_memilih')
            ->map(fn ($w) => $w->timezone('Asia/Jakarta')->format('Y-m-d H'))
            ->countBy();

        $label = [];
        $data  = [];

        for ($i = 0; $i < 12; $i++) {
            $jam     = $mulai->copy()->addHours($i)->timezone('Asia/Jakarta');
            $label[] = $jam->format('H') . ':00';
            $data[]  = (int) ($waktu[$jam->format('Y-m-d H')] ?? 0);
        }

        return ['label' => $label, 'data' => $data];
    }
}