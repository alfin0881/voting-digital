<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use App\Models\Pengaturan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Pengaturan identitas sekolah & aplikasi.
 *
 * Tujuannya supaya satu instalasi bisa dipakai banyak sekolah: nama sekolah dan
 * nama aplikasi disimpan di tabel `pengaturan` (bukan di config), lalu dibaca
 * oleh navbar, layar login, mode layar besar, laporan PDF/Excel, dan kartu
 * pemilih lewat Pengaturan::namaSekolah() / Pengaturan::judulAplikasi().
 */
class AdminPengaturanController extends Controller
{
    use AdminApi;

    /** Batas panjang; cukup untuk nama sekolah & nama aplikasi. */
    private const MAKS_SEKOLAH = 120;
    private const MAKS_APLIKASI = 40;

    public function index(): JsonResponse
    {
        $this->butuhIzin('pengaturan');

        return response()->json($this->data());
    }

    /**
     * Nyalakan/matikan kerahasiaan hasil sementara.
     *
     * Hanya Super Admin yang boleh mengubah: pengaturan ini mengubah apa yang
     * dilihat Panitia & Pengawas, jadi tidak boleh diubah oleh pihak yang
     * justru sedang dibatasi.
     */
    public function sembunyikanHasil(Request $request): JsonResponse
    {
        $admin = $this->butuhSuperAdmin('pengaturan');

        $data = $request->validate([
            'aktif' => ['required', 'boolean'],
        ], [
            'aktif.required' => 'Status wajib dipilih.',
            'aktif.boolean'  => 'Status tidak valid.',
        ]);

        $aktif = (bool) $data['aktif'];

        Pengaturan::tulis(
            Pengaturan::SEMBUNYIKAN_HASIL_SEMENTARA,
            $aktif ? '1' : '0',
            $admin->id
        );

        CatatanAktivitas::catat(
            'pengaturan.hasil_sementara',
            ($aktif ? 'Mengaktifkan' : 'Menonaktifkan')
                . ' penyembunyian hasil sementara selama pemungutan suara berlangsung.'
        );

        return response()->json([
            'berhasil' => true,
            'pesan'    => $aktif
                ? 'Hasil sementara sekarang disembunyikan sampai pemungutan ditutup.'
                : 'Hasil sementara sekarang dapat dilihat selama pemungutan berlangsung.',
            'tipe'     => 'sukses',
        ] + $this->data());
    }

    /**
     * Simpan nama sekolah & nama aplikasi.
     *
     * Nama sekolah wajib diisi karena dipakai di kop laporan dan kartu pemilih;
     * nama aplikasi boleh kosong (jatuh ke bawaan "E-Voting").
     */
    public function simpan(Request $request): JsonResponse
    {
        $this->butuhIzin('pengaturan');

        $data = $request->validate([
            'nama_sekolah'  => ['required', 'string', 'min:2', 'max:' . self::MAKS_SEKOLAH],
            'nama_aplikasi' => ['nullable', 'string', 'max:' . self::MAKS_APLIKASI],
        ], [
            'nama_sekolah.required' => 'Nama sekolah wajib diisi.',
            'nama_sekolah.min'      => 'Nama sekolah minimal 2 karakter.',
            'nama_sekolah.max'      => 'Nama sekolah maksimal ' . self::MAKS_SEKOLAH . ' karakter.',
            'nama_aplikasi.max'     => 'Nama aplikasi maksimal ' . self::MAKS_APLIKASI . ' karakter.',
        ]);

        $sekolah  = trim($data['nama_sekolah']);
        $aplikasi = trim((string) ($data['nama_aplikasi'] ?? ''));

        $sebelum = [
            'sekolah'  => Pengaturan::namaSekolah(),
            'aplikasi' => Pengaturan::namaAplikasi(),
        ];

        Pengaturan::tulis(Pengaturan::NAMA_SEKOLAH, $sekolah, $this->id());
        Pengaturan::tulis(Pengaturan::NAMA_APLIKASI, $aplikasi ?: null, $this->id());

        $perubahan = [];

        if ($sebelum['sekolah'] !== $sekolah) {
            $perubahan[] = 'nama sekolah "' . $sebelum['sekolah'] . '" -> "' . $sekolah . '"';
        }

        $aplikasiBaru = $aplikasi ?: Pengaturan::BAWAAN_NAMA_APLIKASI;

        if ($sebelum['aplikasi'] !== $aplikasiBaru) {
            $perubahan[] = 'nama aplikasi "' . $sebelum['aplikasi'] . '" -> "' . $aplikasiBaru . '"';
        }

        if ($perubahan !== []) {
            CatatanAktivitas::catat(
                'pengaturan.identitas',
                'Mengubah identitas sekolah: ' . Str::limit(implode('; ', $perubahan), 180)
            );
        }

        return response()->json([
            'berhasil' => true,
            'pesan'    => 'Identitas sekolah disimpan.',
            'tipe'     => 'sukses',
        ] + $this->data());
    }

    /**
     * Reset ke nama bawaan (kosong di pengaturan, jadi config yang dipakai).
     * Berguna saat satu instalan dipakai berganti sekolah.
     */
    public function reset(): JsonResponse
    {
        $this->butuhIzin('pengaturan');

        Pengaturan::tulis(Pengaturan::NAMA_SEKOLAH, null, $this->id());
        Pengaturan::tulis(Pengaturan::NAMA_APLIKASI, null, $this->id());

        CatatanAktivitas::catat('pengaturan.identitas', 'Mengembalikan identitas sekolah ke bawaan sistem.');

        return response()->json([
            'berhasil' => true,
            'pesan'    => 'Identitas sekolah dikembalikan ke bawaan sistem.',
            'tipe'     => 'sukses',
        ] + $this->data());
    }

    /**
     * Bentuk data untukfrontend. `dari_bawaan` menandai nilai masih dari
     * config/laporan.php, bukan hasil simpan di halaman Pengaturan.
     */
    private function data(): array
    {
        $sekolah  = Pengaturan::namaSekolah();
        $aplikasi = Pengaturan::namaAplikasi();

        return [
            'nama_sekolah'     => $sekolah,
            'nama_aplikasi'    => $aplikasi,
            'judul_aplikasi'   => Pengaturan::judulAplikasi(),
            // Bawaan sistem (config/laporan.php) — ditampilkan sebagai pedoman.
            'bawaan_sekolah'   => (string) config('laporan.sekolah'),
            'bawaan_aplikasi' => Pengaturan::BAWAAN_NAMA_APLIKASI,
            // true = belum pernah diubah dari halaman ini.
            'dari_bawaan'      => Pengaturan::baca(Pengaturan::NAMA_SEKOLAH) === null,

            // Kerahasiaan hasil sementara. Nilai `boleh_ubah` dipakai frontend
            // untuk menampilkan sakelar hanya kepada Super Admin.
            'sembunyikan_hasil' => Pengaturan::benar(Pengaturan::SEMBUNYIKAN_HASIL_SEMENTARA),
            'boleh_ubah_hasil'  => auth('admin')->user()?->adalahSuperAdmin() ?? false,
        ];
    }
}