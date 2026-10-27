<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Daftar sesi admin yang sedang aktif (dicatat middleware ApiAdminSesi).
 * Dipakai super admin untuk melihat siapa yang login dan memutus sesi
 * admin/panitia lain secara paksa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sesi_admin', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->constrained('admins')->cascadeOnDelete();

            // Id sesi Laravel (cookie laravel_session); satu baris = satu perangkat.
            $table->string('session_id')->unique();

            $table->string('ip_address', 45)->nullable();
            $table->string('perangkat', 120)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamp('masuk_at');
            $table->timestamp('last_activity');
            $table->timestamps();

            $table->index('last_activity');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sesi_admin');
    }
};
