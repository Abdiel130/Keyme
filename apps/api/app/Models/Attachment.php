<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Attachment extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'item_id', 'size'];

    protected function casts(): array
    {
        return ['size' => 'integer'];
    }

    public function path(): string
    {
        return 'attachments/'.substr($this->id, 0, 2).'/'.$this->id.'.bin';
    }
}
