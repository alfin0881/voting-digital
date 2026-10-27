<?php

namespace App\Http\Controllers;

use App\Exports\TemplateKandidatExport;
use Maatwebsite\Excel\Facades\Excel;

/**
 * Unduh template Excel untuk impor kandidat.
 */
class KandidatTemplateController extends Controller
{
    public function unduh()
    {
        return Excel::download(new TemplateKandidatExport(), 'template-import-kandidat.xlsx');
    }
}
