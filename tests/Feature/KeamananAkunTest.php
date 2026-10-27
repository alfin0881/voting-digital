<?php

namespace Tests\Feature;

use App\Http\Middleware\BatasiIdleAdmin;
use App\Models\Admin;
use App\Models\SesiAdmin;
use App\Support\LacakSesiAdmin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Halaman Keamanan Akun: semua peran dapat mengganti password sendiri dan
 * mengakhiri sesi di perangkat lain.
 */
class KeamananAkunTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $peran = 'panitia'): array
    {
        $admin = Admin::create([
            'nama'     => ucfirst($peran),
            'email'    => "{$peran}-akun@x.test",
            'password' => Hash::make('rahasia123'),
            'peran'    => $peran,
        ]);

        return [$admin, [BatasiIdleAdmin::KUNCI => time(), BatasiIdleAdmin::MASUK => time()]];
    }

    public function test_panitia_bisa_membuka_halaman_keamanan_akun_tanpa_izin_admin(): void
    {
        [$admin, $sesi] = $this->admin('panitia');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->getJson('/api/admin/keamanan')
            ->assertOk()
            ->assertJsonPath('admin.email', 'panitia-akun@x.test')
            ->assertJsonPath('admin.peran', 'panitia');
    }

    public function test_ganti_password_wajib_password_lama_yang_benar(): void
    {
        [$admin, $sesi] = $this->admin('panitia');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson('/api/admin/keamanan/password', [
                'password_lama'         => 'salah',
                'password'              => 'PasswordBaru1',
                'password_confirmation' => 'PasswordBaru1',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password_lama');

        $this->assertTrue(Hash::check('rahasia123', $admin->fresh()->password));
    }

    public function test_ganti_password_berhasil_dan_dicatat_di_audit(): void
    {
        [$admin, $sesi] = $this->admin('pengawas');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson('/api/admin/keamanan/password', [
                'password_lama'         => 'rahasia123',
                'password'              => 'PasswordBaru1',
                'password_confirmation' => 'PasswordBaru1',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('PasswordBaru1', $admin->fresh()->password));
        $this->assertDatabaseHas('catatan_aktivitas', [
            'aksi'       => 'akun.password',
            'nama_admin' => 'Pengawas',
        ]);
    }

    public function test_password_baru_tidak_boleh_sama_dengan_yang_lama(): void
    {
        [$admin, $sesi] = $this->admin('panitia');

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson('/api/admin/keamanan/password', [
                'password_lama'         => 'rahasia123',
                'password'              => 'rahasia123',
                'password_confirmation' => 'rahasia123',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    public function test_admin_bisa_mengakhiri_sesi_di_perangkat_lain(): void
    {
        config(['session.driver' => 'database']);
        LacakSesiAdmin::lupaCache();

        [$admin, $sesi] = $this->admin('panitia');

        $sekarang = $this->app['session']->getId();

        SesiAdmin::create([
            'admin_id'      => $admin->id,
            'session_id'    => $sekarang,
            'ip_address'    => '127.0.0.1',
            'perangkat'     => 'Chrome di Windows',
            'masuk_at'      => now(),
            'last_activity' => now(),
        ]);

        SesiAdmin::create([
            'admin_id'      => $admin->id,
            'session_id'    => 'sesi-lain',
            'ip_address'    => '10.0.0.9',
            'perangkat'     => 'Firefox di Linux',
            'masuk_at'      => now(),
            'last_activity' => now(),
        ]);

        $this->actingAs($admin, 'admin')->withSession($sesi)
            ->postJson('/api/admin/keamanan/logout-semua', [
                'password' => 'rahasia123',
                'semua'    => 0,
            ])
            ->assertOk();

        $this->assertDatabaseMissing('sesi_admin', ['session_id' => 'sesi-lain']);
        $this->assertSame(1, SesiAdmin::where('admin_id', $admin->id)->count());
        $this->assertDatabaseHas('catatan_aktivitas', ['aksi' => 'akun.logout_semua']);
    }
}
