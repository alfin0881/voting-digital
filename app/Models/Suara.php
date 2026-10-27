<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Model Suara (ANONIM)
 *
 * Satu baris = satu suara untuk satu kandidat di satu pemilihan.
 * Sengaja TIDAK menyimpan siapa pemilihnya, waktu, maupun IP, dan memakai
 * UUID acak (bukan auto-increment) agar urutan baris tidak bisa dicocokkan
 * dengan urutan orang memilih di tabel `partisipasi`.
 *
 * @property string $id            UUID acak
 * @property int    $pemilihan_id
 * @property int    $kandidat_id
 */
class Suara extends Model
{
    protected $table = 'suara';

    public $incrementing = false;
    protected $keyType   = 'string';
    public $timestamps   = false;

    protected $fillable = [
        'pemilihan_id',
        'kandidat_id',
    ];

    protected static function booted(): void
    {
        // UUID v4 (acak). Jangan pakai HasUuids: di Laravel 12 hasilnya
        // berurutan waktu sehingga urutan suara bisa ditebak.
        static::creating(function (Suara $suara) {
            if (! $suara->getKey()) {
                $suara->{$suara->getKeyName()} = (string) Str::uuid();
            }
        });
    }

    public function pemilihan(): BelongsTo
    {
        return $this->belongsTo(Pemilihan::class);
    }

    public function kandidat(): BelongsTo
    {
        return $this->belongsTo(Kandidat::class);
    }

    public function scopeUntukPemilihan($query, int $pemilihanId)
    {
        return $query->where('pemilihan_id', $pemilihanId);
    }

    public function scopeUntukKandidat($query, int $kandidatId)
    {
        return $query->where('kandidat_id', $kandidatId);
    }
}
