<?php

/*
|--------------------------------------------------------------------------
| API JSON untuk halaman React + Inertia
|--------------------------------------------------------------------------
|
| Endpoint di sini dipakai untuk mutasi, polling, unggah berkas, dan
| kebutuhan lain yang tidak cocok dimuat sebagai props halaman Inertia.
|
| Middleware 'web' sengaja dipasang di sini: endpoint-nya berbasis SESI
| (cookie + CSRF) seperti halaman aslinya, bukan token bearer. Group 'api'
| bawaan Laravel tidak membawa StartSession/VerifyCsrfToken.
|
| Semua endpoint dilayani dari origin yang sama dengan halaman Inertia,
| jadi cookie sesi tetap first-party dan tidak butuh konfigurasi CORS.
|
*/

use App\Http\Controllers\Api\AdminAktifController;
use App\Http\Controllers\Api\AdminAnggotaController;
use App\Http\Controllers\Api\AdminAuditController;
use App\Http\Controllers\Api\AdminBackupController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AdminDashboardController;
use App\Http\Controllers\Api\AdminHasilController;
use App\Http\Controllers\Api\AdminKelasController;
use App\Http\Controllers\Api\AdminKendaliController;
use App\Http\Controllers\Api\AdminPengaturanController;
use App\Http\Controllers\Api\AdminKandidatController;
use App\Http\Controllers\Api\AdminKelolaAdminController;
use App\Http\Controllers\Api\AdminKeamananController;
use App\Http\Controllers\Api\AdminLayarController;
use App\Http\Controllers\Api\AdminPemilihanController;
use App\Http\Controllers\Api\AdminPantauController;
use App\Http\Controllers\Api\AdminSesiController;
use App\Http\Controllers\Api\PemilihController;
use App\Http\Middleware\ApiAdminSesi;
use App\Http\Middleware\ApiPemilihSesi;
use Illuminate\Support\Facades\Route;

