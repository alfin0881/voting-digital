<!DOCTYPE html>
<html lang="id" data-mode="light">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#4f46e5" />
    <meta name="description" content="Sistem pemungutan suara elektronik sekolah" />

    @php($judul = \App\Models\Pengaturan::judulAplikasi())
    <title>{{ $judul }}</title>

    <link rel="icon" type="image/x-icon" href="/logo.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

    {{--
        Font dimuat TANPA memblokir render. Di jaringan sekolah yang tidak ada
        internet luar, stylesheet Google bisa menggantung sampai timeout dan
        halaman tampil kosong. Pola preload -> stylesheet membiarkan browser
        langsung render dengan font sistem lebih dulu.
    --}}
    <link
        rel="preload"
        as="style"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&display=swap"
        onload="this.onload=null;this.rel='stylesheet'"
    />
    <noscript>
        <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&display=swap"
            rel="stylesheet"
        />
    </noscript>

    <script>
        // Terapkan tema SEBELUM React mount supaya tidak ada kedipan putih.
        (function () {
            try {
                var mode = localStorage.getItem('kasya_theme')
                document.documentElement.setAttribute(
                    'data-mode',
                    mode === 'dark' ? 'dark' : 'light',
                )
            } catch (e) {
                /* localStorage bisa diblokir; abaikan */
            }
        })()
    </script>

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.jsx'])
    @inertiaHead
</head>
<body>
    @inertia
</body>
</html>
