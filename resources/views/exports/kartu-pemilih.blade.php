<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Kartu Pemilih</title>
    <style>
        @page { margin: 14mm 12mm; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 13px; color: #1f2937; }

        .kop-kelas {
            background: #0c4780; color: #fff; padding: 10px 16px; border-radius: 8px;
            margin-bottom: 6mm; display: flex; justify-content: space-between; align-items: center;
        }
        .kop-kelas .nama-kelas { font-size: 18px; font-weight: bold; }
        .kop-kelas .jumlah { font-size: 12px; opacity: .85; }

        /* 2 kolom x 4 baris = 8 kartu per halaman F4 (kartu lebih besar dari versi A4) */
        .grid { width: 100%; border-collapse: separate; border-spacing: 6mm; table-layout: fixed; }
        .grid td { vertical-align: top; padding: 0; }

        .kartu {
            border: 2px dashed #9ca3af;
            border-radius: 8px;
            padding: 14px 16px;
            height: 48mm;
            box-sizing: border-box;
        }
        .kartu .judul {
            font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px;
            color: #ffffff; background: #0c4780; padding: 3px 9px; border-radius: 4px;
            display: inline-block; margin-bottom: 8px;
        }
        .kartu .nama { font-size: 19px; font-weight: bold; margin: 0 0 3px; }
        .kartu .kelas { font-size: 14px; color: #6b7280; margin: 0 0 10px; }
        .kartu table.data { width: 100%; border-collapse: collapse; }
        .kartu table.data td { padding: 3px 0; font-size: 16px; }
        .kartu table.data td.k { width: 32%; color: #6b7280; }
        .kartu table.data td.v { font-weight: bold; letter-spacing: 0.5px; }
        .kartu .catatan { font-size: 9px; color: #9ca3af; margin-top: 8px; }
    </style>
</head>
<body>
    {{-- Dikelompokkan per kelas: satu kelas selalu mulai di halaman baru,
         supaya panitia tinggal memotong lalu langsung membagikan per kelas
         tanpa perlu menyortir ulang. --}}
    @foreach($pemilih->groupBy(fn ($orang) => $orang->kelas ?: 'Tanpa Kelas') as $namaKelas => $anggotaKelas)
        @foreach($anggotaKelas->chunk(8) as $halaman)
            <div @if(!$loop->parent->first || !$loop->first) style="page-break-before: always;" @endif>
                @if($loop->first)
                    <div class="kop-kelas">
                        <span class="nama-kelas">Kelas {{ $namaKelas }}</span>
                        <span class="jumlah">{{ $anggotaKelas->count() }} pemilih</span>
                    </div>
                @endif
                <table class="grid">
                    @foreach($halaman->chunk(2) as $baris)
                        <tr>
                            @foreach($baris as $orang)
                                <td style="width: 50%;">
                                    <div class="kartu">
                                        <span class="judul">Kartu Pemilih</span>
                                        <p class="nama">{{ $orang->nama }}</p>
                                        <p class="kelas">Kelas {{ $orang->kelas ?: '-' }}</p>
                                        <table class="data">
                                            <tr><td class="k">NIS</td><td class="v">: {{ $orang->nis }}</td></tr>
                                            <tr><td class="k">Password</td><td class="v">: {{ $orang->kode ?? '(belum ada — acak ulang)' }}</td></tr>
                                        </table>
                                        <p class="catatan">{{ $sekolah }} &mdash; jangan bagikan kartu ini ke orang lain.</p>
                                    </div>
                                </td>
                            @endforeach
                            @if($baris->count() < 2)
                                <td style="width: 50%;"></td>
                            @endif
                        </tr>
                    @endforeach
                </table>
            </div>
        @endforeach
    @endforeach
</body>
</html>
