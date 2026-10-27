<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\BatasiIdleAdmin;
use App\Http\Middleware\BatasiIdleUser;
use App\Models\Admin;
use App\Models\Pemilih;
use App\Models\Pengaturan;
use App\Models\Pemilihan;
use App\Support\LacakSesiAdmin;
use App\Support\SesiPengguna;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

/**
 * API autentikasi: login, logout, sesi, config, dan profil.
 *
 * Halaman login Inertia memakai logika yang sama lewat
 * Halaman\AuthHalamanController, sehingga batas percobaan, kunci sementara,
 * dan auto-upgrade password admin plain -> hash tetap satu sumber.
 */
class AuthController extends Controller
{
    /** Maksimal percobaan gagal sebelum dikunci sementara. */
    private const MAKS_PERCOBAAN = 5;

    /** Hash bcrypt tak bermakna, hanya untuk menyamakan waktu respons saat NIS tidak ada. */
    private const HASH_PALSU = '$2y$10$Xc9fGyD6diXYzNdSE7MdYuolo/Lo1cbwv4ntHO0ZhifKsWggBeS1O';

    /** Lama kunci setelah percobaan habis (detik). */
    private const LAMA_KUNCI = 60;

    /**
     * True bila sudah melewati batas idle (Ditambah tenggang server).
     *
     * Meniru middleware BatasiIdleAdmin/BatasiIdleUser supaya pengecekan yang
     * sama bisa dipakai di dalam controller (route /api/me tidak memakai
     * middleware tersebut).
     */
    private function sudahIdle(Request $request, string $kunci, int $idle): bool
    {
        $terakhir = $request->session()->get($kunci);

        // Belum pernah ada aktivitas tercatat = jangan dipaksa keluar.
        if ($terakhir === null) return false;

        $batas = $idle + (int) config('voting.idle_server_grace');

        return (time() - (int) $terakhir) > $batas;
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nis'      => ['required', 'string'],
            'password' => ['required', 'string'],
        ], [
            'nis.required'      => 'NIS wajib diisi',
            'password.required' => 'Password wajib diisi',
        ]);

        $identitas = (string) $data['nis'];
        $kunci     = $this->kunciLimiter($identitas);

        if (RateLimiter::tooManyAttempts($kunci, self::MAKS_PERCOBAAN)) {
            $sisa = RateLimiter::availableIn($kunci);

            return response()->json([
                'pesan' => "Terlalu banyak percobaan login. Coba lagi dalam {$sisa} detik.",
                'kode'  => 'terkunci',
                'sisa'  => $sisa,
            ], 429);
        }

        // --- Admin: login pakai EMAIL, password di-hash ---
        $admin = Admin::where('email', $identitas)->first();

        if ($admin) {
            if (! $this->passwordAdminCocok($admin, $data['password'])) {
                RateLimiter::hit($kunci, self::LAMA_KUNCI);

                return response()->json([
                    'pesan' => 'Email atau password salah.',
                    'kode'  => 'salah',
                ], 401);
            }

            RateLimiter::clear($kunci);

            Auth::guard('pemilih')->logout();

            // PENTING: remember = false. Kalau true, LaravelPASANG cookie
            // "ingat saya" berumur 5 tahun; keesokan hari cookie itu
            // otomatis login lagi admin ini walau tidak ada yang mengetik
            // password, sehingga panel langsung terbuka.
            Auth::guard('admin')->login($admin, false);
            $request->session()->regenerate();

            // Buang sisa remember_token dari login lama di database, supaya
            // cookie remember yang terlanjur tersimpan di browser anak lain
            // tidak lagi berguna.
            if ($admin->remember_token !== null) {
                $admin->forceFill(['remember_token' => null])->save();
            }

            // Mulai hitung waktu idle DAN umur sesi dari sekarang.
            BatasiIdleAdmin::bersihkan($request);
            BatasiIdleAdmin::catat($request);
            LacakSesiAdmin::catat($admin, $request);

            return response()->json([
                'role'  => 'admin',
                'user'  => SesiPengguna::admin($admin),
                'izin'  => SesiPengguna::izin($admin),
                'redirect' => '/admin',
            ]);
        }

        // --- Pemilih: login pakai NIS + kode kartu (dibandingkan dengan HASH) ---
        $pemilih = Pemilih::where('nis', $identitas)->first();

        // Selalu jalankan satu pemeriksaan hash, juga saat NIS tidak ada, supaya
        // waktu respons tidak membocorkan NIS mana yang terdaftar.
        $cocok = $pemilih
            ? $pemilih->cocokKode((string) $data['password'])
            : Hash::check(Pemilih::normalisasiKode((string) $data['password']), self::HASH_PALSU);

        if (! $pemilih || ! $cocok) {
            RateLimiter::hit($kunci, self::LAMA_KUNCI);

            return response()->json([
                'pesan' => 'NIS atau password salah.',
                'kode'  => 'salah',
            ], 401);
        }

        RateLimiter::clear($kunci);

        Auth::guard('admin')->logout();
        Auth::guard('pemilih')->login($pemilih, false);
        $request->session()->regenerate();
        $request->session()->put(BatasiIdleUser::KUNCI, time());

        return response()->json([
            'role' => 'pemilih',
            'user' => [
                'nama'  => $pemilih->nama,
                'nis'   => $pemilih->nis,
                'kelas' => $pemilih->kelas,
            ],
            'redirect' => '/user/pemilihan',
        ]);
    }

    /**
     * Status sesi saat ini. Selalu balas 200 (bukan 401) supaya frontend bisa
     * memanggilnya sebagai "cek apakah masih login?" tanpa try/catch.
     */
    public function me(Request $request): JsonResponse
    {
        $admin   = Auth::guard('admin')->user();
        $pemilih = Auth::guard('pemilih')->user();

        // PENTING: /api/me berada di luar middleware batas idle, padahal ini
        // justru request PERTAMA yang dilakukan browser yang baru dibuka.
        // Tanpa pengecekan di sini, admin yang خلي laptop semalaman tetap
        // dianggap login dan frontend langsung mengarahkan ke /admin.
        // Dicek: idle (tidak ada aktivitas) DAN umur mutlak sesi. Idle saja
        // belum cukup, karena sesi bisa dibuat ulang sendiri oleh cookie
        // "ingat saya", sehingga kunci aktivitasnya selalu kosong.
        $alasan = $admin ? BatasiIdleAdmin::kedaluwarsa($request) : null;

        if ($admin && $alasan !== null) {
            $this->putuskanKeluar($request);

            // Tetap balas 200 (bukan 401) karena frontend memakai /me sebagai
            // "cek masih login?", tapi tandai kodenya supaya layar login bisa
            // menampilkan penyebabnya.
            return response()->json([
                'terlogin' => false,
                'role'     => null,
                'user'     => null,
                'kode'     => 'sesi_habis',
                'pesan'    => BatasiIdleAdmin::pesan($alasan),
            ]);
        }

        if ($admin) {
            // Membuka panel = aktivitas, jadi perbarui penanda waktu seperti
            // middleware ApiAdminSesi lakukan (selalu SETELAH pengecekan di atas).
            BatasiIdleAdmin::catat($request);
            LacakSesiAdmin::catat($admin, $request);

            return response()->json([
                'terlogin' => true,
                'role'     => 'admin',
                'user' => SesiPengguna::admin($admin),
                'izin' => SesiPengguna::izin($admin),
            ]);
        }

        // Sama seperti admin: /api/me tidak menyentuh middleware batas idle.
        if ($pemilih && $this->sudahIdle($request, BatasiIdleUser::KUNCI, (int) config('voting.idle_timeout'))) {
            $this->putuskanKeluar($request);

            return response()->json([
                'terlogin' => false,
                'role'     => null,
                'user'     => null,
                'kode'     => 'sesi_habis',
                'pesan'    => 'Sesi Anda berakhir karena tidak ada aktivitas. Silakan login kembali.',
            ]);
        }

        if ($pemilih) {
            return response()->json([
                'terlogin' => true,
                'role'     => 'pemilih',
                'user'     => [
                    'nama'  => $pemilih->nama,
                    'nis'   => $pemilih->nis,
                    'kelas' => $pemilih->kelas,
                ],
            ]);
        }

        return response()->json(['terlogin' => false, 'role' => null, 'user' => null]);
    }

    /**
     * Profil admin + daftar izin.
     *
     * Dipakai frontend untuk menampilkan nama/peran di header, menyembunyikan
     * menu yang tidak boleh diakses peran tersebut, dan menandai fitur aktif.
     */
    public function profil(): JsonResponse
    {
        $admin = Auth::guard('admin')->user();

        if (! $admin) {
            return response()->json([
                'terlogin' => false,
                'role'     => null,
                'user'     => null,
                'izin'     => [],
            ], 401);
        }

        // Kunci fitur yang dipakai frontend untuk menentukan menu.

        return response()->json([
            'terlogin' => true,
            'role'     => 'admin',
            'user' => SesiPengguna::admin($admin),
            'izin' => SesiPengguna::izin($admin),
        ]);
    }

    /**
     * Heartbeat admin: menandai admin masih aktif di sisi server.
     * Dipanggil JagaSesiAdmin lewat frontend tiap menit saat tab terbuka.
     */
    public function ping(): JsonResponse
    {
        return response()->json(['berhasil' => true]);
    }

    public function logout(Request $request): JsonResponse
    {
        $this->putuskanKeluar($request);

        return response()->json(['berhasil' => true, 'redirect' => '/login']);
    }

    /**
     * Akhiri sesi sepenuhnya: logout kedua guard, buang penanda waktu,
     * lalu regenerate session. Dipakai baik oleh logout biasa maupun oleh
     * jalur "/api/me menemukan sesi sudah tidak sah".
     */
    private function putuskanKeluar(Request $request): void
    {
        $admin = Auth::guard('admin')->user();

        Auth::guard('pemilih')->logout();
        Auth::guard('admin')->logout();

        // Login dengan remember pernah menyisakan token di database; bersihkan
        // supaya cookie "ingat saya" yang terlanjur ada di browser jadi tidak berguna.
        if ($admin instanceof Admin && $admin->remember_token !== null) {
            $admin->forceFill(['remember_token' => null])->save();
        }

        BatasiIdleAdmin::bersihkan($request);
        LacakSesiAdmin::hapus($request->session()->getId());
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }

    /**
     * Pengaturan runtime untuk frontend: durasi idle, hitung mundur logout,
     * nama sekolah, serta status jeda & pengumuman panitia.
     */
    public function config(): JsonResponse
    {
        return response()->json(SesiPengguna::config());
    }

    /** Status jeda darurat + banner pengumuman (dipakai juga untuk polling). */
    public function statusPemungutan(): array
    {
        return [
            'jeda'             => Pemilihan::sedangDijeda(),
            'jeda_alasan'      => (string) Pengaturan::baca(Pengaturan::JEDA_ALASAN, ''),
            'pengumuman'       => (string) Pengaturan::baca(Pengaturan::PENGUMUMAN, ''),
            'pengumuman_tipe'  => (string) Pengaturan::baca(Pengaturan::PENGUMUMAN_TIPE, 'info'),
            'pengumuman_aktif' => Pengaturan::benar(Pengaturan::PENGUMUMAN_AKTIF),
            'waktu_server'     => now()->timezone('Asia/Jakarta')->toIso8601String(),
        ];
    }

    private function passwordAdminCocok(Admin $admin, string $password): bool
    {
        $tersimpan = (string) $admin->password;

        if (password_get_info($tersimpan)['algo'] !== null) {
            return Hash::check($password, $tersimpan);
        }

        if (! hash_equals($tersimpan, $password)) {
            return false;
        }

        $admin->forceFill(['password' => Hash::make($password)])->save();

        return true;
    }

    /** Kunci limiter: identitas yang diketik + IP. */
    private function kunciLimiter(string $identitas): string
    {
        return 'login:' . Str::lower($identitas) . '|' . request()->ip();
    }
}