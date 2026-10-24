<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Vault;
use App\Support\Rules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Sincronización por revisión. Cada escritura toma la siguiente revisión del
 * vault; los clientes piden "todo lo posterior a mi cursor". Las escrituras
 * llevan base_revision: si no coincide con la del servidor se responde 409
 * con la versión actual y el cliente resuelve el conflicto (lo decide el
 * cliente porque solo él puede leer el contenido).
 */
class SyncController extends Controller
{
    public function pull(Request $request): JsonResponse
    {
        $since = max(0, (int) $request->query('since', 0));
        $vault = Vault::current();

        // Si el cursor es anterior a la última purga, pudo perderse tombstones:
        // se devuelve el vault completo y el cliente descarta lo que no venga.
        $full = $since > 0 && $since < $vault->purge_horizon;
        $query = Item::query()->orderBy('revision');
        $full ? $query->whereNull('deleted_at') : $query->where('revision', '>', $since);

        return response()->json([
            'revision' => $vault->revision,
            'full' => $full || $since === 0,
            'items' => $query->get()->map->toSync(),
        ]);
    }

    public function put(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'blob' => Rules::blob(),
            'base_revision' => ['present', 'nullable', 'integer', 'min:0'],
        ]);

        return $this->write($request, $id, $data['blob'], $data['base_revision']);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['base_revision' => ['present', 'nullable', 'integer', 'min:0']]);

        return $this->write($request, $id, null, $data['base_revision']);
    }

    /** Varias escrituras en una petición (importaciones). Cada una se resuelve por separado. */
    public function batch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'max:500'],
            'items.*.id' => ['required', 'uuid'],
            'items.*.blob' => ['nullable', 'string', 'max:2000000', Rules::B64],
            'items.*.base_revision' => ['present', 'nullable', 'integer', 'min:0'],
        ]);

        $results = [];
        foreach ($data['items'] as $entry) {
            $response = $this->write($request, $entry['id'], $entry['blob'] ?? null, $entry['base_revision']);
            $results[] = ['id' => $entry['id'], 'status' => $response->status()] + $response->getData(true);
        }

        return response()->json(['results' => $results, 'revision' => Vault::current()->revision]);
    }

    private function write(Request $request, string $id, ?string $blob, ?int $base): JsonResponse
    {
        abort_unless(preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id), 422, 'Id inválido.');

        return DB::transaction(function () use ($request, $id, $blob, $base) {
            $item = Item::query()->lockForUpdate()->find($id);

            if ($item && $item->revision !== $base) {
                return response()->json(['code' => 'conflict', 'item' => $item->toSync()], 409);
            }
            if (! $item && $blob === null) {
                // Borrar algo que el servidor nunca vio: nada que hacer.
                return response()->json(['revision' => Vault::current()->revision, 'deleted' => true]);
            }

            $item ??= new Item(['id' => $id]);
            $item->fill([
                'blob' => $blob,
                'revision' => Vault::nextRevision(),
                'updated_by' => $request->user()->id,
                'updated_at' => now(),
                'deleted_at' => $blob === null ? now() : null,
            ])->save();

            return response()->json([
                'revision' => $item->revision,
                'updated_at' => $item->updated_at->toIso8601String(),
                'deleted' => $blob === null,
            ]);
        });
    }
}
