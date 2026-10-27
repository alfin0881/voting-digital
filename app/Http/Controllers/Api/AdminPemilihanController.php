<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use App\Models\Kandidat;
use App\Models\Partisipasi;
use App\Models\Pemilihan;
use App\Models\PesertaPemilihan;
use App\Models\Suara;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Kelola pemilihan.
 */
class AdminPemilihanController extends Controller
{
    use AdminApi;

    public function index(Request $request): JsonResponse
    {
        $this->butuhIzin('pemilihan');

        // Semua angka dihitung dengan beberapa query agregat, bukan 4 query
        // per pemilihan. Halaman ini dipakai untuk memantau pemungutan, jadi
        // jumlah pemilihan bisa bertambah tanpa membuatnya makin lambat.
        //
        // Soft delete dipakai sebagai arsip: pemilihan terarsip tidak tampil
        // di daftar normal, dan hanya bisa dilihat lewat ?arsip=1.
        $saringArsip = $request->boolean('arsip');

        $daftarPemilihan = Pemilihan::query()
            ->when($saringArsip, fn ($q) => $q->onlyTrashed(), fn ($q) => $q->withoutTrashed())
            ->withCount('kandidat')
            ->orderByDesc('tanggal_mulai')
            ->orderByDesc('id')
            ->get();

        $ids = $daftarPemilihan->pluck('id')->map(fn ($id) => (int) $id)->all();

        $suara      = $this->hitungPerPemilihan(Suara::query(), $ids);
        $partisipasi = $this->hitungPerPemilihan(Partisipasi::query(), $ids);
        $peserta    = $this->hitungPeserta($ids);
        $dijeda     = Pemilihan::sedangDijeda();
        $sekarang   = Carbon::now();

        $daftar = $daftarPemilihan->map(fn (Pemilihan $p) => [
            'id'              => $p->id,
            'nama'            => $p->nama_pemilihan,
            'deskripsi'       => $p->deskripsi,
            'tanggal_mulai'   => $p->tanggal_mulai?->format('Y-m-d'),
            'tanggal_selesai' => $p->tanggal_selesai?->format('Y-m-d'),
            'jam_mulai'       => substr($p->jamMulaiEfektif(), 0, 5),
            'jam_selesai'     => substr($p->jamSelesaiEfektif(), 0, 5),
            'status'          => $p->status,
            'putaran'         => $p->putaran,
            'keadaan'         => $this->keadaan($p, $sekarang, $dijeda),
            'dijeda'          => $dijeda,
            'jumlah_kandidat' => (int) $p->kandidat_count,
            'total_suara'     => $suara[(int) $p->id] ?? 0,
            'total_peserta'   => $peserta[(int) $p->id] ?? 0,
            'sudah_memilih'   => $partisipasi[(int) $p->id] ?? 0,
            'diarsipkan_at'   => $p->deleted_at?->format('d M Y'),
        ]);

        return response()->json([
            'pemilihan' => $daftar,
            'dijeda'    => $dijeda,
            'arsip'     => $saringArsip,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->butuhIzin('pemilihan');

        $data = $this->validasiJadwal($request);

        $pemilihan = Pemilihan::create([
            'nama_pemilihan'   => trim($data['nama_pemilihan']),
            'deskripsi'        => isset($data['deskripsi']) ? trim($data['deskripsi']) : null,
            'tanggal_mulai'    => $data['tanggal_mulai'],
            'tanggal_selesai'  => $data['tanggal_selesai'],
            'jam_mulai'        => $data['jam_mulai'],
            'jam_selesai'      => $data['jam_selesai'],
            'status'           => $data['status'],
        ]);

        CatatanAktivitas::catat('pemilihan.tambah', "Menambah pemilihan \"{$pemilihan->nama_pemilihan}\" ({$pemilihan->status}).");

        return $this->pesan('Pemilihan berhasil ditambahkan.');
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->butuhIzin('pemilihan');

        $pemilihan = Pemilihan::findOrFail($id);

        $data = $this->validasiJadwal($request);

        $pemilihan->update([
            'nama_pemilihan'   => trim($data['nama_pemilihan']),
            'deskripsi'        => isset($data['deskripsi']) ? trim($data['deskripsi']) : null,
            'tanggal_mulai'    => $data['tanggal_mulai'],
            'tanggal_selesai'  => $data['tanggal_selesai'],
            'jam_mulai'        => $data['jam_mulai'],
            'jam_selesai'      => $data['jam_selesai'],
            'status'           => $data['status'],
        ]);

        CatatanAktivitas::catat('pemilihan.ubah', "Mengubah pemilihan \"{$pemilihan->nama_pemilihan}\".");

        return $this->pesan('Pemilihan berhasil diperbarui.');
    }

    /**
     * Hapus pemilihan.
     *
     * Tanpa konfirmasi tambahan -> pemilihan DIARSIPKAN (soft delete):
     * suara, partisipasi, dan kandidat tetap utuh, dan bisa dipulihkan.
     *
     * Bila request mengirim `konfirmasi` yang persis sama dengan nama
     * pemilihan -> hapus PERMANEN, termasuk seluruh riwayat suara di
     * tabel suara yang anonim. Inilah konfirmasi berlapisnya: modal di
     * halaman admin sudah jadi lapisan pertama, mengetik nama wajib
     * menjadi lapisan kedua — kalau salah ketik, hapus permanen ditolak.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->butuhIzin('pemilihan');

        // withTrashed: pemilihan di arsip boleh langsung dihapus permanen.
        $pemilihan = Pemilihan::withTrashed()->findOrFail($id);
        $nama = $pemilihan->nama_pemilihan;

        $konfirmasi = trim((string) $request->input('konfirmasi', ''));

        if ($konfirmasi === '') {
            if ($pemilihan->trashed()) {
                return $this->gagal(
                    "Pemilihan \"{$nama}\" sudah diarsipkan. Untuk menghapus permanen (termasuk seluruh riwayat suara), ketik nama pemilihan: \"{$nama}\".",
                    409,
                    'perlu_konfirmasi'
                );
            }

            $pemilihan->delete();

            CatatanAktivitas::catat(
                'pemilihan.arsip',
                "Mengarsipkan pemilihan \"{$nama}\" (suara & partisipasi tetap tersimpan)."
            );

            return $this->pesan(
                "Pemilihan \"{$nama}\" diarsipkan. Data masih bisa dipulihkan dari tab Arsip. "
                . "Untuk menghapus permanen, gunakan konfirmasi ketik nama.",
                'peringatan'
            );
        }

        if (strcasecmp($konfirmasi, $nama) !== 0) {
            return $this->gagal(
                'Konfirmasi tidak cocok. Ketik nama pemilihan dengan tepat untuk menghapus permanen.',
                422,
                'konfirmasi_salah'
            );
        }

        DB::transaction(function () use ($pemilihan) {
            $pemilihanId = (int) $pemilihan->id;

            foreach ($pemilihan->kandidat()->get() as $kandidat) {
                if ($kandidat->foto) {
                    Storage::disk('public')->delete($kandidat->foto);
                }
            }

            // Hapus eksplisit, tidak hanya mengandalkan ON DELETE CASCADE:
            // SQLite bisa berjalan tanpa PRAGMA foreign_keys.
            Suara::where('pemilihan_id', $pemilihanId)->delete();
            Partisipasi::where('pemilihan_id', $pemilihanId)->delete();
            Kandidat::where('pemilihan_id', $pemilihanId)->delete();

            // ID pemilihan masih tersimpan di JSON peserta_pemilihan. Kalau
            // dibiarkan, ID yang dipakai ulang (mis. SQLite) bisa membuat
            // siswa lama otomatis terdaftar di pemilihan baru.
            PesertaPemilihan::query()
                ->whereJsonContains('pemilihan_ids', $pemilihanId)
                ->get()
                ->each(function (PesertaPemilihan $peserta) use ($pemilihanId) {
                    $ids = array_values(array_filter(
                        (array) ($peserta->pemilihan_ids ?? []),
                        fn ($id) => (int) $id !== $pemilihanId
                    ));

                    $voting = (array) ($peserta->status_voting ?? []);
                    unset($voting[(string) $pemilihanId]);

                    $peserta->update([
                        'pemilihan_ids' => $ids,
                        'status_voting' => $voting,
                    ]);
                });

            // Putaran kedua tidak boleh menunjuk induk yang sudah tidak ada.
            Pemilihan::where('induk_id', $pemilihanId)->update(['induk_id' => null]);

            $pemilihan->forceDelete();
        });

        CatatanAktivitas::catat('pemilihan.hapus', "Menghapus PERMANEN pemilihan \"{$nama}\" beserta seluruh riwayat suaranya.");

        return $this->pesan('Pemilihan beserta seluruh riwayatnya berhasil dihapus permanen.');
    }

    /** Pulihkan pemilihan yang diarsipkan (soft delete dibatalkan). */
    public function pulihkan(int $id): JsonResponse
    {
        $this->butuhIzin('pemilihan');

        $pemilihan = Pemilihan::onlyTrashed()->findOrFail($id);

        $pemilihan->restore();

        CatatanAktivitas::catat('pemilihan.pulihkan', "Memulihkan pemilihan \"{$pemilihan->nama_pemilihan}\" dari arsip.");

        return $this->pesan("Pemilihan \"{$pemilihan->nama_pemilihan}\" berhasil dipulihkan dari arsip.");
    }

    /** Aktifkan / nonaktifkan cepat. */
    public function ubahStatus(int $id): JsonResponse
    {
        $this->butuhIzin('pemilihan');

        $pemilihan = Pemilihan::findOrFail($id);

        $pemilihan->status = $pemilihan->status === 'aktif' ? 'nonaktif' : 'aktif';
        $pemilihan->save();

        CatatanAktivitas::catat('pemilihan.ubah_status', "Pemilihan \"{$pemilihan->nama_pemilihan}\" diubah menjadi {$pemilihan->status}.");

        // Beri tahu bila status "aktif" belum berarti suara bisa masuk.
        // Admin sering mengira tombol aktif = pemilih langsung bisa memilih.
        $catatan = '';

        if ($pemilihan->status === 'aktif') {
            if (! $pemilihan->beradaDiRentangWaktu()) {
                $catatan = ' Jadwal pemilihan belum dimulai atau sudah lewat (cek tanggal dan jam), jadi suara belum bisa masuk.';
            } elseif (Pemilihan::sedangDijeda()) {
                $catatan = ' Pemungutan suara sedang dijeda di halaman Kendali Hari-H.';
            } elseif (! $pemilihan->kandidat()->exists()) {
                $catatan = ' Pemilihan belum punya kandidat.';
            }
        }

        return $this->pesan(
            "Status diubah menjadi {$pemilihan->status}.{$catatan}",
            $catatan === '' ? 'sukses' : 'peringatan'
        );
    }

    /**
     * Keadaan nyata pemilihan menurut WAKTU SERVER.
     *
     * Frontend tidak lagi menghitung sendiri dengan jam komputer admin,
     * sehingga status tetap benar walau zona waktu perangkat berbeda.
     */
    private function keadaan(Pemilihan $pemilihan, Carbon $sekarang, bool $dijeda): string
    {
        // Baris arsip (soft delete) punya keadaan sendiri supaya kartu di
        // halaman admin tampil dengan label & gaya yang berbeda.
        if ($pemilihan->trashed()) {
            return 'Diarsipkan';
        }

        if ($pemilihan->status !== 'aktif') {
            return 'Nonaktif';
        }

        if ($pemilihan->tanggal_mulai && $pemilihan->belumMulai($sekarang)) {
            return 'Akan mulai';
        }

        if ($pemilihan->tanggal_selesai && $pemilihan->sudahLewatWaktu($sekarang)) {
            return 'Selesai';
        }

        return $dijeda ? 'Dijeda' : 'Berlangsung';
    }

    /** Jumlah suara/partisipasi per pemilihan dalam satu query GROUP BY. */
    private function hitungPerPemilihan($query, array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $hasil = array_fill_keys($ids, 0);

        $baris = $query->selectRaw('pemilihan_id, COUNT(*) as jumlah')
            ->whereIn('pemilihan_id', $ids)
            ->groupBy('pemilihan_id')
            ->pluck('jumlah', 'pemilihan_id');

        foreach ($baris as $id => $jumlah) {
            $hasil[(int) $id] = (int) $jumlah;
        }

        return $hasil;
    }

    /**
     * Jumlah peserta per pemilihan dari kolom JSON peserta_pemilihan.
     *
     * Satu kali baca seluruh tabel, bukan satu COUNT JSON per pemilihan.
     */
    private function hitungPeserta(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $hasil = array_fill_keys($ids, 0);

        foreach (PesertaPemilihan::query()->select('pemilihan_ids')
            ->whereNotNull('pemilihan_ids')->get() as $peserta) {
            foreach ((array) $peserta->pemilihan_ids as $id) {
                $id = (int) $id;

                if (array_key_exists($id, $hasil)) {
                    $hasil[$id]++;
                }
            }
        }

        return $hasil;
    }

    /**
     * Validasi input + normalisasi jam + pastikan waktu selesai SETELAH waktu mulai.
     *
     * Jam kosong = sepanjang hari (00:00:00 - 23:59:59), jadi klien lama yang
     * belum mengirim jam tetap bekerja seperti sebelumnya.
     *
     * @return array<string, mixed>
     */
    private function validasiJadwal(Request $request): array
    {
        $data = $request->validate($this->aturan(), $this->pesanValidasi());

        $data['jam_mulai']   = Pemilihan::normalisasiJam($data['jam_mulai'] ?? null, '00:00:00');
        $data['jam_selesai'] = Pemilihan::normalisasiJam($data['jam_selesai'] ?? null, '23:59:59');

        // "23:59" dari formulir berarti "sampai akhir hari" (sama seperti perilaku lama).
        if ($data['jam_selesai'] === '23:59:00') {
            $data['jam_selesai'] = '23:59:59';
        }

        $mulai   = Carbon::parse($data['tanggal_mulai'] . ' ' . $data['jam_mulai']);
        $selesai = Carbon::parse($data['tanggal_selesai'] . ' ' . $data['jam_selesai']);

        if ($selesai->lte($mulai)) {
            throw ValidationException::withMessages([
                'jam_selesai' => 'Waktu selesai harus setelah waktu mulai. Periksa tanggal dan jam.',
            ]);
        }

        return $data;
    }

    private function aturan(): array
    {
        return [
            'nama_pemilihan'   => 'required|min:3|max:150',
            'deskripsi'        => 'nullable|max:2000',
            'tanggal_mulai'    => 'required|date',
            'tanggal_selesai'  => 'required|date|after_or_equal:tanggal_mulai',
            'jam_mulai'        => 'nullable|date_format:H:i',
            'jam_selesai'      => 'nullable|date_format:H:i',
            'status'           => 'required|in:aktif,nonaktif',
        ];
    }

    private function pesanValidasi(): array
    {
        return [
            'nama_pemilihan.required'          => 'Nama pemilihan wajib diisi',
            'nama_pemilihan.min'               => 'Nama pemilihan minimal 3 karakter',
            'nama_pemilihan.max'               => 'Nama pemilihan maksimal 150 karakter',
            'deskripsi.max'                    => 'Deskripsi maksimal 2000 karakter',
            'tanggal_mulai.required'           => 'Tanggal mulai wajib diisi',
            'tanggal_selesai.required'         => 'Tanggal selesai wajib diisi',
            'tanggal_selesai.after_or_equal'   => 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai',
            'jam_mulai.date_format'            => 'Jam mulai harus berformat JJ:MM (mis. 07:00)',
            'jam_selesai.date_format'          => 'Jam selesai harus berformat JJ:MM (mis. 12:00)',
            'status.in'                        => 'Status tidak valid',
        ];
    }
}
