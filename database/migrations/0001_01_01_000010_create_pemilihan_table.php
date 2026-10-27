<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Jadwal pemilihan.
 *
 * - Rentang waktu memakai tanggal + jam. Default 00:00:00 - 23:59:59 supaya
 *   pemilihan tanpa jam tetap terbuka sepanjang hari.
 * - putaran/induk_id mendukung pemilihan dua putaran (runoff).
 * - Soft delete = arsip: riwayat suara tetap utuh saat pemilihan "dihapus".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pemilihan', function (Blueprint $table) {
            $table->id();
            $table->string('nama_pemilihan');
            $table->text('deskripsi')->nullable();
            $table->date('tanggal_mulai');
            $table->date('tanggal_selesai');
            $table->time('jam_mulai')->default('00:00:00');
            $table->time('jam_selesai')->default('23:59:59');
            $table->enum('status', ['aktif', 'nonaktif'])->default('nonaktif');
            $table->unsignedTinyInteger('putaran')->default(1); // 1 = biasa, 2 = runoff
            $table->foreignId('induk_id')->nullable()
                ->constrained('pemilihan')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            // Halaman admin menyaring status aktif dan mengurutkan tanggal.
            $table->index(['status', 'tanggal_mulai'], 'idx_pemilihan_status_mulai');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pemilihan');
    }
};
