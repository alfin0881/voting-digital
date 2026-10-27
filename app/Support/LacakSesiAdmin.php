<?php

namespace App\Support;

use App\Models\Admin;
use App\Models\SesiAdmin;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pelacak sesi admin (panitia) yang sedang login.
 *
 * Kenapa perlu tabel sendiri? Tabel `sessions` tidak bisa dipakai:
 *  - kolom `user_id` sengaja dibiarkan null untuk sesi admin (lihat
 *    SessionHandlerPemilih) supaya tidak tertukar dengan pemilih ber-id sama;
 *  - isi kolom `payload` terenkripsi, jadi tidak bisa dibaca lewat SQL.
 *
 * Semua pencatatan di sini bersifat best-effort: kalau migrasi belum dijalankan
 * atau SESSION_DRIVER bukan database, fitur diabaikan tanpa menggagalkan login.
 */
class LacakSesiAdmin
{
    /** Di-cache per-request supaya tidak memeriksa Schema berulang kali. */
    private static ?bool $siap = null;

    /** Sesi admin bisa dilacak? */
    public static function siap(): bool
    {
        if (self::$siap !== null) {
            return self::$siap;
        }

        return self::$siap = config('session.driver') === 'database'
            && Schema::hasTable('sesi_admin');
    }

    /** Bersihkan cache kesiapan (dipakai test saat mengganti driver sesi). */
    public static function lupaCache(): void
    {
        self::$siap = null;
    }

    /**
     * Catat/perbarui aktivitas admin pada sesi yang sedang berjalan.
     *
     * Dipanggil setelah request dipastikan sah (bukan setelah session idle).
     */
    public static function catat(Admin $admin, Request $request): void
    {
        if (! self::siap()) {
            return;
        }

        $sessionId = $request->session()->getId();
        $userAgent = (string) $request->userAgent();

        $baris = SesiAdmin::firstOrNew(['session_id' => $sessionId]);

        $baris->fill([
            'admin_id'      => $admin->id,
            'ip_address'    => $request->ip(),
            'perangkat'     => self::ringkasPerangkat($userAgent),
            'user_agent'    => $userAgent !== '' ? $userAgent : null,
            'last_activity' => now(),
        ]);

        // Waktu login hanya diisi saat baris baru dibuat; jangan di-refresh,
        // kalau tidak "sejak login" selalu ikut berubah.
        if (! $baris->exists) {
            $baris->masuk_at = now();
        }

        $baris->save();
    }

    /** Buang jejak sesi ini (dipanggil saat logout). */
    public static function hapus(string $sessionId): void
    {
        if (! self::siap()) {
            return;
        }

        SesiAdmin::where('session_id', $sessionId)->delete();
    }

    /**
     * Sesi admin yang dianggap masih aktif, terbaru dulu.
     *
     * Sesi basi dibersihkan di sini: baris yang sesinya sudah hilang dari
     * tabel `sessions`, atau yang tidak ada aktivitas lewat batas idle, tidak
     * pernah ditampilkan (dan langsung dihapus supaya tidak menumpuk).
     *
     * @param  string|null $selainSessionId sesi sendiri, dikecualikan dari daftar
     */
    public static function daftar(?string $selainSessionId = null): Collection
    {
        if (! self::siap()) {
            return collect();
        }

        self::bersihkan();

        return SesiAdmin::with('admin')
            ->when($selainSessionId, fn ($q) => $q->where('session_id', '!=', $selainSessionId))
            ->orderByDesc('last_activity')
            ->get();
    }

    /**
     * Akhiri paksa satu sesi admin.
     *
     * Menghapus baris di tabel `sessions` supaya request berikutnya dari
     * perangkat itu dianggap belum login (401 -> layar login).
     *
     * @param  string|null $selainSessionId sesi sendiri yang tidak boleh dihapus
     * @return bool true bila ada sesi yang benar-benar dihapus
     */
    public static function keluarkan(string $sessionId, ?string $selainSessionId = null): bool
    {
        if (! self::siap()) {
            return false;
        }

        $baris = SesiAdmin::where('session_id', $sessionId)->first();

        if (! $baris) {
            return false;
        }

        // Admin tidak boleh mengeluarkan sesi yang sedang dipakainya sendiri.
        if ($selainSessionId !== null && $sessionId === $selainSessionId) {
            return false;
        }

        $terhapus = DB::table(config('session.table', 'sessions'))
            ->where('id', $sessionId)
            ->delete();

        $baris->delete();

        return $terhapus > 0;
    }

    /** Akhiri semua sesi admin KECUALI sesi pemanggil. */
    public static function keluarkanSemua(string $selainSessionId): int
    {
        if (! self::siap()) {
            return 0;
        }

        $ids = SesiAdmin::where('session_id', '!=', $selainSessionId)->pluck('session_id');

        if ($ids->isEmpty()) {
            return 0;
        }

        $terhapus = DB::table(config('session.table', 'sessions'))
            ->whereIn('id', $ids)
            ->delete();

        SesiAdmin::where('session_id', '!=', $selainSessionId)->delete();

        return $terhapus;
    }

