<?php

namespace Tests\Feature;

use App\Http\Middleware\BatasiIdleAdmin;
use App\Models\Admin;
use App\Models\Pemilihan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Pemilihan memakai tanggal + jam, dan tutup otomatis saat waktu selesai lewat.
 */
class JamPemilihanTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function buat(array $o = []): Pemilihan
    {
        return Pemilihan::create($o + [
            'nama_pemilihan'  => 'Ketua OSIS',
            'tanggal_mulai'   => '2026-11-02',
            'tanggal_selesai' => '2026-11-02',
            'jam_mulai'       => '07:00:00',
            'jam_selesai'     => '12:00:00',
            'status'          => 'aktif',
        ]);
    }

    public function test_hanya_menerima_suara_di_dalam_jam_pemilihan(): void
    {
        $p = $this->buat();

        Carbon::setTestNow('2026-11-02 06:59:59');
        $this->assertFalse($p->bolehMenerimaSuara());
        $this->assertStringContainsString('belum dimulai', $p->alasanTidakBolehMemilih());
        $this->assertSame(0, Pemilihan::bolehDipilihSekarang()->count());

        Carbon::setTestNow('2026-11-02 07:00:00');
        $this->assertTrue($p->bolehMenerimaSuara());
        $this->assertSame(1, Pemilihan::bolehDipilihSekarang()->count());

        Carbon::setTestNow('2026-11-02 11:59:59');
        $this->assertTrue($p->bolehMenerimaSuara());
        $this->assertSame(1, Pemilihan::bolehDipilihSekarang()->count());

        Carbon::setTestNow('2026-11-02 12:00:01');
        $this->assertFalse($p->bolehMenerimaSuara());
        $this->assertStringContainsString('sudah ditutup', $p->alasanTidakBolehMemilih());
        $this->assertSame(0, Pemilihan::bolehDipilihSekarang()->count());
    }

    public function test_pemilihan_beberapa_hari_memakai_jam_di_hari_pertama_dan_terakhir(): void
    {
        $p = $this->buat(['tanggal_selesai' => '2026-11-04']);

        Carbon::setTestNow('2026-11-02 06:00:00');
        $this->assertFalse($p->bolehMenerimaSuara());

        // Hari tengah: terbuka sepanjang hari.
        Carbon::setTestNow('2026-11-03 03:00:00');
        $this->assertTrue($p->bolehMenerimaSuara());
        $this->assertSame(1, Pemilihan::bolehDipilihSekarang()->count());

        Carbon::setTestNow('2026-11-04 12:30:00');
        $this->assertFalse($p->bolehMenerimaSuara());
        $this->assertSame(0, Pemilihan::bolehDipilihSekarang()->count());
    }

    public function test_tanpa_jam_berarti_sepanjang_hari_seperti_sebelumnya(): void
    {
        $p = Pemilihan::create([
            'nama_pemilihan'  => 'Lama',
            'tanggal_mulai'   => '2026-11-02',
            'tanggal_selesai' => '2026-11-02',
            'status'          => 'aktif',
        ])->refresh();

        Carbon::setTestNow('2026-11-02 00:00:00');
        $this->assertTrue($p->bolehMenerimaSuara());

        Carbon::setTestNow('2026-11-02 23:59:00');
        $this->assertTrue($p->bolehMenerimaSuara());
        $this->assertSame(1, Pemilihan::bolehDipilihSekarang()->count());

        Carbon::setTestNow('2026-11-03 00:00:01');
        $this->assertFalse($p->bolehMenerimaSuara());
    }

    public function test_perintah_tutup_otomatis_menonaktifkan_yang_sudah_lewat(): void
    {
        $lewat = $this->buat(['nama_pemilihan' => 'Sudah lewat']);
        $jalan = $this->buat(['nama_pemilihan' => 'Masih jalan', 'jam_selesai' => '15:00:00']);

        Carbon::setTestNow('2026-11-02 12:05:00');

        $this->artisan('pemilihan:tutup-otomatis')->assertSuccessful();

        $this->assertSame('nonaktif', $lewat->fresh()->status);
        $this->assertSame('aktif', $jalan->fresh()->status);
        $this->assertDatabaseHas('catatan_aktivitas', ['aksi' => 'pemilihan.tutup_otomatis']);
    }

    public function test_admin_menyimpan_jam_dan_waktu_selesai_harus_setelah_mulai(): void
    {
        $admin = Admin::create([
            'nama' => 'Panitia', 'email' => 'p@x.test', 'password' => 'rahasia123', 'peran' => 'panitia',
        ]);

        $sesi = [BatasiIdleAdmin::KUNCI => time(), BatasiIdleAdmin::MASUK => time()];

        $dasar = [
            'nama_pemilihan'  => 'Ketua OSIS',
            'tanggal_mulai'   => '2026-11-02',
            'tanggal_selesai' => '2026-11-02',
            'status'          => 'nonaktif',
        ];

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson('/api/admin/pemilihan', $dasar + ['jam_mulai' => '12:00', 'jam_selesai' => '07:00'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('jam_selesai');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson('/api/admin/pemilihan', $dasar + ['jam_mulai' => '7:00', 'jam_selesai' => '12:00'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('jam_mulai'); // format harus JJ:MM

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson('/api/admin/pemilihan', $dasar + ['jam_mulai' => '07:00', 'jam_selesai' => '12:00'])
            ->assertSuccessful();

        $p = Pemilihan::firstOrFail();
        $this->assertSame('07:00:00', $p->jam_mulai);
        $this->assertSame('12:00:00', $p->jam_selesai);

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson('/api/admin/pemilihan')
            ->assertJsonPath('pemilihan.0.jam_mulai', '07:00')
            ->assertJsonPath('pemilihan.0.jam_selesai', '12:00');
    }
}
