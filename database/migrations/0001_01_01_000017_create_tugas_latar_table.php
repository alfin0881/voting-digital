<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pekerjaan latar belakang (queue): ekspor hasil & impor besar dijalankan
 * lewat worker agar tidak timeout, lalu hasilnya bisa diunduh.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tugas_latar', function (Blueprint $table) {
            $table->id();
            $table->string('jenis', 40);
            $table->string('status', 20)->default('menunggu'); // menunggu|proses|selesai|gagal
            $table->string('judul');
            $table->text('pesan')->nullable();
            $table->string('nama_file')->nullable();
            $table->foreignId('admin_id')->nullable()
                ->constrained('admins')->nullOnDelete();
            $table->string('nama_admin')->nullable();
            $table->timestamp('selesai_pada')->nullable();
            $table->timestamps();

            $table->index(['jenis', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tugas_latar');
    }
};
