<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

class Pemilihan extends Model
{
    use SoftDeletes;

    /*
     * Soft delete = arsip. Partisipasi & kandidat suatu pemilihan memiliki FK
     * ON DELETE CASCADE, sementara tabel suara yang anonim tidak terhubung ke
     * pemilih. Hapus "asli" di level database akan menghilangkan seluruh
     * riwayat partisipasi sekaligus membuat suara tidak bisa diaudit, jadi
     * alur hapus standar model ini diarahkan ke arsip (deleted_at diisi).
     * Hapus permanen hanya lewat AdminPemilihanController::destroy() dengan
     * konfirmasi mengetik nama pemilihan.
     */
    protected $table = 'pemilihan';

    protected $fillable = [
        'nama_pemilihan',
        'deskripsi',
        'tanggal_mulai',
        'tanggal_selesai',
        'jam_mulai',
        'jam_selesai',
        'status',
        'putaran',
        'induk_id',
    ];

    protected $casts = [
        'tanggal_mulai'   => 'date',
        'tanggal_selesai' => 'date',
        'putaran'         => 'integer',
    ];

    // =========================================================================
    // RELASI
    // =========================================================================

    /** Kandidat yang terdaftar di pemilihan ini */
    public function kandidat(): HasMany
    {
        return $this->hasMany(Kandidat::class);
    }

