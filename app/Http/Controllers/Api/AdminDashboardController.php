<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Models\CatatanAktivitas;
use App\Models\Kandidat;
use App\Models\Partisipasi;
use App\Models\Pemilih;
use App\Models\Pemilihan;
use App\Models\Pengaturan;
use App\Models\PesertaPemilihan;
use App\Models\Suara;
use App\Services\DatabaseBackup;
use App\Services\PenjagaHasil;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Dashboard admin.
 *
 * Semua perhitungan dipindahkan ke sini supaya React cukup merender angka,
 * bukan menghitung ulang logika bisnis di browser.
 *
 * Tiga blok tambahan untuk dasbor:
 * - `live`      : berapa pemilih yang sedang di bilik, dan apakah ada NIS
 *                 yang login di lebih dari satu komputer (indikator risiko).
 * - `kesehatan` : kapan backup terakhir, apakah jadwal backup hidup.
 * - `aktivitas`  : jejak 8 aksi admin terakhir (linimasa di dashboard).
 *
 * Keduanya DIBATASI sesuai izin peran, jadi peran 'pengawas' (yang hanya
 * punya dashboard/hasil/pantau) tetap tidak menerima data sesi maupun backup.
 */
class AdminDashboardController extends Controller
{
    use AdminApi;

    public function index(Request $request, PenjagaHasil $penjaga): JsonResponse
    {
        $admin = $this->butuhIzin('dashboard');

        $totalUser    = Pemilih::count();
        $totalSuara   = Suara::count();
        $siswaSudah   = Pemilih::whereHas('partisipasi')->count();
        $pemilihanAktif = Pemilihan::where('status', 'aktif')->orderByDesc('tanggal_mulai')->get();
        $idAktif         = $pemilihanAktif->pluck('id')->map(fn ($i) => (int) $i)->all();

        // Angka yang dipakai DUA blok (kartu progres & leaderboard) dihitung
        // SEKALI di sini.
        //
        // Sebelumnya `Suara::where('pemilihan_id', ...)->count()` dipanggil dua
        // kali untuk pemilihan yang sama: sekali di ringkasanAktif, sekali lagi
        // di hitungLeaderboard. Itu membuat query suara terduplikasi menjadi 2x
        // jumlah pemilihan aktif. Sekarang cukup satu query GROUP BY.
        $jumlahSuara      = $this->hitungSuaraPerPemilihan($idAktif);
        $sudahMemilih     = $this->hitungPartisipasiPerPemilihan($idAktif);
        $kandidatTergrup  = $this->ambilKandidatTergrup($idAktif);

        // Ringkasan tiap pemilihan aktif untuk kartu progres.
        //
        // CATATAN KINERJA: totalPeserta() memindai kolom JSON, jadi harus
        // dipanggil SEKALI per pemilihan lalu hasilnya dipakai berkali-kali.
        // Sebelumnya dipanggil dua kali (dan totalSudahMemilih dua kali)
        // hanya untuk nilai yang sama, jadi tiap poll mengulang pekerjaan
        // boros dua kali lipat.
        $ringkasanAktif = $pemilihanAktif->map(function (Pemilihan $p) use ($jumlahSuara, $sudahMemilih) {
            $peserta = $p->totalPeserta();
            $sudah   = $sudahMemilih[(int) $p->id] ?? 0;

            return [
                'id'      => $p->id,
                'nama'    => $p->nama_pemilihan,
                'selesai' => $p->tanggal_selesai?->format('Y-m-d'),
                'jam_selesai' => substr($p->jamSelesaiEfektif(), 0, 5),
                'suara'   => $jumlahSuara[(int) $p->id] ?? 0,
                'peserta' => $peserta,
                'sudah'   => $sudah,
                'persen'  => $peserta > 0
                    ? round($sudah / $peserta * 100, 1)
                    : 0,
            ];
        })->values();

        // Hitung mundur ke penutupan terdekat.
        $terdekat = $pemilihanAktif
            ->filter(fn (Pemilihan $p) => $p->waktuSelesai()->isFuture())
            ->sortBy(fn (Pemilihan $p) => $p->waktuSelesai()->getTimestamp())
            ->first();

        // Pemilihan untuk dropdown panel per-kelas.
        $daftarPemilihan = Pemilihan::orderByDesc('tanggal_mulai')->orderByDesc('id')
            ->get(['id', 'nama_pemilihan', 'status'])
            ->map(fn ($p) => ['id' => $p->id, 'nama' => $p->nama_pemilihan, 'status' => $p->status]);

        $idKelas = $request->integer('pemilihan') ?: ($pemilihanAktif->first()?->id);
        $perKelas = $this->hitungPerKelas($idKelas);

        // Perolehan suara pemilihan yang masih berlangsung tidak boleh ikut
        // terkirim selama mode kerahasiaan hasil aktif. Penyaringan dilakukan
        // di backend, bukan hanya disembunyikan di tampilan.
        $terkunci = $penjaga->terkunciDari($pemilihanAktif);
        $leaderboard = $this->hitungLeaderboard(
            $pemilihanAktif->reject(fn (Pemilihan $p) => $penjaga->terkunci($p))->values(),
            $jumlahSuara,
            $kandidatTergrup
        );

        return response()->json([
            'statistik' => [
                'total_pemilihan'   => Pemilihan::count(),
                'total_pemilih'     => $totalUser,
                'total_suara'       => $totalSuara,
                'total_kandidat'    => Kandidat::count(),
                'total_partisipasi' => Partisipasi::count(),
                'siswa_sudah'       => $siswaSudah,
                'persen_partisipasi'=> $totalUser > 0 ? round($siswaSudah / $totalUser * 100, 1) : 0,
                // whereBetween, bukan whereDate: whereDate membungkus kolom
                // dengan fungsi DATE() sehingga index waktu_memilih tidak
                // bisa dipakai dan MySQL dipaksa membaca seluruh tabel.
                'suara_hari_ini'    => Partisipasi::whereBetween(
                    'waktu_memilih',
                    [today()->startOfDay(), today()->endOfDay()]
                )->count(),
                'suara_5menit'      => Partisipasi::where('waktu_memilih', '>=', now()->subMinutes(5))->count(),
            ],
            'status' => [
                'dijeda' => Pemilihan::sedangDijeda(),
            ],
            'ringkasan_aktif' => $ringkasanAktif,
            'penutupan' => [
                'detik' => $terdekat
                    ? max(0, now()->diffInSeconds($terdekat->waktuSelesai(), false))
                    : null,
                'nama'  => $terdekat?->nama_pemilihan,
            ],
            'tren_jam'  => $this->hitungTrenJam(),
            'per_kelas' => $perKelas,
            'total_kelas' => count($perKelas),
            'panggilan_kelas' => collect($perKelas)
                ->filter(fn ($k) => $k['sudah'] < $k['total'])
                ->sortByDesc(fn ($k) => $k['total'] - $k['sudah'])
                ->take(8)
                ->map(fn ($k) => $k + ['belum' => $k['total'] - $k['sudah']])
                ->values(),
            'leaderboard' => $leaderboard,
            'hasil_sementara' => $penjaga->ringkasan($terkunci),
            'keterlibatan' => $this->hitungKeterlibatan(),
            'daftar_pemilihan' => $daftarPemilihan,
            'live'        => $this->hitungLive($admin),
            'kesehatan'   => $this->hitungKesehatan($admin),
            'aktivitas'   => $this->hitungAktivitasTerbaru($admin),
            'diperbarui' => now()->timezone('Asia/Jakarta')->toIso8601String(),
        ]);
    }

