<?php

/*
|--------------------------------------------------------------------------
| Route Web — Kasya E-Voting (Inertia)
|--------------------------------------------------------------------------
|
| Sejak migrasi ke Inertia, halaman TIDAK lagi disajikan sebagai satu
| index.html SPA. Setiap menu punya route Laravel sendiri dan datanya dikirim
| bersama HTML pertama (props Inertia).
|
| Yang tetap ditangani di sini:
| 1. Login / logout berbasis sesi.
| 2. Halaman pemilih (daftar pemilihan, kandidat, terima kasih).
| 3. Halaman panel admin.
| 4. UNDUHAN berkas (PDF, Excel, kartu, backup) — hasilnya file, bukan halaman.
|
| Endpoint /api masih hidup untuk aksi tulis (CRUD, impor, polling). Halaman
| tidak lagi memakainya untuk MEMUAT data awal.
|
*/

use App\Http\Controllers\BackupDatabaseController;
use App\Http\Controllers\ExportHasilController;
use App\Http\Controllers\Halaman\AdminHalamanController;
use App\Http\Controllers\Halaman\AuthHalamanController;
use App\Http\Controllers\Halaman\PemilihHalamanController;
use App\Http\Controllers\KandidatTemplateController;
use App\Http\Controllers\KartuPemilihController;
use App\Http\Controllers\TugasLatarController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

/*
|--------------------------------------------------------------------------
| Beranda & Login
|--------------------------------------------------------------------------
*/

Route::get('/', function () {
    if (Auth::guard('admin')->check()) {
        return redirect('/admin');
    }

    if (Auth::guard('pemilih')->check()) {
        return redirect('/user/pemilihan');
    }

    return redirect('/login');
})->name('beranda');

Route::get('/login', [AuthHalamanController::class, 'login'])->name('login');
Route::post('/login', [AuthHalamanController::class, 'masuk'])->name('login.masuk');

/*
|--------------------------------------------------------------------------
| Logout
|--------------------------------------------------------------------------
|
| Tanpa middleware 'auth': kalau sesi sudah habis, tetap diarahkan ke login
| (bukan error). POST dari React, GET untuk refresh/bookmark lama.
|
*/
Route::post('/logout', function (Request $request) {
    \App\Support\SesiPengguna::putuskanKeluar($request);

    return redirect('/login');
})->name('logout');

Route::get('/logout', fn () => redirect('/login'));

/*
|--------------------------------------------------------------------------
| Halaman Pemilih (butuh sesi guard 'pemilih')
|--------------------------------------------------------------------------
|
| Data awal dikirim sebagai props Inertia. Polling status jeda/pengumuman
| tetap memakai /api/pemilih/status (satu poller bersama di frontend).
|
*/
Route::middleware(['auth:pemilih', 'nocache', 'idle.user'])
    ->prefix('user')
    ->name('pemilih.')
    ->group(function () {
        Route::get('/', fn () => redirect('/user/pemilihan'));

        Route::get('pemilihan', [PemilihHalamanController::class, 'daftar'])->name('pemilihan');
        Route::get('pemilihan/{pemilihan}/kandidat', [PemilihHalamanController::class, 'kandidat'])->name('kandidat');
        Route::post('pemilihan/{pemilihan}/suara', [PemilihHalamanController::class, 'suara'])->name('suara');
        Route::get('terima-kasih', [PemilihHalamanController::class, 'setelahMemilih'])->name('terima-kasih');
    });

/*
|--------------------------------------------------------------------------
| Halaman Panel Admin (butuh sesi guard 'admin')
|--------------------------------------------------------------------------
|
| `izin.halaman` mengarahkan kembali ke dashboard (dengan pesan) bila peran
| tidak berhak — bukan halaman 403 yang membingungkan.
|
*/
Route::middleware(['auth:admin', 'nocache', 'idle.admin'])
    ->prefix('admin')
    ->name('admin.')
    ->group(function () {
        Route::get('/', [AdminHalamanController::class, 'dashboard'])
            ->middleware('izin.halaman:dashboard')->name('dashboard');

        Route::get('pemilihan', [AdminHalamanController::class, 'pemilihan'])
            ->middleware('izin.halaman:pemilihan')->name('pemilihan');

        Route::get('kandidat', [AdminHalamanController::class, 'kandidat'])
            ->middleware('izin.halaman:kandidat')->name('kandidat');

        Route::get('anggota', [AdminHalamanController::class, 'anggota'])
            ->middleware('izin.halaman:anggota')->name('anggota');
        Route::get('kelas', [AdminHalamanController::class, 'kelas'])
            ->middleware('izin.halaman:anggota')->name('kelas');

        Route::get('pantau', [AdminHalamanController::class, 'pantau'])
            ->middleware('izin.halaman:pantau')->name('pantau');

        Route::get('kendali', [AdminHalamanController::class, 'kendali'])
            ->middleware('izin.halaman:kendali')->name('kendali');

        Route::get('sesi', [AdminHalamanController::class, 'sesi'])
            ->middleware('izin.halaman:sesi')->name('sesi');

        Route::get('admin-aktif', [AdminHalamanController::class, 'adminAktif'])
            ->middleware('izin.halaman:sesi_admin')->name('admin-aktif');

        Route::get('hasil', [AdminHalamanController::class, 'hasil'])
            ->middleware('izin.halaman:hasil')->name('hasil');

        Route::get('akun', [AdminHalamanController::class, 'akun'])
            ->middleware('izin.halaman:admin')->name('akun');

        Route::get('backup', [AdminHalamanController::class, 'backup'])
            ->middleware('izin.halaman:backup')->name('backup');

        Route::get('audit', [AdminHalamanController::class, 'audit'])
            ->middleware('izin.halaman:audit')->name('audit');

        Route::get('pengaturan', [AdminHalamanController::class, 'pengaturan'])
            ->middleware('izin.halaman:pengaturan')->name('pengaturan');

        // Setiap admin berhak mengamankan akunnya sendiri, jadi tidak ada
        // middleware izin fitur di sini (cukup sesi admin yang sah).
        Route::get('keamanan', [AdminHalamanController::class, 'keamanan'])->name('keamanan');

        // Mode proyektor: di luar kerangka admin, tetap butuh izin hasil.
        Route::get('layar-besar', [AdminHalamanController::class, 'layarBesar'])
            ->middleware('izin.halaman:hasil')->name('layar-besar');
    });

