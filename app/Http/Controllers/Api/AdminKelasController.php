<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use App\Models\Kelas;
use App\Models\Pemilih;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminKelasController extends Controller
{
    use AdminApi;

    public function index(Request $request): JsonResponse
    {
        $this->butuhIzin('anggota');

        // Sinkronkan kelas yang sudah dipakai pemilih tapi belum ada di tabel.
        Kelas::sinkronDariPemilih();

        $jumlahPerKelas = Pemilih::query()
            ->whereNotNull('kelas')->where('kelas', '!=', '')
            ->selectRaw('kelas, COUNT(*) as jumlah')
            ->groupBy('kelas')
            ->pluck('jumlah', 'kelas');

        // Urut alami: "X RPL 2" sebelum "X RPL 10", bukan urutan abjad mentah.
        $daftar = Kelas::query()
            ->get()
            ->sort(fn (Kelas $a, Kelas $b) => strnatcasecmp($a->nama, $b->nama))
            ->values()
            ->map(fn (Kelas $k) => [
                'id'     => $k->id,
                'nama'   => $k->nama,
                'jumlah' => (int) ($jumlahPerKelas[$k->nama] ?? 0),
            ]);

        return response()->json([
            'kelas'        => $daftar,
            'total'        => $daftar->count(),
            'tanpa_kelas'  => Pemilih::query()
                ->where(fn ($q) => $q->whereNull('kelas')->orWhere('kelas', ''))
                ->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->butuhIzin('anggota');

        $data = $request->validate(
            ['nama' => ['required', 'string', 'max:50']],
            ['nama.required' => 'Nama kelas wajib diisi', 'nama.max' => 'Nama kelas maksimal 50 karakter'],
        );

        $nama = Kelas::normalisasi($data['nama']);

        if ($nama === '') {
            throw ValidationException::withMessages(['nama' => 'Nama kelas tidak boleh kosong.']);
        }

        // Duplikat dikembalikan sebagai error validasi, bukan sukses palsu.
        // Frontend menampilkannya di bawah kolom agar admin tahu kelas sudah ada.
        $ada = Kelas::cariNama($nama);

        if ($ada) {
            throw ValidationException::withMessages([
                'nama' => "Kelas \"{$ada->nama}\" sudah terdaftar.",
            ]);
        }

        Kelas::create(['nama' => $nama]);

        CatatanAktivitas::catat('anggota.tambah_kelas', "Menambah kelas \"{$nama}\".");

        return $this->pesan("Kelas \"{$nama}\" ditambahkan.");
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->butuhIzin('anggota');

        $data = $request->validate(
            ['nama' => ['required', 'string', 'max:50']],
            ['nama.required' => 'Nama kelas wajib diisi', 'nama.max' => 'Nama kelas maksimal 50 karakter'],
        );

        $kelas = Kelas::findOrFail($id);
        $lama = $kelas->nama;
        $baru = Kelas::normalisasi($data['nama']);

        if ($baru === '') {
            throw ValidationException::withMessages(['nama' => 'Nama kelas tidak boleh kosong.']);
        }

        if ($baru === $lama) {
            return $this->pesan('Nama kelas tidak berubah.', 'informasi');
        }

        $duplikat = Kelas::cariNama($baru);

        if ($duplikat && $duplikat->id !== $kelas->id) {
            // Gabungkan: pindahkan seluruh anggota ke kelas yang sudah ada,
            // lalu hapus baris kelas lama supaya tidak ada duplikat.
            $tujuan = $duplikat->nama;

            $jumlah = DB::transaction(function () use ($lama, $tujuan, $kelas) {
                $jumlah = Pemilih::where('kelas', $lama)->update(['kelas' => $tujuan]);
                $kelas->delete();

                return $jumlah;
            });

            CatatanAktivitas::catat(
                'anggota.ubah_kelas',
                "Menggabungkan kelas \"{$lama}\" ke \"{$tujuan}\" ({$jumlah} anggota)."
            );

            return $this->pesan(
                "Kelas \"{$lama}\" digabung ke \"{$tujuan}\". {$jumlah} anggota dipindahkan.",
                'informasi'
            );
        }

        $jumlah = DB::transaction(function () use ($kelas, $lama, $baru) {
            $jumlah = Pemilih::where('kelas', $lama)->update(['kelas' => $baru]);
            $kelas->update(['nama' => $baru]);

            return $jumlah;
        });

        CatatanAktivitas::catat('anggota.ubah_kelas', "Mengubah kelas \"{$lama}\" menjadi \"{$baru}\".");

        return $this->pesan(
            $jumlah > 0
                ? "Kelas diubah menjadi \"{$baru}\". {$jumlah} anggota ikut dipindahkan."
                : "Kelas diubah menjadi \"{$baru}\"."
        );
    }

    public function destroy(int $id): JsonResponse
    {
        $this->butuhIzin('anggota');

        $kelas = Kelas::findOrFail($id);
        $nama = $kelas->nama;

        $jumlah = DB::transaction(function () use ($nama, $kelas) {
            $jumlah = Pemilih::where('kelas', $nama)->update(['kelas' => null]);
            $kelas->delete();

            return $jumlah;
        });

        CatatanAktivitas::catat('anggota.hapus_kelas', "Menghapus kelas \"{$nama}\" ({$jumlah} anggota).");

        return $this->pesan(
            $jumlah > 0
                ? "Kelas \"{$nama}\" dihapus. {$jumlah} anggota sekarang tanpa kelas."
                : "Kelas \"{$nama}\" dihapus.",
            $jumlah > 0 ? 'peringatan' : 'sukses'
        );
    }
}
