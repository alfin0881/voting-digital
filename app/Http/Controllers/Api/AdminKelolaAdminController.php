<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AdminApi;
use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Models\CatatanAktivitas;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * Kelola akun admin & peran (hanya Super Admin).
 */
class AdminKelolaAdminController extends Controller
{
    use AdminApi;

    public function index(): JsonResponse
    {
        $this->butuhIzin('admin');

        return response()->json([
            'admin'  => Admin::orderBy('nama')->get()->map(fn (Admin $a) => [
                'id'          => $a->id,
                'nama'        => $a->nama,
                'email'       => $a->email,
                'peran'       => $a->peranAdmin(),
                'peran_label' => $a->labelPeranAdmin(),
                'super'       => $a->adalahSuperAdmin(),
                'saya'        => $a->id === Auth::guard('admin')->id(),
                'dibuat'      => $a->created_at?->toIso8601String(),
            ]),
            'peran'  => collect(config('peran_admin.peran'))->map(fn ($p, $k) => [
                'kunci'      => $k,
                'label'      => $p['label'],
                'keterangan' => $p['keterangan'],
            ])->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->butuhIzin('admin');

        $data = $request->validate($this->aturan(), $this->pesanValidasi());

        $baru = Admin::create([
            'nama'     => $data['nama'],
            'email'    => $data['email'],
            'password' => Hash::make($data['password']),
            'peran'    => $data['peran_admin'],
        ]);

        CatatanAktivitas::catat('admin.tambah', "Menambah admin \"{$baru->nama}\" (peran {$baru->labelPeranAdmin()}).");

        return $this->pesan('Akun admin berhasil ditambahkan.');
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->butuhIzin('admin');

        $admin = Admin::findOrFail($id);

        $data = $request->validate($this->aturan($admin->id), $this->pesanValidasi());

        // Jangan sampai sistem tertinggal tanpa Super Admin.
        if ($admin->adalahSuperAdmin()
            && $data['peran_admin'] !== 'super_admin'
            && $this->jumlahSuperAdmin() <= 1) {
            return $this->gagal('Tidak bisa mengubah peran: ini satu-satunya Super Admin.', 422, 'super_admin_terakhir');
        }

        $ubah = [
            'nama'  => $data['nama'],
            'email' => $data['email'],
            'peran' => $data['peran_admin'],
        ];

        // Password hanya ditulis bila diisi (form edit boleh kosong = tidak diubah).
        if (filled($data['password'] ?? null)) {
            $ubah['password'] = Hash::make($data['password']);
        }

        $admin->update($ubah);

        CatatanAktivitas::catat('admin.ubah', "Mengubah akun admin \"{$admin->nama}\" (peran {$admin->labelPeranAdmin()}).");

        return $this->pesan('Akun admin berhasil diperbarui.');
    }

    public function destroy(int $id): JsonResponse
    {
        $this->butuhIzin('admin');

        $admin = Admin::findOrFail($id);

        if ($admin->id === Auth::guard('admin')->id()) {
            return $this->gagal('Anda tidak bisa menghapus akun Anda sendiri.', 422, 'diri_sendiri');
        }

        if ($admin->adalahSuperAdmin() && $this->jumlahSuperAdmin() <= 1) {
            return $this->gagal('Tidak bisa menghapus satu-satunya Super Admin.', 422, 'super_admin_terakhir');
        }

        $admin->delete();

        CatatanAktivitas::catat('admin.hapus', "Menghapus akun admin \"{$admin->nama}\".");

        return $this->pesan('Akun admin berhasil dihapus.');
    }

    private function aturan(?int $abaikanId = null): array
    {
        return [
            'nama'        => 'required|min:3|max:100',
            'email'       => ['required', 'email', 'max:150', Rule::unique('admins', 'email')->ignore($abaikanId)],
            'peran_admin' => ['required', Rule::in(array_keys(config('peran_admin.peran')))],
            // Saat menambah, password wajib. Saat edit, boleh kosong (tidak diubah).
            'password'    => $abaikanId ? 'nullable|min:6' : 'required|min:6',
        ];
    }

    private function pesanValidasi(): array
    {
        return [
            'nama.required'        => 'Nama wajib diisi',
            'nama.min'             => 'Nama minimal 3 karakter',
            'email.required'       => 'Email wajib diisi',
            'email.email'          => 'Format email tidak valid',
            'email.unique'         => 'Email sudah dipakai akun lain',
            'peran_admin.required' => 'Peran wajib dipilih',
            'peran_admin.in'       => 'Peran tidak valid',
            'password.required'    => 'Password wajib diisi',
            'password.min'         => 'Password minimal 6 karakter',
        ];
    }

    private function jumlahSuperAdmin(): int
    {
        return Admin::superAdmin()->count();
    }
}