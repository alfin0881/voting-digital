<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kandidat pada suatu pemilihan.
 *
 * nomor_urut berupa integer dan unik per pemilihan agar urutan 1..11 benar
 * secara numerik (bukan leksikal) dan nomor ganda tidak bisa masuk. Unique
 * (pemilihan_id, nomor_urut) sekaligus menjadi index untuk daftar kandidat.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kandidat', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pemilihan_id')->constrained('pemilihan')->cascadeOnDelete();
            $table->string('nama_kandidat');
            $table->unsignedInteger('nomor_urut');
            $table->string('foto')->nullable();
            $table->text('visi')->nullable();
            $table->text('misi')->nullable();
            $table->timestamps();

            $table->unique(['pemilihan_id', 'nomor_urut'], 'uq_kandidat_nomor_per_pemilihan');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kandidat');
    }
};
