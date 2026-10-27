<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pendaftaran pemilih ke pemilihan. Satu pemilih = satu baris.
 *
 * - pemilihan_ids : array ID pemilihan yang diikuti, mis. [1, 2, 4]
 * - status_voting : status per pemilihan, mis.
 *   { "1": { sudah_memilih: false, status_hadir: "belum_hadir", waktu_memilih: null } }
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('peserta_pemilihan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pemilih_id')->unique()
                ->constrained('pemilih')->cascadeOnDelete();

            $table->json('pemilihan_ids');

            // Default ekspresi agar valid di MySQL (JSON tidak boleh default literal).
            $table->json('status_voting')->default(DB::raw("('{}')"));

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('peserta_pemilihan');
    }
};
