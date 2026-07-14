import { buildLoadBalancerNginxConfig } from './nginxConfigBuilder';

describe('buildLoadBalancerNginxConfig', () => {
  it('builds a single legacy "myapp" upstream when there are no routing rules', () => {
    const config = buildLoadBalancerNginxConfig({ targetIps: ['10.0.1.2', '10.0.1.3'], targetPort: 80, rules: [] });

    expect(config).toContain('  upstream myapp {\n    server 10.0.1.2:80;\n    server 10.0.1.3:80;\n  }\n');
    expect(config).toContain('    location / {\n      proxy_pass http://myapp;\n');
    expect(config).not.toContain('upstream_rule_');
  });

  it('falls back to a "down" stub server when no legacy targets resolved', () => {
    const config = buildLoadBalancerNginxConfig({ targetIps: [], targetPort: 80, rules: [] });
    expect(config).toContain('  upstream myapp {\n    server 127.0.0.1:81 down;\n  }\n');
  });

  it('builds one upstream + location per routing rule, plus a 404 fallback', () => {
    const config = buildLoadBalancerNginxConfig({
      targetIps: [],
      targetPort: 8080,
      rules: [
        { path: '/api', targetIps: ['10.0.1.5'] },
        { path: '/web', targetIps: [] }
      ]
    });

    expect(config).toContain('  upstream upstream_rule_0 {\n    server 10.0.1.5:8080;\n  }\n');
    expect(config).toContain('  upstream upstream_rule_1 {\n    server 127.0.0.1:81 down;\n  }\n');
    expect(config).toContain('    location /api {\n      proxy_pass http://upstream_rule_0/;\n');
    expect(config).toContain('    location /web {\n      proxy_pass http://upstream_rule_1/;\n');
    expect(config).toContain('    location / {\n      return 404 "Akal Lab Load Balancer: No route matched this path.";\n    }\n');
    expect(config).not.toContain('upstream myapp');
  });

  it('includes the shared proxy headers on every location block', () => {
    const config = buildLoadBalancerNginxConfig({ targetIps: ['10.0.1.2'], targetPort: 80, rules: [] });
    expect(config).toContain('proxy_set_header Host $host;');
    expect(config).toContain('proxy_set_header X-Real-IP $remote_addr;');
    expect(config).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    expect(config).toContain('proxy_set_header X-Forwarded-Proto $scheme;');
  });

  it('wraps everything in the expected worker/events/http/server scaffold', () => {
    const config = buildLoadBalancerNginxConfig({ targetIps: ['10.0.1.2'], targetPort: 80, rules: [] });
    expect(config.startsWith('worker_shutdown_timeout 1s;\nevents { worker_connections 1024; }\nhttp {\n')).toBe(true);
    expect(config).toContain('  server {\n    listen 80;\n');
    expect(config.trimEnd().endsWith('}')).toBe(true);
  });
});
