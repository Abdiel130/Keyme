# Seguridad

Keyme es un proyecto personal y autohospedado. El diseño completo está en [docs/security.md](docs/security.md).

- Nunca subas `.env`, respaldos (`backups/`), volcados de base de datos ni archivos `.keyme`: `.gitignore` ya los excluye.
- No expongas el puerto de Keyme a internet. Usa Tailscale Serve, nunca Funnel.
- Si encuentras una vulnerabilidad, documéntala en un issue privado o por correo, sin publicar detalles explotables.
