<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Kandidat extends Model
{
    protected $table = 'kandidat';

    protected $fillable = [
        'pemilihan_id',
        'nama_kandidat',
        'nomor_urut',
        'foto',
        'visi',
        'misi',
    ];

    protected $casts = [
        // nomor_urut disimpan integer & unik per pemilihan, jadi orderBy
        // menghasilkan urutan 1..10 benar (bukan 1, 10, 2 leksikal).
        'nomor_urut'   => 'integer',
        'pemilihan_id' => 'integer',
    ];

    /**
     * URL publik foto kandidat.
     *
     * Foto disimpan di disk "public" (storage/app/public/foto-kandidat) dan
     * disajikan lewat route /foto-kandidat/{nama}. URL dibuat relatif supaya
     * tetap benar walau aplikasi berjalan di port/subfolder lain dari APP_URL,
     * dan tidak bergantung pada symlink public/storage.
     */
    public function fotoUrl(): ?string
    {
        if (! $this->foto) {
            return null;
        }

        return route('foto.kandidat', ['nama' => basename($this->foto)], absolute: false);
    }

    // Relasi: Kandidat milik satu pemilihan
    public function pemilihan(): BelongsTo
    {
        return $this->belongsTo(Pemilihan::class);
    }

    // Relasi: Kandidat memiliki banyak suara
    public function suara(): HasMany
    {
        return $this->hasMany(Suara::class);
    }

    // Hitung total suara kandidat
    public function totalSuara(): int
    {
        return $this->suara()->count();
    }

    // Hitung persentase suara
    public function persentaseSuara(): float
    {
        $totalPemilihan = Suara::where('pemilihan_id', $this->pemilihan_id)->count();

        if ($totalPemilihan === 0) {
            return 0;
        }

        return round(($this->suara()->count() / $totalPemilihan) * 100, 2);
    }
}