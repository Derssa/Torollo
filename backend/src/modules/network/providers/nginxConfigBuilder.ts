/** A load-balancer routing rule with its target IPs already resolved. */
export interface LoadBalancerRoutingRule {
  path: string;
  targetIps: string[];
}

export interface LoadBalancerNginxConfigOptions {
  /** Legacy single-upstream target IPs, used when no routing rules are configured. */
  targetIps: string[];
  targetPort: number | string;
  rules: LoadBalancerRoutingRule[];
}

const PROXY_HEADERS =
  '      proxy_set_header Host $host;\n' +
  '      proxy_set_header X-Real-IP $remote_addr;\n' +
  '      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n' +
  '      proxy_set_header X-Forwarded-Proto $scheme;\n';

function buildUpstreamBlock(name: string, ips: string[], targetPort: number | string): string {
  const serversStr = ips.length > 0
    ? ips.map(ip => `    server ${ip}:${targetPort};`).join('\n')
    : '    server 127.0.0.1:81 down;';
  return `  upstream ${name} {\n${serversStr}\n  }\n`;
}

/**
 * Builds the nginx.conf content for a Load Balancer node: one upstream per
 * routing rule (path-based routing) when rules are configured, or a single
 * legacy "myapp" upstream splitting traffic across all targets otherwise.
 * An upstream with no resolved targets falls back to a "down" stub server so
 * nginx still starts instead of failing to bind an empty upstream block.
 */
export function buildLoadBalancerNginxConfig({ targetIps, targetPort, rules }: LoadBalancerNginxConfigOptions): string {
  let upstreamsConfig = '';
  let locationsConfig = '';

  if (rules.length > 0) {
    rules.forEach((rule, idx) => {
      const upstreamName = `upstream_rule_${idx}`;
      upstreamsConfig += buildUpstreamBlock(upstreamName, rule.targetIps, targetPort);
      locationsConfig += `    location ${rule.path} {\n` +
                         `      proxy_pass http://${upstreamName}/;\n` +
                         PROXY_HEADERS +
                         `    }\n`;
    });

    // Default fallback / location routing
    locationsConfig += '    location / {\n' +
                       '      return 404 "Akal Lab Load Balancer: No route matched this path.";\n' +
                       '    }\n';
  } else {
    // Fallback to legacy single-target upstream
    upstreamsConfig = buildUpstreamBlock('myapp', targetIps, targetPort);
    locationsConfig = '    location / {\n' +
                      '      proxy_pass http://myapp;\n' +
                      PROXY_HEADERS +
                      '    }\n';
  }

  return `worker_shutdown_timeout 1s;
events { worker_connections 1024; }
http {
${upstreamsConfig}
  server {
    listen 80;
${locationsConfig}
  }
}`;
}
