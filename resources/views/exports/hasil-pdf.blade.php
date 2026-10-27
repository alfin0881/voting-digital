<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Laporan Hasil Pemilihan</title>
    <style>
        @page { margin: 28px 34px; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #1f2937; }
        h1 { font-size: 16px; margin: 0; text-align: center; letter-spacing: 1px; }
        .sekolah { text-align: center; font-size: 12px; margin-top: 3px; }
        .garis { border-bottom: 2px solid #0c4780; margin: 10px 0 14px; }
        h2 { font-size: 14px; margin: 0 0 4px; color: #0c4780; }
        .muted { color: #6b7280; }
        table { width: 100%; border-collapse: collapse; }
        .info td { padding: 3px 0; vertical-align: top; }
        .info td.k { width: 150px; color: #4b5563; }
        .kotak td { border: 1px solid #d1d5db; padding: 8px; text-align: center; }
        .kotak .angka { font-size: 18px; font-weight: bold; color: #0c4780; }
        .kotak .lbl { font-size: 9px; color: #6b7280; text-transform: uppercase; }
        .hasil th { background: #0c4780; color: #fff; padding: 7px 6px; font-size: 10px; text-align: left; }
        .hasil td { border-bottom: 1px solid #e5e7eb; padding: 7px 6px; vertical-align: middle; }
        .c { text-align: center; }
        .r { text-align: right; }
        .menang td { background: #eff6ff; font-weight: bold; }
        .bar { background: #e5e7eb; height: 10px; width: 100%; }
        .bar div { background: #0c4780; height: 10px; }
        .sementara { background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 6px 10px; margin-bottom: 10px; font-weight: bold; text-align: center; }
        .pemenang { margin-top: 12px; padding: 9px 12px; background: #ecfdf5; border: 1px solid #10b981; }
        .ttd td { width: 50%; text-align: center; padding-top: 6px; }
        .ttd .garis-ttd { margin-top: 55px; border-bottom: 1px solid #374151; width: 70%; margin-left: auto; margin-right: auto; }
        .foot { margin-top: 18px; font-size: 9px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 6px; }
    </style>
</head>
<body>

@foreach($laporan as $d)
    <div @if(!$loop->last) style="page-break-after: always;" @endif>

        <h1>LAPORAN HASIL PEMILIHAN</h1>
        <div class="sekolah">{{ $meta['sekolah'] }}</div>
        <div class="garis"></div>

        @if($d['sementara'])
            <div class="sementara">HASIL SEMENTARA — pemilihan ini masih berstatus aktif</div>
        @endif

        <h2>{{ $d['nama'] }}</h2>
        <table class="info">
            <tr><td class="k">Periode</td><td>: {{ $d['periode'] }}</td></tr>
            <tr><td class="k">Status</td><td>: {{ $d['sementara'] ? 'Aktif' : 'Nonaktif' }}</td></tr>
            @if($d['deskripsi'])
                <tr><td class="k">Keterangan</td><td>: {{ $d['deskripsi'] }}</td></tr>
            @endif
        </table>

        <div style="height: 10px;"></div>

        <table class="kotak">
            <tr>
                <td><div class="angka">{{ number_format($d['total_peserta'], 0, ',', '.') }}</div><div class="lbl">Peserta terdaftar</div></td>
                <td><div class="angka">{{ number_format($d['sudah_memilih'], 0, ',', '.') }}</div><div class="lbl">Sudah memilih</div></td>
                <td><div class="angka">{{ number_format($d['belum_memilih'], 0, ',', '.') }}</div><div class="lbl">Belum memilih</div></td>
                <td><div class="angka">{{ rtrim(rtrim(number_format($d['persen_partisipasi'], 2, ',', '.'), '0'), ',') }}%</div><div class="lbl">Partisipasi</div></td>
            </tr>
        </table>

        <div style="height: 14px;"></div>

        <table class="hasil">
            <thead>
                <tr>
                    <th class="c" style="width: 45px;">Peringkat</th>
                    <th class="c" style="width: 40px;">No.</th>
                    <th>Nama Kandidat</th>
                    <th class="r" style="width: 55px;">Suara</th>
                    <th class="r" style="width: 55px;">Persen</th>
                    <th style="width: 120px;">Perolehan</th>
                </tr>
            </thead>
            <tbody>
                @forelse($d['kandidat'] as $k)
                    <tr class="{{ $k['peringkat'] === 1 && $d['total_suara'] > 0 ? 'menang' : '' }}">
                        <td class="c">{{ $k['peringkat'] }}</td>
                        <td class="c">{{ str_pad($k['nomor_urut'], 2, '0', STR_PAD_LEFT) }}</td>
                        <td>{{ $k['nama'] }}</td>
                        <td class="r">{{ number_format($k['suara'], 0, ',', '.') }}</td>
                        <td class="r">{{ rtrim(rtrim(number_format($k['persen'], 2, ',', '.'), '0'), ',') }}%</td>
                        <td><div class="bar"><div style="width: {{ min(100, $k['persen']) }}%;"></div></div></td>
                    </tr>
                @empty
                    <tr><td colspan="6" class="c muted">Belum ada kandidat</td></tr>
                @endforelse
                <tr>
                    <td colspan="3" class="r"><b>Total suara masuk</b></td>
                    <td class="r"><b>{{ number_format($d['total_suara'], 0, ',', '.') }}</b></td>
                    <td colspan="2"></td>
                </tr>
            </tbody>
        </table>

        <div class="pemenang">
            <b>{{ $d['sementara'] ? 'Terdepan sementara' : 'Hasil' }}:</b> {{ $d['pemenang'] }}
        </div>

        <table class="ttd" style="margin-top: 26px;">
            <tr>
                <td>Ketua Panitia<div class="garis-ttd"></div></td>
                <td>Pengawas<div class="garis-ttd"></div></td>
            </tr>
        </table>

        <div class="foot">
            Dicetak pada {{ $meta['dicetak'] }} oleh {{ $meta['oleh'] }}.<br>
            Laporan berisi hasil agregat. Suara bersifat rahasia dan tidak terhubung ke identitas pemilih.
        </div>
    </div>
@endforeach

</body>
</html>