/*
|--------------------------------------------------------------------------
| Unduhan (butuh sesi admin)
|--------------------------------------------------------------------------
|
| Prefix /unduh sengaja dipisah dari /admin supaya tidak bentrok dengan
| halaman. Hasilnya berupa FILE, jadi tetap dilayani Laravel.
|
*/
Route::middleware(['auth:admin', 'nocache', 'idle.admin'])
    ->prefix('unduh')
    ->name('unduh.')
    ->group(function () {
        Route::get('kandidat/template', [KandidatTemplateController::class, 'unduh'])
            ->middleware('izin:kandidat')->name('kandidat.template');

        Route::get('anggota/template', [\App\Http\Controllers\Api\AdminAnggotaController::class, 'template'])
            ->middleware('izin:anggota')->name('anggota.template');

        // Kartu memuat kode asli pemilih: butuh izin 'anggota' DAN 'kode_kartu'.
        Route::get('anggota/kartu-pemilih', [KartuPemilihController::class, 'cetak'])
            ->middleware(['izin:anggota', 'izin:kode_kartu'])->name('anggota.kartu-pemilih');

        Route::get('hasil/export/pdf/{pemilihan?}', [ExportHasilController::class, 'pdf'])
            ->middleware('izin:export')->name('hasil.export.pdf');
        Route::get('hasil/export/excel/{pemilihan?}', [ExportHasilController::class, 'excel'])
            ->middleware('izin:export')->name('hasil.export.excel');
        Route::get('hasil/export/excel-latar/{pemilihan?}', [ExportHasilController::class, 'excelLatar'])
            ->middleware('izin:export')->name('hasil.export.excel-latar');

        Route::get('backup', [BackupDatabaseController::class, 'unduh'])
            ->middleware('izin:backup')->name('backup');
        Route::get('tugas/{tugas}/unduh', [TugasLatarController::class, 'unduh'])
            ->middleware('izin:backup')->name('tugas');
    });

/*
|--------------------------------------------------------------------------
| Foto kandidat
|--------------------------------------------------------------------------
|
| Foto disimpan di disk "public" (storage/app/public/foto-kandidat) tetapi
| tidak semua server bisa membuat symlink public/storage. Route ini menyajikan
| berkasnya langsung dari disk, jadi foto tetap tampil tanpa symlink dan tanpa
| bergantung pada nilai APP_URL.
|
*/

Route::get('foto-kandidat/{nama}', function (string $nama) {
    $path = 'foto-kandidat/' . $nama;

    abort_unless(Storage::disk('public')->exists($path), 404);

    return Storage::disk('public')->response($path, null, [
        'Cache-Control' => 'public, max-age=604800',
    ]);
})->where('nama', '[A-Za-z0-9._-]+')->name('foto.kandidat');

/*
|--------------------------------------------------------------------------
| Alamat tidak dikenal
|--------------------------------------------------------------------------
|
| Dulu semua alamat dilayani index.html SPA. Sekarang arahkan ke beranda,
| yang akan memilih login / panel sesuai sesi.
|
| Alamat /api/* sengaja DIKECUALIKAN: kalau endpoint JSON tidak ada, jawabannya
| harus 404 — bukan pengalihan HTML. Tanpa pengecualian ini, test "endpoint
| publik sudah dihapus" ikut gagal karena fallback menangkap /api/*.
|
*/
Route::fallback(function (Request $request) {
    // Endpoint /api/* yang tidak terdaftar harus 404, bukan dialihkan ke
    // halaman HTML. Fallback Laravel tidak bisa dibatasi lewat ->where(),
    // jadi penyaringannya dilakukan di sini.
    abort_if($request->is('api/*'), 404);

    return redirect('/');
});
