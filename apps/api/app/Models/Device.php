<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Keyme tiene un solo dueño, así que la identidad autenticada es el
 * dispositivo: cada token de Sanctum pertenece a uno y revocarlo corta el
 * acceso de ese dispositivo sin tocar los demás.
 */
class Device extends Authenticatable
{
    use HasApiTokens, HasUuids;

    protected $fillable = ['name', 'user_agent', 'last_seen_at', 'last_ip', 'revoked_at'];

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }
}
