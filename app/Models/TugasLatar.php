<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Satu baris tugas latar belakang (queue) yang dijalankan worker.
 * Dipakai untuk ekspor hasil & impor besar agar tidak timeout.
 */
class TugasLatar extends Model
{
    protected $table = 'tugas_latar';

    public const MENUNGGU = 'menunggu';
    public const PROSES   = 'proses';
    public const SELESAI  = 'selesai';
    public const GAGAL    = 'gagal';

    protected $fillable = [
        'jenis',
        'status',
        'judul',
        'pesan',
        'nama_file',
        'admin_id',
        'nama_admin',
        'selesai_pada',
    ];

    protected $casts = [
        'selesai_pada' => 'datetime',
    ];

    /** Buat tugas baru untuk admin yang sedang login. */
    public static function buat(string $jenis, string $judul): self
    {
        $admin = Auth::guard('admin')->user();

        return static::create([
            'jenis'      => $jenis,
            'status'     => self::MENUNGGU,
            'judul'      => $judul,
            'admin_id'   => $admin?->id,
            'nama_admin' => $admin?->nama,
        ]);
    }

    public function tandaiSelesai(?string $namaFile = null, ?string $pesan = null): void
    {
        $this->update([
            'status'       => self::SELESAI,
            'nama_file'    => $namaFile,
            'pesan'        => $pesan,
            'selesai_pada' => now(),
        ]);
    }

    public function tandaiGagal(string $pesan): void
    {
        $this->update([
            'status'       => self::GAGAL,
            'pesan'        => $pesan,
            'selesai_pada' => now(),
        ]);
    }

    /** Apakah file hasil sudah siap diunduh? */
    public function siapDiunduh(): bool
    {
        return $this->status === self::SELESAI && $this->nama_file
            && \Illuminate\Support\Facades\Storage::disk('local')->exists($this->nama_file);
    }

    public function warna(): string
    {
        return match ($this->status) {
            self::SELESAI => 'emerald',
            self::GAGAL   => 'red',
            self::PROSES  => 'sky',
            default       => 'slate',
        };
    }

    public function labelStatus(): string
    {
        return match ($this->status) {
            self::SELESAI => 'Selesai',
            self::GAGAL   => 'Gagal',
            self::PROSES  => 'Diproses',
            default       => 'Menunggu',
        };
    }
}
