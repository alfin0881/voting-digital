<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Model PesertaPemilihan — SKEMA BARU
 *
 * Satu baris per pemilih. Kolom pemilihan_ids menyimpan JSON array ID pemilihan
 * yang diikuti. Kolom status_voting menyimpan JSON object status per pemilihan.
 *
 * Contoh data satu baris:
 *   pemilih_id    : 3
 *   pemilihan_ids : [1, 2, 4]
 *   status_voting : {
 *     "1": { "sudah_memilih": false, "status_hadir": "belum_hadir", "waktu_memilih": null },
 *     "2": { "sudah_memilih": true,  "status_hadir": "hadir",       "waktu_memilih": "2025-10-03 09:15:00" },
 *     "4": { "sudah_memilih": false, "status_hadir": "tidak_hadir", "waktu_memilih": null, "keterangan": "sakit" }
 *   }
 *
 * @property int   $id
 * @property int   $pemilih_id
 * @property array $pemilihan_ids   JSON array, auto-cast
 * @property array $status_voting   JSON object, auto-cast
 */
class PesertaPemilihan extends Model
{
    protected $table = 'peserta_pemilihan';

    protected $fillable = [
        'pemilih_id',
        'pemilihan_ids',
        'status_voting',
    ];

    protected $casts = [
        'pemilihan_ids' => 'array',
        'status_voting' => 'array',
    ];

    // =========================================================================
    // KONSTANTA STATUS
    // =========================================================================

    const STATUS_BELUM_HADIR = 'belum_hadir';
    const STATUS_HADIR       = 'hadir';
    const STATUS_TIDAK_HADIR = 'tidak_hadir';

    // =========================================================================
    // RELASI
    // =========================================================================

    /** Pemilih pemilik record ini */
    public function pemilih(): BelongsTo
    {
        return $this->belongsTo(Pemilih::class, 'pemilih_id');
    }

    // =========================================================================
    // HELPER: CEK PENDAFTARAN
    // =========================================================================

    /** Cek apakah user terdaftar di pemilihan tertentu */
    public function ikutPemilihan(int $pemilihanId): bool
    {
        return in_array($pemilihanId, $this->pemilihan_ids ?? []);
    }

    // =========================================================================
    // HELPER: STATUS VOTING PER PEMILIHAN
    // =========================================================================

    /**
     * Ambil status voting untuk pemilihan tertentu.
     * Return array ['sudah_memilih', 'status_hadir', 'waktu_memilih']
     * atau default jika belum ada.
     */
    public function getStatusPemilihan(int $pemilihanId): array
    {
        $status = $this->status_voting[(string) $pemilihanId] ?? null;

        return $status ?? [
            'sudah_memilih' => false,
            'status_hadir'  => self::STATUS_BELUM_HADIR,
            'waktu_memilih' => null,
        ];
    }

    /** Cek apakah user sudah memilih di pemilihan tertentu */
    public function sudahMemilihDi(int $pemilihanId): bool
    {
        return (bool) ($this->status_voting[(string) $pemilihanId]['sudah_memilih'] ?? false);
    }

    // =========================================================================
    // HELPER: UPDATE STATUS VOTING
    // =========================================================================

    /**
     * Tandai sudah memilih untuk pemilihan tertentu.
     * Dipanggil setelah suara berhasil disimpan di tabel suara.
     */
    public function tandaiSudahMemilih(int $pemilihanId): void
    {
        $voting = $this->status_voting ?? [];

        $voting[(string) $pemilihanId] = [
            'sudah_memilih' => true,
            'status_hadir'  => self::STATUS_HADIR,
            'waktu_memilih' => now()->toDateTimeString(),
        ];

        $this->update(['status_voting' => $voting]);
    }

    /**
     * Tandai tidak hadir untuk pemilihan tertentu (oleh admin).
     *
     * Catatan: tabel tidak punya kolom `keterangan` tersendiri, jadi alasannya
     * disimpan di dalam `status_voting` per pemilihan.
     */
    public function tandaiTidakHadir(int $pemilihanId, ?string $keterangan = null): void
    {
        $voting = $this->status_voting ?? [];

        // Hanya ubah jika belum memilih
        if (! ($voting[(string) $pemilihanId]['sudah_memilih'] ?? false)) {
            $voting[(string) $pemilihanId] = array_merge(
                $voting[(string) $pemilihanId] ?? [],
                [
                    'sudah_memilih' => false,
                    'status_hadir'  => self::STATUS_TIDAK_HADIR,
                    'waktu_memilih' => null,
                    'keterangan'    => $keterangan,
                ]
            );

            $this->update(['status_voting' => $voting]);
        }
    }

