<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

/**
 * Audit log admin: mencatat aksi penting beserta pelaku & waktu.
 * Gunakan CatatanAktivitas::catat($aksi, $deskripsi) dari komponen admin.
 */
class CatatanAktivitas extends Model
{
    protected $table = 'catatan_aktivitas';

    protected $fillable = [
        'admin_id',
        'nama_admin',
        'aksi',
        'deskripsi',
        'ip_address',
    ];

    public function admin(): BelongsTo
    {
        return $this->belongsTo(Admin::class, 'admin_id');
    }

    /**
     * Catat satu aktivitas. Aman dipanggil walau tidak ada admin login.
     *
     * @param  string       $aksi      kunci singkat, mis. 'pemilihan.ubah_status'
     * @param  string|null  $deskripsi keterangan manusiawi
     */
    public static function catat(string $aksi, ?string $deskripsi = null): self
    {
        $admin = Auth::guard('admin')->user();

        return static::create([
            'admin_id'   => $admin?->id,
            'nama_admin' => $admin?->nama,
            'aksi'       => $aksi,
            'deskripsi'  => $deskripsi,
            'ip_address' => Request::ip(),
        ]);
    }

    /** Label manusiawi untuk tiap jenis aksi + warnanya. */
    public function label(): string
    {
        return self::daftarAksi()[$this->aksi]['label'] ?? $this->aksi;
    }

    public function warna(): string
    {
        return self::daftarAksi()[$this->aksi]['warna'] ?? 'slate';
    }

    /** @return array<string, array{label:string, warna:string}> */
    public static function daftarAksi(): array
    {
        return [
            'pemilihan.tambah'        => ['label' => 'Menambah pemilihan', 'warna' => 'emerald'],
            'pemilihan.ubah'          => ['label' => 'Mengubah pemilihan', 'warna' => 'amber'],
            'pemilihan.hapus'         => ['label' => 'Menghapus pemilihan', 'warna' => 'red'],
            'pemilihan.ubah_status'   => ['label' => 'Mengubah status pemilihan', 'warna' => 'sky'],
            'pemilihan.runoff'        => ['label' => 'Buat putaran II (runoff)', 'warna' => 'amber'],
            'pemilihan.tutup_otomatis'=> ['label' => 'Pemilihan ditutup otomatis', 'warna' => 'sky'],

            'kandidat.tambah'         => ['label' => 'Menambah kandidat', 'warna' => 'emerald'],
            'kandidat.ubah'           => ['label' => 'Mengubah kandidat', 'warna' => 'amber'],
            'kandidat.hapus'          => ['label' => 'Menghapus kandidat', 'warna' => 'red'],

            'anggota.tambah'          => ['label' => 'Menambah pemilih', 'warna' => 'emerald'],
            'anggota.ubah'            => ['label' => 'Mengubah pemilih', 'warna' => 'amber'],
            'anggota.hapus'           => ['label' => 'Menghapus pemilih', 'warna' => 'red'],
            'anggota.acak_password'   => ['label' => 'Reset password', 'warna' => 'amber'],
            'anggota.cetak_kartu'     => ['label' => 'Cetak kartu pemilih', 'warna' => 'sky'],
            'anggota.lihat_kode'      => ['label' => 'Lihat kode kartu', 'warna' => 'amber'],
            'anggota.import'          => ['label' => 'Impor pemilih', 'warna' => 'sky'],
            'anggota.import_latar'    => ['label' => 'Impor pemilih (latar)', 'warna' => 'sky'],
            'kandidat.import'         => ['label' => 'Impor kandidat', 'warna' => 'sky'],
            'ekspor.latar'            => ['label' => 'Ekspor hasil (latar)', 'warna' => 'sky'],
            'backup.terjadwal'        => ['label' => 'Backup terjadwal', 'warna' => 'emerald'],

            'admin.tambah'            => ['label' => 'Menambah admin', 'warna' => 'emerald'],
            'admin.ubah'              => ['label' => 'Mengubah admin', 'warna' => 'amber'],
            'admin.hapus'             => ['label' => 'Menghapus admin', 'warna' => 'red'],

            'kendali.pengumuman'      => ['label' => 'Kirim pengumuman', 'warna' => 'sky'],
            'kendali.jeda'            => ['label' => 'Jeda pemungutan suara', 'warna' => 'red'],
            'kendali.lanjut'          => ['label' => 'Cabut jeda', 'warna' => 'emerald'],

            // Catatan 'publik.*' sengaja DITAHAN: fitur hasil publik sudah dihapus,
            // tapi baris lama di catatan_aktivitas masih perlu tampil wajar di audit log.
            'publik.buka'             => ['label' => 'Buka hasil publik', 'warna' => 'emerald'],
            'publik.tutup'            => ['label' => 'Tutup hasil publik', 'warna' => 'red'],
            'publik.token_baru'       => ['label' => 'Ganti token publik', 'warna' => 'amber'],

            'hasil.lihat'             => ['label' => 'Lihat hasil pemilihan', 'warna' => 'sky'],
            'layar.buka'              => ['label' => 'Buka mode layar besar', 'warna' => 'sky'],

            'sesi.keluarkan'          => ['label' => 'Keluarkan sesi', 'warna' => 'amber'],
            'sesi.keluarkan_semua'    => ['label' => 'Keluarkan semua sesi', 'warna' => 'red'],

            'sesi.keluarkan_admin'       => ['label' => 'Keluarkan sesi admin', 'warna' => 'amber'],
            'sesi.keluarkan_admin_semua' => ['label' => 'Keluarkan semua sesi admin', 'warna' => 'red'],

            'backup.unduh'            => ['label' => 'Unduh backup database', 'warna' => 'sky'],
            'backup.restore'          => ['label' => 'Restore database', 'warna' => 'red'],
            'backup.restore_gagal'    => ['label' => 'Restore database gagal', 'warna' => 'amber'],

            'pengaturan.hasil_sementara' => ['label' => 'Kerahasiaan hasil sementara', 'warna' => 'amber'],

            'akun.password'           => ['label' => 'Ganti password sendiri', 'warna' => 'amber'],
            'akun.logout_semua'       => ['label' => 'Akhiri semua sesi akun', 'warna' => 'red'],
        ];
    }
}
