<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Satu baris = satu perangkat yang sedang login sebagai admin.
 *
 * Ditulis oleh App\Support\LacakSesiAdmin setiap kali ada request admin yang
 * sah, dibaca oleh halaman "Sesi Aktif" untuk melihat dan mengeluarkan
 * sesi admin/panitia lain.
 */
class SesiAdmin extends Model
{
    protected $table = 'sesi_admin';

    protected $fillable = [
        'admin_id',
        'session_id',
        'ip_address',
        'perangkat',
        'user_agent',
        'masuk_at',
        'last_activity',
    ];

    protected $casts = [
        'masuk_at'       => 'datetime',
        'last_activity'  => 'datetime',
    ];

    public function admin(): BelongsTo
    {
        return $this->belongsTo(Admin::class);
    }
}