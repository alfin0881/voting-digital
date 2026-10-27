<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use App\Models\Pengaturan;
use App\Models\TugasLatar;
use App\Services\DatabaseBackup as Backup;
use App\Services\DatabaseRestore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Pusat perkakas: backup database, backup terjadwal, dan tugas latar.
 */
class AdminBackupController extends Controller
{
    use AdminApi;

    public function index(): JsonResponse
    {
        $admin  = $this->butuhIzin('backup');

        $backup = app(Backup::class);
        $tabel  = $backup->tabel();

        $daftarBackup = collect($backup->daftarBackup())->map(function ($path) use ($admin) {
            $disk = Storage::disk('local');
            $nama = basename($path);

            return [
                'nama'   => $nama,
                'ukuran' => $this->ukuranManusiawi($disk->size($path)),
                'waktu'  => Carbon::createFromTimestamp($disk->lastModified($path))
                                ->timezone('Asia/Jakarta')->toIso8601String(),
                'terenkripsi'     => str_ends_with($nama, Backup::EKSTENSI),
                // Restore hanya untuk Super Admin & file berformat .sql.enc.
                'bisa_dipulihkan' => $admin->adalahSuperAdmin()
                    && str_ends_with($nama, Backup::EKSTENSI),
            ];
        });

        $terakhir = CatatanAktivitas::where('aksi', 'backup.unduh')->latest()->first();
        $restoreTerakhir = CatatanAktivitas::where('aksi', 'backup.restore')->latest('id')->first();

        return response()->json([
            'driver'       => $backup->driver(),
            'nama_database'=> $backup->namaDatabase(),
            'jumlah_tabel' => count($tabel),
            'daftar_tabel' => $tabel,
            'ukuran'       => $this->ukuranManusiawi($backup->ukuranByte()),
            'terakhir'     => $terakhir ? [
                'deskripsi' => $terakhir->deskripsi,
                'waktu'     => $terakhir->created_at?->timezone('Asia/Jakarta')->toIso8601String(),
            ] : null,
            'restore_terakhir' => $restoreTerakhir ? [
                'deskripsi' => $restoreTerakhir->deskripsi,
                'waktu'     => $restoreTerakhir->created_at?->timezone('Asia/Jakarta')->toIso8601String(),
            ] : null,
            'boleh_pulihkan' => $admin->adalahSuperAdmin(),
            'jadwal' => [
                'aktif'    => Pengaturan::benar(Pengaturan::BACKUP_JADWAL_AKTIF),
                'jam'      => (int) Pengaturan::baca(Pengaturan::BACKUP_JAM, '23'),
                'retensi'  => (int) Pengaturan::baca(Pengaturan::BACKUP_RETENSI, '7'),
                'terakhir' => Pengaturan::baca(Pengaturan::BACKUP_TERAKHIR_JADWAL),
            ],
            'daftar_backup' => $daftarBackup,
            'tugas' => TugasLatar::latest()->limit(20)->get()->map(fn (TugasLatar $t) => [
                'id'           => $t->id,
                'jenis'        => $t->jenis,
                'judul'        => $t->judul,
                'status'       => $t->status,
                'status_label' => $t->labelStatus(),
                'warna'        => $t->warna(),
                'pesan'        => $t->pesan,
                'nama_file'    => $t->nama_file,
                'siap_diunduh' => $t->siapDiunduh(),
                'dibuat'       => $t->created_at?->timezone('Asia/Jakarta')->toIso8601String(),
                'selesai'      => $t->selesai_pada?->timezone('Asia/Jakarta')->toIso8601String(),
            ]),
        ]);
    }

    public function simpanJadwal(Request $request): JsonResponse
    {
        $this->butuhIzin('backup');

        $data = $request->validate([
            'aktif'   => ['required', 'boolean'],
            'jam'     => ['required', 'integer', 'min:0', 'max:23'],
            'retensi' => ['required', 'integer', 'min:1', 'max:60'],
        ], [
            'jam.min'     => 'Jam harus 0-23.',
            'jam.max'     => 'Jam harus 0-23.',
            'retensi.min' => 'Retensi minimal 1 file.',
            'retensi.max' => 'Retensi maksimal 60 file.',
        ]);

        Pengaturan::tulis(Pengaturan::BACKUP_JADWAL_AKTIF, $data['aktif'] ? '1' : '0', $this->id());
        Pengaturan::tulis(Pengaturan::BACKUP_JAM, (string) $data['jam'], $this->id());
        Pengaturan::tulis(Pengaturan::BACKUP_RETENSI, (string) $data['retensi'], $this->id());

        CatatanAktivitas::catat('backup.terjadwal', 'Mengatur backup terjadwal: '
            . ($data['aktif'] ? "aktif jam {$data['jam']}:00" : 'nonaktif')
            . ", retensi {$data['retensi']} file.");

        return $this->pesan('Pengaturan backup terjadwal disimpan.');
    }

