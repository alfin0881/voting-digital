<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Catatan bahwa seorang pemilih SUDAH memilih di suatu pemilihan.
 * Sengaja tidak menyimpan kandidat yang dipilih — isi suara ada di tabel
 * `suara` yang tidak terhubung ke identitas pemilih.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('partisipasi', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pemilih_id')->constrained('pemilih')->cascadeOnDelete();
            $table->foreignId('pemilihan_id')->constrained('pemilihan')->cascadeOnDelete();
            $table->timestamp('waktu_memilih')->useCurrent();
            $table->timestamps();

            // Satu pemilih hanya boleh 1 kali per pemilihan.
            $table->unique(['pemilih_id', 'pemilihan_id'], 'uq_partisipasi_pemilih_pemilihan');

            // Rekap "suara hari ini"/per jam & pantau N menit terakhir.
            $table->index(['pemilihan_id', 'waktu_memilih'], 'idx_partisipasi_pemilihan_waktu');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('partisipasi');
    }
};
