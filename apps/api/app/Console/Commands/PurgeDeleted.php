<?php

namespace App\Console\Commands;

use App\Models\Attachment;
use App\Models\Item;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class PurgeDeleted extends Command
{
    protected $signature = 'keyme:purge';

    protected $description = 'Borra definitivamente los elementos eliminados hace más de 30 días';

    public function handle(): int
    {
        $cutoff = now()->subDays(config('keyme.purge_after_days'));

        $count = DB::transaction(function () use ($cutoff) {
            $items = Item::query()->whereNotNull('deleted_at')->where('deleted_at', '<', $cutoff)->lockForUpdate()->get(['id', 'revision']);
            if ($items->isEmpty()) {
                return 0;
            }
            foreach (Attachment::query()->whereIn('item_id', $items->pluck('id'))->get() as $attachment) {
                Storage::disk('vault')->delete($attachment->path());
                $attachment->delete();
            }
            Item::query()->whereIn('id', $items->pluck('id'))->delete();
            DB::update('UPDATE vault SET purge_horizon = GREATEST(purge_horizon, ?) WHERE id = 1', [$items->max('revision')]);

            return $items->count();
        });

        // Adjuntos huérfanos (subidos y luego descartados antes de guardar el elemento).
        $orphans = Attachment::query()->where('created_at', '<', now()->subDay())
            ->whereNotIn('item_id', Item::query()->select('id'))->get();
        foreach ($orphans as $attachment) {
            Storage::disk('vault')->delete($attachment->path());
            $attachment->delete();
        }

        $this->info("Purgados: {$count} elementos, {$orphans->count()} adjuntos huérfanos.");

        return self::SUCCESS;
    }
}