    /** Jalankan backup sekarang (tanpa menunggu jadwal). */
    public function jalankan(Request $request): JsonResponse
    {
        $this->butuhIzin('backup');

        $retensi = max(1, (int) Pengaturan::baca(Pengaturan::BACKUP_RETENSI, '7'));

        try {
            $nama = Backup::FOLDER . '/voting-' . now()->format('Ymd-His') . '.sql.enc';
            $byte = app(Backup::class)->simpan($nama);
            app(Backup::class)->hapusLama($retensi);

            CatatanAktivitas::catat('backup.terjadwal', "Backup manual terenkripsi tersimpan ke server ({$nama}).");

            return $this->pesan('Backup terenkripsi tersimpan di server (' . $this->ukuranManusiawi($byte) . ').');
        } catch (\Throwable $e) {
            return $this->gagal('Backup gagal: ' . $e->getMessage(), 422, 'gagal');
        }
    }

    /**
     * Pulihkan database dari backup terenkripsi.
     *
     * Konfirmasi ketat:
     * 1. hanya Super Admin,
     * 2. nama file harus diketik ulang persis,
     * 3. password akun harus benar,
     * 4. otomatis membuat backup pengaman sebelum menimpa data.
     */
    public function pulihkan(Request $request): JsonResponse
    {
        $admin = $this->butuhSuperAdmin('backup');

        $data = $request->validate([
            'nama'           => ['required', 'string', 'max:255'],
            'konfirmasi'     => ['required', 'string', 'max:255'],
            'password'       => ['required', 'string'],
            'cadangkan_dulu' => ['nullable', 'boolean'],
        ], [
            'nama.required'       => 'File backup wajib dipilih.',
            'konfirmasi.required' => 'Ketik ulang nama file untuk konfirmasi.',
            'password.required'   => 'Password akun wajib diisi.',
        ]);

        $nama = basename((string) $data['nama']);
        $path = Backup::FOLDER . '/' . $nama;
        $backup = app(Backup::class);

        if (! in_array($path, $backup->daftarBackup(), true)) {
            return $this->gagal('File backup tidak ditemukan di server.', 422, 'tidak_ada');
        }

        if (! $backup->terenkripsi($path)) {
            return $this->gagal(
                'Hanya backup terenkripsi (.sql.enc) yang dapat dipulihkan.',
                422,
                'tidak_terenkripsi'
            );
        }

        if (trim((string) $data['konfirmasi']) !== $nama) {
            throw ValidationException::withMessages([
                'konfirmasi' => 'Nama file tidak cocok. Ketik persis: ' . $nama,
            ]);
        }

        if (! Hash::check((string) $data['password'], (string) $admin->password)) {
            throw ValidationException::withMessages([
                'password' => 'Password salah.',
            ]);
        }

        // Backup pengaman: kalau restore keliru memilih file, data sebelum
        // restore masih bisa dikembalikan. Tidak ikut retensi otomatis.
        $pengaman = null;
        if ((bool) ($data['cadangkan_dulu'] ?? true)) {
            $pengaman = Backup::FOLDER . '/pra-restore-' . now()->format('Ymd-His') . '.sql.enc';
            $backup->simpan($pengaman);
        }

        try {
            $jumlah = app(DatabaseRestore::class)->pulihkan($path);
        } catch (\Throwable $e) {
            $this->catatRestore($admin, false, "Restore GAGAL dari \"{$nama}\": " . $e->getMessage());

            return $this->gagal('Restore gagal: ' . $e->getMessage(), 500, 'restore_gagal');
        }

        $this->catatRestore(
            $admin,
            true,
            "Memulihkan database dari \"{$nama}\" ({$jumlah} statement)"
                . ($pengaman ? "; backup pengaman: \"" . basename($pengaman) . '"' : '') . '.'
        );

        return $this->pesan(
            'Database berhasil dipulihkan dari "' . $nama . '". '
            . ($pengaman ? 'Salinan sebelum restore disimpan sebagai "' . basename($pengaman) . '". ' : '')
            . 'Muat ulang halaman; bila akun Anda berubah, login kembali.'
        );
    }

    /**
     * Catat restore setelah database diganti.
     *
     * Restore bisa mengganti tabel admins, jadi admin_id hanya dipakai bila
     * id tersebut masih ada di data hasil restore (menghindari pelanggaran FK).
     */
    private function catatRestore(\App\Models\Admin $admin, bool $berhasil, string $deskripsi): void
    {
        try {
            $masihAda = \App\Models\Admin::whereKey($admin->id)->exists();

            CatatanAktivitas::create([
                'admin_id'   => $masihAda ? $admin->id : null,
                'nama_admin' => $admin->nama,
                'aksi'       => $berhasil ? 'backup.restore' : 'backup.restore_gagal',
                'deskripsi'  => $deskripsi,
                'ip_address' => request()->ip(),
            ]);
        } catch (\Throwable $e) {
            // Jangan gagalkan respons hanya karena audit log tidak bisa ditulis
            // (mis. restore mengubah struktur tabel catatan_aktivitas).
            \Illuminate\Support\Facades\Log::error('Gagal mencatat audit restore.', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function hapusTugas(int $id): JsonResponse
    {
        $this->butuhIzin('backup');

        $tugas = TugasLatar::find($id);

        if ($tugas?->nama_file) {
            Storage::disk('local')->delete($tugas->nama_file);
        }

        $tugas?->delete();

        return $this->pesan('Tugas dihapus.');
    }

    private function ukuranManusiawi(int $byte): string
    {
        $satuan = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = 0;
        $nilai = (float) $byte;

        while ($nilai >= 1024 && $i < count($satuan) - 1) {
            $nilai /= 1024;
            $i++;
        }

        return round($nilai, $i === 0 ? 0 : 1) . ' ' . $satuan[$i];
    }
}