    /**
     * Keadaan "live" saat pemungutan berlangsung.
     *
     * - `aktif`  : berapa pemilih yang masih di dalam batas idle.
     * - `ganda`  : NIS yang punya lebih dari satu sesi (login di 2 komputer).
     *              Ini indikator risiko serius — satu suara bisa terhitung dua kali.
     *
     * Hanya dihitung bila peran punya izin 'sesi' DAN session driver-nya
     * database; kalau tidak, `tersedia` = false supaya frontend tidak
     * menampilkan angka nol yang menyesatkan.
     */
    private function hitungLive(Admin $admin): array
    {
        if (config('session.driver') !== 'database' || ! $admin->bolehAkses('sesi')) {
            return ['tersedia' => false, 'aktif' => null, 'ganda' => []];
        }

        $t     = config('session.table', 'sessions');
        $batas = now()->timestamp
            - (int) config('voting.idle_timeout')
            - (int) config('voting.idle_server_grace');

        $sesi = DB::table($t)
            ->join('pemilih', 'pemilih.id', '=', "{$t}.user_id")
            ->where("{$t}.id", '!=', session()->getId())
            ->where("{$t}.last_activity", '>=', $batas)
            ->get(['pemilih.id as pemilih_id', 'pemilih.nama', 'pemilih.nis', 'pemilih.kelas']);

        $ganda = $sesi
            ->groupBy('pemilih_id')
            ->filter(fn ($grup) => $grup->count() > 1)
            ->map(fn ($grup) => [
                'nama'   => $grup->first()->nama,
                'nis'    => $grup->first()->nis,
                'kelas'  => $grup->first()->kelas,
                'jumlah' => $grup->count(),
            ])
            ->values()
            ->all();

        return [
            'tersedia' => true,
            'aktif'    => $sesi->count(),
            'ganda'    => $ganda,
        ];
    }

