<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class Vault extends Model
{
    protected $table = 'vault';

    public $incrementing = false;

    protected $hidden = ['auth_hash'];

    protected $fillable = ['auth_hash', 'kdf_salt', 'kdf_params', 'wrapped_vault_key', 'password_changed_at'];

    protected function casts(): array
    {
        return [
            'kdf_params' => 'array',
            'revision' => 'integer',
            'purge_horizon' => 'integer',
            'password_changed_at' => 'datetime',
        ];
    }

    public static function current(): ?self
    {
        return static::query()->find(1);
    }

    /**
     * Reserva la siguiente revisión del vault. Debe llamarse dentro de una
     * transacción: el UPDATE ... RETURNING bloquea la fila y serializa a los
     * escritores concurrentes.
     */
    public static function nextRevision(): int
    {
        return (int) DB::selectOne('UPDATE vault SET revision = revision + 1, updated_at = now() WHERE id = 1 RETURNING revision')->revision;
    }
}
