<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Akun siswa pemilih. Login memakai NIS + kode kartu.
 *
 * Kode kartu disimpan dua bentuk:
 *  - password   : hash bcrypt untuk login (tidak bisa dibaca balik)
 *  - kode_kartu : kode asli terenkripsi (APP_KEY) untuk cetak kartu
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pemilih', function (Blueprint $table) {
            $table->id();
            $table->string('nis')->unique();
            $table->string('nama');
            $table->string('kelas')->nullable();
            $table->string('password');
            $table->text('kode_kartu')->nullable();
            $table->timestamps();

            // Halaman anggota, kartu pemilih, dan ekspor (urut kelas lalu nama).
            $table->index(['kelas', 'nama'], 'idx_pemilih_kelas_nama');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pemilih');
    }
};
