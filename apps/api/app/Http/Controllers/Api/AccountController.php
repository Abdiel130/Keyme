<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Item;
use App\Models\Vault;
use App\Support\Rules;
use App\Support\Tokens;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

class AccountController extends Controller
{
    /** Cambio de contraseña maestra: misma Vault Key, envuelta con la llave nueva. */
    public function rekey(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_auth_key' => Rules::authKey(),
            'auth_key' => Rules::authKey(),
            'kdf_salt' => Rules::salt(),
            ...Rules::kdfParams(),
            'wrapped_vault_key' => Rules::blob(),
            'revoke_others' => ['boolean'],
        ]);

        return DB::transaction(function () use ($request, $data) {
            $vault = Vault::query()->lockForUpdate()->find(1);
            if (! password_verify($data['current_auth_key'], $vault->auth_hash)) {
                return response()->json(['message' => 'Contraseña actual incorrecta.', 'code' => 'bad_credentials'], 401);
            }

            $vault->forceFill([
                'auth_hash' => Tokens::hashAuthKey($data['auth_key']),
                'kdf_salt' => $data['kdf_salt'],
                'kdf_params' => $data['kdf_params'],
                'wrapped_vault_key' => $data['wrapped_vault_key'],
                'password_changed_at' => now(),
            ])->save();

            if ($data['revoke_others'] ?? false) {
                $this->revokeOtherTokens($request);
            }
            AuditLog::record($request, 'password_changed', null, ['revoke_others' => (bool) ($data['revoke_others'] ?? false)]);

            return response()->json(Tokens::keyMaterial($vault));
        });
    }

    /**
     * Rotación de Vault Key: el cliente re-cifró todos los elementos vivos con
     * la llave nueva. Se aplica todo o nada, y solo si el conjunto coincide
     * exactamente con lo que hay en el servidor (nada se queda con la llave vieja).
     */
    public function rotate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_auth_key' => Rules::authKey(),
            'wrapped_vault_key' => Rules::blob(),
            'items' => ['present', 'array'],
            'items.*.id' => ['required', 'uuid'],
            'items.*.blob' => Rules::blob(),
            'items.*.base_revision' => ['required', 'integer', 'min:0'],
        ]);

        return DB::transaction(function () use ($request, $data) {
            $vault = Vault::query()->lockForUpdate()->find(1);
            if (! password_verify($data['current_auth_key'], $vault->auth_hash)) {
                return response()->json(['message' => 'Contraseña incorrecta.', 'code' => 'bad_credentials'], 401);
            }

            $live = Item::query()->whereNull('deleted_at')->lockForUpdate()->pluck('revision', 'id');
            $sent = collect($data['items'])->keyBy('id');
            $stale = $live->keys()->diff($sent->keys())->merge($sent->keys()->diff($live->keys()))
                ->merge($sent->filter(fn ($i) => ($live[$i['id']] ?? null) !== $i['base_revision'])->keys());
            if ($stale->isNotEmpty()) {
                return response()->json(['message' => 'El vault cambió; sincroniza y vuelve a intentar.', 'code' => 'stale'], 409);
            }

            foreach ($sent as $id => $entry) {
                Item::query()->whereKey($id)->update([
                    'blob' => $entry['blob'],
                    'revision' => Vault::nextRevision(),
                    'updated_by' => $request->user()->id,
                    'updated_at' => now(),
                ]);
            }
            // Los tombstones conservan blob null; no hace falta tocarlos.
            $vault->refresh()->forceFill(['wrapped_vault_key' => $data['wrapped_vault_key']])->save();
            $this->revokeOtherTokens($request);
            AuditLog::record($request, 'vault_key_rotated', null, ['items' => $sent->count()]);

            return response()->json(Tokens::keyMaterial($vault));
        });
    }

    private function revokeOtherTokens(Request $request): void
    {
        $current = $request->user()->currentAccessToken();
        PersonalAccessToken::query()->when($current, fn ($q) => $q->whereKeyNot($current->getKey()))->delete();
    }
}
