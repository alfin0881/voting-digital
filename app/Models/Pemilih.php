<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Siswa pemilih (tabel `pemilih`). Login pakai NIS + kode kartu; guard: `pemilih`.
 *
 * Penyimpanan kode kartu (dua kolom terpisah):
 *   - `password`   : HASH bcrypt dari kode (huruf kecil). Untuk login. Tidak bisa dibaca balik.
 *   - `kode_kartu` : kode asli, TERENKRIPSI (cast `encrypted`, kunci APP_KEY). Hanya dibaca
 *                    untuk cetak kartu / "lihat kode" oleh admin berizin `kode_kartu`,
 *                    dan setiap pembacaan dicatat di audit log.
 * Dump database / backup yang bocor tanpa APP_KEY tidak membuka akun siswa mana pun.
 *
 * Selalu isi lewat aturKode() supaya kedua kolom konsisten.
 *
 * Tidak ada kolom foto: pemilih cukup diidentifikasi lewat NIS + nama.
 */
class Pemilih extends Authenticatable
{
    protected $table = 'pemilih';

    protected $fillable = [
        'nis',
        'nama',
        'kelas',
        'password',
        'kode_kartu',
    ];

    protected $hidden = [
        'password',
        'kode_kartu',
    ];

    protected function casts(): array
    {
        return [
            'kode_kartu' => 'encrypted',
        ];
    }

    /**
     * Apa pun yang ditulis ke `password` otomatis di-hash (kecuali sudah berupa hash).
     * Kode dinormalisasi huruf kecil agar login tidak peka huruf besar/kecil,
     * sama seperti perilaku sebelumnya.
     */
    protected function password(): Attribute
    {
        return Attribute::make(
            set: fn ($nilai) => static::buatHash((string) $nilai),
        );
    }

    public static function normalisasiKode(string $kode): string
    {
        return Str::lower(trim($kode));
    }

    public static function buatHash(string $nilai): string
    {
        if (password_get_info($nilai)['algo'] !== null) {
            return $nilai; // sudah berupa hash
        }

        return Hash::make(static::normalisasiKode($nilai), [
            'rounds' => (int) config('voting.hash_rounds', 10),
        ]);
    }

    /** Set kode kartu: hash untuk login + salinan terenkripsi untuk cetak. */
    public function aturKode(string $kode): static
    {
        $kode = trim($kode);

        $this->password   = $kode;
        $this->kode_kartu = $kode;

        return $this;
    }

    /** Apakah kode yang diketik cocok dengan password tersimpan? */
    public function cocokKode(string $input): bool
    {
        $tersimpan = (string) $this->password;

        if (password_get_info($tersimpan)['algo'] === null) {
            // Sisa data lama (plain text) bila migrasi belum dijalankan: cocokkan lalu upgrade.
            if ($tersimpan === '' || ! hash_equals(static::normalisasiKode($tersimpan), static::normalisasiKode($input))) {
                return false;
            }

            $this->aturKode($tersimpan)->save();

            return true;
        }

        return Hash::check(static::normalisasiKode($input), $tersimpan);
    }

    /** Apakah kode kartu asli tersimpan (terenkripsi)? Tidak mendekripsi. */
    public function punyaKodeKartu(): bool
    {
        return $this->getRawOriginal('kode_kartu') !== null
            && $this->getRawOriginal('kode_kartu') !== '';
    }

    /** Kode kartu asli, atau null bila belum tersimpan / tidak bisa didekripsi (APP_KEY berubah). */
    public function kodeKartuAman(): ?string
    {
        if (! $this->punyaKodeKartu()) {
            return null;
        }

        try {
            return $this->kode_kartu;
        } catch (\Throwable) {
            return null;
        }
    }

    /** Pemilih tidak pernah "diingat" (komputer lab), dan tabelnya tidak punya remember_token. */
    public function getRememberTokenName(): string
    {
        return '';
    }

    // =========================================================================
    // RELASI
    // =========================================================================

    /**
     * Catatan partisipasi (pemilihan mana saja yang sudah dipilih).
     * Tidak berisi pilihan kandidat — suara bersifat anonim.
     */
    public function partisipasi(): HasMany
    {
        return $this->hasMany(Partisipasi::class, 'pemilih_id');
    }

    /** Record peserta_pemilihan: satu pemilih = satu baris. */
    public function pesertaPemilihan(): HasOne
    {
        return $this->hasOne(PesertaPemilihan::class, 'pemilih_id');
    }

    // =========================================================================
    // HELPER
    // =========================================================================

    /** Array ID pemilihan yang diikuti ([] bila belum terdaftar). */
    public function getPemilihanIds(): array
    {
        return $this->pesertaPemilihan?->pemilihan_ids ?? [];
    }

    public function terdaftarDiPemilihan(int $pemilihanId): bool
    {
        return in_array($pemilihanId, $this->getPemilihanIds());
    }

    /** Sumber kebenaran: tabel partisipasi. */
    public function sudahMemilih(int $pemilihanId): bool
    {
        return $this->partisipasi()
                    ->where('pemilihan_id', $pemilihanId)
                    ->exists();
    }

    /** Collection Pemilihan yang diikuti (accessor: $pemilih->pemilihan_diikuti). */
    public function getPemilihanDiikutiAttribute()
    {
        $ids = $this->getPemilihanIds();

        if (empty($ids)) {
            return collect();
        }

        return Pemilihan::whereIn('id', $ids)
                        ->orderBy('tanggal_mulai', 'desc')
                        ->get();
    }

    /** Query Builder Pemilihan yang diikuti (bisa di-chaining). */
    public function pemilihanDiikuti()
    {
        $ids = $this->getPemilihanIds();

        if (empty($ids)) {
            return Pemilihan::whereRaw('1=0');
        }

        return Pemilihan::whereIn('id', $ids)->orderBy('tanggal_mulai', 'desc');
    }
}
