<?php

namespace App\Support;

use App\Http\Middleware\BatasiIdleAdmin;
use App\Http\Middleware\BatasiIdleUser;
use App\Models\Admin;
use App\Models\Pemilih;
use App\Models\Pengaturan;
use App\Models\Pemilihan;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Satu sumber data sesi & konfigurasi runtime.
 *
 * Sebelum memakai Inertia, frontend React memanggil /api/config dan /api/me
 * secara terpisah setiap kali halaman dibuka. Itu membuat boot aplikasi
 * menunggu DUA request sebelum halaman pertama bisa dirender.
 *
 * Sekarang data yang sama dibagikan lewat props Inertia (HandleInertiaRequests),
 * jadi ikut di dalam respons halaman pertama. Class ini dipakai bersama oleh:
 * - HandleInertiaRequests (props global)
 * - Api\AuthController (/api/config, /api/me, /api/admin/profil)
 *
 * Dengan begitu aturan idle dan daftar izin tidak pernah berbeda antara
 * halaman Inertia dan endpoint JSON yang masih dipakai untuk polling/aksi.
 */
final class SesiPengguna
{
    /** Kunci fitur untuk menu & pemeriksaan izin. */
    public const FITUR = [
        'dashboard', 'hasil', 'export', 'pemilihan', 'kandidat', 'anggota', 'kode_kartu',
        'admin', 'sesi', 'sesi_admin', 'pantau', 'kendali', 'backup', 'audit', 'pengaturan',
    ];

    /** Data admin yang aman dikirim ke browser. */
    public static function admin(Admin $admin): array
    {
        return [
            'id'    => $admin->id,
            'nama'  => $admin->nama,
            'email' => $admin->email,
            'peran' => $admin->peranAdmin(),
            'label' => $admin->labelPeranAdmin(),
            'super' => $admin->adalahSuperAdmin(),
        ];
    }

    /** Daftar fitur yang boleh diakses peran admin ini. */
    public static function izin(Admin $admin): array
    {
        return array_values(array_filter(
            self::FITUR,
            fn (string $fitur) => $admin->bolehAkses($fitur)
        ));
    }

    /** Data pemilih yang aman dikirim ke browser. */
    public static function pemilih(Pemilih $pemilih): array
    {
        return [
            'nama'  => $pemilih->nama,
            'nis'   => $pemilih->nis,
            'kelas' => $pemilih->kelas,
        ];
    }

    /**
     * Props `auth` untuk Inertia + endpoint /api/me.
     *
     * Sesi admin yang sudah melewati batas idle/umur langsung diputus di sini,
     * supaya membuka halaman apa pun tidak pernah "menghidupkan" sesi lama.
     */
    public static function auth(Request $request): array
    {
        $admin   = Auth::guard('admin')->user();
        $pemilih = Auth::guard('pemilih')->user();
        $pesan   = null;

        if ($admin instanceof Admin) {
            $alasan = BatasiIdleAdmin::kedaluwarsa($request);

            if ($alasan !== null) {
                self::putuskanKeluar($request);
                $admin = null;
                $pesan = BatasiIdleAdmin::pesan($alasan);
            } else {
                // Membuka halaman = aktivitas (sama seperti middleware).
                BatasiIdleAdmin::catat($request);
                LacakSesiAdmin::catat($admin, $request);
            }
        }

        if ($admin instanceof Admin) {
            return [
                'terlogin' => true,
                'role'     => 'admin',
                'user'     => self::admin($admin),
                'izin'     => self::izin($admin),
                'pesan'    => null,
            ];
        }

        if ($pemilih instanceof Pemilih) {
            if (self::pemilihIdle($request)) {
                self::putuskanKeluar($request);
                $pemilih = null;
                $pesan = 'Sesi Anda berakhir karena tidak ada aktivitas. Silakan login kembali.';
            }
        }

        if ($pemilih instanceof Pemilih) {
            return [
                'terlogin' => true,
                'role'     => 'pemilih',
                'user'     => self::pemilih($pemilih),
                'izin'     => [],
                'pesan'    => null,
            ];
        }

        return [
            'terlogin' => false,
            'role'     => null,
            'user'     => null,
            'izin'     => [],
            'pesan'    => $pesan,
        ];
    }

    /** Pengaturan runtime untuk React (nama sekolah, idle, jeda, pengumuman). */
    public static function config(): array
    {
        $idleTimeout = (int) config('voting.idle_timeout');
        $adminIdle   = (int) config('voting.admin_idle_timeout');

        return [
            // `sekolah` dipertahankan agar frontend versi lama tidak rusak.
            'sekolah'            => Pengaturan::namaSekolah(),
            'nama_sekolah'       => Pengaturan::namaSekolah(),
            'nama_aplikasi'      => Pengaturan::namaAplikasi(),
            'judul_aplikasi'     => Pengaturan::judulAplikasi(),
            'idle_timeout'       => $idleTimeout,
            'idle_warning'       => min((int) config('voting.idle_warning'), max($idleTimeout - 1, 1)),
            'logout_countdown'   => (int) config('voting.logout_countdown'),

            'admin_idle_timeout' => $adminIdle,
            'admin_idle_warning' => min((int) config('voting.admin_idle_warning'), max($adminIdle - 1, 1)),

            'pengaturan'         => self::statusPemungutan(),
        ];
    }

    /** Status jeda darurat + banner pengumuman (dipakai juga untuk polling). */
    public static function statusPemungutan(): array
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

    /**
     * Akhiri sesi sepenuhnya: logout kedua guard, bersihkan penanda waktu,
     * hapus jejak sesi admin, lalu regenerate session.
     */
    public static function putuskanKeluar(Request $request): void
    {
        $admin = Auth::guard('admin')->user();

        Auth::guard('pemilih')->logout();
        Auth::guard('admin')->logout();

        // Bersihkan sisa remember token supaya cookie lama tidak berguna.
        if ($admin instanceof Admin && $admin->remember_token !== null) {
            $admin->forceFill(['remember_token' => null])->save();
        }

        BatasiIdleAdmin::bersihkan($request);
        LacakSesiAdmin::hapus($request->session()->getId());
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }

    /** True bila sesi pemilih sudah melewati batas idle (+ tenggang server). */
    private static function pemilihIdle(Request $request): bool
    {
        $terakhir = $request->session()->get(BatasiIdleUser::KUNCI);

        if ($terakhir === null) {
            return false;
        }

        $batas = (int) config('voting.idle_timeout') + (int) config('voting.idle_server_grace');

        return (time() - (int) $terakhir) > $batas;
    }
}
