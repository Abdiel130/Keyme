<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class AuditLog extends Model
{
    protected $table = 'audit_log';

    public $timestamps = false;

    protected $fillable = ['device_id', 'event', 'meta', 'ip', 'created_at'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'created_at' => 'datetime'];
    }

    public static function record(Request $request, string $event, ?string $deviceId = null, array $meta = []): void
    {
        static::query()->create([
            'device_id' => $deviceId ?? $request->user()?->id,
            'event' => $event,
            'meta' => $meta ?: null,
            'ip' => $request->ip(),
            'created_at' => now(),
        ]);
    }
}
