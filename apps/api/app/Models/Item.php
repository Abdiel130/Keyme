<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Item extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'blob', 'revision', 'updated_by', 'updated_at', 'deleted_at'];

    protected function casts(): array
    {
        return [
            'revision' => 'integer',
            'updated_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }

    public function toSync(): array
    {
        return [
            'id' => $this->id,
            'blob' => $this->deleted_at ? null : $this->blob,
            'revision' => $this->revision,
            'updated_at' => $this->updated_at?->toIso8601String(),
            'deleted' => $this->deleted_at !== null,
        ];
    }
}
