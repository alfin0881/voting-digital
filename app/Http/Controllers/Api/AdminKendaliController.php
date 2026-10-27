<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\CatatanAktivitas;
use App\Models\Partisipasi;
use App\Models\Pemilihan;
use App\Models\Pengaturan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

/**
 * Kendali operasional hari-H: pengumuman dan jeda darurat.
 *
 * Semua bersifat GLOBAL dan langsung berlaku ke layar pemilih.
 */
class AdminKendaliController extends Controller
{
    use AdminApi;

    public function index(): JsonResponse
    {
        $this->butuhIzin('kendali');

        return response()->json([
            'pengumuman' => [
                'teks'   => (string) Pengaturan::baca(Pengaturan::PENGUMUMAN, ''),
                'tipe'   => (string) Pengaturan::baca(Pengaturan::PENGUMUMAN_TIPE, 'info'),
                'aktif'  => Pengaturan::benar(Pengaturan::PENGUMUMAN_AKTIF),
            ],
            'jeda' => [
                'aktif'  => Pengaturan::benar(Pengaturan::JEDA),
                'alasan' => (string) Pengaturan::baca(Pengaturan::JEDA_ALASAN, ''),
            ],
            'ringkasan' => [
                'pemilihan_aktif' => Pemilihan::where('status', 'aktif')->count(),
                'suara_hari_ini'  => Partisipasi::whereBetween(
                    'waktu_memilih',
                    [today()->startOfDay(), today()->endOfDay()]
                )->count(),
                'suara_5menit'    => Partisipasi::where('waktu_memilih', '>=', now()->subMinutes(5))->count(),
            ],
            'daftar_pemilihan_aktif' => Pemilihan::where('status', 'aktif')
                ->orderByDesc('tanggal_mulai')
                ->get(['id', 'nama_pemilihan'])
                ->map(fn ($p) => ['id' => $p->id, 'nama' => $p->nama_pemilihan]),
        ]);
    }

    // =========================================================================
    // PENGUMUMAN
    // =========================================================================

    public function simpanPengumuman(Request $request): JsonResponse
    {
        $this->butuhIzin('kendali');

        $data = $request->validate([
            'pengumuman' => ['nullable', 'max:300'],
            'tipe'       => ['required', 'in:info,peringatan,penting'],
        ], [
            'pengumuman.max' => 'Pengumuman maksimal 300 karakter.',
            'tipe.in'        => 'Tipe pengumuman tidak valid.',
        ]);

        if (trim((string) $data['pengumuman']) === '') {
            return $this->gagal('Teks pengumuman masih kosong.', 422, 'kosong');
        }

        $teks = trim($data['pengumuman']);

        Pengaturan::tulis(Pengaturan::PENGUMUMAN, $teks, $this->id());
        Pengaturan::tulis(Pengaturan::PENGUMUMAN_TIPE, $data['tipe'], $this->id());
        Pengaturan::tulis(Pengaturan::PENGUMUMAN_AKTIF, '1', $this->id());

        CatatanAktivitas::catat('kendali.pengumuman', 'Mengirim pengumuman: "' . Str::limit($teks, 120) . '"');

        return $this->pesan('Pengumuman dikirim ke layar pemilih.');
    }

    public function togglePengumuman(): JsonResponse
    {
        $this->butuhIzin('kendali');

        $baru = ! Pengaturan::benar(Pengaturan::PENGUMUMAN_AKTIF);

        Pengaturan::tulis(Pengaturan::PENGUMUMAN_AKTIF, $baru ? '1' : '0', $this->id());

        return $this->pesan($baru ? 'Pengumuman ditampilkan.' : 'Pengumuman disembunyikan.');
    }

    public function hapusPengumuman(): JsonResponse
    {
        $this->butuhIzin('kendali');

        Pengaturan::tulis(Pengaturan::PENGUMUMAN, null, $this->id());
        Pengaturan::tulis(Pengaturan::PENGUMUMAN_AKTIF, '0', $this->id());

        return $this->pesan('Pengumuman dihapus.');
    }

    // =========================================================================
    // JEDA DARURAT
    // =========================================================================

    public function toggleJeda(Request $request): JsonResponse
    {
        $this->butuhIzin('kendali');

        $request->validate([
            'jeda_alasan' => ['nullable', 'max:200'],
        ], [
            'jeda_alasan.max' => 'Alasan jeda maksimal 200 karakter.',
        ]);

        $jeda   = ! Pengaturan::benar(Pengaturan::JEDA);
        $alasan = trim((string) $request->input('jeda_alasan', ''));

        Pengaturan::tulis(Pengaturan::JEDA, $jeda ? '1' : '0', $this->id());

        if ($jeda) {
            Pengaturan::tulis(Pengaturan::JEDA_ALASAN, $alasan ?: null, $this->id());
            CatatanAktivitas::catat('kendali.jeda', 'Menjeda pemungutan suara' . ($alasan ? ': ' . $alasan : '.'));

            return response()->json([
                'berhasil' => true,
                'tipe'     => 'bahaya',
                'jeda'     => true,
                'pesan'    => 'Pemungutan suara DIJEDA. Semua pemilihan menolak suara sementara.',
            ]);
        }

        Pengaturan::tulis(Pengaturan::JEDA_ALASAN, null, $this->id());
        CatatanAktivitas::catat('kendali.lanjut', 'Mencabut jeda pemungutan suara.');

        return $this->pesan('Jeda dicabut. Pemungutan suara kembali normal.');
    }

    }