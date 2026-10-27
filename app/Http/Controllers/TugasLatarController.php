<?php

namespace App\Http\Controllers;

use App\Models\TugasLatar;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Unduh hasil tugas latar belakang (mis. file Excel ekspor besar).
 */
class TugasLatarController extends Controller
{
    public function unduh(TugasLatar $tugas): StreamedResponse
    {
        abort_unless($tugas->siapDiunduh(), 404, 'File tugas belum siap atau sudah dihapus.');

        $disk = \Illuminate\Support\Facades\Storage::disk('local');
        $namaUnduh = basename($tugas->nama_file);

        return $disk->download($tugas->nama_file, $namaUnduh);
    }
}
