<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Auth\User as Authenticatable;

/**
 * Akun pengelola (tabel `admins`). Login pakai email; guard: `admin`.
 * Peran & hak akses didefinisikan di config/peran_admin.php.
 */
class Admin extends Authenticatable
{
    protected $table = 'admins';

    protected $fillable = [
        'nama',
        'email',
        'password',
        'peran',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    /** Peran admin: super_admin | panitia | pengawas (peran bawaan bila kosong). */
    public function peranAdmin(): string
    {
        return $this->peran ?: config('peran_admin.bawaan');
    }

    public function adalahSuperAdmin(): bool
    {
        return $this->peranAdmin() === 'super_admin';
    }

    /** Nama peran untuk ditampilkan, mis. "Panitia". */
    public function labelPeranAdmin(): string
    {
        return config('peran_admin.peran.' . $this->peranAdmin() . '.label', '—');
    }

    /**
     * Apakah admin ini boleh mengakses fitur tertentu?
     * Kunci fitur: dashboard, hasil, export, pemilihan, kandidat, anggota, admin, sesi, pantau.
     */
    public function bolehAkses(string $fitur): bool
    {
        $izin = config('peran_admin.peran.' . $this->peranAdmin() . '.izin', []);

        return in_array('*', $izin, true) || in_array($fitur, $izin, true);
    }

    /**
     * Boleh mengakses halaman "Admin Aktif" (daftar admin aktif + memutus
     * sesi admin lain)?
     *
     * Halaman itu hanya untuk Super Admin lewat kunci izin 'sesi_admin'.
     * Metode ini cuma pembungkus supaya pemanggil tidak perlu mengingat
     * nama kuncinya.
     */
    public function bolehKelolaSesiAdmin(): bool
    {
        return $this->bolehAkses('sesi_admin');
    }

    public function scopeSuperAdmin(Builder $query): Builder
    {
        return $query->where('peran', 'super_admin');
    }
}
