<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Esquema del vault. El servidor solo guarda blobs cifrados en el cliente y
 * los metadatos mínimos para autenticar y sincronizar: nunca ve nombres,
 * URLs, usuarios ni contraseñas.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Fila única: Keyme es de un solo dueño.
        Schema::create('vault', function (Blueprint $table) {
            $table->smallInteger('id')->primary()->default(1);
            $table->text('auth_hash');
            $table->string('kdf_salt', 64);
            $table->jsonb('kdf_params');
            $table->text('wrapped_vault_key');
            $table->unsignedBigInteger('revision')->default(0);
            // Revisión más alta purgada: un cliente con un cursor anterior
            // pudo perderse tombstones y debe hacer una sincronización completa.
            $table->unsignedBigInteger('purge_horizon')->default(0);
            $table->timestamp('password_changed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('devices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 120);
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->string('last_ip', 64)->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });

        Schema::create('items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->text('blob')->nullable();
            $table->unsignedBigInteger('revision')->index();
            $table->uuid('updated_by')->nullable();
            $table->timestamp('updated_at');
            $table->timestamp('deleted_at')->nullable()->index();
        });

        Schema::create('attachments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('item_id')->index();
            $table->unsignedBigInteger('size');
            $table->timestamps();
        });

        Schema::create('audit_log', function (Blueprint $table) {
            $table->id();
            $table->uuid('device_id')->nullable()->index();
            $table->string('event', 48);
            $table->jsonb('meta')->nullable();
            $table->string('ip', 64)->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('audit_log');
        Schema::dropIfExists('attachments');
        Schema::dropIfExists('items');
        Schema::dropIfExists('devices');
        Schema::dropIfExists('vault');
    }
};
