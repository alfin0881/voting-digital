<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Isi suara (ANONIM). Tanpa identitas pemilih, tanpa waktu, dan memakai
 * UUID acak (bukan auto-increment) agar urutan baris tidak bisa dicocokkan
 * dengan urutan orang memilih di tabel `partisipasi`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suara', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('pemilihan_id')->constrained('pemilihan')->cascadeOnDelete();
            $table->foreignId('kandidat_id')->constrained('kandidat')->cascadeOnDelete();

            // Perhitungan suara per kandidat.
            $table->index(['pemilihan_id', 'kandidat_id'], 'idx_suara_pemilihan_kandidat');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suara');
    }
};
