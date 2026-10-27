<?php

namespace Tests\Feature;

use App\Http\Middleware\BatasiIdleAdmin;
use App\Models\Admin;
use App\Models\Pemilih;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Password pemilih = hash (login); kode kartu = terenkripsi, izin khusus, diaudit.
 */
class KodeKartuTest extends TestCase
{
    use RefreshDatabase;

    private function pemilih(string $kode = 'AB3K9Z'): Pemilih
    {
        $p = new Pemilih(['nis' => '20240001', 'nama' => 'Budi Santoso', 'kelas' => 'XII RPL 1']);

        return $p->aturKode($kode)->save() ? $p : $p;
    }

    private function sesiAdmin(string $peran): array
    {
        $admin = Admin::create([
            'nama' => ucfirst($peran), 'email' => "{$peran}@x.test", 'password' => 'rahasia123', 'peran' => $peran,
        ]);

        return [$admin, [BatasiIdleAdmin::KUNCI => time(), BatasiIdleAdmin::MASUK => time()]];
    }

    public function test_database_tidak_menyimpan_kode_sebagai_plain_text(): void
    {
        $p   = $this->pemilih();
        $raw = DB::table('pemilih')->where('id', $p->id)->first();

        $this->assertNotSame('AB3K9Z', $raw->password);
        $this->assertTrue(password_verify('ab3k9z', $raw->password), 'password harus hash dari kode huruf kecil');

        $this->assertNotNull($raw->kode_kartu);
        $this->assertStringNotContainsString('AB3K9Z', $raw->kode_kartu);
        $this->assertSame('AB3K9Z', $p->fresh()->kode_kartu);
    }

    public function test_menulis_password_langsung_tetap_di_hash(): void
    {
        $p = $this->pemilih();
        $p->update(['password' => 'KodeBaru1']);

        $this->assertTrue(Hash::check('kodebaru1', DB::table('pemilih')->where('id', $p->id)->value('password')));
    }

    public function test_login_pemilih_dengan_kode_benar_tanpa_peka_huruf_besar(): void
    {
        $this->pemilih();

        $this->postJson('/api/login', ['nis' => '20240001', 'password' => 'ab3k9z'])
            ->assertOk()->assertJsonPath('role', 'pemilih');
    }

    public function test_login_gagal_untuk_kode_salah_atau_nis_tidak_ada(): void
    {
        $this->pemilih();

        $this->postJson('/api/login', ['nis' => '20240001', 'password' => 'SALAH1'])->assertStatus(401);
        $this->postJson('/api/login', ['nis' => '99999999', 'password' => 'AB3K9Z'])->assertStatus(401);
    }

    public function test_endpoint_show_tidak_pernah_mengirim_kode(): void
    {
        $p = $this->pemilih();
        [$admin, $sesi] = $this->sesiAdmin('panitia');

        $res = $this->actingAs($admin, 'admin')->withSession($sesi)->getJson("/api/admin/anggota/{$p->id}");

        $res->assertOk()->assertJsonPath('punya_kode', true);
        $this->assertStringNotContainsString('AB3K9Z', $res->getContent());
        $this->assertArrayNotHasKey('password', $res->json());
    }

    public function test_admin_berizin_bisa_lihat_kode_dan_tercatat_di_audit_log(): void
    {
        $p = $this->pemilih();
        [$admin, $sesi] = $this->sesiAdmin('panitia');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson("/api/admin/anggota/{$p->id}/kode-kartu")
            ->assertOk()->assertJsonPath('kode', 'AB3K9Z');

        $this->assertDatabaseHas('catatan_aktivitas', [
            'aksi'       => 'anggota.lihat_kode',
            'nama_admin' => 'Panitia',
        ]);
    }

    public function test_pengawas_tidak_boleh_lihat_kode_dan_tidak_ada_audit(): void
    {
        $p = $this->pemilih();
        [$admin, $sesi] = $this->sesiAdmin('pengawas');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson("/api/admin/anggota/{$p->id}/kode-kartu")
            ->assertForbidden();

        $this->assertDatabaseMissing('catatan_aktivitas', ['aksi' => 'anggota.lihat_kode']);
    }

    public function test_panitia_tanpa_izin_kode_kartu_ditolak_walau_punya_izin_anggota(): void
    {
        config(['peran_admin.peran.panitia.izin' => ['dashboard', 'anggota']]);

        $p = $this->pemilih();
        [$admin, $sesi] = $this->sesiAdmin('panitia');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson("/api/admin/anggota/{$p->id}/kode-kartu")->assertForbidden();

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson("/api/admin/anggota/{$p->id}/acak-password")->assertForbidden();

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->get('/unduh/anggota/kartu-pemilih')->assertForbidden();
    }

    public function test_acak_password_membuat_kode_baru_dan_kode_lama_tidak_berlaku(): void
    {
        $p = $this->pemilih();
        [$admin, $sesi] = $this->sesiAdmin('panitia');

        $res = $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson("/api/admin/anggota/{$p->id}/acak-password")->assertOk();

        $baru = $res->json('hasil.0.password');
        $this->assertNotEmpty($baru);

        $p = $p->fresh();
        $this->assertTrue($p->cocokKode($baru));
        $this->assertFalse($p->cocokKode('AB3K9Z'));
        $this->assertSame($baru, $p->kode_kartu);
    }

    public function test_cetak_kartu_memakai_kode_terenkripsi_dan_dicatat(): void
    {
        $this->pemilih();
        [$admin, $sesi] = $this->sesiAdmin('panitia');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->get('/unduh/anggota/kartu-pemilih')->assertOk();

        $this->assertDatabaseHas('catatan_aktivitas', ['aksi' => 'anggota.cetak_kartu']);
    }

    public function test_pemilih_lama_tanpa_kode_kartu_tetap_aman(): void
    {
        $p = $this->pemilih();
        DB::table('pemilih')->where('id', $p->id)->update(['kode_kartu' => null]);
        [$admin, $sesi] = $this->sesiAdmin('panitia');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson("/api/admin/anggota/{$p->id}/kode-kartu")
            ->assertOk()->assertJsonPath('kode', null);

        // Login lama (hash) tetap bekerja.
        $this->postJson('/api/login', ['nis' => '20240001', 'password' => 'ab3k9z'])->assertOk();
    }
}