    // =========================================================================
    // HELPER: KELOLA DAFTAR PEMILIHAN
    // =========================================================================

    /**
     * Daftarkan user ke pemilihan baru (tambah ke array).
     * Tidak melakukan apa-apa jika sudah terdaftar.
     */
    public function tambahPemilihan(int $pemilihanId): void
    {
        $ids    = $this->pemilihan_ids ?? [];
        $voting = $this->status_voting ?? [];

        if (! in_array($pemilihanId, $ids)) {
            $ids[] = $pemilihanId;

            // Inisialisasi status default untuk pemilihan baru
            $voting[(string) $pemilihanId] = [
                'sudah_memilih' => false,
                'status_hadir'  => self::STATUS_BELUM_HADIR,
                'waktu_memilih' => null,
            ];

            $this->update([
                'pemilihan_ids' => $ids,
                'status_voting' => $voting,
            ]);
        }
    }

    /**
     * Hapus pendaftaran user dari pemilihan tertentu.
     * Hanya bisa dihapus jika user belum memilih di pemilihan tersebut.
     * Return true jika berhasil, false jika gagal (sudah memilih).
     */
    public function hapusPemilihan(int $pemilihanId): bool
    {
        // Tolak jika sudah memilih
        if ($this->sudahMemilihDi($pemilihanId)) {
            return false;
        }

        $ids    = array_values(array_filter($this->pemilihan_ids ?? [], fn ($id) => $id !== $pemilihanId));
        $voting = $this->status_voting ?? [];
        unset($voting[(string) $pemilihanId]);

        $this->update([
            'pemilihan_ids' => $ids,
            'status_voting' => $voting,
        ]);

        return true;
    }

    // =========================================================================
    // STATIC: FIND OR CREATE PER USER
    // =========================================================================

    /**
     * Ambil record peserta untuk user tertentu, atau buat baru jika belum ada.
     */
    public static function ambilAtauBuat(int $pemilihId): self
    {
        return self::firstOrCreate(
            ['pemilih_id' => $pemilihId],
            ['pemilihan_ids' => [], 'status_voting' => []]
        );
    }

    // =========================================================================
    // QUERY SCOPES
    // =========================================================================

    /**
     * Filter hanya peserta yang terdaftar di pemilihan tertentu.
     * Menggunakan JSON_CONTAINS (MySQL) atau json_contains (PostgreSQL).
     */
    public function scopeIkutPemilihan($query, int $pemilihanId)
    {
        return $query->whereJsonContains('pemilihan_ids', $pemilihanId);
    }

    /**
     * Hitung peserta yang sudah memilih di pemilihan tertentu.
     * Digunakan untuk monitor anti-golput.
     * Catatan: query JSON agak berat — untuk skala besar pertimbangkan caching.
     */
    public function scopeSudahMemilihDi($query, int $pemilihanId)
    {
        return $query->whereJsonContains('pemilihan_ids', $pemilihanId)
                     ->where("status_voting->{$pemilihanId}->sudah_memilih", true);
    }

    // =========================================================================
    // LABEL & BADGE (untuk UI)
    // =========================================================================

    public function getLabelStatus(int $pemilihanId): string
    {
        $status = $this->getStatusPemilihan($pemilihanId)['status_hadir'];

        return match ($status) {
            self::STATUS_HADIR       => 'Sudah Memilih',
            self::STATUS_TIDAK_HADIR => 'Tidak Hadir',
            default                  => 'Belum Memilih',
        };
    }

    public function getWarnaBadge(int $pemilihanId): string
    {
        $status = $this->getStatusPemilihan($pemilihanId)['status_hadir'];

        return match ($status) {
            self::STATUS_HADIR       => 'green',
            self::STATUS_TIDAK_HADIR => 'red',
            default                  => 'yellow',
        };
    }
}