<?php

namespace App\Models;

use Illuminate\Support\Facades\Cache;

/**
 * Pengaturan global (key-value) untuk fitur kendali hari-H.
 *
 * Nilai disimpan sebagai teks dan di-cast di sini. Dibaca lewat helper statis
 * agar bisa di-cache singkat (dipanggil di setiap halaman pemilih & pemuatan
 * halaman pemilihan).
 */
class Pengaturan extends \Illuminate\Database\Eloquent\Model
{
    protected $table = 'pengaturan';
    protected $primaryKey = 'kunci';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'kunci',
        'nilai',
        'diperbarui_oleh',
    ];

    // =========================================================================
    // KUNCI YANG DIKENAL
    // =========================================================================

    /** Teks pengumuman yang tampil sebagai banner di layar pemilih. */
    public const PENGUMUMAN = 'pengumuman';

    /** Tipe gaya pengumuman: info | peringatan | penting. */
    public const PENGUMUMAN_TIPE = 'pengumuman_tipe';

    /** Pengumuman aktif (ditampilkan) atau tidak. */
    public const PENGUMUMAN_AKTIF = 'pengumuman_aktif';

    /** Jeda darurat: bila "1", semua pemilihan menolak suara sementara. */
    public const JEDA = 'jeda_pemungutan';

    /** Catatan/alasan jeda, ditampilkan ke pemilih. */
    public const JEDA_ALASAN = 'jeda_alasan';

    // --- Kerahasiaan hasil sementara ---
    /**
     * Bila "1", perolehan suara pemilihan yang MASIH berlangsung disembunyikan
     * dari dashboard, halaman Hasil, layar besar, dan ekspor. Hasil pemilihan
     * yang sudah ditutup tetap bisa dilihat. Hanya Super Admin yang boleh
     * mengubah pengaturan ini.
     */
    public const SEMBUNYIKAN_HASIL_SEMENTARA = 'sembunyikan_hasil_sementara';

    // --- Identitas sekolah (biar aplikasi bisa dipakai banyak sekolah) ---
    /** Nama sekolah yang tampil di navbar, login, laporan, dan kartu pemilih. */
    public const NAMA_SEKOLAH = 'nama_sekolah';

    /** Nama aplikasi/brand. Tampil sebagai judul besar, mis. "E-Voting". */
    public const NAMA_APLIKASI = 'nama_aplikasi';

    // --- Backup terjadwal ---
    /** Aktifkan backup otomatis harian. */
    public const BACKUP_JADWAL_AKTIF = 'backup_jadwal_aktif';

    /** Jam berapa backup dijalankan (0-23), waktu server. */
    public const BACKUP_JAM = 'backup_jam';

    /** Berapa file backup terbaru yang disimpan. */
    public const BACKUP_RETENSI = 'backup_retensi';

    /** Waktu backup terjadwal terakhir (diisi otomatis oleh command). */
    public const BACKUP_TERAKHIR_JADWAL = 'backup_terakhir_jadwal';

    // =========================================================================
    // AKSES (dengan cache singkat)
    // =========================================================================

    /** Baca satu nilai pengaturan (string) atau default. */
    public static function baca(string $kunci, ?string $bawaan = null): ?string
    {
        $semua = static::cacheSemua();

        return $semua[$kunci] ?? $bawaan;
    }

    /** Baca sebagai boolean. */
    public static function benar(string $kunci): bool
    {
        return static::baca($kunci) === '1';
    }

    // =========================================================================
    // IDENTITAS SEKOLAH
    // =========================================================================

    /** Nama aplikasi sebagai cadangan, kalau belum diisi di pengaturan. */
    public const BAWAAN_NAMA_APLIKASI = 'E-Voting';

    /**
     * Nama sekolah aktif. Falls back ke config('laporan.sekolah') supaya instalasi
     * lama yang belum pernah menyimpan pengaturan tetap punya nama yang valid.
     */
    public static function namaSekolah(): string
    {
        $nilai = trim((string) static::baca(static::NAMA_SEKOLAH, ''));

        return $nilai !== '' ? $nilai : (string) config('laporan.sekolah');
    }

    /** Nama aplikasi/brand aktif, mis. "E-Voting". */
    public static function namaAplikasi(): string
    {
        $nilai = trim((string) static::baca(static::NAMA_APLIKASI, ''));

        return $nilai !== '' ? $nilai : static::BAWAAN_NAMA_APLIKASI;
    }

    /**
     * Judul gabungan yang dipakai sebagai judul besar di layar & tab browser:
     * "E-Voting - SMK Al-Sya'iriyah Limpung".
     */
    public static function judulAplikasi(): string
    {
        return static::namaAplikasi() . ' - ' . static::namaSekolah();
    }

    /** Tulis nilai pengaturan. */
    public static function tulis(string $kunci, ?string $nilai, ?int $adminId = null): void
    {
        static::updateOrCreate(
            ['kunci' => $kunci],
            ['nilai' => $nilai, 'diperbarui_oleh' => $adminId]
        );

        Cache::forget(static::CACHE_KEY);
    }

    /** $kunci => $nilai, di-cache beberapa detik agar banner pemilih tetap ringan. */
    private const CACHE_KEY = 'pengaturan_semua';

    private static function cacheSemua(): array
    {
        return Cache::remember(static::CACHE_KEY, now()->addSeconds(5), function () {
            return static::query()->pluck('nilai', 'kunci')->all();
        });
    }
}
