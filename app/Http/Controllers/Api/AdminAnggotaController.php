<?php

namespace App\Http\Controllers\Api;

use App\Exports\TemplateAnggotaExport;
use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Imports\AnggotaImport;
use App\Jobs\ImporAnggotaJob;
use App\Models\CatatanAktivitas;
use App\Models\Partisipasi;
use App\Models\Pemilih;
use App\Models\Kelas;
use App\Models\Pemilihan;
use App\Models\PesertaPemilihan;
use App\Models\TugasLatar;
use App\Support\KodePemilih;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;
use Maatwebsite\Excel\Validators\ValidationException;

/**
 * Kelola pemilih (anggota) untuk panel admin.
 *
 * Catatan: password pemilih disimpan sebagai HASH (untuk login), sedangkan kode
 * asli untuk kartu disimpan terpisah & TERENKRIPSI di kolom kode_kartu. Membuka
 * kode butuh izin 'kode_kartu' dan selalu dicatat di audit log.
 */
class AdminAnggotaController extends Controller
{
    use AdminApi;

    /** Daftar pemilih + rekap anti-golput untuk halaman utama. */
    public function index(Request $request): JsonResponse
    {
        $this->butuhIzin('anggota');

        \App\Models\Kelas::sinkronDariPemilih();

        $perPage  = min(100, max(5, (int) $request->input('per_page', 25)));
        $page     = max(1, (int) $request->input('page', 1));
        $search   = trim((string) $request->input('search', ''));
        $kelas    = (string) $request->input('filter_kelas', '');
        $status   = (string) $request->input('filter_status', '');
        $pemilihanId = max(0, (int) $request->input('filter_pemilihan', 0));
        $sort     = (string) $request->input('sort', 'nama');
        $arah     = $request->input('direction') === 'desc' ? 'desc' : 'asc';

        // Cegah nama kolom acak dari luar masuk ke ORDER BY.
        $kolomAman = in_array($sort, ['nama', 'nis', 'kelas', 'created_at'], true) ? $sort : 'nama';

        $query = Pemilih::query()->select(['id', 'nama', 'nis', 'kelas']);

        if ($search !== '') {
            $query->where(fn ($q) => $q->where('nama', 'like', "%{$search}%")
                                       ->orWhere('nis', 'like', "%{$search}%"));
        }

        if ($kelas === '__tanpa__') {
            $query->where(fn ($q) => $q->whereNull('kelas')->orWhere('kelas', ''));
        } elseif ($kelas !== '') {
            $query->where('kelas', $kelas);
        }

        // Saring peserta satu pemilihan. Dipakai dari kartu "Atur peserta"
        // di halaman Kelola Pemilihan agar admin tidak mencari satu per satu.
        if ($pemilihanId > 0) {
            $query->whereHas('pesertaPemilihan', fn ($q) => $q->whereJsonContains('pemilihan_ids', $pemilihanId));
        }

        // Status "sudah/belum memilih" harus mengikuti pemilihan yang sedang
        // disaring. Sebelumnya filter ini menghitung partisipasi di pemilihan
        // mana pun, sehingga hasilnya menyesatkan saat melihat satu pemilihan.
        $statusPartisipasi = fn ($q) => $q->when(
            $pemilihanId > 0,
            fn ($sub) => $sub->where('pemilihan_id', $pemilihanId)
        );

        // Peserta yang DITANDAI "tidak hadir" oleh admin (anti-golput) pada
        // satu pemilihan: tanda ini disimpan di JSON status_voting
        // peserta_pemilihan, bukan di tabel partisipasi.
        $tidakHadirIds = [];

        if ($pemilihanId > 0) {
            foreach (
                PesertaPemilihan::query()
                    ->whereJsonContains('pemilihan_ids', $pemilihanId)
                    ->whereNotNull('status_voting')
                    ->get(['pemilih_id', 'status_voting']) as $baris
            ) {
                $st = $baris->status_voting[(string) $pemilihanId] ?? null;

                if ($st
                    && empty($st['sudah_memilih'])
                    && ($st['status_hadir'] ?? '') === PesertaPemilihan::STATUS_TIDAK_HADIR) {
                    $tidakHadirIds[] = $baris->pemilih_id;
                }
            }
        }

        if ($status === 'sudah') {
            $query->whereHas('partisipasi', $statusPartisipasi);
        } elseif ($status === 'belum') {
            $query->whereDoesntHave('partisipasi', $statusPartisipasi);
        } elseif ($status === 'tidak') {
            // Filter ini butuh pemilihan yang dipilih; tanpa pemilihan hasilnya
            // memang kosong, karena tanda "tidak hadir" hanya berlaku per pemilihan.
            $query->whereIn('id', $tidakHadirIds);
        }

        $total = (clone $query)->count();

        $baris = $query->orderBy($kolomAman, $arah)->paginate($perPage, ['*'], 'page', $page);

        // Hanya ID pemilih yang benar-benar tampil di halaman ini. Tanpa ini,
        // seluruh tabel partisipasi ditarik ke memori cuma untuk menandai
        // "sudah memilih" pada 25 baris — terlalu berat di sekolah besar.
        $idHalaman = array_map(fn (Pemilih $u) => (int) $u->id, $baris->items());

        // ID pemilih yang sudah memilih (untuk badge di tabel). Bila sedang
        // menyaring satu pemilihan, badge mengikuti pemilihan itu.
        $sudahIds = $idHalaman === []
            ? collect()
            : Partisipasi::whereIn('pemilih_id', $idHalaman)
                ->when($pemilihanId > 0, fn ($q) => $q->where('pemilihan_id', $pemilihanId))
                ->distinct()
                ->pluck('pemilih_id')
                ->flip();

        // Map pemilih_id => pemilihan yang diikuti (satu query, bukan N+1).
        $daftarPemilihan = Pemilihan::orderByDesc('tanggal_mulai')->get();
        $peta = $daftarPemilihan->keyBy('id');
        $mapIkuti = [];

        // Sama seperti di atas: batasi ke ID di halaman ini, bukan seluruh
        // tabel peserta_pemilihan (yang kolomnya berisi JSON).
        if ($idHalaman !== []) {
            $barisPeserta = PesertaPemilihan::query()
                ->whereIn('pemilih_id', $idHalaman)
                ->whereNotNull('pemilihan_ids')
                ->get(['pemilih_id', 'pemilihan_ids']);

            foreach ($barisPeserta as $b) {
                foreach ((array) $b->pemilihan_ids as $id) {
                    $id = (int) $id;
                    if (isset($peta[$id])) {
                        $mapIkuti[$b->pemilih_id][] = ['id' => $id, 'nama' => $peta[$id]->nama_pemilihan];
                    }
                }
            }
        }

        return response()->json([
            'anggota' => collect($baris->items())->map(fn (Pemilih $u) => [
                'id'             => $u->id,
                'nama'           => $u->nama,
                'nis'            => $u->nis,
                'kelas'          => $u->kelas,
                'sudah_memilih'  => $sudahIds->has($u->id),
                'jumlah_pemilihan' => count($mapIkuti[$u->id] ?? []),
                'pemilihan'      => $mapIkuti[$u->id] ?? [],
            ]),
            'meta' => [
                'total'    => $total,
                'page'     => $baris->currentPage(),
                'per_page' => $baris->perPage(),
                'last_page'=> $baris->lastPage(),
            ],
            'filter' => [
                'kelas' => Kelas::orderBy('nama')->pluck('nama')->values()->merge(
                                    Pemilih::whereNotNull('kelas')->where('kelas', '!=', '')->distinct()->pluck('kelas')
                                )->unique()->sort()->values(),
                'rekap' => $this->rekapAntiGolput($daftarPemilihan),
                // Dipakai untuk menandai pilihan filter yang sedang aktif.
                'pemilihan_terpilih' => $pemilihanId ?: null,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->butuhIzin('anggota');

        $data = $request->validate($this->aturanTambah(), $this->pesanValidasi());

        $pemilih = new Pemilih([
            'nama'  => $data['nama'],
            'nis'   => $data['nis'],
            'kelas' => Kelas::normalisasi($data['kelas'] ?? '') ?: null,
        ]);
        // Hash untuk login + salinan terenkripsi untuk cetak kartu.
        $pemilih->aturKode($data['password'])->save();

        CatatanAktivitas::catat('anggota.tambah', "Menambah pemilih \"{$pemilih->nama}\" (NIS {$pemilih->nis}).");

        return $this->pesan('Anggota berhasil ditambahkan!');
    }

    public function show(int $id): JsonResponse
    {
        $this->butuhIzin('anggota');

        $pemilih = Pemilih::findOrFail($id);

        // Kode kartu TIDAK dikirim di sini. Untuk melihatnya, frontend memanggil
        // GET anggota/{id}/kode-kartu (butuh izin 'kode_kartu' dan tercatat di audit log).
        return response()->json([
            'id'              => $pemilih->id,
            'nama'            => $pemilih->nama,
            'nis'             => $pemilih->nis,
            'kelas'           => $pemilih->kelas,
            'punya_kode'      => $pemilih->punyaKodeKartu(),
            'boleh_lihat_kode'=> (bool) $this->ambil()->bolehAkses('kode_kartu'),
        ]);
    }

    /**
     * Tampilkan kode kartu satu pemilih.
     *
     * Dibatasi izin 'kode_kartu' (bukan sekadar 'anggota') dan SETIAP pembukaan
     * dicatat di audit log: siapa, pemilih mana, dari IP mana.
     */
    public function kodeKartu(int $id): JsonResponse
    {
        $this->butuhIzin('kode_kartu');

        $pemilih = Pemilih::findOrFail($id);

        CatatanAktivitas::catat(
            'anggota.lihat_kode',
            "Melihat kode kartu pemilih \"{$pemilih->nama}\" (NIS {$pemilih->nis})."
        );

        $kode = $pemilih->kodeKartuAman();

        if ($kode === null) {
            return response()->json([
                'kode'  => null,
                'pesan' => 'Kode kartu belum tersimpan untuk pemilih ini (data lama). '
                    . 'Gunakan Acak Password untuk menerbitkan kode baru.',
            ]);
        }

        return response()->json(['kode' => $kode]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->butuhIzin('anggota');

        $pemilih = Pemilih::findOrFail($id);

        $data = $request->validate([
            'nama'     => 'required|min:3',
            'nis'      => 'required|unique:pemilih,nis,' . $pemilih->id,
            'kelas'    => 'nullable',
            'password' => 'nullable|min:6',
        ], $this->pesanValidasi());

        $isi = [
            'nama'  => $data['nama'],
            'nis'   => $data['nis'],
            'kelas' => Kelas::normalisasi($data['kelas'] ?? '') ?: null,
        ];

        $pemilih->fill($isi);

        // Kode kartu hanya diganti bila diisi (hash + salinan terenkripsi sekaligus).
        $kodeBerubah = filled($data['password'] ?? null);

        if ($kodeBerubah) {
            $pemilih->aturKode($data['password']);
        }

        $pemilih->save();

        CatatanAktivitas::catat(
            'anggota.ubah',
            "Mengubah pemilih \"{$pemilih->nama}\" (NIS {$pemilih->nis})." . ($kodeBerubah ? ' Kode kartu diganti.' : '')
        );

        return $this->pesan('Anggota berhasil diperbarui!');
    }

    public function destroy(int $id): JsonResponse
    {
        $this->butuhIzin('anggota');

        $pemilih = Pemilih::findOrFail($id);

        // Suara bersifat anonim dan TIDAK terhubung ke tabel pemilih, sementara
        // partisipasi (penanda "sudah memilih") dihapus bersama pemilih lewat
        // ON DELETE CASCADE. Menghapus pemilih yang sudah memilih membuat:
        // 1. total suara > partisipasi (suku suara tidak lagi bisa diaudit), dan
        // 2. bila NIS yang sama dibuat ulang, orang itu bisa memilih lagi (dobel).
        $jumlahPartisipasi = Partisipasi::where('pemilih_id', $pemilih->id)->count();

        if ($jumlahPartisipasi > 0) {
            return $this->gagal(
                "\"{$pemilih->nama}\" tidak bisa dihapus karena sudah memilih di {$jumlahPartisipasi} pemilihan. "
                . 'Suaranya bersifat rahasia sehingga tidak bisa dipindahkan ke record lain.',
                409,
                'sudah_memilih'
            );
        }

        $nama = $pemilih->nama;
        $nis  = $pemilih->nis;

        $pemilih->delete();

        CatatanAktivitas::catat('anggota.hapus', "Menghapus pemilih \"{$nama}\" (NIS {$nis}).");

        return $this->pesan('Anggota berhasil dihapus!');
    }

    /** Acak password satu pemilih. */
    public function acakPassword(int $id): JsonResponse
    {
        // Hasil acak berisi kode asli, jadi butuh izin 'kode_kartu' juga.
        $this->butuhIzin('anggota');
        $this->butuhIzin('kode_kartu');

        $pemilih = Pemilih::findOrFail($id);
        $baru    = KodePemilih::buat();

        $pemilih->aturKode($baru)->save();

        CatatanAktivitas::catat('anggota.acak_password', "Mengacak password pemilih \"{$pemilih->nama}\" (NIS {$pemilih->nis}).");

        return response()->json([
            'berhasil' => true,
            'pesan'    => "Password {$pemilih->nama} berhasil diacak.",
            'hasil'    => [[
                'nama'     => $pemilih->nama,
                'nis'      => $pemilih->nis,
                'kelas'    => $pemilih->kelas,
                'password' => $baru,
            ]],
            'judul'    => 'Password ' . $pemilih->nama,
            'params'   => ['ids' => (string) $pemilih->id],
        ]);
    }

    /**
     * Acak password banyak pemilih sekaligus.
     * Cakupan: 'ids' (terpilih), 'kelas' (filter kelas), atau 'semua'.
     */
    public function acakPasswordBanyak(Request $request): JsonResponse
    {
        $this->butuhIzin('anggota');
        $this->butuhIzin('kode_kartu');

        $data = $request->validate([
            'cakupan' => ['required', 'in:ids,kelas,semua'],
            'ids'     => ['nullable', 'array'],
            'ids.*'   => ['integer'],
            'kelas'   => ['nullable', 'string'],
        ]);

        if ($data['cakupan'] === 'ids') {
            $ids = array_values(array_filter(array_map('intval', $data['ids'] ?? [])));

            if (empty($ids)) {
                return $this->gagal('Belum ada pemilih yang dicentang.', 422, 'kosong');
            }

            $hasil   = $this->acakPada(Pemilih::whereIn('id', $ids)->orderBy('nama'));
            $judul   = 'Pemilih yang dipilih';
            $params  = ['ids' => implode(',', $ids)];
        } elseif ($data['cakupan'] === 'kelas') {
            $hasil   = $this->acakPada(Pemilih::where('kelas', $data['kelas'])->orderBy('nama'));
            $judul   = 'Kelas ' . $data['kelas'];
            $params  = ['kelas' => $data['kelas']];
        } else {
            $hasil   = $this->acakPada(Pemilih::query()->orderBy('nama'));
            $judul   = 'Semua pemilih';
            $params  = [];
        }

        $jumlah = count($hasil);

        CatatanAktivitas::catat('anggota.acak_password', "Acak password {$jumlah} pemilih ({$judul}).");

        return response()->json([
            'berhasil' => true,
            'pesan'    => "Password {$jumlah} pemilih diacak. Salin dari daftar di layar.",
            'hasil'    => $hasil,
            'judul'    => $judul,
            'params'   => $params,
        ]);
    }

    /** Acak password setiap pemilih pada query, kembalikan daftar hasilnya. */
    private function acakPada($query): array
    {
        // Hash bcrypt sengaja lambat; ribuan pemilih bisa melewati batas waktu PHP default.
        @set_time_limit(0);

        $hasil = [];

        $baris = $query->get(['id', 'nama', 'nis', 'kelas']);

        // Kode unik DI DALAM satu kali acak (login memakai NIS + kode, jadi
        // keunikan antar-pemilih tidak lagi bisa/perlu dicek lewat database).
        $dipakai = [];

        foreach ($baris as $user) {
            do {
                $kode = KodePemilih::buat();
            } while (isset($dipakai[$kode]));

            $dipakai[$kode] = true;

            // Lewat model (bukan query builder) agar hash + enkripsi ikut diterapkan.
            $user->aturKode($kode)->save();

            $hasil[] = [
                'nama'     => $user->nama,
                'nis'      => $user->nis,
                'kelas'    => $user->kelas,
                'password' => $kode,
            ];
        }

        return $hasil;
    }

    // =========================================================================
    // PESERTA PEMILIHAN
    // =========================================================================

    public function peserta(int $id): JsonResponse
    {
        $this->butuhIzin('anggota');

        $pemilih = Pemilih::findOrFail($id);

        return response()->json([
            'pemilihan_terpilih' => $pemilih->getPemilihanIds(),
            'daftar'             => Pemilihan::orderByDesc('tanggal_mulai')->get()
                ->map(fn ($p) => [
                    'id'     => $p->id,
                    'nama'   => $p->nama_pemilihan,
                    'status' => $p->status,
                ]),
        ]);
    }

    public function simpanPeserta(Request $request, int $id): JsonResponse
    {
        $this->butuhIzin('anggota');

        $pemilih = Pemilih::findOrFail($id);

        $data = $request->validate([
            'pemilihan' => ['nullable', 'array'],
            'pemilihan.*' => ['integer', 'exists:pemilihan,id'],
        ]);

        $peserta = PesertaPemilihan::ambilAtauBuat($pemilih->id);

        $idLama = $peserta->pemilihan_ids ?? [];
        $idBaru = array_map('intval', $data['pemilihan'] ?? []);

        foreach (array_diff($idBaru, $idLama) as $pemilihanId) {
            $peserta->tambahPemilihan($pemilihanId);
            $peserta->refresh();
        }

        // Hapus yang di-uncheck; tolak bila sudah memilih.
        $tidakBisaDihapus = [];
        foreach (array_diff($idLama, $idBaru) as $pemilihanId) {
            if (! $peserta->hapusPemilihan($pemilihanId)) {
                $tidakBisaDihapus[] = $pemilihanId;
            }
            $peserta->refresh();
        }

        CatatanAktivitas::catat('anggota.ubah', "Mengubah pendaftaran pemilihan pemilih \"{$pemilih->nama}\" (NIS {$pemilih->nis}).");

        if (! empty($tidakBisaDihapus)) {
            return $this->pesan(
                'Berhasil diperbarui. Beberapa pemilihan tidak dapat dihapus karena anggota sudah memilih.',
                'peringatan'
            );
        }

        return $this->pesan('Pendaftaran pemilihan berhasil diperbarui!');
    }

    /** Tandai tidak hadir manual (anti-golput). */
    public function tandaiTidakHadir(Request $request, int $id): JsonResponse
    {
        $this->butuhIzin('anggota');

        $pemilih = Pemilih::findOrFail($id);

        $data = $request->validate(['pemilihan_id' => ['required', 'integer', 'exists:pemilihan,id']]);

        $peserta = PesertaPemilihan::where('pemilih_id', $pemilih->id)->first();

        if ($peserta
            && $peserta->ikutPemilihan((int) $data['pemilihan_id'])
            && ! $peserta->sudahMemilihDi((int) $data['pemilihan_id'])) {

            $peserta->tandaiTidakHadir((int) $data['pemilihan_id'], 'Ditandai oleh admin');

            return $this->pesan('Peserta berhasil ditandai tidak hadir.', 'peringatan');
        }

        return $this->gagal('Tidak dapat ditandai (sudah memilih atau tidak terdaftar).', 422, 'gagal');
    }

    // =========================================================================
    // DETAIL VOTE
    // =========================================================================

    public function detailVote(int $id): JsonResponse
    {
        $this->butuhIzin('anggota');

        $pemilih = Pemilih::with(['pesertaPemilihan', 'partisipasi'])->findOrFail($id);

        $ids = $pemilih->getPemilihanIds();
        $hasil = [];

        if (! empty($ids)) {
            $partisipasi = $pemilih->partisipasi->keyBy('pemilihan_id');
            $voting      = (array) ($pemilih->pesertaPemilihan?->status_voting ?? []);

            foreach (Pemilihan::whereIn('id', $ids)->get() as $p) {
                $row     = $partisipasi[$p->id] ?? null;
                $votingP = $voting[(string) $p->id] ?? null;

                $tidakHadir = ! ($row !== null)
                    && ($votingP['status_hadir'] ?? '') === PesertaPemilihan::STATUS_TIDAK_HADIR;

                $hasil[] = [
                    'pemilihan_id'   => $p->id,
                    'nama'           => $p->nama_pemilihan,
                    'status'         => $p->status,
                    'tanggal_mulai'  => $p->tanggal_mulai?->format('d M Y') . ' ' . substr($p->jamMulaiEfektif(), 0, 5),
                    'tanggal_selesai'=> $p->tanggal_selesai?->format('d M Y') . ' ' . substr($p->jamSelesaiEfektif(), 0, 5),
                    'sudah_memilih'  => $row !== null,
                    // Ditandai "tidak hadir" oleh admin (anti-golput).
                    'tidak_hadir'    => $tidakHadir,
                    // Pilihan kandidat SENGAJA tidak ditampilkan: suara bersifat rahasia.
                    'waktu_memilih'  => $row?->waktu_memilih?->format('d M Y, H:i'),
                ];
            }
        }

        return response()->json([
            'pemilihan' => ['id' => $pemilih->id, 'nama' => $pemilih->nama, 'nis' => $pemilih->nis, 'kelas' => $pemilih->kelas],
            'detail'    => $hasil,
        ]);
    }

    // =========================================================================
    // IMPORT & TEMPLATE
    // =========================================================================

    public function template()
    {
        $this->butuhIzin('anggota');

        return Excel::download(new TemplateAnggotaExport(), 'template-import-anggota.xlsx');
    }

    public function impor(Request $request): JsonResponse
    {
        $this->butuhIzin('anggota');

        $data = $request->validate([
            'file'          => ['required', 'mimes:xlsx,xls,csv', 'max:4096'],
            'kelas'         => ['nullable', 'string', 'max:50'],
            'latar_belakang'=> ['nullable', 'boolean'],
        ], [
            'file.required' => 'File Excel wajib dipilih',
            'file.mimes'    => 'File harus berformat Excel (xlsx, xls, csv)',
            'file.max'      => 'Ukuran file maksimal 4MB',
        ]);

        // Impor besar diproses di latar belakang agar tidak timeout.
        if ($request->boolean('latar_belakang')) {
            $path  = $request->file('file')->store('imports', 'local');
            $tugas = TugasLatar::buat('impor_anggota', 'Impor pemilih dari Excel');

            ImporAnggotaJob::dispatch($tugas->id, $path, $data['kelas'] ?? null);

            CatatanAktivitas::catat('anggota.import_latar', 'Menjalankan impor pemilih di latar belakang.');

            return $this->pesan('Impor diproses di latar belakang. Cek di halaman Backup.');
        }

        try {
            $import = new AnggotaImport($data['kelas'] ?? null);
            Excel::import($import, $request->file('file')->getRealPath());

            $sukses = $import->getSukses();
            $gagal  = $import->getGagal();

            CatatanAktivitas::catat('anggota.import', "Impor pemilih dari Excel: {$sukses} berhasil, {$gagal} gagal.");

            return response()->json([
                'berhasil' => true,
                'sukses'   => $sukses,
                'gagal'    => $gagal,
                'tipe'     => $gagal > 0 ? 'peringatan' : 'sukses',
                'pesan'    => $gagal > 0
                    ? "Import selesai! Berhasil: {$sukses}, Gagal: {$gagal} (NIS duplikat atau data tidak valid)"
                    : "Import berhasil! {$sukses} anggota ditambahkan.",
            ]);
        } catch (ValidationException $e) {
            $rows = array_unique(array_map(fn ($f) => $f->row(), $e->failures()));

            return $this->gagal('Gagal import pada baris: ' . implode(', ', $rows), 422, 'baris_gagal');
        } catch (\Throwable $e) {
            return $this->gagal('Gagal import: ' . $e->getMessage(), 422, 'gagal');
        }
    }

    // =========================================================================
    // REKAP ANTI-GOLPUT
    // =========================================================================

    /** Peserta & yang sudah memilih per pemilihan (sumber: JSON_CONTAINS + tabel partisipasi). */
    private function rekapAntiGolput($daftarPemilihan): array
    {
        $idPemilihan = $daftarPemilihan->pluck('id')->map(fn ($id) => (int) $id)->all();

        $jumlahPeserta = array_fill_keys($idPemilihan, 0);
        $jumlahSudah   = [];
        $jumlahTidak   = [];

        if (! empty($idPemilihan)) {
            // Satu kali baca seluruh peserta_pemilihan, bukan COUNT per pemilihan.
            foreach (PesertaPemilihan::query()->select('pemilihan_ids', 'status_voting')
                     ->whereNotNull('pemilihan_ids')->get() as $baris) {
                $voting = (array) ($baris->status_voting ?? []);

                foreach ((array) $baris->pemilihan_ids as $id) {
                    $id = (int) $id;

                    // Hanya hitung untuk pemilihan yang sedang dilaporkan.
                    if (array_key_exists($id, $jumlahPeserta)) {
                        $jumlahPeserta[$id]++;

                        // Tanda "tidak hadir" dari admin ikut direkap supaya
                        // data itu berguna, bukan sekali set dan terlupakan.
                        $st = $voting[(string) $id] ?? null;

                        if ($st
                            && empty($st['sudah_memilih'])
                            && ($st['status_hadir'] ?? '') === PesertaPemilihan::STATUS_TIDAK_HADIR) {
                            $jumlahTidak[$id] = ($jumlahTidak[$id] ?? 0) + 1;
                        }
                    }
                }
            }

            foreach (Partisipasi::query()->selectRaw('pemilihan_id, COUNT(*) as jumlah')
                     ->whereIn('pemilihan_id', $idPemilihan)
                     ->groupBy('pemilihan_id')->get() as $baris) {
                $jumlahSudah[(int) $baris->pemilihan_id] = (int) $baris->jumlah;
            }
        }

        return $daftarPemilihan->map(function ($pemilihan) use ($jumlahPeserta, $jumlahSudah, $jumlahTidak) {
            $total = $jumlahPeserta[(int) $pemilihan->id] ?? 0;
            $sudah = $jumlahSudah[(int) $pemilihan->id] ?? 0;
            $tidak = $jumlahTidak[(int) $pemilihan->id] ?? 0;

            return [
                'id'               => $pemilihan->id,
                'nama'             => $pemilihan->nama_pemilihan,
                'status'           => $pemilihan->status,
                'total_peserta'    => $total,
                'sudah_memilih'    => $sudah,
                'belum_memilih'    => max(0, $total - $sudah),
                'tidak_hadir'      => $tidak,
                'persentase_hadir' => $total > 0 ? round($sudah / $total * 100, 1) : 0,
            ];
        })->values()->all();
    }

    private function aturanTambah(): array
    {
        return [
            'nama'     => 'required|min:3',
            'nis'      => 'required|unique:pemilih,nis',
            'kelas'    => 'nullable',
            'password' => 'required|min:6',
        ];
    }

    private function pesanValidasi(): array
    {
        return [
            'nama.required'     => 'Nama wajib diisi',
            'nama.min'          => 'Nama minimal 3 karakter',
            'nis.required'      => 'NIS wajib diisi',
            'nis.unique'        => 'NIS sudah terdaftar',
            'password.required' => 'Password wajib diisi',
            'password.min'      => 'Password minimal 6 karakter',
        ];
    }
}