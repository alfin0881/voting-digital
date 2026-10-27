<?php

namespace Tests\Feature;

use App\Http\Middleware\BatasiIdleAdmin;
use App\Models\Admin;
use App\Models\Kandidat;
use App\Models\Pemilihan;
use App\Models\Pengaturan;
use App\Models\Suara;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Hasil sementara harus bisa disembunyikan sampai pemungutan ditutup.
 */
class KerahasiaanHasilTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function admin(string $peran): array
    {
        $admin = Admin::create([
            'nama'     => ucfirst($peran),
            'email'    => "{$peran}-hasil@x.test",
            'password' => 'rahasia123',
            'peran'    => $peran,
        ]);

        return [$admin, [BatasiIdleAdmin::KUNCI => time(), BatasiIdleAdmin::MASUK => time()]];
    }

    private function pemilihan(string $status = 'aktif'): array
    {
        $p = Pemilihan::create([
            'nama_pemilihan'  => 'Ketua OSIS',
            'tanggal_mulai'   => '2026-11-02',
            'tanggal_selesai' => '2026-11-02',
            'jam_mulai'       => '07:00:00',
            'jam_selesai'     => '12:00:00',
            'status'          => $status,
        ]);

        $a = Kandidat::create([
            'pemilihan_id' => $p->id,
            'nama_kandidat'=> 'Ani',
            'nomor_urut'   => '1',
        ]);
        $b = Kandidat::create([
            'pemilihan_id' => $p->id,
            'nama_kandidat'=> 'Budi',
            'nomor_urut'   => '2',
        ]);

        Suara::create(['pemilihan_id' => $p->id, 'kandidat_id' => $a->id]);
        Suara::create(['pemilihan_id' => $p->id, 'kandidat_id' => $a->id]);
        Suara::create(['pemilihan_id' => $p->id, 'kandidat_id' => $b->id]);

        return [$p, $a, $b];
    }

    public function test_panitia_tidak_boleh_mengubah_pengaturan_kerahasiaan_hasil(): void
    {
        [$admin, $sesi] = $this->admin('panitia');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson('/api/admin/pengaturan/hasil-sementara', ['aktif' => 1])
            ->assertForbidden()
            ->assertJsonPath('kode', 'khusus_super_admin');

        $this->assertFalse(Pengaturan::benar(Pengaturan::SEMBUNYIKAN_HASIL_SEMENTARA));
    }

    public function test_super_admin_bisa_menyalakan_dan_mematikan_kerahasiaan_hasil(): void
    {
        [$admin, $sesi] = $this->admin('super_admin');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson('/api/admin/pengaturan/hasil-sementara', ['aktif' => 1])
            ->assertOk()
            ->assertJsonPath('sembunyikan_hasil', true);

        $this->assertTrue(Pengaturan::benar(Pengaturan::SEMBUNYIKAN_HASIL_SEMENTARA));
        $this->assertDatabaseHas('catatan_aktivitas', ['aksi' => 'pengaturan.hasil_sementara']);

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson('/api/admin/pengaturan/hasil-sementara', ['aktif' => 0])
            ->assertOk()
            ->assertJsonPath('sembunyikan_hasil', false);
    }

    public function test_hasil_pemilihan_yang_masih_berjalan_tidak_dikirim_ke_browser(): void
    {
        Carbon::setTestNow('2026-11-02 09:00:00');
        $this->pemilihan();
        Pengaturan::tulis(Pengaturan::SEMBUNYIKAN_HASIL_SEMENTARA, '1');

        [$admin, $sesi] = $this->admin('panitia');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson('/api/admin/hasil')
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('suara', 0)
            ->assertJsonPath('hasil_sementara.terkunci.0.nama', 'Ketua OSIS');

        // Dashboard juga tidak boleh mengirim leaderboard pemilihan aktif.
        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonCount(0, 'leaderboard')
            ->assertJsonPath('hasil_sementara.terkunci.0.nama', 'Ketua OSIS');
    }

    public function test_hasil_muncul_lagi_setelah_pemungutan_ditutup(): void
    {
        Carbon::setTestNow('2026-11-02 09:00:00');
        [$p] = $this->pemilihan();
        Pengaturan::tulis(Pengaturan::SEMBUNYIKAN_HASIL_SEMENTARA, '1');

        [$admin, $sesi] = $this->admin('pengawas');

        // Masih berjalan -> terkunci.
        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson('/api/admin/hasil')
            ->assertJsonCount(0, 'data');

        // Ditutup -> hasil terbuka tanpa harus mematikan pengaturan.
        $p->update(['status' => 'nonaktif']);

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson('/api/admin/hasil')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.total_suara', 3)
            ->assertJsonPath('data.0.kandidat.0.suara', 2);
    }

    public function test_pemilihan_yang_waktunya_sudah_lewat_dianggap_terbuka(): void
    {
        // Status masih "aktif" (scheduler belum sempat menutup), tetapi jam
        // pemungutan sudah lewat. Hasil harus boleh dilihat.
        [$p] = $this->pemilihan('aktif');
        Pengaturan::tulis(Pengaturan::SEMBUNYIKAN_HASIL_SEMENTARA, '1');

        Carbon::setTestNow('2026-11-02 13:00:00');

        [$admin, $sesi] = $this->admin('pengawas');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson('/api/admin/hasil')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.total_suara', 3);
    }
}