    /**
     * Indikator kesehatan sistem: backup terakhir & apakah jadwalnya hidup.
     *
     * Dibatasi izin 'backup' karena menyimpan lokasi/ukuran database termasuk
     * informasi internal. Query-nya sengaja dibuat ringan (satu baris terbaru
     * + nilai Pengaturan yang sudah di-cache) supaya aman dipanggil tiap 20 detik.
     */
    private function hitungKesehatan(Admin $admin): array
    {
        if (! $admin->bolehAkses('backup')) {
            return ['tersedia' => false];
        }

        $terakhir = CatatanAktivitas::where('aksi', 'backup.unduh')->latest('id')->first();

        // Ukuran database: filesize untuk SQLite, information_schema untuk MySQL.
        // Dibungkus try karena informasi_schema bisa tidak tersedia di hosting
        // sekarang dengan hak akses terbatas — dashboard tidak boleh gagal karena ini.
        //
        // NILAI INI DI-CACHE. Query information_schema membaca metadata seluruh
        // tabel dan jadi query TERLAMBAT di halaman ini (~8 ms), padahal
        // dashboard di-poll tiap 20 detik padahal ukuran database tidak berubah
        // sedetik-detik. Cukup 5 menit.
        $ukuran = Cache::remember('dashboard.ukuran_db', now()->addMinutes(5), function () {
            try {
                return app(DatabaseBackup::class)->ukuranByte();
            } catch (\Throwable) {
                return null;
            }
        });

        return [
            'tersedia'              => true,
            'backup_terakhir'       => $terakhir?->created_at?->timezone('Asia/Jakarta')->toIso8601String(),
            'backup_terakhir_jadwal'=> Pengaturan::baca(Pengaturan::BACKUP_TERAKHIR_JADWAL) ?: null,
            'jadwal_aktif'          => Pengaturan::benar(Pengaturan::BACKUP_JADWAL_AKTIF),
            'jadwal_jam'            => (int) Pengaturan::baca(Pengaturan::BACKUP_JAM, '23'),
            'ukuran_byte'           => $ukuran,
        ];
    }

    /**
     * Jejak aktivitas admin terbaru (8 terakhir).
     *
     * Dipakai untuk linimasa di dashboard supaya panitia bisa langsung tahu
     * "tadi siapa yang mengubah apa" tanpa harus membuka halaman Catatan
     * Aktivitas. Label & warna diambil dari model, jadi tidak ada daftar
     * action yang terduplikasi di frontend.
     *
     * Dibatasi izin 'audit' — aktivitas admin tidak untuk dilihat semua peran.
     */
    private function hitungAktivitasTerbaru(Admin $admin): array
    {
        if (! $admin->bolehAkses('audit')) {
            return ['tersedia' => false, 'items' => []];
        }

        return [
            'tersedia' => true,
            'items' => CatatanAktivitas::latest('id')->limit(8)->get()
                ->map(fn (CatatanAktivitas $c) => [
                    'id'        => $c->id,
                    'label'     => $c->label(),
                    'warna'     => $c->warna(),
                    'nama'      => $c->nama_admin ?: 'Sistem',
                    'deskripsi' => $c->deskripsi,
                    'waktu'     => $c->created_at?->timezone('Asia/Jakarta')->toIso8601String(),
                ])
                ->all(),
        ];
    }

    /** Partisipasi per kelas untuk satu pemilihan, diurutkan dari terendah. */
    private function hitungPerKelas(?int $pemilihanId): array
    {
        if (! $pemilihanId) {
            return [];
        }

        $idPeserta = PesertaPemilihan::whereJsonContains('pemilihan_ids', $pemilihanId)->pluck('pemilih_id');
        $sudahIds  = Partisipasi::where('pemilihan_id', $pemilihanId)->pluck('pemilih_id')->flip();

        return Pemilih::whereIn('id', $idPeserta)
            ->get(['id', 'kelas'])
            ->groupBy(fn ($u) => $u->kelas ?: 'Tanpa Kelas')
            ->map(function ($grup) use ($sudahIds) {
                $total = $grup->count();
                $sudah = $grup->filter(fn ($u) => $sudahIds->has($u->id))->count();

                return [
                    'kelas'  => $grup->first()->kelas ?: 'Tanpa Kelas',
                    'total'  => $total,
                    'sudah'  => $sudah,
                    'belum'  => $total - $sudah,
                    'persen' => $total > 0 ? round($sudah / $total * 100) : 0,
                ];
            })
            ->sortBy('persen')
            ->values()->all();
    }

