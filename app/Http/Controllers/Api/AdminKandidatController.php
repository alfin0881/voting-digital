<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use App\Models\Kandidat;
use App\Models\Pemilihan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Maatwebsite\Excel\Validators\ValidationException;
use App\Imports\KandidatImport;
use Maatwebsite\Excel\Facades\Excel;

/**
 * Kelola kandidat.
 */
class AdminKandidatController extends Controller
{
    use AdminApi;

    public function index(Request $request): JsonResponse
    {
        $this->butuhIzin('kandidat');

        $pemilihanId = $request->integer('pemilihan') ?: null;

        $kandidat = Kandidat::with('pemilihan:id,nama_pemilihan')
            ->when($pemilihanId, fn ($q) => $q->where('pemilihan_id', $pemilihanId))
            ->latest()
            ->get()
            ->map(fn (Kandidat $k) => [
                'id'            => $k->id,
                'pemilihan_id'  => $k->pemilihan_id,
                'pemilihan_nama'=> $k->pemilihan?->nama_pemilihan,
                'nama_kandidat' => $k->nama_kandidat,
                'nomor_urut'    => $k->nomor_urut,
                'visi'          => $k->visi,
                'misi'          => $k->misi,
                'foto_url'      => $k->fotoUrl(),
            ]);

        return response()->json([
            'kandidat'   => $kandidat,
            'pemilihan'  => $this->daftarPemilihan(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->butuhIzin('kandidat');

        $data = $request->validate($this->aturan(), $this->pesanValidasi());

        $isi = [
            'pemilihan_id'  => $data['pemilihan_id'],
            'nama_kandidat' => $data['nama_kandidat'],
            'nomor_urut'    => $data['nomor_urut'],
            'visi'          => $data['visi'] ?? null,
            'misi'          => $data['misi'] ?? null,
        ];

        if ($request->hasFile('foto')) {
            $isi['foto'] = $request->file('foto')->store('foto-kandidat', 'public');
        }

        $kandidat = Kandidat::create($isi);

        CatatanAktivitas::catat('kandidat.tambah', "Menambah kandidat \"{$kandidat->nama_kandidat}\" (no. {$kandidat->nomor_urut}).");

        return $this->pesan('Kandidat berhasil ditambahkan!');
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->butuhIzin('kandidat');

        $kandidat = Kandidat::findOrFail($id);

        $data = $request->validate($this->aturan($kandidat->id), $this->pesanValidasi());

        // Suara kandidat tidak tergantung pemilihan di baris kandidat: tabel
        // suara menyimpan pemilihan_id sendiri, tetapi perhitungan
        // "total suara per kandidat" mengikuti kandidat. Memindahkan kandidat
        // yang sudah punya suara ke pemilihan lain membuat rekap dua pemilihan
        // kacau (suara lama masuk kandidat di pemilihan baru). Blokir bila ada
        // suara; pindahan tanpa suara tetap aman dan diizinkan.
        $adaSuara = $kandidat->suara()->exists();

        if ($adaSuara && (int) $data['pemilihan_id'] !== (int) $kandidat->pemilihan_id) {
            return $this->gagal(
                "Kandidat \"{$kandidat->nama_kandidat}\" tidak bisa dipindah ke pemilihan lain karena sudah memiliki {$kandidat->suara()->count()} suara.",
                409,
                'sudah_menerima_pemilihan_id'
            );
        }

        $isi = [
            'pemilihan_id'  => $data['pemilihan_id'],
            'nama_kandidat' => $data['nama_kandidat'],
            'nomor_urut'    => $data['nomor_urut'],
            'visi'          => $data['visi'] ?? null,
            'misi'          => $data['misi'] ?? null,
        ];

        // Foto hanya diganti bila ada file baru yang diunggah.
        if ($request->hasFile('foto')) {
            if ($kandidat->foto) {
                Storage::disk('public')->delete($kandidat->foto);
            }
            $isi['foto'] = $request->file('foto')->store('foto-kandidat', 'public');
        }

        $kandidat->update($isi);

        CatatanAktivitas::catat('kandidat.ubah', "Mengubah kandidat \"{$kandidat->nama_kandidat}\".");

        return $this->pesan('Kandidat berhasil diperbarui!');
    }

    public function destroy(int $id): JsonResponse
    {
        $this->butuhIzin('kandidat');

        $kandidat = Kandidat::findOrFail($id);

        // FK suara.kandidat_id memakai ON DELETE CASCADE, jadi menghapus
        // kandidat ikut menghapus suaranya — hasil pemilihan sudah resmi
        // berubah. Kandidat yang sudah menerima suara tidak boleh dihapus;
        // suara anonim tidak bisa dipindahkan ke kandidat lain.
        $jumlahSuara = $kandidat->suara()->count();

        if ($jumlahSuara > 0) {
            return $this->gagal(
                "Kandidat \"{$kandidat->nama_kandidat}\" tidak bisa dihapus karena sudah menerima {$jumlahSuara} suara. "
                . 'Menghapusnya akan merusak rekap hasil pemilihan.',
                409,
                'punya_suara'
            );
        }

        $nama = $kandidat->nama_kandidat;

        if ($kandidat->foto) {
            Storage::disk('public')->delete($kandidat->foto);
        }

        $kandidat->delete();

        CatatanAktivitas::catat('kandidat.hapus', "Menghapus kandidat \"{$nama}\".");

        return $this->pesan('Kandidat berhasil dihapus!');
    }

    /** Impor kandidat dari Excel ke satu pemilihan. */
    public function impor(Request $request): JsonResponse
    {
        $this->butuhIzin('kandidat');

        $data = $request->validate([
            'pemilihan_id' => ['required', 'exists:pemilihan,id'],
            'file'         => ['required', 'mimes:xlsx,xls,csv', 'max:4096'],
        ], [
            'pemilihan_id.required' => 'Pilih pemilihan tujuan.',
            'file.required'         => 'File Excel wajib dipilih.',
            'file.mimes'            => 'File harus .xlsx, .xls, atau .csv.',
            'file.max'              => 'Ukuran file maksimal 4MB.',
        ]);

        try {
            $import = new KandidatImport((int) $data['pemilihan_id']);
            Excel::import($import, $request->file('file')->getRealPath());

            $sukses = $import->getSukses();
            $gagal  = $import->getGagal();
            $nama   = Pemilihan::whereKey($data['pemilihan_id'])->value('nama_pemilihan');

            CatatanAktivitas::catat('kandidat.import', "Impor kandidat ke \"{$nama}\": {$sukses} berhasil, {$gagal} gagal.");

            return response()->json([
                'berhasil' => true,
                'sukses'   => $sukses,
                'gagal'    => $gagal,
                'pesan'    => $gagal > 0
                    ? "Impor selesai. Berhasil: {$sukses}, gagal: {$gagal} (nomor urut duplikat/data tidak valid)."
                    : "Impor berhasil! {$sukses} kandidat ditambahkan.",
                'tipe'     => $gagal > 0 ? 'peringatan' : 'sukses',
            ]);
        } catch (ValidationException $e) {
            $rows = array_unique(array_map(fn ($f) => $f->row(), $e->failures()));

            return $this->gagal('Gagal impor pada baris: ' . implode(', ', $rows), 422, 'baris_gagal');
        } catch (\Throwable $e) {
            return $this->gagal('Gagal impor: ' . $e->getMessage(), 422, 'gagal');
        }
    }

    /**
     * Aturan validasi kandidat.
     *
     * nomor_urut harus angka bulat >= 1 dan unik dalam satu pemilihan —
     * dua kandidat tidak boleh berbagi nomor di bola putar. Saat edit,
     * nomor kandidat yang sedang diedit diabaikan.
     */
    private function aturan(?int $id = null): array
    {
        return [
            'pemilihan_id'  => ['required', 'exists:pemilihan,id'],
            'nama_kandidat' => 'required|min:3',
            'nomor_urut'    => [
                'required',
                'integer',
                'min:1',
                Rule::unique('kandidat', 'nomor_urut')
                    ->where(fn ($q) => $q->where('pemilihan_id', request('pemilihan_id')))
                    ->ignore($id),
            ],
            'foto'          => 'nullable|image|max:2048',
            'visi'          => 'nullable',
            'misi'          => 'nullable',
        ];
    }

    private function pesanValidasi(): array
    {
        return [
            'pemilihan_id.required'  => 'Pemilihan wajib dipilih',
            'pemilihan_id.exists'    => 'Pemilihan tidak valid',
            'nama_kandidat.required' => 'Nama kandidat wajib diisi',
            'nama_kandidat.min'      => 'Nama kandidat minimal 3 karakter',
            'nomor_urut.required'    => 'Nomor urut wajib diisi',
            'nomor_urut.integer'     => 'Nomor urut harus berupa angka',
            'nomor_urut.min'         => 'Nomor urut minimal 1',
            'nomor_urut.unique'      => 'Nomor urut sudah dipakai kandidat lain di pemilihan ini',
            'foto.image'             => 'File harus berupa gambar',
            'foto.max'               => 'Ukuran gambar maksimal 2MB',
        ];
    }

    private function daftarPemilihan()
    {
        return Pemilihan::orderByDesc('tanggal_mulai')
            ->get(['id', 'nama_pemilihan', 'status'])
            ->map(fn ($p) => [
                'id'     => $p->id,
                'nama'   => $p->nama_pemilihan,
                'status' => $p->status,
            ]);
    }
}