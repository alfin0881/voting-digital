<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit log admin: siapa melakukan apa dan kapan.
 * Nama admin ikut disimpan sebagai snapshot agar riwayat tetap terbaca
 * walau akun adminnya kelak dihapus.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catatan_aktivitas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->nullable()
                ->constrained('admins')->nullOnDelete();
            $table->string('nama_admin')->nullable();
            $table->string('aksi', 60);
            $table->text('deskripsi')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();

            $table->index(['aksi', 'created_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catatan_aktivitas');
    }
};
