# Per-repo fleet start config for mcp-federation-hub
# Edit ports/backend target here - start.ps1 is fleet-standard.
@{
    Name         = 'mcp-federation-hub'
    BackendPort  = 10857
    FrontendPort = 10856
    HealthPath   = '/health'
    WebRoot      = 'webapp'
    Backend = @{
        Kind          = 'nssm'
        UvicornTarget = 'app.main:app'
        WorkDir       = 'bridge'
        PythonPath    = 'bridge;src'
        Env           = @{ WEB_PORT = '10857' }
    }
    Frontend = @{
        Kind           = 'vite-npm'
        PackageManager = 'npm'
        PortEnvVar     = 'VITE_PORT'
        ApiTargetEnv   = 'VITE_API_TARGET'
    }
}
