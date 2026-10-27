<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Partisipasi = catatan bahwa seorang pemilih SUDAH memilih di suatu pemilihan.
 *
 * Sengaja TIDAK menyimpan kandidat yang dipilih. Isi suara ada di tabel `suara`
 * yang tidak memiliki hubungan ke pemilih, sehingga suara bersifat rahasia.
 */
class Partisipasi extends Model
{
    protected $table = 'partisipasi';

    protected $fillable = [
        'pemilih_id',
        'pemilihan_id',
        'waktu_memilih',
    ];

    protected $casts = [
        'waktu_memilih' => 'datetime',
    ];

    public function pemilih(): BelongsTo
    {
        return $this->belongsTo(Pemilih::class, 'pemilih_id');
    }

    public function pemilihan(): BelongsTo
    {
        return $this->belongsTo(Pemilihan::class);
    }
}