    /** Pemilihan induk (untuk putaran kedua/runoff). */
    public function induk(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Pemilihan::class, 'induk_id');
    }

    /** Pemilihan putaran kedua yang berasal dari pemilihan ini. */
    public function putaranKedua(): HasMany
    {
        return $this->hasMany(Pemilihan::class, 'induk_id');
    }

    /** Apakah ini pemilihan putaran kedua (runoff)? */
    public function adalahPutaranKedua(): bool
    {
        return (int) $this->putaran === 2;
    }

    /**
     * Semua record PesertaPemilihan yang menyertakan pemilihan ini
     * (JSON_CONTAINS pada kolom pemilihan_ids).
     * Digunakan untuk hitung total peserta & rekap anti-golput.
     */
    public function pesertaTerdaftar()
    {
        return PesertaPemilihan::whereJsonContains('pemilihan_ids', $this->id);
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    /** Hitung total suara yang masuk */
    public function totalSuara(): int
    {
        return Suara::where('pemilihan_id', $this->id)->count();
    }

    /** Hitung total peserta terdaftar di pemilihan ini */
    public function totalPeserta(): int
    {
        return $this->pesertaTerdaftar()->count();
    }

    /**
     * Hitung peserta yang sudah memilih.
     * Menggunakan JSON path untuk cek status_voting.
     */
    public function totalSudahMemilih(): int
    {
        // Sumber kebenaran: tabel partisipasi (suara sudah anonim, tanpa user_id)
        return Partisipasi::where('pemilihan_id', $this->id)->count();
    }

    /** Cek apakah pemilihan sedang aktif (status admin, tanpa cek tanggal) */
    public function sedangAktif(): bool
    {
        return $this->status === 'aktif';
    }

    /**
     * Pemungutan suara benar-benar sedang berlangsung SEKARANG:
     * status aktif DAN waktu sekarang berada di rentang tanggal + jam.
     *
     * Dipakai untuk menentukan apakah hasil sementara harus disembunyikan.
     * Pemilihan yang statusnya masih "aktif" tetapi waktunya sudah lewat
     * dianggap sudah ditutup, sehingga hasilnya boleh ditampilkan walau
     * perintah tutup otomatis belum sempat berjalan.
     */
    public function sedangBerlangsung(?Carbon $sekarang = null): bool
    {
        return $this->status === 'aktif' && $this->beradaDiRentangWaktu($sekarang);
    }

    /**
     * Boleh menerima suara SEKARANG?
     * Mengecek status ('aktif') DAN waktu sekarang berada di antara
     * (tanggal_mulai + jam_mulai) dan (tanggal_selesai + jam_selesai).
     * Dua-duanya dicek sekaligus, sehingga admin yang lupa menonaktifkan pemilihan
     * setelah waktu selesai lewat tidak membuat pemilihan tetap bisa dipilih
     * (penutupan otomatis: tidak perlu ada yang menekan tombol).
     *
     * Jeda darurat (fitur kendali hari-H) juga dicek di sini: bila panitia menekan
     * "jeda", semua pemilihan berhenti menerima suara sampai jeda dicabut.
     */
    public function bolehMenerimaSuara(): bool
    {
        return $this->status === 'aktif'
            && $this->beradaDiRentangWaktu()
            && ! static::sedangDijeda();
    }

    /** Apakah pemungutan suara sedang dijeda darurat oleh panitia? */
    public static function sedangDijeda(): bool
    {
        return \App\Models\Pengaturan::benar(\App\Models\Pengaturan::JEDA);
    }

    /** Normalisasi jam ("07:00", "07:00:00", null) menjadi "HH:MM:SS". */
    public static function normalisasiJam(?string $jam, string $bawaan): string
    {
        $jam = trim((string) $jam);

        if ($jam === '') {
            return $bawaan;
        }

        return strlen($jam) === 5 ? $jam . ':00' : substr($jam, 0, 8);
    }

    /** Jam mulai efektif ("HH:MM:SS"); kosong dianggap 00:00:00. */
    public function jamMulaiEfektif(): string
    {
        return static::normalisasiJam($this->jam_mulai, '00:00:00');
    }

    /** Jam selesai efektif ("HH:MM:SS"); kosong dianggap 23:59:59. */
    public function jamSelesaiEfektif(): string
    {
        return static::normalisasiJam($this->jam_selesai, '23:59:59');
    }

    /** Saat pemilihan dibuka (tanggal_mulai + jam_mulai) menurut zona waktu aplikasi. */
    public function waktuMulai(): Carbon
    {
        return Carbon::parse($this->tanggal_mulai->toDateString() . ' ' . $this->jamMulaiEfektif());
    }

    /** Saat pemilihan ditutup otomatis (tanggal_selesai + jam_selesai). */
    public function waktuSelesai(): Carbon
    {
        return Carbon::parse($this->tanggal_selesai->toDateString() . ' ' . $this->jamSelesaiEfektif());
    }

    /** Apakah SEKARANG berada di antara waktu mulai dan waktu selesai (inklusif)? */
    public function beradaDiRentangWaktu(?Carbon $sekarang = null): bool
    {
        $sekarang ??= Carbon::now();

        return $sekarang->gte($this->waktuMulai()) && $sekarang->lte($this->waktuSelesai());
    }

    /** @deprecated Dipertahankan agar pemanggil lama tetap jalan; sekarang memeriksa jam juga. */
    public function beradaDiRentangTanggal(): bool
    {
        return $this->beradaDiRentangWaktu();
    }

    /** Sudah lewat waktu selesai? */
    public function sudahLewatWaktu(?Carbon $sekarang = null): bool
    {
        return ($sekarang ?? Carbon::now())->gt($this->waktuSelesai());
    }

    /** Belum sampai waktu mulai? */
    public function belumMulai(?Carbon $sekarang = null): bool
    {
        return ($sekarang ?? Carbon::now())->lt($this->waktuMulai());
    }

    /**
     * Alasan pemilihan tidak bisa menerima suara saat ini, untuk pesan ke pemilih.
     * Null berarti boleh menerima suara.
     */
    public function alasanTidakBolehMemilih(): ?string
    {
        if ($this->bolehMenerimaSuara()) {
            return null;
        }

        // Jeda darurat diutamakan sebagai alasan (lebih informatif bagi pemilih).
        if (static::sedangDijeda()) {
            $alasan = \App\Models\Pengaturan::baca(\App\Models\Pengaturan::JEDA_ALASAN);

            return 'Pemungutan suara sedang dijeda sementara oleh panitia'
                . ($alasan ? ': ' . $alasan : '.')
                . ' Silakan menunggu atau hubungi panitia.';
        }

        if ($this->belumMulai()) {
            return 'Pemilihan ini belum dimulai. Silakan kembali pada '
                . $this->waktuMulai()->translatedFormat('d F Y') . ' pukul ' . $this->waktuMulai()->format('H:i') . '.';
        }

        if ($this->sudahLewatWaktu()) {
            return 'Pemilihan ini sudah ditutup pada '
                . $this->waktuSelesai()->translatedFormat('d F Y') . ' pukul ' . $this->waktuSelesai()->format('H:i') . '.';
        }

        return 'Pemilihan ini sedang tidak aktif. Silakan hubungi panitia.';
    }

    /**
     * Scope: pemilihan yang benar-benar bisa menerima suara SEKARANG
     * (dipakai di daftar pemilihan pemilih, bukan hanya cek status).
     *
     * Dibandingkan sebagai tanggal + jam tanpa fungsi SQL khusus, jadi
     * jalan sama di SQLite maupun MySQL.
     */
    public function scopeBolehDipilihSekarang($query)
    {
        $sekarang = Carbon::now();
        $hariIni  = $sekarang->toDateString();
        $jamIni   = $sekarang->format('H:i:s');

        return $query->where('status', 'aktif')
            // Sudah lewat waktu mulai
            ->where(function ($q) use ($hariIni, $jamIni) {
                $q->whereDate('tanggal_mulai', '<', $hariIni)
                  ->orWhere(function ($q2) use ($hariIni, $jamIni) {
                      $q2->whereDate('tanggal_mulai', '=', $hariIni)
                         ->where('jam_mulai', '<=', $jamIni);
                  });
            })
            // Belum lewat waktu selesai
            ->where(function ($q) use ($hariIni, $jamIni) {
                $q->whereDate('tanggal_selesai', '>', $hariIni)
                  ->orWhere(function ($q2) use ($hariIni, $jamIni) {
                      $q2->whereDate('tanggal_selesai', '=', $hariIni)
                         ->where('jam_selesai', '>=', $jamIni);
                  });
            });
    }

    /**
     * Scope: pemilihan berstatus aktif yang waktu selesainya sudah lewat
     * (kandidat untuk ditutup otomatis oleh perintah pemilihan:tutup-otomatis).
     */
    public function scopeMelewatiWaktuSelesai($query)
    {
        $sekarang = Carbon::now();
        $hariIni  = $sekarang->toDateString();
        $jamIni   = $sekarang->format('H:i:s');

        return $query->where('status', 'aktif')
            ->where(function ($q) use ($hariIni, $jamIni) {
                $q->whereDate('tanggal_selesai', '<', $hariIni)
                  ->orWhere(function ($q2) use ($hariIni, $jamIni) {
                      $q2->whereDate('tanggal_selesai', '=', $hariIni)
                         ->where('jam_selesai', '<', $jamIni);
                  });
            });
    }
}