    /**
     * Jumlah suara per pemilihan, satu query GROUP BY untuk semua pemilihan.
     *
     * @return array<int,int>
     */
    private function hitungSuaraPerPemilihan(array $ids): array
    {
        return $this->hitungPerPemilihan(Suara::query(), $ids);
    }

    /** Jumlah partisipasi per pemilihan, satu query GROUP BY. @return array<int,int> */
    private function hitungPartisipasiPerPemilihan(array $ids): array
    {
        return $this->hitungPerPemilihan(Partisipasi::query(), $ids);
    }

    /**
     * inti dari hitungSuaraPerPemilihan / hitungPartisipasiPerPemilihan.
     *
     * Election yang belum ada suaranya tetap harus muncul dengan angka 0,
     * jadi semua id diisi 0 dulu lalu ditimpa hasil query.
     *
     * @return array<int,int>
     */
    private function hitungPerPemilihan($query, array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $hasil = array_fill_keys($ids, 0);

        $rows = $query->selectRaw('pemilihan_id, COUNT(*) as jumlah')
            ->whereIn('pemilihan_id', $ids)
            ->groupBy('pemilihan_id')
            ->pluck('jumlah', 'pemilihan_id');

        foreach ($rows as $k => $v) {
            $hasil[(int) $k] = (int) $v;
        }

        return $hasil;
    }

    /**
     * Semua kandidat dari beberapa pemilihan dalam SATU query, dikelompokkan
     * per pemilihan.
     *
     * Sebelumnya tiap pemilihan diambil terpisah (satu query per pemilihan).
     * Karena pengurutannya global (suara DESC, nomor_urut ASC), urutan relatif
     * di dalam tiap kelompok tetap sama seperti bila tiap pemilihan diambil
     * sendiri-sendiri.
     *
     * @return \Illuminate\Support\Collection<int,\Illuminate\Support\Collection>
     */
    private function ambilKandidatTergrup(array $ids)
    {
        if ($ids === []) {
            return collect();
        }

        return Kandidat::whereIn('pemilihan_id', $ids)
            ->withCount('suara')
            ->orderByDesc('suara_count')
            ->orderBy('nomor_urut')
            ->get()
            ->groupBy(fn ($k) => (int) $k->pemilihan_id);
    }

    /**
     * Leaderboard sementara per pemilihan aktif.
     *
     * $jumlahSuara & $kandidatTergrup sudah dihitung sekali di index() karena
     * nilainya dipakai juga oleh kartu progres.
     */
    private function hitungLeaderboard($pemilihanAktif, array $jumlahSuara, $kandidatTergrup): array
    {
        return $pemilihanAktif->map(function (Pemilihan $p) use ($jumlahSuara, $kandidatTergrup) {
            $total = $jumlahSuara[(int) $p->id] ?? 0;

            $kandidat = $kandidatTergrup->get((int) $p->id, collect())
                ->map(fn (Kandidat $k) => [
                    'id'     => $k->id,
                    'nama'   => $k->nama_kandidat,
                    'nomor'  => $k->nomor_urut,
                    'suara'  => (int) $k->suara_count,
                    'persen' => $total > 0 ? round($k->suara_count / $total * 100, 1) : 0,
                ])->values();

            // Seri di puncak?
            $seri = false;
            if ($kandidat->count() >= 2) {
                $tertinggi = $kandidat[0]['suara'];
                $seri = $tertinggi > 0 && $kandidat->filter(fn ($k) => $k['suara'] === $tertinggi)->count() >= 2;
            }

            return [
                'id'       => $p->id,
                'nama'     => $p->nama_pemilihan,
                'total'    => $total,
                'kandidat' => $kandidat,
                'seri'     => $seri,
            ];
        })->values()->all();
    }

    /** Tren jumlah suara masuk per jam, 12 jam terakhir (WIB). */
    private function hitungTrenJam(): array
    {
        $mulai = now()->subHours(11)->startOfHour();

        $waktu = Partisipasi::where('waktu_memilih', '>=', $mulai)
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

    /** Keterlibatan admin: jumlah aksi 7 hari terakhir per admin. */
    private function hitungKeterlibatan(): array
    {
        return CatatanAktivitas::where('created_at', '>=', now()->subDays(7))
            ->get(['nama_admin', 'created_at'])
            ->groupBy(fn ($c) => $c->nama_admin ?: 'Sistem')
            ->map(fn ($grup, $nama) => [
                'nama'     => $nama,
                'aksi'     => $grup->count(),
                'hari_ini' => $grup->filter(fn ($c) => $c->created_at->isToday())->count(),
            ])
            ->sortByDesc('aksi')
            ->take(6)
            ->values()->all();
    }
}