/*
| Prefix 'api' sudah otomatis ditambahkan oleh Laravel karena berkas ini
| didaftarkan lewat withRouting(api: ...). Jangan tambahkan prefix lagi.
*/
Route::middleware(['web'])->name('api.')->group(function () {

    /*
    |----------------------------------------------------------------------
    | Autentikasi
    |----------------------------------------------------------------------
    */
    Route::post('login',  [AuthController::class, 'login'])->name('login');
    Route::post('logout', [AuthController::class, 'logout'])->name('logout');
    Route::get('me',      [AuthController::class, 'me'])->name('me');
    Route::get('config',  [AuthController::class, 'config'])->name('config');

    /*
    |----------------------------------------------------------------------
    | Pemilih (butuh sesi guard 'pemilih')
    |----------------------------------------------------------------------
    |
    | nocache        : mencegah tombol "Back" menampilkan halaman basi
    |                  (token CSRF sudah habis) -> error 419.
    | ApiPemilihSesi : padanan BatasiIdleUser yang balas 401 JSON (bukan
    |                  redirect) saat sesi idle sudah habis, supaya React tahu.
    |
    */
    Route::middleware(['auth:pemilih', 'nocache', ApiPemilihSesi::class])
        ->prefix('pemilih')
        ->name('pemilih.')
        ->group(function () {
            Route::get('pemilihan', [PemilihController::class, 'daftar'])->name('daftar');
            Route::get('status',    [PemilihController::class, 'status'])->name('status');
            Route::get('setelah-memilih', [PemilihController::class, 'setelahMemilih'])->name('setelah-memilih');

            Route::post('ping', fn () => response()->json(['berhasil' => true]))->name('ping');

            Route::get('pemilihan/{pemilihan}/kandidat', [PemilihController::class, 'kandidat'])->name('kandidat');
            Route::post('pemilihan/{pemilihan}/suara',   [PemilihController::class, 'suara'])->name('suara');
        });

    /*
    |----------------------------------------------------------------------
    | Admin (butuh sesi guard 'admin')
    |----------------------------------------------------------------------
    |
    | Sama seperti sisi pemilih: nocache + ApiAdminSesi (padanan
    | BatasiIdleAdmin yang balas 401 JSON).
    |
    | Izin per-fitur TIDAK dipasang di sini sebagai middleware, melainkan
    | dicek ulang di dalam tiap controller lewat AdminApi::butuhIzin().
    | Alasannya: peran bisa diturunkan saat halaman masih terbuka, jadi
    | pemeriksaan izin diulang di setiap request API.
    |
    */
    Route::middleware(['auth:admin', 'nocache', ApiAdminSesi::class])
        ->prefix('admin')
        ->name('admin.')
        ->group(function () {

            /* --- Dashboard --- */
            Route::get('dashboard', [AdminDashboardController::class, 'index'])->name('dashboard');

            /* --- Kelola Pemilihan --- */
            Route::get('pemilihan', [AdminPemilihanController::class, 'index'])->name('pemilihan');
            Route::post('pemilihan', [AdminPemilihanController::class, 'store'])->name('pemilihan.store');
            Route::put('pemilihan/{id}', [AdminPemilihanController::class, 'update'])->name('pemilihan.update');
            Route::delete('pemilihan/{id}', [AdminPemilihanController::class, 'destroy'])->name('pemilihan.destroy');
            Route::post('pemilihan/{id}/pulihkan', [AdminPemilihanController::class, 'pulihkan'])->name('pemilihan.pulihkan');
            Route::patch('pemilihan/{id}/status', [AdminPemilihanController::class, 'ubahStatus'])->name('pemilihan.status');

            /* --- Kelola Kandidat --- */
            Route::get('kandidat', [AdminKandidatController::class, 'index'])->name('kandidat');
            Route::post('kandidat', [AdminKandidatController::class, 'store'])->name('kandidat.store');
            Route::put('kandidat/{id}', [AdminKandidatController::class, 'update'])->name('kandidat.update');
            Route::delete('kandidat/{id}', [AdminKandidatController::class, 'destroy'])->name('kandidat.destroy');
            Route::post('kandidat/import', [AdminKandidatController::class, 'impor'])->name('kandidat.import');

            /* --- Kelola Pemilih (Anggota) --- */
            Route::get('anggota', [AdminAnggotaController::class, 'index'])->name('anggota');
            Route::post('anggota', [AdminAnggotaController::class, 'store'])->name('anggota.store');
            Route::get('anggota/template', [AdminAnggotaController::class, 'template'])->name('anggota.template');
            Route::post('anggota/import', [AdminAnggotaController::class, 'impor'])->name('anggota.import');
            Route::post('anggota/acak-password', [AdminAnggotaController::class, 'acakPasswordBanyak'])->name('anggota.acak-banyak');
            Route::get('anggota/{id}', [AdminAnggotaController::class, 'show'])->name('anggota.show');
            // Kode kartu asli: izin khusus + dibatasi laju + dicatat di audit log.
            Route::get('anggota/{id}/kode-kartu', [AdminAnggotaController::class, 'kodeKartu'])
                ->middleware(['izin:kode_kartu', 'throttle:30,1'])
                ->name('anggota.kode-kartu');
            Route::put('anggota/{id}', [AdminAnggotaController::class, 'update'])->name('anggota.update');
            Route::delete('anggota/{id}', [AdminAnggotaController::class, 'destroy'])->name('anggota.destroy');
            Route::post('anggota/{id}/acak-password', [AdminAnggotaController::class, 'acakPassword'])->name('anggota.acak');
            Route::get('anggota/{id}/peserta', [AdminAnggotaController::class, 'peserta'])->name('anggota.peserta');
            Route::put('anggota/{id}/peserta', [AdminAnggotaController::class, 'simpanPeserta'])->name('anggota.peserta.simpan');
            Route::get('anggota/{id}/detail-vote', [AdminAnggotaController::class, 'detailVote'])->name('anggota.detail');
            Route::get('kelas', [AdminKelasController::class, 'index'])->name('kelas');
            Route::post('kelas', [AdminKelasController::class, 'store'])->name('kelas.store');
            Route::put('kelas/{id}', [AdminKelasController::class, 'update'])->name('kelas.update');
            Route::delete('kelas/{id}', [AdminKelasController::class, 'destroy'])->name('kelas.destroy');
            Route::post('anggota/{id}/tidak-hadir', [AdminAnggotaController::class, 'tandaiTidakHadir'])->name('anggota.tidak-hadir');

            /* --- Pantau Partisipasi --- */
            Route::get('pantau', [AdminPantauController::class, 'index'])->name('pantau');

            /* --- Kendali Hari-H --- */
            Route::get('kendali', [AdminKendaliController::class, 'index'])->name('kendali');
            Route::post('kendali/pengumuman', [AdminKendaliController::class, 'simpanPengumuman'])->name('kendali.pengumuman');
            Route::post('kendali/pengumuman/toggle', [AdminKendaliController::class, 'togglePengumuman'])->name('kendali.pengumuman.toggle');
            Route::delete('kendali/pengumuman', [AdminKendaliController::class, 'hapusPengumuman'])->name('kendali.pengumuman.hapus');
            Route::post('kendali/jeda', [AdminKendaliController::class, 'toggleJeda'])->name('kendali.jeda');

            /* --- Mode Layar Besar (proyektor) --- */
            Route::get('layar', [AdminLayarController::class, 'index'])->name('layar');

            /* --- Pengaturan Identitas Sekolah --- */
            Route::get('pengaturan', [AdminPengaturanController::class, 'index'])->name('pengaturan');
            Route::post('pengaturan', [AdminPengaturanController::class, 'simpan'])->name('pengaturan.simpan');
            Route::post('pengaturan/reset', [AdminPengaturanController::class, 'reset'])->name('pengaturan.reset');
            // Hanya Super Admin (dicek ulang di controller).
            Route::post('pengaturan/hasil-sementara', [AdminPengaturanController::class, 'sembunyikanHasil'])
                ->name('pengaturan.hasil-sementara');

            /* --- Sesi Aktif (PEMILIH di komputer lab) --- */
            Route::get('sesi', [AdminSesiController::class, 'index'])->name('sesi');
            Route::delete('sesi', [AdminSesiController::class, 'destroySemua'])->name('sesi.destroy_semua');
            Route::delete('sesi/{sesiId}', [AdminSesiController::class, 'destroy'])->name('sesi.destroy');

            /* --- Admin/Panitia Aktif (halaman sendiri) --- */
            Route::get('admin-aktif', [AdminAktifController::class, 'index'])->name('admin-aktif');
            Route::delete('admin-aktif', [AdminAktifController::class, 'destroySemua'])->name('admin-aktif.destroy_semua');
            Route::delete('admin-aktif/{sesiId}', [AdminAktifController::class, 'destroy'])->name('admin-aktif.destroy');

            /* --- Hasil & Runoff --- */
            Route::get('hasil', [AdminHasilController::class, 'index'])->name('hasil');
            Route::post('hasil/{id}/runoff', [AdminHasilController::class, 'buatRunoff'])->name('hasil.runoff');

            /* --- Kelola Admin --- */
            Route::get('akun', [AdminKelolaAdminController::class, 'index'])->name('akun');
            Route::post('akun', [AdminKelolaAdminController::class, 'store'])->name('akun.store');
            Route::put('akun/{id}', [AdminKelolaAdminController::class, 'update'])->name('akun.update');
            Route::delete('akun/{id}', [AdminKelolaAdminController::class, 'destroy'])->name('akun.destroy');

            /* --- Backup --- */
            Route::get('backup', [AdminBackupController::class, 'index'])->name('backup');
            Route::post('backup/jadwal', [AdminBackupController::class, 'simpanJadwal'])->name('backup.jadwal');
            Route::post('backup/jalankan', [AdminBackupController::class, 'jalankan'])->name('backup.jalankan');
            Route::post('backup/pulihkan', [AdminBackupController::class, 'pulihkan'])->name('backup.pulihkan');
            Route::delete('backup/tugas/{id}', [AdminBackupController::class, 'hapusTugas'])->name('backup.tugas');

            /* --- Keamanan Akun (semua peran) --- */
            Route::get('keamanan', [AdminKeamananController::class, 'index'])->name('keamanan');
            Route::post('keamanan/password', [AdminKeamananController::class, 'gantiPassword'])->name('keamanan.password');
            Route::post('keamanan/logout-semua', [AdminKeamananController::class, 'logoutSemua'])->name('keamanan.logout-semua');

            /* --- Catatan Aktivitas --- */
            Route::get('audit', [AdminAuditController::class, 'index'])->name('audit');

            /* --- Profil admin (untuk menu & permission di React) --- */
            Route::get('profil', [AuthController::class, 'profil'])->name('profil');

            /* --- Heartbeat: admin masih aktif --- */
            Route::post('ping', [AuthController::class, 'ping'])->name('ping');
        });
});

/*
|--------------------------------------------------------------------------
| Endpoint API yang tidak terdaftar
|--------------------------------------------------------------------------
|
| Tanpa ini, POST ke alamat /api/* yang sudah dihapus akan dijawab 405 oleh
| fallback halaman (fallback hanya menerima GET), bukan 404. Test keamanan
| memastikan endpoint publik yang dihapus benar-benar tidak ada.
|
*/
Route::any('{jalur}', fn () => response()->json([
    'pesan' => 'Endpoint API tidak ditemukan.',
], 404))->where('jalur', '.*')->name('api.tidak-ditemukan');