<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Device;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $current = $request->user()->id;

        return response()->json([
            'devices' => Device::query()->orderByDesc('last_seen_at')->get()->map(fn (Device $d) => [
                'id' => $d->id,
                'name' => $d->name,
                'user_agent' => $d->user_agent,
                'last_seen_at' => $d->last_seen_at?->toIso8601String(),
                'last_ip' => $d->last_ip,
                'created_at' => $d->created_at?->toIso8601String(),
                'revoked_at' => $d->revoked_at?->toIso8601String(),
                'current' => $d->id === $current,
            ]),
        ]);
    }

    public function update(Request $request, Device $device): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:120']]);
        $device->update($data);

        return response()->json(['ok' => true]);
    }

    public function revoke(Request $request, Device $device): JsonResponse
    {
        $device->tokens()->delete();
        $device->forceFill(['revoked_at' => now()])->save();
        AuditLog::record($request, 'device_revoked', null, ['target' => $device->id, 'name' => $device->name]);

        return response()->json(['ok' => true]);
    }

    public function audit(Request $request): JsonResponse
    {
        $names = Device::query()->pluck('name', 'id');

        return response()->json([
            'events' => AuditLog::query()->orderByDesc('id')->limit(min(500, (int) $request->query('limit', 200)))->get()
                ->map(fn (AuditLog $e) => [
                    'id' => $e->id,
                    'event' => $e->event,
                    'device' => $e->device_id ? ($names[$e->device_id] ?? null) : null,
                    'meta' => $e->meta,
                    'ip' => $e->ip,
                    'at' => $e->created_at->toIso8601String(),
                ]),
        ]);
    }
}