    /**
     * Daftar sesi milik SATU admin (termasuk sesi yang sedang dipakai).
     *
     * Dipakai halaman Keamanan Akun supaya setiap admin bisa melihat di
     * perangkat mana saja akunnya sedang login tanpa perlu izin 'sesi_admin'.
     *
     * @return Collection<int, SesiAdmin>
     */
    public static function daftarUntukAdmin(int $adminId, ?string $selainSessionId = null): Collection
    {
        if (! self::siap()) {
            return collect();
        }

        self::bersihkan();

        return SesiAdmin::with('admin')
            ->where('admin_id', $adminId)
            ->when($selainSessionId, fn ($q) => $q->where('session_id', '!=', $selainSessionId))
            ->orderByDesc('last_activity')
            ->get();
    }

    /**
     * Akhiri semua sesi milik satu admin.
     *
     * @param  string|null $kecualiSessionId sesi yang dipertahankan (mis. sesi sekarang)
     * @return int jumlah baris sesi yang benar-benar dihapus
     */
    public static function keluarkanSemuaUntukAdmin(int $adminId, ?string $kecualiSessionId = null): int
    {
        if (! self::siap()) {
            return 0;
        }

        $ids = SesiAdmin::where('admin_id', $adminId)
            ->when($kecualiSessionId, fn ($q) => $q->where('session_id', '!=', $kecualiSessionId))
            ->pluck('session_id');

        if ($ids->isEmpty()) {
            return 0;
        }

        $terhapus = DB::table(config('session.table', 'sessions'))
            ->whereIn('id', $ids)
            ->delete();

        SesiAdmin::whereIn('session_id', $ids)->delete();

        return $terhapus;
    }

    /** Cari satu baris sesi admin berdasarkan id sesinya. */
    public static function cari(string $sessionId): ?SesiAdmin
    {
        if (! self::siap()) {
            return null;
        }

        return SesiAdmin::with('admin')->where('session_id', $sessionId)->first();
    }

    /**
     * Sesi dianggap aktif sampai detik ini (idle + tenggang server).
     */
    public static function batasAktif(): int
    {
        return (int) config('voting.admin_idle_timeout')
            + (int) config('voting.idle_server_grace');
    }

    /** Batas waktu sebagai objek tanggal (dipakai saat membandingkan kolom). */
    private static function batasTanggal(): Carbon
    {
        return now()->subSeconds(self::batasAktif());
    }

    /**
     * Hapus baris yang sudah tidak berlaku.
     *
     * Syaratnya sengaja dibuat dua-duanya (baris sesi hilang DI DAN aktivitas
     * sudah lewat batas). Kalau hanya "baris sesi hilang", baris yang baru
     * dibuat pada request ini ikut terhapus, karena baris di tabel `sessions`
     * baru ditulis di akhir request.
     */
    private static function bersihkan(): void
    {
        $potong = self::batasTanggal();

        $basi = SesiAdmin::where('last_activity', '<', $potong)->pluck('session_id');

        // Sesi yang sudah hilang dari tabel sessions (browser ditutup & data
        // dibersihkan server) juga dibuang, asal sudah lama tidak aktif.
        $hilang = SesiAdmin::where('last_activity', '<', $potong)
            ->whereNotIn('session_id', function ($q) {
                $q->select('id')->from(config('session.table', 'sessions'));
            })
            ->pluck('session_id');

        $ids = $basi->merge($hilang)->unique();

        if ($ids->isNotEmpty()) {
            SesiAdmin::whereIn('session_id', $ids)->delete();
        }
    }

    /**
     * Ringkas user-agent jadi "Chrome di Windows" supaya mudah dibaca.
     * Peluang gagal sengaja diabaikan: tampilan saja, bukan logika.
     */
    public static function ringkasPerangkat(?string $ua): ?string
    {
        $ua = trim((string) $ua);

        if ($ua === '') {
            return null;
        }

        $browser = match (true) {
            str_contains($ua, 'Edg/')      => 'Edge',
            str_contains($ua, 'OPR/')      => 'Opera',
            str_contains($ua, 'Chrome/')   => 'Chrome',
            str_contains($ua, 'Firefox/')  => 'Firefox',
            str_contains($ua, 'Safari/')   => 'Safari',
            default                       => 'Browser lain',
        };

        $sistem = match (true) {
            str_contains($ua, 'Windows')   => 'Windows',
            str_contains($ua, 'Android')   => 'Android',
            str_contains($ua, 'iPhone'), str_contains($ua, 'iPad') => 'iOS',
            str_contains($ua, 'Mac OS X')  => 'macOS',
            str_contains($ua, 'Linux')     => 'Linux',
            default                       => null,
        };

        return $sistem ? "{$browser} di {$sistem}" : $browser;
    }
}