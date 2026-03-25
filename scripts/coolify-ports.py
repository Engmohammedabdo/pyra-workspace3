import json, sys, re

data = json.load(sys.stdin)
svc_name = data.get('name', '?')
compose = data.get('docker_compose_raw', '')

print(f'=== {svc_name} ===')

# Public ports from DB
if 'databases' in data:
    for db in data['databases']:
        if db.get('public_port'):
            print(f'  PUBLIC DB [{db["name"]}]: host:{db["public_port"]} -> container:5432')

# HTTPS domains from apps
if 'applications' in data:
    for app in data['applications']:
        fqdn = app.get('fqdn', '')
        if fqdn:
            print(f'  HTTPS [{app["name"]}]: {fqdn}')

# Parse compose for ports
if compose:
    # SERVICE_URL_xxx_PORT pattern
    svc_urls = re.findall(r'SERVICE_URL_\w+_(\d+)', compose)
    if svc_urls:
        for p in set(svc_urls):
            print(f'  Service exposed port: {p}')

    # Port mappings like '8000:8000' or "443:8000"
    port_maps = re.findall(r'["\'](\d+):(\d+)["\']', compose)
    if port_maps:
        for host_p, cont_p in set(port_maps):
            print(f'  Port Map: host:{host_p} -> container:{cont_p}')

    # PORT= or PORT: references in env
    port_envs = re.findall(r'(?:^|\s|-)(?:PORT|PGPORT|POSTGRES_PORT|KONG_PORT|DB_POSTGRESDB_PORT)[=: ]+(\d+)', compose)
    if port_envs:
        for p in set(port_envs):
            print(f'  Internal PORT env: {p}')

    # Ports in default values like ${POSTGRES_PORT:-5432}
    defaults = re.findall(r'\$\{[^}]*:-(\d+)\}', compose)
    if defaults:
        for p in set(defaults):
            if p not in ('0',):
                print(f'  Default port: {p}')

print()
