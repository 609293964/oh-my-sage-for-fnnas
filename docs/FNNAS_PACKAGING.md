# fnOS Native Packaging

This project is packaged as a fnOS Native application that runs the Next.js standalone server with the system Node.js runtime.

## Build Flow

```bash
npm run build
npm run prepare:fpk
fnpack build -d fnnas.oh-my-sage
```

Or, when `fnpack` is installed:

```bash
npm run build:fpk
```

## Runtime Notes

- The package declares `install_dep_apps=nodejs_v22`.
- `cmd/main` starts `${TRIM_APPDEST}/server/server.js` on `${TRIM_SERVICE_PORT}`.
- Sessions are stored in `${TRIM_PKGVAR}/sessionstore` via `SESSION_STORE_DIR`.
- Runtime LLM, service port, and gateway settings are read from `${TRIM_PKGETC}/oh-my-sage.env`.
- `wizard/install` and `wizard/config` expose `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TEMPERATURE`, `APP_PORT`, `GATEWAY_TYPE`, and `GATEWAY_HOST`.
- Users select the Xiaomi hub version and enter only the gateway IP address; lifecycle scripts write `GATEWAY_URL=http://${GATEWAY_HOST}` for physical hubs and `GATEWAY_URL=http://${GATEWAY_HOST}:8086` for router hubs.
- `cmd/install_callback` and `cmd/config_callback` write those settings to `${TRIM_PKGETC}/oh-my-sage.env`; saving app settings restarts the service when it is already running.
